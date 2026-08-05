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
