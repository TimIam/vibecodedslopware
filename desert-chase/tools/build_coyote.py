# Photoreal coyote (Canis latrans), built procedurally in Blender 5.1.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python roadrunner-coyote/tools/build_coyote.py
#
# Env: CY_STAGE=clay|fur (default fur)   CY_Q=preview|final   CY_VIEWS=side,34,head,front   CY_FUR=1.0 (strand count scale)
#      CY_SCENE=studio|desert            CY_SAVE=1 (write out/coyote.blend)
# Units: metres. Animal faces +X, left side is +Y, ground is z = 0. Shoulder height ~0.6 m, nose to tail tip ~1.25 m.

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
STAGE = os.environ.get('CY_STAGE', 'fur')
Q = os.environ.get('CY_Q', 'preview')
VIEWS = os.environ.get('CY_VIEWS', 'side,34,head').split(',')
FURSCALE = float(os.environ.get('CY_FUR', '1.0'))
SCENE = os.environ.get('CY_SCENE', 'studio')
rng = np.random.default_rng(7)

reset_scene()
C_COY = collection('coyote')

# ======================================================================================== skeleton landmarks
HEAD_PITCH = -18.0
C = np.array([0.47, 0.0, 0.594])
HS = 1.1             # head scale
RH = basis((math.cos(rad(HEAD_PITCH)), 0, math.sin(rad(HEAD_PITCH))))
HF, HL, HU = RH[:, 0], RH[:, 1], RH[:, 2]
def H(a, b=0.0, c=0.0):
    return C + HS * (a * HF + b * HL + c * HU)

prims = []
def P_(p):
    prims.extend(p if isinstance(p, list) else [p])
    return p

# ---------------------------------------------------------------------------------------- torso
TORSO_FLOW = (-1, 0, -0.15)
torso = [
    Ell((0.06, 0, 0.462), (0.185, 0.085, 0.128), rotm(ry=5), 'torso', flow=TORSO_FLOW),          # ribcage
    Ell((0.215, 0, 0.455), (0.075, 0.068, 0.095), rotm(ry=20), 'torso', flow=TORSO_FLOW),        # prosternum / chest
    Ell((-0.12, 0, 0.484), (0.155, 0.07, 0.08), rotm(ry=3), 'torso', flow=TORSO_FLOW),           # abdomen (tucked)
    Ell((-0.285, 0, 0.505), (0.10, 0.066, 0.072), rotm(ry=-12), 'torso', flow=TORSO_FLOW),       # pelvis / croup
]
neck = chain([(0.415, 0, 0.582), (0.34, 0, 0.55), (0.26, 0, 0.505)], [0.048, 0.058, 0.068], 'neck',
             scale=(1, 0.8, 1), flow=(-0.75, 0, -0.55))
P_(torso); P_(neck)

GROUPS = []          # (prims, k_into_body, inner_blend)
for s in (1, -1):
    up_f = [Ell((0.18, s * 0.048, 0.478), (0.07, 0.03, 0.105), rotm(ry=-25), 'shoulder', flow=(-0.5, 0, -1)),
            Ell((0.165, s * 0.052, 0.37), (0.055, 0.032, 0.065), rotm(ry=20), 'uarm', flow=(-0.1, 0, -1)),
            Cone((0.235, s * 0.054, 0.43), (0.15, s * 0.055, 0.32), 0.036, 0.027, 'uarm', flow=(-0.1, 0, -1))]
    lo_f = [Cone((0.148, s * 0.056, 0.32), (0.158, s * 0.054, 0.12), 0.026, 0.0152, 'farm', flow=(-0.05, 0, -1)),
            Ell((0.126, s * 0.056, 0.32), (0.02, 0.016, 0.02), None, 'farm', flow=(-0.05, 0, -1)),
            Ell((0.155, s * 0.056, 0.25), (0.021, 0.019, 0.06), None, 'farm', flow=(-0.05, 0, -1)),
            Ell((0.159, s * 0.054, 0.10), (0.016, 0.015, 0.018), None, 'fmeta', flow=(0.05, 0, -1)),
            Cone((0.159, s * 0.054, 0.10), (0.172, s * 0.054, 0.035), 0.0155, 0.0145, 'fmeta', flow=(0.1, 0, -1))]
    up_h = [Ell((-0.27, s * 0.058, 0.44), (0.08, 0.042, 0.118), rotm(ry=-15), 'thigh', flow=(-0.5, 0, -1)),
            Ell((-0.33, s * 0.054, 0.40), (0.04, 0.036, 0.09), rotm(ry=-20), 'thigh', flow=(-0.4, 0, -1)),
            Ell((-0.215, s * 0.066, 0.335), (0.022, 0.022, 0.026), None, 'thigh', flow=(-0.3, 0, -1))]
    lo_h = [Cone((-0.22, s * 0.065, 0.335), (-0.345, s * 0.06, 0.155), 0.030, 0.0145, 'shank', flow=(0.05, 0, -1)),
            Ell((-0.30, s * 0.062, 0.265), (0.032, 0.022, 0.085), rotm(ry=35), 'shank', flow=(0.0, 0, -1)),
            Ell((-0.355, s * 0.06, 0.155), (0.015, 0.013, 0.017), None, 'hmeta', flow=(0.05, 0, -1)),
            Ell((-0.362, s * 0.06, 0.166), (0.008, 0.008, 0.01), None, 'hmeta', flow=(0.05, 0, -1)),
            Cone((-0.35, s * 0.06, 0.15), (-0.335, s * 0.059, 0.035), 0.015, 0.014, 'hmeta', flow=(0.1, 0, -1))]
    GROUPS += [(up_f, 0.035, 0.02), (lo_f, 0.02, 0.006), (up_h, 0.04, 0.04), (lo_h, 0.02, 0.006)]
    P_(up_f + lo_f + up_h + lo_h)

TOES = []   # (centre, radius) for claws
for s in (1, -1):
    for (px, py, tag) in ((0.182, s * 0.054, 'fpaw'), (-0.322, s * 0.059, 'hpaw')):
        paw = [Ell((px, py, 0.019), (0.031, 0.022, 0.017), rotm(ry=5), tag, flow=(1, 0, -0.25))]
        for dx, dy, r in ((0.021, 0.0075, 0.0092), (0.021, -0.0075, 0.0092), (0.012, 0.0192, 0.0087), (0.012, -0.0192, 0.0087)):
            c = (px + dx, py + dy, 0.0112)
            paw.append(Ell(c, (r * 1.15, r, r * 1.05), None, tag, flow=(1, 0, -0.25)))
            TOES.append((np.array(c), r))
        GROUPS.append((paw, 0.008, 0.004))
        P_(paw)

# ---------------------------------------------------------------------------------------- head
HEADF = tuple(-HF + 0.12 * HU)
head = [
    Ell(H(-0.005, 0, 0.002), (0.06, 0.054, 0.041), RH, 'head', flow=HEADF),
    Ell(H(-0.043, 0, -0.002), (0.03, 0.04, 0.037), RH, 'head', flow=HEADF),
    Ell(H(0.05, 0.021, 0.018), (0.026, 0.018, 0.015), RH, 'head', flow=HEADF),
    Ell(H(0.05, -0.021, 0.018), (0.026, 0.018, 0.015), RH, 'head', flow=HEADF),
    Ell(H(0.015, 0, 0.021), (0.042, 0.036, 0.016), RH, 'head', flow=HEADF),
    Ell(H(0.012, 0.039, -0.022), (0.046, 0.025, 0.031), RH, 'cheek', flow=tuple(-HF - 0.5 * HU)),
    Ell(H(0.012, -0.039, -0.022), (0.046, 0.025, 0.031), RH, 'cheek', flow=tuple(-HF - 0.5 * HU)),
    Cone(H(0.046, 0, -0.007), H(0.14, 0, -0.012), 0.034, 0.0182, 'muzzle', scale=(1, 0.84, 1), flow=tuple(-HF)),
    Cone(H(0.04, 0, 0.008), H(0.13, 0, -0.002), 0.021, 0.0132, 'muzzle', scale=(1, 0.9, 1), flow=tuple(-HF)),
    Cone(H(0.056, 0.018, -0.031), H(0.132, 0.009, -0.025), 0.015, 0.008, 'muzzle', flow=tuple(-HF)),
    Cone(H(0.056, -0.018, -0.031), H(0.132, -0.009, -0.025), 0.015, 0.008, 'muzzle', flow=tuple(-HF)),
    Cone(H(0.0, 0, -0.036), H(0.138, 0, -0.033), 0.023, 0.0122, 'jaw', scale=(1, 0.85, 1), flow=tuple(-HF - 0.4 * HU)),
    Ell(H(0.118, 0.0135, -0.017), (0.024, 0.0085, 0.012), RH, 'muzzle', flow=tuple(-HF)),       # whisker pads
    Ell(H(0.118, -0.0135, -0.017), (0.024, 0.0085, 0.012), RH, 'muzzle', flow=tuple(-HF)),
]
for p in head:
    if isinstance(p, Ell):
        p.r = p.r * HS
    else:
        p.ra *= HS
        p.rb *= HS
P_(head)
NOSE_A = 0.151      # head-forward coordinate of the nose pad centre

tail = chain([(-0.37, 0, 0.53), (-0.42, 0, 0.47), (-0.46, 0, 0.39), (-0.48, 0, 0.30), (-0.485, 0, 0.215)],
             [0.026, 0.023, 0.019, 0.015, 0.011], 'tail', flow='axis')
P_(tail)

# ======================================================================================== body SDF
sdf = SDF((-0.62, -0.17, -0.012), (0.72, 0.17, 0.80), 0.0026 if Q == 'final' else 0.003)
sdf.add(torso, k=0.05)
sdf.group(neck, k=0.04)
for g, k, inner in GROUPS:
    sdf.group(g, k=k, inner=inner)
sdf.add(head[:7], k=0.02)
sdf.add(head[7:], k=0.014)
sdf.group(tail, k=0.025)

# eyes: find the surface where the eye sits, wrap the eyeball in lids, cut an almond opening
ER = 0.0096 * HS
EYES = []
for s in (1, -1):
    d = unit(s * HL * 0.9 + HF * 0.3 + HU * 0.18)
    S = sdf.raycast(H(0.056, 0, 0.017), d, 0.08)
    gaze = unit(HF * 0.80 + s * HL * 0.55 + HU * 0.12)
    a1 = HF - 0.25 * HU
    a1 = unit(a1 - d * np.dot(a1, d))
    a2 = np.cross(d, a1)
    Rs = np.stack([a1, a2, d], 1)
    Ec = S - d * 0.0082 * HS
    g1 = HF - 0.34 * HU
    g1 = unit(g1 - gaze * np.dot(g1, gaze))
    Rg = np.stack([g1, np.cross(gaze, g1), gaze], 1)
    sdf.add(Ell(Ec, np.array([ER + 0.0012, ER + 0.0011, ER + 0.0009]), Rg), k=0.005)                       # lid bulb
    g2 = np.cross(gaze, g1)
    sdf.add(almond(Ec + gaze * 0.0115 * HS, g1, g2, gaze, 0.0068 * HS, 0.0027 * HS, 0.02 * HS), k=0.0009, sub=True)   # almond opening
    EYES.append(dict(S=S, d=d, gaze=gaze, center=Ec, s=s, a1=a1))

# mouth line: walk along the lips and groove them
MOUTH = []
for s in (1, -1):
    line = []
    for a in np.linspace(0.055, NOSE_A - 0.002, 14):
        c = np.interp(a, [0.055, NOSE_A], [-0.031, -0.026])
        line.append(sdf.raycast(H(a, 0, c), s * HL, 0.06))
    line = np.array(line)
    for i in range(len(line) - 1):
        sdf.add(Cone(line[i] + s * HL * 0.0012, line[i + 1] + s * HL * 0.0012, 0.0015, 0.0015), k=0.0015, sub=True)
    MOUTH.append(line)

body = sdf.mesh('coyote_body', smooth_iter=3)
body.parent = None
C_COY.objects.link(body)
bpy.context.scene.collection.objects.unlink(body)

# nose leather: separate fine SDF
nose_sdf = SDF(H(0.15, 0, 0) - 0.03, H(0.15, 0, 0) + 0.045, 0.0007)
NOSE = Ell(H(NOSE_A, 0, -0.008), np.array([0.0122, 0.0128, 0.0106]) * HS, RH)
nose_sdf.add(NOSE)
nose_sdf.add(Ell(H(NOSE_A - 0.008, 0, -0.004), np.array([0.011, 0.011, 0.011]) * HS, RH), k=0.004)
for s in (1, -1):
    Rn = RH @ rotm(rz=s * 25)
    nose_sdf.add(Ell(H(NOSE_A + 0.010, s * 0.0058, -0.006), np.array([0.0042, 0.0024, 0.0039]) * HS, Rn), k=0.0015, sub=True)
    nose_sdf.add(Cone(H(NOSE_A + 0.008, s * 0.0056, -0.007), H(NOSE_A + 0.001, s * 0.0118, -0.0098), 0.0012 * HS, 0.0006 * HS), k=0.001, sub=True)
nose_sdf.add(Ell(H(NOSE_A + 0.011, 0, -0.0145), np.array([0.003, 0.0008, 0.0058]) * HS, RH), k=0.001, sub=True)
nose = nose_sdf.mesh('coyote_nose', smooth_iter=2)

# ======================================================================================== ears
def ear_surface(s, S_, A_):
    E0 = H(-0.032, s * 0.039, 0.021)
    eu = unit(HU + s * 0.50 * HL - 0.12 * HF)
    ef = unit(HF + s * 0.6 * HL)
    ef = unit(ef - eu * np.dot(ef, eu))
    es = unit(np.cross(ef, eu))
    h, W = 0.112 * HS, 0.043 * HS
    S_ = np.asarray(S_, float)
    A_ = np.asarray(A_, float)
    sc = np.clip(S_, 0, 1)
    w = np.where(S_ >= 0, W * (1 - sc) ** 0.8 * (1 + 0.3 * np.sin(PI * sc)), W * (1 - S_ * 0.5))
    cup = 0.9 * (1 - sc) ** 1.1 + 0.06
    P = (E0 + eu * (h * S_)[..., None] + es * (A_ * w)[..., None]
         - ef * ((1 - A_ ** 2) * cup * W)[..., None] - ef * (0.010 * sc ** 2)[..., None])
    return P, ef, eu, es

def ear_mesh(s):
    ns, na = 44, 26
    Ss = np.linspace(-0.18, 1.0, ns)
    As = np.linspace(-1, 1, na)
    SS, AA = np.meshgrid(Ss, As, indexing='ij')
    P, ef, eu, es = ear_surface(s, SS, AA)
    V = P.reshape(-1, 3)
    F = []
    for i in range(ns - 1):
        for j in range(na - 1):
            q = [i * na + j, i * na + j + 1, (i + 1) * na + j + 1, (i + 1) * na + j]
            F.append(q if s > 0 else q[::-1])
    ob = mesh_object('coyote_ear_%s' % ('L' if s > 0 else 'R'), V, np.array(F), C_COY)
    so = ob.modifiers.new('thick', 'SOLIDIFY')
    so.thickness = 0.0042
    so.offset = 0.0
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1
    apply_mods(ob)
    return ob

EARS = [ear_mesh(1), ear_mesh(-1)]

# ======================================================================================== coat (colour/length/flow)
def pal(base, band, tip, bs, ts, ta):
    return (hexc(base), hexc(band), hexc(tip), np.array([bs, ts, ta]))
GRIZ = pal('#463b31', '#b49b76', '#0e0b09', 0.36, 0.60, 1.00)
SADL = pal('#322c27', '#958470', '#0b0907', 0.34, 0.55, 1.00)
FLANK = pal('#604c38', '#c09e70', '#2a1f16', 0.38, 0.70, 0.85)
CREAM = pal('#b5a891', '#cfc4b0', '#c9bda8', 0.50, 0.90, 0.00)
RUF = pal('#5c3e2a', '#9c7050', '#3e2a1c', 0.40, 0.80, 0.6)
RUFL = pal('#5e4c3c', '#9c8466', '#4a3a2c', 0.40, 0.82, 0.5)
HEADG = pal('#4e4034', '#b49a76', '#120e0a', 0.38, 0.6, 1.0)
PALE = pal('#8a7c6c', '#ddd0bc', '#b4a690', 0.45, 0.85, 0.2)
CHEEK = pal('#76665a', '#d0c0a6', '#3a2e24', 0.42, 0.76, 0.7)
DARK = pal('#2a211a', '#3a2e25', '#15100c', 0.50, 0.80, 0.80)
FACE = pal('#574333', '#ae8860', '#2e241b', 0.42, 0.76, 0.75)
LEGIN = pal('#7a6550', '#9c8468', '#8a7460', 0.50, 0.90, 0.00)
MUZ = pal('#644530', '#ad8256', '#2a1e14', 0.38, 0.68, 0.85)

def mixpal(items):
    wsum = sum(w for _, w in items) + 1e-9
    out = [0, 0, 0, 0]
    for p, w in items:
        wn = (w / wsum)[:, None]
        for i in range(4):
            out[i] = out[i] + p[i][None, :] * wn
    return out

def blotch(P, seed=3):
    """Smooth low-frequency variation in [-1, 1] so the coat is not a flat colour."""
    r = np.random.default_rng(seed)
    v = 0.0
    for f in (18.0, 41.0, 90.0):
        k = unit(r.normal(size=3)) * f
        k2 = unit(r.normal(size=3)) * f * 0.7
        v = v + np.sin(P @ k + r.random() * 6.28) * np.sin(P @ k2 + r.random() * 6.28) * (18.0 / f) ** 0.5
    return np.clip(v, -1, 1)

def seg_dist(P, line):
    best = np.full(len(P), 1e9)
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        ba = b - a
        t = np.clip(((P - a) @ ba) / np.dot(ba, ba), 0, 1)
        best = np.minimum(best, np.linalg.norm(P - (a + t[:, None] * ba), axis=1))
    return best

def coat(P, Nn):
    w, flow, par = tag_fields(prims, P, sigma=0.008)
    z0 = np.zeros(len(P))
    W = lambda t: w.get(t, z0)
    nz, ny, nx = Nn[:, 2], Nn[:, 1], Nn[:, 0]
    side = np.sign(P[:, 1] + 1e-9)
    dors = smoothstep(0.25, 0.85, nz)
    vent = smoothstep(-0.2, -0.75, nz)
    inner = smoothstep(0.15, 0.85, -ny * side)
    saddle = dors * smoothstep(-0.05, 0.08, P[:, 0]) * smoothstep(0.34, 0.2, P[:, 0])
    ha = (P - C) @ HF                       # head-forward coordinate
    hn = Nn @ HU                            # head-up facing
    ha_u = ha / HS                          # head coordinates in the unscaled head frame
    hb_u = np.abs((P - C) @ HL) / HS
    eyed = np.min(np.stack([np.linalg.norm(P - e['S'], axis=1) for e in EYES]), 0) / HS if EYES else z0 + 1
    bridge = smoothstep(0.035, 0.065, ha_u) * smoothstep(0.02, 0.007, hb_u) * smoothstep(-0.1, 0.4, hn)
    around_eye = smoothstep(0.032, 0.012, eyed)
    behind_ear = smoothstep(-0.012, -0.04, ha_u) * smoothstep(0.012, 0.03, hb_u)
    backleg = smoothstep(-0.3, -0.85, nx)    # back of the legs gets feathering
    brow = z0.copy(); eyeline = z0 + 1.0
    for e in EYES:
        brow = np.maximum(brow, smoothstep(0.012, 0.004, np.linalg.norm(P - (e['S'] + HU * 0.011 * HS - HF * 0.002), axis=1)))
        eyeline = np.minimum(eyeline, seg_dist(P, np.array([e['S'] - HF * 0.007 * HS, e['S'] - HF * 0.022 * HS + HU * 0.002 * HS])))
    eyeline = smoothstep(0.003, 0.0012, eyeline)
    # -- length
    Lt = {
        'torso': 0.05 + 0.028 * dors - 0.02 * vent + 0.016 * saddle,
        'shoulder': 0.058 + 0.014 * dors,
        'neck': 0.08 + 0.016 * dors - 0.012 * vent,
        'head': 0.014 + 0.018 * smoothstep(0.0, -0.06, ha) + 0.012 * behind_ear,
        'cheek': 0.032 + 0.032 * smoothstep(0.035, -0.03, ha),
        'muzzle': 0.0072 + 0.005 * smoothstep(0.08, 0.04, ha),
        'jaw': 0.008 + 0.014 * smoothstep(0.06, -0.02, ha),
        'uarm': 0.04 + z0, 'farm': 0.026 - 0.012 * par.get('farm', z0) + 0.012 * backleg,
        'fmeta': 0.012 + 0.006 * backleg, 'fpaw': 0.008 + z0,
        'thigh': 0.044 + 0.014 * smoothstep(-0.28, -0.38, P[:, 0]) + 0.012 * backleg,
        'shank': 0.032 - 0.015 * par.get('shank', z0) + 0.014 * backleg, 'hmeta': 0.012 + 0.008 * backleg, 'hpaw': 0.008 + z0,
        'tail': 0.072 + 0.03 * smoothstep(0.0, 0.4, par.get('tail', z0)),
    }
    lift_t = {'torso': 0.34, 'shoulder': 0.34, 'neck': 0.56, 'head': 0.22, 'cheek': 0.7, 'muzzle': 0.12,
              'jaw': 0.25, 'uarm': 0.24, 'farm': 0.24, 'fmeta': 0.24, 'fpaw': 0.22, 'thigh': 0.32, 'shank': 0.26,
              'hmeta': 0.24, 'hpaw': 0.22, 'tail': 0.8}
    L = sum(W(t) * Lt[t] for t in Lt)
    lift = sum(W(t) * lift_t[t] for t in lift_t)
    F = sum(W(t)[:, None] * unit(flow[t]) for t in flow)
    # -- colour
    tp = par.get('tail', z0)
    front = smoothstep(0.55, 0.85, nx) * (1 - inner)
    lips = seg_dist(P, MOUTH[0]) if len(MOUTH) else z0 + 1
    lips = np.minimum(lips, seg_dist(P, MOUTH[1]))
    groups = {
        'torso': [(GRIZ, dors), (FLANK, (1 - dors) * (1 - vent)), (CREAM, vent * 1.3), (SADL, saddle * 1.5)],
        'shoulder': [(GRIZ, dors), (FLANK, 1 - dors), (SADL, saddle)],
        'neck': [(GRIZ, dors), (FACE, (1 - dors) * (1 - vent)), (CREAM, vent * 1.6)],
        'head': [(HEADG, 1 + z0), (MUZ, 1.3 * around_eye + 1.6 * bridge), (RUF, 1.4 * behind_ear), (PALE, 2.5 * brow), (DARK, 4 * eyeline)],
        'cheek': [(CHEEK, 1 + z0), (HEADG, 0.8 * smoothstep(-0.1, 0.5, hn)), (FACE, 0.8 * around_eye), (CREAM, 0.5 * smoothstep(-0.2, -0.7, hn)), (DARK, 4 * eyeline)],
        'muzzle': [(HEADG, 1.2 * smoothstep(0.2, 0.7, hn)), (MUZ, 1.2 * smoothstep(0.75, 0.1, hn) + 0.8 * bridge), (RUFL, 0.7 * (1 - smoothstep(-0.2, 0.4, hn))),
                   (CREAM, 1.6 * smoothstep(0.016, 0.003, lips) * smoothstep(0.3, -0.3, hn))],
        'jaw': [(CREAM, 1 + z0)],
        'uarm': [(FLANK, (1 - inner) * smoothstep(0.28, 0.44, P[:, 2])), (RUF, (1 - inner) * smoothstep(0.44, 0.28, P[:, 2])), (CREAM, inner)],
        'farm': [(RUF, 1 - inner), (LEGIN, inner), (DARK, front * 1.4)],
        'fmeta': [(RUFL, 1 - inner), (LEGIN, inner * 0.7), (DARK, front * 0.9)],
        'fpaw': [(RUFL, 1 + z0)],
        'thigh': [(FLANK, (1 - inner) * smoothstep(0.30, 0.42, P[:, 2])), (RUF, (1 - inner) * smoothstep(0.42, 0.28, P[:, 2])), (CREAM, inner)],
        'shank': [(RUF, 1 - inner), (LEGIN, inner)],
        'hmeta': [(RUFL, 1 - inner), (LEGIN, inner * 0.7)],
        'hpaw': [(RUFL, 1 + z0)],
        'tail': [(GRIZ, dors + 0.3), (RUFL, vent * 0.8), (DARK, 4 * smoothstep(0.70, 0.84, tp) + 2 * dors * np.exp(-((tp - 0.22) / 0.06) ** 2))],
    }
    base = np.zeros((len(P), 3)); band = np.zeros((len(P), 3)); tip = np.zeros((len(P), 3)); bp = np.zeros((len(P), 3))
    for t, items in groups.items():
        wt = W(t)
        if wt.max() < 1e-4:
            continue
        b0, b1, b2, b3 = mixpal(items)
        base += wt[:, None] * b0; band += wt[:, None] * b1; tip += wt[:, None] * b2; bp += wt[:, None] * b3
    # eyes / lips / nose masks
    keep = np.ones(len(P), bool)
    eye_near = np.full(len(P), 1.0)
    for e in EYES:
        de = np.linalg.norm(P - e['center'], axis=1) - ER       # distance from the eyeball surface
        keep &= de > 0.0015
        eye_near = np.minimum(eye_near, de)
        L = L * (0.55 + 0.45 * smoothstep(0.0015, 0.01, de))
    keep &= lips > 0.0016
    L = L * (0.6 + 0.4 * smoothstep(0.002, 0.008, lips))
    keep &= NOSE.dist(P) > 0.0015
    return dict(L=L, lift=lift, F=F, base=base, band=band, tip=tip, bp=bp, keep=keep, lips=lips,
                eye=eye_near, w=w, dors=dors, vent=vent)

# ---------------------------------------------------------------------------------------- skin colours
V, VN, TRI = mesh_arrays(body)
cv = coat(V, VN)
skin = cv['base'] * 0.55 + cv['band'] * 0.4
dark_skin = hexc('#1a1512')
blk = np.maximum.reduce([smoothstep(0.0024, 0.0008, cv['lips']),
                         smoothstep(0.0016, 0.0009, cv['eye']),
                         smoothstep(0.006, 0.002, NOSE.dist(V))])
skin = skin * (1 - blk[:, None]) + dark_skin * blk[:, None]
set_point_color(body, 'skin_col', skin)

mat_skin = mat_principled('coyote_skin', attr='skin_col', rough=0.55, sss=0.05)
mat_nose = mat_principled('coyote_nose', hexc('#141110'), rough=0.36, bump=(900, 0.45, 0.0006), coat=0.3)
mat_ear = mat_principled('coyote_ear_skin', hexc('#3e302a'), rough=0.6, sss=0.15, sss_rad=(0.003, 0.0015, 0.0008))
mat_claw = mat_principled('coyote_claw', hexc('#221b16'), rough=0.3)
mat_iris = mat_eye('coyote_iris', hexc('#e0b04c'), hexc('#a87430'), hexc('#2a1c10'), hexc('#2a1d14'), pupil_r=0.31, iris_r=0.82, radius=0.0096 * 1.1)
mat_cor = mat_cornea()
CLAY = STAGE == 'clay'
clay = mat_clay() if CLAY else None
body.data.materials.append(clay or mat_skin)
nose.data.materials.append(clay or mat_nose)
for e in EARS:
    e.data.materials.append(clay or mat_ear)
for e in EYES:
    eyeball('coyote_eye_%s' % ('L' if e['s'] > 0 else 'R'), e['center'], e['gaze'], ER, mat_iris, mat_cor, C_COY)

# claws
for (c, r) in TOES:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r * 0.32, radius2=r * 0.05, depth=r * 1.1)
    ob = bm_object('claw', bm, C_COY)
    ob.data.materials.append(clay or mat_claw)
    dirv = unit(np.array([1.0, 0, -0.8]))
    tipc = c + np.array([r * 1.05, 0, -r * 0.25])
    q = Vector(dirv).to_track_quat('Z', 'Y')
    ob.matrix_world = Matrix.Translation(Vector(tipc + dirv * r * 0.45)) @ q.to_matrix().to_4x4()
nose.parent = None
C_COY.objects.link(nose)
bpy.context.scene.collection.objects.unlink(nose)

# ======================================================================================== fur
if not CLAY:
    mat_fur = mat_hair('coyote_fur', rough=0.30, radial=0.4, coat=0.2)
    mat_under = mat_hair('coyote_underfur', rough=0.45, radial=0.6, coat=0.0)

    def sample_coat(count, coverage_len_floor=0.002):
        # draw roots with density ~ 1/(L + floor): short fur needs more strands to cover
        P0, N0, area = sample_surface(V, VN, TRI, 200000, rng)
        c0 = coat(P0, N0)
        dens0 = 1.0 / (c0['L'] + coverage_len_floor) ** 1.15
        acc = (dens0 / dens0.max())[c0['keep']].mean() * c0['keep'].mean()
        M = int(count / max(acc, 1e-3) * 1.02)
        out = []
        for s0 in range(0, M, 600000):
            m = min(600000, M - s0)
            Pm, Nm, _ = sample_surface(V, VN, TRI, m, rng)
            cm = coat(Pm, Nm)
            dm = 1.0 / (cm['L'] + coverage_len_floor) ** 1.15
            ok = cm['keep'] & (rng.random(m) < dm / dens0.max())
            out.append((Pm[ok], Nm[ok], {k: (v[ok] if isinstance(v, np.ndarray) and len(v) == m else v) for k, v in cm.items() if k != 'w'}))
        P = np.concatenate([o[0] for o in out]); Nn = np.concatenate([o[1] for o in out])
        cc = {k: np.concatenate([o[2][k] for o in out]) for k in out[0][2]}
        log("coat sample", len(P), "of", M, "area %.3f m2" % area)
        return P, Nn, cc

    NG = int((1300000 if Q == 'final' else 700000) * FURSCALE)
    P, Nn, cc = sample_coat(NG)
    n = len(P)
    L = cc['L'] * (0.6 + 0.8 * rng.random(n) ** 1.3)
    jit = (0.86 + 0.28 * rng.random(n)) * (1 + 0.14 * blotch(P))
    jit = jit[:, None]
    K = 7
    pts = grow_strands(P, Nn, cc['F'], L, cc['lift'], K, rng, droop=0.55, gravity=0.12, spread=0.18,
                       jitter=0.09, clump=0.5 * smoothstep(0.015, 0.05, L), clump_size=0.012)
    el = ((pts[:, -1] - pts[:, 0]) * Nn).sum(1) / L
    ln = np.linalg.norm(pts[:, -1] - pts[:, 0], axis=1) / L
    bad = (el > 0.6) | (ln > 1.3)
    log("spike check: %d strands el>0.6 or stretched" % bad.sum())
    if bad.any():
        ib = np.where(bad)[0][:6]
        for i in ib:
            log("  root", np.round(P[i], 3), "n", np.round(Nn[i], 2), "L %.3f lift %.2f" % (L[i], cc['lift'][i]),
                "F", np.round(cc['F'][i], 2), "el %.2f ln %.2f" % (el[i], ln[i]))
    bp = cc['bp'].copy()
    bp[:, 2] *= (rng.random(n) < 0.78)          # not every guard hair has a black tip: salt and pepper
    make_curves('coyote_guard_hair', pts, rr if False else strand_radius(n, K, np.clip(0.00007 + L * 0.0009, 0.00006, 0.00012)),
                {'c_base': cc['base'] * jit, 'c_band': cc['band'] * jit, 'c_tip': cc['tip'] * jit, 'c_bp': bp},
                mat_fur, C_COY)
    # underfur: shorter, wavy, lighter, only where the coat is long enough to have it
    NU = int((700000 if Q == 'final' else 400000) * FURSCALE)
    P, Nn, cc = sample_coat(NU, coverage_len_floor=0.03)
    ok = cc['L'] > 0.016
    P, Nn = P[ok], Nn[ok]
    cc = {k: v[ok] for k, v in cc.items()}
    n = len(P)
    L = cc['L'] * (0.45 + 0.2 * rng.random(n))
    under = cc['base'] * 0.6 + cc['band'] * 0.3
    jit = (0.9 + 0.2 * rng.random(n))[:, None]
    pts = grow_strands(P, Nn, cc['F'], L, cc['lift'] + 0.35, 6, rng, droop=0.3, gravity=0.1, spread=0.6,
                       jitter=0.12, wave=0.35, wave_freq=2.5, clump=0.2, clump_size=0.006)
    rr = strand_radius(n, 6, 0.0001)
    make_curves('coyote_underfur', pts, rr, {'c_base': under * jit, 'c_band': under * jit, 'c_tip': under * jit * 1.1,
                                             'c_bp': np.tile([0.5, 0.9, 0.0], (n, 1))}, mat_under, C_COY)

    # ear fur: short rufous on the back, long pale furnishings inside
    for s, ear in zip((1, -1), EARS):
        m = int(60000 * FURSCALE)
        Ss = rng.random(m) ** 0.9 * 1.0
        As = rng.uniform(-1, 1, m)
        Pe, ef, eu, es = ear_surface(s, Ss, As)
        dS = (ear_surface(s, Ss + 1e-3, As)[0] - Pe) / 1e-3
        dA = (ear_surface(s, Ss, As + 1e-3)[0] - Pe) / 1e-3
        nf = unit(np.cross(dA, dS))
        nf = nf * np.sign((nf @ ef))[:, None]
        back = rng.random(m) < 0.66
        nrm = np.where(back[:, None], -nf, nf)
        root = Pe + nrm * 0.0013
        up = unit(dS)
        edge = np.abs(As)
        Lr = np.where(back, 0.008 + 0.016 * (1 - Ss) ** 2, 0.014 + 0.024 * smoothstep(0.3, 0.95, edge) * (1 - Ss) + 0.02 * (1 - Ss) ** 3)
        keep = back | (edge > 0.35) | (Ss < 0.35)
        flowv = np.where(back[:, None], up, unit(up * 0.8 - es[None, :] * As[:, None] * 0.6))
        liftv = np.where(back, 0.15, 0.55)
        root, nrm, Lr, flowv, liftv, backk = root[keep], nrm[keep], Lr[keep], flowv[keep], liftv[keep], back[keep]
        Sk, Ak = Ss[keep], As[keep]
        nE = len(root)
        pts = grow_strands(root, nrm, flowv, Lr * (0.8 + 0.4 * rng.random(nE)), liftv, 5, rng, droop=0.4,
                           spread=0.2, jitter=0.08)
        rimdark = smoothstep(0.8, 0.97, np.abs(Ak)) + smoothstep(0.82, 0.96, Sk)
        EARIN = hexc('#bdb4a6'), hexc('#ddd6cc'), hexc('#d2cabe')
        cb = np.where(backk[:, None], RUF[0], EARIN[0])
        cbd = np.where(backk[:, None], RUF[1], EARIN[1])
        ct = np.where(backk[:, None], RUF[2], EARIN[2])
        dk = np.clip(rimdark * backk, 0, 1)[:, None]
        cb = cb * (1 - dk) + DARK[0] * dk; cbd = cbd * (1 - dk) + DARK[1] * dk; ct = ct * (1 - dk) + DARK[2] * dk
        make_curves('coyote_ear_fur_%s' % ('L' if s > 0 else 'R'), pts, strand_radius(nE, 5, 0.00008),
                    {'c_base': cb, 'c_band': cbd, 'c_tip': ct, 'c_bp': np.tile([0.4, 0.88, 0.4], (nE, 1))}, mat_fur, C_COY)

    # whiskers
    wpts = []
    for s in (1, -1):
        for i in range(13):
            a = rng.uniform(0.1, 0.135)
            c = rng.uniform(-0.024, -0.008)
            root = sdf.raycast(H(a, 0, c), s * HL, 0.05)
            d0 = unit(s * HL * 1.0 + HF * rng.uniform(0.1, 0.5) + HU * rng.uniform(-0.3, 0.15))
            Lw = rng.uniform(0.045, 0.08)
            p = [root]
            d = d0
            for k in range(1, 9):
                d = unit(d - HF * 0.12 - HU * 0.03)
                p.append(p[-1] + d * Lw / 8)
            wpts.append(p)
        for i in range(0):   # brow whiskers (off: they read as eyelashes)
            e = EYES[0] if s > 0 else EYES[1]
            root = e['S'] + HU * 0.012 + HF * rng.uniform(-0.004, 0.006)
            d = unit(s * HL * 0.5 + HU * 0.8 + HF * 0.2)
            Lw = rng.uniform(0.02, 0.035)
            p = [root]
            for k in range(1, 9):
                d = unit(d - HF * 0.15)
                p.append(p[-1] + d * Lw / 8)
            wpts.append(p)
    wpts = np.array(wpts)
    nw = len(wpts)
    make_curves('coyote_whiskers', wpts, strand_radius(nw, 9, 0.00028, 0.00003, power=1.0),
                {'c_base': np.tile(hexc('#151110'), (nw, 1)), 'c_band': np.tile(hexc('#2a2420'), (nw, 1)),
                 'c_tip': np.tile(hexc('#9a8f84'), (nw, 1)), 'c_bp': np.tile([0.6, 0.85, 0.7], (nw, 1))},
                mat_principled('whisker', hexc('#1a1614'), 0.3) if False else mat_fur, C_COY)

# ======================================================================================== scene + renders
res = (1920, 1080) if Q == 'final' else (1280, 720)
spp = 512 if Q == 'final' else (32 if CLAY else 96)
setup_cycles(spp, res)
if SCENE == 'studio':
    studio(bg=(0.16, 0.16, 0.17))
cam = camera((0.0, -3.7, 0.5), (0.0, 0, 0.40), 85, dof=None)
shots = {
    'side': ((-0.02, -3.9, 0.48), (-0.02, 0, 0.40), 85),
    '34': ((1.85, -2.5, 0.78), (0.05, 0, 0.42), 85),
    'front': ((2.6, -0.3, 0.55), (0.1, 0, 0.42), 85),
    'head': (tuple(H(0.06, 0, -0.005) + np.array([0.55, -0.62, 0.17])), tuple(H(0.06, 0, -0.005)), 100),
    'rear': ((-2.4, -1.8, 0.8), (-0.1, 0, 0.42), 85),
}
tagname = 'clay' if CLAY else 'fur'
for v in VIEWS:
    if v not in shots:
        continue
    loc, tgt, lens = shots[v]
    look(cam, loc, tgt, lens)
    render(os.path.join(RENDERS, 'coyote_%s_%s.png' % (tagname, v)))

if os.environ.get('CY_SAVE'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'coyote.blend'), compress=True)
    log("saved blend")
log("done")
