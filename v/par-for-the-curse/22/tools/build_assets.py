# Par for the Curse: builds every 3D asset procedurally in Blender and exports GLB + JSON manifests.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python par-for-the-curse/tools/build_assets.py
#
# Optional env vars:  PFTC_ONLY=golfer,clubs,props   (build/export only those groups)
#                     PFTC_NORENDER=1                (skip the preview renders)
#                     PFTC_PREVIEWS=golfer_parts,... (render only the named previews)
#
# Outputs  assets/golfer.glb + golfer.json, assets/clubs.glb + clubs.json, assets/props.glb + props.json,
#          tools/previews/*.png (Eevee lineups used to eyeball the art).
#
# AXES. Geometry is authored in Blender space (Z up, the FRONT of everything is -Y). The glTF exporter's +Y-up
# conversion maps Blender (x, y, z) -> three.js (x, z, -y), so Blender -Y becomes three +Z ("forward") and
# Blender +X stays +X (the character's LEFT, since characters face +Z). Manifests are written in three.js axes.
# Every exported object is top level, unrotated, unscaled, with its origin where the spec says (vertices are
# authored relative to the origin, objects sit at the world origin).

import bpy, bmesh, math, os, sys, json, struct, random
from mathutils import Vector, Matrix, Euler, Quaternion, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
PREV = os.path.join(HERE, "previews")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(PREV, exist_ok=True)
ONLY = [s for s in os.environ.get("PFTC_ONLY", "").split(",") if s]
NO_RENDER = bool(os.environ.get("PFTC_NORENDER"))
PREV_ONLY = [s for s in os.environ.get("PFTC_PREVIEWS", "").split(",") if s]
PI = math.pi
def rad(d): return d * PI / 180.0
def want(group): return not ONLY or group in ONLY

def three(v):
    """Blender-space point -> three.js-space list."""
    return [round(v[0], 4) + 0.0, round(v[2], 4) + 0.0, round(-v[1], 4) + 0.0]

# =====================================================================================================
# scene
# =====================================================================================================
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
    for b in list(coll):
        coll.remove(b)
SCENE = bpy.context.scene

def link(o):
    SCENE.collection.objects.link(o)
    return o

# =====================================================================================================
# materials (sRGB hex in, linear stored). Names are what the game recolours by.
# =====================================================================================================
MATS = {}
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip("#")
    return tuple(_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))

def mat(name, col="#ffffff", rough=0.65, metal=0.0, emit=0.0, vcol=False, double=False):
    if name in MATS:
        return name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    c = hexc(col)
    bsdf.inputs["Base Color"].default_value = (*c, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = (*c, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit
    if vcol:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    m.diffuse_color = (*c, 1.0)
    m.use_backface_culling = not double
    m.use_fake_user = True
    MATS[name] = m
    return name

def define_materials():
    # golfer
    mat("skin", "#ffc898", 0.6)
    mat("blush", "#ff7f86", 0.6)
    mat("hair", "#6a3b1e", 0.75)
    mat("mouth", "#7a1424", 0.5)
    mat("tongue", "#ff6f7d", 0.5)
    mat("eye", "#16161e", 0.25)
    mat("eyewhite", "#ffffff", 0.3, emit=0.6)
    mat("hat", "#ef3b36", 0.6)
    mat("hat2", "#ffffff", 0.6)
    mat("metal", "#b9c1cc", 0.35, 0.4)
    mat("horn", "#f4e7c6", 0.55)
    mat("gold", "#ffc531", 0.3, 0.45)
    mat("gem", "#e8344f", 0.2)
    mat("shirt", "#3fa9ff", 0.7)
    mat("shirt2", "#ffffff", 0.7)
    mat("button", "#ffffff", 0.35)
    mat("pants", "#f0d48c", 0.75)
    mat("belt", "#3a2a22", 0.6)
    mat("buckle", "#ffd23f", 0.3, 0.45)
    mat("glove", "#ffffff", 0.6)
    mat("sock", "#ffffff", 0.75)
    mat("shoe", "#ffffff", 0.45)
    mat("shoe2", "#7a4a26", 0.55)
    mat("sole", "#3b3b44", 0.6)
    # clubs
    mat("grip", "#26262c", 0.85)
    mat("shaft", "#d3d8e0", 0.25, 0.4)
    mat("clubhead", "#c4202e", 0.2, 0.1)
    mat("chrome", "#dfe4ec", 0.22, 0.4)
    mat("face", "#8f97a6", 0.4, 0.4)
    # props
    mat("trunk", "#8a5a34", 0.85)
    mat("leaves", "#5cc94a", 0.8)
    mat("leaves2", "#3fae45", 0.8)
    mat("pine", "#2f9a5b", 0.8)
    mat("palm_trunk", "#b5824e", 0.85)
    mat("palm_trunk2", "#9a6a3c", 0.85)
    mat("palm_leaf", "#4fc24a", 0.75, double=True)
    mat("coconut", "#6b4424", 0.7)
    mat("flower_a", "#ff5fa2", 0.6)
    mat("flower_b", "#ffd23a", 0.6)
    mat("flower_c", "#a77cff", 0.6)
    mat("flower_center", "#ffb51f", 0.6)
    mat("stem", "#3c9a3a", 0.7)
    mat("rock", "#a39d97", 0.85)
    mat("moss", "#6cbf4a", 0.85)
    mat("cloud", "#ffffff", 0.9, emit=0.15)
    mat("pole_white", "#ffffff", 0.5)
    mat("pole_red", "#ee3333", 0.5)
    mat("pole_top", "#ffc531", 0.3, 0.45)
    mat("flag", "#ff3b30", 0.7, double=True)
    mat("cup", "#ffffff", 0.5)
    mat("tee_marker", "#2f7bff", 0.35)
    mat("tee_stub", "#c99a63", 0.7)
    mat("mushroom_cap", "#ee2b2b", 0.45)
    mat("mushroom_spot", "#ffffff", 0.5)
    mat("mushroom_gills", "#f6e3c4", 0.8)
    mat("mushroom_stem", "#fbefd9", 0.7)
    mat("mushroom_eye", "#1a1a22", 0.3)
    mat("bumper", "#ff3f8e", 0.35)
    mat("bumper_top", "#ffe14d", 0.3, emit=1.6)
    mat("bumper_base", "#3a3f58", 0.5, 0.3)
    mat("windmill_wall", "#fff3dc", 0.8)
    mat("windmill_stone", "#a8a2a0", 0.85)
    mat("windmill_roof", "#d6463a", 0.7)
    mat("windmill_trim", "#2e9f6b", 0.6)
    mat("windmill_wood", "#8a5a34", 0.8)
    mat("windmill_tunnel", "#5e4636", 0.9)
    mat("window", "#3b6fb8", 0.25)
    mat("sail", "#fff8ec", 0.8, double=True)
    mat("goose", "#ffffff", 0.7)
    mat("goose_wing", "#e6e9ef", 0.7)
    mat("goose_beak", "#ff9a1f", 0.5)
    mat("goose_eye", "#16161e", 0.25)
    mat("iron", "#3c3f48", 0.4, 0.5)
    mat("bore", "#0b0b0e", 0.9)
    mat("cannon_wood", "#a3542c", 0.75)
    mat("cart_body", "#f4f6f8", 0.35)
    mat("cart_trim", "#2fbf8f", 0.4)
    mat("cart_seat", "#7a4a2a", 0.6)
    mat("cart_roof", "#2fbf8f", 0.5)
    mat("cart_frame", "#55606e", 0.4, 0.4)
    mat("tire", "#25252b", 0.85)
    mat("hub", "#d9dee6", 0.3, 0.5)
    mat("cart_light", "#fff4b0", 0.2, emit=2.0)
    mat("golf_bag", "#e8413c", 0.6)
    mat("sign_post", "#8a5a34", 0.85)
    mat("sign_board", "#c48a52", 0.8)
    mat("sign_face", "#fff2d6", 0.8)
    mat("trophy_base", "#4a2e22", 0.5)
    mat("trophy_ball", "#ffffff", 0.4)
    mat("balloon_a", "#ff4d4d", 0.6)
    mat("balloon_b", "#ffd84d", 0.6)
    mat("balloon_c", "#3fa9ff", 0.6)
    mat("basket", "#b98a4e", 0.9)
    mat("basket_rim", "#7a5530", 0.9)
    mat("rope", "#e7d7b0", 0.9)
    mat("burner", "#4a4d55", 0.4, 0.5)
    mat("blimp", "#d7dce4", 0.4, 0.2)
    mat("blimp_stripe", "#ff5a4a", 0.5)
    mat("blimp_fin", "#ff5a4a", 0.5)
    mat("blimp_gondola", "#f8f8f8", 0.4)
    mat("sand", "#f6dd9c", 0.9)
    mat("grass", "#64c84a", 0.85)
    mat("fence", "#c9915a", 0.85)
    mat("pole", "#e9edf2", 0.4, 0.3)
    mat("sock_red", "#ff5a1f", 0.7, double=True)
    mat("sock_white", "#ffffff", 0.7, double=True)
    mat("lamp_post", "#2d4a3e", 0.5, 0.3)
    mat("lamp_glow", "#ffe9a0", 0.2, emit=2.5)
    mat("under_rock", "#ffffff", 0.9, vcol=True)
    mat("root", "#6b4a2e", 0.9)
    mat("spire_rock", "#ffffff", 0.9, vcol=True)

# =====================================================================================================
# geometry generators. Each returns G = (verts, faces, fmats) in local space; fmats[i] None = use add()'s mat.
# =====================================================================================================
def Mx(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    if isinstance(rot, Matrix):
        R = rot.to_4x4() if len(rot) == 3 else rot
    elif isinstance(rot, Quaternion):
        R = rot.to_matrix().to_4x4()
    else:
        R = Euler(rot, "XYZ").to_matrix().to_4x4()
    return Matrix.Translation(Vector(loc)) @ R @ Matrix.Diagonal((*scale, 1.0))

def aim(src, dst):
    """Rotation matrix taking direction src onto dst."""
    return Vector(src).normalized().rotation_difference(Vector(dst).normalized()).to_matrix()

def lathe(prof, seg=24, fmat=None, rfn=None, phase=0.0, sx=1.0, sy=1.0):
    """Surface of revolution around Z. prof = [(r, z), ...] bottom -> top gives outward normals.
    rfn(a, z, j) multiplies the radius (noise); fmat(i, j) picks a material name per face."""
    verts, faces, fm, rings = [], [], [], []
    for j, (r, z) in enumerate(prof):
        if abs(r) < 1e-9:
            verts.append((0.0, 0.0, z))
            rings.append([len(verts) - 1] * seg)
            continue
        ring = []
        for i in range(seg):
            a = 2 * PI * i / seg + phase
            rr = r * (rfn(a, z, j) if rfn else 1.0)
            verts.append((math.cos(a) * rr * sx, math.sin(a) * rr * sy, z))
            ring.append(len(verts) - 1)
        rings.append(ring)
    for j in range(len(prof) - 1):
        A, B = rings[j], rings[j + 1]
        for i in range(seg):
            i2 = (i + 1) % seg
            q = []
            for x in (A[i], A[i2], B[i2], B[i]):
                if x not in q:
                    q.append(x)
            if len(q) >= 3:
                faces.append(q)
                fm.append(fmat(i, j) if fmat else None)
    return verts, faces, fm

def sphere_prof(r=1.0, rings=12, t0=0.0, t1=PI):
    return [(r * math.sin(t), -r * math.cos(t)) for t in (t0 + (t1 - t0) * k / rings for k in range(rings + 1))]

def sphere(seg=24, rings=12, **kw):
    return lathe(sphere_prof(1.0, rings), seg, **kw)

def capsule_prof(r0, r1, length, rings=6):
    """Capsule along -Z from 0 to -length; r0 at the top, r1 at the bottom, hemispherical ends."""
    p = []
    for k in range(rings + 1):          # bottom cap (pole first)
        t = (PI / 2) * k / rings
        p.append((r1 * math.sin(t), -length - r1 * math.cos(t)))
    for k in range(rings + 1):          # top cap
        t = (PI / 2) * k / rings
        p.append((r0 * math.cos(t), r0 * math.sin(t)))
    return p

def tube(pts, radii, seg=12, cap0="round", cap1="round", fmat=None, cap_rings=4, up=None):
    """Sweep a circle along a polyline. radii: number or per-point list. caps: 'round' | 'flat' | None."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    if isinstance(radii, (int, float)):
        radii = [radii] * n
    T = []
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        T.append(t.normalized())
    u = Vector(up) if up else (Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0)))
    N = [(u - T[0] * u.dot(T[0])).normalized()]
    for i in range(1, n):
        N.append((T[i - 1].rotation_difference(T[i]) @ N[i - 1]).normalized())
    rings = []  # (center, radius, T, N, kind)
    if cap0 == "round":
        for k in range(cap_rings, 0, -1):
            ph = (PI / 2) * k / cap_rings
            rings.append((pts[0] - T[0] * radii[0] * math.sin(ph), radii[0] * math.cos(ph), T[0], N[0]))
    elif cap0 == "flat":
        rings.append((pts[0], 0.0, T[0], N[0]))
    for i in range(n):
        rings.append((pts[i], radii[i], T[i], N[i]))
    if cap1 == "round":
        for k in range(1, cap_rings + 1):
            ph = (PI / 2) * k / cap_rings
            rings.append((pts[-1] + T[-1] * radii[-1] * math.sin(ph), radii[-1] * math.cos(ph), T[-1], N[-1]))
    elif cap1 == "flat":
        rings.append((pts[-1], 0.0, T[-1], N[-1]))
    verts, faces, fm, idx = [], [], [], []
    for (c, r, t, nn) in rings:
        if r < 1e-7:
            verts.append(tuple(c))
            idx.append([len(verts) - 1] * seg)
            continue
        bb = t.cross(nn)
        ring = []
        for i in range(seg):
            a = 2 * PI * i / seg
            verts.append(tuple(c + (nn * math.cos(a) + bb * math.sin(a)) * r))
            ring.append(len(verts) - 1)
        idx.append(ring)
    for j in range(len(idx) - 1):
        A, B = idx[j], idx[j + 1]
        for i in range(seg):
            i2 = (i + 1) % seg
            q = []
            for x in (A[i], A[i2], B[i2], B[i]):
                if x not in q:
                    q.append(x)
            if len(q) >= 3:
                faces.append(q)
                fm.append(fmat(i, j) if fmat else None)
    return verts, faces, fm

def geo_bm(bm, mats=None):
    bm.verts.index_update()
    verts = [tuple(v.co) for v in bm.verts]
    faces, fm = [], []
    for f in bm.faces:
        faces.append([v.index for v in f.verts])
        fm.append(mats[f.material_index] if mats and f.material_index < len(mats) else None)
    bm.free()
    return verts, faces, fm

def rbox(sx, sy, sz, r=0.0, seg=3):
    """Box centred on the origin, edges rounded by r."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if r > 0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=r, offset_type="OFFSET",
                        segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
    return geo_bm(bm)

def prism_x(outline, t, r=0.0, seg=2):
    """Convex outline [(y, z), ...] (any winding) extruded along X, thickness t, centred on x = 0."""
    bm = bmesh.new()
    a = [bm.verts.new((-t / 2, y, z)) for (y, z) in outline]
    b = [bm.verts.new((t / 2, y, z)) for (y, z) in outline]
    n = len(outline)
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([a[i], b[i], b[j], a[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if r > 0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=r, offset_type="OFFSET",
                        segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
    return geo_bm(bm)

def ico(sub=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    return geo_bm(bm)

def cut(g, plane_co, plane_no, fill_mat=None, base_mat=None):
    """Remove the part of G on the +plane_no side; optionally fill the hole with fill_mat."""
    verts, faces, fm = g
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    mats = [base_mat or "_", fill_mat or "_"]
    for f, m in zip(faces, fm):
        try:
            face = bm.faces.new([vs[i] for i in f])
        except ValueError:
            continue
        if m is not None and m not in mats:
            mats.append(m)
        face.material_index = mats.index(m) if m is not None else 0
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=1e-6,
                           plane_co=Vector(plane_co), plane_no=Vector(plane_no), clear_outer=True)
    if fill_mat:
        res = bmesh.ops.holes_fill(bm, edges=list(bm.edges), sides=0)
        for f in res["faces"]:
            f.material_index = 1
    out = geo_bm(bm, mats)
    fm2 = [None if m == "_" else m for m in out[2]]
    return out[0], out[1], fm2

def warp(g, fn):
    """Apply fn(Vector) -> Vector to every vertex."""
    verts, faces, fm = g
    return [tuple(fn(Vector(v))) for v in verts], faces, fm

def mirror_x(g):
    verts, faces, fm = g
    return [(-v[0], v[1], v[2]) for v in verts], [list(f)[::-1] for f in faces], fm

# =====================================================================================================
# builder: accumulates geometry for one exported object
# =====================================================================================================
OBJ = {}

class B:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.uv_fn = None

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def add(self, g, mat, M=None, smooth=True):
        verts, faces, fm = g
        if M is None:
            M = Matrix.Identity(4)
        flip = M.to_3x3().determinant() < 0
        bv = [self.bm.verts.new(M @ Vector(v)) for v in verts]
        out = []
        for f, m in zip(faces, fm):
            idx = list(f)[::-1] if flip else list(f)
            try:
                face = self.bm.faces.new([bv[j] for j in idx])
            except ValueError:
                continue
            face.material_index = self.mi(m if m is not None else mat)
            face.smooth = smooth
            out.append(face)
        return out

    def make(self, origin=None, sharp=None, vcol=None, uv=None):
        bm = self.bm
        if origin is not None:
            o = Vector(origin)
            for v in bm.verts:
                v.co -= o
        if sharp is not None:
            for e in bm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > sharp:
                    e.smooth = False
        if uv:
            lay = bm.loops.layers.uv.new("UVMap")
            for f in bm.faces:
                for l in f.loops:
                    l[lay].uv = uv(l.vert.co, f)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(MATS[m])
        if vcol:
            ca = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
            me.attributes.active_color = ca
            for p in me.polygons:
                c = vcol(p)
                for li in p.loop_indices:
                    ca.data[li].color = (*c, 1.0)
        o = link(bpy.data.objects.new(self.name, me))
        OBJ[self.name] = o
        return o

def geo_mesh(me):
    """Mesh datablock -> G with material names."""
    verts = [tuple(v.co) for v in me.vertices]
    faces, fm = [], []
    for p in me.polygons:
        faces.append(list(p.vertices))
        fm.append(me.materials[p.material_index].name if len(me.materials) else None)
    return verts, faces, fm

def bbox_of(o):
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi

def bbox_three(o):
    lo, hi = bbox_of(o)
    return {"min": [round(lo.x, 3), round(lo.z, 3), round(-hi.y, 3)], "max": [round(hi.x, 3), round(hi.z, 3), round(-lo.y, 3)]}

def filter_faces(g, pred):
    verts, faces, fm = g
    nf, nm = [], []
    for f, m in zip(faces, fm):
        c = sum((Vector(verts[i]) for i in f), Vector()) / len(f)
        if pred(c):
            nf.append(f)
            nm.append(m)
    return verts, nf, nm

def interp(prof, z):
    """Radius of a lathe profile [(r, z) ...] (z ascending) at height z."""
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0] if z > prof[-1][1] else prof[0][0]

# =====================================================================================================
# 1) GOLFER  (Blender space: faces -Y, +X = character's left; three: faces +Z)
# =====================================================================================================
G_WAIST = 0.37                      # waist height when standing straight
G_NECK = Vector((0, 0, 0.27))       # head origin relative to torso origin
G_SHOULDER_X, G_SHOULDER_Z = 0.175, 0.24
G_HIP_X, G_HIP_Z = 0.075, -0.06
G_UA, G_FA, G_HAND, G_TH, G_SH, G_ANKLE = 0.16, 0.14, 0.095, 0.13, 0.12, 0.06
HC = Vector((0, 0, 0.175))          # head centre (head origin = neck base)
HR = (0.20, 0.185, 0.18)            # head radii x (width), y (depth), z (height)
EYE_X, EYE_Z = 0.07, 0.18

def head_pt(x, z, push=0.0):
    t = 1 - (x / HR[0]) ** 2 - ((z - HC.z) / HR[2]) ** 2
    y = -HR[1] * math.sqrt(max(t, 0.0))
    n = Vector((x / HR[0] ** 2, y / HR[1] ** 2, (z - HC.z) / HR[2] ** 2)).normalized()
    return Vector((x, y, z)) + n * push, n

def face_m(x, z, push, scale, spin=0.0):
    """Matrix placing a feature on the head surface, local -Y along the surface normal."""
    p, n = head_pt(x, z, push)
    R = aim((0, -1, 0), n) @ Matrix.Rotation(spin, 3, "Y")
    return Mx(p, R, scale), p, n

HAT_FRAME = Mx(HC) @ Mx(rot=(rad(-10), 0, 0))   # hats: z up from the head centre, front tipped up 10 deg

def build_head():
    b = B("head")
    b.add(sphere(40, 22), "skin", Mx(HC, scale=HR))
    # nose
    M, p, n = face_m(0, 0.13, 0.02, (0.047, 0.042, 0.043))
    b.add(sphere(20, 12), "skin", M)
    # ears
    for sx in (1, -1):
        b.add(sphere(16, 10), "skin", Mx((0.192 * sx, 0.012, 0.165), (0, 0, rad(-12 * sx)), (0.026, 0.042, 0.05)))
        b.add(sphere(12, 8), "blush", Mx((0.212 * sx, 0.004, 0.165), (0, 0, rad(-12 * sx)), (0.008, 0.024, 0.032)))
    # cheeks
    for sx in (1, -1):
        M, p, n = face_m(0.118 * sx, 0.112, -0.004, (0.036, 0.012, 0.025))
        b.add(sphere(16, 8), "blush", M)
    # open smile (lower half ellipsoid) + tongue
    p, n = head_pt(0, 0.072)
    R = aim((0, -1, 0), n)
    c = p - n * 0.012
    mouth = cut(sphere(28, 14), (0, 0, 0), (0, 0, 1), fill_mat="mouth", base_mat="mouth")
    b.add(mouth, "mouth", Mx(c, R, (0.058, 0.03, 0.045)))
    b.add(sphere(16, 8), "tongue", Mx(c + R @ Vector((0.0, -0.011, -0.03)), R, (0.03, 0.016, 0.014)))
    # eyebrows
    for sx in (1, -1):
        pts, rr = [], []
        for k in range(6):
            t = k / 5
            x = (0.036 + 0.07 * t) * sx
            z = 0.256 + 0.014 * math.sin(PI * t) - 0.004 * t
            pts.append(head_pt(x, z, 0.007)[0])
            rr.append(0.006 + 0.004 * math.sin(PI * t))
        b.add(tube(pts, rr, 10, cap_rings=3), "hair")
    # hair: a shell above a sloping hairline (front high, nape low) + scalloped bangs + sideburns; hats sit over it
    S = Vector((HR[0] * 1.035, HR[1] * 1.035, HR[2] * 1.035))
    P0 = Vector((0, -0.19, 0.31))
    n = Vector((0, 0.24, 0.38)).normalized()
    u0 = Vector(((P0 - HC).x / S.x, (P0 - HC).y / S.y, (P0 - HC).z / S.z))
    nu = Vector((n.x * S.x, n.y * S.y, n.z * S.z)).normalized()
    hair = cut(sphere(48, 28), u0, -nu)
    b.add(hair, "hair", Mx(HC, scale=S))
    for x in (-0.12, -0.062, 0.0, 0.062, 0.12):
        z = 0.306 - 1.6 * x * x - 0.015 * (abs(x) > 0.1)
        M, p, nn = face_m(x, z, 0.0, (0.044, 0.012, 0.03), spin=rad(-x * 120))
        b.add(sphere(16, 8), "hair", M)
    for sx in (1, -1):
        b.add(sphere(12, 8), "hair", Mx((0.186 * sx, -0.05, 0.19), (0, 0, rad(-20 * sx)), (0.016, 0.03, 0.05)))
    # cowlick tuft on the crown (sits under every hat)
    pts = [HC + Vector((0, 0.03, 0.17)), HC + Vector((0.0, 0.0, 0.19)), HC + Vector((0.0, -0.035, 0.196))]
    b.add(tube(pts, [0.02, 0.016, 0.006], 10, cap0="flat", cap_rings=3), "hair")
    return b.make()

def build_eyes():
    b = B("eyes")
    centers = []
    for sx in (1, -1):
        p, n = head_pt(EYE_X * sx, EYE_Z)
        R = aim((0, -1, 0), n)
        c = p - n * 0.004
        centers.append(c)
        b.add(sphere(24, 14), "eye", Mx(c, R, (0.034, 0.02, 0.05)))
        b.add(sphere(12, 8), "eyewhite", Mx(c + R @ Vector((-0.011, -0.0185, 0.02)), R, (0.011, 0.005, 0.013)))
        b.add(sphere(10, 6), "eyewhite", Mx(c + R @ Vector((0.011, -0.0185, -0.02)), R, (0.0055, 0.004, 0.0065)))
    origin = Vector((0, (centers[0].y + centers[1].y) / 2, EYE_Z))
    b.make(origin=origin)
    return origin

def build_stache():
    b = B("stache")
    ctrl = [(0.0, 0.1, 0.026), (0.03, 0.094, 0.03), (0.062, 0.094, 0.026), (0.09, 0.108, 0.018), (0.104, 0.13, 0.011), (0.102, 0.146, 0.005)]
    for sx in (1, -1):
        pts = catmull([head_pt(x * sx, z, r * 0.5)[0] for x, z, r in ctrl], 16)
        rr = [ctrl[min(int(k / 15 * 5), 4)][2] + (ctrl[min(int(k / 15 * 5) + 1, 5)][2] - ctrl[min(int(k / 15 * 5), 4)][2]) * ((k / 15 * 5) % 1.0) for k in range(16)]
        b.add(tube(pts, rr, 14, cap_rings=4), "hair")
    b.make()

def build_hats():
    F = HAT_FRAME
    # golf cap
    b = B("hat_cap")
    crown = cut(sphere(40, 22), (0, 0, 0.07 / 0.198), (0, 0, -1))
    b.add(crown, "hat", F @ Mx((0, 0.005, 0), scale=(0.216, 0.203, 0.198)))
    b.add(sphere(32, 8), "hat2", F @ Mx((0, -0.2, 0.07), (rad(20), 0, 0), (0.155, 0.145, 0.012)))
    b.add(sphere(12, 6), "hat2", F @ Mx((0, 0.005, 0.196), scale=(0.022, 0.022, 0.012)))
    for k in range(6):   # crown seams
        a = 2 * PI * k / 6
        pts = []
        for s in range(9):
            el = rad(22 + 66 * s / 8)
            pts.append(Vector((math.cos(a) * math.cos(el) * 0.218, 0.005 + math.sin(a) * math.cos(el) * 0.205, math.sin(el) * 0.2)))
        b.add(tube(pts, 0.0035, 6, cap_rings=2), "hat2", F)
    b.make()
    # bucket hat
    b = B("hat_bucket")
    b.add(lathe([(0.213, 0.06), (0.212, 0.12), (0.2, 0.17), (0.17, 0.205), (0.1, 0.222), (0, 0.226)], 40, sy=0.94), "hat", F)
    b.add(lathe([(0.2, 0.068), (0.3, 0.032), (0.312, 0.034), (0.314, 0.046), (0.302, 0.052), (0.2, 0.09)], 40, sy=0.94), "hat", F)
    b.add(lathe([(0.217, 0.07), (0.22, 0.08), (0.22, 0.104), (0.215, 0.11)], 40, sy=0.94), "hat2", F)
    b.make()
    # beanie
    b = B("hat_beanie")
    dome = cut(sphere(40, 22), (0, 0, 0.065 / 0.215), (0, 0, -1))
    b.add(dome, "hat", F @ Mx(scale=(0.218, 0.205, 0.215)))
    b.add(lathe([(0.21, 0.058), (0.228, 0.064), (0.232, 0.085), (0.23, 0.115), (0.214, 0.124)], 40, sy=0.94), "hat2", F)
    fluff = lambda a, z, j: 1.0 + 0.08 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, z * 40)))
    b.add(lathe(sphere_prof(0.062, 12), 20, rfn=fluff), "hat2", F @ Mx((0, 0, 0.262)))
    b.make()
    # viking helmet
    b = B("hat_viking")
    dome = cut(sphere(40, 22), (0, 0, 0.06 / 0.212), (0, 0, -1))
    b.add(dome, "metal", F @ Mx(scale=(0.222, 0.21, 0.212)))
    b.add(lathe([(0.215, 0.05), (0.232, 0.055), (0.236, 0.075), (0.232, 0.1), (0.215, 0.106)], 40, sy=0.95), "metal", F)
    ridge = [Vector((0, math.cos(el) * 0.214, math.sin(el) * 0.216)) for el in (rad(d) for d in range(20, 161, 10))]
    b.add(tube(ridge, 0.016, 10), "metal", F)
    for k in range(10):
        a = 2 * PI * (k + 0.5) / 10
        b.add(sphere(8, 5), "metal", F @ Mx((math.cos(a) * 0.237, math.sin(a) * 0.237 * 0.95, 0.078), scale=0.011))
    for sx in (1, -1):
        horn = [(0.19 * sx, 0.0, 0.12), (0.27 * sx, -0.01, 0.15), (0.33 * sx, -0.02, 0.215), (0.355 * sx, -0.025, 0.29), (0.35 * sx, -0.02, 0.35)]
        b.add(tube(horn, [0.05, 0.043, 0.033, 0.022, 0.008], 14, cap0="flat", cap_rings=3), "horn", F)
        b.add(tube([(0.2 * sx, 0, 0.122), (0.24 * sx, -0.005, 0.135)], 0.054, 14, cap_rings=2), "metal", F)
    b.make()
    # top hat (tipped jauntily)
    b = B("hat_tophat")
    J = F @ Mx((0.01, 0, 0), (0, rad(8), 0))
    b.add(lathe([(0, 0.075), (0.158, 0.075), (0.168, 0.1), (0.165, 0.2), (0.172, 0.32), (0.178, 0.34), (0.172, 0.352), (0, 0.355)], 36, sy=0.93), "hat", J)
    b.add(lathe([(0.15, 0.066), (0.262, 0.072), (0.274, 0.084), (0.264, 0.094), (0.15, 0.088)], 36, sy=0.92), "hat", J)
    b.add(lathe([(0.171, 0.095), (0.172, 0.118), (0.171, 0.14)], 36, sy=0.93), "hat2", J @ Mx(scale=(1.012, 1.012, 1)))
    b.make()
    # crown
    b = B("hat_crown")
    J = F @ Mx((0.015, 0.0, 0.0), (0, rad(-10), 0))
    n = 80
    verts, faces = [], []
    for i in range(n):
        a = 2 * PI * i / n
        saw = abs(((a * 5 / (2 * PI)) % 1.0) - 0.5) * 2      # 1 at a valley, 0 at a point
        h = 0.175 + 0.085 * (1 - saw)
        z0 = 0.12
        ro0, ro1 = 0.132, 0.132 + 0.35 * (h - z0) * 0.3
        verts += [(math.cos(a) * ro0, math.sin(a) * ro0, z0), (math.cos(a) * ro1, math.sin(a) * ro1, h),
                  (math.cos(a) * (ro1 - 0.012), math.sin(a) * (ro1 - 0.012), h), (math.cos(a) * (ro0 - 0.012), math.sin(a) * (ro0 - 0.012), z0)]
    for i in range(n):
        j = (i + 1) % n
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append([i * 4 + k, j * 4 + k, j * 4 + k2, i * 4 + k2])
    b.add((verts, faces, [None] * len(faces)), "gold", J)
    b.add(lathe([(0.128, 0.115), (0.142, 0.12), (0.145, 0.142), (0.14, 0.152), (0.126, 0.152)], 40), "gold", J)
    for k in range(5):
        a = (k + 0.5) * 2 * PI / 5
        ro = 0.132 + 0.35 * 0.085 * 0.3
        b.add(sphere(12, 8), "gold", J @ Mx((math.cos(a) * (ro - 0.006), math.sin(a) * (ro - 0.006), 0.262), scale=0.017))
        b.add(sphere(12, 8), "gem", J @ Mx((math.cos(a) * 0.146, math.sin(a) * 0.146, 0.136), (0, 0, a), (0.006, 0.014, 0.012)))
    b.make()
    # sun visor
    b = B("hat_visor")
    b.add(lathe([(0.198, 0.058), (0.21, 0.06), (0.213, 0.078), (0.21, 0.098), (0.198, 0.1)], 40, sy=0.94), "hat", F)
    b.add(sphere(32, 8), "hat", F @ Mx((0, -0.2, 0.074), (rad(10), 0, 0), (0.165, 0.145, 0.011)))
    b.make()

TORSO_PROF = [(0, -0.02), (0.15, -0.015), (0.162, 0.03), (0.168, 0.09), (0.163, 0.15), (0.150, 0.20), (0.128, 0.245), (0.098, 0.278), (0.055, 0.297), (0, 0.302)]
TORSO_SY = 0.85

def torso_front(z, push=0.0, x=0.0):
    r = interp(TORSO_PROF, z)
    dr = (interp(TORSO_PROF, z + 0.005) - interp(TORSO_PROF, z - 0.005)) / 0.01
    y = -TORSO_SY * math.sqrt(max(r * r - x * x, 0.0))
    n = Vector((x / max(r, 1e-6) * 0.6, -1.0, TORSO_SY * dr)).normalized()
    return Vector((x, y, z)) + n * push, n

def build_torso():
    b = B("torso")
    belly = lambda a, z, j: 1.0 + 0.06 * max(0.0, -math.sin(a)) * math.exp(-((z - 0.08) / 0.09) ** 2)
    b.add(lathe(TORSO_PROF, 40, rfn=belly, sy=TORSO_SY), "shirt")
    # collar ring round the chin + flaps
    b.add(lathe([(0.082, 0.262), (0.112, 0.262), (0.124, 0.276), (0.116, 0.292), (0.086, 0.3)], 36, sy=0.9), "shirt2")
    for sx in (1, -1):
        p, n = torso_front(0.255, 0.004, 0.036 * sx)
        R = aim((0, -1, 0), n) @ Matrix.Rotation(rad(38 * sx), 3, "Y")
        b.add(sphere(16, 8), "shirt2", Mx(p, R, (0.046, 0.01, 0.028)))
    p, n = torso_front(0.212, 0.0)
    b.add(rbox(0.034, 0.014, 0.085, 0.006, 2), "shirt2", Mx(p, aim((0, -1, 0), n)))
    for z in (0.232, 0.196):
        p, n = torso_front(z, 0.008)
        b.add(sphere(12, 6), "button", Mx(p, aim((0, -1, 0), n), (0.011, 0.005, 0.011)))
    return b.make()

def build_hips():
    b = B("hips")
    b.add(lathe([(0, -0.13), (0.07, -0.128), (0.12, -0.118), (0.148, -0.095), (0.159, -0.06), (0.16, -0.02), (0.155, 0.018), (0, 0.02)], 40, sy=0.85), "pants")
    b.add(lathe([(0.152, -0.03), (0.165, -0.026), (0.168, -0.006), (0.165, 0.012), (0.152, 0.017)], 40, sy=0.86), "belt")
    b.add(rbox(0.058, 0.016, 0.042, 0.007, 2), "buckle", Mx((0, -0.168 * 0.86 - 0.003, -0.006)))
    b.add(rbox(0.032, 0.02, 0.022, 0.004, 1), "belt", Mx((0, -0.168 * 0.86 - 0.007, -0.006)))
    return b.make()

def mirror_builder(bb):
    for v in bb.bm.verts:
        v.co.x = -v.co.x
    for f in bb.bm.faces:
        f.normal_flip()

def build_limbs():
    b = B("upper_arm")
    b.add(sphere(20, 12), "shirt", Mx(scale=0.06))
    b.add(lathe([(0.052, -0.085), (0.064, -0.082), (0.066, -0.06), (0.062, -0.01), (0.05, 0.03), (0, 0.04)], 24), "shirt")
    b.add(lathe([(0.055, -0.088), (0.068, -0.084), (0.069, -0.07), (0.066, -0.066)], 24), "shirt2")
    b.add(lathe(capsule_prof(0.043, 0.043, G_UA, 6), 20), "skin")
    b.make()
    b = B("forearm")
    b.add(lathe(capsule_prof(0.043, 0.037, G_FA, 6), 20), "skin")
    b.make()
    b = B("thigh")
    b.add(lathe([(0.048, -0.084), (0.066, -0.088), (0.071, -0.08), (0.07, -0.07), (0.066, -0.02), (0.058, 0.03), (0, 0.04)], 24), "pants")
    b.add(lathe(capsule_prof(0.047, 0.046, G_TH, 6), 20), "skin")
    b.make()
    b = B("shin")
    b.add(lathe(capsule_prof(0.045, 0.04, G_SH, 6), 20), "skin")
    b.add(lathe([(0.0, -0.125), (0.046, -0.12), (0.05, -0.1), (0.05, -0.078), (0.055, -0.07), (0.055, -0.058), (0.044, -0.054)], 24), "sock")
    b.make()
    # gloves (left is +X: palm faces -X, thumb forward/in)
    def hand_geo(hb):
        hb.add(lathe([(0.038, -0.03), (0.05, -0.024), (0.053, -0.008), (0.05, 0.006), (0.036, 0.01)], 24), "glove")
        hb.add(sphere(24, 14), "glove", Mx((0.002, 0, -0.054), scale=(0.035, 0.049, 0.046)))
        for k, yy in enumerate((-0.028, -0.009, 0.01, 0.028)):   # finger tips
            hb.add(sphere(12, 8), "glove", Mx((0.004, yy, -0.088 + 0.004 * abs(k - 1.5)), scale=(0.028, 0.013, 0.016)))
        hb.add(tube([(-0.01, -0.03, -0.032), (-0.022, -0.055, -0.05), (-0.026, -0.062, -0.064)], [0.017, 0.016, 0.014], 12), "glove")
    h = B("hand_l")
    hand_geo(h)
    h.make()
    h = B("hand_r")
    hand_geo(h)
    mirror_builder(h)
    h.make()
    # shoes
    def shoe_geo(sb):
        up = cut(sphere(28, 16), (0, 0, -0.42), (0, 0, -1))
        sb.add(up, "shoe", Mx((0, -0.03, -0.028), scale=(0.05, 0.086, 0.042)))
        toe = cut(sphere(24, 14), (0, 0, -0.35), (0, 0, -1))
        sb.add(toe, "shoe", Mx((0, -0.078, -0.032), scale=(0.051, 0.052, 0.04)))
        saddle = filter_faces(sphere(28, 16), lambda c: -0.45 < c.y < 0.25 and c.z > -0.3)
        sb.add(saddle, "shoe2", Mx((0, -0.03, -0.028), scale=(0.052, 0.088, 0.045)))
        sb.add(rbox(0.108, 0.19, 0.02, 0.008, 2), "sole", Mx((0, -0.038, -0.05)))
        for yy in (-0.035, -0.012):   # laces
            sb.add(rbox(0.04, 0.008, 0.007, 0.003, 1), "shoe", Mx((0, yy - 0.008, 0.012 - (yy + 0.035) * 0.35), (rad(-35), 0, 0)))
    s = B("shoe_l")
    shoe_geo(s)
    s.make()
    s = B("shoe_r")
    shoe_geo(s)
    mirror_builder(s)
    s.make()

GOLFER = ["head", "eyes", "stache", "hat_cap", "hat_bucket", "hat_beanie", "hat_viking", "hat_tophat", "hat_crown", "hat_visor",
          "torso", "hips", "upper_arm", "forearm", "hand_l", "hand_r", "thigh", "shin", "shoe_l", "shoe_r"]
EYES_ORIGIN = Vector()

def golfer_pose(pose=None, hat=None, stache=False, root=None, ground=True):
    """FK for previews. pose: dict of euler tuples. Returns [(objname, Matrix)] with the soles on z = 0."""
    pose = pose or {}
    R = lambda k: Euler(pose.get(k, (0, 0, 0)), "XYZ").to_matrix().to_4x4()
    T = Matrix.Translation
    hips = T((0, 0, G_WAIST)) @ R("hips")
    torso = hips @ R("spine")
    head = torso @ T(G_NECK) @ R("head")
    out = [("hips", hips), ("torso", torso), ("head", head), ("eyes", head @ T(EYES_ORIGIN))]
    if stache:
        out.append(("stache", head))
    if hat:
        out.append((hat, head))
    for side, sx in (("l", 1), ("r", -1)):
        ua = torso @ T((sx * G_SHOULDER_X, 0, G_SHOULDER_Z)) @ R("ua_" + side)
        fa = ua @ T((0, 0, -G_UA)) @ R("fa_" + side)
        hd = fa @ T((0, 0, -G_FA)) @ R("hand_" + side)
        th = hips @ T((sx * G_HIP_X, 0, G_HIP_Z)) @ R("th_" + side)
        sh = th @ T((0, 0, -G_TH)) @ R("sh_" + side)
        so = sh @ T((0, 0, -G_SH)) @ R("shoe_" + side)
        out += [("upper_arm", ua), ("forearm", fa), ("hand_" + side, hd), ("thigh", th), ("shin", sh), ("shoe_" + side, so)]
    if ground:
        soles = [m @ Vector((0, 0, -G_ANKLE)) for n, m in out if n.startswith("shoe")]
        drop = min(p.z for p in soles)
        fix = T((0, 0, -drop))
        out = [(n, fix @ m) for n, m in out]
    if root is not None:
        out = [(n, root @ m) for n, m in out]
    return out

def build_golfer():
    global EYES_ORIGIN
    build_head()
    EYES_ORIGIN = build_eyes()
    build_stache()
    build_hats()
    build_torso()
    build_hips()
    build_limbs()
    parts = golfer_pose()
    top = max((m @ v.co).z for n, m in parts if n == "head" for v in OBJ[n].data.vertices)
    man = {
        "units": "meters; positions are [x, y, z] in three.js axes (+Y up, character faces +Z, +X is the character's left)",
        "neck": three(G_NECK),
        "shoulder_l": three((G_SHOULDER_X, 0, G_SHOULDER_Z)), "shoulder_r": three((-G_SHOULDER_X, 0, G_SHOULDER_Z)),
        "hip_l": three((G_HIP_X, 0, G_HIP_Z)), "hip_r": three((-G_HIP_X, 0, G_HIP_Z)),
        "eyes": three(EYES_ORIGIN),
        "lengths": {"upper_arm": G_UA, "forearm": G_FA, "hand": G_HAND, "thigh": G_TH, "shin": G_SH},
        "ankle_height": G_ANKLE,
        "waist_height_standing": G_WAIST,
        "height": round(top, 3),
        "head_radius": [HR[0], HR[2], HR[1]],
        "notes": {
            "neck": "head origin relative to the torso origin (waist). eyes/stache/hat_* use the head transform; 'eyes' is the eyes object's origin relative to the head origin.",
            "segments": "upper_arm, forearm, hand_*, thigh, shin hang along -Y from their origin; the child joint sits at (0, -length, 0).",
            "hips": "hips and torso origins are both the waist; hip_l/hip_r are relative to the hips origin, shoulders/neck to the torso origin.",
            "shoes": "origin at the ankle, sole bottom at y = -ankle_height, toe toward +Z",
            "hands": "hand_l is on the +X side: palm faces -X, thumb toward +Z; hand_r is its mirror",
        },
        "materials": sorted({m.name for n in GOLFER for m in OBJ[n].data.materials}),
        "bounds": {n: bbox_three(OBJ[n]) for n in GOLFER},
    }
    with open(os.path.join(ASSETS, "golfer.json"), "w") as f:
        json.dump(man, f, indent=1)
    return man

# =====================================================================================================
# 2) CLUBS  origin = butt of the grip, shaft along -Z (three -Y), face normal -Y tilted up by the loft, toe +X
# =====================================================================================================
CLUBS = [("club_driver", 0.80, 12.0), ("club_iron", 0.72, 26.0), ("club_wedge", 0.68, 50.0), ("club_putter", 0.60, 3.0)]

def torus(R, r, seg=32, segr=12):
    prof = [(R + r * math.cos(t), r * math.sin(t)) for t in (-PI / 2 + 2 * PI * k / segr for k in range(segr + 1))]
    return lathe(prof, seg)

def club_head(kind, loft):
    """Pieces [(G, mat, M)] in head space: sole near z = 0, face toward -Y, heel at x ~ 0. Returns pieces, hosel top, face pt."""
    L = rad(loft)
    fn = Vector((0, -math.cos(L), math.sin(L)))
    P = []
    if kind == "driver":
        c = Vector((0.072, 0.032, 0.043))
        rr = (0.078, 0.064, 0.043)
        face_pt = c + Vector((0, -0.047, 0))
        # cut in unit-sphere space: transform plane into the ellipsoid's local space
        co = Vector(((face_pt.x - c.x) / rr[0], (face_pt.y - c.y) / rr[1], (face_pt.z - c.z) / rr[2]))
        nl = Vector((fn.x * rr[0], fn.y * rr[1], fn.z * rr[2])).normalized()
        g = cut(sphere(36, 18), co, nl, fill_mat="face", base_mat="clubhead")
        P.append((g, "clubhead", Mx(c, scale=rr)))
        P.append((sphere(24, 6), "chrome", Mx(c + Vector((0, 0.004, -0.036)), scale=(0.06, 0.05, 0.009))))   # sole plate
        P.append((tube([(0.016, 0.004, 0.06), (0.004, 0.0, 0.1), (0, 0, 0.13)], [0.016, 0.013, 0.012], 12, cap0="round", cap1="flat"), "clubhead", Mx()))
        hosel_top = Vector((0, 0, 0.13))
        return P, hosel_top, face_pt, fn
    if kind == "putter":
        blade = rbox(0.125, 0.034, 0.034, 0.009, 3)
        P.append((blade, "chrome", Mx((0.058, 0.0, 0.017))))
        P.append((rbox(0.1, 0.004, 0.024, 0.003, 1), "face", Mx((0.058, -0.0175, 0.018))))
        P.append((rbox(0.012, 0.03, 0.008, 0.003, 1), "face", Mx((0.058, 0.0, 0.0345))))   # sight line
        P.append((tube([(0.016, 0.0, 0.04), (0.016, 0.0, 0.07), (0.0, 0.0, 0.088), (0, 0, 0.135)], 0.0095, 10, cap0="round", cap1="flat"), "chrome", Mx()))
        piv = Vector((0, -0.017, 0))
        Rl = Mx(scale=1.3) @ Mx(piv) @ Mx(rot=(-L, 0, 0)) @ Mx(-piv)    # cartoon-oversized head
        P = [(g, m, Rl @ M) if i < 3 else (g, m, M) for i, (g, m, M) in enumerate(P)]
        return P, Vector((0, 0, 0.135)), Rl @ Vector((0.058, -0.0175, 0.018)), fn
    # iron / wedge: thick cartoon blade, toe higher than heel, then laid back by the loft around the leading edge
    w, h = (0.092, 0.054) if kind == "iron" else (0.096, 0.062)
    blade = warp(rbox(w, 0.026, h, 0.009, 3), lambda v: Vector((v.x, v.y + (0.004 if v.y > 0 else 0) * (v.z < 0), v.z * (0.82 + 0.36 * (v.x / w + 0.5)))))
    Rl = Mx(scale=1.3) @ Mx((0, -0.013, 0)) @ Mx(rot=(-L, 0, 0)) @ Mx((0, 0.013, 0))    # cartoon-oversized head
    bc = Vector((0.01 + w / 2, 0.0, h / 2 * 0.95))
    P.append((blade, "chrome", Rl @ Mx(bc)))
    P.append((rbox(w - 0.016, 0.004, h * 0.72, 0.004, 1), "face", Rl @ Mx(bc + Vector((0.002, -0.0125, -0.002)))))
    for k in range(4):   # grooves
        P.append((rbox(w - 0.03, 0.002, 0.0025, 0.0, 1), "chrome", Rl @ Mx(bc + Vector((0.002, -0.0148, -0.014 + k * 0.009)))))
    heel_top = Rl @ Vector((0.014, 0.0, h * 0.7))
    P.append((tube([heel_top, heel_top + Vector((-0.006, 0, 0.035)), Vector((0, 0, heel_top.z + 0.07))], [0.014, 0.012, 0.011], 12, cap0="round", cap1="flat"), "chrome", Mx()))
    face_pt = Rl @ (bc + Vector((0.002, -0.0145, -0.002)))
    return P, Vector((0, 0, heel_top.z + 0.07)), face_pt, fn

def build_clubs():
    man = {"units": "meters, three.js axes. Origin = butt end of the grip; shaft runs along -Y; striking face normal ~ +Z tilted up by the loft; toe toward +X.", "clubs": {}}
    for name, L, loft in CLUBS:
        kind = name.split("_")[1]
        P, htop, face_pt, fn = club_head(kind, loft)
        # lowest head point -> sole at z = -L
        minz = min((M @ Vector(v)).z for g, m, M in P for v in g[0])
        D = Mx((0, 0, -L - minz))
        b = B(name)
        for g, m, M in P:
            b.add(g, m, D @ M)
        hz = (D @ htop).z
        # shaft + grip
        b.add(lathe([(0.0076, hz - 0.004), (0.0085, hz + 0.08), (0.0105, -0.22), (0, -0.2)], 12), "shaft")
        b.add(lathe([(0.0108, hz - 0.002), (0.0122, hz + 0.004), (0.0118, hz + 0.022), (0.0088, hz + 0.03)], 14), "grip")   # ferrule
        b.add(lathe([(0.0, -0.235), (0.0125, -0.235), (0.016, -0.2), (0.0185, -0.1), (0.0205, -0.02), (0.022, -0.008), (0.019, 0.0), (0.0, 0.0015)], 16), "grip")
        b.add(lathe([(0.0207, -0.06), (0.0212, -0.05), (0.0207, -0.04)], 16), "shaft")   # grip band
        o = b.make()
        head_pts = [(D @ M) @ Vector(v) for g, m, M in P[:-1] for v in g[0]]
        lo = Vector((min(p.x for p in head_pts), min(p.y for p in head_pts), min(p.z for p in head_pts)))
        hi = Vector((max(p.x for p in head_pts), max(p.y for p in head_pts), max(p.z for p in head_pts)))
        man["clubs"][name] = {
            "length": L, "loft_deg": loft,
            "head_center": three((lo + hi) / 2),
            "head_size": [round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3)],
            "face_center": three(D @ face_pt),
            "face_normal": three(fn),
            "hosel_top": three(D @ htop),
            "bounds": bbox_three(o),
        }
    with open(os.path.join(ASSETS, "clubs.json"), "w") as f:
        json.dump(man, f, indent=1)
    return man

# =====================================================================================================
# 3) PROPS  (origin at ground contact, bottom centre, unless noted)
# =====================================================================================================
PROPS_MAN = {}

def catmull(pts, n):
    """Resample a polyline into n points along a Catmull-Rom spline."""
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    segs = len(pts) - 1
    for k in range(n):
        t = k / (n - 1) * segs
        i = min(int(t), segs - 1)
        u = t - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return out

def lumpy(amount, freq=1.5, seed=0.0):
    return lambda a, z, j: 1.0 + amount * noise.noise(Vector((math.cos(a) * freq + seed, math.sin(a) * freq, z * freq * 0.7 + seed * 1.7)))

def blob(b, c, r, mat, seg=20, rings=12, amt=0.05, seed=0.0, scale=(1, 1, 1)):
    b.add(lathe(sphere_prof(1.0, rings), seg, rfn=lumpy(amt, 1.6, seed)), mat, Mx(c, scale=(r * scale[0], r * scale[1], r * scale[2])))

def build_tree_round():
    b = B("tree_round")
    trunk = catmull([(0, 0, 0), (0.12, 0.02, 0.9), (-0.1, 0.0, 1.8), (0.05, -0.02, 2.6), (0.0, 0, 3.2)], 12)
    rr = [0.33 - 0.15 * k / 11 for k in range(12)]
    b.add(tube(trunk, rr, 14, cap0="flat", cap1=None), "trunk")
    roots = lambda a, z, j: 1.0 + (0.45 if j == 0 else 0.25 if j == 1 else 0.0) * max(0.0, math.cos(4 * a + 0.4)) ** 3
    b.add(lathe([(0.0, 0.0), (0.5, 0.0), (0.4, 0.12), (0.32, 0.4), (0.28, 0.55)], 20, rfn=roots), "trunk")
    for k, (c, r, m) in enumerate([((0, 0, 3.55), 1.38, "leaves"), ((0.98, 0.18, 3.2), 0.95, "leaves2"), ((-0.92, 0.12, 3.28), 1.0, "leaves"),
                                   ((0.28, -0.92, 3.25), 0.95, "leaves2"), ((-0.3, 0.92, 3.38), 0.98, "leaves2"), ((0.12, 0.05, 4.25), 0.88, "leaves"),
                                   ((-0.62, -0.55, 3.95), 0.6, "leaves"), ((0.7, 0.55, 3.95), 0.62, "leaves")]):
        blob(b, c, r, m, 22, 13, 0.05, k * 3.1)
    b.make()

def build_tree_pine():
    b = B("tree_pine")
    b.add(lathe([(0, 0), (0.34, 0.0), (0.26, 0.15), (0.21, 0.6), (0.19, 1.3), (0, 1.35)], 14), "trunk")
    for k, (zb, R, h) in enumerate([(0.8, 2.0, 2.0), (1.85, 1.62, 1.75), (2.85, 1.25, 1.6), (3.85, 0.85, 2.15)]):
        prof = [(0, zb + 0.25), (R * 0.85, zb + 0.02), (R, zb + 0.13), (R * 0.96, zb + 0.27), (R * 0.68, zb + 0.44 * h),
                (R * 0.4, zb + 0.7 * h), (R * 0.14, zb + 0.92 * h), (0, zb + h)]
        sc = lambda a, z, j, k=k: 1.0 + (0.07 if 1 <= j <= 3 else 0.02) * math.cos(9 * a + k) + 0.03 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, z)))
        b.add(lathe(prof, 36, rfn=sc, phase=k * 0.3), "pine")
    b.make()

def palm_geo(b, M=Matrix.Identity(4), seed=0, height=5.4):
    rnd = random.Random(seed)
    s = height / 5.4
    path = catmull([(0, 0, 0), (0.25 * s, 0, 1.4 * s), (0.65 * s, 0, 2.8 * s), (1.0 * s, 0, 4.2 * s), (1.12 * s, 0, height)], 22)
    rr = [(0.3 - 0.13 * k / 21) * (1.07 if k % 2 else 1.0) * max(s, 0.8) for k in range(22)]
    b.add(tube(path, rr, 12, cap0="flat", cap1="round", fmat=lambda i, j: "palm_trunk" if j % 2 else "palm_trunk2"), "palm_trunk", M)
    top = path[-1] + Vector((0, 0, 0.1))
    b.add(sphere(14, 8), "palm_trunk2", M @ Mx(top, scale=0.27 * s))
    for k in range(3):
        a = 2 * PI * k / 3 + 0.5
        b.add(sphere(14, 8), "coconut", M @ Mx(top + Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, -0.2)) * 1.0, scale=0.16 * s))
    nf = 8
    for k in range(nf):
        a = 2 * PI * k / nf + rnd.uniform(-0.2, 0.2)
        L = rnd.uniform(2.3, 2.9) * s
        lift = rnd.uniform(0.6, 1.1)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        up = Vector((0, 0, 1))
        steps = 16
        verts, faces = [], []
        for i in range(steps + 1):
            t = i / steps
            c = top + d * (L * t) + up * ((lift * t - 1.75 * t * t) * s)
            w = 0.5 * s * math.sin(PI * min(1.0, t ** 0.75)) * (1.0 if i % 2 == 0 else 0.78)
            verts += [tuple(c + side * w - up * 0.22 * w), tuple(c + up * 0.05 * s), tuple(c - side * w - up * 0.22 * w)]
        for i in range(steps):
            a0 = i * 3
            a1 = a0 + 3
            faces += [[a0, a1, a1 + 1, a0 + 1], [a0 + 1, a1 + 1, a1 + 2, a0 + 2]]
        b.add((verts, faces, [None] * len(faces)), "palm_leaf", M)

def build_tree_palm():
    b = B("tree_palm")
    palm_geo(b, seed=3, height=5.4)
    b.make()

def build_bush():
    b = B("bush")
    lumps = [((0, 0, 0.5), 0.46, "leaves")]
    for k in range(7):
        a = 2 * PI * k / 7 + 0.3
        lumps.append(((math.cos(a) * 0.5, math.sin(a) * 0.42, 0.33 + 0.04 * (k % 2)), 0.33 + 0.04 * ((k * 3) % 3), "leaves2" if k % 2 else "leaves"))
    for k in range(3):
        a = 2 * PI * k / 3 + 1.0
        lumps.append(((math.cos(a) * 0.24, math.sin(a) * 0.22, 0.68), 0.28, "leaves" if k % 2 else "leaves2"))
    lumps.append(((0.03, 0.0, 0.8), 0.2, "leaves"))
    for k, (c, r, m) in enumerate(lumps):
        blob(b, c, r, m, 18, 10, 0.06, k * 2.3)
    rnd = random.Random(7)
    for k in range(7):
        a = rnd.uniform(0, 2 * PI)
        el = rnd.uniform(0.2, 1.1)
        p = Vector((math.cos(a) * math.cos(el) * 0.6, math.sin(a) * math.cos(el) * 0.55, 0.42 + math.sin(el) * 0.5))
        for q in range(5):
            aa = 2 * PI * q / 5
            n = (p - Vector((0, 0, 0.4))).normalized()
            R = aim((0, 0, 1), n)
            b.add(sphere(8, 5), "flower_a", Mx(p + R @ Vector((math.cos(aa) * 0.035, math.sin(aa) * 0.035, 0)), R, (0.03, 0.03, 0.012)))
        b.add(sphere(8, 5), "flower_center", Mx(p + (p - Vector((0, 0, 0.4))).normalized() * 0.008, scale=0.018))
    b.make()

def flower_head(b, p, n, petal_mat, s=1.0):
    R = aim((0, 0, 1), n)
    for q in range(6):
        aa = 2 * PI * q / 6
        b.add(sphere(10, 6), petal_mat, Mx(p + R @ Vector((math.cos(aa) * 0.026 * s, math.sin(aa) * 0.026 * s, 0)), R @ Matrix.Rotation(aa, 3, "Z"), (0.022 * s, 0.013 * s, 0.006 * s)))
    b.add(sphere(10, 6), "flower_center", Mx(p + n * 0.004, R, (0.016 * s, 0.016 * s, 0.01 * s)))

def build_flowers():
    b = B("flowers")
    for k in range(5):
        a = 2 * PI * k / 5 + 0.3
        b.add(sphere(12, 6), "stem", Mx((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.012), (0, 0, a), (0.075, 0.028, 0.012)))
    mats = ["flower_a", "flower_b", "flower_c", "flower_a", "flower_b", "flower_c"]
    hts = [0.25, 0.2, 0.27, 0.18, 0.23, 0.16]
    for k in range(6):
        a = 2 * PI * k / 6
        base = Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0))
        lean = Vector((math.cos(a), math.sin(a), 0)) * (0.05 + 0.02 * (k % 2))
        tip = base + lean + Vector((0, 0, hts[k]))
        mid = base + lean * 0.3 + Vector((0, 0, hts[k] * 0.55))
        b.add(tube([base, mid, tip], 0.0065, 6, cap0=None, cap1=None), "stem")
        n = (Vector((0, 0, 1)) + lean * 3).normalized()
        flower_head(b, tip, n, mats[k], 1.0 + 0.15 * (k % 3))
    b.make()

def rock_geo(seed, scale, sub=2, amt=0.25):
    off = Vector((seed * 3.7, seed * 1.3, seed * 5.1))
    def f(v):
        n = noise.noise(v * 1.2 + off) * amt + noise.noise(v * 3.1 + off) * amt * 0.35
        p = v * (1 + n)
        return Vector((p.x * scale[0], p.y * scale[1], p.z * scale[2]))
    return warp(ico(sub), f)

def add_rock(b, c, seed, scale, sub=2, moss=True):
    g = rock_geo(seed, scale, sub)
    g = warp(g, lambda v: Vector((v.x + c[0], v.y + c[1], max(v.z + c[2], 0.0))))
    verts, faces, fm = g
    fm = []
    for f in faces:
        a, bb, cc = (Vector(verts[i]) for i in f[:3])
        n = (bb - a).cross(cc - a).normalized()
        fm.append("moss" if moss and n.z > 0.82 and min(verts[i][2] for i in f) > 0.3 * scale[2] else None)
    b.add((verts, faces, fm), "rock", smooth=False)

def build_rocks():
    b = B("rock_a")
    add_rock(b, (0, 0, 0.42), 1, (0.85, 0.68, 0.62))
    b.make()
    b = B("rock_b")
    add_rock(b, (0, 0, 0.8), 2, (0.58, 0.52, 1.0))
    b.make()
    b = B("rock_c")
    add_rock(b, (0.15, 0.05, 0.38), 3, (0.7, 0.6, 0.55))
    add_rock(b, (-0.72, -0.18, 0.18), 4, (0.36, 0.34, 0.3), moss=False)
    add_rock(b, (0.75, -0.42, 0.12), 5, (0.28, 0.26, 0.22), moss=False)
    b.make()

def build_clouds():
    for name, puffs in (("cloud_a", [(-3.5, 0, -0.3, 1.8), (-1.6, 0.25, 0.35, 2.5), (0.9, -0.1, 0.65, 2.9), (3.3, 0.1, -0.1, 2.0),
                                     (0.2, 0.9, -0.45, 2.0), (-0.5, -0.95, -0.5, 1.9), (2.2, -0.8, -0.6, 1.6)]),
                        ("cloud_b", [(-3.2, 0.1, -0.4, 1.6), (-1.2, -0.1, 0.3, 2.4), (1.4, 0.2, 0.05, 2.2), (3.4, -0.1, -0.5, 1.4),
                                     (0.1, 0.7, -0.5, 1.8), (-0.4, 0.2, 1.3, 1.5)])):
        b = B(name)
        for k, (x, y, z, r) in enumerate(puffs):
            g = warp(lathe(sphere_prof(1.0, 14), 24, rfn=lumpy(0.04, 1.5, k)), lambda v, x=x, y=y, z=z, r=r: Vector((x + v.x * r, y + v.y * r * 0.85, max(z + v.z * r, -1.35))))
            b.add(g, "cloud")
        vs = [v.co for v in b.bm.verts]
        c = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, (min(v.z for v in vs) + max(v.z for v in vs)) / 2))
        b.make(origin=c)

def build_flag():
    b = B("flagpole")
    zs = [-0.05] + [k * 0.055 for k in range(40)] + [2.15]
    prof = [(0, -0.05)] + [(0.032, z) for z in zs] + [(0, 2.15)]
    b.add(lathe(prof, 16, fmat=lambda i, j: "pole_red" if int((prof[min(j, len(prof) - 1)][1] + 0.0001) / 0.22) % 2 else "pole_white"), "pole_white")
    b.add(sphere(16, 10), "pole_top", Mx((0, 0, 2.17), scale=0.05))
    b.make()
    PROPS_MAN["flagpole"] = {"flag_attach": three((0.032, 0, 2.12)), "radius": 0.032, "height": 2.22}
    b = B("flag_cloth")
    nx, ny, W, H = 16, 10, 0.8, 0.5
    verts = [(W * i / nx, 0.0, -H * j / ny) for j in range(ny + 1) for i in range(nx + 1)]
    faces = [[j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i][::-1] for j in range(ny) for i in range(nx)]
    b.add((verts, faces, [None] * len(faces)), "flag", smooth=True)
    b.make(uv=lambda co, f: (co.x / W, 1.0 + co.z / H))
    PROPS_MAN["flag_cloth"] = {"size": [W, H], "segments": [nx, ny], "note": "origin = top attachment point (pole side); cloth spans x 0..0.8, y -0.5..0; uv.x = distance from pole / 0.8"}
    b = B("cup_rim")
    b.add(lathe([(0.276, -0.14), (0.276, -0.014), (0.271, -0.003), (0.263, 0.0), (0.255, -0.003), (0.25, -0.014), (0.25, -0.14)], 48), "cup")
    b.make()
    PROPS_MAN["cup_rim"] = {"inner_radius": 0.25, "outer_radius": 0.276, "depth": 0.14}

def build_tee_marker():
    b = B("tee_marker")
    b.add(lathe([(0, 0), (0.055, 0), (0.05, 0.03), (0.04, 0.1), (0.07, 0.115), (0.075, 0.125), (0, 0.13)], 18), "tee_stub")
    b.add(sphere(28, 16), "tee_marker", Mx((0, 0, 0.22), scale=0.13))
    b.make()

def build_mushroom():
    b = B("mushroom")
    zc, R, RZ = 0.6, 1.5, 0.6
    t0 = -0.25
    under = [(0, 0.55), (0.6, 0.54), (1.1, 0.5), (1.36, 0.465)]
    arc = [(R * math.cos(t), zc + RZ * math.sin(t)) for t in (t0 + (PI / 2 - t0) * k / 16 for k in range(17))]
    arc[-1] = (0.0, zc + RZ)
    prof = under + arc
    b.add(lathe(prof, 48, fmat=lambda i, j: "mushroom_gills" if j < 4 else "mushroom_cap"), "mushroom_cap")
    b.add(lathe([(0, 0), (0.5, 0), (0.56, 0.06), (0.54, 0.18), (0.48, 0.32), (0.44, 0.46), (0.42, 0.56), (0, 0.57)], 32), "mushroom_stem")
    for (az, el, rs) in [(0, 88, 0.3), (40, 32, 0.24), (112, 38, 0.27), (182, 35, 0.25), (252, 40, 0.26), (322, 34, 0.24),
                         (76, 62, 0.22), (200, 64, 0.23), (292, 63, 0.2), (150, 10, 0.18), (18, 8, 0.17), (262, 12, 0.17), (330, 70, 0.14)]:
        a, t = rad(az), rad(el)
        p = Vector((R * math.cos(t) * math.cos(a), R * math.cos(t) * math.sin(a), zc + RZ * math.sin(t)))
        n = Vector((math.cos(t) * math.cos(a) / R, math.cos(t) * math.sin(a) / R, math.sin(t) / RZ)).normalized()
        b.add(sphere(20, 8), "mushroom_spot", Mx(p - n * 0.012, aim((0, 0, 1), n), (rs, rs, rs * 0.16)))
    for sx in (1, -1):   # sleepy little face on the stem
        p = Vector((0.15 * sx, -0.535, 0.22))
        b.add(sphere(14, 8), "mushroom_eye", Mx(p, aim((0, -1, 0), Vector((0.3 * sx, -1, 0.1))), (0.045, 0.02, 0.07)))
    b.make()
    PROPS_MAN["mushroom"] = {"cap_radius": R, "cap_top": round(zc + RZ, 3), "cap_rim_height": round(zc + RZ * math.sin(t0), 3), "stem_radius": 0.5}

def build_bumper():
    b = B("bumper")
    b.add(lathe([(0, 0), (0.74, 0), (0.74, 0.12), (0.7, 0.16), (0, 0.16)], 40), "bumper_base")
    b.add(lathe([(0.64, 0.15), (0.75, 0.19), (0.8, 0.33), (0.75, 0.47), (0.64, 0.51)], 40), "bumper")
    b.add(lathe([(0.66, 0.49), (0.69, 0.53), (0.66, 0.59), (0.52, 0.66), (0.28, 0.695), (0, 0.7)], 40), "bumper_top")
    for k in range(8):
        a = 2 * PI * k / 8
        b.add(sphere(10, 6), "bumper_base", Mx((math.cos(a) * 0.71, math.sin(a) * 0.71, 0.14), scale=0.05))
    b.make()
    PROPS_MAN["bumper"] = {"radius": 0.8, "height": 0.7}

WM_HUB = Vector((0, -2.2, 6.5))     # three (0, 6.5, 2.2)

def build_windmill():
    # tower (octagonal, faces flat to +-X/+-Y) with a stone plinth, tunnel cut by a boolean
    tw = B("_wm_tower")
    prof = [(0, 0), (2.18, 0), (2.18, 1.4), (2.06, 1.47), (2.0, 1.5), (1.36, 6.25), (0, 6.25)]
    tw.add(lathe(prof, 8, phase=PI / 8, fmat=lambda i, j: "windmill_stone" if j <= 2 else "windmill_wall"), "windmill_wall", smooth=False)
    tower = tw.make()
    ct = B("_wm_cut")
    outline = [(-0.8, -0.5), (0.8, -0.5), (0.8, 0.4)] + [(0.8 * math.cos(a), 0.4 + 0.8 * math.sin(a)) for a in (PI * k / 16 for k in range(1, 16))] + [(-0.8, 0.4)]
    verts = [(x, -3.0, z) for x, z in outline] + [(x, 3.0, z) for x, z in outline]
    n = len(outline)
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    ct.add((verts, faces, [None] * len(faces)), "windmill_tunnel", smooth=False)
    cutter = ct.make()
    bm = bmesh.new()
    bm.from_mesh(cutter.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(cutter.data)
    bm.free()
    mod = tower.modifiers.new("tunnel", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    mod.material_mode = "TRANSFER"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tower.evaluated_get(dg))
    g = geo_mesh(me)
    for o in (tower, cutter):
        OBJ.pop(o.name, None)
        bpy.data.objects.remove(o, do_unlink=True)
    b = B("windmill_base")
    b.add(g, "windmill_wall", smooth=False)
    # arch trims at both tunnel mouths
    for yy, sgn in ((-1.9, -1), (1.9, 1)):
        pts = [(0.86, 0, -0.02), (0.86, 0, 0.4)] + [(0.86 * math.cos(a), 0, 0.4 + 0.86 * math.sin(a)) for a in (PI * k / 12 for k in range(1, 12))] + [(-0.86, 0, 0.4), (-0.86, 0, -0.02)]
        pts = [Vector(p) for p in pts]
        # follow the sloped wall: the plinth face is at |y| = 2.18*cos(22.5)
        yw = 2.18 * math.cos(PI / 8)
        b.add(tube([Vector((p.x, sgn * (yw + 0.01), p.z)) for p in pts], 0.07, 8, cap0="flat", cap1="flat"), "windmill_trim")
    # trim bands, windows, door-ish details
    b.add(lathe([(2.02, 1.46), (2.1, 1.5), (2.1, 1.6), (1.98, 1.64)], 8, phase=PI / 8), "windmill_trim", smooth=False)
    b.add(lathe([(1.5, 5.0), (1.58, 5.04), (1.58, 5.18), (1.48, 5.22)], 8, phase=PI / 8), "windmill_trim", smooth=False)
    def wall_r(z):
        return 2.0 + (1.36 - 2.0) * (z - 1.5) / (6.25 - 1.5)
    for (ang, z) in [(-90, 3.6), (0, 2.6), (180, 2.6), (90, 4.0), (-45, 2.2), (135, 3.2)]:
        a = rad(ang)
        r = wall_r(z) * math.cos(PI / 8) if ang % 90 == 0 else wall_r(z) * math.cos(PI / 8)
        p = Vector((math.cos(a) * (r + 0.04), math.sin(a) * (r + 0.04), z))
        Rz = Matrix.Rotation(a + PI / 2, 3, "Z") @ Matrix.Rotation(-math.atan2(2.0 - 1.36, 6.25 - 1.5), 3, "X")
        b.add(rbox(0.62, 0.1, 0.78, 0.06, 2), "windmill_trim", Mx(p, Rz))
        b.add(rbox(0.46, 0.1, 0.6, 0.05, 2), "window", Mx(p + Vector((math.cos(a), math.sin(a), 0)) * 0.03, Rz))
        b.add(rbox(0.06, 0.12, 0.62, 0.0, 1), "windmill_trim", Mx(p + Vector((math.cos(a), math.sin(a), 0)) * 0.05, Rz))
        b.add(rbox(0.48, 0.12, 0.06, 0.0, 1), "windmill_trim", Mx(p + Vector((math.cos(a), math.sin(a), 0)) * 0.05, Rz))
    # cap (dome roof) + finial + axle to the hub
    roof = [(0, 6.05), (1.62, 6.05), (1.66, 6.2), (1.6, 6.5), (1.42, 7.0), (1.08, 7.5), (0.62, 7.9), (0.2, 8.08), (0, 8.1)]
    b.add(lathe(roof, 24, fmat=lambda i, j: "windmill_trim" if j <= 1 else "windmill_roof"), "windmill_roof")
    b.add(sphere(14, 8), "windmill_trim", Mx((0, 0, 8.18), scale=0.16))
    b.add(tube([(0, -0.8, 6.5), (0, -2.08, 6.5)], 0.2, 14, cap0=None, cap1="flat"), "windmill_wood")
    b.add(tube([(0, -1.35, 6.5), (0, -1.55, 6.5)], 0.32, 14, cap0="flat", cap1="flat"), "windmill_trim")
    b.make()
    # blades: in Blender XZ plane (three XY), origin at the hub, spin about Blender -Y (three +Z)
    b = B("windmill_blades")
    b.add(tube([(0, 0.18, 0), (0, -0.2, 0)], 0.42, 20, cap0="flat", cap1="round", cap_rings=4), "windmill_trim")
    b.add(sphere(14, 8), "windmill_roof", Mx((0, -0.3, 0), scale=(0.18, 0.12, 0.18)))
    for k in range(4):
        a = PI / 4 + k * PI / 2
        R = Matrix.Rotation(-a, 4, "Y")      # radial dir in the XZ plane
        # stock along +X in local blade space
        b.add(rbox(5.4, 0.16, 0.2, 0.05, 2), "windmill_wood", R @ Mx((2.8, 0.0, 0.0)))
        # lattice frame offset to one side (+Z local), from r = 1.1 to 5.45
        r0, r1, w = 1.1, 5.45, 1.15
        for zz in (0.12, w * 0.5 + 0.06, w):
            b.add(rbox(r1 - r0, 0.07, 0.07, 0.02, 1), "windmill_wood", R @ Mx(((r0 + r1) / 2, -0.02, zz)))
        nbar = 10
        for q in range(nbar + 1):
            x = r0 + (r1 - r0) * q / nbar
            b.add(rbox(0.07, 0.07, w, 0.02, 1), "windmill_wood", R @ Mx((x, -0.02, w / 2 + 0.03)))
        # sail cloth over the outer two thirds, a little behind the lattice
        b.add(rbox(r1 - r0 - 1.0, 0.03, w - 0.1, 0.0, 1), "sail", R @ Mx(((r0 + 1.0 + r1) / 2, 0.06, w / 2 + 0.06)))
    b.make()
    PROPS_MAN["windmill_base"] = {"hub": three(WM_HUB), "tunnel": {"width": 1.6, "height": 1.2, "axis": "Z", "shape": "arch: straight walls to 0.4 m then a 0.8 m-radius half circle"},
                                  "base_width_flat_to_flat": 4.03, "base_width_corner_to_corner": 4.36}
    PROPS_MAN["windmill_blades"] = {"radius": 5.45, "spin_axis": "Z", "note": "origin = hub centre; place at windmill_base.hub"}

def build_goose():
    b = B("goose")
    S = Mx(scale=0.83)
    b.add(sphere(28, 16), "goose", S @ Mx((0, 0.06, 0.42), (0.25, 0, 0), (0.21, 0.33, 0.2)))
    b.add(sphere(16, 10), "goose", S @ Mx((0, 0.37, 0.56), (0.7, 0, 0), (0.1, 0.15, 0.065)))
    for sx in (1, -1):
        b.add(sphere(20, 12), "goose_wing", S @ Mx((0.152 * sx, 0.13, 0.47), (0.35, 0, rad(-3 * sx)), (0.06, 0.22, 0.115)))
    b.add(tube([(0, -0.14, 0.5), (0, -0.25, 0.62), (0, -0.24, 0.75), (0, -0.2, 0.85)], [0.088, 0.07, 0.064, 0.064], 16, cap0=None, cap1=None), "goose", S)
    b.add(sphere(22, 14), "goose", S @ Mx((0, -0.215, 0.885), scale=(0.088, 0.115, 0.088)))
    b.add(lathe([(0.0, -0.01), (0.046, 0.0), (0.042, 0.06), (0.026, 0.11), (0, 0.128)], 16), "goose_beak", S @ Mx((0, -0.29, 0.87), (rad(97), 0, 0), (1, 1, 1)))
    for sx in (1, -1):
        b.add(sphere(14, 8), "goose_eye", S @ Mx((0.043 * sx, -0.282, 0.918), (0, 0, rad(35 * sx)), (0.021, 0.018, 0.03)))
        b.add(sphere(8, 5), "goose", S @ Mx((0.04 * sx, -0.298, 0.928), scale=0.0075))
        b.add(tube([(0.07 * sx, 0.07, 0.3), (0.07 * sx, 0.05, 0.05)], 0.022, 8, cap0="flat", cap1="round"), "goose_beak", S)
        b.add(sphere(14, 6), "goose_beak", S @ Mx((0.075 * sx, -0.02, 0.018), (0, 0, rad(8 * sx)), (0.07, 0.085, 0.018)))
    b.make()

CANNON_PIVOT = Vector((0, 0.0, 1.0))

def build_cannon():
    b = B("cannon_base")
    outline = [(-0.6, 0.45), (-0.6, 1.02), (-0.25, 1.12), (0.25, 1.02), (1.55, 0.18), (1.55, 0.0), (1.2, 0.0), (0.2, 0.42)]
    for sx in (1, -1):
        b.add(prism_x(outline, 0.15, 0.04, 2), "cannon_wood", Mx((0.5 * sx, 0, 0)))
        # trunnion cap
        b.add(rbox(0.17, 0.26, 0.06, 0.02, 1), "iron", Mx((0.5 * sx, 0, 1.11)))
    b.add(rbox(0.86, 0.3, 0.2, 0.05, 2), "cannon_wood", Mx((0, -0.4, 0.62)))
    b.add(rbox(0.86, 0.35, 0.14, 0.04, 2), "cannon_wood", Mx((0, 1.25, 0.12)))
    b.add(tube([(-0.86, -0.1, 0.55), (0.86, -0.1, 0.55)], 0.06, 12, cap0="flat", cap1="flat"), "iron")
    for sx in (1, -1):
        W = Mx((0.74 * sx, -0.1, 0.55), (0, PI / 2, 0))
        b.add(lathe([(0.47, -0.06), (0.55, -0.055), (0.57, 0.0), (0.55, 0.055), (0.47, 0.06)], 32), "iron", W)
        b.add(torus(0.48, 0.05, 32, 8), "cannon_wood", W)
        b.add(lathe([(0, -0.1), (0.11, -0.1), (0.12, -0.05), (0.12, 0.05), (0.11, 0.1), (0, 0.1)], 16), "cannon_wood", W)
        for q in range(8):
            a = 2 * PI * q / 8
            b.add(rbox(0.05, 0.05, 0.4, 0.015, 1), "cannon_wood", W @ Mx((math.cos(a) * 0.28, math.sin(a) * 0.28, 0), (0, PI / 2, a)))
        b.add(tube([(0.08 * sx, 0, 0), (0.14 * sx, 0, 0)], 0.05, 10, cap0=None, cap1="round"), "iron", Mx((0.74 * sx, -0.1, 0.55)))
    b.make()
    b = B("cannon_barrel")
    prof = [(0, -1.02), (0.06, -1.01), (0.075, -0.97), (0.06, -0.93), (0.09, -0.9), (0.3, -0.89), (0.37, -0.85), (0.4, -0.78), (0.4, -0.7),
            (0.37, -0.66), (0.37, -0.42), (0.39, -0.4), (0.39, -0.34), (0.36, -0.32), (0.34, 0.3), (0.355, 0.32), (0.355, 0.38), (0.33, 0.4),
            (0.3, 1.1), (0.31, 1.18), (0.35, 1.27), (0.355, 1.34), (0.33, 1.38), (0.2, 1.38), (0.19, 1.3), (0.19, 0.6), (0, 0.6)]
    nb = len(prof)
    b.add(lathe(prof, 32, fmat=lambda i, j: "bore" if j >= nb - 4 else "iron"), "iron", Mx(rot=(PI / 2, 0, 0)))
    b.add(tube([(-0.6, 0, 0), (0.6, 0, 0)], 0.09, 14, cap0="flat", cap1="flat"), "iron")
    b.make()
    PROPS_MAN["cannon_base"] = {"barrel_pivot": three(CANNON_PIVOT), "note": "place cannon_barrel at barrel_pivot; it pitches about X"}
    PROPS_MAN["cannon_barrel"] = {"length": 2.4, "mouth_radius": 0.355, "bore_radius": 0.19, "muzzle": three((0, -1.38, 0)), "breech": three((0, 1.02, 0))}

def build_cart():
    b = B("golf_cart")
    b.add(rbox(1.2, 2.2, 0.32, 0.12, 3), "cart_body", Mx((0, 0, 0.44)))
    b.add(rbox(1.22, 2.24, 0.07, 0.03, 2), "cart_trim", Mx((0, 0, 0.52)))
    b.add(rbox(1.14, 0.62, 0.5, 0.2, 3), "cart_body", Mx((0, -0.84, 0.74)))
    b.add(rbox(1.26, 0.14, 0.14, 0.06, 2), "cart_frame", Mx((0, -1.17, 0.38)))
    b.add(rbox(1.26, 0.14, 0.14, 0.06, 2), "cart_frame", Mx((0, 1.15, 0.38)))
    b.add(rbox(1.05, 0.6, 0.3, 0.07, 2), "cart_body", Mx((0, 0.15, 0.74)))
    b.add(rbox(1.02, 0.58, 0.13, 0.06, 3), "cart_seat", Mx((0, 0.15, 0.94)))
    b.add(rbox(1.02, 0.13, 0.42, 0.06, 3), "cart_seat", Mx((0, 0.48, 1.18), (rad(-8), 0, 0)))
    b.add(rbox(1.1, 0.55, 0.26, 0.07, 2), "cart_body", Mx((0, 0.86, 0.72)))
    for sx in (1, -1):
        b.add(tube([(0.52 * sx, -0.62, 0.92), (0.53 * sx, -0.52, 1.95)], 0.035, 10, cap0="flat", cap1="flat"), "cart_frame")
        b.add(tube([(0.52 * sx, 0.6, 0.85), (0.53 * sx, 0.62, 1.95)], 0.035, 10, cap0="flat", cap1="flat"), "cart_frame")
        b.add(sphere(14, 8), "cart_light", Mx((0.36 * sx, -1.14, 0.78), scale=(0.08, 0.035, 0.08)))
        b.add(rbox(0.12, 0.03, 0.06, 0.02, 1), "golf_bag", Mx((0.45 * sx, 1.22, 0.62)))
    b.add(rbox(1.32, 1.62, 0.08, 0.04, 2), "cart_roof", Mx((0, 0.05, 2.0)))
    b.add(rbox(1.36, 1.66, 0.05, 0.025, 2), "cart_body", Mx((0, 0.05, 1.95)))
    # steering
    b.add(tube([(0.28, -0.56, 0.95), (0.28, -0.42, 1.15)], 0.025, 8), "cart_frame")
    b.add(torus(0.15, 0.022, 24, 8), "cart_frame", Mx((0.28, -0.4, 1.17), (rad(-50), 0, 0)))
    # golf bag with clubs
    bag = Mx((0, 0.95, 0.82), (rad(-18), 0, 0))
    b.add(lathe([(0, 0), (0.16, 0), (0.17, 0.05), (0.17, 0.75), (0.18, 0.8), (0.15, 0.82), (0, 0.8)], 18), "golf_bag", bag)
    b.add(lathe([(0.171, 0.3), (0.175, 0.32), (0.175, 0.4), (0.171, 0.42)], 18), "cart_body", bag)
    for k, (x, y, m) in enumerate([(-0.06, 0.04, "cart_trim"), (0.07, 0.03, "golf_bag"), (0.0, -0.07, "cart_body")]):
        b.add(tube([(x, y, 0.7), (x * 1.3, y * 1.3, 0.95)], 0.012, 6), "hub", bag)
        b.add(sphere(14, 8), m, bag @ Mx((x * 1.3, y * 1.3, 1.0), scale=(0.06, 0.06, 0.07)))
    for sx in (1, -1):
        for sy in (-0.78, 0.78):
            W = Mx((0.56 * sx, sy, 0.27), (0, PI / 2, 0))
            b.add(lathe([(0.12, -0.1), (0.2, -0.11), (0.26, -0.08), (0.275, 0.0), (0.26, 0.08), (0.2, 0.11), (0.12, 0.1)], 24), "tire", W)
            b.add(lathe([(0.0, -0.105), (0.13, -0.1), (0.13, 0.1), (0.0, 0.105)], 16), "hub", W)
    b.make()

SIGN_W, SIGN_H, SIGN_T = 1.6, 0.9, 0.05
SIGN_C = Vector((0, -0.01, 1.5))     # board centre relative to the sign_post origin (Blender)

def build_sign():
    b = B("sign_post")
    for sx in (1, -1):
        b.add(rbox(0.13, 0.13, 2.0, 0.035, 2), "sign_post", Mx((0.72 * sx, 0.07, 1.0)))
        b.add(lathe([(0.0, 0.0), (0.09, 0.0), (0.06, 0.07), (0.0, 0.1)], 4, phase=PI / 4), "sign_post", Mx((0.72 * sx, 0.07, 2.0)), smooth=False)
    b.add(rbox(SIGN_W + 0.16, 0.06, SIGN_H + 0.16, 0.03, 2), "sign_post", Mx((0, SIGN_C.y + SIGN_T / 2 + 0.03, SIGN_C.z)))
    b.make()
    b = B("sign_board")
    g = rbox(SIGN_W, SIGN_T, SIGN_H, 0.012, 2)
    verts, faces, fm = g
    fm = []
    for f in faces:
        a, bb, c = (Vector(verts[i]) for i in f[:3])
        n = (bb - a).cross(c - a).normalized()
        fm.append("sign_face" if n.y < -0.99 else "sign_board")
    b.add((verts, faces, fm), "sign_board", smooth=False)
    b.make(uv=lambda co, f: ((co.x + SIGN_W / 2) / SIGN_W, (co.z + SIGN_H / 2) / SIGN_H))
    PROPS_MAN["sign_post"] = {"board_center": three(SIGN_C), "board_size": [SIGN_W, SIGN_H, SIGN_T], "posts_x": [-0.72, 0.72]}
    PROPS_MAN["sign_board"] = {"size": [SIGN_W, SIGN_H, SIGN_T], "front": "+Z", "uv": "front face (material sign_face) spans uv 0..1 (u along +X, v up)",
                               "place_at": three(SIGN_C)}

def build_trophy():
    b = B("trophy")
    b.add(lathe([(0, 0), (0.5, 0), (0.5, 0.18), (0.46, 0.2), (0.4, 0.2), (0.4, 0.36), (0.36, 0.38), (0, 0.38)], 4, phase=PI / 4), "trophy_base", smooth=False)
    b.add(rbox(0.36, 0.03, 0.12, 0.01, 1), "gold", Mx((0, -0.405 * 0.707 - 0.0, 0.28), (0, 0, 0)))
    gold = [(0, 0.38), (0.3, 0.38), (0.31, 0.42), (0.24, 0.46), (0.14, 0.5), (0.1, 0.58), (0.17, 0.64), (0.17, 0.69), (0.1, 0.74), (0.09, 0.82),
            (0.14, 0.86), (0.28, 0.92), (0.4, 1.02), (0.46, 1.16), (0.48, 1.3), (0.5, 1.34), (0.49, 1.37), (0.44, 1.36), (0.42, 1.3), (0.4, 1.2), (0, 1.15)]
    b.add(lathe(gold, 40), "gold")
    b.add(lathe([(0, 1.3), (0.44, 1.31), (0.42, 1.36), (0.3, 1.42), (0.12, 1.45), (0.06, 1.48), (0, 1.5)], 40), "gold")
    b.add(lathe(sphere_prof(0.12, 14), 28, rfn=lambda a, z, j: 1.0 - 0.04 * max(0.0, math.cos(7 * a) * math.cos(9 * z / 0.12)) ** 6), "trophy_ball", Mx((0, 0, 1.6)))
    for sx in (1, -1):
        h = [(0.44 * sx, 0, 1.24), (0.62 * sx, 0, 1.24), (0.66 * sx, 0, 1.08), (0.52 * sx, 0, 0.96), (0.36 * sx, 0, 0.95)]
        b.add(tube(catmull(h, 12), 0.045, 12), "gold")
    b.make()

def build_balloon():
    b = B("balloon")
    prof = [(0.75, 3.15), (1.3, 3.55), (2.2, 4.4), (2.95, 5.4), (3.3, 6.4), (3.28, 7.2), (2.95, 8.0), (2.3, 8.6), (1.3, 8.98), (0.5, 9.1), (0, 9.12)]
    def fm(i, j):
        if 5 <= j <= 5:
            return "balloon_c"
        return "balloon_a" if (i // 2) % 2 == 0 else "balloon_b"
    b.add(lathe(prof, 32, fmat=fm), "balloon_a")
    b.add(lathe([(0.6, 2.95), (0.8, 3.0), (0.8, 3.2), (0.6, 3.25)], 32), "basket_rim")
    b.add(rbox(1.1, 1.1, 0.9, 0.08, 2), "basket", Mx((0, 0, 0.45)))
    b.add(rbox(1.18, 1.18, 0.12, 0.05, 2), "basket_rim", Mx((0, 0, 0.9)))
    b.add(lathe([(0, 1.55), (0.18, 1.55), (0.2, 1.75), (0.14, 1.85), (0, 1.86)], 12), "burner")
    for sx in (1, -1):
        for sy in (1, -1):
            b.add(tube([(0.5 * sx, 0.5 * sy, 0.95), (0.62 * sx, 0.62 * sy, 3.05)], 0.025, 6, cap0=None, cap1=None), "rope")
            b.add(tube([(0.5 * sx, 0.5 * sy, 0.95), (0.12 * sx, 0.12 * sy, 1.6)], 0.018, 6, cap0=None, cap1=None), "rope")
    b.make()
    PROPS_MAN["balloon"] = {"envelope_center": three((0, 0, 6.6)), "basket_top": three((0, 0, 0.96))}

def build_blimp():
    b = B("blimp")
    lift = 3.16
    prof = [(0, -7.0), (0.55, -6.75), (1.3, -6.0), (2.0, -4.6), (2.45, -2.8), (2.62, -0.8), (2.6, 1.2), (2.4, 3.2), (1.95, 4.9), (1.25, 6.1), (0.55, 6.8), (0, 7.0)]
    R = Mx((0, 0, lift), (PI / 2, 0, 0))     # lathe +Z -> Blender -Y (three +Z, nose forward)
    b.add(lathe(prof, 32, fmat=lambda i, j: "blimp_stripe" if j == 5 else "blimp"), "blimp", R)
    for k in range(4):
        a = k * PI / 2
        fin = prism_x([(-0.0, 0.0), (1.6, 0.0), (1.9, 1.7), (1.3, 1.75)], 0.12, 0.05, 2)
        # fin outline in (axial, radial); prism_x maps (y, z) -> put axial along Blender +Y (tail) and radial along z
        b.add(fin, "blimp_fin", Mx((0, 0, lift)) @ Mx(rot=(0, a, 0)) @ Mx((0, 4.3, 1.25)))
    b.add(rbox(0.9, 2.3, 0.62, 0.22, 3), "blimp_gondola", Mx((0, -0.4, lift - 2.85)))
    for q in range(4):
        for sx in (1, -1):
            b.add(rbox(0.04, 0.32, 0.22, 0.05, 1), "window", Mx((0.44 * sx, -1.2 + q * 0.55, lift - 2.8)))
    b.add(rbox(0.12, 0.6, 0.5, 0.05, 1), "blimp_gondola", Mx((0, -0.3, lift - 2.45)))
    b.make()
    PROPS_MAN["blimp"] = {"note": "origin at the bottom of the gondola (ground-contact rule); nose toward +Z", "envelope_center": three((0, 0, lift))}

def build_island():
    b = B("island")
    shore = lambda a, z, j: 1.0 + 0.12 * noise.noise(Vector((math.cos(a) * 1.4 + 4, math.sin(a) * 1.4, 0.3))) + 0.04 * noise.noise(Vector((math.cos(a) * 5, math.sin(a) * 5, 1)))
    b.add(lathe([(0, -3.5), (20.5, -3.5), (20.0, -1.5), (18.2, -0.25), (16.0, 0.45), (13.5, 0.9), (11.5, 1.05), (0, 1.1)], 64, rfn=shore), "sand")
    hill = lambda a, z, j: 1.0 + 0.16 * noise.noise(Vector((math.cos(a) * 1.6 + 9, math.sin(a) * 1.6, 2.0))) + 0.05 * noise.noise(Vector((math.cos(a) * 6, math.sin(a) * 6, z)))
    b.add(lathe([(12.6, 0.85), (12.2, 1.25), (10.8, 1.75), (8.5, 2.5), (5.5, 3.1), (2.5, 3.4), (0, 3.45)], 64, rfn=hill), "grass")
    for (x, y, rot, h, seed) in ((-2.0, 1.0, 0.3, 6.5, 11), (3.5, -1.5, 2.6, 7.4, 12), (1.0, 4.0, 4.4, 5.6, 13)):
        palm_geo(b, Mx((x, y, 3.0), (0, 0, rot)), seed, h)
    for (x, y, s, seed) in ((14.5, -6, 1.4, 21), (-12.5, 9.5, 1.1, 22), (8.5, 12.5, 0.9, 23)):
        add_rock(b, (x, y, 0.3), seed, (s, s * 0.85, s * 0.7), moss=False)
    b.make()
    PROPS_MAN["island"] = {"note": "origin at sea level; beach dips to y = -3.5 under the water"}

def build_fence():
    b = B("fence")
    for sx in (1, -1):
        b.add(rbox(0.11, 0.11, 0.56, 0.025, 2), "fence", Mx((0.92 * sx, 0, 0.28)))
        b.add(lathe([(0, 0), (0.078, 0), (0.0, 0.07)], 4, phase=PI / 4), "fence", Mx((0.92 * sx, 0, 0.56)), smooth=False)
    for z in (0.2, 0.44):
        b.add(rbox(2.0, 0.05, 0.1, 0.02, 2), "fence", Mx((0, -0.075, z)))
    b.make()

WS_ATTACH = Vector((0, 0, 2.85))

def build_windsock():
    b = B("windsock")
    b.add(lathe([(0, 0), (0.13, 0), (0.12, 0.06), (0.05, 0.1), (0.045, 0.3), (0.04, 2.8), (0, 2.82)], 16), "pole")
    b.add(sphere(12, 8), "pole_red", Mx((0, 0, 3.0), scale=0.06))
    b.add(tube([(0, 0, 2.8), (0, 0, 2.95)], 0.045, 12, cap0="flat", cap1="flat"), "pole")
    b.make()
    b = B("windsock_sock")
    b.add(tube([(0, 0, 0), (0.28, 0, 0)], 0.02, 8), "pole")
    b.add(torus(0.24, 0.018, 24, 6), "pole", Mx((0.3, 0, 0), (0, PI / 2, 0)))
    nl, nr = 12, 16
    L = 1.5
    verts, faces, fm = [], [], []
    for i in range(nl + 1):
        t = i / nl
        x = 0.3 + L * t
        r = 0.24 - 0.12 * t
        for j in range(nr):
            a = 2 * PI * j / nr
            verts.append((x, math.cos(a) * r, math.sin(a) * r))
    for i in range(nl):
        for j in range(nr):
            j2 = (j + 1) % nr
            faces.append([i * nr + j, (i + 1) * nr + j, (i + 1) * nr + j2, i * nr + j2])
            fm.append("sock_red" if (i * 5 // nl) % 2 == 0 else "sock_white")
    b.add((verts, faces, fm), "sock_red")
    b.make(uv=lambda co, f: (max(0.0, (co.x - 0.3) / L), (math.atan2(co.z, co.y) / (2 * PI)) % 1.0))
    PROPS_MAN["windsock"] = {"attach": three(WS_ATTACH)}
    PROPS_MAN["windsock_sock"] = {"note": "origin on the pole axis; spins about Y; sock spans x 0.3..1.8, uv.x = distance along the sock", "segments": [nl, nr]}

def build_lamp():
    b = B("lamp")
    b.add(lathe([(0, 0), (0.24, 0), (0.24, 0.08), (0.17, 0.14), (0.1, 0.3), (0.07, 0.4), (0.06, 1.9), (0.09, 1.95), (0.14, 2.0), (0, 2.01)], 16), "lamp_post")
    b.add(lathe([(0.13, 2.0), (0.17, 2.1), (0.17, 2.32), (0.13, 2.36)], 6, phase=PI / 6), "lamp_glow", smooth=False)
    b.add(lathe([(0, 2.33), (0.27, 2.34), (0.25, 2.4), (0.12, 2.5), (0.04, 2.55), (0, 2.56)], 6, phase=PI / 6), "lamp_post", smooth=False)
    b.add(sphere(12, 8), "lamp_post", Mx((0, 0, 2.6), scale=0.055))
    for k in range(6):
        a = PI / 6 + 2 * PI * k / 6
        b.add(tube([(math.cos(a) * 0.175, math.sin(a) * 0.175, 2.0), (math.cos(a) * 0.175, math.sin(a) * 0.175, 2.35)], 0.014, 6, cap0=None, cap1=None), "lamp_post")
    b.make()
    PROPS_MAN["lamp"] = {"light": three((0, 0, 2.2))}

def build_under_rock():
    b = B("under_rock")
    nper = 8
    sq = []          # perimeter of the 1x1 square, evenly spaced, counter-clockwise
    for side in range(4):
        for k in range(nper):
            t = -0.5 + k / nper
            p = [(t, -0.5), (0.5, t), (-t, 0.5), (-0.5, -t)][side]
            sq.append(Vector((p[0], p[1], 0)))
    n = len(sq)
    rings = [(0.0, 1.0, 0.0), (-0.055, 1.03, 0.0), (-0.15, 0.96, 0.15), (-0.3, 0.84, 0.4), (-0.47, 0.67, 0.65), (-0.64, 0.48, 0.85), (-0.8, 0.3, 1.0), (-0.92, 0.14, 1.0)]
    verts, faces = [Vector((0, 0, 0))], []
    idx = []
    for ri, (z, s, circ) in enumerate(rings):
        ring = []
        for k, p in enumerate(sq):
            a = math.atan2(p.y, p.x)
            c = Vector((math.cos(a), math.sin(a), 0)) * 0.56
            q = p.lerp(c, circ) * s
            if ri >= 2:
                nz = noise.noise(Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, z * 3.0)))
                q = q * (1.0 + 0.18 * nz)
                zz = z + 0.05 * noise.noise(Vector((math.cos(a) * 3 + 5, math.sin(a) * 3, z * 2)))
            elif ri == 1:
                zz = z - (0.045 if noise.noise(Vector((math.cos(a) * 4, math.sin(a) * 4, 7.0))) > 0.05 else 0.0)
            else:
                zz = 0.0
            verts.append(Vector((q.x, q.y, zz)))
            ring.append(len(verts) - 1)
        idx.append(ring)
    verts.append(Vector((0.02, -0.01, -1.0)))
    tip = len(verts) - 1
    for k in range(n):                       # flat top (fan)
        faces.append([0, idx[0][k], idx[0][(k + 1) % n]])
    for r in range(len(rings) - 1):
        A, Bq = idx[r], idx[r + 1]
        for k in range(n):
            k2 = (k + 1) % n
            faces.append([A[k], Bq[k], Bq[k2], A[k2]])
    for k in range(n):
        faces.append([idx[-1][k], tip, idx[-1][(k + 1) % n]])
    b.add(([tuple(v) for v in verts], faces, [None] * len(faces)), "under_rock", smooth=False)
    bmesh.ops.recalc_face_normals(b.bm, faces=b.bm.faces)
    # a few curly dangling roots
    rnd = random.Random(5)
    for k in range(5):
        p = sq[(k * 7 + 3) % n] * 0.99
        L = rnd.uniform(0.22, 0.42)
        out = Vector((p.x, p.y, 0)).normalized()
        side = Vector((-out.y, out.x, 0))
        pts = []
        for i in range(7):
            t = i / 6
            pts.append(p + out * (0.03 + 0.03 * math.sin(t * 3.0)) + side * 0.035 * math.sin(t * 5.0 + k) + Vector((0, 0, -0.05 - L * t)))
        b.add(tube(pts, [0.016 * (1 - 0.8 * i / 6) for i in range(7)], 6, cap0=None), "root")
    pal = [Vector(hexc(h)) for h in ("#d99a5f", "#c07a45", "#e8b072", "#b8693d")]
    def col(p):
        c = Vector(p.center)
        if p.normal.z > 0.9 and c.z > -0.01:
            return hexc("#5fbf45")
        if c.z > -0.07:
            return hexc("#4bab3a")
        depth = -c.z
        w = 0.06 * noise.noise(Vector((c.x * 3, c.y * 3, 1.0)))
        band = pal[int((depth + w) / 0.13) % len(pal)]
        base = band.lerp(Vector(hexc("#7a4a30")), min(1.0, depth) ** 1.5 * 0.6)
        if p.normal.z < -0.5:
            base = base * 0.85
        j = 0.94 + 0.12 * ((hash((round(c.x, 3), round(c.y, 3), round(c.z, 3))) % 100) / 100.0)
        return tuple(min(1.0, x * j) for x in base)
    b.make(vcol=col)
    PROPS_MAN["under_rock"] = {"note": "top face is the unit square x,z in -0.5..0.5 at y = 0; tapers to a point near y = -1; scale per platform"}

def build_spire():
    """One continuous craggy surface (rings every ~2 m) with partial ledges at strata boundaries,
    wobbly sandstone bands in vertex colour, grass on up-facing facets, boulders, summit pinnacles, tiny pines."""
    b = B("spire")
    seg = 44
    base = [(-45, 20.0), (-38, 19.5), (-20, 18.3), (0, 16.9), (20, 15.1), (40, 13.0), (58, 11.0), (70, 9.4), (77, 8.2), (80.5, 6.0), (83, 3.2), (84.5, 1.2)]
    def Rz(z):
        for (z0, r0), (z1, r1) in zip(base, base[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return base[-1][1] if z > base[-1][0] else base[0][1]
    def drift(z):
        return Vector((1.3 * noise.noise(Vector((0.3, 1.1, z * 0.018))), 1.3 * noise.noise(Vector((5.3, 2.1, z * 0.018))), 0))
    def crag(a, z):
        d = (math.cos(a), math.sin(a))
        n = (0.17 * noise.noise(Vector((d[0] * 1.2, d[1] * 1.2, z * 0.025)))
             + 0.14 * noise.noise(Vector((d[0] * 3.0 + 4, d[1] * 3.0, z * 0.07)))
             + 0.045 * noise.noise(Vector((d[0] * 7.0, d[1] * 7.0 + 2, z * 0.2))))
        return 1.0 + n
    rnd = random.Random(42)
    # strata boundaries
    bounds = []
    z = -45.0 + rnd.uniform(5, 8)
    while z < 74:
        bounds.append(z)
        z += rnd.choice([5.0, 6.5, 8.0, 9.5, 11.0])
    def ledge_w(a, k):
        return max(0.0, 3.2 * noise.noise(Vector((math.cos(a) * 1.5 + k * 3.1, math.sin(a) * 1.5, k * 0.7))) + 1.1)
    # ring list: (z, kind, k) kind 0 normal, 1 outer lip below a boundary, 2 inner shelf above it
    rz = []
    z = -45.0
    bi = 0
    while z < 79.6:
        nb = bounds[bi] if bi < len(bounds) else 999
        if z + 2.3 > nb - 0.3:
            rz += [(nb - 0.06, 1, bi), (nb + 0.06, 2, bi)]
            z = nb + 1.6
            bi += 1
            continue
        rz.append((z, 0, -1))
        z += 2.3
    rz += [(80.5, 0, -1), (82.4, 0, -1), (83.8, 0, -1)]
    verts, faces, idx = [Vector((0, 0, -45.3))], [], [[0] * seg]
    for (zz, kind, k) in rz:
        ring = []
        for i in range(seg):
            a = 2 * PI * i / seg
            r = Rz(zz) * crag(a, zz)
            if kind == 2:
                r -= ledge_w(a, k)
            jz = 0.0 if kind else 0.55 * noise.noise(Vector((math.cos(a) * 3 + 2, math.sin(a) * 3, zz * 0.21)))
            r = min(r, 21.35 - drift(zz).length)
            p = Vector((math.cos(a) * r, math.sin(a) * r, zz + jz)) + drift(zz)
            verts.append(p)
            ring.append(len(verts) - 1)
        idx.append(ring)
    verts.append(drift(85.0) + Vector((0.5, -0.3, 85.0)))
    idx.append([len(verts) - 1] * seg)
    for j in range(len(idx) - 1):
        A, Bq = idx[j], idx[j + 1]
        for i in range(seg):
            i2 = (i + 1) % seg
            q = []
            for x in (A[i], A[i2], Bq[i2], Bq[i]):
                if x not in q:
                    q.append(x)
            if len(q) >= 3:
                faces.append(q)
    b.add(([tuple(v) for v in verts], faces, [None] * len(faces)), "spire_rock", smooth=False)
    # boulders resting on the ledges
    shelves = []
    for k, zb in enumerate(bounds):
        if zb < -37:
            continue
        for q in range(8):
            a = rnd.uniform(0, 2 * PI)
            w = ledge_w(a, k)
            if w > 1.4:
                r = Rz(zb) * crag(a, zb) - w * 0.5
                shelves.append((Vector((math.cos(a) * r, math.sin(a) * r, zb)) + drift(zb), w, a))
    rnd.shuffle(shelves)
    for q, (p, w, a) in enumerate(shelves[:10]):
        s = min(w * 0.45, rnd.uniform(0.9, 1.8))
        if p.xy.length + s * 1.3 > 21.3:
            continue
        b.add(rock_geo(100 + q, (s, s * 0.85, s * 0.7), sub=1, amt=0.3), "spire_rock", Mx(p + Vector((0, 0, s * 0.35)), (0, 0, a)), smooth=False)
    # summit pinnacles
    top = drift(80.0)
    for q, (a, rr, zb, hh) in enumerate(((0.4, 0.8, 76.0, 9.0), (2.3, 0.84, 74.5, 7.5), (4.2, 0.78, 76.5, 8.5), (5.5, 0.86, 73.0, 6.5))):
        rr = rr * Rz(zb)
        pin = lathe([(1.7, 0), (1.3, hh * 0.4), (0.75, hh * 0.75), (0.0, hh)], 5, phase=q,
                    rfn=lambda aa, zz, j, q=q: 1.0 + 0.25 * noise.noise(Vector((math.cos(aa) * 2, math.sin(aa) * 2, zz * 0.3 + q))))
        b.add(pin, "spire_rock", Mx(top + Vector((math.cos(a) * rr, math.sin(a) * rr, zb)), (0.12 * math.sin(a), -0.12 * math.cos(a), 0)), smooth=False)
    NROCK_FACES[0] = len(b.bm.faces)
    # little pines on the wider shelves
    for (p, w, a) in shelves[10:30]:
        if w < 1.8:
            continue
        s = rnd.uniform(1.3, 2.4)
        b.add(lathe([(0, 0), (0.45 * s, 0.2 * s), (0.26 * s, 0.75 * s), (0.36 * s, 0.7 * s), (0.0, 1.5 * s)], 6, phase=rnd.uniform(0, 1)), "spire_rock", Mx(p), smooth=False)
    pal = [hexc(h) for h in ("#dba26a", "#c98652", "#e8bb82", "#b9774a", "#d39560", "#efc995", "#c07a4a")]
    band_pal = [pal[rnd.randrange(len(pal))] for _ in range(len(bounds) * 3 + 4)]
    def col(p):
        c = Vector(p.center)
        n = p.normal
        hsh = (hash((round(c.x, 2), round(c.y, 2), round(c.z, 2))) % 1000) / 1000.0
        if p.index >= NROCK_FACES[0]:
            return Vector(hexc("#2f8f4f")).lerp(Vector(hexc("#46b05e")), hsh)[:]
        if n.z > 0.62 and c.z > -39.0:
            return Vector(hexc("#69c24a")).lerp(Vector(hexc("#52aa3e")), hsh)[:]
        a = math.atan2(c.y, c.x)
        zw = c.z + 1.6 * noise.noise(Vector((math.cos(a) * 1.4, math.sin(a) * 1.4, c.z * 0.04 + 9)))
        bi = 0
        while bi < len(bounds) and zw > bounds[bi]:
            bi += 1
        z0 = bounds[bi - 1] if bi > 0 else -45.0
        z1 = bounds[bi] if bi < len(bounds) else 86.0
        t = (zw - z0) / max(0.1, z1 - z0)
        sub = int(t * 3.0)                     # thin sub-bands inside each stratum
        band = Vector(band_pal[(bi * 3 + sub) % len(band_pal)]).lerp(Vector(band_pal[bi * 3 % len(band_pal)]), 0.55)
        if t > 0.9:
            band = band.lerp(Vector(hexc("#f6dfb5")), 0.4)
        if n.z < -0.3:
            band = band * 0.8
        if c.z < -36.0:
            band = band.lerp(Vector(hexc("#6e5a4c")), min(1.0, (-36.0 - c.z) / 8.0))
        if c.z > 79.0:
            band = band.lerp(Vector(hexc("#f3e6d2")), min(1.0, (c.z - 79.0) / 5.0) * 0.6)
        j = 0.93 + 0.12 * hsh
        return tuple(min(1.0, x * j) for x in band)
    b.make(vcol=col)
    o = OBJ["spire"]
    ra = max(math.hypot(v.co.x, v.co.y) for v in o.data.vertices)
    PROPS_MAN["spire"] = {"max_radius": round(ra, 3), "base_y": -45.3, "peak_y": round(max(v.co.z for v in o.data.vertices), 2), "sea_level_y": -40.0,
                          "strata_ledges_y": [round(z, 2) for z in bounds],
                          "tris": sum(len(p.vertices) - 2 for p in o.data.polygons)}

NROCK_FACES = [0]

PROPS = ["tree_round", "tree_pine", "tree_palm", "bush", "flowers", "rock_a", "rock_b", "rock_c", "cloud_a", "cloud_b",
         "flagpole", "flag_cloth", "cup_rim", "tee_marker", "mushroom", "bumper", "windmill_base", "windmill_blades", "goose",
         "cannon_base", "cannon_barrel", "golf_cart", "sign_post", "sign_board", "trophy", "balloon", "blimp", "island",
         "fence", "windsock", "windsock_sock", "lamp", "under_rock", "spire"]

def build_props():
    build_tree_round(); build_tree_pine(); build_tree_palm(); build_bush(); build_flowers(); build_rocks(); build_clouds()
    build_flag(); build_tee_marker(); build_mushroom(); build_bumper(); build_windmill(); build_goose(); build_cannon(); build_cart()
    build_sign(); build_trophy(); build_balloon(); build_blimp(); build_island(); build_fence(); build_windsock(); build_lamp()
    build_under_rock(); build_spire()
    man = {"units": "meters, three.js axes (+Y up, +Z forward). Origins at ground contact (bottom centre) unless noted.", "objects": {}}
    for n in PROPS:
        e = {"bounds": bbox_three(OBJ[n]), "materials": [m.name for m in OBJ[n].data.materials],
             "tris": sum(len(p.vertices) - 2 for p in OBJ[n].data.polygons)}
        e.update(PROPS_MAN.get(n, {}))
        man["objects"][n] = e
        print(f"PROP {n}: {len(OBJ[n].data.vertices)} verts, {len(OBJ[n].data.loops)} loops, {e['tris']} tris")
    with open(os.path.join(ASSETS, "props.json"), "w") as f:
        json.dump(man, f, indent=1)
    return man

# =====================================================================================================
# export + read-back checks
# =====================================================================================================
problems = []

def export_glb(fname, names):
    path = os.path.join(ASSETS, fname)
    for o in bpy.data.objects:
        o.select_set(False)
    for n in names:
        OBJ[n].select_set(True)
    bpy.context.view_layer.objects.active = OBJ[names[0]]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_materials="EXPORT", export_vertex_color="ACTIVE", export_cameras=False, export_lights=False,
                              export_animations=False, export_skins=False, export_morph=False, export_image_format="NONE",
                              export_extras=False)
    check_glb(path, names)
    return path

def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    ln = struct.unpack("<I", data[12:16])[0]
    return json.loads(data[20:20 + ln].decode("utf-8"))

def check_glb(path, names):
    g = read_glb(path)
    nodes = g.get("nodes", [])
    got = [n.get("name") for n in nodes]
    size = os.path.getsize(path)
    for n in names:
        if n not in got:
            problems.append(f"{os.path.basename(path)}: missing node {n}")
    for n in nodes:
        if any(k in n for k in ("translation", "rotation", "scale", "children")):
            problems.append(f"{os.path.basename(path)}: node {n.get('name')} has a transform/children")
    for n in nodes:
        mesh = g["meshes"][n["mesh"]]
        attrs = set()
        for p in mesh["primitives"]:
            attrs |= set(p["attributes"])
        if n["name"] in ("spire", "under_rock") and "COLOR_0" not in attrs:
            problems.append(f"{n['name']}: no COLOR_0")
        if n["name"] in ("sign_board", "flag_cloth", "windsock_sock") and "TEXCOORD_0" not in attrs:
            problems.append(f"{n['name']}: no TEXCOORD_0")
    print(f"EXPORTED {os.path.basename(path)}: {size / 1024:.0f} KB, {len(nodes)} nodes, materials: {sorted(m['name'] for m in g.get('materials', []))}")
    if size > 2.5 * 1024 * 1024:
        problems.append(f"{os.path.basename(path)} is {size / 1048576:.2f} MB > 2.5 MB")

# =====================================================================================================
# previews (Eevee lineups of linked duplicates; the exported originals are hidden from render)
# =====================================================================================================
PV = []

def setup_render():
    sc = SCENE
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    w = bpy.data.worlds.new("pv_world")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*hexc("#a9d8ff"), 1.0)
    bg.inputs["Strength"].default_value = 1.1
    sc.world = w
    sun = bpy.data.lights.new("pv_sun", "SUN")
    sun.energy = 3.2
    sun.angle = rad(6)
    so = link(bpy.data.objects.new("pv_sun", sun))
    so.rotation_euler = Vector((0.45, 0.75, -0.75)).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.cameras.new("pv_cam")
    cam.clip_start, cam.clip_end = 0.01, 5000
    co = link(bpy.data.objects.new("pv_cam", cam))
    sc.camera = co
    mat("pv_ground", "#9edc7f", 0.95)
    mat("pv_label", "#20242e", 0.6)
    me = bpy.data.meshes.new("pv_ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4000)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(MATS["pv_ground"])
    link(bpy.data.objects.new("pv_ground", me))
    for o in OBJ.values():
        o.hide_render = True

def lineup(fname, items, cam_dir=(0.0, -1.0, 0.35), gap=0.3, fov=26, labels=True, ground=True, cols=None, res_x=1600, lift=True, zmax=None):
    """Render items [(label, [(objname, Matrix)])] in rows of `cols`, camera fitted to the whole set."""
    if PREV_ONLY and fname not in PREV_ONLY:
        return
    tmp = []
    placed = []
    for label, parts in items:
        pts = []
        for n, M in parts:
            vs = OBJ[n].data.vertices
            step = max(1, len(vs) // 3000)
            pts += [M @ vs[i].co for i in range(0, len(vs), step)]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        placed.append((label, parts, lo, hi))
    cols = cols or len(placed)
    maxh = max(hi.z - lo.z for _, _, lo, hi in placed)
    maxw = max(hi.x - lo.x for _, _, lo, hi in placed)
    g = gap * max(maxh, maxw) * 0.6
    lsize = 0.055 * max(maxh, maxw * 0.8)
    corners = []
    yrow = 0.0
    for r0 in range(0, len(placed), cols):
        row = placed[r0:r0 + cols]
        widths = [hi.x - lo.x for _, _, lo, hi in row]
        depth = max(hi.y - lo.y for _, _, lo, hi in row)
        x = -(sum(widths) + g * (len(row) - 1)) / 2
        for (label, parts, lo, hi), w in zip(row, widths):
            off = Matrix.Translation((x - lo.x, yrow - (lo.y + hi.y) / 2, -lo.z if lift else 0.0))
            for n, M in parts:
                ob = link(bpy.data.objects.new(n + "_pv", OBJ[n].data))
                ob.matrix_world = off @ M
                tmp.append(ob)
            l2, h2 = off @ lo, off @ hi
            corners += [Vector((px, py, pz)) for px in (l2.x, h2.x) for py in (l2.y, h2.y) for pz in (l2.z, h2.z)]
            if labels:
                cu = bpy.data.curves.new(label + "_lbl", "FONT")
                cu.body = label
                cu.align_x = "CENTER"
                cu.size = lsize
                cu.materials.append(MATS["pv_label"])
                to = link(bpy.data.objects.new(label + "_lbl", cu))
                to.location = (x + w / 2, yrow - depth / 2 - lsize * 0.4, 0.002 + (l2.z if not lift else 0))
                to.rotation_euler = (rad(55), 0, 0)
                tmp.append(to)
                corners.append(Vector((x + w / 2, yrow - depth / 2 - lsize * 1.2, 0)))
            x += w + g
        yrow += depth + g + lsize * 2
    if zmax is not None:
        corners = [Vector((p.x, p.y, min(p.z, zmax))) for p in corners]
    d = Vector(cam_dir).normalized()
    fwd = -d
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd).normalized()
    c0 = sum(corners, Vector()) / len(corners)
    xs = [(p - c0).dot(right) for p in corners]
    ys = [(p - c0).dot(up) for p in corners]
    c = c0 + right * (max(xs) + min(xs)) / 2 + up * (max(ys) + min(ys)) / 2
    aspect = (max(ys) - min(ys)) / max(1e-6, (max(xs) - min(xs)))
    SCENE.render.resolution_x = res_x
    SCENE.render.resolution_y = int(min(1400, max(420, res_x * aspect * 1.12)))
    th = math.tan(rad(fov) / 2)
    tv = th * SCENE.render.resolution_y / SCENE.render.resolution_x
    D = 0.0
    for p in corners:
        q = p - c
        D = max(D, abs(q.dot(right)) / th + q.dot(d), abs(q.dot(up)) / tv + q.dot(d))
    D *= 1.05
    cam = SCENE.camera
    cam.data.angle = rad(fov)
    cam.location = c + d * D
    cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
    bpy.data.objects["pv_ground"].hide_render = not ground
    SCENE.render.filepath = os.path.join(PREV, fname + ".png")
    bpy.ops.render.render(write_still=True)
    PV.append(SCENE.render.filepath)
    print("PREVIEW", SCENE.render.filepath)
    for o in tmp:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)

def one(n, M=None):
    return [(n, M or Matrix.Identity(4))]

ADDRESS = {"hips": (0.2, 0, 0), "spine": (0.5, 0, 0), "head": (-0.45, 0, 0),
           "th_l": (-0.45, 0, rad(-4)), "th_r": (-0.45, 0, rad(4)), "sh_l": (0.45, 0, 0), "sh_r": (0.45, 0, 0), "shoe_l": (-0.2, 0, 0), "shoe_r": (-0.2, 0, 0),
           "ua_l": (-0.85, 0.3, 0), "ua_r": (-0.85, -0.3, 0), "fa_l": (-0.1, 0.05, 0), "fa_r": (-0.1, -0.05, 0),
           "hand_l": (0, 0, rad(-60)), "hand_r": (0, 0, rad(60))}
STAND = {"ua_l": (0.05, -0.16, 0), "ua_r": (0.05, 0.16, 0), "fa_l": (-0.25, 0, 0), "fa_r": (-0.25, 0, 0)}

def with_club(parts, club):
    hands = [m @ Vector((0, 0, -0.05)) for n, m in parts if n.startswith("hand_")]
    grip = (hands[0] + hands[1]) / 2
    L = dict((c[0], c[1]) for c in CLUBS)[club]
    butt = grip + Vector((0, 0.0, 0.07))
    reach = math.sqrt(max(L * L - butt.z * butt.z, 0.01))
    d = (Vector((butt.x, butt.y - reach, 0)) - butt).normalized()
    z = -d
    tx = Vector((1, 0, 0))
    y = -(tx - z * tx.dot(z)).normalized()
    x = y.cross(z)
    R = Matrix((x, y, z)).transposed().to_4x4()
    return parts + [(club, Matrix.Translation(butt) @ R)]

def previews(groups):
    setup_render()
    if "golfer" in groups:
        lineup("golfer_parts", [(n, one(n)) for n in GOLFER], cam_dir=(0.0, -1, 0.5), gap=0.25, cols=7)
        rows = [("front", golfer_pose(STAND)),
                ("cap + stache", golfer_pose(STAND, "hat_cap", True, Mx(rot=(0, 0, rad(30))))),
                ("side, beanie", golfer_pose(STAND, "hat_beanie", False, Mx(rot=(0, 0, rad(90))))),
                ("back, top hat", golfer_pose(STAND, "hat_tophat", True, Mx(rot=(0, 0, rad(180))))),
                ("visor", golfer_pose(STAND, "hat_visor", False, Mx(rot=(0, 0, rad(-25)))))]
        if "club_iron" in OBJ:
            rows.append(("address (iron)", with_club(golfer_pose(ADDRESS, "hat_bucket", False), "club_iron")))
            rows.append(("address side", [(n, Mx(rot=(0, 0, rad(-90))) @ m) for n, m in with_club(golfer_pose(ADDRESS, "hat_viking", True), "club_driver")]))
        lineup("golfer_assembled", rows, cam_dir=(0.0, -1, 0.22), gap=0.2, fov=24)
        hats = ["hat_cap", "hat_bucket", "hat_beanie", "hat_viking", "hat_tophat", "hat_crown", "hat_visor"]
        lineup("golfer_hats", [(h, golfer_pose(STAND, h, i % 2 == 1, Mx(rot=(0, 0, rad(20))))) for i, h in enumerate(hats)], cam_dir=(0.0, -1, 0.3), gap=0.15, fov=22, cols=4)
        heads = []
        for h in [None, "hat_cap", "hat_viking", "hat_crown", "hat_bucket"]:
            parts = [(n, m) for n, m in golfer_pose(STAND, h, h in ("hat_viking", "hat_crown")) if n in ("head", "eyes", "stache", "torso") or (h and n == h)]
            heads.append((h or "bare", parts))
        lineup("golfer_faces", heads, cam_dir=(0.1, -1, 0.12), gap=0.1, fov=20, labels=False)
        side = [(n, m) for n, m in golfer_pose(STAND, "hat_cap", True) if n in ("head", "eyes", "stache", "torso", "hat_cap")]
        lineup("golfer_faces_side", [("3/4", [(n, Mx(rot=(0, 0, rad(40))) @ m) for n, m in side]), ("side", [(n, Mx(rot=(0, 0, rad(90))) @ m) for n, m in side]),
                                     ("above", [(n, Mx(rot=(rad(25), 0, rad(15))) @ m) for n, m in side])], cam_dir=(0.0, -1, 0.15), gap=0.1, fov=20, labels=False)
    if "clubs" in groups:
        names = [c[0] for c in CLUBS]
        items = [(n, one(n)) for n in names] + [(n.split("_")[1] + " side", one(n, Mx(rot=(0, 0, rad(-90))))) for n in names]
        lineup("clubs", items, cam_dir=(0.0, -1, 0.15), gap=0.25, fov=24, labels=False)
        heads = []
        for n in names:
            o = OBJ[n]
            lo, hi = bbox_of(o)
            heads.append((n, [(n, Mx(rot=(0, 0, rad(-30))) @ Matrix.Translation((0, 0, -lo.z)))]))
        # close-up of the heads: crop by rendering only the bottom of each club
        lineup("club_heads", [(n, [(n, M)]) for n, [(nn, M)] in heads], cam_dir=(0.25, -1, 0.3), gap=0.6, fov=20, labels=False, zmax=0.17)
    if "props" in groups:
        lineup("props_small", [("flowers", one("flowers")), ("tee_marker", one("tee_marker")), ("cup_rim", one("cup_rim")), ("goose", one("goose", Mx(rot=(0, 0, rad(-35)))))],
               cam_dir=(0.0, -1, 0.4), gap=0.25, fov=24)
        lineup("props_mid", [("rock_a", one("rock_a")), ("rock_b", one("rock_b")), ("rock_c", one("rock_c")), ("bush", one("bush")),
                             ("fence", one("fence")), ("sign", [("sign_post", Matrix.Identity(4)), ("sign_board", Matrix.Translation(SIGN_C))]),
                             ("lamp", one("lamp")), ("trophy", one("trophy")), ("bumper", one("bumper")),
                             ("flag", [("flagpole", Matrix.Identity(4)), ("flag_cloth", Matrix.Translation((0.032, 0, 2.12)))]),
                             ("windsock", [("windsock", Matrix.Identity(4)), ("windsock_sock", Matrix.Translation(WS_ATTACH) @ Mx(rot=(0, 0, rad(-30))))]),
                             ("cannon", [("cannon_base", Mx(rot=(0, 0, rad(-30)))), ("cannon_barrel", Mx(rot=(0, 0, rad(-30))) @ Matrix.Translation(CANNON_PIVOT) @ Mx(rot=(rad(-12), 0, 0)))])],
               cam_dir=(0.0, -1, 0.45), gap=0.2, fov=24, cols=6)
        lineup("props_trees", [("tree_round", one("tree_round")), ("tree_pine", one("tree_pine")), ("tree_palm", one("tree_palm")), ("mushroom", one("mushroom")),
                               ("golf_cart", one("golf_cart", Mx(rot=(0, 0, rad(-35))))), ("goose", one("goose", Mx(scale=3)))],
               cam_dir=(0.0, -1, 0.35), gap=0.15, fov=24)
        lineup("windmill", [("windmill 3/4", [("windmill_base", Mx(rot=(0, 0, rad(30)))), ("windmill_blades", Mx(rot=(0, 0, rad(30))) @ Matrix.Translation(WM_HUB) @ Mx(rot=(0, rad(15), 0)))]),
                            ("front", [("windmill_base", Matrix.Identity(4)), ("windmill_blades", Matrix.Translation(WM_HUB))]),
                            ("back", [("windmill_base", Mx(rot=(0, 0, rad(160)))), ("windmill_blades", Mx(rot=(0, 0, rad(160))) @ Matrix.Translation(WM_HUB))])],
               cam_dir=(0.1, -1, 0.3), gap=0.15, fov=26)
        lineup("props_sky", [("balloon", one("balloon")), ("blimp", one("blimp", Mx(rot=(0, 0, rad(-60))))), ("cloud_a", one("cloud_a")), ("cloud_b", one("cloud_b"))],
               cam_dir=(0.0, -1, 0.25), gap=0.1, fov=26)
        lineup("spire", [("spire", one("spire")), ("island", one("island"))], cam_dir=(0.3, -1, 0.2), gap=0.15, fov=26)
        lineup("spire_close", [("spire", one("spire", Mx(rot=(0, 0, rad(70))))), ("spire", one("spire", Mx(rot=(0, 0, rad(200)))))], cam_dir=(0.0, -1, 0.4), gap=0.1, fov=26, labels=False)
        lineup("island", [("island", one("island"))], cam_dir=(0.2, -1, 0.45), fov=26, labels=False)
        ur = [("under_rock", one("under_rock")), ("x(6,3,6)", one("under_rock", Mx(scale=(6, 6, 3)))), ("x(4,1.5,8)", one("under_rock", Mx(scale=(4, 8, 1.5))))]
        lineup("under_rock", ur, cam_dir=(0.0, -1, 0.15), gap=0.2, fov=24, ground=False)

# =====================================================================================================
# main
# =====================================================================================================
noise.seed_set(1234)
define_materials()
built = []
summary = {}
if want("golfer"):
    summary["golfer"] = build_golfer()
    export_glb("golfer.glb", GOLFER)
    built.append("golfer")
if want("clubs"):
    summary["clubs"] = build_clubs()
    export_glb("clubs.glb", [c[0] for c in CLUBS])
    built.append("clubs")
if want("props"):
    summary["props"] = build_props()
    export_glb("props.glb", PROPS)
    built.append("props")
if not NO_RENDER:
    previews(built)
for fn in ("golfer.glb", "clubs.glb", "props.glb"):
    p = os.path.join(ASSETS, fn)
    if os.path.exists(p):
        print(f"SIZE {fn} {os.path.getsize(p)} bytes")
if problems:
    print("PROBLEMS:")
    for p in problems:
        print("  ", p)
    sys.exit(1)
print("ASSETS OK")
