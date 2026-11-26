"""build_enemies.py: pre-rendered 3D sprites for Toil & Trouble's enemies and the Witchfinder boss.

Every character is a small procedural 3D model (lathed volumes, tubes, bevelled boxes) built in GAME PIXEL units
under a root empty scaled by spritelib.PX, so 1 unit here = 1 game pixel. Origin = feet centre, facing +X, Z up.
Most characters get a slight 3/4 yaw toward the camera so both eyes read; the boss stays square-on so its arm
pivot lands on an exact pixel.

Run headless (all characters, or name some):
    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
        --python build_enemies.py -- [friar deacon bishop acolyte hedgehog slug crow wasp rider finder boss]
Writes art/<name>.png + .json through spritelib.Sheet, and 4x previews (dark over bright background) into
PREVIEW_DIR (env TT_PREVIEW_DIR overrides).
"""
import bpy, sys, os, math, time, json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import spritelib as L

PREVIEW_DIR = os.environ.get('TT_PREVIEW_DIR', os.path.join(os.environ.get('TEMP', HERE), 'tt_enemies'))
TAU = math.tau
BASE = {}          # object name -> undeformed vertex array, for per-frame deformation


def rad(d): return math.radians(d)


# ---------------------------------------------------------------------------------------------------------------
# geometry helpers (all in game-pixel units)
def link(o, parent):
    bpy.context.scene.collection.objects.link(o)
    if parent is not None: o.parent = parent
    return o


def grp(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    o = bpy.data.objects.new(name, None); link(o, parent)
    o.location = loc; o.rotation_euler = [rad(a) for a in rot]; o.scale = scale
    return o


def root(name, yaw=-22.0, loc=(0, 0, 0)):
    return grp(name, None, loc, (0, 0, yaw), (L.PX, L.PX, L.PX))


def mesh(name, verts, faces, m, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(float(c) for c in v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
    for mm in (m if isinstance(m, (list, tuple)) else [m]):
        if mm: me.materials.append(mm)
    o = bpy.data.objects.new(name, me); link(o, parent)
    o.location = loc; o.rotation_euler = [rad(a) for a in rot]; o.scale = scale
    BASE[o.name] = np.array(verts, dtype=np.float64)
    return o


def deform(o, fn):
    v = fn(BASE[o.name].copy())
    o.data.vertices.foreach_set('co', v.astype(np.float32).ravel()); o.data.update()


def interp(knots, u):
    """Smooth (Catmull-Rom style) interpolation through [(u, value), ...] knots."""
    xs = [k[0] for k in knots]; ys = [k[1] for k in knots]
    if u <= xs[0]: return ys[0]
    if u >= xs[-1]: return ys[-1]
    i = max(j for j in range(len(xs) - 1) if xs[j] <= u)
    x0, x1 = xs[i], xs[i + 1]; y0, y1 = ys[i], ys[i + 1]
    t = (u - x0) / (x1 - x0)
    def slope(j):
        if j <= 0: return (ys[1] - ys[0]) / (xs[1] - xs[0])
        if j >= len(xs) - 1: return (ys[-1] - ys[-2]) / (xs[-1] - xs[-2])
        return (ys[j + 1] - ys[j - 1]) / (xs[j + 1] - xs[j - 1])
    m0, m1 = slope(i) * (x1 - x0), slope(i + 1) * (x1 - x0)
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1


def lathe(name, m, rings, parent=None, seg=28, axis='z', **kw):
    """Surface of revolution. rings: [(s, ra, rb, ca, cb)] along the axis; ra/rb are the ellipse radii
    (axis z: ra->x, rb->y; axis x: ra->z, rb->y). Zero-radius rings become poles."""
    verts, faces, idx = [], [], []
    for r in rings:
        s, ra, rb = r[:3]; ca = r[3] if len(r) > 3 else 0.0; cb = r[4] if len(r) > 4 else 0.0
        def P(a_, b_):
            return (a_, b_, s) if axis == 'z' else (s, b_, a_)
        if ra < 1e-5 and rb < 1e-5:
            idx.append([len(verts)]); verts.append(P(ca, cb))
        else:
            ring = []
            for j in range(seg):
                a = TAU * j / seg
                ring.append(len(verts)); verts.append(P(ca + ra * math.cos(a), cb + rb * math.sin(a)))
            idx.append(ring)
    for a, b in zip(idx[:-1], idx[1:]):
        if len(a) == 1 and len(b) == 1: continue
        if len(a) == 1:
            for j in range(seg): faces.append((a[0], b[(j + 1) % seg], b[j]))
        elif len(b) == 1:
            for j in range(seg): faces.append((a[j], a[(j + 1) % seg], b[0]))
        else:
            for j in range(seg): faces.append((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    if len(idx[0]) > 1: faces.append(tuple(reversed(idx[0])))
    if len(idx[-1]) > 1: faces.append(tuple(idx[-1]))
    return mesh(name, verts, faces, m, parent, **kw)


def profile(fn, n=24):
    return [fn(i / n) for i in range(n + 1)]


def ell(name, m, r, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, seg=24, n=14):
    rx, ry, rz = r
    rings = [(-math.cos(math.pi * i / n) * rz, math.sin(math.pi * i / n) * rx, math.sin(math.pi * i / n) * ry)
             for i in range(n + 1)]
    return lathe(name, m, rings, parent, seg, loc=loc, rot=rot)


def _frames(pts):
    pts = np.array(pts, dtype=np.float64)
    n = len(pts)
    T = np.zeros_like(pts)
    T[1:-1] = pts[2:] - pts[:-2]; T[0] = pts[1] - pts[0]; T[-1] = pts[-1] - pts[-2]
    T /= np.linalg.norm(T, axis=1)[:, None] + 1e-12
    ref = np.array([0, 0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0, 0])
    N = np.zeros_like(pts); B = np.zeros_like(pts)
    nrm = np.cross(T[0], ref); nrm /= np.linalg.norm(nrm)
    for i in range(n):
        nrm = nrm - T[i] * np.dot(nrm, T[i]); nrm /= np.linalg.norm(nrm) + 1e-12
        N[i] = nrm; B[i] = np.cross(T[i], nrm)
    return pts, T, N, B


def tube(name, m, pts, r, parent=None, seg=10, closed=False, caps=True, **kw):
    """Tube along a polyline. r: scalar or per-point list. Rounded (hemispherical) end caps."""
    pts, T, N, B = _frames(pts if not closed else list(pts))
    n = len(pts)
    rs = [r] * n if np.isscalar(r) else list(r)
    if len(rs) != n:   # resample a radius profile onto the path
        rs = list(np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(rs)), rs))
    verts, faces, rings = [], [], []
    def ring_at(c, nn, bb, rr):
        ids = []
        for j in range(seg):
            a = TAU * j / seg
            ids.append(len(verts)); verts.append(c + rr * (math.cos(a) * nn + math.sin(a) * bb))
        return ids
    if caps and not closed:
        for k in (3, 2, 1):
            ph = k / 3 * math.pi / 2
            c = pts[0] - T[0] * rs[0] * math.sin(ph); rr = rs[0] * math.cos(ph)
            if k == 3: rings.append([len(verts)]); verts.append(c)
            else: rings.append(ring_at(c, N[0], B[0], rr))
    for i in range(n): rings.append(ring_at(pts[i], N[i], B[i], rs[i]))
    if caps and not closed:
        for k in (1, 2, 3):
            ph = k / 3 * math.pi / 2
            c = pts[-1] + T[-1] * rs[-1] * math.sin(ph); rr = rs[-1] * math.cos(ph)
            if k == 3: rings.append([len(verts)]); verts.append(c)
            else: rings.append(ring_at(c, N[-1], B[-1], rr))
    pairs = list(zip(rings[:-1], rings[1:]))
    if closed: pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        if len(a) == 1:
            for j in range(seg): faces.append((a[0], b[(j + 1) % seg], b[j]))
        elif len(b) == 1:
            for j in range(seg): faces.append((a[j], a[(j + 1) % seg], b[0]))
        else:
            for j in range(seg): faces.append((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    if not caps and not closed:
        faces.append(tuple(reversed(rings[0]))); faces.append(tuple(rings[-1]))
    return mesh(name, [tuple(v) for v in verts], faces, m, parent, **kw)


def ring(name, m, rx, ry, r, z=0.0, cx=0.0, parent=None, n=40, tilt=0.0, **kw):
    """Elliptical torus (belts, brims, hat bands) in the XY plane at height z; tilt rotates about Y (deg)."""
    ct, st = math.cos(rad(tilt)), math.sin(rad(tilt))
    pts = []
    for i in range(n):
        a = TAU * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + x * ct, y, z - x * st))
    return tube(name, m, pts, r, parent, closed=True, **kw)


def box(name, m, size, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, bevel=0.3, segs=2, taper=None):
    """Bevelled box. taper=(tx, ty) scales the top face (for hats, wagons)."""
    sx, sy, sz = [s / 2 for s in size]
    tx, ty = taper or (1, 1)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
         (-sx * tx, -sy * ty, sz), (sx * tx, -sy * ty, sz), (sx * tx, sy * ty, sz), (-sx * tx, sy * ty, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh(name, v, f, m, parent, loc, rot, smooth=False)
    if bevel > 0:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = segs; b.limit_method = 'NONE'
        b.harden_normals = False
    return o


def cone(name, m, r0, r1, h, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, seg=20, round_tip=True):
    rings = [(0, 0, 0), (0, r0, r0)]
    if r1 > 0:
        rings += [(h, r1, r1), (h, 0, 0)]
    else:
        rings += [(h * 0.85, r0 * 0.22, r0 * 0.22), (h, 0, 0)] if round_tip else [(h, 0, 0)]
    return lathe(name, m, rings, parent, seg, loc=loc, rot=rot)


def on_sphere(r, az, el, c=(0, 0, 0)):
    """Point on a sphere of radius r (tuple for ellipsoid). az: degrees from +X toward -Y (the camera side)."""
    rx, ry, rz = (r, r, r) if np.isscalar(r) else r
    a, e = rad(az), rad(el)
    return (c[0] + rx * math.cos(e) * math.cos(a), c[1] - ry * math.cos(e) * math.sin(a), c[2] + rz * math.sin(e))


def look_rot(direction):
    """Euler (deg) that turns local +X toward direction."""
    d = np.array(direction, dtype=float); d /= np.linalg.norm(d)
    yaw = math.degrees(math.atan2(d[1], d[0])); pitch = -math.degrees(math.asin(max(-1, min(1, d[2]))))
    return (0, pitch, yaw)


def smooth_path(ctrl, n=24):
    """Catmull-Rom through control points -> n points."""
    c = [np.array(p, float) for p in ctrl]
    c = [c[0] * 2 - c[1]] + c + [c[-1] * 2 - c[-2]]
    out = []
    segs = len(c) - 3
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1); t -= k
        p0, p1, p2, p3 = c[k], c[k + 1], c[k + 2], c[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


# ---------------------------------------------------------------------------------------------------------------
# materials
_MATS = {}
def M(key, color, rough=0.5, metal=0.0, sss=0.0, spec=0.5, emit=None, coat=0.0):
    if key not in _MATS or _MATS[key].name not in bpy.data.materials:
        _MATS[key] = L.mat(key, color, rough=rough, metal=metal, sss=sss, spec=spec, emit=emit, coat=coat)
    return _MATS[key]


def cloth(key, color, rough=0.55): return M(key, color, rough=rough, spec=0.45)
def gloss(key, color, rough=0.25): return M(key, color, rough=rough, spec=0.6, coat=0.4)
def metal(key, color, rough=0.28): return M(key, color, rough=rough, metal=1.0)
def skin(key, color): return M(key, color, rough=0.42, sss=0.12, spec=0.45)
def eye_mat(): return M('eye', '#0e0a10', rough=0.32, spec=0.3)
def glint_mat(): return M('glint', '#ffffff', emit=(1, 1, 1, 6.0))
def white_mat(): return M('eyewhite', '#f4f0ea', rough=0.3, emit=(0.95, 0.93, 0.9, 0.35))


# ---------------------------------------------------------------------------------------------------------------
# faces: dark eyes with a white glint, a cross brow, set onto a head sphere (head group origin = head centre)
def add_face(head, r, eyes=((36, 12), (-12, 12)), eye_r=(0.55, 0.62, 0.95), mood='cross', brow_m=None,
             brow_r=0.5, glint=True, whites=False, prefix='f', brow_lift=0.0):
    em = eye_mat()
    parts = {}
    for k, (az, el) in enumerate(eyes):
        p = on_sphere(r, az, el)
        o = ell(f'{prefix}_eye{k}', em, eye_r, loc=p, rot=look_rot(np.array(p)), parent=head, seg=12, n=8)
        parts[f'eye{k}'] = o
        if whites:
            pw = on_sphere(np.array(r) - 0.15 if not np.isscalar(r) else r - 0.15, az + 9, el)
            ell(f'{prefix}_white{k}', white_mat(), (0.45, 0.62, 0.9), loc=pw, rot=look_rot(np.array(pw)), parent=head, seg=12, n=8)
        if glint:
            pn = np.array(p); g = pn + pn / np.linalg.norm(pn) * 0.45 + np.array([0.12, -0.1, 0.5 * eye_r[2]])
            gr = glint if not isinstance(glint, bool) else 0.42
            ell(f'{prefix}_gl{k}', glint_mat(), (gr * (1 if k == 0 else 0.7),) * 3, loc=tuple(g), parent=head, seg=8, n=6)
    if mood:
        bm = brow_m or em
        rr = (np.array(r) + 0.25) if not np.isscalar(r) else r + 0.25
        for k, (az, el) in enumerate(eyes):
            # inner end toward the face centre (between the eyes), lower: a cross brow
            mid = sum(a for a, _ in eyes) / len(eyes)
            inner = az + (mid - az) * 0.55
            outer = az - (mid - az) * 0.55
            if mood == 'cross':
                e_in, e_out = el + 11 + brow_lift, el + 19 + brow_lift
            elif mood == 'worried':
                e_in, e_out = el + 19 + brow_lift, el + 12 + brow_lift
            else:
                e_in, e_out = el + 16 + brow_lift, el + 16 + brow_lift
            pts = [on_sphere(rr, outer, e_out), on_sphere(rr, az, (e_in + e_out) / 2 + 1), on_sphere(rr, inner, e_in)]
            parts[f'brow{k}'] = tube(f'{prefix}_brow{k}', bm, smooth_path(pts, 8), brow_r, head, seg=8)
    return parts


def mouth(head, r, az0, az1, el, curve=1.5, m=None, w=0.42, prefix='m'):
    """Curved mouth line on the head sphere; curve>0 smiles (ends up), <0 frowns."""
    mm = m or M('mouth', '#5a1a1e', rough=0.4)
    pts = []
    for i in range(7):
        t = i / 6
        az = az0 + (az1 - az0) * t
        e = el + curve * (2 * t - 1) ** 2
        pts.append(on_sphere(np.array(r) + 0.15 if not np.isscalar(r) else r + 0.15, az, e))
    return tube(prefix + '_mouth', mm, pts, w, head, seg=8)


# ---------------------------------------------------------------------------------------------------------------
# previews
def write_png(path, rgb):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new('prev', w, h, alpha=False)
    rgba = np.concatenate([rgb, np.full((h, w, 1), 255, np.uint8)], axis=2)
    img.pixels[:] = (rgba[::-1].astype(np.float32) / 255).ravel()
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)


def preview(sheet, scale=4):
    """Dark and bright background versions, stacked, nearest-neighbour upscaled; plus a 1x strip."""
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    big = sheet._big
    rows = []
    for bg in ((34, 28, 48), (150, 196, 226), (236, 224, 196)):
        rows.append(np.where(big[..., 3:4] > 0, big[..., :3], np.array(bg, np.uint8)))
    img = np.concatenate(rows, axis=0)
    write_png(os.path.join(PREVIEW_DIR, sheet.name + '.png'), np.repeat(np.repeat(img, scale, 0), scale, 1))
    # zoom: first row's first 4 frames (and every anim's first frame) at 8x on dark + bright
    tiles = []
    for n, fr in sheet.anims.items():
        tiles += fr[:4] if len(tiles) == 0 else fr[:1]
    tiles = tiles[:6]
    occ = np.any(np.stack([t[..., 3] > 0 for t in tiles]), axis=0)
    ys, xs = np.nonzero(occ)
    y0, y1 = max(0, ys.min() - 2), min(sheet.h, ys.max() + 3); x0, x1 = max(0, xs.min() - 2), min(sheet.w, xs.max() + 3)
    strip = np.concatenate([t[y0:y1, x0:x1] for t in tiles], axis=1)
    zrows = [np.where(strip[..., 3:4] > 0, strip[..., :3], np.array(bg, np.uint8)) for bg in ((34, 28, 48), (150, 196, 226))]
    z = np.concatenate(zrows, axis=0)
    zs = 8 if sheet.w < 100 else 4
    write_png(os.path.join(PREVIEW_DIR, sheet.name + '_zoom.png'), np.repeat(np.repeat(z, zs, 0), zs, 1))
    # 1x / 2x as the player sees it
    write_png(os.path.join(PREVIEW_DIR, sheet.name + '_2x.png'), np.repeat(np.repeat(img, 2, 0), 2, 1))


def add_sun(name, travel, energy, color, angle=10):
    """Extra sun travelling along `travel` (world vector)."""
    from mathutils import Vector
    ld = bpy.data.lights.new(name, 'SUN'); ld.energy = energy; ld.color = color; ld.angle = rad(angle)
    o = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(o)
    o.rotation_euler = Vector(travel).normalized().to_track_quat('-Z', 'Y').to_euler()
    return o


def new_scene(samples=48, rim=16.0, rim_color=(0.5, 0.78, 1.0)):
    BASE.clear(); _MATS.clear()
    sc = L.setup_scene(samples)
    # More contrast than the shared rig (small sprites need it): less ambient and fill, a firmer key. spritelib's
    # 'rim' sun actually travels +X+Y-Z (it lights from the front-left, a second key), so it is toned down and a
    # true back rim is added: from behind the sprite and to its right, it edges the right/top silhouette in blue.
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.32
    ob = bpy.data.objects
    ob['key'].data.energy = 4.0
    ob['fill'].data.energy = 0.45
    ob['rim'].data.energy = 1.4
    add_sun('backrim', (-0.72, -0.5, -0.42), rim, rim_color, 4)
    add_sun('toprim', (0.3, -0.55, -0.75), rim * 0.22, (0.9, 0.72, 1.0), 6)
    return sc



# ---------------------------------------------------------------------------------------------------------------
# shared character parts
def robe(name, m, H, rx_k, cx_k=((0, 0.0), (1, 0.0)), ry=0.92, parent=None, z0=0.0, seg=32, n=26):
    """Closed robe/body volume of revolution from z0 to H. Returns (object, profile fn u->(z, rx, ry, cx))."""
    def rp(u):
        r_ = interp(rx_k, u)
        return (z0 + u * (H - z0), r_, r_ * ry, interp(cx_k, u))
    rings = [(z0, 0, 0, interp(cx_k, 0))] + profile(rp, n) + [(H + 0.35, 0, 0, interp(cx_k, 1))]
    return lathe(name, m, rings, parent, seg), rp


def robe_strip(name, m, rp, a0, a1, u0, u1, off=0.2, parent=None, nu=18, na=4, widen=None):
    """A thin patch hugging a robe profile between angles a0..a1 (deg; 0 = front, negative = camera side)."""
    verts, faces = [], []
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * i / nu
        z, rx, ry, cx = rp(u)
        w = widen(u) if widen else 1.0
        mid = (a0 + a1) / 2
        for j in range(na + 1):
            a = rad(mid + ((a0 + (a1 - a0) * j / na) - mid) * w)
            nx, ny = math.cos(a) / rx, math.sin(a) / ry; nl = math.hypot(nx, ny)
            verts.append((cx + rx * math.cos(a) + off * nx / nl, ry * math.sin(a) + off * ny / nl, z))
    for i in range(nu):
        for j in range(na):
            a = i * (na + 1) + j; faces.append((a, a + 1, a + na + 2, a + na + 1))
    return mesh(name, verts, faces, m, parent)


def robe_fn(H, sway, bob, squash=0.0, flare=0.0):
    """Deformation for hanging cloth: hem swings by `sway`, stays on the ground while the body bobs."""
    def fn(v):
        u = np.clip(v[:, 2] / H, 0, 1)
        w = (1 - u) ** 2
        v[:, 0] += sway * w
        v[:, 2] -= bob * w
        if flare:
            v[:, 0] += flare * w * (v[:, 0] < 0)
        v[:, 0] *= 1 - squash * 0.6
        v[:, 1] *= 1 + squash
        return v
    return fn


def add_feet(rt, prefix, m, size=(2.1, 1.25, 0.75), spread=2.3, base_x=1.5, toe=None):
    feet = []
    for k, side in enumerate((-1, 1)):
        ft = grp(f'{prefix}_foot{k}', rt, loc=(base_x, side * spread, 0))
        ell(f'{prefix}_shoe{k}', m, size, loc=(0.6, 0, size[2] * 0.85), parent=ft)
        if toe is not None:
            ell(f'{prefix}_toe{k}', toe, (size[0] * 0.75, size[1] * 0.8, size[2] * 1.1), loc=(0.9, 0, size[2] * 1.5), parent=ft)
        feet.append(ft)
    return feet


def step_feet(feet, ph, stride=2.3, lift=0.9, base_x=1.5):
    for k, s in enumerate((0, math.pi)):
        a = ph + s
        ft = feet[k]
        ft.location = (base_x + stride * math.sin(a), ft.location[1], lift * max(0.0, math.cos(a)))
        ft.rotation_euler = (0, rad(-14 * max(0.0, math.cos(a)) * math.sin(a)), 0)


def capotain(name, parent, loc, hat_m, band_m, buckle_m, crown_h=8.5, r0=3.9, r1=3.3, brim=6.0, rot=(0, 0, 0),
             buckle_az=28, band_z=1.1):
    """Tall flat-topped puritan hat with a band and a square gold buckle."""
    g = grp(name, parent, loc, rot)
    lathe(name + '_brim', hat_m, [(-0.3, 0, 0), (-0.3, brim - 0.45, (brim - 0.45) * 0.9), (-0.05, brim, brim * 0.9),
                                   (0.25, brim - 0.4, (brim - 0.4) * 0.9), (0.3, r0 * 0.9, r0 * 0.8), (0.3, 0, 0)], g, 36)
    rings = [(0, 0, 0)]
    for i in range(9):
        t = i / 8
        z = t * (crown_h - 0.5)
        r_ = r0 + (r1 - r0) * t + 0.15 * math.sin(math.pi * t)
        rings.append((z, r_, r_ * 0.9))
    rings += [(crown_h - 0.12, r1 - 0.15, (r1 - 0.15) * 0.9), (crown_h, r1 - 0.7, (r1 - 0.7) * 0.9), (crown_h, 0, 0)]
    lathe(name + '_crown', hat_m, rings, g, 36)
    rb = r0 + (r1 - r0) * (band_z / crown_h) + 0.12
    band = ring(name + '_band', band_m, rb, rb * 0.9, 0.55, z=band_z, parent=g, seg=8)
    band.scale = (1, 1, 1.5)
    if buckle_m is not None:
        bg = grp(name + '_bk', g, loc=on_sphere((rb + 0.35, rb * 0.9 + 0.35, 1), buckle_az, 0, (0, 0, band_z)), rot=(0, 0, -buckle_az))
        sq = [(0, -1.05, -0.95), (0, 1.05, -0.95), (0, 1.05, 0.95), (0, -1.05, 0.95)]
        tube(name + '_buckle', buckle_m, sq, 0.34, bg, seg=6, closed=True)
    return g


def sleeve_arm(name, parent, m, hand_m, shoulder, pts, radii, hand_r=1.1, rot=(0, 0, 0), hand=True, seg=12):
    """Arm = shoulder group; sleeve tube through pts (relative to the shoulder); hand at the last point."""
    g = grp(name, parent, loc=shoulder, rot=rot)
    tube(name + '_sl', m, smooth_path(pts, 10) if len(pts) > 2 else pts, radii, g, seg=seg)
    h = None
    if hand:
        h = ell(name + '_hand', hand_m, (hand_r, hand_r, hand_r), loc=pts[-1], parent=g)
    return g, h


# ---------------------------------------------------------------------------------------------------------------
# FRIAR
def friar_mats():
    return dict(robe=cloth('fr_robe', '#7a5236', 0.5), robe_d=cloth('fr_robe_d', '#5e3e28', 0.55),
                rope=cloth('fr_rope', '#d8c080', 0.6), skin=skin('fr_skin', '#eab48e'),
                hair=cloth('fr_hair', '#5a3a22', 0.7), sandal=cloth('fr_sandal', '#6a4a2a', 0.5),
                cheek=skin('fr_cheek', '#ec8a86'), nose=skin('fr_nose', '#eea088'))


def friar_head(P, C, body, z=16.2, prefix='fr'):
    head = grp(prefix + '_head', body, loc=(0.8, 0, z)); P['head'] = head
    hr = (4.9, 4.7, 4.8)
    ell(prefix + '_skull', C['skin'], hr, parent=head, seg=32, n=20)
    hg = grp(prefix + '_hairg', head, loc=(-0.2, 0, 2.4), rot=(0, -16, 0))
    hair = ring(prefix + '_hairring', C['hair'], 4.15, 4.0, 0.8, parent=hg, seg=10)
    hair.scale = (1, 1, 1.3)
    ell(prefix + '_ear', C['skin'], (0.9, 0.55, 1.3), loc=(-0.7, -4.6, -0.4), parent=head)
    ell(prefix + '_ear2', C['skin'], (0.9, 0.55, 1.3), loc=(-0.7, 4.6, -0.4), parent=head)
    ell(prefix + '_nose', C['nose'], (1.15, 1.0, 1.0), loc=on_sphere(hr, 22, -12), parent=head)
    for k, az in enumerate((50, -6)):
        ell(f'{prefix}_cheek{k}', C['cheek'], (0.85, 1.1, 0.9), loc=on_sphere(np.array(hr) - 0.45, az, -20), parent=head)
    add_face(head, hr, eyes=((42, 4), (0, 4)), eye_r=(0.7, 0.9, 1.4), brow_r=0.6, prefix=prefix)
    mouth(head, hr, 40, 12, -36, curve=1.6, prefix=prefix)
    return head


def build_friar(rt):
    C = friar_mats()
    P = {}
    body = grp('fr_body', rt); P['body'] = body
    H = 13.0
    P['robe'], rp = robe('fr_robe', C['robe'], H,
                         [(0, 4.5), (0.07, 5.3), (0.3, 6.3), (0.5, 6.3), (0.72, 5.5), (0.88, 4.0), (1.0, 2.2)],
                         [(0, 0.0), (0.35, 0.45), (0.6, 0.6), (0.85, 0.2), (1, 0.0)], 0.93, body)
    P['robe_H'] = H
    P['hood'] = ell('fr_hood', C['robe_d'], (2.6, 3.6, 1.9), loc=(-2.6, 0, 12.2), rot=(0, -20, 0), parent=body)
    P['belt'] = ring('fr_belt', C['rope'], 6.15, 5.75, 0.55, z=7.0, cx=0.6, parent=body, tilt=4)
    knot = grp('fr_knot', body, loc=(3.6, -4.7, 6.9)); P['knot'] = knot
    ell('fr_knotball', C['rope'], (0.85, 0.85, 0.85), parent=knot)
    tube('fr_ropeA', C['rope'], [(0, 0, 0), (0.25, -0.15, -1.6), (0.35, -0.2, -3.4)], [0.5, 0.48, 0.45], knot, seg=8)
    tube('fr_ropeB', C['rope'], [(0, 0, 0), (0.75, -0.3, -1.2), (1.1, -0.35, -2.4)], [0.48, 0.45, 0.42], knot, seg=8)
    sh = 10.6
    for k, side in enumerate((-1, 1)):
        pts = smooth_path([(0.0, side * 4.6, sh + 0.4), (2.4, side * 4.5, sh - 1.9), (4.4, side * 2.4, 8.3), (5.6, side * 0.7, 8.4)], 10)
        tube(f'fr_sleeve{k}', C['robe'], pts, [1.45, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.15, 2.15], body, seg=14)
    ell('fr_hands', C['skin'], (1.0, 1.4, 1.0), loc=(6.6, 0, 8.6), parent=body)
    friar_head(P, C, body)
    P['feet'] = []
    for k, side in enumerate((-1, 1)):
        ft = grp(f'fr_foot{k}', rt, loc=(1.5, side * 2.3, 0)); P['feet'].append(ft)
        ell(f'fr_sole{k}', C['sandal'], (2.1, 1.25, 0.5), loc=(0.6, 0, 0.5), parent=ft)
        ell(f'fr_toes{k}', C['skin'], (1.55, 1.0, 0.75), loc=(0.9, 0, 1.0), parent=ft)
        tube(f'fr_strap{k}', C['sandal'], [(0.2, -1.05, 0.7), (0.2, 0, 1.75), (0.2, 1.05, 0.7)], 0.32, ft, seg=6)
    return P


def pose_friar(P, p):
    ph = TAU * p
    bob = 0.85 * (0.5 + 0.5 * math.cos(2 * ph))
    P['body'].location = (0, 0, bob)
    P['body'].rotation_euler = (rad(4.5 * math.sin(ph)), rad(2.0 + 1.5 * math.cos(2 * ph)), 0)
    deform(P['robe'], robe_fn(P['robe_H'], 0.9 * math.sin(ph - 0.9), bob, 0.035 * math.cos(2 * ph)))
    step_feet(P['feet'], ph, 2.3, 0.9, 1.6)
    P['head'].rotation_euler = (rad(-2 * math.sin(ph)), rad(2.5 * math.cos(2 * ph - 0.6)), rad(-6))
    P['knot'].rotation_euler = (rad(10 * math.sin(ph - 1.2)), rad(-14 * math.sin(ph - 1.6)), 0)


def make_friar():
    new_scene()
    rt = root('friar', yaw=-32)
    P = build_friar(rt)
    sh = L.Sheet('friar', 48, 52, 24, 48)
    for i in range(8):
        pose_friar(P, i / 8); sh.add('walk')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# DEACON: black robe, white collar, capotain with a gold buckle, round wooden shield with a painted gold sun
def make_deacon():
    new_scene()
    rt = root('deacon', yaw=-28)
    C = dict(robe=M('de_robe', '#2c2a3c', rough=0.38, spec=0.55), robe_hi=M('de_robe2', '#3a3850', rough=0.4, spec=0.5),
             collar=M('de_collar', '#f0ebe0', rough=0.45), skin=skin('de_skin', '#e6b896'),
             hat=M('de_hat', '#1e1c28', rough=0.35, spec=0.6), band=M('de_band', '#4a4458', rough=0.4),
             gold=metal('de_gold', '#e8c050', 0.25), shoe=gloss('de_shoe', '#1a1418', 0.2),
             wood=M('de_wood', '#6a3c20', rough=0.3, spec=0.6, coat=0.5), paint=M('de_paint', '#f6c83a', rough=0.3, spec=0.6, coat=0.3), iron=metal('de_iron', '#8a8e9c', 0.35),
             hair=cloth('de_hair', '#3a2a24', 0.7), nose=skin('de_nose', '#e8a888'))
    P = {}
    body = grp('de_body', rt)
    H = 15.0
    P['robe'], rp = robe('de_robe', C['robe'], H,
                         [(0, 5.6), (0.08, 5.6), (0.35, 5.0), (0.55, 5.0), (0.75, 5.0), (0.9, 3.9), (1.0, 2.0)],
                         [(0, 0.0), (0.6, 0.3), (1, 0.0)], 0.9, body)
    # a row of buttons down the front
    for i, u in enumerate((0.45, 0.58, 0.71, 0.84)):
        z, rx, ry, cx = rp(u)
        ell(f'de_btn{i}', C['band'], (0.35, 0.45, 0.45), loc=(cx + rx + 0.05, -0.6, z), parent=body, seg=8, n=6)
    # white falling-band collar
    ring('de_collar_r', C['collar'], 2.5, 2.3, 0.6, z=14.8, cx=0.2, parent=body, seg=8)
    box('de_bands', C['collar'], (0.6, 3.6, 2.6), loc=(2.6, -0.3, 13.6), rot=(0, -16, 0), parent=body, bevel=0.25)
    # head
    head = grp('de_head', body, loc=(0.6, 0, 18.7))
    hr = (4.3, 4.1, 4.3)
    ell('de_skull', C['skin'], hr, parent=head, seg=32, n=20)
    ell('de_hairback', C['hair'], (3.4, 4.0, 3.0), loc=(-1.6, 0, 0.6), parent=head)
    ell('de_ear', C['skin'], (0.8, 0.5, 1.2), loc=(-0.6, -4.0, -0.2), parent=head)
    ell('de_nose', C['nose'], (1.5, 0.8, 0.9), loc=on_sphere(hr, 20, -10), rot=(0, 20, -20), parent=head)
    add_face(head, hr, eyes=((44, 6), (2, 6)), eye_r=(0.65, 0.85, 1.25), brow_r=0.55, prefix='de')
    mouth(head, hr, 38, 12, -34, curve=-1.0, prefix='de')
    P['head'] = head
    P['hat'] = capotain('de_hat', head, (-0.2, 0, 3.0), C['hat'], C['band'], C['gold'], crown_h=8.6, r0=3.9, r1=3.3,
                        brim=6.0, rot=(0, -6, 0), buckle_az=34)
    # arms: near arm holds the shield; far arm tucked behind it
    sleeve_arm('de_armF', body, C['robe'], C['skin'], (0.0, 3.8, 12.2),
               [(0, 0, 0), (2.2, 0.2, -2.6), (5.0, -1.8, -3.6)], [1.5, 1.45, 1.35], 1.0)
    sleeve_arm('de_armN', body, C['robe'], C['skin'], (0.0, -4.0, 12.2),
               [(0, 0, 0), (1.8, -0.6, -2.8), (4.8, -0.2, -3.6)], [1.55, 1.5, 1.4], 1.0)
    # shield
    sg = grp('de_shield', body, loc=(7.0, -1.8, 9.6), rot=(0, 90, -46))
    lathe('de_shield_disc', C['wood'], [(-0.9, 0, 0), (-0.9, 5.3, 5.3), (-0.2, 5.75, 5.75), (0.5, 5.4, 5.4), (0.8, 4.0, 4.0), (0.95, 0, 0)], sg, 40)
    ring('de_shield_rim', C['iron'], 5.6, 5.6, 0.45, z=0.25, parent=sg, seg=8)
    # painted sun: gold disc + 8 rays
    lathe('de_sun', C['paint'], [(0.8, 0, 0), (0.8, 1.9, 1.9), (1.2, 1.6, 1.6), (1.35, 0, 0)], sg, 24)
    for i in range(8):
        a = TAU * i / 8 + TAU / 16
        ca, sa = math.cos(a), math.sin(a)
        L_ = 3.9 if i % 2 == 0 else 3.2
        tri = [(2.0 * ca - 0.75 * sa, 2.0 * sa + 0.75 * ca, 0.92), (2.0 * ca + 0.75 * sa, 2.0 * sa - 0.75 * ca, 0.92),
               ((2.0 + L_) * ca, (2.0 + L_) * sa, 0.62)]
        tri2 = [(x, y, z + 0.18) for x, y, z in tri]
        mesh(f'de_ray{i}', tri + tri2, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], C['paint'], sg, smooth=False)
    # iron studs around the rim
    for i in range(8):
        a = TAU * i / 8
        ell(f'de_stud{i}', C['iron'], (0.35, 0.35, 0.3), loc=(4.6 * math.cos(a), 4.6 * math.sin(a), 0.62), parent=sg, seg=8, n=6)
    P['shield'] = sg
    P['feet'] = add_feet(rt, 'de', C['shoe'], (2.0, 1.15, 0.7), spread=2.1, base_x=1.4)
    sh = L.Sheet('deacon', 48, 52, 24, 48)
    for i in range(8):
        p = i / 8; ph = TAU * p
        bob = 0.7 * (0.5 + 0.5 * math.cos(2 * ph))
        body.location = (0, 0, bob)
        body.rotation_euler = (rad(2.5 * math.sin(ph)), rad(1.5 + 1.0 * math.cos(2 * ph)), 0)
        deform(P['robe'], robe_fn(H, 0.75 * math.sin(ph - 0.9), bob, 0.02 * math.cos(2 * ph)))
        step_feet(P['feet'], ph, 2.4, 0.8, 1.4)
        head.rotation_euler = (rad(-1.5 * math.sin(ph)), rad(1.5 * math.cos(2 * ph - 0.5)), rad(-8))
        P['hat'].rotation_euler = (rad(1.5 * math.sin(ph - 0.8)), rad(-6 + 2.5 * math.cos(2 * ph - 1.2)), 0)
        sg.location = (7.0, -1.6, 9.6 + 0.35 * math.cos(2 * ph - 0.7))
        sh.add('walk')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# BISHOP: purple vestments, green stole, gold trim, split-peak mitre, jowly frown, gold crook in the back hand
def make_bishop():
    new_scene()
    rt = root('bishop', yaw=-26)
    C = dict(robe=cloth('bi_robe', '#6a2a78', 0.45), robe_d=cloth('bi_robe_d', '#55206a', 0.5),
             stole=cloth('bi_stole', '#2a7a4a', 0.45), gold=metal('bi_gold', '#e0b040', 0.26),
             skin=skin('bi_skin', '#e2a888'), mitre=cloth('bi_mitre', '#7a3a8a', 0.4), shoe=gloss('bi_shoe', '#3a1a2a', 0.3),
             jewel=M('bi_jewel', '#d02a3a', rough=0.1, spec=0.9, coat=1.0), hair=cloth('bi_hair', '#6a6068', 0.6),
             nose=skin('bi_nose', '#e89880'), cheek=skin('bi_cheek', '#e48a82'))
    body = grp('bi_body', rt)
    H = 20.0
    robe_o, rp = robe('bi_robe', C['robe'], H,
                      [(0, 8.0), (0.06, 8.9), (0.25, 9.5), (0.45, 9.7), (0.65, 9.2), (0.8, 7.8), (0.92, 5.4), (1.0, 3.0)],
                      [(0, 0.0), (0.4, 0.8), (0.65, 1.0), (0.9, 0.3), (1, 0.0)], 0.9, body)
    deformables = [robe_o]
    # green stole: two bands from the neck to near the hem, gold-tipped
    for k, (a0, a1) in enumerate(((-34, -18), (10, 26))):
        deformables.append(robe_strip(f'bi_stole{k}', C['stole'], rp, a0, a1, 0.08, 0.93, 0.22, body, nu=22,
                                      widen=lambda u: 1.0 + 0.25 * (1 - u)))
        deformables.append(robe_strip(f'bi_stoleT{k}', C['gold'], rp, a0 - 1.5, a1 + 1.5, 0.05, 0.12, 0.3, body, nu=3,
                                      widen=lambda u: 1.2))
    # gold hem trim
    deformables.append(robe_strip('bi_hem', C['gold'], rp, -180, 180, 0.0, 0.05, 0.12, body, nu=2, na=48))
    # shoulder cape (mozzetta) with gold edge
    def cp(u):
        z, rx, ry, cx = rp(0.6 + 0.4 * u)
        return (z, rx + 0.25 * (1 - u) + 0.2, ry + 0.25 * (1 - u) + 0.2, cx)
    cape = lathe('bi_cape', C['robe_d'], profile(cp, 12)[:-1] + [(H + 0.5, 0, 0, 0)], body, 32)
    zc, rxc, ryc, cxc = cp(0)
    ring('bi_capetrim', C['gold'], rxc + 0.05, ryc + 0.05, 0.45, z=zc, cx=cxc, parent=body, seg=8)
    # sleeves: near arm, fist forward; far arm back holding the crook
    armN, fistN = sleeve_arm('bi_armN', body, C['robe'], C['skin'], (0.5, -6.2, 16.0),
                             [(0, 0, 0), (4.0, 0.6, -3.0), (12.4, 2.6, -3.4)], [2.4, 2.4, 2.5], 2.0)
    ring('bi_cuffN', C['gold'], 2.55, 2.55, 0.4, parent=grp('bi_cuffNg', armN, loc=(11.4, 2.4, -3.4), rot=(0, 88, 14)), seg=8)
    fistN.location = (14.0, 2.9, -3.3); fistN.scale = (1.05, 1.1, 1.0)
    for k in range(3):
        ell(f'bi_knuckle{k}', C['skin'], (0.7, 0.6, 0.6), loc=(15.6, 2.0 + k * 0.9, -2.6 + 0.2 * k), parent=armN, seg=10, n=6)
    armF, handF = sleeve_arm('bi_armF', body, C['robe'], C['skin'], (-1.0, 4.8, 16.0),
                             [(0, 0, 0), (-4.4, 0.0, -1.6), (-9.4, -2.6, -2.2)], [2.3, 2.3, 2.4], 1.8)
    # crook in the far hand: staff + spiral head
    crook = grp('bi_crook', armF, loc=(-9.4, -2.6, -2.2))
    sx = 0.0
    staff = [(sx, 0, -12.8), (sx, 0, 18.5)]
    tube('bi_staff', C['gold'], staff, 0.62, crook, seg=10)
    sp = []
    cx_, cz_ = sx + 2.6, 18.5
    for i in range(40):
        t = i / 39
        th = math.pi - t * (1.25 * TAU)
        R = 2.6 - 1.7 * t
        sp.append((cx_ + R * math.cos(th), 0, cz_ + R * math.sin(th)))
    tube('bi_crookhead', C['gold'], sp, [0.68 - 0.18 * (i / 39) for i in range(40)], crook, seg=10)
    ell('bi_knop', C['gold'], (1.0, 1.0, 1.2), loc=(sx, 0, 17.6), parent=crook)
    # head: jowly, frowning
    head = grp('bi_head', body, loc=(1.6, 0, 24.6))
    hr = (5.0, 4.9, 5.1)
    ell('bi_skull', C['skin'], hr, parent=head, seg=32, n=20)
    for k, az in enumerate((52, -10)):
        ell(f'bi_jowl{k}', C['skin'], (2.3, 2.3, 2.1), loc=on_sphere(np.array(hr) - 1.4, az, -42), parent=head)
    ell('bi_chin2', C['skin'], (3.0, 3.6, 1.6), loc=on_sphere(np.array(hr) - 1.6, 20, -68), parent=head)
    ell('bi_nose', C['nose'], (1.6, 1.25, 1.2), loc=on_sphere(hr, 22, -10), parent=head)
    for k, az in enumerate((50, -6)):
        ell(f'bi_cheek{k}', C['cheek'], (0.8, 1.0, 0.8), loc=on_sphere(np.array(hr) - 0.4, az, -16), parent=head)
    ell('bi_ear', C['skin'], (0.9, 0.55, 1.4), loc=(-0.8, -4.8, -0.4), parent=head)
    add_face(head, hr, eyes=((42, 6), (0, 6)), eye_r=(0.7, 0.92, 1.35), brow_r=0.72, brow_m=M('bi_brow', '#4a3a44', rough=0.6),
             prefix='bi', brow_lift=-1)
    mouth(head, hr, 40, 6, -34, curve=-2.0, w=0.48, prefix='bi')
    # bald pate details (visible when the mitre is knocked off): grey side tufts + a shine
    for k, side in enumerate((-1, 1)):
        ell(f'bi_tuft{k}', C['hair'], (1.6, 0.9, 1.2), loc=(-2.9, side * 4.3, 0.2), rot=(0, -20, 0), parent=head)
    ell('bi_tuftback', C['hair'], (1.4, 3.8, 1.8), loc=(-4.4, 0, 0.2), parent=head)
    # mitre
    mg = grp('bi_mitre', head, loc=(-0.3, 0, 2.8), rot=(0, -8, 0))
    mh = 13.5
    def mp(u):
        rx_ = interp([(0, 4.6), (0.4, 4.9), (0.75, 4.3), (1.0, 3.2)], u)
        ry_ = interp([(0, 5.0), (0.35, 5.2), (0.7, 3.8), (0.92, 1.4), (1.0, 0.3)], u)
        return (u * mh, rx_, ry_, 0.0)
    mit = lathe('bi_mitre_body', C['mitre'], [(0, 0, 0)] + profile(mp, 22) + [(mh + 0.3, 0, 0)], mg, 36)
    # the split: a V notch through the top, front-to-back peaks
    cutter = box('bi_cut', None, (5.0, 14, 5.0), loc=(0, 0, mh + 0.6), rot=(0, 45, 0), parent=mg, bevel=0)
    cutter.hide_render = True; cutter.display_type = 'WIRE'
    bo = mit.modifiers.new('split', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter; bo.solver = 'EXACT'
    band = ring('bi_mband', C['gold'], 4.75, 5.1, 0.55, z=0.8, parent=mg, seg=8); band.scale = (1, 1, 1.5)
    for sgn in (1, -1):
        pts = []
        for i in range(12):
            u = 0.06 + 0.72 * i / 11
            z, rx_, ry_, _ = mp(u)
            pts.append((sgn * (rx_ + 0.12), 0, z))
        tube(f'bi_orph{sgn}', C['gold'], pts, 0.42, mg, seg=8)
    ell('bi_mjewel', C['jewel'], (0.5, 0.8, 0.8), loc=(mp(0.42)[1] + 0.35, 0, mp(0.42)[0]), parent=mg, seg=12, n=8)
    feet = add_feet(rt, 'bi', C['shoe'], (2.6, 1.6, 0.9), spread=3.4, base_x=2.4)
    sh = L.Sheet('bishop', 48, 52, 24, 48)
    for anim in ('walk', 'bald'):
        mg.hide_render = (anim == 'bald')
        for o in mg.children_recursive: o.hide_render = (anim == 'bald') or o.name == 'bi_cut'
        for i in range(8):
            p = i / 8; ph = TAU * p
            bob = 1.0 * (0.5 + 0.5 * math.cos(2 * ph))
            body.location = (0, 0, bob)
            body.rotation_euler = (rad(3.5 * math.sin(ph)), rad(2.5 + 1.5 * math.cos(2 * ph)), 0)
            fn = robe_fn(H, 1.1 * math.sin(ph - 0.9), bob, 0.025 * math.cos(2 * ph))
            for o in deformables: deform(o, fn)
            step_feet(feet, ph, 3.0, 1.1, 2.4)
            armN.rotation_euler = (0, rad(-12 * math.sin(ph)), 0)
            armF.rotation_euler = (0, rad(8 * math.sin(ph)), 0)
            crook.rotation_euler = (0, rad(-8 * math.sin(ph)), 0)
            head.rotation_euler = (rad(-1.5 * math.sin(ph)), rad(2.0 * math.cos(2 * ph - 0.6)), rad(-8))
            mg.rotation_euler = (rad(1.2 * math.sin(ph - 0.8)), rad(-8 + 2.0 * math.cos(2 * ph - 1.2)), 0)
            sh.add(anim)
    return sh


# ---------------------------------------------------------------------------------------------------------------
# ACOLYTE: altar-server child, red cassock, white surplice, ginger hair, tall candle (flame drawn by the game)
ACOLYTE_TIPS = {}
def make_acolyte():
    new_scene()
    yaw = -26
    rt = root('acolyte', yaw=yaw)
    C = dict(cassock=cloth('ac_cassock', '#a82a30', 0.45), surplice=M('ac_surplice', '#eaeef2', rough=0.5, spec=0.4),
             skin=skin('ac_skin', '#f0c09a'), hair=cloth('ac_hair', '#d07a34', 0.55), wax=M('ac_wax', '#f2d890', rough=0.3, sss=0.3),
             wick=M('ac_wick', '#2a1c1a', rough=0.8), shoe=gloss('ac_shoe', '#2a1c1a', 0.25), cheek=skin('ac_cheek', '#f09a8a'),
             freckle=skin('ac_freck', '#c87a50'))
    body = grp('ac_body', rt)
    robe('ac_cassock', C['cassock'], 11.0, [(0, 4.4), (0.1, 4.4), (0.5, 3.9), (0.85, 3.6), (1.0, 2.0)], ry=0.9, parent=body)
    # surplice: flared smock from the knees to the neck with a scalloped (lace) hem
    def sp(u):
        r_ = interp([(0, 5.3), (0.15, 5.0), (0.5, 4.3), (0.8, 3.9), (0.93, 3.0), (1.0, 1.8)], u)
        return (5.0 + u * 7.2, r_, r_ * 0.9, 0.2)
    rings = [(5.0, 0, 0, 0.2)] + profile(sp, 20) + [(12.5, 0, 0, 0.2)]
    surp = lathe('ac_surplice', C['surplice'], rings, body, 40)
    def scallop(v):
        u = (v[:, 2] - 5.0) / 7.2
        ang = np.arctan2(v[:, 1], v[:, 0] - 0.2)
        v[:, 2] += np.where(u < 0.06, -0.45 * (0.5 + 0.5 * np.cos(ang * 10)), 0)
        return v
    deform(surp, scallop); BASE[surp.name] = np.array([vv.co[:] for vv in surp.data.vertices])
    head = grp('ac_head', body, loc=(0.4, 0, 16.4))
    hr = (4.4, 4.2, 4.4)
    ell('ac_skull', C['skin'], hr, parent=head, seg=32, n=20)
    # ginger bowl cut
    ell('ac_haircap', C['hair'], (4.75, 4.55, 3.4), loc=(-0.35, 0, 1.6), rot=(0, 8, 0), parent=head, seg=32, n=16)
    ell('ac_hairback', C['hair'], (3.4, 4.45, 3.6), loc=(-1.6, 0, 0.1), parent=head, seg=24, n=14)
    fr = [on_sphere(np.array(hr) + 0.3, a, 30 + 4 * math.cos(rad(a * 3))) for a in range(70, -50, -10)]
    tube('ac_fringe', C['hair'], fr, 0.85, head, seg=8)
    ell('ac_ear', C['skin'], (0.8, 0.5, 1.2), loc=(-0.5, -4.3, -0.4), parent=head)
    ell('ac_nose', C['skin'], (0.75, 0.7, 0.7), loc=on_sphere(hr, 22, -12), parent=head)
    for k, az in enumerate((52, -6)):
        ell(f'ac_cheek{k}', C['cheek'], (0.7, 1.0, 0.8), loc=on_sphere(np.array(hr) - 0.35, az, -18), parent=head)
    for k, (az, el) in enumerate(((58, -6), (64, -9), (54, -10))):
        ell(f'ac_frk{k}', C['freckle'], (0.2, 0.3, 0.3), loc=on_sphere(np.array(hr) + 0.02, az, el), parent=head, seg=6, n=4)
    add_face(head, hr, eyes=((42, 4), (2, 4)), eye_r=(0.7, 0.9, 1.4), brow_r=0.5, brow_m=M('ac_brow', '#a04a1a', rough=0.6), prefix='ac')
    mouth(head, hr, 34, 14, -34, curve=1.2, w=0.38, prefix='ac')
    feet = add_feet(rt, 'ac', C['shoe'], (1.7, 1.05, 0.65), spread=1.9, base_x=1.2)
    for k, ft in enumerate(feet): ft.location = (1.2 + (0.8 if k == 0 else -0.6), ft.location[1], 0)
    cs, sn = math.cos(rad(yaw)), math.sin(rad(yaw))
    def world_to_local(X, Z, y=-1.6):
        # root rotation about Z by yaw: world x = cs*x - sn*y
        return ((X + sn * y) / cs, y, Z)
    sh = L.Sheet('acolyte', 48, 52, 24, 48)
    for anim, tip, lean in (('idle', (8.5, 21.0), 0.0), ('throw', (3.0, 27.0), 0.0)):
        # candle: 6 px stick, top at `tip`, held at its lower third. Idle: held out in front of the face;
        # throw: wound up overhead, the elbow swung back behind the head so the arm doesn't hide the face
        far_side = False
        tx, ty, tz = world_to_local(*tip, y=-1.8)
        cg = grp('ac_candle_' + anim, rt, loc=(tx, ty, tz), rot=(0, (-8 if anim == 'throw' else 0), 0))
        lathe('ac_wax_' + anim, C['wax'], [(-6.2, 0, 0), (-6.2, 0.78, 0.78), (-0.25, 0.78, 0.78), (0, 0.62, 0.62), (0, 0, 0)], cg, 16)
        tube('ac_wickt_' + anim, C['wick'], [(0, 0, -0.1), (0.05, 0, 0.55)], 0.18, cg, seg=6)
        ell('ac_drip_' + anim, C['wax'], (0.35, 0.3, 0.9), loc=(0.55, -0.45, -1.2), parent=cg, seg=8, n=6)
        hand_l = (tx + (0.7 if far_side else 0.0), ty - 0.2, tz - 4.0)
        sh_ = (0.0, 3.4, 11.6) if far_side else (0.4, -3.4, 11.6)
        mid = ((sh_[0] + hand_l[0]) / 2 + (-1.4 if far_side else 0.6), (sh_[1] + hand_l[1]) / 2 + (0.8 if far_side else -0.8),
               (sh_[2] + hand_l[2]) / 2 - (0 if far_side else 1.4))
        if anim == 'throw':
            mid = (-3.4, -4.4, 19.6)
        sl = tube('ac_sleeve_' + anim, C['surplice'], smooth_path([sh_, mid, hand_l], 9), [1.4, 1.5, 1.6, 1.7, 1.75, 1.8, 1.85, 1.85, 1.75], body, seg=12)
        hnd = ell('ac_hand_' + anim, C['skin'], (1.05, 1.05, 1.15), loc=(hand_l[0] + 0.1, hand_l[1] - 0.3, hand_l[2] + 0.3), parent=body)
        # the other arm hangs at the side
        other = [(0.4, -3.4, 11.6), (1.8, -4.5, 9.2), (3.0, -3.8, 7.6)] if far_side else [(0.0, 3.4, 11.6), (1.4, 4.4, 9.2), (2.6, 3.6, 8.0)]
        far = tube('ac_sleeveF_' + anim, C['surplice'], smooth_path(other, 8), 1.45, body, seg=12)
        if far_side:
            ell('ac_handO_' + anim, C['skin'], (0.95, 0.95, 1.0), loc=(3.4, -3.6, 7.0), parent=body)
        body.rotation_euler = (0, rad(lean), 0)
        head.rotation_euler = (0, rad(-6 if anim == 'throw' else 3), rad(-8))
        for o in bpy.data.objects:
            if o.name.startswith(('ac_candle_', 'ac_wax_', 'ac_wickt_', 'ac_drip_', 'ac_sleeve_', 'ac_hand_', 'ac_sleeveF_', 'ac_handO_')):
                o.hide_render = not o.name.endswith('_' + anim)
        bpy.context.view_layer.update()
        tipw = cg.matrix_world.translation
        ACOLYTE_TIPS[anim] = (round(24 + tipw.x / L.PX, 1), round(48 - tipw.z / L.PX, 1))
        sh.add(anim)
    print('acolyte candle tips (frame px):', ACOLYTE_TIPS)
    return sh


# ---------------------------------------------------------------------------------------------------------------
# HEDGEHOG
def make_hedgehog():
    new_scene()
    rt = root('hedgehog', yaw=-24)
    C = dict(body=cloth('hh_body', '#5e3e24', 0.55), spike=M('hh_spike', '#5a3a22', rough=0.3, spec=0.6),
             tip=M('hh_tip', '#b08858', rough=0.35, spec=0.5), face=skin('hh_face', '#e4c49a'), nose=gloss('hh_nose', '#1a1210', 0.15),
             foot=skin('hh_foot', '#c8a07a'), ear=skin('hh_ear', '#c89070'))
    body = grp('hh_body', rt)
    bc = (-0.6, 0, 4.4); br = (5.4, 4.2, 3.9)
    ell('hh_core', C['body'], br, loc=bc, parent=body, seg=32, n=18)
    # spikes: a coat of cones over the back half, swept backward, pale tips
    verts, faces, tverts, tfaces = [], [], [], []
    N = 58
    rng = np.random.default_rng(7)
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(N):
        zz = 1 - 2 * (i + 0.5) / N
        r_ = math.sqrt(1 - zz * zz); th = golden * i
        n = np.array([r_ * math.cos(th), r_ * math.sin(th), zz])
        if n[0] > 0.45 or n[2] < -0.15: continue
        if n[0] > 0.2 and n[2] < 0.25: continue
        base = np.array(bc) + n * np.array(br) * 0.92
        d = n + np.array([-0.9, 0, 0.35]); d /= np.linalg.norm(d)
        Ls = 4.6 + 1.0 * rng.random()
        rb = 1.45
        # local frame
        a_ = np.cross(d, [0, 0, 1.0]);
        if np.linalg.norm(a_) < 1e-3: a_ = np.array([1.0, 0, 0])
        a_ /= np.linalg.norm(a_); b_ = np.cross(d, a_)
        k0 = len(verts)
        for j in range(6):
            ang = TAU * j / 6
            verts.append(tuple(base + rb * (math.cos(ang) * a_ + math.sin(ang) * b_)))
        mid = base + d * Ls * 0.62
        for j in range(6):
            ang = TAU * j / 6
            verts.append(tuple(mid + rb * 0.42 * (math.cos(ang) * a_ + math.sin(ang) * b_)))
        for j in range(6):
            faces.append((k0 + j, k0 + (j + 1) % 6, k0 + 6 + (j + 1) % 6, k0 + 6 + j))
        # pale tip cone
        t0 = len(tverts)
        for j in range(6):
            ang = TAU * j / 6
            tverts.append(tuple(mid + rb * 0.42 * (math.cos(ang) * a_ + math.sin(ang) * b_)))
        tverts.append(tuple(base + d * Ls))
        for j in range(6):
            tfaces.append((t0 + j, t0 + (j + 1) % 6, t0 + 6))
    spikes = grp('hh_spikes', body)
    mesh('hh_spikemesh', verts, faces, C['spike'], spikes)
    mesh('hh_tipmesh', tverts, tfaces, C['tip'], spikes)
    # face
    head = grp('hh_head', body, loc=(3.4, 0, 3.6))
    ell('hh_face', C['face'], (3.2, 3.0, 2.8), loc=(0.6, 0, 0), parent=head, seg=24, n=14)
    ell('hh_snout', C['face'], (1.7, 1.3, 1.2), loc=(2.8, 0, -0.5), rot=(0, 8, 0), parent=head)
    ell('hh_nose', C['nose'], (0.75, 0.8, 0.75), loc=(4.4, 0, -0.55), parent=head)
    ell('hh_belly', C['face'], (4.2, 3.0, 1.8), loc=(-3.6, 0, -1.6), parent=head)
    for k, side in enumerate((-1, 1)):
        ell(f'hh_ear{k}', C['ear'], (0.6, 0.7, 0.8), loc=(-0.5, side * 2.4, 2.2), parent=head)
    add_face(head, (3.2, 3.0, 2.8), eyes=((50, 16), (6, 16)), eye_r=(0.7, 0.85, 1.2), mood='cross', brow_r=0.45,
             glint=0.34, prefix='hh')
    for k in range(2): bpy.data.objects[f'hh_eye{k}'].location.x += 0.6
    for k in range(2): bpy.data.objects[f'hh_gl{k}'].location.x += 0.6
    for k in range(2): bpy.data.objects[f'hh_brow{k}'].location.x += 0.6
    feet = []
    for k, (fx, side) in enumerate(((2.6, -1), (2.6, 1), (-3.2, -1), (-3.2, 1))):
        f = grp(f'hh_leg{k}', rt, loc=(fx, side * 2.3, 0))
        ell(f'hh_foot{k}', C['foot'], (1.2, 0.8, 0.7), loc=(0.4, 0, 0.6), parent=f)
        feet.append(f)
    sh = L.Sheet('hedgehog', 48, 52, 24, 48)
    for i in range(6):
        p = i / 6; ph = TAU * p
        body.location = (0, 0, 0.45 * (0.5 + 0.5 * math.cos(2 * ph)))
        body.rotation_euler = (rad(2 * math.sin(ph)), rad(1.5 * math.sin(2 * ph)), 0)
        spikes.rotation_euler = (0, rad(1.5 * math.sin(2 * ph - 0.8)), 0)
        for k, f in enumerate(feet):
            a = ph + (0 if k in (0, 3) else math.pi)
            f.location = (f.location[0] * 0 + (2.6 if k < 2 else -3.2) + 1.2 * math.sin(a), f.location[1], 0.6 * max(0, math.cos(a)))
        head.rotation_euler = (0, rad(2 * math.sin(2 * ph)), rad(-6))
        sh.add('walk')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# SLUG: fat glossy green bog slug with eyestalks; crawl undulation
def make_slug():
    new_scene()
    rt = root('slug', yaw=-20)
    C = dict(body=M('sl_body', '#5e9a34', rough=0.12, spec=0.7, coat=1.0, sss=0.15),
             foot=M('sl_foot', '#c0d27a', rough=0.18, spec=0.6, coat=0.8), spot=M('sl_spot', '#3c6a24', rough=0.15, coat=0.8),
             stalk=M('sl_stalk', '#78b244', rough=0.15, coat=1.0))
    body = grp('sl_body', rt)
    def bp(t):
        # t 0 = tail tip, 1 = head front
        x = -8.4 + t * 15.6
        rz = interp([(0, 0.0), (0.05, 1.1), (0.35, 3.1), (0.62, 3.9), (0.8, 3.8), (0.93, 3.0), (1.0, 0.0)], t)
        ry = interp([(0, 0.0), (0.05, 1.3), (0.35, 3.2), (0.7, 3.5), (0.93, 2.7), (1.0, 0.0)], t)
        cz = rz * 0.82 + 0.05
        return (x, rz, ry, cz)
    sl = lathe('sl_main', C['body'], profile(bp, 40), body, 32, axis='x')
    fp = lambda t: (-7.6 + t * 14.2, interp([(0, 0), (0.06, 0.55), (0.5, 0.7), (0.94, 0.6), (1, 0)], t),
                    interp([(0, 0), (0.06, 1.8), (0.5, 3.8), (0.9, 3.0), (1, 0)], t), 0.55)
    ft = lathe('sl_foot', C['foot'], profile(fp, 30), body, 28, axis='x')
    spots = []
    for k, (x, a, s) in enumerate(((-4.6, -35, 0.9), (-1.6, -50, 1.1), (1.4, -30, 1.0), (-2.8, 10, 0.8), (3.6, -55, 0.7), (0.2, 15, 0.9))):
        t = (x + 8.4) / 15.6
        _, rz, ry, cz = bp(t)
        y = -ry * math.sin(rad(-a)) if a < 0 else ry * math.sin(rad(a)) * -1
        z = cz + rz * math.cos(rad(a))
        y = ry * math.sin(rad(a))
        spots.append(ell(f'sl_spot{k}', C['spot'], (s, s * 0.8, 0.35), loc=(x, y, z), rot=(a, 0, 0), parent=body, seg=12, n=8))
    # eyestalks with dark eye bulbs and glints
    stalks = []
    for k, side in enumerate((-1, 1)):
        g = grp(f'sl_stalkg{k}', body, loc=(5.0, side * 1.6, 5.6))
        tube(f'sl_stalk{k}', C['stalk'], smooth_path([(0, 0, 0), (0.9, side * 0.3, 2.0), (2.0, side * 0.55, 3.6)], 8), [0.6, 0.55, 0.5, 0.48, 0.46, 0.45, 0.45, 0.45], g, seg=8)
        ell(f'sl_bulb{k}', C['stalk'], (0.85, 0.85, 0.85), loc=(2.1, side * 0.6, 3.9), parent=g)
        ell(f'sl_eye{k}', eye_mat(), (0.62, 0.62, 0.62), loc=(2.55, side * 0.6 - 0.3, 4.0), parent=g, seg=12, n=8)
        if k == 0:
            ell(f'sl_gl{k}', glint_mat(), (0.3, 0.3, 0.3), loc=(2.85, side * 0.6 - 0.75, 4.35), parent=g, seg=8, n=6)
        stalks.append(g)
    # lower tentacles + a smug mouth line
    for k, side in enumerate((-1, 1)):
        tube(f'sl_tent{k}', C['stalk'], [(6.8, side * 1.2, 1.6), (7.9, side * 1.5, 1.2)], 0.38, body, seg=6)
    tube('sl_mouth', M('sl_mouthm', '#2a3a14', rough=0.4), smooth_path([(7.0, -1.4, 0.75), (7.5, -0.6, 0.55), (7.7, 0.4, 0.7)], 6), 0.25, body, seg=6)
    # mood brows on the bulbs (cross)
    for k, side in enumerate((-1, 1)):
        g = stalks[k]
        tube(f'sl_brow{k}', eye_mat(), [(1.4, side * 0.6 - 0.75, 4.95), (2.55, side * 0.6 - 0.75, 4.45)], 0.26, g, seg=6)
    spot_base = [tuple(s.location) for s in spots]
    sh = L.Sheet('slug', 48, 52, 24, 48)
    for i in range(6):
        p = i / 6; ph = TAU * p
        def und(v, k_=1.0):
            x = v[:, 0]
            t = np.clip((x + 8.4) / 15.6, 0, 1)
            wave = np.sin(TAU * (t * 1.3) - ph)
            hgt = np.clip(v[:, 2] / 6.0, 0, 1)
            v[:, 2] += 0.45 * wave * hgt * k_
            v[:, 0] += 0.5 * math.sin(ph) * t - 0.3 * math.sin(ph)
            v[:, 1] *= 1 + 0.04 * wave
            return v
        deform(sl, und); deform(ft, lambda v: und(v, 0.2))
        for s, b0 in zip(spots, spot_base):
            s.location = tuple(und(np.array([b0]))[0])
        for k, g in enumerate(stalks):
            g.rotation_euler = (rad(4 * math.sin(ph + k)), rad(-6 * math.sin(ph - 0.8 + k * 0.6)), 0)
            g.location = tuple(und(np.array([[5.0, (-1.6, 1.6)[k], 5.6]]))[0])
        sh.add('walk')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# CROW: glossy black, yellow beak, red eye; fly 2 (wings up, wings down)
def make_crow():
    new_scene()
    rt = root('crow', yaw=-18)
    C = dict(body=M('cr_body', '#2c2838', rough=0.36, spec=0.5, coat=0.4), wing=M('cr_wing', '#1e1a28', rough=0.5, spec=0.3),
             beak=M('cr_beak', '#e8b03a', rough=0.25, spec=0.6, coat=0.6), eye=M('cr_eye', '#ff3a2a', rough=0.1, emit=(1.0, 0.2, 0.12, 1.5)),
             leg=M('cr_leg', '#3a3230', rough=0.5))
    body = grp('cr_body', rt, loc=(0, 0, 4.6), rot=(0, 8, 0))
    ell('cr_torso', C['body'], (4.2, 2.8, 2.7), parent=body, seg=28, n=16)
    head = grp('cr_head', body, loc=(4.0, 0, 1.3))
    ell('cr_skull', C['body'], (2.5, 2.3, 2.35), parent=head, seg=24, n=14)
    beak = grp('cr_beakg', head, loc=(1.8, 0, -0.25), rot=(0, 6, 0))
    lathe('cr_beak', C['beak'], [(0, 0, 0), (0, 0.95, 0.85), (1.4, 0.7, 0.62), (2.9, 0.18, 0.18), (3.2, 0, 0)], beak, 16, axis='x')
    tube('cr_gape', M('cr_gapem', '#7a5a1a', rough=0.4), [(0.1, -0.86, -0.05), (2.2, -0.42, -0.1)], 0.12, beak, seg=6)
    for k, az in enumerate((62, -50)):
        p = on_sphere((2.5, 2.3, 2.35), az, 14)
        ell(f'cr_eye{k}', C['eye'], (0.45, 0.75, 0.75), loc=p, rot=look_rot(p), parent=head, seg=12, n=8)
        ell(f'cr_pupil{k}', eye_mat(), (0.3, 0.35, 0.45), loc=tuple(np.array(p) * 1.12), rot=look_rot(p), parent=head, seg=8, n=6)
    # angry brow ridge
    tube('cr_brow', C['body'], [on_sphere(2.75, 85, 32), on_sphere(2.75, 58, 26), on_sphere(2.75, 30, 16)], 0.45, head, seg=8)
    # tail fan
    for k, (yy, rz) in enumerate(((-0.9, 14), (0, 0), (0.9, -14))):
        ell(f'cr_tail{k}', C['wing'], (2.8, 0.9, 0.35), loc=(-5.6, yy, -0.4), rot=(0, 12, rz), parent=body, seg=16, n=8)
    # legs tucked
    for k, side in enumerate((-1, 1)):
        tube(f'cr_leg{k}', C['leg'], [(0.4, side * 0.9, -2.2), (-0.8, side * 0.9, -3.4), (-1.9, side * 0.9, -3.5)], 0.32, body, seg=6)
    # wings: shoulder groups; the wing extends along -Y (near) / +Y (far)
    wings = []
    for k, side in enumerate((-1, 1)):
        g = grp(f'cr_wing{k}', body, loc=(0.8, side * 1.9, 1.0))
        inner = ell(f'cr_wingA{k}', C['wing'], (2.6, 3.6, 0.45), loc=(-0.6, side * 3.0, 0), parent=g, seg=20, n=10)
        for j in range(4):
            ang = rad(-18 + j * 12)
            ell(f'cr_prim{k}{j}', C['wing'], (1.9 - 0.1 * j, 0.8, 0.3),
                loc=(-1.4 - 0.9 * j, side * (6.1 + 0.4 * math.cos(ang)), 0), rot=(0, 0, side * (70 + 9 * j)), parent=g, seg=12, n=8)
        wings.append(g)
    sh = L.Sheet('crow', 48, 52, 24, 48)
    for f, (up, z) in enumerate(((True, 0.0), (False, 0.8))):
        for k, g in enumerate(wings):
            side = -1 if k == 0 else 1
            ang = 72 if up else -74
            g.rotation_euler = (rad(side * ang), rad(8 if up else -6), rad(side * (-12 if up else 8)))
        body.location = (0, 0, 4.6 + (-0.4 if up else 0.5))
        sh.add('fly')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# WASP: yellow-and-black "brimstone wasp", red eyes, stinger, glassy wings; fly 2
def make_wasp():
    new_scene()
    rt = root('wasp', yaw=-20)
    C = dict(yel=M('wa_yel', '#f0c42e', rough=0.2, spec=0.7, coat=0.8), blk=M('wa_blk', '#221a18', rough=0.22, spec=0.6, coat=0.6),
             eye=M('wa_eye', '#ff2a1a', rough=0.08, spec=0.9, coat=1.0, emit=(1.0, 0.15, 0.08, 1.2)),
             wing=M('wa_wing', '#d8f0ff', rough=0.06, spec=1.0, coat=1.0, emit=(0.75, 0.9, 1.0, 0.35)),
             vein=M('wa_vein', '#6a8090', rough=0.3), leg=M('wa_leg', '#2a201c', rough=0.4))
    body = grp('wa_body', rt, loc=(0, 0, 5.2))
    ell('wa_thorax', C['blk'], (2.2, 1.9, 2.0), loc=(0.6, 0, 0.4), parent=body, seg=24, n=14)
    ell('wa_thoraxY', C['yel'], (1.2, 1.5, 0.9), loc=(1.2, 0, 1.8), parent=body, seg=16, n=10)
    head = grp('wa_head', body, loc=(3.3, 0, 0.6))
    ell('wa_headm', C['yel'], (1.7, 1.9, 1.9), parent=head, seg=24, n=14)
    for k, az in enumerate((52, -40)):
        p = on_sphere((1.7, 1.9, 1.9), az, 10)
        ell(f'wa_eye{k}', C['eye'], (0.6, 0.85, 1.25), loc=p, rot=look_rot(p), parent=head, seg=14, n=10)
    ell('wa_gl', glint_mat(), (0.28, 0.28, 0.28), loc=tuple(np.array(on_sphere((1.7, 1.9, 1.9), 52, 10)) * 1.18 + np.array([0, -0.1, 0.5])), parent=head, seg=8, n=6)
    tube('wa_brow', C['blk'], [on_sphere(2.05, 80, 34), on_sphere(2.05, 50, 30), on_sphere(2.05, 22, 18)], 0.36, head, seg=6)
    tube('wa_mand', C['blk'], [(1.4, -0.5, -1.0), (1.9, -0.2, -1.5), (1.6, 0.3, -1.7)], 0.3, head, seg=6)
    for k, side in enumerate((-1, 1)):
        tube(f'wa_ant{k}', C['blk'], smooth_path([(0.9, side * 0.5, 1.5), (1.8, side * 0.9, 3.0), (3.2, side * 1.1, 3.6)], 6), 0.3, head, seg=6)
    # abdomen: banded segments along -X, tipped down, stinger
    ab = grp('wa_abd', body, loc=(-1.2, 0, 0.0), rot=(0, -22, 0))
    segs = [(0.0, 1.1, 'blk'), (0.9, 1.9, 'yel'), (2.2, 2.25, 'blk'), (3.4, 2.3, 'yel'), (4.6, 2.05, 'blk'), (5.6, 1.7, 'yel'), (6.5, 1.2, 'blk')]
    prof_x = [(0.0, 1.0), (1.0, 1.9), (2.4, 2.3), (4.0, 2.25), (5.6, 1.7), (6.8, 1.0), (7.5, 0.0)]
    edges = [0.0, 0.55, 1.6, 2.9, 4.0, 5.1, 6.1, 7.5]
    cols = ['blk', 'yel', 'blk', 'yel', 'blk', 'yel', 'blk']
    for k in range(7):
        a0, a1 = edges[k], edges[k + 1]
        rings = []
        if k == 0: rings.append((-a0, 0, 0))
        for j in range(7):
            s = a0 + (a1 - a0) * j / 6
            r_ = interp(prof_x, s)
            rings.append((-s, r_, r_ * 0.92))
        if k == 6: rings.append((-7.6, 0, 0))
        else: rings.append((-a1, 0, 0))
        if k > 0: rings.insert(0, (-a0, 0, 0))
        lathe(f'wa_seg{k}', C[cols[k]], rings, ab, 24, axis='x')
    lathe('wa_sting', C['blk'], [(-7.3, 0, 0), (-7.3, 0.4, 0.4), (-9.6, 0, 0)], ab, 10, axis='x')
    # legs dangling
    for k, (x, side) in enumerate(((1.4, -1), (0.4, -1), (-0.6, -1), (1.2, 1), (0.0, 1))):
        tube(f'wa_leg{k}', C['leg'], [(x, side * 1.2, -0.9), (x - 0.4, side * 1.9, -2.4), (x - 1.2, side * 1.7, -3.8)], 0.34, body, seg=6)
    # wings
    wings = []
    for k, side in enumerate((-1, 1)):
        g = grp(f'wa_wing{k}', body, loc=(0.6, side * 1.0, 2.1))
        ell(f'wa_wingA{k}', C['wing'], (2.0, 4.0, 0.12), loc=(-1.6, side * 3.4, 0), rot=(0, 0, side * -22), parent=g, seg=20, n=8)
        ell(f'wa_wingB{k}', C['wing'], (1.4, 2.8, 0.1), loc=(-2.6, side * 2.2, -0.2), rot=(0, 0, side * -45), parent=g, seg=16, n=8)
        tube(f'wa_vein{k}', C['vein'], [(0, 0, 0.1), (-1.2, side * 3.0, 0.12), (-2.2, side * 6.6, 0.1)], 0.16, g, seg=5)
        wings.append(g)
    sh = L.Sheet('wasp', 48, 52, 24, 48)
    for f, up in enumerate((True, False)):
        for k, g in enumerate(wings):
            side = -1 if k == 0 else 1
            ang = 62 if up else -8
            g.rotation_euler = (rad(side * ang), rad(-10), 0)
        body.location = (0, 0, 5.2 + (-0.3 if up else 0.3))
        ab.rotation_euler = (0, rad(-22 + (3 if up else -3)), 0)
        sh.add('fly')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# RIDER: the friar in a little wooden mine cart
def make_rider():
    new_scene()
    rt = root('rider', yaw=-30)
    C = friar_mats()
    C.update(wood=M('ri_wood', '#7a5a48', rough=0.4, spec=0.5, coat=0.3), wood_d=M('ri_wood_d', '#5a4034', rough=0.5),
             iron=metal('ri_iron', '#6a6a78', 0.4), iron_d=metal('ri_iron_d', '#4a4a56', 0.45))
    P = {}
    body = grp('ri_body', rt, loc=(0.2, 0, 3.0)); P['body'] = body
    rb, rp = robe('ri_robe', C['robe'], 13.0, [(0, 5.6), (0.4, 6.0), (0.72, 5.3), (0.88, 4.0), (1.0, 2.2)],
                  [(0, 0.3), (1, 0.0)], 0.93, body, z0=5.0)
    ell('ri_hood', C['robe_d'], (2.6, 3.6, 1.9), loc=(-2.6, 0, 12.2), rot=(0, -20, 0), parent=body)
    # arms reaching to the cart's front rim
    for k, side in enumerate((-1, 1)):
        pts = smooth_path([(0.0, side * 4.6, 11.0), (3.0, side * 4.6, 9.6), (6.4, side * 3.4, 9.8), (8.2, side * 2.8, 9.9)], 10)
        tube(f'ri_sleeve{k}', C['robe'], pts, [1.45, 1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.8, 1.8], body, seg=14)
        ell(f'ri_hand{k}', C['skin'], (1.05, 1.1, 1.0), loc=(8.9, side * 2.8, 9.9), parent=body)
    head = friar_head(P, C, body, z=16.0, prefix='ri')
    head.rotation_euler = (0, rad(3), rad(-6))
    # cart: tapered box with planks, iron bands and four little wheels
    cart = grp('ri_cart', rt)
    box('ri_cartcore', C['wood_d'], (17.0, 9.6, 8.6), loc=(0, 0, 6.9), parent=cart, bevel=0.4, taper=(1.13, 1.12))
    for j in range(3):
        z = 3.9 + j * 2.75
        w = 17.0 + (z - 2.6) / 8.6 * 2.2
        box(f'ri_plank{j}', C['wood'], (w, 0.5, 2.45), loc=(0, -4.9 - (z - 2.6) / 8.6 * 0.6, z), rot=(4, 0, 0), parent=cart, bevel=0.22)
        box(f'ri_plankf{j}', C['wood'], (0.5, 9.6 + (z - 2.6) / 8.6 * 1.2, 2.45), loc=(8.6 + (z - 2.6) / 8.6 * 1.1, 0, z), rot=(0, 7, 0), parent=cart, bevel=0.22)
    # rim band and straps
    box('ri_rim', C['iron'], (19.6, 11.3, 0.9), loc=(0, 0, 11.0), parent=cart, bevel=0.3)
    box('ri_rimhole', C['wood_d'], (17.6, 9.3, 1.0), loc=(0, 0, 11.15), parent=cart, bevel=0.1)
    for x in (-6.5, 0.0, 6.5):
        box(f'ri_strap{x}', C['iron_d'], (1.1, 0.4, 8.4), loc=(x, -5.45, 6.9), rot=(4, 0, 0), parent=cart, bevel=0.15)
        for z in (4.0, 9.6):
            ell(f'ri_rivet{x}{z}', C['iron'], (0.35, 0.3, 0.35), loc=(x, -5.65 - (z - 2.6) / 8.6 * 0.5, z), parent=cart, seg=8, n=6)
    box('ri_base', C['iron_d'], (16.6, 8.6, 1.0), loc=(0, 0, 2.6), parent=cart, bevel=0.3)
    for k, (x, y) in enumerate(((-5.6, -5.6), (5.6, -5.6), (-5.6, 5.6), (5.6, 5.6))):
        wg = grp(f'ri_wheel{k}', cart, loc=(x, y, 2.3), rot=(90, 0, 0))
        lathe(f'ri_wh{k}', C['iron_d'], [(-0.7, 0, 0), (-0.7, 2.2, 2.2), (-0.5, 2.35, 2.35), (0.5, 2.35, 2.35), (0.7, 2.2, 2.2), (0.7, 0, 0)], wg, 24)
        lathe(f'ri_hub{k}', C['iron'], [(-0.9, 0, 0), (-0.9, 0.8, 0.8), (-0.75, 0, 0)], wg, 12)
    sh = L.Sheet('rider', 48, 52, 24, 48)
    sh.add('idle')
    return sh


# ---------------------------------------------------------------------------------------------------------------
# WITCHFINDER (on foot fleeing, and on the Ducking Engine)
def finder_mats():
    return dict(coat=M('wf_coat', '#2a2638', rough=0.4, spec=0.5), coat_hi=M('wf_coat2', '#38344a', rough=0.45),
                skin=skin('wf_skin', '#e4b896'), hat=M('wf_hat', '#18161f', rough=0.35, spec=0.6),
                band=M('wf_band', '#4a4458', rough=0.4), gold=metal('wf_gold', '#e8c050', 0.25),
                collar=M('wf_collar', '#ece6d6', rough=0.45), stache=M('wf_stache', '#4a3a3e', rough=0.6),
                boot=gloss('wf_boot', '#1a1418', 0.25), hose=M('wf_hose', '#3a3446', rough=0.5),
                nose=skin('wf_nose', '#e8a888'), mouth=M('wf_mouth', '#3a1218', rough=0.5))


def finder_head(parent, C, loc, prefix, laugh=False):
    head = grp(prefix + '_head', parent, loc=loc)
    hr = (3.9, 3.7, 4.0)
    ell(prefix + '_skull', C['skin'], hr, parent=head, seg=32, n=20)
    ell(prefix + '_hairb', M('wf_hair', '#3a3036', rough=0.6), (3.0, 3.6, 2.6), loc=(-1.6, 0, -0.4), parent=head)
    ell(prefix + '_ear', C['skin'], (0.75, 0.5, 1.15), loc=(-0.6, -3.6, -0.4), parent=head)
    # long pointed nose
    lathe(prefix + '_nose', C['nose'], [(0, 0, 0), (0, 1.0, 0.85), (1.4, 0.75, 0.6), (2.5, 0.35, 0.35), (2.8, 0, 0)],
          grp(prefix + '_noseg', head, loc=on_sphere(np.array(hr) - 0.6, 24, -6), rot=(0, 18, -24)), 14, axis='x')
    # moustache: two drooping curls under the nose
    base = np.array(on_sphere(np.array(hr) + 0.1, 24, -24))
    for k, d in enumerate((1, -1)):
        tgt = np.array(on_sphere(np.array(hr) + 0.1, 24 + d * 26, -36))
        mid = (base + tgt) / 2 + np.array([0.4, 0, 0.3])
        tube(f'{prefix}_stache{k}', C['stache'], smooth_path([base, mid, tgt, tgt + np.array([-0.2, 0, -0.9])], 9),
             [0.75, 0.72, 0.66, 0.58, 0.5, 0.44, 0.38, 0.32, 0.26], head, seg=8)
    parts = add_face(head, hr, eyes=((44, 8), (2, 8)), eye_r=(0.62, 0.8, 1.15), brow_r=0.55,
                     brow_m=M('wf_brow', '#2a2026', rough=0.6), prefix=prefix, mood='cross')
    if laugh:
        ell(prefix + '_mouthO', C['mouth'], (0.9, 1.6, 1.1), loc=on_sphere(np.array(hr) - 0.55, 24, -42), parent=head)
    else:
        mouth(head, hr, 38, 10, -44, curve=-1.0, prefix=prefix)
    return head, hr, parts


def make_finder():
    new_scene()
    rt = root('finder', yaw=-26)
    C = finder_mats()
    body = grp('fi_body', rt, loc=(0, 0, 0))
    torso = grp('fi_torso', body, loc=(0, 0, 10.0))
    coat, cp = robe('fi_coat', C['coat'], 11.0, [(0, 4.6), (0.12, 4.4), (0.45, 3.5), (0.6, 3.6), (0.8, 3.9), (0.92, 3.2), (1.0, 1.8)],
                    [(0, -0.4), (0.5, 0.0), (1, 0.3)], 0.86, torso, z0=-5.0)
    # buttons and collar
    for i, u in enumerate((0.5, 0.62, 0.74, 0.86)):
        z, rx, ry, cx = cp(u)
        ell(f'fi_btn{i}', C['gold'], (0.3, 0.38, 0.38), loc=(cx + rx + 0.05, -0.5, z), parent=torso, seg=8, n=6)
    ring('fi_collar', C['collar'], 2.2, 2.0, 0.5, z=11.2, cx=0.3, parent=torso, seg=8)
    box('fi_bands', C['collar'], (0.5, 3.0, 2.2), loc=(2.3, -0.2, 10.2), rot=(0, -16, 0), parent=torso, bevel=0.2)
    head, hr, _ = finder_head(torso, C, (0.8, 0, 14.6), 'fi')
    hat = capotain('fi_hat', head, (-0.3, 0, 2.7), C['hat'], C['band'], C['gold'], crown_h=8.4, r0=3.6, r1=3.0, brim=5.6,
                   rot=(0, -14, 0), buckle_az=34)
    # legs: hips at torso z 0; thighs, shins, boots
    legs = []
    for k, side in enumerate((-1, 1)):
        hip = grp(f'fi_hip{k}', body, loc=(0, side * 1.7, 10.2))
        knee = grp(f'fi_knee{k}', hip, loc=(0, 0, -5.0))
        tube(f'fi_thigh{k}', C['hose'], [(0, 0, 0.5), (0, 0, -5.0)], [1.35, 1.1], hip, seg=10)
        tube(f'fi_shin{k}', C['hose'], [(0, 0, 0), (0, 0, -4.4)], [1.05, 0.9], knee, seg=10)
        ankle = grp(f'fi_ankle{k}', knee, loc=(0, 0, -4.6))
        ell(f'fi_boot{k}', C['boot'], (2.0, 1.15, 0.9), loc=(0.7, 0, -0.2), parent=ankle)
        lathe(f'fi_cuff{k}', C['boot'], [(-0.6, 0, 0), (-0.6, 1.2, 1.2), (1.6, 1.35, 1.35), (1.6, 0, 0)], ankle, 14)
        legs.append((hip, knee, ankle))
    arms = []
    for k, side in enumerate((-1, 1)):
        sh_ = grp(f'fi_sh{k}', torso, loc=(0.0, side * 3.3, 8.6))
        el = grp(f'fi_el{k}', sh_, loc=(0, 0, -3.6))
        tube(f'fi_upper{k}', C['coat'], [(0, 0, 0.4), (0, 0, -3.6)], [1.3, 1.2], sh_, seg=10)
        tube(f'fi_fore{k}', C['coat'], [(0, 0, 0), (0, 0, -3.2)], [1.15, 1.25], el, seg=10)
        ell(f'fi_hand{k}', C['skin'], (0.95, 0.95, 1.0), loc=(0, 0, -4.1), parent=el)
        arms.append((sh_, el))
    sh = L.Sheet('finder', 40, 48, 20, 44)
    for i in range(4):
        p = i / 4; ph = TAU * p
        lean = 14
        bob = 0.9 * abs(math.cos(ph))
        body.location = (0, 0, bob - 0.4)
        torso.rotation_euler = (0, rad(lean), 0)
        for k, (hip, knee, ankle) in enumerate(legs):
            a = ph + (0 if k == 0 else math.pi)
            hip.rotation_euler = (0, rad(-38 * math.sin(a)), 0)
            knee.rotation_euler = (0, rad(20 + 40 * max(0.0, -math.cos(a + 0.6))), 0)
            ankle.rotation_euler = (0, rad(-10 * math.sin(a)), 0)
        for k, (s_, e_) in enumerate(arms):
            a = ph + (math.pi if k == 0 else 0)
            s_.rotation_euler = (rad(-8 if k == 0 else 8), rad(-40 * math.sin(a) - 10), 0)
            e_.rotation_euler = (0, rad(-70), 0)
        # coat tails flap back
        flap = 1.4 + 0.6 * math.sin(2 * ph)
        def cfn(v):
            u = np.clip((v[:, 2] + 5.0) / 16.0, 0, 1)
            w = np.clip(1 - u / 0.45, 0, 1) ** 1.5
            v[:, 0] -= flap * w
            v[:, 2] += 0.6 * flap * w * (v[:, 0] < 0)
            return v
        deform(coat, cfn)
        head.rotation_euler = (0, rad(-10), rad(-14))
        hat.rotation_euler = (0, rad(-14 - 4 * math.sin(2 * ph)), 0)
        sh.add('run')
    return sh


BOSS_PIVOT = (14.0, 36.0)       # arm pivot, px from the boss origin (x right, z up)
ARM_ANGLES = [-14, -27, -40, -53, -66, -43, -20, 3, 26]

def boss_mats():
    C = finder_mats()
    C.update(wood=M('bo_wood', '#8a5a32', rough=0.42, spec=0.5, coat=0.25), wood2=M('bo_wood2', '#7a4e2c', rough=0.45, spec=0.5, coat=0.25),
             dark=M('bo_dark', '#4a2e1a', rough=0.55), iron=metal('bo_iron', '#7a7e8c', 0.38), iron_d=metal('bo_iron_d', '#4e505c', 0.42),
             bell=metal('bo_bell', '#d8a840', 0.22), seat=M('bo_seat', '#7a2a34', rough=0.5, spec=0.4, sss=0.0),
             paint_w=M('bo_eyew', '#e8d8a8', rough=0.5), paint_i=M('bo_eyei', '#3a2a6a', rough=0.45), paint_p=M('bo_eyep', '#140c14', rough=0.4),
             red=M('bo_red', '#b02a2a', rough=0.45), knob=gloss('bo_knob', '#a01e22', 0.2))
    return C


def build_wheel(name, parent, C, loc, R=11.0):
    wg = grp(name, parent, loc=loc, rot=(90, 0, 0))
    spin = grp(name + '_spin', wg)
    ring(name + '_felloe', C['wood'], R - 1.9, R - 1.9, 1.25, parent=spin, seg=10, n=56)
    tyre = ring(name + '_tyre', C['iron_d'], R - 0.55, R - 0.55, 0.62, parent=spin, seg=8, n=64)
    tyre.scale = (1, 1, 2.2)
    for i in range(8):
        a = TAU * i / 8
        m_ = C['red'] if i == 0 else C['wood2']
        tube(f'{name}_spoke{i}', m_, [(2.0 * math.cos(a), 2.0 * math.sin(a), 0), (R - 2.2) * np.array([math.cos(a), math.sin(a), 0])], [0.85, 0.65], spin, seg=8, caps=False)
        ell(f'{name}_bolt{i}', C['iron'], (0.4, 0.4, 0.4), loc=((R - 0.6) * math.cos(a + TAU / 16), (R - 0.6) * math.sin(a + TAU / 16), 1.25), parent=spin, seg=8, n=6)
    lathe(name + '_hub', C['dark'], [(-1.8, 0, 0), (-1.8, 2.2, 2.2), (1.4, 2.4, 2.4), (1.8, 1.9, 1.9), (1.8, 0, 0)], spin, 20)
    lathe(name + '_cap', C['iron'], [(1.6, 0, 0), (1.6, 1.4, 1.4), (2.4, 1.1, 1.1), (2.7, 0, 0)], spin, 16)
    # painted red marker on the felloe so the turn reads
    tube(name + '_mark', C['red'], [((R - 1.9) * math.cos(a), (R - 1.9) * math.sin(a), 1.0) for a in np.linspace(-0.25, 0.25, 6)], 0.5, spin, seg=6)
    return wg, spin


def make_boss():
    new_scene()
    C = boss_mats()
    rt = root('boss', yaw=0)
    wagon = grp('bo_wagon', rt)
    # chassis + box
    box('bo_core', C['dark'], (58.0, 13.0, 20.6), loc=(0, 0, 23.7), parent=wagon, bevel=0.6)
    for j in range(4):
        z = 15.6 + j * 5.15
        box(f'bo_plank{j}', C['wood'] if j % 2 == 0 else C['wood2'], (59.6, 1.2, 4.85), loc=(0, -6.7, z), parent=wagon, bevel=0.45)
        box(f'bo_plankb{j}', C['wood'] if j % 2 == 0 else C['wood2'], (1.2, 13.4, 4.85), loc=(29.6, 0, z), parent=wagon, bevel=0.45)
        box(f'bo_planka{j}', C['wood'] if j % 2 == 0 else C['wood2'], (1.2, 13.4, 4.85), loc=(-29.6, 0, z), parent=wagon, bevel=0.45)
    box('bo_chassis', C['dark'], (64.0, 10.0, 2.2), loc=(0, 0, 12.6), parent=wagon, bevel=0.4)
    # iron bands: top + bottom rails, vertical straps with rivets
    box('bo_railT', C['iron'], (61.2, 14.2, 1.5), loc=(0, 0, 34.0), parent=wagon, bevel=0.4)
    box('bo_railB', C['iron_d'], (61.2, 14.0, 1.3), loc=(0, 0, 13.6), parent=wagon, bevel=0.35)
    for x in (-21.5, -9.0, 9.0, 21.5):
        box(f'bo_strap{x}', C['iron_d'], (1.8, 0.5, 20.0), loc=(x, -7.45, 23.8), parent=wagon, bevel=0.2)
        for z in (16.0, 23.8, 31.6):
            ell(f'bo_rv{x}_{z}', C['iron'], (0.5, 0.4, 0.5), loc=(x, -7.75, z), parent=wagon, seg=8, n=6)
    # painted eye on the side
    eg = grp('bo_eye', wagon, loc=(0.0, -7.35, 23.8), rot=(90, 0, 0))
    lathe('bo_eyeW', C['paint_w'], [(0, 0, 0), (0, 6.4, 3.6), (0.18, 6.2, 3.4), (0.22, 0, 0)], eg, 40)
    ring('bo_eyeL', C['paint_p'], 6.3, 3.55, 0.35, z=0.15, parent=eg, seg=6, n=48)
    lathe('bo_eyeI', C['paint_i'], [(0.15, 0, 0), (0.15, 2.6, 2.6), (0.3, 2.5, 2.5), (0.34, 0, 0)], eg, 28)
    lathe('bo_eyeP', C['paint_p'], [(0.3, 0, 0), (0.3, 1.2, 1.4), (0.42, 0, 0)], eg, 20)
    ell('bo_eyeG', M('bo_eyeg', '#ffffff', rough=0.3), (0.55, 0.55, 0.1), loc=(-0.9, 0.9, 0.45), parent=eg, seg=10, n=6)
    for k, a in enumerate(np.linspace(0.35, math.pi - 0.35, 5)):
        tube(f'bo_lash{k}', C['paint_p'], [(6.0 * math.cos(a) * 0.98, 3.4 * math.sin(a), 0.2), (7.4 * math.cos(a), 5.0 * math.sin(a), 0.2)], 0.3, eg, seg=5)
    # wheels
    wheels = []
    for k, (wx, wy) in enumerate(((-18.0, -7.9), (18.0, -7.9), (-18.0, 7.9), (18.0, 7.9))):
        wheels.append(build_wheel(f'bo_wheel{k}', wagon, C, (wx, wy, 11.0)))
    for wx in (-18.0, 18.0):
        tube(f'bo_axle{wx}', C['iron_d'], [(wx, -8, 11.0), (wx, 8, 11.0)], 1.0, wagon, seg=10)
    # chimney at the back
    lathe('bo_chim', C['iron_d'], [(34.5, 0, 0, -24.0), (34.5, 2.4, 2.4, -24.0), (51.0, 2.2, 2.2, -24.0), (52.5, 2.0, 2.0, -24.0),
                                   (54.0, 3.4, 3.4, -24.0), (56.0, 3.6, 3.6, -24.0), (56.4, 3.0, 3.0, -24.0), (56.4, 0, 0, -24.0)], wagon, 24)
    ring('bo_chimband', C['iron'], 2.5, 2.5, 0.45, z=42.0, cx=-24.0, parent=wagon, seg=6)
    ring('bo_chimband2', C['iron'], 2.45, 2.45, 0.45, z=48.0, cx=-24.0, parent=wagon, seg=6)
    ring('bo_chimsoot', M('bo_soot', '#18141a', rough=0.9), 2.7, 2.7, 0.5, z=56.2, cx=-24.0, parent=wagon, seg=6)
    # bell frame
    for x in (-16.5, -7.5):
        box(f'bo_post{x}', C['dark'], (1.6, 1.6, 16.5), loc=(x, 0, 43.0), parent=wagon, bevel=0.3)
    box('bo_beam', C['dark'], (11.6, 1.8, 1.8), loc=(-12.0, 0, 51.6), parent=wagon, bevel=0.35)
    bell = grp('bo_bell', wagon, loc=(-12.0, 0, 50.6))
    lathe('bo_bellm', C['bell'], [(0.2, 0, 0), (0.2, 1.2, 1.2), (-1.0, 2.0, 2.0), (-3.6, 2.4, 2.4), (-5.4, 3.4, 3.4), (-6.0, 3.6, 3.6), (-6.0, 0, 0)], bell, 28)
    ell('bo_clapper', C['iron_d'], (0.8, 0.8, 0.8), loc=(0, 0, -6.2), parent=bell)
    # pivot bracket at the front: two iron cheek plates on a block, pivot at BOSS_PIVOT
    px_, pz_ = BOSS_PIVOT
    box('bo_brk', C['dark'], (6.0, 8.0, 3.2), loc=(px_, 0, 35.6), parent=wagon, bevel=0.4)
    for y in (-3.6, 3.6):
        box(f'bo_cheek{y}', C['iron_d'], (4.6, 0.8, 5.4), loc=(px_, y, 36.6), parent=wagon, bevel=0.25)
    # seat
    box('bo_seatbase', C['dark'], (8.6, 9.0, 2.0), loc=(-0.8, 0, 35.8), parent=wagon, bevel=0.3)
    box('bo_cushion', C['seat'], (8.0, 8.4, 1.8), loc=(-0.6, 0, 37.4), parent=wagon, bevel=0.6, segs=3)
    box('bo_back', C['seat'], (1.9, 8.4, 10.0), loc=(-5.2, 0, 42.0), rot=(0, -8, 0), parent=wagon, bevel=0.6, segs=3)
    for y in (-4.2, 4.2):
        ell(f'bo_finial{y}', C['bell'], (0.8, 0.8, 0.8), loc=(-5.9, y, 47.4), parent=wagon)
    # lever
    lev = grp('bo_lever', wagon, loc=(7.6, -6.4, 35.0), rot=(0, 16, 0))
    tube('bo_leverrod', C['iron_d'], [(0, 0, 0), (0, 0, 7.4)], 0.5, lev, seg=8)
    ell('bo_leverknob', C['knob'], (1.0, 1.0, 1.0), loc=(0, 0, 7.8), parent=lev)
    box('bo_leverbase', C['iron_d'], (2.6, 1.4, 1.2), loc=(7.6, -6.4, 35.0), parent=wagon, bevel=0.3)
    # the Witchfinder, seated
    man = grp('bo_man', wagon, loc=(-0.6, 0, 38.0), rot=(0, 0, -16))
    torso = grp('bo_torso', man, rot=(0, -4, 0))
    coat, cp = robe('bo_coat', C['coat'], 10.4, [(0, 3.9), (0.3, 3.6), (0.6, 3.8), (0.82, 3.7), (0.93, 3.0), (1.0, 1.7)],
                    [(0, 0.0), (1, 0.3)], 0.88, torso, z0=0.0)
    for i, u in enumerate((0.3, 0.45, 0.6, 0.75)):
        z, rx, ry, cx = cp(u)
        ell(f'bo_btn{i}', C['gold'], (0.3, 0.38, 0.38), loc=(cx + rx + 0.05, -0.4, z), parent=torso, seg=8, n=6)
    ring('bo_collar', C['collar'], 2.2, 2.0, 0.5, z=10.6, cx=0.3, parent=torso, seg=8)
    box('bo_bands', C['collar'], (0.5, 3.0, 2.2), loc=(2.2, -0.2, 9.6), rot=(0, -16, 0), parent=torso, bevel=0.2)
    # coat skirt over the thighs
    for k, side in enumerate((-1, 1)):
        tube(f'bo_thigh{k}', C['coat'], [(0.0, side * 1.9, 0.6), (5.4, side * 2.0, 0.4)], [1.7, 1.45], man, seg=12)
        tube(f'bo_shin{k}', C['hose'], [(5.6, side * 2.0, 0.2), (6.4, side * 2.0, -3.6)], [1.15, 0.95], man, seg=10)
        ell(f'bo_boot{k}', C['boot'], (2.0, 1.15, 0.9), loc=(7.0, side * 2.0, -3.9), parent=man)
    headg = grp('bo_headpivot', torso, loc=(0.6, 0, 11.4))
    heads = {}
    for mode in ('stern', 'laugh'):
        h, hr, parts = finder_head(headg, C, (0.4, 0, 2.6), 'bo' + mode, laugh=(mode == 'laugh'))
        capotain('bo' + mode + '_hat', h, (-0.3, 0, 2.7), C['hat'], C['band'], C['gold'], crown_h=8.6, r0=3.6, r1=3.0,
                 brim=5.6, rot=(0, -6, 0), buckle_az=34)
        heads[mode] = h
    # near arm to the lever knob (solved in torso space), far arm on the knee
    bpy.context.view_layer.update()
    knob_w = bpy.data.objects['bo_leverknob'].matrix_world.translation
    kl = torso.matrix_world.inverted() @ knob_w
    hand = (kl.x - 0.5, kl.y + 0.2, kl.z + 0.2)
    elbow = (3.4, -4.6, 5.0)
    tube('bo_armN', C['coat'], smooth_path([(0.4, -3.4, 9.0), elbow, (hand[0] - 0.9, hand[1], hand[2] - 0.2)], 9),
         [1.3, 1.25, 1.2, 1.2, 1.2, 1.2, 1.25, 1.3, 1.3], torso, seg=10)
    ell('bo_handN', C['skin'], (1.1, 1.05, 1.1), loc=hand, parent=torso)
    tube('bo_armF', C['coat'], smooth_path([(0.4, 3.4, 9.0), (2.6, 4.2, 5.0), (5.0, 3.2, 2.2)], 9), 1.2, torso, seg=10)
    ell('bo_handF', C['skin'], (1.0, 1.0, 1.0), loc=(5.4, 3.0, 1.8), parent=torso)
    sh = L.Sheet('boss', 140, 96, 70, 92)
    for anim in ('body', 'laugh'):
        for mode, h in heads.items():
            for o in [h] + list(h.children_recursive): o.hide_render = (mode == 'laugh') != (anim == 'laugh')
        for i in range(8):
            p = i / 8
            for wg, spin in wheels:
                spin.rotation_euler = (0, 0, -TAU * p)
            bell.rotation_euler = (0, rad(7 * math.sin(TAU * p)), 0)
            if anim == 'laugh':
                man.location = (-0.6, 0, 38.0 + 0.5 * abs(math.sin(TAU * p * 2)))
                headg.rotation_euler = (0, rad(-24 - 7 * math.sin(TAU * p * 2)), 0)
            else:
                man.location = (-0.6, 0, 38.0 + 0.3 * math.sin(TAU * p * 2 + 0.6))
                headg.rotation_euler = (0, rad(1.5 * math.sin(TAU * p)), 0)
            sh.add(anim)
    # record the arm pivot in the frame
    sh.pivot = (70 + px_, 92 - pz_)
    arm = make_boss_arm()
    return [sh, arm]


def make_boss_arm():
    new_scene()
    C = boss_mats()
    rt = root('boss_arm', yaw=0)
    beam = grp('ar_beam', rt)
    box('ar_wood', C['wood'], (47.0, 3.0, 3.4), loc=(19.5, 0, 0), parent=beam, bevel=0.5)
    for x in (6.0, 20.0, 34.0):
        box(f'ar_band{x}', C['iron_d'], (1.4, 3.5, 3.9), loc=(x, 0, 0), parent=beam, bevel=0.25)
        ell(f'ar_rv{x}', C['iron'], (0.45, 0.4, 0.45), loc=(x, -1.85, 0), parent=beam, seg=8, n=6)
    box('ar_cap', C['iron_d'], (2.4, 3.6, 4.0), loc=(42.4, 0, 0), parent=beam, bevel=0.3)
    lathe('ar_hub', C['iron_d'], [(-2.2, 0, 0), (-2.2, 2.6, 2.6), (2.2, 2.6, 2.6), (2.2, 0, 0)], grp('ar_hubg', beam, rot=(90, 0, 0)), 24)
    lathe('ar_bolt', C['iron'], [(2.2, 0, 0), (2.2, 1.3, 1.3), (3.0, 1.0, 1.0), (3.2, 0, 0)], grp('ar_boltg', beam, rot=(90, 0, 0)), 16)
    hook = grp('ar_hook', beam, loc=(42.0, 0, -1.8))
    ring('ar_eye', C['iron'], 0.8, 0.8, 0.32, parent=grp('ar_eyeg', hook, loc=(0, 0, -0.4), rot=(90, 0, 0)), seg=6, n=16)
    # chain + chair hang from the hook and stay vertical (counter-rotate)
    hang = grp('ar_hang', hook)
    for j in range(4):
        lg = grp(f'ar_link{j}', hang, loc=(0, 0, -1.6 - j * 1.55), rot=(0, 0, 90 * (j % 2)))
        lk = ring(f'ar_linkm{j}', C['iron'], 0.55, 0.55, 0.3, parent=grp(f'ar_linkr{j}', lg, rot=(90, 0, 0)), seg=6, n=14)
        lk.scale = (1, 1.55, 1)
    chair = grp('ar_chair', hang, loc=(0, 0, -6.6))
    tube('ar_bridleA', C['iron'], [(0, 0, 0), (-4.4, -0.4, -2.6)], 0.32, chair, seg=5)
    tube('ar_bridleB', C['iron'], [(0, 0, 0), (4.2, -0.4, -6.6)], 0.32, chair, seg=5)
    box('ar_back', C['wood'], (1.9, 7.2, 10.4), loc=(-4.4, 0, -7.8), rot=(0, -4, 0), parent=chair, bevel=0.35)
    box('ar_seat', C['wood2'], (9.8, 7.2, 1.9), loc=(0, 0, -12.4), parent=chair, bevel=0.35)
    for y in (-3.3, 3.3):
        box(f'ar_arm{y}', C['wood'], (9.0, 1.1, 1.2), loc=(0.2, y, -7.2), parent=chair, bevel=0.25)
        box(f'ar_post{y}', C['wood'], (1.2, 1.1, 4.6), loc=(4.2, y, -9.6), parent=chair, bevel=0.25)
        for x in (-4.0, 4.0):
            box(f'ar_leg{x}{y}', C['dark'], (1.3, 1.2, 3.4), loc=(x, y * 0.9, -14.8), parent=chair, bevel=0.25)
    for z in (-4.4, -10.4):
        box(f'ar_bstrap{z}', C['iron_d'], (2.3, 7.6, 0.8), loc=(-4.4, 0, z), parent=chair, bevel=0.15)
    box('ar_sstrap', C['iron_d'], (10.2, 7.6, 0.7), loc=(0, 0, -11.6), parent=chair, bevel=0.15)
    ell('ar_shackle', C['iron'], (0.6, 0.6, 0.6), loc=(0, 0, 0), parent=chair, seg=8, n=6)
    sh = L.Sheet('boss_arm', 96, 96, 48, 48)
    prev = ARM_ANGLES[0]
    for k, a in enumerate(ARM_ANGLES):
        beam.rotation_euler = (0, rad(a), 0)
        vel = a - prev; prev = a
        swing = max(-18, min(18, -vel * 0.6))
        hang.rotation_euler = (0, rad(-a + swing), 0)
        sh.add('arm')
    sh.angles = ARM_ANGLES
    return sh


# ---------------------------------------------------------------------------------------------------------------
BUILDERS = {'friar': make_friar, 'deacon': make_deacon, 'bishop': make_bishop, 'acolyte': make_acolyte,
            'hedgehog': make_hedgehog, 'slug': make_slug, 'crow': make_crow, 'wasp': make_wasp, 'rider': make_rider,
            'finder': make_finder, 'boss': make_boss}


def save_extra(sh):
    """Extra metadata the game can use: boss arm pivot, arm angles, acolyte candle tips."""
    path = os.path.join(L.ART, sh.name + '.json')
    meta = json.load(open(path))
    if getattr(sh, 'pivot', None): meta['armPivot'] = list(sh.pivot)
    if getattr(sh, 'angles', None): meta['angles'] = list(sh.angles)
    if sh.name == 'acolyte' and ACOLYTE_TIPS: meta['candleTip'] = {k: list(v) for k, v in ACOLYTE_TIPS.items()}
    with open(path, 'w') as fh: json.dump(meta, fh, indent=1)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = [a for a in argv if not a.startswith('-')] or list(BUILDERS)
    t0 = time.time(); total = 0
    for n in names:
        t = time.time()
        sheets = BUILDERS[n]()
        for sh in (sheets if isinstance(sheets, (list, tuple)) else [sheets]):
            sh.save(); save_extra(sh); preview(sh)
            total += sum(len(v) for v in sh.anims.values())
        if os.environ.get('TT_HIRES'):
            sc = bpy.context.scene
            sc.render.resolution_x *= 4; sc.render.resolution_y *= 4
            hp = os.path.join(PREVIEW_DIR, n + '_hires.png')
            sc.render.filepath = hp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(hp)
            w, h = img.size
            px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
            bpy.data.images.remove(img)
            occ = px[..., 3] > 0.01
            ys, xs = np.nonzero(occ)
            px = px[max(0, ys.min() - 8):ys.max() + 8, max(0, xs.min() - 8):xs.max() + 8]
            a = px[..., 3:4]
            halves = [(px[..., :3] * a + np.array(bg) / 255 * (1 - a)) for bg in ((34, 28, 48), (150, 196, 226))]
            write_png(hp, (np.clip(np.concatenate(halves, axis=1), 0, 1) * 255).astype(np.uint8))
        print(f'[{n}] {time.time() - t:.1f}s')
    print(f'done: {total} frames in {time.time() - t0:.1f}s')


main()
