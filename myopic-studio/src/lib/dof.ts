/**
 * Depth of field as *information*, per PRD §11 v1.3: near/far limits of acceptable
 * focus as numbers, so a director can tell whether their blocking holds focus. It is
 * not a rendered effect — nothing here touches shading, and §11's out-list still bars
 * blur, bokeh, and focus falloff.
 */

/**
 * Circle of confusion for a full-frame (36mm) sensor — the standard 0.03mm. Fixed to
 * match the SENSOR_WIDTH_MM = 36 assumption the viewport's FOV maths already makes.
 * Not a tunable: exposing it would invite a "sharpness" slider, which is a finishing
 * control, not a blocking one.
 */
export const CIRCLE_OF_CONFUSION_MM = 0.03;

/**
 * Fallbacks for flagged ('[?]') inputs. The focal-length value matches what the
 * viewport already renders a flagged lens at. There was no f-stop equivalent — the
 * viewport never read depthOfField at all — so this one is introduced here: f/2.8, a
 * common cinema stop, chosen to sit mid-range rather than to flatter the numbers.
 * A readout computed from either is marked provisional in the UI.
 */
export const FALLBACK_FOCAL_LENGTH_MM = 50;
export const FALLBACK_F_STOP = 2.8;

export interface ResolvedFocusInputs {
  focalLengthMm: number;
  fStop: number;
  /** True when either input was flagged and a fallback stood in for it. */
  provisional: boolean;
}

/**
 * Resolve the two lens inputs, substituting fallbacks for flagged values and
 * reporting whether it had to. Kept here rather than inline in the panel so the
 * provisional decision is unit-testable — the panel itself isn't.
 */
export function resolveFocusInputs(
  focalLength: number | '[?]',
  depthOfField: number | '[?]',
): ResolvedFocusInputs {
  return {
    focalLengthMm: focalLength === '[?]' ? FALLBACK_FOCAL_LENGTH_MM : focalLength,
    fStop: depthOfField === '[?]' ? FALLBACK_F_STOP : depthOfField,
    provisional: focalLength === '[?]' || depthOfField === '[?]',
  };
}

export interface FocusRange {
  /** Nearest distance in acceptable focus, metres. */
  near: number;
  /** Farthest distance in acceptable focus, metres. Infinity at or past hyperfocal. */
  far: number;
  /** far - near, metres. Infinity when far is. */
  total: number;
  /** Hyperfocal distance for this lens/stop, metres. */
  hyperfocal: number;
}

/**
 * Standard depth-of-field geometry. Everything is done in millimetres internally
 * because the lens constants are in millimetres, then returned in scene metres.
 *
 * Returns null for inputs that have no physical meaning (non-positive or non-finite
 * focal length, stop, or distance) rather than emitting a plausible-looking number.
 */
export function focusRange(
  focalLengthMm: number,
  fStop: number,
  subjectDistanceM: number,
): FocusRange | null {
  if (
    !Number.isFinite(focalLengthMm) ||
    !Number.isFinite(fStop) ||
    !Number.isFinite(subjectDistanceM) ||
    focalLengthMm <= 0 ||
    fStop <= 0 ||
    subjectDistanceM <= 0
  ) {
    return null;
  }

  const f = focalLengthMm;
  const s = subjectDistanceM * 1000;
  const hyperfocalMm = (f * f) / (fStop * CIRCLE_OF_CONFUSION_MM) + f;

  const near = (s * (hyperfocalMm - f)) / (hyperfocalMm + s - 2 * f);
  // At or past hyperfocal the far limit runs to infinity — the fact the director
  // needs, and printing a huge number instead would bury it.
  const far = s < hyperfocalMm ? (s * (hyperfocalMm - f)) / (hyperfocalMm - s) : Infinity;

  return {
    near: near / 1000,
    far: far === Infinity ? Infinity : far / 1000,
    total: far === Infinity ? Infinity : (far - near) / 1000,
    hyperfocal: hyperfocalMm / 1000,
  };
}

/** Metres, rendered the way a focus puller reads them: cm under a metre, else 2dp. */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '∞';
  if (metres < 1) return `${Math.round(metres * 100)} cm`;
  return `${metres.toFixed(2)} m`;
}
