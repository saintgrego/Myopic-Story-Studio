# Builds the RIGGED figure library (PRD §11 v2.0, implementation phase 1: the rig).
#
# One skinned .glb per figure, in its rest pose, carrying the 19-joint skeleton PRD §3
# "v2.0 Articulation" closes on. This is what the app will pose at runtime once phase 2
# lands; until then nothing in src/ references these files and the per-pose library that
# build-pose-glbs.py writes stays the one scenes use.
#
#   npm run build:figures
#
# or directly:
#
#   blender --background --factory-startup \
#       --python scripts/blender/build-figure-glbs.py -- <source> <out-dir>
#
# <source> is the CC0 bundle .blend or a directory of already-exported standing<suffix>.glb
# files, exactly as for build-pose-glbs.py — see `load_standing_glb` there.
#
# WHAT IS SHARED AND WHAT IS NOT. Measurement, hair and the arm-bleed weight correction are
# imported from build-pose-glbs.py, not copied: they were each debugged against these
# bodies over several milestones (the docstrings there say how) and a second copy would
# drift. The SKELETON is new. The pose build's 15-bone rig has one spine bone, no clavicle
# and no hand, and its bone names are its own; this one follows decisions 1 and 2 to the
# letter. The two scripts are kept apart until phase 6 retires the per-pose library,
# because renaming or splitting the pose rig's bones would silently re-pose every
# committed pose .glb.
#
# NAMES. Mixamo-style, stored WITHOUT the `mixamorig:` prefix (decision 1). The app's loader
# strips the prefix from anything that arrives with one (src/rig.ts); files this script
# writes never carry it.
#
# LOCAL AXES — the convention phase 2's rotation tables are written against. Every bone's
# local +Y runs head → tail (Blender's rule, which the glTF exporter preserves and which
# Mixamo also uses). Roll is set so that local +Z points toward the figure's FRONT on every
# bone except the feet, whose +Z points UP (a foot already points forward, so "front" is
# degenerate for it). The consequence worth knowing: for the spine, neck, head, legs and
# arms alike, a rotation about local X is flexion/extension — the forward/back bend every
# pose in the old table was made of.

import importlib.util
import os
import sys

import bpy
from mathutils import Vector

_spec = importlib.util.spec_from_file_location(
    'build_pose_glbs', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-pose-glbs.py'))
pose_build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pose_build)

# Decision 2, in parent-before-child order. Mirrored in src/rig.ts (JOINTS / JOINT_PARENT),
# and a test asserts every exported figure carries exactly this set with this hierarchy.
JOINT_PARENT = {
    'Hips': None,
    'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1',
    'Neck': 'Spine2', 'Head': 'Neck',
    **{f'{s}Shoulder': 'Spine2' for s in ('Left', 'Right')},
    **{f'{s}Arm': f'{s}Shoulder' for s in ('Left', 'Right')},
    **{f'{s}ForeArm': f'{s}Arm' for s in ('Left', 'Right')},
    **{f'{s}Hand': f'{s}ForeArm' for s in ('Left', 'Right')},
    **{f'{s}UpLeg': 'Hips' for s in ('Left', 'Right')},
    **{f'{s}Leg': f'{s}UpLeg' for s in ('Left', 'Right')},
    **{f'{s}Foot': f'{s}Leg' for s in ('Left', 'Right')},
}

# The arm-bleed correction (see `resolve_arm_bleed`) takes weight OFF these bones for any
# vertex that is not on the arm itself. The hand is included: in the rest A-pose it hangs
# against the outer thigh, and bone heat hands it thigh just as it did the forearm.
ARM_BONES = tuple(f'{s}{b}' for s in ('Left', 'Right') for b in ('Arm', 'ForeArm', 'Hand'))
# Where shoulder-shelf weight may go instead. The clavicle is a legitimate home for the
# trapezius, which the pose rig had no bone for.
CORE_BONES = ('Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder')

# Split of crotch → neck base among Hips / Spine / Spine1 / Spine2, as fractions. PROPORTIONS,
# stated as such: a torso has no landmark between the crotch and the neck base that a slice
# can find, the same concession `measure()` makes for the knee.
SPINE_SPLITS = (0.0, 0.15, 0.45, 0.72, 1.0)

# Along the arm's own centreline, shoulder → fingertip, where the elbow, wrist and the hand
# bone's tail fall. Standard anthropometry (upper arm 0.186H, forearm 0.146H, hand 0.108H
# of a 0.44H reach), measured by ARC LENGTH along the measured centreline, so it follows the
# arm wherever the rest pose happens to hang it. The pose rig used the middle SAMPLE as the
# elbow and the fingertip as the wrist, folding the hand into the forearm.
ELBOW_AT, WRIST_AT, HAND_TIP_AT = 0.42, 0.755, 0.88

# The head joint (skull base), as a fraction of height DOWN from the crown. `measure()`'s
# `neck` is the base of the neck — the drop off the shoulder shelf — so the pose rig's
# `head` bone, which starts there, carries the whole neck with it. The skull base has no
# cross-section signature a slice can find; head height is ~0.13H in standard
# anthropometry.
HEAD_JOINT_DOWN = 0.13

# The shoulder joint sits above the armpit crease, inside the deltoid, where no slice can
# isolate it. Fraction of the armpit → neck interval — a proportion, not a measurement,
# checked only by eye in the arm-overhead render (docs/rig-flexion-front.png).
SHOULDER_RISE = 0.35


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 2:
        raise SystemExit('usage: ... --python build-figure-glbs.py -- <source> <out-dir>\n'
                         '  <source> as for build-pose-glbs.py.')
    return argv[0], argv[1].rstrip('/')


def slice_centre(obj, z, tol, side=0):
    """Middle (x, y) of a horizontal slice's extent; side=+1 takes only the +x half.

    The MIDDLE OF THE EXTENT, not the centroid. Vertex density is not uniform on these
    meshes — the face and the groin are far denser than the back of the skull or the
    buttocks — and a centroid follows the density: it put the hip joint 7 cm in front of
    the thigh and the skull joint in the face. `facing()` in the pose build uses the same
    density on purpose; here it is noise.
    """
    band = [v for v in pose_build.world_verts(obj)
            if abs(v.z - z) < tol and (side == 0 or v.x * side > 0.02)]
    if not band:
        return Vector((0.0, 0.0))
    return Vector(((min(v.x for v in band) + max(v.x for v in band)) / 2,
                   (min(v.y for v in band) + max(v.y for v in band)) / 2))


def arm_polyline(obj, m):
    """The +x arm's centreline, top of the arm → fingertip, one point per centimetre.

    Sliced from the arm SURFACE that `arm_vertices` isolates by connectivity, not from a
    gap test on raw slices. The pose build's `arm_chain` walks gaps, and at the wrist that
    walk steps off the fingertips onto the outer thigh — measured on the default figure it
    ran from x=0.43 at the fingertips back to x=0.16 on the leg, so the "wrist" it found
    was a thigh. It never mattered there because that rig has no hand bone. Connectivity
    cannot make that mistake: below the armpit apex the arm touches nothing.

    The apex is below the measured `armpit`, so the first point is the arm's top at the
    armpit height, directly above the arm's top slice.
    """
    arms, apex = pose_build.arm_vertices(obj, m)
    world = pose_build.world_verts(obj)
    arm = [world[i] for i in arms if world[i].x > 0]
    pts = []
    z = apex
    lowest = min(v.z for v in arm)
    while z > lowest:
        band = [v for v in arm if abs(v.z - z) < 0.006]
        if len(band) > 3:
            pts.append(Vector((sum(v.x for v in band) / len(band),
                               sum(v.y for v in band) / len(band), z)))
        z -= 0.01
    if len(pts) < 10:
        raise SystemExit('arm_polyline: no arm below the armpit apex. The figure must rest '
                         'in an A- or T-pose.')
    first = Vector((pts[0].x, pts[0].y, m['armpit']))
    return [first] + pts


def along(pts, t):
    """The point a fraction t of the way along a polyline, by arc length."""
    lengths = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    goal = sum(lengths) * t
    for i, seg in enumerate(lengths):
        if goal <= seg:
            return pts[i].lerp(pts[i + 1], goal / seg if seg else 0.0)
        goal -= seg
    return pts[-1].copy()


def joint_positions(obj, m):
    """Head and tail of every joint, world space, for the +x/Left side and the centreline.

    The figure faces -Y, so the character's LEFT is +x — the same side the pose rig calls
    `.L`, and the side Mixamo's `Left*` bones name.
    """
    tol = m['height'] * 0.01
    skull = m['top'] - HEAD_JOINT_DOWN * m['height']

    def centre(z):
        c = slice_centre(obj, z, tol)
        return Vector((0.0, c.y, z))  # x = 0 exactly: the figure is plan-centred

    spine_z = [m['crotch'] + f * (m['neck'] - m['crotch']) for f in SPINE_SPLITS]
    j = {}
    for name, (a, b) in zip(('Hips', 'Spine', 'Spine1', 'Spine2'), zip(spine_z, spine_z[1:])):
        j[name] = (centre(a), centre(b))
    # The skull joint takes its depth from mid-neck: the slice AT the skull base already
    # cuts the jaw and chin, whose extent runs forward and drags the pivot into the face.
    nape = Vector((0.0, centre((m['neck'] + skull) / 2).y, skull))
    j['Neck'] = (centre(m['neck']), nape)
    j['Head'] = (nape.copy(), Vector((0.0, nape.y, m['top'])))

    # Leg: hip joint where the pose rig put it (validated through every seated pose), knee
    # and ankle on the measured leg centreline, foot along the sole to the ball.
    hip_x = pose_build.limb_x(obj, (m['crotch'] + m['knee']) / 2) * 0.6
    knee = slice_centre(obj, m['knee'], tol, side=1)
    ankle = slice_centre(obj, m['ankle'], tol, side=1)
    foot = [v for v in pose_build.world_verts(obj) if v.z < m['ankle'] and v.x > 0.02]
    toe_y = min(v.y for v in foot)  # facing -Y: the toe is the -y extreme
    ankle_p = Vector((ankle.x, ankle.y, m['ankle']))
    j['LeftUpLeg'] = (Vector((hip_x, centre(m['crotch']).y, m['crotch'])),
                      Vector((knee.x, knee.y, m['knee'])))
    j['LeftLeg'] = (j['LeftUpLeg'][1].copy(), ankle_p)
    # The ball of the foot, ~70% of the way from the ankle to the toe tip, at sole height.
    j['LeftFoot'] = (ankle_p.copy(),
                     Vector((ankle.x, ankle.y + 0.7 * (toe_y - ankle.y), m['floor'] + 0.02)))

    pts = arm_polyline(obj, m)
    shoulder = pts[0] + Vector((0, 0, SHOULDER_RISE * (m['neck'] - m['armpit'])))
    arm = [shoulder] + pts
    elbow, wrist, hand_tip = along(arm, ELBOW_AT), along(arm, WRIST_AT), along(arm, HAND_TIP_AT)
    j['LeftShoulder'] = (Vector((shoulder.x * 0.2, shoulder.y, shoulder.z)), shoulder.copy())
    j['LeftArm'] = (shoulder.copy(), elbow)
    j['LeftForeArm'] = (elbow.copy(), wrist)
    j['LeftHand'] = (wrist.copy(), hand_tip)

    mirror = Vector((-1, 1, 1))
    for name in [n for n in j if n.startswith('Left')]:
        head, tail = j[name]
        j['Right' + name[4:]] = (head * mirror, tail * mirror)
    return j


def build_rig(obj, m):
    joints = joint_positions(obj, m)
    arm = bpy.data.armatures.new('rig')
    rig = bpy.data.objects.new('rig', arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, parent in JOINT_PARENT.items():  # parent-before-child order
        b = arm.edit_bones.new(name)
        b.head, b.tail = joints[name]
        # See LOCAL AXES at the top of this file.
        b.align_roll(Vector((0, 0, 1)) if name.endswith('Foot') else Vector((0, -1, 0)))
        if parent:
            b.parent = arm.edit_bones[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for name in JOINT_PARENT:
        h, t = joints[name]
        print(f'JOINT {name:<14} head=({h.x:+.3f},{h.y:+.3f},{h.z:.3f}) '
              f'len={(t - h).length:.3f}')
    return rig


def ground(obj):
    """Put the lowest vertex on z = 0 before anything is measured.

    The pose build grounds at export, after baking; a rigged figure is exported unbaked,
    so its REST geometry has to be base-anchored itself (PRD §4: position.y is where the
    figure touches the floor). Doing it first means the skeleton is built in the same
    frame and nothing has to be moved together afterwards.
    """
    lo = min(v.z for v in pose_build.world_verts(obj))
    obj.location.z -= lo
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def weld(obj):
    """Merge coincident vertices, so the surface is one piece before it is weighted.

    A figure loaded from an exported .glb arrives split along every UV and normal seam
    (see `surface_graph` in the pose build). Bone heat diffuses over connected surface, so
    each shell was weighted on its own and the two sides of a seam disagreed: posed, the
    figure opened along its seams — a ring round the waist, the bikini line, the neck —
    with daylight through the gaps. The pose build never showed it because its single
    spine bone spans every one of those seams, so both sides always agreed. Welding costs
    nothing kept: UVs are unused (materials come from the palette) and normals are
    re-derived at export, and the exporter re-splits wherever the UVs still differ, with
    the same weights on both copies.
    """
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode='OBJECT')


def skin_to_head(pieces, rig):
    """Weight hair wholly to Head and give it the rig, so it joins the body as one mesh.

    The pose build bone-PARENTS hair and bakes it; that would export here as a second,
    rigid mesh under the Head joint. Rigid skinning is the same motion with one object —
    and one object is what lets the palette colour the figure as one thing (PRD §11 v1.5).
    """
    for p in pieces:
        bpy.ops.object.select_all(action='DESELECT')
        p.select_set(True)
        bpy.context.view_layer.objects.active = p
        for mod in list(p.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)  # the cap's solidify
        p.vertex_groups.new(name='Head').add(list(range(len(p.data.vertices))), 1.0, 'REPLACE')
        p.parent = rig
        p.modifiers.new('rig', 'ARMATURE').object = rig


def export(body, extras, rig, path):
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    # Multires is sculpt detail the blocking figure does not want, as in the pose build.
    for mod in [md for md in body.modifiers if md.type == 'MULTIRES']:
        body.modifiers.remove(mod)
    for p in extras:
        p.select_set(True)
    if extras:
        bpy.ops.object.join()  # vertex groups merge by name, so the hair keeps 'Head'
    # Same shading normalisation as the pose build, for the same size reason.
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth()

    rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_skins=True, export_animations=False,
                              export_materials='NONE', export_apply=False)


def main():
    src, out = args()
    from_glb = not src.endswith('.blend')
    if not from_glb:
        pose_build.require(src)
    os.makedirs(out, exist_ok=True)

    for suffix, body in pose_build.FIGURES.items():
        obj = (pose_build.load_standing_glb(src, suffix) if from_glb
               else pose_build.load_figure(src, body)[0])
        ground(obj)
        weld(obj)
        m = pose_build.measure(obj)
        print(f'LANDMARKS[{suffix or "default"}] ' + '  '.join(f'{k}={v:.3f}' for k, v in m.items()))

        rig = build_rig(obj, m)
        hair = pose_build.build_hair(obj, m, pose_build.HAIR.get(suffix, 'cropped'))
        pose_build.bind(obj, rig, m, ARM_BONES, CORE_BONES)
        skin_to_head(hair, rig)

        path = f'{out}/mannequin{suffix}.glb'
        export(obj, hair, rig, path)
        print(f'wrote {path} ({os.path.getsize(path)} bytes)')


if __name__ == '__main__':
    main()
