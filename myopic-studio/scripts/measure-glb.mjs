// Acceptance harness for .glb assets: bounds, grounding, and named-node positions.
//
// The same measurement the pose library's grounding check makes, pointed at arbitrary
// files — which is what an asset pipeline needs before its output is anywhere near
// public/. Reports rather than asserts on purpose: during a pipeline spike the interesting
// question is "where did this land", not pass/fail.
//
// Run from myopic-studio/:
//   node scripts/measure-glb.mjs <file-or-dir> [...]
//   node scripts/measure-glb.mjs --nodes <file>    # also print every named node's position
//
// Conventions being checked (PRD §4, §11): base-anchored (min.y === 0), figures face +Z,
// life-sized in metres.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const showNodes = args.includes('--nodes');
const targets = args.filter((a) => a !== '--nodes');

if (targets.length === 0) {
  console.error('usage: node scripts/measure-glb.mjs [--nodes] <file-or-dir> [...]');
  process.exit(2);
}

const loader = new GLTFLoader();

async function load(file) {
  const buf = readFileSync(file);
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
}

function fmt(n) {
  return n.toFixed(4).padStart(9);
}

async function measure(file, label) {
  const gltf = await load(file);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const grounded = Math.abs(box.min.y) < 0.001;
  console.log(
    `${label.padEnd(22)} y ${fmt(box.min.y)} →${fmt(box.max.y)}   x ${fmt(box.min.x)} →${fmt(box.max.x)}` +
      `   z ${fmt(box.min.z)} →${fmt(box.max.z)}   ${grounded ? 'grounded' : '** NOT GROUNDED **'}`,
  );

  if (showNodes) {
    gltf.scene.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.getWorldPosition(pos);
      console.log(`  ${obj.name.padEnd(18)} at x ${fmt(pos.x)}  y ${fmt(pos.y)}  z ${fmt(pos.z)}`);
    });
  }
}

for (const target of targets) {
  if (statSync(target).isDirectory()) {
    console.log(`\n--- ${target}`);
    for (const f of readdirSync(target).filter((f) => f.endsWith('.glb')).sort()) {
      await measure(join(target, f), f);
    }
  } else {
    await measure(target, target.split('/').pop());
  }
}
