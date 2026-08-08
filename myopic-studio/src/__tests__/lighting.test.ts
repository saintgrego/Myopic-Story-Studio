import {
  DEFAULT_KELVIN,
  DEFAULT_LIGHT_COLOR,
  GELS,
  MAX_KELVIN,
  MIN_KELVIN,
  NO_GEL,
  applyGel,
  gelledColor,
  hexToRgb,
  kelvinToHex,
  kelvinToRgb,
  resolveLightColor,
  rgbToHex,
} from '../lib/lighting';
import { makeScene } from '../testUtils/sceneFixture';

const { toMyoEnvelope, fromMyoEnvelope } = require('../../server/myoFormat');

describe('resolveLightColor (PRD §11 v1.6 backward compatibility)', () => {
  test('an absent field — every pre-v1.6 .myo — resolves to white', () => {
    expect(resolveLightColor(undefined)).toBe(DEFAULT_LIGHT_COLOR);
  });

  test('white is the literal the lights used before the amendment', () => {
    // The whole no-migration claim rests on this: substituting resolveLightColor()
    // for the old hardcoded 0xffffff cannot change what an old scene renders.
    expect(parseInt(resolveLightColor(undefined).slice(1), 16)).toBe(0xffffff);
  });

  test('a flagged value resolves to white rather than reaching the renderer', () => {
    expect(resolveLightColor('[?]')).toBe(DEFAULT_LIGHT_COLOR);
  });

  test('an unparseable hand-edit resolves to white', () => {
    expect(resolveLightColor('not a colour')).toBe(DEFAULT_LIGHT_COLOR);
    expect(resolveLightColor('#fff')).toBe(DEFAULT_LIGHT_COLOR);
    expect(resolveLightColor('')).toBe(DEFAULT_LIGHT_COLOR);
  });

  test('a valid hex passes through untouched, either case', () => {
    expect(resolveLightColor('#ffae63')).toBe('#ffae63');
    expect(resolveLightColor('#FFAE63')).toBe('#FFAE63');
  });
});

describe('hex/rgb conversion', () => {
  test('round-trips a colour', () => {
    expect(rgbToHex(hexToRgb('#3a2f9e')!)).toBe('#3a2f9e');
  });

  test('pads single-digit channels', () => {
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
  });

  test('clamps out-of-range channels instead of emitting bad hex', () => {
    expect(rgbToHex({ r: 300, g: -20, b: 128 })).toBe('#ff0080');
  });

  test('returns null for anything that is not a 6-digit hex', () => {
    expect(hexToRgb('#fff')).toBeNull();
    expect(hexToRgb('ffffff')).toBeNull();
    expect(hexToRgb('#gggggg')).toBeNull();
  });
});

describe('kelvinToRgb (blackbody approximation)', () => {
  test('the default temperature is exactly neutral white', () => {
    // Load-bearing: the control opens at DEFAULT_KELVIN, and the field's default is
    // white. If these disagree, touching the gel cut alone shifts colour silently.
    expect(kelvinToHex(DEFAULT_KELVIN)).toBe(DEFAULT_LIGHT_COLOR);
  });

  test('tungsten is warm — red above green above blue', () => {
    const { r, g, b } = kelvinToRgb(3200);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  test('candlelight has no blue at all', () => {
    expect(kelvinToRgb(1800).b).toBe(0);
  });

  test('overcast daylight is cool — blue above red', () => {
    const { r, b } = kelvinToRgb(12000);
    expect(b).toBeGreaterThan(r);
  });

  test('the brightest channel is always 255, so temperature never dims a light', () => {
    for (const k of [1000, 2000, 3200, 5600, 6600, 9000, 15000, 20000]) {
      const { r, g, b } = kelvinToRgb(k);
      expect(Math.round(Math.max(r, g, b))).toBe(255);
    }
  });

  test('clamps to the supported range rather than extrapolating', () => {
    expect(kelvinToHex(-5000)).toBe(kelvinToHex(MIN_KELVIN));
    expect(kelvinToHex(99000)).toBe(kelvinToHex(MAX_KELVIN));
  });

  test('a non-finite temperature falls back to the default', () => {
    expect(kelvinToHex(NaN)).toBe(kelvinToHex(DEFAULT_KELVIN));
    expect(kelvinToHex(Infinity)).toBe(kelvinToHex(DEFAULT_KELVIN));
  });
});

describe('applyGel', () => {
  test('a clear gel is the identity', () => {
    expect(applyGel('#ffae63', NO_GEL.hex, 1)).toBe('#ffae63');
  });

  test('zero cut is the identity, whatever the gel', () => {
    expect(applyGel('#ffae63', '#3a2f9e', 0)).toBe('#ffae63');
  });

  test('full cut multiplies the gel over the base', () => {
    // 0x80 over white = 0x80 exactly (255 * 128/255).
    expect(applyGel('#ffffff', '#808080', 1)).toBe('#808080');
  });

  test('a partial cut lands between no gel and full gel', () => {
    const half = hexToRgb(applyGel('#ffffff', '#808080', 0.5))!;
    expect(half.r).toBeGreaterThan(0x80);
    expect(half.r).toBeLessThan(0xff);
  });

  test('an unreadable gel is treated as no gel, not as an error', () => {
    expect(applyGel('#ffae63', 'mid-typing', 1)).toBe('#ffae63');
  });

  test('an unreadable base falls back to white', () => {
    expect(applyGel('nonsense', '#808080', 1)).toBe(DEFAULT_LIGHT_COLOR);
  });

  test('every shipped gel produces a valid hex at any cut', () => {
    for (const gel of GELS) {
      for (const cut of [0, 0.25, 0.5, 1]) {
        expect(applyGel('#ffffff', gel.hex, cut)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('gelledColor (what the control writes into the field)', () => {
  test('neutral temperature and no gel writes plain white', () => {
    expect(gelledColor(DEFAULT_KELVIN, NO_GEL.hex, 1)).toBe(DEFAULT_LIGHT_COLOR);
  });

  test('temperature applies first, then the gel on top of it', () => {
    const warm = kelvinToHex(3200);
    expect(gelledColor(3200, '#a8c8e8', 1)).toBe(applyGel(warm, '#a8c8e8', 1));
  });

  test('a cool gel on a warm key still reads warmer than the same gel on daylight', () => {
    const onTungsten = hexToRgb(gelledColor(3200, '#a8c8e8', 1))!;
    const onDaylight = hexToRgb(gelledColor(DEFAULT_KELVIN, '#a8c8e8', 1))!;
    expect(onTungsten.r / onTungsten.b).toBeGreaterThan(onDaylight.r / onDaylight.b);
  });
});

describe('fillColor / rimColor on the scene model', () => {
  test('the pre-v1.6 fixture carries neither field', () => {
    const { lighting } = makeScene();
    expect(lighting.fillColor).toBeUndefined();
    expect(lighting.rimColor).toBeUndefined();
  });

  test('a scene without them round-trips through the .myo envelope unchanged', () => {
    const scene = makeScene();
    const restored = fromMyoEnvelope(toMyoEnvelope(scene));
    expect(restored).toEqual(scene);
    expect('fillColor' in restored.lighting).toBe(false);
    expect('rimColor' in restored.lighting).toBe(false);
  });

  test('a scene with them round-trips through the .myo envelope without loss', () => {
    const scene = makeScene();
    scene.lighting.fillColor = '#a8c8e8';
    scene.lighting.rimColor = '#ffd9a0';
    const restored = fromMyoEnvelope(toMyoEnvelope(scene));
    expect(restored.lighting.fillColor).toBe('#a8c8e8');
    expect(restored.lighting.rimColor).toBe('#ffd9a0');
    expect(restored).toEqual(scene);
  });

  test('the envelope keeps them nested under lighting, still camelCase', () => {
    const scene = makeScene();
    scene.lighting.fillColor = '#a8c8e8';
    const envelope = toMyoEnvelope(scene);
    expect(envelope.lighting.fillColor).toBe('#a8c8e8');
    expect(envelope).not.toHaveProperty('fill_color');
  });
});
