# Builds the pose library from authored base meshes (PRD §11 v1.7, two figures in v1.8).
#
# Source: Blender Studio Human Base Meshes v1.4.1, CC0. See assets-src/README.md.
#
# Run from myopic-studio/:  node scripts/generate-pose-glbs.mjs is the OLD placeholder
# generator; this replaces it. Invoke via the wrapper:
#
#   npm run build:poses
#
# or directly:
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python scripts/blender/build-pose-glbs.py -- <bundle.blend> <out-dir>
#
# WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT SHIP
#
# The base mesh is unrigged (measured: zero armatures, zero vertex groups). Posing it
# needs a skeleton, so this script builds one, binds the mesh to it, poses it, and then
# **applies the armature modifier and deletes the rig** before export. Nothing rigged
# reaches a .glb, the app, or the user — non-goal #7 stands, exactly as v1.7 sets out.
#
# THE SKELETON IS MEASURED, NOT EYEBALLED. Joint heights come from the mesh's own
# geometry: the crotch is where the two leg clusters in a horizontal slice merge, the
# ankle is the narrowest cross-section of the lower leg, the armpit is where the arm
# clears the torso, and the arm chain is the centroid of the arm cluster walked downward.
# This is the same rule the grounding fix established — where a value is computable from
# what was built, compute it. The knee is the one exception, and `measure()` says so at
# the point it cheats: a straight leg has no narrow point there to find.
#
# AXES. The figure faces -Y in Blender (measured: the nose is the -Y extreme of the head
# band) and Blender's glTF exporter maps -Y to +Z, which is the app's facing convention.
# Verified by the 10 Aug spike, and re-checkable any time with scripts/measure-glb.mjs.

import sys
from math import pi

import bpy
from mathutils import Matrix, Vector

# The figures the library is built from (PRD §11 v1.8). Suffix → object in the bundle.
#
# The empty suffix keeps the original four paths — `/assets/poses/standing.glb` and its
# siblings — because saved .myo files on disk reference them. It is the DEFAULT figure,
# used when a description does not indicate otherwise, which is a rule the parser can
# actually apply; "male" would not be. Renaming to a symmetric -male/-female pair would
# read better and would break every saved scene, so it is deliberately not done.
FIGURES = {
    '': 'GEO-body_male_realistic',
    '-female': 'GEO-body_female_realistic',
}

# Reused verbatim from the placeholder generator's POSES table, whose angles were
# validated in the viewport over several milestones. The joint set below is the same one
# the primitive mannequin articulated, which is why the numbers transfer: this is a
# better figure in the same poses, not a re-posing exercise.
#
# Angles are radians, positive = the direction named. rootRotX lays the whole figure down.
POSES = {
    'standing': {},
    'sitting': {'thighForward': -pi / 2, 'kneeBend': pi / 2, 'armForward': -0.5, 'elbowBend': -0.4},
    'crouching': {'thighForward': -1.6, 'kneeBend': 2.0, 'torsoBend': 0.55, 'armForward': -1.0, 'elbowBend': -0.5},
    'lying': {'rootRotX': -pi / 2},
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 2:
        raise SystemExit('usage: ... --python build-pose-glbs.py -- <bundle.blend> <out-dir>')
    return argv[0], argv[1].rstrip('/')


# ---------------------------------------------------------------- measurement


def world_verts(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def slice_at(verts, z, tol):
    return [v for v in verts if abs(v.z - z) < tol]


def widest_gap(band):
    """Largest gap between consecutive x values in a horizontal slice.

    Two legs (or an arm clear of the torso) read as a gap; a single mass reads as none.
    """
    xs = sorted(v.x for v in band)
    if len(xs) < 2:
        return 0.0, 0.0
    gaps = [(xs[i + 1] - xs[i], (xs[i + 1] + xs[i]) / 2) for i in range(len(xs) - 1)]
    return max(gaps)


def measure(obj):
    """Derive joint heights from the mesh. Returns a dict of world-space Z values."""
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

    # Crotch: walking up from the knees, the FIRST height at which the legs stop being
    # two masses. Deliberately not the last such height — the arms hang past the hip in
    # the source mesh's rest pose and open a second gap above the crotch, which reads as
    # a "leg split" at 54% of height and puts the hips in the navel.
    crotch = z0 + height * 0.45
    for z, band in scan(z0 + height * 0.30, z0 + height * 0.55):
        if len(band) < 8:
            continue
        gap, _ = widest_gap(band)
        if gap <= 0.02:
            crotch = z
            break

    # Ankle: the narrowest cross-section of the lower leg, which is a real, sharp minimum.
    # Measured on the +x leg alone so the gap between the legs cannot read as width, and
    # over a band THICKER than the mesh's vertex spacing — at the natural slice tolerance
    # the profile is dominated by whether a slice happens to land on a quad ring, and the
    # "narrowest" point found is a sparse ring rather than a thin part of the body.
    def leg_width(z):
        leg = [v for v in verts if abs(v.z - z) < height * 0.02 and v.x > 0.02]
        return (max(v.x for v in leg) - min(v.x for v in leg)) if len(leg) > 3 else 9.9

    ankle = min((z for z, _ in scan(z0 + height * 0.02, z0 + height * 0.14)), key=leg_width)

    # Knee: NOT measured, and the one landmark here that is a proportion rather than a
    # measurement — stated plainly because the rest of this function earns the right to
    # be trusted. A straight leg has no narrow point at the knee: the smoothed width
    # profile rises monotonically from calf to thigh, so there is nothing to find. The
    # ratio is taken between the two landmarks either side of it, both measured, which
    # makes it track this mesh's actual leg proportions instead of a fraction of height.
    # 0.56 is standard anthropometry: knee ≈ 0.285H, crotch ≈ 0.47H, ankle ≈ 0.075H.
    knee = ankle + 0.56 * (crotch - ankle)

    # Armpit: above the waist, the last height at which an arm is still clear of the
    # torso. Above it the slice is one mass, which is the shoulder shelf.
    armpit = z0 + height * 0.75
    for z, band in scan(z0 + height * 0.60, z0 + height * 0.85):
        gap, _ = widest_gap(band)
        if gap > 0.02:
            armpit = z

    # Neck: the sharpest narrowing above the shoulders.
    neck, drop = z0 + height * 0.84, 0.0
    prev = None
    for z, band in scan(armpit, z1 - height * 0.10):
        if len(band) < 8:
            continue
        w = max(abs(v.x) for v in band)
        if prev is not None and prev - w > drop:
            drop, neck = prev - w, z
        prev = w

    return {'floor': z0, 'top': z1, 'height': height, 'crotch': crotch, 'ankle': ankle,
            'knee': knee, 'armpit': armpit, 'neck': neck}


def limb_x(obj, z, tol=0.02):
    """Centre of the +x leg at height z — where the thigh/shin bone should sit."""
    leg = [v for v in world_verts(obj) if abs(v.z - z) < tol and v.x > 0.02]
    return sum(v.x for v in leg) / len(leg) if leg else 0.1


def arm_chain(obj, m):
    """Shoulder / elbow / wrist for the +x arm, by walking the arm cluster down.

    Below the armpit the arm is a separate x-cluster; its centroid traces the arm's
    centreline, so sampling that polyline gives real joint positions for whatever pose
    the source mesh happens to rest in, rather than assuming a T- or A-pose.
    """
    verts = world_verts(obj)
    tol = m['height'] * 0.006
    pts = []
    z = m['armpit']
    # Down to mid-thigh, not to the crotch: the hands hang below hip height, and stopping
    # at the crotch would put the "wrist" at the elbow.
    floor_of_walk = m['floor'] + m['height'] * 0.30
    while z > floor_of_walk:
        band = slice_at(verts, z, tol)
        gap, gpos = widest_gap([v for v in band if v.x > 0])
        if gap > 0.02:
            arm = [v for v in band if v.x > gpos]
            if len(arm) > 3:
                pts.append(Vector((sum(v.x for v in arm) / len(arm),
                                   sum(v.y for v in arm) / len(arm), z)))
        z -= 0.01
    if len(pts) < 3:  # arm never separates: fall back to a horizontal arm
        s = Vector((0.18, 0, m['armpit']))
        return s, s + Vector((0.28, 0, 0)), s + Vector((0.55, 0, 0))
    return pts[0], pts[len(pts) // 2], pts[-1]


# ---------------------------------------------------------------- rig


def build_armature(obj, m):
    """A 15-bone skeleton: the same joints the primitive mannequin articulated."""
    shoulder, elbow, wrist = arm_chain(obj, m)
    hip_x = limb_x(obj, (m['crotch'] + m['knee']) / 2) * 0.6

    arm = bpy.data.armatures.new('rig')
    rig = bpy.data.objects.new('rig', arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name)
        b.head, b.tail, b.roll = Vector(head), Vector(tail), 0.0
        if parent:
            b.parent = arm.edit_bones[parent]
            b.use_connect = False
        return b

    chest = (m['armpit'] + m['neck']) / 2
    bone('spine', (0, 0, m['crotch']), (0, 0, chest))
    bone('neck', (0, 0, chest), (0, 0, m['neck']), 'spine')
    bone('head', (0, 0, m['neck']), (0, 0, m['top']), 'neck')

    for side, sx in (('L', 1), ('R', -1)):
        bone(f'thigh.{side}', (sx * hip_x, 0, m['crotch']), (sx * limb_x(obj, m['knee']), 0, m['knee']))
        bone(f'shin.{side}', (sx * limb_x(obj, m['knee']), 0, m['knee']),
             (sx * limb_x(obj, m['ankle']), 0, m['ankle']), f'thigh.{side}')
        # Toes point -Y, the facing direction.
        bone(f'foot.{side}', (sx * limb_x(obj, m['ankle']), 0, m['ankle']),
             (sx * limb_x(obj, m['ankle']), -0.14, m['floor']), f'shin.{side}')

        sgn = Vector((sx, 1, 1))
        bone(f'upperarm.{side}', shoulder * sgn, elbow * sgn, 'spine')
        bone(f'forearm.{side}', elbow * sgn, wrist * sgn, f'upperarm.{side}')

    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(obj, rig):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def rotate_x(rig, bone_name, angle):
    """Rotate a bone by `angle` about the world x axis, pivoting on its own head.

    Posing in world terms rather than bone-local terms is what lets the POSES table stay
    readable ("thigh forward 1.6 rad") regardless of how each bone happens to be rolled.

    Written against `pose_bone.matrix` — the bone's pose matrix in armature space — rather
    than `matrix_basis`. `matrix_basis` is relative to the bone's rest position *and its
    parent's pose*, so conjugating a world rotation with the bone's own rest matrix is
    only correct for unparented bones. It silently pivots every child bone about the
    armature origin instead of its own joint: it put the seated figure's feet 1.4 m in
    front of its hips, which reads as a broken pose rather than a broken pivot.
    """
    if not angle:
        return
    pb = rig.pose.bones[bone_name]
    head = pb.matrix.to_translation()
    about_head = Matrix.Translation(head) @ Matrix.Rotation(angle, 4, 'X') @ Matrix.Translation(-head)
    pb.matrix = about_head @ pb.matrix


def apply_pose(rig, pose):
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()

    # Strictly proximal → distal, with an update between each: rotating a parent moves
    # its children's heads, and `pb.matrix` reads that head. Out of order, the shin
    # pivots about where the knee used to be.
    def turn(name, angle):
        rotate_x(rig, name, angle)
        bpy.context.view_layer.update()

    turn('spine', pose.get('torsoBend', 0))
    turn('head', pose.get('headTilt', 0))
    for side in ('L', 'R'):
        turn(f'thigh.{side}', pose.get('thighForward', 0))
        turn(f'shin.{side}', pose.get('kneeBend', 0))
        turn(f'upperarm.{side}', pose.get('armForward', 0))
        turn(f'forearm.{side}', pose.get('elbowBend', 0))


# ---------------------------------------------------------------- export


def bake_and_export(obj, rig, pose, path):
    """Freeze the posed mesh into static geometry, ground it, write the .glb."""
    baked = obj.copy()
    baked.data = obj.data.copy()
    bpy.context.collection.objects.link(baked)

    bpy.ops.object.select_all(action='DESELECT')
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    for mod in list(baked.modifiers):
        # Applying the Armature modifier writes the pose into the vertices; the rig is
        # then dead weight and is never exported. MULTIRES goes too — the base cage is
        # ~10.5k quads, which is blocking-appropriate, and sculpt levels are not.
        if mod.type == 'MULTIRES':
            baked.modifiers.remove(mod)
        else:
            bpy.ops.object.modifier_apply(modifier=mod.name)
    baked.parent = None
    baked.matrix_world = obj.matrix_world

    # Whole-figure orientation (lying), about the world x axis, around the origin.
    if pose.get('rootRotX'):
        baked.matrix_world = Matrix.Rotation(pose['rootRotX'], 4, 'X') @ baked.matrix_world

    # Base-anchored, derived: PRD §11 v1.7's first output convention.
    bpy.context.view_layer.update()
    lo = min((baked.matrix_world @ v.co).z for v in baked.data.vertices)
    baked.location.z -= lo
    # Centre on the origin in plan, so position.x/z in a scene mean what they say.
    bpy.context.view_layer.update()
    xs = [(baked.matrix_world @ v.co).x for v in baked.data.vertices]
    baked.location.x -= (min(xs) + max(xs)) / 2

    bpy.ops.object.select_all(action='DESELECT')
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked

    # Normalise shading before export, for two reasons that happen to have one fix.
    #
    # Appearance: the two source figures do not ship with the same shading, and two
    # figures in one shot that catch the light differently read as two different kinds of
    # object rather than two people — which defeats the point of having a second figure.
    #
    # Size: glTF cannot share a vertex between faces that disagree about its normal, so
    # split normals multiply the vertex count. The female mesh exported 42,340 vertices
    # for the same 21,160 triangles the male covered with 12,010 — a 2.9× file for
    # identical topology. Clearing custom split normals and shading smooth brings them
    # into line.
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth()

    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_skins=False, export_materials='NONE')
    bpy.data.objects.remove(baked, do_unlink=True)


def require(blend):
    """Fail with directions, not a stack trace. The source mesh is gitignored, so a fresh
    clone hits this rather than a Blender error about a missing file."""
    import os
    if not os.path.exists(blend):
        raise SystemExit(
            f'\nMissing base mesh: {blend}\n'
            'It is gitignored (48 MB). See myopic-studio/assets-src/README.md for the\n'
            'source and licence; download the bundle there and unzip it, then re-run.\n'
            'Nothing is fetched automatically, on purpose.\n')


def load_figure(blend, body):
    """Link one base mesh into an empty scene, origin-centred and transform-free.

    Everything downstream measures world coordinates, so this has to be the only place
    that knows where the source file happened to park the object. Called once per figure:
    each gets its own empty scene, its own measurements and its own rig, because the two
    bodies have different proportions and sharing a skeleton between them would put the
    female figure's knees wherever the male figure's happened to be.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(blend) as (src, dst):
        dst.objects = [body]
    obj = dst.objects[0]
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # CENTRE ON THE ORIGIN IN PLAN BEFORE MEASURING ANYTHING. The bundle lays its 17
    # meshes out in a row, so this figure arrives at x ≈ -2.26, and transform_apply bakes
    # that into the vertices. Every left/right test below is written as `v.x > 0`, which
    # matches nothing on a mesh sitting entirely in -x: the landmark scans then return
    # their fallbacks, the bones get built around x = 0 in empty space, and bone-heat
    # weighting — which needs bones inside the mesh — collapses every vertex onto a single
    # bone. The symptom is a figure that folds in half rather than sits down; the cause is
    # eight metres away from where you would look for it.
    verts = world_verts(obj)
    mid_x = (min(v.x for v in verts) + max(v.x for v in verts)) / 2
    mid_y = (min(v.y for v in verts) + max(v.y for v in verts)) / 2
    obj.location -= Vector((mid_x, mid_y, 0))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def main():
    blend, out = args()
    require(blend)

    for suffix, body in FIGURES.items():
        obj = load_figure(blend, body)
        m = measure(obj)
        print(f'LANDMARKS[{body}] ' + '  '.join(f'{k}={v:.3f}' for k, v in m.items()))

        rig = build_armature(obj, m)
        bind(obj, rig)

        for name, pose in POSES.items():
            apply_pose(rig, pose)
            bpy.context.view_layer.update()
            bake_and_export(obj, rig, pose, f'{out}/{name}{suffix}.glb')
            print(f'wrote {out}/{name}{suffix}.glb')


main()
