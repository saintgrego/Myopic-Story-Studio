# Proposal — more poses, hairstyles, and simple wardrobe

**Status: EXPLORATION, not adopted.** Raised 12 August 2026 by the owner: *"Despite my
thinking I could get away with base manikins in a basic T-pose, I'd like to explore options
for poses, as well as better reference models with basic hairstyles (e.g. short male, long
female, etc) and simple wardrobes."*

This document is the analysis and the argument. Nothing here is authorized to build. **One of
the three tracks needs no amendment at all and could start today; the other two contradict
PRD §2 non-goal #7 as currently narrowed and need a §11 amendment first** — see "What needs
an amendment" at the end.

---

## First, a correction to the premise

The library is not base manikins in a T-pose, and has not been since 10 August. PRD §11 v1.7
replaced the primitive mannequins with authored figure geometry, and v1.8 added a second
body. `public/assets/poses/` today holds **eight `.glb`s — four postures × two figures**,
built by `scripts/blender/build-pose-glbs.py` from the CC0 Blender Studio Human Base Meshes,
500 KB each, 4.0 MB total, all measured at `min.y = 0` and facing +Z.

So the real starting position is better than the prompt assumes, and the three asks land very
differently against it:

| ask | where it stands |
| --- | --- |
| more poses | The pipeline exists and was built for this. Adding poses is content. **No amendment.** |
| better reference models | Already done in v1.7/v1.8. The remaining gap is *readability*, which is what hair and wardrobe buy. |
| hairstyles | New geometry class. The source figures are bald. **Amendment.** |
| simple wardrobe | New geometry class. The source figures are nude. **Amendment.** |

The honest reframing of the request: the figures are anatomically fine but **visually
identical**. Two characters in a two-shot are the same grey body at the same height, and the
only thing distinguishing them is `-female`. Hair and clothing are the cheapest silhouette
cues there are — at blocking scale you read a person by outline, not by surface. That is a
legibility-of-blocking argument, which is the test §11 applies, and it is the same argument
v1.8 made for the second figure. It is not a fidelity argument, and it must not be allowed to
become one.

---

## Track 1 — more poses (no amendment, could start today)

### What the pipeline can express today, and what it can't

`apply_pose()` in `build-pose-glbs.py` walks a 15-bone measured skeleton, but the `POSES`
table exposes only **six named angles, all rotations about the world X axis, all applied
symmetrically to both sides**:

```python
'sitting': {'thighForward': -pi/2, 'kneeBend': pi/2, 'armForward': -0.5, 'elbowBend': -0.4},
```

plus `rootRotX`, which lays the whole figure down (that is all `lying` is). Available joints:
`torsoBend`, `headTilt`, `thighForward`, `kneeBend`, `armForward`, `elbowBend`.

**Reachable now, by adding rows only** — every one of these is a forward/back bend, symmetric:

| pose | why it reads as blocking |
| --- | --- |
| `kneeling` | thigh down, knee fully folded — a different floor contact from `crouching` |
| `sitting-ground` | legs out flat, torso upright — floor-level staging |
| `leaning-back` | torso back, arms down — a chair, a wall, a bar |
| `arms-raised` | hands up — surrender, reaching a shelf, a crowd shot |
| `head-down` | head tilt only — reading, phone, grief; changes the eyeline, which is blocking |
| `slumped` | torso forward, knees soft — collapsed, exhausted |

Cost: a row in `POSES`, a row in `poses.json` ×2 figures, one pipeline run, one screenshot.
Six poses ≈ 12 new files ≈ 6 MB. Under an hour of work per pose once the first is done.

**Not reachable without a pipeline change** — and this is the more interesting half, because
it is where body language actually lives:

- **Anything asymmetric.** Walking, one arm pointing, a hand on one hip, weight on one leg.
  The pose loop applies each angle to `L` and `R` identically.
- **Anything off the X axis.** Arms out to the side, a twisted torso, a head turned to look
  off-camera. `rotate_x()` is hard-coded to `Matrix.Rotation(angle, 4, 'X')`.
- **Contact poses.** Leaning on a wall, sitting *on* a specific prop, hands on a table. These
  need the pose to agree with another object's geometry, which the pipeline has no knowledge
  of. Genuinely hard; probably permanently out.

### The pipeline extension

Small and self-contained — roughly 20 lines, all inside `build-pose-glbs.py`, no app code and
no schema anywhere near it:

1. Generalise `rotate_x(rig, bone, angle)` → `rotate(rig, bone, axis, angle)`, taking the axis
   letter through to `Matrix.Rotation`.
2. Let a `POSES` entry name bones directly and per-side, keeping the friendly aliases as
   sugar that expands to both sides:
   ```python
   'pointing': {'armForward': -0.2, 'upperarm.R': ('Z', -1.2), 'forearm.R': ('X', -0.3)}
   ```
3. Keep the strict proximal→distal ordering and the `view_layer.update()` between turns —
   that ordering is load-bearing and the script's comment explains why at length. Any
   generalisation must preserve it or the shin pivots about where the knee used to be.

Risk: low, and bounded to the generator. The tripwire is that asymmetric poses will expose
whether the *auto-weighted* bind holds up under larger rotations — bone-heat weighting on an
unrigged base mesh is adequate for symmetric bends and may pinch at a rotated shoulder. That
is a "look at it" question, not a design question, and it is exactly what the first
asymmetric export answers.

**This track needs no amendment.** v1.7's acceptance criteria explicitly include *"Adding a
fifth pose is a documented, repeatable procedure"*, and v1.2's rule still holds: if a pose can
be expressed as another `.glb` in the folder, it belongs. All of the above can.

---

## Tracks 2 & 3 — hair and wardrobe

These are one problem twice: **where does the geometry come from, and how does the library
hold it.**

### Where the geometry comes from

**Option A — generate it procedurally in Blender, from the figure's own measured landmarks.**
The pipeline already derives crotch, ankle, knee, armpit and neck heights from the mesh
itself. Hair and clothing are derivable from the same measurements:

- *Hair* — select the head vertices above `neck`, duplicate, push along normals, and cut the
  hairline back from the face. A skull cap, a bob (extend the cap down past the jaw), and a
  long/tied length (a tapered lathe hanging from the crown) cover the silhouettes that matter.
- *Clothing* — select a Z-band of the body, duplicate the surface, `Solidify` outward by
  10–20 mm. Torso + upper arms = a shirt; hips to ankle = trousers; hips to knee, lofted
  wider = a skirt; torso to knee = a coat. It hugs the body because it *is* the body, offset.

  Pros: no new asset dependency, no second licence question, deterministic, rebuilds with the
  library, and it matches the pipeline's existing "where a value is computable from what was
  built, compute it" ethos.
  Cons: real Blender scripting effort (I'd estimate this is the largest single piece of work
  in the whole proposal), and the output is **silhouette-grade, not garment-grade** — no
  collars, no folds, no drape. A coat will read as a coat-shaped shell.

**Option B — source CC0 hair and clothing assets.** MakeHuman/MPFB2 assets are CC0; Blender
Studio ships CC0 characters with hair. Fitting them means binding each garment to the same rig
the pipeline already builds, before baking — which is a genuinely small addition, since the
rig exists and is thrown away anyway.

  Pros: much better geometry, especially hair, which is the thing procedural generation is
  worst at.
  Cons: a second gitignored source bundle and a per-asset licence check; each garment must be
  fitted to *both* bodies, which is manual work the current pipeline has none of; and asset
  geometry is authored for one body, so a female garment on the male mesh will poke through
  and need a shrinkwrap pass.

**Option C — a hybrid, which is what I'd actually recommend.** Procedural for clothing (shells
off the body are genuinely good enough for blocking, and they fit both bodies for free), and
sourced CC0 assets for hair (procedural hair is the weakest output and hair is the strongest
silhouette cue — it is worth the licence check). If sourcing hair stalls, procedural caps are
a serviceable fallback and the tracks are independent.

### How the library holds it — the question that actually matters

This is where the combinatorics bite, and it is the one decision worth the owner's attention.

The library is currently **postures × figures = 4 × 2 = 8**. Add hair and wardrobe as axes and
a flat library multiplies:

| axes | files | bytes |
| --- | --- | --- |
| today: 4 postures × 2 figures | 8 | 4 MB |
| + 6 postures (track 1) | 20 | 10 MB |
| + 3 hair × 3 wardrobe, flat | 180 | ~90 MB |

**Flat pre-baking does not survive contact with three axes.** Ninety megabytes in git is
tolerable-but-unpleasant; the real objection is elsewhere.

**The parser is the binding constraint, not the disk.** `server/parser.js` builds its pose
list from `poses.json` at require time and asks `claude-sonnet-5` to pick one row by its hint.
Choosing 1-of-8 from clearly distinct hints is reliable today. Choosing 1-of-180 from hints
that differ only in `…, short hair, wearing a coat` is a different and much worse problem —
the failure mode is not an error but a plausible wrong pick, which is the kind of bug this
tool's `[?]` sentinel exists to avoid and cannot catch here.

So there are two shapes, and the parser argument, not the byte count, decides between them:

**Shape 1 — a bounded "casting set", flat.** Don't treat hair and wardrobe as axes at all.
Author a fixed, small number of *looks* — say six, each a body + hair + clothing combination
chosen to be maximally distinguishable in a two-shot — and bake each look across the postures.
6 looks × 10 postures = 60 files, ~30 MB.

  Pros: **zero app code change, zero schema change.** `poses.json` gains rows and the contract
  is untouched, exactly as v1.8 did it. Fully reversible. Parser picks 1-of-60, with hints that
  describe a *person* ("a woman with long hair in a coat, standing") rather than a coordinate
  in a feature space — which is much closer to how the source prompt is written anyway.
  Cons: the owner cannot mix — no "that look, but sitting on the floor in a skirt" without a
  pipeline run. Fixed casting, not a wardrobe department.

**Shape 2 — composed meshes.** Ship body, hair and garment as separate per-pose `.glb`s and
compose at load: `mesh: {kind:'composed', parts:[...]}`, with `buildObject()` still the only
code that switches on `mesh.kind`. Files: 20 bodies + 60 hair (tiny) + 60 garments ≈ 140 files
but only ~25 MB, since hair and garment shells are far smaller than a body.

  Pros: any hair with any garment for free; the parser makes three independent easy choices
  instead of one hard one; adding a hairstyle is 20 small files, not a re-bake of everything.
  Cons: **this is a change to PRD §4**, the central architectural requirement, and §4 is not a
  section to amend casually. Every part must still be exported *per pose* (a coat on a seated
  figure is not a coat on a standing one), so composition buys combinatorial freedom, not
  fewer pipeline runs. And `.myo` files gain a mesh variant, which is a real compatibility
  surface — every reader of `mesh` has to handle it.

**Recommendation: Shape 1 now, with a written tripwire to Shape 2.** Shape 1 delivers the
whole of what was asked with no code change and no architectural risk, and the request as
phrased — "basic hairstyles, simple wardrobes" — is a casting request, not a customisation
system. Adopt Shape 2 only when a specific thing Shape 1 cannot do is actually wanted, or when
the parser starts mis-picking in testing. Write that tripwire into the amendment so the
decision is made once, on evidence, rather than argued twice.

### The naming trap, worth getting right up front

The request says "short male, long female". **Name the library rows by silhouette, not by
gender** — `hair-short`, `hair-long`, `hair-tied`, not `hair-male`. Three reasons, all
practical: the parser needs a rule it can apply to an arbitrary description (v1.8 chose
"default" over "male" for exactly this reason and recorded why); a director will want a
long-haired man and a short-haired woman on the second day of using this; and the alternative
bakes an assumption into file paths that saved `.myo` files then make permanent. The *hints*
can absolutely say what is typical — that is what steers the parser — but the paths should
describe what the geometry is.

---

## Sequencing

1. **Track 1a — six new symmetric poses.** No amendment, no pipeline change. Immediate value,
   and it re-exercises the pipeline end to end before anything harder is attempted.
2. **Track 1b — asymmetric/multi-axis pose support.** No amendment. Answers the auto-weighting
   question that tracks 2 and 3 also depend on.
3. **Amendment (§11 v1.10) for hair and wardrobe**, adopting Option C and Shape 1, with the
   Shape 2 tripwire written down.
4. **Build the casting set**, per the amendment.

Each step is independently useful and each one stops cleanly.

## What needs an amendment, precisely

Non-goal #7 was narrowed in v1.7 to let *characters* carry authored figure meshes while
"props, environment, and every other object remain proxy geometry". Hair and clothing are
character geometry, so they arguably ride inside that narrowing already. **They should not be
slipped in on that reading.** The v1.8 precedent is directly on point: body-type variation was
on v1.2's out-list, was defensible on blocking grounds, and was still reopened by a written
amendment rather than treated as content. CLAUDE.md also records that costumes were
deliberately stripped from the schema with "do not resurrect them" — that instruction is about
schema *fields*, and nothing here proposes one, but it is close enough that the distinction
belongs in a document rather than in a commit message.

An amendment would need to: state the blocking-legibility argument and the §11 test applied to
it; confirm no schema change (Shape 1) or scope the §4 change (Shape 2); fix the naming
convention above; and restate that the out-list is untouched — **no cloth simulation, no
drape, no hair strands/cards/physics, no texture maps, no material or shading change of any
kind.** Hair and garments are grey geometry re-materialled from `palette.ts` like everything
else in the library, and this changes geometry, never shading.

## Verification constraint — read before planning the work

**Blender is not installed in the agent container and the 48 MB source bundle is gitignored**,
so none of tracks 1–3 can be built or verified from a Claude Code web session. Every asset in
this proposal has to be produced on the owner's Mac, where the pipeline was spiked and where
`npm run build:poses` points by default. What *can* usefully be done from a session: writing
the amendment, writing the pipeline code for review, and updating `poses.json` and its tests.
What cannot: producing a single `.glb`, or seeing one in the viewport. Plan the split
accordingly — pipeline changes that ship without a run are unverified changes, and
`poses.test.ts` checks grounding, not whether a binary is stale.
