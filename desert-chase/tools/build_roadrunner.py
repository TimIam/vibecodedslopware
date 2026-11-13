# Photoreal greater roadrunner (Geococcyx californianus), built procedurally in Blender 5.1.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python roadrunner-coyote/tools/build_roadrunner.py
#
# Env: RR_STAGE=clay|feathers (default feathers)   RR_Q=preview|final   RR_VIEWS=side,34,head,front   RR_SAVE=1
# Units: metres. Bird faces +X, left side is +Y, ground z = 0. Alert pose from the reference photo: body tilted up
# ~35 degrees, neck up, crest raised, tail cocked ~62 degrees. Bill tip to tail tip ~0.55 m, crest top ~0.31 m.

import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import fauna_lib as fl
importlib.reload(fl)
from fauna_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RENDERS = os.path.join(ROOT, 'renders')
OUT = os.path.join(ROOT, 'out')
os.makedirs(RENDERS, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
STAGE = os.environ.get('RR_STAGE', 'feathers')
Q = os.environ.get('RR_Q', 'preview')
VIEWS = os.environ.get('RR_VIEWS', 'side,34,head').split(',')
SCENE = os.environ.get('RR_SCENE', 'studio')
rng = np.random.default_rng(11)
CLAY = STAGE == 'clay'

if os.environ.get('RR_KEEP') != '1':
    reset_scene()
C_RR = collection('roadrunner')

# ======================================================================================== landmarks
BODY_PITCH = 35.0
R_BODY = rotm(ry=-BODY_PITCH)
BODY_AX = R_BODY[:, 0]                                   # front-up along the body
DORS = R_BODY[:, 2]                                      # dorsal (up-back)
TAIL_EL = 62.0
TAIL_DIR = np.array([-math.cos(rad(TAIL_EL)), 0, math.sin(rad(TAIL_EL))])
TAIL_DN = np.array([math.sin(rad(TAIL_EL)), 0, math.cos(rad(TAIL_EL))])   # dorsal face of the cocked tail
T0 = np.array([-0.066, 0.0, 0.142])                      # tail root

HEAD_C = np.array([0.092, 0.0, 0.268])
RHd = basis((math.cos(rad(-6)), 0, math.sin(rad(-6))))
HF, HL, HU = RHd[:, 0], RHd[:, 1], RHd[:, 2]
def Hd(a, b=0.0, c=0.0):
    return HEAD_C + a * HF + b * HL + c * HU
Y = np.array([0, 1.0, 0])

prims = []
def P_(p):
    prims.extend(p if isinstance(p, list) else [p])
    return p

body = [
    Ell((0.008, 0, 0.132), (0.072, 0.033, 0.037), R_BODY, 'back', flow=tuple(-BODY_AX)),
    Ell((0.048, 0, 0.158), (0.034, 0.031, 0.034), None, 'breast', flow=(0.15, 0, -1)),
    Ell((-0.008, 0, 0.108), (0.048, 0.029, 0.028), R_BODY, 'belly', flow=(-0.5, 0, -0.85)),
    Ell((-0.048, 0, 0.114), (0.028, 0.024, 0.026), None, 'rump', flow=tuple(TAIL_DIR)),
    Cone((-0.05, 0, 0.115), tuple(T0), 0.012, 0.008, 'rump', flow=tuple(TAIL_DIR)),
]
neck = chain([(0.052, 0, 0.172), (0.072, 0, 0.205), (0.083, 0, 0.238), (0.089, 0, 0.258)],
             [0.023, 0.0165, 0.0145, 0.015], 'neck', flow=(-0.2, 0, -1))
head = [
    Ell(Hd(0, 0, 0), (0.024, 0.0172, 0.019), RHd, 'head', flow=tuple(-HF)),
    Ell(Hd(0.015, 0, 0.001), (0.0145, 0.0115, 0.0125), RHd, 'head', flow=tuple(-HF)),
    Ell(Hd(-0.008, 0, 0.006), (0.016, 0.0155, 0.016), RHd, 'crown', flow=tuple(-HF + 0.3 * HU)),
    Ell(Hd(0.006, 0, -0.012), (0.017, 0.011, 0.009), RHd, 'throat', flow=tuple(-0.3 * HF - HU)),
]
thighs = []
for s in (1, -1):
    thighs += [Ell((0.004, s * 0.024, 0.097), (0.022, 0.015, 0.03), rotm(ry=20), 'thigh', flow=(0, 0, -1)),
               Cone((0.002, s * 0.024, 0.095), (-0.009, s * 0.022, 0.073), 0.013, 0.0055, 'thigh', flow=(0, 0, -1))]
P_(body); P_(neck); P_(head); P_(thighs)

sdf = SDF((-0.13, -0.055, 0.05), (0.16, 0.055, 0.305), 0.0008 if Q == 'final' else 0.001, band=0.025)
sdf.add(body[:4], k=0.02)
sdf.group(body[4:], k=0.01)
sdf.group(neck, k=0.012, inner=0.004)
sdf.add(head, k=0.008)
for i in range(0, len(thighs), 2):
    sdf.group(thighs[i:i + 2], k=0.01, inner=0.004)

# ---------------------------------------------------------------------------------------- eyes + bare patch
ER = 0.0052
EYES = []
for s in (1, -1):
    d = unit(s * HL + 0.15 * HF + 0.2 * HU)
    S = sdf.raycast(Hd(0.004, 0, 0.004), d, 0.05)
    gaze = unit(HF * 0.35 + s * HL * 0.92 + HU * 0.1)
    Ec = S - d * 0.0034
    g1 = unit(HF - gaze * np.dot(HF, gaze))
    Rg = np.stack([g1, np.cross(gaze, g1), gaze], 1)
    sdf.add(Ell(Ec, np.array([ER + 0.0009, ER + 0.0009, ER + 0.0006]), Rg), k=0.0025)
    sdf.add(Ell(Ec + gaze * 0.0062, np.array([0.0047, 0.0041, 0.009]), Rg), k=0.0006, sub=True)
    patch = sdf.raycast(Hd(-0.008, 0, 0.004), unit(s * HL - 0.25 * HF + 0.1 * HU), 0.05)
    EYES.append(dict(S=S, d=d, gaze=gaze, center=Ec, s=s, patch=patch))

bird = sdf.mesh('roadrunner_body', smooth_iter=2)
C_RR.objects.link(bird)
bpy.context.scene.collection.objects.unlink(bird)

# ---------------------------------------------------------------------------------------- bill
BB = Hd(0.021, 0, -0.003)
bx = unit(HF - 0.12 * HU)
bz = unit(np.cross(bx, HL))
def Bp(x, y=0.0, z=0.0):
    return BB + x * bx + y * HL + z * bz
RB = np.stack([bx, HL, bz], 1)
bsdf = SDF(BB + np.array([-0.008, -0.008, -0.017]), BB + np.array([0.052, 0.008, 0.010]), 0.00018 if Q == 'final' else 0.00022)
upper = [Cone(Bp(-0.004, 0, 0.0016), Bp(0.03, 0, 0.0006), 0.0068, 0.0028, scale=None),
         Cone(Bp(0.03, 0, 0.0006), Bp(0.0468, 0, -0.0029), 0.0026, 0.0006)]
lower = [Cone(Bp(-0.004, 0, -0.0031), Bp(0.041, 0, -0.0024), 0.0056, 0.0012)]
for c in upper + lower:
    c.scale = None
# squash the bill laterally in its own frame
class Squash(Prim):
    def __init__(self, inner, centre, R, sc):
        super().__init__(None)
        self.inner, self.c, self.R, self.sc = inner, np.asarray(centre), R, np.asarray(sc, float)
    def bbox(self):
        return self.inner.bbox()
    def dist(self, P):
        q = (P - self.c) @ self.R / self.sc
        return self.inner.dist(self.c + q @ self.R.T) * self.sc.min()
for c in upper + lower:
    bsdf.add(Squash(c, BB, RB, (1, 0.78, 1)), k=0.0012)
bsdf.add(Ell(Bp(0.02, 0, -0.0011), (0.03, 0.02, 0.00026), RB), k=0.00015, sub=True)        # gape line
for s in (1, -1):
    bsdf.add(Ell(Bp(0.0085, s * 0.0034, 0.0021), (0.0026, 0.0011, 0.00065), RB), k=0.0003, sub=True)  # nostrils
bill = bsdf.mesh('roadrunner_bill', smooth_iter=2)
C_RR.objects.link(bill)
bpy.context.scene.collection.objects.unlink(bill)

# ---------------------------------------------------------------------------------------- legs + zygodactyl feet
lsdf = SDF((-0.055, -0.045, -0.002), (0.05, 0.045, 0.08), 0.00034 if Q == 'final' else 0.00042)
CLAWS = []
FEET = {1: np.array([0.007, 0.02, 0.0034]), -1: np.array([-0.012, -0.021, 0.0034])}
for s in (1, -1):
    Fc = FEET[s]
    A = np.array([Fc[0] - 0.012, s * 0.022, 0.07])
    lsdf.group([Ell(A, (0.0042, 0.0038, 0.0045)),
                Cone(A, Fc + (0, 0, 0.0028), 0.0034, 0.0027),
                Ell(Fc + (0, 0, 0.0018), (0.0042, 0.0038, 0.0032))], k=0.0, inner=0.0015)
    for yaw, Lt, r0 in ((s * 15, 0.033, 0.0027), (-s * 12, 0.027, 0.0025), (180 - s * 35, 0.028, 0.0026), (180 + s * 20, 0.017, 0.0025)):
        dvec = np.array([math.cos(rad(yaw)), math.sin(rad(yaw)), 0.0])
        pts = [Fc + (0, 0, 0.0005), Fc + dvec * Lt * 0.36 + (0, 0, 0.0004), Fc + dvec * Lt * 0.7 + (0, 0, 0.0002),
               Fc + dvec * Lt + (0, 0, -0.0012)]
        rs = [r0, r0 * 0.85, r0 * 0.72, r0 * 0.55]
        toe = chain(pts, rs, None)
        toe += [Ell(p, (r * 1.25, r * 1.1, r * 1.05)) for p, r in zip(pts[1:3], rs[1:3])]
        lsdf.group(toe, k=0.0012, inner=0.0006)
        tip = pts[-1]
        claw = [Cone(tip, tip + dvec * 0.0028 + (0, 0, -0.0012), rs[-1] * 0.8, 0.0004),
                Cone(tip + dvec * 0.0028 + (0, 0, -0.0012), tip + dvec * 0.0048 + (0, 0, -0.0032), 0.0004, 0.00012)]
        lsdf.group(claw, k=0.0004)
        CLAWS += claw
legs = lsdf.mesh('roadrunner_legs', smooth_iter=2)
C_RR.objects.link(legs)
bpy.context.scene.collection.objects.unlink(legs)

# ======================================================================================== colours / materials
def H_(h):
    return hexc(h)
PAL = {   # main, edge, streak, (edge_start, streak_w, tip_start), (fluff, gloss)
    'back':   (H_('#2c241c'), H_('#cdb895'), H_('#1a1410'), (0.55, 0.0, 1.2), (0.1, 0.7)),
    'crown':  (H_('#18171b'), H_('#bba37c'), H_('#101012'), (1.2, 0.0, 0.80), (0.1, 0.55)),
    'head':   (H_('#d4c6a8'), H_('#e6dcc6'), H_('#5a4838'), (1.2, 0.16, 1.2), (0.35, 0.05)),
    'throat': (H_('#e3d9c4'), H_('#efe8da'), H_('#6a5a48'), (1.2, 0.0, 1.2), (0.4, 0.0)),
    'neck':   (H_('#c4ae88'), H_('#ded2b8'), H_('#2e2219'), (0.85, 0.30, 1.2), (0.15, 0.05)),
    'breast': (H_('#cdb994'), H_('#e2d7bf'), H_('#33251a'), (0.88, 0.24, 1.2), (0.25, 0.05)),
    'belly':  (H_('#dacdb0'), H_('#e8e0cc'), H_('#9a8a70'), (1.2, 0.0, 1.2), (0.95, 0.0)),
    'thigh':  (H_('#c6b898'), H_('#ddd2ba'), H_('#7a6a55'), (1.2, 0.0, 1.2), (0.95, 0.0)),
    'rump':   (H_('#2a251d'), H_('#a8987a'), H_('#15120e'), (0.75, 0.0, 1.2), (0.15, 0.75)),
}
SIZE = {'back': (0.027, 0.66, 0.08), 'crown': (0.0075, 0.6, 0.12), 'head': (0.0055, 0.72, 0.06),
        'throat': (0.0065, 0.8, 0.08), 'neck': (0.0115, 0.66, 0.08), 'breast': (0.019, 0.68, 0.08),
        'belly': (0.017, 0.8, 0.04), 'thigh': (0.016, 0.85, 0.06), 'rump': (0.032, 0.6, 0.1)}

def plumage(P, Nn):
    w, flow, par = tag_fields(prims, P, sigma=0.004)
    z0 = np.zeros(len(P))
    dors = smoothstep(-0.45, 0.35, Nn @ DORS)
    front = smoothstep(-0.2, 0.6, Nn[:, 0])
    n = len(P)
    main = np.zeros((n, 3)); edge = np.zeros((n, 3)); streak = np.zeros((n, 3))
    pp = np.zeros((n, 3)); qq = np.zeros((n, 3))
    L = z0.copy(); A = z0.copy(); lift = z0.copy()
    for t in PAL:
        wt = w.get(t, z0)
        if t == 'back':     # flanks under the wing read as belly
            parts = [(PAL['back'], dors), (PAL['belly'], 1 - dors)]
        elif t == 'neck':   # nape darker and more heavily streaked than the foreneck
            nape = (PAL['neck'][0] * 0.62, PAL['neck'][1] * 0.9, PAL['neck'][2], (0.7, 0.42, 1.2), (0.15, 0.2))
            parts = [(PAL['neck'], front), (nape, 1 - front)]
        elif t == 'breast':
            upper = smoothstep(0.13, 0.17, P[:, 2])
            plain = (PAL['breast'][0] * 1.04, PAL['breast'][1], PAL['breast'][2], (1.2, 0.0, 1.2), (0.35, 0.0))
            parts = [(PAL['breast'], upper), (plain, 1 - upper)]
        else:
            parts = [(PAL[t], 1 + z0)]
        tot = sum(pw for _, pw in parts) + 1e-9
        for (cm, ce, cs, p3, q2), pw in parts:
            k = (wt * pw / tot)[:, None]
            main += k * cm; edge += k * ce; streak += k * cs
            pp += k * np.array(p3); qq += k * np.array([q2[0], q2[1], 0.0])
        Ls, As, ls = SIZE[t]
        L += wt * Ls; A += wt * As; lift += wt * ls
    # dark spotted crown by position (top of the head, behind the bill)
    rel = P - HEAD_C
    hw = w.get('head', z0) + w.get('crown', z0)
    cm = hw * smoothstep(0.004, 0.012, rel @ HU) * smoothstep(0.022, 0.008, rel @ HF)
    cc, ce, cs, cp, cq = PAL['crown']
    k = cm[:, None]
    main = main * (1 - k) + cc * k; edge = edge * (1 - k) + ce * k; streak = streak * (1 - k) + cs * k
    pp = pp * (1 - k) + np.array(cp) * k; qq = qq * (1 - k) + np.array([cq[0], cq[1], 0]) * k
    F = sum(w[t][:, None] * unit(flow[t]) for t in flow)
    return dict(main=main, edge=edge, streak=streak, p=pp, q=qq, L=L, A=A, lift=lift, F=F, w=w, dors=dors)

def jitter_cols(*cols, amt=0.07):
    j = (1 - amt + 2 * amt * rng.random(len(cols[0])))[:, None]
    return [c * j for c in cols]

# skin under the feathers + the bare postocular patch
V, VN, TRI = mesh_arrays(bird)
pl = plumage(V, VN)
skin = pl['main'] * 0.6 + pl['edge'] * 0.2
blue, white, orange = H_('#6f8fbf'), H_('#c9d6e0'), H_('#d0582a')
for e in EYES:
    rel = V - e['center']
    a = rel @ HF
    c = rel @ HU
    lat = np.abs(rel @ HL)
    inpatch = smoothstep(1.15, 0.85, np.sqrt(((a + 0.0078) / 0.0078) ** 2 + ((c - 0.0005) / 0.0042) ** 2)) * (lat > 0.004)
    t_ = np.clip(-(a + 0.002) / 0.0135, 0, 1)
    tb_ = smoothstep(0.25, 0.6, t_)[:, None] * 0.8
    to_ = smoothstep(0.72, 0.95, t_)[:, None]
    pc = blue * (1 - tb_) + white * tb_
    pc = pc * (1 - to_) + orange * to_
    ring = smoothstep(0.0022, 0.0012, np.linalg.norm(rel, axis=1) - ER)
    skin = skin * (1 - inpatch[:, None]) + pc * inpatch[:, None]
    skin = skin * (1 - ring[:, None]) + H_('#3c4652')[None, :] * ring[:, None]
set_point_color(bird, 'skin_col', skin)

# bill colours: dark culmen and tip, pale bluish horn at the base of the lower mandible
BV = np.empty(len(bill.data.vertices) * 3, np.float32); bill.data.vertices.foreach_get('co', BV)
BV = BV.reshape(-1, 3).astype(float)
bxl = (BV - BB) @ bx
bzl = (BV - BB) @ bz
tb = np.clip(bxl / 0.047, 0, 1)
lowerm = smoothstep(-0.0006, -0.0018, bzl)
bc = H_('#2b2c30') * (1 - lowerm[:, None]) + (H_('#8e98a2') * (1 - tb[:, None] ** 0.7) + H_('#34363a') * tb[:, None] ** 0.7) * lowerm[:, None]
bc = bc * (1 - smoothstep(0.03, 0.045, bxl)[:, None] * 0.35)
set_point_color(bill, 'skin_col', bc)

# leg colours: pale blue-grey scales, dark claws
LV = np.empty(len(legs.data.vertices) * 3, np.float32); legs.data.vertices.foreach_get('co', LV)
LV = LV.reshape(-1, 3).astype(float)
dcl = np.min(np.stack([c.dist(LV) for c in CLAWS]), 0)
lc = H_('#a7b0ba') * (1 - smoothstep(0.0003, -0.0001, dcl)[:, None]) + H_('#2a2b2e') * smoothstep(0.0003, -0.0001, dcl)[:, None]
set_point_color(legs, 'skin_col', lc)

def mat_scales(name):
    m = bpy.data.materials.new(name)
    t = NT(m)
    col = t.attr('skin_col').outputs['Color']
    vor = t.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
    vor.inputs['Scale'].default_value = 1400.0
    crev = map_range(t, vor.outputs['Distance'], 0.0, 0.08)
    c = mix_col(t, math_node(t, 'SUBTRACT', 1.0, crev), col, [x * 0.55 for x in H_('#a7b0ba')])
    p = t.n('ShaderNodeBsdfPrincipled')
    t.l(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.45
    p.inputs['Subsurface Weight'].default_value = 0.1
    p.inputs['Subsurface Radius'].default_value = (0.001, 0.0006, 0.0004)
    b = t.n('ShaderNodeBump')
    b.inputs['Strength'].default_value = 0.6
    b.inputs['Distance'].default_value = 0.0002
    t.l(crev, b.inputs['Height'])
    t.l(b.outputs['Normal'], p.inputs['Normal'])
    out = t.n('ShaderNodeOutputMaterial')
    t.l(p.outputs[0], out.inputs['Surface'])
    return m

clay = mat_clay() if CLAY else None
bird.data.materials.append(clay or mat_principled('rr_skin', attr='skin_col', rough=0.5, sss=0.08,
                                                   sss_rad=(0.002, 0.001, 0.0006)))
bill.data.materials.append(clay or mat_principled('rr_bill', attr='skin_col', rough=0.32, coat=0.2, bump=(2500, 0.08, 0.0001)))
legs.data.materials.append(clay or mat_scales('rr_legs'))
mat_iris = mat_eye('rr_iris', H_('#8a5a2a'), H_('#c99a5a'), H_('#3a2a1c'), H_('#20242a'), pupil_r=0.34, iris_r=0.84, radius=ER)
mat_cor = mat_cornea()
for e in EYES:
    eyeball('rr_eye_%s' % ('L' if e['s'] > 0 else 'R'), e['center'], e['gaze'], ER, mat_iris, mat_cor, C_RR)

# ======================================================================================== feathers
FEATHERS = []        # (name, X, attrs) collected, then one mesh per group

def attrs_from(main, edge, streak, p, q, shape, n):
    rnd = rng.random(n)
    main, edge, streak = jitter_cols(main, edge, streak)
    qq = np.array(q, float).reshape(-1, 3) if np.ndim(q) > 1 else np.tile(q, (n, 1))
    qq = qq.copy()
    qq[:, 2] = rnd
    return {'f_main': main, 'f_edge': edge, 'f_streak': streak,
            'f_p': np.array(p, float).reshape(-1, 3) if np.ndim(p) > 1 else np.tile(p, (n, 1)),
            'f_q': qq, 'f_s': np.array(shape, float).reshape(-1, 3) if np.ndim(shape) > 1 else np.tile(shape, (n, 1))}

def drop_near_eyes(X):
    """True for cards that would cover an eye or the bare patch behind it."""
    bad = np.zeros(len(X), bool)
    flat = X.reshape(len(X), -1, 3)
    for e in EYES:
        de = np.linalg.norm(flat - e['center'], axis=2) - ER
        bad |= (de < 0.0014).any(1)
        rel = flat - e['center']
        a = rel @ HF; c = rel @ HU; lat = (rel @ HL) * e['s']
        inp = (((a + 0.0078) / 0.0080) ** 2 + ((c - 0.0005) / 0.0044) ** 2 < 1.0) & (lat > 0.003)
        bad |= inp.any(1)
    return bad

if not CLAY:
    mat_f = mat_feather('rr_feather')
    # ------------------------------------------------------------------ body contour feathers
    COV = 7.5 if Q == 'final' else 6.0
    P0, N0, area = sample_surface(V, VN, TRI, 60000, rng)
    pl0 = plumage(P0, N0)
    d0 = 1.0 / (pl0['L'] ** 2 * pl0['A'])
    M = int((COV / 0.55 * d0).mean() * area)
    acc = (d0 / d0.max()).mean()
    P1, N1, _ = sample_surface(V, VN, TRI, int(M / acc * 1.15), rng)
    pl1 = plumage(P1, N1)
    d1 = 1.0 / (pl1['L'] ** 2 * pl1['A'])
    keep = rng.random(len(P1)) < d1 / d1.max()
    keep &= P1[:, 2] > 0.075                                   # nothing on the bare lower leg region
    idx = np.where(keep)[0]
    idx = idx[:M] if len(idx) > M else idx
    P, Nn = P1[idx], N1[idx]
    pb = {k: (v[idx] if isinstance(v, np.ndarray) and len(v) == len(P1) else v) for k, v in pl1.items() if k != 'w'}
    n = len(P)
    log("body feathers", n, "area %.4f m2" % area)
    Lf = pb['L'] * (0.82 + 0.36 * rng.random(n))
    Wf = Lf * pb['A'] * (0.9 + 0.2 * rng.random(n))
    T = pb['F'] - (pb['F'] * Nn).sum(1, keepdims=True) * Nn
    T = unit(T + np.cross(Nn, unit(T)) * rng.normal(0, 0.12, n)[:, None])
    X = card_grid(P - Nn * 0.0006, T, Nn, Lf, Wf, R=6, C=3, lift=pb['lift'])
    vv = np.linspace(0, 1, 6)[None, :, None]
    uu = np.linspace(-1, 1, 3)[None, None, :]
    h0 = (0.0003 + 0.0009 * rng.random(n)) * (1 - 0.7 * pb['q'][:, 0])
    Hh = h0[:, None, None] + (vv ** 1.2) * (Lf * pb['lift'])[:, None, None] + 0.05 * Wf[:, None, None] * (1 - uu ** 2)
    X = sdf.conform(X, Hh, iters=4)
    flat = X.reshape(n, -1, 3)
    stretched = np.linalg.norm(flat.max(1) - flat.min(1), axis=1) > 1.7 * Lf + 0.002
    log('dropped stretched body feathers', int(stretched.sum()))
    bad = drop_near_eyes(X) | stretched
    X, sel = X[~bad], ~bad
    shape = np.tile([0.32, 2.2, 1.0], (n, 1))
    shape[:, 2] = 1.0 + 0.6 * (pb['L'] < 0.012)
    at = attrs_from(pb['main'], pb['edge'], pb['streak'], pb['p'], pb['q'], shape, n)
    FEATHERS.append(('rr_body_feathers', X, {k: v[sel] for k, v in at.items()}))

    # ------------------------------------------------------------------ crest
    roots, dirs, lens = [], [], []
    for i in range(64):
        a = rng.uniform(-0.024, 0.006)
        b = rng.uniform(-0.009, 0.009) * (1 - 0.3 * (a > 0))
        r0 = sdf.raycast(Hd(a, b, -0.004), unit(HU + HL * b * 10), 0.05)
        back = (0.006 - a) / 0.03
        dvec = unit(HU * (1.0 + 0.3 * rng.random()) - HF * (0.1 + 0.5 * back + rng.uniform(-0.12, 0.12)) + HL * (b * 16 + rng.uniform(-0.15, 0.15)))
        roots.append(r0); dirs.append(dvec)
        lens.append(0.012 + 0.032 * back ** 0.7 * rng.uniform(0.65, 1.2))
    roots, dirs, lens = np.array(roots), np.array(dirs), np.array(lens)
    nC = len(roots)
    Ncard = unit(np.cross(dirs, HL[None, :]))
    X = card_grid(roots - dirs * 0.002, dirs, Ncard, lens, lens * 0.36, R=7, C=3, lift=0.0, curl=-0.35, cup=0.04)
    at = attrs_from(np.tile(H_('#141418'), (nC, 1)), np.tile(H_('#c9b48c'), (nC, 1)), np.tile(H_('#0e0e10'), (nC, 1)),
                    np.column_stack([np.where(rng.random(nC) < 0.45, rng.uniform(0.6, 0.8, nC), 1.2), np.zeros(nC), np.where(rng.random(nC) < 0.6, rng.uniform(0.74, 0.92, nC), 1.2)]),
                    (0.15, 0.6, 0.0), (0.22, 1.6, 1.4), nC)
    FEATHERS.append(('rr_crest', X, at))

    # ------------------------------------------------------------------ tail
    tail_X, tail_at = [], []
    for i in range(5):
        for s in (1, -1):
            Lr = 0.275 - 0.016 * i
            Wr = 0.030 - 0.0012 * i
            root = T0 + TAIL_DN * (-0.0018 * i - 0.0008) + Y * s * (0.0015 + 0.003 * i) - TAIL_DIR * 0.012
            yaw = rad(s * (0.8 + 2.3 * i))
            dvec = unit(TAIL_DIR * math.cos(yaw) + Y * math.sin(yaw))
            X = card_grid(root[None], dvec[None], TAIL_DN[None], [Lr], [Wr], R=14, C=3, lift=0.0, curl=0.07, cup=0.035)
            tail_X.append(X[0])
            if i < 2:
                tail_at.append((H_('#36362a'), H_('#8a8064'), H_('#1a1a14'), (0.92, 0.0, 0.97 if i == 0 else 0.93)))
            else:
                tail_at.append((H_('#22221d'), H_('#efece4'), H_('#141410'), (1.2, 0.0, 0.88 - 0.035 * (i - 2))))
    nT = len(tail_X)
    X = np.array(tail_X)
    at = attrs_from(np.array([a[0] for a in tail_at]), np.array([a[1] for a in tail_at]), np.array([a[2] for a in tail_at]),
                    np.array([a[3] for a in tail_at]), (0.05, 0.9, 0.0), (0.05, 12.0, 0.8), nT)
    # upper and under tail coverts
    cov_X, cov_at = [], []
    for j in range(16):
        upper = j < 10
        s = 1 if j % 2 else -1
        off = TAIL_DN * (0.004 if upper else -0.012) + Y * s * rng.uniform(0, 0.009)
        root = T0 - TAIL_DIR * rng.uniform(0.012, 0.03) + off
        dvec = unit(TAIL_DIR + Y * s * rng.uniform(0, 0.15) + TAIL_DN * (-0.05 if upper else 0.1))
        Lc = rng.uniform(0.035, 0.06) if upper else rng.uniform(0.03, 0.045)
        Xc = card_grid(root[None], dvec[None], (TAIL_DN if upper else -TAIL_DN)[None], [Lc], [Lc * 0.6], R=6, C=3, lift=0.0, curl=0.1)
        cov_X.append(Xc[0])
        cov_at.append((H_('#2c261e') if upper else H_('#4a4034'), H_('#b4a382') if upper else H_('#a89a80'),
                       (0.7 if upper else 1.2, 0.0, 1.2), (0.2 if upper else 0.7, 0.7 if upper else 0.0, 0.0)))
    nCv = len(cov_X)
    atc = attrs_from(np.array([a[0] for a in cov_at]), np.array([a[1] for a in cov_at]), np.tile(H_('#15120e'), (nCv, 1)),
                     np.array([a[2] for a in cov_at]), np.array([a[3] for a in cov_at]), (0.3, 2.2, 1.0), nCv)
    FEATHERS.append(('rr_tail', np.concatenate([X, np.array(cov_X)[:, :, :, :]], 0) if False else X, at))
    FEATHERS.append(('rr_tail_coverts', np.array(cov_X), atc))

    # ------------------------------------------------------------------ folded wings
    for s in (1, -1):
        W0 = np.array([0.052, s * 0.031, 0.18])
        Wt = np.array([-0.078, s * 0.03, 0.112])
        e1 = unit(Wt - W0)
        e2 = unit(DORS - e1 * np.dot(DORS, e1))
        rows = []
        def row(nr, a0, a1, b0, b1, L0, L1, Wd, h0, tilt0, tilt1, col, p, q, shape, jit=0.0):
            for k in range(nr):
                t = k / max(nr - 1, 1)
                a = a0 + (a1 - a0) * t + rng.uniform(-jit, jit)
                b = b0 + (b1 - b0) * t + rng.uniform(-jit, jit)
                tl = rad(tilt0 + (tilt1 - tilt0) * t + rng.uniform(-3, 3))
                rows.append((W0 + e1 * a + e2 * b, unit(e1 * math.cos(tl) - e2 * math.sin(tl)),
                             L0 + (L1 - L0) * t, Wd, h0 + 0.00025 * k / max(nr, 1), col, p, q, shape))
        # primaries (lowest), secondaries, tertials, greater coverts, median + lesser coverts (top)
        row(9, 0.006, 0.020, -0.006, 0.002, 0.1058, 0.0862, 0.0176, 0.0042, 8, -2,
            (H_('#1f1b16'), H_('#d8d0bd'), H_('#111111')), (0.92, 0.0, 0.95), (0.05, 0.6), (0.06, 10.0, 0.8))
        row(8, 0.020, 0.056, 0.002, 0.014, 0.0736, 0.0667, 0.0220, 0.0054, 6, 16,
            (H_('#2a231b'), H_('#ddd0b2'), H_('#111111')), (0.56, 0.0, 0.86), (0.05, 0.6), (0.06, 8.0, 0.8))
        row(3, 0.054, 0.066, 0.015, 0.02, 0.0598, 0.0552, 0.0242, 0.0062, 10, 14,
            (H_('#30271d'), H_('#cdb995'), H_('#111111')), (0.6, 0.0, 0.92), (0.05, 0.6), (0.08, 6.0, 0.8))
        row(10, 0.010, 0.058, 0.010, 0.019, 0.0368, 0.0345, 0.0187, 0.0068, 4, 12,
            (H_('#2b241b'), H_('#ece4d0'), H_('#111111')), (0.5, 0.0, 0.76), (0.08, 0.6), (0.2, 3.0, 1.0))
        for k in range(4):
            row(12, 0.0 + 0.004 * k, 0.05 + 0.004 * k, 0.018 + 0.0045 * k, 0.026 + 0.0045 * k, 0.019 - 0.002 * k, 0.017 - 0.002 * k,
                0.013, 0.0074 + 0.0004 * k, 2, 10, (H_('#2d251c'), H_('#d9caa8'), H_('#111111')), (0.5, 0.0, 0.8), (0.1, 0.6),
                (0.3, 2.2, 1.0), jit=0.002)
        nW = len(rows)
        Pw = np.array([r[0] for r in rows]); Dw = np.array([r[1] for r in rows])
        Lw = np.array([r[2] for r in rows]); Ww = np.array([r[3] for r in rows]); hw = np.array([r[4] for r in rows])
        Nw = unit(np.cross(Dw, np.cross(Y * s, Dw)))       # roughly outward, perpendicular to the feather
        Nw = Nw * np.sign((Nw @ (Y * s)))[:, None]
        X = card_grid(Pw, Dw, Nw, Lw, Ww, R=8, C=3, lift=0.0)
        vv = np.linspace(0, 1, 8)[None, :, None]
        uu = np.linspace(-1, 1, 3)[None, None, :]
        Hh = hw[:, None, None] + vv * Lw[:, None, None] * 0.05 + 0.04 * Ww[:, None, None] * (1 - uu ** 2)
        X = sdf.conform(X, Hh, iters=4)
        at = attrs_from(np.array([r[5][0] for r in rows]), np.array([r[5][1] for r in rows]), np.array([r[5][2] for r in rows]),
                        np.array([r[6] for r in rows]), np.array([(r[7][0], r[7][1], 0) for r in rows]),
                        np.array([r[8] for r in rows]), nW)
        FEATHERS.append(('rr_wing_%s' % ('L' if s > 0 else 'R'), X, at))

    for name, X, at in FEATHERS:
        flat = X.reshape(len(X), -1, 3)
        ext = np.linalg.norm(flat.max(1) - flat.min(1), axis=1)
        top = np.argsort(-ext)[:3]
        log('  %s max extent %s at %s' % (name, np.round(ext[top], 3), [np.round(flat[i].mean(0), 3).tolist() for i in top]))
        if os.environ.get('RR_DEBUG'):
            log('    x-range', np.round(flat[top[0]][:, 0].min(), 3), np.round(flat[top[0]][:, 0].max(), 3))
        make_cards(name, X, at, mat_f, C_RR)

# ======================================================================================== scene + renders
res = (1920, 1080) if Q == 'final' else (1280, 720)
spp = 512 if Q == 'final' else (32 if CLAY else 128)
setup_cycles(spp, res)
if SCENE == 'studio' and os.environ.get('RR_KEEP') != '1':
    studio(bg=(0.16, 0.16, 0.17))
cam = camera((0.0, -1.3, 0.2), (0.0, 0, 0.17), 85)
shots = {
    'side': ((-0.03, -1.95, 0.2), (-0.03, 0, 0.19), 85),
    '34': ((1.0, -1.35, 0.34), (-0.01, 0, 0.19), 85),
    'front': ((1.2, -0.15, 0.22), (0.02, 0, 0.17), 85),
    'head': ((0.33, -0.26, 0.31), tuple(Hd(0.01, 0, 0.0)), 100),
    'rear': ((-0.9, -0.8, 0.35), (-0.03, 0, 0.17), 85),
    'feet': ((0.2, -0.3, 0.06), (0.0, 0, 0.03), 85),
}
tagname = 'clay' if CLAY else 'feathers'
for v in VIEWS:
    if v not in shots:
        continue
    loc, tgt, lens = shots[v]
    look(cam, loc, tgt, lens)
    render(os.path.join(RENDERS, 'roadrunner_%s_%s.png' % (tagname, v)))

if os.environ.get('RR_SAVE'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'roadrunner.blend'), compress=True)
    log("saved blend")
log("done")
