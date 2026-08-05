// Generates static posed proxy mannequins as .glb files in public/assets/poses/.
// Poses are baked into the geometry — no rigging, no skeleton. Placing a posed
// figure in a scene is therefore a pure data change (point a character's mesh at
// /assets/poses/<name>.glb), per PRD section 4.
//
// Run from myopic-studio/:  node scripts/generate-pose-glbs.mjs
// Re-run after editing a pose; the app picks up the new file on next scene load.

import * as THREE from 'three';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from './lib/glb.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'poses');

// FALLBACK COLOUR ONLY (v1.4). The renderer re-materials every library proxy
// from src/palette.ts at load time, cycling the warm-grey ramp by character
// index, so this value is what you see only if the .glb is opened outside the
// app. It is WARM_GREYS[2], the middle of that ramp — keep them in step.
const BODY = new THREE.MeshStandardMaterial({ color: 0xc6bcb3, roughness: 0.8 });

// All pivots follow the same convention: a group sits at the joint, its capsule
// hangs below it (mesh offset -h/2), so rotating the group bends at the joint.
// Figure faces +Z (the nose marker shows it); base of the feet at y = 0.
function limb(radius, length) {
  const h = length + 2 * radius; // CapsuleGeometry total height
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length), BODY);
  mesh.position.y = -h / 2;
  group.add(mesh);
  return { group, h };
}

// pose: rotations in radians. hipY sets pelvis height (bend knees to keep feet grounded).
function buildFigure(pose) {
  const root = new THREE.Group();
  root.name = 'mannequin';

  const hips = new THREE.Group();
  hips.position.y = pose.hipY;
  root.add(hips);

  // Torso pivots at the hips so a hunch bends from the waist.
  const torsoGroup = new THREE.Group();
  torsoGroup.rotation.x = pose.torsoBend ?? 0;
  hips.add(torsoGroup);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.35), BODY);
  torso.position.y = 0.325; // capsule center: hips at its base
  torsoGroup.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), BODY);
  head.position.y = 0.72;
  torsoGroup.add(head);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), BODY);
  nose.position.set(0, 0.72, 0.12); // faces +Z
  torsoGroup.add(nose);

  for (const side of [-1, 1]) {
    const upper = limb(0.05, 0.18);
    upper.group.position.set(side * 0.21, 0.55, 0);
    upper.group.rotation.x = pose.armForward ?? 0;
    upper.group.rotation.z = side * (pose.armOut ?? 0.08);
    torsoGroup.add(upper.group);

    const lower = limb(0.045, 0.16);
    lower.group.position.y = -upper.h;
    lower.group.rotation.x = pose.elbowBend ?? 0;
    upper.group.add(lower.group);

    const thigh = limb(0.07, 0.24);
    thigh.group.position.set(side * 0.09, 0, 0);
    thigh.group.rotation.x = pose.thighForward ?? 0;
    hips.add(thigh.group);

    const shin = limb(0.06, 0.22);
    shin.group.position.y = -thigh.h;
    shin.group.rotation.x = pose.kneeBend ?? 0;
    thigh.group.add(shin.group);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), BODY);
    foot.position.set(0, -shin.h - 0.025, 0.05);
    shin.group.add(foot);
  }

  return root;
}

// hipY values keep feet at y≈0 given the leg segment lengths (thigh 0.38 + shin
// 0.34 + foot). Verified visually in the viewport, not derived — adjust there.
const POSES = {
  // Neutral A-pose stand-in for "on their feet".
  standing: { hipY: 0.77 },
  // On an invisible chair: thighs forward-horizontal, shins straight down.
  sitting: { hipY: 0.46, thighForward: -Math.PI / 2, kneeBend: Math.PI / 2, armForward: -0.5, elbowBend: -0.4 },
  // Deep knee bend + waist hunch — "hunches over a terminal".
  crouching: { hipY: 0.5, thighForward: -1.6, kneeBend: 2.0, torsoBend: 0.55, armForward: -1.0, elbowBend: -0.5 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, pose] of Object.entries(POSES)) {
  await writeGlb(buildFigure(pose), join(OUT_DIR, `${name}.glb`));
}
