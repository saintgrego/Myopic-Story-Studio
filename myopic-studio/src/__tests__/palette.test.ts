import { COOL_GREYS, WARM_GREYS, characterColor, propColor } from '../palette';

// PRD §11 v1.4: warm greys are people, cool greys are everything else, five
// values each, cycling by index. These tests pin the properties the palette is
// *for* — separation and determinism — not the specific hex values, which are a
// taste call and may be retuned.
function rgb(hex: number) {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

/** Rec. 601 luma — good enough to compare two greys by value. */
function luma(hex: number) {
  const { r, g, b } = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Saturation as a fraction, in HSL terms. */
function saturation(hex: number) {
  const { r, g, b } = rgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

describe('proxy palette', () => {
  test('each ramp has five distinct values', () => {
    expect(WARM_GREYS).toHaveLength(5);
    expect(COOL_GREYS).toHaveLength(5);
    expect(new Set([...WARM_GREYS, ...COOL_GREYS]).size).toBe(10);
  });

  test('each ramp climbs monotonically in value', () => {
    for (const ramp of [WARM_GREYS, COOL_GREYS]) {
      const lumas = ramp.map(luma);
      for (let i = 1; i < lumas.length; i++) {
        expect(lumas[i]).toBeGreaterThan(lumas[i - 1]);
      }
      // Enough spread that neighbouring steps are actually tellable apart.
      expect(lumas[4] - lumas[0]).toBeGreaterThan(45);
    }
  });

  test('warm greys are warm and cool greys are cool', () => {
    // Warm = red channel leads blue; cool = blue leads red. This is the whole
    // people/not-people distinction, so it is worth asserting directly.
    for (const hex of WARM_GREYS) {
      const { r, b } = rgb(hex);
      expect(r).toBeGreaterThan(b);
    }
    for (const hex of COOL_GREYS) {
      const { r, b } = rgb(hex);
      expect(b).toBeGreaterThan(r);
    }
  });

  test('everything stays a grey, not a colour', () => {
    for (const hex of [...WARM_GREYS, ...COOL_GREYS]) {
      expect(saturation(hex)).toBeLessThan(0.2);
    }
  });

  test('indices cycle through the ramp and are deterministic', () => {
    expect(characterColor(0)).toBe(WARM_GREYS[0]);
    expect(characterColor(4)).toBe(WARM_GREYS[4]);
    expect(characterColor(5)).toBe(WARM_GREYS[0]);
    expect(characterColor(12)).toBe(WARM_GREYS[2]);
    expect(propColor(0)).toBe(COOL_GREYS[0]);
    expect(propColor(7)).toBe(COOL_GREYS[2]);
    expect(characterColor(3)).toBe(characterColor(3));
  });

  test('adjacent objects never share a value', () => {
    for (let i = 0; i < 9; i++) {
      expect(characterColor(i)).not.toBe(characterColor(i + 1));
      expect(propColor(i)).not.toBe(propColor(i + 1));
    }
  });

  test('a nonsense index degrades to the first value rather than undefined', () => {
    expect(characterColor(-1)).toBe(WARM_GREYS[1]);
    expect(propColor(NaN)).toBe(COOL_GREYS[0]);
    expect(propColor(2.7)).toBe(COOL_GREYS[2]);
  });
});
