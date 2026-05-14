// ─────────────────────────────────────────────────────────────────────────────
// OnClock Biometric Clock-In Terminal — landscape commercial enclosure
//
// Houses:
//   • Raspberry Pi 4B (in its aluminum heat-sink case if desired)
//   • 3.5" TFT screen (Waveshare 3.5" GPIO LCD)
//   • ZK9500 fingerprint reader  — OR — any smaller USB puck reader can be
//     slipped into the same cutout (e.g. LIVE 20R ~70 × 40 mm)
//   • 30 × 30 × 10 mm fan inside, exhausting through the top grille
//
// Layout (front view, landscape):
//        ┌───────── top fan exhaust grille ────────────┐
//        │ ┌─────────────────────┐    ┌──────────────┐ │
//   ┌──┐ │ │                     │    │              │ │
//   │PW│ │ │     3.5" SCREEN     │    │   FINGER     │ │
//   │  │ │ │                     │    │   PRINT      │ │
//   └──┘ │ └─────────────────────┘    └──────────────┘ │
//        │                                              │
//        └─ LAN ── [USB 3.0]── [USB 3.0]── [USB 2.0]── [USB 2.0] ─┘
//             ↑ each USB port gets its own hole, stacked pairs
//             ↑ LAN is a separate hole on its own
//
//   Left wall: single USB-C power passthrough — nothing else.
//   Bottom edge: 1 × LAN + 4 × individual USB-A holes.
//   Top edge: slot grille for fan exhaust.
//
// Render parts:
//   openscad -o body.stl    -D 'part="body"'      onclock-clockin-enclosure.scad
//   openscad -o lid.stl     -D 'part="lid"'       onclock-clockin-enclosure.scad
//   openscad -o bezel.stl   -D 'part="bezel"'     onclock-clockin-enclosure.scad
//   openscad -o stand.stl   -D 'part="stand"'     onclock-clockin-enclosure.scad
//   openscad -o wallmount.stl -D 'part="wallmount"' onclock-clockin-enclosure.scad
//
// All dimensions in mm. Tested with OpenSCAD 2021.01+.
// ─────────────────────────────────────────────────────────────────────────────

/* [Which part to render] */
part = "assembly";   // [assembly, body, lid, bezel, stand, wallmount]

/* [Print quality] */
$fn = 64;

/* [Enclosure shell] */
wall              = 2.6;
internal_padding  = 2;
case_radius       = 5;

/* [Raspberry Pi 4B — bare PCB or in an aluminum heat-sink case] */
pi_w  = 85.6;        // long edge (USB+LAN side)
pi_d  = 56.5;        // short edge (USB-C/HDMI/audio side)
pi_h  = 22;          // tallest component above the PCB; bump to 28 if using
                     // a heat-sink case
pi_hole_pattern = [
  [3.5,  3.5],
  [3.5,  52.5],
  [61.5, 3.5],
  [61.5, 52.5],
];

/* [Pi 4 I/O port positions along its USB+LAN edge] */
// Distances from the corner of the PCB nearest the SD-card slot (i.e. the
// corner with X = 0 when looking at the Pi from above with the USB ports
// facing -Y). Sizes are the connector body, not the visible aperture.
io_lan_x_off       = 1.0;    // RJ45 starts here
io_lan_w           = 17;
io_lan_h           = 14;

io_usb3_x_off      = 22;     // start of USB-3.0 (blue) double block
io_usb_block_w     = 15.5;   // both 3.0 and 2.0 blocks are this wide
io_usb_block_gap   = 5;      // gap between the 3.0 and 2.0 blocks

io_usb2_x_off      = io_usb3_x_off + io_usb_block_w + io_usb_block_gap;

// Each USB block contains two STACKED ports. Each individual port is ~14 mm
// wide × 7 mm tall with a thin (≈ 2.5 mm) plastic divider between them.
usb_port_w         = 14;
usb_port_h         = 7;
usb_pair_gap       = 2.5;

/* [ZK9500 fingerprint reader (housing)] */
zk_w = 124.5;
zk_d = 102.0;
zk_h = 34.0;
// Smaller USB pucks (e.g. LIVE 20R) drop into the same cutout — that's why
// the cutout footprint stays at ZK9500 size.

/* [Waveshare 3.5" GPIO LCD] */
scr_w        = 85.4;
scr_d        = 55.9;
scr_h        = 10;
scr_visible_w = 73;
scr_visible_h = 49;

/* [30 × 30 × 10 mm internal fan] */
fan_size      = 30;
fan_thickness = 10;
fan_hole_spacing = 24;
fan_hole_dia  = 3.2;
fan_blade_dia = 27;

/* [Layout & derived sizes] */
inner_w = 231;
inner_h = 122;
case_width  = inner_w + 2 * wall;      // ≈ 236
case_height = inner_h + 2 * wall;      // ≈ 127
// Depth needs room for the ZK9500 reader (34 mm), the Pi-in-case (≈ 22 mm)
// PLUS clearance for cabling and the rear lid.
case_depth  = max(zk_h, pi_h + 6) + wall + 12; // ≈ 50

screen_tile_x   = 8;
screen_tile_w   = 95;
reader_tile_x   = screen_tile_x + screen_tile_w + 6;
reader_tile_w   = 130;

io_strip_h = 14;

screen_centre_x = screen_tile_x + screen_tile_w / 2;
screen_centre_y = io_strip_h + (inner_h - io_strip_h) / 2;
reader_centre_x = reader_tile_x + reader_tile_w / 2;
reader_centre_y = io_strip_h + (inner_h - io_strip_h) / 2;

echo("Case outer (W × H × D):", case_width, "×", case_height, "×", case_depth);

// ─── Helpers ────────────────────────────────────────────────────────────────

module rounded_box(size, r) {
  hull() {
    for (x = [r, size.x - r]) for (y = [r, size.y - r]) {
      translate([x, y, 0]) cylinder(h = size.z, r = r);
    }
  }
}

module pi_standoffs(h = 4) {
  for (p = pi_hole_pattern) {
    translate([p.x, p.y, 0])
      difference() {
        cylinder(h = h, d = 6);
        translate([0, 0, -0.1]) cylinder(h = h + 0.2, d = 2.3);
      }
  }
}

module fan_mount() {
  difference() {
    translate([-fan_size/2 - 2, -fan_size/2 - 2, 0])
      cube([fan_size + 4, fan_size + 4, wall]);
    translate([0, 0, -0.1]) cylinder(h = wall + 0.2, d = fan_blade_dia);
    for (sx = [-1, 1]) for (sy = [-1, 1]) {
      translate([sx * fan_hole_spacing/2, sy * fan_hole_spacing/2, -0.1])
        cylinder(h = wall + 0.2, d = fan_hole_dia);
    }
  }
  // Spokes so fingers can't reach the blades
  for (a = [0, 60, 120]) rotate([0, 0, a])
    translate([-fan_blade_dia/2, -0.75, 0])
      cube([fan_blade_dia, 1.5, wall]);
}

// ─── Front-face cutouts ─────────────────────────────────────────────────────

module screen_window() {
  translate([screen_centre_x - scr_visible_w/2, screen_centre_y - scr_visible_h/2, -0.1])
    cube([scr_visible_w, scr_visible_h, wall + 0.2]);
}

module screen_pcb_recess() {
  recess_depth = 1.4;
  translate([screen_centre_x - scr_w/2 - 1,
             screen_centre_y - scr_d/2 - 1,
             wall - recess_depth])
    cube([scr_w + 2, scr_d + 2, recess_depth + 0.1]);
}

// ZK9500 cutout — full housing pocket through the front face.  A smaller
// USB puck reader (LIVE-20R-class) can be mounted on a 3D-printed adapter
// plate that fills the unused portion of this opening.
module reader_cutout() {
  translate([reader_centre_x - zk_w/2, reader_centre_y - zk_d/2, -0.1])
    cube([zk_w, zk_d, zk_h + 0.2]);
}

module brand_strip() {
  translate([case_width / 2 - 22, 4, wall - 0.6])
    linear_extrude(height = 0.7)
      text("OnClock", size = 6, font = "Liberation Sans:style=Bold", halign = "left");
  // 3 mm status LED light pipe to the right of the brand
  translate([case_width / 2 + 32, 6, -0.1])
    cylinder(h = wall + 0.2, d = 3.2);
}

// ─── Pi I/O cutouts ─────────────────────────────────────────────────────────
//
// Where the Pi sits inside the case:
//   - Pi PCB lies flat at the back of the case
//   - Pi's long edge (USB-A × 4 + LAN) faces -Y → exits the bottom wall
//   - Pi's short edge (USB-C + HDMI + audio) faces -X → only USB-C exits
//     the left wall (HDMI/audio stay inside)
pi_origin_x = wall + 3;
pi_origin_y = wall + 1;
pi_z_back   = case_depth - wall - pi_h - 4;

// One INDIVIDUAL hole per stacked port: top and bottom sockets of each
// USB block get their own rectangular cutout, separated by a thin plastic
// divider web — matches the look of the aluminum-case Pi.
module pi_io_bottom_cutouts() {
  // Centre Z of the USB/LAN row
  block_z_centre = pi_z_back + pi_h/2;

  // LAN — single hole on the left
  translate([pi_origin_x + io_lan_x_off, -0.1, block_z_centre - io_lan_h/2])
    cube([io_lan_w, wall + 0.2, io_lan_h]);

  // USB 3.0 stacked pair — two separate holes
  usb3_centre_x = pi_origin_x + io_usb3_x_off + io_usb_block_w/2;
  for (sign = [-1, 1]) {
    z_centre = block_z_centre + sign * (usb_port_h/2 + usb_pair_gap/2);
    translate([usb3_centre_x - usb_port_w/2, -0.1, z_centre - usb_port_h/2])
      cube([usb_port_w, wall + 0.2, usb_port_h]);
  }

  // USB 2.0 stacked pair — two separate holes
  usb2_centre_x = pi_origin_x + io_usb2_x_off + io_usb_block_w/2;
  for (sign = [-1, 1]) {
    z_centre = block_z_centre + sign * (usb_port_h/2 + usb_pair_gap/2);
    translate([usb2_centre_x - usb_port_w/2, -0.1, z_centre - usb_port_h/2])
      cube([usb_port_w, wall + 0.2, usb_port_h]);
  }
}

// LEFT-WALL passthroughs — matches a stock Pi 4 case face plate:
//   USB-C power  →  micro-HDMI 0  →  micro-HDMI 1  →  3.5 mm audio
// All on the Pi's short edge facing -X.
//
// Y offsets (from PCB origin) per the Pi 4 mechanical spec:
//   USB-C centre   ≈  11.5 mm
//   microHDMI 0 cn ≈  26.0 mm
//   microHDMI 1 cn ≈  39.0 mm
//   audio jack cn  ≈  53.5 mm
//
// Z is the height above the PCB; we centre cutouts around the connector
// body's actual Z position relative to the PCB surface.
module pi_left_wall_cutouts() {
  // Vertical centre of the connector row (matches PCB top + connector body)
  row_z = pi_z_back + 5;

  // USB-C  (9 × 4 mm aperture)
  translate([-0.1, pi_origin_y + 11.5 - 5.5, row_z - 2.2])
    cube([wall + 0.2, 11, 5.4]);

  // micro-HDMI 0  (8 × 4 mm aperture)
  translate([-0.1, pi_origin_y + 26 - 5, row_z - 2.2])
    cube([wall + 0.2, 10, 5.4]);

  // micro-HDMI 1
  translate([-0.1, pi_origin_y + 39 - 5, row_z - 2.2])
    cube([wall + 0.2, 10, 5.4]);

  // 3.5 mm audio jack (round)  Ø 7 mm
  translate([-0.1, pi_origin_y + 53.5, row_z + 1])
    rotate([0, 90, 0]) cylinder(h = wall + 0.2, d = 7);
}

// ─── Cooling vents ──────────────────────────────────────────────────────────

module side_intake_vents() {
  vent_w = 2;
  vent_h = 14;
  spacing = 6;
  count = 6;
  for (i = [0:count - 1]) {
    y = io_strip_h + 6 + i * spacing;
    translate([case_width - wall - 0.1, y, case_depth - zk_h - vent_h - 4])
      cube([wall + 0.2, vent_w, vent_h]);
  }
}

module top_fan_grille() {
  slots = 14;
  slot_w = 2.5;
  slot_d = 30;
  span = case_width - 30;
  step = span / (slots - 1);
  for (i = [0:slots - 1]) {
    translate([15 + i * step, case_height - 8, -0.1])
      cube([slot_w, slot_d, wall + 0.2]);
  }
}

// ─── Parts ──────────────────────────────────────────────────────────────────

module body() {
  difference() {
    rounded_box([case_width, case_height, case_depth], case_radius);

    // Hollow interior (preserve front face)
    translate([wall, wall, wall])
      cube([case_width - 2*wall, case_height - 2*wall, case_depth - wall + 0.1]);

    // Front face
    screen_window();
    screen_pcb_recess();
    reader_cutout();
    brand_strip();

    // I/O
    pi_io_bottom_cutouts();
    pi_left_wall_cutouts();

    // Vents
    side_intake_vents();
    top_fan_grille();
  }

  // ── Interior positive features ──

  // Pi standoffs at the back
  translate([pi_origin_x, pi_origin_y, pi_z_back])
    pi_standoffs();

  // Strain-relief web between each USB pair (held inside the wall thickness)
  block_z_centre = pi_z_back + pi_h/2;
  for (xc = [
        pi_origin_x + io_usb3_x_off + io_usb_block_w/2,
        pi_origin_x + io_usb2_x_off + io_usb_block_w/2,
       ]) {
    translate([xc - 1.4, 0, block_z_centre - usb_pair_gap/2])
      cube([2.8, wall, usb_pair_gap]);
  }

  // Fan mount sits ABOVE the Pi (on the left side of the case), exhausting
  // upward through the top vent grille. Centred over the Pi's footprint.
  fan_x = pi_origin_x + (pi_w - (fan_size + 4)) / 2;
  fan_y = pi_origin_y + pi_d + 4;          // just above the Pi
  fan_z = case_depth - wall - fan_thickness - 1;
  translate([fan_x + (fan_size + 4)/2, fan_y + (fan_size + 4)/2, fan_z])
    fan_mount();

  // Screen retention pegs
  for (sx = [-1, scr_w + 1]) for (sy = [-1, scr_d + 1]) {
    translate([screen_centre_x - scr_w/2 + sx, screen_centre_y - scr_d/2 + sy, wall])
      cylinder(h = scr_h + 0.5, d = 2.4);
  }

  // Rear snap-fit lip
  lip_h  = 3;
  lip_in = 1.4;
  translate([wall + 0.4, wall + 0.4, case_depth - lip_h - 0.2])
    difference() {
      cube([case_width - 2*wall - 0.8, case_height - 2*wall - 0.8, lip_h]);
      translate([lip_in, lip_in, -0.1])
        cube([case_width - 2*wall - 0.8 - 2*lip_in,
              case_height - 2*wall - 0.8 - 2*lip_in,
              lip_h + 0.2]);
    }
}

module lid() {
  difference() {
    rounded_box([case_width - 0.3, case_height - 0.3, wall], case_radius - 0.6);
    // Wall-mount keyhole slots
    for (sx = [0.3, 0.7]) {
      x = sx * case_width;
      y_top = case_height - 14;
      translate([x, y_top, -0.1]) cylinder(h = wall + 0.2, d = 9);
      translate([x - 2.5, y_top - 10, -0.1]) cube([5, 10, wall + 0.2]);
      translate([x, y_top - 10, -0.1]) cylinder(h = wall + 0.2, d = 5);
    }
    // Stand mounting holes
    for (sx = [10, case_width - 10]) for (sy = [10, case_height - 10]) {
      translate([sx, sy, -0.1]) cylinder(h = wall + 0.2, d = 3.2);
    }
  }
  // Snap clips
  clip_w = 8;
  for (sx = [0.25, 0.75]) {
    x = sx * case_width - clip_w/2;
    translate([x, case_height - wall - 4, wall - 0.01])
      cube([clip_w, 2, 4]);
  }
}

module bezel() {
  bw = scr_w + 8;
  bh = scr_d + 8;
  difference() {
    rounded_box([bw, bh, 1.6], 2);
    translate([(bw - scr_visible_w)/2, (bh - scr_visible_h)/2, -0.1])
      cube([scr_visible_w, scr_visible_h, 2]);
  }
}

// Adapter plate: lets a smaller USB puck fingerprint reader mount inside the
// ZK9500-sized cutout (useful when not using the ZK9500 itself).
module reader_adapter_plate(puck_w = 70, puck_d = 40, puck_sensor_w = 22, puck_sensor_h = 22) {
  difference() {
    translate([0, 0, 0]) cube([zk_w, zk_d, 2]);
    // Hole for the puck body to drop through
    translate([(zk_w - puck_w)/2, (zk_d - puck_d)/2, -0.1])
      cube([puck_w, puck_d, 2.2]);
  }
  // Retention lip around the puck
  difference() {
    translate([(zk_w - puck_w)/2 - 1, (zk_d - puck_d)/2 - 1, 2])
      cube([puck_w + 2, puck_d + 2, 2]);
    translate([(zk_w - puck_w)/2, (zk_d - puck_d)/2, 1.9])
      cube([puck_w, puck_d, 2.2]);
  }
}

module stand() {
  sw = case_width - 20;
  sh = 70;
  sd = 40;
  difference() {
    hull() {
      translate([0, 0, 0]) cube([sw, sh, 4]);
      translate([0, sh - 10, 0]) cube([sw, 10, sd]);
    }
    translate([sw/2 - 14, sh - 8, 8])
      cube([28, 12, sd - 16]);
    for (sx = [10, sw - 10]) for (sy = [10, sh - 10]) {
      translate([sx, sy, -0.1]) cylinder(h = 4.2, d = 4.2);
      translate([sx, sy, 1.6]) cylinder(h = 4, d = 7.5);
    }
    for (i = [0:5]) {
      translate([10 + i * (sw - 20)/5, 10, -0.1])
        cube([4, sh - 20, 1.5]);
    }
  }
}

module wallmount() {
  difference() {
    cube([80, 60, 4]);
    for (sx = [12, 68]) for (sy = [12, 48]) {
      translate([sx, sy, -0.1]) cylinder(h = 4.2, d = 4.2);
    }
  }
  for (sx = [20, 60]) {
    translate([sx, 30, 0]) cylinder(h = 8, d = 5);
    translate([sx, 30, 6]) cylinder(h = 2, d = 8);
  }
}

// ─── Render selector ────────────────────────────────────────────────────────

if (part == "assembly") {
  // No internal rotation — model lives in its natural SCAD coordinates:
  //   X = case width  (0 .. 236)
  //   Y = case height (0 .. 127)
  //   Z = case depth  (front face at Z=0, lid at Z=case_depth)
  // The camera (--camera arg) handles the viewing angle.

  // Main body in matte black
  color("#1a1a1a") body();

  // Pi placeholder — green PCB on the LEFT-back of the case
  color("#0c5e2e")
    translate([pi_origin_x, pi_origin_y, pi_z_back])
    cube([pi_w, pi_d, 1.6]);
  // Pi USB+LAN connector stack visible through the bottom cutouts
  color("#101010")
    translate([pi_origin_x, pi_origin_y, pi_z_back + 1.6])
    cube([pi_w, 14, 16]);

  // 3.5" TFT screen — glass on the front face, PCB behind it
  // Bright glow so the screen is visible against the black case
  color("#1d5ec9")
    translate([screen_centre_x - scr_visible_w/2,
               screen_centre_y - scr_visible_h/2,
               -0.6])
    cube([scr_visible_w, scr_visible_h, 0.6]);
  color("#062a4a")
    translate([screen_centre_x - scr_w/2,
               screen_centre_y - scr_d/2,
               wall + 0.1])
    cube([scr_w, scr_d, scr_h]);

  // ZK9500 fingerprint reader — finger-contact surface in the front face plane
  color("#1a1a1a")
    translate([reader_centre_x - zk_w/2,
               reader_centre_y - zk_d/2,
               -0.4])
    cube([zk_w, zk_d, 0.6]);
  // Active sensor area (bright green glow)
  color("#1ec850")
    translate([reader_centre_x - 18, reader_centre_y - 18, -0.8])
    cube([36, 36, 0.6]);
  // Reader's body extending into the case
  color("#0f0f0f")
    translate([reader_centre_x - zk_w/2 + 6,
               reader_centre_y - zk_d/2 + 6,
               0.5])
    cube([zk_w - 12, zk_d - 12, zk_h - 2]);

  // Front bezel trim around the screen
  color("#0a0a0a")
    translate([screen_centre_x - (scr_w + 8)/2,
               screen_centre_y - (scr_d + 8)/2,
               -1.0])
    bezel();
} else if (part == "body") {
  body();
} else if (part == "lid") {
  lid();
} else if (part == "bezel") {
  bezel();
} else if (part == "stand") {
  stand();
} else if (part == "wallmount") {
  wallmount();
} else if (part == "reader_adapter") {
  reader_adapter_plate();
}
