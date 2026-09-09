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
from collections import deque
from math import pi

import bmesh
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

# Clothed figures (PRD §11 v1.10): suffix → (body object, garment objects to bind).
#
# EMPTY UNTIL THE GARMENTS ARE MODELLED, and that is the whole state of v1.10's wardrobe
# half — the mechanism below is built and proven, the assets do not exist yet. A garment is
# hand-authored in Blender ON one of the bodies above, in that body's own coordinates, and
# saved into a garment .blend passed as the third argument. Adding a clothed figure is then
# a row here plus a row in src/poses.json, exactly like adding a pose.
#
# WHY HAND-AUTHORED AND NOT DERIVED: deriving garments from the body was tried, rendered,
# and failed — see STATE.md, "Derived-garment spike". A ring knows only distance from a
# vertical axis, and a standing figure is not radial.
#
# THE ROSTER IS CAPPED AT SIX FIGURES TOTAL, including the two above (PRD §11 v1.10). The
# library is poses × figures, so each row here costs four .glb files.
GARMENT_FIGURES = {
    # '-coat': ('GEO-body_male_realistic', ('GARMENT-coat_long',)),
}

# Coarse hair silhouette per figure (PRD §11 v1.10): suffix → 'bare' | 'cropped' | 'gathered'.
#
# THIS IS THE WHOLE OF WHAT v1.10 ADMITS ABOUT HAIR, and the amendment concedes most of the
# argument to get it: hair is where "does this look real" lives, and strands, cards,
# transparency, physics and colour are all named on the out-list. What survives §11's
# blocking test is head SHAPE — a bare skull is symmetric front-to-back, so at 35 m it gives
# a director no cue which way a figure is looking, and eyeline is a blocking question.
#
# The two styles differ in silhouette, not in detail, and they also separate the two figures
# a little further, which is the v1.8 argument one level down.
# A figure with no row here gets 'cropped' rather than 'bare': v1.10 gives coarse hair to
# every figure in the roster, so a new row in GARMENT_FIGURES should not silently ship bald.
HAIR = {
    '': 'cropped',
    '-female': 'gathered',
}

HAIR_OFFSET = 0.011   # how far the cap stands off the skull, metres
BUN_RADIUS = 0.062

# Reused verbatim from the placeholder generator's POSES table, whose angles were
# validated in the viewport over several milestones. The joint set below is the same one
# the primitive mannequin articulated, which is why the numbers transfer: this is a
# better figure in the same poses, not a re-posing exercise.
#
# Angles are radians, positive = the direction named. rootRotX lays the whole figure down.
#
# SIGN CONVENTION, since it is not guessable and every new pose needs it. Rotations are
# about the world x axis and the figure faces -y, so for a limb that HANGS DOWNWARD at rest
# a negative angle swings it forward, toward the face, and a positive angle swings it back.
# For the spine and head, which point upward at rest, the sense inverts: a POSITIVE
# `torsoBend`/`headTilt` leans forward. `sitting` is the worked example — its thighs come
# forward on -pi/2 and its shins drop back down on +pi/2.
#
# Entries may be symmetric aliases or explicit per-bone turns; see `apply_pose` and
# `JOINT_ALIASES`. Until 13 August only symmetric, x-axis aliases existed, which is why
# every pose above this line is a forward/back bend.
#
# ARM ANGLES ARE NO LONGER BOUNDED. Until 13 August the table carried a hard ceiling of
# about half a radian on `armForward`, because automatic weighting handed the arm bones a
# band of hip, outer thigh and flank and raising an arm dragged that band along as a curtain
# of triangles. `resolve_arm_bleed` fixes it at the source, and the sweep that proved it
# runs to -3.0 rad — arms straight overhead — clean. What remains at extreme angles is a
# small crease in the armpit itself, which is a static bake with no corrective shapes doing
# the only thing it can, and is invisible at blocking scale.
POSES = {
    'standing': {},
    'sitting': {'thighForward': -pi / 2, 'kneeBend': pi / 2, 'armForward': -0.5, 'elbowBend': -0.4},
    'crouching': {'thighForward': -1.6, 'kneeBend': 2.0, 'torsoBend': 0.55, 'armForward': -1.0, 'elbowBend': -0.5},
    'lying': {'rootRotX': -pi / 2},

    # --- added 12 August 2026. Five postures within the symmetric, x-axis, arms-low
    # envelope the bind supports, each chosen for a blocking question the first four
    # cannot answer.

    # Upright on both knees: thighs stay vertical, shins fold back to horizontal. The knees
    # become the lowest point and the grounding pass rests the figure on them.
    'kneeling': {'kneeBend': pi / 2, 'armForward': -0.15},
    # On the floor with the legs straight out front — thighs forward like `sitting`, but the
    # knees never bend, so the whole leg lies along the floor.
    'sitting-ground': {'thighForward': -pi / 2, 'kneeBend': 0.0, 'armForward': -0.2, 'elbowBend': -0.3},
    # Weight back against something out of frame — a wall, a bar, a desk edge. Feet stay
    # planted; the lean is all spine, with the chin following it up.
    'leaning-back': {'torsoBend': -0.35, 'headTilt': -0.2, 'armForward': 0.15},
    # Eyeline down, hands up to meet it: reading, a phone, a map. The head angle is the
    # whole point — where a character is looking is blocking, not decoration.
    'head-down': {'headTilt': 0.5, 'armForward': -0.35, 'elbowBend': -0.5},
    # Exhausted, defeated, hanging on. Deliberately distinct from `crouching`, which is a
    # deep functional knee bend: here the legs stay nearly straight and the collapse is in
    # the spine and neck.
    'slumped': {'torsoBend': 0.7, 'headTilt': 0.4, 'thighForward': -0.2, 'kneeBend': 0.35,
                'armForward': 0.1},

    # --- added 13 August 2026, once the arm ceiling was lifted. This is the pose that was
    # built and cut on 12 August; it is the reason `resolve_arm_bleed` exists.

    # Hands overhead — surrender, reaching a high shelf, a crowd. Held a little short of
    # vertical so the arms read as raised rather than as a flagpole.
    'arms-raised': {'armForward': -2.7, 'elbowBend': -0.15},

    # --- added 13 August 2026 (track 1b). The first poses that are not bilaterally
    # symmetric, and the first that leave the sagittal plane. Two more were attempted and
    # abandoned — see "SELF-CONTACT POSES" below.

    # Mid-stride: legs in opposition, arms counter-swung. The one pose that answers "which
    # way is this character going", which a standing figure cannot.
    'walking': {'thigh.L': ('X', -0.55), 'shin.L': ('X', 0.3), 'thigh.R': ('X', 0.35),
                'shin.R': ('X', 0.55), 'upperarm.L': ('X', 0.45), 'upperarm.R': ('X', -0.45),
                'elbowBend': -0.35},
    # One arm out and forward, the other down; the head follows the point a little. Directs
    # the eye out of frame, which is blocking, not decoration.
    'pointing': {'upperarm.R': [('X', -1.5), ('Y', 0.25)], 'forearm.R': ('X', -0.15),
                 'upperarm.L': ('X', -0.1), 'headTurn': -0.12},
    # Attention off-camera with the body still square on — the eyeline leaves the shot
    # before the body does.
    'looking-off': {'headTurn': 0.8, 'torsoTwist': 0.15},
    # Turned toward someone beside them: torso round, head further. Built for two-handers,
    # where a pair has to read as a pair.
    'turned-to-listen': {'torsoTwist': 0.35, 'headTurn': 0.45, 'armForward': -0.12},
    # Mid-speech, one hand open and raised. The other arm stays quiet so the gesture reads.
    'gesturing': {'upperarm.R': [('X', -0.95), ('Y', 0.45)], 'forearm.R': ('X', -0.8),
                  'upperarm.L': ('X', -0.2), 'headTurn': -0.2},

    # SELF-CONTACT POSES ARE STILL OUT, and `hand-on-hip` and `arms-crossed` are the proof.
    # Both were requested, attempted across four tuning rounds, and abandoned. They are not
    # a matter of finding better angles: each needs the hand to arrive at a particular place
    # ON THE BODY, and this rig has no clavicle and no wrist, so the hand's position is the
    # product of exactly two joint angles. Measured, the reachable set does not include the
    # places those poses need. Folding the elbow puts the hands in front of the sternum
    # (wrist z=1.015); swinging the forearm about y crosses the midline but drops the hand
    # to the thigh (z=0.66) or throws it forward past the face (z=1.43, y=-0.73). "Hand
    # resting near the hip" comes out as "arm hanging slightly out", which is a different
    # pose. Section 11's own note stands: a pose that must agree with another surface —
    # someone else's, a prop's, or the figure's own — needs more than a joint table.
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) not in (2, 3):
        raise SystemExit(
            'usage: ... --python build-pose-glbs.py -- <source> <out-dir> [garments.blend]\n'
            '  <source> is either the CC0 bundle .blend, or a directory holding an\n'
            '  already-exported standing<suffix>.glb per figure. See load_standing_glb().\n'
            '  [garments.blend] applies only to GARMENT_FIGURES, and only from the bundle:\n'
            '  garments are authored in its coordinate space. See main().')
    return argv[0], argv[1].rstrip('/'), (argv[2] if len(argv) == 3 else None)


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


def facing(obj, m):
    """Which way the figure faces, as a sign on y. The bundle's meshes face -Y.

    Measured rather than assumed, and the measurement is not the obvious one. Two plausible
    tests were tried against real figure geometry and both reported the wrong sign:

    1. "Which extreme overhangs the head's bbox midline further" is a TAUTOLOGY — mid is
       (min+max)/2, so the two distances are equal by construction.
    2. "The centroid sits behind the bbox centre, because a skull is a volume and a nose is
       a spike" is a real argument and still wrong here: the face carries eyes, nose and
       lips, so its vertices outnumber the cranium's and drag the centroid forward.

    That same density is the signal, used directly. Measured on a library figure: ~1,000
    vertices per 2 cm slice at the face against ~60 at the back of the skull. Both wrong
    versions produced exactly one symptom — a hair bun on the figure's face — which no
    grounding or bounding-box check would ever catch. See STATE.md, "Derived-garment spike".
    """
    head = [v for v in world_verts(obj) if v.z > m['neck']]
    ys = [v.y for v in head]
    lo, hi = min(ys), max(ys)
    quarter = (hi - lo) * 0.25
    front = len([y for y in ys if y < lo + quarter])
    back = len([y for y in ys if y > hi - quarter])
    return -1.0 if front > back else 1.0


def build_hair(obj, m, style):
    """Coarse hair silhouette: a cap fitted to the head, optionally with a gathered mass.

    THE CAP IS A FITTED ELLIPSOID, NOT AN OFFSET COPY OF THE SCALP. Deriving it by
    duplicating skull faces and pushing them along their normals produces a crown of spikes:
    the head is the densest, most detailed part of the mesh, so a per-vertex offset amplifies
    every bump in it, and the band's cut edge shows as a ragged fringe. A fitted primitive
    has neither problem and is the right level of description for a silhouette anyway.

    Returned unbound and unparented; main() parents these to the head bone.
    """
    if style == 'bare':
        return []

    front = facing(obj, m)
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

    # Cut the face out of the cap. This is the asymmetry the whole feature exists for — it
    # is what gives a symmetric skull a front and a back at 35 mm. Cut HIGH: near the jaw it
    # leaves a ring framing the face, which renders as a bonnet rather than a hairline.
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    face_cut = cy + front * half_y * 0.34
    drop = [f for f in bm.faces
            if (cap.matrix_world @ f.calc_center_median() - Vector((0, face_cut, 0))).y * front > 0
            and (cap.matrix_world @ f.calc_center_median()).z < crown - half_y * 0.62]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(cap.data)
    bm.free()
    cap.modifiers.new('solidify', 'SOLIDIFY').thickness = 0.012
    pieces = [cap]

    if style == 'gathered':
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=BUN_RADIUS, segments=20, ring_count=12,
            location=(cx, cy - front * (half_y + BUN_RADIUS * 0.45),
                      m['neck'] + head_h * 0.62))
        bun = bpy.context.active_object
        bun.name = 'hair-bun'
        pieces.append(bun)
    return pieces


def parent_to_head(objs, rig):
    """Rigid-parent hair to the head bone instead of skinning it to the whole rig.

    Automatic weighting is right for a body and wrong for hair: hair does not deform, it
    RIDES the skull, and bone-heat weighting on a detached shell near several bones can
    smear it across the neck and spine. Bone parenting is both more robust and more honest
    about what the geometry is. bake_and_export() freezes it the same way either route —
    it clears the parent and keeps the evaluated world matrix.
    """
    if not objs:
        return
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    rig.data.bones.active = rig.data.bones['head']
    for o in objs:
        o.select_set(True)
    rig.select_set(True)
    bpy.ops.object.parent_set(type='BONE')
    bpy.ops.object.mode_set(mode='OBJECT')


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


ARM_BONES = ('upperarm.L', 'upperarm.R', 'forearm.L', 'forearm.R')



def point_segment_distance(p, a, b):
    """Distance from p to the segment ab — a bone's whole extent, not just its head."""
    ab = b - a
    denom = ab.dot(ab)
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def surface_graph(obj):
    """The mesh as a graph, with coincident vertices welded into one node.

    WELDING IS NOT OPTIONAL, and skipping it breaks everything downstream silently. glTF
    cannot share a vertex between faces that disagree about a normal or a UV, so a round
    trip through .glb splits the surface along every such seam: the imported mesh looks
    watertight and is actually a pile of disconnected shells. Measured on this figure, a
    naive edge walk reaches 6,430 of 12,010 vertices. Welding by position restores the
    surface as a graph and touches no geometry — 12,010 vertices become 10,582 nodes.
    """
    node, node_of = {}, []
    for v in obj.data.vertices:
        node_of.append(node.setdefault(tuple(round(c, 6) for c in v.co), len(node)))
    adjacency = [set() for _ in range(len(node))]
    for e in obj.data.edges:
        a, b = node_of[e.vertices[0]], node_of[e.vertices[1]]
        if a != b:
            adjacency[a].add(b)
            adjacency[b].add(a)
    return node_of, adjacency


def components_below(adjacency, height_of, ceiling, minimum=80):
    """Connected components of the surface below `ceiling`, largest first."""
    below = {n for n in range(len(adjacency)) if height_of[n] < ceiling}
    seen, out = set(), []
    for start in below:
        if start in seen:
            continue
        queue, comp = deque([start]), []
        seen.add(start)
        while queue:
            i = queue.popleft()
            comp.append(i)
            for j in adjacency[i]:
                if j in below and j not in seen:
                    seen.add(j)
                    queue.append(j)
        if len(comp) >= minimum:
            out.append(comp)
    out.sort(key=len, reverse=True)
    return out


def arm_vertices(obj, m):
    """The two arms, found by cutting the surface rather than by measuring distances.

    Below the armpit crease an arm touches nothing: it meets the body only at the shoulder.
    So the highest cut that splits the surface into THREE large pieces is the armpit apex,
    and the two smaller pieces are the arms. No threshold, no tuning, no anatomy assumed
    beyond "arms hang off shoulders" — and it self-checks, because a wrong cut yields one
    piece or a hundred rather than a clean symmetric three.

    WHY NOTHING GEOMETRIC WORKS HERE, since three attempts died on it. The figure rests in
    an A-pose, so the inner surface of each arm hangs alongside the flank, hip and outer
    thigh — the very vertices that must NOT follow the arm. Distance cannot tell them apart:
    a thigh-surface vertex is nearer the arm bone than its own thigh bone. Nor can slicing:
    a horizontal band holds only 11-60 vertices, so the natural vertex spacing is about
    20 mm, and any x-projection gap test at a 15-20 mm threshold reads that spacing as
    anatomy. Measured, that mislabels the whole torso and both thighs as "arm". A real
    arm/torso gap is 92-181 mm, an order of magnitude clear of the noise — but only where
    the arm is clear of the body at all, which is exactly where the answer was never in
    doubt. Connectivity has none of these failure modes.
    """
    node_of, adjacency = surface_graph(obj)
    world = world_verts(obj)
    height_of = [0.0] * len(adjacency)
    for v in obj.data.vertices:
        height_of[node_of[v.index]] = world[v.index].z

    # Walk down from the measured armpit, which sits a little above the true crease — its
    # own scan uses a 20 mm gap threshold, i.e. the noise floor described above.
    ceiling = m['armpit']
    while ceiling > m['crotch']:
        comps = components_below(adjacency, height_of, ceiling)
        if len(comps) >= 3:
            arms = set(comps[1]) | set(comps[2])
            print(f'BIND armpit apex at z={ceiling:.3f}; arms are {len(comps[1])}+{len(comps[2])} '
                  f'nodes against a {len(comps[0])}-node body')
            return {v.index for v in obj.data.vertices if node_of[v.index] in arms}, ceiling
        ceiling -= 0.01
    raise SystemExit('arm_vertices: the surface never split into three below the armpit. '
                     'Either the figure is not in an A- or T-pose, or the mesh is not '
                     'watertight enough to weld — see surface_graph().')


def resolve_arm_bleed(obj, rig, m):
    """Take the flank, hip and outer thigh back off the arm bones.

    THE DEFECT, measured before it was fixed: automatic (bone-heat) weighting assigns by
    proximity, and in an A-pose the arms hang beside the body, so the arm bones are handed
    a band of torso and leg — 2,300 vertices whose rest positions run y=0.435 (mid-thigh)
    to y=1.060 (waist), at x = +/-0.18, just inboard of the arm surface at 0.187.

    It stays invisible while the arms stay down, which is why the first four poses never
    exposed it: `crouching` swings them to -1.0 rad and the distortion hides in the hunch.
    Raise an arm and that band follows it, dragging a curtain of triangles — a web from the
    hands to the knees at -1.2 rad, two metre-long spikes beside the head at -2.7.

    THE CORRECTION IS ONE-DIRECTIONAL, and that is load-bearing. Only non-arm vertices are
    touched, and only their arm weight. Arm vertices keep every gram bone heat gave them,
    including their share of `spine` across the shoulder — that blend is what holds the arm
    on. Enforcing the partition in both directions instead severs the figure: the upper arms
    detach and float away, which is exactly what an earlier attempt did.

    Above the apex nothing is touched at all, because the deltoid and shoulder cap genuinely
    do share weight between `upperarm` and `spine`.
    """
    arms, apex = arm_vertices(obj, m)
    groups = {vg.name: vg for vg in obj.vertex_groups}
    keep = [n for n in groups if n not in ARM_BONES]
    segments = {n: (rig.data.bones[n].head_local.copy(), rig.data.bones[n].tail_local.copy())
                for n in groups}
    world = world_verts(obj)

    moved = 0
    for v in obj.data.vertices:
        co = world[v.index]
        if v.index in arms:
            continue
        if co.z >= apex:
            # ABOVE THE APEX the arm and torso are one surface, so connectivity says
            # nothing and the question changes: how much of the shoulder shelf belongs to
            # the arm? Here distance is trustworthy, because the adversarial case that
            # defeats it below — an arm hanging alongside a thigh — does not exist up top.
            # A vertex nearer the spine or neck than the upperarm is trapezius or upper
            # chest, and must not swing with the arm; leaving it arm-weighted folds the
            # shoulder cap straight through the torso when the arm goes overhead.
            near_arm = min(point_segment_distance(co, *segments[n]) for n in ARM_BONES
                           if n in segments)
            near_core = min(point_segment_distance(co, *segments[n]) for n in ('spine', 'neck')
                            if n in segments)
            if near_arm <= near_core:
                continue  # deltoid and shoulder cap: the blend here is real, leave it
        member = {gr.group: gr.weight for gr in v.groups}
        bleed = 0.0
        for name in ARM_BONES:
            vg = groups.get(name)
            if vg is None or vg.index not in member:
                continue
            bleed += member[vg.index]
            vg.remove([v.index])
        if bleed > 0:
            # Give it to the nearest bone it is allowed to have. Deleting the weight instead
            # would leave some vertices with none at all, and a vertex with no weight does
            # not follow the body — it tears in its own way.
            home = min(keep, key=lambda n: point_segment_distance(co, *segments[n]))
            groups[home].add([v.index], bleed, 'ADD')
            moved += 1
    print(f'BIND moved arm-bone weight off {moved} body vertices')


def bind(obj, rig, m):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    # NO WEIGHT SMOOTHING. `vertex_group_smooth` was tried here at several strengths and
    # earns nothing: it does not touch the bleed (a large contiguous region assigned to the
    # wrong bone stays wrong when averaged with itself — measured, it changed 10,857 of
    # 12,010 vertices and left the curtains intact), and it does not clear the shoulder
    # crease either, which `resolve_arm_bleed`'s above-apex rule does. It only blurs the
    # elbow and knee creases that make a bent limb read as bent.

    resolve_arm_bleed(obj, rig, m)


def rotate(rig, bone_name, axis, angle):
    """Rotate a bone by `angle` about a world axis, pivoting on its own head.

    Posing in world terms rather than bone-local terms is what lets the POSES table stay
    readable ("thigh forward 1.6 rad") regardless of how each bone happens to be rolled.

    Written against `pose_bone.matrix` — the bone's pose matrix in armature space — rather
    than `matrix_basis`. `matrix_basis` is relative to the bone's rest position *and its
    parent's pose*, so conjugating a world rotation with the bone's own rest matrix is
    only correct for unparented bones. It silently pivots every child bone about the
    armature origin instead of its own joint: it put the seated figure's feet 1.4 m in
    front of its hips, which reads as a broken pose rather than a broken pivot.

    Took an axis argument on 13 August (track 1b); it was hard-coded to 'X' before, which
    is why every pose until then was a forward/back bend.
    """
    if not angle:
        return
    pb = rig.pose.bones[bone_name]
    head = pb.matrix.to_translation()
    about = Matrix.Translation(head) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-head)
    pb.matrix = about @ pb.matrix


# Friendly joint names → (bone, world axis, mirrored). `{s}` expands to both sides.
#
# MIRRORED is the part that is not guessable. The figure is symmetric about x, so a
# rotation in the SAGITTAL plane (about x — every joint the pipeline had before today)
# takes the same signed angle on both sides: both thighs swing forward together. A rotation
# that leaves that plane does not. Swinging both arms away from the body means +y on one
# side and -y on the other, so those aliases carry the sign flip and the table stays
# readable as "arms out 0.4" rather than "+0.4 left, -0.4 right".
JOINT_ALIASES = {
    'torsoBend':    ('spine', 'X', False),
    'torsoTwist':   ('spine', 'Z', False),
    'headTilt':     ('head', 'X', False),
    'headTurn':     ('head', 'Z', False),
    'thighForward': ('thigh.{s}', 'X', False),
    'thighOut':     ('thigh.{s}', 'Y', True),
    'kneeBend':     ('shin.{s}', 'X', False),
    'armForward':   ('upperarm.{s}', 'X', False),
    'armOut':       ('upperarm.{s}', 'Y', True),
    'elbowBend':    ('forearm.{s}', 'X', False),
}

# Strictly proximal → distal. Rotating a parent moves its children's heads, and `rotate`
# reads that head off `pb.matrix`; out of order, the shin pivots about where the knee used
# to be. Adding a bone here means thinking about where it belongs in the chain.
BONE_ORDER = ('spine', 'neck', 'head',
              'thigh.L', 'shin.L', 'foot.L', 'upperarm.L', 'forearm.L',
              'thigh.R', 'shin.R', 'foot.R', 'upperarm.R', 'forearm.R')


def apply_pose(rig, pose):
    """Drive the rig from one POSES entry.

    Two ways to name a rotation, and they compose:

      'armForward': -0.5              a symmetric alias, applied to both sides
      'upperarm.R': ('Z', -1.2)       one bone, one axis, exactly as written
      'forearm.R': [('X', -0.3), ...] several turns on one bone

    An explicit bone entry is applied AFTER any alias touching the same bone, so a pose can
    say "both arms forward a little, and the right one also out and round" without having
    to spell out the left. Explicit entries are never mirrored: you named the side.
    """
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()

    turns = {name: [] for name in BONE_ORDER}
    for alias, value in pose.items():
        if alias not in JOINT_ALIASES:
            continue
        template, axis, mirrored = JOINT_ALIASES[alias]
        for side in ('L', 'R'):
            bone = template.format(s=side)
            if bone not in turns:
                continue
            # Mirrored aliases negate on the LEFT, not the right. Checked by rendering, not
            # derived: the first version negated on the right and `armOut: 0.9` folded both
            # arms across the crotch instead of spreading them. A limb that hangs down and
            # slightly out needs a NEGATIVE turn about y to swing further out on the +x
            # side, so left is the side that carries the flip if the name is to stay true.
            sign = -1 if (mirrored and side == 'L') else 1
            turns[bone].append((axis, value * sign))
            if '{s}' not in template:
                break  # a centreline bone: apply once, not once per side
    for bone in BONE_ORDER:
        explicit = pose.get(bone)
        if explicit is None:
            continue
        turns[bone].extend([explicit] if isinstance(explicit, tuple) else list(explicit))

    for bone in BONE_ORDER:
        for axis, angle in turns[bone]:
            rotate(rig, bone, axis, angle)
            bpy.context.view_layer.update()


# ---------------------------------------------------------------- export


def bake_and_export(objs, rig, pose, path):
    """Freeze the posed meshes into static geometry, ground them, write one .glb.

    Takes a LIST because a figure may be a body plus hand-authored garments (PRD §11
    v1.10). Each is bound to the same rig and each carries its own Armature modifier, so
    each bakes the same way; what they must not do is bake independently in space.
    """
    # The posed pelvis, captured before any transform below moves the bakes around. The rig
    # sits at the origin and the meshes carry no transform of their own at this point, so
    # armature space, world space and the baked mesh's local space coincide — which is what
    # lets this one point be pushed through `baked[0].matrix_world` later.
    pelvis_local = rig.pose.bones['spine'].matrix.to_translation()

    baked = []
    for obj in objs:
        b = obj.copy()
        b.data = obj.data.copy()
        bpy.context.collection.objects.link(b)

        bpy.ops.object.select_all(action='DESELECT')
        b.select_set(True)
        bpy.context.view_layer.objects.active = b
        for mod in list(b.modifiers):
            # Applying the Armature modifier writes the pose into the vertices; the rig is
            # then dead weight and is never exported. MULTIRES goes too — the base cage is
            # ~10.5k quads, which is blocking-appropriate, and sculpt levels are not.
            if mod.type == 'MULTIRES':
                b.modifiers.remove(mod)
            else:
                bpy.ops.object.modifier_apply(modifier=mod.name)
        b.parent = None
        b.matrix_world = obj.matrix_world

        # Whole-figure orientation (lying), about the world x axis, around the origin.
        if pose.get('rootRotX'):
            b.matrix_world = Matrix.Rotation(pose['rootRotX'], 4, 'X') @ b.matrix_world
        baked.append(b)

    # GROUND AND CENTRE THE GROUP, NOT EACH PIECE. Grounding a coat separately would drop
    # its hem to the floor independently of the feet and shear the figure apart; centring
    # separately would slide it sideways off the body. One offset, applied to everything.
    #
    # Base-anchored, derived: PRD §11 v1.7's first output convention. Note the consequence
    # for garment authoring — a hem modelled below the soles lifts the whole figure off the
    # floor to satisfy min.z = 0, and the feet then hover. Hems stop at the ankle.
    bpy.context.view_layer.update()
    lo = min(min((b.matrix_world @ v.co).z for v in b.data.vertices) for b in baked)
    # Centre on the PELVIS in plan, so position.x/z in a scene mean what they say, measured
    # on the BODY (the first entry) and applied to every piece.
    #
    # Not on the bounding box, which is what this did until 13 August. The two agree to four
    # decimal places on every bilaterally symmetric pose, so the change was a no-op for the
    # library as it stood. They stop agreeing the moment a pose is asymmetric: reach one arm
    # out and the bounding box centre slides toward it, taking the whole body off the origin
    # with it, and a character placed at x=2 stands somewhere else. The pelvis is the root of
    # the chain and no limb can move it. A garment cannot move it either, which is the second
    # reason to measure here rather than over the group.
    bpy.context.view_layer.update()
    dx = (baked[0].matrix_world @ pelvis_local).x
    for b in baked:
        b.location.z -= lo
        b.location.x -= dx

    bpy.ops.object.select_all(action='DESELECT')
    for b in baked:
        b.select_set(True)
    bpy.context.view_layer.objects.active = baked[0]
    if len(baked) > 1:
        # One object, so the app's palette re-material applies one colour to the figure.
        # A body and a coat arriving as two objects would take two materials and read as a
        # collage rather than a person (PRD §11 v1.5 assigns per object).
        bpy.ops.object.join()
    baked = bpy.context.active_object

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
    shift = Vector((-mid_x, -mid_y, 0))
    obj.location += shift
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # The shift is returned because garments are authored against the body's position in
    # the source bundle and have to travel with it. Baking it into the body and not the
    # coat would leave the coat standing where the figure used to be.
    return obj, shift


def load_garments(blend, names, shift):
    """Link hand-authored garment meshes into the current scene, aligned to the body.

    The contract, and the reason there is no fitting step here: a garment is MODELLED ON
    the base mesh it belongs to, in the base mesh's own coordinates. That is what option 2
    of PRD §11 v1.10 buys — no proxy system, no shrinkwrap, no per-pose refitting — and it
    is only true if the author models against the same body the pipeline poses.
    """
    if not names:
        return []
    out = []
    with bpy.data.libraries.load(blend) as (src, dst):
        missing = [n for n in names if n not in src.objects]
        if missing:
            raise SystemExit(f'\nGarment blend {blend} has no object(s): {", ".join(missing)}\n'
                             f'It holds: {", ".join(sorted(src.objects))}\n')
        dst.objects = list(names)
    for obj in dst.objects:
        bpy.context.collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.location += shift
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        out.append(obj)
    return out


def load_standing_glb(src_dir, suffix):
    """Load a figure from an already-exported `standing<suffix>.glb` instead of the bundle.

    WHY THIS EXISTS. The 48 MB source bundle is gitignored and is not fetchable everywhere,
    so a machine without it cannot run this pipeline at all. But `standing.glb` *is* the
    unposed source figure: `POSES['standing']` is empty, so the committed file is the bundle
    mesh with the armature modifier applied over a rest pose (a no-op), multires dropped,
    normals normalised, grounded and plan-centred. Everything downstream measures world
    coordinates and re-derives its own skeleton, so it cannot tell the two sources apart —
    a claim that was checked rather than assumed: rebuilding the four original poses from
    `standing.glb` reproduces the bundle-built files at identical vertex and triangle counts
    and identical file sizes, with bounds matching to 0.4 mm on `standing` and `sitting` and
    within 6 mm on `crouching` and `lying`.

    THE BUNDLE REMAINS THE SOURCE OF TRUTH. This path derives from an output of it, so it
    can only reproduce what the committed library already contains: it cannot recover
    multires detail, and if a committed `.glb` is ever wrong, poses built this way inherit
    the error. Use the bundle whenever it is present.

    Axes need no correction. glTF is y-up with the figure facing +z; Blender's importer
    converts to z-up facing -y, which is exactly what the bundle path produces and what
    `measure()` and `build_armature()` assume.
    """
    import os
    path = f'{src_dir}/standing{suffix}.glb'
    if not os.path.exists(path):
        raise SystemExit(f'\nMissing source figure: {path}\n'
                         'Expected an exported standing pose per figure in this directory.\n')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise SystemExit(f'{path}: expected exactly one mesh, found {len(meshes)}')

    obj = meshes[0]
    # The importer parents the mesh under an empty carrying the y-up→z-up conversion.
    # Unparent keeping the transform, then bake it, so world coordinates are the vertex
    # coordinates — which is what every measurement below reads.
    obj.parent = None
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def main():
    src, out, garment_blend = args()
    from_glb = not src.endswith('.blend')
    if not from_glb:
        require(src)

    # Bare figures first, then clothed ones. Both go through the same path: the only
    # difference is how many meshes are bound to the rig before the poses are applied.
    jobs = [(suffix, body, ()) for suffix, body in FIGURES.items()]
    jobs += [(suffix, body, garments) for suffix, (body, garments) in GARMENT_FIGURES.items()]

    for suffix, body, garments in jobs:
        if garments and not garment_blend:
            raise SystemExit(f'\nFigure "{suffix}" needs garments {list(garments)} but no '
                             'garment .blend was given.\n'
                             'Pass it as the third argument. See assets-src/README.md.\n')
        if garments and from_glb:
            # Garments are authored against the body's position inside the CC0 bundle, and
            # are placed by the shift `load_figure` returns. An already-exported
            # standing.glb has been ground and plan-centred, so that shift no longer
            # describes it and a garment would land off the body. Bare figures rebuild
            # from a .glb perfectly well; clothed ones need the bundle.
            raise SystemExit(f'\nFigure "{suffix}" has garments, which need the CC0 bundle '
                             '.blend as <source>.\n'
                             'Rebuilding from exported .glb files supports bare figures '
                             'only.\n')
        obj, shift = ((load_standing_glb(src, suffix), Vector((0.0, 0.0, 0.0)))
                      if from_glb else load_figure(src, body))
        m = measure(obj)
        label = f'standing{suffix}.glb' if from_glb else body
        print(f'LANDMARKS[{label}] ' + '  '.join(f'{k}={v:.3f}' for k, v in m.items()))

        rig = build_armature(obj, m)
        pieces = [obj] + load_garments(garment_blend, garments, shift)
        hair = build_hair(obj, m, HAIR.get(suffix, 'cropped'))
        # Every piece binds to the same rig with the same automatic weighting. Proven on a
        # placeholder garment through a seated pose before this path was written — see
        # STATE.md, "Garment deform spike".
        #
        # `m` is the BODY's measurements, and `resolve_arm_bleed` (inside `bind`) uses them
        # to locate the arm band. A garment worn on that body occupies nearly the same
        # space, so the same correction applies — and it is needed, because bone heat hands
        # a coat's flank to the arm bones exactly as it did the body's, and a raised arm
        # would drag the hem. NOT VERIFIED against real garment geometry: GARMENT_FIGURES
        # ships empty, so this path has never run. Check it against the first garment.
        for piece in pieces:
            bind(piece, rig, m)
        # Hair rides the skull rather than deforming, so it is bone-parented, not skinned.
        parent_to_head(hair, rig)
        pieces += hair

        for name, pose in POSES.items():
            apply_pose(rig, pose)
            bpy.context.view_layer.update()
            bake_and_export(pieces, rig, pose, f'{out}/{name}{suffix}.glb')
            print(f'wrote {out}/{name}{suffix}.glb')


main()
