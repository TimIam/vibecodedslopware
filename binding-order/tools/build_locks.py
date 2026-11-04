# Binding Order: builds the lock housings, plugs, bodies and the pick/tension tools in Blender and exports
# assets/locks.glb + assets/locks.json and assets/tools.glb + assets/tools.json.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python binding-order/tools/build_locks.py
#
# Units are millimetres. AXES: authored in Blender space and exported with +Y up, so Blender (x, y, z) becomes
# three.js (x, z, -y). In three.js terms every lock sits with its face in the z = 0 plane, its keyway axis along
# -Z (into the lock), pins pushing up +Y. In Blender terms: face at y = 0, depth along +Y, pins along +Z.
# The moving internals (pins, springs, wafers, levers, wards, tubular feelers) are parametric and built in the
# game from the numbers in locks.json; Blender builds what is drilled and cut (booleans keep everything closed,
# which the game's cutaway caps rely on).
#
# Pick blades are extruded side-elevation profiles. tools.json carries each profile (three.js z along the shaft
# from the tip, y up) so the game's pin contact uses exactly the outline that is drawn.

import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
PREV = os.path.join(HERE, "previews")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(PREV, exist_ok=True)
NO_RENDER = bool(os.environ.get("BO_NORENDER"))
PI = math.pi
def rad(d): return d * PI / 180.0

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SCENE = bpy.context.scene
OBJ = {}

def link(ob):
    SCENE.collection.objects.link(ob)
    return ob

def from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    return ob

# ----------------------------------------------------------------------------------------------- primitives
def cyl_y(name, r, y0, y1, cx=0.0, cz=0.0, seg=48):
    """Cylinder along Blender Y (the keyway axis)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=y1 - y0,
                          matrix=Matrix.Translation((cx, (y0 + y1) / 2, cz)) @ Matrix.Rotation(-PI / 2, 4, "X"))
    return from_bm(name, bm)

def cyl_z(name, r, z0, z1, cx=0.0, cy=0.0, seg=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0,
                          matrix=Matrix.Translation((cx, cy, (z0 + z1) / 2)))
    return from_bm(name, bm)

def box(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    return from_bm(name, bm)

def prism(name, poly, y0, y1):
    """Polygon given in three.js (x, y) == Blender (x, z), extruded along Blender Y from y0 to y1."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in poly]
    b = [bm.verts.new((x, y1, z)) for x, z in poly]
    n = len(poly)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(name, bm)

def prism_x(name, poly, x0, x1):
    """Polygon given in (blender y, blender z), extruded along X from x0 to x1 (pick blades)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in poly]
    b = [bm.verts.new((x1, y, z)) for y, z in poly]
    n = len(poly)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(name, bm)

def join(objs, name):
    objs = [o for o in objs if o]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]

def apply_bool(target, cutters, op="DIFFERENCE"):
    if not cutters:
        return target
    c = join(cutters, target.name + "_cut") if len(cutters) > 1 else cutters[0]
    m = target.modifiers.new("b", "BOOLEAN")
    m.operation = op
    m.solver = "EXACT"
    m.use_self = True
    m.object = c
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(c, do_unlink=True)
    return target

def union(objs, name):
    base = objs[0]
    base.name = name
    for o in objs[1:]:
        apply_bool(base, [o], "UNION")
    return base

def finish(ob, matname, smooth_angle=None):
    me = ob.data
    me.materials.clear()
    me.materials.append(mat(matname))
    for p in me.polygons:
        p.use_smooth = False
    OBJ[ob.name] = ob
    return ob

MATS = {}
COLORS = {"brass": (0.85, 0.66, 0.3), "steel": (0.75, 0.77, 0.8), "acrylic": (0.6, 0.85, 1.0), "blued": (0.25, 0.3, 0.38),
          "laminate": (0.6, 0.62, 0.66), "iron": (0.3, 0.3, 0.32), "grip": (0.85, 0.3, 0.15), "case": (0.45, 0.35, 0.25)}
def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*COLORS.get(name, (0.7, 0.7, 0.7)), 1)
        MATS[name] = m
    return MATS[name]

def ring_pts(r, n, a0=0.0):
    return [(r * math.cos(a0 + 2 * PI * i / n), r * math.sin(a0 + 2 * PI * i / n)) for i in range(n)]

# ----------------------------------------------------------------------------------------------- lock models
PIN_KEYWAY = [(-1.15, -4.7), (1.15, -4.7), (1.15, -2.0), (0.45, -1.3), (1.15, -0.6), (1.15, 3.3),
              (-0.35, 3.3), (-1.15, 2.6), (-1.15, 1.2), (-0.45, 0.5), (-1.15, -0.2)]
DIMPLE_KEYWAY = [(-3.6, -1.15), (3.6, -1.15), (3.6, 1.15), (0.9, 1.15), (0.6, 1.5), (-0.6, 1.5), (-0.9, 1.15), (-3.6, 1.15)]
WAFER_KEYWAY = [(-1.05, -3.4), (1.05, -3.4), (1.05, -0.5), (0.4, 0.2), (1.05, 0.9), (1.05, 3.4), (-1.05, 3.4), (-1.05, 1.6), (-0.4, 0.9), (-1.05, 0.2)]
def keyhole(r=3.6, slot_w=1.7, slot_d=9.5, n=28):
    pts = []
    a0 = math.asin(slot_w / r)
    for i in range(n + 1):
        a = -PI / 2 + a0 + (2 * PI - 2 * a0) * i / n
        pts.append((r * math.cos(a), r * math.sin(a)))
    pts.append((-slot_w, -slot_d))
    pts.append((slot_w, -slot_d))
    return pts[::-1]
KEYHOLE = keyhole()

MODELS = {
    # id: family, n, pitch (mm between chambers), skin
    "practice4": {"family": "pin", "n": 4, "pitch": 3.96, "skin": "acrylic"},
    "deadbolt5": {"family": "pin", "n": 5, "pitch": 3.96, "skin": "deadbolt"},
    "padlock4": {"family": "pin", "n": 4, "pitch": 3.96, "skin": "laminated"},
    "security6": {"family": "pin", "n": 6, "pitch": 3.96, "skin": "deadbolt"},
    "dimple6": {"family": "dimple", "n": 6, "pitch": 3.5, "skin": "euro"},
    "wafer5": {"family": "wafer", "n": 5, "pitch": 3.2, "skin": "cam"},
    "tubular7": {"family": "tubular", "n": 7, "skin": "tubular"},
    "tubular8": {"family": "tubular", "n": 8, "skin": "tubular"},
    "rim3": {"family": "lever", "n": 3, "skin": "rim"},
    "lever5": {"family": "lever", "n": 5, "skin": "leverpad"},
    "warded": {"family": "warded", "n": 3, "skin": "wardpad"},
}
META = {}

def build_pin(lid, m, dimple=False):
    n, pitch = m["n"], m["pitch"]
    R = 6.5 if dimple else 6.35
    first = 4.2
    zs = [first + i * pitch for i in range(n)]          # Blender y of each chamber = three -z
    L = first + (n - 1) * pitch + 4.0
    face = -2.6 if m["skin"] in ("deadbolt",) else -0.8
    chR = 1.25 if dimple else 1.5
    kw = DIMPLE_KEYWAY if dimple else PIN_KEYWAY
    kw_top = 1.15 if dimple else 3.3
    # plug: cylinder, keyway through, chambers from the keyway up to the shear line, a cam tail at the back
    plug = cyl_y(lid + "_plug", R, face, L, seg=64)
    tail = box("t", -2.2, 2.2, L - 0.01, L + 3.0, -R * 0.55, R * 0.55)
    plug = union([plug, tail], lid + "_plug")
    cut = [prism("kw", kw, face - 1, L + 0.5)]
    for i, y in enumerate(zs):
        cut.append(cyl_z("ch%d" % i, chR, kw_top - 0.5, R + 0.5, 0, y))
    apply_bool(plug, cut)
    finish(plug, "brass" if m["skin"] != "acrylic" else "acrylic")
    # shell: round housing plus the bible tower, bored for the plug and drilled for the stacks
    top = 19.0 if not dimple else 17.0
    tw = 3.7 if not dimple else 4.6
    shell = cyl_y(lid + "_shell", R + 2.3, 0.0, L, seg=64)
    tower = box("tw", -tw, tw, 0.6, L - 0.6, 0.0, top)
    shell = union([shell, tower], lid + "_shell")
    cut = [cyl_y("bore", R + 0.05, -1, L + 1, seg=64)]
    for i, y in enumerate(zs):
        cut.append(cyl_z("sc%d" % i, chR, R - 0.5, top - 1.2, 0, y))
    apply_bool(shell, cut)
    finish(shell, {"acrylic": "acrylic", "laminated": "steel"}.get(m["skin"], "brass"))
    skins = []
    if m["skin"] == "acrylic":
        blk = box(lid + "_skin", -15, 15, 0.0, L + 1.5, -14, 24)
        hole = cyl_y("h", R + 2.3, -1, L + 2, seg=64)
        holet = box("ht", -tw, tw, 0.4, L - 0.4, -1, top + 0.01)
        apply_bool(blk, [hole, holet])
        skins.append(finish(blk, "acrylic"))
    elif m["skin"] == "deadbolt":
        ring = cyl_y(lid + "_skin", 11.5, face, 0.0, seg=64)
        bev = cyl_y("bev", 10.0, face - 2, face + 0.9, seg=64)
        apply_bool(ring, [cyl_y("h", R + 0.05, face - 1, 1, seg=64)])
        skins.append(finish(ring, "brass"))
        bpy.data.objects.remove(bev, do_unlink=True)
    elif m["skin"] == "laminated":
        plates = []
        y = 0.0
        k = 0
        body_back = L + 18
        while y < body_back:
            t = min(2.4, body_back - y)
            p = box("pl%d" % k, -21, 21, y, y + t - 0.18, -11, 24)
            plates.append(p)
            y += t
            k += 1
        body = join(plates, lid + "_skin")
        hole = cyl_y("h", R + 2.3, -1, L + 0.2, seg=64)
        holet = box("ht", -tw - 0.02, tw + 0.02, 0.4, L + 0.2, -1, top + 0.01)
        apply_bool(body, [hole, holet])
        skins.append(finish(body, "laminate"))
        # shackle: a U behind the body (out the back, along +Y), legs at x = +-13
        bm = bmesh.new()
        legs = []
        rs = 3.6
        path = []
        y0, y1 = L + 6, body_back + 26
        for i in range(10):
            path.append(Vector((-13, y0 + (y1 - y0) * i / 9, 6)))
        for i in range(1, 16):
            a = PI - PI * i / 16
            path.append(Vector((13 * math.cos(a), y1 + 13 * math.sin(a), 6)))
        for i in range(10):
            path.append(Vector((13, y1 - (y1 - (y0 + 12)) * i / 9, 6)))
        tube(bm, path, rs, 18)
        sh = from_bm(lid + "_shackle", bm)
        finish(sh, "steel")
        skins.append(sh)
        META.setdefault(lid, {})["shackle"] = {"lift": 9.0}
    elif m["skin"] == "euro":
        # euro profile collar at the face
        col = cyl_y(lid + "_skin", R + 4.0, -2.0, 0.0, seg=64)
        apply_bool(col, [cyl_y("h", R + 0.05, -3, 1, seg=64)])
        skins.append(finish(col, "steel"))
    META.setdefault(lid, {}).update({
        "family": m["family"], "n": n, "pitch": pitch, "plugR": R, "chamberR": chR, "face": -face, "length": L,
        "pinZ": [-y for y in zs], "keywayTop": kw_top, "keywayBottom": -1.15 if dimple else -4.7,
        "shellTop": top - 1.2, "keyway": kw, "skin": m["skin"],
    })

def tube(bm, path, r, seg):
    rings = []
    for i, p in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        t = (b - a).normalized()
        n0 = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        u = t.cross(n0).normalized()
        v = t.cross(u).normalized()
        rings.append([bm.verts.new(p + (u * math.cos(2 * PI * j / seg) + v * math.sin(2 * PI * j / seg)) * r) for j in range(seg)])
    for i in range(len(rings) - 1):
        for j in range(seg):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])

def build_wafer(lid, m):
    n, pitch = m["n"], m["pitch"]
    R = 6.0
    first = 3.6
    zs = [first + i * pitch for i in range(n)]
    L = first + (n - 1) * pitch + 3.4
    face = -1.8
    plug = cyl_y(lid + "_plug", R, face, L, seg=64)
    cut = [prism("kw", WAFER_KEYWAY, face - 1, L + 0.5)]
    for i, y in enumerate(zs):
        cut.append(box("ws%d" % i, -3.35, 3.35, y - 0.55, y + 0.55, -R - 1, R + 1))
    apply_bool(plug, cut)
    finish(plug, "brass")
    shell = cyl_y(lid + "_shell", R + 2.6, 0.0, L, seg=64)
    apply_bool(shell, [cyl_y("bore", R + 0.05, -1, L + 1, seg=64),
                       box("gt", -2.9, 2.9, first - 1.4, L - 1.0, R - 0.2, R + 1.6),
                       box("gb", -2.9, 2.9, first - 1.4, L - 1.0, -R - 1.6, -R + 0.2)])
    finish(shell, "steel")
    fl = cyl_y(lid + "_skin", 11.0, face, 0.0, seg=64)
    apply_bool(fl, [cyl_y("h", R + 0.05, face - 1, 1, seg=64)])
    finish(fl, "steel")
    META[lid] = {"family": "wafer", "n": n, "pitch": pitch, "plugR": R, "face": -face, "length": L, "pinZ": [-y for y in zs],
                 "keywayTop": 3.4, "keywayBottom": -3.4, "keyway": WAFER_KEYWAY, "skin": "cam", "groove": 1.6}

def build_tubular(lid, m):
    n = m["n"]
    pr = 4.75            # pin circle radius
    shear = 9.0          # depth of the plug's back face (three: z = -9)
    L = 22.0
    plug = cyl_y(lid + "_plug", 7.0, -1.0, shear, seg=72)
    ann = cyl_y("ann", 5.55, -2, 1.6, seg=72)
    apply_bool(ann, [cyl_y("annin", 3.95, -3, 2.6, seg=72)])
    cut = [ann, box("nt", -0.6, 0.6, -3, 1.6, 3.0, 4.2)]
    angs = [PI / 2 + 2 * PI * i / n for i in range(n)]
    for i, a in enumerate(angs):
        cut.append(cyl_y("ph%d" % i, 0.95, 0.5, shear + 1, pr * math.cos(a), pr * math.sin(a), seg=20))
    apply_bool(plug, cut)
    finish(plug, "steel")
    shell = cyl_y(lid + "_shell", 9.6, 0.0, L, seg=72)
    cut = [cyl_y("bore", 7.05, -1, shear + 0.02, seg=72)]
    for i, a in enumerate(angs):
        cut.append(cyl_y("sh%d" % i, 0.95, shear - 0.5, L - 2.0, pr * math.cos(a), pr * math.sin(a), seg=20))
    apply_bool(shell, cut)
    finish(shell, "steel")
    fr = cyl_y(lid + "_skin", 12.0, -2.4, 0.0, seg=72)
    apply_bool(fr, [cyl_y("h", 7.05, -3, 1, seg=72)])
    finish(fr, "steel")
    META[lid] = {"family": "tubular", "n": n, "pinCircle": pr, "pinR": 0.95, "shear": shear, "length": L, "face": 1.0,
                 "angles": angs, "plugR": 7.0, "skin": "tubular", "postR": 3.95, "annulus": [3.95, 5.55]}

def build_case(lid, m, kind):
    """Lever / warded locks: a hollow body with a keyhole through the front and back plates. Levers, bolt and
    wards are built by the game inside it."""
    if kind == "rim":
        x0, x1, z0, z1, d = -42, 42, -32, 34, 17.0
    elif kind == "leverpad":
        x0, x1, z0, z1, d = -26, 26, -30, 30, 19.0
    else:
        x0, x1, z0, z1, d = -23, 23, -26, 20, 14.0
    wall = 1.4
    body = box(lid + "_shell", x0, x1, 0.0, d, z0, z1)
    inner = box("in", x0 + wall, x1 - wall, wall, d - wall, z0 + wall, z1 - wall)
    holes = [prism("kh", KEYHOLE, -1, d + 1)]
    apply_bool(body, [inner] + holes)
    finish(body, "case" if kind == "rim" else ("brass" if kind == "leverpad" else "iron"))
    # escutcheon round the keyhole and, for padlocks, the shackle on top
    esc = cyl_y(lid + "_skin", 7.5, -1.2, 0.0, seg=48, cz=-2.5)
    apply_bool(esc, [prism("kh2", KEYHOLE, -2, 1)])
    finish(esc, "brass")
    meta = {"family": m["family"], "n": m["n"], "skin": kind, "box": [x0, x1, z0, z1, d], "wall": wall, "keyhole": KEYHOLE}
    if kind in ("leverpad", "wardpad"):
        bm = bmesh.new()
        path = []
        hx = 15 if kind == "leverpad" else 13
        y0 = z1 - 4
        for i in range(6):
            path.append(Vector((-hx, d / 2, y0 + 10 * i / 5)))
        for i in range(1, 18):
            a = PI - PI * i / 18
            path.append(Vector((hx * math.cos(a), d / 2, y0 + 10 + hx * math.sin(a))))
        for i in range(6):
            path.append(Vector((hx, d / 2, y0 + 10 - 10 * i / 5)))
        tube(bm, path, 3.8 if kind == "leverpad" else 3.2, 18)
        finish(from_bm(lid + "_shackle", bm), "steel")
        meta["shackle"] = {"lift": 8.0}
    META[lid] = meta

for lid, m in MODELS.items():
    f = m["family"]
    if f == "pin":
        build_pin(lid, m)
    elif f == "dimple":
        build_pin(lid, m, dimple=True)
    elif f == "wafer":
        build_wafer(lid, m)
    elif f == "tubular":
        build_tubular(lid, m)
    else:
        build_case(lid, m, m["skin"])
    print("built", lid)

# ----------------------------------------------------------------------------------------------- tools
TOOLS = {}
SH = 0.8   # half height of a standard pick shaft

def pick_profile(kind):
    """Side elevation outline (three z from the tip along the shaft, y up), CCW, shaft runs to z = 62."""
    top = []
    if kind == "hook":
        top = [(0.0, 1.7), (0.15, 2.15), (0.55, 2.35), (0.95, 2.15), (1.15, 1.6), (1.45, SH)]
    elif kind == "deep":
        top = [(-0.35, 3.0), (-0.2, 3.55), (0.3, 3.75), (0.75, 3.5), (0.95, 2.9), (1.4, 1.6), (2.4, SH)]
    elif kind == "diamond":
        top = [(0.0, 0.5), (1.3, 2.0), (1.7, 2.0), (3.4, SH)]
    elif kind == "bogota":
        for i in range(61):
            z = 11.5 * i / 60
            top.append((z, SH + 1.45 * max(0.0, math.sin(PI * z / 3.8)) ** 0.9 if z < 11.4 else SH))
    elif kind == "city":
        hs = [1.3, 2.4, 1.0, 2.1, 1.5]
        for k, h in enumerate(hs):
            z = 0.6 + k * 2.9
            top += [(z - 0.6, SH + 0.2), (z, SH + h), (z + 0.7, SH + h), (z + 1.5, SH + 0.2)]
    elif kind == "snake":
        for i in range(81):
            z = 14.0 * i / 80
            amp = 1.0 if (int(z / 3.5) % 2 == 0) else 2.1
            top.append((z, SH + amp * abs(math.sin(PI * z / 3.5))))
    elif kind == "flag":
        top = [(0.0, 1.35), (0.9, 1.35), (1.3, 0.25)]
    elif kind == "lever":
        top = [(0.0, 3.0), (0.9, 3.0), (1.0, 0.5)]
    if kind in ("flag",):
        bot = -0.25
    elif kind == "lever":
        bot = -0.5
    else:
        bot = -SH
    tail = 0.25 if kind == "flag" else (0.5 if kind == "lever" else SH)
    out = [(0.0, bot)] + top + [(62.0, tail), (62.0, bot)]
    if top and top[0][0] < 0:
        out = [(top[0][0], bot)] + top + [(62.0, tail), (62.0, bot)]
    return out, [list(p) for p in top] + [[62.0, tail]], bot

PICKS = {
    "hook": {"label": "Short hook", "thick": 0.6},
    "deep": {"label": "Deep hook", "thick": 0.6},
    "diamond": {"label": "Half diamond", "thick": 0.6},
    "bogota": {"label": "Wave rake", "thick": 0.6},
    "city": {"label": "City rake", "thick": 0.6},
    "snake": {"label": "Snake rake", "thick": 0.6},
    "flag": {"label": "Dimple flag", "thick": 2.0},
    "lever": {"label": "Lever lifter", "thick": 1.0},
}

def grip(name, z0, z1, w, t, mat_):
    """Rounded rectangular handle along three +z (Blender -y) from z0 to z1, width w (y) and thickness t (x)."""
    bm = bmesh.new()
    seg = 24
    rings = []
    N = 14
    for i in range(N + 1):
        s = i / N
        z = z0 + (z1 - z0) * s
        taper = 0.75 + 0.25 * math.sin(PI * min(1.0, s * 1.6)) if s < 0.6 else 1.0 - 0.15 * (s - 0.6) / 0.4
        end = 1.0 if s < 0.96 else 0.75
        ww, tt = w * taper * end / 2, t * taper * end / 2
        row = []
        for j in range(seg):
            a = 2 * PI * j / seg
            c, sn = math.cos(a), math.sin(a)
            x = tt * math.copysign(abs(c) ** 0.6, c)
            y = ww * math.copysign(abs(sn) ** 0.6, sn)
            row.append(bm.verts.new((x, -z, y)))
        rings.append(row)
    for i in range(N):
        for j in range(seg):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    ob = from_bm(name, bm)
    finish(ob, mat_)
    return ob

for pid, p in PICKS.items():
    poly, top, bot = pick_profile(pid)
    t = p["thick"]
    blade = prism_x("pick_" + pid, [(-z, y) for z, y in poly], -t / 2, t / 2)
    finish(blade, "steel")
    grip("pick_" + pid + "_grip", 56.0, 128.0, 9.0, 4.6 if t < 1.5 else 5.2, "grip")
    TOOLS[pid] = {"label": p["label"], "thick": t, "top": top, "bottom": bot, "grip": [56.0, 128.0]}

# tension wrench (pin, dimple, wafer): the short leg goes into the bottom of the keyway along -z, the long leg
# runs out to -x in front of the face. Its origin is the keyway mouth (three: 0, 0, 0) at the leg's bottom edge.
def wrench(name, leg, w, t):
    poly = [(-9.0, 0.0), (1.6, 0.0), (1.6, t), (-9.0, t)]              # (three z, y) short leg profile
    a = prism_x(name + "_a", [(-z, y) for z, y in poly], -w / 2, w / 2)
    b = box(name + "_b", -leg, w / 2, -3.6, -1.6, 0.0, t)              # long leg, flat, in front of the face
    tip = box(name + "_c", -leg, -leg + 14, -3.6, -1.6, -1.2, t + 0.4)  # thicker pad where the finger presses
    ob = union([a, b, tip], name)
    finish(ob, "blued")
    return ob
wrench("wrench_bok", 52.0, 2.2, 0.9)
TOOLS["wrench"] = {"leg": 52.0, "w": 2.2, "t": 0.9, "pad": [-52.0 + 7.0, 2.6]}

# lever-lock tension tool: a stiff wire into the bottom of the keyhole slot, bent up at the back to bear on the bolt
bm = bmesh.new()
path = [Vector((0, 0.0 - 60, 0)), Vector((0, -2.0, 0)), Vector((0, 6.0, 0)), Vector((0, 12.0, 0)), Vector((0, 12.6, 1.6)), Vector((0, 12.6, 3.0))]
tube(bm, path, 0.75, 12)
cw = from_bm("curtain", bm)
finish(cw, "blued")
grip("curtain_grip", 40.0, 90.0, 7.0, 4.0, "grip")
TOOLS["curtain"] = {"reach": 12.6}

# warded picks: a round shank with a flat bit at the end. Bit = rectangle sticking up from the shank axis, so as
# it turns the bit sweeps a disc. (three: shank along +z from the tip, bit in +y).
WARDS = {
    "w1": {"label": "Skeleton, long bit", "bit": [0.0, 1.4, 1.0, 6.4]},     # z0, z1 (along shank), y0, y1
    "w2": {"label": "Skeleton, short bit", "bit": [0.0, 1.4, 1.0, 3.8]},
    "w3": {"label": "Skeleton, wide bit", "bit": [0.0, 4.6, 1.0, 5.2]},
    "w4": {"label": "Skeleton, stepped", "bit": [0.0, 3.0, 1.0, 6.4], "notch": [1.0, 2.2, 2.8, 6.4]},
}
for wid, w in WARDS.items():
    z0, z1, y0, y1 = w["bit"]
    shank = cyl_y("ward_" + wid, 0.9, -60, 0.0, seg=16)
    bit = box("bit", -0.45, 0.45, -z1, -z0, y0 - 0.6, y1)
    parts = [shank, bit]
    ob = union(parts, "ward_" + wid)
    if "notch" in w:
        a, b, c, d = w["notch"]
        apply_bool(ob, [box("n", -1, 1, -b, -a, c, d + 1)])
    finish(ob, "steel")
    grip("ward_" + wid + "_grip", 48.0, 100.0, 8.0, 8.0, "grip")
    TOOLS[wid] = {"label": w["label"], "bit": w["bit"], "notch": w.get("notch")}

# tubular pick handle (the feeler sleeve itself is built by the game, it has moving parts)
grip("tubular_grip", 14.0, 80.0, 13.0, 13.0, "grip")

# ----------------------------------------------------------------------------------------------- export
def three(v): return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]

def export(fname, names):
    for o in bpy.data.objects:
        o.select_set(o.name in names)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ASSETS, fname), export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
                              export_animations=False, export_skins=False, export_morph=False, export_image_format="NONE",
                              export_extras=False)
    print("EXPORTED", fname, os.path.getsize(os.path.join(ASSETS, fname)) // 1024, "KB")

lock_names = [n for n in OBJ if any(n.startswith(l + "_") for l in MODELS)]
tool_names = [n for n in OBJ if n not in lock_names]
export("locks.glb", lock_names)
export("tools.glb", tool_names)
with open(os.path.join(ASSETS, "locks.json"), "w") as f:
    json.dump(META, f, separators=(",", ":"))
with open(os.path.join(ASSETS, "tools.json"), "w") as f:
    json.dump(TOOLS, f, separators=(",", ":"))
print("objects", sorted(OBJ))

if not NO_RENDER:
    sc = SCENE
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_xray = True
    sc.display.shading.xray_alpha = 0.55
    sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = 2000, 900
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    co = link(bpy.data.objects.new("cam", cam))
    sc.camera = co
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = True
    tmp = []
    ids = list(MODELS)
    for i, lid in enumerate(ids):
        for n in OBJ:
            if n.startswith(lid + "_"):
                d = link(bpy.data.objects.new(n + "_pv", OBJ[n].data))
                d.matrix_world = Matrix.Translation(((i % 6) * 110 - 275, 0, -(i // 6) * 110 + 55)) @ Matrix.Rotation(rad(-30), 4, "Z") @ Matrix.Rotation(rad(15), 4, "X")
                tmp.append(d)
    cam.ortho_scale = 680
    co.location = (0, -400, 0)
    co.rotation_euler = (PI / 2, 0, 0)
    sc.render.filepath = os.path.join(PREV, "locks.png")
    bpy.ops.render.render(write_still=True)
    for d in tmp:
        bpy.data.objects.remove(d, do_unlink=True)
    tmp = []
    tids = [n for n in tool_names if not n.endswith("_grip")]
    for i, n in enumerate(tids):
        for nn in (n, n + "_grip"):
            if nn in OBJ:
                d = link(bpy.data.objects.new(nn + "_pv", OBJ[nn].data))
                d.matrix_world = Matrix.Translation((-200 + (i % 2) * 230, 0, 120 - (i // 2) * 28)) @ Matrix.Rotation(PI / 2, 4, "Z")
                tmp.append(d)
    cam.ortho_scale = 520
    co.location = (0, 0, 0)
    co.location = (-400, 0, 0)
    co.rotation_euler = (PI / 2, 0, -PI / 2)
    sc.render.filepath = os.path.join(PREV, "tools.png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEW done")
