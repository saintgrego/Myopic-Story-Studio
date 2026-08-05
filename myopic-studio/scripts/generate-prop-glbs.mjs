// Generates recognisable proxy furniture as .glb files in public/assets/props/.
//
// Why this exists (PRD section 11, v1.3): a single primitive cannot answer a
// blocking question about a room. A sofa, a bed, a desk and a kitchen counter
// are all "a box" at the parser's disposal, so a domestic interior renders as a
// field of indistinguishable boxes and the director has to *remember* which box
// was which instead of *seeing* it. Silhouette is the whole point — these are
// still untextured matte-grey proxies, deliberately crude, and they carry no
// more detail than is needed to tell one piece of furniture from another.
//
// This is the pose-library pattern (v1.2) applied to props: the mesh IS the
// object type. Adding a prop = add a row to PROPS below, re-run this script, add
// a row to src/props.json. No renderer code exists to touch — buildObject()
// already treats glTF as first-class (PRD section 4).
//
// Conventions, all load-bearing:
//   - Base at y = 0. Positions in the scene model are base-anchored, and unlike
//     primitives the renderer does NOT lift a glTF group, so the geometry must
//     already sit on the floor. (Exception: `window`, whose origin is the bottom
//     of its frame, so position.y reads as sill height.)
//   - Front faces +Z, matching the mannequin's nose marker. A sofa's back is at
//     -Z, so a character at +Z is looking at the seat.
//   - Metres. Roughly life-sized against a 1.8 m figure.
//
// Run from myopic-studio/:  node scripts/generate-prop-glbs.mjs

import * as THREE from 'three';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from './lib/glb.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'props');

// FALLBACK COLOUR ONLY (v1.4). The renderer re-materials every library proxy
// from src/palette.ts at load time, cycling the cool-grey ramp by prop index, so
// this value is what you see only if the .glb is opened outside the app. It is
// COOL_GREYS[2], the middle of that ramp — keep them in step.
const MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 0.9, metalness: 0 });

/** Box by CENTRE position. */
function box(w, h, d, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MATERIAL);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  return mesh;
}

/** Cylinder by CENTRE position. */
function cyl(radiusTop, radiusBottom, h, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, 16), MATERIAL);
  mesh.position.set(x, y, z);
  return mesh;
}

function sphere(r, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), MATERIAL);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Four legs at the corners of a w × d footprint, inset by `inset`. */
function legs(w, d, h, r, inset = 0.06) {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(cyl(r, r, h, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)));
    }
  }
  return out;
}

// Each builder returns an array of meshes. Widths chosen so the pieces sit
// plausibly beside a 1.8 m mannequin.
const PROPS = {
  // Seat slab + back + arms + a cushion split: the arms are what stop this
  // reading as a bench.
  sofa: () => [
    box(2.0, 0.35, 0.9, 0, 0.175, 0),
    box(2.0, 0.5, 0.18, 0, 0.6, -0.36),
    box(0.18, 0.55, 0.9, -0.91, 0.275, 0),
    box(0.18, 0.55, 0.9, 0.91, 0.275, 0),
    box(0.86, 0.14, 0.78, -0.47, 0.42, 0.02),
    box(0.86, 0.14, 0.78, 0.47, 0.42, 0.02),
  ],

  // Arms sit ON the seat slab rather than flush with it, and the back is taller
  // and thinner than the sofa's. Without that step the silhouette collapses into
  // the same anonymous box as `counter` — which is the exact failure this whole
  // library exists to fix, so it is worth the extra two parts.
  armchair: () => [
    box(0.9, 0.3, 0.85, 0, 0.15, 0),
    box(0.9, 0.62, 0.14, 0, 0.61, -0.355),
    box(0.13, 0.26, 0.85, -0.385, 0.43, 0),
    box(0.13, 0.26, 0.85, 0.385, 0.43, 0),
    box(0.62, 0.13, 0.72, 0, 0.365, 0.03),
  ],

  // Round-legged: reads as dining rather than desk, which has panel sides.
  'dining-table': () => [box(1.6, 0.06, 0.9, 0, 0.72, 0), ...legs(1.6, 0.9, 0.69, 0.04)],

  'dining-chair': () => [
    box(0.45, 0.06, 0.45, 0, 0.45, 0),
    box(0.42, 0.5, 0.05, 0, 0.72, -0.2),
    ...legs(0.45, 0.45, 0.42, 0.025, 0.04),
  ],

  // Headboard at -Z, pillows tucked under it: gives the bed an unambiguous head.
  bed: () => [
    box(1.5, 0.3, 2.0, 0, 0.15, 0),
    box(1.5, 0.22, 2.0, 0, 0.41, 0),
    box(1.56, 0.6, 0.08, 0, 0.6, -1.04),
    box(0.6, 0.12, 0.35, -0.37, 0.58, -0.75),
    box(0.6, 0.12, 0.35, 0.37, 0.58, -0.75),
  ],

  // Panel sides + modesty board — the silhouette difference from dining-table.
  desk: () => [
    box(1.4, 0.05, 0.7, 0, 0.75, 0),
    box(0.05, 0.73, 0.7, -0.675, 0.365, 0),
    box(0.05, 0.73, 0.7, 0.675, 0.365, 0),
    box(1.3, 0.35, 0.04, 0, 0.55, -0.32),
  ],

  // Column + star base is the thing that says "office" at a glance.
  'office-chair': () => {
    const parts = [
      box(0.5, 0.08, 0.5, 0, 0.46, 0),
      box(0.45, 0.55, 0.06, 0, 0.78, -0.22),
      cyl(0.05, 0.05, 0.42, 0, 0.21, 0),
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spoke = box(0.30, 0.04, 0.06, 0, 0.03, 0);
      spoke.position.set(Math.sin(a) * 0.15, 0.03, Math.cos(a) * 0.15);
      spoke.rotation.y = a;
      parts.push(spoke);
    }
    return parts;
  },

  bookshelf: () => [
    box(0.04, 1.8, 0.3, -0.38, 0.9, 0),
    box(0.04, 1.8, 0.3, 0.38, 0.9, 0),
    box(0.8, 0.04, 0.3, 0, 1.78, 0),
    box(0.8, 0.04, 0.3, 0, 0.02, 0),
    box(0.72, 0.03, 0.3, 0, 0.45, 0),
    box(0.72, 0.03, 0.3, 0, 0.9, 0),
    box(0.72, 0.03, 0.3, 0, 1.35, 0),
    box(0.8, 1.8, 0.02, 0, 0.9, -0.15),
  ],

  // Overhanging worktop + proud cupboard fronts.
  counter: () => [
    box(2.0, 0.82, 0.6, 0, 0.45, 0),
    box(2.1, 0.06, 0.68, 0, 0.89, 0),
    box(1.9, 0.1, 0.5, 0, 0.05, 0),
    box(0.9, 0.68, 0.03, -0.49, 0.5, 0.31),
    box(0.9, 0.68, 0.03, 0.49, 0.5, 0.31),
  ],

  // Frame + leaf + knob. Leaf sits inside the jambs, knob on the +Z face.
  door: () => [
    box(0.08, 2.05, 0.12, -0.46, 1.025, 0),
    box(0.08, 2.05, 0.12, 0.46, 1.025, 0),
    box(1.0, 0.08, 0.12, 0, 2.09, 0),
    box(0.84, 2.0, 0.045, 0, 1.0, 0),
    sphere(0.04, 0.33, 1.0, 0.05),
  ],

  // NOTE: origin is the bottom of the frame, not the floor — set position.y to
  // the sill height (≈0.9 for a domestic window).
  window: () => [
    box(1.3, 0.06, 0.14, 0, 0.03, 0),
    box(1.3, 0.06, 0.14, 0, 1.37, 0),
    box(0.06, 1.4, 0.12, -0.62, 0.7, 0),
    box(0.06, 1.4, 0.12, 0.62, 0.7, 0),
    box(0.05, 1.28, 0.06, 0, 0.7, 0),
    box(1.2, 0.05, 0.06, 0, 0.7, 0),
  ],

  'floor-lamp': () => [
    cyl(0.18, 0.18, 0.03, 0, 0.015, 0),
    cyl(0.025, 0.025, 1.4, 0, 0.73, 0),
    cyl(0.14, 0.22, 0.3, 0, 1.58, 0),
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, build] of Object.entries(PROPS)) {
  const root = new THREE.Group();
  root.name = name;
  for (const part of build()) root.add(part);
  await writeGlb(root, join(OUT_DIR, `${name}.glb`));
}
