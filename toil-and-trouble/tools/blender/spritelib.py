"""spritelib.py: shared Blender pipeline that renders Toil & Trouble's pre-rendered sprites.

Characters are real 3D models, lit and rendered in Cycles with an orthographic side camera. Each frame is rendered
at SS times the game resolution, then averaged down to 1x in numpy with a hard alpha edge, the way 90s
pre-rendered sprites were squeezed onto a 16-bit screen. Frames are packed one animation per row into
art/<name>.png, with art/<name>.json describing them for js/sprites.js.

Scale: 1 game pixel = PX metres (0.05), so a 36 px witch is 1.8 m tall. The origin (feet centre) sits at world
(0, 0, 0); the character faces +X (game right) and the camera looks along +Y from -Y. World Z is up.

Usage inside a build script (run headless):
    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup --python build_x.py
    import spritelib as L
    L.setup_scene()
    sheet = L.Sheet('mags', w=56, h=56, ox=28, oy=50)
    for i in range(8): pose_walk(i / 8); sheet.add('walk')
    sheet.save()
"""
import bpy, json, math, os
import numpy as np

PX = 0.05          # metres per game pixel
SS = 4             # supersampling factor
HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.normpath(os.path.join(HERE, '..', '..', 'art'))


def setup_scene(samples=48):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dt in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dt
            prefs.get_devices()
            for d in prefs.devices: d.use = True
            sc.cycles.device = 'GPU'
            break
        except Exception:
            continue
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.render.filter_size = 1.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.20, 0.18, 0.28, 1); bg.inputs[1].default_value = 0.55
    # camera: orthographic, looking along +Y
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam)
    cam.location = (0, -20, 0); cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    # light rig matching the game: warm key upper-left-front, soft fill, cool rim back-right
    def sun(name, rot, energy, color):
        ld = bpy.data.lights.new(name, 'SUN'); ld.energy = energy; ld.color = color; ld.angle = math.radians(12)
        o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o); o.rotation_euler = [math.radians(a) for a in rot]
        return o
    sun('key', (55, -35, -40), 3.4, (1.0, 0.94, 0.84))
    sun('fill', (70, 20, 60), 0.7, (0.75, 0.8, 1.0))
    sun('rim', (-60, 0, 150), 2.6, (0.65, 0.78, 1.0))
    return sc


def mat(name, color, rough=0.6, metal=0.0, sss=0.0, spec=0.5, emit=None, coat=0.0):
    """Principled material. color is (r,g,b) 0..1 or '#rrggbb'."""
    if isinstance(color, str):
        h = color.lstrip('#'); color = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = tuple(c ** 2.2 for c in color)
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = spec
    if sss > 0:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.9, 0.35, 0.2)
        b.inputs['Subsurface Scale'].default_value = 0.03
    if coat > 0: b.inputs['Coat Weight'].default_value = coat
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*[c ** 2.2 for c in emit[:3]], 1)
        b.inputs['Emission Strength'].default_value = emit[3] if len(emit) > 3 else 2.0
    return m


def frame_camera(w, h, ox, oy):
    """Point the ortho camera so the w x h pixel frame has the origin (feet centre) at pixel (ox, oy)."""
    sc = bpy.context.scene
    sc.render.resolution_x = w * SS; sc.render.resolution_y = h * SS; sc.render.resolution_percentage = 100
    cam = sc.camera
    cam.data.ortho_scale = max(w, h) * PX
    # frame centre in world units relative to the origin
    cx = (w / 2 - ox) * PX
    cz = (oy - h / 2) * PX
    cam.location = (cx, -20, cz)
    if w >= h: sc.render.pixel_aspect_x = 1
    cam.data.sensor_fit = 'HORIZONTAL' if w >= h else 'VERTICAL'


def render_frame(w, h, rim=0.5):
    """Render the scene and return an h x w x 4 uint8 array at 1x."""
    sc = bpy.context.scene
    path = os.path.join(bpy.app.tempdir or os.environ.get('TEMP', '.'), '_frame.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h * SS, w * SS, 4)[::-1]
    bpy.data.images.remove(img)
    blk = px.reshape(h, SS, w, SS, 4)
    a = blk[..., 3]
    cov = a.mean(axis=(1, 3))
    wsum = a.sum(axis=(1, 3)) + 1e-6
    rgb = (blk[..., :3] * a[..., None]).sum(axis=(1, 3)) / wsum[..., None]
    out = np.zeros((h, w, 4), dtype=np.float32)
    on = cov >= 0.5
    out[..., :3] = np.clip(rgb, 0, 1)
    out[..., 3] = on.astype(np.float32)
    if rim > 0:
        pad = np.pad(on, 1)
        edge = on & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        out[edge, :3] *= (1 - rim * 0.45)
    return (out * 255 + 0.5).astype(np.uint8)


class Sheet:
    """Collects frames into one row per animation and writes art/<name>.png + .json."""

    def __init__(self, name, w, h, ox, oy, rim=0.5):
        self.name, self.w, self.h, self.ox, self.oy, self.rim = name, w, h, ox, oy, rim
        self.anims = {}   # anim -> list of frames (arrays)
        frame_camera(w, h, ox, oy)

    def add(self, anim, frame=None):
        frame_camera(self.w, self.h, self.ox, self.oy)
        f = frame if frame is not None else render_frame(self.w, self.h, self.rim)
        self.anims.setdefault(anim, []).append(f)
        return f

    def save(self):
        os.makedirs(ART, exist_ok=True)
        names = list(self.anims)
        cols = max(len(v) for v in self.anims.values())
        H, Wd = self.h * len(names), self.w * cols
        big = np.zeros((H, Wd, 4), dtype=np.uint8)
        meta = {'w': self.w, 'h': self.h, 'ox': self.ox, 'oy': self.oy, 'anims': {}}
        for r, n in enumerate(names):
            for c, f in enumerate(self.anims[n]):
                big[r * self.h:(r + 1) * self.h, c * self.w:(c + 1) * self.w] = f
            meta['anims'][n] = {'row': r, 'frames': len(self.anims[n])}
        img = bpy.data.images.new(self.name, Wd, H, alpha=True)
        img.pixels[:] = (big[::-1].astype(np.float32) / 255).ravel()
        img.filepath_raw = os.path.join(ART, self.name + '.png'); img.file_format = 'PNG'
        img.save()
        with open(os.path.join(ART, self.name + '.json'), 'w') as fh:
            json.dump(meta, fh, indent=1)
        print('wrote', self.name, Wd, 'x', H, {k: len(v) for k, v in self.anims.items()})
        self._big = big

    def preview(self, path, scale=4, bg=(52, 42, 66)):
        """Write a nearest-neighbour upscaled copy over a flat background, for eyeballing (call after save)."""
        big = self._big
        rgb = np.where(big[..., 3:4] > 0, big[..., :3], np.array(bg, dtype=np.uint8))
        up = np.repeat(np.repeat(rgb, scale, 0), scale, 1)
        h, w = up.shape[:2]
        img = bpy.data.images.new('prev_' + self.name, w, h, alpha=False)
        rgba = np.concatenate([up, np.full((h, w, 1), 255, np.uint8)], axis=2)
        img.pixels[:] = (rgba[::-1].astype(np.float32) / 255).ravel()
        img.filepath_raw = path; img.file_format = 'PNG'; img.save()


# ---- modelling helpers ---------------------------------------------------------------------------------------
def obj_from(prim, name, mat_, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), parent=None, smooth=True, **kw):
    getattr(bpy.ops.mesh, 'primitive_' + prim + '_add')(location=(0, 0, 0), **kw)
    o = bpy.context.active_object; o.name = name
    o.scale = scale; o.rotation_euler = rot; o.location = loc
    if mat_: o.data.materials.append(mat_)
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    if parent: o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if parent: o.parent = parent
    return o


def subsurf(o, levels=2):
    m = o.modifiers.new('ss', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    return o
