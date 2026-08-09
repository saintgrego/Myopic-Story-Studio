# Blender spike (PRD §11 / plan §4.3) — source-agnostic.
#
# Proves the mechanical half of the asset pipeline before any licence decision is made:
# headless Blender → .glb → grounded, correctly oriented, loadable by the app's viewport.
# It builds its own geometry (a facing probe, and Blender's Suzanne) so nothing here
# depends on which base mesh is eventually chosen.
#
# Run from myopic-studio/:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python scripts/blender/spike-export.py -- <out-dir>
#
# --factory-startup matters: without it a personal Blender config (add-ons, unit scale,
# a non-default scene) silently changes the output.
#
# AXIS CONVENTION — the landmine this spike exists to defuse. The app's figures face +Z
# and stand on +Y up (see the mannequin's nose marker in generate-pose-glbs.mjs). Blender
# is +Z up, and a Blender figure conventionally faces -Y (Suzanne does). The glTF exporter
# converts to the glTF/three convention on the way out; the probe below measures what that
# conversion actually did rather than trusting anyone's account of it.

import sys

import bpy
from mathutils import Vector


def out_dir():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: ... --python spike-export.py -- <out-dir>')
    return argv[0].rstrip('/')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def world_min_z(objects):
    return min((obj.matrix_world @ Vector(corner)).z for obj in objects for corner in obj.bound_box)


def ground(objects):
    """Sit the selection on the floor: base-anchored, the app's convention (PRD §4).

    Done here rather than in the viewport for the same reason the pose generator derives
    its own offset — the exporter is the last place that knows the real bounds.
    """
    drop = world_min_z(objects)
    for obj in objects:
        obj.location.z -= drop


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB')
    print(f'wrote {path}')


def build_probe():
    """An unambiguous orientation marker.

    A flat plate with a single spike on the side a Blender figure faces (-Y) and a shorter
    one on its left (-X). Both are named, so the measuring script can read their positions
    out of the exported file and say exactly which glTF axis each Blender axis became.
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.05))
    plate = bpy.context.active_object
    plate.name = 'plate'
    plate.scale = (1.0, 1.0, 0.1)

    bpy.ops.mesh.primitive_cone_add(radius1=0.15, depth=0.6, location=(0, -0.8, 0.3))
    nose = bpy.context.active_object
    nose.name = 'nose'
    nose.rotation_euler = (-1.5707963, 0, 0)  # point it along -Y, the facing direction

    bpy.ops.mesh.primitive_cube_add(size=0.2, location=(-0.8, 0, 0.3))
    left = bpy.context.active_object
    left.name = 'leftmark'

    return [plate, nose, left]


def build_suzanne():
    """A real mesh, to prove the path works on something that is not a box."""
    bpy.ops.mesh.primitive_monkey_add(size=1.6, location=(0, 0, 0))
    suzanne = bpy.context.active_object
    suzanne.name = 'suzanne'
    return [suzanne]


directory = out_dir()

reset()
objects = build_probe()
ground(objects)
export(f'{directory}/orient-probe.glb')

reset()
objects = build_suzanne()
ground(objects)
export(f'{directory}/suzanne.glb')
