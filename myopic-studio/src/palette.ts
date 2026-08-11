/**
 * The proxy palette (PRD §11, v1.4).
 *
 * Two ramps of five values. **Warm greys are people, cool greys are everything
 * else** — the one distinction a director needs to make instantly, carried by
 * hue so it survives even where two objects share a value. Within a ramp the
 * five values cycle by index, so adjacent objects differ and the same scene
 * always renders the same way twice.
 *
 * These are still greys: saturation is 10–13%, far below anything that reads as
 * a colour choice. The palette answers "which one is that", not "does this look
 * good" — see the blocking/finishing test in PRD §11.
 *
 * Value ranges are deliberately offset (warm 0.60–0.88 L, cool 0.42–0.74 L) so
 * figures sit lighter than set dressing on average, against the 0x1f1f23 ground
 * plane. They overlap at the edges on purpose: a lone dark figure against a pale
 * counter is a real shot, not a bug.
 */

/** People. Warm, hue ≈ 28°. */
export const WARM_GREYS = [0xa7988b, 0xb7aa9f, 0xc6bcb3, 0xd5cec8, 0xe5e0dc] as const;

/** Props, set dressing, everything that is not a person. Cool, hue ≈ 214°. */
export const COOL_GREYS = [0x646e7b, 0x77828f, 0x8d97a3, 0xa3abb5, 0xb9bfc7] as const;

/** Value used for the primitive fallback when nothing else applies. */
export const NEUTRAL_GREY = 0x8d97a3;

function cycle(ramp: readonly number[], index: number): number {
  // Guard against a negative or non-integer index reaching the modulo.
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return ramp[i % ramp.length];
}

/**
 * Set-piece surfaces (PRD §11 v1.9). Walls, floors and ceilings are emphatically
 * *not people*, so they draw from the cool ramp — the same rule v1.5 set for props.
 *
 * Unlike characters and props, a set piece is not coloured by its index: a room's
 * four walls are one surface and must read as one value, however many pieces it
 * took to build them. `materialRef` is that surface, and the ramp position is the
 * only thing it selects — this is still "which one is that", not a material system.
 * Nothing here is a texture, a finish, or a PBR parameter; the out-list in §11 is
 * untouched.
 */
export const SET_MATERIALS: readonly { ref: string; step: number }[] = [
  { ref: 'brick', step: 0 },
  { ref: 'concrete', step: 1 },
  { ref: 'wood', step: 2 },
  { ref: 'glass', step: 3 },
  { ref: 'plaster', step: 4 },
];

/** What a newly placed piece gets, and what the panel labels as the default surface. */
export const DEFAULT_SET_MATERIAL_REF = 'plaster';

/**
 * Cool grey for a set piece's surface. An unknown ref lands on the neutral value
 * rather than throwing or hashing to something arbitrary — a hand-edited `.myo`
 * naming a surface we don't have should still render, and visibly as a surface.
 */
export function setPieceColor(materialRef: string): number {
  const key = typeof materialRef === 'string' ? materialRef.trim().toLowerCase() : '';
  const entry = SET_MATERIALS.find((m) => m.ref === key);
  return entry ? COOL_GREYS[entry.step] : NEUTRAL_GREY;
}

/** Warm grey for the nth character in the scene. */
export function characterColor(index: number): number {
  return cycle(WARM_GREYS, index);
}

/** Cool grey for the nth prop in the scene. */
export function propColor(index: number): number {
  return cycle(COOL_GREYS, index);
}
