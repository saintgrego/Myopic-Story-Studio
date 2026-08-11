# Myopic! 3-D Studio — Build State

Tracks milestone evidence (PRD.md section 8) and rules worth remembering (PRD.md section 10).
Updated after each milestone by the implementing agent.

**Overall: Milestones 1–4 all PASS, including the live LLM parse — nothing outstanding.**
Closed 2026-07-14: with the user's `ANTHROPIC_API_KEY` in `myopic-studio/.env` and account
credits added, the server-room prompt was parsed live through `claude-sonnet-5` (~10s),
saved via the UI, and the resulting `.myo` (`scenes/af4246a5-….myo`) verified against every
Milestone 1 criterion: 1 character ("the technician", capsule, rotated 180° — correctly
facing the terminal for an OTS shot), 4 props (desk, monitor placed exactly on top of the
desk at y=0.8, two server racks), Night interior environment, camera with shot type MS at
2.39:1 focused on char_01, and exactly one honestly-ambiguous flagged param
(`environment.weather`). Full file contents in the session transcript.

---

## Architecture notes (apply across all milestones)

- **Added a local Express backend (`myopic-studio/server/`).** The existing scaffold was a
  pure CRA/React SPA calling the Anthropic API directly from the browser with
  `anthropic-dangerous-direct-browser-calls: true`, which ships the API key in the client
  bundle. PRD stack row "File I/O: Node fs — `.myo` read/write" also requires real filesystem
  access, which a browser SPA cannot do at all. The backend now owns: the Anthropic call
  (`POST /api/parse`) and `.myo` read/write (`GET/POST /api/scenes`, `GET /api/scenes/:file`).
  The React dev server proxies `/api/*` to it (CRA `"proxy"` field), so no CORS setup needed.
  **Why it matters:** if a later milestone needs new server-side capability, extend
  `server/index.js` rather than adding fs/network calls to the browser bundle.

- **Data model rework (`src/types/scene.ts`) per PRD section 5.** Removed all Daz-era fields
  (`dazAssetPath`, `posePreset`, `expression`, `costume`, `materialOverride`, `backgroundAsset`)
  and added the `mesh` reference (`{kind:'primitive', shape, dimensions} | {kind:'gltf', path}`)
  to both `Character` and `Prop`, per the Central Architectural Requirement (PRD section 4).
  Added `rotation` to `Character` (previously position/scale only) to match PRD's field list.
  **Assumption made without stopping to ask** (not a section-3 closed decision, just an
  ambiguity in section 5's wording): kept `figureName` / `propName` as human-readable labels
  even though section 5's terse field list doesn't name them. Rationale: they are not Daz
  fields, not pose/expression/costume, and dropping them would make the Milestone 2 hierarchy
  panel unusable (nothing but `char_01` to distinguish characters). Flag if this is wrong.

- **`.myo` on-disk envelope** matches PRD spec section 7.1 literally at the top level
  (`scene_id`, `title`, `created`, `prompt`, `environment`, `lighting`, `camera`, `characters`,
  `props`, `storyboard_notes`, `flagged_params`). Nested fields stay camelCase (matches the
  pre-existing in-app model; section 7.1 doesn't specify nested casing). Conversion lives in
  `server/myoFormat.js` — only place that needs to know about the on-disk key names.

---

## Milestone 1 — Parse and persist

**Status: PASS, with one external dependency outstanding (see below).**

### What passed

- **Schema.** Rewrote `src/types/scene.ts` per PRD section 5: removed all Daz-era fields,
  added `mesh: MeshRef` to `Character`/`Prop`, added `rotation` to `Character`.
- **Persistence round-trip (Milestone 1, criterion 3).** POSTed a hand-built scene (matching
  the server-room prompt's expected extractions from spec section 4.3 — 1 character, 2 props,
  night interior environment, camera with shot type) to `POST /api/scenes`. Confirmed on disk
  at `myopic-studio/scenes/<id>.myo` with the exact envelope shape from PRD section 7.1
  (`scene_id`, `storyboard_notes`, `flagged_params` at top level). `GET /api/scenes/:file` was
  then diffed byte-for-byte against the original — **identical**. Evidence: file dump + diff
  shown in the session transcript.
- **`flagged_params` surfaced (criterion 2).** `[?]` values collected recursively into
  `flagged_params` on save; UI renders them both as inline `[?]` badges per-field and as a
  bulleted list. Verified visually in-browser after loading the fixture scene through the real
  `GET /api/scenes` → `GET /api/scenes/:file` path (not a mock) — screenshot evidence in
  session.
- **UI renders the new mesh-based schema.** Character/prop cards show a `Mesh` row
  (e.g. `capsule [0.4, 1.8]`, `box [3, 1.8, 0.6]`); old `posePreset`/`expression`/`dazAssetPath`
  fields are gone from both the type model and the UI.
- **Error handling.** With no `ANTHROPIC_API_KEY` configured, clicking "Parse Scene" round-trips
  through the real backend and surfaces `Error: ANTHROPIC_API_KEY is not set on the server...`
  in the UI — no crash, no silent failure. Screenshot evidence in session.

### Live parse — CLOSED (2026-07-14, follow-up session)

Initially untestable (no API key in the environment), then blocked on account credits. Once
both were resolved, the first live parse crashed with `Cannot read properties of undefined
(reading 'trim')` — a real bug in `server/parser.js`: **on `claude-sonnet-5`, adaptive
thinking is ON by default when the request omits the `thinking` parameter, so
`response.content[0]` is a `thinking` block, not text.** The code blindly read
`content[0].text`. Fixed by selecting the text block by type
(`content.find(b => b.type === 'text')`), raising `max_tokens` 2048 → 8192 (thinking spends
from the same budget — 2048 risked truncated JSON), stripping accidental markdown fences,
and erroring clearly on `stop_reason: "max_tokens"` or a missing text block. After the fix:
server-room prompt parsed in ~10s, saved, and the on-disk `.myo` passed every verify
criterion (see Overall section at top). Milestone 1 is now fully closed.

### Rules worth remembering

- **This app needs a local backend, not just a browser SPA.** `.myo` fs access and the
  Anthropic call both live in `myopic-studio/server/` (Express, port 4000). CRA's `"proxy"`
  field forwards `/api/*` there — don't reintroduce direct browser→Anthropic calls.
- **Run both halves with `npm run dev`** (added `concurrently`) from `myopic-studio/`, or
  `npm run server` + `npm start` separately. Backend must be up before the frontend can load
  scenes or parse — the proxy has nothing to forward to otherwise.
- **`ANTHROPIC_API_KEY` lives in `myopic-studio/.env`**, server-side only, never
  `REACT_APP_`-prefixed (that would bundle it into the browser again).
- **Never read `content[0].text` from a Claude API response.** `claude-sonnet-5` runs
  adaptive thinking by default (no `thinking` param needed), so `content[]` can lead with
  thinking blocks before the text block. Always select by type:
  `content.find(b => b.type === 'text')`. Also remember `max_tokens` covers thinking +
  text combined on this model — budget generously (parser uses 8192) or JSON output gets
  truncated mid-string.
- Pre-existing `npm audit` vulnerabilities (~34, from `react-scripts`' old transitive deps)
  are unrelated to this work and were not introduced by it — left alone, since
  `audit fix --force` would risk breaking the CRA toolchain for no PRD-relevant benefit.

---

## Milestone 2 — Panels

**Status: PASS.**

### What passed

- **Zustand store added** (`src/store/sceneStore.ts`) — PRD stack row "State: Zustand" wasn't
  wired to anything before this; the old scaffold held scene state in local `useState`. Now
  `scene`/`selection`/`dirty` live in the store, with a generic `setField(path, value)` immutable
  setter (via `structuredClone` + walk) so every panel field shares one update mechanism instead
  of one-off setters per field.
- **Scene Hierarchy tree** (`src/components/SceneHierarchy.tsx`): Scene → Environment / Lighting
  / Camera → Characters (each) → Props (each), matching spec section 6.2. Clicking any node
  selects it.
- **Properties panel** (`src/components/PropertiesPanel.tsx`): renders the full editable field
  set for whichever node is selected — text/number/select/checkbox/color inputs from a shared
  `src/components/fields.tsx`. Covers every field on every object type, including the mesh
  editor (primitive shape + per-shape dimension fields).
- **Verify criterion, run for real (not mocked):** loaded the Milestone-1 fixture scene through
  the real `GET /api/scenes` → `GET /api/scenes/:file` path, selected Camera, changed Focal
  Length 50 → 85, clicked Save .myo → confirmed `"focalLength": 85` on disk via `grep`, then did
  a **full browser navigation** (fresh JS bundle, empty in-memory store — not a soft reload) and
  re-loaded the same scene from the "Load saved scene…" dropdown. Focal Length read back **85**,
  dirty marker gone. Screenshot + disk grep both captured in session.

### Rules worth remembering

- **The `mcp__Claude_Browser__computer` tool's coordinate/ref-based `left_click` did not
  register clicks on this app's hierarchy buttons** (confirmed: no error, no console warning,
  selection state simply never changed — 3 separate attempts on different buttons). Driving the
  same click via `javascript_tool` (`element.click()` / native value setter + `dispatchEvent`)
  worked immediately and reliably. **When UI verification here doesn't seem to "take," don't
  conclude the app is broken — cross-check with a direct JS-driven click/input before debugging
  app code.** This looks like a tool/page interaction quirk, not a Myopic! bug; worth re-testing
  occasionally in case it's fixed, but don't burn time on it — `javascript_tool` is the reliable
  fallback.
- **Field editing convention:** every editable field goes through `setField(path, value)` with
  a dot-path-as-array (e.g. `['camera', 'focalLength']`, `['characters', idx, 'position', 'x']`).
  New object types added later (e.g. future asset metadata) should follow the same pattern rather
  than inventing per-field setters.
- Mesh shape switches replace the whole `mesh` object at once (new shape's default dimensions),
  rather than trying to preserve stale dimensions from the old shape — avoids mismatched-length
  dimension arrays.

---

## Milestone 3 — Three.js viewport

**Status: PASS.**

### What passed

All four criteria verified visually with real screenshots (not mocked), using the same
fixture scene, via `src/components/Viewport.tsx`:

- **Primitives at XYZ positions.** Capsule (character) and box primitives (props) render on a
  grid floor. Position is **base-anchored** (the value is where the object's bottom touches the
  floor, not its geometric center) — the renderer lifts each mesh internally by half its
  vertical extent so "y=0" always means "standing on the ground," matching how a director
  thinks about blocking. See rule below — this needed deciding and wasn't in the PRD.
- **Focal length drives real FOV.** Verified in actual camera view (not free view): 18mm showed
  a wide, distorted frame with most of the set visible; 135mm showed a tight telephoto frame
  filling with just the character's torso. Uses real lens math — horizontal FOV from focal
  length + a 36mm full-frame-equivalent sensor width, then vertical FOV (what
  `THREE.PerspectiveCamera.fov` actually wants) from horizontal FOV + aspect ratio — so aspect
  ratio and focal length interact correctly together, not just focal length alone.
  - **Screenshot evidence:** 18mm — wide frame, most of set visible, edges visibly distorted.
    135mm — tight frame, filled entirely by the character.
- **Lighting drives real Three.js lights.** Key = `DirectionalLight` positioned via
  azimuth/elevation → cartesian conversion; fill = `AmbientLight`; optional rim = a second
  `DirectionalLight` from the opposite azimuth. Verified: azimuth 15° → 195° (180° flip) visibly
  flipped which side of the capsule/box was lit vs. in shadow — screenshot evidence both ways.
- **Camera-view toggle + letterboxing.** Toggling "View: Camera" swaps the active render camera
  to the scene's own camera and resizes the canvas to fit the shot's aspect ratio inside the
  panel (black bars top/bottom or sides — real letterboxing via canvas resize, not a CSS
  overlay), with an on-screen `50mm · 16:9`-style HUD. "View: Free" gives an orbit camera
  (drag-to-look via `OrbitControls`) that also shows a `CameraHelper` frustum gizmo marking
  where the scene camera is and what it's pointed at.
- Per PRD v1.0's "no photorealistic rendering" non-goal (removed in v1.1 — rendering scope now
  lives in PRD section 11), there was deliberately **no shadow mapping**
  at V1 — `shadowSoftness` was stored but not rendered. Materials are flat `MeshStandardMaterial`
  with no textures. **Superseded post-V1 (2026-07-14): shadow mapping + ground plane added — see
  "Post-V1 — Realistic lighting/environment" section below.**
- Central Architectural Requirement (PRD section 4) implemented in full, not deferred to M4: the
  object-builder switches on `mesh.kind` and already has a working `GLTFLoader` path (with a
  red-wireframe-box fallback + on-screen warning banner if a `.glb` fails to load) — M3 only
  *verifies* primitives, but the glTF half of the renderer already exists so M4 is pure content
  (storyboard UI + testing with a real asset), not new rendering code.

### Rules worth remembering

- **Position is base-anchored, not center-anchored — this was ambiguous after Milestone 1 and
  had to be decided here.** `position.y` for characters/props means "where the object touches
  the floor." The renderer offsets geometry internally to enforce this regardless of shape.
  Updated `server/parser.js`'s system prompt to state this explicitly for future live parses.
  **My own Milestone-1 fixture data was inconsistent about this** (character used base=0, but
  props used center-anchored y values with the box dimensions ALSO duplicated into `scale`,
  double-applying size) — caught and fixed when building the renderer. If a live-parsed scene
  ever looks like props are floating or oddly sized, check for this same mistake (position not
  base-anchored, or scale duplicating dimensions instead of staying at `{1,1,1}`).
- **Do not upgrade `@types/three` or `three` to latest.** Latest `@types/three` (matching latest
  `three`, currently 0.185.x) ships `.d.ts` files for newer TSL/WebGPU node APIs that use syntax
  TypeScript 4.9.5 (this project's pinned version, required by `react-scripts@5.0.1`'s peer
  range `^3.2.1 || ^4`) cannot parse at all — cascades into dozens of unrelated syntax errors.
  Pinned both `three` and `@types/three` to **0.160.0**, which predates that and has everything
  V1 needs (`CapsuleGeometry`, `SRGBColorSpace`, addon paths). Don't bump either package without
  retesting `tsc --noEmit` cleanly first.
- **Import addon modules via `three/examples/jsm/...`, not the newer `three/addons/...` alias.**
  `@types/three@0.160.0` only ships declarations under the `examples/jsm` path — `three/addons/*`
  resolves fine at runtime (it's aliased in the package's `exports` map) but has no types at
  this version, so `tsc` fails. This may change if the pinned versions above are ever bumped.
- **Do NOT change `tsconfig.json`'s `moduleResolution` away from `"node"`.**
  `react-scripts@5.0.1` hard-enforces this (`verifyTypeScriptSetup.js`) and will silently
  overwrite the file back on the next `npm start` if it doesn't match — confirmed by reading
  that script directly rather than trial-and-error. This is *why* the `@types/three` version
  pin above was necessary instead of just fixing resolution some other way.

---

## Milestone 4 — glTF swap and storyboard strip

**Status: PASS.**

### What passed

- **glTF swap, verified with a real asset.** With the user's explicit go-ahead (file downloads
  require permission per this session's operating rules), downloaded Khronos' official sample
  `Duck.glb` (~118KB, from the canonical `KhronosGroup/glTF-Sample-Assets` GitHub repo) to
  `myopic-studio/public/assets/duck.glb` — verified it's a real glTF v2 binary via `file`
  before using it. Hand-edited a saved `.myo`'s `char_01.mesh` from
  `{"kind":"primitive","shape":"capsule",...}` to `{"kind":"gltf","path":"/assets/duck.glb"}`
  (no other fields touched), reloaded the scene through the running app (not a rebuild) — the
  capsule was replaced by the actual textured duck model, at the same position and same scale.
  No console errors, no fallback-wireframe triggered. This exercised the `GLTFLoader` path that
  was already built during Milestone 3's "Central Architectural Requirement" work — M4 needed
  no new rendering code, only a real asset to prove it.
- **Storyboard strip** (`src/components/StoryboardStrip.tsx` + `src/store/storyboardStore.ts` +
  new backend `GET/PUT /api/storyboard`, persisted to `myopic-studio/storyboard.json`). "Add to
  Storyboard" auto-saves the current scene first if unsaved/dirty, then appends a frame
  referencing it by filename with shot number (auto-incremented by 10, so a director can insert
  shots between existing ones later — 10/20/30, not 1/2/3), camera label (auto-derived, e.g.
  "MCU · 50mm"), and empty notes.
  - **Reordering uses up/down buttons, not drag-and-drop** — deliberate scope call, see rule
    below.
  - Verified for real: added two different saved scenes as frames, reordered them (2nd → 1st),
    edited notes on a frame, confirmed the new order + notes on disk in `storyboard.json`, then
    did a **full page reload** and confirmed the strip rebuilt in the persisted order with the
    persisted notes. Also verified "Load into editor" (loads that frame's scene back into the
    main panels) and "Remove frame" (deletes it and persists immediately) both work.
  - No visual thumbnails — PRD non-goal #2 says "no thumbnails" and Milestone 4's own
    checklist only asks for shot number + notes, so cards are text-only (title, camera label,
    notes). Don't add thumbnail rendering later without checking that's actually wanted; it'd
    mean capturing the Three.js canvas per frame, which is a real feature, not a tweak.

### Rules worth remembering

- **A backend restart is required after editing `server/*.js`.** Unlike the CRA frontend
  (webpack hot-reloads on save), the Express backend is a plain `node server/index.js` process
  — it does not reload when the source changes. Hit this directly: added the `/api/storyboard`
  routes, forgot to restart, got `404`s and an uncaught-error overlay in the browser that looked
  like a frontend bug but was just a stale backend process. If a newly-added backend route
  404s, restart `npm run server` before debugging further.
- **The dev server (`npm start` / `preview_start`) can silently die** — hit this mid-session
  (port 3000 stopped listening with no visible crash reason in this environment). If a
  previously-working `localhost:3000` request suddenly fails to connect, just restart it before
  assuming something in the app broke.
- **Reordering intentionally does not renumber shots.** Moving a frame changes its position in
  the array (display order) but leaves `shotNumber` untouched — matches real editorial
  convention where shot numbers are stable references, not array indices.
- File downloads (even small, standard, well-known ones like a Khronos sample asset) go through
  an explicit user ask first, every time — this one did, via `AskUserQuestion`, before anything
  was fetched.

---

## Post-V1 — Realistic lighting/environment (started 2026-07-14, closed 2026-07-31)

User asked for more realistic lighting/environments ("tree on a hill at sunset" should show
horizon, shadows, etc.). Agreed plan: (1) shadows + ground plane, (2) Sky dome for horizon,
(3) fog + tone mapping, (4) parser prompt nudge for time-of-day → light values. This
deliberately reopened PRD v1.0's "no photorealistic rendering" non-goal — rationale: shadow
direction and horizon are *blocking* information, not photorealism. **That non-goal has since
been removed outright (PRD v1.1, 2026-07-31); PRD section 11 now governs rendering scope.**

### Step 1 — shadows + ground plane: DONE, verified in-browser

All in `src/components/Viewport.tsx`; no data model, parser, or backend changes:

- `renderer.shadowMap.enabled = true` with **`PCFShadowMap` — deliberately NOT
  `PCFSoftShadowMap`**, because `shadow.radius` (which `shadowSoftness` now drives) is a no-op
  under PCFSoftShadowMap.
- Key light: `castShadow`, 2048² map, ortho shadow camera ±15 around origin, near 0.5 / far 40,
  bias −0.0005, and `shadow.radius = 1 + shadowSoftness * 7` — **`shadowSoftness` is now
  rendered, not just stored.** Rim/fill lights deliberately do not cast (cost, and fill is
  ambient anyway).
- 60×60 `MeshStandardMaterial` ground plane (0x1f1f23, roughness 1) at y = −0.01 (just under
  the grid to avoid z-fighting), `receiveShadow`. Grid kept on top.
- All primitive meshes and glTF child meshes get `castShadow`/`receiveShadow` (glTF via
  `traverse` in the loader callback).

Verified live (dev server, real saved scenes, `tsc --noEmit` clean, console clean):
- Server Room scene in free view: crisp cast shadows from capsule + prop boxes stretching
  across the ground, direction following Key Azimuth/Elevation edits in the Lighting panel;
  softness 0 vs 0.25+ visibly changes edge hardness. Test edits were discarded (page reload),
  **not** saved into the .myo files.
- Sunset scene ("Distant Figure at Sunset", scenes/d330bdf7-…): ground catches the warm
  #FFAE7A key. **Gotcha: at true sunset elevations (~8°) shadows are nearly invisible** — the
  ground gets almost no direct light (grazing incidence), so there's no lit/shadowed contrast.
  Not a bug; it's physically what the lighting model does. Step 2 (sky dome/horizon) and step 3
  (tone mapping) are what will make sunset scenes actually read as sunset.

### Rules worth remembering

- Shadow camera only covers **±15 units around the origin** — objects placed farther out than
  that will silently cast no shadow. If a scene ever spreads wider, bump the ortho bounds (and
  consider mapSize) in the keyLight block in Viewport.tsx.
- If `shadowSoftness` ever seems dead again, check nobody "upgraded" the shadow map type back
  to PCFSoftShadowMap.

### Step 2 — sky dome + horizon (and ACES tone mapping, pulled forward): DONE, verified incl. live parse

**Schema addition (deliberate, post-V1):** `environment.setting: 'Interior' | 'Exterior' | '[?]'`
added to `src/types/scene.ts`, the parser system prompt (INT./EXT. slugline framing), and the
Environment properties panel. PRD section 5 doesn't have this field — it was needed because
interior/exterior only existed as free text inside `locationName`, and the sky must not render
indoors. Old `.myo` files lack the field: `isExterior()` in Viewport.tsx falls back to sniffing
`locationName` for interior-ish words (this is why Server Room / Apartment scenes correctly get
no sky without migration), and the panel select tolerates `undefined` via `?? '[?]'`.

Viewport changes:
- `Sky` from `three/examples/jsm/objects/Sky.js` (typed fine at 0.160.0), exterior scenes only,
  sun position driven by the same `keyLightAzimuth/Elevation` as the key light. `timeOfDay:
  Night` pushes the sky-sun below the horizon (−8°) for a dark sky while the key light keeps
  lighting the set. Weather string matching `/overcast|cloud|fog|mist|rain|storm/i` raises
  turbidity 8 → 16.
- **`ACESFilmicToneMapping` + exposure 0.6 on the renderer** — pulled forward from step 3
  because the Sky shader emits HDR-range values and clips to a solid white dome without it.
  Verified before/after screenshots: without tone mapping the sky was blown out.
- **Size coupling to respect if any of these numbers change:** sky scale 180 < camera far 200
  (both cameras), and ground plane (grown 60 → 120) half-diagonal ~85 < sky half-size 90 —
  ground poking outside the depthWrite-false sky box draws unpredictably.

Verified live:
- Sunset scene: real horizon line in camera view; swinging Key Azimuth into frame shows warm
  glow + bright sun band. Interior counter-test: Server Room still renders on the dark void.
- **Full end-to-end live parse of the user's original example** ("A distant shot of a tree on
  a hill at sunset") through the restarted backend: Claude returned `setting: "Exterior"`,
  Dusk, hill = cone(12,3) with tree = cone(2,5) at y=3 on its summit, camera at z=25/35mm,
  key #FF8C42 at 8° elevation, zero flagged params. Saved as
  `scenes/7eb7999a-e618-408c-84c8-cbdd4a62e91a.myo` with `setting` persisting through the
  envelope untouched (nested camelCase passthrough, no myoFormat.js change needed). Camera
  view visibly reads as tree-on-hill-against-sunset-horizon. `tsc --noEmit` and console clean.

### Rules worth remembering

- **When driving this UI via `javascript_tool`, never select inputs by index — always find
  them via their `<label>` text.** Selecting `input[type=number]` by index while the
  Properties panel was mid-rerender hit a *storyboard shot-number* field instead and
  auto-persisted 180 into `storyboard.json` (caught and reverted same session). Storyboard
  fields persist immediately; there is no dirty/save gate on them.
- Parser-affecting changes need the backend restarted AND a fresh parse to test; the three
  pre-existing scenes never exercise the parser.
- The step-4 "parser lighting nudge" may be unnecessary: with only the `setting` field added,
  claude-sonnet-5 already produced elevation 8° + #FF8C42 for a sunset prompt unprompted.
  Re-evaluate before writing more prompt text.

### Step 3 — fog: DONE, verified against sampled pixels

All in `src/components/Viewport.tsx`; no data model, parser, or backend changes. `FogExp2` on
`sceneRef.current` (not the content group — fog belongs to the Scene, so it is set in the
scene-data effect and cleared both when `scene` is null and in the mount effect's cleanup,
since the Scene object outlives that effect).

- **Density from `environment.weather`**, graded rather than the binary the sky's turbidity
  switch uses: clear 0.015, overcast/cloud/rain/storm/snow 0.025, haze/mist/smoke 0.035,
  fog/smog 0.06, thick|dense|heavy + fog/mist/smog 0.1. Interiors ignore weather and use a
  fixed 0.03.
- **Colour** = pale horizon `0xb9c9d6` lerped toward the key light colour by `0.65 *
  clamp((20 − sunElevation)/20)` — so the haze goes warm exactly when the sun gets low — then
  lerped 0.4 toward flat grey `0xc8cccf` for turbid weather. Night uses `0x0b0f18` + 15% key.
  Interiors use the background colour `0x18181b` so the ground's far edge vanishes into the
  void instead of ending in a hard line.
- **Two separate exposure boosts, and they are not interchangeable:** exterior ×1.6, interior
  ×1.1. Fog colour is scene-referred (tone-mapped with everything else) while these hexes are
  display-referred, and ACES crushes darks far harder than midtones.

**Both boosts were tuned by measurement, not arithmetic** — `gl.readPixels` on the live canvas
via `javascript_tool`, sampling a vertical strip through the horizon. Worth repeating if these
ever need retuning, because the analytic version was wrong: predicted values matched measured
ones to 1/255 in the midtones but were off by ~2× in the darks (interior first landed at
rendered 52,52,57 against a 24,24,27 background — visible band — until the boost came down
from 4.2 to 1.1).

Verified live (dev server on :3001, `tsc --noEmit` clean, console clean):
- Tree on a Hill (Exterior/Sunset, camera view): ground's far edge renders 205,171,166 against
  sky 178–195 — matched in luminance, warm in tint, so the horizon reads as haze rather than a
  seam. Was 220,183,178 at the first-guess boost of 3.2, a visible bright band.
- Server Room and Apartment (both Interior): ground edge renders exactly 24,24,27, i.e.
  identical to the background — the floor now recedes into the void with no edge at all.
- Distant Figure at Sunset, weather driven live through the Environment panel: "thick fog
  rolling in" swallows the distant figure; "light mist" leaves it clearly readable with a soft
  horizon band; Time of Day → Night gives a dark ground silhouetted against the sky's glow
  without blowing out. **All these edits were discarded by page reload — nothing saved**; the
  four `.myo` files still carry their 14 Jul mtimes.

### Rules worth remembering

- Fog is on the Scene, so it is *not* covered by the `disposeObject3D(contentGroup)` teardown.
  Anything that adds more scene-level state needs the same explicit clearing.
- Retune the boosts by sampling rendered pixels, never by deriving through the ACES curve.
- Density assumes blocking-scale scenes: 0.015 leaves an object 10 units out untouched (~98%)
  and erases the ground's far corners (~85). A scene shot from much farther back would haze
  its own subject.
- The `View: Free/Camera` toggle does not respond reliably to synthetic clicks in this
  automation setup; clicking the button through `javascript_tool` works.

### Track closed — PRD amended 2026-07-31

`PRD.md` is now **v1.1**. The "no photorealistic rendering" non-goal was **removed**, not
narrowed — section 2 lost that item (the rest renumbered, so old citations of "non-goal #4"
are stale, and #5–#8 are now #4–#7) and now points at section 11 instead. **Section 11 is the
sole governing rule on rendering scope:** *blocking information* (shadows, horizon, tone
mapping, fog) is in, *finishing* (ray tracing, PBR materials, texture maps, reflections, bloom,
AO, DoF-as-an-effect) is out, and the test for anything new is which of those two questions it
answers. `environment.setting` is recorded in section 5. Step 4 (parser lighting nudge) is
formally dropped there, not just deferred.

Nothing outstanding in this track. Anything on the "out" list needs an amendment logged in
section 11 before it gets built.

**End-to-end fog parse (2026-07-31, user-requested):** live prompt "lone figure walks a
country road at dawn, thick fog rolling over the fields…" → claude-sonnet-5 returned
`setting: Exterior`, `timeOfDay: Dawn`, `weather: "Thick fog"` (hits the top density tier,
0.1), dawn-appropriate key (#E8DCC8 at 12° elevation), ELS 35mm, zero flagged params. Saved,
verified on disk, rendered as expected (near-total white-out; figure at z=−20 swallowed —
transmittance ~e⁻⁹, physically consistent, not a bug), then **deleted at the user's request**
— scenes/ holds only the four 14 Jul originals. Also re-confirmed step 4 (parser lighting
nudge) was rightly dropped: dawn light values came back correct unprompted.

---

## Poseable figures — static-pose smoke test (2026-07-31): PASS

User asked how to start on poseable figures; agreed first step was the cheap path — **static
posed variants via the existing mesh abstraction**, no rigging, no schema change, no new
rendering code.

- **`scripts/generate-pose-glbs.mjs`** (kept, reusable) builds proxy mannequins with three's
  `GLTFExporter` run under Node — the only shim needed is a minimal `FileReader` (exporter's
  binary path uses it; Node has `Blob` but not `FileReader`). Outputs to
  `public/assets/poses/{standing,sitting,crouching}.glb` (~86KB each, verified glTF v2 via
  `file`). Poses are plain group rotations baked at export: joint-pivot convention is a Group
  at the joint with the capsule hung `-h/2` below, so a rotation bends at the joint. Figures
  face **+Z** (nose marker); base at y=0; `hipY` per pose keeps feet grounded (eyeballed in
  viewport, not derived).
- **Smoke test (Milestone-4 style):** copied the Apartment `.myo` to a new scene id, pointed
  char_01 at `standing.glb`, char_02 at `sitting.glb`, later added a third at
  `crouching.glb` — all by editing the file, zero code changes. All three loaded in one scene,
  correct position/rotation/scale (sitting figure at chair height, crouch reads as
  hunched-over), no console errors, no fallback wireframe. Test scene deleted after; the three
  `.glb`s and the generator stayed.
- **Scope status: PRD amended same day (v1.2, section 11); pose support BUILT and verified
  same day.** The core decision: a pose is a mesh, not a field — no schema change,
  `/assets/poses/sitting.glb` IS the sitting pose. Still out: rigging, IK, pose editors,
  animation between poses. Section 9's asset-source question remains open — the generated
  proxies are current content, not a commitment.

### Pose support build (2026-07-31): DONE, all three v1.2 acceptance criteria verified

- **`src/poses.json`** is the single source of truth for the library (name / path / hint).
  The properties panel imports it (CRA `resolveJsonModule`); the parser `require`s it from
  `server/parser.js` and builds the prompt's pose list from it. Adding a pose = add geometry
  to the generator's `POSES` table + a row here; no viewport code exists to touch.
- **Panel:** `PoseSelector` in `PropertiesPanel.tsx`, characters only, above `MeshEditor`.
  Pure UI sugar over the mesh reference: selecting a pose rewrites `mesh` to
  `{kind:'gltf', path}`, "(none — capsule)" restores the default primitive. Current value is
  *derived* from the mesh path (a hand-attached pose path shows as that pose). A custom
  non-pose glTF shows as "(custom glTF)" and gets a `window.confirm` before being replaced.
- **Parser** (`server/parser.js`): posture stated → pose mesh (the one place the parser now
  emits `kind:"gltf"`; props still never). Posture unstated → capsule, unflagged. Posture
  unmatched → nearest pose + `"poseNote": "[?]"` on that character; `collectFlaggedPaths`
  picks it up as `characters[i].poseNote`, then the server deletes the field before building
  the scene — so the flag surfaces in the UI but poseNote NEVER reaches the scene model or
  the `.myo`. If a flag named poseNote confuses anyone later, that's the mechanism.
- **Verified** (tsc clean, live parses through a temporary second backend on :4001 running the
  new code, since :4000 belonged to another session):
  - Server-room prompt → technician arrived as `crouching.glb`, only `environment.weather`
    flagged. (v1.2 acceptance #1)
  - Pose dropdown → sitting: viewport swapped capsule for seated mannequin; Save .myo →
    reload → pose persisted; on-disk mesh was the pose path, no poseNote leak. Done on a
    scratch copy scene, deleted after. (acceptance #2)
  - "Man lies flat on his back" → nearest pose + `characters[0].poseNote` in flaggedParams,
    field stripped from the scene. (the unmatched-posture rule, live)
  - Acceptance #3 (new pose without viewport changes) was proven structurally by the smoke
    test — the three shipped poses were themselves added that way.
  - Follow-up combined test: one prompt with three characters in three postures ("old woman
    sits on a bench / young man stands / third figure lies sprawled") → sitting + standing
    mapped clean, sprawled → nearest pose + `characters[2].poseNote` flagged; saved via the
    test backend, loaded through the UI ("1 param need review" badge showing), and the pose
    dropdown correctly *derived* each parser-produced pose from its mesh path. Test scene
    deleted after.
- **Gotcha: parser changes only exist in a backend started after the edit.** The long-running
  backend on :4000 keeps the old system prompt until restarted — a UI parse can silently test
  stale rules. Restart it (or spot-check via a second instance with `MYOPIC_SERVER_PORT`)
  before judging parser behavior.
- Gotcha: after hand-editing a `.myo`, re-selecting the same scene in the dropdown does
  nothing (same value, no `change` event) — clear the select and re-set it, or reload the page.

### Fourth pose — lying (2026-07-31): DONE, gates verified

- Closes a gap the earlier live parses exposed twice: "man lies flat on his back" and the
  sprawled third figure both fell to nearest-pose + `poseNote` flag because no lying pose
  existed. The library is now standing / sitting / crouching / **lying**.
- Followed the documented recipe exactly — generator row + re-run + `poses.json` row; zero
  viewport code touched (v1.2 acceptance #3 exercised again, for real this time).
- Generator change: joint bends couldn't express a horizontal figure, so `buildFigure` gained
  two whole-figure params, `rootRotX` (rotation at the root) and `rootLift` (raise the rotated
  figure so its lowest surface rests at y = 0, preserving base-anchored positions). Lying is
  the standing figure rotated −π/2 at the root and lifted 0.15 — the torso radius, the deepest
  point behind the back. Face up, feet at the origin, head toward −Z.
- **Evidence** — loaded the exported `.glb`s back through `GLTFLoader` under Node and measured
  `Box3` bounds: standing spans y 0→1.60; lying spans y 0→0.31 and z −1.60→0, min y exactly
  0.00. Horizontal, resting on the floor, base-anchored. All four files regenerated (~87 KB
  each); `npx tsc --noEmit` clean; `npm run build` passing.
- Parser + pose dropdown pick the new pose up automatically (both read `poses.json`) — but
  per the standing gotcha above, the prompt-side mapping only exists in a backend started
  after this change. No live parse was run this session (no backend up); the previously
  flagged "lies flat on his back" prompt is the obvious re-verification case.
- **Follow-up (same day): backend restarted, prompt verified, one stale-prompt bug found and
  fixed.** Captured the SYSTEM_PROMPT the restarted backend actually builds (stubbed
  `global.fetch` around the real `parsePromptToScene`, dummy key never sent): the pose list
  correctly offered `lying.glb` — but the unmatched-posture rule's hardcoded example still
  read "(lying down, climbing, a handstand)", telling the model lying has NO matching pose in
  direct contradiction of the list above it. Adding a pose whose posture appears in that
  example list requires editing the example too — `poses.json` alone doesn't reach it.
  Changed to "(climbing, a handstand, mid-leap)" and restarted; re-capture confirms the
  contradiction is gone.
- **Live-parse verification: PASS (same day, user supplied the key mid-session).**
  Backend restarted with the key loaded, then two live parses through `POST /api/parse`:
  - "A man lies flat on his back in an empty warehouse" → `characters[0].mesh` =
    `{"kind":"gltf","path":"/assets/poses/lying.glb"}`, no `poseNote` anywhere, no
    `characters[i].poseNote` in `flaggedParams` (the flags present were the usual
    unstated-lighting/camera sentinels from a minimal prompt). This exact prompt shape
    previously fell to nearest-pose + flag — the gap is closed.
  - Regression check that editing the unmatched-posture example didn't break the flag path:
    "A gymnast does a handstand in the middle of a gym" → nearest pose (`standing.glb`),
    `characters[0].poseNote` present in `flaggedParams`, and the field itself correctly
    stripped from the scene. The flag mechanism survives.
- **Rebased onto `main` 2026-08-09; `lying.glb` regenerated, and the floor-contact figures
  above are superseded.** The committed binary was 87 KB against ~156 KB for the other three
  — it predated the pose mannequin rebuild (#6), so lying would have rendered as the old
  crude figure beside three detailed ones. `poses.test.ts` did not catch it: it checks that
  `poses.json` and the `.glb` files correspond by name, not that the binaries are current.
  Re-running the generator produced 156 KB and left the other three byte-identical (so the
  generator is deterministic and `main`'s assets are current).
- **Base-anchoring no longer holds anywhere in the library, not just here.** Measured `Box3`
  y-bounds after regeneration: standing −0.040→1.679, sitting 0.030→1.369, crouching
  0.054→1.330, lying 0.027→0.308 (z −1.679→0.040). Lying floats 2.7 cm because `rootLift:
  0.15` was tuned to the *old* torso radius — but standing sinks 4 cm and crouching floats
  5.4 cm on `main` already. The rebuild broke the base-anchored convention across all four
  poses; retuning one in isolation would make it the odd one out. Left for a library-wide
  pass. Lying's shape is unaffected: horizontal, ~0.31 m deep, 1.68 m along −Z, face up.

## Test suite added (2026-08-01): DONE, 24 tests passing

- Replaced the "no test suite" state with unit tests on CRA's bundled Jest 27 (no new test
  runner — `react-scripts test`). New script `test:ci` runs once (`--watchAll=false`);
  plain `npm test` is watch mode. The gate set is now: `npx tsc --noEmit` → `npm run test:ci`
  → `npm run build`, all three verified passing together after the change.
- Four suites in `src/__tests__/` (24 tests):
  - `myoFormat.test.ts` — §7.1 envelope: top-level snake_case key set exact, nested content
    untouched/camelCase, lossless round-trip.
  - `parser.test.ts` — `collectFlaggedPaths` (dot-paths, `[i]` array indices, no-flag case)
    and `parsePromptToScene` with `global.fetch` mocked: text block selected by type with a
    leading thinking block, fence stripping, poseNote flagged-then-stripped, max_tokens /
    non-ok / invalid-JSON errors, missing-key error. `collectFlaggedPaths` is now exported
    from `server/parser.js` for this (the only production code change).
  - `sceneStore.test.ts` — `setField` nested + array-index paths, immutable replacement,
    dirty/markSaved lifecycle, no-op without a scene. Zustand drives fine outside React via
    `getState()`; no @testing-library needed.
  - `poses.test.ts` — poses.json entries well-formed/unique and every path resolves to a real
    `.glb` under `public/` (guards the poses.json ↔ generator drift case).
- Gotchas hit:
  - Jest 27's jsdom has no `structuredClone` (Node has it; the jsdom sandbox doesn't).
    `src/setupTests.ts` backfills it from `v8` serialize/deserialize — sceneStore tests
    fail without it.
  - CRA's Jest only discovers tests under `src/`, and its allowed `package.json` jest
    overrides do NOT include `roots` — so server tests live in `src/__tests__/` and
    `require()` the CommonJS `server/*` modules directly (works; babel-jest transforms
    outside `src/` too, and webpack's ModuleScopePlugin doesn't apply to Jest).
  - Every file inside a `__tests__/` dir is collected as a suite — shared fixtures must live
    elsewhere (`src/testUtils/sceneFixture.ts`).
  - A test file with only `require()` and no ES imports trips `--isolatedModules` under
    `tsc --noEmit` ("global script file") — needs an `export {}`.
  - CRA sets Jest `resetMocks: true` — mock implementations must be created per-test (the
    parser tests build a fresh `fetch` mock in each test for this reason).
  - `@types/jest@^27.5.2` added as devDep (matches Jest 27) so the typecheck gate passes on
    test files.
- Deliberately untested: `Viewport.tsx` (Three.js/WebGL can't run under jsdom — verifying
  rendering stays a browser-preview/screenshot job) and `server/index.js` routes (thin
  Express glue; would need supertest — add later if route logic grows).

## Flag resolution fix (2026-08-01): DONE, 28 tests passing

- Gap found while resolving a scene's flagged params through the UI: nothing ever removed
  an entry from `flaggedParams`. The parser sets it once at parse time; editing a flagged
  field replaced the `[?]` value but the "N params need review" badge and the `.myo`'s
  `flagged_params` stayed stale forever.
- Fix in `sceneStore.setField` (the single edit path, so it catches every panel): after
  `setAtPath`, if the new value isn't `'[?]'`, the path is converted to the parser's
  dot-path format (`toFlagPath`: keys joined with `.`, array indices as `[i]` — mirrors
  `collectFlaggedPaths` in `server/parser.js`) and dropped from `flaggedParams` if present.
  Writing `'[?]'` back into a field keeps the flag.
- 4 new tests in `sceneStore.test.ts` (resolve clears, `[?]` keeps, bracket-format array
  paths clear, unflagged edits leave the list alone). `npx tsc --noEmit` clean,
  `npm run test:ci` 28/28.
- Live evidence: parsed test scene `62a26f9c` ("Two Detectives — Office at Night") had
  `environment.weather` + `camera.aspectRatio` flagged; resolving them via the Environment
  and Camera panels made the badge disappear, and the re-saved `.myo` (same file — saves
  overwrite by `sceneId`) has the real values and `flagged_params: []`.
- Browser-automation note reconfirmed: the save button reads `Save .myo *` when dirty —
  match button text with `startsWith('Save .myo')`, not equality.

## Collapsible panels + persisted collapse state (2026-08-01): DONE

Two commits, both `src/App.tsx` only — no store, viewport, backend, schema, or parser changes.

- **`f58a563` — collapsible Hierarchy and Properties panels.** Each panel header gained a
  chevron that collapses it to a **36px rail** carrying a vertical label
  (`[writing-mode:vertical-rl]`); clicking the rail expands it back. The layout is one grid
  whose `grid-template-columns` is picked from the four open/closed combinations
  (`240px,1fr,320px` → `36px,1fr,36px`), animated with
  `transition-[grid-template-columns] duration-200`.
  - **The Viewport needed no change at all.** It already carries a `ResizeObserver`, so the
    canvas re-fits itself when the grid columns animate — measured **333px → 821px** wide with
    both panels collapsed. That observer is the reason this was a one-file change; anything
    else that resizes the middle column should lean on it rather than adding resize plumbing.
- **`2ca7789` — collapse state persisted.** A small `usePersistedOpen(key)` hook holds the
  state in `localStorage` under `myopic.hierarchyOpen` / `myopic.propertiesOpen`. The read is
  `localStorage.getItem(key) !== 'false'`, so a missing or unrecognised value **fails open** —
  first run behaves exactly as before, and a corrupt key can never leave a panel hidden with
  no obvious way back.

Gates re-run after both commits: `npx tsc --noEmit` clean, `npm run test:ci` **28/28**,
working tree clean. No new tests — this is App.tsx chrome, and the project has no
@testing-library/React-rendering setup (see the "Deliberately untested" note in the test-suite
section); the behaviour was verified in the browser by measuring the canvas.

### Rules worth remembering

- ~~**Fail open on persisted UI state.** `!== 'false'` rather than `=== 'true'` is deliberate:
  the failure mode of a bad localStorage value should be a visible panel, not a vanished one.
  Apply the same default to any future persisted chrome.~~
  **SUPERSEDED 2026-08-09 — the rule is now fail *closed*, `=== 'true'`.** See "Persisted panel
  state flipped to fail-closed" at the end of this file. The collapsed rail added in `f58a563`
  already guarantees a visible way back, which was this rule's entire justification. Kept here
  as the record of the original reasoning, not as current guidance.
- This is the first use of `localStorage` in the app. It holds **UI chrome only** — scene and
  storyboard data stay on disk via the backend. Don't let scene state drift into it.

## focusSubjectId aims the shot camera (2026-08-05): DONE, verified in-browser

- Gap found while answering "how do I set specific camera distances and lenses": the shot
  camera was hardcoded to `lookAt(0, 1, 0)`, so `camera.focusSubjectId` was inert — the
  dropdown in the Camera panel wrote a value that nothing read. A character placed away
  from the origin drifted off-centre (or out of frame on a long lens) with no way to aim at
  them except hand-solving `camera.position`.
- Fix in `Viewport.tsx`: `cameraAimPoint(scene)` resolves `focusSubjectId` against
  `scene.characters` and returns the subject's aim point; `sceneCamera.lookAt()` takes that
  instead of the literal. Unset, unknown, or hidden subject falls back to `DEFAULT_AIM`
  `(0,1,0)` — the exact old value, so every pre-existing scene frames identically.
- Aim height respects the base-anchored convention: `position.y + midHeight * scale`, where
  `midHeight` is `verticalHalfExtent()` for a primitive (0.9 for the standard 1.8m capsule,
  which is why the old hardcoded 1.0 looked roughly right) and a nominal 0.9 for a `gltf`
  mesh. **The nominal is not laziness** — `GLTFLoader` is still in flight when the camera is
  positioned in the same effect, so a posed figure's real bounds aren't knowable
  synchronously. Measuring them would mean re-aiming on load callback; not worth it while
  every pose in the library is a roughly human-height mannequin.
- Only the shot camera changed. The key/rim lights still `lookAt(0, 1, 0)` deliberately —
  they're direction-only, and re-aiming them at the subject would move every shadow in the
  scene as a side effect of a camera setting.
- Evidence (scene `d330bdf7` "Distant Figure at Sunset": subject at x=2 z=-10, camera at
  z=5, 35mm, 2.39:1): before, the figure sat high and right of frame; after, dead centre.
  Numerically the subject's NDC goes (0.260, 0.339) → (0.000, 0.000). Regression-checked
  `62a26f9c` (null focus — unchanged, both detectives framed as before) and `4f4fefce`
  (focus on a `sitting.glb` — exercises the gltf nominal, renders centred).
- Gates: `tsc --noEmit` clean, `test:ci` 28/28, `npm run build` compiled. No new tests —
  the logic lives in `Viewport.tsx`, which stays deliberately untested (WebGL under jsdom).
- Not touched, and deliberately: `camera.depthOfField` stays stored metadata. PRD §11's
  out-list names depth of field as a rendered effect explicitly ("the f-stop stays what it
  is today"), so wiring it to anything needs an amendment logged first.

### Rules worth remembering

- **CRA dev server won't start in this container without `DANGEROUSLY_DISABLE_HOST_CHECK=true`.**
  It dies with `options.allowedHosts[0] should be a non-empty string`. Cause: `package.json`
  has a `proxy` field, so CRA enables the host check and passes `urls.lanUrlForConfig` as the
  sole allowed host — and that resolves to `undefined` on a box with no LAN address. Setting
  `HOST` alone does not fix it. Environment quirk, not a repo bug; don't "fix" it in config.
- `npx tsc` fetches a *modern* TypeScript when `node_modules` is absent and then fails on
  `moduleResolution=node10` deprecation — which looks like a real typecheck error but isn't.
  Run `npm install` first and use `./node_modules/.bin/tsc` to get the pinned 4.9.5.

## Depth-of-field focus readout (2026-08-05): DONE, PRD §11 amended to v1.3 first

- **Amendment before code, per §11.** `depthOfField` was the last inert camera field. The
  owner approved v1.3 — depth of field as *computed information* (numbers + ground markers),
  with rendered blur still barred. The out-list line was narrowed, not deleted: its
  parenthetical now scopes the prohibition to shading. Two owner decisions differed from the
  first draft and the amendment was rewritten before being applied: **plane markers are in**
  (drafted as optional), and **flagged inputs still compute** from fallbacks, labelled
  provisional (drafted as showing "—").
- **New: `src/lib/framing.ts` and `src/lib/dof.ts`.** The aim-point maths moved out of
  `Viewport.tsx` — the panel needs the same subject distance the camera uses, and anything
  left inside Viewport is untestable by construction (no WebGL under jsdom). `framing.ts`
  holds `num`, `verticalHalfExtent`, `cameraAimPoint`, `cameraPosition`, `subjectDistance`,
  `hasResolvedFocusSubject`; Viewport imports them and wraps in `THREE.Vector3`.
- **Test count 28 → 61.** Extracting the maths is what made it testable: `dof.test.ts` covers
  the range arithmetic, the hyperfocal → infinity transition, the null-for-impossible-inputs
  contract, and formatting; `framing.test.ts` covers the aim point (primitive vs gltf, scale,
  raised base, all three fallback paths, flagged components) — logic that shipped untested in
  the previous milestone because it lived in Viewport.
- **`resolveFocusInputs()` exists for testability, not tidiness.** The provisional decision
  was originally inline in the panel, which can't be tested (no React Testing Library in this
  repo — CRA's template deps were never added). Pulling it into `dof.ts` is what let the
  flagged-input behaviour be covered at all.
- **Circle of confusion is fixed at 0.03mm**, the full-frame convention matching the existing
  `SENSOR_WIDTH_MM = 36`. Deliberately not a tunable — a "sharpness" slider is a finishing
  control and §11 bars those.
- **`FALLBACK_F_STOP = 2.8` is new state, unlike the 50mm lens fallback.** The viewport
  already had a focal-length default because it renders FOV; it never read `depthOfField`, so
  there was nothing to inherit. Recorded in the amendment rather than buried in the constant.
- **`disposeObject3D` now disposes `THREE.Line` as well as `THREE.Mesh`.** The markers are
  Lines, and the old mesh-only check would have leaked geometry and material on every scene
  rebuild. Easy to miss: the leak is silent.
- Evidence (in-browser, both cases screenshotted):
  - `62a26f9c` "Two Detectives", 35mm f/2.8, no focus subject → measured 4.04m to centre
    stage, in focus 3.17–5.58m, depth 2.41m, hyperfocal 14.62m; both ground markers draw.
  - `d330bdf7` "Distant Figure at Sunset", 35mm f/8, focus `char_01` at 15.15m — past the
    5.14m hyperfocal → reads `3.82 m – ∞`, depth `∞`, and **only the near marker draws**.
- Gates: `tsc --noEmit` clean, `test:ci` 61/61, `npm run build` compiled.

### Rules worth remembering

- **The provisional readout state was verified on 2026-08-08** — see the probe-scene entry
  at the end of this file. Superseded the earlier note here that it was unit-tested only.
- **Marker geometry is a plane-ground intersection, not a point.** The focus plane is
  perpendicular to the *view axis*, so on a tilted camera its ground line is offset from the
  naive "walk along the floor" position. The code crosses the view direction with world up to
  get the line direction, then walks the in-plane vertical to `y = 0`. Degenerate when the
  camera looks straight down — guarded, returns no markers.

## CI on GitHub Actions (2026-08-05): LIVE, main green

The three gates are no longer honour-system. `.github/workflows/ci.yml` runs
`npm ci` → `tsc --noEmit` → `test:ci` → `build` on every pull request and every push to
`main`. Before this the repo had **zero** workflows — the gates only ran when someone
remembered to run them.

**First real results** (all on Node 22, `ubuntu-latest`):

| ref | commit | result |
| --- | --- | --- |
| PR #2 (the workflow itself) | `f660119` | green, 58s |
| PR #1 after base merge | `4dc501b` | green, 60s |
| PR #3 after base merge | `a7fbb1b` | green, 58s |
| `main` after all merges | `d4979cb` | green — install 13s, typecheck 3s, tests 2s, build 19s |

`main` is `d4979cb` with all three PRs merged and 61 tests passing under CI.

### Rules worth remembering

- **`npm ci` was broken repo-wide before this** — the lockfile was missing `yaml@2.9.0`, an
  optional peer of tailwindcss that npm resolves but had never been written back. Any CI
  anyone added would have died at the install step, before a single gate ran. Fixed in the
  same PR as the workflow. The drift had been noticed *earlier the same session and dismissed
  as incidental noise*; it wasn't. Treat an unexplained `package-lock.json` diff as a
  question, not as churn — `npm ci` is the check that settles it (`npm install` papers over
  it by definition).
- **`concurrency: cancel-in-progress` means intermediate merge commits can end with no
  completed run.** Merging #3 forty seconds after #1 cancelled the `main` run for #1's merge
  commit (`20daf77`, run #5) mid-flight. Not a failure and not a coverage gap here — #3's
  tree contains #1's changes, so the next run covered both — but on a chain of rapid merges,
  "cancelled" on an intermediate commit is expected, not alarming.
- **Squash-merging a PR that another PR is stacked on will wreck the stack.** #2 was squashed
  safely (nothing branched from it), but #1 was merged with a **merge commit** on purpose:
  #3's branch contained #1's commits, and squashing would have put differently-SHA'd copies
  of the same changes on `main`, making #3's diff re-contain #1's work and likely conflict.
  Preserve commits when something is stacked; squash only leaf PRs.
- **Do not rely on GitHub retargeting a stacked PR. Repoint the child at `main` BEFORE
  merging the parent.** Both halves of this were learned the hard way, three days apart:
  - *Parent merged, branch kept (2026-08-04).* After #1 merged, #3 still pointed at
    `claude/push-file-u861cy` — merging it there would have landed the work on a stale
    branch instead of `main`. The base had to be repointed explicitly, after which the diff
    was verified to contain only #3's own eight files.
  - *Parent merged, branch deleted (2026-08-10).* **This closes the child PR rather than
    retargeting it, and the close is irreversible.** `gh pr merge 17 --squash
    --delete-branch` left #18 `CLOSED`; `gh pr reopen 18` fails with *"Could not open the
    pull request"* and `gh pr edit 18 --base main` fails with *"Cannot change the base
    branch of a closed pull request"*, because the base branch it needs no longer exists.
    GitHub documents automatic retargeting for this case; it did not happen here, so treat
    it as something that may work rather than something to plan around. Recovery is cheap
    but leaves litter: rebase the child onto `main`, force-push, open a **replacement** PR
    (#18 → #19), and the dead PR number stays in the history pointing at nothing.
  - The safe order, whichever way the parent is merged: **retarget the child to `main`
    first, then merge the parent, then merge the child.** Costs one command and removes
    both failure modes.
- **CI enforces lint, via the build.** Actions sets `CI=true`, which makes `react-scripts
  build` treat ESLint warnings as errors. There is no separate lint script, so the build step
  *is* the lint gate — verify `CI=true npm run build` locally before pushing, since a plain
  local `npm run build` will not reproduce it.

## Prop proxy library + matte grey palette (2026-08-05): BUILT, GATE NOW CLOSED (see live parse below)

Owner report from use: *"the basic shapes we're using as symbolic stand-ins aren't reading for
me at all."* Diagnosis and scope reasoning are in **PRD §11 v1.4** — the short version is that
v1.2 fixed legibility for characters and left props on the "always a primitive" rule, so a
domestic interior rendered as a field of identical boxes. **Zero renderer changes**; this is
the pose pattern applied to props, exactly as PRD §4 promised.

**What was added**

- `scripts/generate-prop-glbs.mjs` — 12 domestic-interior proxies (sofa, armchair,
  dining-table, dining-chair, bed, desk, office-chair, bookshelf, counter, door, window,
  floor-lamp) built from primitives and exported to `public/assets/props/`.
- `src/props.json` — single source of truth, mirroring `poses.json`, plus a `footprint`
  (W×H×D metres) fed to the parser so it can judge whether a proxy fits.
- `scripts/lib/glb.mjs` — the `FileReader` shim GLTFExporter needs under Node, previously
  duplicated inline in the pose generator, now shared by both. **Both generators were re-run
  after the refactor** — don't take this on trust if you touch it again.
- `MeshLibrarySelector` in `PropertiesPanel.tsx` — `PoseSelector` generalised over a library;
  characters get "Pose", props get "Proxy". Same custom-glTF confirm guard as before.
- `src/__tests__/props.test.ts` (4 tests) and 2 additions to `parser.test.ts`.

**Conventions baked into the geometry — violate these and objects float or face backwards**

- **Base at y = 0.** `buildObject()` lifts *primitives* by half their vertical extent but does
  **not** lift a glTF group, so proxy geometry must already sit on the floor. The one
  exception is `window`, whose origin is the bottom of its frame so `position.y` reads as sill
  height — noted in its `props.json` hint because the parser needs to know.
- **Front faces +Z**, matching the mannequin's nose marker. A sofa's back is at −Z.
- Proxies are life-sized, so the parser is told to leave `scale` at 1 — this is deliberately
  guarding the Milestone 3 bug pattern where dimensions got duplicated into `scale`.

**Parser change** (`server/parser.js`): the blanket "prop meshes are ALWAYS primitive" rule is
replaced by first-choice-proxy / fallback-primitive, with the library and footprints injected
the same way `POSE_LIST` is. **No `propNote` flag** — unlike an unmatched posture, an unmatched
prop falling back to a primitive is honest rather than ambiguous, so there is nothing to review.

**Palette:** props `0x8a8a90`, mannequins moved from blue `0x6ea8ff` to `0xb8b8bd`. The two
greys differ by *value* on purpose — with hue gone that is the only thing separating figures
from set dressing. `CHARACTER_COLOR` / `PROP_COLOR` in `Viewport.tsx` are untouched and still
apply to primitives only.

**Evidence**

- `npx tsc --noEmit` clean. `npm run test:ci` **34/34**. `npm run build` compiled clean.
- Silhouette contact sheet software-rendered from the generated `.glb` files (all 15, common
  scale, ¾ view). First pass caught `armchair` collapsing into the same box silhouette as
  `counter`; its arms were lifted to sit *on* the seat slab and the back made taller and
  thinner, then re-rendered and confirmed distinct. That review is the entire point of the
  change, so do it again if you add proxies.

**Outstanding — the owner must run this locally**

- **A live parse has not been run.** The sandbox routes egress through an HTTP proxy that
  Node's `fetch` does not honour (`EAI_AGAIN api.anthropic.com`), so `POST /api/parse` returns
  `{"error":"fetch failed"}` there while `curl` to the same host succeeds. The parser tests
  cover the prompt contents and the post-processing path, but **the model's actual proxy
  choices are unverified**. Restart the backend first — parser edits only exist in a backend
  started after them.

### Gotchas worth remembering

- **`npm run build` hit `EPERM: unlink build/asset-manifest.json`** in the sandbox against the
  mounted folder. Not a code fault — `BUILD_PATH=/tmp/... npm run build` is the way through if
  it recurs; the pre-existing `build/` directory is what can't be removed.
- Running `npx jest` directly fails with "Cannot use import statement outside a module" — the
  Jest config lives in `react-scripts`. Always go through `npm run test:ci`.

## Warm/cool proxy palette (2026-08-05): BUILT, GATE NOW CLOSED (see live parse below)

Owner request straight after the prop library landed: cool greys and warm greys, five values
each, warm for people and cool for everything else. Reasoning and the rejected alternatives are
in **PRD §11 v1.5**; this supersedes v1.4's one-grey-per-class decision.

- **`src/palette.ts`** — `WARM_GREYS` (h≈28°, L 0.60–0.88) and `COOL_GREYS` (h≈214°, L
  0.42–0.74), five each, plus `characterColor(i)` / `propColor(i)` which cycle by index.
  Saturation is 10–13%: greys, not colours.
- **`Viewport.tsx`** — `CHARACTER_COLOR` / `PROP_COLOR` are gone. Colour comes from the palette
  keyed on the object's index in `scene.characters` / `scene.props`. **The index is the array
  position, not a filtered counter** — iterating with `.entries()` and `continue`-ing on
  invisible objects is deliberate, so hiding one character cannot re-colour the rest.
- **Library glTFs are now re-materialled at load.** `buildObject()` swaps in a fresh
  `MeshStandardMaterial` when `mesh.path` is in `LIBRARY_PATHS` (the union of `poses.json` and
  `props.json`), disposing what the loader built. **A .glb outside that set keeps its own
  materials** — the deliberate-user-attachment rule, same principle as the panel's
  replace-custom-mesh confirm. This is the hook the eventual asset pipeline will hang off.
- **The colours baked into the generators are now fallbacks only**, set to the middle value of
  each ramp (`WARM_GREYS[2]` / `COOL_GREYS[2]`). They are visible only if a `.glb` is opened
  outside the app. Retune the palette → update those two constants or accept drift.
- `src/__tests__/palette.test.ts` (7 tests) pins the *properties* rather than the hex values,
  which are a taste call: five distinct values per ramp, monotonic value, warm ramps red-over-
  blue and cool ramps blue-over-red, saturation under 0.2, deterministic cycling, adjacent
  indices never equal, and nonsense indices degrading rather than returning `undefined`.

**Evidence:** `npx tsc --noEmit` clean, `npm run test:ci` **41/41**, `npm run build` clean. A
z-buffered software render of a mock interior (5 props cycling cool, 3 figures cycling warm)
confirmed figures separate from set dressing at a glance and that no two neighbours merge.

**Still outstanding, unchanged from v1.4:** no live parse has been run from this environment —
see the sandbox proxy note above.

### Gotcha worth remembering

- The first version of that mock render used painter's-algorithm triangle sorting and produced
  a **convincing but wrong** picture — figures behind furniture they were standing in front of.
  It was replaced with a real z-buffer before anything was concluded from it. If you generate
  offline preview renders to judge a visual change, make sure the renderer can actually resolve
  occlusion, or you will review an artefact of the preview rather than the change.

## Live parse gate for prop proxies (2026-08-05): PASS

The gate left open by the two entries above — *"the model's actual proxy choices are
unverified"* — has now been run from the owner's machine, where egress to `api.anthropic.com`
works. Backend restarted first (fresh pid started 17:29:51 against a `server/parser.js` last
modified 16:54:34), then one parse through the UI. **Result: the parser prefers library
proxies, and the fallback stays honest.**

Prompt was a deliberately furniture-dense interior: open-plan living room with sofa, bookshelf,
armchair, floor lamp, dining table + four chairs, kitchen counter, window, door, plus a
television on a low stand, and two characters (one sitting, one standing).

**14 props parsed — 12 library proxies, 2 primitives:**

- Proxied: `sofa`, `bookshelf`, `armchair`, `floor-lamp`, `dining-table`, `dining-chair` ×4,
  `counter`, `window`, `door` — 9 distinct paths, all present in `props.json` and all resolving
  to real `.glb` files. **No invented paths.** 9 of the 12 library entries exercised.
- Primitive fallback: `TV stand` and `television`, neither of which has a proxy. This is the
  intended honest fallback, not a miss — there was no library entry to choose.

**The conventions the geometry depends on all survived the round trip:**

- `window` came back at `position.y = 0.9` — the parser applied the sill-height exception from
  its `props.json` hint rather than flooring it at 0. That is the subtle one, and it held.
- `television` at `y = 0.4`, sitting on the 0.4 m-tall TV stand; every floor-standing prop at
  `y = 0`. Base-anchoring is correct throughout.
- Every prop `scale` is `{1,1,1}` — the Milestone 3 bug pattern (dimensions duplicated into
  scale) did not reappear.
- Characters got `sitting.glb` / `standing.glb` at `scale: 1`.
- `flaggedParams` was `["environment.weather"]` only. No `propNote` — correct, there is no such
  flag by design.

Viewport render confirms the point of the whole change: the dining set, counter, floor lamp,
window and door read as distinct objects at a glance instead of a field of identical boxes, in
the warm/cool palette (warm figures, cool set dressing).

### Gotcha worth remembering

- **A furniture-dense parse is slow.** This one took roughly 45 s wall-clock before
  `POST /api/parse` returned 200 (large scene + adaptive thinking sharing the 8192-token
  budget). Nothing is wrong at 20 s — don't go hunting for a hang until well past a minute.

## Parser picks a focus subject (2026-08-07): DONE, confirmed by live parse

- Context: with `focusSubjectId` now aiming the shot camera, three of the six saved scenes
  had it as `null` — the parser only set it "if focus is explicit," so an ordinary prompt
  that never says "focus on her" left the camera pointed at centre stage regardless of where
  the subject stood.
- **The saved scenes were deliberately NOT re-parsed.** Re-parsing would not have helped:
  `focusSubjectId` and `depthOfField` were already in the parser's output schema when those
  scenes were made, so the same parser on the same prompts returns the same thing minus any
  hand-tuning. Nothing about the v1.3 work needs a re-parse — the camera aiming and the
  focus readout are renderer/panel changes that existing scenes get for free.
- Prompt change: a new rule requires `focusSubjectId` whenever the scene has any characters
  (the character named first, or the one the action centres on), restricts it to an id
  actually emitted, reserves `null` for character-less scenes, and forbids `"[?]"` — the
  field is `string | null` in the type model, not `Flagged<T>`, so a sentinel there would be
  a type lie.
- **Server-side guard added, and it is the part that is actually tested.** A model can name
  an id it never emitted; that dangling reference would fall back to centre stage in the
  viewport (so it "works") while storing a value the panel's dropdown cannot offer. The
  parser now nulls any `focusSubjectId` that matches no emitted character. Tests 61 → 65.
- **Mutation-checked rather than assumed:** disabling the guard fails exactly the two new
  tests and nothing else; restoring it returns 65/65. Worth doing — a test that passes
  whether or not the code works is worse than no test.

### Rules worth remembering

- **Live-parse evidence (owner-run, 2026-08-07):** a fresh parse of a prompt with characters
  and no explicit focus language returned `camera.focusSubjectId: "char_01"` rather than
  `null`. That is the prompt half working — the model now nominates a subject unprompted.
  One parse is evidence, not proof: the model chooses, so treat a future `null` on a
  character-bearing scene as a prompt-adherence question, not a code regression.
- **A parser *prompt* change cannot be verified by this repo's tests**, which is why the
  above had to be run by hand. The suite mocks `global.fetch`, so it exercises
  post-processing and never the model — the dangling-id guard is covered by tests, the
  instruction to nominate a subject never can be. Any future parser-prompt work needs the
  same treatment: restart the backend (plain node, no watcher) and parse something real.
- The two halves fail differently, and that is why they were verified separately: if the
  model ignores a prompt rule, scenes come back exactly as before — a silent no-op, not an
  error. Nothing in CI would have caught it.

## Pose mannequin facial landmarks (2026-08-07): DONE

Static brow ridge, nose and cheekbones on the pose mannequin heads. Content change only —
`scripts/generate-pose-glbs.mjs` and the three regenerated `.glb` files are the entire diff.
`src/types/scene.ts`, `Viewport.tsx` and `server/parser.js` were **not touched**, confirmed
against `git status`; this is PRD §11 v1.2's "growing the library is editing its table and
re-running it," not a new capability.

- **`buildHead()`** returns a Group in a head-local frame: skull sphere (unchanged radius
  0.11 and `BODY` material), brow slab, nose cone along +Z, two mirrored cheek facets. It is
  **orientation-free on purpose** — a new `neck` Group at y=0.72 carries `pose.headTilt ?? 0`,
  so every pose reuses one head geometry and tilt stays a pose property. No pose sets
  `headTilt` yet; the crouch's head angle still comes from `torsoBend`, exactly as before.
- **Scope:** this is fixed geometry, not expression. No morph targets, no blend shapes,
  nothing that can articulate at runtime — non-goal #7 is untouched.
- **Naming:** meshes now carry names (`skull`, `brow`, `nose`, `cheekL/R`, `torso`,
  `upperArmL/R`, `foreArmL/R`, `thighL/R`, `shinL/R`, `footL/R`). glTF export **strips
  punctuation** from node names — `cheek.L` came back as `cheekL`, which is why the names
  have no dots. Names are what make an exported pose inspectable part-by-part; the clearance
  check below depends on them.
- **`castShadow`/`receiveShadow` on the landmark meshes are cosmetic in the asset** — glTF
  carries no shadow flags, so they are dropped at export and `Viewport.tsx`'s loader traverse
  is what actually sets them at runtime. Set anyway so an in-process preview shadows the way
  the app does.

### Evidence

- **All three outputs valid glTF v2** via `file`: standing 94,148 B, sitting 94,596 B,
  crouching 94,868 B (~94 KB each, up from ~86 KB).
- **Clearance check** (scratch script, loads the *exported* `.glb`, per-vertex closest-point
  distance to every other mesh's triangles plus an odd-crossing containment test): **no
  landmark intersects anything in any pose.** Crouching is the tightest, as expected from the
  hunched neck angle, and still clears: skull→shoulder **13.7 cm**, cheek→shoulder 17.3 cm
  (standing 14.7/19.9, sitting 14.6/18.8). The one reported intersection, skull∩torso, is
  **pre-existing and by design** — the head sphere at y=0.72 r=0.11 has always overlapped the
  torso capsule's top cap (centre y=0.5, r=0.15) by 4 cm, since there is no neck mesh. Neither
  moved in this change.
  - Gotcha for anyone rerunning that check: `THREE.Triangle.closestPointToPoint` returns
    **NaN on the zero-area triangles at capsule and sphere poles**, which silently poisons a
    running `Math.min`. Filter by `getArea() > 1e-12` first.
- **Contact sheet** (¾ figure / ¾ head / front head / ¾ silhouette × three poses, offscreen
  Three.js in headless Chromium): landmarks read as three distinct features, not noise. Took
  **three tuning passes** to get there — the first two builds put the brow at 12.5 cm wide
  protruding ~27 mm at the corners, which rendered as a *visor*, and cheek slabs that broke
  the head silhouette like fins. Final: brow 0.085×0.02×0.034, cheeks 0.046×0.013×0.04 pulled
  in to x=±0.044. **A straight box across a sphere either protrudes at its corners or sinks
  at its centre** — that trade is the whole tuning problem, and the silhouette column is what
  exposes it. Judge these by render, not arithmetic.
- **In the real viewport**, scratch scene with the three poses (deleted afterwards, as with
  the original pose smoke test), key azimuth swept via the Lighting panel's own field:
  - Group frame at az 35° / 145° / 250°: landmarks visible at figure distance; at 250° the
    key is behind the figures and the faces fall to fill level, with the nose catching the
    only edge light.
  - Head frame at az 330° vs 60°: **the planes flip which side is lit.** At 330° the brow's
    top face is bright with a hard cast band under it, the camera-left cheek facet reads
    bright against a dark camera-right one, and the nose's left plane is lit. At 60° all
    three invert. That directional read is the point of the change — a bare sphere had none.

### Landmines hit while verifying (all environmental, none in the app)

- **`npm run dev` cannot start the CRA half in this container.** react-scripts 5 builds
  `allowedHosts: [urls.lanUrlForConfig]`, and with no LAN IP that array is `[undefined]`,
  which fails webpack-dev-server's schema: *"options.allowedHosts[0] should be a non-empty
  string."* `HOST=localhost` does **not** fix it. Use
  `DANGEROUSLY_DISABLE_HOST_CHECK=true BROWSER=none npm start` alongside a separately
  started `node server/index.js`. The backend half of `npm run dev` is fine.
- **Framing a head in the shot camera is constrained by the aim point.** With no
  `focusSubjectId` the camera aims at `DEFAULT_AIM` (0,1,0) and with one it aims at the
  figure's *mid-height*, so neither points at a 1.55 m head: at 50 mm and 2 m the frame
  simply does not reach it. The trick that worked was scaling the character to 0.62 so its
  head sits at the aim point.
- Three gates re-run clean after the change: `npx tsc --noEmit`, `npm run test:ci` (61
  passing, `poses.test.ts` still ties `poses.json` to real files), `npm run build`.

### Raised the same day, deliberately not built

The owner supplied a reference render of a sculpted anatomical base mesh (Daz/MakeHuman
class) with *"I need at least this level of realism."* That is an asset-class change, not a
tuning problem — no arrangement of primitives in the generator reaches it. It needs **no app
code** (PRD §4; §11 v1.2 already anticipates a Mixamo/MakeHuman figure dropping into the same
folder), but it does need a licensed base mesh, a rig and a DCC tool to pose it, and an
owner decision that PRD §9 item 1 explicitly reserves. Written up, with a ready-to-adopt
§11 amendment draft, in **`docs/proposal-realistic-figure-assets.md`**. `PRD.md` was left
untouched on purpose. Owner's call: **log it, don't build yet.**

## Pose mannequin — body build (2026-08-07): DONE

Owner asked for more realism than the facial landmarks gave, with a reference render of a
sculpted anatomical base mesh, then chose to push the *procedural* mannequin as far as
primitives go rather than adopt a real figure asset (that proposal stays parked in
`docs/proposal-realistic-figure-assets.md`). This is that pass: still content only —
generator plus the three `.glb` outputs, no schema, viewport or parser change.

**What the figure gained**

- **Tapered limbs.** New `roundedCone()` lathes a capsule with two different end radii, and
  `limb()` now takes `(rProximal, rDistal, length)`. Uniform capsules were the single
  biggest thing making the old figure read as plumbing — same silhouette at the shoulder and
  the wrist. **Segment totals were held identical to the capsule formula** (`length + rProx
  + rDist`, arms 0.28/0.25, legs 0.38/0.34), which is why the POSES table's `hipY` values
  still ground the feet without re-eyeballing them. Change a radius, change the length to
  match, or the figure floats.
- **Torso as a lathe profile** (`TORSO_PROFILE`): pelvis, pinched waist, broadened chest,
  shoulder shelf, spanning the same y 0 → 0.65 the capsule did, `scale.z = 0.78` so the
  section is elliptical rather than round.
- **Shoulders**: deltoid caps and clavicle bars, parented to the **torso, not the arm
  group** — they stay put when the arm swings, which is what makes a shoulder read as a
  shoulder instead of a ball joint.
- **Neck column**, and the neck joint **raised 0.72 → 0.79** (see below).
- **Hands** (palm block + thumb nub, no fingers) and **feet** (heel block + tapered toe,
  both soles flush at the old sole height).
- **Head**: cranium is now a lathe profile (`SKULL_PROFILE`) with jawline slabs and a chin.

**Two things worth knowing before touching this again**

1. **A sphere cannot have a jawline.** First attempt hung a tapered box under the sphere
   head; it vanished. Any jaw box narrow enough to *look* like a jaw is entirely inside a
   head-sized ball — at y=-0.07 the sphere's radius is still 8.6cm and the jaw's half-width
   is 6.4cm. The taper has to be in the head's own silhouette, hence the lathe. Same lesson
   as the brow: judge by render, and the silhouette column is what exposes it.
2. **Raising the neck joint to 0.79 fixed a defect that predated all of this.** The head has
   always sat 4cm inside the torso capsule; a ball had no chin so nobody noticed. Once the
   head had a chin, the chin and jaw were buried in the upper chest — the clearance check
   showed skull/jaw/chin all intersecting `torso`. At 0.79 the chin clears the collar, the
   neck column fills the gap, and the standing figure is ~1.68m rather than ~1.61m — closer
   to `framing.ts`'s `NOMINAL_FIGURE_MID_HEIGHT = 0.9` assumption, not further from it.

**Evidence**

- Valid glTF v2 via `file`: standing 155,900 B, sitting 156,344 B, crouching 156,620 B
  (up from ~94 KB — the lathes cost geometry; still trivially small).
- **Clearance check: zero intersections in any pose**, head parts against every other mesh.
  That is *better* than before this pass, which had skull∩torso (63 vertices), jawL/R∩torso
  and chin∩torso. Crouching remains the tightest and clears comfortably: skull→shoulder
  18.3cm, jaw→shoulder 18.1cm, chin→deltoid 14.2cm.
- Contact sheet (¾ figure / ¾ head / front head / silhouette × three poses): the head reads
  as a tapered skull with brow, nose, cheekbones, jaw corners and chin; the body reads with
  a waist, chest, shoulders and a neck.
- **In the viewport**, scratch scene with all three poses (deleted afterwards), key azimuth
  swept 330° → 60° via the Lighting panel: the tapered forms carry a shading gradient the
  uniform capsules never did — deltoid highlights swap sides, the chest and waist invert,
  and the facial planes flip with them.
- Gates green: `npx tsc --noEmit`, `npm run test:ci` (61), `CI=true npm run build`.

**What this is not.** It is a wooden artist's mannequin, and it is nowhere near the owner's
reference render. That gap is an asset-class gap, not a tuning gap — see the proposal doc.

## Live parse gate re-run after the merge (2026-08-08): PASS

The gate above was run against `server/parser.js` as it stood *before* the merge with
`origin/main`. That merge changed the same file — it added #5's focus-subject rule and dropped
the superseded "prop meshes are ALWAYS primitive" bullet — so proxy selection was re-verified
against the merged parser rather than assumed to have survived. Backend restarted first
(started 15:13:42 against a `parser.js` last modified 15:03:52).

Prompt: open-plan living room, early evening — sofa, bookshelf, armchair, floor lamp, dining
table with four chairs, kitchen counter, window, door, plus a television on a low cabinet, and
two characters (Maya sitting, her brother standing).

**14 props — 12 library proxies, 2 primitive fallbacks. Unchanged from the pre-merge run.**

- Proxied: `sofa`, `bookshelf`, `armchair`, `floor-lamp`, `dining-table`, `dining-chair` ×4,
  `counter`, `window`, `door`. 9 distinct prop paths + 2 pose paths, **all 11 checked against
  `props.json`/`poses.json` and against the files on disk — no invented paths**. 9 of 12 prop
  library entries exercised.
- Fallback: `low cabinet` and `television`, neither of which has a proxy. Honest fallback, and
  no `propNote` anywhere in the payload (correct — there is no such flag by design).

**Conventions held:**

- `window` at `position.y = 0.9` — the sill-height exception from its `props.json` hint applied
  again, not floored at 0. Still the subtle one, still correct.
- `television` at `y = 0.5` on a `low cabinet` whose box is exactly 0.5 m tall, both at
  x = -4.5, z = 1. Stacking is exact; every floor-standing prop is at `y = 0`.
- Every prop `scale` is `{1,1,1}` — the Milestone 3 dimensions-into-scale pattern did not recur.
- Characters got `sitting.glb` / `standing.glb` at `scale: 1`, matching the described postures.

**Also confirms the merge did not regress #5:** `camera.focusSubjectId` came back as `char_01`
(Maya, who the prompt says the shot is focused on) — a real id belonging to an emitted
character, not `[?]` and not a dangling reference.

`flaggedParams` was `["environment.weather", "lighting.rimIntensity", "camera.movement",
"camera.aspectRatio"]` — four genuinely unstated values, no false positives.

## Gel filters — fill and rim colour (2026-08-08): DONE, PRD §11 amended to v1.6 first

### What changed

- **Amendment before code, per §11.** The owner asked for temperature and gel tint on all
  three lights. Key colour already drove real shading, so extending the same information to
  fill and rim passes §11's blocking test by the same argument that already licensed key
  colour — logged as **v1.6** in PRD.md §11, plus the schema line in §5, before a line of
  code was written. Colour only: barn doors, diffusion, and cut are explicitly out.
- **Schema (`src/types/scene.ts`).** `Lighting` gains `fillColor?` and `rimColor?`, both
  optional hex, both defaulting to `#ffffff`. Optional rather than required is the whole
  backward-compat story: no `.myo` on disk has these fields, absent resolves to white, and
  white is exactly the literal the two lights used before — so nothing migrates. Same shape
  of fallback as `environment.setting`.
- **New `src/lib/lighting.ts`** — `resolveLightColor`, `kelvinToRgb`/`kelvinToHex`,
  `applyGel`, `gelledColor`, and the `GELS` table. The maths sits outside the component and
  outside `Viewport.tsx` for the reason v1.3 established: the panel and the renderer need the
  same answer, and anything inside Viewport is untestable (no WebGL under jsdom).
- **New `src/components/KelvinGelControl.tsx`** — *one* control, mounted three times in
  `PropertiesPanel` (key, fill, rim), the way `MeshEditor` already serves both characters and
  props. A fourth light would be a fourth `<KelvinGelControl>`, not new code.
- **`Viewport.tsx`:** the `AmbientLight` (fill) and the rim `DirectionalLight` take
  `resolveLightColor(...)` instead of a hardcoded `0xffffff`. Key light handling was not
  touched — it already worked.
- **Parser untouched, deliberately.** `server/parser.js` has no diff: the fields are optional,
  so an un-emitted field is the documented default. Inferring gels from mood language
  ("cold and clinical" → steel blue) is a separate decision and was **not** smuggled in here.

### Evidence

- **The four… six pre-existing scenes render byte-for-byte identically.** The repo has *six*
  `.myo` files, not four; all six were checked rather than the four the request named. Method:
  Playwright + headless Chromium (swiftshader) against the live dev stack, screenshot the
  viewport canvas, `git checkout --detach` the base commit, let CRA recompile, screenshot
  again from the same code path, check the branch back out. Every pair is **identical by
  md5**, not merely similar:

  | scene | before/after |
  | --- | --- |
  | `1c39ce18` Apartment Window Talk — Dusk | identical |
  | `4f4fefce` Pier at Dawn | identical |
  | `62a26f9c` Two Detectives | identical |
  | `7eb7999a` (exterior, rim at 0.65) | identical |
  | `af4246a5` Server Room — Night (interior) | identical |
  | `d330bdf7` Distant Figure at Sunset (rim off, fill 0.6) | identical |

  Covers interior and exterior, rim on and rim off, and a scene with a flagged `rimIntensity`.
  **Re-captured against `ef97c44`** after rebasing onto it — that commit rebuilt the pose
  `.glb` meshes, so the first round's screenshots contained different mannequin geometry and
  no longer proved anything about the current base. The re-run doubles as a harness sanity
  check: `4f4fefce` and `62a26f9c` *do* differ between the two bases (the new mannequins),
  while every before/after pair on a single base is identical. A comparison that can only
  ever say "identical" is not evidence.
- **The controls drive real shading.** Driven through the actual panel UI, not the store:
  - `af4246a5`: fill → Steel Blue @ 8000K, rim → Straw @ 3200K. Scene JSON read back as
    `"fillColor": "#92b4e8"`, `"rimColor": "#ff9d4d"`, and `keyLightColor` **unchanged** at
    `#66CCFF` — the three controls are independent.
  - `d330bdf7` (fill 0.6): fill → Congo Blue @ 12000K → `#2b279e`. The figure goes from
    fill-lit mid blue to deep blue-violet.
  - `7eb7999a` (rim 0.65): rim → Primary Red @ 2000K → `#e01a03`. The rim-lit side of the
    scene goes olive → red; the key-lit side is untouched.
- **Gates:** `tsc --noEmit` clean, `test:ci` **110/110** (78 on `08c6771` before this branch —
  `lighting.test.ts` adds 30, `sceneStore.test.ts` adds 2), `CI=true npm run build` compiled.
  Re-run on the rebased tree each time, never carried over: `main` moved three times during
  this work (`9102951`, `ef97c44`, `08c6771`) and the baseline count moved with it.
- Nothing was saved during any of this: `git status` on `scenes/` and `storyboard.json` is
  empty. No `.myo` on disk carries `fillColor`/`rimColor` yet.

### Rules worth remembering

- **`DEFAULT_KELVIN` is 6600, not the conventional 5600 "daylight".** 6600K is where the
  Helland approximation lands exactly on `#ffffff`, so the control opens agreeing with the
  field's own default. At 5600 the control would open slightly warm and moving the gel-cut
  slider alone would silently shift colour. There is a unit test asserting
  `kelvinToHex(DEFAULT_KELVIN) === '#ffffff'` — if you retune the curve, that test is the
  one that tells you the control's neutral has drifted.
- **Kelvin and gel are generators, not state.** The scene stores one hex per light and
  nothing else. Two different (temperature, gel) pairs produce the same hex, so persisting
  them would create a second source of truth for a light's colour — the same trap v1.2
  rejected for poses. Consequence: the sliders don't back-derive from a loaded hex, and read
  as their own last position until moved. That is deliberate; don't "fix" it by adding
  `fillKelvin` to the schema.
- **The brightest channel out of `kelvinToRgb` is always 255.** That's what keeps temperature
  a tint and not a dimmer — intensity stays `fillIntensity`/`rimIntensity`'s job. If a future
  edit normalises differently, changing colour temperature will start changing exposure too.
- **Byte-identical screenshot comparison works in this container and is worth the setup.**
  Headless Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` renders the viewport
  deterministically — the same scene twice produces the same md5. That makes "renders
  unchanged" a checkable claim rather than an eyeball one. Note the browser path is
  `chromium-1194`, not the `chromium` symlink dir, which has no `chrome-linux/`.
- **A §11 amendment number is not yours until you rebase onto current `main`.** This one was
  drafted as v1.5, renumbered to v1.4 to close a gap, and finally landed as **v1.6** — because
  while it was in review `main` merged its own v1.4 (prop proxy library) and v1.5 (warm/cool
  palette). Numbers are claimed by whichever branch merges first, and the number is quoted in
  code comments and test names as well as in PRD.md, so a late renumber touches ~8 files.
  Fetch `main` and read §11's last heading immediately before writing the amendment, and
  renumber as the last step before pushing rather than the first.
- **Renumbering with a blanket `sed` will corrupt someone else's history.** Rewriting `v1.4`
  → `v1.6` across STATE.md also rewrote three lines belonging to `main`'s prop-library
  section, and one comment in `Viewport.tsx` that main had just added. Check the result with
  `git diff origin/main` and confirm the shared files are *pure additions* — a `-` line in a
  file you only meant to append to is the tell.
- **Capture the "before" render with `git checkout --detach <base>`, never with `git stash`.**
  This bit during this very milestone: after the work was committed, `git stash push -- src`
  had nothing to stash, printed "No local changes to save", exited **0**, and the script
  happily screenshotted the *unchanged* tree as its "before". Every pair came back identical
  because both sides were the same code. A stash-based before/after is only valid while the
  work is uncommitted, and it fails silently the moment it isn't — so don't use it at all.
  Assert the difference exists before trusting the comparison: check that a file the change
  adds (`src/lib/lighting.ts`) is *absent* from the tree that produced the "before" shot.

## Persisted panel state flipped to fail-closed (2026-08-09): DONE, verified in-browser

`src/App.tsx` only — one line inside `usePersistedOpen(key)`, plus its comment. No store,
viewport, backend, schema, or parser changes.

```
- const [open, setOpen] = useState(() => localStorage.getItem(key) !== 'false');
+ const [open, setOpen] = useState(() => localStorage.getItem(key) === 'true');
```

Both persisted keys (`myopic.hierarchyOpen`, `myopic.propertiesOpen`) change together, because
they share the hook.

### This supersedes the 2026-08-01 "Fail open on persisted UI state" rule

**New rule: fail closed, not fail open, on persisted UI state.** `=== 'true'` rather than
`!== 'false'`. Apply this default to any future persisted chrome.

This is a deliberate reversal, not a contradiction, and the earlier rule is not wrong on its own
terms — it was written the same day the panels became collapsible, and its stated reason was
that "a corrupt key can never leave a panel hidden with no obvious way back." That premise no
longer holds: the collapsed state is a **36px rail carrying a chevron and a vertical label**
(`f58a563`, also 2026-08-01), so a closed panel is always visibly one click from reopening.
With the recovery path guaranteed by the layout, the fail-open default was buying nothing and
costing a defaulted-open panel on first run. The owner's call. Treat the 2026-08-01 rule under
"Collapsible panels + persisted collapse state" as **superseded by this section**; the section
itself is left in place as the record of why the original choice was made.

Note the read is case-sensitive and whitelist-shaped: **only** the exact string `'true'` opens a
panel. `'TRUE'`, `'1'`, and any garbage value now resolve to closed — under the old predicate all
three resolved to open. That widened set is the whole behavioural delta; an explicitly stored
`'false'` behaved identically before and after.

### Verified in-browser (fresh dev server, scene `Apartment Window Talk — Dusk` loaded)

Panels only mount when a scene is loaded, so each check below is: set localStorage → reload →
load a scene → read the grid class and the rail buttons. Interactions driven through
`javascript_tool`, buttons found by their `title` attribute, never by index (Milestone 2/4 rule).

- **Both keys absent** (cleared first, so no stale value from prior testing could mask the
  default): `grid-cols-[36px,1fr,36px]`, both rails present ("Expand Hierarchy", "Expand
  Properties"), each measuring 36×123px and visible, zero collapse chevrons. Screenshot confirms
  the real layout — both rails drawn with `»`/`«` and vertical labels, viewport filling the
  middle. No vanished or unreachable panel.
- **Expand each rail** → `grid-cols-[240px,1fr,320px]`, storage becomes `true`/`true`; **reload**
  → still expanded. Persistence works in the open direction.
- **Collapse both, reload** → storage `false`/`false`, comes back `grid-cols-[36px,1fr,36px]`
  with both rails. (Unchanged from before — an explicit `'false'` always persisted.)
- **Corrupt values** `'garbage'` / `'TRUE'` → both panels closed, and the write-back effect
  normalises storage to `'false'`. This is the case that actually diverges from the old
  behaviour, where both would have opened.

Measurement gotcha, cost some time: `window.innerWidth` read as `0` and the grid's *computed*
middle column as `2px` while the browser preview pane was backgrounded, even though the rails
measured a correct 36px and the screenshot showed a normal full-width layout. **Don't trust
computed layout widths from `javascript_tool` when the pane isn't fronted — take a screenshot to
confirm.** This is the second thing in this app found to misbehave in a hidden pane; anything
that depends on the compositor actually running should be checked visually, not numerically.

### Gates

Run twice, because the change was verified on one base and committed on another. This branch is
cut from `main`; the in-browser verification above was done on the `gel-filters-and-colour-
temperature` working tree, where `App.tsx` is byte-identical to `main`'s.

- `npx tsc --noEmit` — clean on both.
- `npm run test:ci` — **78/78, 8 suites** on this branch; **88/88, 9 suites** on the gel-filters
  branch, which carries the kelvin/parser tests `main` does not. This change adds and touches no
  tests either way.
- `npm run build` — compiled successfully on both (207.82 kB gzipped main here).

No new tests. This is App.tsx chrome, still covered by the "Deliberately untested" note in the
test-suite section — there's no React-rendering setup in the project, and the behaviour is a
one-line predicate verified in the live app above.

## Provisional focus readout verified (2026-08-08): DONE, screenshotted

Closes the one v1.3 acceptance criterion that shipped with unit tests but no visual
evidence: a flagged (`[?]`) lens or stop still computes a readout, labelled provisional.

- **The technique — a throwaway probe scene.** No fixture carries a flagged lens or stop, and
  the app has no way to *set* one (a flagged `NumberField` renders as an empty input with a
  `[?]` placeholder; flags only ever arrive from the parser). So the state was reached by
  writing a temporary `.myo` into `scenes/` with `camera.focalLength` and
  `camera.depthOfField` both `"[?]"` and `flagged_params` listing them, loading it, capturing
  it, then deleting the file. **Done in the agent's own container clone, never on the owner's
  machine**, and `git status` was confirmed clean afterwards — the six real scenes were never
  touched. Reusable for any future flagged-value UI that the app itself cannot produce.
- **Result** (probe built on `62a26f9c`'s geometry, focus subject `char_01` at 5.96m):
  both fields show the `[?]` placeholder, the header badge reads "2 params need review", an
  amber PROVISIONAL chip sits on the readout, and it prints
  `Focus at 5.96 m to char_01 · In focus 4.98 – 7.44 m · Depth 2.47 m · Hyperfocal 29.81 m`
  above the note "Computed from defaults (50mm, f/2.8) for the flagged values above".
  The ground markers still draw — a flagged lens does not suppress them.
- **Numbers re-derived independently**, not read off the panel: at 50mm f/2.8 with the
  subject at 5.96m, hyperfocal 29.81m, near 4.97m, far 7.44m, depth 2.46m. Matches to
  rounding, so the readout is computing from the real fallback constants rather than
  printing something plausible.

### Rules worth remembering

- **"Renders correctly when flagged" and "the parser ever flags it" are separate questions,
  and only the first is now answered.** Whether a real parse ever returns `"[?]"` for a lens
  or stop is still unknown — the parser prompt tells the model to *infer* reasonable camera
  defaults when the mood is clear, so it may always fill one in. If a few live parses of
  camera-silent prompts never flag, the provisional state is correct but unreachable in
  normal use, and that is worth recording rather than leaving as an untested-looking gap.
- **A UI state the app cannot itself produce is still verifiable** — write the fixture that
  produces it, capture, delete. The cost is a few minutes; the alternative is a feature that
  ships forever on the strength of a unit test. Do it in a disposable clone, and check
  `git status` afterwards.

## Parser flagging of lens/stop confirmed, and the badge that lied (2026-08-08)

Three owner-run live parses closed the open question from the previous entry — whether a
real parse ever returns `"[?]"` for a lens or stop — and turned up two findings on the way.

**The question is closed: yes, it flags.** Results:

| prompt | focalLength | depthOfField | focusSubjectId |
| --- | --- | --- | --- |
| "A woman waits in a hallway" | 50 | 2.8 | `char_01` |
| "Two people in a room" | `[?]` | `[?]` | **null** |
| "A figure in a window at night. I haven't decided on the lens or the stop yet." | `[?]` | `[?]` | `char_01` |

So the provisional readout is reachable in ordinary use, not only via a hand-built probe.
The third prompt is the useful pattern: saying the decision has not been made gets an honest
`[?]` rather than an invented lens. Note the first parse returned exactly 50mm / f2.8 — the
same values as the fallbacks, by coincidence — so that scene would look identical flagged or
not. Don't use a 50/2.8 scene to test provisional behaviour.

**Finding 1 — the viewport badge asserted a lens the director never chose.** In camera view
the corner badge rendered `num(focalLength, 50) + "mm"`, so a flagged lens displayed as a
flat `50mm`, indistinguishable from a real one, while the aspect ratio beside it honestly
showed `[?]`. That is the one place a director glances while framing, and it contradicted
the provisional labelling the panel had just been given. Now renders `[?] (50mm)` in amber —
sentinel first, the fallback actually being rendered in parentheses.

While fixing it, the two `num(scene.camera.focalLength, 50)` literals in the FOV maths were
replaced with `FALLBACK_FOCAL_LENGTH_MM`. They were a latent divergence: changing the
constant in `dof.ts` would have moved the readout and the marker positions while leaving the
rendered FOV at 50.

**Finding 2 — the focus-subject rule holds 2 of 3, and fails where the scene is symmetric.**
"Two people in a room" produced `char_01` and `char_02` but `focusSubjectId: null`, despite
the v1.3-era prompt rule requiring a subject whenever characters exist. Two unnamed,
interchangeable figures with no action to centre on — the model declined to choose.
**Deliberately not chased.** "No focus subject" is arguably the honest answer for a scene
with no subject, and tightening the prompt for symmetric two-handers costs complexity for a
case where the fallback (aim centre stage) is already correct. Recorded as observed model
behaviour, exactly the prompt-adherence question the previous entry predicted.

### Rules worth remembering

- **Check every place a flagged value can surface, not just the one you built.** The panel
  readout was carefully labelled provisional on day one; the viewport badge two files away
  quietly substituted the fallback for months of the same session. Grep for the fallback
  constant and for `num(` on the flagged field when adding a `[?]`-aware display.
- **A fallback used in more than one place belongs in a constant, immediately.** The FOV
  maths and the readout independently hard-coded 50; nothing would have caught the drift
  because both were individually correct.

## Pose grounding derived, not eyeballed (2026-08-10): DONE, all four poses at minY = 0

Closes the library-wide pass the `lying` entry above left open. The pose `.glb` files had
drifted off the base-anchored convention when the mannequin body was rebuilt (#6) underneath
`hipY` constants that had been eyeballed against the *old* capsule figure.

Measured from the committed binaries with `GLTFLoader.parse` + `Box3` under plain Node
(no jsdom, no WebGL), before and after:

| pose | minY before | minY after | height (unchanged) |
| --- | --- | --- | --- |
| standing | −0.0398 (4.0 cm **into** the floor) | 0.0000 | 1.7188 |
| sitting | +0.0302 | 0.0000 | 1.3388 |
| crouching | +0.0539 | 0.0000 | 1.2759 |
| lying | +0.0268 | 0.0000 | 0.2807 |

All 12 prop proxies measured 0.0000 before and were not touched — the convention was intact
everywhere except poses, which is what isolated the cause to the `POSES` table.

**The fix is a measurement, not four new constants.** `buildFigure()` now ends with
`root.position.y = -new THREE.Box3().setFromObject(root).min.y`. `rootLift` is subsumed by
this and is gone from the pose table; `hipY` stays but is no longer load-bearing for floor
contact — it sets pelvis height, i.e. how bent the legs read, and the grounding pass follows
whatever it produces. Heights are identical before/after, confirming the change is a pure
root translation and no geometry moved relative to anything else.

Gates green: `npx tsc --noEmit`, `npm run test:ci` (110/110, 9 suites), `CI=true npm run
build`. Verified in-browser on "Two Detectives — Office at Night" (standing + sitting
glTF poses): both figures on the floor, sitting figure still meeting the chair.

### Rules worth remembering

- **A constant tuned by eye against geometry it does not own will drift silently the next
  time that geometry changes.** `hipY` and `rootLift` were both correct when written and both
  wrong within two days of the body rebuild, with nothing failing in between. Where the
  correct value is *computable from what was built*, compute it — the derived form cannot go
  stale, and it removes the "verified visually in the viewport, not derived" caveat the old
  `POSES` comment carried as a standing invitation to re-eyeball.
- **Measure the whole library before fixing one member of it.** Re-tuning `lying` alone (the
  pose that prompted this) would have made it the only grounded figure of four. The one-line
  Node measurement across poses *and* props is what turned "lying floats" into "the pose
  generator lost the convention, props never did".
- **This invalidates pose screenshot baselines, by design.** Rendered figures shift by up to
  5.4 cm. Any byte-comparison baseline from the gel-filter milestone that contains a pose
  proxy is expected to differ; that shift *is* the correction.

## Pose grounding regression test (2026-08-10): DONE, negative-controlled

`poses.test.ts` now loads every pose `.glb` with `GLTFLoader` and asserts
`Box3.min.y` is within 1 mm of 0, plus `max.y > 0.1` so an empty scene graph cannot pass
the grounding check trivially. A convention assertion, not a byte baseline: it stays true
across any legitimate pose edit, where a frozen hash would need re-blessing every time.

**Negative-controlled, both ways** — a test that has never been seen to fail is not evidence:

- Restored `main`'s pre-fix `standing.glb` (minY −0.0398) → **fails**, reporting
  `{ pose: "standing", grounded: false }`. Restored the fixed file → passes.
- Restored the stale 87 KB `lying.glb` from `e9fde69` → **passes**.

**That second result corrects the plan's premise.** The claim was that this one assertion
would have caught the stale binary *and* the anchoring bug. It catches only the anchoring
bug. The 87 KB file was the pre-rebuild crude figure, and it was *correctly grounded* — its
constants matched the body it was built against. Staleness and grounding are independent
failures, and the suite still cannot see staleness. The check that would is
regenerate-and-compare (the generator is deterministic — verified when `lying` was rebased),
which is not a frozen hash and never needs blessing. Not built; logged as open.

### The jsdom spike: it works, at the cost of three shims

The plan reserved a fallback to a `scripts/` check if `GLTFLoader` fought the sandbox. It
fought, but every round was winnable and the test stays in the suite (one gate, not two):

1. **`three/examples/jsm` is untransformed ESM.** CRA does not transform `node_modules`, so
   the import died on `Cannot use import statement outside a module`. Fixed with a
   `jest.transformIgnorePatterns` override in `package.json` (a CRA-supported key) carving
   out `three/examples/jsm/`. **Arrays REPLACE rather than merge** in
   `createJestConfig.js` — CRA's second pattern (`^.+\.module\.(css|sass|scss)$`) has to be
   copied into the override by hand or CSS-module transforms break. Objects *do* merge
   gracefully, which is why the `moduleNameMapper` entry below is safe.
2. **No `TextDecoder` in Jest 27's jsdom** — the same generation gap as `structuredClone`.
   Backfilled from `util` in `src/setupTests.ts`, alongside it.
3. **The realm trap, and the one that will cost someone an hour.** `GLTFLoader.parse()`
   gates its binary path on `data instanceof ArrayBuffer`. An ArrayBuffer from Node's `fs`
   belongs to a different realm than the jsdom sandbox's `ArrayBuffer`, so the check is
   false, the loader falls through to treating the raw buffer as an already-parsed glTF
   object, and it reports **"Unsupported asset. glTF versions >=2.0 are supported."** on a
   valid file. The error names the wrong problem entirely: the bytes were fine, and a
   hand-rolled decode of the same buffer in the same test printed
   `{"version":"2.0","generator":"THREE.GLTFExporter"}` two lines earlier. `Uint8Array.from(buf).buffer`
   re-allocates inside the sandbox realm and it loads.

Also added `moduleNameMapper: {"^three$": ".../build/three.cjs"}`. Jest 27 ignores the
`exports` field, so bare `three` resolved to `main`, which is the deprecated UMD
`build/three.js` — it printed a "deprecated with r150+, will be removed with r160" warning
on every run of any suite importing three. Mapping to the `require` target the exports map
already names silences it and uses the build three intends for CJS consumers.

Gates green: `npx tsc --noEmit`, `npm run test:ci` (111/111, 9 suites), `CI=true npm run build`.

### Rules worth remembering

- **Run the negative control on both failures the test is claimed to cover, not one.** The
  grounding assertion was justified by two past incidents; it demonstrably catches one of
  them. Reverting each real artefact and watching the test fail took two minutes and stopped
  a false claim of coverage from entering this file.
- **A glTF "unsupported asset" error under Jest is a realm mismatch, not a bad file.** Check
  `data instanceof ArrayBuffer` before you check the bytes.
- **CRA jest overrides: arrays replace, objects merge.** Copy the defaults you still want out
  of `react-scripts/scripts/utils/createJestConfig.js` when overriding an array key.

## Blender spike — headless → .glb → viewport (2026-08-10): PASS, source-agnostic

Plan §4.3's de-risking run, done before the licence fork and with no base mesh chosen. No
PRD amendment yet — §11 v1.7 is required before the *pipeline* lands; nothing here touches
app code, `poses.json`, or the committed pose library.

`scripts/blender/spike-export.py` builds its own geometry (an orientation probe, and
Suzanne), grounds it, and exports `.glb` under
`Blender --background --factory-startup --python`. Blender 5.2.0 LTS, its own Python
3.13.13. `scripts/measure-glb.mjs` is the acceptance harness — the §2.2 grounding
measurement pointed at arbitrary files, reporting instead of asserting, which is what a
pipeline spike needs.

| file | y bounds | grounded |
| --- | --- | --- |
| orient-probe.glb | 0.0000 → 0.4500 | yes |
| suzanne.glb | 0.0000 → 1.5750 | yes |

**Grounding survives the export.** Dropping the objects so their world min-Z is 0 *in
Blender* lands at exactly `min.y = 0` in the `.glb`. The convention is enforceable at the
exporter, the same place the procedural generator enforces it.

**The axis landmine did not fire, and §4.4 overstated it.** The probe carries a named cone
on Blender **−Y** (the direction a Blender figure faces) and a marker on Blender **−X**.
Measured in the exported file:

| marker | Blender | glTF |
| --- | --- | --- |
| nose | (0, **−0.8**, 0.3) | (0, 0.3, **+0.8**) |
| leftmark | (**−0.8**, 0, 0.3) | (**−0.8**, 0.3, 0) |

So the default export maps `(x, y, z)_blender → (x, z, −y)_glTF`: a −90° rotation about X,
**not** a mirror. A Blender figure facing −Y arrives facing **+Z**, which is exactly the
app's convention — with the exporter's defaults and no flags. Determinant is +1, so there is
no handedness flip to hunt for in a limb that comes out the wrong way round.

**Viewport confirmed, and it re-materials as PRD §11 promises.** Temporarily swapped
Suzanne in over `standing.glb` and loaded "Two Detectives — Office at Night": she renders
standing on the floor at the right scale, in warm palette grey rather than her own exported
material — `LIBRARY_PATHS` picked her up because the *path* is in `poses.json`, with no code
change. `git checkout` restored the file; re-measured all four poses at `min.y = 0` after.
Gates re-run green (111/111).

### Rules worth remembering

- **Measure the axis convention with a named asymmetric marker, don't reason about it.**
  Two named nodes and one export answered in five minutes what §4.4 budgeted an hour of
  confusion for, and answered it *against* the plan's expectation. Reading the exporter's
  own axis settings would not have shown the composed result.
- **`--factory-startup` is not optional**, and neither is doing the grounding inside the
  export step. Both push a class of "works on my machine" failure out of the pipeline
  before it exists.
- **A spike that fakes the source is still a real spike.** Nothing in the mechanical chain
  — headless invocation, grounding, axes, palette re-material, viewport load — depended on
  which mesh went in, which is precisely why the licence decision can wait for the fork.

### Open / not yet known

- **Size is unmeasured for a real asset.** Suzanne is 69 KB, but she is low-poly; §4.4's
  1–5 MB per pose estimate is untested and the `assets-src/` storage question stays open.
- **Rigging and posing are untouched.** The spike exports static geometry. Applying the four
  library poses to an authored figure (Rigify or an already-rigged source) is the part of
  §4.2 that is still all risk.

## Blender pose pipeline (2026-08-10): BUILT — the library is authored figures now

PRD §11 v1.7's authorized items 1–5, built and verified. `scripts/blender/build-pose-glbs.py`
imports the CC0 Blender Studio base mesh, fits a measured skeleton, poses it, bakes the pose
into static geometry, grounds it, and exports all four `.glb`s. `npm run build:poses` wraps it.
The four figures in `public/assets/poses/` are now authored geometry: **500 KB each, 2.0 MB
total**, up from ~156 KB each.

**Nothing rigged ships.** The armature modifier is applied per pose and the rig is deleted
before export (`export_skins=False`). Non-goal #7 is intact — the rig is a pipeline artefact.

**Storage decision (v1.7 item 4), now that the numbers are real:** the four `.glb`s are
committed (2.0 MB total — trivial); the 48 MB source bundle is gitignored in `assets-src/`
with a README naming the source and licence. Neither LFS nor a fetch script is warranted.
No network access at build time, deliberately: a missing bundle fails with directions.

**Item 5:** `generate-pose-glbs.mjs` is kept as the no-Blender fallback and its header now
says so in the first line — running it by reflex silently replaces the authored figures with
primitive mannequins.

Verified: all four `min.y = 0.0000` via `measure-glb.mjs`; standing 1.690 m; seated hip lands
at 0.476 m (chair height); in-app screenshots of all four poses, palette-grey and grounded,
switched live through the properties-panel pose selector. Gates green (111/111).

### Three failures, and what each one actually was

Worth reading before touching this script — none of the three presented as what it was.

1. **The figure folded in half instead of sitting.** Presented as a broken pose; was a broken
   *pivot*. `pose_bone.matrix_basis` is relative to the bone's rest position **and its
   parent's pose**, so conjugating a world-space rotation with the bone's own rest matrix is
   only correct for unparented bones. Every child bone pivoted about the armature origin
   instead of its own joint, putting the seated figure's feet 1.4 m in front of its hips.
   Fixed by posing through `pose_bone.matrix` (armature space) about the bone's own head,
   strictly proximal → distal with a depsgraph update between each — rotating a parent moves
   its children's heads, and `pb.matrix` reads that head.

2. **Every vertex bound to one bone, and every "measurement" was a fallback.** The bundle
   lays its 17 meshes out in a row, so this figure arrives at **x ≈ -2.26**, and
   `transform_apply` bakes that offset into the vertices. Every `v.x > 0` test in the
   landmark code matched nothing; the scans quietly returned their fallback values, the
   bones were built around x = 0 in empty space, and bone-heat weighting — which needs bones
   *inside* the mesh — collapsed all 10,582 vertices onto `forearm.R`. One line (centre in
   plan before measuring) fixed the measurements, the bones, and the binding at once.
   **The tell was in the numbers long before it was visible:** every `limb_x` came back as
   exactly `0.1`, the fallback constant.

3. **The knee is not measurable, and pretending otherwise found noise.** A straight leg has
   no narrow point at the knee — the smoothed width profile rises monotonically from calf to
   thigh. The first attempt scanned at the natural slice tolerance and "found" a minimum that
   was a sparse quad ring, not a thin part of the body, putting the knee 6 cm high and the
   seated figure on a bar stool. The ankle *is* a real minimum and stays measured, over a
   band thicker than the mesh's vertex spacing. The knee is now an explicit ratio between two
   measured landmarks, labelled as the one cheat at the point it happens.

### Rules worth remembering

- **A fallback that returns a plausible number is worse than a crash.** All three bugs above
  survived because something returned 0.1, or a range midpoint, instead of failing. If a
  landmark cannot be measured, that should be loud.
- **Check where the source file parks its geometry before measuring anything.** An asset
  library laid out in a row is normal; code that assumes origin-centred is the anomaly.
- **`matrix_basis` for posing is a trap on any parented bone.** Use `pose_bone.matrix`.

## Second figure in the pose library (2026-08-10): PRD §11 v1.8, built

Eight poses now: four on `GEO-body_male_realistic`, four on `GEO-body_female_realistic`,
both from the same CC0 bundle. `public/assets/poses/` is 4.0 MB — 500 KB per file, evenly.

**The female figure exported 2.9× larger until shading was normalised**, and the cause is
worth knowing because it is invisible in Blender. Both source meshes have identical topology
(10,582 verts, 10,590 quads), but the female ships with split normals; glTF cannot share a
vertex between faces that disagree about its normal, so the same 21,160 triangles needed
42,340 vertices against the male's 12,010. Clearing custom split normals and shading smooth
before export fixes the size *and* a real appearance bug — two figures in one shot that catch
the light differently read as two kinds of object rather than two people.

**This needed an amendment, and nearly did not get one.** v1.2's "still out" list names
**body-type variation** in the same breath as rigging and facial expression. v1.7 did not
touch that — it swapped one figure for a better one. A second figure of a different build is
precisely what v1.2 ruled out, so v1.8 reopens it explicitly and narrows v1.2's line in
place. The tell that this was not just content: the request sounded like "add a row to the
library", which v1.2 blesses outright, and the prohibition was two amendments away from the
thing being edited.

**Each figure is measured and rigged separately**, which the numbers justify — the two bodies
are not a scale factor apart:

| | male | female |
| --- | --- | --- |
| height | 1.690 | 1.639 |
| crotch | 0.755 | 0.740 |
| armpit | 1.308 | 1.246 |
| ankle | 0.108 | 0.120 |

Sharing one skeleton would have put the female figure's shoulders 6 cm above her armpit.

**Naming: the original four paths keep their meaning.** Saved `.myo` files reference
`/assets/poses/standing.glb`; renaming to a symmetric `-male`/`-female` pair would read
better and would break every one of them, and those files are the user's data. So the bare
names are the **default** figure — not "the male figure" — which is also the only phrasing
that gives the parser a rule it can apply. `-female` is chosen when the description indicates
a woman. The hints in `poses.json` carry that instruction; `server/parser.js` builds its pose
list from the file and needed no code change.

**Verified:** all eight `.glb`s at `min.y = 0`; a live parse (against a **restarted** backend
— `parser.js` requires `poses.json` at load, so the running one had the old four) of "A woman
stands… A man crouches…" returned `standing-female.glb` and `crouching.glb`; the existing Two
Detectives scene still loads and renders its original `standing.glb` unchanged; both figures
screenshotted together in one shot, palette-grey and grounded. Gates green (111/111 —
`poses.test.ts` iterates `poses.json`, so it now grounds-checks all eight without an edit).

### Rules worth remembering

- **A prohibition can live two amendments away from the thing you are editing.** The block on
  this was in v1.2's "still out" list, not in v1.7 which built the pipeline. Grep the whole of
  §11 for the *capability*, not just the section you are working in.
- **A test that iterates a manifest scales for free.** Adding four assets added four grounding
  assertions with no test edit. Worth preferring over enumerating cases when the manifest
  already exists.

---

## 10 August 2026 — day summary

The whole of `docs/plan-2026-08-10.md` shipped, plus one thing the plan did not contain. Six
PRs merged; `main` at `6482140`. Detail lives in the six sections above — this is the index
and the scorecard, not a retelling.

| # | what | plan est. | section |
| --- | --- | --- | --- |
| [#13](https://github.com/saintgrego/myopic-studio/pull/13) | Derived grounding + the regression test that guards it | 1 h 45 | *Pose grounding derived* / *regression test* |
| [#14](https://github.com/saintgrego/myopic-studio/pull/14) | Blender spike, source-agnostic | 1.5–2 h | *Blender spike* |
| [#15](https://github.com/saintgrego/myopic-studio/pull/15) | The plan itself, committed | — | — |
| [#16](https://github.com/saintgrego/myopic-studio/pull/16) | PRD §11 v1.7 amendment | — | — |
| [#17](https://github.com/saintgrego/myopic-studio/pull/17) | The pipeline; library becomes authored figures | 2–3 h | *Blender pose pipeline* |
| [#19](https://github.com/saintgrego/myopic-studio/pull/19) | PRD §11 v1.8 + second figure | **not in the plan** | *Second figure* |
| [#20](https://github.com/saintgrego/myopic-studio/pull/20) | Corrected the stacked-PR note | — | *Stacked PR* bullet, 4 Aug section |

**Where the pose library ended up:** eight authored `.glb`s from the CC0 Blender Studio base
meshes, 500 KB each, 4.0 MB total, all at `min.y = 0` and facing +Z, rebuildable with
`npm run build:poses`. PRD §9 item 1 is closed. Item 2 (Daz round-trip) is the only
deliberately-open item left.

### The plan's predictions, scored

Recorded because the pattern is more useful than any single item: **every estimate the plan
made about difficulty was wrong in both directions, and the measurements were what settled
each one.**

- **§4.4's axis landmine — did not fire.** Budgeted an hour of confusion; cost five minutes,
  and the default export was already correct. A named asymmetric marker answered it.
- **§4.4's size estimate — 6× pessimistic.** 1–5 MB per pose predicted; 500 KB actual. That
  is what made the storage decision (item 4) trivial rather than a Git LFS conversation.
- **§2.2's coverage claim — wrong.** The grounding assertion was justified by two past
  incidents and demonstrably catches one. Reverting both artefacts took two minutes.
- **The real cost was somewhere the plan never looked: rigging.** §4.2 called the pipeline a
  shape; the three bugs that actually consumed the afternoon were a Blender posing-API trap,
  a source file parked 2.26 m off the origin, and a knee that cannot be measured. None were
  foreseeable from the plan, and all three surfaced as *plausible wrong numbers* rather than
  errors.

### The one thing worth carrying forward

**Fallbacks that return plausible values cost more than every other class of bug today.**
`limb_x` returning `0.1`, landmark scans returning range midpoints, `arm_chain` returning a
hardcoded T-pose, `GLTFLoader` treating a foreign-realm buffer as a parsed document — each
produced output that looked like an answer. The grounding work at the start of the day and
the rigging work at the end were the same lesson twice: *derive the value, and make the
un-derivable case loud.*

## Camera aim height now follows shot type (2026-08-10): fixed in framing.ts

Found by parsing a beach-house scene that asked for "med-close, both women visible from
about chest up" and getting a full-length shot instead. Not a parser problem — the request
was unrepresentable.

`aimPointForCharacter()` aimed at `NOMINAL_FIGURE_MID_HEIGHT` (0.9 m — hip height) for
*every* shot, and `lookAt` puts the aim point at the exact centre of frame. So the frame was
always vertically centred on the hips, and including a 1.7 m figure's head required a frame
half-height of 0.8 m, which drags the bottom of frame down to the ankles. **No camera
position and no focal length can fix that** — moving the camera scales both halves of the
frame together. The low-angle escape (aim below the subject so the frame rides up) needs the
camera under 1 m looking upward, which contradicts an Eye Level shot.

**Shot type now drives the aim**, because it is the field that already declares how tight the
framing is. `AIM_FRACTION` maps each shot to the fraction of subject height the frame centres
on — ECU 0.94 (eye line) down to LS/ELS at mid-height — and `aimPointForCharacter` multiplies
it by the subject's height (exact for a primitive, the nominal 1.7 m figure for a `.glb`,
whose real bounds are not known synchronously: GLTFLoader is still in flight when the camera
is positioned).

**Backward compatibility is derived, not asserted.** The wide-shot fraction is
`NOMINAL_FIGURE_MID_HEIGHT / NOMINAL_FIGURE_HEIGHT`, so a `.glb` figure in an LS/ELS — or
with a flagged or absent shot type — aims *exactly* where it did before. Writing the obvious
`0.53` instead would have missed by a millimetre and silently re-framed every existing wide
shot. A primitive character does shift, by 0.029 of its height (~5 cm on a 1.8 m capsule),
because its old aim was its exact geometric centre; immaterial at wide framing, but recorded
because it is a shift rather than a no-op.

**Verified:** the same beach-house scene at MCU, camera (0, 1.45, 0.55), 50 mm — both figures
framed mid-chest up with heads in frame, which was unreachable at any camera position before.
Gates green: `npx tsc --noEmit`, **114/114** (was 111), `CI=true npm run build`.

### Rules worth remembering

- **`lookAt` centres the aim point, so aim height alone bounds what a shot can contain.**
  Reach for the aim before reaching for the lens or the camera position — the other two
  cannot compensate for it.
- **When a change is meant to preserve old behaviour, derive the constant that preserves it.**
  `0.9 / 1.7` is exact; `0.53` is a millimetre off and would have moved every saved wide shot
  by a hair for no reason. Same rule as the pose grounding fix, one file over.

## Set pieces (2026-08-11): PRD §11 v1.9, schema + viewport, built

Walls, floors, ceilings, doors and windows, placed by hand and toggled by category. Scope
was fixed by the implementation prompt and deliberately narrow: **no parser inference, no
runtime open/close control, no per-piece visibility.** The pose/figure pipeline (v1.7/v1.8)
and the Kelvin/gel work (v1.6) were not touched.

**The PRD amendment did not exist when the work started.** The prompt cited "PRD.md v1.9"
as its authorization, but §11 ended at v1.8 — the amendment was written as part of this
change (§10 requires the decision to be logged, not assumed). Two other details in the
prompt did not match the repo and were resolved rather than guessed at:

- **"reuse existing `Transform` type — do not redefine"** — there was no `Transform` type
  anywhere in `src/`. Characters and props carry `position`/`rotation`/`scale` flat, because
  the parser writes them that way and their positions can be flagged `[?]`. `Transform` is
  therefore *introduced* in `src/types/scene.ts`, matching those conventions (rotation in
  degrees, plain `Vec3` — a set piece is never parsed, so it has no sentinel to resolve).
- **"follow existing panel pattern in App.tsx"** — App.tsx's pattern is two collapsible grid
  columns with a 4-way `grid-template-columns` switch; a third would make it 8-way. Set
  visibility is a *scene property*, and this app already navigates to those through the
  hierarchy, so `SetsPanel` is selection-driven (`{kind:'sets'}`) and renders inside the
  Properties column like Lighting and Camera do. No new persisted collapse state, so
  `usePersistedOpen` is untouched — the 2026-08-09 fail-closed fix stands.

**Where the code went, and why not in Viewport.tsx.** `src/lib/sets.ts` holds the defaults,
the category mapping, and the group builder; Viewport.tsx calls `buildSetGroups(scene)` in
one line and adds the result to `contentGroup` (so the existing `disposeObject3D` frees it).
Same reason `dof.ts` and `framing.ts` exist: anything inside Viewport.tsx is untestable by
construction. Plain Three.js objects — no renderer, no WebGL — run fine under jsdom, so the
group/visibility contract is asserted directly rather than screenshotted.

**Decisions worth keeping:**

- **A set piece is a box, not a `mesh` reference.** Poses and props are library glTFs because
  a sitting figure can't be described parametrically. A wall can — three numbers and a
  transform. An `/assets/sets/wall.glb` would buy an asset pipeline and answer nothing.
- **Colour by surface, not by index.** `materialRef` → a step in `COOL_GREYS`
  (`SET_MATERIALS` in `palette.ts`). v1.5 cycles props by array index so neighbours differ;
  that is exactly wrong for a room, whose four walls are one surface and must read as one
  value however many pieces built them. Unknown ref → `NEUTRAL_GREY`, never a warm grey.
- **Base-anchored, like everything else.** `transform.position.y` is where the piece meets
  the floor; the box is lifted by half its height inside its group. A ceiling at 2.7 sits its
  underside at 2.7. `height` is the Y extent always — for a floor slab that means thickness.
- **An open door swings on its hinge.** `state` is fixed at placement (no runtime control,
  per the scope constraint), but drawing an open leaf flush in its frame answers the wrong
  question: whether the leaf is in shot and whether it blocks the sightline is the whole
  reason the piece is there. Pivot is the leaf's -X edge, 75°.
- **`depth: 0` clamps to 1 mm, it does not pass through.** BoxGeometry accepts a zero extent
  and NaN happily and produces geometry with no volume — invisible, and the NaN propagates
  into the bounding sphere and breaks frustum culling for the *whole scene*. Same class as
  the fallbacks-that-return-plausible-values lesson from 10 August: the degenerate case has
  to be made loud, or clamped honestly. `resolveDimensions()` clamps; `MIN_SET_PIECE_EXTENT`
  is 0.001.

**Backward compatibility, proven against real files rather than a fixture.** Defaults land
at the two load boundaries — `withSetDefaults()` in `sceneStore.loadScene` (covers both the
parser path and the disk path) and `fromMyoEnvelope()` in `server/myoFormat.js` (CommonJS
duplicate of the same rule; the src/server split is pre-existing). Evidence, from a live
backend on :4011:

```
--- legacy file keys on disk:
scene_id, title, created, prompt, environment, lighting, camera, characters, props,
storyboard_notes, flagged_params          <- no sets, no set_visibility
--- same file loaded through GET /api/scenes/1c39ce18-….myo:
{"sets":[],"setVisibility":{"walls":true,"floors":true,"ceilings":true,"doors":true,"windows":true}}
--- file on disk after load:  (git status scenes/ — clean, nothing rewritten)
```

Save path, same backend, a scene carrying four pieces with `ceilings: false`:

```
--- top-level keys written to disk:
scene_id, title, created, prompt, environment, lighting, camera, characters, props,
sets, set_visibility, storyboard_notes, flagged_params
set_visibility: {"walls":true,"floors":true,"ceilings":false,"doors":true,"windows":true}
sets[2]: {"kind":"door", …, "dimensions":{"width":0.9,"height":2.05,"depth":0.05},
          "materialRef":"wood","state":"open"}
--- read back through GET:  sets: 4 | ceilings hidden: true
```

The temporary `.myo` written for that check was deleted; `scenes/` is back to its eight
files and `git status scenes/` is clean. `sets` and `set_visibility` are snake_case at the
top level per §7.1, camelCase inside, like every other key.

**Unit-test evidence for the toggles.** `src/__tests__/sets.test.ts` (33 cases) drives it
directly: a piece in each of
the five categories, then `test.each(SET_VISIBILITY_KEYS)` hides one category at a time and
asserts the other four groups stay visible *and* that no mesh inside any group ever carries
its own `visible: false` — the category-only rule, asserted rather than assumed. Also
covered: empty `sets` → five empty groups and zero geometry; a scene missing both fields
entirely; `depth: 0` → a 1 mm plane with finite bounds; a whole scene of `{0, NaN, -1}`
dimensions building without NaN; base-anchoring and degree-rotation; the every-`.myo`-on-disk
manifest test (iterates `scenes/`, so a file added later is covered without editing the test).

**Screenshotted in the running app** (`npm run dev`, headless Chromium + WebGL via
SwiftShader, driven with Playwright from a scratch directory — nothing added to the
project's dependencies). A temporary 8-piece scene (3 walls, floor, ceiling, an open door,
two windows) was POSTed through the real `/api/scenes` route, loaded through the UI, and the
categories toggled by clicking their labels:

- `docs/set-pieces-room.png` — eye level, ceiling off. Room reads as a room: back wall with
  two window panels, side walls in different greys (`brick` / `concrete` / `plaster` all
  land on distinct cool steps), floor, two figures inside it.
- `docs/set-pieces-plan-view.png` — near plan view, ceiling off. The **open door leaf is
  visibly swung on its hinge**, which is the whole reason `state` renders at all.
- `docs/set-pieces-walls-hidden.png` — same angle, walls unchecked. Floor, door and both
  windows stay exactly where they were; only the walls vanish. This is the category-only
  rule with nothing else moving.

Both the `Ceilings` and `Walls` checkboxes and the `Hide all sets` button were exercised in
the same session; the panel's counts (`Walls (3)`, `Windows (2)`, …) come out right. The
temporary `.myo` was deleted afterwards — `scenes/` is back to its eight files.

**Two things the screenshots settled that the tests could not.** With the ceiling *on*, the
default free-view camera (4, 3.5, 6) sits inside the box looking at the underside of a
ceiling slab — the first frame is nearly black. That is not a bug, it is what a ceiling
does, and it is the clearest possible argument for why category toggles had to ship in the
same change rather than later. Second: the figures in that old scene render as capsules
because *that scene* stores primitive meshes (it predates the pose library) — not a
regression in the pose pipeline. Checked before believing it.

**Gates, in order, all green:** `npx tsc --noEmit` clean · `npm run test:ci` 151 passed,
10 suites · `CI=true npm run build` compiled successfully.

**Gotcha — `npm run dev` dies instantly in a web session.** CRA's dev server exits with
`options.allowedHosts[0] should be a non-empty string`, which reads like a webpack config
bug and is not one: the container exports `HOST` as an *empty string*, and CRA passes it
straight into `allowedHosts`. `HOST=localhost npm start` fixes it. Nothing in the repo needs
changing — do not "fix" this by editing config.

**Gotcha — Playwright's npm package and the container's Chromium disagree.** The
preinstalled browser is build 1194; a fresh `npm i playwright` wants 1234 and tells you to
run `npx playwright install`, which the environment forbids. Pass
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` instead. WebGL needs
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; with those, the
viewport renders for real (GL renderer reports `WebKit WebGL`, canvas 958×698). Wait on
`requestAnimationFrame` ticks, not `waitForTimeout`, before screenshotting.

**Gotcha for the next person:** `node_modules/` was not installed in this container and
`npx tsc` silently resolved a *global* TypeScript 6.0.2, which failed on
`moduleResolution: node10` and looked like a real tsconfig problem. It is not — that file is
pinned deliberately (react-scripts rewrites it). Run `npm install` first and confirm
`npx tsc --version` says **4.9.5** before believing anything the typechecker says.

## Set pieces, second pass (2026-08-11): adopted the `set-pieces` branch's vocabulary and panel

**How this came about, because the process failure is the useful part.** PR #25 built v1.9
from an implementation prompt that cited "the existing `Transform` type" and "§3 of the
amendment". Neither was on `main`, so both were treated as holes in the brief and filled:
`Transform` was introduced, and a v1.9 amendment was written from scratch. **Both already
existed — on the unmerged `origin/set-pieces` branch (`1e18583`, 9 August), which is a
complete implementation of this same feature**, carrying the real amendment text
(`PRD.md:402`, numbered §1–§5, status *Proposed*), a `Transform` type, its own `sets.ts`,
a 190-line test file, and a STATE.md entry.

The branch list was visible in this session before #25 was opened and was not read.
**A remote branch whose name matches the feature you are about to build is worth thirty
seconds** — `git log origin/<branch>` would have turned the whole task into a review.
Nothing was lost (#25 is merged and green), but two of its stated findings — "the amendment
does not exist", "there is no `Transform` type" — were true only of `main`, and the PR body
and this file both said so more broadly than the evidence supported.

**What was adopted here**, on the owner's call after the two implementations were compared:

- **`materialRef` vocabulary**, from `origin/set-pieces`. `SET_MATERIAL_REFS` is
  `cool-0` … `cool-4` — the ramp position by name — and an unrecognised ref cycles by the
  piece's index in `scene.sets`. This replaces the merged version's semantic surfaces
  (`brick`/`concrete`/`wood`/`glass`/`plaster`) with a fixed `NEUTRAL_GREY` fallback.
  `setPieceColor()` takes `(materialRef, index)` now.
  **Why the position wins:** a surface name promises a material §11 does not allow the
  renderer to deliver, and its fallback has to be one fixed value, which merges two adjacent
  hand-named walls into a single silhouette. Index-cycling degrades toward legibility.
  "A room's four walls read as one value" survives as something the author *states* by
  giving them the same ref, rather than something the vocabulary implies.
  The index is the position in `scene.sets`, never a filtered counter — asserted directly,
  since that fallback is the one thing here that could break the v1.5 rule.
- **Panel placement**, from the same branch. Sets is now an accordion sharing the left column
  with Hierarchy (`leftOpen = hierarchyOpen || setsOpen`, each with its own fail-closed
  `usePersistedOpen` key), not a `{kind:'sets'}` selection rendered in Properties. The
  selection kind, its hierarchy node and the PropertiesPanel branch are all removed.
  Category visibility is a viewing mode you work *through* while looking at something else,
  which is what makes it a standing control rather than a selected object.

Untouched: the schema, the group/visibility contract, backward compatibility, base
anchoring, the hinge swing, and the dimension clamp. `PRD.md`'s v1.9 amendment is rewritten
where it argued for the vocabulary that lost — the old reasoning is left visible and marked
as overturned rather than deleted.

**Also still open, and not this change's to decide:** `origin/set-pieces` carries one commit
that is genuinely unmerged and not duplicated by #25 — `ac1b99f`, "Aim the shot camera by
shot type, not always at mid-height" (`framing.ts`). It also sits alone on
`origin/camera-aim-height`, cleanly on top of current `main`, so it is not at risk.

**Gates:** `npx tsc --noEmit` clean · `npm run test:ci` 151 passed, 10 suites ·
`CI=true npm run build` compiled successfully.

**Jest trap, cost ~10 minutes:** `test.each(ARRAY)('…', (ref, i) => {…})` over an array of
plain values times out at 5000 ms on every case rather than failing. Jest reads the second
parameter as a `done` callback and waits for a call that never comes. Declare exactly one
parameter.

**Screenshots refreshed** (`docs/set-pieces-*.png`) — the originals showed the panel in the
Properties column, which no longer exists. The new set covers the case the accordion has to
get right: **Sets open with Hierarchy collapsed**, where the left column must widen for Sets
alone rather than staying a 36 px rail.

## 11 August 2026 — day summary

Set pieces shipped (PRD §11 v1.9), and the day's real lesson had nothing to do with them.
Four PRs merged; `main` at `4a27f0d`. Detail is in the sections above — this is the index
and the scorecard.

| # | what | section |
| --- | --- | --- |
| [#25](https://github.com/saintgrego/myopic-studio/pull/25) | Set pieces: schema, viewport groups, panel | *Set pieces … built* |
| [#26](https://github.com/saintgrego/myopic-studio/pull/26) | Adopted `set-pieces`' materialRef vocabulary and panel placement | *Set pieces, second pass* |
| [#27](https://github.com/saintgrego/myopic-studio/pull/27) / [#24](https://github.com/saintgrego/myopic-studio/pull/24) | Camera aim by shot type — **the same commit merged twice** | *Camera aim height* |
| [#28](https://github.com/saintgrego/myopic-studio/pull/28) | CLAUDE.md: remote branch deletion is blocked in web sessions | — |

Closed unmerged: [#23](https://github.com/saintgrego/myopic-studio/pull/23) (the original
set-pieces PR, superseded) and the duplicate half of the camera-aim pair.

**Where set pieces ended up:** `sets` + `setVisibility` on `SceneFile`, five category groups
in the viewport, an accordion panel sharing the left column with Hierarchy, `materialRef`
naming a cool-ramp position, and every pre-v1.9 `.myo` loading unchanged with no file
rewritten. 154 tests, all three gates green.

### The thing that actually went wrong

**Two of the four PRs rebuilt work that already existed in this repo, and both were
avoidable by reading.** v1.9 had already been implemented on `origin/set-pieces` (PR #23,
open, 9 August), carrying the PRD amendment text and the `Transform` type that #25's brief
referred to. #25 read the brief's references to both as *gaps in the brief*, wrote its own
amendment, introduced its own `Transform`, and reported to the owner that neither existed —
a claim that was true only of `main`. Then #27 cherry-picked `ac1b99f` onto `main` without
noticing PR #24 was already open for exactly that commit; both merged, and #24's squash
landed as an empty commit.

The branch list was on screen before #25 was opened. It was read as names, not as work.

- **`git ls-remote` is not the check. The open PR list is.** A branch tells you code exists;
  an open PR tells you someone already decided what it should be, argued for it in prose, and
  is waiting on a response. `#25` would have been a review instead of a rewrite.
- **A brief that references something you cannot find is evidence you are looking in the
  wrong place** — not evidence the reference is wrong. Two references, both "missing", both
  present one branch over, and the pattern still read as a defective brief.
- **The duplicate was not free even though it merged green.** It produced a competing v1.9
  amendment in `PRD.md`, a second `materialRef` vocabulary that would have rendered saved
  scenes differently, and an empty commit in `main`'s history. #26 exists only to undo the
  first two.
- **State before commenting.** The "closing as a duplicate" comment on #27 was posted without
  re-reading its state; it had already merged, so the comment had the direction of the
  duplication backwards and had to be corrected in place.

### What the second pass changed, and why it was right

The owner's call, after the two implementations were compared side by side: take
`origin/set-pieces`' `materialRef` vocabulary (`cool-0` … `cool-4` with index-cycling)
over #25's semantic surfaces, and its accordion panel over #25's selection-driven one.
Both are argued in the *second pass* section. The general shape: **a name that promises
something the renderer is not allowed to deliver is worse than a name that describes what
it actually selects**, and a fixed fallback that merges neighbours into one silhouette is
worse than one that cycles.

### Container gotchas, all three cost real time

- **`npm run dev` dies instantly** with `options.allowedHosts[0] should be a non-empty
  string` — the container exports `HOST` as an empty string and CRA passes it straight
  through. `HOST=localhost npm start`. Nothing in the repo needs changing.
- **`npx tsc` resolved a global TypeScript 6.0.2** because `node_modules/` was not installed,
  and failed on `moduleResolution: node10` — which looks exactly like a real tsconfig
  problem. Confirm `npx tsc --version` says **4.9.5** before believing the typechecker.
- **Remote branch deletion 403s** and `git push` then exits `0` printing "Everything
  up-to-date". Now documented in `CLAUDE.md` (#28).

### The one thing worth carrying forward

Yesterday's lesson was *fallbacks that return plausible values cost more than every other
class of bug*. Today's is the same shape one level up: **a plausible-looking absence is as
expensive as a plausible-looking value.** `main` not containing the amendment looked exactly
like the amendment not existing. The check that distinguishes them — look wider before
concluding something is missing — costs thirty seconds and was skipped twice.
