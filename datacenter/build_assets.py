# Builds the game's 3D assets in Blender and exports them as GLB (see DESIGN.md §15-§16 and assets/ASSETS.md).
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python datacenter/build_assets.py
#
# Outputs assets/library.glb (every shared mesh) and assets/stage_1..5.glb (one shell + props per stage).
# Conventions: 1 unit = 1 m, Blender Z up, FRONT = -Y (export_yup turns it into +Z in three.js), origin at the
# bottom-centre of every library object, flat shading, <= 400 tris per library mesh. Object names are the ids
# data.js uses. Children that repeat across parents (led_0, fan_0, ...) are built as "<name>__<parent>" because
# Blender names are global, and renamed back when the GLB is post-processed (strip_child_suffixes).
# After every export the GLB is re-read and checked (check_library / check_stage); the script exits 1 on a failure.

import bpy, bmesh, math, os, sys, json, struct, re
from mathutils import Vector

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUT_DIR, exist_ok=True)
PI = math.pi
LIB_TRI_LIMIT = 400
SHELL_TRI_LIMIT = 7000   # DESIGN.md asks for ~6k; the hard stop is a little above it

# ---------- scene helpers ----------
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for b in list(block):
            if b.users == 0:
                block.remove(b)

def link(o):
    bpy.context.scene.collection.objects.link(o)
    return o

def deselect_all():
    for o in bpy.data.objects:
        o.select_set(False)

def activate(o):
    deselect_all()
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

# ---------- materials ----------
_mats = {}
def mat(name, color, *, rough=0.8, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, double=False):
    """Flat Principled material. color/emit are linear (r,g,b). alpha < 1 exports as alphaMode BLEND."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Alpha"].default_value = alpha
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0 and hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    m.use_backface_culling = not double
    m.use_fake_user = True  # survive the orphan purges between exports
    _mats[name] = m
    return m

# ---------- primitives (all return a mesh object linked to the scene) ----------
def _finish_prim(o, name, material):
    o.name = name
    if material:
        o.data.materials.append(material)
    o.data.shade_flat()
    return o

def box(name, size, loc=(0, 0, 0), material=None, rot=(0, 0, 0)):
    """Axis-aligned box. size=(x,y,z) in metres, loc = centre, rot = euler radians (kept until bake)."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish_prim(o, name, material)

def cyl(name, r, h, loc=(0, 0, 0), material=None, n=12, rot=(0, 0, 0), r2=None, caps=True):
    """Vertical cylinder (axis Z) of radius r and height h; r2 makes it a cone/frustum (r at the bottom, r2 at the top)."""
    fill = "NGON" if caps else "NOTHING"
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=loc, rotation=rot, end_fill_type=fill)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, end_fill_type=fill)
    return _finish_prim(bpy.context.active_object, name, material)

def dome(name, r, loc, material, seg=16, rings=8):
    """Upper hemisphere (open underneath)."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    return _finish_prim(o, name, material)

def _bm_object(name, verts, faces, material, loc, rot, uvs=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for fi, f in enumerate(faces):
        face = bm.faces.new([vs[i] for i in f])
        if uvs:
            for loop, uv in zip(face.loops, uvs[fi]):
                loop[uv_layer].uv = uv
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    o.rotation_euler = rot
    return _finish_prim(o, name, material)

def quad(name, w, h, loc, material, rot=(0, 0, 0)):
    """One face, w along X and h along Y, normal +Z, UV (0,0)-(1,1). rot=(pi/2,0,0) makes it vertical facing -Y."""
    verts = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
    return _bm_object(name, verts, [[0, 1, 2, 3]], material, loc, rot, uvs=[[(0, 0), (1, 0), (1, 1), (0, 1)]])

def prism(name, w, d, h, loc, material):
    """Triangular (gable) prism: ridge along X, base w x d at z=0, ridge at z=h."""
    verts = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0), (-w / 2, 0, h), (w / 2, 0, h)]
    faces = [[0, 1, 2, 3], [0, 1, 5, 4], [2, 3, 4, 5], [0, 4, 3], [1, 2, 5]]
    return _bm_object(name, verts, faces, material, loc, (0, 0, 0))

# ---------- assembly ----------
def join(objs, name):
    """Join objects into one mesh object named `name` (materials are kept per face; objs[0]'s materials come first)."""
    deselect_all()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    j.data.name = name
    return j

def apply_all(o):
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def set_origin_bottom(o):
    """Bake the transform, then shift the mesh so its origin is at the bottom-centre (x/y centred, min z = 0)."""
    apply_all(o)
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    cx, cy, zmin = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
    for v in o.data.vertices:
        v.co.x -= cx; v.co.y -= cy; v.co.z -= zmin
    o.location = (0, 0, 0)

def bake(o, recenter=False):
    """Apply transforms and flat shading. recenter=True also moves the origin to the bbox bottom-centre."""
    if recenter:
        set_origin_bottom(o)
    else:
        apply_all(o)
    o.data.shade_flat()
    o.data.name = o.name
    return o

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def child_name(name, parent):
    return f"{name}__{parent.name}"

def empty(name, parent, loc, rot=(0, 0, 0)):
    e = link(bpy.data.objects.new(child_name(name, parent), None))
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.05
    e.parent = parent
    e.location = loc
    e.rotation_euler = rot
    e["role"] = name   # three.js suffixes repeated node names (led_0_2, ...); userData.role stays exact
    return e

def adopt(child, parent, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Parent a baked mesh object under `parent` as `name` (export name) at a local TRS."""
    child.name = child_name(name, parent)
    child["role"] = name
    child.parent = parent
    child.location = loc
    child.rotation_euler = rot
    return child

def variant(name, src, scale, extras=None):
    """A second object over src's mesh datablock, keeping a node scale (DESIGN.md §14.1)."""
    o = link(bpy.data.objects.new(name, src.data))
    o.scale = (scale, scale, scale)
    o["base"] = src.name
    for k, v in (extras or {}).items():
        o[k] = v
    return o

def leds(o, z, x0=-0.21, x1=-0.18, y=-0.447):
    empty("led_0", o, (x0, y, z))
    empty("led_1", o, (x1, y, z))

def fan(parent, name, r, blades, hub_r, hub_h, blade_w, loc, rot=(0, 0, 0)):
    """Spinning part: a hub plus `blades` pitched paddles in the local XY plane, spin axis local +Z (glTF +Y)."""
    parts = [cyl("hub", hub_r, hub_h, (0, 0, 0), M_STEEL, n=8)]
    for i in range(blades):
        a = 2 * PI * i / blades
        rm = (hub_r + r) / 2
        parts.append(box("blade", (r - hub_r + 0.01, blade_w, 0.012), (rm * math.cos(a), rm * math.sin(a), 0), M_PLASTIC, rot=(0.55, 0, a)))
    f = bake(join(parts, "fan"))
    return adopt(f, parent, name, loc, rot)

# ---------- materials (clear_scene() first: the orphan purge would delete unused materials) ----------
clear_scene()
M_STEEL = mat("MAT_steel_dark", (0.02, 0.023, 0.03), rough=0.8, metal=0.2)
M_WHITE = mat("MAT_rack_white", (0.6, 0.6, 0.6), rough=0.8)
M_CONC = mat("MAT_concrete", (0.05, 0.055, 0.07), rough=0.9)
M_PLASTIC = mat("MAT_plastic", (0.2, 0.21, 0.23), rough=0.8)
M_GLASS = mat("MAT_glass", (0.4, 0.52, 0.6), rough=0.2, alpha=0.18, double=True)
M_CHAIN = mat("MAT_chainlink", (0.35, 0.36, 0.38), rough=0.8, alpha=0.9, double=True)
M_LED = mat("MAT_led", (0.0, 0.0, 0.0), rough=0.4, emit=(0.85, 0.92, 1.0), emit_strength=4.0, double=True)
M_GLOW = mat("MAT_glow", (0.0, 0.0, 0.0), rough=0.4, emit=(0.85, 0.92, 1.0), emit_strength=0.7, double=True)  # big light fixtures: lit, but under the bloom threshold
# Tinted glows for small lit props (the Colo vending front). The scene keys its shading classes by material name and only
# honours GLB emissive on MAT_led / MAT_glow; until it learns these two they fall back to the body class and render by base
# colour alone, so the base is already the tint (albedo <= 0.6) rather than black.
M_GLOW_BLUE = mat("MAT_glow_blue", (0.4, 0.5, 0.6), rough=0.4, emit=(0.55, 0.75, 1.0), emit_strength=0.7, double=True)
M_GLOW_RED = mat("MAT_glow_red", (0.6, 0.18, 0.05), rough=0.4, emit=(1.0, 0.42, 0.12), emit_strength=0.7, double=True)
M_COOL = mat("MAT_coolant", (0.06, 0.38, 0.6), rough=0.5)
M_YELLOW = mat("MAT_yellow", (0.6, 0.45, 0.04))
M_GOLD = mat("MAT_gold", (0.6, 0.42, 0.1), rough=0.45, metal=0.7)
M_RED = mat("MAT_red", (0.5, 0.05, 0.04))
M_WOOD = mat("MAT_wood", (0.32, 0.2, 0.09))
M_RUBBER = mat("MAT_rubber", (0.02, 0.02, 0.02), rough=0.9)
M_TILE_BLUE = mat("MAT_tile_blue", (0.1, 0.28, 0.6))
M_TILE_HOT = mat("MAT_tile_hot", (0.1, 0.085, 0.08))
M_CARD = mat("MAT_cardboard", (0.4, 0.27, 0.13))

# ======================================================================================================
# LIBRARY
# ======================================================================================================
def build_rack_frame():
    """0.6 x 1.2 x 2.0 m, open front (-Y) and back. Material slot 0 = the paint (swapped to MAT_rack_white from the
    Colo on), slot 1 = dark trim that stays. slot_i empties at the bottom-centre of each 0.22 m slot."""
    w, d, h, t = 0.6, 1.2, 2.0, 0.05
    parts = [box("top", (w, d, 0.12), (0, 0, h - 0.06), M_STEEL)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("post", (t, t, h - 0.24), (sx * (w / 2 - t / 2), sy * (d / 2 - t / 2), h / 2), M_STEEL))
        parts.append(box("side", (0.02, d - 2 * t, h - 0.24), (sx * (w / 2 - 0.012), 0, h / 2), M_STEEL))
    parts.append(box("base", (w, d, 0.12), (0, 0, 0.06), M_PLASTIC))
    for z in (0.5, 1.5):
        parts.append(box("brace", (w - 2 * t, 0.03, 0.03), (0, d / 2 - t / 2, z), M_PLASTIC))
    for sx in (-1, 1):
        parts.append(box("rail", (0.03, 0.02, h - 0.24), (sx * (w / 2 - t - 0.015), -d / 2 + t / 2, h / 2), M_PLASTIC))
    r = bake(join(parts, "rack_frame"))
    for i in range(8):
        empty(f"slot_{i}", r, (0, -0.10, 0.12 + 0.22 * i))
    return r

def srv_shell(name, h, body_mat=M_STEEL):
    """Body + front face plate inside the 0.52 x 0.9 x h envelope; face plate front at y=-0.44 (details sit to -0.45)."""
    body = box("body", (0.52, 0.86, h - 0.01), (0, 0.02, (h - 0.01) / 2), body_mat)
    face = box("face", (0.52, 0.03, h), (0, -0.425, h / 2), M_PLASTIC)
    return [body, face]

def build_srv_pizza_box():
    parts = srv_shell("srv_pizza_box", 0.17)
    parts.append(box("vent", (0.30, 0.012, 0.07), (0.07, -0.444, 0.085), M_STEEL))
    for sx in (-1, 1):
        parts.append(box("ear", (0.03, 0.012, 0.15), (sx * 0.245, -0.444, 0.085), M_STEEL))
    o = bake(join(parts, "srv_pizza_box"))
    leds(o, 0.13)
    return o

def build_srv_gpu_node():
    parts = srv_shell("srv_gpu_node", 0.19)
    for i in range(5):
        parts.append(box("louvre", (0.34, 0.012, 0.014), (0.06, -0.444, 0.03 + i * 0.033), M_STEEL))
    o = bake(join(parts, "srv_gpu_node"))
    leds(o, 0.15)
    return o

def build_srv_storage():
    parts = srv_shell("srv_storage", 0.19)
    for row, z in enumerate((0.055, 0.13)):
        for i in range(6):
            parts.append(box("bay", (0.05, 0.012, 0.055), (-0.10 + i * 0.064, -0.444, z), M_STEEL))
    o = bake(join(parts, "srv_storage"))
    leds(o, 0.15)
    return o

def build_srv_ai_pod():
    body = box("body", (0.52, 0.84, 0.17), (0, 0.03, 0.085), M_PLASTIC)
    parts = [body]
    for sx in (-1, 1):
        parts.append(box("pod", (0.23, 0.07, 0.16), (sx * 0.135, -0.413, 0.085), M_STEEL))
    for sx in (-1, 1):
        parts.append(cyl("pipe", 0.012, 0.6, (sx * 0.12, 0.1, 0.182), M_COOL, n=8, rot=(PI / 2, 0, 0)))
    parts.append(box("manifold", (0.3, 0.05, 0.025), (0, 0.4, 0.182), M_COOL))
    o = bake(join(parts, "srv_ai_pod"))
    leds(o, 0.14, x0=-0.215, x1=-0.185, y=-0.45)
    return o

def build_srv_quantum():
    parts = [cyl("cryostat", 0.095, 0.78, (0, 0.05, 0.1), M_GOLD, n=12, rot=(PI / 2, 0, 0))]
    for y in (0.0, 0.25):
        parts.append(cyl("band", 0.1, 0.03, (0, y, 0.1), M_STEEL, n=12, rot=(PI / 2, 0, 0)))
    parts.append(box("flange", (0.52, 0.03, 0.19), (0, -0.425, 0.095), M_PLASTIC))
    parts.append(cyl("port", 0.065, 0.01, (0.1, -0.445, 0.1), M_GOLD, n=12, rot=(PI / 2, 0, 0)))
    parts.append(box("bracket", (0.4, 0.1, 0.15), (0, 0.4, 0.075), M_STEEL))
    o = bake(join(parts, "srv_quantum"))
    leds(o, 0.15)
    return o

def build_srv_orbital():
    parts = srv_shell("srv_orbital", 0.12)
    parts.append(cyl("pedestal", 0.025, 0.03, (0.06, 0.08, 0.125), M_STEEL, n=8))
    parts.append(cyl("dish", 0.04, 0.045, (0.06, 0.08, 0.1625), M_WHITE, n=12, r2=0.17))
    parts.append(cyl("feed", 0.006, 0.06, (0.06, 0.08, 0.17), M_STEEL, n=6))
    o = bake(join(parts, "srv_orbital"))
    leds(o, 0.085)
    return o

def build_pwr_pdu():
    parts = [box("strip", (0.06, 0.05, 1.6), (0, 0, 0.8), M_STEEL)]
    for i in range(8):
        parts.append(box("outlet", (0.035, 0.008, 0.035), (0, -0.029, 0.2 + i * 0.18), M_PLASTIC))
    parts.append(cyl("cable", 0.012, 0.3, (0, 0, 1.75), M_RUBBER, n=6))
    parts.append(box("led", (0.02, 0.006, 0.01), (0, -0.028, 1.56), M_LED))
    return bake(join(parts, "pwr_pdu"))

def build_pwr_subpanel():
    parts = [box("strut", (0.04, 0.04, 1.2), (sx * 0.2, 0, 0.6), M_STEEL) for sx in (-1, 1)]
    parts.append(box("panel", (0.5, 0.16, 0.8), (0, 0, 1.2), M_PLASTIC))
    parts.append(box("door", (0.44, 0.006, 0.7), (0, -0.083, 1.2), M_STEEL))
    parts.append(box("handle", (0.06, 0.03, 0.1), (0.15, -0.095, 1.3), M_RED))
    parts.append(cyl("conduit", 0.025, 0.5, (0, 0.03, 1.85), M_STEEL, n=8))
    parts.append(cyl("conduit2", 0.025, 0.8, (-0.12, 0.03, 0.4), M_STEEL, n=8))
    return bake(join(parts, "pwr_subpanel"))

def build_pwr_genset():
    parts = [box("skid", (1.7, 0.8, 0.1), (0, 0, 0.05), M_STEEL),
             box("enclosure", (1.56, 0.74, 0.86), (-0.07, 0, 0.53), M_YELLOW),
             box("grille", (0.14, 0.6, 0.7), (0.78, 0, 0.5), M_STEEL),
             box("stripe", (1.56, 0.006, 0.06), (-0.07, -0.373, 0.2), M_STEEL),
             box("panel", (0.3, 0.02, 0.2), (0.2, -0.38, 0.65), M_STEEL),
             box("led", (0.03, 0.006, 0.015), (0.3, -0.393, 0.7), M_LED),
             cyl("stack", 0.06, 0.7, (-0.55, 0.15, 1.3), M_STEEL, n=8),
             cyl("cap", 0.09, 0.08, (-0.55, 0.15, 1.69), M_STEEL, n=8, r2=0.02),
             cyl("fuelcap", 0.04, 0.02, (0.3, 0, 0.97), M_RED, n=8)]
    for i in range(4):
        parts.append(box("slat", (0.02, 0.5, 0.012), (0.86, 0, 0.25 + i * 0.14), M_PLASTIC))
    return bake(join(parts, "pwr_genset"))

def build_pwr_substation():
    parts = [box("pad", (1.5, 1.2, 0.12), (0, 0, 0.06), M_CONC),
             box("tank", (1.0, 0.75, 0.95), (0, 0, 0.6), M_STEEL),
             cyl("conservator", 0.14, 0.8, (0, -0.2, 1.22), M_STEEL, n=10, rot=(0, PI / 2, 0))]
    for sx in (-1, 1):
        for i in range(3):
            parts.append(box("fin", (0.03, 0.55, 0.7), (sx * (0.56 + i * 0.055), 0, 0.6), M_STEEL))
    for x in (-0.3, 0.0, 0.3):
        parts.append(cyl("bushing", 0.045, 0.4, (x, 0.1, 1.27), M_WHITE, n=6))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("post", (0.04, 0.04, 1.1), (sx * 0.72, sy * 0.58, 0.55), M_STEEL))
    parts.append(quad("fence", 1.44, 1.0, (0, 0.58, 0.55), M_CHAIN, rot=(PI / 2, 0, 0)))
    for sx in (-1, 1):
        parts.append(quad("fence", 1.16, 1.0, (sx * 0.72, 0, 0.55), M_CHAIN, rot=(PI / 2, 0, PI / 2)))
    return bake(join(parts, "pwr_substation"))

def build_pwr_hv_feed(substation):
    """Substation datablock at node scale 1.6 plus a pylon child (local units, so it scales with the parent)."""
    o = variant("pwr_hv_feed", substation, 1.6)
    parts = [box("pad", (1.0, 1.0, 0.1), (0, 1.1, 0.05), M_CONC),
             cyl("tower", 0.45, 3.6, (0, 1.1, 1.85), M_STEEL, n=4, rot=(0, 0, PI / 4), r2=0.12),
             box("arm", (1.4, 0.06, 0.06), (0, 1.1, 2.9), M_STEEL),
             box("arm2", (1.0, 0.06, 0.06), (0, 1.1, 3.3), M_STEEL),
             cyl("spike", 0.02, 0.5, (0, 1.1, 3.85), M_STEEL, n=4)]
    for x, z in ((-0.6, 2.75), (0.6, 2.75), (-0.42, 3.15), (0.42, 3.15)):
        parts.append(cyl("insulator", 0.03, 0.25, (x, 1.1, z), M_WHITE, n=6))
    pylon = bake(join(parts, "hv_pylon"))
    adopt(pylon, o, "hv_pylon")
    return o

def build_pwr_smr():
    parts = [cyl("base", 1.1, 1.5, (0, 0, 0.75), M_CONC, n=16),
             cyl("band", 1.12, 0.12, (0, 0, 0.3), M_YELLOW, n=16, caps=False),
             dome("dome", 1.1, (0, 0, 1.5), M_WHITE),
             box("turbine_hall", (1.4, 1.0, 0.9), (0, 1.3, 0.45), M_CONC),
             cyl("stack", 0.08, 2.6, (0.9, 1.5, 1.3), M_STEEL, n=8),
             box("door", (0.4, 0.04, 0.8), (0, -1.1, 0.4), M_PLASTIC),
             cyl("pipe", 0.06, 0.9, (0.4, 0.95, 1.2), M_COOL, n=8, rot=(PI / 2, 0, 0))]
    return bake(join(parts, "pwr_smr"))

def build_cool_box_fan():
    parts = [box("foot", (0.12, 0.3, 0.06), (sx * 0.2, 0, 0.03), M_PLASTIC) for sx in (-1, 1)]
    parts.append(box("bar", (0.56, 0.1, 0.05), (0, 0, 0.085), M_PLASTIC))
    parts.append(box("bar", (0.56, 0.1, 0.05), (0, 0, 0.615), M_PLASTIC))
    for sx in (-1, 1):
        parts.append(box("bar", (0.05, 0.1, 0.48), (sx * 0.255, 0, 0.35), M_PLASTIC))
    parts.append(box("grille", (0.46, 0.01, 0.48), (0, 0.045, 0.35), M_STEEL))
    parts.append(box("switch", (0.08, 0.02, 0.03), (0.18, -0.06, 0.085), M_STEEL))
    o = bake(join(parts, "cool_box_fan"))
    fan(o, "fan_0", 0.22, 5, 0.05, 0.04, 0.07, (0, -0.01, 0.35), rot=(PI / 2, 0, 0))
    return o

def build_cool_window_ac():
    parts = [box("crate", (0.4, 0.4, 0.3), (0, 0, 0.15), M_RED),
             box("body", (0.6, 0.55, 0.38), (0, 0, 0.49), M_WHITE),
             box("grille", (0.56, 0.012, 0.2), (0, -0.28, 0.42), M_STEEL),
             box("panel", (0.14, 0.01, 0.1), (0.2, -0.28, 0.6), M_PLASTIC),
             box("led", (0.015, 0.006, 0.015), (0.24, -0.286, 0.6), M_LED),
             box("drip", (0.02, 0.02, 0.02), (0.1, -0.3, 0.26), M_COOL),
             quad("puddle", 0.3, 0.22, (0.1, -0.42, 0.003), M_COOL)]
    for i in range(4):
        parts.append(box("slat", (0.5, 0.012, 0.012), (0, -0.29, 0.34 + i * 0.05), M_WHITE))
    return bake(join(parts, "cool_window_ac"))

def build_cool_split_ac():
    """Wall split: a dark indoor head (0.9 x 0.26 x 0.3 m at 1.6-1.9 m, outlet slats and status LED on its front) carried on
    two slim struts over a floor condenser (0.8 x 0.3 x 0.6 m) with a round fan grille; the coolant lines drop from the
    head into the condenser's valve cover. Both bodies are MAT_steel_dark: the old 1.8 m white tower stood behind the
    Colo's back row and read as a row of extra racks (DESIGN.md §12 wants 'dark outlines', not white cabinets)."""
    parts = [box("condenser", (0.8, 0.3, 0.6), (0, 0, 0.3), M_STEEL),
             cyl("grille", 0.22, 0.012, (-0.13, -0.156, 0.32), M_PLASTIC, n=16, rot=(PI / 2, 0, 0)),
             cyl("hub", 0.06, 0.016, (-0.13, -0.16, 0.32), M_STEEL, n=8, rot=(PI / 2, 0, 0)),
             box("bar", (0.44, 0.008, 0.016), (-0.13, -0.164, 0.32), M_STEEL),
             box("bar", (0.016, 0.008, 0.44), (-0.13, -0.164, 0.32), M_STEEL),
             box("valves", (0.18, 0.012, 0.14), (0.26, -0.156, 0.2), M_PLASTIC),
             box("head", (0.9, 0.26, 0.3), (0, 0.02, 1.75), M_STEEL),
             box("lip", (0.9, 0.012, 0.03), (0, -0.116, 1.885), M_PLASTIC),
             box("display", (0.08, 0.006, 0.015), (0.36, -0.113, 1.655), M_LED),
             cyl("line", 0.018, 1.0, (0.21, -0.02, 1.1), M_COOL, n=8),
             cyl("line2", 0.012, 1.0, (0.26, -0.02, 1.1), M_COOL, n=8)]
    for sx in (-1, 1):
        parts.append(box("strut", (0.04, 0.04, 1.0), (sx * 0.3, 0.12, 1.1), M_STEEL))
    for i in range(3):
        parts.append(box("slat", (0.8, 0.012, 0.014), (-0.04, -0.116, 1.64 + i * 0.03), M_PLASTIC))
    return bake(join(parts, "cool_split_ac"))

def build_cool_crac():
    """0.8 x 0.9 x 1.8 m white cabinet with a louvred front and an open fan shroud on top (fan_0 child spins in it).
    cool_chiller / cool_cryo reuse this datablock at 2.0 / 3.0."""
    parts = [box("plinth", (0.8, 0.9, 0.1), (0, 0, 0.05), M_STEEL),
             box("body", (0.8, 0.9, 1.6), (0, 0, 0.9), M_WHITE),
             box("display", (0.5, 0.012, 0.08), (0, -0.454, 1.45), M_STEEL),
             box("led", (0.12, 0.006, 0.02), (-0.1, -0.462, 1.45), M_LED),
             cyl("shroud", 0.3, 0.1, (0, 0, 1.75), M_STEEL, n=12, caps=False),
             box("guard", (0.6, 0.02, 0.01), (0, 0, 1.8), M_STEEL),
             box("guard", (0.02, 0.6, 0.01), (0, 0, 1.8), M_STEEL)]
    for i in range(8):
        parts.append(box("slat", (0.66, 0.012, 0.014), (0, -0.454, 0.35 + i * 0.1), M_STEEL))
    o = bake(join(parts, "cool_crac"))
    fan(o, "fan_0", 0.26, 5, 0.06, 0.05, 0.09, (0, 0, 1.74))
    return o

def build_cool_chiller(crac):
    o = variant("cool_chiller", crac, 2.0)
    parts = [cyl("grille", 0.28, 0.01, (0, 0, 1.74), M_STEEL, n=12)]
    for sx in (-1, 1):
        parts.append(cyl("pipe", 0.04, 0.8, (sx * 0.44, 0, 0.5), M_COOL, n=8, rot=(PI / 2, 0, 0)))
        parts.append(cyl("riser", 0.04, 0.5, (sx * 0.44, 0.4, 0.75), M_COOL, n=8))
    adopt(bake(join(parts, "chiller_detail")), o, "chiller_detail")
    return o

def build_cool_cryo(crac):
    o = variant("cool_cryo", crac, 3.0, extras={"tint": "MAT_coolant"})
    parts = [cyl("grille", 0.28, 0.01, (0, 0, 1.74), M_STEEL, n=12),
             box("manifold", (0.76, 0.07, 0.07), (0, -0.42, 1.6), M_COOL),
             box("frost", (0.82, 0.92, 0.12), (0, 0, 0.16), M_COOL)]
    for sx in (-1, 1):
        parts.append(cyl("pipe", 0.035, 1.5, (sx * 0.36, -0.42, 0.85), M_COOL, n=8))
    adopt(bake(join(parts, "cryo_detail")), o, "cryo_detail")
    return o

def build_cool_tower():
    parts = [cyl("band", 1.45, 0.6, (0, 0, 0.3), M_STEEL, n=16),
             cyl("shell", 1.4, 2.6, (0, 0, 1.9), M_CONC, n=16, r2=1.0),
             cyl("shroud", 0.95, 0.2, (0, 0, 3.3), M_STEEL, n=16, caps=False)]
    for i in range(8):
        a = 2 * PI * i / 8
        parts.append(box("louvre", (0.2, 0.05, 0.5), (1.5 * math.cos(a), 1.5 * math.sin(a), 0.3), M_PLASTIC, rot=(0, 0, a)))
    o = bake(join(parts, "cool_tower"))
    fan(o, "fan_0", 0.85, 4, 0.12, 0.08, 0.2, (0, 0, 3.3))
    return o

def build_cool_immersion():
    parts = [box("tank", (1.3, 0.9, 1.0), (0, 0, 0.5), M_STEEL),
             box("oil", (1.22, 0.82, 0.04), (0, 0, 1.0), M_COOL),
             box("lid", (1.3, 0.9, 0.04), (0, 0.306, 1.426), M_WHITE, rot=(-1.2, 0, 0)),
             box("pump", (0.26, 0.26, 0.45), (0.78, 0.25, 0.225), M_STEEL),
             cyl("pipe", 0.04, 0.55, (0.78, 0.25, 0.72), M_COOL, n=8),
             cyl("pipe2", 0.04, 0.3, (0.6, 0.25, 0.98), M_COOL, n=8, rot=(0, PI / 2, 0))]
    for i in range(4):
        parts.append(box("server", (0.22, 0.7, 0.02), (-0.45 + i * 0.3, 0, 1.03), M_PLASTIC))
    return bake(join(parts, "cool_immersion"))

def build_net_switch():
    parts = [box("body", (0.44, 0.3, 0.045), (0, 0, 0.0225), M_PLASTIC),
             box("ports", (0.3, 0.006, 0.02), (-0.02, -0.153, 0.022), M_STEEL),
             box("led", (0.012, 0.006, 0.012), (0.18, -0.153, 0.028), M_LED),
             box("led", (0.012, 0.006, 0.012), (0.2, -0.153, 0.028), M_LED)]
    return bake(join(parts, "net_switch"))

def build_net_biz_fiber():
    parts = [box("plate", (0.3, 0.2, 0.02), (0, 0, 0.01), M_STEEL),
             box("strut", (0.04, 0.04, 1.3), (0, 0.02, 0.65), M_STEEL),
             box("ont", (0.36, 0.12, 0.45), (0, -0.04, 1.1), M_WHITE),
             box("led", (0.015, 0.006, 0.015), (0.1, -0.103, 1.28), M_LED),
             cyl("coil", 0.12, 0.03, (0, -0.06, 0.55), M_YELLOW, n=12, rot=(PI / 2, 0, 0)),
             cyl("coil_in", 0.07, 0.01, (0, -0.08, 0.55), M_STEEL, n=12, rot=(PI / 2, 0, 0)),
             cyl("conduit", 0.02, 0.9, (0.12, 0.0, 1.78), M_STEEL, n=8)]
    return bake(join(parts, "net_biz_fiber"))

def build_net_fiber_uplink():
    """0.4 x 0.7 x 1.45 m telecom cabinet; net_core_router / net_ix_port / net_cable_landing reuse it at 1.5/2.0/2.5."""
    parts = [box("plinth", (0.4, 0.7, 0.05), (0, 0, 0.025), M_PLASTIC),
             box("body", (0.4, 0.7, 1.15), (0, 0, 0.625), M_STEEL),
             box("door", (0.34, 0.012, 1.0), (0, -0.352, 0.65), M_PLASTIC),
             box("led", (0.02, 0.006, 0.06), (0.14, -0.361, 1.05), M_LED),  # small: at rest intensity it must not bloom into a blob
             box("label", (0.2, 0.006, 0.06), (-0.05, -0.361, 0.3), M_WHITE)]
    for x in (-0.12, 0.0, 0.12):
        parts.append(cyl("duct", 0.03, 0.25, (x, 0.15, 1.325), M_YELLOW, n=8))
    return bake(join(parts, "net_fiber_uplink"))

def build_net_tray_segment():
    parts = [box("bottom", (1.0, 0.3, 0.015), (0, 0, 0.0075), M_STEEL)]
    for sy in (-1, 1):
        parts.append(box("rail", (1.0, 0.015, 0.1), (0, sy * 0.1425, 0.05), M_STEEL))
    parts.append(quad("strip", 1.0, 0.16, (0, 0, 0.03), M_LED))  # UV u = 0..1 along the length (X)
    return bake(join(parts, "net_tray_segment"))

def build_floor_tile_solid():
    return bake(box("floor_tile_solid", (1.0, 1.0, 0.03), (0, 0, 0.015), M_CONC))

def build_floor_tile_perf():
    parts = [box("tile", (1.0, 1.0, 0.03), (0, 0, 0.015), M_TILE_BLUE)]
    for i in range(5):
        parts.append(box("slot", (0.8, 0.07, 0.006), (0, -0.32 + i * 0.16, 0.031), M_STEEL))
    return bake(join(parts, "floor_tile_perf"))

def build_wall_segment_plain():
    return bake(box("wall_segment_plain", (2.0, 0.2, 3.0), (0, 0, 1.5), M_CONC))

def build_wall_segment_door():
    parts = [box("left", (0.4, 0.2, 3.0), (-0.8, 0, 1.5), M_CONC),
             box("right", (0.4, 0.2, 3.0), (0.8, 0, 1.5), M_CONC),
             box("header", (1.2, 0.2, 0.6), (0, 0, 2.7), M_CONC),
             box("jamb", (0.06, 0.22, 2.4), (-0.63, 0, 1.2), M_STEEL),
             box("jamb", (0.06, 0.22, 2.4), (0.63, 0, 1.2), M_STEEL)]
    return bake(join(parts, "wall_segment_door"))

def build_wall_segment_glass():
    parts = [box("sill", (2.0, 0.2, 0.5), (0, 0, 0.25), M_CONC),
             box("head", (2.0, 0.2, 0.2), (0, 0, 2.9), M_CONC),
             quad("pane", 1.9, 2.2, (0, 0, 1.65), M_GLASS, rot=(PI / 2, 0, 0))]
    for x in (-0.96, 0.0, 0.96):
        parts.append(box("mullion", (0.08, 0.1, 2.2), (x, 0, 1.65), M_STEEL))
    return bake(join(parts, "wall_segment_glass"))

def build_containment_panel():
    parts = [box("post", (0.05, 0.05, 2.0), (sx * 0.575, 0, 1.0), M_STEEL) for sx in (-1, 1)]
    parts.append(box("bar", (1.1, 0.05, 0.05), (0, 0, 1.975), M_STEEL))
    parts.append(box("bar", (1.1, 0.05, 0.05), (0, 0, 0.025), M_STEEL))
    parts.append(quad("pane", 1.1, 1.9, (0, 0, 1.0), M_GLASS, rot=(PI / 2, 0, 0)))
    return bake(join(parts, "containment_panel"))

def window_strips(parts, blocks):
    """blocks: (w, d, h, x, y) boxes; adds a MAT_led strip on each block's front (-Y) face at 60% height.
    Strips are tall (>= 0.6 m): the silhouettes stand 11-21 m behind the yard at scale 0.15-0.31, so anything thinner
    is a 1-3 px line that only reads through its bloom halo."""
    for (w, d, h, x, y) in blocks:
        parts.append(quad("strip", w * 0.85, max(0.6, h * 0.12), (x, y - d / 2 - 0.01, h * 0.6), M_LED, rot=(PI / 2, 0, 0)))

def build_skyline_campus():
    blocks = [(14, 8, 5, -7, 0), (10, 8, 4, 8, 0), (4, 4, 10, 1, 1), (8, 6, 2.5, -2, -6)]
    parts = [box("block", (w, d, h), (x, y, h / 2), M_STEEL) for (w, d, h, x, y) in blocks]
    window_strips(parts, blocks)
    for z in (5.5, 8.0):
        parts.append(quad("strip", 3.2, 0.6, (1, -1.01, z), M_LED, rot=(PI / 2, 0, 0)))
    parts.append(quad("strip", 6, 0.6, (-14.01, 0, 3.2), M_LED, rot=(PI / 2, 0, -PI / 2)))
    parts.append(quad("strip", 6, 0.6, (13.01, 0, 2.6), M_LED, rot=(PI / 2, 0, PI / 2)))
    parts.append(box("beacon", (0.3, 0.3, 0.3), (1, 1, 10.2), M_LED))
    return bake(join(parts, "skyline_campus"), recenter=True)

def build_hall_shell_silhouette():
    parts = [box("body", (40, 22, 8), (0, 0, 4), M_STEEL),
             box("plant", (6, 4, 2), (-8, 2, 9), M_STEEL),
             cyl("stack", 0.4, 3, (10, 4, 9.5), M_STEEL, n=8),
             cyl("stack", 0.4, 3, (13, 4, 9.5), M_STEEL, n=8),
             quad("strip", 36, 0.35, (0, -11.01, 5), M_LED, rot=(PI / 2, 0, 0)),
             quad("strip", 18, 0.35, (-20.01, 0, 5), M_LED, rot=(PI / 2, 0, -PI / 2)),
             quad("strip", 18, 0.35, (20.01, 0, 5), M_LED, rot=(PI / 2, 0, PI / 2))]
    return bake(join(parts, "hall_shell_silhouette"), recenter=True)

def build_library():
    rack = build_rack_frame()
    pizza = build_srv_pizza_box()
    blade = variant("srv_blade", pizza, 1.0); leds(blade, 0.13)
    gpu = build_srv_gpu_node()
    storage = build_srv_storage()
    pod = build_srv_ai_pod()
    sled = variant("srv_sled", pod, 1.0); leds(sled, 0.14, x0=-0.215, x1=-0.185, y=-0.45)
    quantum = build_srv_quantum()
    orbital = build_srv_orbital()
    pdu = build_pwr_pdu(); subpanel = build_pwr_subpanel(); genset = build_pwr_genset()
    substation = build_pwr_substation(); hv = build_pwr_hv_feed(substation); smr = build_pwr_smr()
    box_fan = build_cool_box_fan(); window_ac = build_cool_window_ac(); split_ac = build_cool_split_ac()
    crac = build_cool_crac(); chiller = build_cool_chiller(crac); cryo = build_cool_cryo(crac)
    tower = build_cool_tower(); immersion = build_cool_immersion()
    switch = build_net_switch(); biz = build_net_biz_fiber(); uplink = build_net_fiber_uplink()
    core = variant("net_core_router", uplink, 1.5); ix = variant("net_ix_port", uplink, 2.0); landing = variant("net_cable_landing", uplink, 2.5)
    tray = build_net_tray_segment()
    tiles = [build_floor_tile_solid(), build_floor_tile_perf()]
    walls = [build_wall_segment_plain(), build_wall_segment_door(), build_wall_segment_glass()]
    containment = build_containment_panel()
    skyline = build_skyline_campus(); hall_sil = build_hall_shell_silhouette()
    return [rack, pizza, blade, gpu, storage, pod, sled, quantum, orbital,
            pdu, subpanel, genset, substation, hv, smr,
            box_fan, window_ac, split_ac, crac, chiller, cryo, tower, immersion,
            switch, biz, uplink, core, ix, landing, tray, *tiles, *walls, containment, skyline, hall_sil]

# ======================================================================================================
# STAGE SHELLS  (Blender y = -three.js z: the BACK wall is at y = +d/2, the camera looks from -y)
# ======================================================================================================
STAGE_GEO = {  # w, d from data.js STAGES[n].size; yard = -STAGES[n].geo.yardZ; key = key light position (Blender)
    1: dict(w=7, d=6, h=3.0, rows=1, cols=4, yard=4.2, door=(4.6, 2.4), key=(0, -1.0, 2.4)),
    2: dict(w=10, d=9, h=3.5, rows=2, cols=6, yard=6.0, door=(3.0, 2.6), key=(0, 0, 3.3)),
    3: dict(w=18, d=13, h=7.0, rows=3, cols=12, yard=8.5, door=(5.0, 4.5), key=(0, 0, 6.3)),
    4: dict(w=26, d=16, h=6.0, rows=4, cols=24, yard=10.5, door=(2.4, 2.6), key=(0, 0, 4.5)),
    5: dict(w=40, d=22, h=8.0, rows=6, cols=40, yard=14.0, door=(2.4, 2.6), key=(0, 22, 14)),
}

def aisle_ys(rows, kind):
    """Blender y of each aisle of the given kind ('hot'/'cold') for the row layout in data.js (row 0 nearest the camera
    faces it; facing alternates). Odd row counts add the hot strip behind the last, camera-facing row."""
    ys = []
    for r in range(rows - 1):
        if (r % 2 == 0) == (kind == "hot"):
            ys.append((r + 0.5 - (rows - 1) / 2) * 2.4)
    if kind == "hot" and rows % 2 == 1:
        ys.append((rows - 1) / 2 * 2.4 + 1.2)
    return ys

def floor_and_tiles(n, g, cold_tiles=False):
    w, d = g["w"], g["d"]
    L = g["cols"] * 0.8 + 0.4
    parts = [box("floor", (w, d, 0.06), (0, 0, -0.03), M_CONC)]
    ydepth = 2 * (g["yard"] - d / 2) + 3
    parts.append(box("yard_ground", (max(w, g["yard"] * 4) + 4, ydepth, 0.06), (0, d / 2 + 0.2 + ydepth / 2, -0.03), M_STEEL))
    if cold_tiles:
        for y in aisle_ys(g["rows"], "cold"):
            parts.append(box("cold", (L, 1.2, 0.012), (0, y, 0.006), M_TILE_BLUE))
            for i in range(int(L // 1.6)):
                parts.append(box("slot", (0.5, 0.08, 0.006), (-L / 2 + 0.8 + i * 1.6, y, 0.015), M_STEEL))
    floor = bake(join(parts, "floor"))
    hot = [box("hot", (L, 1.2, 0.012), (0, y, 0.006), M_TILE_HOT) for y in aisle_ys(g["rows"], "hot")]
    return floor, bake(join(hot, "hot_tiles"))

def side_walls(w, d, h, parts, clerestory=None):
    for sx in (-1, 1):
        if clerestory:
            z0, z1 = clerestory
            parts.append(box("side", (0.2, d + 0.4, z0), (sx * (w / 2 + 0.1), 0, z0 / 2), M_CONC))
            parts.append(box("side", (0.2, d + 0.4, h - z1), (sx * (w / 2 + 0.1), 0, (h + z1) / 2), M_CONC))
        else:
            parts.append(box("side", (0.2, d + 0.4, h), (sx * (w / 2 + 0.1), 0, h / 2), M_CONC))

def back_wall_with_door(w, d, h, door, parts, wall_w=None, strip=None):
    """Concrete back wall at y = d/2 + 0.1 with a centred opening (dw, dh). strip=(z0, z1) cuts a window band."""
    dw, dh = door
    W = wall_w or w
    y = d / 2 + 0.1
    for sx in (-1, 1):
        pw = (W - dw) / 2
        x = sx * (dw / 2 + pw / 2)
        if strip:
            z0, z1 = strip
            parts.append(box("back", (pw, 0.2, z0), (x, y, z0 / 2), M_CONC))
            parts.append(box("back", (pw, 0.2, h - z1), (x, y, (h + z1) / 2), M_CONC))
        else:
            parts.append(box("back", (pw, 0.2, h), (x, y, h / 2), M_CONC))
    parts.append(box("header", (dw, 0.2, h - dh), (0, y, dh + (h - dh) / 2), M_CONC))

def glass_back_wall(w, d, h, door, walls, glass, pitch):
    """Mullion grid + glass panes with a centred door opening; frame parts go to `walls`, panes to `glass`."""
    dw, dh = door
    y = d / 2 + 0.1
    walls.append(box("sill", (w + 0.4, 0.2, 0.5), (0, y, 0.25), M_CONC))
    walls.append(box("head", (w + 0.4, 0.2, 0.4), (0, y, h - 0.2), M_STEEL))
    x = -w / 2
    while x <= w / 2 + 1e-6:
        if abs(x) > dw / 2 + 0.2:
            walls.append(box("mullion", (0.15, 0.2, h - 0.9), (x, y, 0.5 + (h - 0.9) / 2), M_STEEL))
        x += pitch
    for sx in (-1, 1):
        walls.append(box("jamb", (0.15, 0.2, dh), (sx * dw / 2, y, dh / 2), M_STEEL))
    walls.append(box("lintel", (dw, 0.2, 0.15), (0, y, dh + 0.075), M_STEEL))
    pane_h = h - 0.9
    for sx in (-1, 1):
        pw = w / 2 - dw / 2
        glass.append(quad("pane", pw, pane_h, (sx * (dw / 2 + pw / 2), y, 0.5 + pane_h / 2), M_GLASS, rot=(PI / 2, 0, 0)))
    th = h - 0.4 - dh - 0.15
    glass.append(quad("transom", dw, th, (0, y, dh + 0.15 + th / 2), M_GLASS, rot=(PI / 2, 0, 0)))

def fence_line(parts, x0, x1, y, h=1.8, pitch=2.0, chain=True):
    n = max(2, int(round((x1 - x0) / pitch)) + 1)
    xs = [x0 + (x1 - x0) * i / (n - 1) for i in range(n)]
    for x in xs:
        parts.append(box("post", (0.06, 0.06, h), (x, y, h / 2), M_STEEL))
    for z in (0.3, h - 0.05):
        parts.append(box("rail", (x1 - x0, 0.04, 0.04), ((x0 + x1) / 2, y, z), M_STEEL))
    if chain:
        parts.append(quad("fence", x1 - x0, h - 0.3, ((x0 + x1) / 2, y, 0.3 + (h - 0.3) / 2), M_CHAIN, rot=(PI / 2, 0, 0)))

def light_pole(parts, x, y, h=6.0):
    parts.append(cyl("pole", 0.06, h, (x, y, h / 2), M_STEEL, n=6))
    parts.append(box("head", (0.6, 0.3, 0.15), (x, y - 0.25, h), M_STEEL))
    parts.append(quad("lamp", 0.45, 0.2, (x, y - 0.25, h - 0.08), M_GLOW, rot=(PI, 0, 0)))

def containment_doors(parts, x_end, y):
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("post", (0.05, 0.05, 2.0), (sx * x_end, y + sy * 0.575, 1.0), M_STEEL))
        parts.append(box("bar", (0.05, 1.2, 0.05), (sx * x_end, y, 1.975), M_STEEL))

def containment_glass(glass, x_end, y):
    for sx in (-1, 1):
        glass.append(quad("door", 1.1, 1.9, (sx * x_end, y, 1.0), M_GLASS, rot=(PI / 2, 0, PI / 2)))
    glass.append(quad("roof", 2 * x_end, 1.2, (0, y, 2.0), M_GLASS))

def stage_empties(stage_objs, g):
    """key_light, door (centre of the opening, local +Z toward the yard), yard, cam_target as top-level empties."""
    def top_empty(name, loc, rot=(0, 0, 0)):
        e = link(bpy.data.objects.new(name, None))
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 0.25
        e.location = loc
        e.rotation_euler = rot
        stage_objs.append(e)
        return e
    top_empty("key_light", g["key"])
    top_empty("door", (0, g["d"] / 2 + 0.1, g["door"][1] / 2), rot=(0, 0, PI))
    top_empty("yard", (0, g["yard"], 0))
    top_empty("cam_target", (0, 0, 1.0))

# ---------- stage 1: garage ----------
def build_prop_civic():
    parts = [box("body", (1.7, 4.1, 0.55), (0, 0, 0.5), M_RED),
             box("cabin", (1.55, 2.2, 0.55), (0, 0.25, 1.05), M_RED),
             box("hood", (1.6, 1.0, 0.22), (0, -1.5, 0.88), M_RED),
             box("bumper", (1.72, 0.1, 0.15), (0, -2.08, 0.5), M_PLASTIC),
             box("bumper", (1.72, 0.1, 0.15), (0, 2.08, 0.5), M_PLASTIC),
             quad("windshield", 1.4, 0.45, (0, -0.851, 1.1), M_GLASS, rot=(PI / 2, 0, 0)),
             quad("rear", 1.4, 0.45, (0, 1.351, 1.1), M_GLASS, rot=(-PI / 2, 0, 0)),
             quad("side", 1.8, 0.4, (0.776, 0.25, 1.1), M_GLASS, rot=(PI / 2, 0, PI / 2)),
             quad("side", 1.8, 0.4, (-0.776, 0.25, 1.1), M_GLASS, rot=(PI / 2, 0, -PI / 2))]
    for sx in (-1, 1):
        parts.append(box("headlight", (0.3, 0.02, 0.12), (sx * 0.55, -2.06, 0.7), M_LED))
        parts.append(box("taillight", (0.3, 0.02, 0.1), (sx * 0.55, 2.06, 0.7), M_RED))
        parts.append(box("mirror", (0.12, 0.08, 0.08), (sx * 0.9, -0.75, 1.0), M_PLASTIC))
        for sy in (-1, 1):
            parts.append(cyl("wheel", 0.31, 0.2, (sx * 0.8, sy * 1.3, 0.31), M_RUBBER, n=10, rot=(0, PI / 2, 0)))
            parts.append(cyl("hub", 0.15, 0.21, (sx * 0.8, sy * 1.3, 0.31), M_PLASTIC, n=8, rot=(0, PI / 2, 0)))
    return bake(join(parts, "prop_civic"), recenter=True)

def build_bike(parts, x, y0, M_frame=M_RED):
    """A bicycle leaning on the left wall, in the YZ plane at x; rear axle at y0, front axle at y0 + 0.95."""
    ra, fa = (y0, 0.33), (y0 + 0.95, 0.33)
    bb = (y0 + 0.2, 0.35); head = (y0 + 0.75, 0.85); seat = (y0 + 0.2, 0.9)
    for (y, z) in (ra, fa):
        parts.append(cyl("wheel", 0.33, 0.04, (x, y, z), M_RUBBER, n=12, rot=(0, PI / 2, 0)))
    def tube(a, b, t=0.03):
        dy, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dy, dz)
        parts.append(box("tube", (t, L, t), (x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), M_frame, rot=(math.atan2(dz, dy), 0, 0)))
    tube(bb, head); tube(seat, head); tube(bb, seat); tube(seat, ra); tube(bb, ra); tube(head, fa)
    parts.append(box("bars", (0.4, 0.03, 0.03), (x, head[0], head[1] + 0.1), M_STEEL))
    parts.append(box("saddle", (0.08, 0.22, 0.05), (x, seat[0], seat[1] + 0.03), M_RUBBER))
    parts.append(cyl("crank", 0.08, 0.02, (x + 0.04, bb[0], bb[1]), M_STEEL, n=8, rot=(0, PI / 2, 0)))

def build_stage_1():
    g = STAGE_GEO[1]; w, d, h = g["w"], g["d"], g["h"]
    objs = []
    floor, hot = floor_and_tiles(1, g); objs += [floor, hot]
    walls = []
    side_walls(w, d, h, walls)
    back_wall_with_door(w, d, h, g["door"], walls)
    objs.append(bake(join(walls, "walls")))
    p = []
    # garage door hardware: roll-up drum and tracks
    p.append(cyl("drum", 0.18, 4.8, (0, d / 2 - 0.25, 2.6), M_STEEL, n=10, rot=(0, PI / 2, 0)))
    for sx in (-1, 1):
        p.append(box("track", (0.05, 0.05, 2.4), (sx * 2.35, d / 2 - 0.25, 1.2), M_STEEL))
    # bulb on a cord (the key light)
    p.append(cyl("cord", 0.006, 0.5, (0, -1.0, 2.75), M_RUBBER, n=6))
    p.append(cyl("socket", 0.02, 0.05, (0, -1.0, 2.5), M_STEEL, n=8))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.055, location=(0, -1.0, 2.44))
    p.append(_finish_prim(bpy.context.active_object, "bulb", M_LED))
    # pegboard with tools on the left wall
    p.append(box("pegboard", (0.04, 2.0, 1.2), (-3.46, 0.0, 1.7), M_WOOD))
    p.append(box("hammer_handle", (0.03, 0.03, 0.28), (-3.42, -0.6, 1.75), M_WOOD))
    p.append(box("hammer_head", (0.03, 0.12, 0.05), (-3.42, -0.6, 1.92), M_STEEL))
    p.append(box("wrench", (0.03, 0.05, 0.32), (-3.42, -0.3, 1.75), M_STEEL))
    p.append(box("saw", (0.02, 0.5, 0.12), (-3.42, 0.3, 1.6), M_STEEL))
    p.append(box("saw_handle", (0.03, 0.1, 0.12), (-3.42, 0.62, 1.6), M_WOOD))
    p.append(cyl("cord_coil", 0.12, 0.03, (-3.42, 0.75, 2.1), M_YELLOW, n=12, rot=(0, PI / 2, 0)))
    # workbench (front-right, clear of the network lane) with the pizza box
    p.append(box("bench_top", (0.6, 0.8, 0.05), (3.2, -2.6, 0.875), M_WOOD))
    for sx, sy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        p.append(box("leg", (0.05, 0.05, 0.85), (3.2 + sx * 0.26, -2.6 + sy * 0.35, 0.425), M_STEEL))
    p.append(box("pizza_box", (0.4, 0.4, 0.05), (3.2, -2.5, 0.925), M_CARD))
    p.append(box("toolbox", (0.35, 0.18, 0.16), (3.15, -2.85, 0.98), M_RED))
    # bike leaning on the left wall at the front
    build_bike(p, -3.25, -2.6)
    # shelf unit in the back-left corner (clear of both lanes)
    for x in (-3.4, -2.5):
        p.append(box("upright", (0.04, 0.4, 1.8), (x, 2.75, 0.9), M_STEEL))
    for z in (0.3, 0.75, 1.2, 1.65):
        p.append(box("shelf", (0.94, 0.4, 0.03), (-2.95, 2.75, z), M_STEEL))
    p.append(box("carton", (0.35, 0.3, 0.3), (-3.15, 2.75, 0.465), M_CARD))
    p.append(box("carton", (0.3, 0.3, 0.25), (-2.75, 2.75, 0.89), M_CARD))
    p.append(box("carton", (0.4, 0.3, 0.3), (-2.95, 2.75, 1.365), M_CARD))
    p.append(cyl("paint", 0.08, 0.18, (-3.2, 2.75, 1.755), M_WHITE, n=8))
    # oil stain on the driveway, under the Civic
    p.append(quad("stain", 1.2, 0.8, (0.1, 5.6, 0.003), M_STEEL))
    objs.append(bake(join(p, "props_stage_1")))
    civic = build_prop_civic()
    civic.location = (0, 5.6, 0)
    objs.append(civic)
    stage_empties(objs, g)
    return objs

# ---------- stage 2: colo ----------
def build_stage_2():
    g = STAGE_GEO[2]; w, d, h = g["w"], g["d"], g["h"]
    objs = []
    floor, hot = floor_and_tiles(2, g); objs += [floor, hot]
    walls = []
    building_w = 18.0
    for sx in (-1, 1):
        walls.append(box("outer", (0.2, d + 0.4, h), (sx * (building_w / 2 + 0.1), 0, h / 2), M_CONC))
    back_wall_with_door(w, d, h, g["door"], walls, wall_w=building_w, strip=(2.8, 3.3))
    objs.append(bake(join(walls, "walls")))
    glass = []
    for sx in (-1, 1):
        pw = (building_w - g["door"][0]) / 2
        glass.append(quad("strip", pw, 0.5, (sx * (g["door"][0] / 2 + pw / 2), d / 2 + 0.1, 3.05), M_GLASS, rot=(PI / 2, 0, 0)))
    objs.append(bake(join(glass, "glass")))
    # the cage: chain-link side panels with posts and a top rail (MAT_chainlink gets its texture at runtime)
    cage = []
    for sx in (-1, 1):
        cage.append(quad("panel", d, 2.6, (sx * w / 2, 0, 1.3), M_CHAIN, rot=(PI / 2, 0, PI / 2)))
        for i in range(5):
            cage.append(box("post", (0.05, 0.05, 2.6), (sx * w / 2, -d / 2 + i * d / 4, 1.3), M_STEEL))
        cage.append(box("rail", (0.04, d, 0.04), (sx * w / 2, 0, 2.6), M_STEEL))
    objs.append(bake(join(cage, "cage")))
    p = []
    # side aprons and other tenants' dim white racks beyond the cage
    for sx in (-1, 1):
        p.append(box("apron", (4.0, d, 0.05), (sx * 7.0, 0, -0.03), M_STEEL))
        for y in (-3.0, -1.0, 1.0, 3.0):
            p.append(box("tenant_rack", (0.6, 1.2, 2.0), (sx * 6.6, y, 1.0), M_WHITE))
            p.append(box("tenant_front", (0.02, 0.5, 1.7), (sx * 6.29, y, 1.0), M_STEEL))
    # vending machine in the front-left corner: steel box (front face at y = -4.45), blue-white lit product window
    # (z 0.55-1.40) crossed by three dark shelf bars, red sign above it (z 1.45-1.70)
    p.append(box("vending", (0.9, 0.7, 1.9), (-4.45, -4.1, 0.95), M_STEEL))
    p.append(quad("vending_glow", 0.6, 0.85, (-4.45, -4.451, 0.975), M_GLOW_BLUE, rot=(PI / 2, 0, 0)))
    for z in (0.7625, 0.975, 1.1875):
        p.append(box("vending_shelf", (0.6, 0.04, 0.02), (-4.45, -4.472, z), M_STEEL))
    p.append(quad("vending_sign", 0.6, 0.25, (-4.45, -4.451, 1.575), M_GLOW_RED, rot=(PI / 2, 0, 0)))
    # fluorescent fixtures over the hot aisle (the key light)
    for x in (-2.5, 0.0, 2.5):
        p.append(box("fixture", (1.2, 0.2, 0.08), (x, 0, 3.34), M_STEEL))
        p.append(box("tube", (1.2, 0.12, 0.06), (x, 0, 3.28), M_GLOW))
    p.append(box("sign", (0.6, 0.02, 0.25), (-3.5, d / 2 - 0.01, 2.2), M_WHITE))
    p.append(cyl("drum", 0.15, 3.2, (0, d / 2 - 0.2, 2.75), M_STEEL, n=10, rot=(0, PI / 2, 0)))
    # yard: fence behind the genset row, one light pole
    fence_line(p, -8.0, 8.0, 8.6)
    light_pole(p, 7.5, 6.8, 5.0)
    objs.append(bake(join(p, "props_stage_2")))
    stage_empties(objs, g)
    return objs

# ---------- stage 3: warehouse ----------
def build_forklift(parts, x, y, rot):
    f = [box("body", (1.0, 1.4, 0.8), (0, 0.3, 0.7), M_YELLOW),
         box("counterweight", (1.0, 0.5, 0.5), (0, 1.05, 0.55), M_YELLOW),
         box("roof", (1.0, 1.3, 0.05), (0, 0.3, 2.42), M_YELLOW),
         box("seat", (0.5, 0.4, 0.4), (0, 0.5, 1.3), M_RUBBER)]
    for sx in (-1, 1):
        for yy in (-0.3, 0.9):
            f.append(box("post", (0.06, 0.06, 1.3), (sx * 0.45, yy, 1.75), M_YELLOW))
        f.append(box("mast", (0.08, 0.1, 2.3), (sx * 0.4, -0.45, 1.15), M_STEEL))
        f.append(box("fork", (0.12, 1.0, 0.04), (sx * 0.25, -1.1, 0.07), M_STEEL))
        for sy in (-1, 1):
            f.append(cyl("wheel", 0.3, 0.25, (sx * 0.55, sy * 0.5 + 0.2, 0.3), M_RUBBER, n=8, rot=(0, PI / 2, 0)))
    fl = bake(join(f, "forklift"), recenter=True)
    fl.location = (x, y, 0); fl.rotation_euler = (0, 0, rot)
    parts.append(fl)

def build_stage_3():
    g = STAGE_GEO[3]; w, d, h = g["w"], g["d"], g["h"]
    objs = []
    floor, hot = floor_and_tiles(3, g); objs += [floor, hot]
    walls = []
    side_walls(w, d, h, walls, clerestory=(5.2, 6.0))
    back_wall_with_door(w, d, h, g["door"], walls)
    objs.append(bake(join(walls, "walls")))
    glass = [quad("clerestory", d, 0.8, (sx * (w / 2 + 0.1), 0, 5.6), M_GLASS, rot=(PI / 2, 0, PI / 2)) for sx in (-1, 1)]
    objs.append(bake(join(glass, "glass")))
    p = []
    # roof trusses with diagonals, highbays hanging from them (the key light)
    for y in (-4.0, 0.0, 4.0):
        p.append(box("chord", (w - 0.4, 0.12, 0.12), (0, y, 6.0), M_STEEL))
        p.append(box("chord", (w - 0.4, 0.12, 0.12), (0, y, 6.8), M_STEEL))
        for i in range(8):
            p.append(box("diag", (1.3, 0.08, 0.08), (-7 + i * 2, y, 6.4), M_STEEL, rot=(0, 0.55 * (1 if i % 2 else -1), 0)))
    for x in (-6.0, 0.0, 6.0):
        for y in (-3.0, 3.0):
            p.append(cyl("highbay", 0.3, 0.35, (x, y, 6.5), M_STEEL, n=8))
            p.append(cyl("lamp", 0.22, 0.02, (x, y, 6.31), M_GLOW, n=8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box("column", (0.3, 0.3, h), (sx * 8.7, sy * 3.5, h / 2), M_STEEL))
    # cable spaghetti along the back wall
    for i in range(6):
        p.append(box("cable", (3.0, 0.08, 0.08), (-6 + i * 2.4, d / 2 - 0.4, 5.3 + 0.1 * (i % 3)), M_RUBBER if i % 2 else M_YELLOW,
                     rot=(0.2 * (i % 2), 0, 0.25 * ((i % 3) - 1))))
    for i in range(3):
        p.append(box("drop", (0.06, 0.06, 2.2), (-5 + i * 5, d / 2 - 0.4, 4.3), M_RUBBER))
    # loading door drum, bollards, forklift and pallets
    p.append(cyl("drum", 0.25, g["door"][0] + 0.4, (0, d / 2 - 0.3, g["door"][1] + 0.3), M_STEEL, n=10, rot=(0, PI / 2, 0)))
    for x in (-3.0, 3.0):
        p.append(cyl("bollard", 0.08, 0.9, (x, d / 2 + 0.7, 0.45), M_YELLOW, n=6))
    build_forklift(p, 6.3, -5.9, -PI / 2)
    for i in range(3):
        p.append(box("pallet", (1.2, 1.0, 0.14), (-6.5, -5.9, 0.07 + i * 0.14), M_WOOD))
    p.append(box("crate", (0.8, 0.8, 0.8), (-6.5, -5.9, 0.82), M_CARD))
    # yard: the gensets stand behind a fence
    fence_line(p, -12.0, -2.5, 7.4)
    fence_line(p, 2.5, 12.0, 7.4)
    light_pole(p, 11.0, 9.5, 6.0); light_pole(p, -11.0, 9.5, 6.0)
    objs.append(bake(join(p, "props_stage_3")))
    stage_empties(objs, g)
    return objs

# ---------- stage 4: hall ----------
def build_stage_4():
    g = STAGE_GEO[4]; w, d, h = g["w"], g["d"], g["h"]
    objs = []
    floor, hot = floor_and_tiles(4, g, cold_tiles=True); objs += [floor, hot]
    walls, glass = [], []
    side_walls(w, d, h, walls)
    glass_back_wall(w, d, h, g["door"], walls, glass, pitch=2.0)
    for sx in (-1, 1):
        for y in (-5.0, 0.0, 5.0):
            walls.append(box("column", (0.4, 0.4, h), (sx * 12.85, y, h / 2), M_CONC))
    x_end = g["cols"] * 0.8 / 2 + 0.2
    containment_doors(walls, x_end, 0.0)
    for y in aisle_ys(g["rows"], "cold"):
        containment_glass(glass, x_end, y)
        for sy in (-1, 1):
            walls.append(box("rail", (2 * x_end, 0.05, 0.05), (0, y + sy * 0.6, 2.0), M_STEEL))
    objs.append(bake(join(walls, "walls")))
    objs.append(bake(join(glass, "glass")))
    p = []
    # aisle strip lights (the key light): 0.25 x 0.08 m bars so they read as 6-10 px light bars at 25-39 px/m, not 1 px wires;
    # blue (data.js keyColor 0x3b7bff) via MAT_glow_blue, whose base colour is the tint for the scene's body-class fallback
    for y in (-2.4, 0.0, 2.4):
        p.append(box("strip", (19.0, 0.25, 0.08), (0, y, 4.5), M_GLOW_BLUE))
        for x in (-8.0, 0.0, 8.0):
            p.append(box("hanger", (0.02, 0.02, 1.5), (x, y, 5.25), M_STEEL))
    # yard: perimeter fence, light poles, bollards at the door
    fence_line(p, -22.0, 22.0, 15.5, pitch=2.5, chain=False)
    light_pole(p, 18.0, 13.0, 7.0); light_pole(p, -18.0, 13.0, 7.0)
    for x in (-2.0, 2.0):
        p.append(cyl("bollard", 0.08, 0.9, (x, d / 2 + 0.8, 0.45), M_YELLOW, n=6))
    objs.append(bake(join(p, "props_stage_4")))
    stage_empties(objs, g)
    return objs

# ---------- stage 5: campus ----------
def build_prop_garage_monument():
    parts = [box("body", (7, 6, 2.8), (0, 0, 1.4), M_CONC),
             prism("roof", 7.6, 6.6, 1.6, (0, 0, 2.8), M_STEEL),
             quad("door", 4.6, 2.4, (0, -3.01, 1.2), M_PLASTIC, rot=(PI / 2, 0, 0)),
             box("plaque", (0.6, 0.05, 0.4), (2.6, -3.03, 1.2), M_WHITE),
             box("uplight", (0.2, 0.2, 0.08), (0, -3.6, 0.04), M_LED)]
    return bake(join(parts, "prop_garage_monument"), recenter=True)

def build_prop_satellite():
    parts = [box("bus", (0.6, 0.6, 0.6), (0, 0, 0.3), M_STEEL),
             box("beacon", (0.25, 0.25, 0.25), (0, 0, 0.72), M_LED)]
    for sx in (-1, 1):
        parts.append(box("panel", (2.0, 0.05, 0.8), (sx * 1.4, 0, 0.3), M_TILE_BLUE))
    return bake(join(parts, "prop_satellite"), recenter=True)

def build_stage_5():
    g = STAGE_GEO[5]; w, d, h = g["w"], g["d"], g["h"]
    objs = []
    floor, hot = floor_and_tiles(5, g, cold_tiles=True); objs += [floor, hot]
    walls, glass = [], []
    side_walls(w, d, h, walls)
    glass_back_wall(w, d, h, g["door"], walls, glass, pitch=2.5)
    for sx in (-1, 1):
        for y in (-8.0, -2.7, 2.7, 8.0):
            walls.append(box("column", (0.5, 0.5, h), (sx * 19.9, y, h / 2), M_CONC))
    x_end = g["cols"] * 0.8 / 2 + 0.2
    for y in aisle_ys(g["rows"], "cold"):
        containment_doors(walls, x_end, y)
        containment_glass(glass, x_end, y)
        for sy in (-1, 1):
            walls.append(box("rail", (2 * x_end, 0.05, 0.05), (0, y + sy * 0.6, 2.0), M_STEEL))
    objs.append(bake(join(walls, "walls")))
    objs.append(bake(join(glass, "glass")))
    p = []
    for y in aisle_ys(g["rows"], "cold"):
        p.append(box("strip", (32.0, 0.25, 0.08), (0, y, 5.0), M_GLOW))
    # the lot: a big asphalt plane, a concrete pad for the yard units, light poles, parked cars
    p.append(box("lot", (120, 60, 0.05), (0, 41, -0.04), M_STEEL))
    p.append(box("pad", (44, 6, 0.06), (0, 14.2, -0.03), M_CONC))
    for x in (-24.0, -8.0, 8.0, 24.0):
        light_pole(p, x, 19.0, 7.0)
    for i in range(6):
        p.append(box("car", (1.8, 4.2, 0.6), (4 + i * 2.6, 22.0, 0.55), M_PLASTIC))
        p.append(box("car_top", (1.6, 2.2, 0.5), (4 + i * 2.6, 22.2, 1.1), M_PLASTIC))
    # the uplink dish on a pedestal, tilted toward the hall
    p.append(cyl("pedestal", 0.6, 2.5, (18, 26, 1.25), M_STEEL, n=10))
    p.append(cyl("dish", 0.3, 1.2, (18, 26, 3.1), M_WHITE, n=16, r2=3.0, rot=(0.6, 0, 0)))
    p.append(box("feed", (0.2, 0.2, 0.2), (18, 25.4, 4.1), M_STEEL))
    # two more hall shells on the horizon with lit window strips
    for (x, y) in ((-52, 42), (52, 46)):
        p.append(box("hall", (40, 22, 8), (x, y, 4), M_STEEL))
        p.append(quad("strip", 36, 0.35, (x, y - 11.01, 5), M_LED, rot=(PI / 2, 0, 0)))
        p.append(quad("strip", 18, 0.35, (x - 20.01 if x < 0 else x + 20.01, y, 5), M_LED, rot=(PI / 2, 0, -PI / 2 if x < 0 else PI / 2)))
    objs.append(bake(join(p, "props_stage_5")))
    mon = build_prop_garage_monument(); mon.location = (-26, 30, 0); mon.rotation_euler = (0, 0, 0.4); objs.append(mon)
    sat = build_prop_satellite(); sat.location = (10, 60, 12); objs.append(sat)
    stage_empties(objs, g)
    for i, x in enumerate((-16.0, -22.0, -28.0)):   # suggested cool_tower anchors
        e = link(bpy.data.objects.new(f"tower_{i}", None)); e.empty_display_type = "PLAIN_AXES"; e.location = (x, 24.0, 0); objs.append(e)
    return objs

# ======================================================================================================
# EXPORT, POST-PROCESS, CHECK
# ======================================================================================================
def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    jl, jt = struct.unpack_from("<II", data, 12)
    g = json.loads(data[20:20 + jl].decode("utf-8"))
    return g, data[20 + jl:]

def write_glb(path, g, rest):
    js = json.dumps(g, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(rest)

def strip_child_suffixes(path):
    g, rest = read_glb(path)
    for n in g.get("nodes", []):
        n["name"] = re.sub(r"__.*$", "", n.get("name", ""))
    for m in g.get("meshes", []):
        m["name"] = re.sub(r"__.*$", "", m.get("name", ""))
    write_glb(path, g, rest)

def export(path, objs):
    deselect_all()
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True,
                              export_materials="EXPORT", export_lights=False, export_cameras=False, export_extras=True,
                              export_animations=False, export_skins=False, export_morph=False, export_image_format="NONE")
    strip_child_suffixes(path)
    print("EXPORTED", path, os.path.getsize(path), "bytes")

class GLB:
    """Minimal reader over the JSON chunk: node names, hierarchy, mesh tris, bounds and materials."""
    def __init__(self, path):
        self.g, _ = read_glb(path)
        self.nodes = self.g.get("nodes", [])
        self.by_name = {}
        for i, n in enumerate(self.nodes):
            self.by_name.setdefault(n.get("name"), i)
        parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                parent[c] = i
        self.parent = parent
        self.roots = [i for i in range(len(self.nodes)) if i not in parent]
        self.materials = {m.get("name"): m for m in self.g.get("materials", [])}

    def children(self, i):
        return {self.nodes[c]["name"]: c for c in self.nodes[i].get("children", [])}

    def mesh_tris(self, mi):
        t = 0
        for p in self.g["meshes"][mi]["primitives"]:
            acc = self.g["accessors"][p["indices"]] if "indices" in p else self.g["accessors"][p["attributes"]["POSITION"]]
            t += acc["count"] // 3
        return t

    def mesh_bounds(self, mi):
        lo, hi = [1e9] * 3, [-1e9] * 3
        for p in self.g["meshes"][mi]["primitives"]:
            acc = self.g["accessors"][p["attributes"]["POSITION"]]
            lo = [min(a, b) for a, b in zip(lo, acc["min"])]; hi = [max(a, b) for a, b in zip(hi, acc["max"])]
        return lo, hi

    def node_tris(self, i, deep=True):
        n = self.nodes[i]
        t = self.mesh_tris(n["mesh"]) if "mesh" in n else 0
        if deep:
            t += sum(self.node_tris(c) for c in n.get("children", []))
        return t

    def node_bounds(self, i):
        """World-ish bounds of a node (its mesh scaled by its own scale, plus children at their translation)."""
        n = self.nodes[i]
        s = n.get("scale", [1, 1, 1])
        lo, hi = [1e9] * 3, [-1e9] * 3
        if "mesh" in n:
            mlo, mhi = self.mesh_bounds(n["mesh"])
            lo = [min(a, b * k) for a, b, k in zip(lo, mlo, s)]; hi = [max(a, b * k) for a, b, k in zip(hi, mhi, s)]
        for c in n.get("children", []):
            cn = self.nodes[c]
            if "mesh" not in cn:
                continue
            t = cn.get("translation", [0, 0, 0])
            clo, chi = self.mesh_bounds(cn["mesh"])
            # ignore child rotation for bounds (only fan_0 on the box fan is rotated; its bounds are tiny)
            lo = [min(a, (b + tt) * k) for a, b, tt, k in zip(lo, clo, t, s)]; hi = [max(a, (b + tt) * k) for a, b, tt, k in zip(hi, chi, t, s)]
        return lo, hi

SRV = ["srv_pizza_box", "srv_blade", "srv_gpu_node", "srv_storage", "srv_ai_pod", "srv_sled", "srv_quantum", "srv_orbital"]
LIB_REQUIRED = ["rack_frame", *SRV, "pwr_pdu", "pwr_subpanel", "pwr_genset", "pwr_substation", "pwr_hv_feed", "pwr_smr",
                "cool_box_fan", "cool_window_ac", "cool_split_ac", "cool_crac", "cool_chiller", "cool_cryo", "cool_tower", "cool_immersion",
                "net_switch", "net_biz_fiber", "net_fiber_uplink", "net_core_router", "net_ix_port", "net_cable_landing", "net_tray_segment",
                "floor_tile_solid", "floor_tile_perf", "wall_segment_plain", "wall_segment_door", "wall_segment_glass", "containment_panel",
                "skyline_campus", "hall_shell_silhouette"]
SHARED = [("srv_pizza_box", "srv_blade"), ("srv_ai_pod", "srv_sled"), ("cool_crac", "cool_chiller"), ("cool_crac", "cool_cryo"),
          ("pwr_substation", "pwr_hv_feed"), ("net_fiber_uplink", "net_core_router"), ("net_fiber_uplink", "net_ix_port"),
          ("net_fiber_uplink", "net_cable_landing")]
MATERIALS = ["MAT_steel_dark", "MAT_rack_white", "MAT_concrete", "MAT_plastic", "MAT_glass", "MAT_chainlink", "MAT_led", "MAT_coolant"]
problems = []
def check(cond, msg):
    if not cond:
        problems.append(msg)
        print("FAIL", msg)

def check_library(path):
    g = GLB(path)
    names = set(g.by_name)
    for n in LIB_REQUIRED:
        check(n in names, f"library: missing object {n}")
    for n in g.nodes:
        check("." not in n.get("name", "") and "__" not in n.get("name", ""), f"library: unclean node name {n.get('name')}")
    for a, b in SHARED:
        if a in names and b in names:
            check(g.nodes[g.by_name[a]].get("mesh") == g.nodes[g.by_name[b]].get("mesh"), f"library: {a} and {b} do not share a mesh")
    for s in SRV:
        if s not in names:
            continue
        i = g.by_name[s]; ch = g.children(i)
        for led in ("led_0", "led_1"):
            check(led in ch, f"library: {s} lacks {led}")
            if led in ch:
                t = g.nodes[ch[led]].get("translation", [0, 0, 0])
                check(0.0 < t[1] < 0.2 and 0.43 < t[2] <= 0.452 and -0.26 < t[0] < 0.26, f"library: {s}.{led} at {t} is not on the front face")
        lo, hi = g.node_bounds(i)
        check(lo[0] >= -0.261 and hi[0] <= 0.261 and lo[1] >= -0.001 and hi[1] <= 0.201 and lo[2] >= -0.451 and hi[2] <= 0.451,
              f"library: {s} bounds {lo}..{hi} exceed the 0.52 x 0.9 x 0.20 envelope")
        check(not any(g.nodes[c].get("mesh") is not None for c in g.nodes[i].get("children", [])), f"library: {s} has mesh children")
    if "rack_frame" in names:
        ch = g.children(g.by_name["rack_frame"])
        for k in range(8):
            check(f"slot_{k}" in ch, f"library: rack_frame lacks slot_{k}")
            if f"slot_{k}" in ch:
                t = g.nodes[ch[f"slot_{k}"]].get("translation", [0, 0, 0])
                check(abs(t[1] - (0.12 + 0.22 * k)) < 1e-3 and abs(t[0]) < 1e-6, f"library: slot_{k} at {t}")
        prims = g.g["meshes"][g.nodes[g.by_name["rack_frame"]]["mesh"]]["primitives"]
        check(len(prims) == 2, f"library: rack_frame has {len(prims)} material primitives, want 2")
        if len(prims) == 2:
            check(g.g["materials"][prims[0]["material"]]["name"] == "MAT_steel_dark", "library: rack_frame primitive 0 is not MAT_steel_dark")
    for fu in ("cool_box_fan", "cool_crac", "cool_tower"):
        if fu in names:
            check("fan_0" in g.children(g.by_name[fu]), f"library: {fu} lacks fan_0")
    if "cool_split_ac" in names:
        # a wall split, not a tower: shorter than a rack (2.0 m) and within the Colo cooling lane's 1.0 m x LANE_FIT 0.9
        lo, hi = g.node_bounds(g.by_name["cool_split_ac"])
        check(hi[1] - lo[1] <= 1.95 and hi[0] - lo[0] <= 0.9 + 1e-3, f"library: cool_split_ac is {hi[0] - lo[0]:.2f} x {hi[1] - lo[1]:.2f} m (rack-sized)")
    for n in LIB_REQUIRED:
        if n in names:
            i = g.by_name[n]
            own = g.node_tris(i, deep=False)
            kids = sum(g.node_tris(c) for c in g.nodes[i].get("children", []))
            check(own <= LIB_TRI_LIMIT and kids <= LIB_TRI_LIMIT, f"library: {n} has {own} (+{kids} children) tris > {LIB_TRI_LIMIT}")
    for m in MATERIALS:
        check(m in g.materials, f"library: material {m} missing")
    led = g.materials.get("MAT_led", {})
    check(led.get("extensions", {}).get("KHR_materials_emissive_strength", {}).get("emissiveStrength") == 4.0, "library: MAT_led emissive strength != 4")
    for m in ("MAT_glass", "MAT_chainlink"):
        check(g.materials.get(m, {}).get("alphaMode") == "BLEND", f"library: {m} is not alphaMode BLEND")
    for m in g.g.get("materials", []):
        if m["name"] != "MAT_led":
            check(max(m.get("pbrMetallicRoughness", {}).get("baseColorFactor", [0, 0, 0, 1])[:3]) <= 0.6 + 1e-6, f"library: {m['name']} albedo > 0.6")
    return summary_rows(g)

def summary_rows(g):
    rows = []
    for i in g.roots:
        n = g.nodes[i]
        lo, hi = g.node_bounds(i)
        size = [round(h - l, 3) if h > -1e8 else 0 for l, h in zip(lo, hi)]
        rows.append({"name": n.get("name"), "tris": g.node_tris(i), "size": size, "scale": n.get("scale", [1, 1, 1])[0],
                     "children": [g.nodes[c]["name"] for c in n.get("children", [])],
                     "translation": [round(v, 3) for v in n.get("translation", [0, 0, 0])]})
    return rows

def check_stage(path, n):
    g = GLB(path)
    names = set(g.by_name)
    for r in ("floor", "hot_tiles", "walls", f"props_stage_{n}", "key_light", "door", "yard", "cam_target"):
        check(r in names, f"stage_{n}: missing {r}")
    if n == 1:
        check("prop_civic" in names, "stage_1: missing prop_civic")
    if n == 5:
        check("prop_garage_monument" in names, "stage_5: missing prop_garage_monument")
    # the aisle strip fixtures keep their glow materials (Hall blue, Campus white) through the export
    strip_mat = {4: "MAT_glow_blue", 5: "MAT_glow"}.get(n)
    if strip_mat:
        check(strip_mat in g.materials, f"stage_{n}: material {strip_mat} missing (aisle strips)")
    total = sum(g.node_tris(i) for i in g.roots)
    check(total <= SHELL_TRI_LIMIT, f"stage_{n}: {total} tris > {SHELL_TRI_LIMIT}")
    for e in ("key_light", "door", "yard", "cam_target"):
        if e in names:
            check("mesh" not in g.nodes[g.by_name[e]], f"stage_{n}: {e} is not an empty")
    if "yard" in names:
        t = g.nodes[g.by_name["yard"]].get("translation", [0, 0, 0])
        check(abs(t[2] + STAGE_GEO[n]["yard"]) < 1e-3, f"stage_{n}: yard at {t}")
    print(f"STAGE {n}: {total} tris")
    return summary_rows(g)

# ======================================================================================================
# MAIN
# ======================================================================================================
report = {}
lib = build_library()
lib_path = os.path.join(OUT_DIR, "library.glb")
export(lib_path, lib)
report["library"] = check_library(lib_path)

builders = {1: build_stage_1, 2: build_stage_2, 3: build_stage_3, 4: build_stage_4, 5: build_stage_5}
for n, fn in builders.items():
    objs = fn()
    path = os.path.join(OUT_DIR, f"stage_{n}.glb")
    export(path, objs)
    report[f"stage_{n}"] = check_stage(path, n)
    for o in objs:   # tidy up so the next stage's part names start clean
        for c in list(o.children_recursive):
            bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.objects.remove(o, do_unlink=True)

proto = os.path.join(OUT_DIR, "proto.glb")
if os.path.exists(proto):
    os.remove(proto)
    print("REMOVED", proto)

if os.environ.get("ASSET_REPORT"):   # per-object summary (dims, tris, children) for ASSETS.md and the node checker
    with open(os.environ["ASSET_REPORT"], "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
if problems:
    print(f"ASSETS FAILED: {len(problems)} problem(s)")
    sys.exit(1)
print("ASSETS OK")
