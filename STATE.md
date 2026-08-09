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

- **The provisional readout state has no in-app repro.** No fixture scene carries a flagged
  lens or stop, and manufacturing one means either a live parse (needs `ANTHROPIC_API_KEY`)
  or hand-editing a `.myo` — which is the user's data. It is covered by unit test, not by
  screenshot. Same will be true of any future flagged-value UI: check whether a fixture can
  even reach the state before promising visual evidence.
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
- **GitHub only auto-retargets a stacked PR when the base branch is deleted.** After #1
  merged, #3 still pointed at `claude/push-file-u861cy` — merging it there would have landed
  the work on a stale branch instead of `main`. The base had to be repointed at `main`
  explicitly, after which the diff was verified to contain only #3's own eight files.
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
