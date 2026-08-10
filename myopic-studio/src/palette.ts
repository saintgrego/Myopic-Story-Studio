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

/** Warm grey for the nth character in the scene. */
export function characterColor(index: number): number {
  return cycle(WARM_GREYS, index);
}

/** Cool grey for the nth prop in the scene. */
export function propColor(index: number): number {
  return cycle(COOL_GREYS, index);
}

/**
 * Set pieces (PRD §11 v1.9 §3) are cool, not warm — they are set dressing, the
 * same side of the warm/cool split as props.
 *
 * The amendment gives `materialRef` no vocabulary, so one is defined here: the
 * five ramp positions by name. Anything else falls back to cycling by the
 * piece's index in `scene.sets`, which keeps adjacent pieces distinguishable
 * without inventing a colour the palette doesn't own. Like every other colour in
 * this file it is render-time only — nothing here reaches the .myo envelope.
 */
export const SET_MATERIAL_REFS = ['cool-0', 'cool-1', 'cool-2', 'cool-3', 'cool-4'] as const;

export function setPieceColor(materialRef: string, index: number): number {
  const named = SET_MATERIAL_REFS.indexOf(materialRef as (typeof SET_MATERIAL_REFS)[number]);
  return named >= 0 ? COOL_GREYS[named] : cycle(COOL_GREYS, index);
}
