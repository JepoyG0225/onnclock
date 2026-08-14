/**
 * Kiosk renderer.
 *
 * Continuously watches for a face. When one is held steady long enough the mesh
 * completes, descriptors are sent for 1:N identification, and the matched
 * employee is clocked in or out — whichever is due.
 *
 * Models and the face-api bundle are shipped inside the app rather than fetched
 * from the server: a terminal on a shaky office connection should still work,
 * and a 6 MB download on every launch is a slow start for something that lives
 * on a wall.
 */

const MODEL_URL = '../models'
const FACE_MODEL_ID = 'face-api.js@0.22.2/face_recognition_model'

// Must match src/lib/face/face-api.ts — the wireframe runs of the 68-point model.
const MESH_PATHS = [
  [0, 16, false], [17, 21, false], [22, 26, false], [27, 30, false], [31, 35, false],
  [36, 41, true], [42, 47, true], [48, 59, true], [60, 67, true],
]
const LANDMARKS = 68

/** Steady-hold required before a scan is submitted. */
const REVEAL_MS = 1100
/** After any result, ignore faces for this long so one person is not scanned twice. */
const COOLDOWN_MS = 6000
const DETECT_MS = 130

const $ = id => document.getElementById(id)

let points = null
let holdStart = null
let busy = false
let cooldownUntil = 0
let detector = null

// ── Screens ─────────────────────────────────────────────────────────────────

function show(screen) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'))
  $(screen).classList.add('active')
}

// ── Sign in ─────────────────────────────────────────────────────────────────

$('signinBtn').addEventListener('click', async () => {
  const email = $('email').value.trim()
  const password = $('password').value
  const kioskName = $('kioskName').value.trim()
  if (!email || !password) return

  $('signinBtn').disabled = true
  $('signinBtn').textContent = 'Signing in…'
  $('signinError').style.display = 'none'

  const res = await window.kiosk.signIn({ email, password, kioskName })
  if (!res.ok) {
    $('signinError').textContent = res.error || 'Sign in failed'
    $('signinError').style.display = 'block'
    $('signinBtn').disabled = false
    $('signinBtn').textContent = 'Sign in & start kiosk'
    return
  }
  // Clear the password from the DOM the moment it is no longer needed.
  $('password').value = ''
  await startKiosk()
})

$('serverBtn').addEventListener('click', async () => {
  const current = (await window.kiosk.getState()).serverUrl
  const next = prompt('Server URL', current)
  if (next) await window.kiosk.setServerUrl(next)
})

$('signOutBtn').addEventListener('click', async () => {
  await window.kiosk.signOut()
  location.reload()
})

// ── Clock ───────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = new Date()
  $('clock').firstChild.nodeValue = now.toLocaleTimeString('en-PH', { hour12: true })
  $('today').textContent = now.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}, 1000)

// ── Mesh drawing ────────────────────────────────────────────────────────────

function draw() {
  const canvas = $('overlay')
  const video = $('video')
  const ctx = canvas.getContext('2d')
  if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
    canvas.width = video.clientWidth
    canvas.height = video.clientHeight
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (points && points.length >= LANDMARKS) {
    const held = holdStart ? Date.now() - holdStart : 0
    const revealed = Math.floor(Math.min(1, held / REVEAL_MS) * LANDMARKS)
    const accent = busy ? '#10b981' : '#ff5900'

    ctx.strokeStyle = accent
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.35
    for (const [from, to, closed] of MESH_PATHS) {
      const last = Math.min(to, revealed - 1)
      if (last <= from) continue
      ctx.beginPath()
      ctx.moveTo(points[from].x, points[from].y)
      for (let i = from + 1; i <= last; i++) ctx.lineTo(points[i].x, points[i].y)
      if (closed && last === to) ctx.closePath()
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    ctx.fillStyle = accent
    for (let i = 0; i < revealed; i++) {
      const age = revealed - i
      const r = age < 4 ? 3.6 - age * 0.45 : 2
      ctx.beginPath()
      ctx.arc(points[i].x, points[i].y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  requestAnimationFrame(draw)
}

// ── Result overlay ──────────────────────────────────────────────────────────

function showResult({ name, photoUrl, verdict, detail, colour }) {
  const el = $('result')
  el.style.background = `${colour}f2`
  $('resultAvatar').innerHTML = photoUrl
    ? `<img class="avatar" src="${photoUrl}" alt="" />`
    : `<div class="initials">${(name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}</div>`
  $('resultName').textContent = name || ''
  $('resultVerdict').textContent = verdict
  $('resultDetail').textContent = detail || ''
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 3800)
}

function setStatus(title, hint) {
  $('statusTitle').textContent = title
  if (hint !== undefined) $('statusHint').textContent = hint
}

// ── Scan → identify → punch ─────────────────────────────────────────────────

async function handleScan(descriptors) {
  busy = true
  setStatus('Checking…', '')

  try {
    const id = await window.kiosk.identify({ embeddings: descriptors, model: FACE_MODEL_ID })

    if (!id.ok || !id.matched) {
      const reason =
        id.reason === 'AMBIGUOUS' ? 'Scan was not decisive — please try again'
        : id.error ? id.error
        : 'Face not recognised. Ask HR to set up your face.'
      showResult({ name: '', verdict: 'Not recognised', detail: reason, colour: '#b91c1c' })
      return
    }

    const punch = await window.kiosk.punch({ employeeId: id.employee.id, action: id.action })

    if (!punch.ok) {
      // The punch routes enforce schedules and rest days, so a refusal here is
      // usually a legitimate rule rather than a fault — show its reason.
      const msg = typeof punch.error === 'string' ? punch.error : 'Could not record attendance'
      showResult({
        name: id.employee.name, photoUrl: id.employee.photoUrl,
        verdict: 'Not recorded', detail: msg, colour: '#b45309',
      })
      return
    }

    const when = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
    showResult({
      name: id.employee.name,
      photoUrl: id.employee.photoUrl,
      verdict: id.action === 'OUT' ? 'Clocked out' : 'Clocked in',
      detail: `${when} · match ${(id.score * 100).toFixed(1)}%`,
      colour: id.action === 'OUT' ? '#1b6a6e' : '#047857',
    })
  } catch (err) {
    showResult({ name: '', verdict: 'Error', detail: String(err?.message || err), colour: '#b91c1c' })
  } finally {
    busy = false
    points = null
    holdStart = null
    cooldownUntil = Date.now() + COOLDOWN_MS
    setStatus('Ready', 'Look at the screen to clock in or out')
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────

async function startKiosk() {
  const state = await window.kiosk.getState()
  $('companyLabel').textContent = state.companyName || ''
  $('kioskLabel').textContent = state.kioskName || ''
  show('scanner')

  setStatus('Loading face models…', '')
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)

  detector = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })

  setStatus('Starting camera…', '')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  const video = $('video')
  video.srcObject = stream
  await video.play()

  setStatus('Ready', 'Look at the screen to clock in or out')
  requestAnimationFrame(draw)

  const samples = []

  setInterval(async () => {
    if (busy || Date.now() < cooldownUntil) return
    const v = $('video')
    if (!v || v.readyState < 2) return

    const result = await faceapi
      .detectSingleFace(v, detector)
      .withFaceLandmarks()
      .withFaceDescriptor()

    if (!result) {
      points = null
      holdStart = null
      samples.length = 0
      return
    }

    const resized = faceapi.resizeResults(result, {
      width: v.clientWidth, height: v.clientHeight,
    })
    points = resized.landmarks.positions.map(p => ({ x: p.x, y: p.y }))

    if (holdStart === null) {
      holdStart = Date.now()
      setStatus('Hold still…', '')
    }
    if (Date.now() - holdStart < REVEAL_MS) return

    samples.push(Array.from(result.descriptor))
    holdStart = Date.now()

    // Three frames give the server a few chances to clear the threshold, which
    // matters at a kiosk where people rarely hold a perfect pose.
    if (samples.length >= 3) {
      const batch = samples.splice(0, samples.length)
      await handleScan(batch)
    }
  }, DETECT_MS)
}

;(async () => {
  const state = await window.kiosk.getState()
  if (state.signedIn) {
    await startKiosk()
  } else {
    show('signin')
  }
})()
