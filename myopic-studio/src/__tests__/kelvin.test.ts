import {
  KELVIN_MAX,
  KELVIN_MIN,
  KELVIN_NEUTRAL,
  kelvinToHex,
  kelvinToRgb,
  nearestKelvin,
} from '../lib/kelvin';

describe('kelvinToRgb', () => {
  test('is neutral white at the saturation point', () => {
    expect(kelvinToRgb(KELVIN_NEUTRAL)).toEqual([255, 255, 255]);
    expect(kelvinToHex(KELVIN_NEUTRAL)).toBe('#ffffff');
  });

  test('runs warm below neutral and cool above it', () => {
    const [wr, , wb] = kelvinToRgb(2000);
    expect(wr).toBeGreaterThan(wb); // tungsten: red-dominant

    const [cr, , cb] = kelvinToRgb(10000);
    expect(cb).toBeGreaterThan(cr); // overcast/shade: blue-dominant
  });

  test('warmth decreases monotonically as temperature rises', () => {
    let prevWarmth = Infinity;
    for (let k = KELVIN_MIN; k <= KELVIN_MAX; k += 100) {
      const [r, , b] = kelvinToRgb(k);
      const warmth = r - b;
      expect(warmth).toBeLessThanOrEqual(prevWarmth);
      prevWarmth = warmth;
    }
  });

  test('clamps out-of-range input rather than producing garbage', () => {
    expect(kelvinToRgb(0)).toEqual(kelvinToRgb(KELVIN_MIN));
    expect(kelvinToRgb(99999)).toEqual(kelvinToRgb(KELVIN_MAX));
    for (const c of kelvinToRgb(-500)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  });

  test('always emits a well-formed six-digit hex', () => {
    for (let k = KELVIN_MIN; k <= KELVIN_MAX; k += 250) {
      expect(kelvinToHex(k)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('nearestKelvin', () => {
  test('round-trips a temperature back to itself within the slider step', () => {
    for (const k of [1800, 3200, 5600, 6600, 9000]) {
      expect(Math.abs(nearestKelvin(kelvinToHex(k)) - k)).toBeLessThanOrEqual(100);
    }
  });

  test('falls back to neutral for a malformed or flagged value', () => {
    expect(nearestKelvin('[?]')).toBe(KELVIN_NEUTRAL);
    expect(nearestKelvin('#fff')).toBe(KELVIN_NEUTRAL);
    expect(nearestKelvin('')).toBe(KELVIN_NEUTRAL);
  });

  test('stays inside the slider range for an off-locus colour', () => {
    const k = nearestKelvin('#00ff00');
    expect(k).toBeGreaterThanOrEqual(KELVIN_MIN);
    expect(k).toBeLessThanOrEqual(KELVIN_MAX);
  });
});
