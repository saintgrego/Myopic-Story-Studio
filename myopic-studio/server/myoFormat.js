// Maps between the app's in-memory camelCase SceneFile shape and the on-disk
// `.myo` envelope, whose top-level keys follow PRD spec section 7.1 literally
// (scene_id, storyboard_notes, flagged_params). Nested content is left as-is —
// section 7.1 doesn't specify nested casing, and the rest of the app already
// speaks camelCase throughout.

function toMyoEnvelope(scene) {
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
    storyboard_notes: scene.storyboardNotes,
    flagged_params: scene.flaggedParams,
  };
}

function fromMyoEnvelope(envelope) {
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
    storyboardNotes: envelope.storyboard_notes,
    flaggedParams: envelope.flagged_params,
  };
}

module.exports = { toMyoEnvelope, fromMyoEnvelope };
