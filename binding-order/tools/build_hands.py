# Binding Order: builds the two posed hands (right hand pinching a pick, left hand pressing a tension wrench) in Blender
# and exports them to assets/hands.glb.
#
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python binding-order/tools/build_hands.py
#
# Units are millimetres. Hand space (Blender, Z up): wrist crease centre at the origin, fingers point +Y, back of the
# hand faces +Z, palm faces -Z. The right hand's thumb is on -X. The left hand is the right hand mirrored in X.
# Each hand is assembled from anatomical primitives (palm, thenar and hypothenar pads, knuckles, tendons, tapered
# phalanges, forearm), fused with a voxel remesh, smoothed, decimated, then given nails and a sleeve.
# The pick grip is solved with a small IK: the index pad, thumb pad and middle finger have to land on the handle.
#
# Exports (three.js axes after export_yup: x, z, -y):  hand_R, nails_R, sleeve_R, hand_L, nails_L, sleeve_L
# plus assets/hands.json with the grip frame (where the pick handle sits in each hand) in three.js axes.
# Env: BO_NORENDER=1 skips the preview render.

import bpy, bmesh, math, os, json, random
from mathutils import Vector, Matrix, Quaternion, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
PREV = os.path.join(HERE, "previews")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(PREV, exist_ok=True)
NO_RENDER = bool(os.environ.get("BO_NORENDER"))
PI = math.pi
def rad(d): return d * PI / 180.0
def three(v): return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]
def clamp(v, a, b): return max(a, min(b, v))
def smooth01(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SCENE = bpy.context.scene

def link(ob):
    SCENE.collection.objects.link(ob)
    return ob

def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))

# =====================================================================================================
# primitives, appended into one bmesh before the fuse
# =====================================================================================================
def add_ellipsoid(bm, c, axes, radii, seg=28, rings=18):
    """Ellipsoid centred at c with orthonormal axes (ax, ay, az) and radii (rx, ry, rz)."""
    ax, ay, az = axes
    rx, ry, rz = radii
    verts = []
    for i in range(rings + 1):
        th = -PI / 2 + PI * i / rings
        row = []
        for j in range(seg):
            ph = 2 * PI * j / seg
            p = c + ax * (rx * math.cos(th) * math.cos(ph)) + az * (rz * math.cos(th) * math.sin(ph)) + ay * (ry * math.sin(th))
            row.append(bm.verts.new(p))
        verts.append(row)
    for i in range(rings):
        for j in range(seg):
            a, b = verts[i][j], verts[i][(j + 1) % seg]
            cc, d = verts[i + 1][(j + 1) % seg], verts[i + 1][j]
            try:
                bm.faces.new((a, b, cc, d))
            except ValueError:
                pass

def add_segment(bm, p0, p1, side, up, w0, h0, w1, h1, pad=0.0, seg=28, rings=14, cap1=True):
    """Tapered elliptical capsule from p0 to p1. side/up are the cross-section axes (width along side, height along
    up). pad > 0 bulges the palm side (-up) in the middle of the segment, like the flesh pad of a phalanx."""
    f = (p1 - p0)
    L = f.length
    f.normalize()
    verts = []
    for i in range(rings + 1):
        t = i / rings
        w = w0 + (w1 - w0) * t
        h = h0 + (h1 - h0) * t
        bul = pad * math.sin(PI * t)
        c = p0 + f * (L * t)
        row = []
        for j in range(seg):
            ph = 2 * PI * j / seg
            cs, sn = math.cos(ph), math.sin(ph)
            hh = h + (bul * (-sn) ** 0.8 if sn < 0 else 0.0)
            row.append(bm.verts.new(c + side * (w * cs) + up * (hh * sn)))
        verts.append(row)
    for i in range(rings):
        for j in range(seg):
            try:
                bm.faces.new((verts[i][j], verts[i][(j + 1) % seg], verts[i + 1][(j + 1) % seg], verts[i + 1][j]))
            except ValueError:
                pass
    # joint/tip ends: ellipsoids so the union is closed and the joint rounds off
    add_ellipsoid(bm, p0, (side, f, up), (w0, min(w0, h0) * 0.95, h0))
    if cap1:
        add_ellipsoid(bm, p1, (side, f, up), (w1, min(w1, h1) * 1.0, h1))

def superellipsoid_palm(bm, pose_cup):
    """Palm block: a boxy superellipsoid deformed so it narrows at the wrist, ends on the knuckle arc and arches."""
    seg, rings = 48, 36
    e = 0.55  # exponent < 1 makes it boxy
    sgnp = lambda v, p: math.copysign(abs(v) ** p, v)
    rows = []
    for i in range(rings + 1):
        u = -PI / 2 + PI * i / rings
        row = []
        for j in range(seg):
            v = -PI + 2 * PI * j / seg
            x = sgnp(math.cos(u), e) * sgnp(math.cos(v), e)
            z = sgnp(math.cos(u), e) * sgnp(math.sin(v), e)
            y = sgnp(math.sin(u), 0.8)
            # unit box -> palm
            yy = 46 + 50 * y                      # -4 .. 96
            X = x * 41
            ymcp = 92 - 0.012 * (X + 6) ** 2      # knuckle arc
            if yy > 40:
                yy = 40 + (yy - 40) * (ymcp + 2 - 40) / (96 - 40)
            taper = 0.74 + 0.26 * smooth01(0, 55, yy)
            X *= taper
            top, bot = 12.5, 13.5
            Z = z * (top if z > 0 else bot)
            Z *= 0.86 + 0.14 * smooth01(0, 30, yy)  # thinner at the wrist
            arch = 0.0042 * X * X                   # back of hand is convex across
            Z -= arch * (1.0 + pose_cup)
            row.append(bm.verts.new(Vector((X, yy, Z))))
        rows.append(row)
    for i in range(rings):
        for j in range(seg):
            try:
                bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
            except ValueError:
                pass

# =====================================================================================================
# skeleton + FK
# =====================================================================================================
def ymcp(x): return 92 - 0.012 * (x + 6) ** 2

FINGERS = {
    #          mcp x, splay deg, lengths (prox, mid, dist), half widths (base, pip, dip, tip)
    "index":  (-25.0, -2.5, (41.0, 24.5, 19.5), (9.6, 8.7, 7.9, 7.0)),
    "middle": (-5.5, 0.0, (45.5, 28.0, 20.5), (9.9, 9.0, 8.1, 7.2)),
    "ring":   (13.0, 2.5, (42.5, 26.5, 20.0), (9.3, 8.4, 7.6, 6.8)),
    "pinky":  (29.0, 7.0, (34.0, 19.5, 18.0), (8.2, 7.3, 6.6, 6.0)),
}
HFAC = 0.86  # finger cross-section height / width

def rotate(v, axis, ang):
    return Quaternion(axis, ang) @ v

def finger_chain(name, flex, abd=0.0, roll=0.0):
    """Joint positions and frames for a finger. flex = (mcp, pip, dip) degrees toward the palm."""
    x0, splay, lens, wid = FINGERS[name]
    m = Vector((x0, ymcp(x0) - 4.0, 2.0 - 0.0045 * x0 * x0))
    f = rotate(Vector((0, 1, 0)), Vector((0, 0, 1)), rad(-(splay + abd)))
    u = Vector((0, 0, 1))
    f = rotate(f, f.cross(u), 0)
    # roll fingers slightly toward the middle finger, as real fingers do when they curl
    u = rotate(u, f, rad(roll))
    pts = [m]
    frames = []
    for k in range(3):
        r = f.cross(u).normalized()
        q = Quaternion(r, -rad(flex[k]))
        f = (q @ f).normalized()
        u = (q @ u).normalized()
        r = f.cross(u).normalized()
        frames.append((f.copy(), u.copy(), r.copy()))
        pts.append(pts[-1] + f * lens[k])
    return pts, frames, wid

THUMB_LEN = (46.0, 33.0, 28.0)
THUMB_W = (12.5, 10.6, 9.6, 8.6)
THUMB_CMC = Vector((-20.0, 26.0, -11.0))

def thumb_chain(yaw, pitch, roll, mcp, ip, opp=0.0):
    """Thumb from the CMC joint. yaw/pitch aim the metacarpal (degrees), roll turns the nail, mcp/ip flex."""
    f = Vector((0, 1, 0))
    f = rotate(f, Vector((0, 0, 1)), rad(yaw))         # + yaw swings toward -X (thumb side)
    side0 = f.cross(Vector((0, 0, 1))).normalized()
    f = rotate(f, side0, rad(-pitch))                    # + pitch dips toward the palm
    u = Vector((0, 0, 1))
    u = (u - f * u.dot(f)).normalized()
    u = rotate(u, f, rad(roll))                         # + roll turns the nail toward -X
    pts = [THUMB_CMC.copy()]
    frames = []
    for k, a in enumerate((opp, mcp, ip)):
        r = f.cross(u).normalized()
        q = Quaternion(r, -rad(a))
        f = (q @ f).normalized()
        u = (q @ u).normalized()
        r = f.cross(u).normalized()
        frames.append((f.copy(), u.copy(), r.copy()))
        pts.append(pts[-1] + f * THUMB_LEN[k])
    return pts, frames, THUMB_W

def pad_point(pts, frames, wid, depth=0.62):
    """Centre of the fingertip pad: on the palm side of the distal segment, ~62% along it."""
    p0, p1 = pts[2], pts[3]
    f, u, r = frames[2]
    c = p0 + (p1 - p0) * depth
    w = wid[2] + (wid[3] - wid[2]) * depth
    return c - u * (w * HFAC), -u

# =====================================================================================================
# grip IK (right hand pinching a pick handle)
# =====================================================================================================
# The pick handle in hand space: a line through A with direction D, radius HANDLE_R (a 9 x 5 mm flat handle reads
# as ~3.5 mm half thickness under the pads).
HANDLE_A = Vector((-36.0, 68.0, -8.0))
HANDLE_D = Vector((0.03, 1.0, -0.42)).normalized()
HANDLE_R = 3.2

def handle_dist(p):
    v = p - HANDLE_A
    t = v.dot(HANDLE_D)
    q = HANDLE_A + HANDLE_D * t
    return (p - q).length, t, q

def solve(fun, x0, steps, iters=500, seed=1):
    """Random restarts + coordinate descent with shrinking steps."""
    rnd = random.Random(seed)
    def descend(x):
        x = list(x)
        fx = fun(x)
        for sc in (4.0, 2.0, 1.0, 0.5, 0.25, 0.1):
            improved = True
            while improved:
                improved = False
                for k in range(len(x)):
                    for sgn in (1, -1):
                        c = list(x)
                        c[k] += sgn * steps[k] * sc
                        fc = fun(c)
                        if fc < fx:
                            x, fx, improved = c, fc, True
        return x, fx
    best, bf = descend(x0)
    for r in range(iters // 50):
        start = [b + rnd.gauss(0, s * 3) for b, s in zip(x0, steps)]
        x, fx = descend(start)
        if fx < bf:
            best, bf = x, fx
    return best, bf

def lim(v, a, b): return 0 if a <= v <= b else (min(abs(v - a), abs(v - b))) ** 2 * 0.5

def ik_index(t_target, side_dir):
    """Index pad on top of the handle at handle parameter t_target."""
    q = HANDLE_A + HANDLE_D * t_target
    target = q + side_dir * HANDLE_R
    def fun(x):
        mcp, pip, abd = x
        dip = pip * 0.62
        pts, fr, wid = finger_chain("index", (mcp, pip, dip), abd=abd)
        pp, n = pad_point(pts, fr, wid)
        e = (pp - target).length ** 2
        e += 40 * (1 + n.dot(side_dir)) ** 2  # pad faces down onto the handle
        return e + lim(mcp, -10, 85) + lim(pip, 0, 100) + lim(abd, -15, 15)
    x, err = solve(fun, [30, 40, 0], [6, 8, 3])
    return x, err

def ik_thumb(t_target, side_dir):
    q = HANDLE_A + HANDLE_D * t_target
    target = q + side_dir * HANDLE_R
    def fun(x):
        yaw, pitch, roll, opp, mcp, ip = x
        pts, fr, wid = thumb_chain(yaw, pitch, roll, mcp, ip, opp)
        pp, n = pad_point(pts, fr, wid)
        e = (pp - target).length ** 2
        e += 40 * (1 + n.dot(side_dir)) ** 2
        return e + lim(yaw, 10, 75) + lim(pitch, 0, 60) + lim(roll, 20, 110) + lim(opp, -5, 30) + lim(mcp, -10, 50) + lim(ip, -15, 60)
    x, err = solve(fun, [40, 25, 70, 10, 15, 15], [6, 6, 8, 4, 6, 6], iters=900)
    return x, err

def ik_middle(t_target, side_dir):
    """Middle finger: the radial side of its distal segment supports the handle from below."""
    q = HANDLE_A + HANDLE_D * t_target
    def fun(x):
        mcp, pip, abd = x
        dip = pip * 0.6
        pts, fr, wid = finger_chain("middle", (mcp, pip, dip), abd=abd)
        f, u, r = fr[2]
        c = pts[2] + (pts[3] - pts[2]) * 0.55
        # contact point on the thumb side (-r is toward the thumb for the right hand) and a bit palmar
        cp = c - r * wid[2] * 0.75 - u * wid[2] * 0.45
        d, t, qq = handle_dist(cp)
        e = (d - HANDLE_R) ** 2 * 4 + (t - t_target) ** 2 * 0.2
        return e + lim(mcp, 0, 85) + lim(pip, 0, 100) + lim(abd, -12, 12)
    x, err = solve(fun, [40, 50, -4], [6, 8, 3])
    return x, err

# =====================================================================================================
# build one posed hand
# =====================================================================================================
def build_hand(name, pose):
    bm = bmesh.new()
    superellipsoid_palm(bm, pose.get("cup", 0.0))
    up = Vector((0, 0, 1))
    # thenar (thumb ball) and hypothenar pads on the palm side
    add_ellipsoid(bm, Vector((-20.0, 30.0, -9.0)), (Vector((math.cos(rad(-35)), math.sin(rad(-35)), 0)), Vector((-math.sin(rad(-35)), math.cos(rad(-35)), 0)), up), (14.0, 25.0, 10.5))
    add_ellipsoid(bm, Vector((25.0, 40.0, -8.0)), (Vector((1, 0, 0)), Vector((0, 1, 0)), up), (10.0, 28.0, 8.5))
    # distal palm pad under the knuckles
    add_ellipsoid(bm, Vector((0.0, 78.0, -9.5)), (Vector((1, 0, 0)), Vector((0, 1, 0)), up), (34.0, 11.0, 7.0))
    # forearm and wrist bones
    add_segment(bm, Vector((0, -95, 0.5)), Vector((0, 6, 0.5)), Vector((1, 0, 0)), up, 33.0, 22.0, 30.5, 17.5, rings=10)
    add_ellipsoid(bm, Vector((27.5, 2.0, 5.5)), (Vector((1, 0, 0)), Vector((0, 1, 0)), up), (5.0, 6.0, 4.5))
    # extensor tendons fanning over the back of the hand
    for fn in ("index", "middle", "ring", "pinky"):
        x0 = FINGERS[fn][0]
        a = Vector((x0 * 0.35, 8.0, 9.5))
        b = Vector((x0, ymcp(x0) - 12.0, 11.5 - 0.0045 * x0 * x0))
        side = (b - a).cross(up).normalized()
        add_segment(bm, a, b, side, up, 2.6, 1.6, 2.3, 1.7, rings=8, seg=12)

    nails = []
    chains = {}
    for fn in ("index", "middle", "ring", "pinky"):
        fl = pose[fn]
        pts, frames, wid = finger_chain(fn, fl[:3], abd=fl[3] if len(fl) > 3 else 0.0, roll=fl[4] if len(fl) > 4 else 0.0)
        chains[fn] = (pts, frames, wid)
        # knuckle head on the back of the hand
        f0, u0, r0 = frames[0]
        add_ellipsoid(bm, pts[0] + up * 5.0 - Vector((0, 4, 0)), (Vector((1, 0, 0)), Vector((0, 1, 0)), up), (wid[0] * 0.7, 7.0, 5.0))
        for k in range(3):
            f, u, r = frames[k]
            w0, w1 = wid[k], wid[k + 1]
            add_segment(bm, pts[k], pts[k + 1], r, u, w0, w0 * HFAC, w1, w1 * HFAC, pad=(1.3 if k < 2 else 1.9))
        nails.append((pts, frames, wid))
    tp = pose["thumb"]
    pts, frames, wid = thumb_chain(*tp)
    chains["thumb"] = (pts, frames, wid)
    for k in range(3):
        f, u, r = frames[k]
        w0, w1 = wid[k], wid[k + 1]
        hf = 0.95 if k == 0 else HFAC
        add_segment(bm, pts[k], pts[k + 1], r, u, w0 * (1.15 if k == 0 else 1.0), w0 * hf, w1, w1 * HFAC, pad=(0.6 if k == 0 else 2.0))
    nails.append((pts, frames, wid))
    # web between thumb and index
    f, u, r = frames[0]
    a = pts[0] + (pts[1] - pts[0]) * 0.55
    b = chains["index"][0][0] + Vector((0, -10, -3))
    s = (b - a).cross(up).normalized()
    add_segment(bm, a, b, s, s.cross((b - a).normalized()).normalized(), 6.5, 5.5, 6.0, 5.0, rings=8)

    ob = mesh_obj(name, bm)
    # fuse everything into one skin
    rm = ob.modifiers.new("fuse", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.75
    rm.adaptivity = 0.0
    sm = ob.modifiers.new("soft", "CORRECTIVE_SMOOTH")
    sm.factor = 0.6
    sm.iterations = 6
    sm.use_only_smooth = True
    lap = ob.modifiers.new("lap", "LAPLACIANSMOOTH")
    lap.lambda_factor = 0.6
    lap.iterations = 4
    dc = ob.modifiers.new("dec", "DECIMATE")
    dc.ratio = 0.12
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    me = ob.data
    print(name, "faces", len(me.polygons))
    for p in me.polygons:
        p.use_smooth = True
    skin_colors(ob, chains)
    return ob, nails, chains

def skin_colors(ob, chains):
    """Vertex colours: base tone, pinker fingertips/palm, redder knuckles, a touch of mottling."""
    me = ob.data
    ca = me.color_attributes.new("Color", "BYTE_COLOR", "POINT")
    base = Vector((0.86, 0.62, 0.50))
    palm = Vector((0.92, 0.66, 0.56))
    rosy = Vector((0.88, 0.52, 0.46))
    joints = []
    for fn, (pts, frames, wid) in chains.items():
        for k in range(1, 3):
            joints.append(pts[k])
        joints.append(pts[3])
    for v in me.vertices:
        p = v.co
        n = v.normal
        c = base.copy()
        c = c.lerp(palm, clamp(-n.z * 0.9, 0, 1) * 0.7)
        rd = 0.0
        for j in joints:
            d = (p - j).length
            if d < 11:
                rd = max(rd, 1 - d / 11)
        c = c.lerp(rosy, rd * 0.55)
        m = noise.noise(p * 0.08) * 0.04 + noise.noise(p * 0.5) * 0.015
        c = c * (1.0 + m)
        if p.y < -40:  # forearm under the sleeve: slightly paler
            c = c * 0.97
        ca.data[v.index].color = (c.x, c.y, c.z, 1.0)

def build_nails(name, nails):
    bm = bmesh.new()
    for pts, frames, wid in nails:
        p0, p1 = pts[2], pts[3]
        f, u, r = frames[2]
        L = (p1 - p0).length
        tips = []
        na, nl = 13, 10
        grid = []
        for i in range(nl + 1):
            t = 0.42 + 0.62 * i / nl
            w = wid[2] + (wid[3] - wid[2]) * min(t, 1.0)
            c = p0 + f * (L * t)
            # the tip end of the nail follows the fingertip curve down a little
            drop = max(0.0, t - 0.9) * 10.0
            row = []
            for j in range(na + 1):
                a = rad(-58 + 116 * j / na)
                rr = w * 1.0 + 0.45
                hh = w * HFAC + 0.45
                # rounded nail outline: narrower at the base
                shrink = 1.0 - 0.25 * (1 - smooth01(0.42, 0.6, t))
                pt = c + r * (rr * math.sin(a) * shrink) + u * (hh * math.cos(a) - drop * (0.2 + abs(math.sin(a))))
                row.append(bm.verts.new(pt))
            grid.append(row)
        for i in range(nl):
            for j in range(na):
                bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    ob = mesh_obj(name, bm)
    so = ob.modifiers.new("thick", "SOLIDIFY")
    so.thickness = 0.55
    so.offset = -1
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    ca = me.color_attributes.new("Color", "BYTE_COLOR", "POINT")
    for v in me.vertices:
        ca.data[v.index].color = (0.93, 0.74, 0.70, 1.0)
    return ob

def build_sleeve(name):
    """Work-shirt cuff over the forearm, open at the wrist end."""
    bm = bmesh.new()
    seg, rings = 40, 22
    rows = []
    for i in range(rings + 1):
        t = i / rings
        y = -210 + 168 * t
        row = []
        for j in range(seg):
            a = 2 * PI * j / seg
            fold = 1.0 + 0.05 * noise.noise(Vector((math.cos(a) * 2, y * 0.04, math.sin(a) * 2))) + 0.03 * math.sin(a * 5 + y * 0.08)
            cuff = 1.06 if t > 0.86 else 1.0
            rx, rz = 41.0 * fold * cuff, 31.0 * fold * cuff
            row.append(bm.verts.new(Vector((rx * math.cos(a), y, 1.5 + rz * math.sin(a)))))
        rows.append(row)
    for i in range(rings):
        for j in range(seg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    ob = mesh_obj(name, bm)
    so = ob.modifiers.new("thick", "SOLIDIFY")
    so.thickness = 2.2
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons:
        p.use_smooth = True
    ca = ob.data.color_attributes.new("Color", "BYTE_COLOR", "POINT")
    for v in ob.data.vertices:
        n = noise.noise(v.co * 0.3) * 0.05
        ca.data[v.index].color = (0.22 + n, 0.27 + n, 0.33 + n, 1.0)
    return ob

def mirror_x(ob, name):
    me = ob.data.copy()
    me.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
    me.flip_normals()
    return link(bpy.data.objects.new(name, me))

def mat(name, rgb, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    attr = m.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    m.node_tree.links.new(attr.outputs["Color"], b.inputs["Base Color"])
    try:
        b.inputs["Subsurface Weight"].default_value = 0.15 if name == "skin" else 0.0
        b.inputs["Subsurface Radius"].default_value = (3.0, 1.2, 0.8)
    except Exception:
        pass
    return m

# =====================================================================================================
# poses
# =====================================================================================================
# Tripod grip: the index finger is posed by hand, the handle is laid under its pad, then the thumb and the middle
# finger are solved onto the handle.
# Pencil grip: the handle rests in the thumb-index web (W) and runs forward and down to the pinch. The index pad
# sits on top of it, the thumb pad on its thumb side, the middle finger under it.
HANDLE_A = Vector((-31.0, 72.0, 6.0))
HANDLE_D = (Vector((-28.0, 118.0, -45.0)) - HANDLE_A).normalized()
UPH = (Vector((0, 0, 1)) - HANDLE_D * HANDLE_D.z).normalized()
LEFT = HANDLE_D.cross(UPH).normalized()
if LEFT.x > 0:
    LEFT = -LEFT
UPH = (UPH * 0.85 - LEFT * 0.35).normalized()   # the index presses a little from the outer side
ix, ie = ik_index(62.0, UPH)
IX = (ix[0], ix[1], ix[1] * 0.62, ix[2])
tx, te = ik_thumb(52.0, LEFT)
mx, me_ = ik_middle(64.0, -UPH)
print("IK errors index %.2f thumb %.2f middle %.2f" % (ie, te, me_), "index", [round(v, 1) for v in ix], "thumb", [round(v, 1) for v in tx], "middle", [round(v, 1) for v in mx])
print("thumb", [round(a, 1) for a in tx], "middle", [round(a, 1) for a in mx])

POSE_PINCH = {
    "cup": 0.35,
    "index": IX,
    "middle": (mx[0], mx[1], mx[1] * 0.6, mx[2]),
    "ring": (70.0, 86.0, 50.0, 2.0, -5.0),
    "pinky": (76.0, 88.0, 48.0, 4.0, -9.0),
    "thumb": tuple(tx[:3]) + (tx[4], tx[5], tx[3]),
}
POSE_PRESS = {
    "cup": 0.15,
    "index": (14.0, 20.0, 8.0, -3.0),
    "middle": (46.0, 68.0, 38.0, 0.0, -3.0),
    "ring": (56.0, 76.0, 42.0, 1.0, -5.0),
    "pinky": (63.0, 80.0, 45.0, 3.0, -8.0),
    "thumb": (34.0, 18.0, 62.0, 8.0, 14.0, 4.0),
}

skin = mat("skin", (0.86, 0.62, 0.5), 0.52)
nailm = mat("nail", (0.93, 0.74, 0.7), 0.25)
cloth = mat("sleeve", (0.22, 0.27, 0.33), 0.9)

hR, nailsR, chR = build_hand("hand_R", POSE_PINCH)
nR = build_nails("nails_R", nailsR)
sR = build_sleeve("sleeve_R")
hP, nailsP, chP = build_hand("hand_Lsrc", POSE_PRESS)
nP = build_nails("nails_Lsrc", nailsP)
sP = build_sleeve("sleeve_Lsrc")
hL = mirror_x(hP, "hand_L")
nL = mirror_x(nP, "nails_L")
sL = mirror_x(sP, "sleeve_L")
for o in (hP, nP, sP):
    bpy.data.objects.remove(o, do_unlink=True)
for o, m in ((hR, skin), (hL, skin), (nR, nailm), (nL, nailm), (sR, cloth), (sL, cloth)):
    o.data.materials.clear()
    o.data.materials.append(m)

# grip frames (three.js axes): where the pick handle line is in the right hand; where the index pad presses on the left
pp, pn = pad_point(*chP["index"])
pp = Vector((-pp.x, pp.y, pp.z))
pn = Vector((-pn.x, pn.y, pn.z))
tpp, _ = pad_point(*chR["index"])
grip = {
    "R": {"a": three(HANDLE_A), "d": three(HANDLE_D), "up": three(UPH), "r": HANDLE_R,
          "indexPad": three(tpp)},
    "L": {"pad": three(pp), "padNormal": three(pn)},
}
with open(os.path.join(ASSETS, "hands.json"), "w") as f:
    json.dump(grip, f, indent=1)

path = os.path.join(ASSETS, "hands.glb")
for o in bpy.data.objects:
    o.select_set(o.name in ("hand_R", "nails_R", "sleeve_R", "hand_L", "nails_L", "sleeve_L"))
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                          export_materials="EXPORT", export_vertex_color="ACTIVE", export_cameras=False, export_lights=False,
                          export_animations=False, export_skins=False, export_morph=False, export_image_format="NONE",
                          export_extras=False)
print("EXPORTED", path, os.path.getsize(path) // 1024, "KB")

# =====================================================================================================
# preview render: both hands, a stand-in pick handle in the right hand
# =====================================================================================================
if not NO_RENDER:
    sc = SCENE
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    try:
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.2, 0.32, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    sc.world = w
    for e, rot in ((3.5, (0.6, 0.2, 0.5)), (1.2, (-0.5, -0.8, 0.3))):
        L = bpy.data.lights.new("sun", "SUN")
        L.energy = e
        lo = link(bpy.data.objects.new("sun", L))
        lo.rotation_euler = Vector(rot).to_track_quat("-Z", "Y").to_euler()
    # stand-in handle
    bm = bmesh.new()
    add_segment(bm, HANDLE_A - HANDLE_D * 25, HANDLE_A + HANDLE_D * 110, LEFT, UPH, 4.5, HANDLE_R, 4.5, HANDLE_R, seg=16, rings=4)
    ho = mesh_obj("handle_pv", bm)
    hm = mat("pv_handle", (0.8, 0.25, 0.1), 0.4)
    ho.data.materials.append(hm)
    ca = ho.data.color_attributes.new("Color", "BYTE_COLOR", "POINT")
    for v in ho.data.vertices:
        ca.data[v.index].color = (0.85, 0.3, 0.1, 1)
    sc.render.resolution_x, sc.render.resolution_y = 2000, 640
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = 1080
    co = link(bpy.data.objects.new("cam", cam))
    sc.camera = co
    cam.clip_start, cam.clip_end = 1, 5000
    co.location = (0, 0, 900)
    co.rotation_euler = (0, 0, 0)
    def sheet(fname, objs, thumb_sign, rots=None, step=270, scale=1080, res=(2000, 640), yoff=-60):
        rots = rots or [Matrix.Identity(4), Matrix.Rotation(PI, 4, "Y"), Matrix.Rotation(-thumb_sign * PI / 2, 4, "Y"), Matrix.Rotation(PI / 2, 4, "X")]
        cam.ortho_scale = scale
        sc.render.resolution_x, sc.render.resolution_y = res
        tmp = []
        for o in bpy.data.objects:
            if o.type == "MESH":
                o.hide_render = True
        for i, R in enumerate(rots):
            T = Matrix.Translation((-step * (len(rots) - 1) / 2 + step * i, 0, 0)) @ R @ Matrix.Translation((0, yoff, 0))
            for o in objs:
                d = link(bpy.data.objects.new(o.name + "_pv", o.data))
                d.matrix_world = T
                tmp.append(d)
        sc.render.filepath = os.path.join(PREV, fname + ".png")
        bpy.ops.render.render(write_still=True)
        print("PREVIEW", sc.render.filepath)
        for d in tmp:
            bpy.data.objects.remove(d, do_unlink=True)
    sheet("sheet_R", [hR, nR, ho], -1)
    sheet("sheet_L", [hL, nL], 1)
    q34 = Matrix.Rotation(PI / 2, 4, "Y") @ Matrix.Rotation(rad(-35), 4, "X") @ Matrix.Rotation(rad(25), 4, "Y")
    sheet("zoom_R", [hR, nR, ho], -1, rots=[Matrix.Rotation(PI / 2, 4, "Y"), q34, Matrix.Rotation(PI / 2, 4, "X") @ Matrix.Rotation(rad(30), 4, "Z")], step=200, scale=600, res=(1800, 800), yoff=-100)
    sheet("zoom_L", [hL, nL], 1, rots=[Matrix.Rotation(-PI / 2, 4, "Y"), Matrix.Rotation(rad(-50), 4, "X") @ Matrix.Rotation(rad(20), 4, "Z"), Matrix.Rotation(PI, 4, "Y")], step=200, scale=600, res=(1800, 800), yoff=-100)
