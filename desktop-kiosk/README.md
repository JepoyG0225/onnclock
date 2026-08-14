# OnClock Face Kiosk

A shared attendance terminal for Windows. An admin signs in once on the device;
after that any employee clocks in or out by face — nobody else signs in.

## How it differs from the portal

The portal verifies **1:1** — "is this the signed-in employee?". A kiosk has no
signed-in employee, so it identifies **1:N** — "which of this company's
employees is this?". That is a harder question with more chances of a
coincidental near-match, so `/api/kiosk/identify` uses a stricter threshold
(0.86 vs 0.82) and additionally refuses any scan where the runner-up is within
0.03 of the winner. A false accept here would clock in the wrong person, which
is a payroll error.

## Setup

1. Every employee enrols their face once from the portal
   (Attendance → Set up face). The kiosk cannot enrol anyone.
2. Install and launch the kiosk, sign in with a **company admin, HR manager or
   payroll officer** account. A plain employee account is refused.
3. Leave it running. It reopens on the scanner.

## Build

```
npm install
npm run build:win     # NSIS installer in dist/
npm run build:dir     # unpacked, for testing
npm start             # run from source
```

Models (~6 MB) and the face-api bundle ship inside the app, so the terminal
works on a flaky connection and starts instantly.

## Notes for whoever maintains this

- The renderer is served over a custom `kiosk://` scheme, not `file://`.
  `file://` is not a secure context, so `getUserMedia` is unavailable there, and
  `fetch` is blocked, which face-api needs to load weights. Both fail silently
  if you switch it back.
- The protocol handler reads with `fs`, not `net.fetch(file://)`. Once packaged
  the app lives inside `app.asar`; Electron patches Node's `fs` to see through
  the archive but Chromium's file loader does not, so a `file://` fetch works in
  development and 404s in the installed build.
- The admin token lives in the main process only. The renderer can ask to
  identify and to punch; it cannot read the credential.
- Punches call the same `/api/attendance/clock-in` and `/clock-out` routes the
  portal uses, naming the employee explicitly. Schedule validation, rest days
  and late/undertime therefore behave identically. Do not add a second punch
  implementation here.

## Known limitation

This is face **recognition**, not liveness detection. A printed photo or a
phone screen held to the camera can pass. If that matters for your sites, the
kiosk should be somewhere supervised, or paired with the existing fingerprint
terminal.
