import {
  CIRCLE_OF_CONFUSION_MM,
  FALLBACK_F_STOP,
  FALLBACK_FOCAL_LENGTH_MM,
  focusRange,
  formatDistance,
  resolveFocusInputs,
} from '../lib/dof';

describe('focusRange', () => {
  it('computes the classic 85mm f/2 at 3m case', () => {
    const r = focusRange(85, 2, 3)!;
    expect(r.near).toBeCloseTo(2.93, 2);
    expect(r.far).toBeCloseTo(3.07, 2);
    expect(r.total).toBeCloseTo(0.145, 2);
  });

  it('widens when stopping down, lens and distance unchanged', () => {
    const wide = focusRange(85, 2, 3)!;
    const stopped = focusRange(85, 8, 3)!;
    expect(stopped.near).toBeLessThan(wide.near);
    expect(stopped.far).toBeGreaterThan(wide.far);
    expect(stopped.total).toBeCloseTo(0.59, 2);
  });

  it('widens on a shorter lens at the same stop and distance', () => {
    const long = focusRange(85, 8, 3)!;
    const wide = focusRange(35, 8, 3)!;
    expect(wide.total).toBeGreaterThan(long.total);
    expect(wide.near).toBeCloseTo(1.9, 1);
    expect(wide.far).toBeCloseTo(7.16, 1);
  });

  it('reports an infinite far limit at or past hyperfocal', () => {
    const { hyperfocal } = focusRange(35, 8, 3)!;
    const atHyperfocal = focusRange(35, 8, hyperfocal)!;
    expect(atHyperfocal.far).toBe(Infinity);
    expect(atHyperfocal.total).toBe(Infinity);

    const beyond = focusRange(35, 8, hyperfocal * 2)!;
    expect(beyond.far).toBe(Infinity);
  });

  it('keeps a finite far limit just inside hyperfocal', () => {
    const { hyperfocal } = focusRange(35, 8, 3)!;
    const inside = focusRange(35, 8, hyperfocal * 0.9)!;
    expect(Number.isFinite(inside.far)).toBe(true);
    expect(inside.far).toBeGreaterThan(inside.near);
  });

  it('matches the hyperfocal identity H = f^2/(N*c) + f', () => {
    const f = 50;
    const n = 4;
    const expected = (f * f) / (n * CIRCLE_OF_CONFUSION_MM) + f; // millimetres
    expect(focusRange(f, n, 3)!.hyperfocal).toBeCloseTo(expected / 1000, 5);
  });

  it('returns null rather than a plausible-looking number for impossible inputs', () => {
    expect(focusRange(0, 2, 3)).toBeNull();
    expect(focusRange(50, 0, 3)).toBeNull();
    expect(focusRange(50, 2, 0)).toBeNull();
    expect(focusRange(-50, 2, 3)).toBeNull();
    expect(focusRange(NaN, 2, 3)).toBeNull();
    expect(focusRange(50, 2, Infinity)).toBeNull();
  });

  it('brackets the subject distance', () => {
    for (const [f, n, d] of [
      [35, 2, 3],
      [85, 1.4, 1.85],
      [135, 5.6, 12],
    ] as const) {
      const r = focusRange(f, n, d)!;
      expect(r.near).toBeLessThanOrEqual(d);
      expect(r.far).toBeGreaterThanOrEqual(d);
    }
  });

  it('ships fallbacks for flagged inputs that are usable numbers', () => {
    expect(focusRange(FALLBACK_FOCAL_LENGTH_MM, FALLBACK_F_STOP, 3)).not.toBeNull();
  });
});

describe('formatDistance', () => {
  it('reads sub-metre distances in centimetres', () => {
    expect(formatDistance(0.15)).toBe('15 cm');
    expect(formatDistance(0.59)).toBe('59 cm');
    expect(formatDistance(0.004)).toBe('0 cm');
  });

  it('formats the acceptance cases the amendment states', () => {
    expect(formatDistance(focusRange(85, 2, 3)!.total)).toBe('15 cm');
    expect(formatDistance(focusRange(85, 8, 3)!.total)).toBe('59 cm');
    expect(formatDistance(focusRange(35, 8, 3)!.near)).toBe('1.90 m');
    expect(formatDistance(focusRange(35, 8, 3)!.far)).toBe('7.16 m');
  });

  it('reads metre-and-up distances to two decimals', () => {
    expect(formatDistance(3)).toBe('3.00 m');
    expect(formatDistance(7.163)).toBe('7.16 m');
  });

  it('renders an infinite far limit as a symbol, not a number', () => {
    expect(formatDistance(Infinity)).toBe('∞');
  });
});

describe('resolveFocusInputs', () => {
  it('passes real values through and is not provisional', () => {
    expect(resolveFocusInputs(85, 2)).toEqual({
      focalLengthMm: 85,
      fStop: 2,
      provisional: false,
    });
  });

  it('substitutes a fallback for a flagged focal length and says so', () => {
    expect(resolveFocusInputs('[?]', 2)).toEqual({
      focalLengthMm: FALLBACK_FOCAL_LENGTH_MM,
      fStop: 2,
      provisional: true,
    });
  });

  it('substitutes a fallback for a flagged stop and says so', () => {
    expect(resolveFocusInputs(85, '[?]')).toEqual({
      focalLengthMm: 85,
      fStop: FALLBACK_F_STOP,
      provisional: true,
    });
  });

  it('is provisional when both are flagged', () => {
    const r = resolveFocusInputs('[?]', '[?]');
    expect(r.provisional).toBe(true);
    expect(focusRange(r.focalLengthMm, r.fStop, 3)).not.toBeNull();
  });

  it('does not treat a legitimate zero-ish stop as flagged', () => {
    // f/0 is impossible, but it is a *number* — focusRange rejects it, not this.
    expect(resolveFocusInputs(50, 0).provisional).toBe(false);
  });
});
