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
    sets: [],
    setVisibility: { walls: true, floors: true, ceilings: true, doors: true, windows: true },
    storyboardNotes: 'Tense, isolated mood.',
    flaggedParams: ['environment.weather'],
    ...overrides,
  };
}

/** A placed set piece (PRD §11 v1.9), sized like the real thing for its kind. */
export function makeSetPiece(kind: SetPieceKind, overrides: Partial<SetPiece> = {}): SetPiece {
  const dimensions = {
    wall: { width: 4, height: 2.7, depth: 0.15 },
    floor: { width: 6, height: 0.05, depth: 6 },
    ceiling: { width: 6, height: 0.05, depth: 6 },
    door: { width: 0.9, height: 2.05, depth: 0.05 },
    window: { width: 1.2, height: 1.4, depth: 0.05 },
  }[kind];

  return {
    kind,
    transform: {
      position: { x: 0, y: kind === 'ceiling' ? 2.7 : 0, z: -2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    dimensions,
    materialRef: kind === 'window' ? 'glass' : 'plaster',
    ...overrides,
  };
}
