// Maps between the app's in-memory camelCase SceneFile shape and the on-disk
// `.myo` envelope, whose top-level keys follow PRD spec section 7.1 literally
// (scene_id, storyboard_notes, flagged_params). Nested content is left as-is —
// section 7.1 doesn't specify nested casing, and the rest of the app already
// speaks camelCase throughout.

// PRD §11 v1.9. The CommonJS half of the set-piece defaults; src/lib/sets.ts holds
// the TypeScript half for the store. Duplicated rather than shared because server/ is
// CommonJS and src/ is TS — the same split poses.json already lives with.
const SET_VISIBILITY_KEYS = ['walls', 'floors', 'ceilings', 'doors', 'windows'];

function withSetDefaults(source) {
  const incoming = (source && source.setVisibility) || {};
  const setVisibility = {};
  for (const key of SET_VISIBILITY_KEYS) {
    setVisibility[key] = typeof incoming[key] === 'boolean' ? incoming[key] : true;
  }
  return {
    sets: Array.isArray(source && source.sets) ? source.sets : [],
    setVisibility,
  };
}

function toMyoEnvelope(scene) {
  const defaults = withSetDefaults(scene);
  return {
    scene_id: scene.sceneId,
    title: scene.title,
    created: scene.created,
    prompt: scene.prompt,
    environment: scene.environment,
    lighting: scene.lighting,
    camera: scene.camera,
    characters: scene.characters,
    props: scene.props,
    sets: defaults.sets,
    set_visibility: defaults.setVisibility,
    storyboard_notes: scene.storyboardNotes,
    flagged_params: scene.flaggedParams,
  };
}

function fromMyoEnvelope(envelope) {
  // Every .myo written before v1.9 lacks both keys; they default here rather than in a
  // migration, so files on disk are never rewritten behind the user's back.
  const defaults = withSetDefaults({
    sets: envelope.sets,
    setVisibility: envelope.set_visibility,
  });
  return {
    sceneId: envelope.scene_id,
    title: envelope.title,
    created: envelope.created,
    prompt: envelope.prompt,
    environment: envelope.environment,
    lighting: envelope.lighting,
    camera: envelope.camera,
    characters: envelope.characters,
    props: envelope.props,
    sets: defaults.sets,
    setVisibility: defaults.setVisibility,
    storyboardNotes: envelope.storyboard_notes,
    flaggedParams: envelope.flagged_params,
  };
}

module.exports = { toMyoEnvelope, fromMyoEnvelope, withSetDefaults };
