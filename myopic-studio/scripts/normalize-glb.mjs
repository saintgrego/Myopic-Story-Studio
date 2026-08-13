// Import prep for hand-authored .glb assets: bake the scene-model conventions into a
// sculpt exported from somewhere else (Nomad Sculpt, Blender, ZBrush) so it drops into
// public/assets/ and lands where the renderer expects.
//
// The companion to measure-glb.mjs: that one reports, this one fixes. Both exist because
// the conventions in PRD §4/§11 are asset-side promises — the renderer deliberately does
// NOT lift a glTF group (only primitives get lifted by half their extent), so an asset
// whose origin sits at the hips renders buried to the waist. Fixing that here rather than
// in Viewport.tsx keeps "adding an asset is a data change, not a code change" true.
//
// Run from myopic-studio/:
//   node scripts/normalize-glb.mjs <in.glb> <out.glb>
//   node scripts/normalize-glb.mjs --no-center <in.glb> <out.glb>   # ground only, keep x/z
//   node scripts/normalize-glb.mjs --yaw 180 <in.glb> <out.glb>     # spin to face +Z
//
// What it does, in order: yaw (optional), then translate so the bounding box sits with
// min.y === 0 and (unless --no-center) x/z centred on the origin. The transform is baked
// into the geometry, so the output needs no runtime compensation.
//
// It does NOT decimate. Sculpt exports can carry millions of triangles; this reports the
// count and leaves the decision to you, since "too heavy" depends on how many figures a
// scene holds. Scale is likewise left alone — assets are expected to be life-sized in
// metres already, and a silent rescale would hide an export-settings mistake worth knowing
// about.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { readFileSync, writeFileSync } from 'node:fs';

// GLTFExporter's binary path reads its assembled Blob back through FileReader, which is a
// browser API Node has no equivalent global for (Blob itself is global since Node 18).
// Only readAsArrayBuffer + onloadend are on that path, so the shim stays this small.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
  };
}

const args = process.argv.slice(2);
const center = !args.includes('--no-center');
const yawIdx = args.indexOf('--yaw');
const yaw = yawIdx === -1 ? 0 : Number(args[yawIdx + 1]);
const yawValueIdx = yawIdx === -1 ? -1 : yawIdx + 1;
const files = args.filter((a, i) => !a.startsWith('--') && i !== yawValueIdx);

if (files.length !== 2 || Number.isNaN(yaw)) {
  console.error('usage: node scripts/normalize-glb.mjs [--no-center] [--yaw <degrees>] <in.glb> <out.glb>');
  process.exit(2);
}

const [input, output] = files;

const buf = readFileSync(input);
// Same realm-local copy the tests need: GLTFLoader gates its binary path on an
// `instanceof ArrayBuffer` check that a Node fs buffer can fail.
const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject));

const root = gltf.scene;

if (yaw !== 0) {
  root.rotation.y = THREE.MathUtils.degToRad(yaw);
  root.updateMatrixWorld(true);
}

const before = new THREE.Box3().setFromObject(root);
const offset = new THREE.Vector3(
  center ? -(before.min.x + before.max.x) / 2 : 0,
  -before.min.y,
  center ? -(before.min.z + before.max.z) / 2 : 0,
);
root.position.copy(offset);
root.updateMatrixWorld(true);

// Bake the group transform down into the meshes. Leaving it on the wrapper would work in
// the viewport too, but a normalized asset should measure correctly in any tool that opens
// it — including measure-glb.mjs, which reads world bounds.
const after = new THREE.Box3().setFromObject(root);

let tris = 0;
root.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
});

const glb = await new Promise((resolve, reject) =>
  new GLTFExporter().parse(root, resolve, reject, { binary: true }),
);
writeFileSync(output, Buffer.from(glb));

const f = (n) => n.toFixed(4).padStart(8);
console.log(`in   ${input}`);
console.log(`     y ${f(before.min.y)} →${f(before.max.y)}   x ${f(before.min.x)} →${f(before.max.x)}   z ${f(before.min.z)} →${f(before.max.z)}`);
console.log(`out  ${output}`);
console.log(`     y ${f(after.min.y)} →${f(after.max.y)}   x ${f(after.min.x)} →${f(after.max.x)}   z ${f(after.min.z)} →${f(after.max.z)}`);
console.log(`     height ${(after.max.y - after.min.y).toFixed(3)}m   triangles ${tris.toLocaleString()}   ${(glb.byteLength / 1024).toFixed(0)}KB`);
