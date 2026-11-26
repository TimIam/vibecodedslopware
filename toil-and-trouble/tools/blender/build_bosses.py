"""build_bosses.py: pre-rendered 3D boss sprites for Toil & Trouble's seven holiday worlds.

Same pipeline and style as build_enemies.py (whose modelling helpers, materials, faces and contrast light rig are
reused: its source is executed here minus the trailing main() call). Everything is built in GAME PIXEL units under
a root empty scaled by spritelib.PX; origin = feet/base centre, facing +X, Z up, a 20-26 degree turn toward the
camera so both eyes read.

Every sheet: 128 x 112 frames, origin (64, 108), rows idle 4, move 6, attack 4, hurt 1, jump 1. Attack frames 0-2
wind up and frame 3 is the strike/release.

Run headless (all bosses, or name some):
    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
        --python build_bosses.py -- [gourd kaboom goldgrip egg cupid gobble sleigh]
Writes art/boss_<name>.png + .json, and previews (dark | bright background, 2x, plus a 4x zoom of key frames)
into PREVIEW_DIR (env TT_PREVIEW_DIR overrides).
"""
import bpy, sys, os, math, time, json
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
sys.dont_write_bytecode = True     # keep tools/blender free of __pycache__
import spritelib as L

# ---- reuse build_enemies.py's helpers without running its main() ----------------------------------------------
_EN = os.path.join(HERE, 'build_enemies.py')
_src = open(_EN, encoding='utf-8').read()
_src = _src[:_src.rindex('\nmain()')]
E = {'__name__': 'tt_enemies_lib', '__file__': _EN}
exec(compile(_src, _EN, 'exec'), E)
for _n in ('grp', 'root', 'mesh', 'deform', 'interp', 'lathe', 'profile', 'ell', 'tube', 'ring', 'box', 'cone',
           'on_sphere', 'look_rot', 'smooth_path', 'M', 'cloth', 'gloss', 'metal', 'skin', 'eye_mat', 'glint_mat',
           'add_face', 'mouth', 'write_png', 'new_scene', 'robe', 'robe_strip', 'capotain', 'finder_mats',
           'finder_head', 'BASE', 'rad', 'TAU'):
    globals()[_n] = E[_n]

PREVIEW_DIR = os.environ.get('TT_PREVIEW_DIR', os.path.join(os.environ.get('TEMP', HERE), 'tt_bosses'))
FW, FH, OX, OY = 128, 112, 64, 108
ANIMS = (('idle', 4), ('move', 6), ('attack', 4), ('hurt', 1), ('jump', 1))


# ---------------------------------------------------------------------------------------------------------------
# small helpers
def nrm(v):
    v = np.array(v, dtype=float); n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def set_vis(objs, show):
    for o in objs:
        for x in [o] + list(o.children_recursive): x.hide_render = not show


def set_emit(m, s):
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = s


def ccw(poly):
    a = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return list(poly) if a > 0 else list(poly)[::-1]


def mirror(poly):
    return ccw([(-u, v) for u, v in poly])


def grow(poly, d=0.9):
    us = [p[0] for p in poly]; vs = [p[1] for p in poly]
    cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    ku = 1 + d / max(0.5, (max(us) - min(us)) / 2); kv = 1 + d / max(0.5, (max(vs) - min(vs)) / 2)
    return [(cu + (u - cu) * ku, cv + (v - cv) * kv) for u, v in poly]


def limb(name, m, parent, pts, radii, seg=10):
    """(Re)build a tube through pts: used for IK-posed arms and necks, rebuilt every frame."""
    o = bpy.data.objects.get(name)
    if o is not None:
        me = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0: bpy.data.meshes.remove(me)
    return tube(name, m, smooth_path(pts, 10) if len(pts) > 2 else pts, radii, parent, seg=seg)


def elbow_pt(a, c, length, pole):
    a = np.array(a, float); c = np.array(c, float); d = c - a; dist = np.linalg.norm(d) + 1e-9
    h = math.sqrt(max(0.0, (length / 2) ** 2 - (dist / 2) ** 2))
    p = np.array(pole, float); p = p - d * np.dot(p, d) / dist ** 2
    p = nrm(p) if np.linalg.norm(p) > 1e-6 else np.array([0, 0, 1.0])
    return (a + c) / 2 + p * max(h, 0.12 * length)


def arm(name, m, parent, sh, hand, length, pole, radii, seg=10):
    e = elbow_pt(sh, hand, length, pole)
    limb(name, m, parent, [sh, e, hand], radii, seg)
    return e


def orient(o, d, fwd=(1, 0, 0)):
    """Rotate o so its local -Z points along d and its local +X leans toward fwd."""
    z = -nrm(d)
    f = np.array(fwd, float); x = f - z * np.dot(f, z)
    if np.linalg.norm(x) < 1e-4: x = np.array([0, 0, 1.0]) - z * z[2]
    x = nrm(x); y = np.cross(z, x)
    o.rotation_euler = Matrix(((x[0], y[0], z[0]), (x[1], y[1], z[1]), (x[2], y[2], z[2]))).to_euler()


def ik2d(hip, foot, l1, l2, kdir=1):
    dx, dz = foot[0] - hip[0], foot[1] - hip[1]
    d = min(math.hypot(dx, dz), l1 + l2 - 1e-3)
    base = math.atan2(dx, -dz)
    a1 = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    bend = math.pi - math.acos(max(-1, min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))))
    return base + kdir * a1, bend


def build_leg(prefix, parent, hip_loc, l1, l2, m1, m2, r1, r2, foot_fn, kdir=1):
    hip = grp(prefix + '_hip', parent, loc=hip_loc)
    tube(prefix + '_thigh', m1, [(0, 0, 0.6), (0, 0, -l1)], r1, hip, seg=12)
    knee = grp(prefix + '_knee', hip, loc=(0, 0, -l1))
    tube(prefix + '_shin', m2, [(0, 0, 0.3), (0, 0, -l2)], r2, knee, seg=12)
    ankle = grp(prefix + '_ankle', knee, loc=(0, 0, -l2))
    foot_fn(ankle)
    return dict(hip=hip, knee=knee, ankle=ankle, l1=l1, l2=l2, loc=hip_loc, kdir=kdir)


def pose_leg(leg, body, foot, pitch=0.0):
    """foot = (x, z) target for the ankle in the body's parent space (the root); body may be offset/scaled."""
    bl, bs = body.location, body.scale
    fx, fz = (foot[0] - bl[0]) / bs[0], (foot[1] - bl[2]) / bs[2]
    th, bend = ik2d((leg['loc'][0], leg['loc'][2]), (fx, fz), leg['l1'], leg['l2'], leg['kdir'])
    leg['hip'].rotation_euler = (0, -th, 0)
    leg['knee'].rotation_euler = (0, leg['kdir'] * bend, 0)
    leg['ankle'].rotation_euler = (0, rad(pitch) + th - leg['kdir'] * bend, 0)


def squint(head, r, eyes, prefix, span=14, h=12, w=0.5, m=None):
    """Hurt eyes: a '> <' pair of chevrons on the head sphere, hidden until the hurt frame."""
    mm = m or eye_mat()
    rr = np.array(r, float) + 0.25
    mid = sum(a for a, _ in eyes) / len(eyes)
    out = []
    for k, (az, el) in enumerate(eyes):
        s = 1 if az >= mid else -1
        pts = [on_sphere(rr, az + s * span * 0.5, el + h * 0.5), on_sphere(rr, az - s * span * 0.5, el),
               on_sphere(rr, az + s * span * 0.5, el - h * 0.5)]
        o = tube(f'{prefix}_sq{k}', mm, pts, w, head, seg=6); o.hide_render = True
        out.append(o)
    return out


def face_eyes(prefix, n=2):
    out = []
    for k in range(n):
        for nm in (f'{prefix}_eye{k}', f'{prefix}_gl{k}', f'{prefix}_white{k}'):
            o = bpy.data.objects.get(nm)
            if o is not None: out.append(o)
    return out


def extrude_xz(name, m, poly, y0, y1, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    """Flat profile in the X-Z plane extruded along Y (sleigh panels, hearts)."""
    poly = ccw(poly); n = len(poly)
    verts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n; faces.append((i, n + i, n + j, j))
    o = mesh(name, verts, faces, m, parent, loc, rot, smooth=False)
    if bevel > 0:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
        b.angle_limit = rad(35)
    return o


def heart_poly(s=1.0, n=28):
    """Heart outline in (x, z), point toward +X."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        hx = 16 * math.sin(t) ** 3
        hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((-hy * s, hx * s))
    return pts


def coin(name, m, parent, loc, rot=(0, 0, 0), r=1.8, t=0.32):
    return lathe(name, m, [(-t, 0, 0), (-t, r, r), (t, r, r), (t, 0, 0)], parent, 14, axis='x', loc=loc, rot=rot)


def run_sheet(name, P, pose):
    sh = L.Sheet(name, FW, FH, OX, OY)
    for anim, n in ANIMS:
        for i in range(n):
            pose(P, anim, i, n)
            bpy.context.view_layer.update()
            sh.add(anim)
    return sh


def world_in(obj_or_vec, space):
    """World point (object origin or Vector) expressed in `space`'s local coordinates."""
    bpy.context.view_layer.update()
    w = obj_or_vec.matrix_world.translation if hasattr(obj_or_vec, 'matrix_world') else Vector(obj_or_vec)
    return np.array(space.matrix_world.inverted() @ w)


# ---------------------------------------------------------------------------------------------------------------
# 1. THE GOURDFATHER: grinning jack-o'-lantern on a lanky straw scarecrow in a tattered black coat, pitchfork claws
def pumpkin(name, m, rx, ry, rz, parent, ribs=10, depth=0.1, seg=60, n=24):
    verts = [(0, 0, -rz * 0.78)]
    for i in range(1, n):
        t = math.pi * i / n; s = math.sin(t); c = -math.cos(t)
        zf = 1 - 0.28 * (1 - s) ** 2
        for j in range(seg):
            ph = TAU * j / seg
            k = 1 - depth * (1 - abs(math.cos(ribs / 2 * ph)) ** 0.6)
            verts.append((rx * s * k * math.cos(ph), ry * s * k * math.sin(ph), rz * c * zf))
    verts.append((0, 0, rz * 0.7)); top = len(verts) - 1
    faces = [(0, 1 + (j + 1) % seg, 1 + j) for j in range(seg)]
    for i in range(n - 2):
        a = 1 + i * seg; b = a + seg
        faces += [(a + j, a + (j + 1) % seg, b + (j + 1) % seg, b + j) for j in range(seg)]
    last = 1 + (n - 2) * seg
    faces += [(last + j, last + (j + 1) % seg, top) for j in range(seg)]
    return mesh(name, verts, faces, m, parent)


def carve(name, m, head, R, az0, el0, poly, top=0.6, bot=-2.6):
    """Prism conforming to an ellipsoid head: poly in (u right, v up) px around (az0, el0)."""
    rx, ry, rz = R
    def P(u, v, off):
        return on_sphere((rx + off, ry + off, rz + off), az0 - math.degrees(u / rx), el0 + math.degrees(v / rz))
    poly = ccw(poly); n = len(poly)
    verts = [P(u, v, top) for u, v in poly] + [P(u, v, bot) for u, v in poly]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n; faces.append((i, n + i, n + j, j))
    return mesh(name, verts, faces, m, head, smooth=False)


def straw_tuft(name, ms, parent, loc, d, n=8, length=4.0, spread=0.6, seed=1, r=0.42):
    rng = np.random.default_rng(seed)
    g = grp(name, parent, loc=loc)
    d = nrm(d)
    for k in range(n):
        dd = nrm(d + rng.normal(0, spread, 3)); L_ = length * (0.7 + 0.6 * rng.random())
        p0 = rng.normal(0, 0.5, 3)
        tube(f'{name}{k}', ms[k % len(ms)], [p0, p0 + dd * L_ * 0.5 + rng.normal(0, 0.25, 3), p0 + dd * L_], r, g, seg=5)
    return g


def fork_hand(name, parent, C):
    h = grp(name, parent)
    ell(name + '_sock', C['wood'], (1.5, 1.5, 1.7), loc=(0, 0, -0.6), parent=h)
    tube(name + '_bar', C['iron'], [(-1.0, -2.8, -2.3), (1.0, 2.8, -2.3)], 0.6, h, seg=8)
    for k, t in enumerate((-1, 0, 1)):
        x0, y0 = t * 1.0, t * 2.8
        tube(f'{name}_tine{k}', C['iron'], smooth_path([(x0, y0, -2.3), (x0 + 0.3, y0, -5.6), (x0 + 1.7, y0, -8.4), (x0 + 3.7, y0, -9.4)], 10),
             [0.78, 0.72, 0.66, 0.6, 0.54, 0.48, 0.42, 0.36, 0.3, 0.24], h, seg=7)
    straw_tuft(name + '_cuff', (C['straw'], C['straw2']), h, (0, 0, 0.8), (0, 0, -1), n=6, length=3.0, spread=0.9, seed=5)
    return h


def coat_fn(z0, Hc, sway, flare=0.0, top=0.32):
    def fn(v):
        u = np.clip((v[:, 2] - z0) / (Hc - z0), 0, 1)
        w = np.clip(1 - u / top, 0, 1) ** 1.5
        v[:, 0] += sway * w
        v[:, 0] *= 1 + flare * w; v[:, 1] *= 1 + flare * w
        v[:, 2] += flare * 6 * w
        return v
    return fn


def make_gourd():
    new_scene()
    rt = root('gourd', yaw=-24)
    C = dict(coat=M('gf_coat', '#3c3549', rough=0.55, spec=0.4), straw=M('gf_straw', '#ecc85e', rough=0.55),
             straw2=M('gf_straw2', '#c8963a', rough=0.6), pants=cloth('gf_pants', '#5c6e94'), patch=cloth('gf_patch', '#b08250'),
             boot=gloss('gf_boot', '#4a2c1a', 0.4), rope=cloth('gf_rope', '#cfb070'),
             pump=M('gf_pump', '#f07a1a', rough=0.4, spec=0.5, coat=0.25), stem=M('gf_stem', '#6a7a2a', rough=0.6),
             rim=M('gf_rim', '#5a1c06', rough=0.6), glow=M('gf_glow', '#ffb030', rough=0.5, emit=(1.0, 0.72, 0.2, 2.4)),
             iron=metal('gf_iron', '#a8acb6', 0.3), wood=M('gf_wood', '#7a5230', rough=0.5), seed=M('gf_seed', '#f4e8bc', rough=0.4))
    P = dict(C=C, rt=rt)
    body = grp('gf_body', rt); P['body'] = body
    torso = grp('gf_torso', body, loc=(0, 0, 30)); P['torso'] = torso
    z0, Hc = -10.0, 24.0
    coat, cp = robe('gf_coat', C['coat'], Hc, [(0, 12.5), (0.1, 10.8), (0.28, 8.0), (0.4, 7.2), (0.6, 8.4), (0.78, 9.2), (0.9, 8.0), (1.0, 3.4)],
                    [(0, -2.6), (0.4, 0.2), (1, 0.0)], 0.8, torso, z0=z0, seg=44, n=28)
    def tatter(v):
        ang = np.arctan2(v[:, 1], v[:, 0])
        saw = np.abs(((ang / TAU * 11) % 1.0) - 0.5) * 2
        v[:, 2] -= 2.8 * saw * np.clip(1 - (v[:, 2] - z0) / 4.0, 0, 1)
        return v
    deform(coat, tatter); BASE[coat.name] = np.array([vv.co[:] for vv in coat.data.vertices])
    patch = robe_strip('gf_patch', C['patch'], cp, -78, -52, 0.3, 0.46, 0.18, torso, nu=4, na=3)
    P['coat'] = [coat, patch]; P['coat_z'] = (z0, Hc)
    zb, rxb, ryb, cxb = cp((0 - z0) / (Hc - z0))
    ring('gf_belt', C['rope'], rxb + 0.3, ryb + 0.3, 0.85, z=zb, cx=cxb, parent=torso, seg=8)
    straw_tuft('gf_beltstraw', (C['straw'], C['straw2']), torso, (cxb + rxb - 0.5, -2.0, zb - 0.5), (1, -0.5, -0.6), n=6, length=3.5, seed=3)
    for k, s in enumerate((-1, 1)):
        ell(f'gf_shoulder{k}', C['coat'], (3.8, 3.6, 3.4), loc=(-0.4, s * 7.6, 20.6), parent=torso)
    tube('gf_neck', C['wood'], [(0.3, 0, 20), (0.9, 0, 28)], 1.5, torso, seg=8)
    straw_tuft('gf_collar', (C['straw'], C['straw2']), torso, (0.4, 0, 23.2), (0, 0, 1), n=12, length=4.2, spread=0.8, seed=2)
    # pumpkin head: carved features are prisms conforming to the head, a dark rim around an emissive glow
    head = grp('gf_head', torso, loc=(1.8, 0, 37.6), rot=(0, 0, -10)); P['head'] = head
    R = (18.5, 17.0, 14.6)
    pumpkin('gf_pump', C['pump'], *R, head)
    tube('gf_stem', C['stem'], smooth_path([(0, 0, 9.0), (0.2, 0, 12.6), (-1.2, 0, 15.2), (-2.8, 0, 15.6)], 10),
         [2.1, 2.0, 1.9, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1], head, seg=10)
    tube('gf_vine', C['stem'], [(0.8 + 2.6 * math.cos(a), -1.0 + 2.6 * math.sin(a), 10.2 + 0.4 * a) for a in np.linspace(0, 4.5, 14)], 0.35, head, seg=6)
    az0, el0 = 18, 8
    def feature(nm, poly, store, glow_top=0.65):
        store.append(carve(nm + '_rim', C['rim'], head, R, az0, el0, grow(poly, 0.9), top=0.35))
        store.append(carve(nm + '_glow', C['glow'], head, R, az0, el0, poly, top=glow_top))
    P['eyes'], P['squint'], P['grin'], P['open'] = [], [], [], []
    eyeR = ccw([(2.5, 0.6), (6.6, -2.8), (9.8, 3.6)])
    feature('gf_eyeR', eyeR, P['eyes']); feature('gf_eyeL', mirror(eyeR), P['eyes'])
    chev = ccw([(9.8, 3.9), (2.4, 1.0), (9.8, -1.9), (9.8, -0.3), (5.6, 1.0), (9.8, 2.3)])
    feature('gf_sqR', chev, P['squint']); feature('gf_sqL', mirror(chev), P['squint'])
    feature('gf_nose', ccw([(-1.9, -3.8), (1.9, -3.8), (0, -0.9)]), [])
    vt = lambda u: -5.2 + 2.4 * (u / 12) ** 2
    vb = lambda u: vt(u) - 6.0 * max(0.0, 1 - (u / 12) ** 2) ** 0.7 - 0.2
    us = np.linspace(-12, 12, 13)
    feature('gf_grin', ccw([(u, vt(u)) for u in us] + [(u, vb(u)) for u in us[::-1][1:-1]]), P['grin'])
    for k, (a, b) in enumerate(((-5.6, -3.0), (3.0, 5.6))):
        P['grin'].append(carve(f'gf_tooth{k}', C['pump'], head, R, az0, el0,
                               [(a, vt(a) + 0.4), (a, vt(a) - 2.4), (b, vt(b) - 2.4), (b, vt(b) + 0.4)], top=0.95))
    P['grin'].append(carve('gf_toothB', C['pump'], head, R, az0, el0, [(-1.3, vb(0) - 0.4), (1.3, vb(0) - 0.4), (1.3, vb(0) + 2.2), (-1.3, vb(0) + 2.2)], top=0.95))
    oval = [(8.8 * math.cos(a), -7.2 + 5.6 * math.sin(a)) for a in np.linspace(0, TAU, 25)[:-1]]
    feature('gf_open', oval, P['open'], glow_top=0.5)
    for k, (a, b) in enumerate(((-4.8, -2.2), (2.2, 4.8))):
        P['open'].append(carve(f'gf_otooth{k}', C['pump'], head, R, az0, el0, [(a, -1.2), (a, -4.4), (b, -4.4), (b, -1.2)], top=0.95))
    P['open'].append(carve('gf_otoothB', C['pump'], head, R, az0, el0, [(-1.3, -13.2), (1.3, -13.2), (1.3, -10.4), (-1.3, -10.4)], top=0.95))
    P['mouthpt'] = grp('gf_mouthpt', head, loc=on_sphere((20.0, 18.5, 16.0), az0, el0 - math.degrees(7.0 / 14.6)))
    P['seeds'] = []
    for k in range(6):
        g = grp(f'gf_seedg{k}', rt)
        ell(f'gf_seed{k}', C['seed'], (1.8, 1.15, 1.0), parent=g, seg=10, n=6)
        g.rotation_euler = (0, rad(37 * k), rad(61 * k)); P['seeds'].append(g)
    P['sh'] = [(-0.4, -8.4, 20.5), (-0.4, 8.4, 20.5)]
    P['hands'] = [fork_hand('gf_handN', torso, C), fork_hand('gf_handF', torso, C)]
    def boot(ankle):
        ell(ankle.name + '_boot', C['boot'], (3.7, 2.3, 1.9), loc=(1.4, 0, 0.1), parent=ankle)
        straw_tuft(ankle.name + '_str', (C['straw'], C['straw2']), ankle, (0, 0, 1.6), (0.3, 0, -1), n=7, length=2.6, spread=1.1, seed=len(ankle.name))
    P['legs'] = [build_leg(f'gf_leg{k}', body, (0.2, s * 4.2, 30), 15.0, 13.6, C['pants'], C['pants'], [3.0, 2.6], [2.5, 3.0], boot)
                 for k, s in enumerate((-1, 1))]
    return P


def pose_gourd(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; body, torso, head = P['body'], P['torso'], P['head']
    hurt = anim == 'hurt'; openm = anim == 'attack' and i >= 2
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt)
    set_vis(P['open'], openm); set_vis(P['grin'], not openm)
    set_vis(P['seeds'], False)
    glow, bz, lean, sway, flare = 2.4, 0.0, 4.0, 0.0, 0.0
    hrot = (0, -4, -10)
    feet = [(3.0, 1.8, 0), (-3.0, 1.8, 0)]
    if anim == 'idle':
        bz = -0.7 + 0.7 * math.cos(ph); lean = 5 + 1.5 * math.sin(ph)
        hrot = (3 * math.sin(ph), -4 + 3 * math.cos(ph), -10)
        hands = [(22.0 + 0.8 * math.sin(ph), -12.5, 11.0 + 1.0 * math.cos(ph)), (-17.0 - 0.8 * math.sin(ph), 12.5, 11.0 - 1.0 * math.cos(ph))]
        sway = 0.5 * math.sin(ph - 0.8); glow = 2.4 + 0.4 * math.sin(ph)
    elif anim == 'move':
        bz = -1.7 + 1.4 * abs(math.cos(ph)); lean = 12 + 2 * math.cos(2 * ph)
        feet = []
        for k in (0, 1):
            a = ph + k * math.pi
            feet.append((1.0 + 8.5 * math.sin(a), 1.8 + 5.5 * max(0.0, math.cos(a)), -14 * max(0.0, math.cos(a))))
        hands = [(3 - 12 * math.sin(ph), -11.5, 5 + 4 * abs(math.sin(ph))), (3 + 12 * math.sin(ph), 11.5, 5 + 4 * abs(math.sin(ph)))]
        hrot = (2 * math.sin(ph), -6 + 4 * math.cos(2 * ph - 0.7), -10)
        sway = -1.6 - 1.2 * math.sin(ph)
    elif anim == 'attack':
        lean = [-5, -12, 8, 16][i]; glow = [3.2, 4.6, 7.5, 10.0][i]
        hrot = (0, [-10, -18, 4, 12][i], -10)
        hands = [[(6, -14, 20), (2, -14.5, 26), (15, -12, 16), (18, -11, 12)][i], [(-4, 13.5, 20), (-7, 14, 25), (10, 12, 17), (13, 11, 13)][i]]
        feet = [(5.0, 1.8, 0), (-4.0, 1.8, 0)]; sway = [0.8, 1.4, -1.0, -1.6][i]
    elif anim == 'hurt':
        lean = -14; glow = 1.5; hrot = (8, -18, -14)
        hands = [(-6, -13.5, 28), (-9, 13.5, 26)]
        feet = [(5.5, 4.0, -12), (-3.0, 1.8, 0)]; bz = 0.5; sway = 1.8
    else:   # jump
        bz = 6.0; lean = 6; hrot = (0, -8, -10)
        hands = [(15, -13.5, 22), (-12, 13, 22)]
        feet = [(4.0, 20.0, -20), (-3.0, 17.0, -10)]; flare = 0.22; sway = -1.0
    body.location = (0, 0, bz)
    torso.rotation_euler = (0, rad(lean), 0)
    head.rotation_euler = (rad(hrot[0]), rad(hrot[1]), rad(hrot[2]))
    set_emit(C['glow'], glow)
    for o in P['coat']: deform(o, coat_fn(*P['coat_z'], sway, flare))
    for k, leg in enumerate(P['legs']):
        pose_leg(leg, body, feet[k][:2], feet[k][2])
    for k, (sh, hd) in enumerate(zip(P['sh'], hands)):
        side = -1 if k == 0 else 1
        e = arm(f'gf_sleeve{k}', C['coat'], torso, sh, hd, 25.0, (-1, side * 0.4, -0.2), [2.7, 2.5, 2.3, 2.2, 2.2, 2.3, 2.5, 2.7, 2.8, 2.9])
        P['hands'][k].location = hd
        orient(P['hands'][k], np.array(hd) - e, (1, 0, 0.3))
    if openm:
        mp = world_in(P['mouthpt'], P['rt'])
        offs = [[(3, 0, 0), (6, -1, 1.5), (8, 1, -1.5)], [(6, 0, 0), (11, -1, 2), (15, 1, -1), (19, 0, 1.5), (9, 1, -2.5)]][i - 2]
        for g, o in zip(P['seeds'], offs):
            g.location = tuple(mp + np.array(o)); set_vis([g], True)


def make_boss_gourd():
    return run_sheet('boss_gourd', make_gourd(), pose_gourd)


# ---------------------------------------------------------------------------------------------------------------
# 2. COLONEL KABOOM: a battery of red/white/blue firework tubes on stubby legs, lit-fuse moustache, medals, kepi
def make_kaboom():
    new_scene()
    rt = root('kaboom', yaw=-24)
    C = dict(red=gloss('kb_red', '#d02a30', 0.35), white=gloss('kb_white', '#f0e8d8', 0.4), blue=gloss('kb_blue', '#2e50b8', 0.35),
             paper=M('kb_paper', '#f2dcaa', rough=0.55), gold=metal('kb_gold', '#ecc050', 0.25), silver=metal('kb_silver', '#ccd0dc', 0.25),
             fuse=M('kb_fuse', '#9a6430', rough=0.7), boot=gloss('kb_boot', '#1c1418', 0.25), mitt=M('kb_mitt', '#f6f2ea', rough=0.5),
             pants=cloth('kb_pants', '#26408e'), leather=M('kb_leather', '#5e3620', rough=0.5),
             tip=M('kb_tip', '#3a2a24', rough=0.6, emit=(1.0, 0.72, 0.25, 0.0)), spark=M('kb_spark', '#fff0a0', emit=(1, 0.8, 0.35, 9.0)),
             visor=gloss('kb_visor', '#121016', 0.2), brow=M('kb_brow', '#4a3e44', rough=0.7), face=M('kb_face', '#f6dab0', rough=0.5), navy=cloth('kb_navy', '#1e2c64', 0.5), nose=skin('kb_nose', '#ec7a6a'),
             steel=metal('kb_steel', '#d8dce6', 0.18))
    P = dict(C=C, rt=rt)
    body = grp('kb_body', rt); P['body'] = body
    bundle = grp('kb_bundle', body, loc=(0, 0, 11)); P['bundle'] = bundle
    Rr, tr = 14.6, 6.9
    spec = [(-30, 'red', 28), (30, 'white', 33), (90, 'blue', 35), (150, 'red', 33), (210, 'white', 30), (270, 'blue', 26)]
    for k, (a, col, h) in enumerate(spec):
        g = grp(f'kb_t{k}', bundle, loc=(Rr * math.cos(rad(a)), Rr * math.sin(rad(a)), 0))
        lathe(f'kb_tube{k}', C[col], [(-0.5, 0, 0), (-0.5, tr - 0.5, tr - 0.5), (0, tr, tr), (h, tr, tr), (h + 0.4, tr - 0.6, tr - 0.6), (h + 0.4, 0, 0)], g, 28)
        bandm = C['white'] if col != 'white' else C['red']
        for j, z in enumerate((4.0, h - 4.5)):
            rg = ring(f'kb_band{k}_{j}', bandm, tr + 0.1, tr + 0.1, 0.8, parent=grp(f'kb_bandg{k}_{j}', g, loc=(0, 0, z)), seg=6, n=32)
            rg.scale = (1, 1, 1.7)
        cone(f'kb_cone{k}', C['paper'], tr * 0.92, 0, 6.8, loc=(0, 0, h + 0.4), parent=g, round_tip=False)
        ell(f'kb_tip{k}', C['tip'], (1.8, 1.8, 1.8), loc=(0, 0, h + 6.4), parent=g, seg=10, n=6)
    # the centre tube is the head
    lathe('kb_head_tube', C['face'], [(-0.5, 0, 0), (-0.5, 8.9, 8.9), (0, 9.4, 9.4), (56, 9.4, 9.4), (56.4, 8.8, 8.8), (56.4, 0, 0)], bundle, 36)
    rg = ring('kb_hband', C['blue'], 9.5, 9.5, 0.9, parent=grp('kb_hbandg', bundle, loc=(0, 0, 37.0)), seg=6, n=36); rg.scale = (1, 1, 1.6)
    head = grp('kb_head', bundle, loc=(0, 0, 48.0)); P['head'] = head
    hr = (9.5, 9.5, 9.5)
    eyes = ((52, 8), (10, 8))
    add_face(head, hr, eyes=eyes, eye_r=(1.1, 1.5, 2.2), brow_m=C['brow'], brow_r=1.25, prefix='kbf')
    P['eyes'] = face_eyes('kbf'); P['squint'] = squint(head, hr, eyes, 'kbf', span=16, h=16, w=0.7)
    ell('kb_nose', C['nose'], (2.3, 2.1, 2.0), loc=on_sphere(9.4, 31, -8), parent=head)
    # lit-fuse moustache: two twine curls, the near one burning
    P['spark'] = None
    for k, d in enumerate((1, -1)):
        pts = [on_sphere(10.0, 31, -22), on_sphere(10.6, 31 + d * 16, -30), on_sphere(11.4, 31 + d * 36, -32),
               on_sphere(12.4, 31 + d * 54, -20), on_sphere(12.6, 31 + d * 61, -5), on_sphere(11.8, 31 + d * 55, 3), on_sphere(11.4, 31 + d * 48, -7)]
        tube(f'kb_fuse{k}', C['fuse'], smooth_path(pts, 16), [1.9 - 0.07 * j for j in range(16)], head, seg=8)
        if d == 1:
            sp = grp('kb_spark', head, loc=pts[-1]); P['spark'] = sp
            ell('kb_sparkc', C['spark'], (1.1, 1.1, 1.1), parent=sp, seg=8, n=6)
            for j in range(6):
                a = TAU * j / 6
                tube(f'kb_sparkr{j}', C['spark'], [(0, 0, 0), (0.4 * math.cos(a), 2.6 * math.cos(a + 0.5), 2.6 * math.sin(a))], 0.28, sp, seg=4)
    # kepi
    cap = grp('kb_cap', bundle, loc=(0.3, 0, 56.0), rot=(0, 10, 0)); P['cap'] = cap
    lathe('kb_capc', C['red'], [(0, 0, 0), (0, 9.7, 9.7), (6.6, 8.8, 8.8), (7.2, 9.1, 9.1), (7.6, 0, 0)], cap, 32)
    ring('kb_capband', C['blue'], 9.75, 9.75, 1.1, z=1.4, parent=cap, seg=6, n=36)
    ell('kb_visor', C['visor'], (5.4, 7.6, 0.9), loc=(7.8, 0, 0.5), rot=(0, 14, 0), parent=cap, seg=20, n=8)
    tube('kb_cord', C['gold'], [on_sphere((10.0, 10.0, 1), a, 0, (0, 0, 2.8)) for a in range(-60, 61, 15)], 0.45, cap, seg=5)
    ell('kb_badge', C['gold'], (0.7, 1.9, 1.9), loc=(9.1, 0, 4.2), rot=(0, -6, 0), parent=cap, seg=12, n=8)
    # straps and medals
    ring('kb_belt', C['leather'], 21.8, 21.8, 1.3, z=12, parent=bundle, seg=8, n=64)
    box('kb_buckle', C['gold'], (1.0, 3.8, 3.4), loc=(21.9 * math.cos(rad(-34)), 21.9 * math.sin(rad(-34)), 12), rot=(0, 0, -34), parent=bundle, bevel=0.3)
    ring('kb_strap2', C['gold'], 21.7, 21.7, 0.6, z=23.5, parent=bundle, seg=6, n=64)
    for j, (a, rc, mc) in enumerate(((-72, 'red', 'gold'), (-59, 'blue', 'silver'), (-46, 'red', 'gold'))):
        g = grp(f'kb_medal{j}', bundle, loc=(22.1 * math.cos(rad(a)), 22.1 * math.sin(rad(a)), 22.6), rot=(0, 0, a))
        box(f'kb_ribbon{j}', C[rc], (0.5, 2.4, 3.2), loc=(0, 0, -1.2), parent=g, bevel=0.15)
        lathe(f'kb_disc{j}', C[mc], [(0, 0, 0), (0, 2.0, 2.0), (0.6, 1.9, 1.9), (0.7, 0, 0)], g, 16, axis='x', loc=(0.1, 0, -4.0))
    # arms: epaulettes fixed, sleeves rebuilt
    P['sh'] = [(1.0, -21.2, 27.0), (1.0, 21.2, 27.0)]
    for k, (x, y, z) in enumerate(P['sh']):
        ell(f'kb_epaul{k}', C['gold'], (3.4, 3.0, 1.4), loc=(x, y, z + 2.2), parent=bundle)
        for j in range(5):
            tube(f'kb_fringe{k}_{j}', C['gold'], [(x - 2.4 + j * 1.2, y + (-2.4 if k == 0 else 2.4), z + 1.8), (x - 2.4 + j * 1.2, y + (-2.6 if k == 0 else 2.6), z - 0.4)], 0.35, bundle, seg=4)
    P['hands'] = [ell(f'kb_mitt{k}', C['mitt'], (2.4, 2.4, 2.4), parent=bundle) for k in range(2)]
    sab = grp('kb_sabre', bundle); P['sabre'] = sab
    tube('kb_grip', C['leather'], [(0, 0, -1.6), (0, 0, 1.6)], 0.7, sab, seg=8)
    tube('kb_guard', C['gold'], smooth_path([(0, 0, 1.8), (1.6, 0, 1.2), (2.2, 0, -1.4), (1.2, 0, -2.6)], 8), 0.35, sab, seg=6)
    lathe('kb_blade', C['steel'], [(1.8, 0, 0), (1.8, 1.3, 0.45), (19.0, 1.1, 0.4), (22.5, 0, 0)], sab, 8)
    ell('kb_pommel', C['gold'], (0.8, 0.8, 0.8), loc=(0, 0, -2.0), parent=sab, seg=8, n=6)
    def boot(ankle):
        ell(ankle.name + '_boot', C['boot'], (4.4, 2.9, 2.3), loc=(1.4, 0, 0.0), parent=ankle)
        ell(ankle.name + '_cuff', C['boot'], (2.9, 2.9, 1.2), loc=(0, 0, 1.6), parent=ankle)
    P['legs'] = [build_leg(f'kb_leg{k}', body, (0.5, s * 7.0, 11), 5.5, 4.5, C['pants'], C['pants'], [3.4, 3.1], [3.0, 2.9], boot)
                 for k, s in enumerate((-1, 1))]
    return P


def pose_kaboom(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; body, bundle = P['body'], P['bundle']
    hurt = anim == 'hurt'
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt)
    bz, tilt, roll, twist, glow, spark = 0.0, 3.0, 0.0, 0.0, 0.0, 1.0
    feet = [(2.6, 2.3, 0), (-2.6, 2.3, 0)]
    hands = [(10.0, -24.0, 18.0), (-6.0, 23.5, 18.0)]; sab = 20
    if anim == 'idle':
        bz = 0.4 * math.sin(ph); roll = 1.5 * math.sin(ph); spark = 1 + 0.35 * math.sin(2 * ph + 0.4)
        hands = [(10.0, -24.0, 18.0 + 0.6 * math.sin(ph)), (-6.0, 23.5, 18.0)]; sab = 18 + 4 * math.sin(ph)
    elif anim == 'move':
        roll = 7 * math.sin(ph); twist = 4 * math.sin(ph); bz = 0.8 * abs(math.cos(ph))
        feet = []
        for k in (0, 1):
            a = ph + k * math.pi
            feet.append((1.0 + 4.5 * math.sin(a), 2.3 + 3.8 * max(0.0, math.cos(a)), -8 * max(0.0, math.cos(a))))
        hands = [(10.0 - 2 * math.sin(ph), -24.0, 17.0), (-6.0 + 2 * math.sin(ph), 23.5, 17.0)]; sab = 25 + 8 * math.sin(ph)
        spark = 1 + 0.4 * math.cos(3 * ph)
    elif anim == 'attack':
        tilt = [8, 16, 25, 32][i]; glow = [2.0, 6.0, 16.0, 30.0][i]; spark = [1.2, 1.4, 1.7, 2.0][i]
        feet = [(6.0, 2.3, 0), (-5.0, 2.3, 0)]
        hands = [(12, -24, 19), (14, -23.5, 18), (16, -23, 17), (17, -23, 15)][i], (-6.0, 23.5, 18.0)
        sab = [40, 65, 82, 92][i]
    elif anim == 'hurt':
        tilt = -14; roll = 5; spark = 2.2; bz = 0.6
        feet = [(4.5, 5.0, -10), (-2.0, 2.3, 0)]
        hands = [(4, -24.5, 30), (-3, 24, 30)]; sab = -30
    else:
        bz = 5.0; tilt = -5; feet = [(3.0, 8.0, -10), (-2.0, 7.5, -10)]
        hands = [(8, -25, 27), (-6, 24.5, 27)]; sab = 0; spark = 1.4
    body.location = (0, 0, bz)
    bundle.rotation_euler = (rad(roll), rad(tilt), rad(twist))
    set_emit(C['tip'], glow)
    P['spark'].scale = (spark,) * 3
    P['spark'].rotation_euler = (rad(37 * i + (60 if anim == 'move' else 0)), 0, 0)
    for k, leg in enumerate(P['legs']):
        pose_leg(leg, body, feet[k][:2], feet[k][2])
    for k, (sh, hd) in enumerate(zip(P['sh'], hands)):
        side = -1 if k == 0 else 1
        arm(f'kb_sleeve{k}', C['navy'], bundle, sh, hd, 13.0, (-0.3, side, -0.6), [2.6, 2.5, 2.4, 2.3, 2.3, 2.3, 2.4, 2.4, 2.3, 2.2])
        P['hands'][k].location = hd
    P['sabre'].location = hands[0]
    P['sabre'].rotation_euler = (0, rad(sab), 0)


def make_boss_kaboom():
    return run_sheet('boss_kaboom', make_kaboom(), pose_kaboom)


# ---------------------------------------------------------------------------------------------------------------
# 3. SEAMUS GOLDGRIP: grumpy green-coated giant with a ginger beard, buckled hat and shillelagh, riding an
#    overflowing pot of gold on stubby legs
def make_goldgrip():
    new_scene()
    rt = root('goldgrip', yaw=-24)
    C = dict(pot=M('gg_pot', '#34323c', rough=0.35, metal=0.6, spec=0.6), gold=metal('gg_gold', '#f6c843', 0.22), gold2=metal('gg_gold2', '#dca232', 0.3),
             coat=cloth('gg_coat', '#2f9442', 0.5), coat2=cloth('gg_coat2', '#1f6c30', 0.5), beard=M('gg_beard', '#dc6a2a', rough=0.65),
             beard2=M('gg_beard2', '#b8501e', rough=0.7), skin=skin('gg_skin', '#ecb48c'), nose=skin('gg_nose', '#e8766a'),
             cheek=skin('gg_cheek', '#e88a7a'), hat=cloth('gg_hat', '#2a8a3c', 0.45), band=M('gg_band', '#1a1418', rough=0.4),
             sock=cloth('gg_sock', '#ece6d8', 0.55), shoe=gloss('gg_shoe', '#1c1418', 0.25), stick=M('gg_stick', '#7a4a2a', rough=0.45, coat=0.3),
             cuff=cloth('gg_cuff', '#f0ece0', 0.5), clover=cloth('gg_clover', '#4ac05a', 0.4), mouthm=M('gg_mouth', '#5a1a1e', rough=0.4))
    P = dict(C=C, rt=rt)
    body = grp('gg_body', rt); P['body'] = body
    def shoe(ankle):
        ell(ankle.name + '_shoe', C['shoe'], (4.3, 2.7, 1.9), loc=(1.5, 0, 0.1), parent=ankle)
        box(ankle.name + '_bk', C['gold'], (0.6, 2.2, 1.6), loc=(3.0, 0, 1.4), rot=(0, -20, 0), parent=ankle, bevel=0.2)
    P['legs'] = [build_leg(f'gg_leg{k}', body, (0.5, s * 9.5, 12), 5.6, 5.0, C['sock'], C['sock'], [3.1, 2.7], [2.6, 2.4], shoe)
                 for k, s in enumerate((-1, 1))]
    pot = grp('gg_pot', body, loc=(0, 0, 10.5)); P['pot'] = pot
    lathe('gg_potm', C['pot'], [(0, 0, 0), (0, 7, 7), (1.5, 12.5, 12.5), (5, 16.8, 16.8), (10, 18.8, 18.8), (15, 18.4, 18.4), (19.5, 16.6, 16.6),
                                 (22, 15.6, 15.6), (22.6, 16.8, 16.8), (23.8, 17.0, 17.0), (24.6, 16.0, 16.0), (24.4, 0, 0)], pot, 44)
    for k, s in enumerate((-1, 1)):
        ring(f'gg_handle{k}', C['pot'], 2.6, 2.6, 0.7, parent=grp(f'gg_handleg{k}', pot, loc=(0, s * 19.4, 19.0), rot=(0, 90, 0)), seg=6, n=20)
    cl = grp('gg_clover', pot, loc=(18.9 * math.cos(rad(-50)), 18.9 * math.sin(rad(-50)), 11.0), rot=(0, 0, -50))
    for j, (y, z) in enumerate(((-1.7, 1.0), (1.7, 1.0), (0, 2.9))):
        ell(f'gg_leaf{j}', C['clover'], (0.45, 1.9, 1.9), loc=(0.2, y, z), parent=cl, seg=12, n=8)
    tube('gg_cstem', C['clover'], [(0.3, 0, 0.6), (0.4, 0.6, -2.4)], 0.4, cl, seg=5)
    ell('gg_heap', C['gold2'], (16.2, 16.2, 6.5), loc=(0, 0, 23.6), parent=pot, seg=36, n=14)
    rng = np.random.default_rng(11)
    for k in range(56):
        az = rng.uniform(-180, 180); el = rng.uniform(8, 80)
        pt = np.array(on_sphere((16.4, 16.4, 6.7), az, el, (0, 0, 23.6)))
        nn = nrm(np.array([pt[0] / 16.4 ** 2, pt[1] / 16.4 ** 2, (pt[2] - 23.6) / 6.7 ** 2]))
        r0 = look_rot(nn + rng.normal(0, 0.35, 3))
        coin(f'gg_coin{k}', C['gold'] if k % 3 else C['gold2'], pot, tuple(pt), r0)
    for k, az in enumerate((-70, -40, 20, -110, 150)):
        pt = on_sphere((17.4, 17.4, 1), az, 0, (0, 0, 22.4 - (k % 2) * 1.6))
        coin(f'gg_spill{k}', C['gold'], pot, pt, (rad(rng.uniform(-40, 40)), rad(70), rad(-az)))
    # the man, waist-deep in gold
    torso = grp('gg_torso', pot, loc=(-1.5, 0, 21.0), scale=(1.15, 1.15, 1.15)); P['torso'] = torso
    coat, cp = robe('gg_coatm', C['coat'], 19.0, [(0, 10.5), (0.35, 11.2), (0.62, 10.6), (0.82, 8.6), (0.94, 6.0), (1.0, 3.5)],
                    [(0, 0), (1, 0.3)], 0.86, torso, z0=0.0, seg=36)
    robe_strip('gg_lapel', C['coat2'], cp, -34, -6, 0.5, 0.96, 0.15, torso, nu=10, na=4)
    for j, u in enumerate((0.35, 0.5, 0.65)):
        z, rx, ry, cx = cp(u)
        ell(f'gg_btn{j}', C['gold'], (0.5, 0.7, 0.7), loc=(cx + rx * math.cos(rad(-20)) + 0.1, ry * math.sin(rad(-20)), z), parent=torso, seg=8, n=6)
    for k, s in enumerate((-1, 1)):
        ell(f'gg_shoulder{k}', C['coat'], (4.0, 3.8, 3.8), loc=(0, s * 9.6, 16.5), parent=torso)
    head = grp('gg_head', torso, loc=(1.8, 0, 25.0)); P['head'] = head
    hr = (8.2, 7.8, 8.0)
    ell('gg_skull', C['skin'], hr, parent=head, seg=32, n=20)
    ell('gg_hairb', C['beard'], (6.0, 7.8, 4.2), loc=(-3.6, 0, 0.2), parent=head)
    ell('gg_ear', C['skin'], (1.2, 0.8, 1.9), loc=(-0.8, -7.7, -0.4), parent=head)
    ell('gg_nosem', C['nose'], (2.5, 2.2, 2.1), loc=on_sphere(hr, 26, -8), parent=head)
    for k, az in enumerate((54, 0)):
        ell(f'gg_cheek{k}', C['cheek'], (1.2, 1.6, 1.2), loc=on_sphere(np.array(hr) - 0.5, az, -14), parent=head)
    eyes = ((46, 9), (6, 9))
    add_face(head, hr, eyes=eyes, eye_r=(0.85, 1.1, 1.5), brow_m=C['beard2'], brow_r=1.15, prefix='ggf', brow_lift=-2)
    P['eyes'] = face_eyes('ggf'); P['squint'] = squint(head, hr, eyes, 'ggf', span=16, h=14, w=0.6)
    for nm, m, r, loc in (('b0', 'beard', (5.6, 7.4, 6.6), (3.6, -0.6, -8.6)), ('b1', 'beard2', (4.4, 5.6, 5.4), (5.4, -0.8, -13.2)),
                          ('b2', 'beard', (3.4, 3.0, 5.4), (1.0, -6.8, -3.6)), ('b3', 'beard', (3.4, 3.0, 5.4), (1.0, 6.8, -3.6)),
                          ('b4', 'beard2', (3.0, 4.0, 3.8), (6.8, -1.2, -17.0))):
        ell('gg_' + nm, C[m], r, loc=loc, parent=head)
    for k, d in enumerate((1, -1)):
        base = np.array(on_sphere(np.array(hr) + 0.4, 26, -20))
        tip = np.array(on_sphere(np.array(hr) + 1.0, 26 + d * 32, -30))
        tube(f'gg_stache{k}', C['beard2'], smooth_path([base, (base + tip) / 2 + np.array([0.6, 0, 0.3]), tip, tip + np.array([-0.4, 0, -1.4])], 8),
             [1.6, 1.6, 1.5, 1.4, 1.2, 1.0, 0.8, 0.6], head, seg=8)
    mouth(head, np.array(hr), 40, 12, -30, curve=-1.8, w=0.55, m=C['mouthm'], prefix='ggf')
    hat = grp('gg_hatg', head, loc=(-0.6, 0, 5.6), rot=(0, -8, 0)); P['hat'] = hat
    capotain('gg_hat', hat, (0, 0, 0), C['hat'], C['band'], None, crown_h=12.0, r0=6.4, r1=5.6, brim=9.8, band_z=1.8)
    bk = grp('gg_buckleg', hat, loc=on_sphere((7.0, 6.3, 1), 32, 0, (0, 0, 1.9)), rot=(0, 0, -32))
    tube('gg_buckle', C['gold'], [(0, -1.8, -1.5), (0, 1.8, -1.5), (0, 1.8, 1.5), (0, -1.8, 1.5)], 0.55, bk, seg=6, closed=True)
    # arms, hands, shillelagh, fistful of coins, thrown coins
    P['sh'] = [(0, -10.6, 16.5), (0, 10.6, 16.5)]
    P['hands'] = [ell(f'gg_hand{k}', C['skin'], (2.8, 2.8, 2.8), parent=torso) for k in range(2)]
    stick = grp('gg_stick', torso); P['stick'] = stick
    tube('gg_stickm', C['stick'], [(0, 0, -9), (0.4, 0, 4), (0, 0, 17)], [1.2, 1.1, 1.3], stick, seg=10)
    ell('gg_knob', C['stick'], (2.8, 2.8, 3.2), loc=(0, 0, 19.0), parent=stick)
    for j, z in enumerate((-4, 6, 12)):
        ell(f'gg_knot{j}', C['stick'], (0.9, 0.9, 1.1), loc=(1.0 * (-1) ** j, 0.3, z), parent=stick, seg=8, n=6)
    fist = grp('gg_fist', torso); P['fist'] = fist
    for j in range(6):
        coin(f'gg_fcoin{j}', C['gold'], fist, (rng.uniform(-1.6, 1.6), rng.uniform(-2.6, -1.0), rng.uniform(-0.5, 3.2)),
             (rad(rng.uniform(0, 180)), rad(rng.uniform(0, 180)), 0))
    P['fly'] = []
    for j in range(6):
        g = grp(f'gg_fly{j}', rt, scale=(1.5, 1.5, 1.5)); coin(f'gg_flycoin{j}', C['gold'], g, (0, 0, 0), (rad(40 * j), rad(70 * j), 0)); P['fly'].append(g)
    return P


def pose_goldgrip(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; body, torso, head = P['body'], P['torso'], P['head']
    hurt = anim == 'hurt'
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt); set_vis(P['fly'], False); set_vis([P['fist']], False)
    bz, sq, lean, hrot, hat_z, hat_r = 0.0, 0.0, 4.0, (0, 0, -6), 0.0, -8
    feet = [(3.2, 1.8, 0), (-3.2, 1.8, 0)]
    near = (10.0, -15.5, 1.0); far = (8.0, 12.5, 9.0); stick_r = 25
    if anim == 'idle':
        lean = 3 + 2 * math.sin(ph); sq = 0.015 * math.sin(ph)
        hrot = (0, 2 * math.sin(ph), -6 + 5 * math.sin(ph + 0.5))
        far = (8.0, 12.5, 9.0 + 1.2 * math.sin(2 * ph)); stick_r = 25 + 7 * math.sin(2 * ph)
    elif anim == 'move':
        bz = [0, 4, 10, 8, 1.5, 0][i]; sq = [0.14, -0.1, -0.04, -0.06, 0.12, 0.03][i]
        tuck = [0, 0, 2.5, 1.0, 0, 0][i]
        feet = [(2.6, 1.8 + max(0.0, bz - 1.5) + tuck, -10 if bz > 2 else 0), (-2.6, 1.8 + max(0.0, bz - 1.5) + tuck, -10 if bz > 2 else 0)]
        lean = [8, -6, -2, 4, 10, 2][i]; hat_z = [0, -0.5, 0.8, 1.4, -0.5, 0][i]
        near = (10.0, -15.5, 1.0 + [0, 3, 8, 6, 0, 0][i]); far = (8.0, 12.5, 9.0 + [0, 3, 5, 3, -1, 0][i]); stick_r = [30, 15, 10, 20, 35, 28][i]
        hrot = (0, [6, -4, -2, 2, 8, 2][i], -6)
    elif anim == 'attack':
        lean = [6, -2, -12, 14][i]; hrot = (0, [6, -4, -10, 8][i], -6)
        near = [(9, -13.5, 2), (2, -16, 14), (-9, -15.5, 25), (16, -11, 19)][i]
        set_vis([P['fist']], i < 3); stick_r = [25, 20, 10, 40][i]
        feet = [(4.0, 1.8, 0), (-3.5, 1.8, 0)]
    elif anim == 'hurt':
        lean = -16; hrot = (-8, -14, -10); hat_z = 3.0; hat_r = -26; sq = -0.04
        near = (-7, -15.5, 23); far = (-6, 13, 14); stick_r = -30
        feet = [(4.5, 4.0, -12), (-2.6, 1.8, 0)]
    else:
        bz = 9.0; sq = -0.06; lean = -2; hat_z = 1.5
        feet = [(3.0, 13.5, -15), (-2.0, 13.0, -15)]
        near = (11, -17.5, 6); far = (5, 12.5, 24); stick_r = 5
    body.location = (0, 0, bz)
    body.scale = (1 + sq, 1 + sq, 1 - sq)
    torso.rotation_euler = (0, rad(lean), 0)
    head.rotation_euler = tuple(rad(a) for a in hrot)
    P['hat'].location = (-0.6, 0, 5.6 + hat_z); P['hat'].rotation_euler = (0, rad(hat_r), 0)
    for k, leg in enumerate(P['legs']):
        pose_leg(leg, body, feet[k][:2], feet[k][2])
    for k, (sh, hd) in enumerate(zip(P['sh'], (near, far))):
        side = -1 if k == 0 else 1
        e = arm(f'gg_sleeve{k}', C['coat'], torso, sh, hd, 17.0, (-0.6, side, -0.4), [3.4, 3.3, 3.2, 3.1, 3.0, 3.0, 3.0, 3.1, 3.3, 3.4])
        cuff = np.array(hd) + nrm(np.array(e) - np.array(hd)) * 2.2
        limb(f'gg_cuff{k}', C['cuff'], torso, [tuple(cuff + nrm(np.array(hd) - cuff) * 0.6), tuple(cuff - nrm(np.array(hd) - cuff) * 0.6)], 3.6)
        P['hands'][k].location = hd
    P['stick'].location = far; P['stick'].rotation_euler = (0, rad(stick_r), 0)
    P['fist'].location = near
    if anim == 'attack' and i == 3:
        hp = world_in(P['hands'][0], P['rt'])
        for j, (g, o) in enumerate(zip(P['fly'], ((5, -2, 1), (10, -3, 3.5), (15, -1, 1), (9, -1, -2), (19, -3, 3), (14, -2, -2.5)))):
            g.location = tuple(hp + np.array(o)); set_vis([g], True)
    if anim == 'hurt':
        for j, (g, o) in enumerate(zip(P['fly'], ((-10, -6, 38), (-4, -8, 41), (6, -6, 39), (12, -4, 36)))):
            g.location = o; set_vis([g], True)


def make_boss_goldgrip():
    return run_sheet('boss_goldgrip', make_goldgrip(), pose_goldgrip)


# ---------------------------------------------------------------------------------------------------------------
# 4. THE EGGSECUTIONER: clockwork rabbit of painted egg-shell plates, wind-up key, red glass eyes, huge mallet
def egg_r(t, R):
    return R * 2 * math.sqrt(max(0.0, t * (1 - t))) * (1.1 - 0.2 * t)


def painted_egg(name, mats, H, R, z0, bands, parent, ry=0.92, n=26, seg=36, loc=(0, 0, 0)):
    """Egg lathe with horizontal paint bands (material index per face by height); bands = t boundaries."""
    rings = [(z0, 0, 0)] + [(z0 + H * i / n, egg_r(i / n, R), egg_r(i / n, R) * ry) for i in range(1, n)] + [(z0 + H, 0, 0)]
    o = lathe(name, mats, rings, parent, seg, loc=loc)
    for p in o.data.polygons:
        t = (p.center.z - z0) / H
        p.material_index = sum(1 for b in bands if t > b) % len(mats)
    return o


def make_egg():
    new_scene()
    rt = root('egg', yaw=-24)
    C = dict(mint=gloss('eg_mint', '#94e8c2', 0.3), pink=gloss('eg_pink', '#f6a2c6', 0.3), lav=gloss('eg_lav', '#bca2f2', 0.3),
             butter=gloss('eg_butter', '#f8e07e', 0.3), sky=gloss('eg_sky', '#8ec4f6', 0.3), shell=gloss('eg_shell', '#f6f0e6', 0.3),
             seam=M('eg_seam', '#5e4e74', rough=0.4), brass=metal('eg_brass', '#e0b04a', 0.25), iron=metal('eg_iron', '#7a7e8e', 0.3),
             glass=M('eg_glass', '#ff1a2a', rough=0.06, spec=0.9, coat=1.0, emit=(1, 0.08, 0.1, 1.2)),
             teeth=M('eg_teeth', '#fbf8f0', rough=0.3), nose=gloss('eg_nose', '#f0709a', 0.3), wood=M('eg_wood', '#8a5230', rough=0.4, coat=0.3),
             band=metal('eg_band', '#565a6c', 0.35), whisk=M('eg_whisk', '#3a3040', rough=0.5), dial=M('eg_dial', '#fbf6ea', rough=0.4))
    P = dict(C=C, rt=rt)
    body = grp('eg_body', rt); P['body'] = body
    torso = grp('eg_torso', body, loc=(0, 0, 10)); P['torso'] = torso
    bands = (0.17, 0.37, 0.58, 0.8)
    painted_egg('eg_eggb', [C['mint'], C['pink'], C['lav'], C['butter'], C['sky']], 40.0, 16.5, -2.0, bands, torso)
    rng = np.random.default_rng(4)
    for j, t in enumerate(bands):
        r_ = egg_r(t, 16.5); z = -2.0 + 40.0 * t
        ring(f'eg_seam{j}', C['seam'], r_ + 0.15, r_ * 0.92 + 0.15, 0.42, z=z, parent=torso, seg=6, n=48)
        for k in range(10):
            a = TAU * (k + 0.5 * (j % 2)) / 10
            ell(f'eg_rv{j}_{k}', C['brass'], (0.55, 0.55, 0.55), loc=((r_ + 0.35) * math.cos(a), (r_ * 0.92 + 0.35) * math.sin(a), z), parent=torso, seg=8, n=6)
    for k in range(18):
        t = rng.uniform(0.2, 0.95); a = rng.uniform(-3.0, 1.2)
        r_ = egg_r(t, 16.5); z = -2.0 + 40.0 * t
        p = np.array(((r_ + 0.05) * math.cos(a), (r_ * 0.92 + 0.05) * math.sin(a), z))
        ell(f'eg_dot{k}', C['shell'] if k % 3 else C['pink'], (0.4, 1.3, 1.3), loc=tuple(p), rot=look_rot((math.cos(a), math.sin(a), 0.2)), parent=torso, seg=10, n=6)
    # clock dial on the belly
    t = 0.47; r_ = egg_r(t, 16.5); a = rad(-36)
    dg = grp('eg_dialg', torso, loc=((r_ - 0.3) * math.cos(a), (r_ * 0.92 - 0.3) * math.sin(a), -2 + 40 * t), rot=(0, -6, -36))
    lathe('eg_dialf', C['dial'], [(0, 0, 0), (0, 4.6, 4.6), (0.6, 4.4, 4.4), (0.7, 0, 0)], dg, 28, axis='x')
    ring('eg_dialr', C['brass'], 4.6, 4.6, 0.6, parent=grp('eg_dialrg', dg, rot=(0, 90, 0)), seg=6, n=32)
    tube('eg_hand1', C['whisk'], [(0.9, 0, 0), (0.9, 0, 3.2)], 0.4, dg, seg=5)
    tube('eg_hand2', C['whisk'], [(0.9, 0, 0), (0.9, -2.4, -0.8)], 0.4, dg, seg=5)
    # haunches
    for k, s in enumerate((-1, 1)):
        ell(f'eg_haunch{k}', C['lav'], (8.5, 4.4, 8.0), loc=(-3.0, s * 11.4, 6.5), rot=(0, -15, 0), parent=torso)
    # wind-up key
    kg = grp('eg_key', torso, loc=(-15.8, 0, 20.0))
    tube('eg_keyshaft', C['brass'], [(0.5, 0, 0), (-5.0, 0, 0)], 1.0, kg, seg=10)
    ell('eg_keycollar', C['brass'], (0.9, 2.0, 2.0), loc=(-0.4, 0, 0), parent=kg)
    spin = grp('eg_keyspin', kg, loc=(-5.5, 0, 0)); P['key'] = spin
    for j, z in enumerate((3.4, -3.4)):
        ring(f'eg_lobe{j}', C['brass'], 2.9, 2.6, 0.85, parent=grp(f'eg_lobeg{j}', spin, loc=(-2.4, 0, z), rot=(90, 0, 0)), seg=6, n=24)
    # head
    head = grp('eg_head', torso, loc=(2.5, 0, 46.5)); P['head'] = head
    painted_egg('eg_heade', [C['shell'], C['pink']], 23.0, 11.6, -10.5, (0.66,), head, ry=0.95)
    ring('eg_hseam', C['seam'], egg_r(0.66, 11.6) + 0.12, egg_r(0.66, 11.6) * 0.95 + 0.12, 0.38, z=-10.5 + 23 * 0.66, parent=head, seg=6, n=40)
    hr = (11.0, 10.6, 11.0)
    eyes = ((42, 6), (4, 6))
    parts = add_face(head, hr, eyes=eyes, eye_r=(1.3, 1.8, 2.5), brow_m=C['seam'], brow_r=0.85, prefix='egf', brow_lift=-1)
    for k in range(2):
        parts[f'eye{k}'].data.materials[0] = C['glass']
        p = np.array(on_sphere(hr, eyes[k][0], eyes[k][1]))
        ell(f'egf_pupil{k}', eye_mat(), (0.4, 0.5, 1.4), loc=tuple(p + nrm(p) * 1.15), rot=look_rot(p), parent=head, seg=8, n=6)
    P['eyes'] = face_eyes('egf') + [bpy.data.objects[f'egf_pupil{k}'] for k in range(2)]
    P['squint'] = squint(head, hr, eyes, 'egf', span=16, h=14, w=0.6, m=C['seam'])
    ell('eg_muzzle', C['shell'], (4.6, 5.6, 3.8), loc=on_sphere(np.array(hr) - 2.2, 22, -26), parent=head)
    ell('eg_nose', C['nose'], (1.6, 2.0, 1.4), loc=on_sphere(np.array(hr) + 0.6, 22, -12), parent=head)
    tp = np.array(on_sphere(np.array(hr) + 1.0, 22, -34))
    for k, dy in enumerate((-0.8, 0.8)):
        box(f'eg_tooth{k}', C['teeth'], (1.2, 1.5, 2.8), loc=tuple(tp + np.array([0, dy, -0.8])), rot=(0, 0, -22), parent=head, bevel=0.3)
    mouth(head, np.array(hr) + 0.6, 34, 10, -30, curve=-1.4, w=0.45, m=C['whisk'], prefix='egf')
    for k, (d, e) in enumerate(((1, 4), (1, -2), (-1, 4), (-1, -2))):
        b = np.array(on_sphere(np.array(hr) + 0.4, 22 + d * 14, -24))
        tube(f'eg_whisker{k}', C['whisk'], [b, b + np.array([1.0, -d * 4.5, e * 0.5]), b + np.array([1.4, -d * 8.0, e])], 0.22, head, seg=4)
    # ears: near one upright, far one bent over
    P['ears'] = []
    for k, s in enumerate((-1, 1)):
        eg = grp(f'eg_ear{k}', head, loc=(-2.0, s * 4.6, 8.0), rot=(-s * 12, -14, 0)); P['ears'].append(eg)
        ell(f'eg_bolt{k}', C['brass'], (1.6, 1.6, 1.2), loc=(0, 0, 0.6), parent=eg)
        if k == 0:
            ell(f'eg_earo{k}', C['lav'], (3.4, 1.7, 11.5), loc=(0, 0, 11.0), parent=eg)
            ell(f'eg_eari{k}', C['pink'], (2.2, 1.1, 8.6), loc=(1.4, -0.2, 11.0), parent=eg)
        else:
            ell(f'eg_earo{k}', C['lav'], (3.4, 1.7, 6.4), loc=(0, 0, 6.0), parent=eg)
            fl = grp(f'eg_flop{k}', eg, loc=(0, 0, 11.0), rot=(0, 60, 0))
            ell(f'eg_earo2{k}', C['lav'], (3.2, 1.6, 6.0), loc=(0, 0, 5.0), parent=fl)
            ell(f'eg_eari{k}', C['pink'], (2.0, 1.0, 4.8), loc=(1.3, -0.2, 5.0), parent=fl)
    # legs (in body space): pastel thigh, iron shin, brass ankle, long egg-plate foot
    def foot(ankle):
        ell(ankle.name + '_ball', C['brass'], (1.9, 1.9, 1.9), parent=ankle)
        ell(ankle.name + '_foot', C['shell'], (7.2, 3.2, 2.3), loc=(3.6, 0, -0.1), parent=ankle)
        ell(ankle.name + '_toes', C['pink'], (2.2, 2.6, 1.6), loc=(9.0, 0, 0.0), parent=ankle)
    P['legs'] = [build_leg(f'eg_leg{k}', body, (-1.5, s * 9.5, 15), 7.5, 6.5, C['sky'], C['iron'], [4.0, 3.0], [1.4, 1.3], foot)
                 for k, s in enumerate((-1, 1))]
    # arms + mallet
    P['sh'] = [(1.0, -14.8, 30.0), (1.0, 14.8, 30.0)]
    for k, (x, y, z) in enumerate(P['sh']):
        ell(f'eg_shoulder{k}', C['sky'], (3.6, 3.2, 3.6), loc=(x, y, z), parent=torso)
    P['elbows'] = [ell(f'eg_elbow{k}', C['brass'], (1.7, 1.7, 1.7), parent=torso) for k in range(2)]
    P['paws'] = [ell(f'eg_paw{k}', C['shell'], (2.8, 2.6, 2.8), parent=torso) for k in range(2)]
    mal = grp('eg_mallet', torso); P['mallet'] = mal
    tube('eg_handle', C['wood'], [(0, 0, -5), (0, 0, 22)], 1.25, mal, seg=10)
    mh = grp('eg_mhead', mal, loc=(0, 0, 23.0), scale=(1.4, 1.4, 1.4))
    lathe('eg_mwood', C['wood'], [(-8.5, 0, 0), (-8.5, 5.8, 5.8), (-7.9, 6.6, 6.6), (7.9, 6.6, 6.6), (8.5, 5.8, 5.8), (8.5, 0, 0)], mh, 32, axis='x')
    lathe('eg_mstripe', C['pink'], [(-2.6, 6.75, 6.75), (2.6, 6.75, 6.75)], mh, 32, axis='x')
    for j, x in enumerate((-6.6, 6.6)):
        ring(f'eg_mband{j}', C['band'], 6.75, 6.75, 0.7, parent=grp(f'eg_mbandg{j}', mh, loc=(x, 0, 0), rot=(0, 90, 0)), seg=6, n=40)
        lathe(f'eg_mcap{j}', C['band'], [(0, 0, 0), (0, 5.0, 5.0), (0.6, 4.6, 4.6), (0.7, 0, 0)], mh, 24, axis='x', loc=(x * 1.29, 0, 0),
              rot=(0, 0, 0 if x > 0 else 180))
    return P


def pose_egg(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; body, torso, head = P['body'], P['torso'], P['head']
    hurt = anim == 'hurt'
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt)
    bz, sq, lean, hrot, ear = 0.0, 0.0, 6.0, (0, 0, -6), 0.0
    feet = [(3.5, 2.0, 0), (-2.5, 2.0, 0)]
    theta, grip = 140, (10.0, -3.0, 18.5)
    if anim == 'idle':
        lean = 6 + 1.5 * math.sin(ph); hrot = (0, 2 * math.sin(ph), -6 + 4 * math.sin(ph))
        grip = (10.0, -3.0, 18.5 + 0.6 * math.sin(ph)); ear = 5 * math.sin(ph + 1)
    elif anim == 'move':
        bz = [0, 4, 12, 14, 8, 1][i]; sq = [0.12, -0.1, -0.05, 0, -0.05, 0.12][i]
        air = [0, 1, 4, 5, 3, 0][i]
        feet = [(3.5 + (2 if bz > 2 else 0), 2.0 + max(0.0, bz - 1) + air, -20 if bz > 2 else 0), (-2.5 + (2 if bz > 2 else 0), 2.0 + max(0.0, bz - 1) + air, -20 if bz > 2 else 0)]
        lean = [10, -4, 0, 6, 14, 6][i]; ear = [-4, -28, -20, -8, 12, 16][i]
        theta, grip = -55 + [0, -6, -10, -4, 6, 2][i], (9.0, -4.0, 31.0)
    elif anim == 'attack':
        theta = [20, -25, -65, 125][i]; grip = [(6, -4, 33), (3, -4, 39), (1, -4, 41), (15, -4, 19)][i]
        lean = [-4, -10, -14, 16][i]; ear = [-6, -14, -20, 18][i]
        feet = [(6.0, 2.0, 0), (-5.0, 2.0, 0)]
    elif anim == 'hurt':
        lean = -16; theta, grip = 100, (8.0, -4.0, 22.0); ear = 30; hrot = (-6, -12, -10); bz = 0.8
        feet = [(6.0, 4.5, -14), (-2.5, 2.0, 0)]
    else:
        bz = 10.0; sq = -0.06; lean = -4; theta, grip = -30, (6.0, -4.0, 37.0); ear = -24
        feet = [(5.0, 16.0, -25), (1.0, 15.0, -25)]
    body.location = (0, 0, bz); body.scale = (1 + sq, 1 + sq, 1 - sq)
    torso.rotation_euler = (0, rad(lean), 0)
    head.rotation_euler = tuple(rad(a) for a in hrot)
    for k, eg in enumerate(P['ears']):
        s = -1 if k == 0 else 1
        eg.rotation_euler = (rad(-s * 12), rad(-14 + ear), 0)
    P['key'].rotation_euler = (TAU * (i / n if anim in ('idle', 'move') else 0.15 * i), 0, 0)
    for k, leg in enumerate(P['legs']):
        pose_leg(leg, body, feet[k][:2], feet[k][2])
    mal = P['mallet']; mal.location = grip; mal.rotation_euler = (0, rad(theta), 0)
    hands = [np.array(mal.matrix_basis @ Vector((0, 0, 0))), np.array(mal.matrix_basis @ Vector((0, 0, 5.5)))]
    for k, (sh, hd) in enumerate(zip(P['sh'], hands)):
        side = -1 if k == 0 else 1
        hd = hd + np.array([0, side * 1.6, 0])
        e = elbow_pt(sh, hd, 17.0, (-0.4, side, -0.5))
        limb(f'eg_upper{k}', C['sky'], torso, [sh, e], [3.0, 2.5], seg=10)
        limb(f'eg_fore{k}', C['iron'], torso, [e, hd], 1.3, seg=8)
        P['elbows'][k].location = tuple(e); P['paws'][k].location = tuple(hd)


def make_boss_egg():
    return run_sheet('boss_egg', make_egg(), pose_egg)


# ---------------------------------------------------------------------------------------------------------------
# 5. CUPIDITY: chubby smug flying cherub, tiny pink wings, sash, heart-tipped crossbow. Hovers: feet ~10 px up.
CUPID_SCALE = 1.28


def make_cupid():
    new_scene()
    rt = root('cupid', yaw=-22)
    C = dict(skin=skin('cu_skin', '#f8c6a4'), cheek=skin('cu_cheek', '#f2808c'), hair=M('cu_hair', '#f6d462', rough=0.45, spec=0.6),
             hair2=M('cu_hair2', '#e2b03e', rough=0.5), wing=M('cu_wing', '#fcc4de', rough=0.45, sss=0.15), wing2=M('cu_wing2', '#f48cbc', rough=0.45),
             diaper=cloth('cu_diaper', '#f8f4ee', 0.55), pin=metal('cu_pin', '#e8c050', 0.25), sash=gloss('cu_sash', '#d81e4a', 0.35),
             heart=gloss('cu_heart', '#f0203e', 0.2), wood=M('cu_wood', '#9a6238', rough=0.4, coat=0.3), limbm=gloss('cu_limb', '#f060a0', 0.3),
             string=M('cu_string', '#fff4f8', rough=0.4), gold=metal('cu_gold', '#ecc050', 0.25), lid=skin('cu_lid', '#f0b494'),
             mouthm=M('cu_mouth', '#9a2236', rough=0.4), brow=M('cu_brow', '#c89030', rough=0.6))
    P = dict(C=C, rt=rt)
    body = grp('cu_body', rt, loc=(0, 0, 10), scale=(CUPID_SCALE,) * 3); P['body'] = body
    ell('cu_belly', C['skin'], (11.5, 10.6, 12.5), loc=(0, 0, 23), parent=body, seg=32, n=18)
    ell('cu_navel', C['cheek'], (0.4, 0.6, 0.7), loc=on_sphere((11.5, 10.6, 12.5), 24, -6, (0, 0, 23)), parent=body, seg=8, n=6)
    ell('cu_diaper', C['diaper'], (12.0, 11.1, 7.4), loc=(0.2, 0, 14.6), parent=body, seg=32, n=14)
    ring('cu_waist', C['diaper'], 11.6, 10.7, 0.8, z=18.6, cx=0.2, parent=body, seg=6, n=40)
    ell('cu_pinm', C['pin'], (0.6, 1.6, 0.8), loc=on_sphere((12.2, 11.3, 7.6), 30, 20, (0.2, 0, 14.6)), parent=body, seg=8, n=6)
    # sash over the shoulder, heart badge
    sg = grp('cu_sashg', body, loc=(0, 0, 25.5), rot=(32, 14, 0))
    sr = ring('cu_sash', C['sash'], 12.0, 11.2, 1.0, parent=sg, seg=6, n=44); sr.scale = (1, 1, 1.8)
    hb = grp('cu_badge', body, loc=on_sphere((12.0, 11.2, 12.8), 40, 2, (0, 0, 23)), rot=(0, 0, -40))
    extrude_xz('cu_badgeh', C['gold'], [(z, -x) for x, z in heart_poly(0.13)], -0.5, 0.5, hb, rot=(0, 0, 90))
    # legs: chubby, dangling
    P['legs'] = []
    for k, s in enumerate((-1, 1)):
        lg = grp(f'cu_leg{k}', body, loc=(2.0, s * 5.6, 13.0)); P['legs'].append(lg)
        ell(f'cu_thigh{k}', C['skin'], (5.6, 3.9, 3.9), loc=(3.0, 0, -1.2), rot=(0, 22, 0), parent=lg)
        ell(f'cu_shin{k}', C['skin'], (3.2, 3.2, 5.0), loc=(6.4, 0, -5.6), rot=(0, -10, 0), parent=lg)
        ell(f'cu_foot{k}', C['skin'], (3.6, 2.4, 1.9), loc=(7.6, 0, -10.2), parent=lg)
    # head
    head = grp('cu_head', body, loc=(2.6, 0, 45.0), rot=(0, 0, -16)); P['head'] = head
    hr = (12.5, 12.0, 12.0)
    ell('cu_skull', C['skin'], hr, parent=head, seg=36, n=22)
    ell('cu_ear', C['skin'], (1.3, 0.9, 2.0), loc=(-1.0, -11.8, -1.0), parent=head)
    ell('cu_nose', C['lid'], (1.2, 1.1, 0.9), loc=on_sphere(hr, 26, -9), parent=head)
    for k, az in enumerate((54, 0)):
        ell(f'cu_cheekm{k}', C['cheek'], (1.8, 2.4, 1.9), loc=on_sphere(np.array(hr) - 0.6, az, -14), parent=head)
    eyes = ((44, 3), (8, 3))
    P['eyes'] = []
    for k, (az, el) in enumerate(eyes):
        p = np.array(on_sphere(hr, az, el)); nn = nrm(p)
        P['eyes'].append(ell(f'cu_eye{k}', eye_mat(), (0.9, 1.4, 2.0), loc=tuple(p), rot=look_rot(p), parent=head, seg=12, n=8))
        P['eyes'].append(ell(f'cu_gl{k}', glint_mat(), (0.38,) * 3, loc=tuple(p + nn * 0.55 + np.array([0.1, -0.1, -0.7])), parent=head, seg=8, n=6))
        P['eyes'].append(ell(f'cu_lid{k}', C['lid'], (1.3, 2.0, 1.45), loc=tuple(p + nn * 0.2 + np.array([0, 0, 1.05])), rot=look_rot(p), parent=head, seg=12, n=8))
    P['squint'] = squint(head, hr, eyes, 'cu', span=16, h=13, w=0.6)
    # smug brows: near one arched high, far one low
    rr = np.array(hr) + 0.3
    tube('cu_brow0', C['brow'], smooth_path([on_sphere(rr, 52, 12), on_sphere(rr, 44, 17), on_sphere(rr, 36, 14)], 8), 0.6, head, seg=6)
    tube('cu_brow1', C['brow'], smooth_path([on_sphere(rr, 15, 10), on_sphere(rr, 8, 11), on_sphere(rr, 0, 9)], 8), 0.6, head, seg=6)
    tube('cu_smirk', C['mouthm'], smooth_path([on_sphere(rr - 0.1, 40, -29), on_sphere(rr - 0.1, 30, -32), on_sphere(rr - 0.1, 20, -31),
                                               on_sphere(rr - 0.1, 12, -27), on_sphere(rr - 0.1, 8, -21)], 10), 0.55, head, seg=6)
    # golden curls
    curls = [(az, el) for az in (-170, -135, -100, -65, -30) for el in (22, 50)] + [(az, 4) for az in (-175, -145, -115, 175, 145, 115)] + \
            [(-30, 74), (-60, 64), (150, 55), (100, 30), (-90, 30)]
    for k, (az, el) in enumerate(curls):
        ell(f'cu_curl{k}', C['hair'] if k % 3 else C['hair2'], (3.6, 3.6, 3.4), loc=on_sphere(np.array(hr) - 1.0, az, el), parent=head, seg=14, n=8)
    c0 = np.array(on_sphere(np.array(hr) + 1.2, 10, 66))
    tube('cu_forelock', C['hair'], [tuple(c0 + np.array([1.8 * math.cos(a) * (1 - a / 12), -0.3, 1.8 * math.sin(a) * (1 - a / 12)])) for a in np.linspace(0, 9, 16)],
         [1.2 - 0.05 * j for j in range(16)], head, seg=8)
    # wings
    P['wings'] = []
    for k, s in enumerate((-1, 1)):
        wg = grp(f'cu_wing{k}', body, loc=(-8.0, s * 5.5, 31.0)); P['wings'].append(wg)
        for j in range(4):
            fg = grp(f'cu_fg{k}{j}', wg, rot=(0, -28 - j * 24, 0))
            ell(f'cu_feather{k}{j}', C['wing'] if j % 2 == 0 else C['wing2'], (2.4, 0.9, 6.6 - j * 0.8), loc=(0, 0, 6.0 - j * 0.7), parent=fg, seg=14, n=8)
        ell(f'cu_wroot{k}', C['wing'], (2.2, 1.4, 2.2), parent=wg)
    # arms
    P['sh'] = [(2.0, -10.6, 31.0), (2.0, 10.6, 31.0)]
    P['hands'] = [ell(f'cu_hand{k}', C['skin'], (2.5, 2.5, 2.5), parent=body) for k in range(2)]
    # crossbow
    cb = grp('cu_xbow', body, scale=(1.35, 1.35, 1.35)); P['xbow'] = cb
    box('cu_stock', C['wood'], (17.0, 2.4, 2.8), loc=(3.0, 0, 0), parent=cb, bevel=0.5)
    box('cu_butt', C['wood'], (5.0, 2.6, 4.6), loc=(-5.0, 0, -1.0), parent=cb, bevel=0.6, taper=(1, 0.8))
    tube('cu_prod', C['limbm'], smooth_path([(10.5, -9.0, -0.6), (12.4, -4.5, 0), (13.0, 0, 0), (12.4, 4.5, 0), (10.5, 9.0, -0.6)], 12), 0.95, cb, seg=8)
    for j, y in enumerate((-9.0, 9.0)):
        ell(f'cu_prodtip{j}', C['heart'], (0.9, 0.9, 0.9), loc=(10.5, y, -0.6), parent=cb, seg=8, n=6)
    P['strings'] = [tube('cu_string_d', C['string'], [(10.5, -9.0, -0.6), (3.0, 0, 0.9), (10.5, 9.0, -0.6)], 0.3, cb, seg=5),
                    tube('cu_string_f', C['string'], [(10.5, -9.0, -0.6), (12.0, 0, 0.6), (10.5, 9.0, -0.6)], 0.3, cb, seg=5)]
    bolt = grp('cu_bolt', cb); P['bolt'] = bolt
    tube('cu_shaft', C['gold'], [(2.6, 0, 1.6), (14.5, 0, 1.6)], 0.45, bolt, seg=6)
    extrude_xz('cu_tip', C['heart'], heart_poly(0.17), -0.7, 0.7, bolt, loc=(15.0, 0, 1.6))
    for j, z in enumerate((0.6, -0.6)):
        tube(f'cu_fletch{j}', C['heart'], [(2.6, 0, 1.6), (4.6, 0, 1.6 + z * 2.2)], 0.3, bolt, seg=4)
    hs = grp('cu_stockheart', cb, loc=(-4.6, -1.4, -0.6))
    extrude_xz('cu_stockheartm', C['heart'], [(z, -x) for x, z in heart_poly(0.09)], -0.3, 0.3, hs, rot=(0, 0, 0))
    return P


def pose_cupid(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; body, head = P['body'], P['head']
    hurt = anim == 'hurt'
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt)
    bob, lean, flap, legr, hrot = 0.0, 4.0, 0.0, 0.0, (0, 0, -8)
    xl, xp, drawn = (11.0, -6.0, 25.0), 6.0, True
    if anim == 'idle':
        flap = 34 * math.sin(ph); bob = 1.3 * math.sin(ph + 1.2); legr = 6 * math.sin(ph + 0.5)
        hrot = (0, 2 * math.sin(ph), -8)
    elif anim == 'move':
        flap = 48 * math.sin(ph); bob = 2.0 * math.sin(ph + 1.2); lean = 16; legr = -24 + 6 * math.sin(ph)
        hrot = (0, -10, -8); xl, xp = (12.0, -6.0, 26.0), -2.0
    elif anim == 'attack':
        flap = 30 * math.sin(ph); bob = 0.8 * math.sin(ph + 1.2); lean = [6, 2, -2, -8][i]
        xl = [(11, -6, 23), (12, -7, 28), (13, -8, 31), (10, -8, 32.5)][i]; xp = [12, 0, -3, -16][i]
        hrot = (0, [0, 4, 7, 2][i], -8); drawn = i < 3
    elif anim == 'hurt':
        lean = -20; flap = -40; legr = 30; hrot = (8, -14, -12)
        xl, xp = (8.0, -9.0, 34.0), -45
    else:
        lean = -8; flap = -50; legr = -30; bob = 3.0; hrot = (0, -8, -8); xl, xp = (12.0, -6.0, 26.0), -8
    body.location = (0, 0, 10 + bob)
    body.rotation_euler = (0, rad(lean), 0)
    head.rotation_euler = tuple(rad(a) for a in hrot)
    for k, wg in enumerate(P['wings']):
        s = -1 if k == 0 else 1
        wg.rotation_euler = (rad(-s * (35 + flap)), rad(-8 - 0.25 * flap), 0)
    for lg in P['legs']: lg.rotation_euler = (0, rad(legr), 0)
    cb = P['xbow']; cb.location = xl; cb.rotation_euler = (0, rad(xp), 0)
    set_vis([P['bolt']], drawn); set_vis([P['strings'][0]], drawn); set_vis([P['strings'][1]], not drawn)
    grips = [np.array(cb.matrix_basis @ Vector((-1.0, -1.6, -1.6))), np.array(cb.matrix_basis @ Vector((7.0, 1.6, -1.4)))]
    for k, (sh, hd) in enumerate(zip(P['sh'], grips)):
        side = -1 if k == 0 else 1
        arm(f'cu_arm{k}', C['skin'], body, sh, hd, 17.0, (-0.4, side, -0.6), [3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.6, 2.6, 2.6, 2.6])
        P['hands'][k].location = tuple(hd)


def make_boss_cupid():
    return run_sheet('boss_cupid', make_cupid(), pose_cupid)


# ---------------------------------------------------------------------------------------------------------------
# 6. GOBBLEZILLA: an enormous angry turkey in a buckled hat, fanned autumn tail, wattle; spits gravy
def make_gobble():
    new_scene()
    rt = root('gobble', yaw=-24)
    C = dict(body=M('gb_body', '#74442a', rough=0.55), body2=M('gb_body2', '#5a321e', rough=0.6), wing=M('gb_wing', '#62381f', rough=0.55),
             bar=M('gb_bar', '#efe2c4', rough=0.5), t1=M('gb_t1', '#b4321e', rough=0.45), t2=M('gb_t2', '#e47c2a', rough=0.45),
             t3=M('gb_t3', '#ecb842', rough=0.45), t4=M('gb_t4', '#86461e', rough=0.5), tip=M('gb_tip', '#f4e6bc', rough=0.45),
             skin=skin('gb_skin', '#e4a49c'), wattle=gloss('gb_wattle', '#d41e2a', 0.3), beak=gloss('gb_beak', '#f2b030', 0.3),
             leg=M('gb_leg', '#e8823c', rough=0.45), claw=M('gb_claw', '#3a2a24', rough=0.4), hat=M('gb_hat', '#1c1a22', rough=0.35, spec=0.6),
             band=M('gb_band', '#4a4458', rough=0.4), gold=metal('gb_gold', '#ecc050', 0.25), maw=M('gb_maw', '#6a1018', rough=0.5),
             gravy=M('gb_gravy', '#8a521e', rough=0.12, spec=0.8, coat=0.8), brow=M('gb_brow', '#2a1a18', rough=0.6))
    P = dict(C=C, rt=rt)
    body = grp('gb_body', rt); P['body'] = body
    torso = grp('gb_torso', body, loc=(0, 0, 22)); P['torso'] = torso
    ell('gb_core', C['body'], (17, 14, 15), loc=(-1, 0, 15), rot=(0, -12, 0), parent=torso, seg=36, n=20)
    breast = ell('gb_breast', C['body'], (11, 11.5, 12), loc=(9, 0, 13), parent=torso, seg=32, n=18); P['breast'] = breast
    for r_ in range(3):
        for j in range(5):
            az, el = -10 - j * 17 + r_ * 8, -4 - r_ * 14
            p = np.array(on_sphere((11.2, 11.7, 12.2), az, el, (0, 0, 0)))
            ell(f'gb_scal{r_}{j}', C['body2'], (0.6, 2.7, 2.2), loc=tuple(p + np.array([9, 0, 13])), rot=look_rot(p), parent=breast if False else torso, seg=10, n=6)
    for k, s in enumerate((-1, 1)):
        ell(f'gb_drum{k}', C['body'], (6.5, 4.6, 7.0), loc=(1.5, s * 8.6, 4.0), rot=(0, 15, 0), parent=torso)
    ell('gb_rump', C['body2'], (6.0, 9.0, 7.0), loc=(-14, 1, 18), parent=torso)
    ell('gb_ruff', C['body'], (7.0, 8.0, 6.0), loc=(10, 0, 23), parent=torso)
    # tail fan: faces the camera, autumn colours with cream tips
    fan = grp('gb_fan', torso, loc=(-13, 4, 21), rot=(0, -12, -50)); P['fan'] = fan
    cols = ['t1', 't2', 't3', 't4', 't2', 't1', 't3']
    for j, b in enumerate(np.linspace(-84, 84, 13)):
        fg = grp(f'gb_fo{j}', fan, rot=(b, 0, 0))
        ell(f'gb_feo{j}', C[cols[j % len(cols)]], (1.0, 3.5, 12.5), loc=(0, 0, 12.5), parent=fg, seg=14, n=10)
        ell(f'gb_fet{j}', C['tip'], (1.1, 3.1, 2.4), loc=(0.15, 0, 23.0), parent=fg, seg=12, n=6)
    for j, b in enumerate(np.linspace(-75, 75, 11)):
        fg = grp(f'gb_fi{j}', fan, rot=(b, 0, 0))
        ell(f'gb_fei{j}', C[cols[(j + 3) % len(cols)]], (1.0, 3.0, 8.5), loc=(0.9, 0, 8.5), parent=fg, seg=12, n=8)
    # wings
    P['wings'] = []
    for k, s in enumerate((-1, 1)):
        wg = grp(f'gb_wingg{k}', torso, loc=(-1, s * 13.4, 17)); P['wings'].append(wg)
        ell(f'gb_wingm{k}', C['wing'], (12.5, 2.6, 7.6), loc=(-2, 0, -1), rot=(0, 10, 0), parent=wg, seg=24, n=12)
        for j in range(4):
            ell(f'gb_bar{k}{j}', C['bar'], (0.75, 2.75, 4.2), loc=(-11.5 + j * 2.1, s * 0.3, -2.6 + j * 0.4), rot=(0, 10, 0), parent=wg, seg=10, n=6)
    # head
    head = grp('gb_head', torso, loc=(19, 0, 41), scale=(1.35, 1.35, 1.35)); P['head'] = head
    hr = (7.6, 7.0, 8.0)
    ell('gb_skull', C['skin'], hr, parent=head, seg=28, n=18)
    eyes = ((52, 14), (10, 14))
    add_face(head, hr, eyes=eyes, eye_r=(0.95, 1.3, 1.8), brow_m=C['brow'], brow_r=0.95, prefix='gbf', brow_lift=-1)
    P['eyes'] = face_eyes('gbf'); P['squint'] = squint(head, hr, eyes, 'gbf', span=18, h=15, w=0.6)
    bk = grp('gb_beak', head, loc=on_sphere(np.array(hr) - 1.2, 30, -8), rot=(0, 16, -30))
    lathe('gb_upper', C['beak'], [(0, 0, 0), (0, 2.8, 2.6), (2.6, 2.0, 1.8), (5.0, 0.9, 0.8), (6.0, 0, 0)], bk, 14, axis='x')
    jaw = grp('gb_jaw', bk, loc=(0.2, 0, -1.1)); P['jaw'] = jaw
    lathe('gb_lower', C['beak'], [(0, 0, 0), (0, 2.0, 1.8), (2.4, 1.5, 1.2), (4.4, 0.6, 0.5), (4.8, 0, 0)], jaw, 12, axis='x')
    ell('gb_mawm', C['maw'], (2.6, 1.8, 1.2), loc=(1.4, 0, 0.3), parent=jaw, seg=12, n=6)
    P['tip'] = grp('gb_beaktip', bk, loc=(6.5, 0, -1.0))
    sb = np.array(on_sphere(np.array(hr), 30, 6)); d = np.array([math.cos(rad(30)), -math.sin(rad(30)), 0])
    tube('gb_snood', C['wattle'], smooth_path([sb, sb + d * 2.0 + [0, 0, 0.6], sb + d * 4.6 + [0, 0, -1.0], sb + d * 5.6 + [0, 0, -4.4], sb + d * 5.0 + [0, 0, -7.2]], 10),
         [1.3, 1.25, 1.2, 1.1, 1.05, 1.0, 0.95, 0.9, 0.9, 1.0], head, seg=8)
    for j, (loc, r_) in enumerate((((4.0, -1.0, -6.6), (2.4, 2.1, 3.0)), ((2.8, -0.8, -10.0), (2.3, 2.0, 2.8)), ((5.2, -1.4, -10.4), (1.6, 1.5, 2.2)))):
        ell(f'gb_wattle{j}', C['wattle'], r_, loc=loc, parent=head)
    capotain('gb_hat', head, (-1.2, 0, 6.4), C['hat'], C['band'], C['gold'], crown_h=9.5, r0=4.6, r1=4.0, brim=7.4, rot=(0, -14, 0), buckle_az=34)
    # legs
    def foot(ankle):
        for j, y in enumerate((-1.7, 0, 1.7)):
            tube(f'{ankle.name}_toe{j}', C['leg'], [(0, 0, 0), (4.8, y * 1.4, -1.0)], 0.8, ankle, seg=6)
            ell(f'{ankle.name}_claw{j}', C['claw'], (0.9, 0.6, 0.6), loc=(5.4, y * 1.5, -1.1), parent=ankle, seg=8, n=6)
        tube(f'{ankle.name}_toeb', C['leg'], [(0, 0, 0), (-2.8, 0, -1.0)], 0.75, ankle, seg=6)
    P['legs'] = [build_leg(f'gb_leg{k}', body, (2, s * 6.2, 22), 10.0, 11.0, C['body'], C['leg'], [3.6, 2.6], [1.5, 1.3], foot, kdir=-1)
                 for k, s in enumerate((-1, 1))]
    P['gravy'] = []
    for j in range(6):
        g = grp(f'gb_gravyg{j}', rt); ell(f'gb_gravy{j}', C['gravy'], (2.3 - 0.18 * j, 1.8, 1.8), parent=g, seg=10, n=6); P['gravy'].append(g)
    P['loose'] = []
    for j in range(3):
        g = grp(f'gb_looseg{j}', rt, rot=(30 * j, 50 + 40 * j, 20)); ell(f'gb_loose{j}', C[['t2', 't1', 't3'][j]], (0.6, 1.8, 4.0), parent=g, seg=10, n=6)
        P['loose'].append(g)
    return P


def pose_gobble(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; body, torso, head = P['body'], P['torso'], P['head']
    hurt = anim == 'hurt'
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt); set_vis(P['gravy'], False); set_vis(P['loose'], False)
    bz, lean, hp, hrot, jaw, wing, bs, fs, fanr = 0.0, 2.0, (19, 0, 41), (0, 0, -10), 4, 0, 1.0, 1.0, 0.0
    feet = [(4.0, 1.8, 0), (-3.0, 1.8, 0)]
    if anim == 'idle':
        hp = (19 + 0.6 * math.sin(ph), 0, 41 + 0.6 * math.sin(ph)); hrot = (0, 3 * math.sin(ph), -10 + 5 * math.sin(ph + 1))
        fanr = 2 * math.sin(ph); jaw = 4 + 3 * max(0.0, math.sin(2 * ph))
    elif anim == 'move':
        feet = []
        for k in (0, 1):
            a = ph + k * math.pi
            feet.append((1.5 + 7.0 * math.sin(a), 1.8 + 6.0 * max(0.0, math.cos(a)), -25 * max(0.0, math.cos(a))))
        bz = 0.8 * abs(math.sin(ph)); lean = 4 + 2 * math.cos(2 * ph)
        hp = (19 + 3.5 * math.sin(2 * ph + 0.8), 0, 41 - 1.0 * abs(math.cos(ph))); fanr = 4 * math.sin(ph)
    elif anim == 'attack':
        hp = [(13, 0, 45), (11, 0, 47), (25, 0, 37), (29, 0, 34)][i]; hrot = (0, [-12, -18, 12, 18][i], -10)
        jaw = [4, 14, 32, 44][i]; bs = [1.05, 1.1, 1.0, 1.0][i]; lean = [-4, -8, 10, 14][i]; fs = [1.04, 1.08, 1.02, 1.0][i]
        feet = [(6.0, 1.8, 0), (-5.0, 1.8, 0)]
    elif anim == 'hurt':
        hp = (12, 0, 43); hrot = (8, -20, -14); lean = -12; wing = 45; jaw = 20; fanr = -8
        feet = [(6.0, 5.0, -20), (-3.0, 1.8, 0)]
    else:
        bz = 7.0; feet = [(3.0, 19.0, -30), (-1.0, 18.0, -30)]; wing = 70; hp = (17, 0, 43); lean = -6; jaw = 12; fs = 1.05
    body.location = (0, 0, bz)
    torso.rotation_euler = (0, rad(lean), 0)
    head.location = hp; head.rotation_euler = tuple(rad(a) for a in hrot)
    P['jaw'].rotation_euler = (0, rad(jaw), 0)
    P['breast'].scale = (bs, bs, bs)
    P['fan'].scale = (fs, fs, fs); P['fan'].rotation_euler = (rad(fanr), rad(-12), rad(-50))
    for k, wg in enumerate(P['wings']):
        s = -1 if k == 0 else 1
        wg.rotation_euler = (rad(-s * wing), rad(-wing * 0.3), 0)
    base = np.array((10.0, 0, 22.0)); h = np.array(hp)
    limb('gb_neck', C['skin'], torso, [base, (base + h) / 2 + np.array([-1.5, 0, 0]), h - np.array([1.0, 0, 3.0])], [5.6, 5.2, 4.8, 4.5, 4.2, 4.0, 3.9, 3.8, 3.8, 3.8], seg=14)
    for k, leg in enumerate(P['legs']):
        pose_leg(leg, body, feet[k][:2], feet[k][2])
    if anim == 'attack' and i >= 2:
        tp = world_in(P['tip'], P['rt'])
        offs = [[(2, 0, -0.5), (4.5, -0.5, 0.5)], [(3, 0, -0.5), (7, -0.5, 0.8), (11, 0.5, -0.4), (15, 0, 0.6), (6, 0.8, -2.2), (19, -0.5, -0.8)]][i - 2]
        for g, o in zip(P['gravy'], offs):
            g.location = tuple(tp + np.array(o)); set_vis([g], True)
    if hurt:
        for g, o in zip(P['loose'], ((-6, -14, 52), (14, -12, 56), (-20, -8, 40))):
            g.location = o; set_vis([g], True)


def make_boss_gobble():
    return run_sheet('boss_gobble', make_gobble(), pose_gobble)


# ---------------------------------------------------------------------------------------------------------------
# 7. THE WITCHFINDER'S NAUGHTY SLEIGH: black-and-red mechanical sleigh, iron runners, smokestack, a sack of stolen
#    cauldrons; the Witchfinder (same head and hat as build_enemies' finder) drives and hurls holy water
def make_sleigh():
    new_scene()
    rt = root('sleigh', yaw=-20)
    C = finder_mats()
    C.update(black=M('sl_black', '#2e2a34', rough=0.3, spec=0.6, coat=0.5), red=M('sl_red', '#c0242e', rough=0.3, spec=0.6, coat=0.5),
             gold=metal('sl_gold2', '#ecc050', 0.25), iron=metal('sl_iron', '#8a8e9c', 0.32), iron_d=metal('sl_iron_d', '#4a4c58', 0.4),
             sack=cloth('sl_sack', '#b8945c', 0.7), rope=cloth('sl_rope', '#dcc484', 0.6), caul=M('sl_caul', '#2a2830', rough=0.35, metal=0.6),
             goo=M('sl_goo', '#58e070', rough=0.3, emit=(0.35, 0.95, 0.45, 2.5)), smoke=M('sl_smoke', '#d6d2dc', rough=0.9),
             snow=M('sl_snow', '#f4f8ff', rough=0.6), glass=M('sl_glass', '#4aa8f0', rough=0.1, spec=0.8, coat=1.0, emit=(0.3, 0.65, 1.0, 0.6)),
             cork=M('sl_cork', '#b08a5a', rough=0.6), cushion=cloth('sl_cushion', '#9a1c26', 0.5))
    P = dict(C=C, rt=rt)
    sl = grp('sl_sleigh', rt); P['sleigh'] = sl
    prof = [(-34, 10), (22, 10), (30, 13), (35, 19), (37, 27), (35, 33), (31, 34), (29, 31), (31, 27), (27, 23), (12, 22), (6, 18), (-4, 18),
            (-6, 21), (-7, 34), (-10, 36), (-13, 34), (-14, 24), (-32, 24), (-35, 27), (-36, 23)]
    extrude_xz('sl_hull', C['black'], prof, -8.0, 8.0, sl, bevel=0.45)
    panel = [(-31, 12.5), (21, 12.5), (27.5, 15.5), (30, 20), (26, 21.5), (12, 20.4), (5.5, 16.2), (-5, 16.2), (-8, 19.5), (-9.5, 22.2), (-31, 22.2)]
    for k, (y0, y1) in enumerate(((-8.5, -7.8), (7.8, 8.5))):
        extrude_xz(f'sl_panel{k}', C['red'], panel, y0, y1, sl, bevel=0.2)
    # gold trim along the scroll edge and a red curl on each side
    for k, y in enumerate((-8.3, 8.3)):
        tube(f'sl_trim{k}', C['gold'], smooth_path([(27, y, 23), (31, y, 27), (29, y, 31), (31, y, 34), (35, y, 33), (37, y, 27), (35, y, 19), (30, y, 13)], 24), 0.5, sl, seg=6)
        tube(f'sl_curl{k}', C['gold'], [(32.5 + (3.2 - 0.26 * j) * math.cos(0.55 * j), y * 1.03, 26.5 + (3.2 - 0.26 * j) * math.sin(0.55 * j)) for j in range(12)], 0.42, sl, seg=5)
        for j, x in enumerate(np.linspace(-29, 19, 8)):
            ell(f'sl_rivet{k}{j}', C['gold'], (0.5, 0.4, 0.5), loc=(x, y * 1.07, 11.4), parent=sl, seg=8, n=6)
    box('sl_cushion', C['cushion'], (10.5, 15.0, 2.6), loc=(-1.0, 0, 19.2), parent=sl, bevel=0.8, segs=3)
    box('sl_backcush', C['cushion'], (1.8, 14.4, 11.0), loc=(-5.6, 0, 27.0), parent=sl, bevel=0.7, segs=3)
    # runners + struts
    for k, y in enumerate((-6.5, 6.5)):
        tube(f'sl_runner{k}', C['iron'], smooth_path([(-38, y, 3.2), (-33, y, 1.2), (20, y, 1.2), (30, y, 2.6), (37, y, 7.5), (39.5, y, 13), (37, y, 17), (33.5, y, 15.5), (34.5, y, 12)], 40), 1.15, sl, seg=8)
        for x in (-26, -6, 14):
            tube(f'sl_strut{k}{x}', C['iron_d'], [(x, y, 1.5), (x, y, 10.5)], 0.85, sl, seg=6)
        tube(f'sl_brace{k}', C['iron_d'], [(-26, y, 2), (-6, y, 10)], 0.55, sl, seg=5)
    # big red gear on the near side
    gg = grp('sl_gearg', sl, loc=(-22, -8.9, 17.0), rot=(90, 0, 0))
    gear = grp('sl_gear', gg); P['gear'] = gear
    lathe('sl_gearm', C['red'], [(0, 0, 0), (0, 4.4, 4.4), (1.0, 4.4, 4.4), (1.0, 0, 0)], gear, 28, loc=(0, 0, -0.2))
    for j in range(10):
        a = TAU * j / 10
        box(f'sl_tooth{j}', C['red'], (1.6, 1.6, 1.0), loc=(5.0 * math.cos(a), 5.0 * math.sin(a), 0.3), rot=(0, 0, math.degrees(a)), parent=gear, bevel=0.2)
    ell('sl_hub', C['gold'], (1.5, 1.5, 0.9), loc=(0, 0, 0.9), parent=gear)
    tube('sl_spoke', C['iron_d'], [(-3.4, 0, 1.0), (3.4, 0, 1.0)], 0.5, gear, seg=5)
    # smokestack on the front deck
    lathe('sl_stack', C['iron_d'], [(22, 0, 0, 22), (22, 2.5, 2.5, 22), (40, 2.3, 2.3, 22), (42, 3.3, 3.3, 22), (46, 4.5, 4.5, 22), (47.2, 4.5, 4.5, 22),
                                    (47.2, 3.6, 3.6, 22), (46.8, 0, 0, 22)], sl, 24)
    ring('sl_stackband', C['red'], 2.65, 2.65, 0.75, z=31, cx=22, parent=sl, seg=6)
    ring('sl_stackband2', C['gold'], 2.5, 2.5, 0.5, z=38, cx=22, parent=sl, seg=6)
    # tiller
    tl = grp('sl_tiller', sl, loc=(10, 4.5, 20), rot=(0, -28, 0))
    tube('sl_tillerrod', C['iron'], [(0, 0, 0), (0, 0, 10)], 0.55, tl, seg=8)
    P['knob'] = ell('sl_knob', C['red'], (1.5, 1.5, 1.5), loc=(0, 0, 10.6), parent=tl)
    # sack of stolen cauldrons
    ell('sl_sackm', C['sack'], (10.5, 8.6, 9.5), loc=(-24, 0, 32), parent=sl, seg=28, n=16)
    for j, (loc, r_) in enumerate((((-30.5, -4.5, 28.5), (5, 5, 5)), ((-17.5, -5, 29), (4.5, 4.5, 5)), ((-25, -6.5, 36), (4, 3.5, 4)))):
        ell(f'sl_lump{j}', C['sack'], r_, loc=loc, parent=sl)
    ell('sl_sackneck', C['sack'], (3.4, 3.4, 3.6), loc=(-24, 0, 41), parent=sl)
    ring('sl_sackrope', C['rope'], 3.4, 3.4, 0.7, z=40.4, cx=-24, parent=sl, seg=6)
    def cauldron(nm, loc, rot, goo=False, s=1.0):
        g = grp(nm, sl, loc=loc, rot=rot, scale=(s, s, s))
        lathe(nm + '_bowl', C['caul'], [(0, 0, 0), (0, 2.4, 2.4), (1.0, 3.8, 3.8), (3.0, 4.6, 4.6), (5.0, 4.3, 4.3), (5.6, 4.8, 4.8), (6.1, 4.6, 4.6), (5.8, 0, 0)], g, 28)
        if goo: ell(nm + '_goo', C['goo'], (4.1, 4.1, 0.9), loc=(0, 0, 5.8), parent=g, seg=20, n=8)
        return g
    cauldron('sl_caulA', (-22, 0.5, 42.5), (0, 22, 0), goo=True)
    cauldron('sl_caulB', (-31, -7.4, 30), (62, 0, -30), s=0.85)
    cauldron('sl_caulC', (-36, 3.0, 26.5), (0, -58, 0), s=0.8)
    # smoke and snow spray
    P['smoke'] = [ell(f'sl_puff{j}', C['smoke'], (1, 1, 1), parent=sl, seg=16, n=10) for j in range(4)]
    P['snow'] = [ell(f'sl_snow{j}', C['snow'], (1, 1, 1), parent=sl, seg=10, n=6) for j in range(4)]
    # the Witchfinder, seated, scaled up to boss size
    man = grp('sl_man', sl, loc=(-1.0, 0, 20.5), scale=(2.0, 2.0, 2.0)); P['man'] = man
    torso = grp('sl_torso', man); P['torso'] = torso
    coat, cp = robe('sl_coat', C['coat'], 10.4, [(0, 3.9), (0.3, 3.6), (0.6, 3.8), (0.82, 3.7), (0.93, 3.0), (1.0, 1.7)], [(0, 0.0), (1, 0.3)], 0.88, torso, z0=0.0)
    for j, u in enumerate((0.3, 0.45, 0.6, 0.75)):
        z, rx, ry, cx = cp(u)
        ell(f'sl_btn{j}', C['gold'], (0.3, 0.38, 0.38), loc=(cx + rx + 0.05, -0.4, z), parent=torso, seg=8, n=6)
    ring('sl_collar', C['collar'], 2.2, 2.0, 0.5, z=10.6, cx=0.3, parent=torso, seg=8)
    box('sl_bands', C['collar'], (0.5, 3.0, 2.2), loc=(2.2, -0.2, 9.6), rot=(0, -16, 0), parent=torso, bevel=0.2)
    for k, s in enumerate((-1, 1)):
        tube(f'sl_thigh{k}', C['coat'], [(0.0, s * 1.9, 0.6), (5.4, s * 2.0, 0.4)], [1.7, 1.45], man, seg=12)
        tube(f'sl_shin{k}', C['hose'], [(5.6, s * 2.0, 0.2), (6.4, s * 2.0, -3.6)], [1.15, 0.95], man, seg=10)
    hp = grp('sl_headpivot', torso, loc=(0.6, 0, 11.4)); P['headpivot'] = hp
    head, hr, _ = finder_head(hp, C, (0.4, 0, 2.6), 'sl')
    P['hat'] = capotain('sl_hat', head, (-0.3, 0, 2.7), C['hat'], C['band'], C['gold'], crown_h=8.6, r0=3.6, r1=3.0, brim=5.6, rot=(0, -6, 0), buckle_az=34)
    P['eyes'] = face_eyes('sl'); P['squint'] = squint(head, hr, ((44, 8), (2, 8)), 'sl', span=20, h=16, w=0.42)
    P['sh'] = [(0.4, -3.4, 9.0), (0.4, 3.4, 9.0)]
    P['hands'] = [ell(f'sl_hand{k}', C['skin'], (1.05, 1.05, 1.1), parent=torso) for k in range(2)]
    P['finger'] = tube('sl_finger', C['skin'], [(0.6, 0, 0.2), (2.0, -0.1, 0.5)], 0.38, P['hands'][0], seg=6)
    fl = grp('sl_flask', torso); P['flask'] = fl
    lathe('sl_flaskm', C['glass'], [(-0.6, 0, 0), (-0.6, 1.0, 1.0), (1.2, 1.15, 1.15), (1.9, 0.45, 0.45), (2.7, 0.4, 0.4), (2.7, 0, 0)], fl, 16)
    ell('sl_corkm', C['cork'], (0.45, 0.45, 0.55), loc=(0, 0, 3.0), parent=fl, seg=8, n=6)
    return P


def pose_sleigh(P, anim, i, n):
    ph = TAU * i / n
    C = P['C']; sl, torso, man = P['sleigh'], P['torso'], P['man']
    hurt = anim == 'hurt'
    set_vis(P['eyes'], not hurt); set_vis(P['squint'], hurt)
    sz, srot, lean, twist, hrz, gear = 0.0, 0.0, 0.0, 0.0, -10.0, 0.0
    near = (6.5, -3.6, 6.5); flask = False; smoke_t, smoke_k, snow = i / n * 0.5, 1.0, False
    hat_z, hat_r = 0.0, -6
    if anim == 'idle':
        srot = 0.6 * math.sin(ph); hrz = -6 + 8 * math.sin(ph); near = (6.5, -3.6, 6.5 + 0.6 * math.sin(2 * ph))
    elif anim == 'move':
        sz = 0.3 * math.sin(2 * ph); srot = 1.0 * math.sin(ph); lean = 5; gear = -ph; smoke_t = i / n; snow = True
        hat_r = -6 - 3 * math.sin(2 * ph); near = (6.0, -3.8, 6.0)
    elif anim == 'attack':
        near = [(2.5, -5.0, 11.0), (-2.5, -5.5, 12.5), (-5.0, -5.2, 11.5), (8.0, -4.0, 9.5)][i]
        lean = [-6, -12, -16, 10][i]; twist = [8, 14, 18, -6][i]; flask = i < 3; hrz = -14
    elif anim == 'hurt':
        srot = -5; lean = -14; hat_z = 3.0; hat_r = -26; smoke_k = 1.5; near = (-3.5, -5.5, 11.5); hrz = -18
    else:
        srot = -12; sz = 8.0; near = (5.0, -6.0, 11.0); smoke_t = 0.7; lean = -4
    sl.location = (0, 0, sz); sl.rotation_euler = (0, rad(srot), 0)
    torso.rotation_euler = (0, rad(lean), rad(twist))
    P['headpivot'].rotation_euler = (0, rad(2 * math.sin(ph) if anim == 'idle' else 0), rad(hrz))
    P['hat'].location = (-0.3, 0, 2.7 + hat_z); P['hat'].rotation_euler = (0, rad(hat_r), 0)
    P['gear'].rotation_euler = (0, 0, gear)
    for j, o in enumerate(P['smoke']):
        t = (smoke_t + j / 4) % 1.0
        o.location = (22 - 14 * t, 1.0 + 2 * t, 49.5 + 12 * t - 3 * t * t)
        r_ = (2.4 + 3.2 * t) * smoke_k; o.scale = (r_, r_ * 0.9, r_ * 0.85)
    for j, o in enumerate(P['snow']):
        t = (i / n + j / 4) % 1.0
        o.location = (-38 - 6 * t, -6.5 + 13 * (j % 2), 2.0 + 4 * t - 3 * t * t); o.scale = ((1.6 - t) * 1.2,) * 3
    set_vis(P['snow'], snow)
    # arms: far hand on the tiller, near hand points or throws
    kn = world_in(P['knob'], torso)
    hands = [np.array(near), kn + np.array([-0.4, 0.2, 0.3])]
    for k, (sh, hd) in enumerate(zip(P['sh'], hands)):
        side = -1 if k == 0 else 1
        arm(f'sl_arm{k}', C['coat'], torso, sh, hd, 8.6, (-0.5, side, -0.6), [1.3, 1.25, 1.2, 1.2, 1.2, 1.2, 1.25, 1.3, 1.3, 1.3])
        P['hands'][k].location = tuple(hd)
    set_vis([P['finger']], not flask and anim != 'hurt' and anim != 'jump')
    P['flask'].location = tuple(np.array(near) + np.array([0, -0.4, 0.8])); P['flask'].rotation_euler = (0, rad(-30), 0)
    set_vis([P['flask']], flask)


def make_boss_sleigh():
    return run_sheet('boss_sleigh', make_sleigh(), pose_sleigh)


# ---------------------------------------------------------------------------------------------------------------
# previews + main
def bbox(f):
    ys, xs = np.nonzero(f[..., 3] > 0)
    if len(xs) == 0: return (0, 0, 0, 0)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def preview(sh):
    """<name>.png: every frame (rows = anims) on dark | bright at 2x; <name>_zoom.png: key frames at 4x; _1x."""
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    allf = [f for fr in sh.anims.values() for f in fr]
    occ = np.any(np.stack([f[..., 3] > 0 for f in allf]), 0)
    ys, xs = np.nonzero(occ)
    y0, y1 = max(0, ys.min() - 2), min(sh.h, ys.max() + 3); x0, x1 = max(0, xs.min() - 2), min(sh.w, xs.max() + 3)
    cols = max(len(v) for v in sh.anims.values())
    rows = []
    for fr in sh.anims.values():
        tiles = [f[y0:y1, x0:x1] for f in fr] + [np.zeros((y1 - y0, x1 - x0, 4), np.uint8)] * (cols - len(fr))
        rows.append(np.concatenate(tiles, 1))
    grid = np.concatenate(rows, 0)
    def on(g, bg): return np.where(g[..., 3:4] > 0, g[..., :3], np.array(bg, np.uint8))
    sep = np.full((grid.shape[0], 3, 3), 255, np.uint8)
    img = np.concatenate([on(grid, (34, 28, 48)), sep, on(grid, (150, 196, 226))], 1)
    write_png(os.path.join(PREVIEW_DIR, sh.name + '.png'), np.repeat(np.repeat(img, 2, 0), 2, 1))
    write_png(os.path.join(PREVIEW_DIR, sh.name + '_1x.png'), img)
    A = sh.anims
    sel = [A['idle'][0], A['move'][1], A['move'][4], A['attack'][1], A['attack'][3], A['hurt'][0], A['jump'][0]]
    strip = np.concatenate([f[y0:y1, x0:x1] for f in sel], 1)
    z = np.concatenate([on(strip, (34, 28, 48)), on(strip, (236, 224, 196))], 0)
    write_png(os.path.join(PREVIEW_DIR, sh.name + '_zoom.png'), np.repeat(np.repeat(z, 4, 0), 4, 1))
    # visible size stats
    sizes = {a: [(b[2] - b[0], b[3] - b[1]) for b in map(bbox, fr)] for a, fr in A.items()}
    idle = sizes['idle'][0]
    allw = [s[0] for v in sizes.values() for s in v]; allh = [s[1] for v in sizes.values() for s in v]
    return dict(idle_w=int(idle[0]), idle_h=int(idle[1]), max_w=int(max(allw)), max_h=int(max(allh)),
                min_w=int(min(allw)), min_h=int(min(allh)))


BOSSES = ('gourd', 'kaboom', 'goldgrip', 'egg', 'cupid', 'gobble', 'sleigh')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = [a for a in argv if not a.startswith('-')] or list(BOSSES)
    t0 = time.time(); report = {}
    for n in names:
        t = time.time()
        sh = globals()['make_boss_' + n]()
        sh.save()
        st = preview(sh)
        st['seconds'] = round(time.time() - t, 1)
        report[sh.name] = st
        print(f'[{sh.name}] {st}')
    print(f'done in {time.time() - t0:.1f}s')
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    with open(os.path.join(PREVIEW_DIR, 'report_' + '_'.join(names) + '.json'), 'w') as fh: json.dump(report, fh, indent=1)


main()
