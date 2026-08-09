// FALLBACK PLACEHOLDER GENERATOR (PRD §11 v1.7 authorized item 5). The pose library is
// now built from an authored CC0 base mesh by scripts/blender/build-pose-glbs.py
// (`npm run build:poses`); running THIS script overwrites those figures with primitive
// mannequins. Kept, not deleted, because it needs no Blender and no 48 MB download — it
// is the way to get a usable pose library on a machine that has neither.
//
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

// glTF carries no shadow flags, so these are dropped at export and the viewport's loader
// traverse is what actually applies them at runtime. Set anyway to match the convention
// every other bit of pose geometry is rendered under, and so an in-process preview of
// this scene (the contact-sheet harness) shadows the same way the app does.
function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A capsule with two different end radii, as a lathe: hemispherical caps joined by a
// straight taper. This is what makes a limb read as a limb — a uniform capsule has the
// same silhouette at the shoulder and the wrist, which is the single biggest thing that
// made the old mannequin look like plumbing.
function roundedCone(rBottom, rTop, length, name, segments = 16) {
  const h = length + rBottom + rTop;
  const yBottom = -h / 2 + rBottom;
  const yTop = h / 2 - rTop;
  const points = [];
  const CAP_STEPS = 5;
  for (let i = 0; i <= CAP_STEPS; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / CAP_STEPS);
    points.push(new THREE.Vector2(rBottom * Math.cos(a), yBottom + rBottom * Math.sin(a)));
  }
  // The lathe interpolates straight between consecutive profile points, so the two cap
  // rims are all the taper needs.
  for (let i = 0; i <= CAP_STEPS; i++) {
    const a = (Math.PI / 2) * (i / CAP_STEPS);
    points.push(new THREE.Vector2(rTop * Math.cos(a), yTop + rTop * Math.sin(a)));
  }
  const mesh = shadowed(new THREE.Mesh(new THREE.LatheGeometry(points, segments), BODY));
  mesh.name = name;
  return { mesh, h };
}

// A box that tapers along its length: a 4-sided cylinder is a square prism, turned 45°
// so its flats face the axes. Used for the jaw and the toe block.
function taperedBox(wTop, wBottom, height, name) {
  const mesh = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(wTop * 0.707, wBottom * 0.707, height, 4), BODY),
  );
  mesh.rotation.y = Math.PI / 4;
  mesh.name = name;
  return mesh;
}

// All pivots follow the same convention: a group sits at the joint, its limb hangs below
// it (mesh offset -h/2), so rotating the group bends at the joint.
// Figure faces +Z (the nose shows it); base of the feet at y = 0.
// `name` rides on the mesh, not the group: glTF export keeps mesh node names (minus any
// punctuation) and that is what makes an exported pose inspectable part-by-part.
//
// `rProximal` is the radius at the joint end (top), `rDistal` the far end. Segment TOTAL
// height is length + rProximal + rDistal — identical to the capsule formula it replaced,
// which is what keeps the POSES table's hipY values valid without re-eyeballing them.
function limb(rProximal, rDistal, length, name) {
  const { mesh, h } = roundedCone(rDistal, rProximal, length, name);
  const group = new THREE.Group();
  mesh.position.y = -h / 2;
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
// The cranium as a lathe profile [radius, y] rather than a sphere: broad at the temples,
// tapering to a jaw and a chin. A sphere cannot have a jawline — the first attempt hung a
// tapered box under a sphere and the sphere simply swallowed it, because a jaw box narrow
// enough to look like a jaw is entirely inside a head-sized ball. The taper has to be in
// the head's own silhouette.
const SKULL_PROFILE = [
  [0.0, -0.113],
  [0.031, -0.105],
  [0.053, -0.09],
  [0.071, -0.068],
  [0.083, -0.038],
  [0.09, 0.0],
  [0.092, 0.035],
  [0.087, 0.069],
  [0.071, 0.097],
  [0.04, 0.113],
  [0.0, 0.119],
];

function buildHead() {
  const head = new THREE.Group();
  head.name = 'head';

  // z-scaled: a head is deeper front-to-back than it is wide, and a lathe alone is round.
  const skull = shadowed(
    new THREE.Mesh(
      new THREE.LatheGeometry(SKULL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 20),
      BODY,
    ),
  );
  skull.scale.set(1, 1, 1.14);
  skull.name = 'skull';
  head.add(skull);

  // Jawline slabs: the lathe's jaw is round, and a jaw has a corner. These give the angle
  // of the jaw an edge for the key to break across.
  for (const side of [-1, 1]) {
    const jaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.055, 0.046), BODY));
    jaw.position.set(side * 0.047, -0.058, 0.032);
    jaw.rotation.set(0.1, side * -0.28, side * 0.22);
    jaw.name = side < 0 ? 'jawL' : 'jawR';
    head.add(jaw);
  }

  const chin = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.028, 0.032), BODY));
  chin.position.set(0, -0.088, 0.046);
  chin.rotation.x = -0.2;
  chin.name = 'chin';
  head.add(chin);

  // Brow ridge: shallow slab across the eye line, front edge angled down toward the nose.
  const brow = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.02, 0.034), BODY));
  brow.position.set(0, 0.032, 0.094);
  brow.rotation.x = 0.32;
  brow.name = 'brow';
  head.add(brow);

  // Nose: cone stub along +Z (cones point +Y, so the extra rotation past a quarter turn
  // is what droops the tip). Sits where the old box nose marker did.
  const nose = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.085, 8), BODY));
  nose.position.set(0, -0.01, 0.099);
  nose.rotation.x = Math.PI / 2 + 0.18;
  nose.name = 'nose';
  head.add(nose);

  // Cheekbones: thin facets mirrored either side of the nose, each turned to face
  // up/out/forward so a moving key sweeps across them at a different rate than the skull.
  for (const side of [-1, 1]) {
    const cheek = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.038), BODY));
    cheek.position.set(side * 0.045, -0.018, 0.086);
    cheek.rotation.set(0.28, side * -0.35, side * -0.4);
    cheek.name = side < 0 ? 'cheekL' : 'cheekR';
    head.add(cheek);
  }

  return head;
}

// Torso silhouette as [radius, y] pairs, hips at y=0 up to the shoulder shelf at 0.65 —
// the same extent the capsule spanned. Waist pinches in, chest broadens.
const TORSO_PROFILE = [
  [0.0, 0.0],
  [0.078, 0.014],
  [0.118, 0.046],
  [0.134, 0.095],
  [0.135, 0.145],
  [0.121, 0.245],
  [0.132, 0.315],
  [0.152, 0.425],
  [0.158, 0.5],
  [0.149, 0.565],
  [0.113, 0.615],
  [0.058, 0.644],
  [0.0, 0.652],
];

// pose: rotations in radians. hipY sets pelvis height (bend knees to keep feet grounded).
function buildFigure(pose) {
  const root = new THREE.Group();
  root.name = 'mannequin';

  // Whole-figure orientation, for poses that aren't upright (lying). The lift that
  // puts the rotated figure back on the floor is derived at the end of this
  // function, not carried in the pose table.
  root.rotation.x = pose.rootRotX ?? 0;

  const hips = new THREE.Group();
  hips.position.y = pose.hipY;
  root.add(hips);

  // Torso pivots at the hips so a hunch bends from the waist.
  const torsoGroup = new THREE.Group();
  torsoGroup.rotation.x = pose.torsoBend ?? 0;
  hips.add(torsoGroup);

  // Torso as a lathe profile rather than a capsule: pelvis, narrowed waist, broadened
  // chest, shoulder shelf. Same extent as the capsule it replaces (y 0 → 0.65, hips at
  // its base), so nothing hung off the torso needed re-placing. The z-squash makes the
  // section elliptical — a body is wider than it is deep, and a lathe alone is circular.
  const torso = shadowed(
    new THREE.Mesh(new THREE.LatheGeometry(TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 20), BODY),
  );
  torso.name = 'torso';
  torso.scale.set(1, 1, 0.78);
  torsoGroup.add(torso);

  // Neck column. The head sphere used to sit straight on the torso capsule and sink 4cm
  // into it; with the torso tapering to a narrow shelf there has to be something between.
  const neckColumn = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.066, 0.2, 14), BODY));
  neckColumn.name = 'neck';
  neckColumn.position.set(0, 0.685, 0.004);
  neckColumn.scale.set(1, 1, 0.92);
  torsoGroup.add(neckColumn);

  for (const side of [-1, 1]) {
    // Deltoid caps sit on the torso, not on the arm group: they stay put when the arm
    // swings, which is what makes the shoulder read as a shoulder instead of a ball joint.
    const deltoid = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.077, 14, 10), BODY));
    deltoid.name = side < 0 ? 'deltoidL' : 'deltoidR';
    deltoid.position.set(side * 0.185, 0.552, 0);
    deltoid.scale.set(1, 0.92, 0.85);
    torsoGroup.add(deltoid);

    const clavicle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.022, 0.032), BODY));
    clavicle.name = side < 0 ? 'clavicleL' : 'clavicleR';
    clavicle.position.set(side * 0.055, 0.586, 0.038);
    clavicle.rotation.set(0.08, side * 0.2, side * -0.11);
    torsoGroup.add(clavicle);
  }

  // Neck joint: same pivot convention as the limbs. Its rotation is the ONLY head tilt —
  // buildHead() is orientation-free, so every pose shares one head geometry.
  const neck = new THREE.Group();
  // Raised from 0.72 once the head gained a chin: at 0.72 the jaw and chin sat *inside*
  // the torso's upper chest (the old sphere head overlapped it by 4cm too, but a ball has
  // no chin to bury). 0.79 puts the chin clear above the collar and brings the figure to
  // ~1.68m standing, which is a better human height than the 1.61m it was.
  neck.position.y = 0.79;
  neck.rotation.x = pose.headTilt ?? 0;
  neck.add(buildHead());
  torsoGroup.add(neck);

  // Limb radii taper proximal → distal. Each pair sums with its length to the same total
  // height the old uniform capsules had (arm 0.28 / 0.25, leg 0.38 / 0.34), so the feet
  // still land at y = 0 for the POSES table's existing hipY values.
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    const upper = limb(0.056, 0.042, 0.182, `upperArm${suffix}`);
    upper.group.position.set(side * 0.2, 0.55, 0);
    upper.group.rotation.x = pose.armForward ?? 0;
    upper.group.rotation.z = side * (pose.armOut ?? 0.08);
    torsoGroup.add(upper.group);

    const lower = limb(0.043, 0.03, 0.177, `foreArm${suffix}`);
    lower.group.position.y = -upper.h;
    lower.group.rotation.x = pose.elbowBend ?? 0;
    upper.group.add(lower.group);

    // Hand: a blocked palm plus a thumb nub, no fingers. Enough to show which way the
    // palm faces at blocking distance; anything more is modelling for its own sake.
    const hand = new THREE.Group();
    hand.position.y = -lower.h;
    lower.group.add(hand);

    const palm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.082, 0.026), BODY));
    palm.name = `hand${suffix}`;
    palm.position.y = -0.041;
    hand.add(palm);

    const thumb = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.042, 0.021), BODY));
    thumb.name = `thumb${suffix}`;
    thumb.position.set(side * -0.032, -0.024, 0.006);
    thumb.rotation.z = side * 0.55;
    hand.add(thumb);

    const thigh = limb(0.088, 0.058, 0.234, `thigh${suffix}`);
    thigh.group.position.set(side * 0.09, 0, 0);
    thigh.group.rotation.x = pose.thighForward ?? 0;
    hips.add(thigh.group);

    const shin = limb(0.06, 0.036, 0.244, `shin${suffix}`);
    shin.group.position.y = -thigh.h;
    shin.group.rotation.x = pose.kneeBend ?? 0;
    thigh.group.add(shin.group);

    // Foot: heel block plus a toe block that tapers forward, both soles flush at the same
    // y the single box sat at, so grounding is unchanged.
    const sole = -shin.h - 0.05;
    const heel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.083, 0.05, 0.075), BODY));
    heel.name = `heel${suffix}`;
    heel.position.set(0, sole + 0.025, -0.012);
    shin.group.add(heel);

    const toe = taperedBox(0.062, 0.08, 0.135, `foot${suffix}`);
    toe.rotation.set(Math.PI / 2, Math.PI / 4, 0); // lay the prism along +Z, flats squared up
    toe.position.set(0, sole + 0.019, 0.09);
    toe.scale.set(1, 1, 0.47);
    shin.group.add(toe);
  }

  // Ground the assembled figure. Positions are base-anchored (position.y is where the
  // object touches the floor), so every pose .glb must bottom out at exactly y = 0.
  // Measure the built figure and translate the root — do NOT hand-tune a lift per pose.
  // The eyeballed values this replaces silently drifted 3–5cm when the body was rebuilt
  // underneath them (feet and leg segments changed; the constants did not), which is the
  // failure mode a derived offset makes impossible.
  const bounds = new THREE.Box3().setFromObject(root);
  root.position.y = -bounds.min.y;

  return root;
}

// hipY sets pelvis height, which is what decides how bent the legs read. It is no longer
// load-bearing for floor contact — buildFigure() grounds the assembled figure — so adjust
// it for the look of the pose and let the grounding pass follow.
const POSES = {
  // Neutral A-pose stand-in for "on their feet".
  standing: { hipY: 0.77 },
  // On an invisible chair: thighs forward-horizontal, shins straight down.
  sitting: { hipY: 0.46, thighForward: -Math.PI / 2, kneeBend: Math.PI / 2, armForward: -0.5, elbowBend: -0.4 },
  // Deep knee bend + waist hunch — "hunches over a terminal".
  crouching: { hipY: 0.5, thighForward: -1.6, kneeBend: 2.0, torsoBend: 0.55, armForward: -1.0, elbowBend: -0.5 },
  // Flat on the back, face up, feet at the origin, head toward -Z: the standing
  // figure rotated at the root. The lift that rests its back on the floor is derived.
  lying: { hipY: 0.77, rootRotX: -Math.PI / 2 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, pose] of Object.entries(POSES)) {
  await writeGlb(buildFigure(pose), join(OUT_DIR, `${name}.glb`));
}
