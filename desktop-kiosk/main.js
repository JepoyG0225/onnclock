/**
 * OnClock Face Kiosk — main process.
 *
 * A shared attendance terminal. An admin signs in once on the device; after
 * that any employee can walk up and clock in or out by face. It is deliberately
 * a single-purpose window: fullscreen, no menu bar, and it reopens on the
 * scanner rather than remembering where you were.
 *
 * All network calls go through the main process so the renderer never holds the
 * admin token. The renderer asks "identify this face" and "punch this
 * employee"; it cannot read the credential that authorises those.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const Store = require('electron-store')

/**
 * The renderer is served over a custom `kiosk://` scheme rather than file://.
 *
 * Two things break on file:// and both are fatal here:
 *   - it is not a secure context, so navigator.mediaDevices.getUserMedia is
 *     unavailable and the camera never opens;
 *   - fetch() from a file:// origin is blocked, and face-api.js loads its model
 *     weights with fetch, so the models would never load either.
 *
 * Registering the scheme as standard + secure + fetch-capable makes both work
 * while keeping everything local to the installed app.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kiosk',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

const DEFAULT_SERVER_URL = 'https://onclockph.com'

const store = new Store({
  name: 'onclock-kiosk',
  defaults: {
    serverUrl: DEFAULT_SERVER_URL,
    token: null,
    adminEmail: '',
    companyName: '',
    kioskName: '',
  },
})

let mainWindow = null

function serverUrl() {
  const raw = store.get('serverUrl', DEFAULT_SERVER_URL)
  // A URL ending in /portal is the most common misconfiguration — the desktop
  // API lives at the root domain, so trim it rather than fail obscurely.
  return String(raw).replace(/\/+$/, '').replace(/\/portal$/, '')
}

async function api(method, endpoint, body, { auth = true } = {}) {
  const token = store.get('token', null)
  if (auth && !token) return { ok: false, status: 401, data: { error: 'Not signed in' } }

  const res = await fetch(`${serverUrl()}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(err => ({ __networkError: err }))

  if (res && res.__networkError) {
    return { ok: false, status: 0, data: { error: 'Cannot reach the server. Check the internet connection.' } }
  }

  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    // Kiosk terminals sit unattended, so the frame and menu are removed to make
    // it awkward to wander off into other apps. Escape still exits fullscreen
    // for an admin who needs to close it.
    autoHideMenuBar: true,
    backgroundColor: '#021e47',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadURL('kiosk://app/renderer/index.html')
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // External links open in the real browser, never inside the kiosk shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('kiosk:getState', () => ({
  signedIn: !!store.get('token', null),
  serverUrl: serverUrl(),
  adminEmail: store.get('adminEmail', ''),
  companyName: store.get('companyName', ''),
  kioskName: store.get('kioskName', ''),
}))

ipcMain.handle('kiosk:setServerUrl', (_e, url) => {
  if (typeof url === 'string' && url.trim()) {
    store.set('serverUrl', url.trim())
  }
  return serverUrl()
})

ipcMain.handle('kiosk:signIn', async (_e, { email, password, kioskName }) => {
  const res = await api('POST', '/api/desktop-app/auth', { email, password }, { auth: false })
  if (!res.ok) {
    return { ok: false, error: res.data?.error || 'Sign in failed' }
  }
  const token = res.data?.token
  const user = res.data?.user
  if (!token || !user) return { ok: false, error: 'Server did not return a token' }

  // /api/desktop-app/auth accepts any role and picks the highest-priority
  // membership. A kiosk needs one that can record attendance for others, so
  // reject a plain employee here with a clear reason rather than letting them
  // set the device up and hit a 403 on the first face scanned.
  const KIOSK_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']
  if (!KIOSK_ROLES.includes(user.role)) {
    return {
      ok: false,
      error: 'This account cannot run a kiosk. Sign in with a company admin or HR account.',
    }
  }

  store.set('token', token)
  store.set('adminEmail', email)
  store.set('companyName', user.companyName || '')
  if (kioskName) store.set('kioskName', kioskName)

  return { ok: true, companyName: user.companyName || '', adminEmail: email }
})

ipcMain.handle('kiosk:signOut', () => {
  store.set('token', null)
  store.set('adminEmail', '')
  store.set('companyName', '')
  return { ok: true }
})

/** 1:N identification. Descriptors in, employee + due action out. */
ipcMain.handle('kiosk:identify', async (_e, { embeddings, model }) => {
  const res = await api('POST', '/api/kiosk/identify', { embeddings, model })
  return { ok: res.ok, status: res.status, ...res.data }
})

/**
 * Punch the identified employee.
 *
 * Calls the SAME clock-in / clock-out routes the portal uses, naming the
 * employee explicitly. That keeps schedule validation, rest-day rules and
 * late/undertime computation identical between the kiosk and the portal.
 */
ipcMain.handle('kiosk:punch', async (_e, { employeeId, action }) => {
  const endpoint = action === 'OUT'
    ? '/api/attendance/clock-out'
    : '/api/attendance/clock-in'
  const res = await api('POST', endpoint, { employeeId })
  return { ok: res.ok, status: res.status, ...res.data }
})

ipcMain.handle('kiosk:exit', () => {
  app.quit()
})

// ── Lifecycle ───────────────────────────────────────────────────────────────

// A kiosk should not run twice on one machine — two windows would both hold the
// camera and neither would work.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // The renderer needs the webcam. Electron asks the OS, but the in-app
    // permission prompt must also be answered or getUserMedia hangs.
    const { session } = require('electron')
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media')
    })

    // Serve app files over kiosk://. Paths are resolved inside __dirname and
    // anything escaping it is refused, so a crafted URL cannot read the disk.
    // Files are read with fs, NOT net.fetch(file://). Once packaged, the app
    // lives inside app.asar — Electron patches Node's fs to see through the
    // archive, but Chromium's file loader does not, so a file:// fetch would
    // 404 in the installed build while working perfectly in development.
    const MIME = {
      '.html': 'text/html',
      '.js':   'text/javascript',
      '.json': 'application/json',
      '.css':  'text/css',
      '.ico':  'image/x-icon',
      '.png':  'image/png',
    }
    protocol.handle('kiosk', async request => {
      const { pathname } = new URL(request.url)
      const target = path.join(__dirname, decodeURIComponent(pathname))
      // Refuse anything that escapes the app directory.
      if (!target.startsWith(path.join(__dirname, path.sep))) {
        return new Response('Forbidden', { status: 403 })
      }
      try {
        const data = await fs.promises.readFile(target)
        // The model shards have no extension and are binary.
        const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream'
        return new Response(data, { headers: { 'content-type': type } })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  process.on('uncaughtException', err => {
    dialog.showErrorBox('OnClock Kiosk', String(err?.stack || err))
  })
}
