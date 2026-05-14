// ─────────────────────────────────────────────────────────────────────────────
// OnClock Biometric Clock-In Terminal — landscape commercial enclosure
//
// Inspired by ZKTeco-style desktop terminals. Landscape orientation with:
//   • 3.5" TFT screen on the LEFT side of the front face
//   • ZK9500 fingerprint reader on the RIGHT side of the front face
//   • Raspberry Pi 4B mounted INSIDE at the lower-back, behind the screen,
//     oriented so:
//        ↳ USB-C power port exits the LEFT side wall of the case
//        ↳ USB-A × 4 + LAN exit the BOTTOM edge of the case
//   • 30 × 30 × 10 mm fan above the Pi, exhausting through top vents
//
//        ┌──────────────────────────────────────────────────┐
//        │                                  ┌──────────────┐│
//   ┌──┐ │ ┌─────────────────────┐         │              ││
//   │PC│ │ │                     │         │   ZK9500     ││
//   │PW│ │ │     3.5" SCREEN     │         │ FINGERPRINT  ││
//   │R │ │ │                     │         │              ││
//   └──┘ │ └─────────────────────┘         │              ││
//        │                                  └──────────────┘│
//        │                                                  │
//        └────────── USB × 4 + LAN ─────────────────────────┘
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

/* [Component dimensions — measured] */
// Raspberry Pi 4B
pi_w  = 85.6;     // long edge (USB-A × 4 + LAN side)
pi_d  = 56.5;     // short edge (USB-C + HDMI side)
pi_h  = 17;       // tallest component above PCB (USB-A connectors)
pi_hole_pattern = [
  [3.5,  3.5],
  [3.5,  52.5],
  [61.5, 3.5],
  [61.5, 52.5],
];

// ZK9500 fingerprint reader (housing)
zk_w = 124.5;
zk_d = 102.0;
zk_h = 34.0;
// Finger contact area is centred on the housing front
zk_contact_w = 36;
zk_contact_h = 36;

// Waveshare 3.5" GPIO LCD (model B compatible)
scr_w        = 85.4;
scr_d        = 55.9;
scr_h        = 10;
scr_visible_w = 73;
scr_visible_h = 49;

// 30 × 30 × 10 mm fan
fan_size      = 30;
fan_thickness = 10;
fan_hole_spacing = 24;
fan_hole_dia  = 3.2;
fan_blade_dia = 27;

/* [Layout & derived sizes] */
// Inner usable area (before walls):
//   Left column:  screen tile  (95 mm wide  × 80 mm tall)
//   Middle gap:   6 mm
//   Right column: reader tile  (130 mm wide × 110 mm tall)
//   Bottom strip: 12 mm tall   (Pi I/O passthrough)
// Inner width  = 95 + 6 + 130 = 231
// Inner height = max(screen tile, reader tile) + bottom strip = 110 + 12 = 122
inner_w = 231;
inner_h = 122;
case_width  = inner_w + 2 * wall;     // ≈ 236
case_height = inner_h + 2 * wall;     // ≈ 127
case_depth  = max(zk_h, pi_h + 4) + wall + 8;  // ≈ 45

// Front-face X coordinates (origin at the inner-bottom-left of the front face)
screen_tile_x   = 8;
screen_tile_w   = 95;
reader_tile_x   = screen_tile_x + screen_tile_w + 6;   // 8 + 95 + 6 = 109
reader_tile_w   = 130;

// Y baseline (bottom Pi-I/O strip)
io_strip_h      = 12;

// Centre coordinates for the two front-face cutouts
screen_centre_x = screen_tile_x + screen_tile_w / 2;
screen_centre_y = io_strip_h + (inner_h - io_strip_h) / 2;
reader_centre_x = reader_tile_x + reader_tile_w / 2;
reader_centre_y = io_strip_h + (inner_h - io_strip_h) / 2;

// Z coordinate: front face is at z=0, interior fills toward z=case_depth
// (the rear lid closes the case at z=case_depth)

echo("Case outer (W × H × D):", case_width, "×", case_height, "×", case_depth);

// ─── Helper modules ─────────────────────────────────────────────────────────

module rounded_box(size, r) {
  hull() {
    for (x = [r, size.x - r]) for (y = [r, size.y - r]) {
      translate([x, y, 0]) cylinder(h = size.z, r = r);
    }
  }
}

// Pi 4 mounting bosses (M2.5 self-tap)
module pi_standoffs(h = 4) {
  for (p = pi_hole_pattern) {
    translate([p.x, p.y, 0])
      difference() {
        cylinder(h = h, d = 6);
        translate([0, 0, -0.1]) cylinder(h = h + 0.2, d = 2.3);
      }
  }
}

// 30 mm fan mount + grille (XY plane, air moves along ±Z)
module fan_mount() {
  difference() {
    translate([-fan_size/2 - 2, -fan_size/2 - 2, 0])
      cube([fan_size + 4, fan_size + 4, wall]);
    // Central opening
    translate([0, 0, -0.1]) cylinder(h = wall + 0.2, d = fan_blade_dia);
    // 4 mounting holes
    for (sx = [-1, 1]) for (sy = [-1, 1]) {
      translate([sx * fan_hole_spacing/2, sy * fan_hole_spacing/2, -0.1])
        cylinder(h = wall + 0.2, d = fan_hole_dia);
    }
  }
  // 3 narrow spokes so the opening keeps fingers out
  for (a = [0, 60, 120]) rotate([0, 0, a])
    translate([-fan_blade_dia/2, -0.75, 0])
      cube([fan_blade_dia, 1.5, wall]);
}

// Screen window (visible area only — full cutout through the front face)
module screen_window() {
  translate([screen_centre_x - scr_visible_w/2, screen_centre_y - scr_visible_h/2, -0.1])
    cube([scr_visible_w, scr_visible_h, wall + 0.2]);
}

// ZK9500 housing cutout (whole housing slots through the front face,
// finger-contact surface lies in the front-face plane)
module reader_cutout() {
  translate([reader_centre_x - zk_w/2, reader_centre_y - zk_d/2, -0.1])
    cube([zk_w, zk_d, zk_h + 0.2]);
}

// Decorative recess around the screen window (flush black PCB)
module screen_pcb_recess() {
  recess_depth = 1.4;
  translate([screen_centre_x - scr_w/2 - 1, screen_centre_y - scr_d/2 - 1, wall - recess_depth])
    cube([scr_w + 2, scr_d + 2, recess_depth + 0.1]);
}

// Pi I/O cutouts on the BOTTOM edge of the case
// Pi orientation (inside the case):
//   - Pi PCB lies flat at the back of the case (z = case_depth - pi_h - wall)
//   - Pi's long edge (USB-A × 4 + LAN) faces -Y (the case bottom)
//   - Pi's short edge (USB-C power + HDMI + audio) faces -X (the case left wall)
// Pi PCB origin inside the case (front-face coordinates X, Y):
pi_origin_x = wall + 3;          // 3 mm clearance from left wall (where USB-C exits)
pi_origin_y = wall + 1;          // sit on the bottom

module pi_io_cutouts() {
  // Slot through the bottom wall for USB-A pair 1, USB-A pair 2, LAN
  // Pi's USB ports are at y = 0 of the PCB, x offsets:
  //   USB 3.0 (blue): centred at pi_origin_x + 21 mm, 17 × 13 mm
  //   USB 2.0 (black): centred at pi_origin_x + 41 mm
  //   LAN: centred at pi_origin_x + 64 mm, 16 × 14 mm
  // We cut one continuous wide slot to simplify printability.
  slot_z_centre = case_depth - pi_h - wall - 4 + 8;
  translate([pi_origin_x - 1, -0.1, slot_z_centre - 8])
    cube([pi_w + 2, wall + 0.2, 15]);

  // Decorative dividers between ports (left in place as plastic webs)
  // (none — keep the slot continuous for simpler printing)
}

module pi_power_cutout() {
  // USB-C on Pi's short edge faces the LEFT wall of the case
  // USB-C body is centred at pi_origin_y + 11.5 mm from PCB origin,
  // at PCB-top-z + ~3 mm. Aperture 9 × 4 mm.
  slot_z = case_depth - pi_h - wall - 4 + 6;
  translate([-0.1, pi_origin_y + 7, slot_z])
    cube([wall + 0.2, 11, 6]);

  // Micro-HDMI × 2 (optional access slots on the left side)
  translate([-0.1, pi_origin_y + 22, slot_z])
    cube([wall + 0.2, 9, 6]);
  translate([-0.1, pi_origin_y + 33, slot_z])
    cube([wall + 0.2, 9, 6]);

  // 3.5 mm audio jack at far end of PCB — leave exposed on left
  translate([-0.1, pi_origin_y + 49, slot_z + 1])
    rotate([0, 90, 0]) cylinder(h = wall + 0.2, d = 7);
}

// Side intake vents — pulled in by the fan
module side_vents() {
  vent_w = 2;
  vent_h = 14;
  spacing = 6;
  count = 6;
  for (i = [0:count - 1]) {
    y = io_strip_h + 6 + i * spacing;
    // Right wall vents (cool air intake)
    translate([case_width - wall - 0.1, y, case_depth - zk_h - vent_h - 4])
      cube([wall + 0.2, vent_w, vent_h]);
  }
}

// Top exhaust grille — fan blows air upward, out the top edge
module top_exhaust_grille() {
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

// Brand text + status LED hole (front face decoration on the bottom strip)
module brand_strip() {
  // OnClock wordmark, debossed by 0.6 mm
  translate([case_width / 2 - 22, 4, wall - 0.6])
    linear_extrude(height = 0.7) text("OnClock", size = 6, font = "Liberation Sans:style=Bold", halign = "left");
  // 3 mm status LED light pipe hole on the right of the brand
  translate([case_width / 2 + 32, 6, -0.1])
    cylinder(h = wall + 0.2, d = 3.2);
}

// ─── Parts ──────────────────────────────────────────────────────────────────

module body() {
  difference() {
    // Outer shell (open back)
    rounded_box([case_width, case_height, case_depth], case_radius);

    // Hollow interior (keep front face wall)
    translate([wall, wall, wall])
      cube([case_width - 2*wall, case_height - 2*wall, case_depth - wall + 0.1]);

    // Screen window (front face)
    screen_window();
    // Screen PCB recess (so the screen sits flush)
    screen_pcb_recess();

    // Fingerprint reader cutout (front face)
    reader_cutout();

    // Pi I/O cutouts (bottom + left walls)
    pi_io_cutouts();
    pi_power_cutout();

    // Vents
    side_vents();
    top_exhaust_grille();

    // Brand strip / status LED on the bottom
    brand_strip();
  }

  // Interior positive features:

  // Pi standoffs at the back, oriented as described above
  pi_z_back = case_depth - wall - pi_h - 4;
  translate([pi_origin_x, pi_origin_y, pi_z_back])
    pi_standoffs();

  // Fan mount: positioned above the Pi, in the middle of the case,
  // blowing air toward the top exhaust
  fan_x = pi_origin_x + pi_w + 6;        // just to the right of Pi
  fan_y = pi_origin_y + 18;
  fan_z = case_depth - wall - fan_thickness - 1;
  translate([fan_x + (fan_size + 4)/2, fan_y + (fan_size + 4)/2, fan_z])
    fan_mount();

  // Screen retention pegs — 4 small posts that the screen PCB slides between
  for (sx = [-1, scr_w + 1]) for (sy = [-1, scr_d + 1]) {
    translate([screen_centre_x - scr_w/2 + sx, screen_centre_y - scr_d/2 + sy, wall])
      cylinder(h = scr_h + 0.5, d = 2.4);
  }

  // Inner snap-fit lip around the rear opening (the lid clips onto this)
  lip_h = 3;
  lip_in = 1.4;
  translate([wall + 0.4, wall + 0.4, case_depth - lip_h - 0.2])
    difference() {
      cube([case_width - 2*wall - 0.8, case_height - 2*wall - 0.8, lip_h]);
      translate([lip_in, lip_in, -0.1])
        cube([case_width - 2*wall - 0.8 - 2*lip_in, case_height - 2*wall - 0.8 - 2*lip_in, lip_h + 0.2]);
    }
}

module lid() {
  difference() {
    rounded_box([case_width - 0.3, case_height - 0.3, wall], case_radius - 0.6);

    // Wall-mount keyhole slots (two)
    for (sx = [0.3, 0.7]) {
      x = sx * case_width;
      y_top = case_height - 14;
      translate([x, y_top, -0.1]) cylinder(h = wall + 0.2, d = 9);
      translate([x - 2.5, y_top - 10, -0.1]) cube([5, 10, wall + 0.2]);
      translate([x, y_top - 10, -0.1]) cylinder(h = wall + 0.2, d = 5);
    }

    // Lid screws into stand (4 corner holes)
    for (sx = [10, case_width - 10]) for (sy = [10, case_height - 10]) {
      translate([sx, sy, -0.1]) cylinder(h = wall + 0.2, d = 3.2);
    }
  }
  // Snap clip that locks into the body's interior lip
  clip_w = 8;
  clip_h = 3;
  for (sx = [0.25, 0.75]) {
    x = sx * case_width - clip_w/2;
    translate([x, case_height - wall - 4, wall - 0.01])
      cube([clip_w, 2, 4]);
  }
}

module bezel() {
  // Thin trim ring that the screen sits behind
  bezel_w = scr_w + 8;
  bezel_h = scr_d + 8;
  difference() {
    rounded_box([bezel_w, bezel_h, 1.6], 2);
    translate([(bezel_w - scr_visible_w)/2, (bezel_h - scr_visible_h)/2, -0.1])
      cube([scr_visible_w, scr_visible_h, 2]);
  }
}

// Desktop tilt stand — sits the terminal at ~15° for comfortable use
module stand() {
  tilt = 15;
  stand_w  = case_width - 20;
  stand_h  = 70;
  stand_d  = 40;

  difference() {
    union() {
      // Wedge-shaped base
      hull() {
        translate([0, 0, 0]) cube([stand_w, stand_h, 4]);
        translate([0, stand_h - 10, 0]) cube([stand_w, 10, stand_d]);
      }
    }
    // Cable pass-through tunnel through the back of the wedge
    translate([stand_w/2 - 14, stand_h - 8, 8])
      cube([28, 12, stand_d - 16]);
    // Mounting holes that line up with the lid corner holes
    for (sx = [10, stand_w - 10]) for (sy = [10, stand_h - 10]) {
      translate([sx, sy, -0.1]) cylinder(h = 4.2, d = 4.2);
      translate([sx, sy, 1.6]) cylinder(h = 4, d = 7.5); // M3 head countersink
    }
    // Cooling vent on the underside
    for (i = [0:5]) {
      translate([10 + i * (stand_w - 20)/5, 10, -0.1])
        cube([4, stand_h - 20, 1.5]);
    }
  }
}

// Alternative wall mount bracket
module wallmount() {
  difference() {
    cube([80, 60, 4]);
    for (sx = [12, 68]) for (sy = [12, 48]) {
      translate([sx, sy, -0.1]) cylinder(h = 4.2, d = 4.2);
    }
  }
  // Hooks that slide into the lid keyholes
  for (sx = [0.3 * case_width / case_width * 80, 0.7 * case_width / case_width * 80]) {
    translate([sx, 30, 0]) cylinder(h = 8, d = 5);
    translate([sx, 30, 6]) cylinder(h = 2, d = 8);
  }
}

// ─── Render selector ────────────────────────────────────────────────────────

if (part == "assembly") {
  body();
  // Lid floating behind the body
  color("lightgray") translate([0, 0, case_depth + 10]) lid();
  // Bezel floating in front of the screen
  color("dimgray")
    translate([screen_centre_x - (scr_w + 8)/2, screen_centre_y - (scr_d + 8)/2, -3])
    bezel();
  // Stand under the body
  color("gray")
    translate([10, -50, 0])
    rotate([90, 0, 0]) stand();
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
}
