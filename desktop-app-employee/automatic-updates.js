'use strict'

// electron-updater verifies the feed's SHA-512 before calling the publisher
// verifier. Pin our current self-signed publisher rather than trusting any
// certificate with the same display name or disabling verification entirely.
const { execFile } = require('child_process')
const PINNED_PUBLISHER = '94E1D3367948AE15DBF132D8305E99FB9C56DD7A'

function acceptsSignature(signature) {
  return signature?.thumbprint === PINNED_PUBLISHER &&
    (signature.status === 'Valid' ||
      (signature.status === 'UnknownError' && signature.untrustedRootOnly === true))
}

function verifyPublisher(_names, file) {
  // LiteralPath is passed through an environment variable, never shell code.
  const script = "$s=Get-AuthenticodeSignature -LiteralPath $env:ONCLOCK_UPDATE_FILE; $c=New-Object System.Security.Cryptography.X509Certificates.X509Chain; $c.ChainPolicy.RevocationMode='NoCheck'; $null=$c.Build($s.SignerCertificate); $flags=@($c.ChainStatus | ForEach-Object {$_.Status.ToString()}); @{thumbprint=$s.SignerCertificate.Thumbprint;status=$s.Status.ToString();untrustedRootOnly=($flags.Count -eq 1 -and $flags[0] -eq 'UntrustedRoot')}|ConvertTo-Json -Compress"
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 30000,
      env: { ...process.env, ONCLOCK_UPDATE_FILE: file },
    }, (error, output) => {
      try {
        resolve(!error && acceptsSignature(JSON.parse(output)) ? null : 'Update publisher verification failed.')
      } catch { resolve('Update publisher verification failed.') }
    })
  })
}

function createAutomaticUpdates({ updater, canInstall, install, onState, onProgress, log }) {
  let checking = null
  let ready = false
  let applying = false
  let state = { automatic: true, state: 'idle', updateAvailable: false }
  const publish = patch => { state = { ...state, ...patch }; onState(state) }
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = false
  updater.allowDowngrade = false
  updater.allowPrerelease = false
  updater.disableWebInstaller = true
  updater.verifyUpdateCodeSignature = verifyPublisher
  updater.on('update-available', info => publish({ state: 'downloading', updateAvailable: true, latestVersion: info.version, error: null }))
  updater.on('update-not-available', () => { if (!ready) publish({ state: 'idle', updateAvailable: false, error: null }) })
  updater.on('download-progress', progress => {
    publish({ state: 'downloading', percent: Math.floor(progress.percent) })
    onProgress({ percent: progress.percent, downloaded: progress.transferred, total: progress.total })
  })
  updater.on('update-downloaded', info => {
    ready = true
    publish({ state: 'ready', latestVersion: info.version, updateAvailable: true, error: null })
    // Installation is attempted by the idle timer, never inside download events.
  })
  updater.on('error', error => {
    applying = false
    publish({ state: ready ? 'ready' : 'error', error: 'Update could not complete. It will retry automatically.' })
    log(`Automatic update: ${error.message}`)
  })
  return {
    async check() {
      if (ready || state.state === 'downloading') return { ok: true, ...state }
      if (!checking) checking = (async () => {
        try {
          publish({ state: 'checking' })
          const result = await updater.checkForUpdates()
          // Observe background download rejection (also reported by error event).
          result?.downloadPromise?.catch(error => log(`Update download: ${error.message}`))
          return { ok: true, ...state }
        } catch (error) {
          publish({ state: 'error', error: 'Cannot check for updates. Will retry automatically.' })
          return { ok: false, error: error.message }
        } finally { checking = null }
      })()
      return checking
    },
    async tryInstall() {
      if (!ready || applying) return false
      applying = true
      try {
        if (!await canInstall()) return false
        publish({ state: 'installing' })
        install(() => updater.quitAndInstall(true, true))
        return true
      } catch (error) { log(`Update postponed: ${error.message}`); return false }
      finally { if (state.state !== 'installing') applying = false }
    },
  }
}

module.exports = { createAutomaticUpdates, acceptsSignature, verifyPublisher }
