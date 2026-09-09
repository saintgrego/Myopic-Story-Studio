# SPIKE — derived garment and hair geometry (PRD §11 v1.10, proving before scoping).
#
# NOT the pipeline. This exists to answer one question before `poses.json` grows a single
# row: can wardrobe and coarse hair be DERIVED from the body mesh the pipeline already
# has, rather than taken from a second upstream asset? v1.2 and v1.7 both proved their
# mechanism before the library grew; this is that step for v1.10.
#
# Run from myopic-studio/:
#
#   blender --background --factory-startup --python scripts/blender/spike-garment.py \
#       -- <source.glb> <out.glb>
#
# WHY IT READS A .glb AND NOT THE BUNDLE. The pipeline's real input is the CC0 Blender
# Studio bundle in assets-src/, which is gitignored and was not reachable from the machine
# this spike ran on. The committed pose library IS that bundle's output — same geometry,
# already posed, already grounded — so the spike measures and derives against real figure
# geometry rather than a stand-in. What this cannot test is the one thing that needs the
# rig: whether a garment built BEFORE posing deforms correctly WITH the body. That is
# called out in STATE.md and is the pipeline's job, not the spike's.
#
# AXES. A .glb is Y-up and faces +Z (the app's convention). Blender's importer converts to
# Z-up, which puts the figure facing -Y — the same in-Blender convention the pose pipeline
# measures against, so the landmark code below transfers unchanged. Re-exporting maps it
# back. Asserted at import rather than assumed, because everything downstream depends on
# which way "front" is.

import sys
from math import cos, sin, pi

import bpy
import bmesh
from mathutils import Vector

# Garment geometry, in metres. These are the spike's dials — the numbers a pipeline
# version would move into a table beside the POSES one.
COAT_OFFSET = 0.022      # how far the shell stands off the body
COAT_HEM_DROP = 0.42     # how far below the crotch the skirt falls (mid-thigh)
SKIRT_FLARE = 0.055      # extra radius at the hem, on top of the body's own silhouette
HAIR_OFFSET = 0.011      # skull-cap standoff
BUN_RADIUS = 0.062


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) not in (2, 3):
        raise SystemExit('usage: ... -- <source.glb> <out.glb> [coat|skirt]')
    return argv[0], argv[1], (argv[2] if len(argv) == 3 else 'coat')


# ---------------------------------------------------------------- measurement
#
# Deliberately copied from build-pose-glbs.py rather than imported: that file is a script
# Blender runs, not a module, and a spike must not force a refactor of working pipeline
# code to run. If this approach graduates, the shared half moves into a module once —
# noted here so the duplication is a decision rather than an oversight.


def world_verts(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def slice_at(verts, z, tol):
    return [v for v in verts if abs(v.z - z) < tol]


def widest_gap(band):
    xs = sorted(v.x for v in band)
    if len(xs) < 2:
        return 0.0, 0.0
    gaps = [(xs[i + 1] - xs[i], (xs[i + 1] + xs[i]) / 2) for i in range(len(xs) - 1)]
    return max(gaps)


def measure(obj):
    """Landmark heights, from the mesh's own geometry. Same doctrine as the pipeline."""
    verts = world_verts(obj)
    z0 = min(v.z for v in verts)
    z1 = max(v.z for v in verts)
    height = z1 - z0
    tol = height * 0.006

    def scan(lo, hi, step=0.005):
        z = lo
        while z < hi:
            yield z, slice_at(verts, z, tol)
            z += step

    crotch = z0 + height * 0.45
    for z, band in scan(z0 + height * 0.30, z0 + height * 0.55):
        if len(band) < 8:
            continue
        gap, _ = widest_gap(band)
        if gap <= 0.02:
            crotch = z
            break

    armpit = z0 + height * 0.75
    for z, band in scan(z0 + height * 0.60, z0 + height * 0.85):
        gap, _ = widest_gap(band)
        if gap > 0.02:
            armpit = z

    neck, drop = z0 + height * 0.84, 0.0
    prev = None
    for z, band in scan(armpit, z1 - height * 0.10):
        if len(band) < 8:
            continue
        w = max(abs(v.x) for v in band)
        if prev is not None and prev - w > drop:
            drop, neck = prev - w, z
        prev = w

    return {'floor': z0, 'top': z1, 'height': height,
            'crotch': crotch, 'armpit': armpit, 'neck': neck}


def facing(obj):
    """Which way is front? Returned as a sign on y.

    TWO OBVIOUS TESTS FAIL HERE, and the spike shipped both before measuring the result.

    1. "Which extreme overhangs the head's bbox midline further" is a tautology: mid is
       (min+max)/2, so the distances are equal BY CONSTRUCTION and the comparison always
       takes its else branch.
    2. "The centroid sits behind the bbox centre, because a skull is a volume and a nose is
       a spike" is a real argument and still wrong on this mesh — the face carries eyes,
       nose and lips, so its VERTICES outnumber the back of the skull badly enough to drag
       the centroid forward.

    What survives measurement is that same density, used directly instead of through a
    centroid: sliced front-to-back, the face end of the head holds several times the
    vertices of the cranium. Measured on standing.glb: ~1,000 per 2 cm slice at the face
    against ~60 at the back. Both failed tests reported the wrong sign, and the only
    symptom either produced was a hair bun sitting on the figure's face.
    """
    m = measure(obj)
    head = [v for v in world_verts(obj) if v.z > m['neck']]
    ys = [v.y for v in head]
    lo, hi = min(ys), max(ys)
    quarter = (hi - lo) * 0.25
    front_heavy = len([y for y in ys if y < lo + quarter])
    back_heavy = len([y for y in ys if y > hi - quarter])
    return -1.0 if front_heavy > back_heavy else 1.0


# ---------------------------------------------------------------- derivation


def ring_loft(obj, z_top, z_bot, flare, name, segments=48, rings=16, offset=COAT_OFFSET):
    """The coat, lofted from the figure's silhouette rather than copied off its skin.

    THIS REPLACED THE BAND-DUPLICATE METHOD FOR THE WHOLE GARMENT, not just the skirt, and
    the render is why. A shell offset from the body surface reproduces the body: the first
    spike render showed pectorals, abdominals and a navel through the "coat", because that
    is literally what the geometry is. A garment has to be a SIMPLER volume than the body,
    not a parallel copy of it — so the coat is built as a smooth loft that ignores surface
    detail and keeps only the silhouette.

    Below the crotch this matters for a second reason: the body is two legs there, so a
    duplicated band produces TROUSERS. A ring encloses whatever is inside it — one leg,
    two legs, or the gap between them — which is what makes a skirt possible at all.
    """
    verts = world_verts(obj)
    height = max(v.z for v in verts) - min(v.z for v in verts)
    tol = height * 0.02

    def radius_profile(z):
        band = [v for v in verts if abs(v.z - z) < tol]
        if not band:
            return None
        cx = (min(v.x for v in band) + max(v.x for v in band)) / 2
        cy = (min(v.y for v in band) + max(v.y for v in band)) / 2
        buckets = [0.0] * segments
        radii = []
        for v in band:
            dx, dy = v.x - cx, v.y - cy
            r = (dx * dx + dy * dy) ** 0.5
            radii.append(r)
            from math import atan2
            k = int(((atan2(dy, dx) + pi) / (2 * pi)) * segments) % segments
            buckets[k] = max(buckets[k], r)
        for k in range(segments):
            if buckets[k] == 0.0:
                near = [buckets[(k + d) % segments] for d in (-2, -1, 1, 2)]
                buckets[k] = max(near) if any(near) else 0.12

        # CLAMP TO THE TORSO, OR THE HANDS BECOME THE COAT. The arms hang at the sides and
        # the hands sit at hip height, so a plain per-sector max at the waist returns the
        # distance to the KNUCKLES — about twice the torso radius. The first render turned
        # that into a horizontal barrel sticking out at the hips, which is the single most
        # visible defect in it. The median radius of a slice is the body core (the hands
        # are a small fraction of the vertices at any height), so clamping each sector to a
        # margin above the median keeps the torso's real shape and drops the outliers.
        radii.sort()
        median = radii[len(radii) // 2]
        limit = median * 1.30
        buckets = [min(r, limit) for r in buckets]
        return Vector((cx, cy, z)), buckets

    # SMOOTHING IS NOT COSMETIC HERE, it is the difference between cloth and crumpled
    # paper. A raw per-sector maximum is a noisy function of where the body's vertices
    # happen to fall, and the median clamp above flattens whole runs of sectors against
    # the same limit. The second spike render was a lumpy cape with hard horizontal
    # creases for exactly that reason. Cloth hangs smoothly in both directions, so the
    # profile is smoothed in both: around each ring, and down the loft.
    def smooth_ring(buckets, window=5, passes=2):
        out = list(buckets)
        for _ in range(passes):
            out = [sum(out[(k + d) % segments] for d in range(-(window // 2), window // 2 + 1)) / window
                   for k in range(segments)]
        return out

    profiles = []
    for i in range(rings + 1):
        t = i / rings
        z = z_top + (z_bot - z_top) * t
        prof = radius_profile(z)
        if prof is None:
            continue
        centre, buckets = prof
        profiles.append((t, centre, smooth_ring(buckets)))

    # Vertical smoothing, then a monotonic floor below the hip: a hem may widen going down
    # but must never narrow, or the skirt sucks back onto the calves and reads as jodhpurs
    # — which is what the flare exponent was papering over before.
    for _ in range(2):
        for i in range(1, len(profiles) - 1):
            _, _, a = profiles[i - 1]
            t, c, b = profiles[i]
            _, _, d = profiles[i + 1]
            profiles[i] = (t, c, [(a[k] + 2 * b[k] + d[k]) / 4 for k in range(segments)])
    for i in range(1, len(profiles)):
        t, c, b = profiles[i]
        _, _, prev = profiles[i - 1]
        profiles[i] = (t, c, [max(b[k], prev[k]) for k in range(segments)])

    bm = bmesh.new()
    loops = []
    for t, centre, buckets in profiles:
        grow = offset + flare * max(0.0, t) ** 1.4
        loops.append([bm.verts.new((centre.x + (buckets[k] + grow) * cos(2 * pi * k / segments - pi),
                                    centre.y + (buckets[k] + grow) * sin(2 * pi * k / segments - pi),
                                    centre.z))
                      for k in range(segments)])

    for a, b in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    skirt = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(skirt)
    skirt.matrix_world = obj.matrix_world

    solid = skirt.modifiers.new('solidify', 'SOLIDIFY')
    solid.thickness = 0.014
    return skirt


def hair(obj, m, front_sign):
    """Coarse head silhouette: a skull cap that stops short of the face, plus a gathered
    mass at the back. Silhouette only — this is the whole of what v1.10 admits.

    THE CAP IS AN ELLIPSOID FITTED TO THE HEAD, NOT A COPY OF THE SCALP. Deriving it by
    duplicating skull faces and pushing them along their normals produced a crown of
    spikes in the first render: the head is the densest, most detailed part of the mesh,
    so a per-vertex offset amplifies every bump in it, and the band's cut edge shows as a
    ragged fringe. A fitted primitive has none of those problems and is the *right* level
    of description for a silhouette anyway — v1.10 admits hair as a shape, not as hair.
    """
    head_h = m['top'] - m['neck']
    head = [v for v in world_verts(obj) if v.z > m['neck'] + head_h * 0.25]
    cx = (min(v.x for v in head) + max(v.x for v in head)) / 2
    cy = (min(v.y for v in head) + max(v.y for v in head)) / 2
    half_x = (max(v.x for v in head) - min(v.x for v in head)) / 2
    half_y = (max(v.y for v in head) - min(v.y for v in head)) / 2
    crown = m['top']

    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=32, ring_count=16,
                                         location=(cx, cy, crown - half_y * 0.86))
    cap = bpy.context.active_object
    cap.name = 'hair-cap'
    cap.scale = (half_x + HAIR_OFFSET, half_y + HAIR_OFFSET, half_y * 0.96 + HAIR_OFFSET)
    bpy.ops.object.transform_apply(scale=True)

    # Cut the face out of the cap, so it reads as a hairline rather than a helmet. THIS is
    # the asymmetry that gives an otherwise symmetric skull a front and a back at 35 mm —
    # the one thing hair contributes that survives §11's blocking test.
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    face_cut = cy + front_sign * half_y * 0.34
    drop = []
    for f in bm.faces:
        c = cap.matrix_world @ f.calc_center_median()
        ahead = (c.y - face_cut) * front_sign > 0
        # Cut high, not low: cutting near the jaw leaves a ring of "hair" framing the
        # face, which renders as a bonnet rather than a hairline.
        if ahead and c.z < crown - half_y * 0.62:
            drop.append(f)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(cap.data)
    bm.free()
    solid = cap.modifiers.new('solidify', 'SOLIDIFY')
    solid.thickness = 0.012

    # The gathered mass, at the back of the skull.
    back_y = cy - front_sign * half_y
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=BUN_RADIUS, segments=20, ring_count=12,
        location=(cx, back_y - front_sign * BUN_RADIUS * 0.45,
                  m['neck'] + head_h * 0.62))
    bun = bpy.context.active_object
    bun.name = 'hair-bun'
    return [cap, bun]


# ---------------------------------------------------------------- assembly


def apply_all(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def main():
    source, out, mode = args()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    m = measure(body)
    front = facing(body)
    print(f'[spike] height {m["height"]:.3f}  crotch {m["crotch"]:.3f}  '
          f'armpit {m["armpit"]:.3f}  neck {m["neck"]:.3f}  front {"−Y" if front < 0 else "+Y"}')

    # One loft, from the collar or the waist down. See ring_loft's note on why the
    # band-duplicate shell was abandoned after the first render.
    #
    # THE TWO MODES ARE THE ACTUAL QUESTION THIS SPIKE ENDED UP ASKING. `coat` lofts from
    # the shoulders, which swallows the arms — a ring knows only radius from a vertical
    # axis, so it cannot follow a limb that hangs beside the body. `skirt` starts at the
    # waist, where the body IS radial, and leaves the arms bare and readable.
    top = (m['armpit'] + 0.06) if mode == 'coat' else (m['crotch'] + 0.16)
    pieces = [ring_loft(body, top, m['crotch'] - COAT_HEM_DROP, SKIRT_FLARE, 'coat')]
    pieces += hair(body, m, front)

    for p in pieces:
        apply_all(p)

    # Join everything into one mesh: the app's palette re-material is per-object, and a
    # figure that arrives as four objects would take four materials and read as a collage.
    bpy.ops.object.select_all(action='DESELECT')
    for p in pieces:
        p.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()

    # Re-ground, because the hair now sits above the old top and a solidify can push the
    # hem below the floor. PRD §11 v1.7's first output convention, re-derived not assumed.
    bpy.context.view_layer.update()
    lo = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    body.location.z -= lo
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth()

    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_skins=False, export_materials='NONE')
    print(f'[spike] wrote {out}  verts {len(body.data.vertices)}')


main()
