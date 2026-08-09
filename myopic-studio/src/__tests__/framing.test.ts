import {
  AIM_FRACTION,
  DEFAULT_AIM,
  NOMINAL_FIGURE_HEIGHT,
  NOMINAL_FIGURE_MID_HEIGHT,
  aimFraction,
  cameraAimPoint,
  cameraPosition,
  hasResolvedFocusSubject,
  subjectDistance,
  verticalHalfExtent,
} from '../lib/framing';
import { makeScene } from '../testUtils/sceneFixture';
import type { Character } from '../types/scene';

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char_01',
    figureName: 'the technician',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    visible: true,
    mesh: { kind: 'primitive', shape: 'capsule', dimensions: [0.4, 1.8] },
    ...overrides,
  };
}

// The fixture's camera is an MCU, so these exercise the tight-shot fraction unless
// they override shotType.
const MCU = AIM_FRACTION.MCU;

describe('cameraAimPoint', () => {
  it('aims at a fraction of a primitive character’s height above its base', () => {
    const scene = makeScene({
      characters: [character({ position: { x: 2, y: 0, z: -10 } })],
      camera: { ...makeScene().camera, focusSubjectId: 'char_01' },
    });
    // Base-anchored: y is floor contact, so the aim rides that far up a 1.8 m capsule.
    expect(cameraAimPoint(scene)).toEqual({ x: 2, y: 1.8 * MCU, z: -10 });
  });

  it('scales the aim height with the character scale', () => {
    const scene = makeScene({
      characters: [character({ scale: 2 })],
      camera: { ...makeScene().camera, focusSubjectId: 'char_01' },
    });
    expect(cameraAimPoint(scene).y).toBeCloseTo(2 * 1.8 * MCU, 6);
  });

  it('adds the aim height to a raised base rather than replacing it', () => {
    const scene = makeScene({
      characters: [character({ position: { x: 0, y: 1.5, z: 0 } })],
      camera: { ...makeScene().camera, focusSubjectId: 'char_01' },
    });
    expect(cameraAimPoint(scene).y).toBeCloseTo(1.5 + 1.8 * MCU, 6);
  });

  it('uses the nominal figure height for a gltf mesh, whose bounds load async', () => {
    const scene = makeScene({
      characters: [character({ mesh: { kind: 'gltf', path: '/assets/poses/sitting.glb' } })],
      camera: { ...makeScene().camera, focusSubjectId: 'char_01' },
    });
    expect(cameraAimPoint(scene).y).toBeCloseTo(NOMINAL_FIGURE_HEIGHT * MCU, 6);
  });

  // The point of the whole change: a tight shot has to aim higher than a wide one, or
  // `lookAt` centres the frame on the hips and the head cannot be framed at all.
  it('aims higher for a tighter shot type', () => {
    const gltf = character({ mesh: { kind: 'gltf', path: '/assets/poses/standing.glb' } });
    const at = (shotType: 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'ELS') =>
      cameraAimPoint(
        makeScene({ characters: [gltf], camera: { ...makeScene().camera, shotType, focusSubjectId: 'char_01' } }),
      ).y;
    const heights = (['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU'] as const).map(at);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(at('ECU')).toBeGreaterThan(1.5); // eye line on a 1.7 m figure
    expect(at('MCU')).toBeGreaterThan(1.4); // chest-up framing is reachable
  });

  // Wide shots were the pre-existing behaviour and must not move: every scene saved
  // before this change was framed against a mid-height aim.
  it('leaves a gltf figure’s wide-shot aim exactly where it was', () => {
    const scene = makeScene({
      characters: [character({ mesh: { kind: 'gltf', path: '/assets/poses/standing.glb' } })],
      camera: { ...makeScene().camera, shotType: 'LS', focusSubjectId: 'char_01' },
    });
    expect(cameraAimPoint(scene).y).toBeCloseTo(NOMINAL_FIGURE_MID_HEIGHT, 6);
  });

  it('falls back to the old mid-height fraction when shot type is flagged', () => {
    const scene = makeScene({
      characters: [character({ mesh: { kind: 'gltf', path: '/assets/poses/standing.glb' } })],
      camera: { ...makeScene().camera, shotType: '[?]', focusSubjectId: 'char_01' },
    });
    expect(aimFraction('[?]')).toBe(aimFraction(undefined));
    expect(cameraAimPoint(scene).y).toBeCloseTo(NOMINAL_FIGURE_MID_HEIGHT, 6);
  });

  it('falls back to centre stage when no focus subject is set', () => {
    const scene = makeScene({ camera: { ...makeScene().camera, focusSubjectId: null } });
    expect(cameraAimPoint(scene)).toEqual(DEFAULT_AIM);
  });

  it('falls back to centre stage for an unknown subject id', () => {
    const scene = makeScene({ camera: { ...makeScene().camera, focusSubjectId: 'char_99' } });
    expect(cameraAimPoint(scene)).toEqual(DEFAULT_AIM);
  });

  it('falls back to centre stage when the subject is hidden', () => {
    const scene = makeScene({
      characters: [character({ visible: false, position: { x: 5, y: 0, z: 5 } })],
      camera: { ...makeScene().camera, focusSubjectId: 'char_01' },
    });
    expect(cameraAimPoint(scene)).toEqual(DEFAULT_AIM);
  });

  it('does not hand back the shared DEFAULT_AIM object', () => {
    const scene = makeScene({ camera: { ...makeScene().camera, focusSubjectId: null } });
    const aim = cameraAimPoint(scene);
    aim.y = 99;
    expect(DEFAULT_AIM.y).toBe(1);
  });

  it('resolves flagged position components to zero', () => {
    const scene = makeScene({
      characters: [character({ position: { x: '[?]', y: '[?]', z: 3 } })],
      camera: { ...makeScene().camera, focusSubjectId: 'char_01' },
    });
    expect(cameraAimPoint(scene)).toEqual({ x: 0, y: 1.8 * MCU, z: 3 });
  });
});

describe('cameraPosition', () => {
  it('substitutes the viewport’s own defaults for flagged components', () => {
    const scene = makeScene({
      camera: { ...makeScene().camera, position: { x: '[?]', y: '[?]', z: '[?]' } },
    });
    expect(cameraPosition(scene)).toEqual({ x: 0, y: 1.6, z: 4 });
  });
});

describe('subjectDistance', () => {
  it('measures camera to aim point in three dimensions', () => {
    const scene = makeScene({
      characters: [character({ position: { x: 0, y: 0, z: 0 } })],
      camera: {
        ...makeScene().camera,
        focusSubjectId: 'char_01',
        position: { x: 0, y: 1.8 * MCU, z: 4 },
      },
    });
    // Same height as the aim point, so the distance is the z offset alone.
    expect(subjectDistance(scene)).toBeCloseTo(4, 6);
  });

  it('includes the height difference', () => {
    const scene = makeScene({
      characters: [character({ position: { x: 0, y: 0, z: 0 } })],
      camera: {
        ...makeScene().camera,
        focusSubjectId: 'char_01',
        position: { x: 0, y: 1.8 * MCU + 3, z: 4 },
      },
    });
    expect(subjectDistance(scene)).toBeCloseTo(5, 6); // 3-4-5
  });
});

describe('hasResolvedFocusSubject', () => {
  it('is true only for a subject that exists and is visible', () => {
    const base = makeScene({ characters: [character()] });
    expect(
      hasResolvedFocusSubject({ ...base, camera: { ...base.camera, focusSubjectId: 'char_01' } }),
    ).toBe(true);
    expect(
      hasResolvedFocusSubject({ ...base, camera: { ...base.camera, focusSubjectId: null } }),
    ).toBe(false);
    expect(
      hasResolvedFocusSubject({ ...base, camera: { ...base.camera, focusSubjectId: 'nope' } }),
    ).toBe(false);
    expect(
      hasResolvedFocusSubject({
        ...base,
        characters: [character({ visible: false })],
        camera: { ...base.camera, focusSubjectId: 'char_01' },
      }),
    ).toBe(false);
  });
});

describe('verticalHalfExtent', () => {
  it('reads the per-shape dimension convention', () => {
    expect(verticalHalfExtent('capsule', [0.4, 1.8])).toBe(0.9);
    expect(verticalHalfExtent('box', [1, 2, 3])).toBe(1);
    expect(verticalHalfExtent('sphere', [0.5])).toBe(0.5);
    expect(verticalHalfExtent('cylinder', [0.5, 0.5, 2])).toBe(1);
    expect(verticalHalfExtent('cone', [0.5, 3])).toBe(1.5);
  });

  it('falls back to capsule defaults for missing dimensions', () => {
    expect(verticalHalfExtent('capsule', [])).toBe(0.9);
  });
});
