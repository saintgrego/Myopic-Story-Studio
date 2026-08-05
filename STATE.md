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
