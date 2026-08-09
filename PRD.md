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
7. **No rigging, skeletons, IK, manual joint posing, morphs, or facial expressions — narrowed in v1.2, see section 11.** Characters may take a *posture* by selecting from a library of static baked-pose meshes (a sitting figure is a different `.glb` than a standing one). Nothing articulates at runtime: no bones, no pose editor, no per-joint control. Figures remain static proxy geometry.

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
- **Lighting:** scheme, key direction (azimuth/elevation), key colour, fill ratio, rim toggle, shadow softness, mood preset. These map to real Three.js lights.
- **Camera:** shot type, angle, focal length (mm), depth of field, focus subject, XYZ position, movement (metadata only), aspect ratio. **The focal length must genuinely drive the Three.js camera FOV.** A 35mm and an 85mm must look different. **Focus subject (v1.2 track) aims the shot camera**, and **depth of field is read by the viewport as of v1.3** — as a computed near/far focus readout and ground-plane markers, never as rendered blur. See section 11.
- **Characters:** figure ID, position XYZ, rotation, scale, visibility, `mesh` reference. Drop expression and costume — nothing to attach them to. **Posture (v1.2) is not a new field:** a pose is expressed entirely through the existing `mesh` reference — `/assets/poses/sitting.glb` *is* the sitting pose. See section 11 for why.
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

**What this did not change:** flat/basic materials are still correct, and every object is still proxy geometry. Nothing here touched the parser's output contract, the `.myo` envelope, or the mesh abstraction in section 4.

**Assessed and dropped:** a parser prompt nudge mapping time-of-day to light values. `claude-sonnet-5` already returns sunset-appropriate elevation and key colour unprompted, so the prompt text would have been redundant. Revisit only if a live parse produces bad lighting.

### Rendering scope — the governing rule

This replaces the removed non-goal. It is the whole of the standing policy on how the viewport may look; section 2 no longer speaks to it.

**The test:** a rendering feature is in scope if it answers a *blocking* question — where does the shadow fall, where is the horizon, how far away does that read, what is the camera actually seeing. It is out of scope if it answers a *finishing* question — does this look shot, does this look real, does this look good.

**In, and built:** cast shadows, ground plane, sky dome and horizon, filmic tone mapping, distance fog.

**Out, and not to be built without another amendment logged here:** ray tracing, authored PBR materials, texture maps, reflections, bloom, ambient occlusion, and depth-of-field as a rendered effect (the f-stop drives the focus readout added in v1.3; it must not drive shading). Flat/basic materials remain correct, and every object remains proxy geometry.

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

**Still out, and unaffected by this amendment:** runtime articulation of any kind (bones, IK, a pose editor), animation between poses (non-goal #6 stands), facial expression, and body-type variation. If a pose can't be expressed as "another `.glb` in the folder," it doesn't belong under this amendment.

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

---

### v1.6 — 9 August 2026: fill and rim colour (gel filters)

**Requested by the owner:** temperature (Kelvin) and gel-filter tints for all three lights, not just key.

*(Logged as v1.6, not v1.5 as originally drafted — v1.5 was already taken by the warm/cool proxy palette on 5 August 2026.)*

**Applying the section 11 test:** colour temperature and tint are already established as blocking information — key colour already drives real shading. Extending that to fill and rim is the same category of decision, just applied to two lights that previously had none. **In scope.**

**Schema change (section 5):** `Lighting` gains `fillColor` (hex, default `#ffffff`) and `rimColor` (hex, default `#ffffff`). Both are cosmetically neutral by default so every existing `.myo` renders identically until edited — no migration needed, same pattern as `environment.setting`'s backward-compat fallback.

**Kelvin is an input, not a field.** The lighting panel gains a colour-temperature control that converts Kelvin to RGB via the standard blackbody approximation and writes the result into the existing key colour field. No new schema field: it is an alternate way of setting a value that already exists, and the scene stores the resulting hex.

**Not in scope:** anything gels do in real cinematography beyond colour — barn doors, diffusion, cut. Tint only.

**Parser:** `fillColor` / `rimColor` inference is **not** part of this pass. The parser leaves both at their `#ffffff` default; this is a UI-only change for now.

**Acceptance (owner-verifiable):**
- [ ] A saturated `fillColor` visibly tints the shadow side of every object.
- [ ] A saturated `rimColor` visibly tints the backlight edge, and does nothing when the rim toggle is off.
- [ ] Every pre-existing `.myo` renders identically to before.
