# Review — Rig (PRD v2.0 phase 1)

**Branch under review:** `claude/v2-item-1-rig-vjfr92` — `85d5228` "Rig (PRD v2.0 phase 1)" and `87b2275` "PRD erratum: v2.0 joint set is 20, not 19", on top of `origin/main` at `6dfeeb6`.
**Reviewed:** 26 September 2026, on `review/rig-phase1`.

## Verdict

**Merge after small fixes.** No blockers. The code is in scope, correct, and the viewport renders pixel-identically to `main`. The one should-fix: run `npm run build:figures` once against the CC0 bundle on the Mac before merging. That is a verification step, not a code change. Nobody has run it yet, the builder included, and neither did this review.

## Where this review ran, and what that cost

The review prompt was written for the owner's Mac. It ran in a **cloud container** instead. That changes three things:

1. **Step 0 did not apply.** The container was a fresh clone on `origin/main` (`6dfeeb6`). It had no stashes, no phantom rebase, no modified `STATE.md` or `storyboard.json`, and no untracked `.myo` files, `STATE 2.md`, `Claude outputs/` or `spike.test.ts`. None of the Step 0 commands were needed. The Mac's own state was **not touched and not checked**.
2. **Step 3 could not use the bundle.** `assets-src/` holds only its README; the 48 MB CC0 bundle is not in the container. Blender.app is not installed either. I installed the pip `bpy` module, version 5.0.1, which is the same one the builder used, and rebuilt from the committed `standing*.glb` through the `load_standing_glb` route. Outputs went to a scratch directory, so `public/assets` was never written.
3. **Step 5.2 used headless Chromium.** The rendering is SwiftShader via Playwright, not a desktop browser.

## Findings

| # | Severity | File:line | What's wrong | Failure scenario | Suggested fix |
|---|---|---|---|---|---|
| 1 | should-fix | `myopic-studio/package.json` (`build:figures`); `scripts/blender/build-figure-glbs.py:260` (`weld`), `:302` (multires removal) | The canonical build path (bundle `.blend` → figures) has never been run by anyone. The committed figures come from the `.glb` route. On the bundle route, `weld()` runs `remove_doubles` on a mesh that still carries its Multires modifier, and bone heat then runs on it. The multires removal only happens at export. | The owner runs `npm run build:figures` for the first time in phase 2. It errors, or it produces figures that differ from the committed ones (vertex count, weights, joint positions, byte size), and nobody knows which set is right. | On the Mac: `npm run build:figures`, then compare against the committed files with the compare script under Evidence. Keep the committed binaries if the geometry matches. If it doesn't, move the multires removal ahead of `weld()` (the pose build removes it before export, not before binding) and re-check the renders and ceilings. |
| 2 | nit | `myopic-studio/src/rig.ts:45` | `/^mixamorig\d*[:_]?/` takes only one separator, and it eats digits that belong to the bone name once the loader has deleted the colon. | `mixamorig__Hips` → `_Hips`. `mixamorig:1stBone` reaches the regex as `mixamorig1stBone` → `stBone`. Phase 2 would then silently fail to find a joint. Neither shape occurs in real Mixamo exports. | Change `[:_]?` to `[:_]*` if double underscores matter. The digit case can't be fixed after the colon is gone, so accept it and document it. |
| 3 | nit | `scripts/blender/build-pose-glbs.py:376` | `parent_to_head(..., head='head')` gained a parameter that no caller uses. The figure build uses its own `skin_to_head`. | None. It is speculative parameterisation. | Drop the parameter, or leave it and stop listing it in STATE.md as a figure-build need. |
| 4 | note | `myopic-studio/src/components/Viewport.tsx:176` | `stripRigPrefixes` runs on every glTF, including user-supplied ones, **after** GLTFLoader has made node names unique. | A file with both `mixamorig:Hips` and `Hips` ends up with two nodes named `Hips`. A file with animation tracks would lose its bindings. Neither affects anything today: stripping was verified as a no-op on all 42 library `.glb`s, and animation is non-goal #6. | Nothing for phase 1. Phase 2 should look joints up through `skeleton.bones`, not `getObjectByName`. |
| 5 | note | `myopic-studio/src/rig.ts:35` | `JointName` is exported from `rig.ts`. PRD §5 specifies `JointName` as part of the `scene.ts` addition. | Phase 2 redeclares it in `scene.ts`, and the two copies drift. | Phase 2 should import it from `rig.ts` (or move it) so there is one source. |
| 6 | note | `docs/rig-rest-front.png` | The rest render shows a horizontal shading step at the waist and a V at the groin on both figures. These are exactly where the old seams ran. | Measurement rules out the asset. Across every coincident vertex pair (1,582 male, 1,631 female), normals agree to 0.0° and skin weights to 0.0000. So it is not a seam or a tear, and is probably the builder's render harness. It can't be checked in the app yet, because nothing references the figures. | Re-check the first time phase 2 puts a figure in the viewport. |
| 7 | note | `public/assets/figures/*.glb` vs `public/assets/poses/*.glb` | The figures carry hair. The committed pose library is bald: it predates the HAIR table, as CLAUDE.md already documents, so this is not this branch's defect. | Any pose rebuild, on either script version, adds about 1,000 vertices and about 2 cm of height to all 30 files. Swapping from the pose library to the figures (phase 6) will visibly add hair. | Owner awareness only. |
| 8 | note | `myopic-studio/src/components/Viewport.tsx` (palette exemption) | The figure paths are in neither `poses.json` nor `props.json`, so `buildObject()` would keep the exporter's default material for them. The builder already documents this. | A character pointed at `/assets/figures/mannequin.glb` by hand renders in the wrong colour. | Phase 2 decides how figures are registered. |

**Counts:** 0 blocker · 1 should-fix · 2 nit · 5 note.

## Owner decisions needed

1. **Erratum or amendment for "19 → 20"?** Commit `87b2275` edits the text of a §3 closed decision in place. It adds a changelog line and an inline note in §11 v2.0, with no version bump.
   - **My opinion: an erratum is acceptable.** The named list is the operative spec and never changed. §5's `JointName` type already spelled out the same 20 names. Only a summary count was wrong, so no decision is reopened.
   - **The case against:** every other PRD change (v1.1–v2.1) is a versioned §11 amendment. This one creates a precedent for editing closed-decision text without a version. A "v2.0.1" entry in §11 would keep the convention uniform at almost no cost.
   - **One more thing to confirm:** STATE.md says "the owner had the count corrected". I can't verify that approval from the repo. If you did not approve it, the commit went beyond the builder's remit.
2. **Should the bundle rebuild (finding 1) gate the merge, or follow it?** It gates the merge if the committed figures must be reproducible from the source of truth before phase 2 builds on them. That is my recommendation. If the `.glb`-route provenance is acceptable for now, it can follow the merge.
3. **Re-run `build:poses` to give the pose library its hair?** This is an existing backlog item, but it matters more now that the figures have hair and the poses do not (finding 7). It is out of scope for this PR.

## Step 1 — scope checks

1. **Scope — PASS.** 14 files changed:
   - `rig.ts` and `figures.test.ts`
   - `build-figure-glbs.py` and the `build-pose-glbs.py` refactor
   - the two figure `.glb`s
   - one import and one call in `Viewport.tsx`
   - `package.json` (`build:figures`)
   - CLAUDE.md, PRD.md and STATE.md
   - three PNGs in `docs/`

   There is nothing in `types/scene.ts`, `server/parser.js`, `server/myoFormat.js`, `poses.json`, `props.json`, `sceneStore.ts` or the panels. There is no `FigurePose`, parser, gizmo, IK or shim.
2. **Viewport change — PASS.**
   - **PRD cover:** decision 1 says "the loader strips the prefix on import", which covers the call.
   - **`mesh.kind` rule:** `buildObject()` is still the only *rendering* switch on `mesh.kind`. `PropertiesPanel.tsx:87–131` and `lib/framing.ts:95` also read `mesh.kind`, but both predate this branch and are identical on `origin/main`.
   - **Name lookups:** `getObjectByName`, `.name ===` and `.name.` appear nowhere in `src/` or `server/` outside tests, apart from `PropertiesPanel.tsx:111`. That line compares a library entry's `name`, not a node. Renaming nodes cannot break anything today.
3. **Erratum — the count is right.**
   - The list is 6 centreline + 2 × 7 = **20**.
   - `JOINT_PARENT` in `src/rig.ts` and in `build-figure-glbs.py` agree name for name and parent for parent. Both are standard Mixamo: Shoulders under `Spine2`, UpLegs under `Hips`.
   - §5's `JointName` expands to the same 20 names. §5 specifies no hierarchy, so there is nothing there to check parents against.
   - `figures.test.ts` asserts the exported skeletons equal the `rig.ts` table. Whether this should be an erratum is under Owner decisions.
4. **Prefix regex — acceptable.** The table is under Evidence. Every name in the prompt comes out right, and the edge cases are finding 2.
5. **`build-pose-glbs.py` refactor — PASS, and behaviour-neutral as measured.**
   - The defaults equal the old literals (`ARM_BONES`, `('spine','neck')`, `'head'`).
   - The `__main__` guard doesn't change Blender's `--python` behaviour.
   - One side effect: the file does `import bmesh` at module top, which fails under pip-`bpy` unless `bpy` is imported first. The figure build does that, and so does Blender itself. This is pre-existing and harmless.
6. **Byte ceilings — PASS.**
   - `MAX_FIGURE_BYTES = 1_000_000` gives +21.8% headroom over 821,072 and +19.3% over 838,036.
   - `MAX_LIBRARY_BYTES = 2_000_000` gives +20.5% over 1,659,108.
   - Both are named constants. The comment cites PRD §11 v2.0 and STATE.md for the source sizes, and names the failure modes they are meant to catch.
   - That is tight enough to catch a doubled figure and loose enough for a routine rebuild. The figures here rebuilt byte-for-byte in size.
7. **`build:figures` — PASS.** It mirrors `build:poses`: same `${BLENDER:-/Applications/Blender.app/...}` override, same `--background --factory-startup`. It correctly omits the garments argument, because the figure script takes exactly `<source> <out-dir>`.

## Evidence

### Step 2 — gates (branch HEAD `87b2275`, from `myopic-studio/`, after `npm ci`)

```
$ npx tsc --noEmit
(no output) — exit 0

$ npm run test:ci
PASS src/__tests__/apiClients.test.ts
PASS src/__tests__/serverRoutes.test.ts
PASS src/__tests__/sets.test.ts
PASS src/__tests__/parser.test.ts
PASS src/__tests__/framing.test.ts
PASS src/__tests__/lighting.test.ts
PASS src/__tests__/sceneStore.test.ts
PASS src/__tests__/storyboardStore.test.ts
PASS src/__tests__/dof.test.ts
PASS src/__tests__/palette.test.ts
PASS src/__tests__/props.test.ts
PASS src/__tests__/myoFormat.test.ts
PASS src/__tests__/figures.test.ts
PASS src/__tests__/poses.test.ts
Test Suites: 14 passed, 14 total
Tests:       261 passed, 261 total
— exit 0

$ npm run build
Creating an optimized production build...
Compiled successfully.
  212.62 kB  build/static/js/main.ca0eafac.js
  3.8 kB     build/static/css/main.69a34038.css
— exit 0
```

This matches the builder's claim (14 suites, 261 tests). The local-only `spike.test.ts` does not exist in this container, so there is no "with spike" count. On the Mac, expect 15 suites.

### Step 3 — rebuild comparison (pip `bpy` 5.0.1, source = committed `public/assets/poses/standing*.glb`, output to scratch)

Three comparisons. Geometry was compared per vertex in world space after loading through three.js GLTFLoader. For figures, the joint world positions and every skin weight were compared too.

**A. Committed figures vs rebuilt figures (branch script)**

| File | Bytes (committed / rebuilt) | Result | Verts | Max Δ vertex | Max Δ joint | Max Δ weight | min.y |
|---|---|---|---|---|---|---|---|
| `mannequin.glb` | 821,072 / 821,072 | same size, different bytes | 13,008 / 13,008 | 3.7e-9 m | 0 | 0 | 0.0000 |
| `mannequin-female.glb` | 838,036 / 838,036 | same size, different bytes | 13,279 / 13,279 | 7.5e-9 m | 0 | 0 | 0.0000 |

**Geometry identical.** The byte difference is the exporter's known run-to-run non-determinism.

**B. The refactor claim: poses from `origin/main`'s script vs the branch's script, same input.** All 30 files are the same size in both builds. The worst per-vertex Δ is **7.45e-9 m** and the vertex and triangle counts are identical. **The claim "all 30 rebuilt poses geometry-identical to before" is verified**, where "before" means the pre-edit script:

| File | Bytes | Verts | Max Δ |
|---|---|---|---|
| arms-raised / -female | 554,396 / 565,716 | 13,008 / 13,279 | 3.7e-9 / 7.5e-9 |
| crouching / -female | 554,432 / 565,752 | same | 3.7e-9 / 7.5e-9 |
| gesturing / -female | 554,396 / 565,716 | same | 1.9e-9 / 7.5e-9 |
| head-down / -female | 554,396 / 565,716 | same | 3.7e-9 / 7.5e-9 |
| kneeling / -female | 554,432 / 565,752 | same | 3.7e-9 / 7.5e-9 |
| leaning-back / -female | 554,396 / 565,716 | same | 3.7e-9 / 7.5e-9 |
| looking-off / -female | 554,396 / 565,712 | same | 3.7e-9 / 7.5e-9 |
| lying / -female | 554,492 / 565,812 | same | 3.7e-9 / 7.5e-9 |
| pointing / -female | 554,396 / 565,716 | same | 7.5e-9 / 7.5e-9 |
| sitting / -female | 554,432 / 565,752 | same | 3.7e-9 / 7.5e-9 |
| sitting-ground / -female | 554,432 / 565,752 | same | 3.7e-9 / 7.5e-9 |
| slumped / -female | 554,436 / 565,752 | same | 3.7e-9 / 7.5e-9 |
| standing / -female | 554,396 / 565,716 | same | 3.7e-9 / 7.5e-9 |
| turned-to-listen / -female | 554,392 / 565,716 | same | 3.7e-9 / 7.5e-9 |
| walking / -female | 554,432 / 565,756 | same | 3.7e-9 / 7.5e-9 |

**C. Committed poses vs either rebuild.** All 30 files differ in size. The committed files are 512,3xx–512,4xx bytes with 12,010 vertices; the rebuilds are 554–566 KB with 13,008 or 13,279 vertices, and max.y is up to about 2 cm taller. That is the **hair**: the committed pose library predates the HAIR table (CLAUDE.md), and both script versions add it. It is not caused by this branch (see B), and none of the 30 is near 156 KB, so the primitive fallback never ran. Every `min.y` = 0.0000.

`public/assets` was never written, so there was nothing to restore. `git status --short public/assets` is empty.

**Extra check: no tearing.** For every pair of coincident vertices in each committed figure (the exporter re-splits at UV seams), skin weights agree exactly. With every joint rotated +60° about local X at once, the widest gap between coincident vertices was **0.000 mm** in both figures. This confirms the "weld before bone heat" fix in the shipped assets.

### Step 4 — loader probe (temporary `src/__tests__/rig-review.test.ts`, run then deleted)

```
PREFIX TABLE  (input → stripRigPrefix | what GLTFLoader leaves → stripRigPrefix)
"mixamorig:Hips"         → "Hips"            | "mixamorigHips"         → "Hips"
"mixamorigHips"          → "Hips"            | "mixamorigHips"         → "Hips"
"mixamorig_Hips"         → "Hips"            | "mixamorig_Hips"        → "Hips"
"mixamorig1:Hips"        → "Hips"            | "mixamorig1Hips"        → "Hips"
"mixamorig12Hips"        → "Hips"            | "mixamorig12Hips"       → "Hips"
"mixamorig"              → "mixamorig"       | "mixamorig"             → "mixamorig"
"mixamorig:"             → "mixamorig:"      | "mixamorig"             → "mixamorig"
"Hips"                   → "Hips"            | "Hips"                  → "Hips"
"NotmixamorigHips"       → "NotmixamorigHips"| "NotmixamorigHips"      → "NotmixamorigHips"
"mixamorig:LeftHand_end" → "LeftHand_end"    | "mixamorigLeftHand_end" → "LeftHand_end"
-- extras --
"mixamorig2"             → "mixamorig2"      | "mixamorig2"            → "mixamorig2"
"mixamorig1Spine2"       → "Spine2"          | "mixamorig1Spine2"      → "Spine2"
"MixamoRig:Hips"         → "MixamoRig:Hips"  | "MixamoRigHips"         → "MixamoRigHips"
"mixamorig__Hips"        → "_Hips"           | "mixamorig__Hips"       → "_Hips"        ← finding 2
"mixamorig:1stBone"      → "1stBone"         | "mixamorig1stBone"      → "stBone"       ← finding 2
"mixamorig1stBone"       → "stBone"          | "mixamorig1stBone"      → "stBone"
"mixamorig:Hips_1"       → "Hips_1"          | "mixamorigHips_1"       → "Hips_1"

mannequin.glb nodes: Group:Scene, Object3D:rig, SkinnedMesh:GEO-body_male_realistic001, Bone:Hips, Bone:Spine, Bone:Spine1, Bone:Spine2, Bone:Neck, Bone:Head, Bone:LeftShoulder, Bone:LeftArm, Bone:LeftForeArm, Bone:LeftHand, Bone:RightShoulder, Bone:RightArm, Bone:RightForeArm, Bone:RightHand, Bone:LeftUpLeg, Bone:LeftLeg, Bone:LeftFoot, Bone:RightUpLeg, Bone:RightLeg, Bone:RightFoot
mannequin-female.glb nodes: (same 20 bones, SkinnedMesh:GEO-body_female_realistic001)
no-op verified on 42 library .glb files   (30 poses + 12 props — wider than the prompt's one file)

PASS src/__tests__/rig-review.test.ts
  ✓ prefix table
  ✓ stripRigPrefixes is a no-op on every current pose and prop .glb
  figure mannequin.glb        ✓ bones ⊆ JOINTS and JOINTS ⊆ bones after stripping
  figure mannequin-female.glb ✓ bones ⊆ JOINTS and JOINTS ⊆ bones after stripping
Tests: 4 passed, 4 total
```

The file was deleted after the run, and `git status --short` was clean.

### Step 5 — look at it

**`docs/rig-rest-front.png`**
- **Shows:** both figures in rest A-pose, grounded, facing camera, with hair skinned to Head (a cropped cap on the male, a cap on the female).
- **Supports the claims?** Yes for rest pose and grounding.
- **Caveat:** the shading band at the waist and groin is finding 6. Measured, it is not a seam in the asset.

**`docs/rig-flexion-front.png`**
- **Shows:** seated (thighs +90°, shins −90°), one arm overhead, the other forward and bent.
- **No tearing anywhere.** That supports the weld fix, and the numeric 0.000 mm check agrees.
- **Shoulder:** the raised shoulder is clean, with no cap folding through the torso. The deltoid thins, but that is acceptable at blocking scale.
- **Knees:** they show the linear-skinning pinch STATE.md already discloses.
- **Hips and elbows:** they read correctly.

**`docs/rig-flexion-side.png`**
- **Shows:** the same pose in profile, with both figures overlapping.
- **Deformation:** the hip fold, the forward lean (Spine1 +15°) and the chin drop (Head +20°) all read as intended.
- **Hair:** the female bun follows the head, with no drift.

**Viewport — `docs/review-rig-phase1-viewport.png`**
- **Scene:** "Two Detectives — Office at Night" (`62a26f9c…myo`: `standing.glb` + `sitting.glb` characters and a desk and lamp), loaded through the UI from a full `npm run dev` stack in headless Chromium. There were no console errors or warnings.
- **Comparison:** I took the same screenshot with `origin/main`'s `Viewport.tsx` hot-swapped in, then restored it (`git checkout HEAD -- …`, diff empty).
- **Result: 0 differing pixels, max channel Δ 0.** A second branch run was also 0/0, so the harness is deterministic. The viewport is unchanged from `main`.

## Claims verified vs not verified

**Verified here**

| Claim | How |
|---|---|
| Three gates pass: 14 suites, 261 tests | Run on the branch; output above |
| The pose-build refactor is geometry-identical, all 30 poses | Rebuilt with both script versions; worst Δ 7.45e-9 m |
| Committed figures reproduce from the `.glb` route | Same sizes, geometry identical, weights and joints exact |
| No tearing: the weld fix is present in the shipped assets | Coincident-vertex weight check and 60° posed-gap check |
| Skeletons equal the 20-joint table after stripping | Probe test on both figures |
| Stripping is a no-op on the current library | All 42 `.glb` files |
| Viewport unchanged vs `main` | Pixel diff, 0 pixels |
| Scope, PRD cover, ceilings, `build:figures` script | Step 1 |

**Not verified, and why**

| Claim | Why not |
|---|---|
| **Bundle-route build** (`npm run build:figures` / `build:poses` against `human_base_meshes_bundle.blend`) | The bundle and Blender.app are not in this container. This is finding 1, and it is the one thing Step 3 was meant to cover on the Mac. |
| Behaviour on Blender 5.2.0 (the owner's last recorded Blender) | Only `bpy` 5.0.1 was available |
| The Mac's local state: Step 0, stashes, untracked files, `spike.test.ts` suite count | Not this machine; nothing on the Mac was read or changed |
| Figures rendered inside the app | By design nothing references them until phase 2 |
| Owner approval of the erratum | The approval is not recorded in the repo |
