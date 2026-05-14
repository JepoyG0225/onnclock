# OnClock Biometric Hardware

End-to-end fingerprint clock-in/out terminal — hardware + software.

```
┌──────────────────────────────────────────────────────────────────┐
│  Enclosure (3D-printed)                                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ┌───────────────────┐         ┌────────────────────┐      │  │
│  │  │   3.5" LCD        │         │   ZK9500 reader    │      │  │
│  │  │   (status + time) │         │   (USB)            │      │  │
│  │  └───────────────────┘         └────────────────────┘      │  │
│  │                                                            │  │
│  │  ┌────────────┐    ┌──────────────────────────────────┐    │  │
│  │  │ 30 mm fan  │    │      Raspberry Pi 4B             │    │  │
│  │  └────────────┘    │  USB-C ← left wall               │    │  │
│  │                    │  USB×4 + LAN ← bottom edge       │    │  │
│  │                    └──────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (Bearer-token)
                              ▼
              ┌───────────────────────────────────┐
              │  https://onclockph.com            │
              │  /api/biometric/{pair, clock,     │
              │   enrollments, heartbeat}         │
              └───────────────────────────────────┘
```

## Directory layout

| Path | What's there |
|---|---|
| `openscad/` | Parametric enclosure design — body, lid, bezel, stand, wall mount. Generates STL files via OpenSCAD CLI. |
| `pi-kiosk/` | Python kiosk app, systemd unit, install script, and Pi-side README. |

## High-level flow

1. **Admin pairs a device.** HR dashboard → Time & Attendance → Biometric
   Terminals → Add Device. Server returns a 6-digit code valid 15 min.
2. **Tech installs and pairs the Pi.** Boots into the OnClock kiosk,
   types the code, gets a long-lived bearer token saved to
   `~/.onclock/device.json`. No further login required.
3. **HR enrolls employees** by tapping "Enroll mode" on the kiosk and
   placing the employee's finger on the ZK9500. Templates upload to the
   server and propagate to every other kiosk in the company.
4. **Employees clock in/out** by placing a finger. The kiosk matches
   against its cached templates and POSTs `CLOCK_IN`/`CLOCK_OUT` to the
   server, which auto-upserts a `DTRRecord` for the calendar day.
5. **Network down?** Events queue locally and flush automatically once
   connectivity returns.

## Security model

- Tokens are **256 bits of random**, transmitted once over HTTPS during
  pairing, then stored only as SHA-256 hashes server-side.
- A device's `Authorization: Bearer <token>` is scoped to a single
  company — it can only read employees and write clock events for that
  company.
- Admins can **revoke** a device at any time from the dashboard, which
  clears the token hash and sets status = REVOKED. The Pi falls back to
  the pairing screen on the next request.
- Fingerprint templates are the proprietary ZK9500 binary format
  (base64-stored). We never store raw fingerprint images.
