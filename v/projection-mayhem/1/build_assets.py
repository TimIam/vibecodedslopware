# Builds Projection Mayhem's 3D assets in Blender and exports them as GLB.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python projection-mayhem/build_assets.py
#
# Outputs assets/shell.glb (the building, laid out from layout.json) and assets/library.glb (props and the parts
# the stubby people are assembled from). Library objects: origin at the bottom centre, front facing Blender -Y
# (three.js +Z after export_yup). Material names are what js/world.js keys its texture and colour overrides on.

import bpy, bmesh, math, os, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
os.makedirs(OUT, exist_ok=True)
L = json.load(open(os.path.join(HERE, "layout.json")))
PI = math.pi

# ---------------------------------------------------------------- helpers
def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)

def link(o):
    bpy.context.scene.collection.objects.link(o)
    return o

def deselect():
    for o in bpy.data.objects:
        o.select_set(False)

_mats = {}
def mat(name, color, rough=0.75, metal=0.0, emit=None, es=0.0, alpha=1.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = es
    if alpha < 1 and hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    m.use_fake_user = True
    _mats[name] = m
    return m

def fin(o, name, m, smooth=False):
    o.name = name
    if m:
        o.data.materials.append(m)
    if smooth:
        o.data.shade_smooth()
    else:
        o.data.shade_flat()
    return o

def box(name, size, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return fin(o, name, m)

def cyl(name, r, h, loc, m, n=16, rot=(0, 0, 0), r2=None, smooth=False):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    return fin(bpy.context.active_object, name, m, smooth)

def sph(name, r, loc, m, scale=(1, 1, 1), seg=16, rings=10, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return fin(o, name, m, smooth)

def torus(name, R, r, loc, m, rot=(0, 0, 0), maj=24, mn=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=maj, minor_segments=mn, location=loc, rotation=rot)
    return fin(bpy.context.active_object, name, m, True)

def quad(name, w, h, loc, m, rot=(PI / 2, 0, 0)):
    """Vertical quad facing -Y by default (three.js +Z), UV 0..1."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, c in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = c
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    o.rotation_euler = rot
    me.materials.append(m)
    return o

def join(objs, name):
    objs = [o for o in objs if o]
    deselect()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    j.data.name = name
    deselect()
    j.select_set(True)
    bpy.context.view_layer.objects.active = j
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return j

def ground(o):
    """Move mesh so origin is bottom centre (x/y centred, min z = 0)."""
    vs = o.data.vertices
    xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
    cx, cy, z0 = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
    for v in vs:
        v.co.x -= cx; v.co.y -= cy; v.co.z -= z0
    o.location = (0, 0, 0)
    return o

def child(o, parent, loc=(0, 0, 0)):
    o.parent = parent
    o.location = loc
    return o

# three.js (x, y, z) -> Blender (x, -z, y)
def T(x, y, z):
    return (x, -z, y)

def sbox(name, x0, x1, y0, y1, z0, z1, m):
    """Box from three.js extents."""
    return box(name, (abs(x1 - x0), abs(z1 - z0), abs(y1 - y0)), T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), m)

def wall(name, axis, fixed, u0, u1, y0, y1, m, openings=(), t=0.2):
    """A wall along `axis` ('x': runs along x at z=fixed; 'z': runs along z at x=fixed) from u0..u1, y0..y1, with
    rectangular openings (ou0, ou1, oy0, oy1). Built as boxes around the holes."""
    cuts = sorted({u0, u1, *[c for o in openings for c in (max(u0, min(u1, o[0])), max(u0, min(u1, o[1])))]})
    parts = []
    for a, b in zip(cuts, cuts[1:]):
        if b - a < 1e-4:
            continue
        mid = (a + b) / 2
        holes = sorted([(o[2], o[3]) for o in openings if o[0] < mid < o[1]])
        ys, cur = [], y0
        for h0, h1 in holes:
            if h0 > cur:
                ys.append((cur, h0))
            cur = max(cur, h1)
        if cur < y1:
            ys.append((cur, y1))
        for v0, v1 in ys:
            if axis == "x":
                parts.append(sbox(name, a, b, v0, v1, fixed - t / 2, fixed + t / 2, m))
            else:
                parts.append(sbox(name, fixed - t / 2, fixed + t / 2, v0, v1, a, b, m))
    return parts

# ---------------------------------------------------------------- materials (sRGB-ish linear values)
M = {}
def mk(*a, **k):
    M[a[0]] = mat(*a, **k)
mk("carpet", (0.32, 0.03, 0.04), rough=0.95)
mk("carpet_aud", (0.08, 0.02, 0.03), rough=0.95)
mk("wall_lobby", (0.42, 0.28, 0.16), rough=0.85)
mk("wainscot", (0.16, 0.06, 0.03), rough=0.6)
mk("wall_aud", (0.22, 0.03, 0.04), rough=0.95)
mk("wall_plain", (0.5, 0.48, 0.44), rough=0.9)
mk("wall_booth", (0.16, 0.16, 0.17), rough=0.9)
mk("ceiling", (0.12, 0.08, 0.06), rough=0.9)
mk("ceiling_dark", (0.03, 0.025, 0.03), rough=0.95)
mk("concrete", (0.28, 0.27, 0.26), rough=0.95)
mk("tile", (0.6, 0.57, 0.5), rough=0.6)
mk("floor_booth", (0.12, 0.12, 0.13), rough=0.8)
mk("asphalt", (0.05, 0.05, 0.055), rough=0.95)
mk("brick", (0.3, 0.09, 0.05), rough=0.95)
mk("gold", (0.75, 0.52, 0.18), rough=0.35, metal=0.9)
mk("brass", (0.6, 0.42, 0.16), rough=0.4, metal=0.85)
mk("wood", (0.28, 0.14, 0.06), rough=0.55)
mk("wood_light", (0.55, 0.36, 0.18), rough=0.6)
mk("steel", (0.45, 0.46, 0.48), rough=0.4, metal=0.8)
mk("steel_dark", (0.06, 0.065, 0.07), rough=0.5, metal=0.6)
mk("paint_grey", (0.24, 0.25, 0.27), rough=0.5, metal=0.3)
mk("paint_green", (0.12, 0.2, 0.15), rough=0.5, metal=0.3)
mk("paint_cream", (0.7, 0.62, 0.46), rough=0.5, metal=0.2)
mk("black", (0.01, 0.01, 0.012), rough=0.7)
mk("rubber", (0.015, 0.015, 0.015), rough=0.9)
mk("glass", (0.6, 0.7, 0.75), rough=0.05, alpha=0.18)
mk("velvet", (0.36, 0.02, 0.04), rough=1.0)
mk("seat_red", (0.42, 0.03, 0.05), rough=0.9)
mk("screen", (0.85, 0.85, 0.85), rough=0.9)
mk("mask", (0.005, 0.005, 0.005), rough=1.0)
mk("bulb", (1.0, 0.85, 0.55), emit=(1.0, 0.8, 0.45), es=6.0)
mk("lamp_warm", (1.0, 0.8, 0.55), emit=(1.0, 0.75, 0.45), es=3.0)
mk("neon_red", (1.0, 0.2, 0.15), emit=(1.0, 0.15, 0.1), es=5.0)
mk("exit_green", (0.2, 1.0, 0.3), emit=(0.1, 1.0, 0.25), es=3.0)
mk("aisle_light", (1.0, 0.7, 0.3), emit=(1.0, 0.6, 0.2), es=2.0)
mk("led_green", (0.1, 1.0, 0.2), emit=(0.1, 1.0, 0.2), es=4.0)
mk("led_red", (1.0, 0.1, 0.05), emit=(1.0, 0.1, 0.05), es=4.0)
mk("sign", (0.9, 0.85, 0.75), rough=0.6)            # JS paints canvases on quads that use this
mk("poster", (0.9, 0.9, 0.9), rough=0.6)             # JS swaps the map per frame
mk("cardboard", (0.45, 0.3, 0.15), rough=0.95)
mk("tape", (0.7, 0.6, 0.4), rough=0.5)
mk("film", (0.06, 0.04, 0.02), rough=0.35, metal=0.2)
mk("reel_alu", (0.62, 0.63, 0.66), rough=0.35, metal=0.9)
mk("can_tin", (0.5, 0.5, 0.52), rough=0.45, metal=0.85)
mk("case_blue", (0.08, 0.16, 0.38), rough=0.6)
mk("popcorn", (0.95, 0.82, 0.45), rough=0.9)
mk("popcorn_red", (0.65, 0.05, 0.04), rough=0.5)
mk("soda_red", (0.6, 0.03, 0.03), rough=0.4)
mk("plastic_white", (0.8, 0.8, 0.78), rough=0.5)
mk("crt", (0.08, 0.2, 0.12), emit=(0.15, 0.55, 0.25), es=1.2)
mk("beige", (0.62, 0.57, 0.46), rough=0.6)
mk("plywood", (0.55, 0.4, 0.22), rough=0.9)
mk("skin", (0.8, 0.55, 0.4), rough=0.6)
mk("cloth_top", (0.6, 0.1, 0.1), rough=0.9)
mk("cloth_bottom", (0.08, 0.1, 0.2), rough=0.9)
mk("shoe", (0.05, 0.035, 0.03), rough=0.6)
mk("hair", (0.12, 0.07, 0.03), rough=0.8)
mk("eye", (0.01, 0.01, 0.01), rough=0.2)
mk("eye_white", (0.95, 0.95, 0.95), rough=0.4)
mk("hat", (0.6, 0.08, 0.06), rough=0.8)
mk("lens", (0.05, 0.08, 0.12), rough=0.05, metal=0.5)
mk("candy_0", (0.75, 0.1, 0.1)); mk("candy_1", (0.1, 0.35, 0.7)); mk("candy_2", (0.85, 0.65, 0.1))
mk("candy_3", (0.1, 0.5, 0.2)); mk("candy_4", (0.45, 0.12, 0.5)); mk("candy_5", (0.9, 0.4, 0.1))

# ======================================================================================================
# SHELL
# ======================================================================================================
def build_shell():
    lob, hall, booth, st, off, sto = L["lobby"], L["hall"], L["booth"], L["stairs"], L["office"], L["stock"]
    A = L["aud"]
    BY = booth["y"]; TOP = booth["top"]
    main = []

    # --- floors
    main.append(sbox("lobby_floor", lob["x0"], lob["x1"], -0.1, 0, lob["z0"], lob["z1"], M["carpet"]))
    main.append(sbox("hall_floor", hall["x0"], hall["x1"], -0.1, 0, hall["z0"], hall["z1"], M["carpet"]))
    main.append(sbox("office_floor", off["x0"], off["x1"], -0.1, 0, off["z0"], off["z1"], M["wood"]))
    main.append(sbox("stock_floor", sto["x0"], sto["x1"], -0.1, 0, sto["z0"], sto["z1"], M["concrete"]))
    # booth slab over the hall + balcony over the back of the lobby
    main.append(sbox("booth_slab", hall["x0"], hall["x1"], hall["h"], BY, hall["z0"], hall["z1"], M["floor_booth"]))
    main.append(sbox("balcony_slab", lob["x0"], lob["x1"], hall["h"], BY, 0, booth["balconyZ1"], M["floor_booth"]))
    main.append(sbox("balcony_fascia", lob["x0"], lob["x1"], hall["h"] - 0.25, BY + 0.02, booth["balconyZ1"] - 0.05, booth["balconyZ1"] + 0.05, M["wainscot"]))
    main.append(sbox("balcony_trim", lob["x0"], lob["x1"], hall["h"] - 0.3, hall["h"] - 0.25, booth["balconyZ1"] - 0.06, booth["balconyZ1"] + 0.07, M["gold"]))

    # --- ceilings
    main.append(sbox("lobby_ceiling", lob["x0"], lob["x1"], lob["h"], lob["h"] + 0.1, booth["balconyZ1"], lob["z1"], M["ceiling"]))
    main.append(sbox("booth_ceiling", hall["x0"], hall["x1"], TOP, TOP + 0.1, hall["z0"], booth["balconyZ1"], M["ceiling_dark"]))
    main.append(sbox("office_ceiling", off["x0"], off["x1"], off["h"], off["h"] + 0.1, off["z0"], off["z1"], M["ceiling"]))
    main.append(sbox("stock_ceiling", sto["x0"], sto["x1"], sto["h"], sto["h"] + 0.1, sto["z0"], sto["z1"], M["concrete"]))
    # coffered beams on the lobby ceiling
    for z in (4.5, 7.5, 10.5):
        main.append(sbox("beam", lob["x0"], lob["x1"], lob["h"] - 0.35, lob["h"], z - 0.18, z + 0.18, M["wainscot"]))
        main.append(sbox("beam_trim", lob["x0"], lob["x1"], lob["h"] - 0.38, lob["h"] - 0.35, z - 0.2, z + 0.2, M["gold"]))

    # --- lobby walls
    fd = L["frontDoor"]
    # front wall: doors + two big windows
    main += wall("front_wall", "x", lob["z1"], lob["x0"], lob["x1"], 0, lob["h"], M["wall_lobby"],
                 [(fd[0], fd[1], 0, 2.7), (-6.6, -2.6, 0.9, 2.6), (2.6, 6.6, 0.9, 2.6)])
    for x0, x1 in ((-6.6, -2.6), (2.6, 6.6)):
        main.append(sbox("window_frame", x0 - 0.06, x1 + 0.06, 0.84, 0.9, lob["z1"] - 0.15, lob["z1"] + 0.15, M["brass"]))
    # left wall (office door, stairs run along it)
    main += wall("left_wall", "z", lob["x0"], lob["z0"], lob["z1"], 0, lob["h"], M["wall_lobby"], [(off["door"][0], off["door"][1], 0, 2.3)])
    # right wall (stockroom door)
    main += wall("right_wall", "z", lob["x1"], lob["z0"], lob["z1"], 0, lob["h"], M["wall_lobby"], [(sto["door"][0], sto["door"][1], 0, 2.3)])
    # back wall (arch to the theatres), only up to the hall ceiling; above it the booth balcony is open
    ar = L["arch"]
    main += wall("back_wall", "x", 0, lob["x0"], lob["x1"], 0, hall["h"], M["wall_lobby"], [(ar[0], ar[1], 0, 2.6)])
    # wainscot + chair rail on lobby walls (inside faces)
    wz = 1.15
    for (x0, x1, z0, z1) in ((lob["x0"] + 0.1, lob["x0"] + 0.16, 0.1, lob["z1"] - 0.1), (lob["x1"] - 0.16, lob["x1"] - 0.1, 0.1, lob["z1"] - 0.1)):
        for (a, b) in ((z0, off["door"][0] if x0 < 0 else sto["door"][0]), (off["door"][1] if x0 < 0 else sto["door"][1], z1)):
            main.append(sbox("wainscot", x0, x1, 0, wz, a, b, M["wainscot"]))
            main.append(sbox("rail", x0 - 0.02, x1 + 0.02, wz, wz + 0.06, a, b, M["gold"]))
    for (a, b) in ((lob["x0"] + 0.1, fd[0]), (fd[1], lob["x1"] - 0.1)):
        main.append(sbox("wainscot", a, b, 0, 0.9, lob["z1"] - 0.16, lob["z1"] - 0.1, M["wainscot"]))
    for (a, b) in ((lob["x0"] + 0.1, ar[0]), (ar[1], lob["x1"] - 0.1)):
        main.append(sbox("wainscot", a, b, 0, wz, 0.1, 0.16, M["wainscot"]))
        main.append(sbox("rail", a, b, wz, wz + 0.06, 0.08, 0.18, M["gold"]))
    # art deco pilasters on the side walls
    for z in (3.0, 6.0, 9.0):
        for x, s in ((lob["x0"] + 0.1, 1), (lob["x1"] - 0.1, -1)):
            if x < 0 and z < 7.3:
                continue  # stairs side, keep it clean
            main.append(sbox("pilaster", x, x + s * 0.18, 0, lob["h"] - 0.4, z - 0.25, z + 0.25, M["wainscot"]))
            main.append(sbox("pilaster_gold", x, x + s * 0.2, lob["h"] - 1.2, lob["h"] - 1.1, z - 0.3, z + 0.3, M["gold"]))
    # arch columns
    for x in (ar[0], ar[1]):
        main.append(cyl("column", 0.22, 2.9, T(x, 1.45, 0.25), M["wainscot"], n=20))
        main.append(cyl("column_cap", 0.28, 0.12, T(x, 2.9, 0.25), M["gold"], n=20))
        main.append(cyl("column_base", 0.28, 0.12, T(x, 0.06, 0.25), M["gold"], n=20))

    # --- stairs to the booth (rise toward -z along the left wall)
    n = st["steps"]
    run = (st["zLow"] - st["zHigh"]) / n
    for i in range(n):
        y1 = BY * (i + 1) / n
        z0 = st["zLow"] - run * (i + 1)
        main.append(sbox("stair", st["x0"], st["x1"], 0, y1, z0, z0 + run, M["carpet"]))
        main.append(sbox("nosing", st["x0"], st["x1"], y1 - 0.03, y1 + 0.005, z0 + run - 0.04, z0 + run + 0.01, M["brass"]))
    # stair stringer + handrail on the open side
    for i in range(9):
        z = st["zLow"] - (st["zLow"] - st["zHigh"]) * i / 8
        y = BY * i / 8
        main.append(cyl("baluster", 0.025, 0.95, T(st["x1"] + 0.05, y + 0.48, z), M["brass"], n=6))
    hr_len = math.hypot(st["zLow"] - st["zHigh"], BY)
    ang = math.atan2(BY, st["zLow"] - st["zHigh"])
    main.append(cyl("handrail", 0.035, hr_len, T(st["x1"] + 0.05, BY / 2 + 0.95, (st["zLow"] + st["zHigh"]) / 2), M["brass"], n=8, rot=(PI / 2 + ang, 0, 0)))
    # balcony railing (gap above the stair top)
    bz = booth["balconyZ1"]
    main.append(sbox("rail_top", st["x1"] + 0.1, lob["x1"], BY + 1.0, BY + 1.06, bz - 0.04, bz + 0.04, M["brass"]))
    for i in range(int((lob["x1"] - st["x1"]) / 0.5) + 1):
        x = st["x1"] + 0.1 + i * 0.5
        main.append(cyl("rail_post", 0.02, 1.0, T(x, BY + 0.5, bz), M["brass"], n=6))
    main.append(sbox("rail_panel", st["x1"] + 0.1, lob["x1"], BY, BY + 0.35, bz - 0.02, bz + 0.02, M["wainscot"]))

    # --- hall walls
    main += wall("hall_front", "x", 0, hall["x0"], lob["x0"], 0, TOP, M["wall_booth"], [])
    main += wall("hall_front", "x", 0, lob["x1"], hall["x1"], 0, TOP, M["wall_booth"], [])
    main += wall("hall_end", "z", hall["x0"], hall["z0"], 0, 0, TOP, M["wall_plain"], [])
    main += wall("hall_end", "z", hall["x1"], hall["z0"], 0, 0, TOP, M["wall_plain"], [])
    # booth wall above the lobby balcony sides is the lobby side wall (already up to 6 m)
    # aud back wall: doors at ground, projection ports up in the booth
    opens = []
    for a in L["auds"]:
        cx = a["cx"]
        opens.append((cx + A["door"]["x0"], cx + A["door"]["x1"], 0, A["door"]["h"]))
        for dx in A["ports"]:
            opens.append((cx + dx - A["portW"] / 2, cx + dx + A["portW"] / 2, A["portY"][0], A["portY"][1]))
    main += wall("aud_back_wall", "x", hall["z0"], hall["x0"], hall["x1"], 0, hall["h"], M["wall_plain"], opens)
    main += wall("booth_back_wall", "x", hall["z0"], hall["x0"], hall["x1"], hall["h"], A["h"], M["wall_booth"], opens)
    # hall wainscot + booth wall finish on the booth side
    main.append(sbox("hall_wainscot", hall["x0"], hall["x1"], 0, 1.0, hall["z0"] + 0.1, hall["z0"] + 0.15, M["wainscot"]))
    main.append(sbox("booth_skirting", hall["x0"], hall["x1"], BY, BY + 0.15, hall["z0"] + 0.1, hall["z0"] + 0.13, M["black"]))
    for a in L["auds"]:
        cx = a["cx"]
        for dx in A["ports"]:
            main.append(sbox("port_glass", cx + dx - A["portW"] / 2, cx + dx + A["portW"] / 2, A["portY"][0], A["portY"][1], hall["z0"] - 0.02, hall["z0"] + 0.02, M["glass"]))
        # door frame + EXIT-style lit number box above each auditorium door
        dx0, dx1 = cx + A["door"]["x0"], cx + A["door"]["x1"]
        main.append(sbox("door_frame", dx0 - 0.08, dx0, 0, A["door"]["h"] + 0.08, hall["z0"] + 0.1, hall["z0"] + 0.18, M["brass"]))
        main.append(sbox("door_frame", dx1, dx1 + 0.08, 0, A["door"]["h"] + 0.08, hall["z0"] + 0.1, hall["z0"] + 0.18, M["brass"]))
        main.append(sbox("door_frame", dx0 - 0.08, dx1 + 0.08, A["door"]["h"], A["door"]["h"] + 0.08, hall["z0"] + 0.1, hall["z0"] + 0.18, M["brass"]))

    # --- office + stockroom
    main += wall("office_wall", "x", off["z0"], off["x0"], off["x1"], 0, off["h"], M["wall_plain"])
    main += wall("office_wall", "x", off["z1"], off["x0"], off["x1"], 0, off["h"], M["wall_plain"])
    main += wall("office_wall", "z", off["x0"], off["z0"], off["z1"], 0, off["h"], M["wall_plain"])
    main += wall("stock_wall", "x", sto["z1"], sto["x0"], sto["x1"], 0, sto["h"], M["wall_plain"])
    main += wall("stock_wall", "z", sto["x1"], sto["z0"], sto["z1"], 0, sto["h"], M["wall_plain"], [(3.2, 6.0, 0, 2.8)])
    main.append(sbox("roll_door", sto["x1"] - 0.05, sto["x1"] + 0.05, 0, 2.8, 3.2, 6.0, M["paint_grey"]))
    for i in range(14):
        main.append(sbox("roll_rib", sto["x1"] - 0.08, sto["x1"] - 0.05, 0.1 + i * 0.2, 0.13 + i * 0.2, 3.2, 6.0, M["steel"]))
    # stock shelving rack against the far wall
    for z in (1.2, 6.8):
        for y in (0.1, 0.9, 1.7, 2.5):
            main.append(sbox("shelf", sto["x1"] - 1.0, sto["x1"] - 0.2, y, y + 0.05, z - 0.9, z + 0.9, M["steel"]))
        for dz in (-0.9, 0.9):
            for dx in (-1.0, -0.2):
                main.append(sbox("shelf_post", sto["x1"] + dx - 0.03, sto["x1"] + dx + 0.03, 0, 2.6, z + dz - 0.03, z + dz + 0.03, M["paint_green"]))

    # --- counters
    bc = L["boxCounter"]
    main.append(sbox("box_counter", bc["x0"], bc["x1"], 0, bc["h"] - 0.05, bc["z0"], bc["z1"], M["wainscot"]))
    main.append(sbox("box_counter_top", bc["x0"] - 0.05, bc["x1"] + 0.05, bc["h"] - 0.05, bc["h"], bc["z0"] - 0.05, bc["z1"] + 0.08, M["gold"]))
    main.append(sbox("box_glass", bc["x0"], bc["x1"], bc["h"], 2.3, bc["z1"] - 0.02, bc["z1"] + 0.02, M["glass"]))
    main.append(sbox("box_glass_frame", bc["x0"], bc["x1"], 2.3, 2.45, bc["z0"] - 0.05, bc["z1"] + 0.05, M["wainscot"]))
    for x in (bc["x0"], bc["x1"]):
        main.append(sbox("box_post", x - 0.05, x + 0.05, bc["h"], 2.3, bc["z1"] - 0.05, bc["z1"] + 0.05, M["brass"]))
    cc = L["conCounter"]
    main.append(sbox("con_counter_base", cc["x0"], cc["x1"], 0, 0.45, cc["z0"], cc["z1"], M["wainscot"]))
    main.append(sbox("con_case_glass", cc["x0"], cc["x1"], 0.45, cc["h"] - 0.04, cc["z1"] - 0.03, cc["z1"], M["glass"]))
    main.append(sbox("con_case_back", cc["x0"], cc["x1"], 0.45, 0.47, cc["z0"], cc["z1"], M["wood_light"]))
    main.append(sbox("con_case_shelf", cc["x0"], cc["x1"], 0.72, 0.74, cc["z0"] + 0.25, cc["z1"] - 0.05, M["glass"]))
    main.append(sbox("con_counter_top", cc["x0"] - 0.05, cc["x1"] + 0.05, cc["h"] - 0.04, cc["h"], cc["z0"] - 0.05, cc["z1"] + 0.05, M["gold"]))
    for x in (cc["x0"], cc["x1"]):
        main.append(sbox("con_end", x - 0.04, x + 0.04, 0.45, cc["h"] - 0.04, cc["z0"], cc["z1"], M["wainscot"]))
    bk = L["backCounter"]
    main.append(sbox("back_counter", bk["x0"], bk["x1"], 0, bk["h"] - 0.04, bk["z0"], bk["z1"], M["wainscot"]))
    main.append(sbox("back_counter_top", bk["x0"], bk["x1"], bk["h"] - 0.04, bk["h"], bk["z0"], bk["z1"] + 0.04, M["steel"]))

    # --- signage quads (JS paints them)
    signs = [
        ("sign_tickets", 3.0, 0.7, T((bc["x0"] + bc["x1"]) / 2, 2.85, bc["z1"]), (PI / 2, 0, 0)),
        ("sign_concessions", 4.2, 0.8, T((cc["x0"] + cc["x1"]) / 2, 2.55, 0.12), (PI / 2, 0, 0)),
        ("menu_board", 3.6, 1.1, T(5.2, 2.0, 0.13), (PI / 2, 0, 0)),
        ("sign_theatres", 3.2, 0.55, T((ar[0] + ar[1]) / 2, 2.72, 0.12), (PI / 2, 0, 0)),
        ("sign_booth", 1.6, 1.0, T(-4.6, BY + 1.6, 0.0), (PI / 2, 0, 0)),
        ("sign_rules", 1.2, 1.6, T(lob["x1"] - 0.12, BY + 1.5, 1.0), (PI / 2, 0, PI / 2)),
        ("sign_office", 0.7, 0.25, T(lob["x0"] + 0.12, 2.55, (off["door"][0] + off["door"][1]) / 2), (PI / 2, 0, -PI / 2)),
        ("sign_stock", 0.7, 0.25, T(lob["x1"] - 0.12, 2.55, (sto["door"][0] + sto["door"][1]) / 2), (PI / 2, 0, PI / 2)),
        ("coming_soon", 1.0, 1.5, T(lob["x1"] - 0.13, 1.85, 6.6), (PI / 2, 0, PI / 2)),
        ("coming_soon_2", 1.0, 1.5, T(lob["x1"] - 0.13, 1.85, 9.4), (PI / 2, 0, PI / 2)),
    ]
    for name, w, h, loc, rot in signs:
        q = quad(name, w, h, loc, M["sign"] if not name.startswith("coming") else M["poster"], rot)
        q["sign"] = 1
    # light-box frames around the two lobby coming-soon posters
    for z in (6.6, 9.4):
        x = lob["x1"] - 0.1
        main.append(sbox("lightbox", x - 0.03, x, 1.0, 2.7, z - 0.6, z + 0.6, M["black"]))
        main.append(sbox("lightbox_trim", x - 0.06, x, 1.0, 1.05, z - 0.6, z + 0.6, M["gold"]))
        main.append(sbox("lightbox_trim", x - 0.06, x, 2.65, 2.7, z - 0.6, z + 0.6, M["gold"]))
        main.append(sbox("lightbox_trim", x - 0.06, x, 1.0, 2.7, z - 0.65, z - 0.6, M["gold"]))
        main.append(sbox("lightbox_trim", x - 0.06, x, 1.0, 2.7, z + 0.6, z + 0.65, M["gold"]))

    # --- exterior: sidewalk, street, facade, marquee
    main.append(sbox("sidewalk", -30, 30, -0.1, 0.02, 12, 17, M["concrete"]))
    main.append(sbox("curb", -30, 30, -0.2, 0.1, 17, 17.25, M["concrete"]))
    main.append(sbox("street", -30, 30, -0.25, -0.15, 17.25, 30, M["asphalt"]))
    for x in range(-28, 30, 4):
        main.append(sbox("lane", x, x + 2, -0.149, -0.145, 23.5, 23.65, M["paint_cream"]))
    main.append(sbox("facade", -14, 14, lob["h"], 9, lob["z1"], lob["z1"] + 0.35, M["brick"]))
    main.append(sbox("facade_l", -14, lob["x0"], 0, lob["h"], lob["z1"], lob["z1"] + 0.35, M["brick"]))
    main.append(sbox("facade_r", lob["x1"], 14, 0, lob["h"], lob["z1"], lob["z1"] + 0.35, M["brick"]))
    main.append(sbox("facade_cornice", -14.2, 14.2, 8.8, 9.2, lob["z1"], lob["z1"] + 0.6, M["paint_cream"]))
    # marquee canopy
    mz0, mz1 = lob["z1"] + 0.1, lob["z1"] + 2.6
    main.append(sbox("marquee_body", -5.5, 5.5, 3.3, 4.7, mz0, mz1, M["paint_cream"]))
    main.append(sbox("marquee_under", -5.5, 5.5, 3.25, 3.3, mz0, mz1, M["gold"]))
    for y in (3.3, 4.7):
        main.append(sbox("marquee_band", -5.6, 5.6, y - 0.05, y + 0.05, mz1 - 0.05, mz1 + 0.05, M["neon_red"]))
    q = quad("marquee_panel", 10.4, 1.15, T(0, 4.0, mz1 + 0.01), M["sign"]); q["sign"] = 1
    for side in (-1, 1):
        q = quad("marquee_side", 2.3, 1.15, T(side * 5.51, 4.0, (mz0 + mz1) / 2), M["sign"], (PI / 2, 0, side * PI / 2))
        q.name = "marquee_side_l" if side < 0 else "marquee_side_r"
    bulbs = []
    for i in range(44):
        x = -5.4 + i * (10.8 / 43)
        bulbs.append(sph("bulb", 0.05, T(x, 3.32, mz1 + 0.02), M["bulb"], seg=6, rings=4))
        bulbs.append(sph("bulb", 0.05, T(x, 4.68, mz1 + 0.02), M["bulb"], seg=6, rings=4))
    # vertical blade sign
    main.append(sbox("blade", -0.12, 0.12, 4.9, 8.6, lob["z1"] + 0.35, lob["z1"] + 1.5, M["paint_cream"]))
    for side in (-1, 1):
        q = quad("blade_panel", 1.0, 3.5, T(side * 0.125, 6.75, lob["z1"] + 0.93), M["sign"], (PI / 2, 0, side * PI / 2))
        q.name = "blade_l" if side < 0 else "blade_r"
    for i in range(18):
        y = 5.0 + i * 0.2
        for z in (lob["z1"] + 0.38, lob["z1"] + 1.47):
            for side in (-1, 1):
                bulbs.append(sph("bulb", 0.035, T(side * 0.13, y, z), M["bulb"], seg=6, rings=4))
    bulbs_o = join(bulbs, "bulbs")
    # neighbouring buildings and the box office window on the street
    for x0, x1, h, m in ((-30, -14, 11, "brick"), (14, 30, 8, "wall_plain")):
        main.append(sbox("neighbour", x0, x1, 0, h, 0.3, 12.3, M[m]))
        for wx in range(int(x0) + 2, int(x1) - 1, 3):
            for wy in (2.5, 5.5, 8.5):
                if wy + 1.2 < h:
                    main.append(sbox("nwindow", wx, wx + 1.4, wy, wy + 1.6, 12.3, 12.35, M["lamp_warm"] if (wx + int(wy)) % 3 else M["black"]))
    # streetlamps
    for x in (-10, 10):
        main.append(cyl("lamppost", 0.07, 4.5, T(x, 2.25, 16.4), M["steel_dark"], n=8))
        main.append(sph("lampglobe", 0.25, T(x, 4.6, 16.4), M["lamp_warm"], seg=10, rings=6))

    shell = join(main, "shell_main")
    shell_objs = [shell, bulbs_o]

    # --- auditoriums (each its own object so JS can hide the locked ones)
    for a in L["auds"]:
        shell_objs += build_aud(a)
    return shell_objs

def build_aud(a):
    A = L["aud"]
    cx = a["cx"]
    k = a["id"]
    x0, x1 = cx - A["w"] / 2, cx + A["w"] / 2
    z0, z1 = A["z0"], A["z1"]   # z0 = back (hall side), z1 = front (screen side)
    p = []
    p.append(sbox("afloor", x0, x1, -0.1, 0, z1, z0, M["carpet_aud"]))
    p.append(sbox("aceil", x0, x1, A["h"], A["h"] + 0.1, z1, z0, M["ceiling_dark"]))
    # side walls inset so neighbours never z-fight
    p.append(sbox("aside", x0 + 0.1, x0 + 0.2, 0, A["h"], z1, z0 - 0.1, M["wall_aud"]))
    p.append(sbox("aside", x1 - 0.2, x1 - 0.1, 0, A["h"], z1, z0 - 0.1, M["wall_aud"]))
    p.append(sbox("afront", x0 + 0.1, x1 - 0.1, 0, A["h"], z1 - 0.2, z1, M["wall_aud"]))
    # acoustic panels / pleated drapes on the side walls
    for i in range(10):
        z = z1 + 0.7 + i * 1.3
        for xw, s in ((x0 + 0.2, 1), (x1 - 0.2, -1)):
            p.append(sbox("drape", xw, xw + s * 0.08, 0.2, A["h"] - 0.3, z, z + 0.55, M["velvet"]))
    # wall sconces
    for z in (-6.0, -10.0, -14.0):
        for xw, s in ((x0 + 0.2, 1), (x1 - 0.2, -1)):
            p.append(sbox("sconce", xw, xw + s * 0.12, 3.0, 3.35, z - 0.15, z + 0.15, M["lamp_warm"]))
    # stage + screen masking
    S = A["screen"]
    p.append(sbox("stage", x0 + 0.2, x1 - 0.2, 0, 0.6, z1, z1 + 1.4, M["wainscot"]))
    p.append(sbox("stage_lip", x0 + 0.2, x1 - 0.2, 0.55, 0.62, z1 + 1.35, z1 + 1.45, M["gold"]))
    sx0, sx1 = cx - S["w"] / 2, cx + S["w"] / 2
    mz = S["z"] + 0.03
    p.append(sbox("mask", sx0 - 0.4, sx0, S["y"] - 0.4, S["y"] + S["h"] + 0.4, mz, mz + 0.04, M["mask"]))
    p.append(sbox("mask", sx1, sx1 + 0.4, S["y"] - 0.4, S["y"] + S["h"] + 0.4, mz, mz + 0.04, M["mask"]))
    p.append(sbox("mask", sx0, sx1, S["y"] + S["h"], S["y"] + S["h"] + 0.4, mz, mz + 0.04, M["mask"]))
    p.append(sbox("mask", sx0, sx1, S["y"] - 0.4, S["y"], mz, mz + 0.04, M["mask"]))
    # proscenium curtains
    for side in (-1, 1):
        xc = cx + side * (S["w"] / 2 + 0.75)
        for j in range(5):
            p.append(cyl("curtain", 0.13, A["h"] - 0.2, T(xc + side * (j - 2) * 0.2, (A["h"] - 0.2) / 2, S["z"] + 0.35 + (j % 2) * 0.08), M["velvet"], n=8))
    p.append(sbox("valance", x0 + 0.2, x1 - 0.2, S["y"] + S["h"] + 0.5, A["h"], S["z"] + 0.2, S["z"] + 0.5, M["velvet"]))
    p.append(sbox("valance_trim", x0 + 0.2, x1 - 0.2, S["y"] + S["h"] + 0.48, S["y"] + S["h"] + 0.55, S["z"] + 0.48, S["z"] + 0.53, M["gold"]))
    # seats
    for zr in A["rows"]:
        for i in range(A["seats"]):
            x = cx + A["seatX0"] + i * A["seatDX"]
            p += seat_parts(x, zr)
        # row-end aisle light
        p.append(sbox("aisle_light", cx + A["aisleX"] - 0.55, cx + A["aisleX"] - 0.45, 0.05, 0.12, zr - 0.05, zr + 0.05, M["aisle_light"]))
    # inner back wall (velvet) with the door and the two projection ports cut out
    opens = [(cx + A["door"]["x0"], cx + A["door"]["x1"], 0, A["door"]["h"])] + [(cx + dx - A["portW"] / 2, cx + dx + A["portW"] / 2, A["portY"][0], A["portY"][1]) for dx in A["ports"]]
    p += wall("aback", "x", z0 - 0.16, x0 + 0.2, x1 - 0.2, 0, A["h"], M["wall_aud"], opens, t=0.06)
    # exit sign over the door (inside)
    dxm = cx + (A["door"]["x0"] + A["door"]["x1"]) / 2
    p.append(sbox("exit", dxm - 0.3, dxm + 0.3, A["door"]["h"] + 0.15, A["door"]["h"] + 0.4, z0 - 0.15, z0 - 0.1, M["exit_green"]))
    aud = join(p, f"aud_{k}")
    # screen surface (JS gives it the projected image)
    scr = quad(f"screen_{k}", S["w"], S["h"], T(cx, S["y"] + S["h"] / 2, S["z"]), M["screen"])
    # door + COMING SOON board in the hall
    hz = L["hall"]["z0"]
    dx0, dx1 = cx + A["door"]["x0"], cx + A["door"]["x1"]
    door = join([sbox("door", dx0, dx1, 0, A["door"]["h"], hz - 0.04, hz + 0.04, M["wainscot"]),
                 sbox("door_win", (dx0 + dx1) / 2 - 0.12, (dx0 + dx1) / 2 + 0.12, 1.5, 1.8, hz + 0.04, hz + 0.05, M["brass"]),
                 sbox("door_push", dx0 + 0.15, dx1 - 0.15, 1.0, 1.08, hz + 0.04, hz + 0.08, M["brass"])], f"door_{k}")
    soon = join([sbox("board", dx0 - 0.2, dx1 + 0.2, 0, A["door"]["h"] + 0.2, hz + 0.08, hz + 0.12, M["plywood"]),
                 sbox("plank", dx0 - 0.3, dx1 + 0.3, 0.6, 0.8, hz + 0.12, hz + 0.16, M["plywood"]),
                 sbox("plank", dx0 - 0.3, dx1 + 0.3, 1.7, 1.9, hz + 0.12, hz + 0.16, M["plywood"])], f"soon_{k}")
    soon_sign = quad(f"soon_sign_{k}", 1.0, 0.5, T((dx0 + dx1) / 2, 1.25, hz + 0.17), M["sign"])
    # poster light box beside the door (hall side)
    px = cx + A["poster"]["dx"]
    py = A["poster"]["y"]
    frame = join([sbox("pframe", px - 0.55, px + 0.55, py - 0.8, py + 0.8, hz + 0.08, hz + 0.14, M["black"]),
                  sbox("ptrim", px - 0.58, px + 0.58, py + 0.77, py + 0.83, hz + 0.08, hz + 0.18, M["gold"]),
                  sbox("ptrim", px - 0.58, px + 0.58, py - 0.83, py - 0.77, hz + 0.08, hz + 0.18, M["gold"]),
                  sbox("ptrim", px - 0.58, px - 0.52, py - 0.8, py + 0.8, hz + 0.08, hz + 0.18, M["gold"]),
                  sbox("ptrim", px + 0.52, px + 0.58, py - 0.8, py + 0.8, hz + 0.08, hz + 0.18, M["gold"])], f"pframe_{k}")
    face = quad(f"poster_{k}", 0.96, 1.44, T(px, py, hz + 0.15), M["poster"])
    num = quad(f"screen_no_{k}", 0.5, 0.3, T((dx0 + dx1) / 2, A["door"]["h"] + 0.3, hz + 0.19), M["sign"])
    return [aud, scr, door, soon, soon_sign, frame, face, num]

def seat_parts(x, z):
    """One theatre seat in three.js coords facing -z (toward the screen)."""
    w = 0.56
    return [
        sbox("seat_base", x - 0.03, x + 0.03, 0, 0.42, z - 0.05, z + 0.05, M["steel_dark"]),
        sbox("seat_cush", x - w / 2, x + w / 2, 0.38, 0.5, z - 0.25, z + 0.22, M["seat_red"]),
        sbox("seat_back", x - w / 2, x + w / 2, 0.45, 1.05, z + 0.18, z + 0.3, M["seat_red"]),
        sbox("seat_backshell", x - w / 2 - 0.01, x + w / 2 + 0.01, 0.45, 1.06, z + 0.29, z + 0.33, M["black"]),
        sbox("seat_arm", x + w / 2 - 0.02, x + w / 2 + 0.04, 0.0, 0.66, z - 0.22, z + 0.28, M["black"]),
    ]

# ======================================================================================================
# LIBRARY (front faces Blender -Y = three.js +Z; origin bottom centre)
# ======================================================================================================
def reel_mesh(name, r, w=0.045, m_film=None, fill=0.75):
    """Film reel with its axis along Blender X (stands up like on a projector arm)."""
    parts = []
    for sx in (-1, 1):
        d = cyl("flange", r, 0.006, (sx * w / 2, 0, 0), M["reel_alu"], n=24, rot=(0, PI / 2, 0))
        parts.append(d)
    parts.append(cyl("hub", 0.06, w, (0, 0, 0), M["reel_alu"], n=12, rot=(0, PI / 2, 0)))
    if fill > 0:
        parts.append(cyl("film", 0.07 + (r - 0.08) * fill, w - 0.01, (0, 0, 0), m_film or M["film"], n=24, rot=(0, PI / 2, 0)))
    # spoke windows painted as dark wedges on the flange faces
    for i in range(3):
        a = i * 2 * PI / 3
        for sx in (-1, 1):
            parts.append(box("spoke_win", (0.002, r * 0.35, r * 0.25), (sx * (w / 2 + 0.004), math.cos(a) * r * 0.55, math.sin(a) * r * 0.55), M["black"], rot=(a, 0, 0)))
    return join(parts, name)

def build_proj35():
    parts = [
        box("ped_base", (0.6, 0.9, 0.08), (0, 0, 0.04), M["paint_green"]),
        box("ped_col", (0.32, 0.5, 0.75), (0, 0.05, 0.45), M["paint_green"]),
        box("magazine", (0.12, 0.8, 0.8), (0.0, 0.0, 0.62), M["paint_green"]),
        box("head", (0.34, 0.5, 0.42), (0, -0.05, 1.05), M["paint_green"]),
        box("head_door", (0.02, 0.36, 0.3), (-0.18, -0.05, 1.05), M["paint_cream"]),
        box("lamphouse", (0.46, 0.62, 0.6), (0, 0.48, 1.12), M["paint_grey"]),
        box("lamp_door", (0.02, 0.4, 0.4), (-0.24, 0.48, 1.12), M["steel"]),
        cyl("chimney", 0.08, 0.95, (0, 0.55, 1.88), M["steel"], n=12),
        cyl("chimney_top", 0.11, 0.08, (0, 0.55, 2.38), M["steel"], n=12),
        cyl("lens_mount", 0.075, 0.08, (0, -0.34, 1.05), M["steel_dark"], n=16, rot=(PI / 2, 0, 0)),
        cyl("lens", 0.055, 0.24, (0, -0.48, 1.05), M["steel"], n=16, rot=(PI / 2, 0, 0)),
        cyl("lens_glass", 0.045, 0.01, (0, -0.605, 1.05), M["lens"], n=16, rot=(PI / 2, 0, 0)),
        box("soundhead", (0.3, 0.3, 0.2), (0, -0.05, 0.75), M["paint_grey"]),
        box("upper_arm", (0.05, 0.08, 0.55), (0.0, -0.05, 1.5), M["steel_dark"]),
        box("douser", (0.12, 0.03, 0.12), (0, -0.33, 1.15), M["black"]),
        box("lamp_vent", (0.3, 0.02, 0.1), (0, 0.8, 1.3), M["black"]),
    ]
    for i in range(3):
        parts.append(box("vent_slot", (0.002, 0.4, 0.02), (0.232, 0.48, 1.0 + i * 0.06), M["black"]))
    body = join(parts, "proj35")
    # reels as children so JS can spin / hide them
    up = reel_mesh("reel_up", 0.42)
    child(up, body, (0, -0.05, 2.0))
    lo = reel_mesh("reel_lo", 0.36, fill=0.3)
    child(lo, body, (0.1, 0.0, 0.62))
    # threaded film path: thin strips from upper reel into the head and down to the magazine
    fp = join([box("fp", (0.03, 0.01, 0.55), (0, -0.24, 1.55), M["film"]),
               box("fp", (0.03, 0.01, 0.35), (0, -0.25, 0.85), M["film"])], "film_path")
    child(fp, body, (0, 0, 0))
    return [body, up, lo, fp]

def build_platter():
    parts = [box("p_base", (0.5, 0.5, 0.1), (0, 0, 0.05), M["paint_grey"]),
             cyl("p_col", 0.06, 1.75, (0, 0, 0.9), M["steel"], n=10),
             box("p_brain", (0.3, 0.25, 0.35), (0, -0.2, 1.5), M["paint_grey"]),
             box("p_brain_led", (0.12, 0.01, 0.05), (0, -0.33, 1.6), M["led_green"])]
    for i in range(4):
        a = i * PI / 2
        parts.append(box("p_leg", (0.9, 0.06, 0.05), (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.04), M["steel_dark"], rot=(0, 0, a)))
    body = join(parts, "platter")
    out = [body]
    for i, z in enumerate((0.45, 0.85, 1.25)):
        d = join([cyl("disc", 0.78, 0.02, (0, 0, 0), M["steel"], n=32),
                  cyl("film_pack", 0.62 if i == 1 else 0.2, 0.035, (0, 0, 0.025), M["film"], n=32),
                  cyl("center", 0.12, 0.06, (0, 0, 0.03), M["paint_grey"], n=12)] +
                 [box("rib", (1.5, 0.03, 0.012), (0, 0, -0.012), M["steel_dark"], rot=(0, 0, r * PI / 3)) for r in range(3)],
                 f"platter_disc_{i}")
        child(d, body, (0, 0, z))
        out.append(d)
    return out

def build_projdig():
    parts = [box("d_ped", (0.7, 0.9, 0.9), (0, 0, 0.45), M["black"]),
             box("d_body", (0.75, 1.05, 0.48), (0, 0, 1.15), M["plastic_white"]),
             box("d_top", (0.72, 1.0, 0.04), (0, 0, 1.4), M["steel"]),
             cyl("d_lens", 0.12, 0.25, (0.12, -0.6, 1.13), M["black"], n=20, rot=(PI / 2, 0, 0)),
             cyl("d_glass", 0.1, 0.01, (0.12, -0.73, 1.13), M["lens"], n=20, rot=(PI / 2, 0, 0)),
             box("d_logo", (0.3, 0.01, 0.07), (-0.18, -0.53, 1.22), M["case_blue"]),
             box("d_led", (0.05, 0.01, 0.02), (-0.28, -0.53, 1.06), M["led_green"])]
    for i in range(6):
        parts.append(box("d_vent", (0.01, 0.6, 0.02), (0.38, 0.1, 1.0 + i * 0.05), M["black"]))
    return [join(parts, "projdig")]

def build_tms():
    parts = [box("t_rack", (0.6, 0.7, 1.4), (0, 0, 0.7), M["black"])]
    for i in range(6):
        parts.append(box("t_unit", (0.54, 0.02, 0.16), (0, -0.36, 0.25 + i * 0.19), M["steel_dark"]))
        parts.append(box("t_led", (0.03, 0.01, 0.02), (-0.2, -0.375, 0.25 + i * 0.19), M["led_green"] if i % 3 else M["led_red"]))
        parts.append(box("t_slot", (0.2, 0.01, 0.04), (0.12, -0.375, 0.25 + i * 0.19), M["black"]))
    return [join(parts, "tms")]

def build_small_props():
    out = []
    # loose film reel, standing up on its flanges
    r = reel_mesh("reel", 0.36, fill=0.85)
    out.append(ground(r))
    # film can stack (3 cans) and the hex shipping case
    cans = [cyl("can", 0.39, 0.06, (0, 0, 0.03 + i * 0.065), M["can_tin"], n=24) for i in range(3)]
    cans += [cyl("can_band", 0.395, 0.012, (0, 0, 0.055 + i * 0.065), M["case_blue"], n=24) for i in range(3)]
    out.append(ground(join(cans, "filmcans")))
    hexc = [cyl("hexcase", 0.42, 0.55, (0, 0, 0.275), M["case_blue"], n=6),
            cyl("hexlid", 0.43, 0.05, (0, 0, 0.56), M["steel"], n=6),
            box("hexhandle", (0.3, 0.04, 0.04), (0, 0, 0.62), M["black"]),
            box("hexlabel", (0.3, 0.005, 0.16), (0, -0.365, 0.32), M["plastic_white"])]
    out.append(ground(join(hexc, "filmcase")))
    hdd = [box("hdd_case", (0.32, 0.22, 0.12), (0, 0, 0.06), M["black"]),
           box("hdd_handle", (0.2, 0.03, 0.03), (0, 0, 0.135), M["steel"]),
           box("hdd_label", (0.14, 0.005, 0.06), (0, -0.112, 0.06), M["plastic_white"])]
    out.append(ground(join(hdd, "hdd")))
    # carton (delivery box)
    cart = [box("carton", (0.5, 0.4, 0.34), (0, 0, 0.17), M["cardboard"]),
            box("carton_tape", (0.52, 0.08, 0.005), (0, 0, 0.342), M["tape"]),
            box("carton_tape2", (0.08, 0.41, 0.3), (0, 0, 0.17), M["tape"])]
    out.append(ground(join(cart, "carton")))
    # poster tube
    out.append(ground(join([cyl("tube", 0.05, 0.8, (0, 0, 0), M["cardboard"], n=10, rot=(0, PI / 2, 0)),
                            cyl("tube_cap", 0.055, 0.04, (0.4, 0, 0), M["plastic_white"], n=10, rot=(0, PI / 2, 0)),
                            cyl("tube_cap", 0.055, 0.04, (-0.4, 0, 0), M["plastic_white"], n=10, rot=(0, PI / 2, 0))], "postertube")))
    # candy boxes (6 kinds, each a different shape so the case reads well)
    shapes = [(0.12, 0.04, 0.17), (0.16, 0.05, 0.11), (0.09, 0.09, 0.14), (0.18, 0.03, 0.1), (0.11, 0.06, 0.16), (0.14, 0.14, 0.06)]
    for i, s in enumerate(shapes):
        c = [box("candy", s, (0, 0, s[2] / 2), M[f"candy_{i}"]),
             box("candy_lbl", (s[0] * 0.7, 0.003, s[2] * 0.35), (0, -s[1] / 2 - 0.002, s[2] * 0.55), M["plastic_white"])]
        out.append(ground(join(c, f"candy_{i}")))
    # register
    reg = [box("reg_base", (0.42, 0.4, 0.1), (0, 0, 0.05), M["black"]),
           box("reg_body", (0.4, 0.3, 0.14), (0, 0.04, 0.17), M["paint_cream"], rot=(-0.25, 0, 0)),
           box("reg_keys", (0.3, 0.16, 0.01), (0, -0.04, 0.245), M["black"], rot=(-0.25, 0, 0)),
           box("reg_disp", (0.22, 0.04, 0.1), (0, 0.15, 0.32), M["black"]),
           box("reg_disp_g", (0.18, 0.005, 0.05), (0, 0.128, 0.33), M["crt"])]
    out.append(ground(join(reg, "register")))
    # computer (CRT + keyboard) on a desk
    desk = [box("desk_top", (1.6, 0.8, 0.05), (0, 0, 0.75), M["wood"]),
            box("desk_side", (0.05, 0.75, 0.72), (-0.77, 0, 0.37), M["wood"]),
            box("desk_side", (0.05, 0.75, 0.72), (0.77, 0, 0.37), M["wood"]),
            box("desk_drawers", (0.45, 0.7, 0.55), (0.5, 0, 0.45), M["wood"]),
            box("crt", (0.45, 0.42, 0.4), (0, 0.12, 0.98), M["beige"]),
            box("crt_back", (0.32, 0.25, 0.28), (0, 0.4, 0.98), M["beige"]),
            box("crt_screen", (0.36, 0.005, 0.29), (0, -0.092, 0.99), M["crt"]),
            box("keyboard", (0.45, 0.16, 0.03), (0, -0.22, 0.79), M["beige"]),
            box("mouse", (0.06, 0.1, 0.03), (0.32, -0.22, 0.79), M["beige"]),
            cyl("mug", 0.04, 0.1, (-0.5, -0.1, 0.83), M["popcorn_red"], n=10),
            box("papers", (0.25, 0.3, 0.02), (-0.45, 0.15, 0.785), M["plastic_white"])]
    out.append(ground(join(desk, "computer")))
    # popcorn machine
    pm = [box("pm_cart", (0.8, 0.55, 0.1), (0, 0, 0.05), M["popcorn_red"]),
          box("pm_base", (0.8, 0.55, 0.32), (0, 0, 0.26), M["popcorn_red"]),
          box("pm_glass", (0.78, 0.53, 0.62), (0, 0, 0.73), M["glass"]),
          box("pm_top", (0.84, 0.59, 0.16), (0, 0, 1.12), M["popcorn_red"]),
          box("pm_sign", (0.6, 0.01, 0.1), (0, -0.3, 1.12), M["bulb"]),
          cyl("pm_kettle", 0.13, 0.12, (0, 0, 0.92), M["steel"], n=12),
          box("pm_frame", (0.82, 0.04, 0.04), (0, -0.27, 1.04), M["gold"])]
    for sx in (-1, 1):
        for sy in (-1, 1):
            pm.append(box("pm_post", (0.03, 0.03, 0.62), (sx * 0.4, sy * 0.27, 0.73), M["gold"]))
    body = join(pm, "popcorn")
    fill = join([box("pc", (0.74, 0.5, 0.3), (0, 0, 0.15), M["popcorn"])] +
                [sph("pk", 0.05, (((i * 37) % 13) / 13 * 0.6 - 0.3, ((i * 17) % 7) / 7 * 0.36 - 0.18, 0.3), M["popcorn"], seg=6, rings=4) for i in range(14)],
                "popcorn_fill")
    child(fill, body, (0, 0, 0.42))
    out += [body, fill]
    # soda fountain
    sf = [box("sf_body", (0.7, 0.45, 0.65), (0, 0.05, 0.33), M["steel"]),
          box("sf_panel", (0.66, 0.01, 0.3), (0, -0.18, 0.5), M["soda_red"]),
          box("sf_tray", (0.66, 0.2, 0.03), (0, -0.25, 0.02), M["steel_dark"])]
    for i in range(3):
        sf.append(cyl("sf_nozzle", 0.025, 0.06, (-0.2 + i * 0.2, -0.22, 0.28), M["black"], n=8))
        sf.append(box("sf_lever", (0.04, 0.03, 0.08), (-0.2 + i * 0.2, -0.2, 0.2), M["plastic_white"]))
    out.append(ground(join(sf, "soda")))
    # cup stacks
    out.append(ground(join([cyl("cups", 0.05, 0.35, (0, 0, 0.175), M["popcorn_red"], n=10, r2=0.06)], "cups")))
    out.append(ground(join([cyl("bucket", 0.07, 0.18, (0, 0, 0.09), M["popcorn_red"], n=12, r2=0.09),
                            sph("bucket_top", 0.085, (0, 0, 0.19), M["popcorn"], scale=(1, 1, 0.5), seg=8, rings=5)], "bucket")))
    out.append(ground(join([cyl("sodacup", 0.045, 0.16, (0, 0, 0.08), M["soda_red"], n=10, r2=0.055),
                            cyl("lid", 0.057, 0.01, (0, 0, 0.165), M["plastic_white"], n=10),
                            cyl("straw", 0.006, 0.12, (0.01, 0, 0.22), M["plastic_white"], n=6)], "sodacup")))
    # splicing / rewind bench
    sb = [box("sb_top", (1.4, 0.6, 0.05), (0, 0, 0.9), M["wood_light"]),
          box("sb_leg", (0.05, 0.05, 0.88), (-0.65, -0.25, 0.44), M["steel_dark"]),
          box("sb_leg", (0.05, 0.05, 0.88), (0.65, -0.25, 0.44), M["steel_dark"]),
          box("sb_leg", (0.05, 0.05, 0.88), (-0.65, 0.25, 0.44), M["steel_dark"]),
          box("sb_leg", (0.05, 0.05, 0.88), (0.65, 0.25, 0.44), M["steel_dark"]),
          box("sb_shelf", (1.3, 0.5, 0.03), (0, 0, 0.25), M["wood_light"]),
          box("lightbox", (0.6, 0.18, 0.04), (0, -0.08, 0.945), M["lamp_warm"]),
          box("splicer", (0.18, 0.1, 0.06), (0, -0.08, 0.99), M["steel"]),
          box("splicer_arm", (0.16, 0.03, 0.03), (0, -0.04, 1.05), M["black"]),
          box("rewind", (0.08, 0.1, 0.25), (-0.55, 0.0, 1.05), M["paint_green"]),
          box("rewind", (0.08, 0.1, 0.25), (0.55, 0.0, 1.05), M["paint_green"]),
          box("tape_roll", (0.06, 0.06, 0.03), (0.22, -0.15, 0.94), M["tape"]),
          box("loupe", (0.04, 0.04, 0.05), (-0.22, -0.15, 0.95), M["black"]),
          box("lamp_arm", (0.02, 0.02, 0.5), (0.6, 0.22, 1.17), M["steel_dark"]),
          box("lamp_head", (0.14, 0.18, 0.08), (0.52, 0.12, 1.42), M["paint_green"]),
          box("lamp_bulb", (0.1, 0.12, 0.01), (0.52, 0.12, 1.38), M["lamp_warm"])]
    body = join(sb, "bench")
    out.append(ground(body))
    for i, x in enumerate((-0.55, 0.55)):
        rr = reel_mesh(f"bench_reel_{i}", 0.3, fill=0.6 if i == 0 else 0.2)
        child(rr, body, (x - 0.05, 0.0, 1.2))
        out.append(rr)
    # poster frame (free-standing easel used in the lobby)
    out.append(ground(join([box("easel_leg", (0.04, 0.04, 1.6), (-0.4, 0.15, 0.8), M["brass"], rot=(0.15, 0, 0)),
                            box("easel_leg", (0.04, 0.04, 1.6), (0.4, 0.15, 0.8), M["brass"], rot=(0.15, 0, 0)),
                            box("easel_board", (0.9, 0.04, 1.3), (0, 0.05, 1.05), M["black"], rot=(0.15, 0, 0))], "easel")))
    # stanchion (queue rope post) and rope
    st = [cyl("st_base", 0.16, 0.04, (0, 0, 0.02), M["brass"], n=16),
          cyl("st_pole", 0.025, 0.95, (0, 0, 0.5), M["brass"], n=10),
          sph("st_top", 0.045, (0, 0, 0.98), M["brass"], seg=10, rings=6)]
    out.append(ground(join(st, "stanchion")))
    out.append(join([cyl("rope", 0.02, 1.0, (0, 0, 0), M["velvet"], n=8, rot=(0, PI / 2, 0))], "rope"))
    # trash bin + spilled popcorn trash
    out.append(ground(join([cyl("bin", 0.22, 0.85, (0, 0, 0.425), M["wainscot"], n=14),
                            cyl("bin_top", 0.24, 0.06, (0, 0, 0.86), M["brass"], n=14)], "trashbin")))
    tr = [cyl("spill_cup", 0.045, 0.15, (0.1, 0.05, 0.075), M["popcorn_red"], n=8, r2=0.055, rot=(PI / 2.2, 0, 0.6))]
    for i in range(9):
        tr.append(sph("spill", 0.025, (((i * 29) % 11) / 11 * 0.4 - 0.2, ((i * 13) % 7) / 7 * 0.3 - 0.15, 0.02), M["popcorn"], seg=5, rings=3))
    out.append(ground(join(tr, "trash")))
    # chandelier
    ch = [cyl("ch_chain", 0.015, 0.8, (0, 0, 1.0), M["gold"], n=6),
          torus("ch_ring", 0.55, 0.03, (0, 0, 0.45), M["gold"]),
          torus("ch_ring2", 0.32, 0.025, (0, 0, 0.25), M["gold"]),
          cyl("ch_drop", 0.05, 0.5, (0, 0, 0.3), M["gold"], n=8, r2=0.01)]
    for i in range(10):
        a = i * 2 * PI / 10
        ch.append(sph("ch_bulb", 0.05, (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.52), M["bulb"], seg=6, rings=4))
    for i in range(6):
        a = i * 2 * PI / 6
        ch.append(sph("ch_bulb", 0.04, (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.31), M["bulb"], seg=6, rings=4))
    out.append(ground(join(ch, "chandelier")))
    # potted palm
    pp = [cyl("pot", 0.22, 0.5, (0, 0, 0.25), M["brass"], n=12, r2=0.28)]
    for i in range(7):
        a = i * 2 * PI / 7
        pp.append(box("leaf", (0.08, 0.6, 0.02), (math.cos(a) * 0.25, math.sin(a) * 0.25, 1.0), M["paint_green"], rot=(0.9, 0, a + PI / 2)))
    pp.append(cyl("trunk", 0.04, 0.6, (0, 0, 0.75), M["wood"], n=6))
    out.append(ground(join(pp, "palm")))
    # bench seat for the lobby
    out.append(ground(join([box("lb_seat", (1.6, 0.5, 0.1), (0, 0, 0.45), M["velvet"]),
                            box("lb_back", (1.6, 0.1, 0.5), (0, 0.22, 0.75), M["velvet"]),
                            box("lb_leg", (0.06, 0.4, 0.4), (-0.75, 0, 0.2), M["brass"]),
                            box("lb_leg", (0.06, 0.4, 0.4), (0.75, 0, 0.2), M["brass"])], "lobbybench")))
    # pallet
    pal = [box("pal_top", (0.12, 1.0, 0.025), (-0.5 + i * 0.22, 0, 0.13), M["plywood"]) for i in range(5)]
    pal += [box("pal_block", (1.1, 0.1, 0.1), (0, -0.45 + j * 0.45, 0.06), M["plywood"]) for j in range(3)]
    out.append(ground(join(pal, "pallet")))
    return out

def build_people_parts():
    """Stubby cartoon humans are assembled in JS from these. Body ~0.6 tall, head r 0.2: about 1.1 m total."""
    out = []
    # body: rounded pill, upper half cloth_top, lower band cloth_bottom
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.26, location=(0, 0, 0.3))
    b = bpy.context.active_object
    b.scale = (1.0, 0.82, 1.18)
    bpy.ops.object.transform_apply(scale=True)
    b.data.materials.append(M["cloth_top"])
    b.data.materials.append(M["cloth_bottom"])
    for poly in b.data.polygons:
        poly.material_index = 1 if poly.center.z < 0.22 else 0
    b.data.shade_smooth()
    b.name = "h_body"
    out.append(ground(join([b], "h_body")))
    # head with eyes, nose, ears
    hd = [sph("head", 0.2, (0, 0, 0.2), M["skin"], scale=(1, 0.95, 0.95), seg=20, rings=12),
          sph("nose", 0.045, (0, -0.2, 0.19), M["skin"], seg=10, rings=6),
          sph("ear", 0.05, (-0.195, 0, 0.2), M["skin"], scale=(0.5, 1, 1), seg=8, rings=6),
          sph("ear", 0.05, (0.195, 0, 0.2), M["skin"], scale=(0.5, 1, 1), seg=8, rings=6),
          sph("eye_w", 0.045, (-0.07, -0.165, 0.25), M["eye_white"], scale=(1, 0.6, 1.2), seg=10, rings=6),
          sph("eye_w", 0.045, (0.07, -0.165, 0.25), M["eye_white"], scale=(1, 0.6, 1.2), seg=10, rings=6),
          sph("eye", 0.024, (-0.07, -0.19, 0.25), M["eye"], seg=8, rings=6),
          sph("eye", 0.024, (0.07, -0.19, 0.25), M["eye"], seg=8, rings=6),
          box("mouth", (0.07, 0.01, 0.012), (0, -0.185, 0.12), M["eye"], rot=(0.2, 0, 0))]
    out.append(ground(join(hd, "h_head")))
    out.append(ground(join([sph("hand", 0.07, (0, 0, 0.07), M["skin"], seg=10, rings=6)], "h_hand")))
    out.append(ground(join([sph("foot", 0.075, (0, -0.03, 0.04), M["shoe"], scale=(0.85, 1.35, 0.6), seg=10, rings=6)], "h_foot")))
    # hair + hats + accessories (origin = where they sit on the head top / face)
    out.append(ground(join([sph("hair", 0.205, (0, 0.02, 0.0), M["hair"], scale=(1.03, 1.05, 0.62), seg=16, rings=8)], "hair_short")))
    hb = [sph("hair", 0.21, (0, 0.03, 0.0), M["hair"], scale=(1.05, 1.08, 0.7), seg=16, rings=8),
          sph("bun", 0.08, (0, 0.17, 0.05), M["hair"], seg=10, rings=6)]
    out.append(ground(join(hb, "hair_bun")))
    sp = [sph("hair", 0.2, (0, 0.02, 0.0), M["hair"], scale=(1.0, 1.0, 0.55), seg=14, rings=8)]
    for i in range(7):
        a = i * 2 * PI / 7
        sp.append(cyl("spike", 0.04, 0.12, (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.1), M["hair"], n=6, r2=0.0, rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0)))
    out.append(ground(join(sp, "hair_spiky")))
    out.append(ground(join([cyl("cap", 0.2, 0.1, (0, 0, 0.05), M["hat"], n=16),
                            sph("cap_top", 0.2, (0, 0, 0.1), M["hat"], scale=(1, 1, 0.45), seg=16, rings=6),
                            box("brim", (0.24, 0.16, 0.02), (0, -0.2, 0.02), M["hat"])], "hat_cap")))
    out.append(ground(join([sph("beanie", 0.215, (0, 0, 0.0), M["hat"], scale=(1, 1, 0.95), seg=16, rings=8),
                            torus("beanie_roll", 0.2, 0.035, (0, 0, 0.0), M["hat"]),
                            sph("pom", 0.05, (0, 0, 0.21), M["hat"], seg=8, rings=6)], "hat_beanie")))
    out.append(ground(join([cyl("fedora_brim", 0.3, 0.02, (0, 0, 0.0), M["hat"], n=20),
                            cyl("fedora_crown", 0.17, 0.16, (0, 0, 0.09), M["hat"], n=16, r2=0.15),
                            cyl("fedora_band", 0.172, 0.03, (0, 0, 0.03), M["black"], n=16)], "hat_fedora")))
    gl = [torus("lens_l", 0.045, 0.01, (-0.07, 0, 0), M["black"], rot=(PI / 2, 0, 0), maj=12, mn=5),
          torus("lens_r", 0.045, 0.01, (0.07, 0, 0), M["black"], rot=(PI / 2, 0, 0), maj=12, mn=5),
          box("bridge", (0.05, 0.01, 0.01), (0, 0, 0.01), M["black"])]
    out.append(ground(join(gl, "glasses")))
    st = [sph("stache", 0.05, (-0.04, 0, 0), M["hair"], scale=(1.3, 0.5, 0.45), seg=8, rings=5),
          sph("stache", 0.05, (0.04, 0, 0), M["hair"], scale=(1.3, 0.5, 0.45), seg=8, rings=5)]
    out.append(ground(join(st, "stache")))
    out.append(ground(join([sph("beard", 0.16, (0, 0, 0), M["hair"], scale=(1.1, 0.7, 0.8), seg=12, rings=8)], "beard")))
    out.append(ground(join([box("tie", (0.06, 0.01, 0.22), (0, 0, 0.11), M["black"]),
                            box("knot", (0.05, 0.015, 0.04), (0, 0, 0.22), M["black"])], "tie")))
    out.append(ground(join([box("bowtie", (0.14, 0.02, 0.05), (0, 0, 0.025), M["hat"])], "bowtie")))
    out.append(ground(join([box("badge", (0.08, 0.01, 0.04), (0, 0, 0.02), M["plastic_white"])], "badge")))
    out.append(ground(join([box("tote", (0.22, 0.06, 0.25), (0, 0, 0.125), M["plywood"]),
                            box("strap", (0.02, 0.02, 0.3), (0, 0, 0.35), M["plywood"])], "tote")))
    return out

# ======================================================================================================
# EXPORT
# ======================================================================================================
def export(objs, fname):
    deselect()
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    path = os.path.join(OUT, fname)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True,
                              export_materials="EXPORT", export_lights=False, export_cameras=False, export_extras=True,
                              export_animations=False, export_skins=False, export_morph=False, export_image_format="NONE")
    print("EXPORTED", path, os.path.getsize(path), "bytes")

clear()
shell = build_shell()
export(shell, "shell.glb")
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in shell if o.type == "MESH")
print("SHELL TRIS", tri)
clear()
lib = []
lib += build_proj35()
lib += build_platter()
lib += build_projdig()
lib += build_tms()
lib += build_small_props()
lib += build_people_parts()
roots = [o for o in lib if o.parent is None]
export(roots, "library.glb")
print("LIBRARY", ", ".join(o.name for o in roots))
