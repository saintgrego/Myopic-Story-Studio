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
- **Camera:** shot type, angle, focal length (mm), depth of field, focus subject, XYZ position, movement (metadata only), aspect ratio. **The focal length must genuinely drive the Three.js camera FOV.** A 35mm and an 85mm must look different.
- **Characters:** figure ID, position XYZ, rotation, scale, visibility, `mesh` reference. Drop expression and costume — nothing to attach them to. **Posture (v1.2) is not a new field:** a pose is expressed entirely through the existing `mesh` reference — `/assets/poses/sitting.glb` *is* the sitting pose. See section 11 for why.
- **Props:** prop ID, position, rotation, scale, visibility, `mesh` reference.

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

**Out, and not to be built without another amendment logged here:** ray tracing, authored PBR materials, texture maps, reflections, bloom, ambient occlusion, and depth-of-field as a rendered effect (the f-stop stays what it is today — stored metadata). Flat/basic materials remain correct, and every object remains proxy geometry.

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
