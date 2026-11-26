"""build_witches.py: pre-rendered 3D sprite sheets for the two player witches, Mags and Pip.

Run headless:
    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup --python build_witches.py
Optional env vars: WITCH_CHARS=mags,pip  WITCH_ANIMS=idle,walk  WITCH_PREVIEW=<dir for preview pngs>

Each witch is a small rigid-part puppet: every mesh is modelled in "rest space" (standing pose, game pixels,
feet centre at the origin, facing +X, Z up) and hangs off a joint. A pose is a dict of joint angles; apply()
turns it into joint matrices (pelvis, torso, head, hat, arms, legs with 2-bone IK for planted feet) and writes
each part's matrix_world. Tubes (hat crowns, braid) are re-swept per frame so hats can bend and trail.
Writes art/mags.png/json and art/pip.png/json through spritelib.Sheet.
"""
import sys, os, math, time, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix, Vector
import numpy as np
import spritelib as L

PX = L.PX
PREV = os.environ.get('WITCH_PREVIEW', '')
ONLY = [a for a in os.environ.get('WITCH_ANIMS', '').split(',') if a]
CHARS = [c for c in os.environ.get('WITCH_CHARS', 'mags,pip').split(',') if c]

ANIMS = [('idle', 4), ('walk', 8), ('run', 8), ('carryWalk', 8), ('skid', 1), ('jump', 1), ('carryJump', 1),
         ('fall', 2), ('float', 2), ('roll', 8), ('blast', 8), ('carryIdle', 2), ('throw', 1), ('slap', 3),
         ('hurt', 2), ('dead', 2), ('victory', 2), ('cart', 2), ('flee', 1), ('ride', 6), ('rideDash', 2),
         ('rideBack', 6)]


# ---- matrix helpers (angles in degrees, lengths in game pixels) ------------------------------------------------
def T(x, y=0.0, z=0.0):
    if not isinstance(x, (int, float)): x, y, z = x
    return Matrix.Translation((x, y, z))
def Rx(d): return Matrix.Rotation(math.radians(d), 4, 'X')
def Ry(d): return Matrix.Rotation(math.radians(d), 4, 'Y')
def Rz(d): return Matrix.Rotation(math.radians(d), 4, 'Z')
def about(p, M): return T(p) @ M @ T(-p[0], -p[1], -p[2])
def V(*a): return Vector(a)


def hexlin(h):
    h = h.lstrip('#'); return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


# ---- materials -------------------------------------------------------------------------------------------------
def stripe_mat(name, c1, c2, period, rough=0.75, axis='Z'):
    """Stockings: hard stripes along the object's local axis (meshes are modelled in px, so period is in px)."""
    m = L.mat(name, c1, rough=rough, spec=0.35)
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1.0 / period
    nt.links.new(sep.outputs[axis], mul.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(mul.outputs[0], fr.inputs[0])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
    nt.links.new(fr.outputs[0], gt.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    ins = [s for s in mix.inputs if s.type == 'RGBA']
    ins[0].default_value = (*hexlin(c1), 1); ins[1].default_value = (*hexlin(c2), 1)
    nt.links.new(gt.outputs[0], mix.inputs[0])
    out = [s for s in mix.outputs if s.type == 'RGBA'][0]
    nt.links.new(out, b.inputs['Base Color'])
    return m


def straw_mat(name):
    """Broom bristles: streaky straw, noise stretched along the bristle length (local X)."""
    m = L.mat(name, '#d8a54a', rough=0.7, spec=0.4)
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.15, 2.2, 2.2)
    nt.links.new(tc.outputs['Object'], mp.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.6
    nt.links.new(mp.outputs[0], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.38; ramp.color_ramp.elements[0].color = (*hexlin('#a8742a'), 1)
    ramp.color_ramp.elements[1].position = 0.62; ramp.color_ramp.elements[1].color = (*hexlin('#f0c868'), 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    return m


# ---- mesh building -------------------------------------------------------------------------------------------
class MB:
    """Accumulates primitives into one bmesh (coordinates in rest-space px), then becomes one object."""

    def __init__(self): self.bm = bmesh.new()

    def sphere(self, c, r, rot=None, seg=24, rings=14):
        rx, ry, rz = (r, r, r) if isinstance(r, (int, float)) else r
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0)['verts']
        M = T(c) @ (rot if rot is not None else Matrix()) @ Matrix.Diagonal((rx, ry, rz, 1))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        return self

    def capsule(self, a, b, r0, r1, seg=18, rings=12):
        """Tapered capsule from point a (radius r0) to point b (radius r1)."""
        a, b = Vector(a), Vector(b); d = a - b; Ln = d.length
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0)['verts']
        for v in vs:
            x, y, z = v.co
            v.co = (x * r0, y * r0, Ln + z * r0) if z >= 0 else (x * r1, y * r1, z * r1)
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=T(b) @ rot, verts=vs)
        return self

    def lathe(self, prof, seg=32, ysc=1.0, M=None, closed=False):
        """Surface of revolution about local Z from (r, z) profile points; r==0 makes a pole."""
        bm = self.bm; rings = []
        for r, z in prof:
            if r < 1e-4: rings.append([bm.verts.new((0, 0, z))])
            else: rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / seg), ysc * r * math.sin(2 * math.pi * j / seg), z)) for j in range(seg)])
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
        for A, B in pairs:
            if len(A) == 1 and len(B) == 1: continue
            if len(A) == 1:
                for j in range(seg): bm.faces.new((A[0], B[j], B[(j + 1) % seg]))
            elif len(B) == 1:
                for j in range(seg): bm.faces.new((A[j], A[(j + 1) % seg], B[0]))
            else:
                for j in range(seg): bm.faces.new((A[j], A[(j + 1) % seg], B[(j + 1) % seg], B[j]))
        allv = [v for rg in rings for v in rg]
        if M is not None: bmesh.ops.transform(bm, matrix=M, verts=allv)
        return self

    def box(self, c, size, rot=None):
        vs = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        M = T(c) @ (rot if rot is not None else Matrix()) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        return self

    def obj(self, name, material, smooth=True):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name); self.bm.to_mesh(me); self.bm.free()
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
        me.materials.append(material)
        for p in me.polygons: p.use_smooth = smooth
        return o


def catmull(pts, n):
    P = [Vector(p) for p in pts]
    P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    segs = len(pts) - 1; out = []
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out


class Tube:
    """Swept tube with fixed topology; update() re-sweeps it along new control points (rest-space px)."""

    def __init__(self, name, material, rings=24, sides=20):
        self.n, self.m = rings, sides
        verts = [(0, 0, 0)] * (rings * sides + 2)
        faces = []
        for i in range(rings - 1):
            for j in range(sides):
                faces.append((i * sides + j, i * sides + (j + 1) % sides, (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
        s0, s1 = rings * sides, rings * sides + 1
        for j in range(sides):
            faces.append((s0, (j + 1) % sides, j))
            faces.append(((rings - 1) * sides + j, (rings - 1) * sides + (j + 1) % sides, s1))
        me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
        me.materials.append(material)
        for p in me.polygons: p.use_smooth = True
        self.me = me
        self.o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(self.o)
        self.frames = []

    def update(self, ctrl, radius, ysc=1.0, cap=0.6):
        """ctrl: control points; radius: f(t) -> r. ysc squashes the cross-section along the side normal."""
        pts = catmull(ctrl, self.n)
        tans = [(pts[min(i + 1, self.n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(self.n)]
        ref = Vector((0, 1, 0))
        if abs(tans[0].dot(ref)) > 0.9: ref = Vector((1, 0, 0))
        N = (ref - ref.dot(tans[0]) * tans[0]).normalized()
        co = []; self.frames = []
        for i in range(self.n):
            t = tans[i]
            N = (N - N.dot(t) * t).normalized(); B = t.cross(N)
            r = radius(i / (self.n - 1))
            self.frames.append((pts[i], t, N, B, r))
            for j in range(self.m):
                a = 2 * math.pi * j / self.m
                co.append(pts[i] + r * (math.cos(a) * N * ysc + math.sin(a) * B))
        co.append(pts[0] - tans[0] * radius(0) * 0.05)
        co.append(pts[-1] + tans[-1] * max(radius(1) * cap, 0.15))
        self.me.vertices.foreach_set('co', [c for v in co for c in v])
        self.me.update()

    def frame_at(self, t):
        return self.frames[min(self.n - 1, max(0, int(round(t * (self.n - 1)))))]


def lerp_list(vals):
    def f(t):
        x = t * (len(vals) - 1); k = min(int(x), len(vals) - 2); u = x - k
        return vals[k] * (1 - u) + vals[k + 1] * u
    return f


def face_frame(c, radii, az, el, inset=0.0):
    """Point on a head ellipsoid (centre c, radii) at azimuth/elevation (deg), as a matrix: X = outward normal, Z ~ up."""
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    p = Vector(c) + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2]))
    n = Vector((d.x / radii[0], d.y / radii[1], d.z / radii[2])).normalized()
    p -= n * inset
    up = Vector((0, 0, 1)); y = up.cross(n).normalized(); z = n.cross(y)
    M = Matrix((n, y, z)).transposed().to_4x4(); M.translation = p
    return M


# ---- the witches -----------------------------------------------------------------------------------------------
MAGS = dict(
    name='mags', big=True,
    hipZ=8.5, hy=2.0, Lt=3.7, Ls=3.5, ankleH=1.7, legR=(1.5, 1.3),
    sh=(0.5, 6.5, 15.4), La=3.8, Lf=3.4, armR=(1.6, 1.3), handR=1.6,
    head=(0.8, 0, 20.9), headR=(4.9, 4.7, 5.0), neck=(0.3, 0, 17.2), headYaw=-18,
    hatBase=(0.3, 0, 23.9), stride=1.0, seat=-1.8, ballC=10.0, bodyC=12.0,
    col=dict(skin='#9ec777', skin2='#7aa85a', hair='#e3642c', dress='#6b3fa3', apron='#cdb68c', patch='#a8553e',
             patch2='#6f86b8', band='#eba53e', hat='#40306a', hatpatch='#6a9a3e', sockA='#8a58c0', sockB='#2a1f36',
             boot='#5e3c27', brow='#4a2414', mouth='#3a1220'),
)
PIP = dict(
    name='pip', big=False,
    hipZ=5.6, hy=1.4, Lt=2.5, Ls=2.4, ankleH=1.25, legR=(1.0, 0.9),
    sh=(0.3, 4.0, 9.4), La=2.3, Lf=2.1, armR=(1.1, 0.92), handR=1.12,
    head=(0.5, 0, 14.4), headR=(4.65, 4.45, 4.65), neck=(0.2, 0, 10.8), headYaw=-18,
    hatBase=(0.0, 0, 17.9), stride=0.75, seat=-0.3, ballC=7.0, bodyC=8.0,
    col=dict(skin='#f3c49d', hair='#f3d46c', bow='#e8608e', dress='#2fa39a', collar='#f2e6c4', band='#d85c80',
             hat='#2e3c74', sockA='#f3d46c', sockB='#2c1e34', boot='#83402c', brow='#8a5a2a', mouth='#5a1e2a',
             freckle='#c87850', cheek='#f39a8c'),
)


class Witch:
    def __init__(self, C):
        self.C = C; c = C['col']; big = C['big']
        self.parts = []      # (object, joint, local matrix)
        mt = {}
        mt['skin'] = L.mat('skin', c['skin'], rough=0.42, sss=0.12, spec=0.55)
        mt['hair'] = L.mat('hair', c['hair'], rough=0.55, spec=0.45, sss=0.05)
        mt['dress'] = L.mat('dress', c['dress'], rough=0.78, spec=0.3)
        mt['hat'] = L.mat('hat', c['hat'], rough=0.62, spec=0.4)
        mt['band'] = L.mat('band', c['band'], rough=0.22, metal=0.25, spec=0.8, coat=0.5)
        mt['boot'] = L.mat('boot', c['boot'], rough=0.26, spec=0.7, coat=0.7)
        mt['sock'] = stripe_mat('sock', c['sockA'], c['sockB'], 2.4 if big else 1.9)
        mt['white'] = L.mat('eyew', '#f6f2e8', rough=0.25, spec=0.6)
        mt['pupil'] = L.mat('pupil', '#120c18', rough=0.12, spec=0.9)
        mt['catch'] = L.mat('catch', '#ffffff', emit=(1, 1, 1, 6.0))
        mt['ink'] = L.mat('ink', '#1a1020', rough=0.4)
        mt['brow'] = L.mat('brow', c['brow'], rough=0.6)
        mt['mouth'] = L.mat('mouth', c['mouth'], rough=0.35, spec=0.6)
        mt['teeth'] = L.mat('teeth', '#f4ecd8', rough=0.3)
        mt['wood'] = L.mat('wood', '#a06a3a', rough=0.35, spec=0.6, coat=0.4)
        mt['straw'] = straw_mat('straw')
        mt['tie'] = L.mat('tie', '#c0392e', rough=0.3, spec=0.6, coat=0.4)
        mt['under'] = L.mat('under', c.get('collar', '#f2e6c4'), rough=0.72, spec=0.35)
        self.mt = mt
        self.build_legs(); self.build_arms(); self.build_head(); self.build_hat(); self.build_broom()
        if big: self.build_mags_body()
        else: self.build_pip_body()
        for o in bpy.context.scene.objects:   # hat and hair cast no shadow, so faces stay lit under big brims
            if o.name in ('brim', 'band', 'crown', 'hatpatch', 'stitch', 'hattip', 'hair'): o.visible_shadow = False

    def add(self, o, joint, local=None, tag=None):
        self.parts.append([o, joint, local if local is not None else Matrix(), tag])
        return o

    # -- limbs
    def build_legs(self):
        C = self.C; hz, Lt, Ls = C['hipZ'], C['Lt'], C['Ls']; r0, r1 = C['legR']; big = C['big']
        for side, s in (('N', -1), ('F', 1)):
            y = s * C['hy']
            hip, knee, ank = V(0, y, hz), V(0, y, hz - Lt), V(0, y, hz - Lt - Ls)
            self.add(MB().capsule(hip + V(0, 0, 1.0), knee, r0 * 1.05, r0 * 0.95).obj('thigh' + side, self.mt['sock']), 'thigh' + side, tag='legs')
            self.add(MB().capsule(knee, ank + V(0, 0, 0.3), r0 * 0.95, r1).obj('shin' + side, self.mt['sock']), 'shin' + side, tag='legs')
            a = ank; h = C['ankleH']
            mb = MB()
            if big:   # chunky pointy witch boot with a curled toe
                mb.sphere(a + V(0.6, 0, -h + 1.35), (2.4, 1.5, 1.38))
                mb.capsule(a + V(0, 0, 0.3), a + V(0.1, 0, -0.6), 1.55, 1.6)
                pts = catmull([a + V(1.6, 0, -h + 1.25), a + V(3.3, 0, -h + 1.0), a + V(4.6, 0, -h + 1.5), a + V(5.2, 0, -h + 2.5)], 10)
                for i in range(len(pts) - 1):
                    t = i / (len(pts) - 1)
                    mb.capsule(pts[i], pts[i + 1], 1.05 * (1 - t) + 0.22 * t, 1.05 * (1 - t - 1 / 9) + 0.22 * (t + 1 / 9), seg=12, rings=8)
                mb.lathe([(1.75, -0.1), (1.85, 0.45), (1.7, 0.75)], seg=20, M=T(a + V(0, 0, 0.35)), closed=True)
            else:     # little rounded boot
                mb.sphere(a + V(0.55, 0, -h + 1.05), (1.75, 1.08, 1.05))
                mb.sphere(a + V(1.5, 0, -h + 0.95), (0.95, 0.95, 0.85))
                mb.capsule(a + V(0, 0, 0.45), a + V(0.1, 0, -0.4), 1.12, 1.15)
            self.add(mb.obj('boot' + side, self.mt['boot']), 'foot' + side, tag='legs')
            self.rest_leg = dict(hz=hz)

    def build_arms(self):
        C = self.C; sx, sy, sz = C['sh']; La, Lf = C['La'], C['Lf']; r0, r1 = C['armR']; big = C['big']
        for side, s in (('N', -1), ('F', 1)):
            sh = V(sx, s * sy, sz); el = sh - V(0, 0, La); wr = el - V(0, 0, Lf)
            # puffed short sleeve ending in a flared cuff at the elbow, then a contrasting forearm (bare green
            # skin for Mags, a cream undersleeve for Pip) so arm poses read against the body at 1x
            mb = MB().capsule(sh, el + V(0, 0, 0.4), r0, r0 * 0.95).sphere(sh + V(0, 0, -0.6), r0 * 1.25)
            mb.lathe([(r0 * 0.9, 0.5), (r0 * 1.22, 0.0), (r0 * 1.12, -0.35), (r0 * 0.8, -0.1)], seg=18, M=T(el + V(0, 0, 0.15)), closed=True)
            self.add(mb.obj('uarm' + side, self.mt['dress']), 'uarm' + side)
            mb = MB().capsule(el + V(0, 0, 0.3), wr + V(0, 0, 0.4), r1 * 1.02, r1 * 0.9)
            if not big:
                mb.lathe([(r1 * 0.85, 0.25), (r1 * 1.12, 0.0), (r1 * 1.05, -0.3), (r1 * 0.8, -0.1)], seg=16, M=T(wr + V(0, 0, 0.5)), closed=True)
            self.add(mb.obj('farm' + side, self.mt['skin'] if big else self.mt['under']), 'farm' + side)
            hr = C['handR']
            mb = MB().sphere(wr + V(0.15, 0, -hr * 0.55), (hr * 0.95, hr * 0.8, hr))
            mb.sphere(wr + V(0.75, s * -0.1, -hr * 0.25), hr * 0.42)  # thumb
            self.add(mb.obj('hand' + side, self.mt['skin']), 'farm' + side)

    # -- head, face, hair
    def build_head(self):
        C = self.C; c = C['col']; big = C['big']; hc, hr = V(*C['head']), C['headR']
        mb = MB().sphere(hc, hr, seg=32, rings=20)
        if big:
            mb.sphere(hc + V(3.0, -0.2, -3.4), (1.8, 2.0, 1.6))            # jutting chin
            mb.sphere(hc + V(1.3, -3.4, -1.3), (1.9, 1.1, 1.7)); mb.sphere(hc + V(1.3, 3.4, -1.3), (1.9, 1.1, 1.7))  # cheeks
        else:
            mb.sphere(hc + V(1.4, 0, -2.3), (2.6, 3.2, 1.9))                 # round chin/cheeks
        self.add(mb.obj('head', self.mt['skin']), 'head')
        self.add(MB().sphere(hc + V(-0.2, 0, -4.0), (1.6, 1.6, 2.0)).obj('neck', self.mt['skin']), 'head')

        # nose
        if big:
            nose = Tube('nose', self.mt['skin'], rings=14, sides=16)
            base = hc + V(4.2, -0.4, 0.1)
            nose.update([base, base + V(1.8, -0.1, 0.1), base + V(3.4, -0.2, -0.6), base + V(4.3, -0.25, -1.9), base + V(4.5, -0.3, -2.6)],
                        lerp_list([1.35, 1.1, 0.85, 0.7, 0.55]), cap=0.9)
            self.add(nose.o, 'head')
            wart = L.mat('wart', c['skin2'], rough=0.5, sss=0.1)
            self.add(MB().sphere(base + V(2.3, -0.95, 0.65), 0.55).obj('wart', wart), 'head')
        else:
            self.add(MB().sphere(hc + V(4.6, -0.3, -0.7), (0.9, 0.85, 0.75)).obj('nose', self.mt['skin']), 'head')

        # eyes: sclera + pupil + catchlight, plus alt shapes (blink line, happy arc, X)
        eaz = 24 if big else 30; eel = 12 if big else 6
        ew, eh = (1.2, 1.6) if big else (1.2, 1.55)
        self.eyes = {'open': [], 'blink': [], 'happy': [], 'x': []}
        for k, s in (('N', -1), ('F', 1)):
            F = face_frame(hc, hr, s * eaz, eel, inset=0.25)
            n = F.col[0].xyz; yv = F.col[1].xyz; zv = F.col[2].xyz; p = F.translation.copy()
            sclera = MB().sphere((0, 0, 0), (0.55, ew, eh), seg=20, rings=12).obj('sclera' + k, self.mt['white'])
            self.add(sclera, 'head', F); self.eyes['open'].append(sclera)
            fwd = Vector((1, 0, 0)); tang = (fwd - fwd.dot(n) * n)
            pc = p + n * 0.32 + tang * 0.42 * ew - zv * 0.1
            Fp = F.copy(); Fp.translation = pc
            pup = MB().sphere((0, 0, 0), (0.45, ew * 0.62, eh * 0.68), seg=16, rings=10).obj('pupil' + k, self.mt['pupil'])
            self.add(pup, 'head', Fp); self.eyes['open'].append(pup)
            Fc = F.copy(); Fc.translation = pc + n * 0.35 + zv * eh * 0.3 + yv * (0.2 if s < 0 else -0.2) - tang * 0.15
            cat = MB().sphere((0, 0, 0), 0.34, seg=10, rings=6).obj('catch' + k, self.mt['catch'])
            self.add(cat, 'head', Fc); self.eyes['open'].append(cat)
            # closed-eye arcs, in face-frame coords (Y = across, Z = up)
            for nm, sag in (('blink', -0.45), ('happy', 0.6)):
                tb = Tube(nm + k, self.mt['ink'], rings=8, sides=8)
                pts = [p + n * 0.1 + yv * (u * ew * 1.05) + zv * (sag * (1 - u * u) - 0.1) for u in (-1, -0.5, 0, 0.5, 1)]
                tb.update(pts, lambda t: 0.34, cap=0.8)
                self.add(tb.o, 'head'); self.eyes[nm].append(tb.o)
            for dd in (1, -1):
                xo = MB().capsule(p + n * 0.1 + yv * (-0.85 * ew) + zv * (dd * 0.9 * eh * 0.8), p + n * 0.1 + yv * (0.85 * ew) + zv * (-dd * 0.9 * eh * 0.8), 0.33, 0.33, seg=10, rings=6).obj('x' + k, self.mt['ink'])
                self.add(xo, 'head'); self.eyes['x'].append(xo)
            # brow: a chunky dash over the eye, inner end toward the nose
            bc = p + n * 0.25 + zv * (eh + 0.75)
            bw = ew * 1.15
            self.brows = getattr(self, 'brows', [])
            bo = MB().capsule(V(0, -bw, 0), V(0, bw, 0), 0.5, 0.45, seg=10, rings=6).obj('brow' + k, self.mt['brow'])
            Fb = F.copy(); Fb.translation = bc
            self.add(bo, 'head', Fb); self.brows.append((bo, Fb, s))
        # mouth shapes
        maz, mel = (-6, -30) if big else (-8, -34)
        Fm = face_frame(hc, hr, maz, mel, inset=0.25)
        n = Fm.col[0].xyz; yv = Fm.col[1].xyz; zv = Fm.col[2].xyz; p = Fm.translation.copy()
        if big:  # Mags' mouth sits on the chin bump; push it out a little
            p = p + n * 0.55; Fm.translation = p
        self.mouths = {}
        sm = Tube('smile', self.mt['mouth'], rings=9, sides=8)
        w = 1.5 if big else 1.25
        sm.update([p + yv * (u * w) + zv * (0.45 * u * u) for u in (-1, -0.5, 0, 0.5, 1)], lambda t: 0.36, cap=0.8)
        self.mouths['smile'] = [self.add(sm.o, 'head')]
        g = MB().sphere((0.0, 0, 0), (0.55, w * 1.25, 0.95 if big else 0.85), seg=20, rings=12)
        gm = g.obj('grin', self.mt['mouth']); Fg = Fm.copy(); Fg.translation = p - zv * 0.15
        teeth = MB().sphere((0, 0, 0), (0.5, w * 1.05, 0.32), seg=16, rings=8).obj('teeth', self.mt['teeth'])
        Ft = Fm.copy(); Ft.translation = p + n * 0.22 + zv * 0.38
        self.mouths['grin'] = [self.add(gm, 'head', Fg), self.add(teeth, 'head', Ft)]
        o = MB().sphere((0, 0, 0), (0.55, 0.85, 1.05) if big else (0.55, 0.8, 0.95), seg=18, rings=10).obj('mouthO', self.mt['mouth'])
        Fo = Fm.copy(); Fo.translation = p - zv * 0.25
        self.mouths['o'] = [self.add(o, 'head', Fo)]

        # hair
        rnd = random.Random(7 if big else 11)
        mb = MB()
        if big:   # frizzy orange bursting out from under the hat, mostly at the sides and back
            for _ in range(90):
                ang = rnd.uniform(70, 290) if rnd.random() < 0.5 else rnd.uniform(95, 265)
                a = math.radians(ang + (0 if rnd.random() < 0.5 else 180))
                ca, sa = math.cos(a), math.sin(a)
                if ca > 0.35: continue                      # keep the face clear
                rad = rnd.uniform(4.4, 6.9)
                z = hc.z + rnd.uniform(-2.4, 2.6) + max(0, -ca) * 0.8
                c0 = hc + V(ca * rad * 0.85 - 0.6, sa * rad, z - hc.z)
                mb.sphere(c0, rnd.uniform(0.85, 1.6), seg=12, rings=8)
            for s in (-1, 1):   # a couple of wild tufts
                mb.sphere(hc + V(-1.0, s * 6.9, 0.6), 1.0, seg=12, rings=8)
                mb.sphere(hc + V(-3.6, s * 5.6, -1.8), 1.1, seg=12, rings=8)
            mb.sphere(hc + V(2.0, -3.0, 2.9), (1.4, 1.2, 0.9), seg=14, rings=9)   # fringe poking out at the front
            mb.sphere(hc + V(2.0, 3.0, 2.9), (1.4, 1.2, 0.9), seg=14, rings=9)
        else:     # blonde bob under the hat: fringe, sides, back
            for az in range(-55, 60, 22):
                F = face_frame(hc, hr, az, 38, inset=0.6)
                mb.sphere(F.translation, (1.2, 1.5, 1.0), rot=F.to_3x3().to_4x4(), seg=14, rings=9)
            for s in (-1, 1):
                for k in range(4):
                    mb.sphere(hc + V(-0.6 - k * 1.05, s * (4.05 - k * 0.15), 1.5 - k * 0.65), (1.6, 1.1, 1.9), seg=14, rings=9)
            mb.sphere(hc + V(-1.5, 0, 0.9), (3.6, 4.4, 3.8), seg=20, rings=12)
        self.add(mb.obj('hair', self.mt['hair']), 'head')
        if not big:
            fr = L.mat('freckle', c['freckle'], rough=0.6); ch = L.mat('cheek', c['cheek'], rough=0.5, sss=0.1)
            mb = MB()
            for az, el in ((-38, -10), (-46, -15), (-52, -8), (-30, -16), (36, -11), (44, -15)):
                mb.sphere(face_frame(hc, hr, az, el, inset=0.2).translation, 0.36, seg=8, rings=6)
            self.add(mb.obj('freckles', fr), 'head')
            mb = MB()
            for s in (-1, 1):
                F = face_frame(hc, hr, s * 44, -18, inset=0.5)
                mb.sphere(F.translation, (0.6, 1.3, 0.9), rot=F.to_3x3().to_4x4(), seg=12, rings=8)
            self.add(mb.obj('cheeks', ch), 'head')
            # braid + bow
            self.braid = Tube('braid', self.mt['hair'], rings=30, sides=14)
            self.add(self.braid.o, 'head')
            bow = L.mat('bow', c['bow'], rough=0.35, spec=0.6, coat=0.3)
            mb = MB().sphere((0, 1.0, 0.2), (0.7, 1.15, 0.8)).sphere((0, -1.0, 0.2), (0.7, 1.15, 0.8)).sphere((0, 0, 0), 0.65)
            mb.capsule((0, 0.3, -0.2), (0.2, 0.7, -1.4), 0.3, 0.25).capsule((0, -0.3, -0.2), (0.2, -0.7, -1.4), 0.3, 0.25)
            self.bow = self.add(mb.obj('bow', bow), 'head')
            self.tuft = self.add(MB().sphere((0, 0, 0), (0.8, 0.8, 1.1)).obj('tuft', self.mt['hair']), 'head')

    # -- hats
    def build_hat(self):
        C = self.C; big = C['big']; b = V(*C['hatBase']); c = C['col']
        if big:
            brim = MB().lathe([(0, 0.3), (3.0, 0.35), (6.0, 0.15), (8.0, -0.15), (8.45, -0.5), (8.0, -0.85), (6.0, -0.5), (3.0, -0.3), (0, -0.3)],
                              seg=40, ysc=0.92, M=T(b))
            self.crown_r = lerp_list([4.9, 3.95, 2.8, 1.9, 1.2, 0.65, 0.38])
            band = MB().lathe([(4.7, 0.05), (5.15, 0.1), (4.85, 1.8), (4.35, 1.75)], seg=36, ysc=0.92, M=T(b), closed=True)
        else:
            brim = MB().lathe([(0, 0.35), (3.5, 0.3), (6.2, -0.25), (8.0, -1.2), (8.25, -1.55), (7.8, -1.6), (6.0, -0.7), (3.5, -0.15), (0, -0.1)],
                              seg=40, ysc=0.9, M=T(b))
            self.crown_r = lerp_list([3.75, 3.25, 2.55, 1.85, 1.3, 0.95, 0.7])
            band = MB().lathe([(3.55, 0.05), (3.95, 0.1), (3.75, 1.35), (3.3, 1.3)], seg=36, ysc=0.9, M=T(b), closed=True)
        self.add(brim.obj('brim', self.mt['hat']), 'hat')
        self.add(band.obj('band', self.mt['band']), 'hat')
        self.crown = Tube('crown', self.mt['hat'], rings=30, sides=28)
        self.add(self.crown.o, 'hat')
        if big:
            hp = L.mat('hatpatch', c['hatpatch'], rough=0.85, spec=0.25)
            self.hatpatch = self.add(MB().box((0, 0, 0), (0.6, 2.2, 2.0), rot=Rx(12)).obj('hatpatch', hp, smooth=False), 'hat')
            st = L.mat('stitch', '#d8cc9a', rough=0.7)
            mb = MB()
            for i in range(3): mb.box((0.15, -0.9 + i * 0.9, 1.15), (0.5, 0.25, 0.5))
            self.stitch = self.add(mb.obj('stitch', st, smooth=False), 'hat')
        else:
            self.tip = self.add(MB().sphere((0, 0, 0), 0.9).obj('hattip', self.mt['band']), 'hat')   # pink pompom tip

    def sweep_hat(self, bend, wob=0.0):
        """Re-sweep the crown: bend 0 = gently crooked, 4+ = flopped right back (trailing)."""
        C = self.C; b = V(*C['hatBase']); k = bend
        if C['big']:
            ctrl = [b + V(0, 0, 0.2), b + V(-0.1, 0.25, 3.8), b + V(-0.7 - 0.35 * k, 0.5, 7.4 - 0.1 * k),
                    b + V(-2.0 - 1.05 * k, 0.3 + wob, 10.4 - 0.45 * k), b + V(-4.3 - 1.6 * k, 0.1 + wob, 12.0 - 1.0 * k),
                    b + V(-6.6 - 1.8 * k, -0.2 + wob, 11.3 - 1.7 * k), b + V(-7.9 - 1.8 * k, -0.4 + wob, 9.8 - 2.0 * k)]
            ctrl = [b + V(q.x, q.y, q.z * 1.07) for q in (c_ - b for c_ in ctrl)]
        else:
            ctrl = [b + V(0, 0, 0.2), b + V(-0.2, 0, 3.2), b + V(-1.3 - 0.4 * k, 0, 5.8 - 0.15 * k),
                    b + V(-3.6 - 0.8 * k, wob, 7.6 - 0.5 * k), b + V(-6.4 - 1.0 * k, wob, 7.3 - 1.1 * k),
                    b + V(-8.6 - 1.0 * k, wob, 5.6 - 1.6 * k), b + V(-9.6 - 0.9 * k, wob, 3.6 - 1.9 * k)]
        self.crown.update(ctrl, self.crown_r, ysc=0.95, cap=0.9)
        if C['big']:
            p, t, N, B, r = self.crown.frame_at(0.36)
            # place the patch on the camera-facing side of the crown (hat space -Y side, rotated by the head yaw)
            side = (-N if N.y > 0 else N)
            n = (side * 0.8 + Vector((0.6, 0, 0))).normalized()
            n = (n - n.dot(t) * t).normalized()
            y = t.cross(n).normalized(); z = t
            M = Matrix((n, y, z)).transposed().to_4x4(); M.translation = p + n * (r - 0.05)
            self.hp_matrix = M
        else:
            p, t, N, B, r = self.crown.frame_at(1.0)
            self.tip_matrix = T(p + t * 0.5)

    def sweep_braid(self, swing):
        hc = V(*self.C['head']); s = swing
        ctrl = [hc + V(-3.0, -1.8, 0.6), hc + V(-4.9, -2.3, -1.5), hc + V(-6.2 - 0.8 * s, -2.5, -3.6 + 0.5 * s),
                hc + V(-7.0 - 1.6 * s, -2.5, -5.6 + 1.2 * s)]
        self.braid.update(ctrl, lambda t: (0.95 - 0.25 * t) * (0.78 + 0.32 * abs(math.sin(t * math.pi * 4.5))), cap=0.5)
        p, t, N, B, r = self.braid.frame_at(1.0)
        y = Vector((0, 1, 0)); x = y.cross(t).normalized() if abs(t.dot(y)) < 0.95 else Vector((1, 0, 0))
        M = Matrix((x, y, x.cross(y))).transposed().to_4x4()
        Mb = M.copy(); Mb.translation = p + t * 0.4; self.bow_matrix = Mb
        Mt = M.copy(); Mt.translation = p + t * 1.6; self.tuft_matrix = Mt

    # -- bodies
    def build_mags_body(self):
        C = self.C; c = C['col']
        mb = MB().lathe([(0, 6.2), (3.6, 6.25), (5.6, 6.7), (7.0, 8.2), (7.65, 10.4), (7.45, 12.6), (6.6, 14.8), (5.1, 16.6), (2.9, 17.9), (0, 18.3)],
                        seg=40, ysc=0.9)
        mb.lathe([(5.5, 6.25), (6.35, 6.6), (6.2, 7.35), (5.4, 7.0)], seg=40, ysc=0.9, closed=True)   # hem roll
        self.add(mb.obj('dress', self.mt['dress']), 'torso')
        apron = L.mat('apron', c['apron'], rough=0.85, spec=0.25)
        mb = MB().sphere((5.55, -0.3, 10.6), (2.6, 4.6, 4.3), seg=28, rings=16)
        mb.sphere((4.75, -0.2, 14.6), (2.2, 2.9, 2.2), seg=20, rings=12)
        self.add(mb.obj('apron', apron), 'torso')
        p1 = L.mat('patch', c['patch'], rough=0.9, spec=0.2); p2 = L.mat('patch2', c['patch2'], rough=0.9, spec=0.2)
        self.add(MB().box((7.72, -1.7, 9.0), (0.6, 2.0, 2.1), rot=Rz(-28) @ Rx(10)).obj('patch', p1, smooth=False), 'torso')
        self.add(MB().box((7.25, -3.2, 11.6), (0.6, 1.4, 1.3), rot=Rz(-42) @ Rx(-14)).obj('patch2', p2, smooth=False), 'torso')
        st = L.mat('stitch2', '#4a3020', rough=0.7)
        mb = MB()
        for i in range(3): mb.box((8.05 - i * 0.12, -1.7 - 0.95 + i * 0.95, 10.15), (0.4, 0.22, 0.45), rot=Rz(-28))
        self.add(mb.obj('stitches', st, smooth=False), 'torso')
        # apron waist tie + rope belt
        self.add(MB().lathe([(7.05, 13.0), (7.25, 13.4), (6.9, 13.85), (6.7, 13.45)], seg=40, ysc=0.9, closed=True).obj('belt', apron), 'torso')

    def build_pip_body(self):
        C = self.C; c = C['col']
        mb = MB().lathe([(0, 3.9), (3.4, 4.0), (4.5, 4.6), (4.75, 5.8), (4.4, 7.6), (3.7, 9.3), (2.7, 10.6), (0, 11.2)], seg=36, ysc=0.84)
        self.add(mb.obj('cloak', self.mt['dress']), 'torso')
        col = L.mat('collar', c['collar'], rough=0.7, spec=0.35)
        mb = MB().lathe([(1.6, 11.5), (3.3, 11.0), (4.15, 10.0), (3.9, 9.6), (2.4, 10.3), (1.4, 10.7)], seg=36, ysc=0.84, closed=True)
        mb.sphere((3.4, -0.6, 9.2), 0.55).sphere((3.5, 0.6, 9.2), 0.55)   # clasp buttons
        self.add(mb.obj('collar', col), 'torso')
        # cloak hem trim
        self.add(MB().lathe([(4.2, 3.95), (4.75, 4.3), (4.7, 4.9), (4.1, 4.5)], seg=36, ysc=0.84, closed=True).obj('trim', col), 'torso')

    def build_broom(self):
        k = 1.0 if self.C['big'] else 0.82
        z = 4.0
        mb = MB().capsule(V(12.5 * k, 0, z + 0.55), V(-10.5 * k, 0, z - 0.1), 0.85, 0.85, seg=14, rings=8)
        mb.sphere(V(12.6 * k, 0, z + 0.6), 0.95)
        self.add(mb.obj('handle', self.mt['wood']), 'broom', tag='broom')
        prof = [(0, 0), (1.0, 0.2), (1.9, 1.6), (2.6, 3.6), (2.9, 5.3), (2.4, 6.3), (1.2, 6.7), (0, 6.75)]
        prof = [(r * k * 1.05, zz * k) for r, zz in prof]
        mb = MB().lathe(prof, seg=28, ysc=0.92, M=T(-10.2 * k, 0, z) @ Ry(-90))
        self.add(mb.obj('bristles', self.mt['straw']), 'broom', tag='broom')
        mb = MB().lathe([(0.95 * k, 0), (1.25 * k, 0.15), (1.25 * k, 1.0 * k), (0.95 * k, 1.15 * k)], seg=20, M=T(-9.7 * k, 0, z) @ Ry(-90), closed=True)
        self.add(mb.obj('tie', self.mt['tie']), 'broom', tag='broom')

    # -- posing
    def apply(self, p):
        C = self.C; hz = C['hipZ']; big = C['big']
        J = {}
        yaw = p['yaw']
        if p.get('ball'):
            ROOT = T(0, 0, C['ballC']) @ Ry(p['spin']) @ Rz(yaw) @ T(0, 0, -C['bodyC'])
        else:
            ROOT = T(0, 0, p.get('rootz', 0)) @ Rz(yaw)
        ROOTns = T(0, 0, p.get('rootz', 0)) @ Rz(yaw)
        pel = V(p.get('px', 0), 0, p['bob'] - p['crouch'] + (C['seat'] if p['broom'] else 0))
        J['pelvis'] = T(pel)
        J['torso'] = J['pelvis'] @ about((0, 0, hz), Ry(p['lean']) @ Rx(p.get('roll', 0)))
        hp, hyw, hrl = p['head']
        J['head'] = J['torso'] @ T(p.get('headDrop', (0, 0, 0))) @ about(C['neck'], Rz(C['headYaw'] + hyw) @ Ry(hp) @ Rx(hrl))
        hb = V(*C['hatBase'])
        hat_rot = about(hb, Ry(-p['hatTilt']) @ Rx(p.get('hatRoll', 6 if big else 0)))
        if p.get('hatFree'):
            fx, fz, fa = p['hatFree']
            J['hat'] = ROOTns @ T(fx, 0, fz) @ Ry(fa) @ T(-hb.x, 0, -hb.z)
            J['hat'] = ROOT.inverted() @ J['hat']
        else:
            J['hat'] = J['head'] @ T(0, 0, p.get('hatPop', 0)) @ hat_rot
        # arms (FK): (forward raise, outward, elbow bend)
        sx, sy, sz = C['sh']
        for k, s in (('N', -1), ('F', 1)):
            fw, out, bend = p['arm' + k]
            sh = (sx, s * sy, sz)
            J['uarm' + k] = J['torso'] @ about(sh, Ry(-fw) @ Rx(s * out))
            J['farm' + k] = J['uarm' + k] @ about((sx, s * sy, sz - C['La']), Ry(-bend))
        # legs
        Lt, Ls = C['Lt'], C['Ls']
        for k, s in (('N', -1), ('F', 1)):
            y = s * C['hy']
            spec = p['leg' + k]
            hip, knee, ank = (0, y, hz), (0, y, hz - Lt), (0, y, hz - Lt - Ls)
            if spec[0] == 'ik':
                _, (tx, tz), pitch = spec
                Hx, Hz = pel.x, hz + pel.z
                Ax, Az = tx, C['ankleH'] + tz
                dx, dz = Ax - Hx, Az - Hz; dist = math.hypot(dx, dz)
                ux, uz = dx / dist, dz / dist
                dist = min(max(dist, abs(Lt - Ls) + 0.05), Lt + Ls - 0.01)
                a = (Lt * Lt - Ls * Ls + dist * dist) / (2 * dist); h = math.sqrt(max(0, Lt * Lt - a * a))
                nx, nz = -uz, ux
                Kx, Kz = Hx + ux * a + nx * h, Hz + uz * a + nz * h
                Ax2, Az2 = Hx + ux * dist, Hz + uz * dist
                f1 = math.degrees(math.atan2(-(Kx - Hx), -(Kz - Hz)))
                f2 = math.degrees(math.atan2(-(Ax2 - Kx), -(Az2 - Kz))) - f1
            else:
                _, thf, kb, pitch = spec
                f1, f2 = -thf, kb
            f3 = -pitch - f1 - f2
            J['thigh' + k] = J['pelvis'] @ about(hip, Ry(f1))
            J['shin' + k] = J['thigh' + k] @ about(knee, Ry(f2))
            J['foot' + k] = J['shin' + k] @ about(ank, Ry(f3))
        J['broom'] = T(0, 0, p.get('broomZ', 0)) @ Rz(p.get('broomYaw', yaw) - yaw) @ about((0, 0, 4), Ry(p.get('broomTilt', 0)))
        # tubes
        self.sweep_hat(p['hatBend'], p.get('hatWob', 0))
        if not big: self.sweep_braid(p['braid'])
        S = Matrix.Scale(PX, 4)
        vis = self.visibility(p)
        for part in self.parts:
            o, joint, local, tag = part
            if o is getattr(self, 'hatpatch', None) or o is getattr(self, 'stitch', None):
                local = self.hp_matrix if o is self.hatpatch else self.hp_matrix
            if o is getattr(self, 'tip', None): local = self.tip_matrix
            if o is getattr(self, 'bow', None): local = self.bow_matrix
            if o is getattr(self, 'tuft', None): local = self.tuft_matrix
            o.matrix_world = S @ ROOT @ J[joint] @ local
            o.hide_render = not vis.get(o.name, True)
        # brow expression: rotate each brow about its centre (inner end down = cross, up = worried)
        for bo, Fb, s in self.brows:
            o = bo
            ang = p.get('brow', 0) * (-s)
            o.matrix_world = S @ ROOT @ J['head'] @ Fb @ Rx(ang) @ T(0, 0, p.get('browUp', 0))

    def visibility(self, p):
        vis = {}
        for st, objs in self.eyes.items():
            for o in objs: vis[o.name] = (st == p['eye'])
        for st, objs in self.mouths.items():
            for o in objs: vis[o.name] = (st == p['mouth'])
        for o, j, l, tag in self.parts:
            if tag == 'broom': vis[o.name] = p['broom'] and not p.get('noStick')
            if tag == 'legs' and p.get('noLegs'): vis[o.name] = False
        return vis


# ---- poses -----------------------------------------------------------------------------------------------------
def base_pose(C):
    return dict(yaw=-32, bob=0.0, crouch=0.0, lean=0.0, head=(0, 0, 0), hatTilt=4, hatBend=0.4, braid=0.3,
                armN=(8, 6, 14), armF=(-6, 6, 14), legN=('ik', (0.35, 0), 0), legF=('ik', (-0.35, 0), 0),
                eye='open', mouth='smile', brow=0, broom=False)


def carry_arms(p, C, i=0):
    """Mags hoists the pot over her head (the game draws it there); Pip hugs it out in front, low, the way
    world.positionCarry places it for her."""
    if C['big']:
        p['armN'] = (192, 30, 10); p['armF'] = (165, 22, 14)
    else:
        p['armN'] = (68, 4, 26); p['armF'] = (62, 4, 30)


def seated(p, C, i=0, n=1):
    p['broom'] = True
    p['legN'] = ('fk', 82, 78, 5); p['legF'] = ('fk', 70, 92, -5)
    p['armN'] = (52, 10, 38); p['armF'] = (44, 10, 44)
    return p


def pose(C, anim, i, n):
    big = C['big']; p = base_pose(C)
    f = i / n; ph = f * 2 * math.pi; sk = C['stride']
    if anim == 'idle':
        br = [0, -0.25, -0.45, -0.25][i]
        p['bob'] = br; p['lean'] = -br * 1.5
        p['armN'] = (8 - br * 4, 8 - br * 6, 16 + br * 8); p['armF'] = (-6 + br * 4, 8 - br * 6, 16 + br * 8)
        p['hatBend'] = 0.4 - br * 0.5; p['head'] = (br * 2, 0, 0); p['braid'] = 0.3 - br * 0.3
        if i == 3: p['eye'] = 'blink'
    elif anim in ('walk', 'run', 'carryWalk'):
        run = anim == 'run'
        S = (5.2 if run else 3.6) * sk; lift = (3.0 if run else 1.9) * sk
        def foot(phase):
            return (math.sin(phase) * S, max(0.0, math.cos(phase)) * lift)
        fa, fb = foot(ph), foot(ph + math.pi)
        p['legN'] = ('ik', fa, max(0, math.cos(ph)) * (18 if run else 10) - (8 if math.sin(ph) < -0.5 else 0))
        p['legF'] = ('ik', fb, max(0, math.cos(ph + math.pi)) * (18 if run else 10) - (8 if math.sin(ph + math.pi) < -0.5 else 0))
        p['bob'] = (-abs(math.sin(ph)) * 1.3 + 0.15 if run else -abs(math.sin(ph)) * 0.8 + 0.25) * (1 if big else 0.8)
        p['lean'] = 14 if run else 4
        sw = math.sin(ph)
        if run:
            p['armN'] = (-sw * 48 + 8, 14, 78); p['armF'] = (sw * 48 + 8, 14, 78)
            p['hatBend'] = 2.6 + 0.5 * math.cos(ph * 2); p['hatTilt'] = 10; p['braid'] = 2.4 + 0.4 * math.cos(ph * 2)
            p['mouth'] = 'grin'; p['head'] = (-6, 0, 0); p['brow'] = 8
        else:
            p['armN'] = (-sw * 26 + 4, 8, 22); p['armF'] = (sw * 26 + 4, 8, 22)
            p['hatBend'] = 1.0 + 0.3 * math.cos(ph * 2); p['braid'] = 1.0 + 0.3 * math.cos(ph * 2)
            p['head'] = (-2 + math.cos(ph * 2), 0, 0)
        p['hatWob'] = 0.25 * math.sin(ph)
        if anim == 'carryWalk':
            carry_arms(p, C, i); p['lean'] = 1; p['head'] = (-10, 0, 0)
            p['hatBend'] = 0.9 + 0.3 * math.cos(ph * 2); p['mouth'] = 'grin'
    elif anim == 'skid':
        p['legN'] = ('ik', (4.6 * sk, 0), 22); p['legF'] = ('ik', (-1.4 * sk, 0.4), -6)
        p['lean'] = -16; p['crouch'] = 0.8; p['armN'] = (-38, 34, 18); p['armF'] = (-46, 34, 18)
        p['hatBend'] = -0.6; p['hatTilt'] = -8; p['mouth'] = 'o'; p['brow'] = -12; p['braid'] = -0.6; p['head'] = (6, 0, 0)
    elif anim in ('jump', 'carryJump'):
        p['legN'] = ('fk', 72, 96, 10); p['legF'] = ('fk', 18, 62, -10)
        p['bob'] = 0.5; p['lean'] = 4
        p['armN'] = (206, 22, 12); p['armF'] = (128, 22, 24)
        p['hatBend'] = 2.4; p['hatTilt'] = 10; p['braid'] = 2.8; p['mouth'] = 'grin'; p['head'] = (-8, 0, 0); p['brow'] = 6
        if anim == 'carryJump': carry_arms(p, C, i); p['lean'] = 0
    elif anim == 'fall':
        w = 1 if i == 0 else -1
        p['legN'] = ('fk', 30, 50, 15); p['legF'] = ('fk', -6, 18, -10)
        p['armN'] = (214 - 22 * w, 30, 20 + 14 * w); p['armF'] = (138 + 22 * w, 30, 30 - 12 * w)
        p['hatBend'] = -1.0; p['hatTilt'] = -10; p['hatPop'] = 0.6; p['braid'] = -1.5; p['mouth'] = 'o'; p['brow'] = -14
        p['head'] = (4, 0, 4 * w); p['lean'] = -4
    elif anim == 'float':
        p = seated(p, C); p['yaw'] = -58; p['broomYaw'] = -32
        bob = 0.8 if i == 0 else -0.4; p['bob'] = bob; p['broomZ'] = bob
        w = 1 if i == 0 else -1
        p['legN'] = ('fk', 62 + 14 * w, 72 - 22 * w, 0); p['legF'] = ('fk', 62 - 14 * w, 72 + 22 * w, 0)
        p['armN'] = (36, 26, 40); p['armF'] = (28, 26, 44)
        p['hatBend'] = 1.8; p['braid'] = 1.8; p['mouth'] = 'grin'; p['head'] = (-4, 8, 0)
    elif anim in ('roll', 'blast'):
        p['ball'] = True; p['spin'] = f * 360
        p['legN'] = ('fk', 128, 150, 30); p['legF'] = ('fk', 118, 150, 20)
        p['armN'] = (66, -6, 96); p['armF'] = (60, -6, 100)
        p['headDrop'] = (0.8, 0, -2.6 if big else -2.2); p['head'] = (34, 0, 0); p['lean'] = 30
        p['mouth'] = 'grin'; p['brow'] = 10
        p['hatFree'] = ((-10.5 if big else -8.5), (17.0 if big else 12.5) + 0.8 * math.sin(ph * 2), -38 + 12 * math.sin(ph))
        p['hatBend'] = 2.0; p['hatTilt'] = 0; p['braid'] = 1.0
    elif anim == 'carryIdle':
        carry_arms(p, C, i); p['bob'] = -0.4 if i == 1 else 0.0
        p['head'] = (-10, 0, 0); p['mouth'] = 'grin'; p['hatBend'] = 0.6 + 0.3 * i
    elif anim == 'throw':
        p['armN'] = (92, 4, 2); p['armF'] = (-52, 18, 20); p['lean'] = 13
        p['legN'] = ('ik', (3.0 * sk, 0), 0); p['legF'] = ('ik', (-2.6 * sk, 0.2), -6)
        p['mouth'] = 'grin'; p['brow'] = 14; p['hatBend'] = 1.8; p['hatTilt'] = 8; p['head'] = (2, 0, 0); p['braid'] = 1.6
    elif anim == 'slap':
        p['legN'] = ('ik', (3.0 * sk, 0), 0); p['legF'] = ('ik', (-3.0 * sk, 0), 0)
        if i == 0:
            p['armN'] = (172, 16, 16); p['armF'] = (168, 16, 16); p['bob'] = 0.6; p['lean'] = -8
            p['mouth'] = 'grin'; p['brow'] = 14; p['hatBend'] = -0.4; p['head'] = (-10, 0, 0)
        elif i == 1:
            p['armN'] = (88, 10, 10); p['armF'] = (84, 10, 10); p['crouch'] = 1.8 * sk; p['lean'] = 22
            p['mouth'] = 'grin'; p['brow'] = 16; p['hatBend'] = 1.4; p['head'] = (-14, 0, 0)
        else:
            p['armN'] = (34, 12, 0); p['armF'] = (30, 12, 0); p['crouch'] = 3.4 * sk; p['lean'] = 40
            p['mouth'] = 'o'; p['brow'] = 18; p['hatBend'] = 2.8; p['hatPop'] = 0.8; p['head'] = (-26, 0, 0); p['braid'] = 2.4
    elif anim == 'hurt':
        w = 1 if i == 0 else -1
        p['lean'] = -12 - 6 * i; p['legN'] = ('fk', 34 + 10 * w, 40, 10); p['legF'] = ('fk', -12, 30, -10)
        p['armN'] = (204 - 16 * w, 30, 24); p['armF'] = (128 + 16 * w, 30, 30)
        p['eye'] = 'blink'; p['mouth'] = 'o'; p['brow'] = -16; p['hatPop'] = 1.6 + i; p['hatTilt'] = -12; p['hatBend'] = -0.8
        p['head'] = (8, 0, 6 * w); p['bob'] = 0.8
    elif anim == 'dead':
        w = 1 if i == 0 else -1
        p['lean'] = -20 - 8 * i; p['legN'] = ('fk', 50 + 12 * w, 42, 14); p['legF'] = ('fk', 22 - 10 * w, 38, 0)
        p['armN'] = (210 - 16 * w, 30, 24); p['armF'] = (146 + 16 * w, 30, 26)
        p['eye'] = 'x'; p['mouth'] = 'o'; p['brow'] = -10; p['hatPop'] = 5.5 + 3.5 * i; p['hatTilt'] = 22 - 50 * i; p['hatBend'] = 0.6
        p['head'] = (10, 0, 8 * w); p['bob'] = 1.0
    elif anim == 'victory':
        if i == 0:
            p['armN'] = (222, 20, 10); p['armF'] = (134, 20, 10); p['bob'] = 2.4
            p['legN'] = ('ik', (1.8 * sk, 2.0), 15); p['legF'] = ('ik', (-1.8 * sk, 1.2), -15)
            p['eye'] = 'happy'; p['mouth'] = 'grin'; p['hatBend'] = -0.4; p['hatPop'] = 0.8; p['head'] = (-10, 0, 0); p['braid'] = -1
        else:
            p['armN'] = (214, 24, 40); p['armF'] = (118, 24, 48)
            p['legN'] = ('ik', (2.4 * sk, 0), 0); p['legF'] = ('ik', (-2.4 * sk, 0), 0)
            p['eye'] = 'open'; p['mouth'] = 'grin'; p['hatBend'] = 1.4; p['head'] = (-4, 0, 0); p['braid'] = 1.2; p['brow'] = 6
    elif anim == 'cart':
        p['noLegs'] = True
        p['armN'] = (56, 12, 34); p['armF'] = (50, 12, 38); p['bob'] = -0.5 if i == 1 else 0
        p['hatBend'] = 2.6 + 0.8 * i; p['hatTilt'] = 8; p['braid'] = 2.6 + 0.6 * i; p['mouth'] = 'grin'; p['head'] = (-4, 0, 0); p['brow'] = 6
    elif anim in ('ride', 'rideBack'):
        p = seated(p, C)
        bob = math.sin(ph) * 1.0; p['bob'] = bob; p['broomZ'] = bob
        p['hatBend'] = 1.5 + 0.3 * math.cos(ph); p['braid'] = 1.5 + 0.3 * math.cos(ph)
        p['mouth'] = 'grin' if anim == 'ride' else 'smile'; p['head'] = (-3 + math.sin(ph) * 2, 0, 0)
        p['legN'] = ('fk', 82, 78 + 8 * math.sin(ph), 5); p['legF'] = ('fk', 70, 92 - 8 * math.sin(ph), -5)
        if anim == 'rideBack':
            p['noStick'] = True; p['armN'] = (70, 6, 30); p['armF'] = (64, 8, 34); p['brow'] = -4
    elif anim == 'rideDash':
        p = seated(p, C)
        p['lean'] = 30; p['armN'] = (70, 6, 6); p['armF'] = (64, 8, 8); p['head'] = (-22, 0, 0)
        p['legN'] = ('fk', 70, 110, -10); p['legF'] = ('fk', 58, 120, -20)
        p['hatBend'] = 4.2 + 0.4 * i; p['hatTilt'] = 18; p['braid'] = 4.2; p['mouth'] = 'grin'; p['brow'] = 18
        p['broomTilt'] = -4; p['bob'] = -0.6 - 0.4 * i; p['broomZ'] = -0.4 * i
    elif anim == 'flee':
        p = seated(p, C)
        p['lean'] = -10; p['roll'] = 6; p['head'] = (16, 6, -18); p['armN'] = (14, 26, 10); p['armF'] = (8, 26, 12)
        p['eye'] = 'x'; p['mouth'] = 'o'; p['brow'] = -14; p['hatBend'] = 2.6; p['hatTilt'] = -14; p['hatRoll'] = -16; p['braid'] = 2.4
        p['broomTilt'] = 6
    return p


# ---- previews --------------------------------------------------------------------------------------------------
def write_png(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new('pv', w, h, alpha=True)
    rgba = arr if arr.shape[2] == 4 else np.concatenate([arr, np.full((h, w, 1), 255, np.uint8)], axis=2)
    img.pixels[:] = (rgba[::-1].astype(np.float32) / 255).ravel()
    img.filepath_raw = path; img.file_format = 'PNG'; img.save(); bpy.data.images.remove(img)


def sunset_bg(h, w):
    t = np.linspace(0, 1, h)[:, None, None]
    top = np.array([90, 60, 140]); bot = np.array([255, 178, 102])
    return np.broadcast_to((top * (1 - t) + bot * t), (h, w, 3)).astype(np.uint8)


def previews(sheet, name):
    if not PREV: return
    os.makedirs(PREV, exist_ok=True)
    big = sheet._big; Hh, Ww = big.shape[:2]
    a = big[..., 3:4] > 0
    dark = np.where(a, big[..., :3], np.array([22, 18, 34], np.uint8))
    sun = np.where(a, big[..., :3], sunset_bg(Hh, Ww))
    both = np.concatenate([dark, np.full((Hh, 4, 3), 255, np.uint8), sun], axis=1)
    write_png(both, os.path.join(PREV, name + '_1x.png'))
    up = np.repeat(np.repeat(dark, 3, 0), 3, 1)
    write_png(up, os.path.join(PREV, name + '_3x.png'))
    up = np.repeat(np.repeat(sun, 3, 0), 3, 1)
    write_png(up, os.path.join(PREV, name + '_3x_sunset.png'))
    # zoom pages: 8 frames per page (4 x 2), each cell dark over sunset at 4x, cropped to the busy middle
    frames = [(a, i, f) for a, fl in sheet.anims.items() for i, f in enumerate(fl)]
    sc = 4; y0, y1, x0, x1 = 4, 54, 6, 50
    ch, cw = (y1 - y0) * sc, (x1 - x0) * sc
    for pg in range(0, len(frames), 8):
        chunk = frames[pg:pg + 8]
        out = np.full((2 * (ch * 2 + 6), 4 * (cw + 4), 3), 255, np.uint8)
        for k_, (a_, i_, f_) in enumerate(chunk):
            r, c_ = divmod(k_, 4)
            crop = f_[y0:y1, x0:x1]; al = crop[..., 3:4] > 0
            for k, bg in enumerate((np.array([22, 18, 34], np.uint8), sunset_bg(y1 - y0, x1 - x0))):
                im = np.where(al, crop[..., :3], bg)
                im = np.repeat(np.repeat(im, sc, 0), sc, 1)
                yy = r * (ch * 2 + 6) + k * ch; xx = c_ * (cw + 4)
                out[yy:yy + ch, xx:xx + cw] = im
        write_png(out, os.path.join(PREV, '%s_zoom%02d.png' % (name, pg // 8)))


def light_rig():
    """Re-aim spritelib's three suns and add a warm second rim, for a punchier 90s CG look on the witches."""
    sc = bpy.context.scene
    def aim(name, toward, energy, color, angle=10):
        o = bpy.data.objects.get(name)
        if o is None:
            ld = bpy.data.lights.new(name, 'SUN'); o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o)
        o.rotation_euler = Vector(toward).normalized().to_track_quat('Z', 'Y').to_euler()
        o.data.energy = energy; o.data.color = color; o.data.angle = math.radians(angle)
    aim('key', (-0.55, -0.85, 0.95), 3.6, (1.0, 0.93, 0.82))
    aim('fill', (0.8, -0.7, 0.05), 0.65, (0.72, 0.8, 1.0), 30)
    aim('rim', (0.85, 1.0, 0.45), 4.5, (0.55, 0.85, 1.0), 6)
    aim('rim2', (-0.9, 0.8, 0.35), 2.6, (1.0, 0.62, 0.78), 6)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.45


def build(C):
    L.setup_scene(samples=40)
    light_rig()
    w = Witch(C)
    sheet = L.Sheet(C['name'], 56, 56, 28, 50)
    t0 = time.time(); nfr = 0
    for anim, n in ANIMS:
        if ONLY and anim not in ONLY: continue
        for i in range(n):
            w.apply(pose(C, anim, i, n))
            sheet.add(anim); nfr += 1
    dt = time.time() - t0
    if PREV and os.environ.get('WITCH_BEAUTY'):
        # one big clean render of a pose for checking the model itself
        an, fi = os.environ['WITCH_BEAUTY'].split(':') if ':' in os.environ['WITCH_BEAUTY'] else (os.environ['WITCH_BEAUTY'], 0)
        nn = dict(ANIMS)[an]
        w.apply(pose(C, an, int(fi), nn))
        sc = bpy.context.scene; L.frame_camera(56, 56, 28, 50)
        sc.render.resolution_x = sc.render.resolution_y = 560
        sc.render.filepath = os.path.join(PREV, C['name'] + '_beauty.png')
        bpy.ops.render.render(write_still=True)
    if not ONLY: sheet.save()
    else:
        sheet.save = None
        # assemble for preview only (do not overwrite the real sheet with a partial one)
        names = list(sheet.anims); cols = max(len(v) for v in sheet.anims.values())
        big = np.zeros((56 * len(names), 56 * cols, 4), np.uint8)
        for r, nm in enumerate(names):
            for c_, fr in enumerate(sheet.anims[nm]): big[r * 56:(r + 1) * 56, c_ * 56:(c_ + 1) * 56] = fr
        sheet._big = big
    previews(sheet, C['name'])
    print('RENDER', C['name'], nfr, 'frames in %.1fs' % dt)


for nm in CHARS:
    build(MAGS if nm == 'mags' else PIP)
