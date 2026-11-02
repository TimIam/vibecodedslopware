"""
Timberline - procedural jointed "faller" (professional logger) character.

Run headless:
  blender --background --factory-startup --python tools/blender/build_faller.py -- [OUTDIR]
                                       [--preview PNG] [--views DIR]

  OUTDIR    directory that receives faller.glb (default: assets/models)
  --preview path of the 800x800 3/4 preview (default: OUTDIR/../previews/faller.png)
  --views   optional directory for extra debug renders (front/side/back/close-ups/pose test)

Everything is modelled in glTF / Three.js space (x forward, y up, z = the
character's right side) and converted to Blender space with the matrix C, so
the exporter's +Y-up conversion yields exactly the coordinates written here.
The character faces +X, feet on y = 0.

Rig: one mesh object per rigid body part, origin exactly at its joint pivot,
rotation identity / scale 1 in the rest pose, so the exported glTF nodes carry
translations only.  The game poses the figure by rotating the nodes.

  faller (empty, ground between the feet)
    pelvis
      spine
        chest
          neck_head
            helmet
              visor          (origin on the visor hinge; rotate about Z to flip up)
          upperarm_R / forearm_R / hand_R / grip_R (empty)
          upperarm_L / forearm_L / hand_L / grip_L (empty)
      thigh_R / shin_R / foot_R
      thigh_L / shin_L / foot_L

Materials: Principled BSDF base colour / roughness / metallic only (the visor
mesh also uses alpha).  No textures, no UVs, no vertex colours.
"""
import bpy
import bmesh
import json
import math
import os
import struct
import sys
from math import pi, sin, cos, radians, atan2, sqrt, exp, copysign
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))

# glTF (x, y, z)  ->  Blender (x, -z, y)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
X_AX, Y_AX, Z_AX = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# --------------------------------------------------------------------------
# scene / materials  (same conventions as build_assets.py)
# --------------------------------------------------------------------------
_MATS = {}


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                 bpy.data.lights, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)
    _MATS.clear()


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def mat(name, hexcol, rough=0.5, metal=0.0, alpha=1.0):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b is None:
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None) \
            or nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(b.outputs[0], out.inputs[0])
    col = srgb(hexcol)
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*col, alpha)
    m.roughness = rough
    m.metallic = metal
    m.use_backface_culling = True          # closed meshes -> doubleSided: false
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    _MATS[name] = m
    return m


# --------------------------------------------------------------------------
# geometry helpers (all coordinates in glTF space)
# --------------------------------------------------------------------------
class Part:
    """A temporary bmesh holding one sub-part."""

    def __init__(self, bm=None):
        self.bm = bm or bmesh.new()

    def tf(self, M):
        bmesh.ops.transform(self.bm, matrix=M, verts=self.bm.verts[:])
        return self

    def at(self, x, y=None, z=None):
        if y is None:
            x, y, z = x
        return self.tf(Matrix.Translation((x, y, z)))

    def rot(self, axis, deg, pivot=None):
        M = Matrix.Rotation(radians(deg), 4, axis)
        if pivot is not None:
            pv = Vector(pivot)
            M = Matrix.Translation(pv) @ M @ Matrix.Translation(-pv)
        return self.tf(M)

    def scale(self, sx, sy, sz):
        return self.tf(Matrix.Diagonal((sx, sy, sz, 1.0)))

    def bevel(self, w, segs=2, min_angle=30):
        edges = [e for e in self.bm.edges
                 if len(e.link_faces) == 2 and e.calc_face_angle(0) > radians(min_angle)]
        if edges and w > 0:
            bmesh.ops.bevel(self.bm, geom=edges, offset=w, offset_type="OFFSET",
                            segments=segs, profile=0.5, affect="EDGES",
                            clamp_overlap=True)
        return self

    def fn(self, f):
        for v in self.bm.verts:
            v.co = f(v.co.copy())
        return self

    def mirror_z(self):
        """Mirror to the other side (z -> -z) and fix the winding."""
        self.scale(1, 1, -1)
        bmesh.ops.reverse_faces(self.bm, faces=self.bm.faces[:])
        return self

    def paint(self, m):
        """Set every face to material m (callable(center, face) or Material)."""
        for f in self.bm.faces:
            mm = m(f.calc_center_median(), f) if callable(m) else m
            f.material_index = ML.index(mm)
        return self

    def orient(self, ref):
        """Flip faces so their normal agrees with ref(center) (for open shells)."""
        self.bm.normal_update()
        for f in self.bm.faces:
            if f.normal.dot(ref(f.calc_center_median())) < 0:
                f.normal_flip()
        self.bm.normal_update()
        return self

    def copy(self):
        return Part(self.bm.copy())


def join(*parts):
    bm = bmesh.new()
    for p in parts:
        me = bpy.data.meshes.new("_j")
        p.bm.to_mesh(me)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        p.bm.free()
    return Part(bm)


ML = []          # global material list; Part.paint stores indices into it


class Asm:
    """Accumulates parts (with materials) into one mesh object."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def add(self, part, material=None, smooth=80, recalc=True):
        """material: Material, callable(face) or None (use the part's painted indices)."""
        src = part.bm
        if recalc:
            bmesh.ops.recalc_face_normals(src, faces=src.faces[:])
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            if material is None:
                m = ML[f.material_index]
            else:
                m = material(f) if callable(material) else material
            nf.material_index = self._mi(m)
            nf.smooth = smooth is not None
        if smooth is not None:
            thr = radians(smooth)
            for e in src.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > thr:
                    ne = self.bm.edges.get([vmap[e.verts[0]], vmap[e.verts[1]]])
                    if ne:
                        ne.smooth = False
        src.free()
        return self

    def build(self, name, parent=None, loc=(0, 0, 0), origin=(0, 0, 0)):
        bm = self.bm
        bmesh.ops.transform(bm, matrix=C @ Matrix.Translation(-Vector(origin)),
                            verts=bm.verts[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        me.validate()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent:
            ob.parent = parent
        ob.location = C @ Vector(loc)
        return ob


def empty(name, parent=None, loc=(0, 0, 0), size=0.05):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = size
    if parent:
        e.parent = parent
    e.location = C @ Vector(loc)
    return e


def box(sx, sy, sz, bev=0.0, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    p = Part(bm)
    if bev > 0:
        p.bevel(min(bev, 0.45 * min(sx, sy, sz)), segs)
    return p


def obox(center, X, Y, Z, sx, sy, sz, bev=0.0):
    M = Matrix((
        (X.x, Y.x, Z.x, center.x),
        (X.y, Y.y, Z.y, center.y),
        (X.z, Y.z, Z.z, center.z),
        (0, 0, 0, 1)))
    return box(sx, sy, sz, bev=bev).tf(M)


def cyl(r1, depth, segs=16, r2=None, axis="Z", bev=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r1, radius2=r1 if r2 is None else r2, depth=depth)
    p = Part(bm)
    if bev > 0:
        p.bevel(bev, 2, min_angle=50)
    if axis == "Y":
        p.rot("X", -90)
    elif axis == "X":
        p.rot("Y", 90)
    return p


def uvsphere(u, v, r=1.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return Part(bm)


def spow(v, p):
    return copysign(abs(v) ** p, v)


def smoothstep(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def linspace(a, b, n):
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def interp(table, x):
    """Catmull/Hermite interpolation of a table [(key, (values...)), ...]."""
    ks = [k for k, _ in table]
    n = len(table)
    if x <= ks[0]:
        return list(table[0][1])
    if x >= ks[-1]:
        return list(table[-1][1])
    i = max(j for j in range(n - 1) if ks[j] <= x)
    k0, k1 = ks[i], ks[i + 1]
    dk = k1 - k0
    t = (x - k0) / dk
    v0, v1 = table[i][1], table[i + 1][1]
    vm = table[i - 1][1] if i > 0 else v0
    vp = table[i + 2][1] if i + 2 < n else v1
    km = ks[i - 1] if i > 0 else k0 - dk
    kp = ks[i + 2] if i + 2 < n else k1 + dk
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    h10 = t ** 3 - 2 * t ** 2 + t
    h01 = -2 * t ** 3 + 3 * t ** 2
    h11 = t ** 3 - t ** 2
    out = []
    for j in range(len(v0)):
        m0 = (v1[j] - vm[j]) / (k1 - km) * dk
        m1 = (vp[j] - v0[j]) / (kp - k0) * dk
        out.append(h00 * v0[j] + h10 * m0 + h01 * v1[j] + h11 * m1)
    return out


def interp1(table, x):
    return interp([(k, (v,)) for k, v in table], x)[0]


def catmull(pts, n=6, closed=False):
    P = [Vector(p) for p in pts]
    m = len(P)
    out = []
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p1, p2 = P[i], P[(i + 1) % m]
        if closed:
            p0, p3 = P[i - 1], P[(i + 2) % m]
        else:
            p0 = P[i - 1] if i > 0 else 2 * P[0] - P[1]
            p3 = P[i + 2] if i + 2 < m else 2 * P[-1] - P[-2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t +
                              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return out


def loft2(sections, ring_closed=True, pole0=None, pole1=None, cap0=False, cap1=False,
          loop=False):
    """Quad loft between rings; optional triangle-fan poles or n-gon caps at the ends."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in s] for s in sections]
    n = len(sections[0])
    rng = range(n) if ring_closed else range(n - 1)
    pairs = list(zip(rings[:-1], rings[1:]))
    if loop:
        pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        for i in rng:
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if not loop:
        if pole0 is not None:
            pv = bm.verts.new(pole0)
            for i in rng:
                j = (i + 1) % n
                bm.faces.new((rings[0][j], rings[0][i], pv))
        elif cap0 and n > 2:
            bm.faces.new(rings[0][::-1])
        if pole1 is not None:
            pv = bm.verts.new(pole1)
            for i in rng:
                j = (i + 1) % n
                bm.faces.new((rings[-1][i], rings[-1][j], pv))
        elif cap1 and n > 2:
            bm.faces.new(rings[-1])
    return Part(bm)


def path_frames(path, up=None, closed=False):
    n = len(path)
    T = []
    for i in range(n):
        if closed:
            t = path[(i + 1) % n] - path[i - 1]
        elif i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = path[i + 1] - path[i - 1]
        T.append(t.normalized())
    N, B = [], []
    if up is not None:
        for i, t in enumerate(T):
            u = up(path[i]) if callable(up) else Vector(up)
            b = t.cross(u)
            if b.length < 1e-6:
                b = t.orthogonal()
            b.normalize()
            N.append(b.cross(t).normalized())
            B.append(b)
    else:
        nn = T[0].orthogonal().normalized()
        for i, t in enumerate(T):
            if i > 0:
                nn = T[i - 1].rotation_difference(t) @ nn
            nn = (nn - t * nn.dot(t)).normalized()
            N.append(nn)
            B.append(t.cross(nn).normalized())
    return T, N, B


def se_ring(n, a, b, e, center, u, v, phase=0.0):
    pts = []
    for i in range(n):
        t = 2 * pi * i / n + phase
        c, s = cos(t), sin(t)
        pts.append(Vector(center) + u * (a * spow(c, 2.0 / e)) + v * (b * spow(s, 2.0 / e)))
    return pts


def tube(path, radius, segs=8, up=None, expo=2.0, round_ends=True, closed=False):
    """Swept tube. radius: float | (a, b) | callable(t). Rounded (pole) ends."""
    path = [Vector(p) for p in path]
    T, N, B = path_frames(path, up, closed)
    secs = []
    L = len(path)
    for i, p in enumerate(path):
        r = radius(i / (L - 1)) if callable(radius) else radius
        ra, rb = r if isinstance(r, tuple) else (r, r)
        secs.append(se_ring(segs, ra, rb, expo, p, N[i], B[i]))
    if closed:
        return loft2(secs, loop=True)
    if round_ends:
        r0 = radius(0.0) if callable(radius) else radius
        r1 = radius(1.0) if callable(radius) else radius
        r0 = r0[0] if isinstance(r0, tuple) else r0
        r1 = r1[0] if isinstance(r1, tuple) else r1
        return loft2(secs, pole0=path[0] - T[0] * r0 * 0.9, pole1=path[-1] + T[-1] * r1 * 0.9)
    return loft2(secs, cap0=True, cap1=True)


def limb(p0, p1, prof, ts, n=20, e=2.0, cap0=True, cap1=True, rfn=None, thetas=None,
         front=X_AX, cap_alphas=(62, 36)):
    """Body segment between two joint pivots.

    prof: [(t, (a, b, ox, oz))]  a = half size toward `front`, b = half size sideways.
    ts:   ring positions (0 = p0 pivot, 1 = p1 pivot).
    cap0/cap1: spherical caps centred on the pivots (clean rotation at the joint).
    rfn(t, theta) -> extra radial offset (theta 0 = front, +90deg = +Z side).
    Returns (Part, frame) where frame(t, theta) maps a face centre back to (t, theta).
    """
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    d /= L
    N = (front - d * front.dot(d)).normalized()
    B = d.cross(N)
    ths = thetas or [2 * pi * i / n for i in range(n)]

    def ring(t, s_extra=0.0, k=1.0):
        a, b, ox, oz = interp(prof, min(max(t, 0.0), 1.0))
        c = p0 + d * (t * L + s_extra) + N * ox + B * oz
        pts = []
        for th in ths:
            cs, sn = cos(th), sin(th)
            v = N * (a * spow(cs, 2.0 / e)) + B * (b * spow(sn, 2.0 / e))
            off = rfn(t, th) if rfn else 0.0
            if off:
                v = v + v.normalized() * off
            pts.append(c + v * k)
        return pts, c

    secs = []
    pole0 = pole1 = None
    if cap0:
        a, b, _, _ = interp(prof, 0.0)
        R = 0.5 * (a + b)
        for al in sorted(cap_alphas):
            pts, c = ring(0.0, -R * cos(radians(al)), sin(radians(al)))
            secs.append(pts)
        pole0 = ring(0.0, -R, 0.0)[1]
    for t in ts:
        secs.append(ring(t)[0])
    if cap1:
        a, b, _, _ = interp(prof, 1.0)
        R = 0.5 * (a + b)
        for al in sorted(cap_alphas, reverse=True):
            pts, c = ring(1.0, R * cos(radians(al)), sin(radians(al)))
            secs.append(pts)
        pole1 = ring(1.0, R, 0.0)[1]
    part = loft2(secs, pole0=pole0, pole1=pole1, cap0=not cap0, cap1=not cap1)

    def frame(c):
        r = c - p0
        return r.dot(d) / L, atan2(r.dot(B), r.dot(N))
    return part, frame


# --------------------------------------------------------------------------
# rig layout (glTF coordinates; right side = +Z)
# --------------------------------------------------------------------------
P_PELVIS = Vector((0.0, 0.98, 0.0))
P_SPINE = Vector((0.0, 1.08, 0.0))
P_CHEST = Vector((0.0, 1.30, 0.0))
P_NECK = Vector((0.0, 1.55, 0.0))
P_SHOULDER = Vector((0.0, 1.455, 0.205))
P_ELBOW = Vector((0.0, 1.165, 0.258))
P_WRIST = Vector((0.0, 0.905, 0.276))
P_HIP = Vector((0.0, 0.935, 0.095))
P_KNEE = Vector((0.005, 0.515, 0.100))
P_ANKLE = Vector((-0.010, 0.105, 0.105))
HC = Vector((0.012, 1.695, 0.0))           # head centre (reference for face/helmet)
GRIP = Vector((0.0, -0.088, -0.028))       # grip axis centre, relative to the R wrist
GRIP_R = 0.016                             # gripped handle radius (3.2 cm diameter)


def mirror_pt(p):
    return Vector((p.x, p.y, -p.z))


# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------
def make_materials():
    M = {}

    def m(key, *a, **k):
        M[key] = mat(*a, **k)
        ML.append(M[key])
    m("skin", "Skin", "#c98b67", 0.55)
    m("lip", "Lips", "#8a5548", 0.5)
    m("beard", "Beard", "#553a26", 0.9)
    m("eye", "EyeWhite", "#e9e5dc", 0.3)
    m("iris", "Iris", "#241812", 0.25)
    m("helmet", "HelmetOrange", "#ff6a13", 0.38)
    m("muff", "MuffBlack", "#1b1b1c", 0.45)
    m("pad", "MuffPad", "#0d0d0d", 0.9)
    m("hw", "HelmetHardware", "#2c2e33", 0.5, 0.2)
    m("visor", "VisorMesh", "#3a3d42", 0.6, 0.3, alpha=0.55)
    m("vframe", "VisorFrame", "#2a2c30", 0.55, 0.2)
    m("shirt", "FlannelRed", "#7a1e1e", 0.85)
    m("button", "ShirtButton", "#d8d0c0", 0.4)
    m("vest", "VestLime", "#c8f031", 0.7)
    m("trim", "VestTrim", "#7f9a22", 0.75)
    m("refl", "Reflective", "#d9dde0", 0.25, 0.6)
    m("glove", "GloveLeather", "#a87a4a", 0.75)
    m("cuff", "GloveCuff", "#6b4527", 0.8)
    m("chaps", "Chaps", "#2b2f36", 0.8)
    m("piping", "ChapsPiping", "#ff7a1a", 0.5)
    m("pants", "Trousers", "#1b1d22", 0.9)
    m("belt", "Belt", "#5a3a22", 0.6)
    m("buckle", "Buckle", "#c4c8cc", 0.3, 0.85)
    m("boot", "BootLeather", "#4a3020", 0.6)
    m("sole", "BootSole", "#151515", 0.9)
    m("lace", "BootLace", "#c9a46a", 0.8)
    m("hook", "BootHook", "#8d9196", 0.35, 0.8)
    return M


# --------------------------------------------------------------------------
# torso profile: y -> (half depth a, half width b, centre x, superellipse exp)
# --------------------------------------------------------------------------
TORSO = [
    (0.95, (0.112, 0.150, 0.000, 2.3)),
    (1.00, (0.110, 0.148, 0.002, 2.3)),
    (1.06, (0.108, 0.146, 0.004, 2.4)),
    (1.12, (0.110, 0.148, 0.006, 2.5)),
    (1.20, (0.117, 0.156, 0.010, 2.6)),
    (1.28, (0.123, 0.165, 0.012, 2.7)),
    (1.35, (0.125, 0.171, 0.010, 2.7)),
    (1.41, (0.119, 0.176, 0.004, 2.6)),
    (1.45, (0.105, 0.176, -0.004, 2.5)),
    (1.475, (0.091, 0.166, -0.009, 2.4)),
    (1.495, (0.078, 0.146, -0.013, 2.3)),
    (1.515, (0.070, 0.115, -0.016, 2.1)),
    (1.535, (0.067, 0.088, -0.017, 2.0)),
    (1.55, (0.065, 0.073, -0.017, 2.0)),
]
NT = 40
T_THETAS = [2 * pi * i / NT for i in range(NT)]


def torso_pt(y, th, off=0.0):
    a, b, cx, e = interp(TORSO, y)
    return Vector((cx + (a + off) * spow(cos(th), 2 / e), y, (b + off) * spow(sin(th), 2 / e)))


def torso_ring(y, off=0.0, thetas=T_THETAS):
    return [torso_pt(y, th, off) for th in thetas]


def torso_F(p, off):
    """Implicit superellipse value of the (offset) torso: <1 inside, >1 outside."""
    if p.y > 1.552:
        return 9.0
    a, b, cx, e = interp(TORSO, max(p.y, 0.95))
    return (abs(p.x - cx) / (a + off)) ** e + (abs(p.z) / (b + off)) ** e


def torso_ray(o, dirv, off):
    t, step = 0.0, 0.002
    while t < 0.4 and torso_F(o + dirv * t, off) < 1.0:
        t += step
    lo, hi = max(t - step, 0.0), t
    for _ in range(30):
        mid = 0.5 * (lo + hi)
        if torso_F(o + dirv * mid, off) < 1.0:
            lo = mid
        else:
            hi = mid
    return o + dirv * (0.5 * (lo + hi))


def radial_ref(c):
    a, b, cx, e = interp(TORSO, min(max(c.y, 0.95), 1.55))
    return Vector((c.x - cx, 0.0, c.z))


def solid_band(y0, y1, off_in, off_out, ymap=None):
    """Closed band around the torso between y0..y1, thickness off_in..off_out."""
    rings = [torso_ring(y0, off_in), torso_ring(y0, off_out),
             torso_ring(y1, off_out), torso_ring(y1, off_in)]
    return loft2(rings, loop=True)


def loop_tube(pts, r, segs=5, ref=radial_ref):
    """Closed tube along a loop of points (frames from an outward reference)."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    secs = []
    for i, p in enumerate(pts):
        t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        nn = ref(p)
        nn = (nn - t * nn.dot(t)).normalized()
        bb = t.cross(nn)
        secs.append([p + nn * (r * cos(2 * pi * k / segs)) + bb * (r * sin(2 * pi * k / segs))
                     for k in range(segs)])
    return loft2(secs, loop=True)


# --------------------------------------------------------------------------
# pelvis: trousers, chaps apron, belt, buckle
# --------------------------------------------------------------------------
PELV = [
    (0.80, (0.060, 0.105, -0.010, 2.2)),
    (0.82, (0.085, 0.140, -0.012, 2.3)),
    (0.86, (0.106, 0.166, -0.013, 2.4)),
    (0.90, (0.116, 0.176, -0.012, 2.4)),
    (0.95, (0.119, 0.178, -0.008, 2.4)),
    (1.00, (0.115, 0.164, -0.002, 2.4)),
    (1.04, (0.113, 0.155, 0.002, 2.4)),
]


def pelvis_pt(y, th, off=0.0):
    a, b, cx, e = interp(PELV, y)
    return Vector((cx + (a + off) * spow(cos(th), 2 / e), y, (b + off) * spow(sin(th), 2 / e)))


def build_pelvis(M, parent):
    A = Asm()

    def chap_w(y, th):
        return smoothstep(0.30, 0.40, cos(th)) * smoothstep(0.99, 0.983, y)
    ys = [0.807, 0.822, 0.845, 0.875, 0.905, 0.935, 0.962, 0.985, 1.005, 1.030]
    ths = [2 * pi * i / 32 for i in range(32)] + [radians(x) for x in (66, 74, -66, -74)]
    ths = sorted(t if t <= pi else t - 2 * pi for t in ths)
    rings = []
    for y in ys:
        rings.append([pelvis_pt(y, th, CH_OFF * chap_w(y, th)) for th in ths])
    p = loft2(rings, pole0=Vector((-0.012, 0.798, 0.0)))
    p.orient(lambda c: Vector((c.x + 0.01, (c.y - 0.93) * 0.6, c.z)))
    p.paint(lambda c, f: M["chaps"] if (abs(atan2(c.z, c.x - 0.0)) < radians(70) and c.y < 0.985)
            else M["pants"])
    A.add(p, None, recalc=False)

    # belt (solid band) + buckle + a few belt loops
    def belt_ring(y, off):
        return [pelvis_pt(y, th, off) for th in T_THETAS]
    belt = loft2([belt_ring(0.977, 0.004), belt_ring(0.977, 0.0125),
                  belt_ring(1.024, 0.0125), belt_ring(1.024, 0.004)], loop=True)
    A.add(belt.paint(M["belt"]), None, smooth=50)
    fx = pelvis_pt(1.0, 0.0, 0.0125).x
    A.add(box(0.012, 0.050, 0.064, bev=0.004).at(fx + 0.004, 1.0005, 0.0).paint(M["buckle"]),
          None, smooth=40)
    A.add(box(0.008, 0.032, 0.040, bev=0.002).at(fx + 0.0095, 1.0005, 0.0).paint(M["belt"]),
          None, smooth=40)
    for thd in (40, -40, 105, -105, 150, -150):
        th = radians(thd)
        c = pelvis_pt(1.0, th, 0.014)
        n = Vector((c.x + 0.002, 0, c.z)).normalized()
        A.add(obox(c, n, Y_AX, n.cross(Y_AX), 0.004, 0.062, 0.014).paint(M["pants"]),
              None, smooth=40)
    return A.build("pelvis", parent, loc=P_PELVIS, origin=P_PELVIS)


# --------------------------------------------------------------------------
# spine: shirt waist, lower vest, lower reflective stripe, zipper
# --------------------------------------------------------------------------
VEST_OFF = 0.011
VEST_OFF2 = 0.0135     # chest part of the vest sits a hair further out
STRIPE_LO = (1.112, 1.147)
STRIPE_HI = (1.236, 1.271)


def build_spine(M, parent):
    A = Asm()
    shirt = loft2([torso_ring(y) for y in (0.965, 1.03, 1.10, 1.18, 1.25, 1.31)])
    shirt.orient(radial_ref).paint(M["shirt"])
    A.add(shirt, None, recalc=False)
    vys = [1.034, 1.07, 1.112, 1.147, 1.19, 1.236, 1.27, 1.30]
    vest = loft2([torso_ring(y, VEST_OFF) for y in vys])
    vest.orient(radial_ref).paint(M["vest"])
    A.add(vest, None, recalc=False)
    A.add(loop_tube(torso_ring(1.034, VEST_OFF + 0.001), 0.0042).paint(M["trim"]), None)
    A.add(solid_band(STRIPE_LO[0], STRIPE_LO[1], VEST_OFF - 0.001, VEST_OFF + 0.0035)
          .paint(M["refl"]), None, smooth=60)
    # zipper / front placket of the vest
    zp = [torso_pt(y, 0.0, VEST_OFF + 0.002) for y in linspace(1.032, 1.25, 6)]
    A.add(tube(zp, (0.0025, 0.0045), segs=6, up=Y_AX).paint(M["trim"]), None)
    return A.build("spine", parent, loc=P_SPINE - P_PELVIS, origin=P_SPINE)


# --------------------------------------------------------------------------
# chest: upper shirt, collar, upper vest with V-neck, stripes, shoulder straps
# --------------------------------------------------------------------------
V_Y0, V_Y1, V_TH = 1.365, 1.515, radians(34)


def v_theta(y):
    return V_TH * smoothstep(V_Y0, V_Y1, y) ** 0.8 if y > V_Y0 else 0.0


def build_chest(M, parent):
    A = Asm()
    ys = [1.236, 1.30, 1.36, 1.41, 1.445, 1.475, 1.50, 1.52, 1.552]
    shirt = loft2([torso_ring(y, 0.0015) for y in ys])
    shirt.orient(radial_ref).paint(M["shirt"])
    A.add(shirt, None, recalc=False)

    # vest: closed rings below the V, open arcs above it
    low = loft2([torso_ring(y, VEST_OFF2) for y in (1.236, 1.271, 1.30, 1.335, V_Y0)])
    up_ys = [V_Y0, 1.39, 1.415, 1.44, 1.46, 1.48, 1.50, V_Y1]
    arcs = []
    for y in up_ys:
        tv = v_theta(y)
        arcs.append([torso_pt(y, th, VEST_OFF2) for th in linspace(tv, 2 * pi - tv, NT + 1)])
    upv = loft2(arcs, ring_closed=False)
    vest = join(low, upv)
    bmesh.ops.remove_doubles(vest.bm, verts=vest.bm.verts[:], dist=1e-5)
    vest.orient(radial_ref).paint(M["vest"])
    A.add(vest, None, recalc=False)

    # binding along the V and the neck edge (one closed loop)
    edge = []
    tv1 = v_theta(V_Y1)
    for y in linspace(V_Y1, V_Y0, 9):                 # left V edge going down
        edge.append(torso_pt(y, 2 * pi - v_theta(y), VEST_OFF2 + 0.001))
    for y in linspace(V_Y0, V_Y1, 9)[1:]:             # right V edge going up
        edge.append(torso_pt(y, v_theta(y), VEST_OFF2 + 0.001))
    for th in linspace(tv1, 2 * pi - tv1, 30)[1:-1]:  # around the back of the neck
        edge.append(torso_pt(V_Y1, th, VEST_OFF2 + 0.001))
    A.add(loop_tube(edge, 0.0045).paint(M["trim"]), None)

    # upper horizontal stripe hides the spine/chest seam
    A.add(solid_band(STRIPE_HI[0], STRIPE_HI[1], VEST_OFF2 - 0.001, VEST_OFF2 + 0.0035)
          .paint(M["refl"]), None, smooth=60)

    # reflective straps over each shoulder (raycast onto the vest surface)
    for sgn in (1, -1):
        zc, hw = 0.137 * sgn, 0.019
        secs = []
        phis = linspace(radians(-80), radians(260), 36)
        rows = []
        for ph in phis:
            dv = Vector((cos(ph), sin(ph), 0.0))
            pts = []
            for dz, off in ((-hw, VEST_OFF2 + 0.0035), (hw, VEST_OFF2 + 0.0035),
                            (hw, VEST_OFF2 - 0.001), (-hw, VEST_OFF2 - 0.001)):
                o = Vector((-0.004, 1.40, zc + dz))
                pts.append(torso_ray(o, dv, off))
            if min(p.y for p in pts) >= STRIPE_HI[0] + 0.004:
                rows.append(pts)
        strap = loft2(rows, cap0=True, cap1=True)
        A.add(strap.paint(M["refl"]), None, smooth=60)

    # collar (stand + fold, open at the front) and collar points
    secs = []
    gap = radians(26)
    cx0 = -0.0155

    def cpt(th, dr, dy):
        cth, sth = cos(th), sin(th)
        yb = 1.527 + 0.020 * (1 - cth) * 0.5
        return Vector((cx0 + (0.0645 + dr) * cth, yb + dy, (0.0675 + dr) * sth))
    for th in linspace(gap, 2 * pi - gap, 26):
        secs.append([cpt(th, 0.0, -0.004), cpt(th, 0.002, 0.031), cpt(th, 0.007, 0.035),
                     cpt(th, 0.016, 0.002)])
    collar = loft2(secs, cap0=True, cap1=True)
    A.add(collar.paint(M["shirt"]), None, smooth=55)
    for sgn in (1, -1):
        th = gap * sgn
        a = cpt(th, 0.007, 0.035)
        b = cpt(th, 0.016, 0.002)
        tip = Vector((0.074, 1.478, 0.050 * sgn))
        nrm = (b - a).cross(tip - a).normalized()
        if nrm.x < 0:
            nrm = -nrm
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in (a, b, tip)]
        vs2 = [bm.verts.new(p + nrm * 0.004) for p in (a, b, tip)]
        bm.faces.new(vs)
        bm.faces.new(vs2[::-1])
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((vs[i], vs[j], vs2[j], vs2[i]))
        A.add(Part(bm).paint(M["shirt"]), None, smooth=40)
    # shirt buttons in the V
    for y in (1.40, 1.452):
        p = torso_pt(y, 0.0, 0.002)
        A.add(cyl(0.0055, 0.003, segs=10, axis="X").at(p.x, y, 0.0).paint(M["button"]), None,
              smooth=40)
    return A.build("chest", parent, loc=P_CHEST - P_SPINE, origin=P_CHEST)


# --------------------------------------------------------------------------
# head: skull/face loft with nose, sockets, lips, beard field; eyes, ears, neck
# --------------------------------------------------------------------------
# y_rel -> (centre x, front, back, half width, front exp, back exp)
HEADP = [
    (-0.123, (0.050, 0.016, 0.018, 0.014, 2.2, 2.2)),
    (-0.119, (0.045, 0.026, 0.028, 0.024, 2.3, 2.2)),
    (-0.113, (0.036, 0.037, 0.040, 0.035, 2.4, 2.2)),
    (-0.104, (0.025, 0.054, 0.051, 0.046, 2.4, 2.2)),
    (-0.092, (0.014, 0.068, 0.061, 0.054, 2.3, 2.2)),
    (-0.080, (0.004, 0.079, 0.066, 0.058, 2.2, 2.1)),
    (-0.068, (0.0, 0.084, 0.074, 0.062, 2.2, 2.1)),
    (-0.056, (0.0, 0.085, 0.083, 0.066, 2.3, 2.1)),
    (-0.044, (0.0, 0.086, 0.090, 0.070, 2.4, 2.1)),
    (-0.032, (0.0, 0.087, 0.095, 0.073, 2.5, 2.1)),
    (-0.020, (0.0, 0.088, 0.099, 0.075, 2.5, 2.1)),
    (-0.008, (0.0, 0.088, 0.102, 0.076, 2.5, 2.1)),
    (0.004, (0.0, 0.088, 0.104, 0.077, 2.5, 2.1)),
    (0.014, (0.0, 0.092, 0.105, 0.078, 2.5, 2.1)),
    (0.026, (0.0, 0.095, 0.106, 0.079, 2.4, 2.1)),
    (0.040, (0.0, 0.093, 0.106, 0.079, 2.3, 2.1)),
    (0.060, (0.0, 0.088, 0.103, 0.077, 2.2, 2.0)),
    (0.080, (0.0, 0.079, 0.096, 0.071, 2.1, 2.0)),
    (0.098, (0.0, 0.064, 0.082, 0.060, 2.0, 2.0)),
    (0.110, (0.0, 0.045, 0.062, 0.045, 2.0, 2.0)),
    (0.117, (0.0, 0.024, 0.034, 0.025, 2.0, 2.0)),
]
NOSE_H = [(-0.056, 0.0), (-0.049, 0.007), (-0.042, 0.017), (-0.035, 0.023), (-0.025, 0.019),
          (-0.010, 0.011), (0.004, 0.005), (0.016, 0.0)]
NOSE_W = [(-0.056, 0.019), (-0.042, 0.016), (-0.030, 0.012), (-0.010, 0.0095), (0.016, 0.008)]
BEARD_Y = [(0, -0.051), (16, -0.051), (26, -0.050), (42, -0.049), (60, -0.044), (76, -0.028),
           (88, -0.004), (98, 0.008), (106, -0.025), (116, -0.080), (128, -0.200)]
EYE_C = Vector((0.071, 0.006, 0.032))


def head_vertex(yr, th):
    """Head surface point (relative to HC) + beard weight + lip weight."""
    cx, F, Bk, W, ef, eb = interp(HEADP, yr)
    c, s = cos(th), sin(th)
    e = ef if c >= 0 else eb
    x = cx + (F if c >= 0 else Bk) * spow(c, 2 / e)
    z = W * spow(s, 2 / e)
    az = abs(z)
    fw = smoothstep(0.02, 0.06, x)
    # eye sockets, brow, cheekbones
    x -= 0.0115 * exp(-((yr - 0.006) / 0.013) ** 2 - ((az - 0.032) / 0.016) ** 2) * fw
    x += 0.0045 * exp(-((yr - 0.024) / 0.008) ** 2) * exp(-((az - 0.030) / 0.026) ** 2) * fw
    x += 0.004 * exp(-((yr + 0.014) / 0.015) ** 2 - ((az - 0.050) / 0.016) ** 2) * fw
    # nose + nostril wings
    if -0.06 < yr < 0.02:
        x += interp1(NOSE_H, yr) * exp(-(z / interp1(NOSE_W, yr)) ** 2) * fw
    x += 0.0055 * exp(-((yr + 0.043) / 0.0065) ** 2 - ((az - 0.0145) / 0.0065) ** 2) * fw
    # lips
    mw = exp(-(z / 0.023) ** 4)
    x += (0.0042 * exp(-((yr + 0.0605) / 0.005) ** 2) + 0.005 * exp(-((yr + 0.0755) / 0.006) ** 2)
          - 0.0032 * exp(-((yr + 0.068) / 0.0024) ** 2)) * mw * fw
    # chin
    x += 0.007 * exp(-((yr + 0.104) / 0.012) ** 2 - (z / 0.026) ** 2)
    # beard / lips weights
    thd = math.degrees(abs(th))
    yb = interp1(BEARD_Y, thd)
    lip = smoothstep(0.0195, 0.0165, az) * smoothstep(-0.081, -0.078, yr) * \
        smoothstep(-0.054, -0.0575, yr) * (1.0 if thd < 40 else 0.0)
    beard = smoothstep(0.0, 0.006, yb - yr) * (1.0 - lip)
    rad = Vector((x - cx, 0.0, z))
    if rad.length > 1e-6:
        rad.normalize()
    p = Vector((x, yr, z)) + rad * (0.0038 * beard)
    return p, beard, lip


def build_head(M, parent):
    A = Asm()
    n = 44
    us = [-1 + 2 * i / n for i in range(n)]
    ths = [pi * spow(u, 1.25) for u in us]
    yrs = [-0.121, -0.116, -0.109, -0.101, -0.092, -0.084, -0.077, -0.071, -0.066,
           -0.061, -0.056, -0.050, -0.045, -0.040, -0.034, -0.028, -0.021, -0.014, -0.007,
           0.000, 0.006, 0.012, 0.019, 0.027, 0.038, 0.055, 0.075, 0.094, 0.109]
    secs, bw, lw = [], [], []
    for yr in yrs:
        ring = []
        for th in ths:
            p, b, l = head_vertex(yr, th)
            ring.append(p + HC)
            bw.append(b)
            lw.append(l)
        secs.append(ring)
    head = loft2(secs, pole0=HC + Vector((0.050, -0.1245, 0.0)), pole1=HC + Vector((0.0, 0.1185, 0.0)))
    bw += [1.0, 0.0]
    lw += [0.0, 0.0]
    head.bm.verts.index_update()

    def hmat(c, f):
        b = sum(bw[v.index] for v in f.verts) / len(f.verts)
        lp = sum(lw[v.index] for v in f.verts) / len(f.verts)
        if lp > 0.45:
            return M["lip"]
        return M["beard"] if b > 0.5 else M["skin"]
    head.paint(hmat)
    A.add(head, None, smooth=89)

    # neck
    neck, _ = limb(Vector((-0.018, 1.49, 0.0)), Vector((-0.004, 1.64, 0.0)),
                   [(0.0, (0.061, 0.064, 0, 0)), (0.55, (0.058, 0.061, 0, 0)), (1.0, (0.057, 0.059, 0, 0))],
                   [0.0, 0.3, 0.6, 1.0], n=20, cap0=False, cap1=False)
    A.add(neck.paint(M["skin"]), None)

    # eyes: sclera, iris, upper/lower lids
    for sgn in (1, -1):
        e = HC + Vector((EYE_C.x, EYE_C.y, EYE_C.z * sgn))
        A.add(uvsphere(12, 8, 0.0118).at(e).paint(M["eye"]), None)
        iris = uvsphere(10, 6, 0.0062).scale(0.55, 1, 1).at(e + Vector((0.0098, 0.0, 0.0015 * sgn)))
        A.add(iris.paint(M["iris"]), None)
        lid = uvsphere(14, 10, 0.0131)
        bm = lid.bm
        kill = [f for f in bm.faces if not (f.calc_center_median().y > 0.0035 or
                                            f.calc_center_median().y < -0.0085)]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        lid.rot("Z", -6).at(e)
        lid.orient(lambda c, e=e: c - e)
        A.add(lid.paint(M["skin"]), None, recalc=False)
    # ears (hidden under the muffs, but present)
    for sgn in (1, -1):
        ear = uvsphere(10, 6, 1.0).scale(0.013, 0.029, 0.009).at(HC + Vector((-0.010, -0.004, 0.077 * sgn)))
        A.add(ear.paint(M["skin"]), None)
    return A.build("neck_head", parent, loc=P_NECK - P_CHEST, origin=P_NECK)


# --------------------------------------------------------------------------
# helmet (child of neck_head): shell, crest, brim, muffs + arms; visor child
# --------------------------------------------------------------------------
HEL_C = HC + Vector((-0.008, 0.012, 0.0))
HAX, HAY, HAZ = 0.124, 0.121, 0.106
HTILT = Matrix.Rotation(radians(9), 3, "Z")


def helmet_pt(lat, th, scale=1.0, dy=0.0):
    p = Vector((HAX * cos(lat) * cos(th), HAY * sin(lat), HAZ * cos(lat) * sin(th))) * scale
    r = p.normalized()
    w = smoothstep(0.30, 0.80, sin(lat))
    bump = 0.008 * exp(-(p.z / 0.020) ** 2) * w + 0.0035 * exp(-((abs(p.z) - 0.056) / 0.014) ** 2) * w
    p = p + r * bump + Vector((0, dy, 0))
    return HEL_C + HTILT @ p


def build_helmet(M, parent):
    A = Asm()
    n = 40
    ths = [2 * pi * i / n for i in range(n)]
    secs = [[helmet_pt(radians(2), th, 0.955) for th in ths],
            [helmet_pt(radians(-1.5), th, 1.0, -0.004) for th in ths],
            [helmet_pt(radians(1.5), th, 1.035, -0.003) for th in ths],
            [helmet_pt(radians(5), th, 1.012) for th in ths]]
    for latd in (12, 22, 33, 45, 57, 68, 78, 86):
        secs.append([helmet_pt(radians(latd), th) for th in ths])
    shell = loft2(secs, pole1=helmet_pt(radians(90), 0.0))
    shell.orient(lambda c: c - HEL_C)
    A.add(shell.paint(M["helmet"]), None, smooth=70, recalc=False)

    # brim: wide peak at the front, small lip all round
    rows = []
    for thd in linspace(-180, 180, 41):
        th = radians(thd)
        k = max(0.0, cos(radians(thd) * 0.5 * 180 / 80)) if abs(thd) < 80 else 0.0
        ext = 0.004 + 0.024 * k ** 1.4
        base = helmet_pt(radians(-0.5), th, 1.03, -0.002)
        rad = (base - HEL_C)
        rad.y = 0
        rad.normalize()
        outer = base + rad * ext + Vector((0, -0.18 * ext, 0))
        tdy = Vector((0, 0.0045, 0))
        rows.append([base + tdy, outer + tdy * 0.6, outer - tdy * 0.4, base - tdy])
    brim = loft2(rows[:-1], loop=True)
    A.add(brim.paint(M["helmet"]), None, smooth=60)

    # ear muffs, arms and helmet adapters
    for sgn in (1, -1):
        mc = HC + Vector((-0.012, -0.004, 0.0))

        def ring_z(z, rx, ry, e=2.4, nn=20):
            return [mc + Vector((rx * spow(cos(2 * pi * i / nn), 2 / e), ry * spow(sin(2 * pi * i / nn), 2 / e),
                                 z * sgn)) for i in range(nn)]
        pad = loft2([ring_z(0.078, 0.026, 0.032), ring_z(0.080, 0.035, 0.042),
                     ring_z(0.087, 0.038, 0.046), ring_z(0.093, 0.037, 0.045)],
                    pole0=mc + Vector((0, 0, 0.076 * sgn)))
        A.add(pad.paint(M["pad"]), None)
        cup = loft2([ring_z(0.091, 0.039, 0.047), ring_z(0.100, 0.041, 0.049), ring_z(0.110, 0.039, 0.047),
                     ring_z(0.117, 0.032, 0.039), ring_z(0.1205, 0.020, 0.025)],
                    pole1=mc + Vector((0, 0, 0.1215 * sgn)))
        A.add(cup.paint(M["muff"]), None, smooth=60)
        # arm from the helmet adapter down to the cup hub
        top = HC + Vector((-0.012, 0.062, 0.1235 * sgn))
        bot = HC + Vector((-0.012, -0.004, 0.1235 * sgn))
        A.add(obox((top + bot) / 2, X_AX, Y_AX, Z_AX, 0.017, (top - bot).length, 0.005, bev=0.0018)
              .paint(M["hw"]), None, smooth=40)
        A.add(cyl(0.013, 0.007, segs=12, axis="Z").at(bot).paint(M["hw"]), None, smooth=40)
        ad = helmet_pt(radians(14), pi / 2 * sgn)
        A.add(obox(Vector((ad.x, ad.y + 0.004, (ad.z + top.z) / 2)), X_AX, Y_AX, Z_AX,
                   0.032, 0.020, abs(top.z - ad.z) + 0.012, bev=0.003).paint(M["hw"]), None, smooth=40)
    helmet = A.build("helmet", parent, loc=HC - P_NECK, origin=HC)
    build_visor(M, helmet)
    return helmet


VIS_PIV = Vector((-0.010, 0.052, 0.0))      # relative to HC (z = 0 on the hinge axis)


def visor_pt(th, yr, off=0.0):
    ax = 0.150 + 0.0 * yr
    az = 0.131
    k = smoothstep(0.0, -0.104, yr)
    ax -= 0.010 * k
    return HC + Vector((-0.004 + (ax + off) * cos(th), yr, (az + off) * sin(th)))


def build_visor(M, parent):
    A = Asm()
    # top frame band, curving up to the hinges at the sides
    rows = []
    for thd in linspace(-93, 93, 31):
        th = radians(thd)
        lift = 0.044 * (abs(thd) / 93.0) ** 3
        y0, y1 = -0.006 + lift, 0.018 + lift
        rows.append([visor_pt(th, y1, 0.003), visor_pt(th, y1, -0.002),
                     visor_pt(th, y0, -0.002), visor_pt(th, y0, 0.003)])
    band = loft2(rows, cap0=True, cap1=True)
    A.add(band.paint(M["vframe"]), None, smooth=60)
    # hinge hubs
    for sgn in (1, -1):
        A.add(cyl(0.012, 0.006, segs=12, axis="Z")
              .at(HC + Vector((VIS_PIV.x, VIS_PIV.y, 0.1335 * sgn))).paint(M["vframe"]), None, smooth=40)
    # see-through mesh plate
    ths = [radians(t) for t in linspace(-72, 72, 29)]
    yrs = linspace(-0.104, -0.002, 7)
    plate = loft2([[visor_pt(th, yr) for th in ths] for yr in yrs], ring_closed=False)
    plate.orient(lambda c: Vector((c.x - HC.x + 0.004, 0, c.z)))
    A.add(plate.paint(M["visor"]), None, recalc=False)
    # edge trim around sides and bottom
    trim = [visor_pt(radians(-72), y, 0.0005) for y in linspace(-0.002, -0.100, 5)]
    trim += [visor_pt(th, -0.1045, 0.0005) for th in [radians(t) for t in linspace(-70, 70, 17)]]
    trim += [visor_pt(radians(72), y, 0.0005) for y in linspace(-0.100, -0.002, 5)]
    A.add(tube(trim, 0.0032, segs=6, round_ends=True).paint(M["vframe"]), None)
    return A.build("visor", parent, loc=VIS_PIV, origin=HC + VIS_PIV)


# --------------------------------------------------------------------------
# arms (built for the right side, mirrored for the left)
# --------------------------------------------------------------------------
def build_upperarm(M, sgn, parent):
    prof = [(0.0, (0.058, 0.058, 0.0, 0.0)), (0.12, (0.057, 0.060, 0.0, 0.006)),
            (0.30, (0.052, 0.054, 0.0, 0.003)), (0.55, (0.050, 0.048, 0.003, 0.0)),
            (0.80, (0.046, 0.045, 0.0, 0.0)), (1.0, (0.045, 0.044, 0.0, 0.0))]
    p, _ = limb(P_SHOULDER, P_ELBOW, prof, linspace(0, 1, 9), n=20)
    p.paint(M["shirt"])
    if sgn < 0:
        p.mirror_z()
    A = Asm().add(p, None)
    piv, ppiv = P_SHOULDER, P_CHEST
    if sgn < 0:
        piv = mirror_pt(piv)
    return A.build("upperarm_" + ("R" if sgn > 0 else "L"), parent, loc=piv - ppiv, origin=piv)


def build_forearm(M, sgn, parent):
    prof = [(0.0, (0.044, 0.043, 0.0, 0.0)), (0.15, (0.048, 0.046, 0.003, 0.0)),
            (0.45, (0.043, 0.040, 0.0, 0.0)), (0.72, (0.037, 0.034, 0.0, 0.0)),
            (0.84, (0.036, 0.033, 0.0, 0.0)), (0.88, (0.039, 0.036, 0.0, 0.0)),
            (0.95, (0.039, 0.036, 0.0, 0.0)), (1.0, (0.036, 0.033, 0.0, 0.0))]
    ts = [0.0, 0.10, 0.22, 0.36, 0.50, 0.63, 0.75, 0.83, 0.865, 0.93]
    p, _ = limb(P_ELBOW, P_WRIST, prof, ts, n=20, cap1=False)
    p.paint(M["shirt"])
    if sgn < 0:
        p.mirror_z()
    A = Asm().add(p, None)
    piv, ppiv = P_ELBOW, P_SHOULDER
    if sgn < 0:
        piv, ppiv = mirror_pt(piv), mirror_pt(ppiv)
    return A.build("forearm_" + ("R" if sgn > 0 else "L"), parent, loc=piv - ppiv, origin=piv)


FINGERS = [  # x offset, knuckle y, end angle (deg), radius
    (0.0295, -0.0995, 218, 0.0102),
    (0.0095, -0.1020, 228, 0.0106),
    (-0.0110, -0.1005, 222, 0.0102),
    (-0.0300, -0.0960, 198, 0.0091),
]


def build_hand(M, sgn, parent):
    W = P_WRIST
    parts = []
    # palm
    prof = [(0.006, (0.032, 0.021, 0.0)), (-0.015, (0.040, 0.022, 0.0)), (-0.040, (0.045, 0.020, -0.001)),
            (-0.070, (0.047, 0.018, 0.0)), (-0.090, (0.047, 0.016, 0.001)), (-0.103, (0.045, 0.0145, 0.002)),
            (-0.109, (0.039, 0.011, 0.002))]
    prof_asc = [(-k, v) for k, v in prof[::-1]]
    secs = []
    for yv in (0.006, -0.012, -0.032, -0.054, -0.074, -0.090, -0.101, -0.109):
        a, b, cz = interp(prof_asc, -yv)
        secs.append([W + Vector((a * spow(cos(t), 2 / 2.5), yv, cz + b * spow(sin(t), 2 / 2.5)))
                     for t in [2 * pi * i / 18 for i in range(18)]])
    palm = loft2(secs, pole0=W + Vector((0, 0.012, 0)), pole1=W + Vector((0, -0.1125, 0.003)))
    parts.append(palm.paint(M["glove"]))
    # thenar (thumb ball) bulge on the palm side
    parts.append(uvsphere(12, 8, 1.0).scale(0.018, 0.030, 0.011).rot("X", 10)
                 .at(W + Vector((0.022, -0.036, -0.011))).paint(M["glove"]))
    # fingers curled around the grip axis (x axis through W + GRIP)
    G = W + GRIP
    for xo, ky, endd, r in FINGERS:
        k = W + Vector((xo, ky, 0.001))
        rel = k - Vector((k.x, G.y, G.z))
        ph0 = atan2(-(rel.y), rel.z)                 # angle from +z toward -y
        R0 = rel.length
        R1 = GRIP_R + r * 0.92
        pts = []
        start = W + Vector((xo, ky + 0.010, 0.0015))
        pts.append(start)
        for ph in linspace(ph0, radians(endd), 10):
            u = smoothstep(ph0, radians(95), ph)
            R = lerp(R0, R1, u)
            pts.append(Vector((G.x + xo, G.y - R * sin(ph), G.z + R * cos(ph))))
        rf = lambda t, r=r: r * (1.0 - 0.12 * t)
        parts.append(tube(pts, rf, segs=8).paint(M["glove"]))
    # thumb wrapping over the index finger
    tp = [Vector(p) for p in ((0.030, -0.022, -0.006), (0.041, -0.044, -0.022), (0.040, -0.062, -0.043),
                              (0.033, -0.075, -0.061), (0.022, -0.085, -0.068))]
    tp = [W + p for p in catmull(tp, 2)]
    parts.append(tube(tp, lambda t: 0.0122 - 0.0022 * t, segs=8).paint(M["glove"]))
    # gauntlet cuff (thick rim at the top so it reads as a layer)
    def cring(yv, a, b, nn=20):
        return [W + Vector((a * cos(2 * pi * i / nn), yv, b * sin(2 * pi * i / nn))) for i in range(nn)]
    cuff = loft2([cring(0.046, 0.045, 0.040), cring(0.051, 0.050, 0.045), cring(0.040, 0.051, 0.045),
                  cring(0.022, 0.047, 0.039), cring(0.004, 0.042, 0.032), cring(-0.014, 0.038, 0.027)],
                 cap1=True)
    parts.append(cuff.paint(M["cuff"]))
    A = Asm()
    for p in parts:
        if sgn < 0:
            p.mirror_z()
        A.add(p, None)
    piv, ppiv = W, P_ELBOW
    if sgn < 0:
        piv, ppiv = mirror_pt(piv), mirror_pt(ppiv)
    side = "R" if sgn > 0 else "L"
    hand = A.build("hand_" + side, parent, loc=piv - ppiv, origin=piv)
    g = GRIP.copy()
    if sgn < 0:
        g = mirror_pt(g)
    empty("grip_" + side, hand, loc=g, size=0.03)
    return hand


# --------------------------------------------------------------------------
# legs (right side, mirrored for the left)
# --------------------------------------------------------------------------
CH_OFF = 0.012            # chaps thickness over the trousers
CH_EDGE = 123.5           # chaps cover |theta| < CH_EDGE (theta 0 = front, +90 = outside)
PIPE = (88.0, 96.0)       # hi-vis piping band on the outside of the leg
LEG_THETAS = sorted([radians(-180 + 18 * i) for i in range(20)] +
                    [radians(a) for a in (85.5, 89.0, 95.0, 98.5, 121.0, 126.0, -121.0, -126.0)])


def chap_off(th):
    a = math.degrees(th)
    w = smoothstep(126.0, 121.0, abs(a)) * CH_OFF
    w += 0.0035 * smoothstep(85.5, 89.0, a) * smoothstep(98.5, 95.0, a)
    return w


def chap_mat(M, t, th, tmin=-1.0):
    a = math.degrees(th)
    if PIPE[0] < a < PIPE[1] and t > tmin:
        return M["piping"]
    if abs(a) < CH_EDGE:
        return M["chaps"]
    return M["pants"]


def build_thigh(M, sgn, parent):
    prof = [(0.0, (0.080, 0.080, 0.0, 0.0)), (0.12, (0.091, 0.089, 0.004, -0.002)),
            (0.40, (0.085, 0.081, 0.006, 0.0)), (0.70, (0.072, 0.068, 0.004, 0.0)),
            (1.0, (0.060, 0.059, 0.0, 0.0))]
    p, frame = limb(P_HIP, P_KNEE, prof, linspace(0, 1, 10), thetas=LEG_THETAS,
                    rfn=lambda t, th: chap_off(th))
    p.paint(lambda c, f: chap_mat(M, *frame(c), tmin=0.04))
    if sgn < 0:
        p.mirror_z()
    A = Asm().add(p, None)
    piv = P_HIP if sgn > 0 else mirror_pt(P_HIP)
    return A.build("thigh_" + ("R" if sgn > 0 else "L"), parent, loc=piv - P_PELVIS, origin=piv)


T_HEM = 0.628


def build_shin(M, sgn, parent):
    prof = [(0.0, (0.058, 0.057, 0.0, 0.0)), (0.08, (0.060, 0.058, -0.004, 0.0)),
            (0.20, (0.065, 0.060, -0.010, 0.0)), (0.30, (0.065, 0.059, -0.011, 0.0)),
            (0.42, (0.058, 0.052, -0.008, 0.0)), (0.52, (0.053, 0.049, -0.004, 0.0)),
            (0.60, (0.055, 0.052, -0.002, 0.0)), (0.625, (0.058, 0.055, -0.001, 0.0)),
            (0.632, (0.052, 0.048, 0.0, 0.0)), (0.70, (0.053, 0.049, 0.003, 0.0)),
            (0.80, (0.054, 0.048, 0.005, 0.0)), (0.90, (0.055, 0.049, 0.003, 0.0)),
            (1.0, (0.056, 0.050, 0.0, 0.0))]
    ts = [0.0, 0.08, 0.17, 0.26, 0.35, 0.44, 0.53, 0.59, 0.62, T_HEM, 0.634, 0.67,
          0.76, 0.86, 0.94, 1.0]
    p, frame = limb(P_KNEE, P_ANKLE, prof, ts, thetas=LEG_THETAS,
                    rfn=lambda t, th: chap_off(th) if t <= T_HEM + 0.001 else 0.0)

    def smat(c, f):
        t, th = frame(c)
        if t > T_HEM + 0.002:
            return M["boot"]
        return chap_mat(M, t, th)
    p.paint(smat)
    parts = [p]
    # boot shaft lace hooks + laces
    d = (P_ANKLE - P_KNEE)
    L = d.length
    d.normalize()

    def shaft_pt(t, th, off):
        a, b, ox, oz = interp(prof, t)
        c = P_KNEE + d * (t * L) + X_AX * ox
        return c + X_AX * ((a + off) * cos(th)) + Z_AX * ((b + off) * sin(th))
    hook_ts = [0.70, 0.78, 0.86]
    for t in hook_ts:
        for s in (1, -1):
            parts.append(uvsphere(6, 4, 0.0042).at(shaft_pt(t, radians(24) * s, 0.002)).paint(M["hook"]))
    for i in range(len(hook_ts) - 1):
        for s in (1, -1):
            a = shaft_pt(hook_ts[i], radians(24) * s, 0.001)
            b = shaft_pt(hook_ts[i + 1], -radians(24) * s, 0.001)
            mid = shaft_pt(0.5 * (hook_ts[i] + hook_ts[i + 1]), 0.0, 0.004)
            parts.append(tube([a, mid, b], 0.0022, segs=6).paint(M["lace"]))
    # lace bow-knot hint at the top hook pair
    parts.append(tube([shaft_pt(0.70, radians(20), 0.002), shaft_pt(0.675, 0.0, 0.009),
                       shaft_pt(0.70, -radians(20), 0.002)], 0.0024, segs=6).paint(M["lace"]))
    A = Asm()
    for q in parts:
        if sgn < 0:
            q.mirror_z()
        A.add(q, None)
    piv, ppiv = P_KNEE, P_HIP
    if sgn < 0:
        piv, ppiv = mirror_pt(piv), mirror_pt(ppiv)
    return A.build("shin_" + ("R" if sgn > 0 else "L"), parent, loc=piv - ppiv, origin=piv)


# boot upper along x (relative to the ankle x): (half width, top y (world))
BOOT = [(-0.090, (0.016, 0.075)), (-0.086, (0.028, 0.105)), (-0.078, (0.036, 0.128)),
        (-0.066, (0.041, 0.145)), (-0.048, (0.044, 0.155)), (-0.024, (0.045, 0.158)),
        (0.000, (0.046, 0.157)), (0.030, (0.048, 0.148)), (0.060, (0.050, 0.130)),
        (0.090, (0.052, 0.110)), (0.120, (0.053, 0.094)), (0.150, (0.053, 0.085)),
        (0.172, (0.050, 0.079)), (0.190, (0.045, 0.074)), (0.204, (0.038, 0.068)),
        (0.214, (0.027, 0.060)), (0.220, (0.013, 0.052))]
SOLE_TOP = 0.040
UPPER_BOT = 0.034


def build_foot(M, sgn, parent):
    P = P_ANKLE
    parts = []
    secs = []
    nn = 18
    for xr, (w, yt) in BOOT:
        yb = UPPER_BOT + (0.010 if abs(xr) > 0.2 or xr < -0.085 else 0.0)
        ym, hh = 0.5 * (yt + yb), 0.5 * (yt - yb)
        ring = []
        for i in range(nn):
            ph = 2 * pi * i / nn
            c, s = cos(ph), sin(ph)
            ey = 2.2 if s > 0 else 5.0
            ring.append(Vector((P.x + xr, ym + hh * spow(s, 2 / ey), P.z + w * spow(c, 2 / 2.6))))
        secs.append(ring)
    upper = loft2(secs, pole0=Vector((P.x - 0.092, 0.060, P.z)), pole1=Vector((P.x + 0.231, 0.048, P.z)))
    parts.append(upper.paint(M["boot"]))
    # ankle ball (clean rotation inside the shaft)
    parts.append(uvsphere(12, 8, 0.047).scale(1.0, 1.0, 0.95).at(P).paint(M["boot"]))

    def sole_prism(x0, x1, y0, y1, margin, nx):
        xs = linspace(x0, x1, nx)
        outline = [(P.x + xr, P.z + interp(BOOT, xr)[0] + margin) for xr in xs]
        outline += [(P.x + xr, P.z - interp(BOOT, xr)[0] - margin) for xr in xs[::-1]]
        bm = bmesh.new()
        lo = [bm.verts.new((x, y0, z)) for x, z in outline]
        hi = [bm.verts.new((x, y1, z)) for x, z in outline]
        m = len(outline)
        bm.faces.new(lo[::-1])
        bm.faces.new(hi)
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        return Part(bm)
    # midsole / outsole slab, heel block, forefoot lugs
    parts.append(sole_prism(-0.094, 0.224, 0.010, SOLE_TOP, 0.0055, 18).bevel(0.004, 1, min_angle=40)
                 .paint(M["sole"]))
    parts.append(sole_prism(-0.092, -0.020, 0.0, 0.012, 0.004, 7).bevel(0.003, 1, min_angle=40)
                 .paint(M["sole"]))
    for xr in (0.045, 0.085, 0.125, 0.165):
        w, _ = interp(BOOT, xr)
        for zf in (-0.6, 0.0, 0.6):
            parts.append(box(0.024, 0.013, w * 0.52).at(P.x + xr, 0.0065, P.z + zf * w)
                         .paint(M["sole"]))
    # instep eyelets + laces
    lx = [0.064, 0.090, 0.116]
    tops = []
    for xr in lx:
        w, yt = interp(BOOT, xr)
        tops.append((P.x + xr, yt))
    for (x, yt) in tops:
        for s in (1, -1):
            parts.append(cyl(0.0042, 0.003, segs=8, axis="Y").at(x, yt - 0.003, P.z + 0.015 * s)
                         .paint(M["hook"]))
    for i in range(len(tops) - 1):
        for s in (1, -1):
            (x0, y0), (x1, y1) = tops[i], tops[i + 1]
            a = Vector((x0, y0 + 0.0005, P.z + 0.015 * s))
            b = Vector((x1, y1 + 0.0005, P.z - 0.015 * s))
            mid = (a + b) / 2 + Vector((0, 0.003, 0))
            parts.append(tube([a, mid, b], 0.0021, segs=6).paint(M["lace"]))
    # tongue edge
    tg = [Vector((P.x + xr, interp(BOOT, xr)[1] - 0.001, P.z)) for xr in (0.128, 0.105, 0.080, 0.055, 0.035)]
    parts.append(tube(tg, (0.0022, 0.017), segs=8, up=Y_AX).paint(M["boot"]))
    A = Asm()
    for q in parts:
        if len(q.bm.verts) == 0:
            continue
        q.rot("Y", -5, pivot=P)                 # slight natural toe-out
        if sgn < 0:
            q.mirror_z()
        A.add(q, None, smooth=70)
    piv, ppiv = P_ANKLE, P_KNEE
    if sgn < 0:
        piv, ppiv = mirror_pt(piv), mirror_pt(ppiv)
    return A.build("foot_" + ("R" if sgn > 0 else "L"), parent, loc=piv - ppiv, origin=piv)


# --------------------------------------------------------------------------
# assembly, export, verification, preview
# --------------------------------------------------------------------------
def build():
    reset()
    ML.clear()
    M = make_materials()
    root = empty("faller", None, (0, 0, 0), size=0.3)
    pelvis = build_pelvis(M, root)
    spine = build_spine(M, pelvis)
    chest = build_chest(M, spine)
    head = build_head(M, chest)
    build_helmet(M, head)
    for sgn in (1, -1):
        ua = build_upperarm(M, sgn, chest)
        fa = build_forearm(M, sgn, ua)
        build_hand(M, sgn, fa)
        th = build_thigh(M, sgn, pelvis)
        sh = build_shin(M, sgn, th)
        build_foot(M, sgn, sh)
    bpy.context.view_layer.update()
    return root


def descendants(o):
    out = [o]
    for c in sorted(o.children, key=lambda x: x.name):
        out += descendants(c)
    return out


def export(root, path):
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    objs = descendants(root)
    for o in objs:
        o.select_set(True)
        assert tuple(o.rotation_euler) == (0.0, 0.0, 0.0) and tuple(o.scale) == (1.0, 1.0, 1.0), o.name
    bpy.context.view_layer.objects.active = root
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_cameras=False, export_lights=False, export_extras=False,
        export_materials="EXPORT", export_texcoords=False, export_normals=True)
    tris = 0
    for o in objs:
        if o.type == "MESH":
            t = sum(len(p.vertices) - 2 for p in o.data.polygons)
            tris += t
            print("  tris %-12s %6d" % (o.name, t))
    print("EXPORTED %s objects=%d tris=%d size=%.1f KB" %
          (os.path.basename(path), len(objs), tris, os.path.getsize(path) / 1024.0))
    return tris


def check_glb(path):
    """Parse the GLB JSON chunk: node hierarchy, translations, triangle count."""
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    clen, ctype = struct.unpack_from("<II", data, 12)
    gj = json.loads(data[20:20 + clen].decode("utf8"))
    nodes = gj["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i
    world = {}

    def wpos(i):
        if i in world:
            return world[i]
        t = Vector(nodes[i].get("translation", (0, 0, 0)))
        if i in parent:
            t = t + wpos(parent[i])
        world[i] = t
        return t
    print("GLB CHECK %s  (%.1f KB)" % (os.path.basename(path), len(data) / 1024.0))
    print("  %-12s %-12s %-26s %-26s %s" % ("node", "parent", "translation (glTF)", "world (glTF)", "extra"))
    bad = 0
    for i, n in enumerate(nodes):
        pn = nodes[parent[i]]["name"] if i in parent else "-"
        t = n.get("translation", [0, 0, 0])
        extra = []
        if "rotation" in n:
            extra.append("ROT%s" % n["rotation"])
            bad += 1
        if "scale" in n:
            extra.append("SCALE%s" % n["scale"])
            bad += 1
        if "mesh" in n:
            extra.append("mesh")
        w = wpos(i)
        print("  %-12s %-12s (%7.4f %7.4f %7.4f)  (%7.4f %7.4f %7.4f)  %s" %
              (n.get("name"), pn, t[0], t[1], t[2], w.x, w.y, w.z, " ".join(extra)))
    tris = 0
    for me in gj["meshes"]:
        for pr in me["primitives"]:
            if "indices" in pr:
                tris += gj["accessors"][pr["indices"]]["count"] // 3
            else:
                tris += gj["accessors"][pr["attributes"]["POSITION"]]["count"] // 3
    print("  nodes=%d meshes=%d materials=%d triangles=%d rot/scale entries=%d" %
          (len(nodes), len(gj["meshes"]), len(gj.get("materials", [])), tris, bad))
    print("  materials: " + ", ".join(m["name"] for m in gj.get("materials", [])))
    return gj


def setup_render(res=800):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 64
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = "Standard"
    except Exception:
        pass
    w = bpy.data.worlds.new("W")
    sc.world = w
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.60, 0.66, 0.74, 1)
    bg.inputs[1].default_value = 0.55

    def sun(name, energy, rot, angle=3, col=(1, 1, 1)):
        L = bpy.data.lights.new(name, "SUN")
        L.energy = energy
        L.angle = radians(angle)
        L.color = col
        o = bpy.data.objects.new(name, L)
        o.rotation_euler = tuple(radians(a) for a in rot)
        sc.collection.objects.link(o)
    sun("Key", 3.4, (48, 0, 40), col=(1.0, 0.96, 0.9))        # front-right, high
    sun("Fill", 0.9, (70, 0, -60), angle=20, col=(0.85, 0.9, 1.0))  # front-left, soft
    sun("Rim", 2.6, (60, 0, 165), col=(1.0, 0.98, 0.95))      # behind
    me = bpy.data.meshes.new("Ground")
    s = 4
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new("GroundMat")
    gb = gm.node_tree.nodes.get("Principled BSDF")
    gb.inputs["Base Color"].default_value = (0.24, 0.23, 0.21, 1)
    gb.inputs["Roughness"].default_value = 1.0
    me.materials.append(gm)
    sc.collection.objects.link(bpy.data.objects.new("Ground", me))


def render_view(path, target, direction, height, lens=60, res=None):
    sc = bpy.context.scene
    if res:
        sc.render.resolution_x = sc.render.resolution_y = res
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    fov = 2 * math.atan(18.0 / lens)
    d = Vector(direction).normalized()
    dist = (height * 0.5) / math.tan(fov / 2) * 1.08
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print("RENDERED", path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    preview = views = None
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] == "--preview":
            preview = argv[i + 1]
            i += 2
        elif argv[i] == "--views":
            views = argv[i + 1]
            i += 2
        else:
            pos.append(argv[i])
            i += 1
    outdir = os.path.abspath(pos[0]) if pos else os.path.join(ROOT, "assets", "models")
    glb = os.path.join(outdir, "faller.glb")
    if preview is None:
        preview = os.path.join(os.path.dirname(outdir), "previews", "faller.png")
    root = build()
    export(root, glb)
    check_glb(glb)

    setup_render(800)
    # Blender axes: glTF (x, y, z) -> (x, -z, y). Character faces +X, right side = -Y.
    render_view(preview, (0, 0, 0.93), (1.0, -0.78, 0.26), 1.95, lens=60, res=800)
    if views:
        os.makedirs(views, exist_ok=True)
        render_view(os.path.join(views, "front.png"), (0, 0, 0.93), (1, 0, 0.05), 1.95, res=700)
        render_view(os.path.join(views, "side.png"), (0, 0, 0.93), (0, -1, 0.05), 1.95, res=700)
        render_view(os.path.join(views, "back.png"), (0, 0, 0.93), (-1, 0.5, 0.15), 1.95, res=700)
        render_view(os.path.join(views, "head.png"), (0.01, 0, 1.68), (1.0, -0.6, 0.12), 0.36, res=700)
        render_view(os.path.join(views, "head_side.png"), (0.0, 0, 1.68), (0.0, -1.0, 0.05), 0.36, res=600)
        render_view(os.path.join(views, "torso.png"), (0.0, 0, 1.30), (1.0, -0.5, 0.35), 0.62, res=700)
        render_view(os.path.join(views, "hand.png"), (0.0, -0.262, 0.86), (0.6, -1.0, 0.1), 0.24, res=600)
        render_view(os.path.join(views, "hand_in.png"), (0.0, -0.20, 0.86), (0.3, 1.0, -0.3), 0.24, res=600)
        render_view(os.path.join(views, "boot.png"), (0.05, -0.105, 0.12), (0.7, -1.0, 0.35), 0.40, res=600)
        # pose test: bend elbows / knees / hips 90 deg around the glTF Z axis
        ob = bpy.data.objects
        ob["forearm_R"].rotation_euler = (0, radians(-90), 0)
        ob["upperarm_L"].rotation_euler = (0, radians(-60), 0)
        ob["thigh_R"].rotation_euler = (0, radians(-80), 0)
        ob["shin_R"].rotation_euler = (0, radians(90), 0)
        ob["foot_L"].rotation_euler = (0, radians(-25), 0)
        ob["spine"].rotation_euler = (0, radians(-20), 0)
        ob["neck_head"].rotation_euler = (radians(20), 0, 0)
        ob["visor"].rotation_euler = (0, radians(-80), 0)
        bpy.context.view_layer.update()
        render_view(os.path.join(views, "pose.png"), (0, 0, 0.93), (0.6, -1.0, 0.2), 1.95, res=700)
        render_view(os.path.join(views, "pose_back.png"), (0, 0, 0.93), (-0.6, -1.0, 0.2), 1.95, res=700)
    print("BUILD DONE")


if __name__ == "__main__":
    main()
