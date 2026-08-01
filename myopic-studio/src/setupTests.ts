// Jest 27's jsdom environment (bundled with react-scripts 5) predates
// structuredClone; sceneStore.setField depends on it, so backfill from v8.
import { serialize, deserialize } from 'v8';

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = ((value: unknown) => deserialize(serialize(value))) as typeof structuredClone;
}

export {};
