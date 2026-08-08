import type { Flagged } from '../types/scene';

/**
 * Colour-temperature and gel-tint maths for the three lights (PRD §11 v1.6).
 *
 * This lives outside the React component and outside Viewport.tsx on purpose: the
 * panel control and the renderer need the same answer, and anything left inside
 * Viewport.tsx is untestable by construction (no WebGL under jsdom). Same reason
 * `dof.ts` / `framing.ts` exist — see STATE.md, v1.3.
 */

/**
 * Absent or unreadable colour → white. White is cosmetically neutral against a
 * Three.js light's intensity, which is what makes `fillColor` / `rimColor`
 * backward-compatible: a pre-v1.6 `.myo` has neither field and renders exactly as
 * it did before the amendment.
 */
export const DEFAULT_LIGHT_COLOR = '#ffffff';

export const MIN_KELVIN = 1000;
export const MAX_KELVIN = 20000;
/**
 * The neutral starting point for the temperature control. 6600K rather than the
 * conventional 5600K "daylight" because the approximation below lands exactly on
 * #ffffff there — so the control opens agreeing with the field's own default, and
 * touching the gel strength alone can't smuggle in a temperature shift.
 */
export const DEFAULT_KELVIN = 6600;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function channelToHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

/** Returns null rather than a plausible-looking colour when the input is not a hex triplet. */
export function hexToRgb(hex: string): Rgb | null {
  if (!HEX_RE.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * The colour a light should actually be given, for a field that may be absent
 * (pre-v1.6 file), flagged ('[?]'), or hand-edited to something unparseable.
 * The renderer must never be handed one of those, so they all resolve to white.
 */
export function resolveLightColor(value: Flagged<string> | undefined): string {
  if (typeof value !== 'string' || value === '[?]') return DEFAULT_LIGHT_COLOR;
  return HEX_RE.test(value) ? value : DEFAULT_LIGHT_COLOR;
}

/**
 * Blackbody colour temperature → RGB, via the Tanner Helland approximation — the
 * standard curve fit to Mitchell Charity's blackbody table, accurate to a few
 * units per channel across 1000–40000K. Deliberately an approximation: this is a
 * blocking tool, and the question it answers is "is my fill cold against a warm
 * key", not "is this exactly 3200K on a vectorscope".
 *
 * The brightest channel is always 255, so changing temperature re-tints a light
 * without dimming it — intensity stays the intensity field's job.
 */
export function kelvinToRgb(kelvin: number): Rgb {
  const k = Number.isFinite(kelvin) ? clamp(kelvin, MIN_KELVIN, MAX_KELVIN) : DEFAULT_KELVIN;
  const t = k / 100;

  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);

  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * Math.pow(t - 60, -0.0755148492);

  let b: number;
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;

  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
}

export function kelvinToHex(kelvin: number): string {
  return rgbToHex(kelvinToRgb(kelvin));
}

/**
 * A gel is a filter: it multiplies the light passing through it. `strength` is the
 * cut — 0 is no gel at all, 1 is the full sheet — so a half-strength CTB reads as
 * half the shift, the way a director would ask for it.
 *
 * An unreadable gel hex is treated as no gel rather than as an error: the caller is
 * a colour picker, and mid-typing states are normal.
 */
export function applyGel(baseHex: string, gelHex: string, strength: number): string {
  const base = hexToRgb(baseHex);
  if (!base) return DEFAULT_LIGHT_COLOR;
  const gel = hexToRgb(gelHex);
  const amount = Number.isFinite(strength) ? clamp(strength, 0, 1) : 1;
  if (!gel || amount === 0) return rgbToHex(base);

  const mix = (b: number, g: number) => b + (b * (g / 255) - b) * amount;
  return rgbToHex({
    r: mix(base.r, gel.r),
    g: mix(base.g, gel.g),
    b: mix(base.b, gel.b),
  });
}

/** Temperature first, then the gel on top of it — the order light meets them on set. */
export function gelledColor(kelvin: number, gelHex: string, strength: number): string {
  return applyGel(kelvinToHex(kelvin), gelHex, strength);
}

export interface Gel {
  name: string;
  hex: string;
}

/**
 * Colour-effect gels only. Full CTB/CTO are deliberately absent — those are
 * temperature conversions, which the Kelvin control already does properly.
 * Hex values are eyeball approximations of the swatches, not measured transmission
 * curves; §11's test is whether the director can see the tint, not whether it
 * matches a Lee swatch book.
 */
export const NO_GEL: Gel = { name: 'None (clear)', hex: '#ffffff' };

export const GELS: Gel[] = [
  NO_GEL,
  { name: 'Straw', hex: '#ffd9a0' },
  { name: 'Chocolate', hex: '#d9a06b' },
  { name: 'Rose', hex: '#ffb8c8' },
  { name: 'Primary Red', hex: '#e03030' },
  { name: 'Lavender', hex: '#c0b0e0' },
  { name: 'Steel Blue', hex: '#a8c8e8' },
  { name: 'Congo Blue', hex: '#3a2f9e' },
  { name: 'Plusgreen', hex: '#b8e8a0' },
  { name: 'Minusgreen', hex: '#e8b0e0' },
];
