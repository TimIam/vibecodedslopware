"""
Timberline - procedural 3D asset builder.

Run headless (reproducible, no .blend needed):
  blender -b --factory-startup --python tools/blender/build_assets.py

Every asset is modelled in glTF / Three.js space (Y up, +Z toward the viewer)
and converted to Blender space (Z up) on build via the matrix C, so the
exporter's +Y-up conversion yields exactly the coordinates written here.

Outputs one .glb per asset into assets/models/.
Materials: Principled BSDF base colour / roughness / metallic only (glass cab
also uses alpha). No textures, no UVs.
"""
import bpy
import bmesh
import math
import os
import random
import sys
from math import pi, sin, cos, radians, atan2, sqrt
from mathutils import Vector, Matrix, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "models")
os.makedirs(OUT, exist_ok=True)

# glTF (x, y, z)  ->  Blender (x, -z, y)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

X_AX, Y_AX, Z_AX = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# --------------------------------------------------------------------------
# scene / materials
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

    def rot(self, axis, deg):
        return self.tf(Matrix.Rotation(radians(deg), 4, axis))

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


class Asm:
    """Accumulates parts (with materials) into one mesh object."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def add(self, part, material, smooth=35, recalc=True):
        src = part.bm
        if recalc:
            bmesh.ops.recalc_face_normals(src, faces=src.faces[:])
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
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

    def verts(self):
        return self.bm.verts

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


def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.1
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


def gbox(center, size, bev=0.0, segs=2):
    return box(*size, bev=bev, segs=segs).at(*center)


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


def icosphere(sub, r=1.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return Part(bm)


def se_ring(n, a, b, e, center, u, v, phase=0.0):
    """Superellipse ring: |x/a|^e + |y/b|^e = 1 in the plane spanned by u, v."""
    pts = []
    for i in range(n):
        t = 2 * pi * i / n + phase
        c, s = cos(t), sin(t)
        x = a * math.copysign(abs(c) ** (2.0 / e), c)
        y = b * math.copysign(abs(s) ** (2.0 / e), s)
        pts.append(Vector(center) + u * x + v * y)
    return pts


def loft(sections, cap0=True, cap1=True, ring_closed=True, loop=False):
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in sections]
    n = len(sections[0])
    pairs = list(zip(rings[:-1], rings[1:]))
    if loop:
        pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        for i in (range(n) if ring_closed else range(n - 1)):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if not loop:
        if cap0 and n > 2:
            bm.faces.new(rings[0][::-1])
        if cap1 and n > 2:
            bm.faces.new(rings[-1])
    return Part(bm)


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


def path_frames(path, up=None):
    n = len(path)
    T = []
    for i in range(n):
        if i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = path[i + 1] - path[i - 1]
        T.append(t.normalized())
    N, B = [], []
    if up is not None:
        up = Vector(up)
        for t in T:
            b = t.cross(up)
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


def tube(path, radius, segs=12, up=None, expo=2.0, cap=True):
    """radius: float, (a, b) tuple, or callable(t)->float|(a,b). a along N, b along B."""
    path = [Vector(p) for p in path]
    T, N, B = path_frames(path, up)
    secs = []
    L = len(path)
    for i, p in enumerate(path):
        r = radius(i / (L - 1)) if callable(radius) else radius
        ra, rb = r if isinstance(r, tuple) else (r, r)
        secs.append(se_ring(segs, ra, rb, expo, p, N[i], B[i]))
    return loft(secs, cap, cap)


def prism(poly, z0, z1):
    """Polygon in the XY plane extruded along Z from z0 to z1."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for x, y in poly]
    b = [bm.verts.new((x, y, z1)) for x, y in poly]
    n = len(poly)
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    return Part(bm)


def obox(center, X, Y, Z, sx, sy, sz):
    M = Matrix((
        (X.x, Y.x, Z.x, center.x),
        (X.y, Y.y, Z.y, center.y),
        (X.z, Y.z, Z.z, center.z),
        (0, 0, 0, 1)))
    return box(sx, sy, sz).tf(M)


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


def lerp(a, b, t):
    return a + (b - a) * t


def fbm(p, octaves=4, seed=Vector((0, 0, 0))):
    s, amp, f = 0.0, 1.0, 1.0
    for _ in range(octaves):
        s += amp * noise.noise((p + seed) * f)
        amp *= 0.5
        f *= 2.03
    return s


def linspace(a, b, n):
    return [a + (b - a) * i / (n - 1) for i in range(n)]


# --------------------------------------------------------------------------
# export
# --------------------------------------------------------------------------
def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


def export(roots, filename):
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    objs = []
    for r in roots:
        objs += descendants(r)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_cameras=False, export_lights=False, export_extras=False,
        export_materials="EXPORT", export_texcoords=False, export_normals=True)
    tris = 0
    for o in objs:
        if o.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print("EXPORTED %-22s objects=%d tris=%d size=%.1f KB" %
          (filename, len(objs), tris, os.path.getsize(path) / 1024.0))


# ==========================================================================
# 1. AXE
# ==========================================================================
def build_axe():
    reset()
    wood = mat("Hickory", "#c39a68", 0.45)
    wood_end = mat("HickoryEndGrain", "#7a5230", 0.7)
    steel_dark = mat("ForgedSteel", "#2a2b2e", 0.5, 0.85)
    steel_bright = mat("PolishedSteel", "#cfd2d6", 0.2, 1.0)
    wedge_steel = mat("WedgeSteel", "#6d7075", 0.4, 0.9)

    root = empty("Axe")
    Z_TOP = 0.902       # top of handle
    ZC = 0.858          # head centre (eye centre) height

    # ---- handle: oval sections along +Y, slight S curve in X ----------
    prof = [  # y, width along X, thickness along Z
        (0.000, (0.026, 0.020)),
        (0.004, (0.036, 0.027)),
        (0.012, (0.043, 0.031)),
        (0.030, (0.044, 0.032)),
        (0.060, (0.036, 0.027)),
        (0.110, (0.033, 0.025)),
        (0.300, (0.032, 0.0235)),
        (0.520, (0.0285, 0.0205)),
        (0.680, (0.030, 0.021)),
        (0.770, (0.036, 0.0225)),
        (0.815, (0.052, 0.0215)),
        (0.830, (0.058, 0.0210)),
        (0.896, (0.058, 0.0210)),
        (0.902, (0.054, 0.0180)),
    ]

    def xoff(y):
        c = -0.010 * sin(pi * min(y, 0.82) / 0.82)        # gentle bow
        knob = -0.006 * max(0.0, 1 - y / 0.06) ** 2        # fawn-foot hooks back
        return c + knob

    ys = sorted(set([p[0] for p in prof] + linspace(0.0, Z_TOP, 46)))
    secs = []
    for y in ys:
        wx, wz = interp(prof, y)
        secs.append(se_ring(18, wx / 2, wz / 2, 2.25, (xoff(y), y, 0), X_AX, Z_AX))
    h = Asm()

    def handle_mat(f):
        c = f.calc_center_median()
        return wood_end if (f.normal.y > 0.9 and c.y > 0.89) or (f.normal.y < -0.9 and c.y < 0.01) else wood
    h.add(loft(secs), handle_mat, smooth=50)
    # wooden + steel wedge in the top of the handle
    xo = xoff(0.9)
    h.add(gbox((xo, Z_TOP + 0.0006, 0), (0.050, 0.004, 0.0035)), wood_end)
    h.add(cyl(0.0045, 0.003, 12, axis="Y").at(xo + 0.008, Z_TOP + 0.0012, 0), wedge_steel)
    h.build("Handle", root)

    # ---- head: lofted along +X from poll (-X) to bit (+X) -------------
    table = [  # x, (ylo, yhi, thickness)  y relative to ZC
        (-0.042, (-0.033, 0.033, 0.027)),
        (-0.038, (-0.036, 0.036, 0.032)),
        (-0.020, (-0.037, 0.037, 0.0345)),
        (0.000, (-0.038, 0.038, 0.036)),
        (0.022, (-0.038, 0.038, 0.035)),
        (0.040, (-0.041, 0.040, 0.029)),
        (0.060, (-0.047, 0.044, 0.021)),
        (0.080, (-0.055, 0.049, 0.0145)),
        (0.100, (-0.062, 0.054, 0.0098)),
        (0.120, (-0.068, 0.058, 0.0064)),
        (0.135, (-0.071, 0.060, 0.0040)),
        (0.145, (-0.072, 0.061, 0.0021)),
        (0.152, (-0.072, 0.061, 0.0006)),
    ]
    x0, x1 = table[0][0], table[-1][0]
    xs = sorted(set([t[0] for t in table] + linspace(x0, x1, 34)))
    secs = []
    for x in xs:
        ylo, yhi, t = interp(table, x)
        yc = (ylo + yhi) / 2
        hh = (yhi - ylo) / 2
        e = lerp(3.4, 2.4, (x - x0) / (x1 - x0))
        ring = se_ring(24, hh, t / 2, e, (x, ZC + yc, 0), Y_AX, Z_AX)
        u = (x - x0) / (x1 - x0)
        for p in ring:     # convex, slightly swept cutting edge
            yn = (p.y - ZC - yc) / hh
            p.x += 0.009 * (1 - yn * yn) * u ** 4
        secs.append(ring)
    hd = Asm()

    def head_mat(f):
        return steel_bright if f.calc_center_median().x > 0.124 else steel_dark
    hd.add(loft(secs), head_mat, smooth=40)
    hd.build("Head", root, loc=(0, ZC, 0), origin=(0, ZC, 0))
    export([root], "axe.glb")


# ==========================================================================
# 2. CHAINSAW   (x forward, y up, z = operator's right side)
# ==========================================================================
YC = -0.055   # guide bar centre line height


def bar_outline(step=0.003):
    x0, x1, h0, h1 = 0.19, 0.775, 0.036, 0.025
    pts = []
    n = int((x1 - x0) / step)
    for i in range(n):
        t = i / n
        pts.append(Vector((x0 + (x1 - x0) * t, YC + h0 + (h1 - h0) * t, 0)))
    m = int(pi * h1 / step)
    for i in range(m):
        a = pi / 2 - pi * i / m
        pts.append(Vector((x1 + h1 * cos(a), YC + h1 * sin(a), 0)))
    for i in range(n):
        t = i / n
        pts.append(Vector((x1 - (x1 - x0) * t, YC - (h1 + (h0 - h1) * t), 0)))
    m2 = int(pi * h0 / step)
    for i in range(m2):
        a = -pi / 2 - pi * i / m2
        pts.append(Vector((x0 + h0 * cos(a), YC + h0 * sin(a), 0)))
    return pts


def poly_normals(pts):
    """Outward normals for a clockwise (x right, y up) closed polyline."""
    out = []
    n = len(pts)
    for i in range(n):
        t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        out.append(Vector((-t.y, t.x, 0)))
    return out


def offset_poly(pts, d):
    return [p + nn * d for p, nn in zip(pts, poly_normals(pts))]


def resample(pts, step):
    n = len(pts)
    segs = [(pts[i], pts[(i + 1) % n]) for i in range(n)]
    total = sum((b - a).length for a, b in segs)
    cnt = int(total / step)
    step = total / cnt
    out, acc, si = [], 0.0, 0
    a, b = segs[0]
    seglen = (b - a).length
    for k in range(cnt):
        target = k * step
        while acc + seglen < target and si < n - 1:
            acc += seglen
            si += 1
            a, b = segs[si]
            seglen = (b - a).length
        t = (target - acc) / seglen if seglen > 0 else 0
        out.append(a.lerp(b, t))
    return out


def build_chainsaw():
    reset()
    orange = mat("SawOrange", "#f26a1b", 0.45)
    white = mat("SawWhite", "#e9e7e1", 0.5)
    black = mat("SawBlackRubber", "#1a1a1a", 0.8)
    darkplast = mat("SawDarkPlastic", "#2d2e30", 0.55)
    muffler = mat("MufflerMetal", "#3a3a3b", 0.45, 0.75)
    spikes = mat("SpikeSteel", "#4a4b4e", 0.4, 0.9)
    nutm = mat("Zinc", "#b8bcc0", 0.3, 1.0)
    red = mat("SwitchRed", "#c0161b", 0.45)
    bar_steel = mat("BarSteel", "#9a9fa5", 0.3, 0.9)
    bar_paint = mat("BarPaint", "#2f3236", 0.4, 0.4)
    chain_m = mat("ChainSteel", "#3a3b3d", 0.45, 0.85)
    cutter_m = mat("CutterChrome", "#a5a8ac", 0.25, 1.0)

    root = empty("Chainsaw")
    ZB = -0.04   # body centre (left of the bar plane)

    body = Asm()
    # -- crankcase / tank housing (white) --
    tab = [  # x, (ylo, yhi, half width)
        (0.045, (-0.095, 0.020, 0.040)),
        (0.060, (-0.108, 0.040, 0.056)),
        (0.100, (-0.112, 0.052, 0.063)),
        (0.170, (-0.112, 0.058, 0.065)),
        (0.240, (-0.110, 0.054, 0.064)),
        (0.280, (-0.104, 0.040, 0.058)),
        (0.300, (-0.095, 0.020, 0.048)),
        (0.308, (-0.085, 0.000, 0.036)),
    ]
    secs = []
    for x in linspace(0.045, 0.308, 16):
        ylo, yhi, hw = interp(tab, x)
        secs.append(se_ring(28, (yhi - ylo) / 2, hw, 3.4, (x, (ylo + yhi) / 2, ZB), Y_AX, Z_AX))
    body.add(loft(secs), white, smooth=40)
    # -- top shroud (orange) --
    tab = [
        (0.070, (0.000, 0.030, 0.045)),
        (0.090, (-0.010, 0.072, 0.060)),
        (0.140, (-0.020, 0.096, 0.067)),
        (0.210, (-0.020, 0.097, 0.068)),
        (0.255, (-0.020, 0.085, 0.066)),
        (0.280, (-0.015, 0.060, 0.058)),
        (0.292, (-0.010, 0.035, 0.045)),
    ]
    secs = []
    for x in linspace(0.07, 0.292, 14):
        ylo, yhi, hw = interp(tab, x)
        secs.append(se_ring(28, (yhi - ylo) / 2, hw, 2.7, (x, (ylo + yhi) / 2, ZB), Y_AX, Z_AX))
    body.add(loft(secs), orange, smooth=40)
    # air-intake slits on both flanks of the shroud
    for side in (-1, 1):
        for i in range(5):
            body.add(gbox((0.185 + i * 0.012, 0.045, ZB + side * 0.0675),
                          (0.006, 0.034, 0.004), 0.001, 1), darkplast)
    # -- rear handle loop (black) --
    rp = catmull([(0.080, 0.030, -0.035), (0.050, 0.012, -0.020), (0.020, 0.000, -0.006),
                  (-0.035, 0.000, 0.000), (-0.070, -0.015, 0.000), (-0.085, -0.055, 0.000),
                  (-0.075, -0.095, -0.005), (-0.035, -0.112, -0.015), (0.020, -0.115, -0.030),
                  (0.070, -0.110, -0.040)], 5)

    def rh_rad(t):
        # lateral half width, in-plane half height
        grip = max(0.0, 1 - abs(t - 0.28) / 0.28)
        return (lerp(0.024, 0.016, grip), lerp(0.014, 0.019, grip))
    body.add(tube(rp, rh_rad, 16, up=Z_AX, expo=2.4), black, smooth=50)
    # rear right-hand guard
    body.add(prism([(-0.088, -0.095), (-0.095, -0.132), (-0.020, -0.138), (0.005, -0.118)],
                   0.010, 0.017).bevel(0.002, 1), darkplast)
    # throttle trigger + lockout
    body.add(prism([(0.006, -0.010), (0.036, -0.010), (0.040, -0.022), (0.031, -0.036),
                    (0.013, -0.029)], -0.005, 0.005).bevel(0.0015, 1), darkplast)
    body.add(prism([(-0.028, 0.012), (0.004, 0.012), (0.010, 0.021), (-0.022, 0.024)],
                   -0.006, 0.006).bevel(0.0015, 1), darkplast)
    # -- wrap-around front handle (black tube) --
    fp = catmull([(0.205, -0.080, -0.100), (0.208, -0.050, -0.118), (0.210, 0.060, -0.122),
                  (0.210, 0.125, -0.112), (0.210, 0.158, -0.085), (0.210, 0.168, -0.035),
                  (0.205, 0.163, 0.005), (0.180, 0.157, 0.020), (0.130, 0.152, 0.020),
                  (0.095, 0.135, 0.012), (0.078, 0.095, 0.000), (0.076, 0.060, -0.005)], 6)
    body.add(tube(fp, 0.0125, 14), black, smooth=50)
    for p in (fp[0], fp[-1]):
        body.add(cyl(0.017, 0.022, 14, axis="Y").at(p), darkplast)
    # -- chain brake / front hand guard (black band) --
    gp = catmull([(0.250, 0.020, -0.108), (0.258, 0.100, -0.112), (0.265, 0.160, -0.095),
                  (0.270, 0.185, -0.050), (0.270, 0.180, 0.000), (0.265, 0.140, 0.035),
                  (0.255, 0.060, 0.045), (0.250, 0.000, 0.049)], 6)
    body.add(tube(gp, (0.0032, 0.016), 12, up=X_AX, expo=4.0), black, smooth=45)
    body.add(cyl(0.014, 0.012, 14, axis="Z").at(0.25, 0.005, -0.104), darkplast)
    # -- clutch / sprocket cover (orange) with bar nuts --
    body.add(gbox((0.243, -0.060, 0.026), (0.148, 0.100, 0.046), 0.014, 3), orange)
    for x in (0.222, 0.258):
        body.add(cyl(0.0075, 0.008, 6, axis="Z").at(x, YC, 0.051).bevel(0.001, 1), nutm)
    body.add(cyl(0.004, 0.006, 10, axis="Z").at(0.30, -0.095, 0.049), nutm)   # tensioner
    # -- muffler with slotted heat shield --
    body.add(gbox((0.310, -0.020, -0.060), (0.035, 0.072, 0.068), 0.006, 2), muffler)
    for i in range(4):
        body.add(gbox((0.3285, -0.044 + i * 0.016, -0.060), (0.003, 0.006, 0.050)), black)
    # -- bucking spikes on both sides of the bar root --
    spk = [(0.296, -0.104), (0.338, -0.100), (0.317, -0.088), (0.343, -0.075), (0.317, -0.063),
           (0.338, -0.050), (0.296, -0.040)]
    body.add(prism(spk, -0.0095, -0.0055), spikes, smooth=None)
    body.add(prism([(x + 0.012, y) for x, y in spk], 0.0495, 0.0535), spikes, smooth=None)
    # -- starter grip, fuel cap, oil cap, switch, feet --
    body.add(cyl(0.009, 0.068, 12, axis="X").at(0.150, 0.030, -0.113).bevel(0.003, 2), black)
    body.add(cyl(0.004, 0.010, 8, axis="Z").at(0.15, 0.030, -0.104), black)
    body.add(cyl(0.019, 0.012, 20, axis="Z").at(0.080, -0.072, -0.105).bevel(0.002, 2), darkplast)
    body.add(cyl(0.016, 0.010, 20, axis="Z").at(0.125, -0.072, 0.027).bevel(0.002, 2), darkplast)
    body.add(gbox((0.060, 0.036, -0.040), (0.016, 0.012, 0.022), 0.003), red)
    for x in (0.11, 0.25):
        body.add(gbox((x, -0.115, ZB), (0.030, 0.008, 0.050), 0.002), black)
    body.build("Body", root)

    # ---------------- guide bar ----------------
    base = bar_outline(0.004)
    bar = Asm()
    bar.add(prism([(p.x, p.y) for p in base], -0.0024, 0.0024).bevel(0.0006, 1, 60),
            bar_steel, smooth=40)
    inner = offset_poly(resample(base, 0.006), -0.011)
    bar.add(prism([(p.x, p.y) for p in inner], -0.0027, 0.0027), bar_paint, smooth=40)
    bar.add(cyl(0.017, 0.0058, 24, axis="Z").at(0.775, YC, 0), bar_steel)
    for k in range(4):
        a = pi / 4 + k * pi / 2
        bar.add(cyl(0.0024, 0.0064, 8, axis="Z").at(0.775 + 0.011 * cos(a), YC + 0.011 * sin(a), 0), nutm)
    bar.add(cyl(0.004, 0.0062, 10, axis="Z").at(0.44, YC, 0), nutm)     # bar rivet / oil hole
    bar.build("Bar", root, loc=(0.19, YC, 0), origin=(0.19, YC, 0))

    # ---------------- chain ----------------
    path = resample(base, 0.005)
    nrm = poly_normals(path)
    w = 0.0033
    secs = []
    for p, nn in zip(path, nrm):
        secs.append([p + nn * -0.003 - Z_AX * w, p + nn * 0.0035 - Z_AX * w,
                     p + nn * 0.0035 + Z_AX * w, p + nn * -0.003 + Z_AX * w])
    ch = Asm()
    ch.add(loft(secs, loop=True), chain_m, smooth=60)
    # cutters: every 2 pitches (3/8" = 9.525 mm), alternating sides, + depth gauges
    pitch = 0.009525
    dense = resample(base, 0.001)
    dn = poly_normals(dense)
    total = len(dense) * 0.001
    k, s, side = 0, 0.0, 1
    while s < total - 0.01:
        i = int(s / 0.001) % len(dense)
        p, nn = dense[i], dn[i]
        T = Vector((nn.y, -nn.x, 0))       # travel direction (clockwise)
        Zs = T.cross(nn)
        if k % 2 == 0:
            ch.add(obox(p + nn * 0.0066 + Zs * (side * 0.0017), T, nn, Zs,
                        0.0075, 0.0040, 0.0050), cutter_m, smooth=None)
            ch.add(obox(p + nn * 0.0058 + Zs * (side * 0.003) - T * 0.0034, T, nn, Zs,
                        0.0022, 0.0034, 0.0016), cutter_m, smooth=None)
            ch.add(obox(p - T * 0.0075 + nn * 0.0052 - Zs * (side * 0.0005), T, nn, Zs,
                        0.0025, 0.0030, 0.0040), chain_m, smooth=None)
            side = -side
        k += 1
        s += pitch
    ch.build("Chain", root, loc=(0.19, YC, 0), origin=(0.19, YC, 0))
    export([root], "chainsaw.glb")


# ==========================================================================
# 3. HARVESTER  (front = +Z)
# ==========================================================================
WHEELS = [(+1.00, 2.95), (-1.00, 2.95), (+1.00, 1.45), (-1.00, 1.45),
          (+1.00, -1.30), (-1.00, -1.30), (+1.00, -2.78), (-1.00, -2.78)]
WR = 0.675


def wheel_asm(side, m_tire, m_rim, m_hub, m_nut):
    A = Asm()
    prof = [(-0.300, 0.345), (-0.330, 0.400), (-0.348, 0.480), (-0.346, 0.555), (-0.333, 0.600),
            (-0.305, 0.627), (-0.250, 0.634), (0.000, 0.637), (0.250, 0.634), (0.305, 0.627),
            (0.333, 0.600), (0.346, 0.555), (0.348, 0.480), (0.330, 0.400), (0.300, 0.345)]
    N = 40
    secs = [[Vector((a, r * cos(2 * pi * k / N), r * sin(2 * pi * k / N))) for k in range(N)]
            for a, r in prof]
    A.add(loft(secs, cap0=False, cap1=False), m_tire, smooth=50, recalc=False)
    NL = 20
    for s in (-1, 1):
        for k in range(NL):
            phi = 2 * pi * k / NL + (pi / NL if s > 0 else 0)
            lug = box(0.34, 0.05, 0.075)
            lug.fn(lambda v, s=s: Vector((v.x, v.y - max(0.0, s * v.x - 0.05) * 0.28, v.z)))
            lug.rot("Y", s * 28).at(s * 0.185, 0.654, 0).rot("X", math.degrees(phi))
            A.add(lug, m_tire, smooth=None)
    A.add(cyl(0.342, 0.60, 32, axis="X"), m_rim, smooth=40)
    A.add(cyl(0.29, 0.02, 32, axis="X").at(side * 0.305, 0, 0), m_rim, smooth=40)
    A.add(cyl(0.14, 0.10, 20, r2=0.095, axis="X").rot("Y", 0 if side > 0 else 180)
          .at(side * 0.355, 0, 0), m_hub, smooth=40)
    for k in range(10):
        a = 2 * pi * k / 10
        A.add(cyl(0.021, 0.035, 6, axis="X").at(side * 0.325, 0.20 * cos(a), 0.20 * sin(a)), m_nut,
              smooth=None)
    return A


def place_between(barrel_obj, low_w, up_w):
    """Orient obj (local glTF +Z == Blender -Y) at low_w pointing to up_w; pin axis = X."""
    d = (up_w - low_w).normalized()
    xa = Vector((1, 0, 0))
    ya = -d
    za = xa.cross(ya)
    R = Matrix(((xa.x, ya.x, za.x, low_w.x), (xa.y, ya.y, za.y, low_w.y),
                (xa.z, ya.z, za.z, low_w.z), (0, 0, 0, 1)))
    barrel_obj.matrix_world = R


def build_harvester():
    reset()
    yellow = mat("PaintYellow", "#f2b705", 0.42, 0.1)
    green = mat("PaintGreen", "#1f5a32", 0.45, 0.1)
    frame = mat("FrameGrey", "#2b2c2e", 0.55, 0.3)
    black = mat("BlackSteel", "#141414", 0.6, 0.2)
    tire = mat("TireRubber", "#161616", 0.9)
    hub = mat("HubGrey", "#3d3e40", 0.5, 0.6)
    chrome = mat("Chrome", "#d8dadc", 0.12, 1.0)
    steel = mat("ToolSteel", "#55585c", 0.4, 0.85)
    glass = mat("CabGlass", "#2e4a55", 0.05, 0.0, alpha=0.38)
    lens = mat("LightLens", "#f2f4f5", 0.1)
    redl = mat("TailRed", "#b3121a", 0.3)
    amber = mat("Amber", "#ff8c00", 0.3)
    seat = mat("SeatFabric", "#2a2a2a", 0.85)
    rubber = mat("FeedRoller", "#1c1c1c", 0.7, 0.3)

    root = empty("Harvester")
    # ---------------- chassis ----------------
    ch = Asm()
    ch.add(gbox((0, 0.95, 1.85), (0.86, 0.62, 3.30), 0.03), frame)            # front frame
    ch.add(gbox((0, 0.85, -1.90), (0.90, 0.55, 3.30), 0.03), frame)           # rear frame
    for zc, za, zb in ((2.20, 2.95, 1.45), (-2.04, -1.30, -2.78)):
        for sx in (-1, 1):
            ch.add(gbox((sx * 0.55, 0.675, zc), (0.26, 0.46, 1.78), 0.07), frame)   # bogie box
            for zz in (za, zb):
                ch.add(cyl(0.23, 0.27, 20, axis="X").at(sx * 0.55, WR, zz), frame)
        ch.add(cyl(0.13, 1.0, 16, axis="X").at(0, 0.68, zc), hub)
    ch.add(gbox((0, 1.48, 2.05), (2.42, 0.14, 2.90), 0.03), yellow)            # front deck
    ch.add(gbox((0, 1.20, 3.46), (1.60, 0.46, 0.16), 0.04), yellow)            # nose plate
    ch.add(gbox((0, 0.80, 3.63), (2.00, 0.55, 0.22), 0.05), black)             # bumper blade
    for sx in (-1, 1):
        ch.add(gbox((sx * 0.75, 0.98, 3.742), (0.22, 0.10, 0.03), 0.01), lens)
    ch.add(cyl(0.28, 0.60, 20, axis="Y").at(0, 0.95, 0.05), frame)             # articulation
    ch.add(gbox((0, 1.08, -1.95), (1.26, 0.62, 2.60), 0.05), yellow)            # tanks
    # engine hood (lofted)
    tab = [(-0.28, (1.42, 2.08, 1.02)), (-0.40, (1.42, 2.28, 1.17)), (-0.55, (1.42, 2.31, 1.20)),
           (-3.25, (1.42, 2.31, 1.20)), (-3.55, (1.42, 2.22, 1.18)), (-3.75, (1.46, 1.98, 1.10))]
    secs = []
    for z in sorted(set([t[0] for t in tab] + [-0.33, -0.47, -3.40, -3.65, -3.71]), reverse=True):
        ylo, yhi, hw = interp(tab, z)
        secs.append(se_ring(32, hw, (yhi - ylo) / 2, 7.0, (0, (ylo + yhi) / 2, z), X_AX, Y_AX))
    ch.add(loft(secs), yellow, smooth=30)
    ch.add(gbox((0, 0.95, -3.62), (2.20, 0.85, 0.26), 0.05), black)            # rear bumper
    for i in range(6):
        ch.add(gbox((0, 1.56 + i * 0.065, -3.757), (1.50, 0.035, 0.03)), black)  # rear grille
    for sx in (-1, 1):
        ch.add(gbox((sx * 1.207, 1.62, -1.90), (0.014, 0.09, 2.70)), green)      # stripe
        for i in range(6):
            ch.add(gbox((sx * 1.205, 1.93, -2.55 - i * 0.11), (0.02, 0.42, 0.05)), black)
        ch.add(gbox((sx * 0.92, 1.70, -3.763), (0.16, 0.08, 0.03), 0.01), redl)
        ch.add(gbox((sx * 0.70, 1.70, -3.763), (0.10, 0.08, 0.03), 0.01), amber)
        ch.add(gbox((sx * 0.85, 2.36, -3.45), (0.16, 0.10, 0.08), 0.015), lens)
        hp = catmull([(sx * 1.0, 2.30, -1.00), (sx * 1.0, 2.44, -1.06), (sx * 1.0, 2.44, -3.18),
                      (sx * 1.0, 2.30, -3.24)], 4)
        ch.add(tube(hp, 0.022, 8), black)
    ch.add(cyl(0.075, 0.75, 14, axis="Y").at(-0.78, 2.62, -0.85), black)        # exhaust
    ch.add(cyl(0.095, 0.32, 14, axis="Y").at(-0.78, 2.47, -0.85), hub)          # heat shield
    ch.add(cyl(0.075, 0.18, 14, axis="Z").rot("X", 35).at(-0.78, 3.02, -0.90), black)
    ch.add(cyl(0.13, 0.34, 18, axis="Y").at(0.78, 2.47, -0.85), black)          # pre-cleaner
    ch.add(cyl(0.15, 0.05, 18, axis="Y").at(0.78, 2.66, -0.85).bevel(0.01, 1), black)
    for i, yy in enumerate((0.55, 0.92, 1.29)):                                 # access steps
        ch.add(gbox((1.17, yy, 0.25), (0.30, 0.03, 0.26), 0.008), steel)
    for zz in (0.12, 0.38):
        ch.add(gbox((1.32, 0.95, zz), (0.03, 0.90, 0.03)), black)
    chassis = ch.build("Chassis", root)

    for i, (x, z) in enumerate(WHEELS):
        side = 1 if x > 0 else -1
        wheel_asm(side, tire, yellow, hub, chrome).build("Wheel_%d" % i, chassis, loc=(x, WR, z))

    # ---------------- turret ----------------
    TP = (0, 1.55, 1.90)
    tu = Asm()
    tu.add(cyl(0.85, 0.14, 40, axis="Y").at(0, 0.07, 0), frame)
    tu.add(gbox((-0.12, 0.24, 0.05), (2.34, 0.20, 2.10), 0.03), yellow)
    tu.add(gbox((-0.72, 0.55, -0.35), (0.78, 0.42, 0.78), 0.05), yellow)        # slew housing
    tu.add(cyl(0.30, 0.95, 24, r2=0.25, axis="Y").at(-0.72, 1.20, -0.35), yellow)
    for sx in (-1, 1):
        tu.add(gbox((-0.72 + sx * 0.235, 1.62, -0.35), (0.06, 0.42, 0.44), 0.02), yellow)
        tu.add(gbox((-0.72 + sx * 0.10, 0.85, -0.07), (0.04, 0.18, 0.16), 0.01), yellow)
    tu.add(cyl(0.07, 0.56, 16, axis="X").at(-0.72, 1.60, -0.35), chrome)
    tu.add(cyl(0.045, 0.26, 12, axis="X").at(-0.72, 0.85, -0.04), chrome)
    turret = tu.build("Turret", chassis, loc=TP)

    # ---------------- cab ----------------
    cb = Asm()
    cb.add(gbox((0, 0.13, 0), (1.36, 0.26, 1.76), 0.03), yellow)
    cb.add(gbox((0, 1.00, 0.0), (1.30, 1.48, 1.70)), glass, smooth=None)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cb.add(gbox((sx * 0.645, 1.00, sz * 0.845), (0.07, 1.50, 0.07), 0.015), black)
        cb.add(gbox((sx * 0.655, 1.00, -0.25), (0.05, 1.50, 0.06), 0.01), black)
        cb.add(gbox((sx * 0.655, 0.29, 0), (0.05, 0.06, 1.76)), black)
        cb.add(gbox((sx * 0.655, 1.71, 0), (0.05, 0.06, 1.76)), black)
        cb.add(gbox((sx * 0.80, 1.36, 0.80), (0.04, 0.24, 0.13), 0.01), black)   # mirror
        cb.add(gbox((sx * 0.73, 1.45, 0.80), (0.14, 0.02, 0.02)), black)
        cb.add(gbox((sx * 0.35, 0.72, -0.15), (0.12, 0.12, 0.45), 0.02), seat)   # armrests
        cb.add(cyl(0.022, 0.13, 10, axis="Y").at(sx * 0.35, 0.84, -0.02), black)
    for sz in (-1, 1):
        cb.add(gbox((0, 0.29, sz * 0.855), (1.36, 0.06, 0.05)), black)
        cb.add(gbox((0, 1.71, sz * 0.855), (1.36, 0.06, 0.05)), black)
    cb.add(gbox((0, 1.82, 0.04), (1.50, 0.16, 1.94), 0.05), yellow)             # roof
    cb.add(gbox((0, 1.905, -0.10), (0.62, 0.03, 0.62), 0.01), black)
    for i in range(6):
        cb.add(gbox((-0.55 + i * 0.22, 1.80, 1.015), (0.13, 0.08, 0.05), 0.01), lens)
    for i in range(4):
        cb.add(gbox((-0.45 + i * 0.30, 1.80, -0.935), (0.13, 0.08, 0.05), 0.01), lens)
    for sx in (-1, 1):
        cb.add(gbox((sx * 0.30, 0.85, 0.858), (0.02, 0.62, 0.012)).tf(Matrix.Rotation(radians(sx * 18), 4, "Z")), black)
    cb.add(gbox((0, 0.50, -0.20), (0.50, 0.14, 0.50), 0.03), seat)              # seat
    cb.add(gbox((0, 0.62, -0.18), (0.48, 0.08, 0.48), 0.03), seat)
    cb.add(gbox((0, 0.98, -0.47), (0.48, 0.62, 0.11), 0.03).rot("X", -8), seat)
    cb.add(gbox((0.69, 0.92, 0.30), (0.03, 0.04, 0.16), 0.008), black)          # door handle
    cb.build("Cab", turret, loc=(0.35, 0.34, 0.25))

    # ---------------- boom 1 (lift boom) ----------------
    L1 = 4.2
    b1 = Asm()
    tab = [(-0.20, (0.150, 0.21, 0.00)), (0.25, (0.160, 0.25, 0.02)), (1.30, (0.160, 0.25, 0.0)),
           (3.00, (0.150, 0.20, 0.0)), (4.00, (0.140, 0.16, 0.0)), (4.22, (0.120, 0.13, 0.0))]
    secs = []
    for z in linspace(-0.20, 4.22, 18):
        hw, hh, yc = interp(tab, z)
        secs.append(se_ring(20, hw, hh, 8.0, (0, yc, z), X_AX, Y_AX))
    b1.add(loft(secs), yellow, smooth=30)
    b1.add(cyl(0.21, 0.40, 24, axis="X"), yellow)
    for sx in (-1, 1):
        b1.add(gbox((sx * 0.17, 0, L1), (0.05, 0.36, 0.42), 0.02), yellow)
        b1.add(gbox((sx * 0.09, -0.30, 1.30), (0.04, 0.17, 0.24), 0.01), yellow)
        b1.add(gbox((sx * 0.10, 0.30, 1.60), (0.04, 0.17, 0.24), 0.01), yellow)
        hp = catmull([(sx * 0.07, 0.22, -0.05), (sx * 0.07, 0.29, 0.5), (sx * 0.07, 0.28, 3.5),
                      (sx * 0.07, 0.25, 4.0), (sx * 0.07, 0.12, 4.35)], 5)
        b1.add(tube(hp, 0.022, 6), black)
    b1.add(cyl(0.065, 0.46, 16, axis="X").at(0, 0, L1), chrome)
    b1.add(cyl(0.045, 0.24, 12, axis="X").at(0, -0.30, 1.30), chrome)
    b1.add(cyl(0.045, 0.26, 12, axis="X").at(0, 0.33, 1.60), chrome)
    boom1 = b1.build("Boom1", turret, loc=(-0.72, 1.60, -0.35))
    boom1.rotation_euler = (radians(-25), 0, 0)

    # ---------------- boom 2 (folding + telescope) ----------------
    L2 = 3.5
    b2 = Asm()
    tab = [(0.00, (0.130, 0.18)), (0.40, (0.140, 0.20)), (2.00, (0.130, 0.17)), (3.00, (0.120, 0.15))]
    secs = []
    for z in linspace(0.0, 3.0, 12):
        hw, hh = interp(tab, z)
        secs.append(se_ring(20, hw, hh, 8.0, (0, 0, z), X_AX, Y_AX))
    b2.add(loft(secs), yellow, smooth=30)
    b2.add(cyl(0.17, 0.28, 24, axis="X"), yellow)
    b2.add(gbox((0, 0, 3.10), (0.18, 0.22, 0.90), 0.02), yellow)               # telescope
    lev = Vector((0, 0.45, -0.35))
    ang = math.degrees(atan2(lev.z, lev.y))
    for sx in (-1, 1):
        b2.add(gbox((0, 0, 0), (0.035, lev.length, 0.16), 0.01).at(0, lev.length / 2, 0)
               .rot("X", ang).at(sx * 0.09, 0, 0), yellow)
        b2.add(gbox((sx * 0.11, -0.05, 3.50), (0.04, 0.22, 0.24), 0.01), yellow)
        hp = catmull([(sx * 0.06, 0.18, 0.2), (sx * 0.06, 0.20, 1.0), (sx * 0.06, 0.18, 2.6),
                      (sx * 0.06, 0.14, 3.2), (sx * 0.08, -0.05, 3.45)], 5)
        b2.add(tube(hp, 0.02, 6), black)
    b2.add(cyl(0.06, 0.24, 14, axis="X").at(lev), chrome)
    b2.add(cyl(0.05, 0.30, 14, axis="X").at(0, 0, L2), chrome)
    boom2 = b2.build("Boom2", boom1, loc=(0, 0, L1))
    boom2.rotation_euler = (radians(78), 0, 0)

    # ---------------- harvester head ----------------
    hd = Asm()
    hd.add(cyl(0.055, 0.30, 14, axis="X"), chrome)
    for sx in (-1, 1):
        hd.add(gbox((sx * 0.08, -0.17, 0), (0.035, 0.42, 0.13), 0.01), frame)
    hd.add(cyl(0.15, 0.04, 24, axis="Y").at(0, -0.35, 0), frame)
    hd.add(cyl(0.13, 0.26, 24, axis="Y").at(0, -0.48, 0), hub)
    hd.add(cyl(0.15, 0.04, 24, axis="Y").at(0, -0.61, 0), frame)
    hd.add(gbox((0, -0.71, -0.05), (0.50, 0.16, 0.36), 0.03), yellow)          # tilt frame
    for sx in (-1, 1):
        hd.add(gbox((sx * 0.20, -0.82, -0.05), (0.05, 0.20, 0.30), 0.01), yellow)
    hd.add(gbox((0, -1.27, -0.10), (0.48, 0.92, 0.36), 0.04), yellow)          # main frame
    hd.add(gbox((0, -1.27, 0.085), (0.30, 0.86, 0.03), 0.008), steel)
    # valve-block cover: rounded yellow hood on the back of the frame
    vc = [se_ring(20, 0.23, 0.13, 3.0, (0, y, -0.30), X_AX, Z_AX) for y in linspace(-0.86, -1.50, 6)]
    hd.add(loft(vc), yellow, smooth=40)
    hd.add(gbox((0, -1.18, -0.425), (0.30, 0.10, 0.02), 0.005), black)          # vent
    CZ, R = 0.33, 0.25

    def knife(y, a0, a1, sx, hgt=0.035, thick=0.013):
        pts = [Vector((sx * R * sin(radians(a)), y, CZ - R * cos(radians(a))))
               for a in linspace(a0, a1, 12)]
        return tube(pts, (hgt, thick), 8, up=Y_AX, expo=3.0)
    hd.add(knife(-0.86, -45, 45, 1, 0.03, 0.014), steel)                        # fixed top knife
    for y in (-0.95, -1.58):
        for sx in (-1, 1):
            hd.add(knife(y, 38, 168, sx), steel)
            hd.add(cyl(0.05, 0.10, 12, axis="Y").at(sx * 0.21, y, 0.12), frame)
    for sx in (-1, 1):
        dx, dz = sx * 0.16, 0.34
        L = sqrt(dx * dx + dz * dz)
        hd.add(gbox((0, 0, 0), (0.07, 0.24, L), 0.02).rot("Y", math.degrees(atan2(dx, dz)))
               .at(sx * 0.24 + dx / 2, -1.27, -0.03 + dz / 2), yellow)
        rc = Vector((sx * 0.37, -1.27, CZ))
        hd.add(cyl(0.215, 0.20, 28, axis="Z").at(rc), rubber)
        hd.add(cyl(0.09, 0.215, 16, axis="Z").at(rc), hub)
        hd.add(cyl(0.085, 0.15, 14, axis="Z").at(rc.x, rc.y, rc.z - 0.17), frame)
        for k in range(16):
            a = 2 * pi * k / 16
            hd.add(prism([(-0.016, -0.005), (0.016, -0.005), (0.004, 0.028), (-0.004, 0.028)], -0.1, 0.1)
                   .rot("Z", math.degrees(a) - 90)
                   .at(rc.x + 0.212 * cos(a), rc.y + 0.212 * sin(a), rc.z), steel, smooth=None)
        hp = catmull([(sx * 0.06, -0.62, -0.17), (sx * 0.13, -0.76, -0.33), (sx * 0.15, -0.96, -0.31),
                      (sx * 0.14, -1.06, -0.27)], 4)
        hd.add(tube(hp, 0.022, 8), black)
    hd.add(gbox((0.05, -1.80, -0.08), (0.78, 0.14, 0.42), 0.03), yellow)        # saw box
    hd.add(gbox((0.05, -1.875, -0.08), (0.74, 0.02, 0.38)), frame)
    hd.add(gbox((0.52, -1.80, 0.02), (0.30, 0.010, 0.075), 0.003), steel)       # saw bar tip
    hd.add(cyl(0.075, 0.04, 20, axis="X").at(-0.17, -1.66, 0.10), steel)        # measuring wheel
    head = hd.build("Head", boom2, loc=(0, 0, L2))
    head.rotation_euler = (radians(-53), 0, 0)

    # ---------------- hydraulic cylinders (lookAt-able pairs) ----------------
    bpy.context.view_layer.update()

    def wpt(obj, p):
        return obj.matrix_world @ (C @ Vector(p))
    pairs = [("Cyl1", turret, (-0.72, 0.85, -0.04), boom1, (0, -0.30, 1.30), 0.085, 0.048),
             ("Cyl2", boom1, (0, 0.33, 1.60), boom2, tuple(lev), 0.075, 0.042)]
    for name, pa, pl, pb, pu, rb, rr in pairs:
        lo, hi = wpt(pa, pl), wpt(pb, pu)
        D = (hi - lo).length
        Lb, Lr = 0.62 * D + 0.05, 0.55 * D
        ba = Asm()
        ba.add(cyl(rb, Lb - 0.06, 18, axis="Z").at(0, 0, 0.06 + (Lb - 0.06) / 2), yellow)
        ba.add(cyl(rb + 0.012, 0.06, 18, axis="Z").at(0, 0, Lb - 0.03), frame)
        ba.add(cyl(0.065, 0.14, 16, axis="X"), frame)
        bo = ba.build(name + "_Barrel", pa)
        ro = Asm()
        ro.add(cyl(rr, Lr, 14, axis="Z").at(0, 0, Lr / 2), chrome)
        ro.add(cyl(0.058, 0.13, 16, axis="X"), frame)
        rodo = ro.build(name + "_Rod", pb)
        bpy.context.view_layer.update()
        place_between(bo, lo, hi)
        place_between(rodo, hi, lo)
    export([root], "harvester.glb")


# ==========================================================================
# 4. WEDGE
# ==========================================================================
def build_wedge():
    reset()
    orange = mat("WedgeOrange", "#ff6a10", 0.5)
    root = empty("Wedge")
    Lw = 0.20

    def th(x):
        t = 0.0155 * (1 - x / Lw) + 0.0008
        if 0.03 < x < 0.155:
            ph = ((x - 0.03) / 0.012) % 1.0
            t += 0.0011 * (ph / 0.8 if ph < 0.8 else (1 - ph) / 0.2)
        if x < 0.004:
            t -= 0.0025 * (1 - x / 0.004)
        return t

    def hw(x):
        w = 0.038 - 0.005 * (x / Lw)
        if x < 0.004:
            w -= 0.003 * (1 - x / 0.004)
        return w
    xs = sorted(set([0.0, 0.0015, 0.004, 0.008, 0.016, 0.024] + linspace(0.03, 0.156, 64) +
                    [0.165, 0.175, 0.185, 0.193, 0.198, 0.2]))
    secs = [se_ring(28, th(x), hw(x), 4.0, (x, 0, 0), Y_AX, Z_AX) for x in xs]
    A = Asm()
    A.add(loft(secs), orange, smooth=40)
    A.build("WedgeBody", root)
    export([root], "wedge.glb")


# ==========================================================================
# 5. CONIFER CROWN
# ==========================================================================
def normalize_crown(asms, rmax_target=None, width_target=None):
    vs = [v for a in asms for v in a.verts()]
    ymin = min(v.co.y for v in vs)
    ymax = max(v.co.y for v in vs)
    sy = 1.0 / (ymax - ymin)
    for v in vs:
        v.co.y = (v.co.y - ymin) * sy
    if rmax_target:
        r = max(sqrt(v.co.x ** 2 + v.co.z ** 2) for v in vs)
        s = rmax_target / r
    else:
        wx = max(v.co.x for v in vs) - min(v.co.x for v in vs)
        wz = max(v.co.z for v in vs) - min(v.co.z for v in vs)
        s = width_target / max(wx, wz)
    for v in vs:
        v.co.x *= s
        v.co.z *= s
    return ymin, sy, s


def build_conifer():
    reset()
    rnd = random.Random(7)
    fol = [mat("NeedlesDark", "#1c3528", 0.85), mat("NeedlesMid", "#25432f", 0.85),
           mat("NeedlesBlue", "#21393a", 0.85)]
    bark = mat("ConiferBranch", "#47392c", 0.9)
    root = empty("Crown")
    F, Bn = Asm(), Asm()
    up = Y_AX
    whorls = 19
    for wi in range(whorls):
        rel = wi / (whorls - 1)
        h = 0.07 + 0.87 * rel ** 1.05 + rnd.uniform(-0.012, 0.012)
        L = 0.24 * (1 - rel) ** 0.9 * rnd.uniform(0.85, 1.08) + 0.016
        nb = 5 if rel < 0.5 else (4 if rel < 0.8 else 3)
        az0 = wi * 2.39996
        a0 = radians(lerp(-4, 34, rel))
        droop = lerp(0.36, 0.08, rel)
        for bi in range(nb):
            az = az0 + 2 * pi * bi / nb + rnd.uniform(-0.45, 0.45)
            dh = Vector((cos(az), 0, sin(az)))
            Lb = L * rnd.uniform(0.8, 1.12)
            hb = h + rnd.uniform(-0.012, 0.012)
            pts = []
            for k in range(4):
                s = k / 3
                pts.append(Vector((0, hb, 0)) + dh * (s * Lb) +
                           up * (s * Lb * math.tan(a0) - droop * Lb * s * s + 0.12 * Lb * s ** 4))
            Bn.add(tube(pts, lambda t, rel=rel: 0.0032 * (1 - 0.8 * t) * (1 - 0.5 * rel) + 0.0006, 3),
                   bark, smooth=60)
            nC = max(1, int(round(Lb / 0.057)))
            spine = catmull(pts, 6)
            for c in range(nC):
                s = lerp(0.36, 1.0, (c + 0.5) / nC) + rnd.uniform(-0.05, 0.05)
                s = min(max(s, 0.25), 1.0)
                idx = min(int(s * (len(spine) - 1)), len(spine) - 2)
                tan = (spine[idx + 1] - spine[idx]).normalized()
                a = lerp(0.026, 0.056, min(1.0, Lb / 0.22)) * rnd.uniform(0.85, 1.2)
                if s > 0.92:
                    a *= 0.8
                Xa = tan
                Za = Xa.cross(up).normalized()
                Ya = Za.cross(Xa)
                ctr = spine[idx] + Ya * (rnd.uniform(-0.35, 0.05) * a) + Za * (rnd.uniform(-0.3, 0.3) * a)
                seed = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
                blob = uvsphere(9, 3, 1.0)       # flat, jagged-rimmed needle spray

                def shape(v, seed=seed):
                    ang = atan2(v.z, v.x)
                    j = 1 + 0.34 * noise.noise(Vector((cos(ang) * 1.7, sin(ang) * 1.7, 0)) + seed)                         + 0.16 * cos(9 * ang + seed.x)
                    v = Vector((v.x * j, v.y * (0.8 + 0.4 * noise.noise(v * 3 + seed)), v.z * j))
                    v.y -= 0.55 * v.z * v.z + 0.45 * max(0.0, v.x) ** 2   # drape sides / tip
                    return v
                blob.fn(shape)
                blob.scale(a * 1.4, a * 0.40, a * 1.1)
                blob.rot("X", rnd.uniform(-22, 22)).rot("Y", rnd.uniform(-20, 20))
                M = Matrix(((Xa.x, Ya.x, Za.x, ctr.x), (Xa.y, Ya.y, Za.y, ctr.y),
                            (Xa.z, Ya.z, Za.z, ctr.z), (0, 0, 0, 1)))
                blob.tf(M)
                F.add(blob, rnd.choice(fol), smooth=80)
    # top spire foliage
    for i, (yy, a) in enumerate(((0.955, 0.030), (0.985, 0.022), (1.01, 0.014))):
        blob = uvsphere(6, 4, 1.0).scale(a * 0.8, a * 1.6, a * 0.8).at(0, yy, 0)
        F.add(blob, fol[i % 3], smooth=80)
    # dark interior fill so the crown isn't see-through
    for yy, r in ((0.18, 0.11), (0.36, 0.09), (0.54, 0.065), (0.72, 0.045)):
        F.add(icosphere(2, 1.0).scale(r, r * 1.3, r).at(0, yy, 0), fol[0], smooth=80)
    normalize_crown([F, Bn], rmax_target=0.22)
    leader = [Vector((0, y, 0)) for y in linspace(0.0, 0.995, 9)]
    Bn.add(tube(leader, lambda t: 0.0055 * (1 - t) + 0.0007, 5), bark, smooth=60)
    F.build("Crown_Foliage", root)
    Bn.build("Crown_Branches", root)
    export([root], "crown_conifer.glb")


# ==========================================================================
# 6. BROADLEAF CROWN
# ==========================================================================
def leaf_clump(sub, r, seed, flat=0.82):
    p = icosphere(sub, 1.0)

    def shape(v):
        n = v.normalized()
        d = 1 + 0.30 * fbm(n * 1.8, 3, seed) + 0.13 * noise.noise(n * 6.5 + seed)
        if n.y < -0.2:
            d *= 1 - 0.25 * (-n.y - 0.2)
        return Vector((n.x * d, n.y * d * flat, n.z * d))
    p.fn(shape)
    return p.scale(r, r, r)


def build_broadleaf():
    reset()
    rnd = random.Random(11)
    leaves = [mat("LeavesA", "#3e6a2a", 0.8), mat("LeavesB", "#4d7a30", 0.8),
              mat("LeavesC", "#355a26", 0.8)]
    leaves_dark = mat("LeavesShade", "#263f1c", 0.85)
    bark = mat("OakBark", "#4b3b2d", 0.9)
    root = empty("Crown")
    F, Bn = Asm(), Asm()
    EC, ER = Vector((0, 0.60, 0)), Vector((0.37, 0.40, 0.37))
    # main limbs
    limbs = []
    nmain = 5
    for i in range(nmain):
        az = 2 * pi * i / nmain + rnd.uniform(-0.35, 0.35)
        el = radians(rnd.uniform(46, 66))
        L = rnd.uniform(0.33, 0.42)
        d = Vector((cos(el) * cos(az), sin(el), cos(el) * sin(az)))
        side = Vector((-sin(az), 0, cos(az))) * rnd.uniform(-0.04, 0.04)
        ctrl = [Vector((0, 0, 0)), Vector((0, 0.07, 0)) + d * 0.02,
                d * (L * 0.5) + Vector((0, 0.06, 0)) + side, d * L]
        path = catmull(ctrl, 4)
        limbs.append(path)
        Bn.add(tube(path, lambda t: lerp(0.034, 0.014, t), 7), bark, smooth=60)
    lead = catmull([(0, 0, 0), (0.01, 0.25, 0.0), (-0.02, 0.45, 0.02), (0.01, 0.62, -0.01)], 4)
    limbs.append(lead)
    Bn.add(tube(lead, lambda t: lerp(0.032, 0.010, t), 7), bark, smooth=60)
    # leaf-mass targets on an irregular dome
    targets = []
    tries = 0
    while len(targets) < 14 and tries < 4000:
        tries += 1
        th = radians(rnd.uniform(0, 112))
        ph = rnd.uniform(0, 2 * pi)
        n = Vector((sin(th) * cos(ph), cos(th), sin(th) * sin(ph)))
        k = rnd.uniform(0.70, 0.88)
        p = EC + Vector((n.x * ER.x, n.y * ER.y, n.z * ER.z)) * k
        if all((p - q).length > 0.19 for q in targets):
            targets.append(p)
    for p in targets:
        best = min(limbs, key=lambda L: (L[-1] - p).length)
        start = best[int(len(best) * rnd.uniform(0.6, 0.9))]
        end = p - (p - EC).normalized() * 0.06
        mid = start.lerp(end, 0.5) + Vector((0, 0.05, 0))
        path = catmull([start, mid, end], 3)
        Bn.add(tube(path, lambda t: lerp(0.012, 0.004, t), 5), bark, smooth=60)
        for _ in range(2):
            tw_end = end + Vector((rnd.uniform(-0.08, 0.08), rnd.uniform(0.0, 0.07), rnd.uniform(-0.08, 0.08)))
            Bn.add(tube([end, end.lerp(tw_end, 0.5) + Vector((0, 0.01, 0)), tw_end], lambda t: lerp(0.004, 0.0015, t), 4),
                   bark, smooth=60)
        seed = Vector((rnd.uniform(0, 99), rnd.uniform(0, 99), rnd.uniform(0, 99)))
        F.add(leaf_clump(3, rnd.uniform(0.12, 0.165), seed).at(p), rnd.choice(leaves), smooth=70)
    # smaller filler masses
    fills = 0
    tries = 0
    while fills < 20 and tries < 4000:
        tries += 1
        th = radians(rnd.uniform(10, 118))
        ph = rnd.uniform(0, 2 * pi)
        n = Vector((sin(th) * cos(ph), cos(th), sin(th) * sin(ph)))
        p = EC + Vector((n.x * ER.x, n.y * ER.y, n.z * ER.z)) * rnd.uniform(0.82, 1.0)
        if all((p - q).length > 0.11 for q in targets):
            seed = Vector((rnd.uniform(0, 99), rnd.uniform(0, 99), rnd.uniform(0, 99)))
            F.add(leaf_clump(2, rnd.uniform(0.07, 0.10), seed).at(p), rnd.choice(leaves), smooth=70)
            fills += 1
    F.add(leaf_clump(3, 0.26, Vector((5, 5, 5)), 0.9).at(EC + Vector((0, 0.02, 0))), leaves_dark, smooth=70)
    normalize_crown([F, Bn], width_target=0.75)
    F.build("Crown_Foliage", root)
    Bn.build("Crown_Branches", root)
    export([root], "crown_broadleaf.glb")


# ==========================================================================
# 7. ROCKS
# ==========================================================================
def build_rocks():
    reset()
    g_light = mat("GraniteLight", "#8c8883", 0.85)
    g_dark = mat("GraniteDark", "#75716c", 0.9)
    lichen = mat("Lichen", "#9d9c8a", 0.9)
    moss = mat("Moss", "#536b2c", 0.95)
    moss2 = mat("MossDark", "#3a5320", 0.95)
    specs = [  # seed, dims (x, y-height, z), facet count
        (3, (1.10, 0.78, 0.95), 4),
        (8, (0.88, 0.98, 0.82), 6),
        (21, (1.20, 0.55, 0.92), 3),
    ]
    roots = []
    for i, (seed, dims, nf) in enumerate(specs):
        rnd = random.Random(seed)
        off = Vector((rnd.uniform(0, 90), rnd.uniform(0, 90), rnd.uniform(0, 90)))
        planes = []
        for _ in range(nf):
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.3, 1), rnd.uniform(-1, 1))).normalized()
            planes.append((n, rnd.uniform(0.72, 0.86)))
        p = icosphere(5, 1.0)

        def shape(v):
            n = v.normalized()
            r = 1 + 0.20 * fbm(n * 1.1, 4, off) + 0.05 * fbm(n * 3.7, 3, off * 2) + \
                0.012 * noise.noise(n * 14 + off)
            q = n * r
            for pn, d in planes:
                k = q.dot(pn)
                if k > d:
                    q -= pn * (k - d) * 0.88
            return Vector((q.x * dims[0] / 2, q.y * dims[1] / 2, q.z * dims[2] / 2))
        p.fn(shape)
        vs = p.bm.verts
        ymin = min(v.co.y for v in vs)
        ymax = max(v.co.y for v in vs)
        ycut = ymin + 0.16 * (ymax - ymin)
        for v in vs:
            if v.co.y < ycut:
                v.co.y = ycut + (v.co.y - ycut) * 0.08
        cx = (max(v.co.x for v in vs) + min(v.co.x for v in vs)) / 2
        cz = (max(v.co.z for v in vs) + min(v.co.z for v in vs)) / 2
        ybase = min(v.co.y for v in vs)
        p.at(-cx, -ybase, -cz)
        bmesh.ops.recalc_face_normals(p.bm, faces=p.bm.faces[:])
        H = ymax - ybase

        def rmat(f, off=off, H=H):
            c = f.calc_center_median()
            n = f.normal
            m = fbm(c * 2.4, 3, off)
            if n.y > 0.42 - 0.25 * m and c.y > 0.35 * H and m > -0.15:
                return moss if noise.noise(c * 7 + off) > -0.2 else moss2
            if noise.noise(c * 9 + off * 3) > 0.62:
                return lichen
            return g_dark if fbm(c * 3.3, 2, off * 1.7) > 0.12 else g_light
        A = Asm()
        A.add(p, rmat, smooth=70, recalc=False)
        roots.append(A.build("Rock_%d" % i, None, loc=(-1.6 + 1.6 * i, 0, 0)))
    export(roots, "rock.glb")


# ==========================================================================
if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    builders = {
        "axe": build_axe, "chainsaw": build_chainsaw, "harvester": build_harvester,
        "wedge": build_wedge, "crown_conifer": build_conifer,
        "crown_broadleaf": build_broadleaf, "rock": build_rocks,
    }
    for name, fn in builders.items():
        if argv and name not in argv:
            continue
        fn()
    print("BUILD DONE")
