"""build_props.py: pre-rendered 3D sprites for Toil & Trouble's cannon-and-ride props.

Run headless (all sheets, or name some):
    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
        --python tools/blender/build_props.py -- [bigcannon ridepot splash mounts obstacles beams bell gate] [--prev DIR]

Sheets (art/<name>.png + .json through spritelib.Sheet):
    bigcannon 56x56 (28,28)  d0..d15 x4   black-iron goo cauldron cannon; d<i> points the mouth i*22.5 deg clockwise
    ridepot   52x44 (26,42)  slide 4, air 2   the overflowing cauldron ridden on cauldron-ride levels
    splash    56x48 (28,44)  pop 8            luminous goo burst (crown + droplets)
    mounts    56x40 (28,38)  post, chains, cart   cannon supports; 'chains' hangs from a ring at the frame's top centre
    obstacles 48x40 (24,38)  hallo july pat easter val thanks xmas   ride blockers, one per world
    beams     64x24 (32,12)  hallo july pat easter val thanks xmas   low overhead ride beams, one per world
    bell      24x32 (12,4)   still 1, ring 4  brass gate bell hanging from its top centre
    gate      32x56 (16,54)  shut 1, open 4   barred rune gate that rises out of the frame

Modelled in game pixels (1 px = spritelib.PX m) with the helpers from build_objects.py, under the same studio
gradient world, plus build_enemies' firmer key/fill and the strong cool back rim so small sprites hold an edge.
"""
import bpy, sys, os, math, time
import numpy as np
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import spritelib as L
import build_objects as O
from build_objects import (hx, lin, mat, potion_mat, tex_mat, Canvas, add_decal, mesh_obj, empty, lathe,
                           cauldron_profile, tube, sph, torus, cyl, plight, remove, ground, iron_mat, gold_mat,
                           inner_mat, ramp, mnode, bsdf)

PX = L.PX
TAU = math.tau
PREV = None
GOO = '#4ed82a'
GOO_HI = '#b8ff88'


def rad(d): return math.radians(d)


def P(v): return tuple(c * PX for c in v)


# ---- scene ---------------------------------------------------------------------------------------------------
def add_sun(name, travel, energy, color, angle=10):
    ld = bpy.data.lights.new(name, 'SUN'); ld.energy = energy; ld.color = color; ld.angle = rad(angle)
    o = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(o)
    o.rotation_euler = Vector(travel).normalized().to_track_quat('-Z', 'Y').to_euler()
    return o


def new_scene(samples=64, rim=10.0, world=0.55):
    """build_objects' studio gradient (for metal reflections) + build_enemies' contrast rig and blue back rim."""
    sc = O.setup(samples)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = world
    ob = bpy.data.objects
    ob['key'].data.energy = 4.0
    ob['fill'].data.energy = 0.45
    ob['rim'].data.energy = 1.4
    add_sun('backrim', (-0.72, -0.5, -0.42), rim, (0.5, 0.78, 1.0), 4)
    add_sun('toprim', (0.3, -0.55, -0.75), rim * 0.22, (0.9, 0.72, 1.0), 6)
    return sc


def goo_mat(name='goo', s=2.4):
    return potion_mat(name, GOO, s, rough=0.1)


def goo_hi_mat(name='goohi', s=3.6):
    return potion_mat(name, GOO_HI, s, rough=0.05)


def black_iron(name='iron', c='#25242d', rough=0.24):
    return iron_mat(name, c, rough)


def box(name, m, size, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, bevel=0.35, seg=2):
    """Box with real (unscaled) vertex coords so Object texture coords and decals are in metres."""
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz),
         (-sx, sy, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh_obj(name, v, f, m, parent, smooth=False)
    o.location = P(loc); o.rotation_euler = rot
    if bevel:
        bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bevel * PX; bv.segments = seg
    return o


def prism(name, m, pts, z0, z1, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Extrude a CCW (x, y) outline from z0 to z1 (px). Caps and walls get separate verts so edges stay crisp."""
    n = len(pts)
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    base = len(verts)
    verts += [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    for i in range(n):
        j = (i + 1) % n
        faces.append((base + i, base + j, base + n + j, base + n + i))
    me_o = mesh_obj(name, verts, faces, m, parent, smooth=False)
    for p in me_o.data.polygons: p.use_smooth = abs(p.normal.z) < 0.5
    me_o.location = P(loc); me_o.rotation_euler = rot
    return me_o


def align(v):
    """Euler that turns local +Z onto v."""
    return Vector(v).normalized().to_track_quat('Z', 'Y').to_euler()


def drop(name, m, base, tip_dir, length, r, parent=None):
    """Teardrop/streak: a sphere stretched along tip_dir."""
    d = Vector(tip_dir).normalized()
    o = sph(name, m, tuple(Vector(base) + d * length * 0.5), 1.0, parent, scale=(r, r, max(r, length * 0.5)), seg=14,
            rings=8)
    o.rotation_euler = align(d)
    return o


def chain(name, p0, p1, m, parent=None, link_len=3.6, link_w=2.3, wire=0.55):
    P0, P1 = Vector(p0), Vector(p1)
    d = P1 - P0; Ln = d.length; d.normalize()
    a = d.cross(Vector((0, 1, 0)))
    if a.length < 1e-3: a = d.cross(Vector((1, 0, 0)))
    a.normalize(); b = d.cross(a).normalized()
    n = max(1, int(round(Ln / (link_len - 1.0))))
    sp = Ln / n
    objs = []
    for i in range(n):
        c = P0 + d * (sp * (i + 0.5))
        side = a if i % 2 == 0 else b
        pts = [c + d * (link_len / 2 - wire) * math.cos(t) + side * (link_w / 2 - wire) * math.sin(t)
               for t in np.linspace(0, TAU, 17)]
        objs.append(tube('%s%d' % (name, i), pts, wire, m, seg=6, parent=parent, cap=False))
    return objs


def pumpkin(name, m, R, Hh, loc=(0, 0, 0), parent=None, ribs=8, rot=(0, 0, 0), groove=0.1, seg=48, rings=22):
    verts, faces = [], []
    for i in range(rings + 1):
        phi = -math.pi / 2 + math.pi * i / rings
        c, s = math.cos(phi), math.sin(phi)
        z = Hh * s * (1 - 0.34 * (1 - c) ** 4)
        for j in range(seg):
            th = TAU * j / seg
            rib = 1 - groove * (1 - abs(math.sin(ribs * th / 2)) ** 0.6)
            r = max(R * c * rib, 0.01)
            verts.append((r * math.cos(th), r * math.sin(th), z))
    for i in range(rings):
        for j in range(seg):
            j2 = (j + 1) % seg
            faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    o = mesh_obj(name, verts, faces, m, parent)
    o.location = P(loc); o.rotation_euler = rot
    return o


def stem(name, parent, top, m, h=3.0, lean=1.2):
    x, y, z = top
    return tube(name, [(x, y, z - 1.0), (x + 0.2, y, z + h * 0.5), (x + lean, y, z + h)], [0.9, 0.7, 0.55], m,
                parent=parent, seg=8)


def frames_preview(sheet, name, cols=None, scale=4, sel=None):
    """All frames (or sel=[(anim, idx)]) in a grid, dark | bright side by side, nearest upscaled."""
    for a, lst in sheet.anims.items():
        occ = np.any(np.stack([f[..., 3] > 0 for f in lst]), axis=0)
        ys, xs = np.nonzero(occ)
        if len(xs):
            print('  bbox %s/%s: w=%d h=%d x=%d..%d y=%d..%d' % (sheet.name, a, xs.max() - xs.min() + 1,
                                                                ys.max() - ys.min() + 1, xs.min(), xs.max(), ys.min(),
                                                                ys.max()))
    if not PREV: return
    fr = []
    for a, lst in sheet.anims.items():
        for i, f in enumerate(lst):
            if sel is None or (a, i) in sel: fr.append(f)
    cols = cols or len(fr)
    rows = (len(fr) + cols - 1) // cols
    w, h = sheet.w, sheet.h
    pans = []
    for bg in ((30, 24, 44), (196, 218, 240)):
        g = np.zeros((rows * (h + 1), cols * (w + 1), 3), np.uint8); g[:] = (90, 90, 90)
        for k, f in enumerate(fr):
            r, c = divmod(k, cols)
            g[r * (h + 1):r * (h + 1) + h, c * (w + 1):c * (w + 1) + w] = np.where(f[..., 3:4] > 0, f[..., :3],
                                                                                   np.array(bg, np.uint8))
        pans.append(g)
    comp = np.concatenate([pans[0], np.full((pans[0].shape[0], 3, 3), 255, np.uint8), pans[1]], axis=1)
    O.save_rgb(comp, scale, name)


# ---- 1. bigcannon --------------------------------------------------------------------------------------------
BC = dict(R=18.0, zc=16.0, rz=16.0, neck_r=14.0, neck_z=34.0, lip=1.9, wall=1.0)
BC_MID = 18.6      # pivot height along the axis (centre of the body incl. feet)


def build_bigcannon():
    sheet = L.Sheet('bigcannon', 56, 56, 28, 28)
    new_scene(64)
    root = empty('root')
    piv = empty('piv', parent=root)
    body_o = empty('body', (0, 0, -BC_MID), piv)
    iron = black_iron('iron', '#26252f', 0.22)
    dark = mat('mouth', '#0a0d08', rough=0.9)
    gold = gold_mat('#e0ae3c')
    prof, inner = cauldron_profile(**BC)
    lathe('pot', prof, [iron, dark], inner_from=inner, parent=body_o, seg=64)
    for z in (9.0, 23.5):
        sn = (z - BC['zc']) / BC['rz']
        torus('band%d' % z, gold, (0, 0, z), BC['R'] * math.sqrt(1 - sn * sn) + 0.2, 0.85, parent=body_o)
    rivet = mat('rivet', '#f4d070', rough=0.2, metal=1.0, emit=(*hx('#f4d070'), 0.3))
    for z in (9.0, 23.5):
        sn = (z - BC['zc']) / BC['rz']; rr = BC['R'] * math.sqrt(1 - sn * sn) + 1.0
        for k in range(12):
            a = TAU * (k + 0.5) / 12
            sph('rv%d_%d' % (z, k), rivet, (rr * math.cos(a), rr * math.sin(a), z), 0.55, body_o, seg=8, rings=5)
    for k, a in enumerate((-150, -30, 90)):
        a = rad(a)
        sph('foot%d' % k, iron, (8.0 * math.cos(a), 8.0 * math.sin(a), 0.2), 2.0, body_o, scale=(1, 1, 1.2))
    for s in (-1, 1):
        torus('handle%d' % s, gold, (s * 15.4, 0, 29.0), 1.9, 0.6, rot=(math.pi / 2, 0, 0), parent=body_o)
    # goo: a bulging meniscus that fills the mouth to the lip
    zg = BC['neck_z'] + 0.4
    gm = goo_mat('goo', 1.25); hm = goo_hi_mat('goohi', 2.0)
    dome = [(0.01, zg + 2.6), (4.0, zg + 2.45), (8.0, zg + 1.9), (11.0, zg + 1.1), (13.0, zg + 0.2), (13.3, zg - 0.6),
            (13.3, zg - 3.0)]
    lathe('goo', dome, [gm], parent=body_o, seg=48)

    def dome_z(r):
        for (r0, z0), (r1, z1) in zip(dome, dome[1:]):
            if r0 <= r <= r1: return z0 + (z1 - z0) * (r - r0) / (r1 - r0 + 1e-9)
        return zg
    plight('googlow', (0, -7.0, zg + 5.0), 5.0, GOO, 3.0, body_o)
    root_fire = empty('fire_root')
    t = rad(20)
    sites = [(-6.0, -4.0, 0, 3.0), (5.0, -6.5, 2, 2.4), (2.0, 4.5, 1, 3.2), (-7.5, 4.0, 3, 2.0), (8.5, 1.0, 1, 2.0),
             (-1.0, -9.5, 3, 1.8)]
    flame_o = mat('flame', '#ff5a10', emit=(*hx('#ff4a08'), 2.6))
    flame_i = mat('flamei', '#ffc030', emit=(*hx('#ffc040'), 3.6))
    for i in range(16):
        a = rad(i * 22.5)
        d = Vector((math.cos(a) * math.cos(t), -math.sin(t), -math.sin(a) * math.cos(t)))
        y = Vector((0, 1, 0)); y = (y - d * y.dot(d)).normalized(); x = y.cross(d)
        piv.matrix_basis = Matrix((x, y, d)).transposed().to_4x4()
        bpy.context.view_layer.update()
        base = body_o.matrix_world @ Vector((0, 0, -2.0 * PX))
        base = base / PX + Vector((0, -9.0, 0)) - d * 0.6
        hroom = max(4.0, 26.5 - base.z)
        for f in range(4):
            dyn = []
            for k, (bx, by, ph, s) in enumerate(sites):
                st = (f + ph) % 4
                z0 = dome_z(math.hypot(bx, by))
                if st < 3:
                    r = s * (0.45, 0.75, 1.0)[st]
                    dyn.append(sph('bub%d' % k, hm if k % 2 else gm, (bx, by, z0 + r * 0.75), r, body_o, seg=14, rings=8))
                    if st == 2:
                        dyn.append(sph('bgl%d' % k, hm, (bx - r * 0.35, by - r * 0.5, z0 + r * 1.2), r * 0.3, body_o,
                                       seg=8, rings=5))
                else:
                    dyn.append(torus('pop%d' % k, hm, (bx, by, z0 + 0.1), s * 0.95, 0.2 * s + 0.12, parent=body_o,
                                     scale=(1, 1, 0.6)))
            # fire licking the base: world-up teardrops that flicker
            hs = ((1.0, 0.75, 1.15), (1.2, 1.0, 0.8), (0.85, 1.25, 1.0), (1.1, 0.9, 1.3))[f]
            for k, (ox, h) in enumerate(zip((-3.0, 0.0, 3.0), hs)):
                b = base + Vector((ox, 0, -0.5))
                jit = (0.4 if (f + k) % 2 else -0.4)
                dyn.append(drop('fl%d' % k, flame_o, b, (jit * 0.3, 0, 1), min(8.0 * h, hroom), 2.1 - 0.15 * abs(ox), root_fire))
                dyn.append(drop('fi%d' % k, flame_i, b + Vector((0, -1.0, 0.1)), (jit * 0.2, 0, 1), min(4.6 * h, hroom * 0.6), 1.2,
                                root_fire))
            ember = (base + Vector(((-1.5, 1.8, 0.5, -0.8)[f], -1.0, min(8.5 + f % 2 * 2.0, hroom))))
            dyn.append(sph('ember', flame_i, tuple(ember), 0.45, root_fire, seg=8, rings=5))
            dyn.append(plight('firel', tuple(base + Vector((0, -2.0, 2.0))), (1.6, 2.0, 1.4, 1.8)[f], '#ff8030', 2.0,
                              root_fire))
            sheet.add('d%d' % i)
            remove(dyn)
    sheet.save()
    frames_preview(sheet, 'bigcannon_dirs', cols=8, scale=4, sel=[('d%d' % i, 0) for i in range(16)])
    frames_preview(sheet, 'bigcannon_anim', cols=4, scale=6, sel=[('d0', f) for f in range(4)] + [('d6', f) for f in range(4)])


# ---- 2. ridepot ----------------------------------------------------------------------------------------------
RP = dict(R=18.5, zc=10.0, rz=10.0, neck_r=15.0, neck_z=18.0, lip=1.6, wall=0.8)


def rp_outer(z):
    R, zc, rz, nr, nz, lip = RP['R'], RP['zc'], RP['rz'], RP['neck_r'], RP['neck_z'], RP['lip']
    z_e = zc + rz * math.sin(math.acos(nr / R))
    if z <= z_e: return R * math.sqrt(max(0.0, 1 - ((z - zc) / rz) ** 2))
    cx, cz = nr + 0.5 * lip, nz + 0.866 * lip
    if z < cz - lip: return nr
    return cx + math.sqrt(max(0.0, lip * lip - (z - cz) ** 2))


def build_ridepot():
    sheet = L.Sheet('ridepot', 52, 44, 26, 42)
    new_scene(64)
    root = empty('root')
    pot = empty('pot', (0, 0, 2.2), root)
    iron = black_iron('iron', '#2a2933', 0.22)
    inner = inner_mat('inner', '#0c140a')
    prof, ii = cauldron_profile(**RP)
    lathe('body', prof, [iron, inner], inner_from=ii, parent=pot, seg=64)
    brass = gold_mat('#c89838', 'brass')
    for z in (6.0,):
        sn = (z - RP['zc']) / RP['rz']
        torus('band', brass, (0, 0, z), RP['R'] * math.sqrt(1 - sn * sn) + 0.15, 0.7, parent=pot)
    for s in (-1, 1):
        torus('handle%d' % s, iron, (s * 17.0, 0, 15.5), 1.7, 0.55, rot=(math.pi / 2, 0, 0), parent=pot)
    gm = goo_mat('goo', 1.1); hm = goo_hi_mat('goohi', 1.9)
    slick_m = goo_mat('slick', 0.8)
    cx, cz = RP['neck_r'] + 0.5 * RP['lip'], RP['neck_z'] + 0.866 * RP['lip']
    # overflow ring over the lip, fatter where drips leave it
    drips = [(-150, 0.0, 9.0), (-118, 2.0, 13.0), (-84, 1.0, 7.0), (-55, 3.0, 11.5), (-24, 2.0, 8.0), (160, 1.0, 6.0),
             (30, 0.0, 6.0)]
    pts, rr = [], []
    for k in range(73):
        a = TAU * k / 72
        bump = sum(math.exp(-((math.degrees(math.atan2(math.sin(a - rad(da)), math.cos(a - rad(da))))) / 9.0) ** 2)
                   for da, _, _ in drips)
        pts.append((cx * math.cos(a), cx * math.sin(a), cz + 0.7)); rr.append(1.05 + 0.85 * min(1.0, bump))
    tube('overflow', pts, rr, gm, seg=12, parent=pot, cap=False)
    surf = empty('surf', (0, 0, 0), pot)
    lathe('dome', [(0.01, cz + 3.0), (6.0, cz + 2.7), (11.0, cz + 1.9), (14.0, cz + 1.1), (cx, cz + 0.8),
                   (cx, cz - 1.0)], [gm], parent=surf, seg=56)
    plight('glow', (0, -8.0, cz + 6.0), 4.0, GOO, 3.0, pot)
    plight('under', (0, -20.0, 1.0), 2.5, GOO, 4.0, root)

    def drip_path(a_deg, length, off=0.75):
        a = rad(a_deg); ca, sa = math.cos(a), math.sin(a)
        pts = [(cx * ca, cx * sa, cz + 1.4), ((cx + RP['lip'] * 0.85) * ca, (cx + RP['lip'] * 0.85) * sa, cz + 0.2)]
        z = cz - 0.6; z_end = cz - length
        while z > z_end:
            r = rp_outer(z) + off
            pts.append((r * ca, r * sa, z)); z -= 1.2
        r = rp_outer(z_end) + off
        pts.append((r * ca, r * sa, z_end))
        return pts

    root.rotation_euler.x = rad(16)
    # slick: a thick puddle trailing behind (-X) the sliding pot
    slick = empty('slick', (0, 0, 0), root)
    lathe('slickb', [(0.01, 2.6), (12.0, 2.5), (18.0, 2.1), (21.5, 1.3), (23.0, 0.4), (23.2, 0.0), (0.01, 0.0)][::-1],
          [slick_m], parent=slick, seg=64)
    slick.scale = (1.0, 0.85, 1.0)
    trail = [(-24.5, -3.0, 1.6), (-27.0, 2.0, 1.2), (-23.0, 5.5, 1.3), (20.0, -6.0, 1.1)]
    for k, (x, y, r) in enumerate(trail):
        sph('trail%d' % k, slick_m, (x, y, 0.5), r, slick, scale=(1.6, 1.0, 0.45))
    ground(root)
    for f in range(4):
        dyn = []
        surf.rotation_euler = (rad((1.5, 0, -1.5, 0)[f]), rad((0, 2.0, 0, -2.0)[f]), 0)
        surf.location.z = (0.0, 0.25, 0.0, -0.2)[f] * PX
        for k, (da, ph, ln) in enumerate(drips):
            st = (f + int(ph)) % 4
            L_ = ln * (0.55 + 0.15 * st)
            p = drip_path(da, L_)
            dyn.append(tube('drip%d' % k, p, [1.2] + [1.0] * (len(p) - 2) + [0.8], gm, seg=10, parent=pot))
            dyn.append(sph('dbulb%d' % k, gm, p[-1], 1.15 + 0.1 * st, pot, scale=(1, 1, 1.25)))
            if st == 3:      # a drop that has let go
                a = rad(da); r = rp_outer(cz - L_ - 2.5) + 1.2
                dyn.append(sph('dfall%d' % k, hm, (r * math.cos(a), r * math.sin(a), cz - L_ - 3.0), 0.8, pot))
        for k, (bx, by, ph, s) in enumerate([(-5.0, -5.0, 0, 1.8), (4.5, -2.0, 2, 1.5), (0.0, 6.0, 1, 2.0),
                                             (8.5, 5.0, 3, 1.3)]):
            st = (f + ph) % 4
            zz = cz + 3.0 - 0.012 * (bx * bx + by * by)
            if st < 3:
                dyn.append(sph('bub%d' % k, hm, (bx, by, zz + 0.3), s * (0.5, 0.8, 1.0)[st], surf, seg=12, rings=8))
            else:
                dyn.append(torus('pop%d' % k, hm, (bx, by, zz), s, 0.3, parent=surf, scale=(1, 1, 0.6)))
        # ripples running back through the slick
        for k in range(2):
            rx = -6.0 - ((f * 3.0 + k * 9.0) % 16.0)
            dyn.append(torus('rip%d' % k, hm, (rx, -6.0, 2.4), 2.2, 0.28, parent=slick, scale=(1.5, 1, 0.4)))
        sheet.add('slide')
        remove(dyn)
    # air: the slick stays behind; goo leaps up out of the pot and trails below it
    for o in list(slick.children_recursive) + [slick]: remove([o])
    rng = np.random.default_rng(5)
    jets = [(rng.uniform(0, TAU), rng.uniform(4, 11), rng.uniform(0.7, 1.2)) for _ in range(9)]
    for f in range(2):
        dyn = []
        z0 = cz + 2.2
        rc, hc, ls = ((11.5, 5.5, 3.2), (14.0, 4.0, 2.6))[f]
        w = 1.3
        prof = [(rc * 0.7, 0.0), (rc * 0.84, hc * 0.4), (rc * 0.95, hc * 0.78), (rc, hc), (rc - w * 0.6, hc * 0.95),
                (rc * 0.88 - w, hc * 0.6), (rc * 0.72 - w, hc * 0.2), (rc * 0.55, 0.0)]
        dyn.append(lathe('crown', [(r, z + z0) for r, z in prof], [gm], parent=pot, seg=56))
        for k, (a, r, s) in enumerate(jets):
            a2 = TAU * k / len(jets) + 0.2
            p0 = Vector((rc * math.cos(a2), rc * math.sin(a2), z0 + hc - 0.5))
            p1 = p0 + Vector((math.cos(a2) * ls * 0.5, math.sin(a2) * ls * 0.5, ls * s))
            dyn.append(tube('sp%d' % k, [tuple(p0), tuple(p1)], [0.8, 0.4], gm, parent=pot, seg=8))
            tip = p1 + Vector((math.cos(a2) * (0.6 + f), math.sin(a2) * (0.6 + f), 1.2 + f * 1.5 * s))
            dyn.append(sph('st%d' % k, hm if k % 2 else gm, tuple(tip), 0.9 * s + 0.2, pot, seg=10, rings=6))
        h = (6.0, 8.5)[f]
        dyn.append(drop('col', gm, (0, -1.0, z0), (0, 0, 1), h, 2.6 - f * 0.6, pot))
        dyn.append(sph('ctop', hm, (0, -1.0, z0 + h + 1.0 + f * 1.2), 1.4 - f * 0.2, pot))
        for k, (da, ph, ln) in enumerate(drips):
            L_ = ln * (0.85 + 0.25 * f)
            p = drip_path(da, L_)
            dyn.append(tube('drip%d' % k, p, [1.2] + [1.0] * (len(p) - 2) + [0.75], gm, seg=10, parent=pot))
            dyn.append(sph('dbulb%d' % k, gm, p[-1], 1.15, pot, scale=(1, 1, 1.5)))
        for k, x in enumerate((-9.0, 2.0, 10.0)):
            dyn.append(drop('under%d' % k, gm, (x, -3.0, -0.6 - f * 1.5 - k * 0.5), (0, 0, -1), 2.2 + f, 0.8, pot))
        sheet.add('air')
        remove(dyn)
    sheet.save(); O.preview(sheet, 'ridepot'); frames_preview(sheet, 'ridepot_f', cols=6, scale=6)


# ---- 3. splash -----------------------------------------------------------------------------------------------
def build_splash():
    sheet = L.Sheet('splash', 56, 48, 28, 44)
    new_scene(64)
    root = empty('root'); root.rotation_euler.x = rad(18)
    gm = goo_mat('goo', 1.3); hm = goo_hi_mat('goohi', 2.1); dm = goo_mat('drops', 2.0)
    plight('glow', (0, -12.0, 10.0), 5.0, GOO, 6.0)
    rng = np.random.default_rng(21)
    NS = 12
    spikes = [(TAU * (k + rng.uniform(-0.2, 0.2)) / NS, rng.uniform(0.7, 1.3)) for k in range(NS)]
    parts = []
    for k in range(16):
        a = rng.uniform(0, TAU)
        parts.append((a, rng.uniform(26, 62), rng.uniform(55, 140), rng.uniform(1.3, 2.3)))
    # crown radius, crown height, spike length, puddle radius, jet height, puddle thickness
    tl = [(5, 4, 2.5, 6, 0, 1.0), (8.5, 8.5, 4.5, 9, 0, 1.2), (11, 12, 6, 11.5, 0, 1.3), (12.5, 12.5, 6.5, 13, 3, 1.3),
          (13.5, 9.5, 5, 14, 10, 1.2), (14.5, 5.5, 3, 15, 15, 1.0), (15, 2.0, 1.2, 15, 8, 0.8), (14, 0.6, 0, 12, 0, 0.5)]
    for f, (rc, hc, ls, rp, jh, th) in enumerate(tl):
        dyn = []
        dyn.append(lathe('pud', [(0.01, th), (rp * 0.6, th * 0.9), (rp * 0.9, th * 0.5), (rp, 0.0)], [gm], parent=root,
                         seg=48))
        if hc > 0.8:
            w = 1.0 + 0.4 * (hc / 12)
            prof = [(rc * 0.62, 0.0), (rc * 0.8, hc * 0.35), (rc * 0.94, hc * 0.72), (rc, hc), (rc - w * 0.6, hc * 0.96),
                    (rc * 0.86 - w, hc * 0.62), (rc * 0.68 - w, hc * 0.25), (rc * 0.5, 0.2)]
            dyn.append(lathe('crown', prof, [gm], parent=root, seg=56))
            for k, (a, s) in enumerate(spikes):
                if ls <= 0: break
                L_ = ls * s
                p0 = Vector((rc * math.cos(a), rc * math.sin(a), hc - 0.6))
                p1 = p0 + Vector((math.cos(a) * L_ * 0.45, math.sin(a) * L_ * 0.45, L_))
                dyn.append(tube('sp%d' % k, [tuple(p0), tuple((p0 + p1) / 2), tuple(p1)], [w * 0.6, w * 0.45, w * 0.3],
                                gm, parent=root, seg=8))
                dyn.append(sph('st%d' % k, hm if k % 2 else gm, tuple(p1 + Vector((0, 0, 0.5))), 0.75 + 0.35 * s, root,
                               seg=10, rings=6))
        if jh > 0:
            dyn.append(drop('jet', gm, (0, 0, 0), (0, 0, 1), jh, 2.4 - 0.08 * jh, root))
            dyn.append(sph('jtop', hm, (0, 0, jh + 1.6), 1.7 if f < 6 else 1.2, root, seg=12, rings=8))
        T = 0.05 + 0.085 * f
        for k, (a, vr, vz, s) in enumerate(parts):
            z = vz * T - 140 * T * T
            if z < -0.5: continue
            r = s * (1 - 0.45 * T / 0.65)
            pos = Vector((vr * T * math.cos(a), vr * T * math.sin(a) * 0.6, max(z, 0.3)))
            vel = Vector((vr * math.cos(a), vr * math.sin(a) * 0.6, vz - 280 * T))
            dyn.append(drop('pd%d' % k, dm, tuple(pos - vel.normalized() * r), tuple(vel),
                            r * 2 + min(3.0, vel.length * 0.03), r, root))
        sheet.add('pop')
        remove(dyn)
    sheet.save(); O.preview(sheet, 'splash'); frames_preview(sheet, 'splash_f', cols=8, scale=5)


# ---- 4. mounts -----------------------------------------------------------------------------------------------
def build_mounts():
    sheet = L.Sheet('mounts', 56, 40, 28, 38)
    # post: a stout iron swivel post with a ring clamp
    new_scene(64)
    root = empty('root')
    iron = black_iron('iron', '#33323d', 0.25)
    gold = gold_mat('#d8a840')
    bolt = mat('bolt', '#a0a6b8', rough=0.22, metal=1.0)
    lathe('base', [(0.01, 2.2), (4.0, 2.2), (6.5, 1.6), (8.0, 0.9), (8.2, 0.0), (0.01, 0.0)][::-1], [iron], parent=root)
    for k in range(6):
        a = TAU * (k + 0.5) / 6
        sph('bb%d' % k, bolt, (6.4 * math.cos(a), 6.4 * math.sin(a), 1.7), 0.6, root, seg=8, rings=5)
    lathe('foot', [(0.01, 2.0), (5.0, 2.0), (3.6, 3.4), (2.6, 5.0), (2.4, 10.0), (2.9, 10.4), (0.01, 10.4)], [iron],
          parent=root, seg=32)
    torus('collar', gold, (0, 0, 10.6), 3.0, 0.7, parent=root)
    cyl('swivel', iron, (0, 0, 11.8), 3.3, 1.8, parent=root, verts=32)
    torus('collar2', gold, (0, 0, 12.8), 2.9, 0.55, parent=root)
    # yoke arms up to the ring
    for s in (-1, 1):
        tube('yoke%d' % s, [(0, 0, 12.6), (s * 3.0, 0, 13.4), (s * 6.4, 0, 15.4), (s * 7.4, 0, 18.0)], 1.0, iron,
             parent=root, seg=10)
    torus('ring', iron, (0, 0, 18.0), 6.6, 1.25, rot=(math.pi / 2, 0, 0), parent=root)
    torus('ringg', gold, (0, -0.9, 18.0), 6.6, 0.45, rot=(math.pi / 2, 0, 0), parent=root)
    for s in (-1, 1):
        cyl('lug%d' % s, iron, (s * 7.6, 0, 18.0), 1.4, 3.6, rot=(math.pi / 2, 0, 0), parent=root, verts=16)
        sph('lugb%d' % s, bolt, (s * 7.6, -1.9, 18.0), 0.75, root, seg=10, rings=6)
    box('clamp', iron, (3.0, 3.2, 2.0), loc=(0, 0, 25.0), parent=root, bevel=0.5)
    sph('clampb', bolt, (0, -1.8, 25.0), 0.7, root, seg=10, rings=6)
    root.rotation_euler.x = rad(14)
    ground(root)
    sheet.add('post')
    # chains: three chains converging up to a ring hung at the frame's top centre
    new_scene(64, rim=12.0)
    root = empty('root')
    steel = mat('steel', '#9a9eb0', rough=0.32, metal=0.55, coat=0.3)
    ringm = gold_mat('#d8a840')
    top = Vector((0, 0, 34.8))
    torus('topring', ringm, tuple(top), 2.4, 0.75, rot=(math.pi / 2, 0, 0), parent=root)
    hub = top - Vector((0, 0, 3.0))
    sph('hub', ringm, tuple(hub + Vector((0, 0, 0.2))), 1.1, root, seg=12, rings=8)
    for k, a in enumerate((90, 210, 330)):
        a = rad(a)
        end = Vector((11.5 * math.cos(a), 11.5 * math.sin(a) * 0.8, 6.5))
        chain('ch%d_' % k, tuple(hub - Vector((0, 0, 0.6))), tuple(end), steel, root)
        # small S-hook where a cauldron handle would catch
        hk = [end + Vector((0, 0, 0.3)), end + Vector((0, 0, -1.5)), end + Vector((0.3 * math.cos(a), 0, -3.3)),
              end + Vector((1.4 * math.cos(a) + 0.4, 0, -3.5)), end + Vector((1.8 * math.cos(a) + 0.5, 0, -2.0))]
        tube('hook%d' % k, [tuple(p) for p in hk], 0.6, ringm, parent=root, seg=8)
    root.rotation_euler.x = rad(8)
    sheet.add('chains')
    # cart: a small wooden wheeled trolley base
    new_scene(64, rim=6.0)
    root = empty('root')
    wood = tex_mat('wood', '#7a4818', '#b07a36', scale=(3, 30, 30), rough=0.5, coat=0.25, noise=6.0)
    wood2 = tex_mat('wood2', '#5a3412', '#86561e', scale=(3, 30, 30), rough=0.55, noise=6.0)
    endg = tex_mat('endg', '#b0804a', '#80542e', scale=(1, 1, 1), noise=50, rough=0.6)
    strap = black_iron('strap', '#3a3944', 0.3)
    gold = gold_mat('#d8a840')
    for k in range(4):
        box('plank%d' % k, wood if k % 2 else wood2, (31.0, 3.3, 2.6), loc=(0, -5.1 + 3.4 * k, 7.8), parent=root,
            bevel=0.4)
    for x in (-12.0, 0.0, 12.0):
        box('strapb%d' % x, strap, (1.6, 14.4, 2.8), loc=(x, 0, 7.8), parent=root, bevel=0.3)
        for y in (-6.0, 6.0):
            sph('nail%d%d' % (x, y), gold, (x, y - 0.6, 9.3), 0.45, root, seg=8, rings=5)
    for s in (-1, 1):
        box('chock%d' % s, wood2, (4.0, 10.0, 3.2), loc=(s * 7.2, 0, 10.2), rot=(0, rad(-s * 24), 0), parent=root,
            bevel=0.5)
    cyl('pivot', strap, (0, 0, 9.4), 3.0, 1.0, parent=root, verts=24)
    sph('pivotb', gold, (0, 0, 10.0), 1.2, root, seg=12, rings=8, scale=(1, 1, 0.6))
    for yy in (-7.4, 7.4):
        for s in (-1, 1):
            w = empty('wh%d%d' % (yy, s), (s * 10.5, yy, 4.2), root)
            torus('tire', strap, (0, 0, 0), 3.9, 0.6, rot=(math.pi / 2, 0, 0), parent=w)
            torus('felloe', wood2, (0, 0, 0), 3.1, 0.55, rot=(math.pi / 2, 0, 0), parent=w)
            cyl('hub', endg, (0, -0.3, 0), 1.0, 2.2, rot=(math.pi / 2, 0, 0), parent=w, verts=12)
            for k in range(6):
                a = TAU * k / 6 + 0.3
                tube('sp%d' % k, [(0.7 * math.cos(a), 0, 0.7 * math.sin(a)), (3.0 * math.cos(a), 0, 3.0 * math.sin(a))],
                     0.42, wood, parent=w, seg=6)
            sph('cap', gold, (0, -1.5, 0), 0.6, w, seg=8, rings=5)
    box('axle0', strap, (24, 1.2, 1.2), loc=(0, -6.5, 4.2), parent=root, bevel=0.2)
    root.rotation_euler.x = rad(16)
    ground(root)
    sheet.add('cart')
    sheet.save(); O.preview(sheet, 'mounts'); frames_preview(sheet, 'mounts_f', cols=3, scale=7)


# ---- 5. obstacles --------------------------------------------------------------------------------------------
def face_canvas(kind):
    c = Canvas(11, 9, base='#ffd040')
    hot, edge = '#ffe060', '#7a2a00'
    eyes, mouth = [], None
    if kind == 0:
        eyes = [c.poly([(-3.6, 0.6), (-1.0, 0.6), (-2.3, 3.0)]), c.poly([(1.0, 0.6), (3.6, 0.6), (2.3, 3.0)])]
        mouth = c.poly([(-4.4, -0.6), (-3.0, -1.2), (-2.2, -0.4), (-1.0, -1.3), (0, -0.5), (1.0, -1.3), (2.2, -0.4),
                        (3.0, -1.2), (4.4, -0.6), (2.6, -3.4), (-2.6, -3.4)])
    elif kind == 1:
        eyes = [c.ell(-2.2, 1.5, 1.4, 1.1), c.ell(2.2, 1.5, 1.4, 1.1)]
        mouth = c.ell(0, -1.8, 3.8, 1.8) & ~c.ell(0, -0.6, 4.2, 1.6)
    else:
        eyes = [c.poly([(-3.4, 2.6), (-0.9, 1.2), (-3.0, 0.6)]), c.poly([(3.4, 2.6), (0.9, 1.2), (3.0, 0.6)])]
        mouth = c.poly([(-3.8, -0.8), (3.8, -0.8), (2.6, -2.2), (1.3, -1.4), (0, -2.8), (-1.3, -1.4), (-2.6, -2.2)])
    nose = c.poly([(0, 0.6), (-0.7, -0.4), (0.7, -0.4)])
    allm = eyes[0] | eyes[1] | mouth | nose
    c.fill(allm, hot)
    return c


def egg_mat(name, cols, kind, band=3.0, wave=0.5, k=6):
    m = L.mat(name, cols[0], rough=0.32, coat=0.6, spec=0.5)
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Object'], sep.inputs[0])
    if kind == 'dots':
        vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 7.0
        Lk.new(tc.outputs['Object'], vo.inputs['Vector'])
        r = ramp(nt, [(0.0, lin(cols[1])), (0.26, lin(cols[0]))]); r.color_ramp.interpolation = 'CONSTANT'
        Lk.new(vo.outputs['Distance'], r.inputs['Fac'])
    else:
        v = mnode(nt, 'MULTIPLY', sep.outputs['Z'], 1.0 / (band * PX))
        if kind == 'zig':
            ang = mnode(nt, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
            tri = mnode(nt, 'PINGPONG', mnode(nt, 'MULTIPLY', ang, k / math.pi), 1.0)
            v = mnode(nt, 'MULTIPLY_ADD', tri, wave, v)
        v = mnode(nt, 'MULTIPLY', mnode(nt, 'FRACT', mnode(nt, 'MULTIPLY', v, 1.0 / len(cols))), 1.0)
        r = ramp(nt, [(i / len(cols), lin(c)) for i, c in enumerate(cols)]); r.color_ramp.interpolation = 'CONSTANT'
        Lk.new(v, r.inputs['Fac'])
    Lk.new(r.outputs['Color'], bsdf(m).inputs['Base Color'])
    return m


def egg(name, m, W, H, loc, rot, parent):
    prof = []
    for i in range(25):
        t = math.pi * i / 24
        prof.append((max(0.01, W / 2 * math.sin(t) * (1 + 0.13 * math.cos(t))), H / 2 * (1 - math.cos(t)) - H / 2))
    o = lathe(name, prof, [m], parent=parent, seg=40)
    o.location = P(loc); o.rotation_euler = rot
    return o


def heart_pts(s, n=48):
    pts = []
    for i in range(n):
        t = TAU * i / n
        pts.append((16 * math.sin(t) ** 3 * s, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t)
                                                 - math.cos(4 * t)) * s))
    return pts[::-1]


def gift(name, root, size, loc, body_m, rib_m, rot_z=0.0, bow=True, rw=2.0):
    g = empty(name, loc, root); g.rotation_euler.z = rot_z
    w, d, h = size
    box(name + 'b', body_m, (w, d, h), loc=(0, 0, h / 2), parent=g, bevel=0.45)
    box(name + 'r1', rib_m, (w + 0.35, rw, h + 0.35), loc=(0, 0, h / 2), parent=g, bevel=0.15)
    box(name + 'r2', rib_m, (rw, d + 0.35, h + 0.35), loc=(0, 0, h / 2), parent=g, bevel=0.15)
    if bow:
        for s in (-1, 1):
            torus(name + 'l%d' % s, rib_m, (s * 1.8, 0, h + 1.3), 1.6, 0.55, rot=(math.pi / 2, rad(s * 25), 0), parent=g,
                  scale=(1, 1, 0.75))
            tube(name + 't%d' % s, [(0, -0.3, h + 0.4), (s * 1.6, -0.8, h + 0.15), (s * 2.6, -1.4, h - 0.6)],
                 (0.9, 0.22), rib_m, parent=g, seg=8)
        sph(name + 'k', rib_m, (0, 0, h + 0.8), 0.95, g, seg=12, rings=8)
    return g


def build_obstacles():
    sheet = L.Sheet('obstacles', 48, 40, 24, 38)
    for anim in ('hallo', 'july', 'pat', 'easter', 'val', 'thanks', 'xmas'):
        new_scene(64)
        root = empty('root')
        tilt = 16
        if anim == 'hallo':
            stem_m = tex_mat('stem', '#4a5a22', '#7a7a3a', scale=(20, 20, 4), rough=0.7)
            spec = [((-6.5, 0, 6.2), 8.2, 6.2, 0, rad(-6)), ((7.6, -1.0, 5.4), 7.2, 5.4, 1, rad(8)),
                    ((0.8, 2.0, 15.6), 6.6, 4.9, 2, rad(4))]
            for k, (loc, R, Hh, face, rz) in enumerate(spec):
                pm = mat('pump%d' % k, ('#ec7a1a', '#e06a10', '#f08a24')[k], rough=0.45, coat=0.35)
                add_decal(pm, face_canvas(face), 0, 0.2 * Hh, rough=0.6, emit=4.0, name='face%d' % k)
                o = pumpkin('pk%d' % k, pm, R, Hh, loc, root, rot=(0, rad((-4, 6, 0)[k]), rz))
                stem('stem%d' % k, root, (loc[0], loc[1], loc[2] + Hh * 0.68), stem_m, h=2.6, lean=(1.0, -0.9, 1.2)[k])
                plight('candle%d' % k, (loc[0], loc[1] - R * 0.6, loc[2]), 0.5, '#ff9a30', 2.0, root)
            leaf = mat('leaf', '#5a6a24', rough=0.6)
            tube('vine', [(-12, -2, 1.0), (-13.5, -3.5, 3.5), (-12.0, -5.0, 5.5), (-10.5, -4.5, 4.5)], 0.45, leaf,
                 parent=root, seg=6)
        elif anim == 'july':
            wood = tex_mat('crate', '#a8763e', '#cc9a5a', scale=(3, 30, 30), rough=0.55, noise=6.0)
            batten = tex_mat('batten', '#6e4626', '#8a5a32', scale=(3, 30, 30), rough=0.6, noise=6.0)

            def crate(nm, w, d, h, loc, rz=0.0):
                g = empty(nm, loc, root); g.rotation_euler.z = rz
                cm = tex_mat(nm + 'w', '#a8763e', '#cc9a5a', scale=(3, 30, 30), rough=0.55, noise=6.0)
                stripes = Canvas(w - 2.2, 4.4, res=24, base='#f2c21a')
                stripes.fill(np.ones(stripes.X.shape, bool), '#f2c21a')
                stripes.fill(np.mod(stripes.X + stripes.Y, 3.0) < 1.5, '#16121a')
                add_decal(cm, stripes, 0, h * 0.52, rough=0.45, name=nm + 'hz')
                box(nm + 'b', cm, (w, d, h), loc=(0, 0, h / 2), parent=g, bevel=0.3)
                for s in (-1, 1):
                    box(nm + 'v%d' % s, batten, (1.4, d + 0.5, h + 0.2), loc=(s * (w / 2 - 0.6), 0, h / 2), parent=g,
                        bevel=0.2)
                for zz in (0.8, h - 0.8):
                    box(nm + 'h%d' % zz, batten, (w + 0.2, d + 0.5, 1.3), loc=(0, 0, zz), parent=g, bevel=0.2)
                return g
            crate('c0', 16.0, 12.0, 9.5, (-7.6, 0, 0), rad(-4))
            crate('c1', 14.0, 11.0, 8.5, (8.4, -0.5, 0), rad(6))
            crate('c2', 14.0, 10.0, 8.0, (0.2, 0.5, 9.6), rad(2))
            red = mat('rk_r', '#d8283a', rough=0.3, coat=0.5); blue = mat('rk_b', '#2a4ad8', rough=0.3, coat=0.5)
            white = mat('rk_w', '#f2eee6', rough=0.35)
            for k, (x, y, ang, m_) in enumerate([(-3.5, 1.0, -14, red), (0.5, 0.0, 4, blue), (4.0, 1.5, 18, red)]):
                g = empty('rk%d' % k, (x, y, 14.5), root); g.rotation_euler.y = rad(ang)
                cyl('rkb%d' % k, m_, (0, 0, 3.0), 1.35, 6.5, parent=g, verts=16)
                tube('rkc%d' % k, [(0, 0, 6.2), (0, 0, 8.8)], [1.5, 0.1], white, parent=g, seg=16)
                torus('rkr%d' % k, white, (0, 0, 4.5), 1.4, 0.3, parent=g)
            spark = mat('spark', '#fff0b0', emit=(*hx('#ffe080'), 6.0))
            twine = mat('twine', '#3a2a1e', rough=0.8)
            tube('fuse', [(10.0, -6.0, 4.0), (12.5, -7.0, 3.5), (14.0, -6.5, 1.5), (15.5, -5.5, 0.8)], 0.4, twine,
                 parent=root, seg=6)
            sph('fspark', spark, (15.7, -5.6, 1.0), 0.9, root, seg=10, rings=6)
        elif anim == 'pat':
            iron = black_iron('iron', '#22212a', 0.22)
            prof, ii = cauldron_profile(R=10.5, zc=7.4, rz=7.0, neck_r=8.4, neck_z=12.0, lip=1.1, wall=0.6)
            pot = empty('pot', (0, 0, 1.0), root)
            lathe('pot', prof, [iron, inner_mat()], inner_from=ii, parent=pot, seg=48)
            for k, a in enumerate((-150, -30, 90)):
                a = rad(a)
                sph('foot%d' % k, iron, (5.0 * math.cos(a), 5.0 * math.sin(a), 0.4), 1.4, pot, scale=(1, 1, 1.2))
            for s in (-1, 1):
                torus('handle%d' % s, iron, (s * 9.6, 0, 11.0), 1.4, 0.45, rot=(math.pi / 2, 0, 0), parent=pot)
            goldm = mat('gold', '#f2c040', rough=0.22, metal=1.0, emit=(*hx('#f2c040'), 0.5))
            coin_m = mat('coin', '#ffd24a', rough=0.18, metal=1.0, emit=(*hx('#ffd24a'), 0.6))
            heap = [(0.01, 21.0), (3.0, 20.4), (6.0, 18.6), (8.6, 15.6), (9.6, 13.6), (9.6, 11.0)]
            lathe('heap', heap, [goldm], parent=pot, seg=48)
            rng = np.random.default_rng(4)

            def heap_z(r):
                for (r0, z0), (r1, z1) in zip(heap, heap[1:]):
                    if r0 <= r <= r1: return z0 + (z1 - z0) * (r - r0) / (r1 - r0)
                return 13.0
            for k in range(34):
                r = math.sqrt(rng.uniform(0, 1)) * 9.2; a = rng.uniform(0, TAU)
                if math.sin(a) > 0.6 and r > 4: continue
                z = heap_z(r)
                nrm = Vector((r * math.cos(a) * 0.12, r * math.sin(a) * 0.12, 1.0)) + Vector(rng.uniform(-0.4, 0.4, 3))
                c = cyl('coin%d' % k, coin_m, (r * math.cos(a), r * math.sin(a), z + 0.25), 1.7, 0.55, parent=pot,
                        verts=20)
                c.rotation_euler = align(nrm)
            spill = [(-12.5, -3.0, 0.3, 10), (-10.0, -6.5, 0.3, -20), (11.0, -5.0, 0.3, 30), (13.5, -1.0, 0.3, 0),
                     (12.2, -2.8, 0.9, 50), (-11.2, -4.8, 1.0, 70), (7.0, -9.5, 0.3, 12), (-6.0, -9.0, 0.3, 0)]
            for k, (x, y, z, ang) in enumerate(spill):
                c = cyl('sp%d' % k, coin_m, (x, y, z), 1.7, 0.55, parent=root, verts=20)
                c.rotation_euler = (rad(ang * 0.5), rad(ang), 0)
            for k in range(4):        # a little stack
                cyl('stk%d' % k, coin_m, (14.5 + 0.2 * (k % 2), 2.0, 0.35 + 0.6 * k), 1.7, 0.55, parent=root, verts=20)
            glint = mat('glint', '#ffffff', emit=(1, 1, 1, 9.0))
            for k, (x, y, z) in enumerate([(-3.0, -6.5, 19.0), (4.5, -5.0, 18.2), (0.5, -2.5, 21.2)]):
                sph('gl%d' % k, glint, (x, y, z), 0.45, pot, seg=8, rings=5)
        elif anim == 'easter':
            mats = [egg_mat('e0', ['#f07ab0', '#fff0f6', '#5ab4f0', '#fff0f6'], 'zig', band=2.0, wave=0.7),
                    egg_mat('e1', ['#5ad89a', '#f6d840'], 'bands', band=2.4),
                    egg_mat('e2', ['#9a78ec', '#fff2c8'], 'dots'),
                    egg_mat('e3', ['#f6d040', '#ec5a98', '#f6d040', '#4aa8ec'], 'zig', band=1.8, wave=0.6, k=5),
                    egg_mat('e4', ['#5aaef0', '#ffffff'], 'dots')]
            spec = [(-8.5, 0.0, 0.0, 12, 15, rad(-62)), (8.0, -0.5, 0.0, 11, 14, rad(58)), (0.0, -3.5, 0.0, 10.5, 13.5, 0.0),
                    (-4.0, 2.5, 8.5, 10, 13, rad(-14)), (5.5, 3.0, 8.0, 9, 12, rad(20))]
            for k, (x, y, z, W, H, ry) in enumerate(spec):
                e = egg('egg%d' % k, mats[k], W, H, (x, y, z + H / 2 if abs(ry) < 0.5 else z + W / 2), (0, ry, 0), root)
            grass = mat('grass', '#5ab838', rough=0.6)
            rng = np.random.default_rng(9)
            for k in range(26):
                x = rng.uniform(-15, 15); y = rng.uniform(-6, -2)
                tube('g%d' % k, [(x, y, -0.2), (x + rng.uniform(-1, 1), y - 0.5, rng.uniform(2.0, 3.6))], [0.5, 0.08],
                     grass, parent=root, seg=5)
        elif anim == 'val':
            tilt = 20
            reds = [mat('h0', '#c81a3a', rough=0.32, coat=0.6), mat('h1', '#f05a96', rough=0.32, coat=0.6),
                    mat('h2', '#a01430', rough=0.3, coat=0.6)]
            lids = [mat('l0', '#e8304e', rough=0.25, coat=0.8), mat('l1', '#ff80b4', rough=0.25, coat=0.8),
                    mat('l2', '#e0284a', rough=0.22, coat=0.8)]
            rib = mat('rib', '#f6e6c0', rough=0.3, coat=0.4, emit=(*hx('#fff0d0'), 0.25))
            goldr = gold_mat('#f0c048')
            z = 0.0
            for k, (s, h, rz, dx) in enumerate([(0.86, 3.6, 0.0, 0.0), (0.64, 3.0, rad(16), 1.0)]):
                g = empty('hb%d' % k, (dx, 1.0 * k, z), root); g.rotation_euler.z = rz
                prism('hbox%d' % k, reds[k], heart_pts(s), 0.0, h, g)
                prism('hlid%d' % k, lids[k], heart_pts(s * 1.06), h - 0.2, h + 1.2, g)
                ribm = goldr if k == 1 else rib
                box('hr%d' % k, ribm, (1.6, 30 * s * 1.06, 1.5), loc=(0, -1.5 * s, h + 0.55), parent=g, bevel=0.1)
                box('hr2%d' % k, ribm, (1.6, 0.6, h + 1.4), loc=(0, -17.2 * s * 1.06 + 0.1, h / 2 + 0.5), parent=g,
                    bevel=0.1)
                z += h + 1.2
            # the top box stands up on the stack, heart face to the camera, leaning back a little
            g = empty('hb2', (-0.5, 2.0, z + 6.6), root); g.rotation_euler = (rad(78), 0, rad(-6))
            s = 0.44
            prism('hbox2', reds[2], heart_pts(s), -1.6, 1.0, g)
            prism('hlid2', lids[2], heart_pts(s * 1.07), 0.8, 2.2, g)
            box('hrv', rib, (1.5, 30 * s * 1.07, 1.4), loc=(0, -1.6 * s, 2.0), parent=g, bevel=0.1)
            box('hrh', rib, (30 * s * 1.07, 1.5, 1.4), loc=(0, 1.0, 2.0), parent=g, bevel=0.1)
            for sd in (-1, 1):
                torus('bl%d' % sd, rib, (sd * 1.9, 1.6, 3.0), 1.7, 0.6, rot=(0, rad(sd * 20), 0), parent=g,
                      scale=(1, 0.8, 1))
                tube('bt%d' % sd, [(0, 0.6, 2.8), (sd * 1.3, -0.8, 3.1), (sd * 2.2, -2.6, 3.0)], (1.0, 0.25), rib,
                     parent=g, seg=8)
            sph('bk', rib, (0, 1.0, 3.0), 1.0, g, seg=12, rings=8)
        elif anim == 'thanks':
            straw = tex_mat('straw', '#c49434', '#f0d070', scale=(4, 40, 40), rough=0.7, noise=4.0, lo=0.3, hi=0.7)
            straw2 = tex_mat('straw2', '#9a6a20', '#d8b050', scale=(60, 60, 4), rough=0.75, noise=3.0)
            twine = mat('twine', '#7a4a2a', rough=0.7)
            box('bale', straw, (28.0, 14.0, 12.5), loc=(0, 0, 6.25), parent=root, bevel=2.0, seg=3)
            for x in (-7.0, 7.0):
                box('tw%d' % x, twine, (0.9, 14.5, 13.0), loc=(x, 0, 6.25), parent=root, bevel=0.3)
            rng = np.random.default_rng(13)
            for k in range(40):
                side = -1 if k % 2 else 1
                x = side * 14.0; y = rng.uniform(-6, 6); z = rng.uniform(1, 12)
                tube('tuft%d' % k, [(x - side * 0.5, y, z), (x + side * rng.uniform(0.8, 2.2), y + rng.uniform(-1, 1),
                                                             z + rng.uniform(-1.5, 1.5))], [0.35, 0.12], straw2,
                     parent=root, seg=4)
            for k in range(16):
                x = rng.uniform(-12, 12); y = -7.2; z = rng.uniform(1.5, 11.5)
                tube('fr%d' % k, [(x, y + 0.6, z), (x + rng.uniform(-2.5, 2.5), y - 0.3, z + rng.uniform(-1, 1))],
                     [0.28, 0.1], straw2, parent=root, seg=4)
            pm = mat('pump', '#e8801e', rough=0.42, coat=0.35)
            pumpkin('pk', pm, 6.8, 4.6, (2.5, 0.5, 12.5 + 4.0), root, ribs=9, groove=0.12)
            stem('pst', root, (2.5, 0.5, 12.5 + 4.0 + 3.0), tex_mat('stem', '#5a5020', '#8a7a3a', scale=(20, 20, 4)), 2.6)
            leaf = mat('leaf', '#6a7a2a', rough=0.6)
            tube('curl', [(3.2, -0.5, 19.8), (5.0, -2.0, 20.6), (6.5, -3.0, 19.6), (6.0, -3.6, 18.6), (5.0, -3.2, 18.9)],
                 0.32, leaf, parent=root, seg=6)
            husk = mat('husk', '#e8d8a0', rough=0.6); kern = mat('kern', '#f0b020', rough=0.4, coat=0.3)
            g = empty('corn', (-8.5, -2.0, 12.5), root); g.rotation_euler = (0, rad(-62), 0)
            sph('cob', kern, (0, 0, 4.5), 1.6, g, scale=(1, 1, 2.8), seg=14, rings=10)
            for s in (-1, 1):
                tube('hk%d' % s, [(0, 0, 0.5), (s * 1.8, -0.5, 3.0), (s * 2.6, -0.8, 6.0)], (1.2, 0.3), husk, parent=g,
                     seg=8)
        elif anim == 'xmas':
            red = mat('red', '#d02030', rough=0.35, coat=0.5); green = mat('green', '#1f8a48', rough=0.35, coat=0.5)
            blue = mat('blue', '#2a5ad0', rough=0.35, coat=0.5)
            goldr = gold_mat('#f0c048'); white = mat('white', '#f4f0ea', rough=0.35, coat=0.4)
            redr = mat('redr', '#e82a3a', rough=0.3, coat=0.5)
            gift('g0', root, (15.0, 12.0, 10.5), (-6.5, 0.5, 0), red, goldr, rad(-5), bow=False)
            gift('g1', root, (11.0, 10.0, 8.5), (8.5, -1.0, 0), green, redr, rad(10))
            gift('g2', root, (11.0, 9.0, 7.5), (-5.0, 0.5, 10.5), blue, white, rad(12))
            gift('g3', root, (5.0, 5.0, 4.5), (11.5, -6.5, 0), white, redr, rad(-20), rw=1.2)
        root.rotation_euler.x = rad(tilt)
        ground(root)
        sheet.add(anim)
    sheet.save(); O.preview(sheet, 'obstacles'); frames_preview(sheet, 'obstacles_f', cols=7, scale=5)


# ---- 6. beams ------------------------------------------------------------------------------------------------
def build_beams():
    sheet = L.Sheet('beams', 64, 24, 32, 12)
    for anim in ('hallo', 'july', 'pat', 'easter', 'val', 'thanks', 'xmas'):
        new_scene(64)
        root = empty('root')
        rng = np.random.default_rng(31)
        if anim == 'hallo':
            bark = tex_mat('bark', '#2e2420', '#54443a', scale=(5, 40, 40), rough=0.8, noise=5.0)
            xs = np.linspace(-31, 31, 23)
            path = [(x, 0, 1.4 * math.sin(0.19 * x) + 0.8 * math.sin(0.53 * x + 1.0)) for x in xs]
            rr = [4.4 - 2.2 * (x + 31) / 62 + 0.35 * math.sin(1.3 * x) for x in xs]
            tube('branch', path, rr, bark, parent=root, seg=16)
            for x in (-17.0, 3.0, 19.0):
                i = int(np.argmin(abs(xs - x)))
                sph('knot%d' % x, bark, (path[i][0], -rr[i] * 0.55, path[i][2] + rr[i] * 0.2), rr[i] * 0.55, root,
                    scale=(1.2, 1, 0.9))
            for k, (x, up, ln, ang) in enumerate([(-22, 1, 6, 30), (-6, -1, 5, -40), (10, 1, 5.5, -25), (24, -1, 4, 35),
                                                  (14, -1, 4.5, 20)]):
                i = int(np.argmin(abs(xs - x)))
                p0 = Vector(path[i]); d = Vector((math.sin(rad(ang)), -0.3, up * math.cos(rad(ang))))
                tube('tw%d' % k, [tuple(p0), tuple(p0 + d * ln * 0.6), tuple(p0 + d * ln + Vector((0.8, 0, 0.4 * up)))],
                     [1.1, 0.6, 0.25], bark, parent=root, seg=8)
            lv = [mat('lv0', '#c8641c', rough=0.6), mat('lv1', '#8a3a14', rough=0.6)]
            for k, (x, z) in enumerate([(-13, -4.5), (7, -4.0), (17, -3.8)]):
                g = empty('lf%d' % k, (x, -2.0, z), root)
                sph('leaf%d' % k, lv[k % 2], (0, 0, -1.2), 1.0, g, scale=(1.2, 0.35, 1.9))
                g.rotation_euler.y = rad((20, -30, 15)[k])
        elif anim == 'july':
            steel = mat('steel', '#b83a2e', rough=0.35, metal=0.5, coat=0.4)
            rivet = mat('rivet', '#e8d8c8', rough=0.25, metal=1.0)
            box('chordT', steel, (62, 4.0, 1.8), loc=(0, 0, 5.0), parent=root, bevel=0.3)
            box('chordB', steel, (62, 4.0, 1.8), loc=(0, 0, -2.0), parent=root, bevel=0.3)
            for k in range(11):
                x0 = -30 + 6 * k
                tube('dg%d' % k, [(x0, -1.0, -1.4 if k % 2 == 0 else 4.4), (x0 + 6, -1.0, 4.4 if k % 2 == 0 else -1.4)],
                     0.75, steel, parent=root, seg=8, smooth=False)
                for zz in (5.0, -2.0):
                    sph('rv%d%d' % (k, zz), rivet, (x0, -2.1, zz), 0.45, root, seg=8, rings=5)
            for s in (-1, 1):
                box('end%d' % s, steel, (1.6, 4.0, 8.8), loc=(s * 30.2, 0, 1.5), parent=root, bevel=0.3)
            cord = mat('cord', '#f0ece0', rough=0.6)
            cols = [mat('bR', '#e02a3a', rough=0.5), mat('bW', '#f4f2ea', rough=0.5), mat('bB', '#2a4ad8', rough=0.5)]
            for sw in range(2):
                x0, x1 = -28 + 29 * sw, -28 + 29 * sw + 27
                pts = [(x0 + (x1 - x0) * t, -2.6, -2.9 - 2.2 * math.sin(math.pi * t)) for t in np.linspace(0, 1, 11)]
                tube('str%d' % sw, pts, 0.3, cord, parent=root, seg=5)
                for k in range(5):
                    t = (k + 0.7) / 6.0
                    x = x0 + (x1 - x0) * t; z = -2.9 - 2.2 * math.sin(math.pi * t)
                    tri = [(x + 2.0, z), (x - 2.0, z), (x, z - 3.9)]
                    pr = prism('fl%d%d' % (sw, k), cols[(k + sw) % 3], tri, -0.25, 0.25, root)
                    pr.rotation_euler = (rad(90), 0, 0); pr.location = P((0, -2.8, 0))
        elif anim == 'pat':
            for k, (x0, x1) in enumerate([(-31, -10.6), (-10.0, 10.4), (11.0, 31)]):
                st = tex_mat('stone%d' % k, ('#7a7884', '#8a8478', '#74727e')[k], '#a8a6a8', scale=(8, 8, 8), rough=0.85,
                             noise=3.0 + k)
                box('blk%d' % k, st, (x1 - x0, 9.0, 10.0), loc=((x0 + x1) / 2, 0, 0), parent=root, bevel=0.9, seg=2)
            moss = tex_mat('moss', '#3a7a22', '#7ac040', scale=(20, 20, 20), rough=0.8, noise=8.0)
            for k in range(16):
                x = rng.uniform(-29, 29); y = rng.uniform(-4, 3)
                sph('ms%d' % k, moss, (x, y, 5.0), rng.uniform(1.6, 3.0), root, scale=(1.6, 1.1, 0.45), seg=12, rings=8)
            for k in range(7):
                x = rng.uniform(-27, 27); L_ = rng.uniform(2.5, 5.5)
                tube('hm%d' % k, [(x, -4.7, 5.0), (x + 0.3, -4.9, 2.0), (x - 0.2, -4.9, 5 - L_ - 1)], [1.1, 0.8, 0.3],
                     moss, parent=root, seg=6)
            for k in range(5):
                x = rng.uniform(-26, 26)
                sph('mb%d' % k, moss, (x, -4.6, rng.uniform(-3, 2)), rng.uniform(0.9, 1.5), root, scale=(1.4, 0.4, 1.0))
        elif anim == 'easter':
            choc = mat('choc', '#5a2e16', rough=0.3, coat=0.5, spec=0.6)
            choc2 = mat('choc2', '#6e3a1c', rough=0.28, coat=0.6, spec=0.6)
            box('bar', choc, (48.0, 6.0, 10.0), loc=(-6.0, 0, 0), parent=root, bevel=0.7)
            for i in range(7):
                for j in range(2):
                    box('sq%d%d' % (i, j), choc2, (5.6, 1.4, 3.9), loc=(-27.0 + 6.6 * i, -3.2, -2.3 + 4.6 * j),
                        parent=root, bevel=0.6, seg=2)
            paper = mat('paper', '#9a5ad8', rough=0.45, coat=0.3)
            foil = mat('foil', '#e8e0f0', rough=0.18, metal=1.0)
            box('wrap', paper, (14.0, 7.6, 11.6), loc=(24.6, 0, 0), parent=root, bevel=0.5)
            box('foil', foil, (2.0, 7.0, 11.0), loc=(17.0, 0, 0), parent=root, bevel=0.3)
            stripe = mat('pst', '#ffd84a', rough=0.4)
            box('wst', stripe, (14.1, 7.8, 2.0), loc=(24.6, 0, 0), parent=root, bevel=0.2)
            for k, (x, z, r) in enumerate([(-30.0, 3.5, 1.8), (-30.5, -1.0, 1.4)]):
                sph('bite%d' % k, choc2, (x, 0, z), r, root, scale=(0.6, 1.0, 1.0))
        elif anim == 'val':
            wood = mat('lat', '#f2ece2', rough=0.5, coat=0.2)
            box('railT', wood, (62, 2.4, 2.0), loc=(0, 0, 4.4), parent=root, bevel=0.3)
            box('railB', wood, (62, 2.4, 2.0), loc=(0, 0, -4.4), parent=root, bevel=0.3)
            for k in range(13):
                x0 = -30 + 5 * k
                for s in (-1, 1):
                    tube('lt%d%d' % (k, s), [(x0, 0.4, -4.4 * s), (x0 + 5, 0.4, 4.4 * s)], (0.55, 0.3), wood, parent=root,
                         seg=4, smooth=False)
            vine = mat('vine', '#2f6a22', rough=0.55)
            pts = [(x, -1.6 - 0.9 * math.sin(x * 0.45), 2.6 * math.cos(x * 0.45)) for x in np.linspace(-31, 31, 90)]
            tube('vine', pts, 0.55, vine, parent=root, seg=6)
            leafm = mat('leafm', '#3e8a2a', rough=0.45, coat=0.2)
            for k in range(18):
                x = -29 + 3.4 * k + rng.uniform(-0.8, 0.8)
                zc = 2.6 * math.cos(x * 0.45)
                g = empty('lfp%d' % k, (x, -2.6, zc), root)
                sph('lf%d' % k, leafm, (0, 0, 1.2 * (1 if k % 2 else -1)), 1.0, g, scale=(0.7, 0.3, 1.4), seg=10, rings=6)
                g.rotation_euler.y = rad(rng.uniform(-50, 50))
            rose = [mat('ro0', '#d81a3a', rough=0.45, coat=0.3), mat('ro1', '#9a0a24', rough=0.5)]
            for k, x in enumerate((-24.0, -11.0, 2.5, 15.0, 27.0)):
                zc = 2.6 * math.cos(x * 0.45) * 0.6
                g = empty('rose%d' % k, (x, -3.6, zc), root)
                g.rotation_euler = (rad(-70), 0, rad(rng.uniform(0, 90)))
                sph('rb%d' % k, rose[0], (0, 0, 0), 2.4, g, scale=(1, 1, 0.75))
                for j in range(3):
                    torus('rp%d%d' % (k, j), rose[j % 2], (0.25 * j, 0, 0.9 + 0.25 * j), 1.9 - 0.55 * j, 0.42, parent=g,
                          scale=(1, 1, 0.8))
                sph('rc%d' % k, rose[1], (0.3, 0, 1.6), 0.6, g)
        elif anim == 'thanks':
            wood = tex_mat('rail', '#7a5a3a', '#a07c56', scale=(3, 30, 30), rough=0.7, noise=7.0)
            pts = [(x, 0.0, 3.0 + 0.3 * math.sin(x * 0.2)) for x in np.linspace(-31, 31, 9)]
            tube('rail', pts, [(2.3, 3.0)] * 9, wood, parent=root, seg=7, smooth=False)
            husk = tex_mat('husk', '#c8b078', '#f2e2b4', scale=(30, 30, 3), rough=0.6, noise=4.0)
            kern = tex_mat('kern', '#e0900c', '#ffd44a', scale=(1, 1, 1), noise=140, rough=0.35, coat=0.3)
            kern2 = tex_mat('kern2', '#a8341a', '#f0a030', scale=(1, 1, 1), noise=140, rough=0.35, coat=0.3)
            twine = mat('twine', '#6a4a2a', rough=0.7)
            for b, bx in enumerate((-15.0, 14.0)):
                torus('tie%d' % b, twine, (bx, 0, 3.0), 2.7, 0.55, rot=(0, math.pi / 2, 0), parent=root,
                      scale=(1, 1.15, 1))
                for k, ang in enumerate((-16, 0, 14)):
                    g = empty('cb%d%d' % (b, k), (bx + (k - 1) * 2.6, -2.6 - 0.5 * (k == 1), 3.0), root)
                    g.rotation_euler.y = rad(180 + ang)
                    sph('cob%d%d' % (b, k), kern if (k + b) % 2 == 0 else kern2, (0, 0, 5.2), 1.3, g,
                        scale=(1, 1, 3.4), seg=12, rings=10)
                    # husks pulled back up over the rail
                    for j, s in enumerate((-1, 1)):
                        tube('hk%d%d%d' % (b, k, j), [(s * 0.6, -0.2, 2.0), (s * 1.4, -0.5, -0.2), (s * 2.4, -0.4, -2.8)],
                             [(0.9, 0.25), (0.8, 0.22), (0.15, 0.1)], husk, parent=g, seg=8)
        elif anim == 'xmas':
            bark = tex_mat('bark', '#4a3626', '#6e5440', scale=(5, 40, 40), rough=0.8, noise=6.0)
            endg = tex_mat('endg', '#d0a878', '#9a7450', scale=(1, 1, 1), noise=40, rough=0.7)
            cyl('log', bark, (0, 0, 0), 4.6, 60.0, rot=(0, math.pi / 2, 0), parent=root, verts=24, cap_mat=endg)
            snow = mat('snow', '#f4f8ff', rough=0.55, sss=0.3, emit=(*hx('#e8f0ff'), 0.25))
            for k in range(14):
                x = -28 + 4.3 * k + rng.uniform(-1, 1)
                sph('sn%d' % k, snow, (x, -0.4, 4.1), rng.uniform(2.6, 3.4), root, scale=(1.6, 1.25, 0.55), seg=14,
                    rings=8)
            ice = mat('ice', '#cfefff', rough=0.04, spec=0.8, coat=0.8, emit=(*hx('#a8dcff'), 0.7))
            for k in range(13):
                x = -28 + 4.6 * k + rng.uniform(-1.2, 1.2)
                L_ = rng.uniform(2.5, 6.5) if k % 3 else rng.uniform(5.0, 7.0)
                tube('ic%d' % k, [(x, -1.5, -3.6), (x + 0.2, -1.5, -3.6 - L_ * 0.5), (x + 0.1, -1.5, -3.6 - L_)],
                     [1.0, 0.55, 0.08], ice, parent=root, seg=10)
            holly = mat('holly', '#1a6a32', rough=0.35, coat=0.4)
            berry = mat('berry', '#e01a2a', rough=0.2, coat=0.8)
            for s in (-1, 1):
                g = empty('hl%d' % s, (9.0, -4.0, 3.0), root); g.rotation_euler = (rad(-60), rad(s * 50), 0)
                sph('hlf%d' % s, holly, (0, 0, 1.8), 1.0, g, scale=(1.0, 0.35, 2.0))
            for k, (dx, dz) in enumerate([(-0.8, 3.4), (0.6, 3.6), (0.0, 2.6)]):
                sph('be%d' % k, berry, (9.0 + dx, -5.0, dz), 0.75, root, seg=10, rings=6)
        root.rotation_euler.x = rad(10)
        sheet.add(anim)
    sheet.save(); O.preview(sheet, 'beams'); frames_preview(sheet, 'beams_f', cols=1, scale=6)


# ---- 7. bell -------------------------------------------------------------------------------------------------
def build_bell():
    sheet = L.Sheet('bell', 24, 32, 12, 4)
    new_scene(64)
    root = empty('root')
    brass = mat('brass', '#e0a838', rough=0.2, metal=1.0, coat=0.2, emit=(*hx('#e0a838'), 0.3))
    brass_in = mat('brassin', '#5a3a14', rough=0.4, metal=0.8)
    steel = mat('steel', '#7e8092', rough=0.32, metal=0.55, coat=0.3)
    # fixed bracket the bell hangs from
    box('plate', steel, (6.0, 3.0, 1.6), loc=(0, 0, 1.6), parent=root, bevel=0.4)
    torus('eye', steel, (0, 0, 0.0), 1.1, 0.45, rot=(math.pi / 2, 0, 0), parent=root)
    piv = empty('piv', (0, 0, 0), root)
    chain('ch', (0, 0, -0.6), (0, 0, -6.4), steel, piv, link_len=3.0, link_w=1.9, wire=0.48)
    bt = -7.2
    prof = [(0.01, 0.0), (2.6, -0.2), (3.5, -1.5), (3.9, -4.0), (4.2, -7.0), (5.0, -9.5), (6.2, -11.4), (6.7, -12.6),
            (6.5, -13.2), (5.9, -12.9), (4.9, -11.4), (3.8, -8.0), (3.3, -4.0), (2.6, -1.6), (0.01, -1.2)]
    body = empty('bellb', (0, 0, bt), piv)
    lathe('bell', [(r, z) for r, z in prof], [brass, brass_in], inner_from=9, parent=body, seg=48)
    torus('crown', brass, (0, 0, 0.9), 1.3, 0.5, rot=(math.pi / 2, 0, 0), parent=body)
    torus('b1', brass, (0, 0, -3.0), 3.75, 0.32, parent=body)
    torus('b2', brass, (0, 0, -11.0), 5.75, 0.32, parent=body)
    clap = empty('clap', (0, 0, -1.6), body)
    tube('cr', [(0, 0, 0), (0, 0, -11.2)], 0.4, steel, parent=clap, seg=8)
    sph('cball', steel, (0, 0, -12.2), 1.35, clap, seg=14, rings=10)
    root.rotation_euler.x = rad(8)
    piv.rotation_euler.y = 0
    sheet.add('still')
    for f, (a, c) in enumerate([(-13, 9), (0, -7), (13, -9), (0, 7)]):
        piv.rotation_euler.y = rad(a)
        clap.rotation_euler.y = rad(c)
        sheet.add('ring')
    sheet.save(); O.preview(sheet, 'bell'); frames_preview(sheet, 'bell_f', cols=5, scale=8)


# ---- 8. gate -------------------------------------------------------------------------------------------------
def build_gate():
    sheet = L.Sheet('gate', 32, 56, 16, 54)
    new_scene(64)
    root = empty('root')
    g = empty('gate', (0, 0, 0), root)
    iron = mat('iron', '#56546a', rough=0.32, metal=0.55, coat=0.3)
    iron2 = mat('iron2', '#66647a', rough=0.32, metal=0.55, coat=0.3)
    rivet = mat('rivet', '#9aa0b0', rough=0.22, metal=1.0)
    for k, x in enumerate((-12.0, -6.0, 0.0, 6.0, 12.0)):
        cyl('bar%d' % k, iron, (x, 0, 4.0 + 23.0), 1.25, 46.0, parent=g, verts=16)
        tube('spk%d' % k, [(x, 0, 4.4), (x, 0, 2.2), (x, 0, 0.0)], [1.45, 0.8, 0.08], iron, parent=g, seg=12)
        torus('coll%d' % k, iron2, (x, 0, 5.0), 1.35, 0.4, parent=g)
    for z in (13.0, 29.0, 44.0):
        box('cb%d' % z, iron2, (29.0, 2.0, 2.8), loc=(0, -1.6, z), parent=g, bevel=0.4)
        for x in (-12.0, -6.0, 0.0, 6.0, 12.0):
            sph('rv%d%d' % (z, x), rivet, (x, -2.8, z), 0.6, g, seg=8, rings=5)
    box('head', iron2, (30.0, 3.2, 3.4), loc=(0, -0.6, 51.0), parent=g, bevel=0.5)
    runem = black_iron('runep', '#24232c', 0.3)
    add_decal(runem, O.rune_canvas('#9cff5a'), 0, 0, rough=0.3, emit=4.5, name='rune')
    for x, z in ((0.0, 29.0),):
        box('rp', runem, (8.0, 1.2, 8.0), loc=(x, -2.8, z), rot=(0, rad(45), 0), parent=g, bevel=0.4)
    rune2 = black_iron('runes', '#24232c', 0.3)
    small = Canvas(4, 4, base='#9cff5a'); small.fill(small.poly([(0, 1.6), (1.2, 0), (0, -1.6), (-1.2, 0)]) &
                                                     ~small.circ(0, 0, 0.6), '#9cff5a')
    add_decal(rune2, small, 0, 0, rough=0.3, emit=3.0, name='rune2')
    for x in (-9.0, 9.0):
        for z in (13.0, 44.0):
            box('rs%d%d' % (x, z), rune2, (3.6, 0.8, 3.6), loc=(x, -2.9, z), parent=g, bevel=0.3)
    plight('runel', (0, -7.0, 29.0), 6.0, '#9cff5a', 3.0, g)
    plight('runel2', (0, -6.0, 8.0), 3.0, '#9cff5a', 4.0, g)
    glow = mat('inlay', '#7cff4a', emit=(*hx('#8cff5a'), 3.0))
    for z in (13.0, 29.0, 44.0):
        for x0 in (-12.0, -6.0, 0.0, 6.0):
            if z == 29.0 and x0 in (-6.0, 0.0): continue
            box('inl%d%d' % (z, x0), glow, (3.4, 0.5, 0.6), loc=(x0 + 3.0, -2.65, z), parent=g, bevel=0.1)
    root.rotation_euler.x = rad(6)
    sheet.add('shut')
    for f, rise in enumerate((12.0, 24.0, 37.0, 49.0)):
        g.location.z = rise * PX
        sheet.add('open')
    sheet.save(); O.preview(sheet, 'gate'); frames_preview(sheet, 'gate_f', cols=5, scale=5)


SHEETS = {'bigcannon': build_bigcannon, 'ridepot': build_ridepot, 'splash': build_splash, 'mounts': build_mounts,
          'obstacles': build_obstacles, 'beams': build_beams, 'bell': build_bell, 'gate': build_gate}

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--prev' in argv:
        i = argv.index('--prev'); PREV = argv[i + 1]; os.makedirs(PREV, exist_ok=True); del argv[i:i + 2]
        O.PREV = PREV
    names = argv or list(SHEETS)
    t0 = time.time()
    for n in names:
        t = time.time(); SHEETS[n](); print('[%s] %.1fs' % (n, time.time() - t))
    print('total %.1fs' % (time.time() - t0))
