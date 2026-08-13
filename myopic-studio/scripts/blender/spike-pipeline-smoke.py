# SMOKE TEST — run the real pipeline end to end, with garments, on stand-in assets.
#
# The garment path in build-pose-glbs.py cannot be exercised on this machine the normal
# way: the CC0 bundle is not reachable here, and no garment has been modelled yet. Both are
# fixable with stand-ins, and the alternative — shipping an unrun code path and calling it
# done — is not acceptable for something the owner will run against real assets.
#
# WHAT IS REAL AND WHAT IS FAKE. The pipeline's own main(), load_figure(), load_garments()
# and bake_and_export() run unmodified, from source. Faked: the bundle .blend (built from
# the committed pose library, whose meshes came out of that bundle) and the garment (a
# placeholder tube — the derived-garment spike settled that generated shapes do not read as
# wardrobe, so this one only stands in for topology and position).
#
# The bundle stand-in deliberately parks its figures OFF the origin, like the real one,
# which is what makes the garment-alignment shift testable at all.
#
#   blender --background --factory-startup --python scripts/blender/spike-pipeline-smoke.py \
#       -- <out-dir>

import sys
from math import cos, sin, pi
from pathlib import Path

import bpy
import bmesh

PIPELINE = Path(__file__).with_name('build-pose-glbs.py')
LIBRARY = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'poses'

# Where the real bundle parks its meshes, near enough: load_figure()'s comment records
# x ≈ -2.26 for the figure it uses, and the centring it does exists because of that.
BUNDLE_OFFSET = (-2.26, 0.4, 0.0)


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: ... -- <out-dir>')
    return argv[0].rstrip('/')


def pipeline_namespace():
    src = PIPELINE.read_text().rstrip()
    if not src.endswith('main()'):
        raise SystemExit('build-pose-glbs.py no longer ends in main(); update this smoke test')
    ns = {'__name__': 'pipeline'}
    exec(compile(src[: -len('main()')], str(PIPELINE), 'exec'), ns)
    return ns


def import_as(path, name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    obj = next(o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH')
    obj.name = name
    obj.data.name = name
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.location = BUNDLE_OFFSET
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def build_bundle(path):
    """A stand-in for the CC0 bundle: the two library figures under the bundle's own names."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_as(LIBRARY / 'standing.glb', 'GEO-body_male_realistic')
    import_as(LIBRARY / 'standing-female.glb', 'GEO-body_female_realistic')
    bpy.ops.wm.save_as_mainfile(filepath=path)


def build_garment(path, segments=32, rings=8):
    """A placeholder garment, authored where the body stands in the bundle."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ox, oy, _ = BUNDLE_OFFSET
    bm = bmesh.new()
    loops = []
    for i in range(rings + 1):
        t = i / rings
        z = 0.92 - 0.50 * t
        r = 0.20 + 0.06 * t
        loops.append([bm.verts.new((ox + r * cos(2 * pi * k / segments),
                                    oy + r * sin(2 * pi * k / segments), z))
                      for k in range(segments)])
    for a, b in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    me = bpy.data.meshes.new('GARMENT-coat_long')
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new('GARMENT-coat_long', me)
    bpy.context.collection.objects.link(obj)
    bpy.ops.wm.save_as_mainfile(filepath=path)


def main():
    out = args()
    bundle = f'{out}/fake-bundle.blend'
    garments = f'{out}/fake-garments.blend'
    build_bundle(bundle)
    build_garment(garments)

    ns = pipeline_namespace()
    # Populate the roster the pipeline ships empty. Injecting it here rather than editing
    # the pipeline keeps the test's fixture out of the shipped table.
    ns['GARMENT_FIGURES'] = {
        '-coat': ('GEO-body_male_realistic', ('GARMENT-coat_long',)),
    }
    sys.argv = ['blender', '--', bundle, out, garments]
    ns['main']()
    print('[smoke] pipeline main() completed')


main()
