// Shared glTF export plumbing for the proxy generators (poses and props).
//
// GLTFExporter's binary path runs a Blob through FileReader, which Node lacks —
// installing the shim is the only reason this module exists. Both generators
// import it so the workaround lives in exactly one place.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';

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

const exporter = new GLTFExporter();

/** Export a single Object3D to a binary .glb at `file`. */
export function writeGlb(object, file) {
  const scene = new THREE.Scene();
  scene.add(object);
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => {
        writeFileSync(file, Buffer.from(glb));
        console.log(`wrote ${file} (${glb.byteLength} bytes)`);
        resolve();
      },
      reject,
      { binary: true },
    );
  });
}
