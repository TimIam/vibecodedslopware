# Desert Chase: turns the Blender coyote and roadrunner (build_coyote.py / build_roadrunner.py) into compact
# real-time data for the screensaver: decimated skinned meshes, per-vertex fur colour/length/flow for shell fur,
# feather cards with their pattern parameters, rest-pose joints and bones. Writes ../src/models.js.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python desert-chase/tools/export_rt.py
#
# Runtime axes: x forward, y up, z right (Blender is x forward, y left, z up). Units are metres.

import os, sys, json, gzip, base64, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fauna_lib as fl
from fauna_lib import *

OUTJS = os.path.join(os.path.dirname(HERE), 'src', 'models.js')

def run(script, env):
    os.environ.update(env)
    path = os.path.join(HERE, script)
    g = {'__name__': '__main__', '__file__': path}
    exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), g)
    return g

def R(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0], P[..., 2], -P[..., 1]], -1)

def decimate(ob, target):
    n = len(ob.data.vertices)
    if n > target:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = target / n
        apply_mods(ob)
    return ob

def tris_of(ob):
    me = ob.data
    me.calc_loop_triangles()
    T = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', T)
    return T.reshape(-1, 3)

def seg_d(P, a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    t = np.clip(((P - a) @ ba) / max(np.dot(ba, ba), 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ba), axis=1)

def skin_weights(P, allowed, bones, J, falloff=0.025):
    """P (n,3) Blender coords; allowed: list of bone-index lists per vertex. Top-2 bones by capsule distance."""
    n = len(P)
    D = np.full((n, len(bones)), 1e9)
    for bi, (a, b) in enumerate(bones):
        D[:, bi] = seg_d(P, J[a], J[b])
    mask = np.zeros_like(D, bool)
    for i, al in enumerate(allowed):
        mask[i, al] = True
    D = np.where(mask, D, 1e9)
    order = np.argsort(D, 1)[:, :2]
    d0 = D[np.arange(n), order[:, 0]]
    d1 = D[np.arange(n), order[:, 1]]
    w1 = np.where(d1 > 1e8, 0.0, np.exp(-(d1 - d0) / falloff))
    w0 = 1.0 / (1.0 + w1)
    return order.astype(np.uint8), w0

# ------------------------------------------------------------------------------------------------ packing
class Pack:
    def __init__(self):
        self.parts, self.man, self.off = [], {}, 0

    def add(self, name, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr).astype(dtype))
        pad = (-self.off) % 4
        if pad:
            self.parts.append(b'\0' * pad)
            self.off += pad
        b = a.tobytes()
        self.man[name] = [self.off, a.dtype.str.lstrip('<|'), int(a.size), int(a.shape[-1]) if a.ndim > 1 else 1]
        self.parts.append(b)
        self.off += len(b)

    def blob(self):
        return b''.join(self.parts)

def delta(T):
    t = np.asarray(T, np.int64).reshape(-1)
    d = np.diff(t, prepend=0)
    assert np.abs(d).max() < 32768
    return d

def q16(P, lo, hi):
    return np.clip(np.round((P - lo) / (hi - lo) * 65535), 0, 65535)

def u8(x, scale=1.0):
    return np.clip(np.round(np.asarray(x) / scale * 255), 0, 255)

def i8n(N):
    return np.clip(np.round(unit(N) * 127), -127, 127)

def lin2srgb8(c):
    c = np.clip(np.asarray(c, float), 0, 1)
    s = np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.clip(np.round(s * 255), 0, 255)

OUT = {}
pk = Pack()

# ================================================================================================ coyote
gc = run('build_coyote.py', {'CY_STAGE': 'clay', 'CY_VIEWS': '', 'CY_SCENE': 'none', 'CY_Q': 'preview'})
H = gc['H']
JN = ['pelvis', 'lumbar', 'withers', 'neckbase', 'skull', 'nose', 'tail1', 'tail2', 'tail3', 'tailtip',
      'FL_sh', 'FL_el', 'FL_ca', 'FL_paw', 'FR_sh', 'FR_el', 'FR_ca', 'FR_paw',
      'HL_hip', 'HL_st', 'HL_ho', 'HL_paw', 'HR_hip', 'HR_st', 'HR_ho', 'HR_paw', 'headtop']
JP = {'pelvis': (-0.30, 0, 0.50), 'lumbar': (-0.08, 0, 0.53), 'withers': (0.14, 0, 0.535), 'neckbase': (0.27, 0, 0.53),
      'skull': tuple(gc['C']), 'nose': tuple(H(0.165, 0, -0.012)), 'headtop': tuple(H(-0.01, 0, 0.045)),
      'tail1': (-0.37, 0, 0.53), 'tail2': (-0.42, 0, 0.47), 'tail3': (-0.46, 0, 0.39), 'tailtip': (-0.485, 0, 0.215)}
for s, sd in ((1, 'L'), (-1, 'R')):
    JP['F%s_sh' % sd] = (0.235, s * 0.054, 0.43); JP['F%s_el' % sd] = (0.15, s * 0.055, 0.32)
    JP['F%s_ca' % sd] = (0.159, s * 0.054, 0.10); JP['F%s_paw' % sd] = (0.20, s * 0.054, 0.012)
    JP['H%s_hip' % sd] = (-0.29, s * 0.06, 0.47); JP['H%s_st' % sd] = (-0.22, s * 0.065, 0.335)
    JP['H%s_ho' % sd] = (-0.35, s * 0.06, 0.155); JP['H%s_paw' % sd] = (-0.30, s * 0.059, 0.012)
J = np.array([JP[n] for n in JN], float)
ji = {n: i for i, n in enumerate(JN)}
BN = [('pelvis', 'lumbar'), ('lumbar', 'withers'), ('withers', 'neckbase'), ('neckbase', 'skull'), ('skull', 'nose'),
      ('tail1', 'tail2'), ('tail2', 'tail3'), ('tail3', 'tailtip')]
for sd in 'LR':
    BN += [('F%s_sh' % sd, 'F%s_el' % sd), ('F%s_el' % sd, 'F%s_ca' % sd), ('F%s_ca' % sd, 'F%s_paw' % sd)]
for sd in 'LR':
    BN += [('H%s_hip' % sd, 'H%s_st' % sd), ('H%s_st' % sd, 'H%s_ho' % sd), ('H%s_ho' % sd, 'H%s_paw' % sd)]
BONES = [(ji[a], ji[b]) for a, b in BN]
FLu, FRu, HLu, HRu = 8, 11, 14, 17

body = decimate(gc['body'], 9500)
V, NV, T = mesh_arrays(body)
cv = gc['coat'](V, NV)
w, flow, par = tag_fields(gc['prims'], V, sigma=0.008)
tags = list(w.keys())
Wt = np.stack([w[t] for t in tags], 1)
side = np.where(V[:, 1] >= 0, 0, 1)            # 0 = left (+y), 1 = right
def allowed_for(tag, sd):
    fu = FLu + 3 * sd; hu = HLu + 3 * sd
    return {'torso': [0, 1, 2, 5], 'shoulder': [2, fu, 1], 'uarm': [fu, 2], 'farm': [fu + 1, fu], 'fmeta': [fu + 2, fu + 1],
            'fpaw': [fu + 2], 'thigh': [hu, 0], 'shank': [hu + 1, hu], 'hmeta': [hu + 2, hu + 1], 'hpaw': [hu + 2],
            'neck': [3, 2, 4], 'head': [4, 3], 'cheek': [4, 3], 'muzzle': [4], 'jaw': [4, 3], 'tail': [5, 6, 7, 0]}[tag]
allowed = []
for i in range(len(V)):
    al = set()
    for k in np.argsort(-Wt[i])[:2]:
        if Wt[i, k] > 0.2 or not al:
            al |= set(allowed_for(tags[k], side[i]))
    allowed.append(sorted(al))
bi, bw = skin_weights(V, allowed, BONES, J)

skin = cv['base'] * 0.55 + cv['band'] * 0.4
blk = np.maximum.reduce([smoothstep(0.0024, 0.0008, cv['lips']), smoothstep(0.0016, 0.0009, cv['eye']),
                         smoothstep(0.006, 0.002, gc['NOSE'].dist(V))])
skin = skin * (1 - blk[:, None]) + hexc('#1a1512') * blk[:, None]
Lf = np.where(cv['keep'], cv['L'], 0.0)
Fv = cv['F'] - (cv['F'] * NV).sum(1, keepdims=True) * NV
Fv = unit(Fv)
mat = np.zeros(len(V))

# ears: inner side long pale furnishings, back short rufous, dark tips
ears_V, ears_N, ears_T, ears_attr = [], [], [], []
for s, ob in zip((1, -1), gc['EARS']):
    decimate(ob, 700)
    Ve, Ne, Te = mesh_arrays(ob)
    _, ef, eu, es = gc['ear_surface'](s, 0.5, 0.0)
    E0 = gc['ear_surface'](s, 0.0, 0.0)[0]
    front = (Ne @ ef) > 0
    hgt = np.clip(((Ve - E0) @ eu) / (0.112 * gc['HS']), 0, 1)
    dark = smoothstep(0.82, 0.97, hgt)
    RUF, DARK = gc['RUF'], gc['DARK']
    EIN = (hexc('#bdb4a6'), hexc('#ddd6cc'), hexc('#d2cabe'), np.array([0.5, 0.9, 0.0]))
    base = np.where(front[:, None], EIN[0], RUF[0]); band = np.where(front[:, None], EIN[1], RUF[1])
    tip = np.where(front[:, None], EIN[2], RUF[2]); bp = np.where(front[:, None], EIN[3], RUF[3])
    base = base * (1 - dark[:, None]) + DARK[0] * dark[:, None]; band = band * (1 - dark[:, None]) + DARK[1] * dark[:, None]
    tip = tip * (1 - dark[:, None]) + DARK[2] * dark[:, None]
    L = np.where(front, 0.016 * (1 - hgt) ** 0.7 + 0.004, 0.009 * (1 - hgt) + 0.004)
    F = unit(np.broadcast_to(eu, Ve.shape) - Ne * (Ne @ eu)[:, None])
    ears_V.append(Ve); ears_N.append(Ne); ears_T.append(Te)
    ears_attr.append(dict(base=base, band=band, tip=tip, bp=bp, L=L, F=F, skin=hexc('#3e302a') + 0 * base, lift=np.full(len(Ve), 0.35), mat=np.full(len(Ve), 2)))
nose = decimate(gc['nose'], 600)
Vn, Nn_, Tn = mesh_arrays(nose)

# assemble the coyote mesh: body + ears + nose (bound to the head)
allV, allN, allT = [V], [NV], [T]
A = dict(base=[cv['base']], band=[cv['band']], tip=[cv['tip']], bp=[cv['bp']], L=[Lf], F=[Fv], skin=[skin], lift=[cv['lift']], mat=[mat])
Bi, Bw = [bi], [bw]
off = len(V)
for Ve, Ne, Te, at in zip(ears_V, ears_N, ears_T, ears_attr):
    allV.append(Ve); allN.append(Ne); allT.append(Te + off); off += len(Ve)
    for k in A:
        A[k].append(at[k])
    Bi.append(np.tile([4, 3], (len(Ve), 1)).astype(np.uint8)); Bw.append(np.ones(len(Ve)))
allV.append(Vn); allN.append(Nn_); allT.append(Tn + off); off += len(Vn)
for k, v in dict(base=np.zeros((len(Vn), 3)), band=np.zeros((len(Vn), 3)), tip=np.zeros((len(Vn), 3)), bp=np.zeros((len(Vn), 3)),
                 L=np.zeros(len(Vn)), F=np.tile([1, 0, 0], (len(Vn), 1)), skin=np.tile(hexc('#141110'), (len(Vn), 1)),
                 lift=np.zeros(len(Vn)), mat=np.ones(len(Vn))).items():
    A[k].append(v)
Bi.append(np.tile([4, 3], (len(Vn), 1)).astype(np.uint8)); Bw.append(np.ones(len(Vn)))
V = np.concatenate(allV); NV = np.concatenate(allN); T = np.concatenate(allT)
A = {k: np.concatenate(v) for k, v in A.items()}
bi = np.concatenate(Bi); bw = np.concatenate(Bw)

lo, hi = V.min(0) - 0.002, V.max(0) + 0.002
VR, NR, FR_ = R(V), R(NV), R(A['F'])
loR, hiR = np.minimum(R(lo), R(hi)), np.maximum(R(lo), R(hi))
pk.add('c_pos', q16(VR, loR, hiR), np.uint16)
pk.add('c_nrm', i8n(NR), np.int8)
pk.add('c_flow', i8n(FR_), np.int8)
pk.add('c_base', lin2srgb8(A['base']), np.uint8)
pk.add('c_band', lin2srgb8(A['band']), np.uint8)
pk.add('c_tip', lin2srgb8(A['tip']), np.uint8)
pk.add('c_skin', lin2srgb8(A['skin']), np.uint8)
pk.add('c_misc', np.stack([u8(A['bp'][:, 0]), u8(A['bp'][:, 1]), u8(A['bp'][:, 2]), u8(A['L'], 0.12), u8(A['lift'], 1.2), A['mat'] * 50], 1), np.uint8)
pk.add('c_bone', np.stack([bi[:, 0], bi[:, 1], u8(bw)], 1), np.uint8)
pk.add('c_idx', delta(T), np.int16)
eyes = [dict(c=R(e['center']).tolist(), g=R(e['gaze']).tolist()) for e in gc['EYES']]
OUT['coyote'] = dict(lo=loR.tolist(), hi=hiR.tolist(), nv=int(len(V)), joints=R(J).tolist(), jointNames=JN, bones=[list(b) for b in BONES],
                     eyes=eyes, eyeR=float(gc['ER']), iris=lin2srgb8(np.array([hexc('#e0b04c'), hexc('#a87430')])).tolist())
log('coyote', len(V), 'verts', len(T), 'tris')

# ================================================================================================ roadrunner
gr = run('build_roadrunner.py', {'RR_STAGE': 'feathers', 'RR_VIEWS': '', 'RR_SCENE': 'none', 'RR_Q': 'preview', 'RR_KEEP': '0'})
Hd, Bp, T0, TD = gr['Hd'], gr['Bp'], gr['T0'], gr['TAIL_DIR']
FEET = gr['FEET']
RJN = ['hips', 'chest', 'neck', 'head', 'bill', 'headtop', 'tailbase', 'tailtip',
       'hipL', 'kneeL', 'ankleL', 'footL', 'toeL', 'hipR', 'kneeR', 'ankleR', 'footR', 'toeR']
RJ = {'hips': (-0.03, 0, 0.12), 'chest': (0.05, 0, 0.17), 'neck': (0.078, 0, 0.215), 'head': tuple(gr['HEAD_C']),
      'bill': tuple(Bp(0.047)), 'headtop': tuple(Hd(-0.006, 0, 0.02)), 'tailbase': tuple(T0), 'tailtip': tuple(T0 + TD * 0.27)}
for s, sd in ((1, 'L'), (-1, 'R')):
    Fc = FEET[s]
    RJ['hip' + sd] = (0.0, s * 0.022, 0.125); RJ['knee' + sd] = (0.012, s * 0.025, 0.105)
    RJ['ankle' + sd] = (Fc[0] - 0.012, s * 0.022, 0.07); RJ['foot' + sd] = tuple(Fc); RJ['toe' + sd] = (Fc[0] + 0.033, Fc[1] + s * 0.004, 0.002)
RJa = np.array([RJ[n] for n in RJN], float)
rji = {n: i for i, n in enumerate(RJN)}
RBN = [('hips', 'chest'), ('chest', 'neck'), ('neck', 'head'), ('head', 'bill'), ('tailbase', 'tailtip')]
for sd in 'LR':
    RBN += [('hip' + sd, 'knee' + sd), ('knee' + sd, 'ankle' + sd), ('ankle' + sd, 'foot' + sd), ('foot' + sd, 'toe' + sd)]
RB = [(rji[a], rji[b]) for a, b in RBN]

def rr_allowed(tag, sd):
    t0 = 5 + 4 * sd
    return {'back': [0, 1], 'breast': [0, 1], 'belly': [0, t0], 'rump': [0, 4], 'neck': [1, 2, 0], 'head': [3, 2],
            'crown': [3], 'throat': [3, 2], 'thigh': [t0, t0 + 1, 0]}[tag]

def rr_weights(P):
    w, _, _ = tag_fields(gr['prims'], P, sigma=0.004)
    tg = list(w.keys())
    Wt = np.stack([w[t] for t in tg], 1)
    sd = np.where(P[:, 1] >= 0, 0, 1)
    al = []
    for i in range(len(P)):
        a = set()
        for k in np.argsort(-Wt[i])[:2]:
            if Wt[i, k] > 0.2 or not a:
                a |= set(rr_allowed(tg[k], sd[i]))
        al.append(sorted(a))
    return skin_weights(P, al, RB, RJa, falloff=0.01)

def read_col(ob, name='skin_col'):
    at = ob.data.color_attributes.get(name)
    c = np.empty(len(ob.data.vertices) * 4, np.float32)
    at.data.foreach_get('color', c)
    return c.reshape(-1, 4)[:, :3]

bird = decimate(gr['bird'], 5000)
bill = decimate(gr['bill'], 900)
legs = decimate(gr['legs'], 2600)
parts = []
Vb, Nb, Tb = mesh_arrays(bird); bib, bwb = rr_weights(Vb); parts.append((Vb, Nb, Tb, read_col(bird), bib, bwb, 0))
Vk, Nk, Tk = mesh_arrays(bill); parts.append((Vk, Nk, Tk, read_col(bill), np.tile([3, 2], (len(Vk), 1)), np.ones(len(Vk)), 1))
Vl, Nl, Tl = mesh_arrays(legs)
sdl = np.where(Vl[:, 1] >= 0, 0, 1)
al = [[5 + 4 * s + 1, 5 + 4 * s + 2, 5 + 4 * s + 3] for s in sdl]
bil, bwl = skin_weights(Vl, al, RB, RJa, falloff=0.004)
parts.append((Vl, Nl, Tl, read_col(legs), bil, bwl, 2))
V = np.concatenate([p[0] for p in parts]); NV = np.concatenate([p[1] for p in parts])
offs = np.cumsum([0] + [len(p[0]) for p in parts])
T = np.concatenate([p[2] + offs[i] for i, p in enumerate(parts)])
C = np.concatenate([p[3] for p in parts]); BI = np.concatenate([p[4] for p in parts]); BW = np.concatenate([p[5] for p in parts])
M = np.concatenate([np.full(len(p[0]), p[6]) for p in parts])

# feather cards: keep a few rows per card, attributes per card
cards, card_attr, card_rows = [], [], []
def take_rows(X, rows):
    return X[:, rows, :, :]
for name, X, at in gr['FEATHERS']:
    Rn = X.shape[1]
    rows = {6: [0, 2, 3, 5], 7: [0, 2, 4, 6], 14: [0, 2, 4, 6, 8, 10, 12, 13], 8: [0, 2, 4, 6, 7]}.get(Rn, list(range(Rn)))
    Xs = take_rows(X, rows)
    n = len(Xs)
    if name == 'rr_crest':
        b = np.tile([3, 3], (n, 1)); bw_ = np.ones(n)
    elif name in ('rr_tail', 'rr_tail_coverts'):
        b = np.tile([4, 0], (n, 1)); bw_ = np.ones(n) if name == 'rr_tail' else np.full(n, 0.8)
    elif name.startswith('rr_wing'):
        b = np.tile([0, 1], (n, 1)); bw_ = np.full(n, 0.85)
    else:
        b, bw_ = rr_weights(Xs[:, 0, 1, :])
    nrm = unit(np.cross(Xs[:, 1, 2, :] - Xs[:, 1, 0, :], Xs[:, -1, 1, :] - Xs[:, 0, 1, :]))
    cards.append((name, Xs, at, b, bw_, nrm))
OUT_CARD_GROUPS = []
cp, cuv, cid, crow = [], [], [], []
ca = []
base_id = 0
for name, Xs, at, b, bw_, nrm in cards:
    n, Rr, Cc, _ = Xs.shape
    vv = np.linspace(0, 1, Rr)
    uu = np.linspace(-1, 1, Cc)
    cp.append(Xs.reshape(-1, 3))
    cuv.append(np.tile(np.stack(np.meshgrid(uu, vv, indexing='xy'), -1).reshape(-1, 2), (n, 1)))
    cid.append(np.repeat(np.arange(n) + base_id, Rr * Cc))
    # quads within each card
    r = np.arange(Rr - 1)[:, None]; c = np.arange(Cc - 1)[None, :]
    i00 = r * Cc + c
    q = np.stack([i00, i00 + Cc, i00 + Cc + 1, i00, i00 + Cc + 1, i00 + 1], -1).reshape(-1)
    crow.append((np.arange(n)[:, None] * (Rr * Cc) + q[None, :]).reshape(-1) + sum(len(x) for x in cp[:-1]))
    p = at['f_p']; qq = at['f_q']; ss = at['f_s']
    ca.append(np.concatenate([lin2srgb8(at['f_main']), lin2srgb8(at['f_edge']), lin2srgb8(at['f_streak']),
                              u8(p, 1.25), u8(qq[:, :2]), u8(qq[:, 2:3]), u8(ss[:, 0:1]), u8(ss[:, 1:2], 12.75), u8(ss[:, 2:3], 2.0),
                              b, u8(bw_)[:, None], u8(R(nrm) * 0.5 + 0.5)], 1))
    OUT_CARD_GROUPS.append([name, base_id, n, Rr, Cc])
    base_id += n
CP = np.concatenate(cp); CUV = np.concatenate(cuv); CID = np.concatenate(cid); CIDX = np.concatenate(crow)
CA = np.concatenate(ca)
allP = np.concatenate([V, CP])
lo, hi = allP.min(0) - 0.002, allP.max(0) + 0.002
loR, hiR = np.minimum(R(lo), R(hi)), np.maximum(R(lo), R(hi))
pk.add('r_pos', q16(R(V), loR, hiR), np.uint16)
pk.add('r_nrm', i8n(R(NV)), np.int8)
pk.add('r_col', lin2srgb8(C), np.uint8)
pk.add('r_bone', np.stack([BI[:, 0], BI[:, 1], u8(BW), M * 50], 1), np.uint8)
pk.add('r_idx', delta(T), np.int16)
pk.add('f_pos', q16(R(CP), loR, hiR), np.uint16)
pk.add('f_attr', CA, np.uint8)      # per card: 24 bytes (see the layout in scene.js)
eyes = [dict(c=R(e['center']).tolist(), g=R(e['gaze']).tolist(), patch=R(e['patch']).tolist()) for e in gr['EYES']]
OUT['roadrunner'] = dict(lo=loR.tolist(), hi=hiR.tolist(), nv=int(len(V)), nf=int(len(CP)), ncards=int(base_id),
                         cardStride=int(CA.shape[1]), groups=OUT_CARD_GROUPS, joints=R(RJa).tolist(), jointNames=RJN,
                         bones=[list(b) for b in RB], eyes=eyes, eyeR=float(gr['ER']))
log('roadrunner', len(V), 'verts', len(T), 'tris,', base_id, 'cards', len(CP), 'card verts')

blob = pk.blob()
gz = gzip.compress(blob, 9)
OUT['buffers'] = pk.man
OUT['bytes'] = len(blob)
with open(OUTJS, 'w', encoding='utf-8') as f:
    f.write('// Generated by desert-chase/tools/export_rt.py from the Blender coyote and roadrunner. Do not edit.\n')
    f.write('const MODELS = ' + json.dumps(OUT, separators=(',', ':')) + ';\n')
    f.write("const MODELS_GZ = '" + base64.b64encode(gz).decode() + "';\n")
log('wrote', OUTJS, '%.0f KB raw, %.0f KB gzip, %.0f KB js' % (len(blob) / 1024, len(gz) / 1024, os.path.getsize(OUTJS) / 1024))
