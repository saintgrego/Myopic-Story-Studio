// Generates static posed proxy mannequins as .glb files in public/assets/poses/.
// Poses are baked into the geometry — no rigging, no skeleton. Placing a posed
// figure in a scene is therefore a pure data change (point a character's mesh at
// /assets/poses/<name>.glb), per PRD section 4.
//
// Run from myopic-studio/:  node scripts/generate-pose-glbs.mjs
// Re-run after editing a pose; the app picks up the new file on next scene load.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// GLTFExporter's binary path runs a Blob through FileReader, which Node lacks.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
      this.onload?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = 'data:application/octet-stream;base64,' + Buffer.from(buf).toString('base64');
      this.onloadend?.();
      this.onload?.();
    });
  }
};

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'poses');

const BODY = new THREE.MeshStandardMaterial({ color: 0x6ea8ff, roughness: 0.8 });

// All pivots follow the same convention: a group sits at the joint, its capsule
// hangs below it (mesh offset -h/2), so rotating the group bends at the joint.
// Figure faces +Z (the nose marker shows it); base of the feet at y = 0.
// `name` rides on the mesh, not the group: glTF export keeps mesh node names (minus any
// punctuation) and that is what makes an exported pose inspectable part-by-part.
function limb(radius, length, name) {
  const h = length + 2 * radius; // CapsuleGeometry total height
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length), BODY);
  mesh.position.y = -h / 2;
  mesh.name = name;
  group.add(mesh);
  return { group, h };
}

// Static facial landmarks: brow ridge, nose, cheekbones. Structural geometry only —
// no morphs, no blend shapes, nothing that can articulate at runtime (PRD section 2
// non-goal #7 still bars expressions; this is the same category as the nose marker it
// replaces, just readable enough to show which way a shading plane turns).
//
// Local frame: skull centre at the group origin, face toward +Z (the figure convention).
// Head TILT is deliberately NOT applied here — the caller's neck joint owns it, so the
// same geometry is reused unmodified by every pose.
const SKULL_RADIUS = 0.11;

// glTF carries no shadow flags, so these are dropped at export and the viewport's loader
// traverse is what actually applies them at runtime. Set anyway to match the convention
// every other bit of pose geometry is rendered under, and so an in-process preview of
// this scene (the contact-sheet harness) shadows the same way the app does.
function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildHead() {
  const head = new THREE.Group();
  head.name = 'head';

  const skull = shadowed(new THREE.Mesh(new THREE.SphereGeometry(SKULL_RADIUS, 16, 12), BODY));
  skull.name = 'skull';
  head.add(skull);

  // Brow ridge: shallow slab across the eye line, front edge angled down toward the nose.
  const brow = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.02, 0.034), BODY));
  brow.position.set(0, 0.034, 0.091);
  brow.rotation.x = 0.32;
  brow.name = 'brow';
  head.add(brow);

  // Nose: cone stub along +Z (cones point +Y, so the extra rotation past a quarter turn
  // is what droops the tip). Sits where the old box nose marker did.
  const nose = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.085, 8), BODY));
  nose.position.set(0, -0.008, 0.104);
  nose.rotation.x = Math.PI / 2 + 0.18;
  nose.name = 'nose';
  head.add(nose);

  // Cheekbones: thin facets mirrored either side of the nose, each turned to face
  // up/out/forward so a moving key sweeps across them at a different rate than the skull.
  for (const side of [-1, 1]) {
    const cheek = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.013, 0.04), BODY));
    cheek.position.set(side * 0.044, -0.02, 0.085);
    cheek.rotation.set(0.28, side * -0.35, side * -0.4);
    cheek.name = side < 0 ? 'cheekL' : 'cheekR';
    head.add(cheek);
  }

  return head;
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
  torso.name = 'torso';
  torso.position.y = 0.325; // capsule center: hips at its base
  torsoGroup.add(torso);

  // Neck joint: same pivot convention as the limbs. Its rotation is the ONLY head tilt —
  // buildHead() is orientation-free, so every pose shares one head geometry.
  const neck = new THREE.Group();
  neck.position.y = 0.72;
  neck.rotation.x = pose.headTilt ?? 0;
  neck.add(buildHead());
  torsoGroup.add(neck);

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    const upper = limb(0.05, 0.18, `upperArm${suffix}`);
    upper.group.position.set(side * 0.21, 0.55, 0);
    upper.group.rotation.x = pose.armForward ?? 0;
    upper.group.rotation.z = side * (pose.armOut ?? 0.08);
    torsoGroup.add(upper.group);

    const lower = limb(0.045, 0.16, `foreArm${suffix}`);
    lower.group.position.y = -upper.h;
    lower.group.rotation.x = pose.elbowBend ?? 0;
    upper.group.add(lower.group);

    const thigh = limb(0.07, 0.24, `thigh${suffix}`);
    thigh.group.position.set(side * 0.09, 0, 0);
    thigh.group.rotation.x = pose.thighForward ?? 0;
    hips.add(thigh.group);

    const shin = limb(0.06, 0.22, `shin${suffix}`);
    shin.group.position.y = -thigh.h;
    shin.group.rotation.x = pose.kneeBend ?? 0;
    thigh.group.add(shin.group);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), BODY);
    foot.name = `foot${suffix}`;
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
const exporter = new GLTFExporter();
for (const [name, pose] of Object.entries(POSES)) {
  const scene = new THREE.Scene();
  scene.add(buildFigure(pose));
  await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => {
        const file = join(OUT_DIR, `${name}.glb`);
        writeFileSync(file, Buffer.from(glb));
        console.log(`wrote ${file} (${glb.byteLength} bytes)`);
        resolve();
      },
      reject,
      { binary: true },
    );
  });
}
