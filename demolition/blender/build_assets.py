# Builds the Data Center Demolition asset set in Blender and exports one GLB per asset.
#
#   blender -b --python datacenter/blender/build_assets.py -- <out_dir>
#
# Everything is modelled in metres at real equipment sizes (EIA-310 19" racks, 42U cabinets,
# 600 mm raised-floor tiles, 1U/2U/4U chassis) with Blender Z up; the exporter converts to glTF Y up.
# Origins sit at the floor-contact centre of each asset so the game can place them by footprint.
import bpy, math, os, sys, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(argv[0] if argv else os.path.join(HERE, "..", "assets"))
PREVIEW = os.path.join(HERE, "preview")
os.makedirs(OUT, exist_ok=True); os.makedirs(PREVIEW, exist_ok=True)

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1.0

# ---------------------------------------------------------------- materials
MATS = {}
def mat(name, color, rough=0.5, metal=0.0, emit=None, estr=1.0, img=None, alpha=1.0, cull=True):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs["Emission Strength"].default_value = estr
    if img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-600, 200)
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        clip = nt.nodes.new("ShaderNodeMath"); clip.operation = 'GREATER_THAN'; clip.inputs[1].default_value = 0.5
        clip.location = (-300, -200)
        nt.links.new(tex.outputs["Alpha"], clip.inputs[0]); nt.links.new(clip.outputs[0], b.inputs["Alpha"])
        m.surface_render_method = 'DITHERED'
    elif alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha; m.surface_render_method = 'BLENDED'
    m.use_backface_culling = cull
    MATS[name] = m
    return m

def perf_image(name, rgb, pitch=16, radius=6.4, stagger=True, size=256):
    """Procedural perforation mask: RGB = sheet colour, alpha = 0 inside the holes."""
    img = bpy.data.images.new(name, size, size, alpha=True)
    px = [0.0] * (size * size * 4)
    r2 = radius * radius; rowh = pitch * (math.sqrt(3) / 2 if stagger else 1.0)
    for y in range(size):
        row = int(y // rowh); fy = y - row * rowh - rowh / 2
        off = pitch / 2 if (stagger and row % 2) else 0.0
        for x in range(size):
            fx = (x + off) % pitch - pitch / 2
            hole = fx * fx + fy * fy < r2
            i = (y * size + x) * 4
            px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 0.0 if hole else 1.0
    img.pixels.foreach_set(px)
    img.pack()
    return img

IMG_RACK_PERF = perf_image("rack_perf", (0.035, 0.035, 0.037), pitch=16, radius=6.6)           # ~62% open hex perforation
IMG_TILE_PERF = perf_image("tile_perf", (0.42, 0.42, 0.40), pitch=16, radius=4.5, stagger=False)  # ~25% open vented tile
IMG_GPU_PERF  = perf_image("gpu_perf",  (0.05, 0.05, 0.05), pitch=14, radius=5.2)

M = dict(
    rack_black = mat("rack_black", (0.018, 0.018, 0.02), rough=0.55, metal=0.35),
    rack_perf  = mat("rack_perf",  (1, 1, 1), rough=0.5, metal=0.3, img=IMG_RACK_PERF, cull=False),
    rail       = mat("rail_zinc",  (0.55, 0.55, 0.52), rough=0.45, metal=0.9),
    pdu_strip  = mat("pdu_strip",  (0.03, 0.03, 0.03), rough=0.6),
    outlet_red = mat("outlet_red", (0.55, 0.04, 0.03), rough=0.5),
    outlet_blu = mat("outlet_blue",(0.05, 0.12, 0.55), rough=0.5),
    chassis    = mat("chassis_grey",(0.62, 0.63, 0.64), rough=0.42, metal=0.85),
    bezel      = mat("bezel_dark", (0.16, 0.16, 0.17), rough=0.6),
    caddy      = mat("caddy",      (0.55, 0.56, 0.58), rough=0.5, metal=0.6),
    caddy_latch= mat("caddy_latch",(0.08, 0.08, 0.09), rough=0.6),
    led_green  = mat("led_green",  (0.1, 0.9, 0.2), rough=0.3, emit=(0.1, 1.0, 0.25), estr=6.0),
    led_blue   = mat("led_blue",   (0.2, 0.5, 1.0), rough=0.3, emit=(0.2, 0.55, 1.0), estr=6.0),
    led_amber  = mat("led_amber",  (1.0, 0.6, 0.1), rough=0.3, emit=(1.0, 0.55, 0.1), estr=6.0),
    psu        = mat("psu_grey",   (0.5, 0.5, 0.5), rough=0.5, metal=0.7),
    fan_dark   = mat("fan_dark",   (0.03, 0.03, 0.03), rough=0.8),
    port       = mat("port_black", (0.02, 0.02, 0.02), rough=0.7),
    gpu_black  = mat("gpu_black",  (0.04, 0.04, 0.045), rough=0.5, metal=0.4),
    gpu_perf   = mat("gpu_perf",   (1, 1, 1), rough=0.5, metal=0.3, img=IMG_GPU_PERF, cull=False),
    gold       = mat("gold_anod",  (0.85, 0.62, 0.25), rough=0.35, metal=1.0),
    crac_white = mat("crac_white", (0.86, 0.87, 0.86), rough=0.45, metal=0.1),
    crac_dark  = mat("crac_dark",  (0.15, 0.16, 0.17), rough=0.55),
    screen     = mat("screen",     (0.05, 0.3, 0.6), rough=0.2, emit=(0.15, 0.55, 1.0), estr=3.0),
    screen_grn = mat("screen_green",(0.05, 0.4, 0.15), rough=0.2, emit=(0.2, 1.0, 0.3), estr=2.5),
    coil       = mat("coil_alu",   (0.6, 0.62, 0.65), rough=0.7, metal=0.8),
    copper     = mat("copper",     (0.8, 0.45, 0.25), rough=0.4, metal=1.0),
    pdu_grey   = mat("pdu_grey",   (0.66, 0.67, 0.66), rough=0.5, metal=0.1),
    breaker    = mat("breaker",    (0.05, 0.05, 0.05), rough=0.6),
    breaker_red= mat("breaker_red",(0.6, 0.05, 0.04), rough=0.5),
    ups_dark   = mat("ups_dark",   (0.17, 0.18, 0.19), rough=0.5, metal=0.2),
    tile_lam   = mat("tile_laminate",(0.47, 0.47, 0.45), rough=0.35),
    tile_edge  = mat("tile_edge",  (0.06, 0.06, 0.06), rough=0.7),
    tile_perf  = mat("tile_perf",  (1, 1, 1), rough=0.4, img=IMG_TILE_PERF, cull=False),
    pedestal   = mat("pedestal_zinc",(0.6, 0.6, 0.58), rough=0.5, metal=0.9),
    galv       = mat("galvanised", (0.6, 0.61, 0.6), rough=0.5, metal=0.9),
    cat6_blue  = mat("cat6_blue",  (0.05, 0.2, 0.75), rough=0.6),
    fiber_yel  = mat("fiber_yellow",(0.95, 0.75, 0.05), rough=0.55),
    fiber_aqua = mat("fiber_aqua", (0.1, 0.75, 0.8), rough=0.55),
    power_blk  = mat("power_black",(0.03, 0.03, 0.03), rough=0.7),
    duct_yel   = mat("duct_yellow",(0.93, 0.72, 0.08), rough=0.5),
    alu        = mat("aluminium",  (0.72, 0.73, 0.74), rough=0.4, metal=1.0),
    glass      = mat("glass_clear",(0.85, 0.9, 0.95), rough=0.05, metal=0.0, alpha=0.22, cull=False),
    tap_red    = mat("tap_red",    (0.7, 0.08, 0.06), rough=0.5),
    tap_blue   = mat("tap_blue",   (0.08, 0.2, 0.7), rough=0.5),
    fire_red   = mat("fire_red",   (0.72, 0.05, 0.04), rough=0.4, metal=0.1),
    brass      = mat("brass",      (0.75, 0.6, 0.3), rough=0.35, metal=1.0),
    steel_pipe = mat("steel_pipe", (0.5, 0.5, 0.52), rough=0.5, metal=0.8),
    white      = mat("white_plastic",(0.9, 0.9, 0.88), rough=0.45),
    lens_red   = mat("lens_red",   (0.8, 0.05, 0.05), rough=0.2, emit=(1.0, 0.05, 0.05), estr=0.5),
    yellow     = mat("safety_yellow",(0.95, 0.8, 0.05), rough=0.5),
    led_lens   = mat("led_lens",   (1, 1, 1), rough=0.3, emit=(1.0, 0.97, 0.9), estr=4.0),
    label      = mat("label_white",(0.92, 0.92, 0.9), rough=0.6),
)

# ---------------------------------------------------------------- mesh builder
class MB:
    """Accumulates boxes/cylinders into one mesh with per-face materials and planar UVs."""
    def __init__(self):
        self.v = []; self.f = []; self.fm = []; self.uv = []
        self.mats = []
    def _mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def box(self, c, s, m, uvs=1.0):
        cx, cy, cz = c; hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        b = len(self.v)
        P = [(cx-hx,cy-hy,cz-hz),(cx+hx,cy-hy,cz-hz),(cx+hx,cy+hy,cz-hz),(cx-hx,cy+hy,cz-hz),
             (cx-hx,cy-hy,cz+hz),(cx+hx,cy-hy,cz+hz),(cx+hx,cy+hy,cz+hz),(cx-hx,cy+hy,cz+hz)]
        self.v += P
        faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(2,3,7,6),(1,2,6,5),(3,0,4,7)]  # -Z +Z -Y +Y +X -X
        mi = self._mi(m)
        for fc in faces:
            self.f.append(tuple(b + i for i in fc)); self.fm.append(mi)
            pts = [P[i] for i in fc]
            n = [abs(pts[0][k] - pts[2][k]) for k in range(3)]
            ax = n.index(min(n))  # flat axis
            a, bb = [k for k in range(3) if k != ax]
            self.uv.append([(p[a] * uvs, p[bb] * uvs) for p in pts])
    def cyl(self, c, r, h, m, axis='Z', seg=24, uvs=1.0, r2=None):
        r2 = r if r2 is None else r2
        b = len(self.v); mi = self._mi(m)
        ring = lambda rr, t: [(math.cos(2*math.pi*i/seg)*rr, math.sin(2*math.pi*i/seg)*rr, t) for i in range(seg)]
        lo = ring(r, -h/2); hi = ring(r2, h/2)
        def tr(p):
            x, y, z = p
            if axis == 'Z': q = (x, y, z)
            elif axis == 'Y': q = (x, z, -y)
            else: q = (z, y, -x)
            return (q[0]+c[0], q[1]+c[1], q[2]+c[2])
        self.v += [tr(p) for p in lo] + [tr(p) for p in hi]
        for i in range(seg):
            j = (i + 1) % seg
            self.f.append((b+i, b+j, b+seg+j, b+seg+i)); self.fm.append(mi)
            self.uv.append([(i/seg*2*math.pi*r*uvs, 0), (j/seg*2*math.pi*r*uvs, 0), (j/seg*2*math.pi*r*uvs, h*uvs), (i/seg*2*math.pi*r*uvs, h*uvs)])
        self.f.append(tuple(b+i for i in reversed(range(seg)))); self.fm.append(mi)
        self.uv.append([(p[0]*uvs, p[1]*uvs) for p in reversed(lo)])
        self.f.append(tuple(b+seg+i for i in range(seg))); self.fm.append(mi)
        self.uv.append([(p[0]*uvs, p[1]*uvs) for p in hi])
    def build(self, name, coll, bevel=None, smooth=False):
        me = bpy.data.meshes.new(name); me.from_pydata(self.v, [], self.f)
        for m in self.mats: me.materials.append(m)
        for p, mi in zip(me.polygons, self.fm): p.material_index = mi; p.use_smooth = smooth
        uvl = me.uv_layers.new(name="UVMap")
        for p, fuv in zip(me.polygons, self.uv):
            for li, uv in zip(p.loop_indices, fuv): uvl.data[li].uv = uv
        me.validate(); me.update()
        ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
        if bevel:
            md = ob.modifiers.new("Bevel", 'BEVEL'); md.width = bevel; md.segments = 2; md.limit_method = 'ANGLE'
        return ob

def coll(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c

ASSETS = {}  # name -> collection

# ---------------------------------------------------------------- RACK (42U, 600 x 1070 x 2000)
def build_rack():
    c = coll("rack"); W, D, H = 0.6, 1.07, 2.0
    fr = MB()
    fr.box((0, 0, 0.06), (W, D, 0.08), M["rack_black"])                      # plinth
    for x in (-W/2+0.025, W/2-0.025):
        for y in (-D/2+0.025, D/2-0.025):
            fr.box((x, y, H/2), (0.05, 0.05, H), M["rack_black"])             # corner posts
            fr.cyl((x, y, 0.01), 0.02, 0.02, M["rail"])                        # levelling feet
    fr.box((0, 0, H-0.015), (W, D, 0.03), M["rack_black"])                    # top panel
    fr.box((0, D/2-0.12, H-0.0301), (0.25, 0.1, 0.004), M["fan_dark"])        # top cable brush grommet
    for x in (-0.2375, 0.2375):                                               # EIA 19" rails, front & rear
        fr.box((x, -D/2+0.12, 0.1+1.867/2+0.02), (0.03, 0.004, 1.867), M["rail"])
        fr.box((x,  D/2-0.20, 0.1+1.867/2+0.02), (0.03, 0.004, 1.867), M["rail"])
    for y in (-D/2+0.12, D/2-0.20):                                           # rail cross braces
        fr.box((0, y, 0.11), (0.5, 0.02, 0.02), M["rack_black"]); fr.box((0, y, H-0.04), (0.5, 0.02, 0.02), M["rack_black"])
    fr.build("frame", c, bevel=0.003)
    for side in (-1, 1):                                                      # removable side panels
        sp = MB(); sp.box((side*(W/2-0.006), 0, H/2+0.02), (0.012, D-0.11, H-0.13), M["rack_black"])
        sp.box((side*(W/2-0.0125), 0, 1.0), (0.001, 0.08, 0.3), M["rack_black"])  # latch
        sp.build("side_%s" % ("L" if side < 0 else "R"), c, bevel=0.002)
    def door(name, x0, w, y, flip):
        d = MB(); t = 0.025
        d.box((x0, y, 0.11), (w, t, 0.04), M["rack_black"]); d.box((x0, y, H-0.045), (w, t, 0.04), M["rack_black"])
        d.box((x0-w/2+0.02, y, H/2+0.02), (0.04, t, H-0.13), M["rack_black"]); d.box((x0+w/2-0.02, y, H/2+0.02), (0.04, t, H-0.13), M["rack_black"])
        d.box((x0, y, H/2+0.02), (w-0.08, 0.002, H-0.21), M["rack_perf"], uvs=10.0)  # perforated sheet
        d.box((x0 + flip*(w/2-0.06), y - 0.018, 1.1), (0.03, 0.012, 0.16), M["rail"])  # handle
        d.build(name, c, bevel=0.002)
    door("door_front", 0, W-0.01, -D/2+0.0125, 1)
    door("door_rear_L", -W/4, W/2-0.006, D/2-0.0125, -1); door("door_rear_R", W/4, W/2-0.006, D/2-0.0125, 1)
    for side, mt in ((-1, M["outlet_red"]), (1, M["outlet_blu"])):            # two 0U rack PDUs (A/B feeds)
        p = MB(); x = side*0.255; y = D/2-0.09
        p.box((x, y, 1.0), (0.055, 0.045, 1.6), M["pdu_strip"])
        for i in range(24): p.box((x, y-0.0235, 0.25+i*0.064), (0.028, 0.004, 0.028), mt)
        p.box((x, y-0.0235, 1.83), (0.03, 0.003, 0.02), M["screen_grn"])
        p.build("pdu_%s" % ("A" if side < 0 else "B"), c)
    ASSETS["rack"] = c
build_rack()

# ---------------------------------------------------------------- SERVERS (1U, 2U, 4U GPU)
def server(name, U, caddies, gpu=False):
    c = coll(name); H = 0.04445*U - 0.0015; W = 0.437; D = 0.72 if not gpu else 0.88
    s = MB(); body = M["gpu_black"] if gpu else M["chassis"]
    s.box((0, 0, H/2), (W, D, H), body)
    for x in (-1, 1):
        s.box((x*(W/2+0.011), -D/2+0.01, H/2), (0.022, 0.02, H), M["bezel"])      # mounting ears
        s.box((x*(W/2+0.011), -D/2-0.012, H/2), (0.012, 0.012, H*0.6), M["rail"])  # handles
    s.box((0, -D/2-0.002, H/2), (W, 0.006, H), M["bezel"] if not gpu else M["gpu_black"])  # bezel plate
    if gpu:
        for i in range(6):                                                    # six hex-grille fan intakes
            s.box((-W/2+0.045+i*0.07, -D/2-0.007, H*0.55), (0.06, 0.004, H*0.72), M["gpu_perf"], uvs=12.0)
        s.box((0, -D/2-0.007, 0.012), (W-0.02, 0.004, 0.012), M["gold"])
        s.box((W/2-0.05, -D/2-0.009, H-0.012), (0.03, 0.002, 0.004), M["led_green"])
    else:
        cols, rows, cw, ch = caddies
        y0 = -D/2-0.006
        for r in range(rows):
            for col in range(cols):
                x = -W/2+0.03+cw/2+col*cw*1.02; z = 0.006+ch/2+r*ch*1.08
                s.box((x, y0, z), (cw-0.0025, 0.006, ch-0.0025), M["caddy"])
                s.box((x-cw/2+0.004, y0-0.004, z), (0.004, 0.002, ch*0.5), M["caddy_latch"])
                s.box((x+cw/2-0.006, y0-0.004, z+ch*0.3), (0.003, 0.002, 0.003), M["led_green"])
        s.box((W/2-0.03, y0-0.003, H-0.012), (0.012, 0.002, 0.004), M["led_blue"])   # power/ID light
        s.box((W/2-0.015, y0-0.003, H-0.012), (0.006, 0.002, 0.004), M["led_amber"])
    # rear: PSUs, fans, ports
    yr = D/2+0.004; npsu = 6 if gpu else 2
    for i in range(npsu):
        x = W/2-0.05-(i%3)*0.085 if gpu else W/2-0.05-i*0.085; z = (0.03 + (i//3)*0.045) if gpu else H/2
        s.box((x, yr, z), (0.075, 0.008, min(H, 0.04)), M["psu"])
        s.cyl((x-0.015, yr+0.002, z), 0.016, 0.004, M["fan_dark"], axis='Y', seg=12)
        s.box((x+0.03, yr+0.003, z), (0.004, 0.002, 0.004), M["led_green"])
    for i in range(4): s.box((-W/2+0.04+i*0.02, yr, 0.015), (0.016, 0.006, 0.012), M["port"])
    if not gpu: s.cyl((-W/2+0.15, yr+0.002, H/2), min(0.016, H*0.4), 0.004, M["fan_dark"], axis='Y', seg=12)
    s.build("server", c)
    ASSETS[name] = c
server("server1u", 1, (8, 1, 0.048, 0.034))
server("server2u", 2, (4, 3, 0.1, 0.027))
server("gpu4u", 4, None, gpu=True)

# ---------------------------------------------------------------- CRAC (downflow, 2300 x 900 x 1980)
def build_crac():
    c = coll("crac"); W, D, H = 2.3, 0.9, 1.98
    b = MB(); b.box((0, 0, 0.05), (W, D, 0.1), M["crac_dark"])
    b.box((0, 0.05, H/2+0.05), (W, D-0.1, H-0.1), M["crac_white"])            # body (front panels separate)
    b.box((0, 0, H-0.02), (W, D, 0.04), M["crac_white"])
    b.build("body", c, bevel=0.004)
    f = MB()                                                                   # EC plug fans in the base
    for i in range(3):
        x = -W/2+0.4+i*0.75
        f.cyl((x, 0.05, 0.3), 0.09, 0.12, M["fan_dark"])
        for k in range(7):
            a = k*2*math.pi/7; f.box((x+math.cos(a)*0.2, 0.05+math.sin(a)*0.2, 0.3), (0.22, 0.05, 0.015), M["coil"])
        f.cyl((x, 0.05, 0.3), 0.28, 0.02, M["galv"], r2=0.28)
    f.build("fans", c)
    co = MB(); co.box((0, 0.1, 1.2), (W-0.2, 0.25, 1.0), M["coil"], uvs=1)   # A-frame cooling coil, header pipes
    for i in range(4): co.cyl((W/2-0.25-i*0.05, 0.1, 1.2), 0.012, 1.0, M["copper"])
    co.build("coil", c)
    pl = MB(); x0 = -W/2+0.35; pl.box((x0, -D/2+0.012, H/2+0.05), (0.7, 0.025, H-0.1), M["crac_white"])
    pl.box((x0, -D/2-0.003, 1.45), (0.32, 0.006, 0.22), M["crac_dark"]); pl.box((x0, -D/2-0.007, 1.45), (0.28, 0.004, 0.18), M["screen"])
    pl.box((x0, -D/2-0.004, 1.8), (0.3, 0.004, 0.05), M["label"])
    pl.build("panel_controls", c, bevel=0.003)
    g = MB(); x1 = W/2-0.8+0.02; gw = 1.56
    g.box((x1, -D/2+0.012, 0.6), (gw, 0.025, 1.0), M["crac_white"])            # lower solid panel
    g.box((x1, -D/2+0.012, 1.5), (gw, 0.025, 0.06), M["crac_white"]); g.box((x1, -D/2+0.012, 1.93), (gw, 0.025, 0.06), M["crac_white"])
    for side in (-1, 1): g.box((x1+side*(gw/2-0.03), -D/2+0.012, 1.7), (0.06, 0.025, 0.86), M["crac_white"])
    for k in range(16): g.box((x1, -D/2+0.012, 1.14+k*0.05), (gw-0.12, 0.02, 0.018), M["crac_dark"])  # return-air louvres
    g.build("panel_grille", c, bevel=0.003)
    ASSETS["crac"] = c
build_crac()

# ---------------------------------------------------------------- PDU (floor power distribution unit)
def build_pdu():
    c = coll("pdu"); W, D, H = 1.0, 0.75, 1.98
    b = MB(); b.box((0, 0, 0.04), (W, D, 0.08), M["crac_dark"]); b.box((0, 0.02, H/2+0.04), (W, D-0.04, H-0.08), M["pdu_grey"])
    b.build("cabinet", c, bevel=0.004)
    t = MB(); t.box((0, 0.1, 0.6), (0.6, 0.45, 0.6), M["coil"])                # isolation transformer core
    for i in range(3): t.cyl((-0.2+i*0.2, 0.1, 0.6), 0.09, 0.5, M["copper"], seg=20)
    for i in range(2): t.box((0, 0.1, 1.3+i*0.3), (0.7, 0.3, 0.1), M["breaker"])  # bus bars / panelboard interior
    t.build("transformer", c)
    d = MB(); d.box((0, -D/2+0.012, H/2+0.04), (W-0.04, 0.024, H-0.1), M["pdu_grey"])
    d.box((0, -D/2-0.002, 1.72), (0.32, 0.006, 0.14), M["crac_dark"]); d.box((0, -D/2-0.006, 1.72), (0.28, 0.004, 0.1), M["screen_grn"])
    d.box((0, -D/2-0.002, 1.5), (0.6, 0.006, 0.02), M["label"])
    d.box((0, -D/2-0.004, 1.38), (0.12, 0.012, 0.08), M["breaker_red"])       # main breaker
    for col in range(2):                                                       # 42-pole panelboard
        for r in range(21):
            d.box((-0.09+col*0.18, -D/2-0.004, 0.25+r*0.052), (0.05, 0.01, 0.02), M["breaker"])
            d.box((-0.09+col*0.18+(0.03 if col else -0.03), -D/2-0.002, 0.25+r*0.052), (0.008, 0.004, 0.012), M["label"])
    d.box((W/2-0.08, -D/2-0.012, 1.0), (0.02, 0.02, 0.15), M["rail"])
    d.build("door", c, bevel=0.003)
    ASSETS["pdu"] = c
build_pdu()

# ---------------------------------------------------------------- UPS + battery cabinet
def build_ups():
    c = coll("ups"); H, D = 2.0, 0.85
    def cab(name, x0, W, display):
        b = MB(); b.box((x0, 0, 0.04), (W, D, 0.08), M["crac_dark"]); b.box((x0, 0.02, H/2+0.04), (W, D-0.04, H-0.08), M["ups_dark"])
        b.build(name, c, bevel=0.004)
        inner = MB()
        for r in range(5): inner.box((x0, 0.1, 0.25+r*0.33), (W-0.15, 0.5, 0.22), M["breaker"] if display else M["pdu_grey"])
        inner.build(name+"_internals", c)
        d = MB(); d.box((x0, -D/2+0.012, H/2+0.04), (W-0.04, 0.024, H-0.1), M["ups_dark"])
        for r in range(14): d.box((x0, -D/2-0.001, 0.2+r*0.06), (W-0.2, 0.003, 0.025), M["breaker"])  # intake vents
        if display:
            d.box((x0, -D/2-0.004, 1.6), (0.4, 0.008, 0.26), M["crac_dark"]); d.box((x0, -D/2-0.009, 1.6), (0.34, 0.004, 0.2), M["screen"])
            d.box((x0, -D/2-0.002, 1.85), (0.5, 0.004, 0.04), M["label"])
        d.box((x0+W/2-0.08, -D/2-0.012, 1.0), (0.02, 0.02, 0.15), M["rail"])
        d.build(name+"_door", c, bevel=0.003)
    cab("ups", 0, 1.2, True); cab("battery", 1.0, 0.8, False)
    ASSETS["ups"] = c
build_ups()

# ---------------------------------------------------------------- RAISED FLOOR (600 mm tiles, 600 mm plenum)
def build_floor():
    c = coll("floor"); T = 0.035
    s = MB(); s.box((0, 0, T/2), (0.6, 0.6, T), M["tile_edge"]); s.box((0, 0, T-0.001), (0.594, 0.594, 0.003), M["tile_lam"], uvs=1)
    s.build("tile_solid", c, bevel=0.002)
    p = MB(); p.box((0, 0, T/2), (0.6, 0.6, T), M["tile_perf"], uvs=2.5); p.build("tile_perf", c)
    pd = MB(); pd.box((0, 0, 0.003), (0.1, 0.1, 0.006), M["pedestal"]); pd.cyl((0, 0, 0.28), 0.019, 0.55, M["pedestal"], seg=16)
    pd.box((0, 0, 0.562), (0.09, 0.09, 0.006), M["pedestal"]); pd.build("pedestal", c)
    st = MB(); st.box((0, 0, 0.55), (0.6, 0.03, 0.03), M["pedestal"]); st.build("stringer", c)
    ASSETS["floor"] = c
build_floor()

# ---------------------------------------------------------------- OVERHEAD: cable tray, fibre duct, busway
def build_overhead():
    c = coll("overhead"); L = 3.0
    t = MB()
    for y in (-0.215, 0.215):
        t.box((0, y, 0.05), (L, 0.02, 0.1), M["galv"]); t.box((0, y*0.93, 0.005), (L, 0.05, 0.01), M["galv"]); t.box((0, y*0.93, 0.095), (L, 0.05, 0.01), M["galv"])
    for i in range(10): t.box((-L/2+0.15+i*0.3, 0, 0.012), (0.03, 0.43, 0.02), M["galv"])
    t.build("tray", c)
    cb = MB()
    for i in range(16): cb.cyl((0, -0.17+i*0.011 + (0.005 if i%2 else 0), 0.028 + (0.007 if i%2 else 0)), 0.0035, L, M["cat6_blue"], axis='X', seg=8)
    for i in range(4): cb.cyl((0, 0.05+i*0.012, 0.03), 0.0045, L, M["power_blk"], axis='X', seg=8)
    for i in range(5): cb.cyl((0, 0.12+i*0.008, 0.025), 0.0025, L, M["fiber_aqua"], axis='X', seg=8)
    cb.build("cables", c)
    fd = MB(); fd.box((0, 0, 0.005), (L, 0.1, 0.01), M["duct_yel"]); fd.box((0, -0.045, 0.05), (L, 0.01, 0.1), M["duct_yel"]); fd.box((0, 0.045, 0.05), (L, 0.01, 0.1), M["duct_yel"])
    for i in range(6): fd.cyl((0, -0.03+i*0.012, 0.02), 0.003, L-0.1, M["fiber_yel"], axis='X', seg=8)
    fd.build("fiber_duct", c)
    bw = MB(); bw.box((0, 0, 0.07), (L, 0.1, 0.14), M["alu"]); bw.box((0, 0, 0.0), (L, 0.04, 0.012), M["breaker"]); bw.build("busway", c, bevel=0.003)
    for nm, mt in (("tapbox_a", M["tap_red"]), ("tapbox_b", M["tap_blue"])):
        tb = MB(); tb.box((0, 0, 0.08), (0.25, 0.16, 0.2), mt); tb.box((0, -0.082, 0.1), (0.06, 0.004, 0.04), M["label"])
        tb.box((0.08, 0, 0.12), (0.03, 0.17, 0.03), M["breaker"])
        tb.cyl((0, 0, -0.2), 0.012, 0.4, M["power_blk"], seg=10); tb.build(nm, c)
    ASSETS["overhead"] = c
build_overhead()

# ---------------------------------------------------------------- HOT-AISLE CONTAINMENT
def build_containment():
    c = coll("containment")
    def framed(name, W, H, thick=0.04, glass=True, handle=False):
        f = MB()
        for x in (-W/2+0.025, W/2-0.025): f.box((x, 0, H/2), (0.05, thick, H), M["alu"])
        for z in (0.025, H-0.025): f.box((0, 0, z), (W, thick, 0.05), M["alu"])
        if H > 1: f.box((0, 0, 1.0), (W, thick, 0.05), M["alu"])
        f.box((0, 0, H/2), (W-0.1, 0.006, H-0.1), M["glass"] if glass else M["alu"])
        if handle: f.box((W/2-0.12, -thick/2-0.02, 1.05), (0.03, 0.04, 0.3), M["rail"])
        f.build(name, c, bevel=0.002)
    framed("door_panel", 1.0, 2.0, handle=True)
    framed("end_panel", 0.6, 2.0)
    r = MB()
    for y in (-0.6+0.025, 0.6-0.025): r.box((0, y, 0.015), (1.2, 0.05, 0.03), M["alu"])
    for x in (-0.6+0.025, 0.6-0.025): r.box((x, 0, 0.015), (0.05, 1.2, 0.03), M["alu"])
    r.box((0, 0, 0.015), (1.1, 1.1, 0.006), M["glass"]); r.build("roof_panel", c)
    ASSETS["containment"] = c
build_containment()

# ---------------------------------------------------------------- FIRE / SAFETY
def build_fire():
    c = coll("fire")
    cy = MB(); cy.cyl((0, 0, 0.75), 0.2, 1.5, M["fire_red"], seg=28); cy.cyl((0, 0, 1.53), 0.2, 0.06, M["fire_red"], r2=0.08, seg=28)
    cy.cyl((0, 0, 1.62), 0.055, 0.16, M["brass"], seg=14); cy.box((0, 0, 1.7), (0.14, 0.14, 0.04), M["brass"])
    cy.cyl((0, 0, 2.1), 0.03, 0.8, M["steel_pipe"], seg=12); cy.cyl((0, 0.4, 2.5), 0.03, 0.8, M["steel_pipe"], axis='Y', seg=12)
    cy.box((0, -0.19, 0.9), (0.14, 0.004, 0.25), M["label"]); cy.cyl((0, 0, 0.02), 0.21, 0.04, M["breaker"], seg=28)
    cy.build("agent_cylinder", c, smooth=True)
    ps = MB(); ps.box((0, 0, 0.07), (0.1, 0.07, 0.14), M["fire_red"]); ps.box((0, -0.04, 0.05), (0.06, 0.012, 0.03), M["label"]); ps.box((0, -0.037, 0.1), (0.07, 0.004, 0.02), M["label"]); ps.build("pull_station", c)
    st = MB(); st.box((0, 0, 0.05), (0.13, 0.06, 0.1), M["white"]); st.box((0, -0.04, 0.05), (0.08, 0.03, 0.05), M["lens_red"]); st.build("strobe", c)
    ep = MB(); ep.box((0, 0, 0.06), (0.12, 0.07, 0.12), M["yellow"]); ep.cyl((0, -0.045, 0.06), 0.034, 0.03, M["fire_red"], axis='Y', seg=20); ep.box((0, -0.036, 0.11), (0.1, 0.002, 0.012), M["label"]); ep.build("epo", c)
    sd = MB(); sd.cyl((0, 0, -0.02), 0.06, 0.04, M["white"], seg=20); sd.box((0, 0, -0.041), (0.01, 0.01, 0.002), M["led_green"]); sd.build("smoke_detector", c)
    ASSETS["fire"] = c
build_fire()

# ---------------------------------------------------------------- LIGHTING
def build_light():
    c = coll("light"); l = MB(); l.box((0, 0, -0.03), (1.2, 0.1, 0.06), M["white"]); l.box((0, 0, -0.061), (1.14, 0.07, 0.004), M["led_lens"]); l.build("led_fixture", c)
    ASSETS["light"] = c
build_light()

# ---------------------------------------------------------------- export + previews
def bbox(objs):
    pts = [ob.matrix_world @ Vector(co) for ob in objs for co in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi

# render rig
cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN')); sun.data.energy = 3.0; sun.rotation_euler = (math.radians(50), 0, math.radians(-35)); scene.collection.objects.link(sun)
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", 'AREA')); fill.data.energy = 400; fill.data.size = 4; fill.location = (3, -3, 3); fill.rotation_euler = (math.radians(55), 0, math.radians(45)); scene.collection.objects.link(fill)
world = bpy.data.worlds.new("w"); world.use_nodes = True; world.node_tree.nodes["Background"].inputs[0].default_value = (0.35, 0.36, 0.38, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.6; scene.world = world
try:
    scene.render.engine = 'BLENDER_EEVEE'; scene.eevee.taa_render_samples = 24
except Exception:
    scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 560; scene.render.resolution_y = 420; scene.render.image_settings.file_format = 'PNG'

report = {}
for name, c in ASSETS.items():
    objs = [o for o in c.objects]
    for o in bpy.data.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='AUTO')
    lo, hi = bbox(objs); ctr = (lo + hi) / 2; size = max((hi - lo).length, 0.3)
    cam.location = ctr + Vector((0.9, -1.3, 0.75)).normalized() * size * 1.9
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for other in ASSETS.values():
        other.hide_render = other is not c
    scene.render.filepath = os.path.join(PREVIEW, name + ".png")
    bpy.ops.render.render(write_still=True)
    report[name] = dict(objects=[o.name for o in objs], size=[round(v, 3) for v in (hi - lo)], bytes=os.path.getsize(path))

# lay the assets out in a row and keep the .blend as the source file
for c in ASSETS.values(): c.hide_render = False
x = 0.0
for name, c in ASSETS.items():
    lo, hi = bbox(list(c.objects)); w = hi.x - lo.x
    for o in c.objects: o.location.x += x - lo.x
    x += w + 0.8
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "datacenter_assets.blend"))
print("ASSET_REPORT " + json.dumps(report))
