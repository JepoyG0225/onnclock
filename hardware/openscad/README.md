# OnClock Biometric Clock-In Terminal — Enclosure

Parametric OpenSCAD design for the OnClock fingerprint clock-in/out terminal.
Landscape commercial-style layout, inspired by ZKTeco / desktop attendance
terminals.

## Layout (front view)

```
┌──────────────────────────────────────────────────────┐
│  ┌────────────────────┐         ┌─────────────────┐  │
│  │                    │         │                 │  │
│  │   3.5" SCREEN      │         │     ZK9500      │  │
│  │  (clock / status)  │         │  FINGERPRINT    │  │
│  │                    │         │     READER      │  │
│  └────────────────────┘         └─────────────────┘  │
│                                                      │
│           OnClock     · status LED                   │
└──────── USB-A × 4  +  Ethernet ──────────────────────┘
    ↑ USB-C power exits the LEFT side wall
```

## Components

| Component | Dimensions | Location |
|---|---|---|
| Raspberry Pi 4B | 85.6 × 56.5 × 17 mm | Inside, back-left, oriented so USB-C exits LEFT wall, USB-A + LAN exit BOTTOM edge |
| Waveshare 3.5" LCD | 85.4 × 55.9 × 10 mm | Front face, left half (centered vertically) |
| ZK9500 fingerprint reader | 124.5 × 102 × 34 mm | Front face, right half |
| 30 × 30 × 10 mm fan | M3 mount | Above Pi, exhausts up through top vents |

## I/O passthroughs

- **USB-C power** — left side wall, lower section (Pi's short edge faces left)
- **USB-A × 4** — bottom edge, left half (Pi's USB cluster)
- **Ethernet (RJ45)** — bottom edge, right of USB
- **Micro-HDMI × 2** — left side wall (above USB-C)
- **3.5 mm audio** — left side wall (top)
- **Side intake vents** — right side wall (cool air pulled in by fan)
- **Top exhaust grille** — across the top edge (warm air out)

## Render the STL files

```bash
openscad -o body.stl       -D 'part="body"'       onclock-clockin-enclosure.scad
openscad -o lid.stl        -D 'part="lid"'        onclock-clockin-enclosure.scad
openscad -o bezel.stl      -D 'part="bezel"'      onclock-clockin-enclosure.scad
openscad -o stand.stl      -D 'part="stand"'      onclock-clockin-enclosure.scad
openscad -o wallmount.stl  -D 'part="wallmount"'  onclock-clockin-enclosure.scad
```

Or open the file in OpenSCAD and select the part from the **Customizer**
panel on the right (Window → Customizer).

## Print settings (recommended)

- Material: PETG or ABS for heat tolerance near the fan
- Layer height: 0.2 mm
- Wall count: 4
- Infill: 25 % cubic
- Supports: tree supports under the bottom I/O slot and the left-side USB-C
  cutout (everything else is short overhangs)
- Orientation: print **body** open-face-up (the front face becomes the build
  plate, giving the cleanest visible surface)

## Assembly hardware

- 4 × M2.5 × 6 mm screws for the Pi (self-tapping into the standoff posts)
- 4 × M3 × 16 mm screws + nuts for the fan
- 4 × #2 × 6 mm self-tapping screws to retain the screen
- 4 × M2 × 12 mm screws for the ZK9500 from inside the case (the reader has
  threaded mounting points on its rear flange)
- 4 × M3 × 8 mm screws to attach the stand to the lid (countersunk into the
  stand)
- 2 × #6 wood/drywall screws if wall-mounting via the lid keyhole slots

## Cable routing

- Pi USB-C power → left-side wall cutout → external supply
- ZK9500 USB-A → short internal pigtail to one of the Pi's USB-A 2.0 ports
- Screen ribbon → rides over the fan compartment and plugs into Pi GPIO
  header (the Waveshare 3.5" LCD model B uses the 26-pin SPI header)
- Fan power → Pi GPIO pins 4 & 6 (5V / GND) — for always-on operation; or
  via a 2N2222 + PWM pin if you want temperature-controlled speed

## All dimensions parametric

Every dimension lives at the top of the `.scad` file. Swap the screen for
a 5" model or use a smaller fan — change the constants and re-render.
