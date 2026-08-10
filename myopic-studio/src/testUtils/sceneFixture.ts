import type { SceneFile, SetPiece, SetPieceKind } from '../types/scene';

// A complete, valid SceneFile for tests. Kept outside __tests__/ because CRA's
// Jest treats every file in a __tests__ directory as a test suite.
export function makeScene(overrides: Partial<SceneFile> = {}): SceneFile {
  return {
    sceneId: '00000000-0000-4000-8000-000000000000',
    title: 'Server Room — Night',
    created: '2026-08-01T12:00:00.000Z',
    prompt: 'A technician hunches over a terminal in a dark server room.',
    environment: {
      locationName: 'Server room',
      setting: 'Interior',
      timeOfDay: 'Night',
      weather: '[?]',
    },
    lighting: {
      scheme: 'Practical',
      keyLightAzimuth: 220,
      keyLightElevation: 35,
      keyLightColor: '#88AAFF',
      fillIntensity: 0.2,
      rimLight: true,
      rimIntensity: 0.4,
      shadowSoftness: 0.3,
      moodPreset: 'Noir',
    },
    camera: {
      shotType: 'MCU',
      angle: 'Eye Level',
      focalLength: 35,
      depthOfField: 2.8,
      focusSubjectId: 'char_01',
      position: { x: 0, y: 1.6, z: 4 },
      movement: 'Static',
      aspectRatio: '16:9',
    },
    characters: [
      {
        id: 'char_01',
        figureName: 'the technician',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 180, z: 0 },
        scale: 1,
        visible: true,
        mesh: { kind: 'gltf', path: '/assets/poses/crouching.glb' },
      },
    ],
    props: [
      {
        id: 'prop_01',
        propName: 'server rack',
        position: { x: -1.2, y: 0, z: -0.5 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visible: true,
        mesh: { kind: 'primitive', shape: 'box', dimensions: [0.8, 2, 1] },
      },
    ],
    // PRD §11 v1.9. The fixture is a post-amendment scene; tests that need a
    // pre-v1.9 one delete these two keys explicitly (see sets.test.ts).
    sets: [],
    setVisibility: { walls: true, floors: true, ceilings: true, doors: true, windows: true },
    storyboardNotes: 'Tense, isolated mood.',
    flaggedParams: ['environment.weather'],
    ...overrides,
  };
}

/** One piece per SetPieceKind, so a test can assert across all five categories. */
export function makeSetPieces(): SetPiece[] {
  return [
    piece('wall', { x: 0, y: 0, z: -3 }, { width: 6, height: 2.8, depth: 0.15 }, 'cool-0'),
    piece('floor', { x: 0, y: 0, z: 0 }, { width: 6, height: 0.1, depth: 6 }, 'cool-1'),
    piece('ceiling', { x: 0, y: 2.8, z: 0 }, { width: 6, height: 0.1, depth: 6 }, 'cool-2'),
    { ...piece('door', { x: -1.5, y: 0, z: -3 }, { width: 0.9, height: 2.1, depth: 0.08 }, 'cool-3'), state: 'closed' },
    { ...piece('window', { x: 1.5, y: 1.1, z: -3 }, { width: 1.2, height: 1.2, depth: 0.06 }, 'cool-4'), state: 'open' },
  ];
}

function piece(
  kind: SetPieceKind,
  position: { x: number; y: number; z: number },
  dimensions: { width: number; height: number; depth: number },
  materialRef: string,
): SetPiece {
  return {
    kind,
    transform: { position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    dimensions,
    materialRef,
  };
}
