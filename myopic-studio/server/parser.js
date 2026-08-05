const { randomUUID } = require('crypto');

// Single source of truth for the pose library — the properties panel reads the
// same file. A pose is a mesh, not a field (PRD section 11, v1.2).
const POSES = require('../src/poses.json');

// Single source of truth for the prop proxy library — the properties panel reads
// the same file. Same pattern as poses (PRD section 11, v1.3): the mesh IS the
// object type, so a sofa is /assets/props/sofa.glb, not a box with a label.
const PROPS = require('../src/props.json');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

const POSE_LIST = POSES.map((p) => `  - "${p.path}" — ${p.hint}`).join('\n');
const PROP_LIST = PROPS.map(
  (p) => `  - "${p.path}" — ${p.hint} (approx ${p.footprint.join(' × ')} m W×H×D)`,
).join('\n');

const SYSTEM_PROMPT = `You are a scene parser for a 3D storyboarding tool called Myopic! 3-D Studio.

Your job is to read a director's scene description and extract all scene components into a structured JSON object.

## Output format

Return ONLY valid JSON — no markdown, no explanation, no code fences. The JSON must conform exactly to this schema:

{
  "title": string,                        // short scene title you infer (e.g. "Server Room — Night")
  "environment": {
    "locationName": string | "[?]",       // e.g. "Abandoned warehouse, exterior"
    "setting": "Interior"|"Exterior"|"[?]", // INT./EXT. in slugline terms; infer from context (rooms/buildings → Interior, landscapes/streets/hills → Exterior)
    "timeOfDay": "Dawn"|"Morning"|"Midday"|"Dusk"|"Night"|"[?]",
    "weather": string | "[?]"             // e.g. "overcast", "clear", "rain"
  },
  "lighting": {
    "scheme": "Natural"|"Studio"|"Dramatic"|"Practical"|"[?]",
    "keyLightAzimuth": number | "[?]",    // degrees 0–360
    "keyLightElevation": number | "[?]",  // degrees 0–90
    "keyLightColor": string | "[?]",      // hex color e.g. "#FFD580"
    "fillIntensity": number | "[?]",      // 0.0–1.0
    "rimLight": boolean,
    "rimIntensity": number | "[?]",       // 0.0–1.0
    "shadowSoftness": number | "[?]",     // 0.0–1.0
    "moodPreset": "Noir"|"Golden Hour"|"Overcast"|"Neon Night"|"High Key"|"Neutral"|"[?]"
  },
  "camera": {
    "shotType": "ECU"|"CU"|"MCU"|"MS"|"MLS"|"LS"|"ELS"|"[?]",
    "angle": "Eye Level"|"Low"|"High"|"Dutch"|"Bird's Eye"|"Worm's Eye"|"[?]",
    "focalLength": number | "[?]",        // mm, prefer common values: 18/35/50/85/135/200
    "depthOfField": number | "[?]",       // f-stop equivalent e.g. 2.8
    "focusSubjectId": string | null,      // character id if focus is explicit
    "position": { "x": number | "[?]", "y": number | "[?]", "z": number | "[?]" },
    "movement": "Static"|"Pan"|"Tilt"|"Dolly"|"Crane"|"Handheld"|"[?]",
    "aspectRatio": "16:9"|"2.39:1"|"4:3"|"1:1"|"[?]"
  },
  "characters": [
    {
      "id": string,                        // short slug e.g. "char_01"
      "figureName": string | "[?]",        // plain descriptive label, e.g. "the technician"
      "position": { "x": number | "[?]", "y": number | "[?]", "z": number | "[?]" },
      "rotation": { "x": 0, "y": number, "z": 0 },
      "scale": 1.0,
      "visible": true,
      "mesh": { "kind": "primitive", "shape": "capsule", "dimensions": [0.4, 1.8] },
      "poseNote": "[?]"                    // ONLY when a described posture had no matching pose — omit otherwise
    }
  ],
  "props": [
    {
      "id": string,                        // short slug e.g. "prop_01"
      "propName": string | "[?]",
      "position": { "x": number | "[?]", "y": number | "[?]", "z": number | "[?]" },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "visible": true,
      "mesh": { "kind": "gltf", "path": <prop library path> }   // preferred — see prop mesh rules
                                                                 // or { "kind": "primitive", "shape": "box|sphere|cylinder|cone|capsule", "dimensions": [number, ...] }
    }
  ],
  "storyboardNotes": string               // any extra story/tone context worth preserving
}

## Rules

- Use "[?]" for any parameter you cannot confidently extract or infer from the prompt.
- Infer reasonable defaults for lighting/camera when the mood is clear, even if not explicit (e.g. "tense close-up" → CU, high contrast Dramatic lighting).
- Assign character IDs as "char_01", "char_02", etc. and prop IDs as "prop_01", "prop_02", etc.
- For positions: place at plausible XYZ coordinates in scene units (1 unit ≈ 1 metre). The scene origin is centre-stage. Camera is typically at z = 3–5. For characters and props, "y" is where the object's base touches the floor (0 = ground level) — NOT its geometric center. A standing character has y=0; a prop resting on the floor has y=0 regardless of its height.
- Prop mesh, FIRST CHOICE: if the prop is one of the library proxies below, emit {"kind":"gltf","path": <prop path>}. These are recognisable proxy shapes and are strongly preferred over primitives, because a box cannot be told apart from another box in the viewport:
${PROP_LIST}
- Library proxies are already life-sized. When you use one, leave "scale" at {"x":1,"y":1,"z":1} — do NOT scale it to the footprint above, and do NOT copy those dimensions anywhere. Adjust scale only when the prompt explicitly calls for an unusual size ("a vast banquet table").
- Library proxies face +Z, the same direction a character faces. Use "rotation.y" to turn them (a sofa against the -X wall needs rotation.y ≈ 90).
- Prop mesh, FALLBACK: only when NO library proxy fits (a crate, a rock, a server rack, a corpse), emit "kind": "primitive" and choose whichever shape best approximates the silhouette, with plausible dimensions in metres. Never invent a glTF path that is not in the list above.
- Character posture: when the description states or strongly implies a posture, emit the character's mesh as {"kind":"gltf","path": <pose path>} using exactly one of these pose meshes:
${POSE_LIST}
  ("hunches over a terminal" → crouching; "seated by the window" → sitting; "stands at the door" → standing.)
- When NO posture is stated or implied, the character mesh defaults to the neutral capsule: {"kind":"primitive","shape":"capsule","dimensions":[0.4,1.8]} (radius, height in metres). Absence of posture is normal — do NOT flag it, do NOT guess standing.
- When a posture IS described but none of the pose meshes fits (lying down, climbing, a handstand), pick the closest pose mesh AND add "poseNote": "[?]" to that character so the mismatch is flagged for review. Never add "poseNote" in any other case.
- rotation defaults to {"x":0,"y":0,"z":0} unless a facing direction is explicit or strongly implied by the prompt.
- Return an empty array if no characters or props are present.
- Do NOT include a "flaggedParams" field — the application computes that itself from your "[?]" values.
- Do NOT wrap output in markdown or code fences.`;

function collectFlaggedPaths(obj, path = '') {
  if (obj === '[?]') return [path];
  if (Array.isArray(obj)) {
    return obj.flatMap((item, i) => collectFlaggedPaths(item, `${path}[${i}]`));
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([key, val]) =>
      collectFlaggedPaths(val, path ? `${path}.${key}` : key)
    );
  }
  return [];
}

async function parsePromptToScene(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server (copy myopic-studio/.env.example to .env and fill it in)');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.stop_reason === 'max_tokens') {
    throw new Error('Parser response was truncated (max_tokens) — try a shorter prompt');
  }

  // claude-sonnet-5 runs adaptive thinking by default, so content[] may lead
  // with thinking blocks — select the text block by type, never by index.
  const textBlock = data.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error(`Parser returned no text output (stop_reason: ${data.stop_reason})`);
  }

  // Defensive: strip markdown code fences if the model ignores the no-fences rule.
  const rawJson = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(`Parser returned invalid JSON:\n${rawJson}`);
  }

  // Collect flags BEFORE stripping poseNote: an unmatched posture surfaces as
  // "characters[i].poseNote" in flaggedParams, but the field itself never
  // reaches the scene model or the .myo envelope (pose is a mesh, not a field).
  const flaggedParams = collectFlaggedPaths(parsed);
  for (const char of parsed.characters ?? []) delete char.poseNote;

  const scene = {
    sceneId: randomUUID(),
    title: parsed.title ?? 'Untitled Scene',
    created: new Date().toISOString(),
    prompt,
    environment: parsed.environment,
    lighting: parsed.lighting,
    camera: parsed.camera,
    characters: parsed.characters ?? [],
    props: parsed.props ?? [],
    storyboardNotes: parsed.storyboardNotes ?? '',
    flaggedParams,
  };

  return { scene, rawJson };
}

module.exports = { parsePromptToScene, collectFlaggedPaths };
