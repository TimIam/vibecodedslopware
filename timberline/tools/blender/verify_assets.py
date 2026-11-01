"""
Second headless pass: re-import every GLB from assets/models into an empty
scene, print node name / parent / triangle count / bounding box in glTF axes
(x, y-up, z), and render a 512x512 EEVEE preview to assets/previews/<name>.png.

  blender -b --factory-startup --python tools/blender/verify_assets.py [-- name ... [--extra DIR]]
"""
import bpy
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "assets", "models")
PREVIEWS = os.path.join(ROOT, "assets", "previews")
os.makedirs(PREVIEWS, exist_ok=True)

# camera direction (Blender axes, from target toward camera) per asset
VIEWS = {
    "axe": (0.45, -1.0, 0.25),
    "chainsaw": (0.35, -1.0, 0.55),
    "harvester": (1.0, -1.15, 0.55),
    "wedge": (0.7, -1.0, 0.8),
    "crown_conifer": (0.0, -1.0, 0.25),
    "crown_broadleaf": (0.0, -1.0, 0.12),
    "rock": (0.25, -1.0, 0.45),
}
EXTRA_VIEWS = {
    "chainsaw": [("left", (0.3, 1.0, 0.5)), ("top", (0.0, -0.15, 1.0))],
    "harvester": [("side", (1.0, 0.0, 0.15)), ("head", None)],
    "axe": [("edge", (1.0, -0.15, 0.1))],
}


def gl(v):  # Blender -> glTF axes
    return Vector((v.x, v.z, -v.y))


def world_verts(o):
    if o.type != "MESH":
        return []
    return [o.matrix_world @ v.co for v in o.data.vertices]


def subtree(o):
    out = [o]
    for c in o.children:
        out += subtree(c)
    return out


def bbox(points):
    g = [gl(p) for p in points]
    mn = Vector((min(p.x for p in g), min(p.y for p in g), min(p.z for p in g)))
    mx = Vector((max(p.x for p in g), max(p.y for p in g), max(p.z for p in g)))
    return mn, mx


def fmt(v):
    return "(%6.3f %6.3f %6.3f)" % tuple(v)


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.resolution_percentage = 100
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = "Standard"
    except Exception:
        pass
    w = bpy.data.worlds.new("W")
    sc.world = w
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.62, 0.68, 0.76, 1)
    bg.inputs[1].default_value = 0.75
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(4)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    sc.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 0.8
    fill.rotation_euler = (math.radians(70), 0, math.radians(215))
    sc.collection.objects.link(fill)


def add_ground(zmin, size):
    me = bpy.data.meshes.new("Ground")
    s = size
    me.from_pydata([(-s, -s, zmin), (s, -s, zmin), (s, s, zmin), (-s, s, zmin)], [], [(0, 1, 2, 3)])
    m = bpy.data.materials.new("GroundMat")
    m.diffuse_color = (0.42, 0.40, 0.36, 1)
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.30, 0.29, 0.26, 1)
    b.inputs["Roughness"].default_value = 1.0
    me.materials.append(m)
    g = bpy.data.objects.new("Ground", me)
    bpy.context.scene.collection.objects.link(g)
    return g


def render(points, direction, path, lens=50, center=None, radius=None, fit=0.92):
    sc = bpy.context.scene
    mn = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    mx = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    c = center if center is not None else (mn + mx) / 2
    r = radius if radius is not None else max((p - c).length for p in points)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    fov = 2 * math.atan(18.0 / lens)
    d = Vector(direction).normalized()
    dist = r / math.sin(fov / 2) * fit
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_start = dist / 200
    cam_data.clip_end = dist * 10
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    extra_dir = None
    if "--extra" in argv:
        i = argv.index("--extra")
        extra_dir = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    names = argv or [f[:-4] for f in sorted(os.listdir(MODELS)) if f.endswith(".glb")]
    for name in names:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        path = os.path.join(MODELS, name + ".glb")
        bpy.ops.import_scene.gltf(filepath=path)
        objs = list(bpy.context.scene.objects)
        bpy.context.view_layer.update()
        print("\n=== %s  (%.1f KB) ===" % (name + ".glb", os.path.getsize(path) / 1024))
        print("%-16s %-7s %-14s %6s  %-22s %-22s" % ("node", "type", "parent", "tris", "bbox min (glTF)", "bbox max (glTF)"))
        alltris = 0
        roots = [o for o in objs if o.parent is None]

        def walk(o):
            nonlocal alltris
            pts = world_verts(o) if o.type == "MESH" else [p for d in subtree(o) for p in world_verts(d)]
            tris = sum(len(p.vertices) - 2 for p in o.data.polygons) if o.type == "MESH" else 0
            alltris += tris
            mn, mx = bbox(pts) if pts else (Vector(), Vector())
            print("%-16s %-7s %-14s %6d  %s %s" % (o.name, o.type, o.parent.name if o.parent else "-",
                                                  tris, fmt(mn), fmt(mx)))
            for c in sorted(o.children, key=lambda c: c.name):
                walk(c)
        for r in sorted(roots, key=lambda r: r.name):
            walk(r)
        print("TOTAL tris %d" % alltris)
        pts = [p for o in objs for p in world_verts(o)]
        setup_render()
        zmin = min(p.z for p in pts)
        span = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
        if not name.startswith("crown"):
            add_ground(zmin - 0.0005, span * 4 + 1)
        render(pts, VIEWS.get(name, (0.5, -1, 0.5)), os.path.join(PREVIEWS, name + ".png"),
               fit=1.05 if name.startswith(("crown", "rock", "axe")) else 0.9)
        if extra_dir:
            for tag, dvec in EXTRA_VIEWS.get(name, []):
                out = os.path.join(extra_dir, "%s_%s.png" % (name, tag))
                if tag == "head":
                    h = bpy.data.objects.get("Head")
                    hp = [p for d in subtree(h) for p in world_verts(d)]
                    render(hp, (0.8, -1.0, 0.4), out)
                else:
                    render(pts, dvec, out)


main()
print("VERIFY DONE")
