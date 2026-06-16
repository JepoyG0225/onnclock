# OnClock Biometric Kiosk — Raspberry Pi 4

Fingerprint clock-in / clock-out terminal that runs on a Pi 4 + ZK9500
reader + 3.5" TFT screen. One-time pairing with your OnClock company —
after that the device runs unattended.

## Hardware

| Component | Notes |
|---|---|
| Raspberry Pi 4B (2 GB+) | Pi OS Bookworm 64-bit |
| Waveshare 3.5" GPIO LCD | 320 × 480, model B |
| ZKTeco ZK9500 fingerprint reader | USB; uses libzkfp / pyzkfp |
| 30 × 30 × 10 mm 5 V fan | wired to Pi GPIO 5V/GND |
| USB-C power supply | 5 V / 3 A official Pi adapter |
| Enclosure | see `../openscad/` |

## Software install (on the Pi)

```bash
git clone https://github.com/your-org/ph-hrpayroll.git
cd ph-hrpayroll/hardware/pi-kiosk
bash setup.sh
sudo reboot
```

The installer:

- Installs `libzkfp`, Python 3, Tkinter, and `pyzkfp`
- Copies the kiosk into `/opt/onclock-kiosk/`
- Registers a systemd unit (`onclock-kiosk.service`) that runs at boot
- Hides the mouse cursor and disables screen blanking
- Writes a udev rule so the pi user can read the ZK9500 USB device

## First-boot pairing

1. In your OnClock dashboard, go to **Time & Attendance → Biometric
   Terminals** and click **Add Device**.
2. Note the 6-digit pair code (valid 15 min).
3. The Pi boots into the **Pair this device** screen — type the code
   on the on-screen keypad and press ✓.
4. The kiosk receives a long-lived bearer token, stores it under
   `~/.onclock/device.json`, and never asks for a login again.

## Day-to-day operation

- Boot the kiosk; it shows a live clock + "Place your finger on the
  scanner" message.
- On a successful match it posts a CLOCK_IN/CLOCK_OUT event to OnClock
  and shows a "✓ John Smith" confirmation for ~2 s.
- If the network is down, events queue locally in
  `~/.onclock/queue.sqlite3` and flush automatically once back online.
- Enrollment templates are re-synced from the server every 5 min so
  newly-enrolled employees can punch in without rebooting.

## Useful commands

```bash
# Watch the kiosk log live
journalctl -u onclock-kiosk -f

# Reset pairing (revokes nothing on the server — do that in the dashboard)
rm -rf ~/.onclock
sudo systemctl restart onclock-kiosk

# Run in windowed dev mode (instead of fullscreen)
sudo systemctl stop onclock-kiosk
ONCLOCK_FULLSCREEN=0 python3 /opt/onclock-kiosk/onclock_kiosk.py
```

## Environment overrides

| Variable | Default | Purpose |
|---|---|---|
| `ONCLOCK_API_BASE` | `https://onclockph.com` | Backend URL |
| `ONCLOCK_CONFIG_DIR` | `~/.onclock` | Where the token + queue + templates DB live |
| `ONCLOCK_FULLSCREEN` | `1` | Set to `0` for windowed dev mode |

## Server-side endpoints (for reference)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/biometric/pair` | — | Trade pair code for bearer token |
| GET | `/api/biometric/enrollments` | Bearer | Sync fingerprint templates |
| POST | `/api/biometric/enrollments` | Bearer | Enroll a new finger |
| POST | `/api/biometric/clock` | Bearer | Record a clock event |
| POST | `/api/biometric/heartbeat` | Bearer | Online indicator |

All requests must include `Authorization: Bearer <token>` except `/pair`.

## Notes on the ZK9500

The `pyzkfp` library is a wrapper over the ZKTeco libzkfp.so SDK. If your
distro doesn't ship the library, download it from ZKTeco's developer
portal and install it manually:

```bash
sudo dpkg -i libzkfp_*.deb
sudo ldconfig
pip3 install pyzkfp
```

If `pyzkfp` cannot find the reader, the kiosk falls back to a stub
mode — useful for UI development on a dev laptop without the hardware.
