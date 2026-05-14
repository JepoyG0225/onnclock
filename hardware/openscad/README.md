# OnClock Biometric Clock-In Terminal — Enclosure

Parametric OpenSCAD design for the OnClock fingerprint clock-in/out terminal.
Landscape commercial-style layout.

## Layout (front view)

```
┌──────── top fan exhaust grille ──────────────────────────┐
│   ┌────────────────────┐         ┌─────────────────┐     │
│   │                    │         │                 │     │
│   │   3.5" SCREEN      │         │  ZK9500 / PUCK  │     │
│   │  (clock / status)  │         │  FINGERPRINT    │     │
│   │                    │         │     READER      │     │
│   └────────────────────┘         └─────────────────┘     │
│                                                          │
│           OnClock     · status LED                       │
└─ LAN ── [USB 3.0]── [USB 3.0]── [USB 2.0]── [USB 2.0]────┘
    ↑ each port is its OWN rectangular cutout (matches the
      aluminum-Pi-case look — see hardware/openscad/README.md)
    ↑ USB-C power exits the LEFT side wall (the only opening
      on the left)
```

## Components

| Component | Dimensions | Location |
|---|---|---|
| Raspberry Pi 4B | 85.6 × 56.5 × 22 mm (bump `pi_h` to 28 for an aluminum heat-sink case) | Inside, back-left, USB-C → LEFT wall, USB-A/LAN → BOTTOM edge |
| Waveshare 3.5" LCD | 85.4 × 55.9 × 10 mm | Front face, left half |
| ZK9500 fingerprint reader | 124.5 × 102 × 34 mm | Front face, right half |
| **(or)** smaller USB puck reader | drop-in via the `reader_adapter` plate | Inside the same ZK9500 cutout |
| 30 × 30 × 10 mm fan | M3 mount | Inside, above Pi |

## I/O passthroughs (bottom edge)

Each port is its **own rectangular hole** (not a single wide slot), so the
finished case looks like a stock Pi aluminum case:

```
┌─────┬───────┬───────┬───────┬───────┐
│ LAN │ USB 3 │ USB 3 │ USB 2 │ USB 2 │   ← five individual rectangles
└─────┴───────┴───────┴───────┴───────┘
```

Each USB block on the Pi has two STACKED ports; the design cuts each port's
hole separately with a thin plastic web between top and bottom (matches
the look in the reference photo).

## Left-side passthroughs

The left wall mirrors a stock Pi 4 aluminum-case face plate (same order
left-to-right as the bare Pi):

```
┌──────────────────────────────────────────────────────┐
│  ⏻ USB-C   ┃ HDMI ┃ HDMI ┃   ◯ 3.5 mm audio          │
│  (power)   ┃  0   ┃  1   ┃                           │
└──────────────────────────────────────────────────────┘
```

- **USB-C power** — supply input for the Pi
- **2× micro-HDMI** — display output (optional, useful for setup)
- **3.5 mm audio jack** — round hole, panel-flush

## Other I/O

- **Side intake vents** — right side wall (cool air pulled in by the fan)
- **Top exhaust grille** — across the top edge (warm air pushed out by
  the internal 30 mm fan, even if the Pi has its own heat-sink case)

## Render the STL files

```bash
openscad -o body.stl         -D 'part="body"'           onclock-clockin-enclosure.scad
openscad -o lid.stl          -D 'part="lid"'            onclock-clockin-enclosure.scad
openscad -o bezel.stl        -D 'part="bezel"'          onclock-clockin-enclosure.scad
openscad -o stand.stl        -D 'part="stand"'          onclock-clockin-enclosure.scad
openscad -o wallmount.stl    -D 'part="wallmount"'      onclock-clockin-enclosure.scad
openscad -o reader_adapter.stl -D 'part="reader_adapter"' onclock-clockin-enclosure.scad
```

Or open the file in OpenSCAD and select the part from the **Customizer**
panel (Window → Customizer).

## Using a smaller fingerprint puck instead of the ZK9500

The ZK9500 cutout is intentionally generous so any smaller USB fingerprint
reader (e.g. **LIVE 20R**, **DigitalPersona U.are.U 4500**, **Hamster IV**)
drops straight in.

To centre and secure a smaller puck inside the ZK9500-sized opening, print
the **`reader_adapter`** part — it's a flat plate that fills the cutout and
holds the puck via a retention lip. Adjust the `puck_w` / `puck_d` /
`puck_sensor_w` / `puck_sensor_h` parameters at the top of the
`reader_adapter_plate()` module for the exact reader you're using.

## Print settings (recommended)

- Material: PETG or ABS for heat tolerance near the fan
- Layer height: 0.2 mm
- Wall count: 4
- Infill: 25 % cubic
- Supports: tree supports under each USB / LAN cutout (short overhangs)
- Orientation: print **body** open-face-up so the front face is the build
  plate (cleanest visible surface)

## Assembly hardware

- 4 × M2.5 × 6 mm screws for the Pi (self-tapping into the standoff posts)
- 4 × M3 × 16 mm screws + nuts for the fan
- 4 × #2 × 6 mm self-tapping screws to retain the screen
- 4 × M2 × 12 mm screws for the ZK9500 from inside the case
- 4 × M3 × 8 mm screws to attach the stand to the lid (countersunk)
- 2 × #6 wood/drywall screws if wall-mounting via the lid keyhole slots

## Cable routing

- Pi USB-C power → left-side wall cutout → external supply
- ZK9500 (or smaller puck) USB-A → short internal pigtail to one of the
  Pi's USB-A 2.0 ports
- Screen ribbon → rides over the fan compartment and plugs into Pi GPIO
  header (the Waveshare 3.5" LCD model B uses the 26-pin SPI header)
- Fan power → Pi GPIO pins 4 & 6 (5V / GND)

## All dimensions parametric

Every dimension lives at the top of the `.scad` file. Swap the screen for
a 5" model, use a smaller fan, or change the USB port spacing — edit the
constants and re-render.
