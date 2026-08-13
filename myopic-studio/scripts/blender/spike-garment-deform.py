# SPIKE — does a separate garment mesh deform WITH the body? (PRD §11 v1.10)
#
# The question the first spike could not reach, and the one that decides whether
# hand-authored garments (v1.10's option 2) work at all: a garment is its own mesh with
# its own topology, bound to the same rig as the body. When the figure sits, does the
# garment sit with it?
#
# If the answer is yes, the pipeline change is small — bind a second object, export both.
# If the answer is no, hand-authoring garments buys nothing, because a garment that only
# fits the standing pose has to be re-modelled per pose, and there are eight of those.
#
# Run from myopic-studio/:
#
#   blender --background --factory-startup --python scripts/blender/spike-garment-deform.py \
#       -- <body.glb> <out-dir>
#
# IT REUSES THE REAL PIPELINE FUNCTIONS, not copies of them. build-pose-glbs.py is a script
# rather than a module and calls main() at import time, so its source is exec'd here with
# that final call stripped. Copying measure()/build_armature()/apply_pose() into the spike
# would prove the copies work and leave the pipeline untested, which is the opposite of
# what a spike is for.
#
# STAND-IN INPUT. The real base mesh (the CC0 bundle) was not reachable from this machine,
# so the body is a committed pose-library .glb — that bundle's own output, unrigged, which
# is exactly the shape load_figure() hands the rig builder.

import sys
from math import cos, sin, pi
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

PIPELINE = Path(__file__).with_name('build-pose-glbs.py')


def load_pipeline():
    src = PIPELINE.read_text()
    tail = src.rstrip()
    if not tail.endswith('main()'):
        raise SystemExit('build-pose-glbs.py no longer ends in main(); update this spike')
    ns = {'__name__': 'pipeline'}
    exec(compile(tail[: -len('main()')], str(PIPELINE), 'exec'), ns)
    return ns


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 2:
        raise SystemExit('usage: ... -- <body.glb> <out-dir>')
    return argv[0], argv[1].rstrip('/')


def load_body(path, P):
    """Mirrors load_figure()'s contract: origin-centred in plan, transform-free, unrigged."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    verts = P['world_verts'](obj)
    mid_x = (min(v.x for v in verts) + max(v.x for v in verts)) / 2
    mid_y = (min(v.y for v in verts) + max(v.y for v in verts)) / 2
    obj.location -= Vector((mid_x, mid_y, 0))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def placeholder_skirt(body, m, P, segments=32, rings=8):
    """A stand-in for a hand-authored garment: a tube from the waist to mid-thigh.

    ITS SHAPE IS NOT THE POINT — the first spike already established that derived shapes do
    not read as wardrobe. What matters here is that it is a SEPARATE mesh with its own
    topology, spanning the hip and both thighs, which is the hardest thing for a rig to
    deform: seated, the thighs swing forward 90° and the two legs pull one tube in two
    directions. A garment that survives this survives anything in the pose table.
    """
    verts = P['world_verts'](body)
    z_top = m['crotch'] + 0.16
    z_bot = m['crotch'] - 0.34
    bm = bmesh.new()
    loops = []
    for i in range(rings + 1):
        t = i / rings
        z = z_top + (z_bot - z_top) * t
        band = [v for v in verts if abs(v.z - z) < 0.04]
        if not band:
            continue
        cx = (min(v.x for v in band) + max(v.x for v in band)) / 2
        cy = (min(v.y for v in band) + max(v.y for v in band)) / 2
        r = 0.20 + 0.06 * t
        loops.append([bm.verts.new((cx + r * cos(2 * pi * k / segments),
                                    cy + r * sin(2 * pi * k / segments), z))
                      for k in range(segments)])
    for a, b in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    me = bpy.data.meshes.new('garment')
    bm.to_mesh(me)
    bm.free()
    g = bpy.data.objects.new('garment', me)
    bpy.context.collection.objects.link(g)
    solid = g.modifiers.new('solidify', 'SOLIDIFY')
    solid.thickness = 0.012
    return g


def export_group(objs, path):
    """Bake pose into vertices, ground the GROUP, write one .glb.

    This is bake_and_export() generalised from one object to several, which is the whole
    of the pipeline change option 2 needs. Grounding on the group rather than per object is
    the load-bearing detail: grounding each separately would drop a hem to the floor
    independently of the feet and shear the figure apart.
    """
    baked = []
    for obj in objs:
        b = obj.copy()
        b.data = obj.data.copy()
        bpy.context.collection.objects.link(b)
        bpy.ops.object.select_all(action='DESELECT')
        b.select_set(True)
        bpy.context.view_layer.objects.active = b
        for mod in list(b.modifiers):
            if mod.type == 'MULTIRES':
                b.modifiers.remove(mod)
            else:
                bpy.ops.object.modifier_apply(modifier=mod.name)
        b.parent = None
        b.matrix_world = obj.matrix_world
        baked.append(b)

    bpy.context.view_layer.update()
    lo = min(min((b.matrix_world @ v.co).z for v in b.data.vertices) for b in baked)
    for b in baked:
        b.location.z -= lo

    bpy.ops.object.select_all(action='DESELECT')
    for b in baked:
        b.select_set(True)
    bpy.context.view_layer.objects.active = baked[0]
    if len(baked) > 1:
        bpy.ops.object.join()
    joined = bpy.context.active_object
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth()
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_skins=False, export_materials='NONE')
    bpy.data.objects.remove(joined, do_unlink=True)


def main():
    body_path, out = args()
    P = load_pipeline()

    body = load_body(body_path, P)
    m = P['measure'](body)
    print('[deform] ' + '  '.join(f'{k}={v:.3f}' for k, v in m.items()))

    rig = P['build_armature'](body, m)
    garment = placeholder_skirt(body, m, P)

    # Bind BOTH to the same rig, with the same automatic weighting the pipeline uses for
    # the body. If a hand-authored garment needs hand-painted weights instead, this is
    # where that shows up.
    P['bind'](body, rig)
    P['bind'](garment, rig)

    for pose_name in ('standing', 'sitting'):
        P['apply_pose'](rig, P['POSES'][pose_name])
        bpy.context.view_layer.update()
        export_group([body, garment], f'{out}/deform-{pose_name}.glb')
        print(f'[deform] wrote {out}/deform-{pose_name}.glb')


main()
