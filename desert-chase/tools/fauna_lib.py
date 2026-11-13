# Shared helpers for the photoreal roadrunner + coyote builds (Blender 5.1, run headless).
#
# Bodies are signed distance fields (ellipsoids + round cones, smooth unions/subtractions) evaluated on a numpy
# voxel grid and meshed with surface nets. Fur and feathers are generated in numpy from the same anatomical
# primitives (each primitive carries a tag and a flow direction), so colour, length and flow follow the anatomy.

import bpy, bmesh, math, os, sys, time
import numpy as np
from mathutils import Vector, Matrix, Euler

T0 = time.time()
def log(*a):
    print("[fauna %6.1fs]" % (time.time() - T0), *a, flush=True)

PI = math.pi
def rad(d): return d * PI / 180.0

# ------------------------------------------------------------------------------------------------ colour
def to_lin(c):
    c = np.asarray(c, np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def hexc(h):
    h = h.lstrip('#')
    return to_lin(np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]))

# ------------------------------------------------------------------------------------------------ math
def unit(v):
    v = np.asarray(v, np.float64)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)

def rotm(rx=0.0, ry=0.0, rz=0.0):
    return np.array(Euler((rad(rx), rad(ry), rad(rz)), 'XYZ').to_matrix())

def basis(fwd, up=(0, 0, 1)):
    """Orthonormal frame: columns (forward, left, up)."""
    f = unit(fwd)
    u = np.asarray(up, float) - f * np.dot(up, f)
    u = unit(u)
    l = np.cross(u, f)
    return np.stack([f, l, u], 1)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def lerp(a, b, t):
    t = np.asarray(t)
    if np.ndim(a) and t.ndim == 1 and np.ndim(a) > 1:
        t = t[:, None]
    return a + (b - a) * t

# ------------------------------------------------------------------------------------------------ SDF primitives
class Prim:
    def __init__(self, tag=None, **meta):
        self.tag = tag
        self.meta = meta

class Ell(Prim):
    def __init__(self, c, r, R=None, tag=None, **meta):
        super().__init__(tag, **meta)
        self.c = np.asarray(c, np.float64)
        self.r = np.asarray(r, np.float64)
        self.R = np.eye(3) if R is None else np.asarray(R, np.float64)

    def bbox(self):
        M = self.R * self.r[None, :]
        h = np.sqrt((M ** 2).sum(axis=1))
        return self.c - h, self.c + h

    def dist(self, P):
        q = (P - self.c) @ self.R
        k0 = np.linalg.norm(q / self.r, axis=-1)
        k1 = np.linalg.norm(q / (self.r ** 2), axis=-1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

    def axis(self):
        return self.R[:, 0]

class Cone(Prim):
    """Round cone from a (radius ra) to b (radius rb); optional squash `scale` in world axes about a."""
    def __init__(self, a, b, ra, rb, tag=None, scale=None, **meta):
        super().__init__(tag, **meta)
        self.a = np.asarray(a, np.float64)
        self.b = np.asarray(b, np.float64)
        self.ra, self.rb = float(ra), float(rb)
        self.scale = None if scale is None else np.asarray(scale, np.float64)

    def bbox(self):
        r = max(self.ra, self.rb)
        lo = np.minimum(self.a, self.b) - r
        hi = np.maximum(self.a, self.b) + r
        if self.scale is not None:
            lo = self.a + (lo - self.a) * self.scale
            hi = self.a + (hi - self.a) * self.scale
            lo, hi = np.minimum(lo, hi), np.maximum(lo, hi)
        return lo, hi

    def axis(self):
        return unit(self.b - self.a)

    def param(self, P):
        ba = self.b - self.a
        return np.clip(((P - self.a) @ ba) / np.dot(ba, ba), 0.0, 1.0)

    def dist(self, P):
        s = 1.0
        if self.scale is not None:
            P = self.a + (P - self.a) / self.scale
            s = float(self.scale.min())
        a, b, r1, r2 = self.a, self.b, self.ra, self.rb
        ba = b - a
        l2 = float(np.dot(ba, ba))
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = P - a
        y = pa @ ba
        z = y - l2
        xv = pa * l2 - y[..., None] * ba
        x2 = (xv * xv).sum(-1)
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
        d1 = np.sqrt(x2 + z2) * il2 - r2
        d2 = np.sqrt(x2 + y2) * il2 - r1
        d = np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))
        return d * s

class Isect(Prim):
    """Intersection of primitives (e.g. two offset ellipsoids make a lens: an almond eye opening)."""
    def __init__(self, prims, tag=None, **meta):
        super().__init__(tag, **meta)
        self.prims = prims

    def bbox(self):
        b = [p.bbox() for p in self.prims]
        return np.max([x[0] for x in b], 0), np.min([x[1] for x in b], 0)

    def dist(self, P):
        return np.max(np.stack([p.dist(P) for p in self.prims]), 0)

def almond(centre, long_ax, short_ax, depth_ax, half_w, half_h, depth):
    """Lens-shaped cutter: pointed corners along long_ax, half sizes half_w x half_h, extruded `depth` along depth_ax."""
    R = (half_w ** 2 + half_h ** 2) / (2 * half_h)
    o = R - half_h
    M = np.stack([long_ax, short_ax, depth_ax], 1)
    return Isect([Ell(centre + short_ax * o, (R, R, depth), M), Ell(centre - short_ax * o, (R, R, depth), M)])

def chain(pts, radii, tag, scale=None, **meta):
    out = []
    n = len(pts)
    seg = [np.linalg.norm(np.subtract(pts[i + 1], pts[i])) for i in range(n - 1)]
    tot = sum(seg)
    acc = 0.0
    for i in range(n - 1):
        c = Cone(pts[i], pts[i + 1], radii[i], radii[i + 1], tag, scale=scale, **meta)
        c.meta['u0'] = acc / tot
        c.meta['u1'] = (acc + seg[i]) / tot
        acc += seg[i]
        out.append(c)
    return out

def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)

def ssub(a, b, k):
    """Remove b from a."""
    if k <= 0:
        return np.maximum(a, -b)
    h = np.clip(0.5 - 0.5 * (a + b) / k, 0.0, 1.0)
    return a * (1 - h) + (-b) * h + k * h * (1 - h)

class SDF:
    def __init__(self, lo, hi, voxel, band=0.0):
        self.lo = np.asarray(lo, np.float64)
        self.vox = float(voxel)
        self.band = float(band)        # evaluate this far outside each primitive so far-field queries are real distances
        self.n = (np.ceil((np.asarray(hi) - self.lo) / voxel)).astype(int) + 1
        self.D = np.full(tuple(self.n), 0.25, np.float32)
        self.items = []
        log("SDF grid", tuple(self.n), "voxels", int(np.prod(self.n)))

    def add(self, prims, k=0.0, sub=False):
        if isinstance(prims, Prim):
            prims = [prims]
        for p in prims:
            self.items.append((p, k, sub))
            b0, b1 = p.bbox()
            m = max(k + 3 * self.vox, self.band)
            i0 = np.maximum(np.floor((b0 - m - self.lo) / self.vox).astype(int), 0)
            i1 = np.minimum(np.ceil((b1 + m - self.lo) / self.vox).astype(int) + 1, self.n)
            if np.any(i1 <= i0):
                continue
            ax = [self.lo[a] + np.arange(i0[a], i1[a]) * self.vox for a in range(3)]
            X, Y, Z = np.meshgrid(*ax, indexing='ij')
            d = p.dist(np.stack([X, Y, Z], -1)).astype(np.float32)
            sl = tuple(slice(i0[a], i1[a]) for a in range(3))
            self.D[sl] = ssub(self.D[sl], d, k) if sub else smin(self.D[sl], d, k)
        return self

    def group(self, prims, k=0.0, inner=0.0):
        """Union prims among themselves with blend `inner` first, then blend the group into the field with `k`."""
        b0 = np.min([p.bbox()[0] for p in prims], 0)
        b1 = np.max([p.bbox()[1] for p in prims], 0)
        m = max(k + inner + 3 * self.vox, self.band)
        i0 = np.maximum(np.floor((b0 - m - self.lo) / self.vox).astype(int), 0)
        i1 = np.minimum(np.ceil((b1 + m - self.lo) / self.vox).astype(int) + 1, self.n)
        ax = [self.lo[a] + np.arange(i0[a], i1[a]) * self.vox for a in range(3)]
        X, Y, Z = np.meshgrid(*ax, indexing='ij')
        G = np.stack([X, Y, Z], -1)
        d = None
        for p in prims:
            self.items.append((p, k, False))
            dp = p.dist(G).astype(np.float32)
            d = dp if d is None else smin(d, dp, inner)
        sl = tuple(slice(i0[a], i1[a]) for a in range(3))
        self.D[sl] = smin(self.D[sl], d, k)
        return self

    def sample(self, P):
        """Trilinear sample of the grid at world points P (..., 3)."""
        g = (np.asarray(P) - self.lo) / self.vox
        g = np.clip(g, 0, self.n - 1.001)
        i = np.floor(g).astype(int)
        f = g - i
        D = self.D
        out = 0.0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                    out = out + w * D[i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz]
        return out

    def grad(self, P):
        h = self.vox
        g = np.stack([self.sample(P + np.array(e) * h) - self.sample(P - np.array(e) * h)
                      for e in ((1, 0, 0), (0, 1, 0), (0, 0, 1))], -1)
        return unit(g)

    def conform(self, X, H, iters=3):
        """Move points X onto the iso-surface at height H (metres above the surface)."""
        for _ in range(iters):
            d = self.sample(X)
            step = np.clip(d - H, -0.006, 0.006)
            X = X - self.grad(X) * step[..., None]
        return X

    def raycast(self, origin, direction, tmax=0.2, steps=400):
        """First zero crossing walking from origin (inside) outward."""
        o = np.asarray(origin, float)
        d = unit(direction)
        ts = np.linspace(0, tmax, steps)
        vals = self.sample(o[None, :] + ts[:, None] * d[None, :])
        for i in range(1, steps):
            if vals[i - 1] < 0 <= vals[i]:
                t = ts[i - 1] + (ts[i] - ts[i - 1]) * (-vals[i - 1]) / (vals[i] - vals[i - 1])
                return o + d * t
        return o + d * tmax

    def mesh(self, name, smooth_iter=3, smooth_fac=0.5):
        V, F = surface_nets(self.D, self.lo, self.vox)
        ob = mesh_object(name, V, F)
        if smooth_iter:
            m = ob.modifiers.new('smooth', 'SMOOTH')
            m.factor = smooth_fac
            m.iterations = smooth_iter
            apply_mods(ob)
        log("mesh", name, len(ob.data.vertices), "verts")
        return ob

# ------------------------------------------------------------------------------------------------ surface nets
def surface_nets(D, lo, vox):
    s = D < 0
    nx, ny, nz = D.shape
    offs = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
    anyin = None
    allin = None
    for o in offs:
        c = s[o[0]:nx - 1 + o[0], o[1]:ny - 1 + o[1], o[2]:nz - 1 + o[2]]
        anyin = c.copy() if anyin is None else (anyin | c)
        allin = c.copy() if allin is None else (allin & c)
    act = anyin & ~allin
    del anyin, allin
    ci = np.argwhere(act)
    del act
    vals = np.stack([D[ci[:, 0] + o[0], ci[:, 1] + o[1], ci[:, 2] + o[2]] for o in offs], 1).astype(np.float64)
    offa = np.array(offs, np.float64)
    edges = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    acc = np.zeros((len(ci), 3))
    cnt = np.zeros(len(ci))
    for a, b in edges:
        va, vb = vals[:, a], vals[:, b]
        m = (va < 0) != (vb < 0)
        t = np.where(m, va / np.where(m, va - vb, 1.0), 0.0)
        p = offa[a][None, :] + t[:, None] * (offa[b] - offa[a])[None, :]
        acc[m] += p[m]
        cnt[m] += 1
    V = lo + (ci + acc / np.maximum(cnt, 1)[:, None]) * vox
    shp = (nx - 1, ny - 1, nz - 1)
    lin = np.ravel_multi_index(ci.T, shp)

    def vid(i, j, k):
        return np.searchsorted(lin, np.ravel_multi_index((i, j, k), shp))

    faces = []
    ex = s[:-1, 1:-1, 1:-1] != s[1:, 1:-1, 1:-1]
    i, j, k = np.nonzero(ex); j = j + 1; k = k + 1
    q = np.stack([vid(i, j - 1, k - 1), vid(i, j, k - 1), vid(i, j, k), vid(i, j - 1, k)], 1)
    flip = ~s[i, j, k]
    q[flip] = q[flip][:, ::-1]
    faces.append(q)
    ey = s[1:-1, :-1, 1:-1] != s[1:-1, 1:, 1:-1]
    i, j, k = np.nonzero(ey); i = i + 1; k = k + 1
    q = np.stack([vid(i - 1, j, k - 1), vid(i - 1, j, k), vid(i, j, k), vid(i, j, k - 1)], 1)
    flip = ~s[i, j, k]
    q[flip] = q[flip][:, ::-1]
    faces.append(q)
    ez = s[1:-1, 1:-1, :-1] != s[1:-1, 1:-1, 1:]
    i, j, k = np.nonzero(ez); i = i + 1; j = j + 1
    q = np.stack([vid(i - 1, j - 1, k), vid(i, j - 1, k), vid(i, j, k), vid(i - 1, j, k)], 1)
    flip = ~s[i, j, k]
    q[flip] = q[flip][:, ::-1]
    faces.append(q)
    return V, np.concatenate(faces, 0)

# ------------------------------------------------------------------------------------------------ blender objects
def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.hair_curves, bpy.data.cameras, bpy.data.lights,
                 bpy.data.images, bpy.data.node_groups, bpy.data.textures, bpy.data.curves, bpy.data.worlds):
        for d in list(coll):
            coll.remove(d)

def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob

def collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c

def mesh_object(name, V, F, coll=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', np.asarray(V, np.float32).ravel())
    F = np.asarray(F, np.int32)
    me.loops.add(F.size)
    me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F))
    me.polygons.foreach_set('loop_start', (np.arange(len(F)) * F.shape[1]).astype(np.int32))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    if smooth:
        me.shade_smooth()
    return link(bpy.data.objects.new(name, me), coll)

def bm_object(name, bm, coll=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    return link(bpy.data.objects.new(name, me), coll)

def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob

def mesh_arrays(ob):
    me = ob.data
    me.calc_loop_triangles()
    V = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', V)
    N = np.empty(len(me.vertices) * 3, np.float32)
    me.vertex_normals.foreach_get('vector', N)
    T = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', T)
    M = np.array(ob.matrix_world)
    V = V.reshape(-1, 3).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
    N = unit(N.reshape(-1, 3).astype(np.float64) @ M[:3, :3].T)
    return V, N, T.reshape(-1, 3)

def sample_surface(V, N, T, count, rng):
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cdf = np.cumsum(area)
    tri = np.minimum(np.searchsorted(cdf, rng.random(count) * cdf[-1]), len(T) - 1)
    u = rng.random(count)
    v = rng.random(count)
    fl = u + v > 1
    u[fl] = 1 - u[fl]
    v[fl] = 1 - v[fl]
    w = 1 - u - v
    t = T[tri]
    P = V[t[:, 0]] * w[:, None] + V[t[:, 1]] * u[:, None] + V[t[:, 2]] * v[:, None]
    Nn = unit(N[t[:, 0]] * w[:, None] + N[t[:, 1]] * u[:, None] + N[t[:, 2]] * v[:, None])
    return P, Nn, float(cdf[-1])

def set_point_color(ob, name, cols):
    me = ob.data
    at = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    c4 = np.ones((len(me.vertices), 4), np.float32)
    c4[:, :3] = cols
    at.data.foreach_set('color', c4.ravel())

def set_point_float(ob, name, vals):
    me = ob.data
    at = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'POINT')
    at.data.foreach_set('value', np.asarray(vals, np.float32))

# ------------------------------------------------------------------------------------------------ anatomy fields
def tag_fields(prims, P, sigma=0.008, chunk=400000):
    """For points P: per-tag soft weight, per-tag flow (from nearest prim in that tag), per-tag chain param."""
    tags = sorted({p.tag for p in prims if p.tag})
    n = len(P)
    dmin = {t: np.full(n, 1e9) for t in tags}
    flow = {t: np.zeros((n, 3)) for t in tags}
    par = {t: np.zeros(n) for t in tags}
    for p in prims:
        if not p.tag:
            continue
        t = p.tag
        for s in range(0, n, chunk):
            Q = P[s:s + chunk]
            d = p.dist(Q)
            better = d < dmin[t][s:s + chunk]
            if not better.any():
                continue
            dmin[t][s:s + chunk][better] = d[better]
            fl = p.meta.get('flow', 'axis')
            if isinstance(fl, str):
                f = p.axis() * (-1 if fl == '-axis' else 1)
                fv = np.broadcast_to(f, Q.shape)
            elif callable(fl):
                fv = fl(Q)
            else:
                fv = np.broadcast_to(np.asarray(fl, float), Q.shape)
            flow[t][s:s + chunk][better] = fv[better]
            if isinstance(p, Cone):
                u0, u1 = p.meta.get('u0', 0.0), p.meta.get('u1', 1.0)
                par[t][s:s + chunk][better] = (u0 + (u1 - u0) * p.param(Q))[better]
    dall = np.min(np.stack([dmin[t] for t in tags]), 0)
    w = {t: np.exp(-np.maximum(dmin[t] - dall, 0) / sigma) for t in tags}
    tot = sum(w.values())
    for t in tags:
        w[t] = w[t] / tot
    return w, flow, par

# ------------------------------------------------------------------------------------------------ strands
def grow_strands(P, Nn, F, L, lift, K, rng, droop=0.5, gravity=0.0, spread=0.15, jitter=0.0, wave=0.0,
                 wave_freq=2.0, clump=0.0, clump_size=0.01, embed=0.0004, lift_jit=0.15, exit_lift=0.7,
                 floor=0.0004, floor_slope=0.06):
    """Hairs leave the skin steeply (exit_lift), bend over to `lift` and droop toward the tip; afterwards every
    point is kept above the root's tangent plane by floor + floor_slope * t * L so short fur never sinks."""
    n = len(P)
    T = F - (F * Nn).sum(1, keepdims=True) * Nn
    bad = np.linalg.norm(T, axis=1) < 1e-6
    if bad.any():
        alt = np.cross(Nn[bad], np.array([0, 1.0, 0]))
        T[bad] = alt
    T = unit(T)
    B = np.cross(Nn, T)
    ang = rng.normal(0, 1, n) * spread
    T = unit(T * np.cos(ang)[:, None] + B * np.sin(ang)[:, None])
    B = np.cross(Nn, T)
    lf = np.asarray(lift, float) * (1 + rng.normal(0, lift_jit, n))
    L = np.asarray(L, float)
    pts = np.zeros((n, K, 3))
    pts[:, 0] = P - Nn * embed
    seg = (L + embed) / (K - 1)
    ph = rng.random(n) * 2 * PI
    for k in range(1, K):
        tk = (k - 0.5) / (K - 1)
        l = lf * (1 - droop * tk)
        ex = 1.0 - smoothstep(0.0, 0.3, tk)
        l = l * (1 - ex) + np.maximum(exit_lift, l) * ex
        d = np.cos(l)[:, None] * T + np.sin(l)[:, None] * Nn
        if gravity:
            d[:, 2] -= gravity * tk
        if wave:
            a = ph + tk * wave_freq * 2 * PI
            d = d + wave * (np.sin(a)[:, None] * B + np.cos(a)[:, None] * Nn * 0.5)
        d = unit(d)
        pts[:, k] = pts[:, k - 1] + d * seg[:, None]
    tks = np.linspace(0, 1, K)
    if jitter:
        pts += rng.normal(0, 1, (n, K, 3)) * (jitter * L)[:, None, None] * (tks ** 1.5)[None, :, None]
    if np.any(np.asarray(clump) > 0):
        cid = voronoi_cells(P, clump_size, rng)
        cnt = np.bincount(cid).astype(float)
        rel = pts - pts[:, :1]
        mroot = np.stack([np.bincount(cid, P[:, a]) / cnt for a in range(3)], 1)
        cs = np.broadcast_to(np.asarray(clump, float), (n,)) * (0.4 + 1.2 * rng.random(len(cnt)))[cid]
        for k in range(1, K):
            mk = np.stack([np.bincount(cid, rel[:, k, a]) / cnt for a in range(3)], 1)
            target = mroot[cid] + mk[cid]
            w = np.clip(cs * tks[k] ** 1.3, 0, 0.95)
            pts[:, k] = pts[:, k] + (target - pts[:, k]) * w[:, None]
    if floor is not None:
        for k in range(1, K):
            h = ((pts[:, k] - P) * Nn).sum(1)
            hmin = floor + floor_slope * tks[k] * L
            low = h < hmin
            pts[low, k] += Nn[low] * (hmin[low] - h[low])[:, None]
    return pts

def voronoi_cells(P, size, rng, chunk=300000):
    """Irregular clump ids: nearest jittered seed (one per grid cell of `size`, searched over the 27 neighbours)."""
    salt = rng.integers(1, 2 ** 30)
    def seed(c):
        h = (c[..., 0] * 73856093) ^ (c[..., 1] * 19349663) ^ (c[..., 2] * 83492791) ^ salt
        h = (h * 2654435761) & 0xFFFFFFFF
        r = np.stack([(h & 1023) / 1023.0, ((h >> 10) & 1023) / 1023.0, ((h >> 20) & 1023) / 1023.0], -1)
        return (c + 0.1 + 0.8 * r) * size
    out = np.empty(len(P), np.int64)
    offs = np.array([(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1)], np.int64)
    for s in range(0, len(P), chunk):
        Q = P[s:s + chunk]
        base = np.floor(Q / size).astype(np.int64)
        cand = base[:, None, :] + offs[None, :, :]
        d = ((seed(cand) - Q[:, None, :]) ** 2).sum(-1)
        best = cand[np.arange(len(Q)), np.argmin(d, 1)]
        out[s:s + chunk] = (best[:, 0] * 1000003 + best[:, 1]) * 1000033 + best[:, 2]
    _, cid = np.unique(out, return_inverse=True)
    return cid

def strand_radius(n, K, r_root, r_tip=0.000006, power=0.8):
    """Stays thick most of the way and tapers over the last third, like a real guard hair."""
    t = np.linspace(0, 1, K)
    r_root = np.broadcast_to(np.asarray(r_root, float), (n,))
    return r_root[:, None] * (1 - t[None, :] ** 2.2) ** power + r_tip

def make_curves(name, pts, radius, cattrs=None, mat=None, coll=None):
    n, K, _ = pts.shape
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([K] * n)
    cv.position_data.foreach_set('vector', pts.astype(np.float32).ravel())
    ra = cv.attributes.get('radius') or cv.attributes.new('radius', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', radius.astype(np.float32).ravel())
    for nm, arr in (cattrs or {}).items():
        arr = np.asarray(arr, np.float32)
        if arr.ndim == 1:
            at = cv.attributes.new(nm, 'FLOAT', 'CURVE')
            at.data.foreach_set('value', arr)
        else:
            a4 = np.ones((n, 4), np.float32)
            a4[:, :arr.shape[1]] = arr
            at = cv.attributes.new(nm, 'FLOAT_COLOR', 'CURVE')
            at.data.foreach_set('color', a4.ravel())
    if mat:
        cv.materials.append(mat)
    ob = bpy.data.objects.new(name, cv)
    link(ob, coll)
    log("curves", name, n, "strands")
    return ob

# ------------------------------------------------------------------------------------------------ node helpers
class NT:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def n(self, kind, **props):
        nd = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        nd.location = (self.x, 0)
        self.x += 180
        return nd

    def l(self, a, b):
        self.nt.links.new(a, b)

    def attr(self, name, kind='GEOMETRY'):
        return self.n('ShaderNodeAttribute', attribute_name=name, attribute_type=kind)

def sock(coll, name, typ=None):
    for s in coll:
        if s.name == name and (typ is None or s.type == typ) and getattr(s, 'enabled', True):
            return s
    for s in coll:
        if s.name == name:
            return s
    raise KeyError(name)

def mix_col(t, fac, a, b):
    m = t.n('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
    _in(t, sock(m.inputs, 'Factor', 'VALUE'), fac)
    _in(t, sock(m.inputs, 'A', 'RGBA'), a)
    _in(t, sock(m.inputs, 'B', 'RGBA'), b)
    return sock(m.outputs, 'Result', 'RGBA')

def math_node(t, op, a, b=None, clamp=False):
    m = t.n('ShaderNodeMath', operation=op, use_clamp=clamp)
    _in(t, m.inputs[0], a)
    if b is not None:
        _in(t, m.inputs[1], b)
    return m.outputs[0]

def map_range(t, x, a, b, c=0.0, d=1.0, interp='SMOOTHSTEP'):
    m = t.n('ShaderNodeMapRange', interpolation_type=interp)
    _in(t, m.inputs['Value'], x)
    _in(t, m.inputs['From Min'], a)
    _in(t, m.inputs['From Max'], b)
    _in(t, m.inputs['To Min'], c)
    _in(t, m.inputs['To Max'], d)
    return m.outputs['Result']

def _in(t, s, v):
    if hasattr(v, 'is_output'):
        t.l(v, s)
    elif isinstance(v, (tuple, list, np.ndarray)):
        v = list(v)
        if len(v) == 3 and s.type == 'RGBA':
            v = v + [1.0]
        s.default_value = v
    else:
        s.default_value = v

# ------------------------------------------------------------------------------------------------ materials
def mat_hair(name, rough=0.32, radial=0.35, coat=0.15, rand_rough=0.15, model='CHIANG'):
    """Banded fur: per-strand attributes c_base/c_band/c_tip and c_bp (band start, tip start, tip amount)."""
    m = bpy.data.materials.new(name)
    t = NT(m)
    info = t.n('ShaderNodeHairInfo')
    icpt = info.outputs['Intercept']
    base = t.attr('c_base').outputs['Color']
    band = t.attr('c_band').outputs['Color']
    tip = t.attr('c_tip').outputs['Color']
    bp = t.n('ShaderNodeSeparateColor')
    t.l(t.attr('c_bp').outputs['Color'], bp.inputs['Color'])
    bs, ts, ta = bp.outputs[0], bp.outputs[1], bp.outputs[2]
    f1 = map_range(t, icpt, math_node(t, 'SUBTRACT', bs, 0.07), math_node(t, 'ADD', bs, 0.07))
    c1 = mix_col(t, f1, base, band)
    f2 = math_node(t, 'MULTIPLY', map_range(t, icpt, math_node(t, 'SUBTRACT', ts, 0.06), math_node(t, 'ADD', ts, 0.06)), ta)
    c2 = mix_col(t, f2, c1, tip)
    h = t.n('ShaderNodeBsdfHairPrincipled', parametrization='COLOR', model=model)
    t.l(c2, h.inputs['Color'])
    h.inputs['Roughness'].default_value = rough
    h.inputs['Radial Roughness'].default_value = radial
    h.inputs['Coat'].default_value = coat
    h.inputs['Random Roughness'].default_value = rand_rough
    out = t.n('ShaderNodeOutputMaterial')
    t.l(h.outputs[0], out.inputs['Surface'])
    return m

def mat_principled(name, color=(0.5, 0.5, 0.5), rough=0.5, attr=None, sss=0.0, sss_rad=(0.004, 0.002, 0.001),
                   bump=None, coat=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    t = NT(m)
    p = t.n('ShaderNodeBsdfPrincipled')
    if attr:
        t.l(t.attr(attr).outputs['Color'], p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = list(color) + [1.0]
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss
        p.inputs['Subsurface Radius'].default_value = sss_rad
        p.inputs['Subsurface Scale'].default_value = 1.0
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.2
    if bump:
        scale, strength, dist = bump
        tex = t.n('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = scale
        tex.inputs['Detail'].default_value = 6
        bn = t.n('ShaderNodeBump')
        bn.inputs['Strength'].default_value = strength
        bn.inputs['Distance'].default_value = dist
        t.l(tex.outputs['Fac'], bn.inputs['Height'])
        t.l(bn.outputs['Normal'], p.inputs['Normal'])
    out = t.n('ShaderNodeOutputMaterial')
    t.l(p.outputs[0], out.inputs['Surface'])
    return m

def mat_clay():
    return mat_principled('clay', (0.55, 0.52, 0.5), 0.6)

def mat_cornea():
    """Clear wet cornea: Fresnel-weighted mirror over a transparent shell, so sunlight still reaches the iris
    (a refractive glass cornea would need caustics to light the eye and renders it black)."""
    m = bpy.data.materials.new('cornea')
    t = NT(m)
    fr = t.n('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.376
    tp = t.n('ShaderNodeBsdfTransparent')
    gl = t.n('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.02
    mx = t.n('ShaderNodeMixShader')
    t.l(fr.outputs[0], mx.inputs['Fac'])
    t.l(tp.outputs[0], mx.inputs[1])
    t.l(gl.outputs[0], mx.inputs[2])
    out = t.n('ShaderNodeOutputMaterial')
    t.l(mx.outputs[0], out.inputs['Surface'])
    return m

def mat_eye(name, iris_inner, iris_outer, limbus, sclera, pupil_r=0.33, iris_r=0.78, radius=1.0):
    """Eyeball looking down its local +Z. Pupil/iris rings from object-space radial distance."""
    m = bpy.data.materials.new(name)
    t = NT(m)
    tc = t.n('ShaderNodeTexCoord')
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(tc.outputs['Object'], sep.inputs['Vector'])
    x2 = math_node(t, 'MULTIPLY', sep.outputs['X'], sep.outputs['X'])
    y2 = math_node(t, 'MULTIPLY', sep.outputs['Y'], sep.outputs['Y'])
    r = math_node(t, 'DIVIDE', math_node(t, 'SQRT', math_node(t, 'ADD', x2, y2)), radius)
    front = map_range(t, sep.outputs['Z'], 0.0, 0.2 * radius)
    ang = math_node(t, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    nz = t.n('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 3.0
    nz.inputs['Detail'].default_value = 8
    comb = t.n('ShaderNodeCombineXYZ')
    t.l(math_node(t, 'MULTIPLY', ang, 6.0), comb.inputs['X'])
    t.l(math_node(t, 'MULTIPLY', r, 1.5), comb.inputs['Y'])
    t.l(comb.outputs['Vector'], nz.inputs['Vector'])
    streak = map_range(t, nz.outputs['Fac'], 0.3, 0.7)
    irisc = mix_col(t, map_range(t, r, pupil_r, iris_r, interp='LINEAR'), iris_inner, iris_outer)
    irisc = mix_col(t, math_node(t, 'MULTIPLY', streak, 0.5), irisc, [c * 0.55 for c in iris_inner])
    c = mix_col(t, map_range(t, r, iris_r - 0.06, iris_r + 0.02), irisc, limbus)
    c = mix_col(t, map_range(t, r, iris_r + 0.04, iris_r + 0.12), c, sclera)
    c = mix_col(t, math_node(t, 'SUBTRACT', 1.0, front), c, sclera)
    c = mix_col(t, math_node(t, 'MULTIPLY', map_range(t, r, pupil_r + 0.02, pupil_r - 0.02), front), c, (0.004, 0.004, 0.004))
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.4
    out = t.n('ShaderNodeOutputMaterial')
    t.l(p.outputs[0], out.inputs['Surface'])
    return m

def eyeball(name, center, gaze, radius, mat_iris, mat_cor, coll=None, up=(0, 0, 1)):
    objs = []
    for nm, r, mt, seg in ((name, radius, mat_iris, 48), (name + '_cornea', radius * 1.035, mat_cor, 48)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
        ob = bm_object(nm, bm, coll)
        ob.data.materials.append(mt)
        z = unit(gaze)
        x = unit(np.cross(up, z))
        y = np.cross(z, x)
        M = Matrix(((x[0], y[0], z[0], center[0]), (x[1], y[1], z[1], center[1]),
                    (x[2], y[2], z[2], center[2]), (0, 0, 0, 1)))
        ob.matrix_world = M
        objs.append(ob)
    # corneal bulge: pull the front cap of the cornea sphere outward
    cor = objs[1]
    for v in cor.data.vertices:
        if v.co.z > 0:
            zz = v.co.z / (radius * 1.035)
            v.co.z += radius * 0.12 * max(0.0, zz - 0.55) / 0.45
    return objs

# ------------------------------------------------------------------------------------------------ render / scene
def setup_cycles(samples=256, res=(1920, 1080), pct=100, transparent=False):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type in ('OPTIX',)
        sc.cycles.device = 'GPU'
    except Exception as e:
        log("GPU setup failed", e)
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.01
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPTIX'
    except Exception:
        pass
    sc.cycles.max_bounces = 16
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 6
    sc.cycles.transmission_bounces = 12
    sc.cycles.transparent_max_bounces = 64
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 0.5
    try:
        sc.cycles_curves.shape = 'THICK'
        sc.cycles_curves.subdivisions = 3
    except Exception as e:
        log("curve settings", e)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = pct
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.exposure = float(os.environ.get('FA_EXPOSURE', '-0.9'))
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        try:
            sc.view_settings.look = 'None'
        except Exception:
            pass

def camera(loc, target, lens=85, name='cam', dof=None, fstop=4.0, sensor=36):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_start = 0.01
    cd.clip_end = 200
    ob = bpy.data.objects.new(name, cd)
    link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if dof:
        cd.dof.use_dof = True
        cd.dof.focus_distance = dof if isinstance(dof, float) else d.length
        cd.dof.aperture_fstop = fstop
    bpy.context.scene.camera = ob
    return ob

def look(ob, loc, target, lens=None):
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if lens:
        ob.data.lens = lens
    if ob.data.dof.use_dof:
        ob.data.dof.focus_distance = d.length

def studio(size=6.0, bg=(0.18, 0.18, 0.19)):
    """Seamless backdrop + soft key/fill/rim, for inspecting anatomy."""
    bm = bmesh.new()
    R = 1.5
    prof = [(y, 0.0) for y in np.linspace(-size, 0.8, 8)][:-1]
    prof += [(0.8 + math.sin(a) * R, (1 - math.cos(a)) * R) for a in np.linspace(0, PI / 2, 20)]
    prof += [(0.8 + R, z) for z in np.linspace(R + 0.2, size * 0.7, 6)]
    pts = [(0.0, y, z) for (y, z) in prof]
    rows = []
    for x in np.linspace(-size, size, 3):
        rows.append([bm.verts.new((x, p[1], p[2])) for p in pts])
    for r in range(len(rows) - 1):
        for i in range(len(pts) - 1):
            bm.faces.new((rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i]))
    ob = bm_object('backdrop', bm)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    ob.data.materials.append(mat_principled('backdrop', bg, 0.8))
    for nm, loc, energy, size_, col in (('key', (2.2, -2.6, 2.6), 380, 1.6, (1.0, 0.97, 0.92)),
                                        ('fill', (-1.0, -3.0, 1.2), 90, 2.5, (0.9, 0.95, 1.0)),
                                        ('rim', (-2.5, 2.0, 2.2), 300, 1.0, (1.0, 1.0, 1.0))):
        ld = bpy.data.lights.new(nm, 'AREA')
        ld.energy = energy
        ld.size = size_
        ld.color = col
        lo = bpy.data.objects.new(nm, ld)
        link(lo)
        lo.location = loc
        d = Vector((0, 0, 0.35)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.055, 1)
    bpy.context.scene.world = w

# ------------------------------------------------------------------------------------------------ feather cards
def make_cards(name, X, attrs, mat=None, coll=None):
    """X: (N, R, C, 3) card grids, rows run root -> tip, columns across the vane.
    UV: u in [-1, 1] across, v in [0, 1] along. attrs: name -> (N, 3) colour or (N,) float, stored per point."""
    N, R, Cc, _ = X.shape
    V = X.reshape(-1, 3)
    r = np.arange(R - 1)[:, None]
    c = np.arange(Cc - 1)[None, :]
    i00 = r * Cc + c
    q = np.stack([i00, i00 + Cc, i00 + Cc + 1, i00 + 1], -1).reshape(-1, 4)
    F = (np.arange(N)[:, None, None] * (R * Cc) + q[None]).reshape(-1, 4)
    ob = mesh_object(name, V, F, coll)
    me = ob.data
    uu = np.tile(-1 + 2 * np.arange(Cc) / (Cc - 1), R)
    vv = np.repeat(np.arange(R) / (R - 1), Cc)
    uvv = np.stack([uu, vv], 1)
    uvl = me.uv_layers.new(name='UVMap')
    li = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', li)
    uvl.data.foreach_set('uv', uvv[li % (R * Cc)].astype(np.float32).ravel())
    for nm, arr in attrs.items():
        arr = np.asarray(arr, np.float32)
        if arr.ndim == 1:
            at = me.attributes.new(nm, 'FLOAT', 'POINT')
            at.data.foreach_set('value', np.repeat(arr, R * Cc))
        else:
            a4 = np.ones((N, 4), np.float32)
            a4[:, :arr.shape[1]] = arr
            at = me.attributes.new(nm, 'FLOAT_COLOR', 'POINT')
            at.data.foreach_set('color', np.repeat(a4, R * Cc, axis=0).ravel())
    if mat:
        me.materials.append(mat)
    log("cards", name, N)
    return ob

def card_grid(P, T, Nn, L, W, R=6, C=3, lift=0.15, curl=0.0, cup=0.06, twist=None):
    """Planar-ish card grid before conforming: rows along T, columns along B = N x T."""
    B = np.cross(Nn, T)
    v = np.linspace(0, 1, R)[None, :, None, None]
    u = np.linspace(-1, 1, C)[None, None, :, None]
    L = np.asarray(L, float)[:, None, None, None]
    W = np.asarray(W, float)[:, None, None, None]
    lift = np.broadcast_to(np.asarray(lift, float), (len(P),))[:, None, None, None]
    curl = np.broadcast_to(np.asarray(curl, float), (len(P),))[:, None, None, None]
    ang = lift - curl * v
    # integrate the centre line
    s = np.cumsum(np.cos(ang) * (1.0 / (R - 1)), axis=1) - np.cos(ang[:, :1]) / (R - 1)
    h = np.cumsum(np.sin(ang) * (1.0 / (R - 1)), axis=1) - np.sin(ang[:, :1]) / (R - 1)
    X = (P[:, None, None, :] + T[:, None, None, :] * (s * L) + Nn[:, None, None, :] * (h * L + cup * W * (1 - u ** 2))
         + B[:, None, None, :] * (u * W * 0.5))
    return X

def mat_feather(name='feather', translucency=0.15):
    m = bpy.data.materials.new(name)
    t = NT(m)
    uvn = t.n('ShaderNodeUVMap', uv_map='UVMap')
    sp = t.n('ShaderNodeSeparateXYZ')
    t.l(uvn.outputs['UV'], sp.inputs['Vector'])
    u, v = sp.outputs['X'], sp.outputs['Y']
    def sep(attr):
        s_ = t.n('ShaderNodeSeparateColor')
        t.l(t.attr(attr).outputs['Color'], s_.inputs['Color'])
        return s_.outputs[0], s_.outputs[1], s_.outputs[2]
    main = t.attr('f_main').outputs['Color']
    edge = t.attr('f_edge').outputs['Color']
    streak = t.attr('f_streak').outputs['Color']
    edge_start, streak_w, tip_start = sep('f_p')
    fluff, gloss, rnd = sep('f_q')
    vb, kk, bd = sep('f_s')
    au = math_node(t, 'ABSOLUTE', u)
    bt = math_node(t, 'POWER', map_range(t, v, 0.0, vb), 0.5)
    tw = math_node(t, 'SQRT', math_node(t, 'MAXIMUM', math_node(t, 'SUBTRACT', 1.0, math_node(t, 'POWER', v, kk)), 0.0))
    w = math_node(t, 'MAXIMUM', math_node(t, 'MULTIPLY', bt, tw), 0.001)
    r = math_node(t, 'DIVIDE', au, w)
    # barbs run out from the shaft toward the tip
    bc = math_node(t, 'SUBTRACT', math_node(t, 'MULTIPLY', v, math_node(t, 'MULTIPLY', bd, 70.0)), math_node(t, 'MULTIPLY', au, 24.0))
    sb = math_node(t, 'ADD', 0.5, math_node(t, 'MULTIPLY', math_node(t, 'SINE', bc), 0.5))
    nz = t.n('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 4.0
    cmb = t.n('ShaderNodeCombineXYZ')
    t.l(math_node(t, 'MULTIPLY', u, 3.0), cmb.inputs['X'])
    t.l(math_node(t, 'MULTIPLY', v, 16.0), cmb.inputs['Y'])
    t.l(math_node(t, 'MULTIPLY', rnd, 40.0), cmb.inputs['Z'])
    t.l(cmb.outputs['Vector'], nz.inputs['Vector'])
    n = nz.outputs['Fac']
    nc = math_node(t, 'SUBTRACT', n, 0.5)
    reff = math_node(t, 'ADD', r, math_node(t, 'MULTIPLY', math_node(t, 'SUBTRACT', sb, 0.5), 0.06))
    reff = math_node(t, 'ADD', reff, math_node(t, 'MULTIPLY', nc, math_node(t, 'ADD', 0.1, math_node(t, 'MULTIPLY', fluff, 0.4))))
    alpha = map_range(t, reff, 0.7, 1.0, 1.0, 0.0)
    db = map_range(t, v, 0.3, 0.04)                                   # downy base
    alpha = math_node(t, 'MULTIPLY', alpha, math_node(t, 'SUBTRACT', 1.0, math_node(t, 'MULTIPLY', db, math_node(t, 'MULTIPLY', math_node(t, 'SUBTRACT', 1.0, n), 0.9))))
    fl = math_node(t, 'MULTIPLY', math_node(t, 'MULTIPLY', fluff, map_range(t, r, 0.4, 1.0)), math_node(t, 'SUBTRACT', 1.0, n))
    alpha = math_node(t, 'MULTIPLY', alpha, math_node(t, 'SUBTRACT', 1.0, math_node(t, 'MULTIPLY', fl, 0.7)))
    # colour pattern
    c = mix_col(t, map_range(t, reff, edge_start, math_node(t, 'ADD', edge_start, 0.14)), main, edge)
    sm = map_range(t, r, streak_w, math_node(t, 'MULTIPLY', streak_w, 0.55))
    sm = math_node(t, 'MULTIPLY', sm, math_node(t, 'GREATER_THAN', streak_w, 0.01))
    sm = math_node(t, 'MULTIPLY', sm, math_node(t, 'MULTIPLY', map_range(t, v, 0.08, 0.22), map_range(t, v, 0.97, 0.82)))
    c = mix_col(t, sm, c, streak)
    tipc = map_range(t, math_node(t, 'ADD', v, math_node(t, 'MULTIPLY', math_node(t, 'MULTIPLY', r, r), 0.18)), tip_start, math_node(t, 'ADD', tip_start, 0.07))
    c = mix_col(t, tipc, c, edge)
    c = mix_col(t, math_node(t, 'MULTIPLY', db, 0.3), c, (0.32, 0.30, 0.28))
    rm = math_node(t, 'MULTIPLY', map_range(t, au, 0.045, 0.012), map_range(t, v, 1.0, 0.85))
    c = mix_col(t, math_node(t, 'MULTIPLY', rm, 0.3), c, edge)
    shade = t.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    _in(t, sock(shade.inputs, 'Factor', 'VALUE'), 1.0)
    _in(t, sock(shade.inputs, 'A', 'RGBA'), c)
    g = t.n('ShaderNodeCombineColor')
    sv = math_node(t, 'ADD', 0.82, math_node(t, 'MULTIPLY', sb, 0.18))
    for i in range(3):
        t.l(sv, g.inputs[i])
    t.l(g.outputs[0], sock(shade.inputs, 'B', 'RGBA'))
    c = sock(shade.outputs, 'Result', 'RGBA')
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    t.l(map_range(t, gloss, 0.0, 1.0, 0.62, 0.36, interp='LINEAR'), p.inputs['Roughness'])
    t.l(mix_col(t, gloss, (1.0, 1.0, 1.0), (0.78, 0.74, 0.42)), p.inputs['Specular Tint'])
    p.inputs['Specular IOR Level'].default_value = 0.45
    bump = t.n('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3
    bump.inputs['Distance'].default_value = 0.0002
    t.l(math_node(t, 'ADD', math_node(t, 'MULTIPLY', sb, 0.6), math_node(t, 'MULTIPLY', rm, 0.6)), bump.inputs['Height'])
    t.l(bump.outputs['Normal'], p.inputs['Normal'])
    tr = t.n('ShaderNodeBsdfTranslucent')
    t.l(c, tr.inputs['Color'])
    m1 = t.n('ShaderNodeMixShader')
    m1.inputs['Fac'].default_value = translucency
    t.l(p.outputs[0], m1.inputs[1])
    t.l(tr.outputs[0], m1.inputs[2])
    tp = t.n('ShaderNodeBsdfTransparent')
    m2 = t.n('ShaderNodeMixShader')
    t.l(alpha, m2.inputs['Fac'])
    t.l(tp.outputs[0], m2.inputs[1])
    t.l(m1.outputs[0], m2.inputs[2])
    out = t.n('ShaderNodeOutputMaterial')
    t.l(m2.outputs[0], out.inputs['Surface'])
    return m

# ------------------------------------------------------------------------------------------------ desert set
def value_noise2(x, y, seed=0):
    xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    xf, yf = x - xi, y - yi
    def h(i, j):
        v = (i * 374761393 + j * 668265263 + seed * 2147483647) & 0xFFFFFFFF
        v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
        return (v & 0xFFFF) / 65535.0
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    return (h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v)

def fbm2(x, y, octaves=5, seed=0):
    out = 0.0
    amp, f, tot = 1.0, 1.0, 0.0
    for o in range(octaves):
        out = out + amp * (value_noise2(x * f, y * f, seed + o) - 0.5)
        tot += amp
        amp *= 0.5
        f *= 2.03
    return out / tot

def ground_height(x, y):
    return 0.035 * fbm2(x * 0.35, y * 0.35, 4, 1) + 0.006 * fbm2(x * 3.0, y * 3.0, 3, 2)

def mat_dirt():
    m = bpy.data.materials.new('desert_dirt')
    t = NT(m)
    tc = t.n('ShaderNodeTexCoord')
    n1 = t.n('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.6; n1.inputs['Detail'].default_value = 8
    n2 = t.n('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 9.0; n2.inputs['Detail'].default_value = 10
    vo = t.n('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 140.0
    grain = t.n('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value = 2600.0; grain.inputs['Detail'].default_value = 2
    for nd in (n1, n2, vo, grain):
        t.l(tc.outputs['Object'], nd.inputs['Vector'])
    c = mix_col(t, map_range(t, n1.outputs['Fac'], 0.35, 0.65), hexc('#9a5532'), hexc('#b9764a'))
    c = mix_col(t, math_node(t, 'MULTIPLY', map_range(t, n2.outputs['Fac'], 0.45, 0.7), 0.5), c, hexc('#c89a6e'))
    c = mix_col(t, math_node(t, 'MULTIPLY', map_range(t, vo.outputs['Distance'], 0.12, 0.0), 0.35), c, hexc('#5e3826'))
    c = mix_col(t, math_node(t, 'MULTIPLY', map_range(t, grain.outputs['Fac'], 0.4, 0.75), 0.25), c, hexc('#e0b48a'))
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.95
    p.inputs['Specular IOR Level'].default_value = 0.25
    b = t.n('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.45; b.inputs['Distance'].default_value = 0.002
    t.l(math_node(t, 'ADD', grain.outputs['Fac'], math_node(t, 'MULTIPLY', map_range(t, vo.outputs['Distance'], 0.0, 0.15), 0.6)), b.inputs['Height'])
    t.l(b.outputs['Normal'], p.inputs['Normal'])
    out = t.n('ShaderNodeOutputMaterial')
    t.l(p.outputs[0], out.inputs['Surface'])
    return m

def rock_mesh(rng, sub=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    s = rng.uniform(0.55, 1.0, 3)
    seed = int(rng.integers(0, 10000))
    for v in bm.verts:
        p = v.co
        d = 1.0 + 0.25 * (value_noise2(p.x * 2 + seed, p.y * 2 + p.z * 1.7, seed) - 0.5) * 2
        v.co = Vector((p.x * s[0] * d, p.y * s[1] * d, p.z * s[2] * d * 0.7))
    V = np.array([v.co[:] for v in bm.verts])
    F = np.array([[v.index for v in f.verts] for f in bm.faces])
    bm.free()
    return V, F

def scatter_rocks(rng, n, rmin, rmax, area, exclude, name='pebbles', mat=None, coll=None):
    bases = [rock_mesh(rng) for _ in range(8)]
    Vs, Fs, off = [], [], 0
    placed = 0
    tries = 0
    while placed < n and tries < n * 20:
        tries += 1
        x, y = rng.uniform(area[0], area[1]), rng.uniform(area[2], area[3])
        r = rmin * (rmax / rmin) ** (rng.random() ** 2.2)
        if any((x - ex) ** 2 + (y - ey) ** 2 < (er + r) ** 2 for ex, ey, er in exclude):
            continue
        V, F = bases[int(rng.integers(0, len(bases)))]
        R = np.array(Euler((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 6.28))).to_matrix())
        z = float(ground_height(np.array([x]), np.array([y]))[0])
        Vt = (V * r) @ R.T + np.array([x, y, z - r * 0.25])
        Vs.append(Vt); Fs.append(F + off); off += len(V)
        placed += 1
    ob = mesh_object(name, np.concatenate(Vs), np.concatenate(Fs), coll)
    if mat:
        ob.data.materials.append(mat)
    return ob

def mat_rock():
    m = bpy.data.materials.new('rock')
    t = NT(m)
    tc = t.n('ShaderNodeTexCoord')
    nz = t.n('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 60.0; nz.inputs['Detail'].default_value = 8
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    oi = t.n('ShaderNodeObjectInfo')
    c = mix_col(t, map_range(t, nz.outputs['Fac'], 0.3, 0.7), hexc('#6e5a4c'), hexc('#c8b8a4'))
    c = mix_col(t, math_node(t, 'MULTIPLY', oi.outputs['Random'], 0.5), c, hexc('#8a5a3c'))
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    b = t.n('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.5; b.inputs['Distance'].default_value = 0.001
    t.l(nz.outputs['Fac'], b.inputs['Height']); t.l(b.outputs['Normal'], p.inputs['Normal'])
    out = t.n('ShaderNodeOutputMaterial'); t.l(p.outputs[0], out.inputs['Surface'])
    return m

def grass_tufts(rng, n, area, exclude, coll=None, name='dry_grass'):
    pts, cols = [], []
    straw = [hexc('#a8915e'), hexc('#8a7650'), hexc('#bfa878'), hexc('#6e6048'), hexc('#9a8f74')]
    placed = 0
    while placed < n:
        x, y = rng.uniform(area[0], area[1]), rng.uniform(area[2], area[3])
        if any((x - ex) ** 2 + (y - ey) ** 2 < er ** 2 for ex, ey, er in exclude):
            continue
        placed += 1
        z0 = float(ground_height(np.array([x]), np.array([y]))[0])
        nb = int(rng.integers(30, 110))
        hgt = rng.uniform(0.06, 0.3)
        for b in range(nb):
            a = rng.uniform(0, 6.28)
            rr = rng.uniform(0, 0.02)
            base = np.array([x + rr * math.cos(a), y + rr * math.sin(a), z0 - 0.003])
            lean = rng.uniform(0.05, 0.55)
            d = unit(np.array([math.cos(a) * lean, math.sin(a) * lean, 1.0]))
            L = hgt * rng.uniform(0.5, 1.1)
            p = [base]
            dd = d.copy()
            for k in range(1, 7):
                dd = unit(dd + np.array([math.cos(a), math.sin(a), 0]) * 0.09 * k / 6 - np.array([0, 0, 0.04 * k / 6]))
                p.append(p[-1] + dd * L / 6)
            pts.append(p)
            cols.append(straw[int(rng.integers(0, 5))] * rng.uniform(0.7, 1.05))
    pts = np.array(pts)
    nb = len(pts)
    cols = np.array(cols)
    mat = mat_curve_surface('dry_grass', rough=0.6, transl=0.25)
    return make_curves(name, pts, strand_radius(nb, 7, 0.00035, 0.00004, power=1.0),
                       {'c_base': cols * 0.8, 'c_band': cols, 'c_tip': cols * 1.15, 'c_bp': np.tile([0.3, 0.8, 1.0], (nb, 1))},
                       mat, coll)

def mat_foliage():
    m = bpy.data.materials.new('scrub')
    t = NT(m)
    tc = t.n('ShaderNodeTexCoord')
    nz = t.n('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 25.0; nz.inputs['Detail'].default_value = 6
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    vo = t.n('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 40.0
    t.l(tc.outputs['Object'], vo.inputs['Vector'])
    oi = t.n('ShaderNodeObjectInfo')
    c = mix_col(t, map_range(t, nz.outputs['Fac'], 0.35, 0.65), hexc('#4a5236'), hexc('#8a8f68'))
    c = mix_col(t, math_node(t, 'MULTIPLY', oi.outputs['Random'], 0.6), c, hexc('#7a6a4e'))
    c = mix_col(t, math_node(t, 'MULTIPLY', map_range(t, vo.outputs['Distance'], 0.25, 0.0), 0.6), c, hexc('#262a1c'))
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.75
    tr = t.n('ShaderNodeBsdfTranslucent'); t.l(c, tr.inputs['Color'])
    mx = t.n('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.25
    t.l(p.outputs[0], mx.inputs[1]); t.l(tr.outputs[0], mx.inputs[2])
    out = t.n('ShaderNodeOutputMaterial'); t.l(mx.outputs[0], out.inputs['Surface'])
    return m

def mat_curve_surface(name, rough=0.6, transl=0.25):
    """Plain diffuse-ish surface for curves (grass blades, leaves) coloured by the c_base attribute."""
    m = bpy.data.materials.new(name)
    t = NT(m)
    c = t.attr('c_base').outputs['Color']
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = 0.3
    tr = t.n('ShaderNodeBsdfTranslucent'); t.l(c, tr.inputs['Color'])
    mx = t.n('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = transl
    t.l(p.outputs[0], mx.inputs[1]); t.l(tr.outputs[0], mx.inputs[2])
    out = t.n('ShaderNodeOutputMaterial'); t.l(mx.outputs[0], out.inputs['Surface'])
    return m

def shrubs(rng, centers, coll):
    P, C, R = [], [], []
    greens = [hexc('#4d5534'), hexc('#5f6a40'), hexc('#6e7458'), hexc('#3e4630'), hexc('#7d7a5c')]
    for (x, y, r, h) in centers:
        z0 = float(ground_height(np.array([x]), np.array([y]))[0])
        c0 = np.array([x, y, z0 + h * 0.52])
        rad3 = np.array([r * rng.uniform(1.0, 1.5), r, h * 0.5])
        nl = int(9000 * r * r * h)
        u = unit(rng.normal(size=(nl, 3)))
        rr = rng.random(nl) ** 0.2
        lump = 1 + 0.25 * np.sin(u[:, 0] * 5 + x) * np.sin(u[:, 1] * 4 + y)
        ctr = c0 + u * rad3 * (rr * lump)[:, None]
        ctr[:, 2] = np.maximum(ctr[:, 2], z0 + 0.05)
        d = unit(rng.normal(size=(nl, 3)))
        Ll = rng.uniform(0.018, 0.04, nl)[:, None]
        P.append(np.stack([ctr - d * Ll / 2, ctr, ctr + d * Ll / 2], 1))
        base = greens[int(rng.integers(0, 5))]
        C.append(base[None, :] * rng.uniform(0.7, 1.2, (nl, 1)))
        R.append(np.full(nl, 0.0028))
        nt = 90
        tip = c0 + unit(rng.normal(size=(nt, 3))) * rad3 * 0.85
        tip[:, 2] = np.abs(tip[:, 2] - z0) + z0
        root = np.array([x, y, z0 - 0.01]) + rng.normal(0, r * 0.08, (nt, 3)) * [1, 1, 0]
        P.append(np.stack([root, root * 0.5 + tip * 0.5 + rng.normal(0, 0.05, (nt, 3)), tip], 1))
        C.append(np.tile(hexc('#3a2e24'), (nt, 1)))
        R.append(np.full(nt, 0.008))
    P = np.concatenate(P); C = np.concatenate(C); Rr = np.concatenate(R)
    n = len(P)
    rad_ = np.stack([Rr, Rr * 0.8, Rr * 0.5], 1)
    return make_curves('scrub', P, rad_, {'c_base': C}, mat_curve_surface('scrub_leaves', 0.7, 0.3), coll)

def mat_hills():
    m = bpy.data.materials.new('hills')
    t = NT(m)
    tc = t.n('ShaderNodeTexCoord')
    nz = t.n('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.08; nz.inputs['Detail'].default_value = 10
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    sep = t.n('ShaderNodeSeparateXYZ'); t.l(tc.outputs['Object'], sep.inputs['Vector'])
    c = mix_col(t, map_range(t, nz.outputs['Fac'], 0.35, 0.7), hexc('#8a7468'), hexc('#a89c96'))
    c = mix_col(t, map_range(t, sep.outputs['Z'], 0.0, 12.0), c, hexc('#b4b2b8'))
    p = t.n('ShaderNodeBsdfPrincipled'); t.l(c, p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.95
    b = t.n('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.6; t.l(nz.outputs['Fac'], b.inputs['Height']); t.l(b.outputs['Normal'], p.inputs['Normal'])
    out = t.n('ShaderNodeOutputMaterial'); t.l(p.outputs[0], out.inputs['Surface'])
    return m

def hills(rng, coll):
    n = 720
    th = np.linspace(-0.35 * PI, 1.35 * PI, n)
    hgt = 3 + 11 * np.clip(0.5 + fbm2(th * 3.0, np.zeros(n) + 0.5, 5, 9), 0, 1) ** 1.6
    rows = [(120.0, 0.0), (190.0, 1.0), (260.0, 0.6)]
    V = []
    for r_, f_ in rows:
        V.append(np.stack([np.cos(th) * r_, np.sin(th) * r_, hgt * f_ - 0.04], 1))
    V = np.concatenate(V)
    F = []
    for j in range(len(rows) - 1):
        for i in range(n - 1):
            a_ = j * n + i
            F.append([a_, a_ + 1, a_ + n + 1, a_ + n])
    ob = mesh_object('hills', V, np.array(F), coll)
    m = mat_hills()
    ob.data.materials.append(m)
    return ob

def desert_scene(rng, exclude=(), sun_elev=24.0, sun_azim=-35.0, area=(-3.0, 3.0, -2.5, 4.0), shrubs_behind=1.0):
    """Red desert dirt, pebbles, dry grass, blurred scrub, sky + sun. exclude: (x, y, r) keep-clear circles."""
    coll = collection('desert')
    # near ground: displaced grid
    nx, ny = 360, 360
    xs = np.linspace(-6, 6, nx)
    ys = np.linspace(-5, 9, ny)
    X, Yg = np.meshgrid(xs, ys, indexing='ij')
    Z = ground_height(X, Yg)
    V = np.stack([X.ravel(), Yg.ravel(), Z.ravel()], 1)
    i = np.arange(nx - 1)[:, None] * ny + np.arange(ny - 1)[None, :]
    F = np.stack([i, i + ny, i + ny + 1, i + 1], -1).reshape(-1, 4)
    g = mesh_object('ground', V, F, coll)
    g.data.materials.append(mat_dirt())
    # far ground
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=200)
    far = bm_object('ground_far', bm, coll)
    far.location = (0, 0, -0.04)
    far.data.materials.append(g.data.materials[0])
    # pebbles + rocks
    rk = mat_rock()
    scatter_rocks(rng, 2600, 0.0015, 0.012, area, list(exclude), 'pebbles', rk, coll)
    scatter_rocks(rng, 40, 0.015, 0.06, (area[0] - 2, area[1] + 2, area[2] + 1, area[3] + 4), list(exclude), 'stones', rk, coll)
    grass_tufts(rng, 70, (area[0] - 1, area[1] + 1, area[2] + 1.5, area[3] + 4), list(exclude), coll)
    # scrub: twiggy curve shrubs well behind the subject (they fall outside the depth of field)
    centers = []
    for k in range(int(30 * shrubs_behind)):
        centers.append((rng.uniform(-16, 16), rng.uniform(5.0, 24), rng.uniform(0.45, 1.5), rng.uniform(0.6, 1.9)))
    for k in range(int(10 * shrubs_behind)):
        centers.append((rng.uniform(-3.5, 1.5), rng.uniform(3.2, 6.5), rng.uniform(0.35, 0.9), rng.uniform(0.5, 1.3)))
    shrubs(rng, centers, coll)
    hills(rng, coll)
    # sky + sun
    w = bpy.data.worlds.new('sky')
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'MULTIPLE_SCATTERING'
    except Exception:
        pass
    for k_, v_ in (('sun_elevation', rad(sun_elev)), ('sun_rotation', rad(sun_azim)), ('sun_disc', False),
                   ('altitude', 800.0), ('aerosol_density', 2.0), ('air_density', 1.0)):
        try:
            setattr(sky, k_, v_)
        except Exception as e:
            log("sky prop", k_, e)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = float(os.environ.get('FA_SKY', '0.12'))
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs[0], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    bpy.context.scene.world = w
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.energy = float(os.environ.get('FA_SUN', '6.0'))
    ld.angle = rad(0.8)
    ld.color = (1.0, 0.86, 0.68)
    sun = bpy.data.objects.new('sun', ld)
    link(sun, coll)
    # sky texture: rotation measured from +Y? point the lamp the same way the sky's sun sits
    sun.rotation_euler = Euler((rad(90 - sun_elev), 0, rad(sun_azim) + PI / 2), 'XYZ')
    return coll

def render(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log("rendered", os.path.basename(path), "%.1fs" % (time.time() - t))
