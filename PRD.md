# PRD — Myopic! 3-D Studio

**Version:** 1.2
**Date:** 13 July 2026 (amended 31 July 2026 — see section 11)
**Supersedes:** `myopic-3d-studio.md` v0.1 (28 April 2026), which remains valid as a component reference.
**Owner:** Gregory Jericho

---

## TL;DR

A prompt-driven 3D storyboarding tool. The user types a scene description; an AI parser converts it into a structured, editable scene graph; a Three.js viewport renders that scene using placeholder geometry. Every parameter is directly editable without re-prompting. Scenes save, load, and collect into a storyboard strip.

**V1 is a blocking tool, not a rendering tool.** It answers "where is everyone standing and what does the 35mm lens see from here," not "what does this look like finished."

---

## 1. Goals

1. **Prompt to scene graph.** A natural-language scene description produces a structured, populated scene object.
2. **Direct editability.** Every parameter is adjustable via panel UI. Tweaking a value never requires re-prompting.
3. **True 3D blocking viewport.** A Three.js scene showing object positions, a real camera with a real focal length, and real light directions.
4. **Persistence.** Scenes save to and load from a `.myo` file. Multiple scenes form a storyboard strip.
5. **Asset-agnostic mesh layer.** Any scene object can render as a primitive OR as an external `.glb` mesh, with no change to the rendering code.

---

## 2. Non-Goals (V1)

These are **explicitly out of scope**. Do not build them. Do not scaffold them "just in case."

1. **No Daz 3D integration.** No `.duf` parsing, no asset indexing, no library scanning, no Daz export. Deferred entirely.
2. **No asset browser panel.** No search, no filter, no thumbnails.
3. **No voice or dictation input.** Typing only.
4. **No multi-user, no cloud, no sync, no accounts.** Single-user, local, filesystem-only.
5. **No PDF export.** Deferred.
6. **No animation or camera movement playback.** The `movement` field is stored as metadata only; nothing moves.
7. **No rigging, skeletons, IK, manual joint posing, morphs, or facial expressions — narrowed in v1.2, see section 11.** Characters may take a *posture* by selecting from a library of static baked-pose meshes (a sitting figure is a different `.glb` than a standing one). Nothing articulates at runtime: no bones, no pose editor, no per-joint control. Figures remain static — **and, narrowed in v1.7, may be authored figure meshes rather than proxy geometry; a rig may be used to produce them, but nothing rigged ships in the `.glb`.**

**Rendering scope is deliberately absent from this list.** v1.0 carried a "no photorealistic rendering" non-goal here; it was removed in v1.1 and replaced by section 11, which is now the only place that governs how the viewport is allowed to look. Read it before building anything that changes the picture. Everything above is unchanged and still binding.

---

## 3. Closed Decisions

These are settled. Do not re-open them or propose alternatives.

1. **Viewport:** Full Three.js 3D preview, using placeholder/proxy geometry.
2. **Daz handoff:** None. Not in V1.
3. **Voice input:** None. Not in V1.
4. **Asset thumbnails:** Moot — no asset browser in V1.
5. **Multi-user sync:** None. Single-user, local.
6. **Asset format:** glTF/GLB is the only external mesh format V1 supports. Not `.duf`, not `.fbx`, not `.obj`.

---

## 4. The Central Architectural Requirement

**Every scene object holds a `mesh` reference that is one of two shapes:**

```json
"mesh": { "kind": "primitive", "shape": "capsule", "dimensions": [0.4, 1.8] }
```

```json
"mesh": { "kind": "gltf", "path": "/assets/technician.glb" }
```

The renderer asks each object what mesh it wants and renders accordingly. **Primitive and glTF paths must be equally first-class from day one.**

**Why this matters:** V1 ships with primitives only. But future asset sources — Daz exports, MakeHuman/MPFB2, Poly Haven, Mixamo, Blender — all arrive as `.glb`. If this abstraction is correct, adding real assets later is a data change, not a code change. If the renderer hardcodes primitives, the viewport gets rewritten. Do not hardcode primitives.

**Acceptance:** A developer can drop any `.glb` into a folder, edit one field in a `.myo` file by hand, reload, and see that mesh replace the primitive. No code changes.

---

## 5. Scene Model

Carry the parameter definitions forward from `myopic-3d-studio.md` sections 3.1–3.5, with these V1 amendments:

- **Environment:** location name, **setting (`Interior` | `Exterior`, added 31 July 2026)**, time of day, weather/atmosphere. No background asset field (nothing to point it at). `setting` exists because interior/exterior was only ever free text inside the location name, and the renderer has to know it as a fact — a sky must not appear indoors. The parser extracts it from INT./EXT. slugline framing. `.myo` files written before it existed stay loadable: the viewport falls back to sniffing the location name, so no migration is required. `weather` now also drives fog density, not just sky turbidity, so it is worth phrasing precisely ("light mist" and "thick fog" render differently).
- **Lighting:** scheme, key direction (azimuth/elevation), key colour, fill ratio, rim toggle, shadow softness, mood preset, and **fill colour and rim colour (`fillColor` / `rimColor`, added 8 August 2026 — see section 11)**. These map to real Three.js lights. Both new colours default to `#ffffff`, which is cosmetically neutral: `.myo` files written before they existed render identically, so no migration is required — the same backward-compat pattern as `environment.setting`.
- **Camera:** shot type, angle, focal length (mm), depth of field, focus subject, XYZ position, movement (metadata only), aspect ratio. **The focal length must genuinely drive the Three.js camera FOV.** A 35mm and an 85mm must look different. **Focus subject (v1.2 track) aims the shot camera**, and **depth of field is read by the viewport as of v1.3** — as a computed near/far focus readout and ground-plane markers, never as rendered blur. See section 11.
- **Characters:** figure ID, position XYZ, rotation, scale, visibility, `mesh` reference. Drop expression and costume — nothing to attach them to. **Costume is narrowed in v1.10:** there is now something to attach it to (an authored figure, v1.7), so wardrobe and coarse hair silhouette are baked into the figure the `mesh` reference already names. Costume as a *field* stays dropped, and expression stays dropped entirely. **Posture (v1.2) is not a new field:** a pose is expressed entirely through the existing `mesh` reference — `/assets/poses/sitting.glb` *is* the sitting pose. See section 11 for why.
- **Props:** prop ID, position, rotation, scale, visibility, `mesh` reference. **The mesh may be a library proxy (v1.4):** `/assets/props/sofa.glb` *is* the sofa, on the same "the mesh is the object type" reasoning as poses. See section 11.

### Scene file (`.myo`)

JSON, per section 7.1 of the spec, with `mesh` objects added to characters and props, and `daz_*` fields removed.

---

## 6. Prompt Parser

Per section 4 of the spec. Extraction targets: who, where, when, what, mood, framing.

- **Model:** `claude-sonnet-5` via the Anthropic `/v1/messages` endpoint.
- **Output:** strict JSON matching the scene schema. No prose, no markdown fences.
- **Ambiguity:** any parameter that cannot be confidently inferred is written into a `flagged_params` array and surfaced with a `[?]` marker in the properties panel.
- **Partial re-prompt:** re-prompting updates only flagged or selected components. It does not blow away user edits.

---

## 7. Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js, built in Claude Code |
| UI | React + Tailwind CSS |
| 3D | Three.js |
| State | Zustand |
| AI parse | Anthropic API, `claude-sonnet-5` |
| File I/O | Node `fs` — `.myo` read/write |

---

## 8. Milestones & Verifiable Success Criteria

Each milestone must be demonstrable by the owner without reading code.

### Milestone 1 — Parse and persist
- [ ] Typing a scene description produces a valid `.myo` JSON file with populated environment, lighting, camera, characters, and props.
- [ ] Ambiguous parameters appear in `flagged_params`.
- [ ] The file saves to disk, and reloading it restores the identical scene.

**Verify:** Type the server-room prompt from the spec. Open the resulting `.myo` in a text editor. It contains one character, at least one prop, a night-time interior environment, and a camera with a shot type.

### Milestone 2 — Panels
- [ ] Scene hierarchy tree lists every object.
- [ ] Selecting an object opens its parameters in a properties panel.
- [ ] Every parameter is editable, and edits persist through save/reload.

**Verify:** Change the camera focal length to 85. Save. Reload. It is still 85.

### Milestone 3 — Viewport
- [ ] Three.js scene renders all visible objects as primitives at their XYZ positions.
- [ ] The camera object drives an actual Three.js camera; its focal length drives FOV.
- [ ] Lighting parameters drive actual Three.js lights.
- [ ] A camera-view toggle shows what the scene camera sees, with the correct aspect ratio letterboxed.

**Verify:** Set focal length to 18mm, then 135mm, in camera view. The framing changes visibly and correctly. Move the key light azimuth 180 degrees. The shading flips.

### Milestone 4 — glTF swap and storyboard
- [ ] Any object's `mesh` can be switched from primitive to a `.glb` path and renders correctly.
- [ ] Scenes can be captured as storyboard frames; frames are reorderable; each carries shot number and notes.

**Verify:** Download any free `.glb`. Point a character at it by hand-editing the `.myo`. Reload. The capsule is replaced by the model, in the same position, at the same scale.

---

## 9. Deliberately Open

Not decisions to be made by the implementing model. Leave these alone.

1. **Asset pipeline (Phase 2).** Whether assets eventually come from Daz exports, MakeHuman/MPFB2, Poly Haven, Mixamo, or Blender conversions is undecided. All of them terminate in `.glb`, so V1 is unaffected. Do not build toward any one of them.
2. **Daz round-trip export.** Undecided and out of scope.

---

## 10. Working Instructions

- Work autonomously. After each milestone, update `STATE.md` with what passed, what failed, and any rule worth remembering.
- At the end of each milestone: **show the evidence.** Do not report a milestone complete without demonstrating the verification criterion above.
- If a decision in section 3 appears to block you, stop and ask. Do not re-open it unilaterally.

---

## 11. Amendments

### v1.1 — 31 July 2026: realistic lighting and atmosphere

**Requested by the owner on 14 July 2026**, after V1 shipped: a prompt like "a distant shot of a tree on a hill at sunset" rendered as geometry floating in a void, with no horizon, no shadows, and no sense of distance. The scene graph was right and the picture was unreadable as blocking.

**What changed in this document**

- **The "no photorealistic rendering" non-goal was removed** from section 2 (it was item #4 in v1.0; the remaining items renumbered). Rendering scope is now governed here, by the boundary below, rather than by a blanket prohibition. Rationale for moving it: shadow direction tells a director where the key is, a horizon tells them where the ground ends, haze tells them how far away something reads. Those are the questions this tool exists to answer, and a flat "no photorealistic rendering" ruled them out along with the things it meant to rule out. Surface finish was never the point and still isn't.
- **`environment.setting` added** to the scene model (section 5). This is the only schema change the track required.

**What was built under it** — all in the viewport, verified in-browser; evidence and gotchas in `STATE.md` under "Post-V1":

1. Cast shadows from the key light, plus a ground plane to receive them. `shadowSoftness` now renders instead of only being stored.
2. Sky dome with a sun driven by the key light's own azimuth/elevation, exterior scenes only, with weather raising turbidity.
3. ACES filmic tone mapping — not a look choice; the sky shader emits HDR values and clips to a flat white dome without it.
4. Distance fog, graded by `weather`, warming toward the key colour as the sun drops. Interiors fade into the background instead of ending at a hard ground edge.

**What this did not change:** flat/basic materials are still correct, and every object is still proxy geometry (**narrowed in v1.7: characters may carry authored figure meshes; everything else stays proxy geometry**). Nothing here touched the parser's output contract, the `.myo` envelope, or the mesh abstraction in section 4.

**Assessed and dropped:** a parser prompt nudge mapping time-of-day to light values. `claude-sonnet-5` already returns sunset-appropriate elevation and key colour unprompted, so the prompt text would have been redundant. Revisit only if a live parse produces bad lighting.

### Rendering scope — the governing rule

This replaces the removed non-goal. It is the whole of the standing policy on how the viewport may look; section 2 no longer speaks to it.

**The test:** a rendering feature is in scope if it answers a *blocking* question — where does the shadow fall, where is the horizon, how far away does that read, what is the camera actually seeing. It is out of scope if it answers a *finishing* question — does this look shot, does this look real, does this look good.

**In, and built:** cast shadows, ground plane, sky dome and horizon, filmic tone mapping, distance fog.

**Out, and not to be built without another amendment logged here:** ray tracing, authored PBR materials, texture maps, reflections, bloom, ambient occlusion, and depth-of-field as a rendered effect (the f-stop drives the focus readout added in v1.3; it must not drive shading). Flat/basic materials remain correct, and every object remains proxy geometry (**narrowed in v1.7 for characters only — an authored figure mesh is an asset change, not a rendering feature; this out-list is unaffected by it**).

**The standing risk this rule exists to manage:** each of these individually looks like a small step from what already ships, and "it would help the director see it" can be argued for any of them. That argument is not sufficient — apply the test, and if it passes, amend this section before building.

### v1.2 — 31 July 2026: static pose support

**Requested by the owner on 31 July 2026.** Blocking answers "where is everyone standing" — but a director also needs "standing, or sitting?" A figure hunched over a terminal and a figure standing at it are different shots. The capsule can't say which.

**Proven before being scoped.** A smoke test ran before this amendment was written: three generated posed mannequins (`standing`, `sitting`, `crouching`) were placed in a scene purely by pointing characters' `mesh` references at `.glb` files — zero code changes, exactly as section 4's acceptance criterion promised. Evidence in `STATE.md` under "Poseable figures."

**The core decision — a pose is a mesh, not a field.** The scene model gains nothing: `/assets/poses/sitting.glb` *is* the sitting pose, carried by the existing `mesh` reference. The rejected alternative was a `pose` field on `Character` that the viewport resolves to a mesh. Rejected because it creates two sources of truth for what a character looks like, and because section 4 already forbids exactly that kind of special-casing: the renderer asks the mesh reference and nothing else. A pose library is therefore *content*, not schema — the `.myo` envelope and parser output contract are untouched by construction.

**What changed in this document**

- **Non-goal #7 narrowed** (section 2): postures via static baked-pose meshes are in; rigging, skeletons, IK, manual joint posing, morphs, and facial expressions remain out.
- **Section 5 Characters** notes that posture rides the `mesh` reference.

**Authorized to build under this amendment**

1. **The pose library.** `scripts/generate-pose-glbs.mjs` (exists) generates posed proxy mannequins into `public/assets/poses/`. Growing the library is editing its `POSES` table and re-running it.
2. **A pose selector in the Character properties panel** — a convenience dropdown that rewrites the character's `mesh` reference to the chosen pose path (or back to the capsule primitive). It is UI sugar over the mesh field, not new state. Selecting a pose on a character that points at a custom non-pose `.glb` replaces that path — acceptable and worth a confirm in the UI.
3. **Parser posture mapping.** The system prompt maps described posture to a pose mesh ("hunches over a terminal" → `crouching.glb`, "seated by the window" → `sitting.glb`). Posture unstated → capsule primitive, exactly as today, **no flag** (absence of posture is normal, not ambiguous). Posture stated but unmatched ("doing a handstand") → nearest pose, flagged in `flagged_params`.

**Acceptance (owner-verifiable, per section 8's convention):**
- [ ] Parse the server-room prompt from the spec: the technician arrives posed (`crouching.glb` or better), not as a capsule.
- [ ] Change a character's pose in the properties panel, save, reload — the pose persists (it's just the mesh path persisting).
- [ ] Add a new pose to the generator's table, re-run it, and use that pose in a scene without touching viewport code.

**Still out, and unaffected by this amendment:** runtime articulation of any kind (bones, IK, a pose editor), animation between poses (non-goal #6 stands), facial expression, and body-type variation (**body-type variation narrowed in v1.8: a fixed, small set of authored figures is in; body type as an adjustable dial stays out**). If a pose can't be expressed as "another `.glb` in the folder," it doesn't belong under this amendment.

**Deliberately not decided here:** section 9's asset-pipeline question stays open. The generated proxy mannequins are the pose library's *current* content, not a commitment — a Mixamo or MakeHuman figure exported per-pose to `.glb` drops into the same folder under the same contract. Choosing that source remains the owner's call.

### v1.3 — 5 August 2026: depth of field as a readout, not as blur

**Requested by the owner on 5 August 2026**, arising from a question about how to set specific camera distances and lenses. The lens is a real field and distance is real (implicit in `camera.position`), but `camera.depthOfField` was stored and inert — the one camera control that did nothing. The question behind the question was not "make it look shot," it was "if I stop down to f/8, can I put the second detective at the window and still have them sharp?"

**The distinction this amendment turns on.** The governing rule's out-list bars depth of field *as a rendered effect* — blur, bokeh, a soft background. That stays out, and this amendment does not touch it. What it permits is depth of field *as computed information*: the near and far limits of acceptable focus, stated as numbers and marked on the ground.

**Why it passes the test.** Section 11's test asks whether a feature answers a blocking question or a finishing question. "How much of my staging holds focus" is a blocking question of the same kind as "where does the shadow fall" — it constrains where a director can put people. At 85mm and f/2 with the subject at 3m the sharp zone is 15cm deep: an actor who leans back is soft, and the blocking has to account for it. At f/8 on a 35mm it is 5.3m and effectively nothing is constrained. That difference changes where people stand. Rendering the blur would answer "does this look shot" — a finishing question — and remains out.

**The counter-argument, recorded.** Section 11 warns that "it would help the director see it" can be argued for any of the out-list items, and that the argument is not sufficient. The honest risk here is that a focus readout is one step from focus-plane markers, which is one step from a blur preview. The boundary is therefore explicit: **numbers and unfilled line indicators are in; any change to how a pixel is shaded is out.** A future request for blurring needs its own amendment, and this one must not be cited as precedent for it.

**What changed in this document**

- **The out-list line is narrowed, not removed.** Its parenthetical now reads *(the f-stop drives the focus readout added in v1.3; it must not drive shading)*. Ray tracing, PBR, texture maps, reflections, bloom, and AO are untouched.
- **Section 5 Camera** notes that `depthOfField` is read by the viewport as of v1.3.
- **No schema change.** `focalLength` and `depthOfField` already existed; subject distance is derivable because `focusSubjectId` now aims the camera. Nothing new is stored, and the `.myo` envelope and parser output contract are untouched by construction.

**Authorized to build under this amendment**

1. **A focus readout in the Camera properties panel.** Near limit, far limit, total depth, and hyperfocal distance, computed from `focalLength`, `depthOfField`, and the distance from `camera.position` to the focus subject's aim point. Circle of confusion fixed at 0.03mm — the full-frame convention matching the existing `SENSOR_WIDTH_MM = 36` assumption. Stated as a constant with that reasoning, not exposed as a tunable: a "sharpness" slider is a finishing control.
2. **A hyperfocal indication.** At or past hyperfocal the far limit reads infinity rather than a large number, because that is the fact the director needs.
3. **Near/far focus-plane markers in the viewport.** Thin unfilled lines where the two limits cross the ground, in the same family as the existing `CameraHelper`. Spanning roughly the frame's width at their distance, so they show where the focus band crosses the shot. No shading change and no blur.

**Behaviour at the edges**

- `depthOfField` or `focalLength` is `[?]` → **the readout still computes, from the viewport's own fallbacks, and is labelled provisional.** An empty readout would hide the shape of the answer while the director is still deciding what the value should be. The focal-length fallback (50mm) is the one the viewport already renders a flagged lens at; the f-stop fallback (f/2.8) is introduced here, because the viewport never read that field before and so had no existing default to inherit.
- No focus subject → measure to `DEFAULT_AIM` `(0,1,0)`, the same point the camera aims at, and label the readout so it is clear what was measured to.
- Inputs with no physical meaning (non-positive or non-finite lens, stop, or distance) → no readout at all, rather than a plausible-looking number.

**Acceptance (owner-verifiable, per section 8's convention)**

- [ ] 85mm / f/2 / subject at 3m reads roughly 2.93–3.07m, ~15cm total.
- [ ] Changing only the stop to f/8 widens it to roughly 2.74–3.32m, ~59cm.
- [ ] 35mm / f/8 / subject at 3m reads roughly 1.90–7.16m, ~5.3m deep.
- [ ] A subject past hyperfocal reads a far limit of infinity, and only the near marker draws.
- [ ] A flagged f-stop still shows numbers, marked provisional.
- [ ] The rendered image is otherwise unchanged — nothing here alters shading.

**Still out, and unaffected by this amendment:** rendered depth-of-field blur of any kind, bokeh shape, focus falloff, lens breathing, and animated focus pulls (non-goal #6 on animation stands). If a feature changes how a pixel is shaded, it does not belong under this amendment.

### v1.4 — 5 August 2026: prop proxy library

**Requested by the owner on 5 August 2026, from use:** "the basic shapes we're using as symbolic stand-ins aren't reading for me at all."

**The diagnosis, which is the load-bearing part of this amendment.** v1.2 solved this for characters and left props behind. The parser was instructed (`server/parser.js`) that prop meshes are *always* primitives, and to pick "whichever primitive best approximates the silhouette." For a domestic interior that rule produces a sofa, a bed, a desk, a counter and a table which are all — correctly, by the rule — boxes. The viewport then shows a field of indistinguishable boxes, and the director has to *remember* which box was which. **That is a memory task, and the tool exists to replace it with a seeing task.** Blocking is not served by geometry that answers "something is here" but not "what."

**Applying the section 11 test.** Recognisability of a prop is a *blocking* question: you cannot judge whether a figure can reach the counter, whether the sofa blocks the doorway, or whether the shot reads at 35mm if you cannot tell the furniture apart. It is not a finishing question — nothing here makes anything look shot, real, or good. **In scope.** Note what is *not* being claimed: this is not a licence to add texture, material variety, or detail that answers "does this look real." The out-list in "Rendering scope" is untouched.

**The core decision — same one as v1.2: the mesh IS the object type.** A sofa is `/assets/props/sofa.glb`. There is no `propType` field, no shape-library enum on `Prop`, and no renderer change: `buildObject()` already treats glTF as first-class per section 4. This is v1.2's pattern applied to props, and it inherits v1.2's reasoning — a second source of truth for what an object looks like is exactly what section 4 forbids.

**What changed in this document**

- **Section 5 Props** — the `mesh` reference may now carry a library proxy path, not only a primitive.
- Nothing else. The `.myo` envelope, the parser's output contract, and the scene schema are untouched by construction.

**Authorized to build under this amendment**

1. **The prop library.** `scripts/generate-prop-glbs.mjs` generates matte-grey proxy furniture into `public/assets/props/`; `src/props.json` is the single source of truth for the library, read by both the properties panel and the parser. Growing it is: add a row to the generator's `PROPS` table, re-run, add a row to `props.json`.
2. **A proxy selector in the Prop properties panel** — the same UI sugar as the pose selector, sharing one component, rewriting the `mesh` reference (or back to a primitive).
3. **Parser proxy mapping.** The system prompt lists the library with footprints; a described prop that matches gets the proxy, anything unmatched (a crate, a rock, a server rack) falls back to a primitive exactly as before. **No flag** — a primitive fallback is honest, not ambiguous, so unlike `poseNote` there is no `propNote`.

**Colour, decided here:** proxies are matte grey (`0x8a8a90`), and the pose mannequins moved from blue (`0x6ea8ff`) to a lighter matte grey (`0xb8b8bd`) at the owner's instruction. The two greys differ by value on purpose: with hue gone, value is the only thing left separating figures from set dressing.

**Acceptance (owner-verifiable, per section 8's convention):**
- [ ] Parse an interior prompt naming furniture: the props arrive as recognisable proxies, not boxes.
- [ ] Change a prop's proxy in the properties panel, save, reload — it persists (it's just the mesh path persisting).
- [ ] Add a prop to the generator's table, re-run it, use it in a scene without touching viewport code.

**Still out, and unaffected:** everything in the "Rendering scope" out-list. Also explicitly *not* authorized here: importing arbitrary user-downloaded `.glb` assets, an asset browser (non-goal #2 stands), and any set/room-level mesh — `Environment` still has no mesh field. Those were discussed alongside this change and deliberately not taken; see section 9, which stays open.

### v1.5 — 5 August 2026: the warm/cool proxy palette

**Requested by the owner on 5 August 2026**, immediately after v1.4 shipped: cool greys and warm greys, five values each, warm assigned to people and cool to everything else. This supersedes v1.4's single-value-per-class colour decision.

**Applying the section 11 test.** Telling a figure from a piece of furniture, and telling two figures apart, are *blocking* questions — they are the "where is everyone standing" question at the level of "which one is that." v1.4 already conceded the principle by using value to separate figures from set dressing; this makes that separation carry hue as well, and gives each class five steps so neighbouring objects don't merge. **In scope.** These remain greys — 10–13% saturation, which is below the threshold where anyone would read them as a colour choice. Nothing here makes the picture look shot, real, or good, and the out-list is untouched.

**The core decision — the palette is render-time, not scene state.** `src/palette.ts` holds two five-value ramps; `Viewport.tsx` assigns by the object's index in `scene.characters` / `scene.props`. There is **no colour field on `Character` or `Prop`**, and the `.myo` envelope is untouched. The rejected alternative was a per-object colour field: it would put a presentation choice into the user's saved data, make old `.myo` files inconsistent with new palettes, and hand the parser a decision it has no basis to make.

**Assignment rule, decided here: cycle by index.** Chosen over pinning a value per prop *type* (two dining chairs side by side would merge) and over deriving value from object size (cannot separate two characters at all). Cycling guarantees adjacent objects differ and that a scene renders identically twice. The known cost, accepted: a sofa is not the same value from one scene to the next.

**Custom assets keep their own materials.** Only library proxies (paths in `poses.json` / `props.json`) and primitives are tinted. A hand-attached `.glb` renders as authored — consistent with the properties panel already treating a custom mesh as a deliberate choice worth a confirm before replacing. This is the rule that will matter when section 9's asset-pipeline question is finally answered.

**Value ranges** are offset — warm 0.60–0.88 L, cool 0.42–0.74 L — so figures sit lighter than set dressing on average. They overlap at the edges deliberately: a dark figure against a pale counter is a real shot, not a defect to be designed out.

**Acceptance (owner-verifiable):**
- [ ] A scene with two or more characters shows them at visibly different values.
- [ ] Figures read as figures against furniture at a glance, in camera view, at 35mm.
- [ ] Hiding a character does not re-colour the ones after it.

**Consequence worth knowing:** the colours baked into the generated `.glb` files are now **fallbacks only** — they are what you see if a proxy is opened outside the app. They are set to the middle value of each ramp; if the palette is retuned, update them to match or accept the drift.

### v1.6 — 8 August 2026: fill and rim colour (gel filters)

**Requested by the owner:** temperature (Kelvin) and gel-filter tints for all three lights, not just key.

**Applying the section 11 test:** colour temperature and tint are already established as blocking information — key colour already drives real shading. Extending that to fill and rim is the same category of decision, just applied to two lights that previously had none. In scope.

**Schema change (section 5):** `Lighting` gains `fillColor` (hex, default `#ffffff`) and `rimColor` (hex, default `#ffffff`). Both are cosmetically neutral by default so every existing `.myo` renders identically until edited — no migration needed, same pattern as `environment.setting`'s backward-compat fallback.

**Not in scope:** anything gels do in real cinematography beyond colour — barn doors, diffusion, cut. Tint only.

### v1.7 — 10 August 2026: authored figure assets for the pose library

**Requested by the owner on 7 August 2026**, with a reference render of a sculpted anatomical base mesh: proxy capsules and the primitive mannequin do not carry enough body language to read blocking, and the owner requires figure geometry of at least that standard. `docs/proposal-realistic-figure-assets.md` is the analysis this amendment adopts; it was drafted as "v1.4" before v1.4–v1.6 existed, and this supersedes that numbering.

**Applying the section 11 test.** The governing rule is about *rendering features* — it exists to stop "it would help the director see it" from justifying each next step toward photorealism. This changes an **asset** and touches no shading whatsoever: same lights, same materials, same tone mapping. It passes the blocking test on its own terms — a capsule cannot tell a director which way a figure's shoulders are turned, where the eyeline goes, or whether a shot reads as a two-shot or a stand-off, and body language answers all three. But it does contradict the plain sentence "every object is still proxy geometry" in three places in this document, which is exactly the kind of change section 11 exists to make deliberate.

**Proven before being scoped**, per v1.2's precedent. A source-agnostic spike ran on 10 August, before this text was written: headless Blender (`--background --factory-startup --python`) exporting generated geometry to `.glb`, loaded in the viewport with grounding and axes measured, not assumed. It established that the default glTF export lands a Blender figure facing **+Z** — the app's convention, no flags — that grounding is enforceable in the exporter, and that a new figure is re-materialled from the palette purely because its path is in `poses.json`, with no code change. Evidence in `STATE.md` under "Blender spike".

**The core decision is unchanged from v1.2: a pose is still a mesh, not a field.** This amendment changes the *content* of the pose library, not its contract. `poses.json` keeps its shape and its four rows; `buildObject()`, the parser, the `.myo` envelope and the scene model are untouched by construction, per section 4.

**What changed in this document**

- **Section 9 item 1 (asset pipeline) closes** in favour of the **Blender Studio Human Base Meshes**, chosen by the owner on 10 August 2026. **CC0** — public domain, no attribution required and no redistribution clause, so a derived `.glb` may be committed to this repo without a licence question. Daz Genesis was the closest match to the reference render but its EULA governs redistribution; MakeHuman/MPFB2 is equally CC0 but would need MPFB2 installed into Blender first. All other section 9 items stand, including item 2 (no Daz round-trip).
- **"Every object is proxy geometry" is narrowed in three places** — section 2 non-goal #7, v1.1's "what this did not change", and the governing rule's closing sentence. Characters carry authored figure meshes; props, environment, and every other object remain proxy geometry. Each is marked in place.
- **No schema change, no parser change, no `.myo` change.**

**Authorized to build under this amendment**

1. A reproducible asset pipeline in `scripts/blender/`, driving the Blender binary headlessly (**not** `pip install bpy`): import the Blender Studio base mesh, apply each pose in the library, export `.glb` into `public/assets/poses/`.
2. **Rigging the base mesh inside the pipeline.** The Blender Studio meshes ship **unrigged**, so posing them needs a rig — Rigify, which is bundled with Blender and already present. This is a pipeline step, not a product feature: the rig exists in the `.blend`/pipeline only, and non-goal #7 stands unchanged because nothing rigged reaches a `.glb`, the app, or the user. If rigging proves to be the expensive part, MakeHuman/MPFB2 (also CC0, ships rigged) is the fallback, and swapping to it is a change to this pipeline alone.
3. Replacement of all **four** existing pose meshes — `standing`, `sitting`, `crouching`, `lying` — with figure-based ones. `poses.json` unchanged in shape and in its four paths.
4. A recorded decision on asset storage (in-repo, Git LFS, or fetched into a gitignored `assets-src/`), made after real file sizes are known rather than estimated. CC0 removes the *licence* constraint on committing the source mesh; the size constraint is unmeasured and still decides this.
5. Retention of `scripts/generate-pose-glbs.mjs` as a fallback placeholder generator, or its removal — a call to make when the assets land.

**Conventions the pipeline output must meet.** These are not new rules; they are the existing ones, written down because an authored asset is the first thing that can violate them silently:

- **Base-anchored**: `Box3.min.y === 0` (within 1 mm). Enforced in the exporter, and asserted for the committed library by `poses.test.ts`.
- **Faces +Z**, life-sized in metres, so `scale` stays 1.
- **No texture maps.** Library glTFs are re-materialled from `src/palette.ts` at load; any authored skin or material that arrives with the asset is discarded, which is what the out-list requires anyway.

**Still out, and unaffected:** rigging, IK, pose editors, morphs, facial expression and animation — non-goals #6 and #7 stand, and the assets remain static per-pose exports. A rig may be used *in Blender* to produce them; nothing rigged ships in the `.glb`. Every rendering-scope item on section 11's out-list stays out. This amendment changes geometry, never shading.

**Acceptance (owner-verifiable, per section 8's convention):**

- [ ] A scene renders all four poses as figure meshes with no code change outside the pipeline script.
- [ ] Adding a fifth pose is a documented, repeatable procedure.
- [ ] Every exported pose measures `min.y = 0` and faces +Z, verified with `scripts/measure-glb.mjs`.
- [ ] `npx tsc --noEmit`, `npm run test:ci` and `CI=true npm run build` stay green.

**Deliberately not decided here:** whether *props* ever gain authored geometry. This amendment covers characters only; `src/props.json` and its proxies are untouched and stay in scope for the generator.

### v1.8 — 10 August 2026: a second figure in the pose library

**Requested by the owner on 10 August 2026**, immediately after v1.7's pipeline landed.

**This one needs an amendment because v1.2 said no.** v1.2's "still out" list names **body-type variation** explicitly, alongside rigging and facial expression. Nothing about v1.7 changed that — it swapped one figure for a better one. A second figure of a different build is the thing v1.2 ruled out, so it is reopened here deliberately rather than slipped in as content.

**Applying the section 11 test.** Blocking asks who is where and what the lens sees. Two characters in a two-shot who are the same figure at the same height are harder to tell apart than they should be, and a director reading their own storyboard should not have to remember which capsule is which. That is a legibility argument about *blocking*, not a fidelity argument — it passes. What does **not** pass, and stays out: body-type as a *dial* (height, build, age sliders), which is a character-customisation feature and would put variation back into the schema.

**Scope: two figures, both from the same CC0 bundle.** `GEO-body_male_realistic` and `GEO-body_female_realistic`. Not a system for arbitrary figures — a second one, because one is not enough to tell two people apart.

**Naming, and the compatibility constraint that drives it.** Existing `.myo` files on disk reference `/assets/poses/standing.glb` and its three siblings. Those paths keep working and keep their current meaning, so the library grows by suffix rather than by rename:

- `standing`, `sitting`, `crouching`, `lying` — **the default figure**, used when the description does not indicate otherwise. It is the male mesh today; the name says "default" rather than "male" so that the parser has a rule it can actually apply, and so a future third figure does not need a fourth naming convention.
- `standing-female`, `sitting-female`, `crouching-female`, `lying-female` — chosen when the description indicates a woman.

A rename to a symmetric `-male`/`-female` pair would read better and is deliberately **not** done here: it would break every saved scene for a cosmetic gain, and `.myo` files are the user's data.

**What changed in this document**

- **v1.2's "still out" list is narrowed**: body-type variation is in, bounded to a fixed, small set of authored figures. Rigging, IK, pose editors, morphs, facial expression and animation are untouched and stay out. Marked in place.
- **No schema change, no parser code change, no `.myo` change.** `poses.json` gains rows; `server/parser.js` builds its pose list from that file at require time, so the parser learns the new figures from their hints alone.

**Acceptance**

- [ ] Eight poses in the panel dropdown; a scene can put two visibly different figures in one shot.
- [ ] Every saved `.myo` that references the original four paths still loads and renders unchanged.
- [ ] All eight `.glb`s measure `min.y = 0` and face +Z.
- [ ] A prompt describing a woman parses to a `-female` pose mesh.

**Still out:** any third figure without a further amendment (**reopened in v1.10, which raises the roster to a capped six and states what a "figure" now includes**), body-type as an adjustable parameter, and figure choice as a field on `Character` — it rides the `mesh` reference like everything else.

### v1.9 — 11 August 2026: set pieces (walls, floors, ceilings, doors, windows)

**Requested by the owner on 11 August 2026.** Written after the implementation prompt that authorized it; the prompt is the authorization, this is the record of what it decided.

**Applying the section 11 test.** A room is not set dressing — it is the constraint the blocking happens inside. Where a figure can stand, whether the key can reach her, whether he can see her from the doorway, and what a 35mm actually contains at the far wall are all *blocking* questions, and none of them can be answered against an infinite grey plane. This is geometry that answers "where is everyone standing", not finish that answers "does this look real". **In scope.** Nothing here touches shading: same lights, same flat materials, same tone mapping, and the out-list is untouched.

**Schema change (section 5).** `SceneFile` gains two fields:

- `sets: SetPiece[]` — each piece is `{ kind, transform, dimensions, materialRef, state? }`, where `kind` is one of `wall | floor | ceiling | door | window`, `transform` is `{position, rotation, scale}` (rotation in degrees, matching characters and props), and `dimensions` is a named `{width, height, depth}` box.
- `setVisibility: SetVisibility` — five booleans, one per category.

**Backward compatibility, not migration.** Every `.myo` on disk predates both fields. They default at the load boundary — `[]` and all-true — exactly as `environment.setting` and `fillColor`/`rimColor` do. No migration script, and no file is rewritten until the user saves it themselves. `.myo` files are the user's data.

**A set piece is a box, not a mesh reference.** This deliberately breaks the pattern v1.2 and v1.4 set for poses and props, and the reason is that the pattern does not apply: a pose library exists because a sitting figure cannot be described parametrically, whereas a wall is fully described by three numbers and a transform. Introducing `/assets/sets/wall.glb` would add an asset pipeline that answers no question the box does not. Section 4's mesh abstraction is untouched — set pieces are not characters or props and carry no `mesh` reference at all.

**Colour comes from the cool ramp** (`SET_MATERIAL_REFS` in `src/palette.ts`). Walls are emphatically not people, so warm greys are out per v1.5. `materialRef` names a **ramp position** — `cool-0` … `cool-4` — and anything else cycles by the piece's index in `scene.sets`. This is not a material system: no textures, no finishes, no PBR.

**Naming the position rather than the surface was the live argument, and it was settled the other way on 11 August.** This document first specified semantic surfaces (`brick`, `concrete`, `plaster`) resolving to fixed steps, on the reasoning that a room's four walls are one surface and must read as one value. That reasoning survives — it is now something the author *states*, by giving those pieces the same ref — but the vocabulary lost on two counts. A surface name is a promise the renderer cannot keep, since flat greys are all this section allows and `brick` names a material that never arrives. And it forces a fixed fallback for unrecognised names, which merges two adjacent hand-named walls into one silhouette; index-cycling degrades toward legibility instead. The index is the piece's position in `scene.sets`, never a filtered counter, so hiding a category re-colours nothing (the v1.5 rule).

**Placed by hand, and only by hand.** The parser is untouched: set pieces are never inferred from prompt text. A prompt saying "a cramped room" produces no walls. This is a deliberate limit — a guessed room is worse than no room, because the director would have to check every wall before trusting any of them.

**Visibility is category-level only.** Five checkboxes and a "hide all sets" button. There is no per-piece visibility flag: the ask is "take the fourth wall out so I can see in", not "hide this particular panel". Groups are what carry `.visible`; no mesh is ever individually hidden.

**The panel is an accordion in the left column**, sharing it with Hierarchy — each keeps its own fail-closed persisted open state (`myopic.setsOpen`), and the column widens if either is open, so neither can hide the other. It is a standing control rather than a selection: category visibility is a viewing mode the director works *through* while looking at something else, not a property of a thing you select. That distinguishes it from Environment, Lighting and Camera, which are selected and edited in Properties.

**Door and window `state` is fixed at placement.** `'open' | 'closed'`, set when the piece is placed, with no runtime control to swing it. An open leaf is drawn swung on its hinge because a door drawn flush answers the wrong question — whether the leaf is in shot, and whether it blocks the sightline through the opening, is the blocking question the piece exists for.

**Still out, and not to be built without a further amendment:** parser inference of set pieces, a runtime open/close control, per-piece visibility, glTF set-piece assets, and anything on section 11's rendering out-list. Boolean cutouts (a real hole in a wall for a window) are also out — a window is a piece placed in front of the wall, not a subtraction from it.

**Acceptance**

- [x] A pre-existing `.myo` loads with `sets: []` and all five categories visible, and is not rewritten on disk.
- [x] A scene with a piece in each category builds five groups; toggling one category's boolean changes only that group.
- [x] A door or window with `depth: 0` renders as a thin plane rather than degenerate or NaN geometry.
- [x] `npx tsc --noEmit`, `npm run test:ci` and `CI=true npm run build` stay green.

### v1.10 — 13 August 2026: wardrobe and coarse hair, as part of the figure

**Requested by the owner on 13 August 2026.** v1.7 and v1.8 made the figures good enough that the next thing missing became obvious: eight identical nude bodies. A detective and the suspect are the same mesh, and a scene that stages both has the same legibility problem v1.8 was written to fix, one level up.

**Applying the section 11 test, and conceding half of it.** Wardrobe passes on exactly the argument v1.8 won on — a director reading their own storyboard should not have to remember which figure is which, and silhouette is what makes that readable at a glance. A long coat and a shirt are different shapes at 35mm, they occupy different amounts of frame, and a coat changes where a figure's outline meets a doorway. That is blocking.

**Hair mostly fails it, and is admitted only in its coarsest form.** Hair is where "does this look real" lives. What survives the test is head *silhouette*: bare, cropped, or gathered/long changes the shape of the head against a background and gives an otherwise symmetric skull a front and a back, which is the eyeline cue a director actually reads. Everything past that — strands, cards, transparency, physics, colour — answers a finishing question and is **out**, named on the out-list below so this amendment cannot be cited for it later. Note what is *not* being claimed anywhere here: no texture, no material variety, no fabric. Library figures are still re-materialled flat from `src/palette.ts` at load, and the "Rendering scope" out-list is untouched. **This amendment changes geometry, never shading** — the same sentence v1.7 closed on, and for the same reason.

**The core decision — wardrobe is not a new axis; it is part of what "figure" means.** A dressed figure is a *figure*, in v1.8's sense: another entry in a fixed, small roster, named by suffix, exported once per pose. `/assets/poses/standing-coat.glb` *is* the figure in the coat, carried by the `mesh` reference that already exists. No schema change, no parser code change, no `.myo` change, no `buildObject()` change.

**Two alternatives were weighed and rejected.**

- **A `wardrobe` field on `Character`**, resolved to geometry by the renderer. Rejected for the reason section 4 and v1.2 both give: it creates a second source of truth for what a character looks like, and the renderer would have to ask something other than the mesh reference.
- **A second mesh reference — figure plus garment as separate glTFs, parented at load.** This is the tempting one, because it keeps the library additive instead of multiplicative: three garments would be three files rather than three files per pose per body. It is rejected because it puts a second thing in `buildObject()`, which section 4 exists to forbid, and because a garment that is not exported with the pose does not fit the pose — a coat authored on a standing body intersects a seated one at the hip and knee. The saving is real and the cost is a schema change plus geometry that is wrong in half the library.

**The cost this decision accepts, stated plainly.** The library is poses × figures, so every figure added is four more `.glb` files at roughly 500 KB each — about 2 MB per figure, against 4 MB for the eight files that exist today. That is the whole reason for the cap below. v1.7 deferred the asset-storage decision until real file sizes were known; they are now known for the *output* library (500 KB/pose, committed to `public/assets/`, no LFS needed at this scale), and the cap is what keeps that answer true.

**The roster is capped at six figures.** Twenty-four files, roughly 12 MB, and a pose dropdown that still fits on screen. A seventh needs another amendment. This is not a systematic wardrobe feature and must not grow into one by increments — the cap is the mechanism that makes each addition a decision rather than a habit.

**Naming extends v1.8's rule unchanged.** The path is `<pose><figure-suffix>.glb`; the bare suffix is the default figure and keeps working, because saved `.myo` files reference those four paths and they are the user's data. A suffix names a whole figure identity — body, wardrobe, and hair together — not a garment slot, so `-coat` is a figure, not an attachment, and there is no `-coat-longhair` combinatorial tail.

**Where the garment geometry comes from — PROPOSED DERIVED, THEN FALSIFIED BY THE SPIKE ON 13 AUGUST. This paragraph is superseded by the one after it and is kept because the reasoning was good and the answer was still wrong.** The CC0 bundle in `assets-src/` holds bodies only, so a garment source was genuinely open. Rather than take on a second upstream asset with its own licence and its own topology, the proposal was to derive wardrobe from the body the pipeline already has: select a vertex band by *measured* height, duplicate the surface, solidify it outward, extend the hem. Same doctrine as the skeleton in that file — where a value is computable from what was built, compute it — and it keeps the pipeline CC0, reproducible, and free of a second download.

**What the spike found, and the decision it forces.** `scripts/blender/spike-garment.py` ran the derivation against real library geometry over four iterations, each rendered at 35 mm in the app's warm greys (`scripts/blender/spike-render.py`; evidence in `STATE.md` under "Derived-garment spike"). Every iteration failed, and each failure has the same root: **a derived garment knows only distance from a vertical axis, and a standing figure is not radial.**

- *Band-duplicate and solidify* — the literal method above — produces a shell that is a parallel copy of the body, so the "coat" shows pectorals, abdominals and a navel. A garment must be a **simpler** volume than the body, and offsetting a surface cannot make one.
- *Silhouette lofting* fixes the anatomy and inherits the arms: at hip height the widest thing in the slice is the **hands**, so the first loft grew a horizontal barrel at the waist. Clamping to the slice median removes the barrel and leaves creased, crumpled-paper geometry; smoothing that leaves a clean sack that **swallows the arms entirely**.
- *Skirt-only*, from the waist down, was the narrow claim worth testing because the body genuinely is radial there. It renders as a stiff bell that **buries the hands inside it**, because the hands hang exactly at that height.

Sleeves need the arm's axis and trousers need each leg's; a ring has neither. Producing them means a limb-aware garment builder driven by the rig — which is not a small pipeline addition, it is writing a garment modeller.

**The source decision, made by the owner on 13 August: garments are hand-authored in-house, on the bodies the pipeline already uses.** The alternative considered was v1.7's MakeHuman/MPFB2 fallback, and it was rejected on fit rather than on licence: MPFB2's clothing is authored against *its* base mesh and fitted through its proxy system, so using it here would mean refitting every garment onto Blender Studio bodies — a gentler version of the problem the spike just failed at — or switching the whole figure pipeline to MPFB2 and re-exporting all eight existing figures, which reopens v1.7's body decision to obtain about four coats. **The roster cap is what makes hand-authoring the cheaper answer:** six figures is not a wardrobe system, it is a handful of objects, and modelling them on the base mesh gives correct topology by construction, no new pipeline dependency, and no per-asset licence question. Section 9's asset-pipeline item therefore stays closed as v1.7 left it.

**Proven before the pipeline was touched**, per this section's standing habit. A garment is a separate mesh with its own topology bound to the same rig, so the question that decides whether hand-authoring works at all is whether it deforms *with* the body — a garment that only fits the standing pose has to be re-modelled per pose, and there are four of those per figure. A placeholder garment spanning the hip and both thighs — the hardest case, since seated the thighs swing 90° and pull one tube in two directions — was bound alongside the body and carried through the seated pose correctly, verified in profile (a seated figure read head-on can look like a standing one; the thighs foreshorten to nothing). Evidence in `STATE.md` under "Garment deform spike".

**Built under this amendment, and verified end to end:** `bake_and_export()` now takes a list of meshes, grounding and centring them as one group rather than each separately; `load_garments()` links hand-authored meshes and applies the body's own plan-centring shift so they travel with it; `GARMENT_FIGURES` is the roster table, shipped empty. The authoring contract lives in `assets-src/README.md`. Bare-figure output is unchanged, asserted by measurement against the committed library rather than by inspection.

**The hair half is built, and it is the part of v1.10 that needed no asset.** A cap fitted to the head's own half-extents, cut back from the face high enough to read as a hairline rather than a bonnet, plus a gathered mass for the second figure — `cropped` on the default figure, `gathered` on `-female`, in a `HAIR` table beside the roster. It is **bone-parented to the head**, not skinned: hair rides the skull rather than deforming, and automatic weighting on a detached shell near several bones smears it across the neck. Verified through all four poses, `lying` included. **The committed `.glb`s are not regenerated** — that needs the CC0 bundle, which was not reachable from the machine this was built on, so the library keeps its bald figures until `npm run build:poses` is re-run on a machine that has it. Nothing else changes: paths, `poses.json`, the parser and the envelope are all untouched.

**What remains, and it is not engineering:** the garments themselves. Until they are modelled, `GARMENT_FIGURES` stays empty and the library keeps its eight rows. **Hair is unblocked and can proceed** — the spike landed it (a fitted ellipsoid cap cut back from the face, plus a gathered mass; it reads at 35 mm and is silhouette-only, exactly what this amendment admits).

**What changed in this document**

- **Section 5 Characters**: "Drop expression and costume — nothing to attach them to" is narrowed in place. There is something to attach it to now. Costume as a *field* stays dropped; expression stays dropped entirely.
- **v1.8's "still out" list is reopened in place** on its "any third figure without a further amendment" clause, which is precisely the clause this amendment exists to satisfy.
- **Non-goal #7 is untouched.** Nothing here rigs, articulates, morphs, or expresses. A garment is static geometry exported into a static pose.
- **No schema change, no parser code change, no `.myo` change.** `poses.json` gains rows; `server/parser.js` builds its pose list from that file at require time, so the parser learns new figures from their hints alone — the v1.8 mechanism, reused.

**Authorized to build under this amendment**

1. **Hair derivation in `scripts/blender/build-pose-glbs.py`** — a fitted ellipsoid cap cut back from the face, plus a gathered mass, applied before the armature is applied and the rig deleted, so it poses with the body. **Garment derivation is struck**, per the spike above: garments are hand-authored into `assets-src/garments.blend` and bound to the rig alongside the body, which the pipeline now supports.
2. **Four new figures, bringing the roster to six** — two wardrobe variants per body, chosen for silhouette separation rather than for period or genre. Suffixes and hints land in `poses.json` alongside the existing eight rows.
3. **Coarse hair silhouette on every figure in the roster**, including the existing two, as part of the same export. This changes the four original `.glb` binaries in place; their paths and meaning are unchanged, so saved scenes are unaffected.
4. **Parser hint text for the new figures**, in `poses.json` only. Wardrobe stated in the prompt and matched → that figure. Wardrobe unstated → the default figure for that body, **no flag** (absence of wardrobe is normal, not ambiguous — v1.2's rule for posture, applied unchanged). Wardrobe stated but unmatched ("in a spacesuit") → nearest figure, flagged through the existing `poseNote` path, which already exists and already gets stripped before the scene is built.

**Conventions the new output must meet** — unchanged from v1.7, restated because a garment is the next thing that can violate them silently: base-anchored (`Box3.min.y === 0` within 1 mm, asserted by `poses.test.ts`), faces +Z, life-sized in metres so `scale` stays 1, and **no texture maps** — any authored material is discarded at load by the palette re-material, which is what the out-list requires anyway.

**Still out, and not to be built without a further amendment:** hair beyond coarse silhouette (strands, cards, transparency, physics, hair colour), a seventh figure, wardrobe as a field or a dial on `Character`, garment-as-separate-mesh attachment, per-garment colour, and everything already on section 11's rendering out-list. Rigging, IK, pose editors, morphs, facial expression and animation stay out — non-goals #6 and #7 are untouched by this.

**Acceptance (owner-verifiable, per section 8's convention):**

- [ ] Six figures across four poses render as twenty-four meshes, with no code change outside the pipeline script and `poses.json`.
- [ ] Two characters in one shot, in different wardrobe, are distinguishable at 35mm in camera view — the v1.8 test, one level harder.
- [ ] Every `.glb` in the library measures `min.y = 0` and faces +Z, verified with `scripts/measure-glb.mjs`.
- [ ] Every saved `.myo` referencing the original four paths still loads and renders, now clothed, with no file rewritten on disk.
- [ ] A prompt naming wardrobe parses to the matching figure; a prompt naming none parses to the default figure with no flag.
- [ ] `npx tsc --noEmit`, `npm run test:ci` and `CI=true npm run build` stay green.

**Deliberately not decided here:** whether *props* ever gain authored geometry (still open, as v1.7 left it), and whether the derived-garment approach or a second CC0 source is the long-term pipeline — that is settled by looking at the first export, not by argument.
