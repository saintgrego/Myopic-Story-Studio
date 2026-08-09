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
