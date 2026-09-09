# `assets-src/` — pipeline input

Upstream source geometry the Blender pose pipeline consumes. **Nothing here ships to
the browser.** The app's asset library is `public/assets/`, which is committed; the
binaries in this directory are gitignored pending PRD §11 v1.7's storage decision.

## Expected contents

| file | source | licence |
| --- | --- | --- |
| `human-base-meshes-bundle-v1.4.1.zip` (49 MB) | [blender.org demo files](https://www.blender.org/download/demo-files/) — Blender Studio + community | **CC0** |

CC0 means public domain: no attribution required, no redistribution clause, so a mesh
derived from this bundle may be committed to this repo without a licence question. The
bundle holds 17 meshes — full male and female figures plus individual body parts. The
pipeline uses one full figure; which one is recorded in `scripts/blender/build-pose-glbs.py`.

## Why this is not fetched automatically

A build step that reaches out to the network is a build step that breaks when upstream
moves. Fetching is deliberately a manual, recorded act. If the file is missing, the
pipeline fails with a message naming this README rather than downloading anything.

## `garments.blend` — hand-authored wardrobe (PRD §11 v1.10)

| file | source | licence |
| --- | --- | --- |
| `garments.blend` | authored in-house, on the bundle's base meshes | ours |

**Not present yet.** The pipeline reads it only when `GARMENT_FIGURES` in
`scripts/blender/build-pose-glbs.py` has rows, so its absence is harmless until then.
Override the path with `GARMENTS=… npm run build:poses`.

**Why hand-authored.** Deriving garments from the body was tried and failed — see STATE.md,
"Derived-garment spike". A second character system (MakeHuman/MPFB2) was weighed and not
taken: its clothing is fitted to *its* base mesh, so using it here would mean refitting
every garment onto Blender Studio bodies. With the roster capped at six figures, that is a
system's worth of machinery to obtain about four coats.

**The authoring contract**, all of it load-bearing:

1. **Model on the body**, in the bundle's own coordinates — where the figure actually sits
   in `human_base_meshes_bundle.blend`, not at the origin. The pipeline centres the body in
   plan and applies the same shift to the garments; a garment authored at the origin lands
   ~2.26 m to the side of the figure it belongs to.
2. **One object per garment**, named `GARMENT-*`, referenced by name from `GARMENT_FIGURES`.
3. **No rigging, no weights.** The pipeline builds the skeleton, binds body and garments
   with the same automatic weighting, poses, then applies and deletes the rig. Nothing
   rigged ships (non-goal #7).
4. **Hems stop at the ankle.** Export grounds the whole group to `min.z = 0`, so a hem
   modelled below the soles lifts the figure and leaves the feet hovering.
5. **Leave clearance at the hands.** They hang at hip height, and any garment there will be
   intersected by them in some poses — visible in the smoke render.
6. **No texture maps.** Library glTFs are re-materialled from `src/palette.ts` at load.

**Known limitation, inherent to static exports:** a garment does not drape. It deforms with
the bones it is weighted to and nothing else, so a coat stays tubular in the `lying` pose.
Check all four poses when adding a garment, not just `standing`.
