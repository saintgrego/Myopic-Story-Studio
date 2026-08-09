// Jest 27's jsdom environment (bundled with react-scripts 5) predates
// structuredClone; sceneStore.setField depends on it, so backfill from v8.
import { serialize, deserialize } from 'v8';
import { TextDecoder } from 'util';

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = ((value: unknown) => deserialize(serialize(value))) as typeof structuredClone;
}

// Same generation gap: the jsdom sandbox exposes no TextDecoder, which GLTFLoader
// uses to read the JSON chunk out of a .glb. Node's is a drop-in.
if (typeof globalThis.TextDecoder !== 'function') {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

export {};
