# Park Inspector: builds every ride part, building, prop and person in Blender and exports assets/parts.glb.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python park-inspector/build_assets.py
#
# Metres. Authored Z-up with each part's front facing -Y; glTF export turns Blender (x, y, z) into three.js
# (x, z, -y), so in the game fronts face +Z and up is +Y. Object names are the contract with js/world.js.
# Materials named paint_a / paint_b / canvas_a / canvas_b are recoloured per ride in the game; *_face planes
# get canvas textures (signs). Everything is bevelled and smooth-by-angle shaded so it catches light.

import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets", "parts.glb")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
PI = math.pi
TAU = 2 * PI

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SCENE = bpy.context.scene

# ------------------------------------------------------------------------------------------------ materials
MATS = {}
def mat(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.6, emit=None, emit_str=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_str
    MATS[name] = m
    return m

def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

mat("paint_a", srgb("#d8452f"), 0.35, 0.38)
mat("paint_b", srgb("#f2c230"), 0.35, 0.38)
mat("steel", srgb("#8a9098"), 0.9, 0.38)
mat("dark_steel", srgb("#3b3f45"), 0.85, 0.5)
mat("chrome", srgb("#e6e8ec"), 1.0, 0.12)
mat("concrete", srgb("#a8a49c"), 0.0, 0.9)
mat("wood", srgb("#8a5a34"), 0.0, 0.75)
mat("rubber", srgb("#1b1b1d"), 0.0, 0.85)
mat("seat", srgb("#2a3550"), 0.1, 0.55)
mat("glass", srgb("#9fc6dd"), 0.2, 0.08)
mat("bulb", srgb("#fff2c4"), 0.0, 0.3, srgb("#ffdc8a"), 6.0)
mat("canvas_a", srgb("#e23b3b"), 0.0, 0.8)
mat("canvas_b", srgb("#f5efe2"), 0.0, 0.8)
mat("white", srgb("#efece6"), 0.0, 0.6)
mat("red", srgb("#c8222a"), 0.1, 0.45)
mat("copper", srgb("#c06a3a"), 1.0, 0.32)
mat("roof", srgb("#3b4d5e"), 0.2, 0.6)
mat("brick", srgb("#9a5a44"), 0.0, 0.85)
mat("leaf", srgb("#4f7a33"), 0.0, 0.8)
mat("leaf_b", srgb("#3d6630"), 0.0, 0.8)
mat("pine", srgb("#2f5a3a"), 0.0, 0.85)
mat("bark", srgb("#5a3d27"), 0.0, 0.9)
mat("skin", srgb("#e0ac85"), 0.0, 0.55)
mat("shirt", srgb("#ffffff"), 0.0, 0.7)
mat("pants", srgb("#ffffff"), 0.0, 0.75)
mat("hair", srgb("#3a2a1c"), 0.0, 0.7)
mat("hivis", srgb("#d8f02a"), 0.0, 0.55)
mat("hardhat", srgb("#f4f4f0"), 0.1, 0.35)
mat("dummy", srgb("#f0c419"), 0.1, 0.45)
mat("dummy_dark", srgb("#232323"), 0.1, 0.5)
mat("wire", srgb("#e0672a"), 0.0, 0.5)
mat("face", srgb("#ffffff"), 0.0, 0.6)

# ------------------------------------------------------------------------------------------------ primitives
def _done(ob, m, bevel=0.0, seg=2):
    if bevel > 0:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = ob.modifiers.new("bev", "BEVEL")
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        mod.harden_normals = False
    ob.data.materials.clear()
    ob.data.materials.append(MATS[m])
    return ob

def _active():
    return bpy.context.view_layer.objects.active

def box(c, s, m="steel", rot=(0, 0, 0), bevel=0.0):
    """Box centred at c with full size s."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=c, rotation=rot)
    ob = _active()
    ob.scale = s
    return _done(ob, m, bevel)

def cyl(c, r, h, m="steel", rot=(0, 0, 0), v=24, bevel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=h, location=c, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r, radius2=r2, depth=h, location=c, rotation=rot)
    return _done(_active(), m, bevel)

def sph(c, r, m="steel", seg=20, rings=12, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=c)
    ob = _active()
    ob.scale = scale
    return _done(ob, m)

def ico(c, r, m="leaf", sub=2, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=c)
    ob = _active()
    ob.scale = scale
    return _done(ob, m)

def tor(c, R, r, m="steel", rot=(0, 0, 0), seg=64, mseg=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=mseg,
                                     location=c, rotation=rot)
    return _done(_active(), m)

def rod(p0, p1, r, m="steel", v=10):
    """Cylinder from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d.length, location=(p0 + p1) / 2)
    ob = _active()
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = q
    return _done(ob, m)

def plane(c, w, h, m="face", rot=(PI / 2, 0, 0)):
    """Upright plane facing -Y (three +Z) by default; UVs 0..1."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=c, rotation=rot)
    ob = _active()
    ob.scale = (w, h, 1)
    return _done(ob, m)

def mesh_from(name, verts, faces, m):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    SCENE.collection.objects.link(ob)
    ob.data.materials.append(MATS[m])
    return ob

PARTS = []
def part(name, objs, smooth=35):
    """Join objs into one object called name, transforms applied (origin = world origin)."""
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        for mod in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        o.select_set(True)
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = _active()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth))
    except Exception:
        bpy.ops.object.shade_flat()
    ob.name = name
    ob.data.name = name
    PARTS.append(ob)
    bpy.ops.object.select_all(action="DESELECT")
    return ob

def ring_pts(n, r, z=0.0, a0=0.0):
    return [(r * math.cos(a0 + TAU * i / n), r * math.sin(a0 + TAU * i / n), z) for i in range(n)]

# ================================================================================================ FERRIS WHEEL
AXLE_Z = 14.0
WHEEL_R = 11.0
N_GOND = 16

def build_ferris():
    o = []
    # base and loading deck
    o.append(box((0, 0, 0.15), (9, 14, 0.3), "concrete", bevel=0.05))
    o.append(box((0, -4.6, 0.55), (6, 3.2, 0.5), "wood", bevel=0.03))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(rod((sx * 2.6, sy * 5.6, 0.3), (sx * 1.85, 0, AXLE_Z), 0.26, "paint_a", 16))
            o.append(box((sx * 2.6, sy * 5.6, 0.36), (0.9, 0.9, 0.12), "dark_steel", bevel=0.02))
        # cross bracing per side
        for t in (0.3, 0.55):
            za = 0.3 + t * (AXLE_Z - 0.3)
            ya = 5.6 * (1 - t)
            xa = 2.6 + (1.85 - 2.6) * t
            o.append(rod((sx * xa, -ya, za), (sx * xa, ya, za), 0.12, "paint_a"))
        o.append(rod((sx * 2.42, -4.3, 3.6), (sx * 2.1, 2.9, 9.8), 0.09, "paint_a"))
        o.append(rod((sx * 2.42, 4.3, 3.6), (sx * 2.1, -2.9, 9.8), 0.09, "paint_a"))
        o.append(box((sx * 1.85, 0, AXLE_Z), (0.7, 1.0, 0.9), "dark_steel", bevel=0.06))
    o.append(cyl((0, 0, AXLE_Z), 0.32, 4.4, "chrome", rot=(0, PI / 2, 0)))
    part("fw_frame", o)

    # wheel, origin at the axle
    o = []
    for sx in (-1.3, 1.3):
        o.append(tor((sx, 0, 0), WHEEL_R, 0.13, "paint_b", rot=(0, PI / 2, 0), seg=96))
        o.append(tor((sx, 0, 0), WHEEL_R - 1.0, 0.08, "paint_b", rot=(0, PI / 2, 0), seg=96))
        o.append(tor((sx, 0, 0), 3.6, 0.1, "paint_b", rot=(0, PI / 2, 0), seg=48))
        for i in range(N_GOND):
            a = TAU * i / N_GOND
            ca, sa = math.cos(a), math.sin(a)
            o.append(rod((sx * 0.55, ca * 0.6, sa * 0.6), (sx, ca * WHEEL_R, sa * WHEEL_R), 0.07, "paint_a"))
            a2 = TAU * (i + 0.5) / N_GOND
            o.append(rod((sx, ca * (WHEEL_R - 1.0), sa * (WHEEL_R - 1.0)),
                         (sx, math.cos(a2) * WHEEL_R, math.sin(a2) * WHEEL_R), 0.05, "paint_b"))
        for i in range(48):
            a = TAU * (i + 0.25) / 48
            o.append(sph((sx * 1.08, math.cos(a) * (WHEEL_R + 0.16), math.sin(a) * (WHEEL_R + 0.16)), 0.11, "bulb", 8, 6))
    for i in range(N_GOND):
        a = TAU * i / N_GOND
        o.append(rod((-1.4, math.cos(a) * WHEEL_R, math.sin(a) * WHEEL_R),
                     (1.4, math.cos(a) * WHEEL_R, math.sin(a) * WHEEL_R), 0.08, "steel"))
    o.append(cyl((0, 0, 0), 0.9, 1.6, "paint_a", rot=(0, PI / 2, 0), bevel=0.08))
    o.append(cyl((0, 0, 0), 0.45, 2.4, "chrome", rot=(0, PI / 2, 0)))
    part("fw_wheel", o)

    # gondola, origin at the pivot on the rim
    o = []
    o.append(cyl((0, 0, 0), 0.07, 1.5, "chrome", rot=(0, PI / 2, 0)))
    for sx in (-0.6, 0.6):
        o.append(rod((sx, 0, 0), (sx * 1.2, 0, -0.95), 0.045, "steel"))
    o.append(cyl((0, 0, -1.0), 0.95, 0.24, "paint_b", v=32, bevel=0.06, r2=0.75))
    o.append(sph((0, 0, -0.95), 0.25, "paint_b", 16, 8))
    o.append(box((0, 0, -2.9), (1.7, 1.5, 0.12), "paint_a", bevel=0.03))
    for sx in (-0.8, 0.8):
        for sy in (-0.68, 0.68):
            o.append(rod((sx, sy, -2.85), (sx * 0.9, sy * 0.9, -1.1), 0.035, "chrome"))
    # half walls (front one is the door, a separate part)
    o.append(box((0, 0.7, -2.45), (1.7, 0.06, 0.8), "paint_a", bevel=0.02))
    for sx in (-0.82, 0.82):
        o.append(box((sx, 0, -2.45), (0.06, 1.5, 0.8), "paint_a", bevel=0.02))
    o.append(box((-0.62, -0.7, -2.45), (0.46, 0.06, 0.8), "paint_a", bevel=0.02))
    o.append(box((0.62, -0.7, -2.45), (0.46, 0.06, 0.8), "paint_a", bevel=0.02))
    o.append(box((0, 0.45, -2.6), (1.5, 0.45, 0.42), "seat", bevel=0.05))
    o.append(box((0, -0.25, -2.6), (1.5, 0.45, 0.42), "seat", bevel=0.05))
    part("fw_gondola", o)
    o = [box((0, -0.72, -2.45), (0.78, 0.07, 0.78), "paint_b", bevel=0.02),
         box((0.3, -0.77, -2.3), (0.08, 0.06, 0.06), "chrome")]
    part("fw_door", o)

    # drive (bolted to the frame beside the wheel), and its separate gear guard
    o = [box((2.9, 0.6, 1.1), (1.4, 1.6, 1.4), "dark_steel", bevel=0.06),
         cyl((2.15, 0.6, 1.5), 0.55, 0.18, "steel", rot=(0, PI / 2, 0), v=20),
         cyl((2.15, 0.6, 1.5), 0.62, 0.08, "copper", rot=(0, PI / 2, 0), v=40)]
    for i in range(14):
        a = TAU * i / 14
        o.append(box((2.15, 0.6 + 0.62 * math.cos(a), 1.5 + 0.62 * math.sin(a)), (0.1, 0.1, 0.1), "copper",
                     rot=(a, 0, 0)))
    part("fw_motor", o)
    o = [cyl((2.08, 0.6, 1.5), 0.82, 0.36, "paint_b", rot=(0, PI / 2, 0), v=28, bevel=0.03)]
    part("fw_guard", o)

# ================================================================================================ DROP TOWER
SEC_H = 4.0
def build_drop():
    o = []
    w = 0.8
    corners = [(-w, -w), (w, -w), (w, w), (-w, w)]
    for (x, y) in corners:
        o.append(cyl((x, y, SEC_H / 2), 0.1, SEC_H, "paint_a", v=12))
    for z in (0.0, SEC_H):
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            o.append(rod((a[0], a[1], z), (b[0], b[1], z), 0.06, "paint_a"))
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        o.append(rod((a[0], a[1], 0), (b[0], b[1], SEC_H / 2), 0.04, "paint_a"))
        o.append(rod((b[0], b[1], SEC_H / 2), (a[0], a[1], SEC_H), 0.04, "paint_a"))
    for (x, y) in ((0, -w - 0.08), (0, w + 0.08), (-w - 0.08, 0), (w + 0.08, 0)):
        o.append(box((x, y, SEC_H / 2), (0.22 if x == 0 else 0.06, 0.06 if x == 0 else 0.22, SEC_H), "steel"))
    part("dt_section", o)

    o = [box((0, 0, 0.9), (2.6, 2.6, 1.8), "paint_b", bevel=0.1),
         box((0, 0, 2.05), (2.2, 2.2, 0.5), "paint_a", bevel=0.06),
         cyl((0, 0, 3.2), 0.12, 2.0, "chrome", r2=0.02, v=8),
         sph((0, 0, 4.25), 0.18, "bulb", 10, 6)]
    for i in range(4):
        a = i * PI / 2
        for k in range(5):
            t = (k - 2) * 0.45
            dx, dy = math.cos(a), math.sin(a)
            o.append(sph((dx * 1.32 - dy * t, dy * 1.32 + dx * t, 1.3), 0.09, "bulb", 8, 6))
    part("dt_top", o)

    o = [cyl((0, 0, 0.35), 4.2, 0.7, "concrete", v=8, bevel=0.06),
         cyl((0, 0, 0.8), 1.5, 0.3, "dark_steel", v=8, bevel=0.03)]
    for i in range(8):
        a = TAU * (i + 0.5) / 8
        o.append(cyl((math.cos(a) * 1.3, math.sin(a) * 1.3, 1.25), 0.22, 0.6, "rubber", v=14))
    part("dt_base", o)

    # one magnetic brake fin, origin at its bottom centre. The game mounts four (one per face) and can omit one.
    o = [box((0, 0, 3.0), (0.6, 0.05, 6.0), "copper", bevel=0.01),
         box((0, 0.06, 3.0), (0.12, 0.08, 6.0), "dark_steel")]
    part("dt_fin", o)

    # carriage: 12 outward-facing seats around the column, origin at the column centre at seat height
    o = []
    o.append(tor((0, 0, 0), 2.15, 0.18, "paint_a", seg=48))
    o.append(tor((0, 0, 1.25), 1.55, 0.12, "paint_a", seg=48))
    o.append(box((0, 0, 0.7), (2.1, 2.1, 1.6), "dark_steel", bevel=0.08))
    for i in range(12):
        a = TAU * i / 12
        rot = (0, 0, a + PI / 2)
        d = Vector((math.cos(a), math.sin(a), 0))
        o.append(box(tuple(d * 2.35 + Vector((0, 0, 0.05))), (0.55, 0.5, 0.12), "seat", rot=rot, bevel=0.04))
        o.append(box(tuple(d * 2.08 + Vector((0, 0, 0.62))), (0.55, 0.12, 1.15), "seat", rot=rot, bevel=0.05))
        o.append(box(tuple(d * 2.36 + Vector((0, 0, -0.42))), (0.5, 0.08, 0.5), "paint_b", rot=rot, bevel=0.03))
    part("dt_carriage", o)
    # over-the-shoulder harness for seat 0 (facing -Y), origin at the hinge above the seat back
    o = [rod((-0.18, -2.15, 1.2), (-0.2, -2.55, 0.35), 0.06, "paint_b", 10),
         rod((0.18, -2.15, 1.2), (0.2, -2.55, 0.35), 0.06, "paint_b", 10),
         rod((-0.2, -2.55, 0.35), (0.2, -2.55, 0.35), 0.07, "paint_b", 10),
         box((0, -2.2, 1.18), (0.5, 0.25, 0.18), "rubber", bevel=0.05)]
    part("dt_harness", o)

# ================================================================================================ SWING RIDE
SW_TOP = 10.0
SW_R = 5.4
SW_CHAIN = 5.0
def build_swing():
    o = [cyl((0, 0, 0.5), 3.0, 1.0, "paint_b", v=40, bevel=0.06),
         cyl((0, 0, 1.06), 3.1, 0.12, "chrome", v=40),
         cyl((0, 0, SW_TOP / 2 + 0.5), 0.55, SW_TOP - 1.0, "paint_a", v=24, r2=0.4),
         cyl((0, 0, 3.6), 0.85, 1.3, "paint_b", v=24, bevel=0.05)]
    for i in range(24):
        a = TAU * i / 24
        o.append(sph((math.cos(a) * 3.05, math.sin(a) * 3.05, 0.6), 0.09, "bulb", 8, 6))
    part("sw_tower", o)

    o = [cyl((0, 0, 0), SW_R + 0.6, 0.3, "paint_a", v=48, bevel=0.04),
         cyl((0, 0, 1.4), SW_R + 0.4, 2.6, "paint_b", v=48, r2=0.6),
         cyl((0, 0, 3.0), 0.5, 0.8, "paint_a", v=16, r2=0.15),
         sph((0, 0, 3.5), 0.25, "bulb", 10, 6)]
    # scalloped valance
    for i in range(32):
        a = TAU * (i + 0.5) / 32
        o.append(sph((math.cos(a) * (SW_R + 0.6), math.sin(a) * (SW_R + 0.6), -0.32), 0.42, "canvas_b", 12, 6,
                     scale=(1, 1, 0.6)))
    for i in range(48):
        a = TAU * i / 48
        o.append(sph((math.cos(a) * (SW_R + 0.62), math.sin(a) * (SW_R + 0.62), 0.05), 0.08, "bulb", 8, 6))
    part("sw_canopy", o)

    # seat hanging from its attach point (origin), facing -Y (tangential direction in the game)
    o = []
    for sx in (-0.25, 0.25):
        for sy in (-0.12, 0.12):
            o.append(rod((sx * 0.6, sy, 0), (sx, sy, -SW_CHAIN + 0.35), 0.018, "chrome", 6))
    o.append(box((0, 0, -SW_CHAIN + 0.3), (0.62, 0.55, 0.08), "paint_a", bevel=0.03))
    o.append(box((0, 0.27, -SW_CHAIN + 0.62), (0.62, 0.08, 0.6), "paint_a", bevel=0.03))
    o.append(rod((0, -0.3, -SW_CHAIN + 0.3), (0, -0.32, -SW_CHAIN - 0.2), 0.03, "chrome", 6))
    o.append(box((0, -0.32, -SW_CHAIN - 0.22), (0.22, 0.08, 0.04), "chrome"))
    part("sw_seat", o)
    o = [rod((-0.3, -0.3, -SW_CHAIN + 0.55), (0.3, -0.3, -SW_CHAIN + 0.55), 0.022, "chrome", 6)]
    part("sw_belt", o)

# ================================================================================================ PIRATE SHIP
PS_PIVOT = 12.0
PS_ARM = 9.5
def hull(name, L=12.0, W=3.4, D=1.6):
    """Lofted ship hull, origin at its deck centre."""
    nx, ny = 14, 28
    verts, faces = [], []
    for j in range(ny + 1):
        t = -1 + 2 * j / ny
        y = t * L / 2
        hw = W / 2 * max(0.06, 1 - abs(t) ** 3.2)
        sheer = 0.55 * t * t + (0.9 * max(0, abs(t) - 0.7) ** 2) * 6
        depth = D * (1 - 0.55 * t * t)
        for i in range(nx + 1):
            s = -1 + 2 * i / nx
            ang = s * PI / 2
            x = math.sin(ang) * hw
            z = -math.cos(ang) * depth
            z += sheer * (abs(s) ** 6)
            verts.append((x, y, z + sheer * 0.6))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    ob = mesh_from(name, verts, faces, "paint_a")
    sol = ob.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.08
    return ob

def build_pirate():
    o = [box((0, 0, 0.2), (10, 16, 0.4), "concrete", bevel=0.05),
         box((0, -6.0, 0.7), (7, 2.2, 0.6), "wood", bevel=0.03)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(rod((sx * 3.4, sy * 6.2, 0.4), (sx * 2.6, 0, PS_PIVOT), 0.3, "paint_b", 16))
            o.append(box((sx * 3.4, sy * 6.2, 0.45), (1.0, 1.0, 0.12), "dark_steel", bevel=0.02))
        o.append(rod((sx * 3.1, -3.9, 4.2), (sx * 3.1, 3.9, 4.2), 0.14, "paint_b"))
        o.append(box((sx * 2.6, 0, PS_PIVOT), (0.8, 1.0, 1.0), "dark_steel", bevel=0.06))
    o.append(cyl((0, 0, PS_PIVOT), 0.4, 5.8, "chrome", rot=(0, PI / 2, 0)))
    # drive tyre under the hull
    o.append(cyl((0, 0, 1.1), 0.7, 0.6, "rubber", rot=(0, PI / 2, 0), v=28, bevel=0.08))
    o.append(box((0, 0, 0.75), (1.2, 1.8, 0.7), "dark_steel", bevel=0.05))
    part("ps_frame", o)

    o = []
    h = hull("ps_hull_tmp")
    h.location = (0, 0, -PS_ARM)
    o.append(h)
    for sx in (-1, 1):
        o.append(rod((sx * 0.4, 0, 0), (sx * 1.5, -3.2, -PS_ARM + 0.4), 0.16, "paint_b", 12))
        o.append(rod((sx * 0.4, 0, 0), (sx * 1.5, 3.2, -PS_ARM + 0.4), 0.16, "paint_b", 12))
    o.append(cyl((0, 0, 0), 0.7, 1.4, "paint_b", rot=(0, PI / 2, 0), bevel=0.06))
    for r in range(-2, 3):
        y = r * 1.7
        lift = 0.55 * (y / 6) ** 2 * 4
        o.append(box((0, y, -PS_ARM + 0.15 + lift), (2.9, 0.55, 0.3), "seat", bevel=0.05))
        o.append(box((0, y + 0.35, -PS_ARM + 0.55 + lift), (2.9, 0.12, 0.6), "wood", bevel=0.03))
    o.append(cyl((0, 0, -PS_ARM + 2.8), 0.12, 5.2, "wood", v=10))
    o.append(box((0, 0, -PS_ARM + 3.2), (0.06, 2.6, 2.6), "canvas_b"))
    o.append(box((0, -6.4, -PS_ARM + 1.5), (0.4, 1.2, 0.5), "paint_b", rot=(0.5, 0, 0), bevel=0.1))
    part("ps_ship", o)
    o = [rod((-1.4, -0.32, 0.5), (1.4, -0.32, 0.5), 0.05, "chrome", 8),
         rod((-1.4, -0.32, 0.5), (-1.4, 0.1, 0.25), 0.04, "chrome", 8),
         rod((1.4, -0.32, 0.5), (1.4, 0.1, 0.25), 0.04, "chrome", 8)]
    part("ps_bar", o)

# ================================================================================================ COASTER
def build_coaster():
    # car, origin on the track centreline between the rails; front is -Y (three +Z, direction of travel)
    o = []
    o.append(box((0, 0, 0.62), (1.35, 2.0, 0.55), "paint_a", bevel=0.18))
    o.append(box((0, -0.95, 0.78), (1.2, 0.5, 0.5), "paint_a", rot=(0.35, 0, 0), bevel=0.16))
    for y in (-0.25, 0.55):
        o.append(box((0, y + 0.25, 1.05), (1.15, 0.14, 0.75), "seat", rot=(-0.15, 0, 0), bevel=0.06))
        o.append(box((0, y, 0.82), (1.15, 0.5, 0.12), "seat", bevel=0.04))
    o.append(box((0, 0, 0.3), (0.9, 1.8, 0.2), "dark_steel", bevel=0.03))
    for sx in (-0.55, 0.55):
        for sy in (-0.65, 0.65):
            o.append(cyl((sx, sy, 0.13), 0.13, 0.12, "rubber", rot=(0, PI / 2, 0), v=16))
            o.append(cyl((sx * 1.25, sy, -0.05), 0.08, 0.1, "rubber", rot=(0, PI / 2, 0), v=12))
            o.append(cyl((sx, sy, -0.14), 0.08, 0.1, "rubber", rot=(0, PI / 2, 0), v=12))
    o.append(box((0, 1.1, 0.35), (0.25, 0.3, 0.12), "dark_steel"))
    part("cs_car", o)
    # lap bar for one row, origin at its hinge on the floor; the game places two per car
    o = [rod((0, 0.05, 0.85), (0, -0.25, 1.25), 0.05, "chrome", 8),
         rod((-0.45, -0.32, 1.22), (0.45, -0.32, 1.22), 0.06, "rubber", 10)]
    part("cs_bar", o)

    # track tie, origin on the centreline: rails at x = +-0.55, spine tube 0.5 below
    o = [box((0, 0, -0.08), (1.2, 0.12, 0.1), "paint_b", bevel=0.02),
         rod((-0.5, 0, -0.08), (0, 0, -0.5), 0.045, "paint_b", 8),
         rod((0.5, 0, -0.08), (0, 0, -0.5), 0.045, "paint_b", 8)]
    part("cs_tie", o)
    o = [cyl((0, 0, 0.5), 0.3, 1.0, "paint_b", v=18)]
    part("cs_support", o)
    o = [box((0, 0, 0.25), (1.3, 1.3, 0.5), "concrete", bevel=0.04),
         box((0, 0, 0.52), (0.95, 0.95, 0.04), "dark_steel"),
         cyl((0, 0, 0.7), 0.36, 0.3, "paint_b", v=18, r2=0.3)]
    part("cs_footing", o)

    # station, origin at ground centre, track runs along local Y at x = 0, rails at z = 1.0
    o = []
    for sx in (-1, 1):
        o.append(box((sx * 2.6, 0, 0.6), (2.2, 16, 1.2), "concrete", bevel=0.04))
        o.append(box((sx * 2.6, 0, 1.22), (2.2, 16, 0.06), "wood"))
        for y in range(-7, 8, 3):
            o.append(box((sx * 3.55, y, 3.0), (0.22, 0.22, 3.6), "paint_a", bevel=0.03))
        o.append(box((sx * 1.6, 0, 1.75), (0.06, 15.2, 1.0), "steel"))
        for y in range(-7, 8):
            o.append(box((sx * 1.6, y + 0.3, 1.7), (0.08, 0.6, 0.9), "paint_b", bevel=0.01))
    o.append(box((0, 0, 4.95), (8.4, 17.4, 0.3), "roof", bevel=0.05))
    o.append(box((0, 0, 5.6), (5.0, 17.0, 1.0), "roof", rot=(0, 0, 0), bevel=0.3))
    o.append(box((0, -8.8, 5.8), (6.0, 0.25, 1.4), "paint_a", bevel=0.05))
    o.append(box((-4.4, 6.0, 0.6), (2.6, 3.0, 1.2), "concrete", bevel=0.04))
    o.append(box((-4.4, 9.0, 0.3), (2.6, 3.0, 0.6), "concrete", bevel=0.04))
    o.append(box((3.3, -6.5, 2.2), (1.0, 1.4, 1.0), "dark_steel", bevel=0.05))
    o.append(box((3.3, -7.21, 2.35), (0.6, 0.04, 0.4), "glass"))
    o.append(cyl((3.3, -7.25, 2.0), 0.09, 0.06, "red", rot=(PI / 2, 0, 0), v=16))
    part("cs_station", o)
    o = [plane((0, -8.95, 5.8), 5.6, 1.1, "face")]
    part("cs_station_face", o)

# ================================================================================================ BUILDINGS + PROPS
def build_buildings():
    # food stand 3.6 x 3, counter front (-Y)
    o = [box((0, 0, 0.1), (4.0, 3.4, 0.2), "concrete", bevel=0.03),
         box((0, 0.5, 1.5), (3.6, 2.0, 2.8), "white", bevel=0.05),
         box((0, -0.85, 0.55), (3.6, 0.7, 1.1), "paint_a", bevel=0.04),
         box((0, -0.85, 1.12), (3.7, 0.8, 0.06), "steel"),
         box((0, 0.5, 2.98), (3.9, 2.4, 0.16), "paint_a", bevel=0.04)]
    for k in range(8):
        x = -1.75 + 0.5 * k
        o.append(box((x + 0.25, -1.1, 2.55), (0.5, 1.4, 0.06), "canvas_a" if k % 2 == 0 else "canvas_b",
                     rot=(-0.38, 0, 0)))
    for sx in (-1.8, 1.8):
        o.append(box((sx, -0.85, 1.9), (0.08, 0.08, 1.6), "steel"))
    o.append(box((0, -0.1, 3.75), (2.8, 0.25, 1.1), "paint_b", bevel=0.05))
    o.append(box((1.2, 1.1, 0.7), (0.9, 0.7, 1.2), "chrome", bevel=0.04))  # fridge (inside)
    o.append(cyl((-2.15, 1.0, 0.6), 0.3, 1.2, "steel", v=20, bevel=0.1))  # propane
    part("stand_food", o)
    o = [plane((0, -0.24, 3.75), 2.6, 0.95, "face")]
    part("stand_face", o)

    o = [box((0, 0, 1.5), (6.0, 4.0, 3.0), "brick", bevel=0.03),
         box((0, 0, 3.1), (6.6, 4.6, 0.25), "roof", bevel=0.05)]
    for sx in (-1.5, 1.5):
        o.append(box((sx, -2.02, 1.05), (1.0, 0.06, 2.1), "paint_a", bevel=0.02))
        o.append(box((sx, -2.06, 2.45), (0.5, 0.04, 0.5), "white"))
    part("restroom", o)

    o = [box((0, 0, 1.5), (4.4, 4.0, 3.0), "white", bevel=0.04),
         box((0, 0, 3.08), (4.8, 4.4, 0.2), "red", bevel=0.04),
         box((0, -2.02, 1.05), (1.1, 0.06, 2.1), "glass"),
         box((0, -2.05, 2.55), (0.9, 0.04, 0.28), "red"),
         box((0, -2.05, 2.55), (0.28, 0.04, 0.9), "red"),
         box((1.4, -2.02, 1.6), (0.9, 0.05, 0.8), "glass"),
         cyl((-1.6, -2.4, 0.5), 0.12, 1.0, "steel", v=10),
         box((-1.6, -2.42, 1.25), (0.5, 0.06, 0.5), "white", bevel=0.02)]
    part("first_aid", o)

    o = []
    for sx in (-1, 1):
        o.append(box((sx * 6, 0, 4.0), (1.8, 1.8, 8.0), "paint_a", bevel=0.1))
        o.append(cyl((sx * 6, 0, 8.6), 1.3, 1.6, "paint_b", v=8, r2=0.1))
        o.append(sph((sx * 6, 0, 9.5), 0.3, "bulb", 10, 6))
    o.append(box((0, 0, 7.0), (11, 1.2, 2.0), "paint_b", bevel=0.12))
    for k in range(5):
        x = -4 + 2 * k
        o.append(box((x, -2.0, 1.2), (1.2, 1.0, 2.4), "white", bevel=0.05))  # turnstiles/booths
    part("entrance", o)
    o = [plane((0, -0.62, 7.0), 10.4, 1.7, "face")]
    part("entrance_face", o)

    # ride entry sign (on the queue), face plane separate
    o = [box((-1.3, 0, 1.6), (0.15, 0.15, 3.2), "dark_steel"),
         box((1.3, 0, 1.6), (0.15, 0.15, 3.2), "dark_steel"),
         box((0, 0, 3.2), (3.2, 0.2, 1.1), "paint_a", bevel=0.05)]
    part("ride_sign", o)
    o = [plane((0, -0.11, 3.2), 3.0, 0.95, "face")]
    part("ride_sign_face", o)

    # "you must be this tall" sign: post + board; the arm is separate so the game sets its height
    o = [box((0, 0, 1.0), (0.12, 0.12, 2.0), "wood", bevel=0.02),
         box((0, 0.02, 2.15), (0.9, 0.06, 0.6), "paint_b", bevel=0.03)]
    part("height_sign", o)
    o = [plane((0, -0.06, 2.15), 0.82, 0.52, "face")]
    part("height_face", o)
    o = [box((0.25, 0, 0), (0.5, 0.05, 0.06), "red", bevel=0.01),
         sph((0.52, 0, 0), 0.06, "white", 10, 6)]
    part("height_arm", o)

    # electrical control panel; door separate (hinged at x = -0.4)
    o = [box((0, 0, 0.9), (0.8, 0.32, 1.2), "dark_steel", bevel=0.02),
         box((0, 0, 0.15), (0.9, 0.4, 0.3), "concrete")]
    for k in range(6):
        o.append(box((-0.25 + 0.1 * k, -0.15, 1.1), (0.05, 0.04, 0.16), "white"))
    for k in range(4):
        o.append(rod((-0.2 + 0.13 * k, -0.15, 0.95), (-0.25 + 0.17 * k, -0.4, 0.45 + 0.05 * k), 0.012, "wire", 6))
    part("elec_panel", o)
    o = [box((0.4, -0.18, 0.9), (0.8, 0.04, 1.2), "paint_b", bevel=0.01),
         box((0.4, -0.2, 1.25), (0.3, 0.02, 0.18), "white")]
    part("elec_door", o)

    o = [cyl((0, 0, 0.3), 0.09, 0.55, "red", v=14, bevel=0.03),
         sph((0, 0, 0.58), 0.08, "red", 10, 6),
         box((0.05, 0, 0.66), (0.12, 0.04, 0.03), "dark_steel"),
         rod((0, 0, 0.62), (0.1, -0.08, 0.2), 0.012, "rubber", 6),
         box((0, -0.09, 0.32), (0.08, 0.01, 0.1), "white")]
    part("extinguisher", o)

def build_props():
    o = [cyl((0, 0, 2.25), 0.07, 4.5, "dark_steel", v=10),
         cyl((0, 0, 0.15), 0.18, 0.3, "dark_steel", v=10),
         box((0, 0, 4.65), (0.36, 0.36, 0.5), "glass", bevel=0.04),
         sph((0, 0, 4.65), 0.12, "bulb", 10, 6),
         cyl((0, 0, 4.98), 0.3, 0.2, "dark_steel", v=10, r2=0.05)]
    part("lamp", o)
    o = [box((0, 0, 0.45), (1.8, 0.45, 0.06), "wood", bevel=0.01),
         box((0, 0.22, 0.75), (1.8, 0.06, 0.4), "wood", bevel=0.01)]
    for sx in (-0.8, 0.8):
        o.append(box((sx, 0, 0.22), (0.06, 0.45, 0.44), "dark_steel"))
    part("bench", o)
    o = [cyl((0, 0, 0.45), 0.28, 0.9, "paint_a", v=16, bevel=0.03),
         cyl((0, 0, 0.93), 0.31, 0.08, "dark_steel", v=16)]
    part("trash", o)
    o = [cyl((0, 0, 0.6), 0.04, 1.2, "dark_steel", v=8),
         cyl((1.0, 0, 0.6), 0.04, 1.2, "dark_steel", v=8),
         rod((0, 0, 1.0), (1.0, 0, 1.0), 0.03, "dark_steel", 6),
         rod((0, 0, 0.55), (1.0, 0, 0.55), 0.03, "dark_steel", 6)]
    part("fence", o)
    o = [cyl((0, 0, 0.5), 0.05, 1.0, "chrome", v=10), cyl((0, 0, 0.02), 0.18, 0.04, "dark_steel", v=14)]
    part("queue_post", o)
    o = [cyl((0, 0, 1.4), 0.22, 2.8, "bark", v=10, r2=0.14),
         ico((0, 0, 3.6), 1.8, "leaf", 2, (1, 1, 0.9)),
         ico((0.9, 0.4, 3.0), 1.2, "leaf_b", 2),
         ico((-0.7, -0.5, 4.3), 1.1, "leaf", 2)]
    part("tree_a", o, smooth=60)
    o = [cyl((0, 0, 1.0), 0.18, 2.0, "bark", v=8)]
    for k, (r, z) in enumerate(((2.0, 2.4), (1.6, 3.6), (1.15, 4.7), (0.7, 5.6))):
        o.append(cyl((0, 0, z), r, 1.8, "pine", v=9, r2=0.05))
    part("tree_b", o, smooth=20)
    o = [ico((0, 0, 0.5), 0.8, "leaf_b", 2, (1.2, 1, 0.7))]
    part("bush", o, smooth=60)
    o = [cyl((0, 0, 0.05), 0.07, 0.04, "steel", v=14),
         cyl((0, 0, 0.11), 0.06, 0.08, "steel", v=6),
         cyl((0, 0, 0.18), 0.025, 0.08, "steel", v=8)]
    part("bolt", o, smooth=20)
    o = [box((0, 0, 0), (0.5, 0.012, 0.06), "dummy_dark")]
    part("crack", o)

# ================================================================================================ PEOPLE
def person(shirt="shirt", extra=()):
    legs = [cyl((sx, 0, 0.42), 0.085, 0.84, "pants", v=10, r2=0.07) for sx in (-0.1, 0.1)]
    body = [cyl((0, 0, 1.12), 0.2, 0.62, shirt, v=14, r2=0.17, bevel=0.06),
            rod((-0.24, 0, 1.38), (-0.3, 0.04, 0.88), 0.055, shirt, 8),
            rod((0.24, 0, 1.38), (0.3, 0.04, 0.88), 0.055, shirt, 8)]
    head = [sph((0, 0, 1.6), 0.13, "skin", 14, 10, (1, 1, 1.12)),
            sph((0, 0.03, 1.66), 0.135, "hair", 14, 8, (1, 1, 0.8))]
    return legs, body, head

def build_people():
    legs, body, head = person()
    part("peep_legs", legs)
    part("peep_body", body)
    part("peep_head", head)

    # inspector: hi-vis vest, hard hat and clipboard
    legs, body, head = person("seat")
    vest = [cyl((0, 0, 1.14), 0.215, 0.5, "hivis", v=14, r2=0.185)]
    hat = [sph((0, 0, 1.72), 0.15, "hardhat", 14, 8, (1, 1, 0.75)),
           cyl((0, 0, 1.69), 0.19, 0.02, "hardhat", v=16)]
    board = [box((0.28, -0.12, 1.0), (0.24, 0.02, 0.32), "wood"), box((0.28, -0.135, 0.98), (0.2, 0.01, 0.26), "white")]
    head = [h for h in head if h is not None]
    part("inspector", legs + body + vest + head + hat + board)

    # seated rider (torso + head + arms up), origin at the seat
    o = [cyl((0, 0, 0.32), 0.18, 0.55, "shirt", v=12, r2=0.15, bevel=0.05),
         rod((-0.2, 0, 0.5), (-0.32, -0.05, 1.0), 0.05, "shirt", 8),
         rod((0.2, 0, 0.5), (0.32, -0.05, 1.0), 0.05, "shirt", 8),
         rod((-0.08, 0, 0.05), (-0.1, -0.42, 0.05), 0.075, "pants", 8),
         rod((0.08, 0, 0.05), (0.1, -0.42, 0.05), 0.075, "pants", 8),
         sph((0, 0, 0.75), 0.12, "skin", 12, 8, (1, 1, 1.12))]
    part("rider", o)
    # crash-test dummy, same pose, yellow with the checker target on the head
    o = [cyl((0, 0, 0.32), 0.18, 0.55, "dummy", v=12, r2=0.15, bevel=0.05),
         rod((-0.2, 0, 0.5), (-0.26, -0.25, 0.3), 0.05, "dummy", 8),
         rod((0.2, 0, 0.5), (0.26, -0.25, 0.3), 0.05, "dummy", 8),
         rod((-0.08, 0, 0.05), (-0.1, -0.42, 0.05), 0.075, "dummy", 8),
         rod((0.08, 0, 0.05), (0.1, -0.42, 0.05), 0.075, "dummy", 8),
         sph((0, 0, 0.75), 0.12, "dummy", 12, 8, (1, 1, 1.12)),
         box((0, -0.115, 0.77), (0.07, 0.02, 0.07), "dummy_dark"),
         box((0, 0, 0.32), (0.37, 0.02, 0.04), "dummy_dark")]
    part("dummy", o)

build_ferris()
build_drop()
build_swing()
build_pirate()
build_coaster()
build_buildings()
build_props()
build_people()

for o in list(bpy.data.objects):
    if o not in PARTS:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
                          export_materials="EXPORT")
print("RT_EXPORT", OUT, len(PARTS), "parts:", ", ".join(p.name for p in PARTS))
