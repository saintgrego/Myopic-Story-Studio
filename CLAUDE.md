# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Myopic! 3-D Studio** — a prompt-driven 3D storyboarding tool. A scene description typed by the user is parsed by `claude-sonnet-5` into a structured scene graph, rendered in a Three.js viewport as proxy geometry, edited via panels, and persisted as `.myo` files plus a storyboard strip. It is a *blocking* tool ("where is everyone standing, what does a 35mm see"), not a rendering tool.

This repo **supersedes an earlier prototype in saintgrego/gericeaux PR #1**. Nothing carries over from that prototype — do not assume its structure, schema, or decisions apply here.

### Repo layout

- `PRD.md` — **the authoritative spec** (v1.2, with amendments in §11). Read §2 (non-goals), §3 (closed decisions — do not reopen), §4 (the mesh abstraction), and §11 (rendering scope + pose support) before building anything.
- `STATE.md` — build log: per-milestone evidence and hard-won gotchas. Update it after significant work (PRD §10 requires this). Most operational landmines in this file are documented at length there.
- `myopic-3d-studio.md` — the original v0.1 spec. Superseded by PRD.md but still valid as a *component/parameter reference*. Its Daz-integration content is dead: all `daz_*` fields, pose presets, expressions, and costumes were removed from the schema. Do not resurrect them.
- `myopic-studio/` — the actual app (CRA + TypeScript + Express).

## Commands

All commands run from `myopic-studio/` (not the repo root).

```bash
npm run dev        # backend (:4000) + CRA dev server (:3000) via concurrently — the normal way to run
npm run server     # backend alone (Express, plain node — NO hot reload)
npm start          # frontend alone (CRA, hot reloads)
npx tsc --noEmit   # the typecheck gate — verified clean; keep it that way
npm run test:ci    # unit tests, single run (CRA Jest) — verified passing
npm run build      # production build (includes CRA's ESLint) — verified passing
node scripts/generate-pose-glbs.mjs   # regenerate the pose .glb library
node scripts/generate-prop-glbs.mjs   # regenerate the prop proxy .glb library
```

- **Tests** live in `src/__tests__/` and run on CRA's bundled Jest 27 (`npm test` for watch mode, `npm run test:ci` for one shot). They cover the `.myo` envelope mapping, the parser's flag/poseNote post-processing (Anthropic API mocked via `global.fetch`), the `sceneStore` `setField` path machinery, and poses.json / props.json ↔ `public/assets/*/**.glb` consistency (both directions for props — an unregistered `.glb` is invisible to the panel and parser). Three gates now: `npx tsc --noEmit`, `npm run test:ci`, `npm run build`. Note `npx jest` directly does **not** work — the Jest config lives inside `react-scripts`.
  - Test files must stay under `src/` (CRA's Jest roots); they may `require()` the CommonJS `server/*` modules directly. Shared fixtures live in `src/testUtils/` — anything inside a `__tests__/` dir is treated as a suite.
  - `src/setupTests.ts` backfills `structuredClone` (Jest 27's jsdom predates it) — sceneStore tests break without it.
  - Viewport.tsx is deliberately untested (Three.js/WebGL doesn't run under jsdom).
- There is no separate lint script; ESLint (`react-app` config) runs inside `npm start`/`npm run build`.
- **Restart the backend after editing `server/*.js`** — it's a plain node process. A newly added route 404ing is almost always a stale backend, not a bug.
- The backend port env var is `MYOPIC_SERVER_PORT`, **not** `PORT` (CRA's dev tooling owns `PORT`). The `PORT=4000` line in `.env.example` is stale — the server never reads it. Use `MYOPIC_SERVER_PORT=4001 node server/index.js` to run a second backend instance (useful for testing parser changes while another backend holds :4000; note the CRA proxy is hardcoded to :4000).
- `ANTHROPIC_API_KEY` lives in `myopic-studio/.env`, server-side only. Never `REACT_APP_`-prefix it (that bundles it into the browser).
- `.claude/launch.json` defines `myopic-dev` (full stack) and `myopic-web-alt` (frontend-only on :3001) for the browser preview tools.

## Architecture

Two processes: a CRA SPA and a local Express backend (`server/index.js`, port 4000). CRA's `"proxy"` field forwards `/api/*`, so there is no CORS setup. **The backend exists because the original scaffold called the Anthropic API directly from the browser (shipping the key in the bundle) and because `.myo` files need real fs access. Never reintroduce browser→Anthropic calls.**

Data flow:

1. Prompt → `POST /api/parse` → `server/parser.js` calls `claude-sonnet-5` (raw `fetch`, not the SDK) with a system prompt that emits the scene schema, using `"[?]"` as the ambiguity sentinel. The server computes `flaggedParams` (dot-paths) from those sentinels — the model is told *not* to emit that field itself.
2. Scene lives in the Zustand `sceneStore` (`src/store/sceneStore.ts`). **Every edit goes through `setField(path, value)`** with a path array (`['camera','focalLength']`, `['characters', idx, 'position', 'x']`). Do not invent per-field setters.
3. `src/components/Viewport.tsx` renders the scene (all Three.js code is in this one file). `SceneHierarchy` selects; `PropertiesPanel` + `fields.tsx` edit; `[?]` values render as placeholder-flagged inputs (`Flagged<T>` in `src/types/scene.ts`).
4. Save → `POST /api/scenes` → `server/myoFormat.js` converts to the on-disk `.myo` envelope (top-level keys snake_case per spec §7.1; nested keys stay camelCase — `myoFormat.js` is the *only* place that knows this) → `scenes/<uuid>.myo`.
5. Storyboard: separate `storyboardStore` → `PUT /api/storyboard` → `storyboard.json`. **Storyboard edits persist immediately — there is no dirty/save gate on them**, unlike scene edits.

### The central architectural requirement (PRD §4)

Every character/prop holds a `mesh` reference: `{kind:'primitive', shape, dimensions}` **or** `{kind:'gltf', path}`. `buildObject()` in Viewport.tsx is the only code allowed to switch on `mesh.kind`. Both variants are first-class; adding real assets must stay a data change, not a code change.

**A pose is a mesh, not a field** (PRD §11 v1.2): `/assets/poses/sitting.glb` *is* the sitting pose. There is no `pose` field anywhere. `src/poses.json` is the single source of truth for the pose library — `PropertiesPanel` imports it, `server/parser.js` `require`s it. Adding a pose = add a row to the generator's `POSES` table, re-run the generator, add a row to `poses.json`. No viewport code exists to touch. The parser's unmatched-posture flag (`characters[i].poseNote` in `flaggedParams`) is computed then **stripped** before the scene is built — `poseNote` never reaches the scene model or disk.

**A prop type is also a mesh** (PRD §11 v1.4): same pattern, same reasons — `/assets/props/sofa.glb` *is* the sofa, `src/props.json` is the single source of truth, `scripts/generate-prop-glbs.mjs` generates the library. There is no `propType` field. Two differences from poses: proxy geometry must sit on the floor itself (the renderer lifts primitives by half their extent, but never lifts a glTF group — `window` is the deliberate exception, its origin is the frame bottom so `position.y` is sill height), and there is **no `propNote` flag** — an unmatched prop falls back to a primitive, which is honest rather than ambiguous. Proxies face +Z and are life-sized, so `scale` stays 1.

**Colour is render-time, never scene state** (PRD §11 v1.5): `src/palette.ts` holds two five-value grey ramps — warm for characters, cool for props — and `Viewport.tsx` assigns by the object's **index in the scene array** (not a filtered counter; hiding one object must not re-colour the others). There is no colour field on `Character` or `Prop` and the `.myo` envelope knows nothing about this. `buildObject()` re-materials library glTFs (paths in `poses.json`/`props.json`) from the palette but leaves any other `.glb` with its own materials — that exemption is the hook for user-supplied assets. The colours baked into the generator scripts are fallbacks only, visible just outside the app.

### Scene-model conventions

- **Positions are base-anchored**: `position.y` is where the object touches the floor, not its center. The renderer lifts primitives by half their vertical extent. If parsed props look floating or double-sized, check for center-anchored y or dimensions duplicated into `scale` (a real bug pattern seen in early fixture data — STATE.md Milestone 3).
- `Character.scale` is a single number; `Prop.scale` is a Vec3. Asymmetric on purpose (parser prompt matches); don't "unify" it casually.
- Prop meshes prefer a **library proxy** from `src/props.json` and fall back to a primitive when nothing fits (PRD §11 v1.4). The parser must never invent a glTF path outside the library.
- Old `.myo` files may lack `environment.setting` — `isExterior()` in Viewport.tsx falls back to sniffing `locationName`. No migration; keep the fallback.

### Rendering scope is governed, not open

PRD §11's test: a viewport feature is in scope if it answers a *blocking* question (shadow direction, horizon, distance), out if it answers a *finishing* question (looks real/good). Shadows, sky dome, ACES tone mapping, and fog are in and built. Ray tracing, PBR/texture maps, reflections, bloom, AO, and rendered DoF are **out** — building one requires logging a PRD §11 amendment first. Load-bearing rendering details (all in Viewport.tsx, all with reasons in STATE.md):

- `PCFShadowMap`, deliberately **not** `PCFSoftShadowMap` — `shadow.radius` (what `shadowSoftness` drives) is a no-op under the soft variant.
- Shadow ortho camera covers ±15 units around origin; objects beyond that silently cast no shadow.
- Size coupling: sky scale 180 < camera far 200; ground plane 120×120 half-diagonal ~85 < sky half-size 90. Change one, re-check the others.
- The fog exposure boosts (`FOG_EXPOSURE_BOOST`, `INTERIOR_FOG_BOOST`) were tuned by sampling rendered pixels (`gl.readPixels`), not derived — ACES makes the arithmetic wrong in the darks. Retune by measurement only.

## Version pins — do not bump without re-verifying

- `three` and `@types/three` are pinned at **0.160.0**. Later `@types/three` ships TSL/WebGPU `.d.ts` syntax that TypeScript 4.9.5 (forced by `react-scripts@5.0.1`'s peer range) cannot parse. Bumping either without a clean `npx tsc --noEmit` will break the build in confusing ways.
- Import Three addons via `three/examples/jsm/...`, **not** `three/addons/...` — the alias resolves at runtime but has no type declarations at 0.160.0.
- `tsconfig.json` `moduleResolution` must stay `"node"` — `react-scripts` verifies and silently rewrites the file on next start if changed.
- Claude API responses: **never read `content[0].text`**. `claude-sonnet-5` runs adaptive thinking by default, so `content[]` can lead with thinking blocks — select with `content.find(b => b.type === 'text')`, and keep `max_tokens` generous (parser uses 8192; thinking spends from the same budget).

## Known cruft, dead ends, and legacy (document-only — deliberately not cleaned up)

- The Anthropic call is raw `fetch` in `server/parser.js`, deliberately not the SDK (`@anthropic-ai/sdk` was a leftover dep from the pre-backend scaffold and has been removed — don't reintroduce it just to make one API call).
- Naming trap: `src/lib/parser.ts` is *not* a parser — it's a thin fetch wrapper for `POST /api/parse`. The actual LLM parser is `server/parser.js`.
- `.env.example`'s `PORT=4000` line is dead (see Commands).
- Mixed module systems, all intentional given the toolchain: `server/` is CommonJS, `scripts/` is ESM `.mjs`, `src/` is TS. Match whichever you're editing.
- `~34 npm audit` vulnerabilities from `react-scripts`' old transitive deps — known, pre-existing; `audit fix --force` would break the CRA toolchain for no benefit.
- `scenes/*.myo` and `storyboard.json` are **the user's data**, checked into the working tree. Don't edit or delete them except through the app or at the user's request; remember storyboard edits persist with no save gate.

## Working agreements (from PRD §10 / STATE.md)

- PRD §3 closed decisions and §2 non-goals are settled — if one seems to block you, stop and ask; don't reopen unilaterally.
- Milestone/feature claims require demonstrated evidence (screenshots, on-disk diffs, live parses), recorded in STATE.md.
- Parser changes only exist in a backend started *after* the edit, and the pre-existing scenes never exercise the parser — restart and run a fresh parse before judging parser behavior.
- Browser-automation quirks in this app (synthetic clicks not registering, selects ignoring re-set of same value): drive interactions via `javascript_tool` and find inputs by their `<label>` text, never by index — an index-based selection once wrote into a storyboard field and auto-persisted. Details in STATE.md Milestones 2/4.
- **A backgrounded preview pane lies about layout and doesn't paint.** `window.innerWidth` reads `0` and computed grid/element widths come back nonsensical while the pane is hidden, and `requestAnimationFrame` never fires, so anything reading pixels (`gl.readPixels`) hangs. Verify visual state with a screenshot — which forces a paint — not with measurements from `javascript_tool`. Both instances are written up in STATE.md (the gel-filter render-diff attempt, and the fail-closed panel work).
