"""build_objects.py: pre-rendered 3D sprites for Toil & Trouble's objects and pickups (cauldrons, cards, brooms).

Run headless (all sheets, or name some):
    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
        --python tools/blender/build_objects.py -- [pots cannon check goal rack cart cards deck broom] [--prev DIR]

Writes art/<sheet>.png + .json through spritelib.Sheet. Everything is modelled in game pixels (1 px = spritelib.PX m)
and converted by the helpers below. Objects that stand on the ground are tilted toward the camera (so you can see
into the pots) and then re-grounded so their lowest point sits on the origin line.
"""
import bpy, bmesh, sys, os, math, time
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spritelib as L

PX = L.PX
TAU = math.pi * 2
PREV = None   # preview directory (set with --prev)


# ---- small utilities -----------------------------------------------------------------------------------------
def hx(h):
    if not isinstance(h, str): return tuple(h[:3])
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(c):
    c = hx(c) if isinstance(c, str) else c
    return tuple(v ** 2.2 for v in c[:3])


def setup(samples=64):
    sc = L.setup_scene(samples)
    # a soft studio gradient instead of the flat world, so polished metal has something to reflect
    nt = sc.world.node_tree; N = nt.nodes
    bg = N['Background']
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    rp = ramp(nt, [(0.0, (0.05, 0.04, 0.05)), (0.47, (0.16, 0.13, 0.2)), (0.56, (0.34, 0.31, 0.44)), (1.0, (0.62, 0.62, 0.78))])
    nt.links.new(mr.outputs['Result'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.75
    return sc


def ramp(nt, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    while len(el) > len(stops): el.remove(el[-1])
    while len(el) < len(stops): el.new(0.5)
    for e, (p, c) in zip(el, stops):
        e.position = p; e.color = (*c, 1)
    return r


def mnode(nt, op, a, b=None, c=None):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def bsdf(m): return m.node_tree.nodes['Principled BSDF']


def mat(name, color, **kw):
    return L.mat(name, color, **kw)


def potion_mat(name, color, strength=2.0, rough=0.12):
    return L.mat(name, color, rough=rough, spec=0.7, coat=0.6, emit=(*hx(color), strength))


def tex_mat(name, c1, c2, scale=(20, 20, 20), rough=0.6, metal=0.0, coat=0.0, lo=0.35, hi=0.65, noise=4.0, emit=None):
    """Principled with a stretched noise mixing two colours (wood grain, straw, bark)."""
    m = L.mat(name, c1, rough=rough, metal=metal, coat=coat, emit=emit)
    nt = m.node_tree; N = nt.nodes
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = noise; nz.inputs['Detail'].default_value = 3
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    rp = ramp(nt, [(lo, lin(c1)), (hi, lin(c2))])
    nt.links.new(nz.outputs['Fac'], rp.inputs['Fac']); nt.links.new(rp.outputs['Color'], bsdf(m).inputs['Base Color'])
    return m


def np_image(name, arr, noncolor=False):
    """arr: H x W x 4 float 0..1, row 0 = top."""
    H, W = arr.shape[:2]
    img = bpy.data.images.new(name, W, H, alpha=True)
    if noncolor: img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1], dtype=np.float32).ravel())
    img.update()
    try: img.pack()
    except Exception: pass
    return img


class Canvas:
    """A tiny vector painter (in game pixels, y up, centred) that produces decal / card textures."""

    def __init__(s, w, h, res=32, ss=2, base=(1, 1, 1)):
        s.w, s.h, s.res, s.ss = w, h, res, ss
        s.W, s.H = int(round(w * res)), int(round(h * res))
        n = ss
        xs = (np.arange(s.W * n) + 0.5) / (s.W * n) * w - w / 2
        ys = h / 2 - (np.arange(s.H * n) + 0.5) / (s.H * n) * h
        s.X, s.Y = np.meshgrid(xs, ys)
        s.rgb = np.ones(s.X.shape + (3,)) * np.array(hx(base) if isinstance(base, str) else base)
        s.a = np.zeros(s.X.shape); s.k = np.zeros(s.X.shape)

    def circ(s, cx, cy, r): return (s.X - cx) ** 2 + (s.Y - cy) ** 2 <= r * r

    def ell(s, cx, cy, rx, ry, rot=0.0):
        c, sn = math.cos(rot), math.sin(rot); dx, dy = s.X - cx, s.Y - cy
        u, v = dx * c + dy * sn, -dx * sn + dy * c
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1

    def poly(s, pts):
        inside = np.zeros(s.X.shape, bool)
        for i in range(len(pts)):
            x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
            cond = ((y1 > s.Y) != (y2 > s.Y)) & (s.X < (x2 - x1) * (s.Y - y1) / (y2 - y1 + 1e-12) + x1)
            inside ^= cond
        return inside

    def seg(s, x1, y1, x2, y2, r):
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((s.X - x1) * dx + (s.Y - y1) * dy) / (dx * dx + dy * dy + 1e-12), 0, 1)
        return (s.X - x1 - t * dx) ** 2 + (s.Y - y1 - t * dy) ** 2 <= r * r

    def rrect(s, x0, y0, x1, y1, rc):
        cx = np.clip(s.X, x0 + rc, x1 - rc); cy = np.clip(s.Y, y0 + rc, y1 - rc)
        return (s.X - cx) ** 2 + (s.Y - cy) ** 2 <= rc * rc

    def star(s, cx, cy, ro, ri, n=5, rot=90):
        pts = []
        for i in range(n * 2):
            a = math.radians(rot) + math.pi * i / n; r = ro if i % 2 == 0 else ri
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        return s.poly(pts)

    def fill(s, m, col, a=1.0, k=0.0):
        s.rgb[m] = hx(col) if isinstance(col, str) else col; s.a[m] = a; s.k[m] = k

    def out(s):
        n = s.ss
        def ds(x): return x.reshape(s.H, n, s.W, n, *x.shape[2:]).mean(axis=(1, 3))
        rgba = np.concatenate([ds(s.rgb), ds(s.a)[..., None]], axis=2)
        k = ds(s.k)
        return rgba, np.dstack([k, k, k, np.ones_like(k)])


def add_decal(m, can, cx, cz, rough=0.4, metal=0.0, emit=0.0, coat=0.0, spec=0.5, name='decal'):
    """Project a Canvas onto the object's front (-Y) along Y, centred at (cx, cz) px in object space."""
    rgba, _ = can.out()
    img = np_image(name, rgba)
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    out = N['Material Output']
    src = out.inputs['Surface'].links[0].from_socket
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Object'], sep.inputs[0])
    w, h = can.w * PX, can.h * PX
    u = mnode(nt, 'MULTIPLY_ADD', sep.outputs['X'], 1 / w, -(cx * PX - w / 2) / w)
    v = mnode(nt, 'MULTIPLY_ADD', sep.outputs['Z'], 1 / h, -(cz * PX - h / 2) / h)
    comb = N.new('ShaderNodeCombineXYZ'); Lk.new(u, comb.inputs['X']); Lk.new(v, comb.inputs['Y'])
    ti = N.new('ShaderNodeTexImage'); ti.image = img; ti.extension = 'CLIP'; ti.interpolation = 'Linear'
    Lk.new(comb.outputs[0], ti.inputs['Vector'])
    front = mnode(nt, 'LESS_THAN', sep.outputs['Y'], 0.0)
    fac = mnode(nt, 'MULTIPLY', ti.outputs['Alpha'], front)
    b2 = N.new('ShaderNodeBsdfPrincipled')
    Lk.new(ti.outputs['Color'], b2.inputs['Base Color'])
    b2.inputs['Roughness'].default_value = rough; b2.inputs['Metallic'].default_value = metal
    b2.inputs['Specular IOR Level'].default_value = spec
    if coat: b2.inputs['Coat Weight'].default_value = coat
    if emit:
        Lk.new(ti.outputs['Color'], b2.inputs['Emission Color']); b2.inputs['Emission Strength'].default_value = emit
    mix = N.new('ShaderNodeMixShader')
    Lk.new(fac, mix.inputs[0]); Lk.new(src, mix.inputs[1]); Lk.new(b2.outputs[0], mix.inputs[2])
    Lk.new(mix.outputs[0], out.inputs['Surface'])
    return m


# ---- geometry helpers (all in game pixels) -------------------------------------------------------------------
def link(o, parent):
    bpy.context.scene.collection.objects.link(o)
    if parent: o.parent = parent
    return o


def mesh_obj(name, verts, faces, mats, parent=None, smooth=True, mat_idx=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(c * PX for c in v) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    if mat_idx is not None:
        for p, i in zip(me.polygons, mat_idx): p.material_index = i
    for p in me.polygons: p.use_smooth = smooth
    return link(o, parent)


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None); o.location = tuple(c * PX for c in loc)
    return link(o, parent)


def lathe(name, prof, mats, seg=48, inner_from=None, parent=None, loc=(0, 0, 0)):
    """Revolve a (r, z) profile (px) about Z."""
    verts, faces, idx = [], [], []
    n = len(prof)
    for j in range(seg):
        a = TAU * j / seg
        for r, z in prof: verts.append((r * math.cos(a) + loc[0], r * math.sin(a) + loc[1], z + loc[2]))
    for j in range(seg):
        j2 = (j + 1) % seg
        for i in range(n - 1):
            faces.append((j * n + i, j2 * n + i, j2 * n + i + 1, j * n + i + 1))
            idx.append(1 if inner_from is not None and i >= inner_from else 0)
    return mesh_obj(name, verts, faces, mats, parent, mat_idx=idx)


def cauldron_profile(R, zc, rz, neck_r, neck_z, lip, wall, nb=16):
    """Outer belly (ellipse) -> short neck -> rolled lip -> inner wall -> inner floor. Returns (profile, inner index)."""
    pts = []
    th_top = math.acos(neck_r / R)
    for k in range(nb + 1):
        th = -math.pi / 2 + (th_top + math.pi / 2) * k / nb
        pts.append((max(R * math.cos(th), 0.01), zc + rz * math.sin(th)))
    pts.append((neck_r, neck_z))
    cx, cz = neck_r + 0.5 * lip, neck_z + 0.866 * lip
    for k in range(1, 15):
        a = math.radians(-120 + 300 * k / 14)
        pts.append((cx + lip * math.cos(a), cz + lip * math.sin(a)))
    inner = len(pts) - 1
    Ri, rzi = R - wall, rz - wall
    ri = neck_r - wall * 0.7
    th_i = math.acos(min(ri / Ri, 0.999))
    pts.append((ri, neck_z - 0.2))
    for k in range(nb + 1):
        th = th_i - (th_i + math.pi / 2) * k / nb
        pts.append((max(Ri * math.cos(th), 0.01), zc + rzi * math.sin(th)))
    return pts, inner


def tube(name, pts, radii, mats, seg=12, parent=None, cap=True, smooth=True):
    """Sweep a circle (or ellipse: radius (a, b)) along a polyline of px points."""
    P = [Vector(p) for p in pts]; n = len(P)
    if not isinstance(radii, list):     # a number, or an (a, b) ellipse tuple: same for every point
        radii = [radii] * n
    verts, faces = [], []
    prev = None
    for i, p in enumerate(P):
        t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        if prev is None:
            ref = Vector((0, -1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
            nrm = t.cross(ref).normalized()
        else:
            nrm = (prev - t * prev.dot(t)).normalized()
        prev = nrm
        bi = t.cross(nrm)
        r = radii[i]; ra, rb = (r, r) if isinstance(r, (int, float)) else r
        for j in range(seg):
            a = TAU * j / seg
            verts.append(tuple(p + nrm * math.cos(a) * ra + bi * math.sin(a) * rb))
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    if cap:
        for end, base in ((0, 0), (n - 1, (n - 1) * seg)):
            verts.append(tuple(P[end])); c = len(verts) - 1
            for j in range(seg):
                faces.append((base + j, base + (j + 1) % seg, c))
    return mesh_obj(name, verts, faces, mats, parent, smooth=smooth)


def sph(name, m, loc, r, parent=None, scale=(1, 1, 1), seg=20, rings=12):
    o = L.obj_from('uv_sphere', name, m, loc=tuple(c * PX for c in loc), scale=tuple(r * PX * s for s in scale),
                   segments=seg, ring_count=rings, radius=1)
    if parent: o.parent = parent
    return o


def torus(name, m, loc, R, r, rot=(0, 0, 0), parent=None, scale=(1, 1, 1)):
    o = L.obj_from('torus', name, m, loc=tuple(c * PX for c in loc), rot=rot, scale=scale,
                   major_radius=R * PX, minor_radius=r * PX, major_segments=40, minor_segments=12)
    if parent: o.parent = parent
    return o


def cyl(name, mats, loc, r, depth, rot=(0, 0, 0), parent=None, verts=24, cap_mat=None):
    o = L.obj_from('cylinder', name, mats, loc=tuple(c * PX for c in loc), rot=rot,
                   scale=(r * PX, r * PX, depth * PX), vertices=verts, radius=1, depth=1, smooth=False)
    if cap_mat is not None:
        o.data.materials.append(cap_mat)
        for p in o.data.polygons:
            p.use_smooth = abs(p.normal.z) < 0.5
            if abs(p.normal.z) > 0.5: p.material_index = 1
    else:
        for p in o.data.polygons: p.use_smooth = abs(p.normal.z) < 0.5
    if parent: o.parent = parent
    return o


def plight(name, loc, energy, color, radius=1.0, parent=None):
    ld = bpy.data.lights.new(name, 'POINT'); ld.energy = energy; ld.color = hx(color); ld.shadow_soft_size = radius * PX
    o = bpy.data.objects.new(name, ld); o.location = tuple(c * PX for c in loc)
    return link(o, parent)


def remove(objs):
    for o in objs:
        if o and o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)


def ground(root, target=0.0):
    """Shift root so the lowest evaluated vertex of its mesh descendants sits at z = target (px)."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mz = 1e9
    for o in root.children_recursive:
        if o.type != 'MESH': continue
        eo = o.evaluated_get(dg); me = eo.to_mesh(); mw = eo.matrix_world
        for v in me.vertices: mz = min(mz, (mw @ v.co).z)
        eo.to_mesh_clear()
    root.location.z += target * PX - mz
    bpy.context.view_layer.update()


def preview(sheet, name):
    """4x nearest previews over a dark and a bright background, side by side (or stacked for wide sheets)."""
    if not PREV: return
    big = sheet._big
    on = big[..., 3:4] > 0
    pan = []
    for bg in ((30, 24, 44), (188, 212, 236), (96, 128, 72)):
        pan.append(np.where(on, big[..., :3], np.array(bg, np.uint8)))
    gap = np.full((big.shape[0], 2, 3), 255, np.uint8)
    wide = big.shape[1] > 300
    if wide:
        gap = np.full((2, big.shape[1], 3), 255, np.uint8)
        comp = np.concatenate([pan[0], gap, pan[1], gap, pan[2]], axis=0)
    else:
        comp = np.concatenate([pan[0], gap, pan[1], gap, pan[2]], axis=1)
    sc = 4 if comp.shape[1] * 4 <= 2400 else 3
    save_rgb(comp, sc, name)
    # close-up: dark + bright at 8x, cropped to fit
    z = np.concatenate([pan[0], gap if not wide else np.full((big.shape[0], 2, 3), 255, np.uint8), pan[1]], axis=1)
    zs = 8 if z.shape[1] * 8 <= 1800 else 6
    z = z[:min(z.shape[0], 1400 // zs), :1800 // zs]
    save_rgb(z, zs, name + '_z')


def save_rgb(comp, sc, name):
    up = np.repeat(np.repeat(comp, sc, 0), sc, 1)
    h, w = up.shape[:2]
    img = bpy.data.images.new('prev_' + name, w, h, alpha=False)
    rgba = np.concatenate([up, np.full((h, w, 1), 255, np.uint8)], axis=2)
    img.pixels.foreach_set((rgba[::-1].astype(np.float32) / 255).ravel())
    img.filepath_raw = os.path.join(PREV, name + '.png'); img.file_format = 'PNG'; img.save()


# ---- shared cauldron pieces ----------------------------------------------------------------------------------
def iron_mat(name='iron', c='#2a2a34', rough=0.28):
    return mat(name, c, rough=rough, metal=0.85, coat=0.25)


def gold_mat(c='#e8b840', name='gold'):
    """Polished gold with a whisper of self-light so it stays gold against the dark studio floor reflection."""
    return mat(name, c, rough=0.24, metal=1.0, emit=(*hx(c), 0.35))


def inner_mat(name='inner', c='#16121c'):
    return mat(name, c, rough=0.75)


def bubbles(parent, z, m, frame, sites, ring_m=None):
    """Bubble spheres on a potion surface. sites: [(x, y, phase, size)], 4-step cycle: small, mid, big, pop ring."""
    objs = []
    for k, (x, y, ph, s) in enumerate(sites):
        st = (frame + ph) % 4
        if st < 3:
            r = s * (0.45, 0.75, 1.0)[st]
            objs.append(sph('bub%d' % k, m, (x, y, z + r * 0.75), r, parent, seg=14, rings=8))
        else:
            objs.append(torus('pop%d' % k, ring_m or m, (x, y, z + 0.05), s * 0.9, 0.18 * s + 0.1, parent=parent,
                              scale=(1, 1, 0.6)))
    return objs


def small_pot(root, body_m, inner_m, handles=True, feet=True):
    prof, inner = cauldron_profile(R=6.6, zc=6.2, rz=5.0, neck_r=4.9, neck_z=10.2, lip=0.8, wall=0.5)
    lathe('body', prof, [body_m, inner_m], inner_from=inner, parent=root)
    if feet:
        for k, a in enumerate((-150, -30, 90)):
            a = math.radians(a)
            sph('foot%d' % k, body_m, (3.5 * math.cos(a), 3.5 * math.sin(a), 1.15), 1.15, root, scale=(1, 1, 1.25))
    if handles:
        for s in (-1, 1):
            torus('handle%d' % s, body_m, (s * 6.05, 0, 9.1), 1.15, 0.36, rot=(math.pi / 2, 0, 0), parent=root)
    return 10.5   # potion level


# ---- 1. pots ------------------------------------------------------------------------------------------------
TILT_POT = 24


def FUSE(z):
    return [(3.3, 0.9, z - 0.4), (4.5, 0.5, z + 1.3), (5.5, 0.1, z + 2.8), (5.8, -0.3, z + 4.3)]


def heart_canvas():
    c = Canvas(8, 8, base='#ff4a88')
    m = c.circ(-1.4, 0.9, 1.65) | c.circ(1.4, 0.9, 1.65) | c.poly([(-3.0, 0.45), (3.0, 0.45), (0, -3.1)])
    c.fill(m, '#ff4a88')
    c.fill(c.circ(-1.6, 1.3, 0.6), '#ffc8dc')
    return c


def skull_canvas():
    c = Canvas(8, 8, base='#f6eedc')
    bone = '#f6eedc'; dark = '#12061a'
    c.fill(c.ell(0, 0.9, 3.0, 2.6) | c.rrect(-1.8, -2.6, 1.8, 0.4, 0.6), bone)
    c.fill(c.ell(-1.25, 0.6, 0.95, 1.05) | c.ell(1.25, 0.6, 0.95, 1.05), dark)
    c.fill(c.poly([(0, -0.35), (-0.5, -1.1), (0.5, -1.1)]), dark)
    for x in (-0.65, 0.65): c.fill(c.seg(x, -2.6, x, -1.75, 0.2), dark)
    return c


def build_pots():
    sheet = L.Sheet('pots', 28, 28, 14, 25)
    for anim in ('clay', 'iron', 'brew', 'partner_mags', 'partner_pip'):
        setup()
        root = empty('root')
        lights, dyn = [], []
        if anim == 'iron':
            body = mat('steel', '#5a6070', rough=0.3, metal=0.85, coat=0.4)
            small_pot(root, body, inner_mat())
            band = mat('band', '#4a505e', rough=0.32, metal=0.9)
            torus('band', band, (0, 0, 7.0), 6.52, 0.42, parent=root)
            rivet = mat('rivet', '#9aa2b4', rough=0.2, metal=1.0)
            for k in range(12):
                a = TAU * (k + 0.5) / 12
                sph('rivet%d' % k, rivet, (6.9 * math.cos(a), 6.9 * math.sin(a), 7.0), 0.48, root, seg=10, rings=6)
            lid = empty('lidp', (0, 0, 11.3), root)
            lprof = [(0.01, 2.2), (1.8, 2.05), (3.4, 1.6), (4.8, 0.95), (5.8, 0.45), (6.35, 0.25), (6.4, -0.05),
                     (6.1, -0.25), (4.6, -0.2), (0.01, -0.1)]
            lathe('lid', lprof, [body], parent=lid)
            cyl('kneck', body, (0, 0, 2.6), 0.6, 1.0, parent=lid)
            sph('knob', rivet, (0, 0, 3.5), 1.3, lid, scale=(1, 1, 0.85))
        else:
            copper = mat('copper', '#b0683a', rough=0.28, metal=0.7, coat=0.4)
            body = copper
            if anim == 'brew':
                body = mat('purple', '#4a2a5a', rough=0.25, metal=0.45, coat=0.7)
                add_decal(body, skull_canvas(), 0, 5.6, rough=0.45, spec=0.4, coat=0.3, emit=0.35)
            elif anim.startswith('partner'):
                body = mat('copperh', '#b0683a', rough=0.28, metal=0.7, coat=0.4)
                add_decal(body, heart_canvas(), 0, 5.8, rough=0.3, coat=0.6, emit=0.25)
            z = small_pot(root, body, inner_mat())
            col = {'clay': '#7ad04a', 'brew': '#f0502a'}.get(anim, '#f08ab0')
            pm = potion_mat('potion', col, 1.5 if anim != 'brew' else 2.2)
            bm = potion_mat('bubble', tuple(0.7 * c + 0.3 for c in hx(col)), 3.2, rough=0.05)
            lathe('surf', [(0.01, z + 0.25), (2.4, z + 0.18), (4.55, z), (4.55, z - 1.0)], [pm], parent=root, seg=40)
            lights.append(plight('glow', (0, -1.0, z + 2.5), 1.2 if anim != 'brew' else 2.0, col, 2.0, root))
            if anim == 'brew':
                twine = mat('twine', '#5a4632', rough=0.8)
                tube('fuse', FUSE(z), 0.45, twine, parent=root, seg=8)
            if anim.startswith('partner'):
                who = anim.split('_')[1]
                hat = mat('hat', '#40306a' if who == 'mags' else '#2e3c74', rough=0.55, sss=0.0)
                bandm = mat('hband', '#f08a30' if who == 'mags' else '#f06aa8', rough=0.4, coat=0.3)
                spine = [(0.2, 0.5, z - 0.6), (0.15, 0.5, z + 2.0), (0.0, 0.55, z + 4.2), (-0.5, 0.55, z + 6.2),
                         (-1.5, 0.55, z + 7.7), (-2.9, 0.55, z + 8.4)]
                tube('hat', spine, [2.9, 2.3, 1.55, 0.95, 0.5, 0.12], hat, parent=root, seg=16)
                tube('hband', [(0.2, 0.5, z + 0.2), (0.18, 0.5, z + 1.7)], [2.85, 2.5], bandm, parent=root, seg=16)
                torus('brim', hat, (0.2, 0.5, z + 0.1), 3.7, 0.6, parent=root, scale=(1, 1, 0.45))
        root.rotation_euler.x = math.radians(TILT_POT)
        ground(root)
        for f in range(4):
            remove(dyn); dyn = []
            if anim == 'iron':
                lid = bpy.data.objects['lidp']
                lift = (0.0, 0.8, 0.2, 0.55)[f]
                lid.location.z = (11.3 + lift) * PX
                lid.rotation_euler = (math.radians((0, 2.5, -1.0, 1.5)[f]), math.radians((0, -3.0, 1.5, 2.0)[f]), 0)
            else:
                sites = [(-1.8, -0.9, 0, 1.4), (1.2, 2.4, 2, 1.7), (1.4, -2.2, 1, 0.9)]
                if anim.startswith('partner'): sites = [(-2.9, -1.0, 0, 1.2), (2.6, 1.8, 2, 1.4), (1.9, -2.6, 1, 0.75)]
                dyn += bubbles(root, z, bm, f, sites, pm)
                if anim == 'brew':
                    spark = mat('spark', '#fffbe0', emit=(*hx('#fff0c0'), 5.0))
                    flame = mat('flame', '#ff5a10', emit=(*hx('#ff5010'), 1.6))
                    tip = Vector(FUSE(z)[-1])
                    s = (1.0, 1.25, 0.85, 1.15)[f]
                    dyn.append(sph('spark', spark, tip + Vector((0, -0.9, 0.3)), 0.5 * s, root, seg=10, rings=6))
                    dyn.append(sph('flame', flame, tip + Vector((0, 0, 0.35)), 1.1 * s, root, seg=12, rings=8,
                                   scale=(1, 1, 1.3)))
                    for k in range(3):
                        a = math.radians(40 + 100 * k + f * 37)
                        d = Vector((math.cos(a), -0.2, math.sin(a)))
                        dyn.append(tube('sp%d' % k, [tip + d * 1.0, tip + d * (1.6 + 0.3 * ((k + f) % 2))], 0.16,
                                        spark, parent=root, seg=6))
                    dyn.append(plight('sparkl', tuple(tip + Vector((0, -1.0, 0.5))), 0.8 * s, '#ffa040', 0.6, root))
            sheet.add(anim)
    sheet.save(); preview(sheet, 'pots')


# ---- 2. cannon ----------------------------------------------------------------------------------------------
def star_rune_canvas():
    c = Canvas(6, 6, base='#ffd860')
    ring = c.circ(0, 0, 2.85) & ~c.circ(0, 0, 2.3)
    c.fill(ring | c.star(0, 0, 2.15, 0.9), '#ffd860')
    return c


def build_cannon():
    sheet = L.Sheet('cannon', 36, 36, 18, 18)
    for kind in ('cannon', 'bonus'):
        setup()
        root = empty('root')
        piv = empty('piv', parent=root)
        if kind == 'bonus':
            body = mat('violet', '#5a2a8a', rough=0.22, metal=0.4, coat=0.8)
            add_decal(body, star_rune_canvas(), 0, 8.6, rough=0.3, emit=1.6, metal=0.3, name='rune')
            band = gold_mat('#f0c048')
        else:
            body = iron_mat('iron', '#34303e', 0.26)
            band = gold_mat('#d8a840')
        dark = mat('mouth', '#0a070c', rough=0.9)
        body_o = empty('body', (0, 0, -8.2), piv)
        prof, inner = cauldron_profile(R=7.8, zc=8.6, rz=8.6, neck_r=5.9, neck_z=15.4, lip=0.95, wall=0.6)
        lathe('pot', prof, [body, dark], inner_from=inner, parent=body_o)
        sph('plug', dark, (0, 0, 9.0), 5.6, body_o)   # keeps the mouth properly black
        for z in (5.0, 12.2):
            sn = (z - 8.6) / 8.6
            torus('band%d' % z, band, (0, 0, z), 7.8 * math.sqrt(1 - sn * sn) + 0.15, 0.62, parent=body_o)
        for k, a in enumerate((-150, -30, 90)):
            a = math.radians(a)
            sph('foot%d' % k, body, (3.6 * math.cos(a), 3.6 * math.sin(a), 0.3), 1.2, body_o, scale=(1, 1, 1.2))
        for s in (-1, 1):
            torus('handle%d' % s, band if kind == 'bonus' else body, (s * 7.0, 0, 13.8), 1.2, 0.38,
                  rot=(math.pi / 2, 0, 0), parent=body_o)
        if kind == 'bonus':
            plight('runel', (0, -9.5, 8.6 - 8.2), 0.0, '#ffd860', 1.0, body_o)
        t = math.radians(24)
        for i in range(16):
            a = math.radians(i * 22.5)
            d = Vector((math.cos(a) * math.cos(t), -math.sin(t), -math.sin(a) * math.cos(t)))
            y = Vector((0, 1, 0)); y = (y - d * y.dot(d)).normalized(); x = y.cross(d)
            M = Matrix((x, y, d)).transposed().to_4x4()
            piv.matrix_basis = M
            sheet.add(kind)
    sheet.save(); preview(sheet, 'cannon')


# ---- 3. checkpoint -------------------------------------------------------------------------------------------
def rune_canvas(col):
    c = Canvas(7, 7, base=col)
    m = (c.poly([(0, 3.0), (2.4, 0), (0, -3.0), (-2.4, 0)]) & ~c.poly([(0, 1.9), (1.4, 0), (0, -1.9), (-1.4, 0)]))
    c.fill(m | c.circ(0, 0, 0.75), col)
    return c


def logs(root, on):
    bark = tex_mat('bark', '#4a2e1c' if on else '#3a2a20', '#6e4428' if on else '#4a3a2e', scale=(30, 30, 6), rough=0.8)
    endg = tex_mat('endgrain', '#c89a62', '#8a5e36', scale=(1, 1, 1), noise=60, rough=0.7)
    for k, a in enumerate((32, -32)):
        o = cyl('log%d' % k, bark, (0, 0, 1.7 + 0.15 * k), 1.7, 21.0, rot=(0, math.pi / 2, math.radians(a)), parent=root,
                cap_mat=endg)
    if on:
        ember = mat('ember', '#ff6a1a', emit=(*hx('#ff7a20'), 7.0))
        hot = mat('hot', '#ffd060', emit=(*hx('#ffd060'), 10.0))
        rng = np.random.default_rng(3)
        for k in range(14):
            sgn = 1 if k % 2 else -1
            t = rng.uniform(-5.5, 5.5)
            a = math.radians(32 * sgn)
            x, y = t * math.cos(a), t * math.sin(a)
            ang = rng.uniform(0, TAU)
            o = sph('em%d' % k, hot if k % 4 == 0 else ember,
                    (x + 1.45 * math.cos(ang) * 0.3, y - 1.2, 1.7 + 1.0 * abs(math.sin(ang)) + 0.3),
                    rng.uniform(0.45, 0.8), root, seg=10, rings=6, scale=(1.4, 0.7, 0.8))
        plight('fire', (0, -3.0, 3.0), 6.0, '#ff7a28', 3.0, root)


def build_check():
    sheet = L.Sheet('check', 32, 32, 16, 30)
    for anim in ('off', 'on'):
        setup()
        root = empty('root')
        on = anim == 'on'
        logs(root, on)
        body = iron_mat('iron', '#36343f', 0.3)
        add_decal(body, rune_canvas('#b8ff8a' if on else '#5a5868'), 0, 7.6 + 2.9, rough=0.35, metal=0.5 if not on else 0,
                  emit=0.9 if on else 0.0, name='rune')
        pot = empty('pot', (0, 0, 2.9), root)
        prof, inner = cauldron_profile(R=8.5, zc=7.0, rz=6.2, neck_r=6.4, neck_z=12.0, lip=0.95, wall=0.55)
        lathe('body', prof, [body, inner_mat('inner', '#14121a' if not on else '#1c2a18')], inner_from=inner, parent=pot)
        for k, a in enumerate((-150, -30, 90)):
            a = math.radians(a)
            sph('foot%d' % k, body, (4.6 * math.cos(a), 4.6 * math.sin(a), 0.9), 1.2, pot, scale=(1, 1, 1.2))
        for s in (-1, 1):
            torus('handle%d' % s, body, (s * 7.9, 0, 10.8), 1.25, 0.4, rot=(math.pi / 2, 0, 0), parent=pot)
        if on:
            z = 11.6
            pm = potion_mat('potion', '#8cf05a', 2.6)
            bm = potion_mat('bubble', '#d0ffb0', 3.5, rough=0.05)
            lathe('surf', [(0.01, z + 0.25), (3.5, z + 0.18), (6.1, z), (6.1, z - 1.0)], [pm], parent=pot, seg=40)
            bubbles(pot, z, bm, 1, [(-2.6, -1.5, 0, 1.2), (2.4, 0.8, 2, 1.0), (0.4, -3.0, 1, 0.7), (3.4, -2.2, 3, 0.7)], pm)
            plight('glow', (0, -1.5, z + 3.0), 2.5, '#8cf05a', 2.0, pot)
        root.rotation_euler.x = math.radians(18)
        ground(root)
        sheet.add(anim)
    sheet.save(); preview(sheet, 'check')


# ---- 4. goal -------------------------------------------------------------------------------------------------
def moon_canvas():
    c = Canvas(13, 12, base='#f2c450')
    m = c.circ(-0.6, 0, 4.6) & ~c.circ(1.5, 0.9, 3.9)
    c.fill(m, '#f2c450')
    for (x, y, r) in ((3.6, -2.6, 1.5), (4.6, 2.9, 1.0)):
        c.fill(c.star(x, y, r, r * 0.32, n=4, rot=90), '#f2c450')
    return c


def swirl_mat(name):
    m = L.mat(name, '#e8eeff', rough=0.08, spec=0.8, coat=0.8, emit=(*hx('#e8eeff'), 0.9))
    nt = m.node_tree; N = nt.nodes; Lk = nt.links; b = bsdf(m)
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Object'], sep.inputs[0])
    ang = mnode(nt, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    cmb = N.new('ShaderNodeCombineXYZ'); Lk.new(sep.outputs['X'], cmb.inputs['X']); Lk.new(sep.outputs['Y'], cmb.inputs['Y'])
    vl = N.new('ShaderNodeVectorMath'); vl.operation = 'LENGTH'; Lk.new(cmb.outputs[0], vl.inputs[0])
    ph = mnode(nt, 'MULTIPLY_ADD', vl.outputs['Value'], 14.0, mnode(nt, 'MULTIPLY', ang, 2.0))
    sw = mnode(nt, 'SINE', ph)
    sw = mnode(nt, 'MULTIPLY_ADD', sw, 0.5, 0.5)
    rp = ramp(nt, [(0.25, lin('#5262b8')), (0.5, lin('#a8b8f0')), (0.75, lin('#ffffff'))])
    Lk.new(sw, rp.inputs['Fac'])
    Lk.new(rp.outputs['Color'], b.inputs['Base Color']); Lk.new(rp.outputs['Color'], b.inputs['Emission Color'])
    return m


def build_goal():
    sheet = L.Sheet('goal', 48, 40, 24, 38)
    setup()
    root = empty('root')
    body = iron_mat('iron', '#22202a', 0.22)
    add_decal(body, moon_canvas(), -0.3, 10.8, rough=0.2, metal=1.0, emit=0.6, name='moon')
    gold = gold_mat('#f0c048')
    prof, inner = cauldron_profile(R=16.0, zc=12.0, rz=10.5, neck_r=12.2, neck_z=20.0, lip=1.4, wall=0.8)
    lathe('body', prof, [body, inner_mat('inner', '#1a1c2a')], inner_from=inner, parent=root, seg=64)
    torus('gband', gold, (0, 0, 19.2), 12.35, 0.6, parent=root)
    for k, a in enumerate((-150, -30, 90)):
        a = math.radians(a)
        sph('foot%d' % k, body, (8.5 * math.cos(a), 8.5 * math.sin(a), 2.0), 2.0, root, scale=(1, 1, 1.3))
    for s in (-1, 1):
        torus('handle%d' % s, gold, (s * 14.6, 0, 17.6), 2.1, 0.62, rot=(math.pi / 2, 0, 0), parent=root)
    z = 19.6
    surf = empty('surfp', (0, 0, 0), root)
    lathe('surf', [(0.01, z + 0.35), (6.0, z + 0.25), (11.9, z), (11.9, z - 1.2)], [swirl_mat('swirl')], parent=surf, seg=64)
    glint = mat('glint', '#ffffff', emit=(1, 1, 1, 8.0))
    rng = np.random.default_rng(7)
    for k in range(7):
        r = rng.uniform(2.5, 10.5); a = rng.uniform(0, TAU)
        sph('gl%d' % k, glint, (r * math.cos(a), r * math.sin(a), z + 0.35), 0.38, surf, seg=8, rings=5)
    plight('moonl', (0, -3.0, z + 5.0), 5.0, '#c8d8ff', 4.0, root)
    root.rotation_euler.x = math.radians(20)
    ground(root)
    motes = [(-6.0, -3.0, 0.0), (3.5, -1.0, 0.33), (7.5, -4.0, 0.66), (-1.5, -5.0, 0.5), (-8.5, 0.0, 0.16)]
    for f in range(6):
        surf.rotation_euler.z = -(TAU / 2) * f / 6
        dyn = []
        for k, (mx, my, ph) in enumerate(motes):
            t = (f / 6 + ph) % 1.0
            r = 0.45 * (1 - t) + 0.15
            dyn.append(sph('mote%d' % k, glint, (mx, my, z + 1.0 + t * 8.0), r, root, seg=8, rings=5))
        sheet.add('swirl')
        remove(dyn)
    sheet.save(); preview(sheet, 'goal')


# ---- 5/9. brooms ---------------------------------------------------------------------------------------------
def broom(parent, length=33.0, sway=0.0, phase=0.0):
    """A besom along local +Z: bristle tips at z=0, handle top at z=length. Returns the ribbon-tail objects."""
    straw = tex_mat('straw', '#b8862e', '#f0cc70', scale=(90, 90, 4), rough=0.7, noise=3.0, lo=0.3, hi=0.7)
    straw2 = tex_mat('straw2', '#8a5a18', '#d0a040', scale=(90, 90, 4), rough=0.75, noise=3.0)
    wood = tex_mat('wood', '#5e3a20', '#8a5a32', scale=(40, 40, 3), rough=0.45, coat=0.3, noise=5.0)
    cord = mat('cord', '#7a3a6a', rough=0.6)
    Lb = 12.0
    prof = [(0.01, 1.0), (1.8, 0.8), (2.8, 1.3), (3.1, 3.0), (2.8, 5.5), (2.2, 8.0), (1.4, Lb - 1.2), (1.1, Lb),
            (0.95, Lb + 0.6), (0.01, Lb + 0.7)]
    lathe('bristles', prof, [straw], parent=parent, seg=32)
    rng = np.random.default_rng(11)
    for k in range(52):
        a = TAU * k / 52 + rng.uniform(-0.06, 0.06)
        if math.sin(a) > 0.8: continue     # skip the hidden back side
        top_r, top_z = 1.7, 8.0 + rng.uniform(-0.6, 1.0)
        bot_r = 3.0 + rng.uniform(0.0, 1.3); bot_z = rng.uniform(-1.3, 0.6)
        mid = ((top_r + bot_r) / 2 + 0.35, (top_z + bot_z) / 2)
        pts = [(r * math.cos(a), r * math.sin(a), zz) for r, zz in ((top_r, top_z), mid, (bot_r, bot_z))]
        tube('str%d' % k, pts, 0.22, straw2 if k % 3 else straw, parent=parent, seg=5)
    for zz in (Lb - 2.4, Lb - 0.6):
        torus('bind%d' % zz, cord, (0, 0, zz), 1.45 if zz < Lb - 1 else 1.1, 0.34, parent=parent)
    hp = [(0, 0, Lb - 1), (0.1, 0, Lb + 6), (-0.15, 0, Lb + 12), (0.1, 0, Lb + 17), (0.0, 0, length - 0.5)]
    tube('handle', hp, [0.62, 0.6, 0.56, 0.55, 0.6], wood, parent=parent, seg=12)
    sph('knot', wood, (0.0, 0, length - 0.4), 0.72, parent, seg=12, rings=8)
    # ribbon bow near the top
    rib = mat('ribbon', '#ea4c92', rough=0.32, coat=0.4)
    bz = length - 4.5
    bow = empty('bow', (0, -0.55, bz), parent)
    for s in (-1, 1):
        torus('loop%d' % s, rib, (s * 1.5, 0, 0.2), 1.2, 0.4, rot=(math.pi / 2, 0, 0), parent=bow,
              scale=(1.0, 1.0, 0.68))
    sph('bknot', rib, (0, -0.15, 0), 0.6, bow, seg=12, rings=8)
    tails = []
    for s in (-1, 1):
        w = math.sin(phase * TAU + (0.9 if s > 0 else 0)) * 0.5 + sway * 3
        pts = [(s * 0.3, -0.2, -0.2), (s * 1.0 + w * 0.3, -0.35, -1.0), (s * 1.6 + w * 0.7, -0.4, -1.9),
               (s * 2.0 + w, -0.4, -2.6)]
        tails.append(tube('tail%d' % s, pts, (0.55, 0.16), rib, parent=bow, seg=8))
    return tails


def build_rack():
    sheet = L.Sheet('rack', 28, 40, 14, 38)
    setup()
    root = empty('root')
    wood = tex_mat('swood', '#5a361e', '#7e4e2a', scale=(4, 30, 30), rough=0.5, coat=0.25, noise=6.0)
    endg = tex_mat('sendg', '#a87848', '#7a5030', scale=(1, 1, 1), noise=50, rough=0.6)
    base = L.obj_from('cube', 'base', wood, loc=(0, 0, 1.1 * PX), scale=(8.0 * PX, 3.2 * PX, 1.1 * PX), smooth=False)
    bv = base.modifiers.new('bv', 'BEVEL'); bv.width = 0.5 * PX; bv.segments = 3
    base.parent = root
    for s in (-1, 1):
        cyl('post%d' % s, wood, (s * 5.6, 0.6, 2.2 + 6.4), 0.65, 12.8, parent=root, verts=16, cap_mat=endg)
    cyl('bar', wood, (0, 0.6, 14.4), 0.6, 12.4, rot=(0, math.pi / 2, 0), parent=root, verts=16, cap_mat=endg)
    torus('ring', mat('ringm', '#6a6a78', rough=0.3, metal=0.9), (0, 0, 14.4), 1.2, 0.32, parent=root)
    piv = empty('piv', (0, 0, 2.2), root)
    root.rotation_euler.x = math.radians(10)
    for f in range(6):
        for o in list(piv.children_recursive): remove([o])
        sw = math.sin(f / 6 * TAU)
        piv.rotation_euler.y = math.radians(2.2 * sw)
        broom(piv, 33.0, sway=sw * 0.3, phase=f / 6)
        if f == 0: ground(root)
        sheet.add('sway')
    sheet.save(); preview(sheet, 'rack')


def build_broom():
    sheet = L.Sheet('broom', 32, 12, 16, 6)
    setup()
    root = empty('root')
    piv = empty('piv', (0, 0, 0), root)
    broom(piv, 30.0)
    piv.location = (-15.0 * PX, 0, 0)
    piv.rotation_euler.y = math.pi / 2
    root.rotation_euler.x = math.radians(12)
    sheet.add('spin')
    sheet.save(); preview(sheet, 'broom')


# ---- 6. cart -------------------------------------------------------------------------------------------------
def wheel(name, parent, loc, r, iron, hub):
    w = empty(name, loc, parent)
    torus(name + 'rim', iron, (0, 0, 0), r - 0.45, 0.55, rot=(math.pi / 2, 0, 0), parent=w)
    cyl(name + 'hub', hub, (0, -0.2, 0), 0.9, 1.4, rot=(math.pi / 2, 0, 0), parent=w, verts=16)
    for k in range(6):
        a = TAU * k / 6
        tube(name + 'sp%d' % k, [(0.6 * math.cos(a), 0, 0.6 * math.sin(a)), ((r - 0.7) * math.cos(a), 0, (r - 0.7) * math.sin(a))],
             0.33, iron, parent=w, seg=6)
    return w


def build_cart():
    sheet = L.Sheet('cart', 36, 28, 18, 26)
    setup()
    root = empty('root')
    body = iron_mat('iron', '#44424f', 0.3)
    dark = iron_mat('iron2', '#2c2a34', 0.35)
    steel = mat('steel', '#9a9aaa', rough=0.28, metal=0.9)
    hub = gold_mat('#d8a840', 'brass')
    pot = empty('pot', (0, 0, 3.2), root)
    prof, inner = cauldron_profile(R=11.5, zc=9.0, rz=8.0, neck_r=8.8, neck_z=15.8, lip=1.1, wall=0.6)
    lathe('body', prof, [body, inner_mat('inner', '#121018')], inner_from=inner, parent=pot, seg=56)
    sph('plug', inner_mat('inner2', '#0c0a10'), (0, 0, 5.5), 7.5, pot, scale=(1, 1, 0.6))
    for z in (5.0, 12.6):
        sn = (z - 9.0) / 8.0
        torus('band%d' % z, dark, (0, 0, z), 11.5 * math.sqrt(1 - sn * sn) + 0.1, 0.5, parent=pot)
    rivet = mat('rivet', '#8a90a0', rough=0.2, metal=1.0)
    for k in range(14):
        a = TAU * (k + 0.5) / 14
        sn = (12.6 - 9.0) / 8.0; rr = 11.5 * math.sqrt(1 - sn * sn) + 0.5
        sph('rv%d' % k, rivet, (rr * math.cos(a), rr * math.sin(a), 12.6), 0.42, pot, seg=8, rings=5)
    for s in (-1, 1):
        torus('handle%d' % s, body, (s * 10.6, 0, 14.6), 1.4, 0.42, rot=(math.pi / 2, 0, 0), parent=pot)
    # chassis: two side beams carrying the axles
    for yy in (-6.6, 6.6):
        tube('beam%d' % yy, [(-8.5, yy, 4.1), (8.5, yy, 4.1)], (0.6, 0.6), dark, parent=root, seg=8)
        for s in (-1, 1):
            tube('strut%d%d' % (yy, s), [(s * 3.0, yy * 0.8, 6.0), (s * 6.4, yy, 4.1)], 0.45, dark, parent=root, seg=6)
    wheels = []
    for yy in (-7.6, 7.6):
        for s in (-1, 1):
            wheels.append(wheel('wh%d%d' % (yy, s), root, (s * 6.4, yy, 4.1), 4.1, steel, hub))
    root.rotation_euler.x = math.radians(15)
    ground(root)
    for f in range(4):
        for w in wheels: w.rotation_euler.y = math.radians(15 * f)
        sheet.add('roll')
    sheet.save(); preview(sheet, 'cart')


# ---- 7/8. tarot cards ----------------------------------------------------------------------------------------
CW, CH = 10.0, 14.0


def card_face_canvas(sym):
    c = Canvas(CW, CH, res=24, ss=2, base='#f4e8c8')
    c.fill(c.rrect(-5, -7, 5, 7, 1.0), '#e8b840', k=1.0)
    c.fill(c.rrect(-3.95, -5.95, 3.95, 5.95, 0.5), '#f6ecd0')
    if sym == 0:     # sun
        rays = np.zeros(c.X.shape, bool)
        for i in range(8):
            a = TAU * i / 8
            pts = [(math.cos(a) * 3.85, math.sin(a) * 3.85), (math.cos(a + 0.3) * 2.3, math.sin(a + 0.3) * 2.3),
                   (math.cos(a - 0.3) * 2.3, math.sin(a - 0.3) * 2.3)]
            rays |= c.poly(pts)
        c.fill(rays, '#f07810')
        c.fill(c.circ(0, 0, 2.5), '#c84a08')
        c.fill(c.circ(0, 0, 2.05), '#ffa818')
        c.fill(c.circ(-0.6, 0.6, 0.7), '#ffe070')
    elif sym == 1:   # crescent moon
        c.fill(c.circ(-0.5, 0, 3.6) & ~c.circ(1.2, 0.8, 3.0), '#2c44a8')
    elif sym == 2:   # star
        c.fill(c.star(0, 0.2, 3.9, 1.65), '#a05808')
        c.fill(c.star(0, 0.2, 3.15, 1.3), '#ffc820')
    else:            # eye
        lens = c.circ(0, -2.0, 4.1) & c.circ(0, 2.0, 4.1)
        c.fill(lens, '#3a1a48')
        c.fill(c.circ(0, -2.0, 3.55) & c.circ(0, 2.0, 3.55), '#ffffff')
        c.fill(c.circ(0, 0, 1.5), '#1e64d8')
        c.fill(c.circ(0, 0, 0.7), '#0c0614')
        c.fill(c.circ(-0.5, 0.5, 0.3), '#ffffff')
    return c


def card_back_canvas():
    c = Canvas(CW, CH, res=24, ss=2, base='#4a2480')
    c.fill(c.rrect(-5, -7, 5, 7, 1.0), '#e8b840', k=1.0)
    c.fill(c.rrect(-3.95, -5.95, 3.95, 5.95, 0.5), '#4a2480')
    c.fill(c.circ(-0.5, 0, 3.3) & ~c.circ(1.1, 0.7, 2.75), '#f0c048', k=1.0)
    for (x, y) in ((2.3, 3.9), (-2.4, -4.0)):
        c.fill(c.star(x, y, 0.9, 0.3, n=4), '#f0c048', k=1.0)
    return c


def card_mat(name, can, back=False):
    rgba, k = can.out()
    img = np_image(name + '_c', rgba); kim = np_image(name + '_k', k, noncolor=True)
    m = L.mat(name, '#ffffff', rough=0.4, coat=0.5)
    nt = m.node_tree; N = nt.nodes; Lk = nt.links; b = bsdf(m)
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Object'], sep.inputs[0])
    w, h = CW * PX, CH * PX
    u = mnode(nt, 'MULTIPLY_ADD', sep.outputs['X'], (-1 if back else 1) / w, 0.5)
    v = mnode(nt, 'MULTIPLY_ADD', sep.outputs['Z'], 1 / h, 0.5)
    comb = N.new('ShaderNodeCombineXYZ'); Lk.new(u, comb.inputs['X']); Lk.new(v, comb.inputs['Y'])
    ti = N.new('ShaderNodeTexImage'); ti.image = img; ti.extension = 'EXTEND'
    tk = N.new('ShaderNodeTexImage'); tk.image = kim; tk.extension = 'EXTEND'
    Lk.new(comb.outputs[0], ti.inputs['Vector']); Lk.new(comb.outputs[0], tk.inputs['Vector'])
    Lk.new(ti.outputs['Color'], b.inputs['Base Color'])
    Lk.new(tk.outputs['Color'], b.inputs['Metallic'])
    Lk.new(mnode(nt, 'MULTIPLY_ADD', tk.outputs['Color'], -0.2, 0.42), b.inputs['Roughness'])
    Lk.new(ti.outputs['Color'], b.inputs['Emission Color'])
    Lk.new(mnode(nt, 'MULTIPLY', tk.outputs['Color'], 0.35), b.inputs['Emission Strength'])
    return m


def card_obj(name, mats, parent, th=1.1, rc=1.0):
    """Rounded card in the XZ plane, thickness th (px) along Y. mats = [front, back, edge]."""
    pts = []
    for cx, cz, a0 in ((CW / 2 - rc, CH / 2 - rc, 0), (-CW / 2 + rc, CH / 2 - rc, 90), (-CW / 2 + rc, -CH / 2 + rc, 180),
                       (CW / 2 - rc, -CH / 2 + rc, 270)):
        for k in range(5):
            a = math.radians(a0 + 90 * k / 4)
            pts.append((cx + rc * math.cos(a), cz + rc * math.sin(a)))
    n = len(pts)
    verts = [(x, -th / 2, z) for x, z in pts] + [(x, th / 2, z) for x, z in pts]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    idx = [0, 1]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i)); idx.append(2)
    o = mesh_obj(name, verts, faces, mats, parent, smooth=False, mat_idx=idx)
    return o


def build_cards():
    sheet = L.Sheet('cards', 16, 20, 8, 18)
    for sym in range(4):
        setup()
        root = empty('root', (0, 0, 8.0))
        gold = gold_mat('#e8b840')
        card_obj('card', [card_mat('face', card_face_canvas(sym)), card_mat('back', card_back_canvas(), True), gold], root)
        for f in range(12):
            root.rotation_euler = (0, 0, -TAU * f / 12)
            sheet.add('sym%d' % sym)
    sheet.save(); preview(sheet, 'cards')


def build_deck():
    sheet = L.Sheet('deck', 26, 24, 13, 22)
    setup()
    gold = gold_mat('#e8b840')
    back = card_mat('back', card_back_canvas(), True)
    faces = [card_mat('face%d' % s, card_face_canvas(s)) for s in range(4)]
    root = empty('root', (0, 0, -1.5))
    piv = []
    order = [2, 1, 0, 3, 2]
    for i in range(5):
        p = empty('p%d' % i, ((i - 2) * 0.4, (2 - i) * 0.9, 0), root)
        c = card_obj('card%d' % i, [faces[order[i]], back, gold], p, th=0.6)
        c.location = (0, 0, 10.0 * PX)
        piv.append(p)
    root.rotation_euler.x = math.radians(3)
    for f in range(8):
        ph = f / 8 * TAU
        spread = 13.0 + 1.0 * math.sin(ph + math.pi / 2)
        for i, p in enumerate(piv):
            p.rotation_euler.y = math.radians((i - 2) * spread + 2.5 * math.sin(ph))
            p.location.z = (0.35 * math.sin(ph * 2 + i) if i == 2 else 0) * PX
        sheet.add('fan')
    sheet.save(); preview(sheet, 'deck')


SHEETS = {'pots': build_pots, 'cannon': build_cannon, 'check': build_check, 'goal': build_goal, 'rack': build_rack,
          'cart': build_cart, 'cards': build_cards, 'deck': build_deck, 'broom': build_broom}

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--prev' in argv:
        i = argv.index('--prev'); PREV = argv[i + 1]; os.makedirs(PREV, exist_ok=True); del argv[i:i + 2]
    names = argv or list(SHEETS)
    t0 = time.time()
    for n in names:
        t = time.time(); SHEETS[n](); print('[%s] %.1fs' % (n, time.time() - t))
    print('total %.1fs' % (time.time() - t0))
