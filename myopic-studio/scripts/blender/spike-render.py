# SPIKE RENDER — does a derived garment read at 35mm? (PRD §11 v1.10)
#
# Puts .glb figures side by side under flat warm greys from src/palette.ts, a 35 mm lens,
# and a key from above-left, then renders a PNG. This is the readability half of the
# garment spike: geometry that measures correctly can still fail the only test that
# matters, which is whether a director can tell two figures apart in a shot.
#
# THIS IS A BLENDER RENDER, NOT THE APP. Materials are flat and unlit-ish to match the
# viewport's basic materials, and the lens is the app's default 35 mm, but the app's tone
# mapping, fog and shadow settings are its own. It answers "does the silhouette read",
# not "this is what the viewport will show".
#
#   blender --background --factory-startup --python scripts/blender/spike-render.py \
#       -- <out.png> <a.glb> <b.glb> [...]

import sys
from math import radians

import bpy

# WARM_GREYS from src/palette.ts — people. Linear-ish sRGB values, cycled by index the
# way Viewport.tsx cycles them.
WARM = [(0.65, 0.60, 0.55), (0.72, 0.67, 0.62), (0.78, 0.74, 0.70),
        (0.84, 0.81, 0.78), (0.90, 0.88, 0.86)]
SPACING = 0.95


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) < 2:
        raise SystemExit('usage: ... -- <out.png> <a.glb> [b.glb ...]')
    return argv[0], argv[1:]


def flat(name, rgb):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = 1.0
    # The specular socket was renamed in Blender 4.x ('Specular' → 'Specular IOR Level')
    # and this script has to run on whatever the machine has.
    for key in ('Specular IOR Level', 'Specular'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.0
            break
    return mat


def main():
    out, files = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    n = len(files)
    for i, f in enumerate(files):
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        new = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
        x = (i - (n - 1) / 2) * SPACING
        for o in new:
            o.location.x += x
            o.data.materials.clear()
            o.data.materials.append(flat(f'fig{i}', WARM[i % len(WARM)]))

    # Ground, cool and dark like the viewport's plane, so silhouettes have something to
    # read against.
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(flat('ground', (0.12, 0.12, 0.14)))

    # Key from above-left, roughly the app's default direction, plus a soft fill so the
    # shadow side does not go to black and hide the silhouette we are trying to judge.
    bpy.ops.object.light_add(type='SUN', location=(-4, -4, 6))
    key = bpy.context.active_object
    key.data.energy = 3.2
    key.data.angle = radians(8)
    key.rotation_euler = (radians(52), 0, radians(-38))
    bpy.ops.object.light_add(type='SUN', location=(5, -3, 3))
    fill = bpy.context.active_object
    fill.data.energy = 1.0
    fill.rotation_euler = (radians(65), 0, radians(60))

    # 35 mm, eye height, far enough back to hold the whole group — the app's default lens.
    bpy.ops.object.camera_add(location=(0, -(3.0 + 0.8 * n), 1.15))
    cam = bpy.context.active_object
    cam.data.lens = 35
    cam.rotation_euler = (radians(88), 0, 0)
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    # Cycles on CPU, not EEVEE: EEVEE is a rasteriser and wants a GL context, which a
    # headless container does not have (it fails on libEGL.so.1). Sample count is low
    # because this render judges silhouette, not noise.
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    # The Ubuntu Blender build ships without OpenImageDenoise, so denoising must stay off.
    scene.cycles.use_denoising = False
    scene.cycles.samples = 96
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f'[spike-render] wrote {out}')


main()
