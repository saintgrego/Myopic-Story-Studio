/**
 * Colour temperature → RGB (PRD v1.6).
 *
 * Kelvin is an *input*, not a scene field: the lighting panel converts a
 * temperature to a hex value and writes it into the existing key colour field.
 * Nothing downstream knows a Kelvin number ever existed.
 *
 * Tanner Helland's blackbody approximation — the standard curve fit used for
 * this everywhere, accurate enough over 1000–40000K that no one blocking a shot
 * would see the error. Deliberately not a full CIE/Planckian locus computation:
 * the answer feeds a colour swatch, not a colour-managed pipeline.
 */

export const KELVIN_MIN = 1000;
export const KELVIN_MAX = 12000;

/** Neutral white on this curve — 6600K is where all three channels saturate. */
export const KELVIN_NEUTRAL = 6600;

function clamp255(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)));
}

export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, kelvin)) / 100;

  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);

  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * Math.pow(t - 60, -0.0755148492);

  let b: number;
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;

  return [clamp255(r), clamp255(g), clamp255(b)];
}

/**
 * Closest temperature on the curve to an arbitrary hex, so the panel's Kelvin
 * control can be derived from the stored colour rather than held as separate
 * state that can drift out of sync with it. A gel far off the blackbody locus
 * (a deep green, say) still resolves to *some* temperature — the control is
 * honestly reporting "the nearest temperature to this", not round-tripping.
 */
export function nearestKelvin(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return KELVIN_NEUTRAL;
  const n = parseInt(m[1], 16);
  const target = [(n >> 16) & 255, (n >> 8) & 255, n & 255];

  let best = KELVIN_NEUTRAL;
  let bestDist = Infinity;
  for (let k = KELVIN_MIN; k <= KELVIN_MAX; k += 100) {
    const rgb = kelvinToRgb(k);
    const d =
      (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

export function kelvinToHex(kelvin: number): string {
  return (
    '#' +
    kelvinToRgb(kelvin)
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}
