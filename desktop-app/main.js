'use strict'

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  Notification,
  desktopCapturer,
  net,
  shell,
  session,
} = require('electron')
const fs = require('fs')
const path = require('path')
const Store = require('electron-store')
const DEFAULT_SERVER_URL = 'https://onclockph.com'
// ----
const store = new Store({
  clearInvalidConfig: true,
  defaults: {
    serverUrl: DEFAULT_SERVER_URL,
    token: null,
    userEmail: '',
    companyName: '',
    userId: '',
    screenCaptureEnabled: false,
    frequencyMinutes: 5,
  },
})
// ----
const subWins = {}       // sub-windows: leaves, messages, profile, payslips
let isQuitting = false   // set true when the OS / installer / tray-quit triggers app exit
let mainWindow = null
let tray = null
let captureInterval = null
let currentDtrRecordId = null
let isClockedIn = false
let captureCount = 0
let clockInTime = null          // ISO string - when the employee clocked in this session
let latestCaptureDataUrl = null // most recent screenshot (in-memory, not persisted)
let isOnBreak = false           // true while employee is on break
let breakStartTime = null       // ISO string - when break started
let breakCompleted = false      // true after break was ended within current shift
let allowedBreakMinutes = 60    // schedule-configured allowed break duration
let overBreakWarned = false
let lastKnownLocation = null    // { lat, lng, accuracy, address } - updated by renderer
let locationPingInterval = null // periodic /api/locations/ping timer
let clockStateSyncInterval = null
let clockStateSyncInFlight = false
let breakWarningInterval = null
let updateCheckInterval = null
let updateInfo = {
  checkedAt: null,
  updateAvailable: false,
  latestVersion: null,
  downloadUrl: null,
  notes: null,
}

const CLOCK_STATE_SYNC_INTERVAL_MS = 30 * 1000
const BREAK_WARNING_INTERVAL_MS = 15 * 1000
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
// ----

function normalizeServerUrl(rawUrl) {
  let cleaned = String(rawUrl || '').trim().replace(/\/+$/, '')
  if (!cleaned) return DEFAULT_SERVER_URL

  // API base must be host root, not /portal. Middleware redirects /portal/api/*.
  cleaned = cleaned.replace(/\/portal$/i, '')

  const lower = cleaned.toLowerCase()
  const legacyHosts = new Set([
    'https://onclockph.com',
    'https://www.onclockph.com',
    'https://portal.onclockph.com',
    'http://onclockph.com',
    'http://www.onclockph.com',
    'http://portal.onclockph.com',
  ])

  if (legacyHosts.has(lower)) {
    return DEFAULT_SERVER_URL
  }
  return cleaned
}

function getServerUrl() {
  const saved = store.get('serverUrl', DEFAULT_SERVER_URL)
  const normalized = normalizeServerUrl(saved)
  if (normalized !== saved) {
    store.set('serverUrl', normalized)
  }
  return normalized
}

function getPortalUrl() {
  return `${getServerUrl()}/portal`
}

function getToken() {
  return store.get('token', null)
}

function getHeaderValue(headers, key) {
  const value = headers?.[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function summarizeNonJsonResponse(text) {
  if (!text) return 'Server returned an empty response.'
  const isHtml = /^\s*</.test(text)
  if (!isHtml) return text.trim().slice(0, 200)

  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return stripped.slice(0, 200) || 'Server returned an HTML response.'
}

function log(msg) {
  const ts = new Date().toLocaleTimeString()
  console.log(`[${ts}] ${msg}`)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', `[${ts}] ${msg}`)
  }
}

/** Perform an authenticated JSON request to the server */
async function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = `${getServerUrl()}${path}`
    const token = getToken()
    const bodyStr = body ? JSON.stringify(body) : null

    const request = net.request({
      method,
      url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'User-Agent': `OnClock-Desktop/${app.getVersion()} (Windows)`,
      },
    })

    let chunks = []
    request.on('response', (res) => {
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        const status = res.statusCode
        const contentType = String(getHeaderValue(res.headers, 'content-type')).toLowerCase()
        const location = String(getHeaderValue(res.headers, 'location'))
        const looksLikeJson = contentType.includes('application/json') || contentType.includes('+json')

        if (!text.trim()) {
          resolve({ ok: status >= 200 && status < 300, status, data: {} })
          return
        }

        if (looksLikeJson || /^[\s\n\r]*[\[{]/.test(text)) {
          try {
            const json = JSON.parse(text)
            resolve({ ok: status >= 200 && status < 300, status, data: json })
            return
          } catch {
            resolve({
              ok: false,
              status,
              data: { error: `Malformed JSON response (HTTP ${status})` },
            })
            return
          }
        }

        const summary = summarizeNonJsonResponse(text)
        const redirectHint = status >= 300 && status < 400 && location ? ` Redirect target: ${location}` : ''
        const misconfiguredPortalPath =
          status >= 300 &&
          status < 400 &&
          String(location).includes('/portal/login') &&
          String(url).includes('/portal/api/')
        resolve({
          ok: false,
          status,
          data: {
            error: misconfiguredPortalPath
              ? 'Desktop API base URL is misconfigured to /portal. Use root domain (e.g., https://onclockph.com).'
              : `Expected JSON but got ${contentType || 'text'} (HTTP ${status}). ${summary}${redirectHint}`.trim(),
          },
        })
      })
    })
    request.on('error', (err) => {
      resolve({
        ok: false,
        status: 0,
        data: {
          error: `Network request failed for ${method} ${path}: ${err?.message ?? 'Unknown error'}`,
        },
      })
    })

    if (bodyStr) request.write(bodyStr)
    request.end()
  })
}

function shouldStartHidden() {
  return process.argv.includes('--hidden') || process.argv.includes('/hidden')
}

function ensureAutoLaunchEnabled() {
  if (process.platform !== 'win32' || !app.isPackaged) return
  try {
    const settings = app.getLoginItemSettings()
    const args = Array.isArray(settings.args) ? settings.args : []
    const hasHiddenArg = args.includes('--hidden')
    if (!settings.openAtLogin || !hasHiddenArg) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        args: ['--hidden'],
      })
      log('Windows auto-start enabled (hidden)')
    }
  } catch (err) {
    log(`Failed to configure Windows auto-start: ${err.message}`)
  }
}

function resolveScreenCaptureEnabled(screenCaptureConfig) {
  const enabled = Boolean(screenCaptureConfig?.enabled)
  const entitled = screenCaptureConfig?.entitled
  if (typeof entitled === 'boolean') {
    return entitled && enabled
  }
  return enabled
}

function normalizeBreakMinutes(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 60
  return Math.max(0, Math.min(720, Math.round(n)))
}

function parseVersion(version) {
  const m = String(version ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function compareSemver(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

async function checkForAppUpdates(source = 'manual') {
  try {
    const res = await apiRequest('GET', '/api/desktop-app/version', null)
    const currentVersion = app.getVersion()
    const latestVersion = String(res.data?.latestVersion ?? '').trim()
    const hasUpdate = Boolean(res.ok && latestVersion && compareSemver(latestVersion, currentVersion) > 0)
    const downloadUrl = res.data?.downloadUrl ? `${getServerUrl()}${res.data.downloadUrl}` : null

    const previousAvailable = updateInfo.updateAvailable
    updateInfo = {
      checkedAt: new Date().toISOString(),
      updateAvailable: hasUpdate,
      latestVersion: latestVersion || null,
      downloadUrl,
      notes: res.data?.notes ?? null,
    }

    if (hasUpdate && !previousAvailable) {
      new Notification({
        title: 'OnClock Update Available',
        body: `Version ${latestVersion} is available. Click update in the app.`,
      }).show()
      log(`Update available: ${currentVersion} -> ${latestVersion}`)
    }

    rebuildTrayMenu()
    broadcastStatus()
    return { ok: true, updateAvailable: hasUpdate, latestVersion: latestVersion || null }
  } catch (err) {
    if (source !== 'poll') {
      log(`Update check failed (${source}): ${err?.message ?? err}`)
    }
    return { ok: false, error: err?.message ?? String(err) }
  }
}

function startUpdateCheckLoop() {
  if (updateCheckInterval) return
  void checkForAppUpdates('loop-start')
  updateCheckInterval = setInterval(() => {
    void checkForAppUpdates('poll')
  }, UPDATE_CHECK_INTERVAL_MS)
}

function stopUpdateCheckLoop() {
  if (!updateCheckInterval) return
  clearInterval(updateCheckInterval)
  updateCheckInterval = null
}

function stopBreakWarningLoop() {
  if (!breakWarningInterval) return
  clearInterval(breakWarningInterval)
  breakWarningInterval = null
}

function checkOverBreakWarning() {
  if (!isClockedIn || !isOnBreak || !breakStartTime) return
  if (allowedBreakMinutes <= 0 || overBreakWarned) return

  const breakStartMs = new Date(breakStartTime).getTime()
  if (!Number.isFinite(breakStartMs)) return

  const elapsedMinutes = Math.floor((Date.now() - breakStartMs) / 60000)
  if (elapsedMinutes <= allowedBreakMinutes) return

  const overMinutes = elapsedMinutes - allowedBreakMinutes
  overBreakWarned = true
  const message = `Over break by ${overMinutes} minute${overMinutes === 1 ? '' : 's'}. This will be recorded as tardy.`
  log(message)
  new Notification({ title: 'OnClock Overbreak Warning', body: message }).show()
  broadcastStatus()
}

function startBreakWarningLoop() {
  stopBreakWarningLoop()
  if (!isClockedIn || !isOnBreak || allowedBreakMinutes <= 0) return
  checkOverBreakWarning()
  breakWarningInterval = setInterval(checkOverBreakWarning, BREAK_WARNING_INTERVAL_MS)
}
// ----

/** Capture the primary screen and upload to server - fully silent, no user interaction */
async function captureAndUpload() {
  try {
    if (!store.get('screenCaptureEnabled', false)) return

    // Fetch actual screen resolution so thumbnail matches real dimensions
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    })
    if (!sources.length) {
      log('No screen source found, skipping capture')
      return
    }

    // Use the primary display (first source)
    const thumbnail = sources[0].thumbnail

    // Convert to JPEG at 80% quality - PNG from desktopCapturer can exceed
    // the 2 MB server limit; JPEG keeps it well under even at full HD
    const jpegBuf = thumbnail.toJPEG(80)
    const dataUrl = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`

    // Sanity-check size before uploading (server rejects > 2 MB)
    if (jpegBuf.length > 1_900_000) {
      // Retry at lower quality if still too large (e.g. 4K screen)
      const smallBuf = thumbnail.resize({ width: 1920 }).toJPEG(70)
      const smallUrl = `data:image/jpeg;base64,${smallBuf.toString('base64')}`
      const res2 = await apiRequest('POST', '/api/attendance/screen-captures', {
        dtrRecordId: currentDtrRecordId ?? undefined,
        imageDataUrl: smallUrl,
      })
      if (res2.ok) {
        captureCount++
        latestCaptureDataUrl = smallUrl
        log(`Screenshot uploaded at reduced quality (${captureCount} this session)`)
        updateTrayTooltip()
        broadcastStatus()
      } else {
        log(`Screenshot upload failed: ${res2.data?.error ?? res2.status}`)
      }
      return
    }

    const res = await apiRequest('POST', '/api/attendance/screen-captures', {
      dtrRecordId: currentDtrRecordId ?? undefined,
      imageDataUrl: dataUrl,
    })

    if (res.ok) {
      captureCount++
      latestCaptureDataUrl = dataUrl
      log(`Screenshot uploaded (${captureCount} this session)`)
      updateTrayTooltip()
      broadcastStatus()
    } else {
      log(`Screenshot upload failed: ${res.data?.error ?? res.status}`)
    }
  } catch (err) {
    log(`Capture error: ${err.message}`)
  }
}

function startCaptureLoop() {
  if (captureInterval) return
  const freqMs = (store.get('frequencyMinutes', 5)) * 60 * 1000
  captureCount = 0
  // First capture immediately
  captureAndUpload()
  captureInterval = setInterval(captureAndUpload, freqMs)
  log(`Screen capture started - every ${store.get('frequencyMinutes', 5)} min`)
}

function stopCaptureLoop() {
  if (captureInterval) {
    clearInterval(captureInterval)
    captureInterval = null
    log('Screen capture stopped')
  }
}
// ----

function updateTrayTooltip() {
  if (!tray) return
  const email = store.get('userEmail', '')
  const company = store.get('companyName', '')
  const status = isClockedIn ? `Clocked in  - ${captureCount} capture(s)` : 'Not clocked in'
  tray.setToolTip(`OnClock Desktop\n${email}${company ? `  - ${company}` : ''}\n${status}`)
}

function rebuildTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: 'OnClock Desktop',
      enabled: false,
    },
    {
      label: store.get('userEmail', 'Not logged in'),
      enabled: false,
    },
    { type: 'separator' },
    ...(getToken()
      ? [
          {
            label: isClockedIn ? 'Clocked In' : 'Clock In',
            enabled: !isClockedIn,
            click: () => handleClockIn(),
          },
          {
            label: 'Clock Out',
            enabled: isClockedIn,
            click: () => handleClockOut(),
          },
          { type: 'separator' },
          {
            label: isOnBreak ? 'End Break' : 'Start Break',
            enabled: isClockedIn && (isOnBreak || allowedBreakMinutes > 0),
            click: () => isOnBreak ? handleEndBreak() : handleStartBreak(),
          },
          {
            label: 'Take Screenshot Now',
            enabled: isClockedIn && !isOnBreak && store.get('screenCaptureEnabled', false),
            click: () => captureAndUpload(),
          },
          { type: 'separator' },
          {
            label: 'Open Dashboard...',
            click: () => shell.openExternal(getServerUrl()),
          },
          ...(updateInfo.updateAvailable && updateInfo.downloadUrl
            ? [
                {
                  label: `Update Available (${updateInfo.latestVersion})`,
                  click: () => shell.openExternal(updateInfo.downloadUrl),
                },
              ]
            : []),
          { type: 'separator' },
          {
            label: 'Sign Out',
            click: () => handleLogout(),
          },
        ]
      : [
          {
            label: 'Log In...',
            click: () => showMainWindow(),
          },
        ]),
    { type: 'separator' },
    {
      label: 'Quit OnClock',
      role: 'quit',
    },
  ])
  tray.setContextMenu(menu)
  updateTrayTooltip()
}
// ----

async function handleClockIn(location) {
  log('Clocking in...')
  try {
    const body = {}
    if (location?.lat != null && location?.lng != null) {
      body.lat = location.lat
      body.lng = location.lng
      if (location.accuracy != null) body.accuracy = location.accuracy
      if (location.address) body.address = location.address
      log(`Location: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`)
    }
    const res = await apiRequest('POST', '/api/attendance/clock-in', body)
    if (res.ok) {
      currentDtrRecordId = res.data?.record?.id ?? null
      isClockedIn = true
      clockInTime = new Date().toISOString()
      breakCompleted = false
      overBreakWarned = false
      latestCaptureDataUrl = null
      log(`Clocked in successfully (DTR: ${currentDtrRecordId})`)
      new Notification({ title: 'OnClock', body: 'Clocked in successfully.' }).show()
      if (store.get('screenCaptureEnabled', false)) {
        startCaptureLoop()
      }
      startLocationPingLoop()
      await syncClockStateFromServer('clockin')
      rebuildTrayMenu()
      broadcastStatus()
      return { ok: true }
    } else {
      const msg = res.data?.error ?? 'Clock-in failed'
      log(`Clock-in failed: ${msg}`)
      new Notification({ title: 'OnClock', body: msg }).show()
      return { ok: false, error: msg }
    }
  } catch (err) {
    log(`Clock-in error: ${err.message}`)
    return { ok: false, error: err.message }
  }
}

async function handleClockOut(location) {
  log('Clocking out...')
  try {
    const body = {}
    if (location?.lat != null && location?.lng != null) {
      body.lat = location.lat
      body.lng = location.lng
      if (location.accuracy != null) body.accuracy = location.accuracy
      if (location.address) body.address = location.address
      log('Location: ' + location.lat.toFixed(5) + ', ' + location.lng.toFixed(5))
    }
    const res = await apiRequest('POST', '/api/attendance/clock-out', body)
    if (res.ok) {
      stopCaptureLoop()
      stopLocationPingLoop()
      isClockedIn = false
      currentDtrRecordId = null
      captureCount = 0
      clockInTime = null
      latestCaptureDataUrl = null
      isOnBreak = false
      breakStartTime = null
      breakCompleted = false
      allowedBreakMinutes = 60
      overBreakWarned = false
      stopBreakWarningLoop()
      const sync = await apiRequest('GET', '/api/attendance/today', null)
      const activeAfterClockOut = Boolean(sync.ok && sync.data?.record?.timeIn && !sync.data?.record?.timeOut)
      if (activeAfterClockOut) {
        const activeRecord = sync.data?.record
        applyClockStateFromServerRecord(activeRecord, 'clockout-verify', sync.data?.breakMinutes)
        if (store.get('screenCaptureEnabled', false) && !isOnBreak) startCaptureLoop()
        if (!isOnBreak) startLocationPingLoop()
        log('Clock-out rejected: active shift still detected on server after sync')
        new Notification({ title: 'OnClock', body: 'Clock-out not completed. Active shift still exists.' }).show()
        rebuildTrayMenu()
        broadcastStatus()
        return { ok: false, error: 'Clock-out not completed. Active shift still exists.' }
      }

      const autoClosedCount = Number(res.data?.staleOpenAutoClosed ?? 0)
      if (autoClosedCount > 0) {
        log(`Clocked out successfully (auto-closed ${autoClosedCount} duplicate active shift${autoClosedCount > 1 ? 's' : ''})`)
        new Notification({ title: 'OnClock', body: `Clocked out. Fixed ${autoClosedCount} duplicate active shift${autoClosedCount > 1 ? 's' : ''}.` }).show()
      } else {
        log('Clocked out successfully')
        new Notification({ title: 'OnClock', body: 'Clocked out successfully.' }).show()
      }
      rebuildTrayMenu()
      broadcastStatus()
      return { ok: true }
    } else {
      const msg = res.data?.error ?? 'Clock-out failed'
      log('Clock-out failed: ' + msg)
      await reconcileClockStateAfterFailedClockOut()
      new Notification({ title: 'OnClock', body: msg }).show()
      rebuildTrayMenu()
      return { ok: false, error: msg }
    }
  } catch (err) {
    log('Clock-out error: ' + err.message)
    await reconcileClockStateAfterFailedClockOut()
    return { ok: false, error: err.message }
  }
}

async function reconcileClockStateAfterFailedClockOut() {
  try {
    const todayRes = await apiRequest('GET', '/api/attendance/today', null)
    if (!todayRes.ok) return

    const record = todayRes.data?.record
    allowedBreakMinutes = normalizeBreakMinutes(todayRes.data?.breakMinutes ?? allowedBreakMinutes)
    const stillClockedIn = Boolean(record?.timeIn && !record?.timeOut)
    const serverOnBreak = Boolean(stillClockedIn && record?.breakIn && !record?.breakOut)

    isClockedIn = stillClockedIn
    currentDtrRecordId = stillClockedIn ? (record?.id ?? currentDtrRecordId ?? null) : null
    clockInTime = stillClockedIn ? (record?.timeIn ?? clockInTime ?? new Date().toISOString()) : null
    isOnBreak = serverOnBreak
    breakStartTime = serverOnBreak ? (record?.breakIn ?? breakStartTime ?? new Date().toISOString()) : null
    breakCompleted = Boolean(stillClockedIn && record?.breakIn && record?.breakOut)

    if (stillClockedIn) {
      if (!serverOnBreak) {
        if (store.get('screenCaptureEnabled', false)) startCaptureLoop()
        startLocationPingLoop()
        stopBreakWarningLoop()
      } else {
        stopCaptureLoop()
        stopLocationPingLoop()
        startBreakWarningLoop()
      }
      return
    }

    stopCaptureLoop()
    stopLocationPingLoop()
    captureCount = 0
    latestCaptureDataUrl = null
    isOnBreak = false
    breakStartTime = null
    breakCompleted = false
    allowedBreakMinutes = 60
    overBreakWarned = false
    stopBreakWarningLoop()
  } catch (err) {
    log('Clock state reconcile failed: ' + err.message)
  } finally {
    rebuildTrayMenu()
    broadcastStatus()
  }
}

function applyClockStateFromServerRecord(record, source = 'sync', breakMinutesFromServer = null) {
  const wasClockedIn = isClockedIn
  const wasOnBreak = isOnBreak
  const wasBreakCompleted = breakCompleted
  const wasRecordId = currentDtrRecordId
  const wasClockInTime = clockInTime
  const wasBreakStartTime = breakStartTime
  const wasAllowedBreakMinutes = allowedBreakMinutes
  const wasCaptureEnabled = store.get('screenCaptureEnabled', false)

  const serverClockedIn = Boolean(record?.timeIn && !record?.timeOut)
  const serverOnBreak = Boolean(serverClockedIn && record?.breakIn && !record?.breakOut)
  const serverBreakCompleted = Boolean(serverClockedIn && record?.breakIn && record?.breakOut)
  if (breakMinutesFromServer != null) {
    allowedBreakMinutes = normalizeBreakMinutes(breakMinutesFromServer)
  }

  if (serverClockedIn) {
    isClockedIn = true
    currentDtrRecordId = record?.id ?? currentDtrRecordId ?? null
    clockInTime = record?.timeIn ?? clockInTime ?? new Date().toISOString()
    isOnBreak = serverOnBreak
    breakStartTime = serverOnBreak ? (record?.breakIn ?? breakStartTime ?? null) : null
    breakCompleted = serverBreakCompleted
    if (serverOnBreak) {
      overBreakWarned = false
    }

    if (serverOnBreak) {
      stopCaptureLoop()
      stopLocationPingLoop()
      startBreakWarningLoop()
    } else {
      if (store.get('screenCaptureEnabled', false)) startCaptureLoop()
      else stopCaptureLoop()
      startLocationPingLoop()
      stopBreakWarningLoop()
    }
  } else {
    isClockedIn = false
    isOnBreak = false
    currentDtrRecordId = null
    clockInTime = null
    breakStartTime = null
    breakCompleted = false
    allowedBreakMinutes = breakMinutesFromServer != null ? normalizeBreakMinutes(breakMinutesFromServer) : 60
    overBreakWarned = false
    captureCount = 0
    latestCaptureDataUrl = null
    stopCaptureLoop()
    stopLocationPingLoop()
    stopBreakWarningLoop()
  }

  const changed =
    wasClockedIn !== isClockedIn ||
    wasOnBreak !== isOnBreak ||
    wasBreakCompleted !== breakCompleted ||
    wasRecordId !== currentDtrRecordId ||
    wasClockInTime !== clockInTime ||
    wasBreakStartTime !== breakStartTime ||
    wasAllowedBreakMinutes !== allowedBreakMinutes ||
    wasCaptureEnabled !== store.get('screenCaptureEnabled', false)

  if (changed) {
    if (!wasClockedIn && isClockedIn) {
      log(`Detected active shift from server (${source})`)
    } else if (wasClockedIn && !isClockedIn) {
      log(`Detected clock-out from server (${source})`)
    } else if (wasOnBreak !== isOnBreak) {
      log(`Detected break state change from server (${source})`)
    }
  }

  return changed
}

async function syncClockStateFromServer(source = 'poll') {
  if (!getToken()) return { ok: false, skipped: 'not-logged-in' }
  if (clockStateSyncInFlight) return { ok: false, skipped: 'in-flight' }

  clockStateSyncInFlight = true
  try {
    const [todayRes, secRes] = await Promise.all([
      apiRequest('GET', '/api/attendance/today', null),
      apiRequest('GET', '/api/attendance/security', null),
    ])

    // Keep screen-capture config fresh even when user updates settings in browser.
    let securityChanged = false
    if (secRes.ok && secRes.data?.feature != null) {
      const prevEnabled = Boolean(store.get('screenCaptureEnabled', false))
      const prevFrequency = Number(store.get('frequencyMinutes', 5))
      const nextEnabled = Boolean(secRes.data.feature.enabled)
      const nextFrequency = Number(secRes.data.feature.frequencyMinutes ?? 5)
      securityChanged = prevEnabled !== nextEnabled || prevFrequency !== nextFrequency
      store.set('screenCaptureEnabled', nextEnabled)
      store.set('frequencyMinutes', nextFrequency)

      if (securityChanged) {
        if (isClockedIn && !isOnBreak && nextEnabled) {
          stopCaptureLoop()
          startCaptureLoop()
        } else if (!nextEnabled) {
          stopCaptureLoop()
        }
      }
    }

    if (!todayRes.ok) {
      if (source !== 'poll') {
        log(`Clock state sync failed (${source}): ${todayRes.data?.error ?? todayRes.status}`)
      }
      return { ok: false, error: todayRes.data?.error ?? `HTTP ${todayRes.status}` }
    }

    const changed = applyClockStateFromServerRecord(
      todayRes.data?.record,
      source,
      todayRes.data?.breakMinutes
    ) || securityChanged
    if (changed) {
      rebuildTrayMenu()
      broadcastStatus()
    }
    return { ok: true, changed }
  } catch (err) {
    if (source !== 'poll') {
      log(`Clock state sync error (${source}): ${err?.message ?? err}`)
    }
    return { ok: false, error: err?.message ?? String(err) }
  } finally {
    clockStateSyncInFlight = false
  }
}

function startClockStateSyncLoop() {
  if (clockStateSyncInterval) return
  void syncClockStateFromServer('loop-start')
  clockStateSyncInterval = setInterval(() => {
    void syncClockStateFromServer('poll')
  }, CLOCK_STATE_SYNC_INTERVAL_MS)
}

function stopClockStateSyncLoop() {
  if (!clockStateSyncInterval) return
  clearInterval(clockStateSyncInterval)
  clockStateSyncInterval = null
}

function broadcastStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status:update', getStatusPayload())
  }
}

function getStatusPayload() {
  return {
    loggedIn: !!getToken(),
    isClockedIn,
    captureCount,
    clockInTime,
    isOnBreak,
    breakStartTime,
    breakCompleted,
    breakMinutes: allowedBreakMinutes,
    update: updateInfo,
    email: store.get('userEmail', ''),
    companyName: store.get('companyName', ''),
    screenCaptureEnabled: store.get('screenCaptureEnabled', false),
    frequencyMinutes: store.get('frequencyMinutes', 5),
  }
}
// ----

async function handleStartBreak() {
  if (!isClockedIn || isOnBreak) return { ok: false, error: 'Cannot start break in current state.' }

  const res = await apiRequest('POST', '/api/attendance/break-start', null)
  if (!res.ok) {
    const msg = res.data?.error ?? 'Failed to start break.'
    log(`Break start failed: ${msg}`)
    new Notification({ title: 'OnClock', body: msg }).show()
    await syncClockStateFromServer('break-start-failed')
    rebuildTrayMenu()
    broadcastStatus()
    return { ok: false, error: msg }
  }

  isOnBreak = true
  breakStartTime = res.data?.record?.breakIn ?? new Date().toISOString()
  breakCompleted = false
  overBreakWarned = false
  allowedBreakMinutes = normalizeBreakMinutes(res.data?.allowedBreakMinutes ?? allowedBreakMinutes)
  const monitoringEnabled = Boolean(store.get('screenCaptureEnabled', false))
  stopCaptureLoop()
  stopLocationPingLoop()
  startBreakWarningLoop()
  log(monitoringEnabled ? 'Break started - screen capture paused' : 'Break started')
  new Notification({
    title: 'OnClock',
    body: monitoringEnabled ? 'Break started. Screen monitoring paused.' : 'Break started.',
  }).show()
  rebuildTrayMenu()
  broadcastStatus()
  return { ok: true }
}

async function handleEndBreak() {
  if (!isClockedIn || !isOnBreak) return { ok: false, error: 'Not currently on break.' }

  const res = await apiRequest('POST', '/api/attendance/break-end', null)
  if (!res.ok) {
    const msg = res.data?.error ?? 'Failed to end break.'
    log(`Break end failed: ${msg}`)
    new Notification({ title: 'OnClock', body: msg }).show()
    await syncClockStateFromServer('break-end-failed')
    rebuildTrayMenu()
    broadcastStatus()
    return { ok: false, error: msg }
  }

  isOnBreak = false
  breakStartTime = null
  breakCompleted = true
  overBreakWarned = false
  allowedBreakMinutes = normalizeBreakMinutes(res.data?.allowedBreakMinutes ?? allowedBreakMinutes)
  const monitoringEnabled = Boolean(store.get('screenCaptureEnabled', false))
  stopBreakWarningLoop()
  log(monitoringEnabled ? 'Break ended - screen capture resumed' : 'Break ended')
  if (Number(res.data?.overBreakMinutes ?? 0) > 0) {
    new Notification({
      title: 'OnClock',
      body: `Break ended. Over break by ${res.data.overBreakMinutes} minute${res.data.overBreakMinutes === 1 ? '' : 's'} (recorded as tardy).`,
    }).show()
  } else {
    new Notification({
      title: 'OnClock',
      body: monitoringEnabled ? 'Break over. Screen monitoring resumed.' : 'Break over.',
    }).show()
  }
  if (store.get('screenCaptureEnabled', false)) {
    startCaptureLoop()
  }
  startLocationPingLoop()   // resume location pings after break
  rebuildTrayMenu()
  broadcastStatus()
  return { ok: true }
}
// ----

async function pingLocationToServer() {
  if (!isClockedIn || isOnBreak || !lastKnownLocation) return
  const { lat, lng, accuracy } = lastKnownLocation
  if (lat == null || lng == null) return
  const body = { lat, lng }
  if (accuracy != null) body.accuracy = accuracy
  const res = await apiRequest('POST', '/api/locations/ping', body)
  if (res.ok) {
    log(`Location pinged: ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
  } else {
    log(`Location ping failed: ${res.data?.error ?? res.status}`)
  }
}

const LOCATION_PING_INTERVAL_MS = 3 * 60 * 1000  // every 3 minutes

function startLocationPingLoop() {
  if (locationPingInterval) return           // already running
  if (!isClockedIn || isOnBreak) return      // wrong state
  pingLocationToServer()                     // immediate ping
  locationPingInterval = setInterval(pingLocationToServer, LOCATION_PING_INTERVAL_MS)
  log('Location ping loop started (every 3 min)')
}

function stopLocationPingLoop() {
  if (locationPingInterval) {
    clearInterval(locationPingInterval)
    locationPingInterval = null
    log('Location ping loop stopped')
  }
}
// ----

async function handleLogin({ email, password }) {
  try {
    const res = await apiRequest('POST', '/api/desktop-app/auth', { email, password })
    if (!res.ok) {
      return { ok: false, error: res.data?.error ?? 'Login failed' }
    }
    const { token, user, screenCapture } = res.data
    store.set('token', token)
    store.set('userEmail', user.email)
    store.set('userId', user.id)
    store.set('companyName', user.companyName ?? '')
    store.set('screenCaptureEnabled', resolveScreenCaptureEnabled(screenCapture))
    store.set('frequencyMinutes', screenCapture?.frequencyMinutes ?? 5)
    log(`Logged in as ${user.email} (${user.companyName})`)
    await syncClockStateFromServer('login')
    startClockStateSyncLoop()
    await checkForAppUpdates('login')
    rebuildTrayMenu()
    broadcastStatus()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function handleLogout() {
  stopCaptureLoop()
  stopLocationPingLoop()
  stopClockStateSyncLoop()
  store.set('token', null)
  store.set('userEmail', '')
  store.set('userId', '')
  store.set('companyName', '')
  isClockedIn = false
  currentDtrRecordId = null
  captureCount = 0
  clockInTime = null
  latestCaptureDataUrl = null
  isOnBreak = false
  breakStartTime = null
  breakCompleted = false
  allowedBreakMinutes = 60
  overBreakWarned = false
  stopBreakWarningLoop()
  // Close any open sub-windows
  Object.values(subWins).forEach(win => { if (win && !win.isDestroyed()) win.close() })
  Object.keys(subWins).forEach(k => delete subWins[k])
  log('Logged out')
  rebuildTrayMenu()
  broadcastStatus()
  showMainWindow()
}
// ----

ipcMain.handle('auth:login', (_e, args) => handleLogin(args))
ipcMain.handle('auth:logout', () => handleLogout())
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getServerUrl', () => getServerUrl())
ipcMain.handle('app:getPortalUrl', () => getPortalUrl())
ipcMain.handle('app:getUpdateInfo', () => updateInfo)
ipcMain.handle('app:checkForUpdates', () => checkForAppUpdates('manual'))
ipcMain.handle('app:openExternal', (_e, url) => {
  if (!url || typeof url !== 'string') return false
  shell.openExternal(url)
  return true
})
ipcMain.handle('auth:getSession', () => ({
  loggedIn: !!getToken(),
  email: store.get('userEmail', ''),
  companyName: store.get('companyName', ''),
}))
ipcMain.handle('attendance:clockIn', async (_e, location) => {
  const result = await handleClockIn(location)
  broadcastStatus()
  return result
})
ipcMain.handle('attendance:clockOut', async (_e, location) => {
  const result = await handleClockOut(location)
  broadcastStatus()
  return result
})
ipcMain.handle('attendance:getStatus', () => getStatusPayload())
ipcMain.handle('attendance:getLogs', async (_e, limit = 7) =>
  apiRequest('GET', `/api/attendance/logs?limit=${encodeURIComponent(Number(limit) || 7)}`, null)
)

// IP-based geolocation fallback - uses ip-api.com (free, no key, works on any internet connection)
ipcMain.handle('app:getIpLocation', () => {
  return new Promise((resolve) => {
    const req = net.request('http://ip-api.com/json?fields=status,lat,lon,city,regionName,country')
    const chunks = []
    req.on('response', (res) => {
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.status === 'success') {
            resolve({ ok: true, lat: data.lat, lng: data.lon,
              label: [data.city, data.regionName, data.country].filter(Boolean).join(', ') })
          } else {
            resolve({ ok: false })
          }
        } catch { resolve({ ok: false }) }
      })
    })
    req.on('error', () => resolve({ ok: false }))
    req.end()
  })
})
ipcMain.handle('attendance:getLatestCapture', () => latestCaptureDataUrl)
ipcMain.handle('attendance:startBreak', () => handleStartBreak())
ipcMain.handle('attendance:endBreak',   () => handleEndBreak())
ipcMain.handle('attendance:setLocation', (_e, loc) => {
  if (loc && loc.lat != null && loc.lng != null) {
    lastKnownLocation = loc
    log(`Location updated by renderer: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`)
    if (isClockedIn && !isOnBreak) {
      // Always fire an immediate ping when location arrives/refreshes while clocked in.
      // This covers: (a) session restore where loop started before location was known,
      // (b) fresh clock-in where setLocation races with the loop's first tick.
      pingLocationToServer()
      // Start the periodic loop if it isn't running yet
      if (!locationPingInterval) {
        locationPingInterval = setInterval(pingLocationToServer, LOCATION_PING_INTERVAL_MS)
        log('Location ping loop started (every 3 min)')
      }
    }
  }
})
// ---- Leaves ----
ipcMain.handle('leaves:get',      async () => apiRequest('GET', '/api/leaves?own=true&limit=50', null))
ipcMain.handle('leaves:getTypes', async () => apiRequest('GET', '/api/leaves/types', null))
ipcMain.handle('leaves:file',     async (_e, data) => apiRequest('POST', '/api/leaves', data))

// ---- Chat — DMs ----
ipcMain.handle('chat:contacts',   async ()         => apiRequest('GET',   '/api/chat/contacts', null))
ipcMain.handle('chat:messages',   async (_e, uid)  => apiRequest('GET',   `/api/chat/messages?withUserId=${encodeURIComponent(uid)}`, null))
ipcMain.handle('chat:send',       async (_e, data) => apiRequest('POST',  '/api/chat/messages', data))
ipcMain.handle('chat:markDmRead', async (_e, uid)  => apiRequest('PATCH', '/api/chat/messages', { withUserId: uid }))

// ---- Chat — Groups ----
ipcMain.handle('chat:getGroups',        async ()              => apiRequest('GET',   '/api/chat/groups', null))
ipcMain.handle('chat:groupMessages',    async (_e, gid)       => apiRequest('GET',   `/api/chat/groups/${encodeURIComponent(gid)}`, null))
ipcMain.handle('chat:sendGroupMessage', async (_e, gid, body) => apiRequest('POST',  `/api/chat/groups/${encodeURIComponent(gid)}`, { message: body }))
ipcMain.handle('chat:markGroupRead',    async (_e, gid)       => apiRequest('PATCH', `/api/chat/groups/${encodeURIComponent(gid)}`, {}))

// ---- Employee profile ----
ipcMain.handle('employees:me',     async ()         => apiRequest('GET',   '/api/employees/me', null))
ipcMain.handle('employees:update', async (_e, data) => apiRequest('PATCH', '/api/employees/me', data))
ipcMain.handle('app:getUserId',    () => store.get('userId', ''))
ipcMain.handle('payroll:getMyPayslips', async () => apiRequest('GET', '/api/payroll/my-payslips', null))

// ---- Budget Requisitions ----
ipcMain.handle('budgetreq:get',    async ()         => apiRequest('GET',  '/api/budget-requisitions?limit=50', null))
ipcMain.handle('budgetreq:submit', async (_e, data) => apiRequest('POST', '/api/budget-requisitions', data))

// ---- Sub-windows ----
function openSubWindow(key, file, w, h, title) {
  if (subWins[key] && !subWins[key].isDestroyed()) { subWins[key].show(); subWins[key].focus(); return }
  const icoPath = path.join(__dirname, 'assets', 'icon.ico')
  const pngPath = path.join(__dirname, 'assets', 'icon.png')
  const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath
  const win = new BrowserWindow({
    width: w, height: h, minWidth: Math.max(400, w - 120), minHeight: Math.max(400, h - 120),
    resizable: true, title, icon: iconPath,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    show: false,
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, 'renderer', file))
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { delete subWins[key] })
  subWins[key] = win
}
ipcMain.handle('app:openLeaves',   () => openSubWindow('leaves',   'leaves.html',   560, 740, 'Leaves — OnClock'))
ipcMain.handle('app:openMessages', () => openSubWindow('messages', 'messages.html', 860, 660, 'Messages — OnClock'))
ipcMain.handle('app:openProfile',  () => openSubWindow('profile',  'profile.html',  520, 700, 'My Profile — OnClock'))
ipcMain.handle('app:openPayslips', () => openSubWindow('payslips',   'payslips.html',  560, 740,  'Payslips — OnClock'))
ipcMain.handle('app:openBudgetReq',() => openSubWindow('budgetreq', 'budgetreq.html', 640, 780, 'Budget Requisition — OnClock'))

// ----

function createMainWindow() {
  // Remove the default File/Edit/View/Window/Help menu bar entirely
  Menu.setApplicationMenu(null)

  const windowOptions = {
    width: 400,
    height: 720,
    resizable: false,
    title: 'OnClock Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    skipTaskbar: false,
  }

  // Prefer ICO for Windows taskbar, fall back to PNG
  const icoPath = path.join(__dirname, 'assets', 'icon.ico')
  const pngPath = path.join(__dirname, 'assets', 'icon.png')
  if (fs.existsSync(icoPath)) {
    windowOptions.icon = icoPath
  } else if (fs.existsSync(pngPath)) {
    windowOptions.icon = pngPath
  }

  mainWindow = new BrowserWindow(windowOptions)

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    if (!shouldStartHidden()) mainWindow.show()
  })

  // Hide to tray on user close; allow real quit (installer / tray-Quit)
  mainWindow.on('close', (e) => {
    if (isQuitting) return   // let it through - OS or installer requested exit
    e.preventDefault()
    mainWindow.hide()
  })
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
  if (getToken()) {
    void syncClockStateFromServer('window-open')
  }
}
// ----

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('empty')
    // Resize to 16x16 for the Windows system tray
    icon = icon.resize({ width: 16, height: 16 })
  } catch {
    // Fallback: orange square
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAMElEQVQ4jWNkYGD4z0ABYCJVAQMDA8P/UQ0MowZQDYwaQDUwagDVwKgBVAOjBgAAeAAFAAGRFgAAAABJRU5ErkJggg=='
    )
  }

  tray = new Tray(icon)
  tray.on('double-click', () => showMainWindow())
  rebuildTrayMenu()
}
// ----

app.whenReady().then(() => {
  ensureAutoLaunchEnabled()
  // Grant geolocation permission to the renderer automatically -
  // without this Electron silently denies navigator.geolocation on Windows.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'geolocation')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'geolocation'
  })

  // Prevent multiple instances
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  app.on('second-instance', () => {
    showMainWindow()
  })

  createTray()
  startUpdateCheckLoop()

  // If not logged in, show login window
  if (!getToken()) {
    createMainWindow()
  } else {
    log(`Auto-session restored for ${store.get('userEmail', '')}`)
    void syncClockStateFromServer('startup')
    startClockStateSyncLoop()
  }
})

// Keep app running even with no windows
app.on('window-all-closed', () => {
  // Do nothing - app stays in tray
})

app.on('before-quit', () => {
  isQuitting = true
  stopCaptureLoop()
  stopLocationPingLoop()
  stopClockStateSyncLoop()
  stopBreakWarningLoop()
  stopUpdateCheckLoop()
})


