"""Render the welcome hero: the playable table at player eye level under a three-shade lamp.

blender -b mobile/assets/models/cuemaster-table.blend --python tools/build_hero.py
Writes mobile/assets/lounge/hero.jpg. Balls use the game's enlarged radius and the same
number masks as the runtime texture, so the art matches what people then play.
"""
import bpy, os, json, math
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mobile/assets/lounge/hero.jpg")
R = json.load(open(os.path.join(ROOT, "mobile/src/physics/table.json")))["radius"]
NUMBERS = json.load(open(os.path.join(ROOT, "mobile/assets/models/numbers.json")))
HEX = ["#faf9f2", "#e8af16", "#1646a4", "#bd2627", "#622d87", "#e0651f", "#176a45", "#752329",
       "#171b20", "#e8af16", "#1646a4", "#bd2627", "#622d87", "#e0651f", "#176a45", "#752329"]
scene = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in {"LIGHT", "CAMERA"}:
        bpy.data.objects.remove(o, do_unlink=True)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def mat(name, color, rough=0.5, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = principled(m)
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*color, 1)
        p.inputs["Emission Strength"].default_value = emit
    return m


# Lagos venue finish, matching the runtime skin.
# Slightly deeper than the runtime hex: Cycles' filmic view lifts bright cloth towards mint.
for key, hexc in [("cloth", "#02603a"), ("cushion", "#0b3f2f"), ("wood", "#3a2519")]:
    m = bpy.data.materials.get(key)
    if m:
        principled(m).inputs["Base Color"].default_value = (*lin(hexc), 1)
cloth = bpy.data.materials.get("cloth")
if cloth:
    nodes, links, bs = cloth.node_tree.nodes, cloth.node_tree.links, principled(cloth)
    tex = nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 900
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    links.new(tex.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bs.inputs["Normal"])


def ball_image(i):
    w, h = 512, 256
    ys, xs = np.mgrid[0:h, 0:w]
    theta = np.pi * ys / h
    phi = 2 * np.pi * xs / w
    sy = np.cos(theta)
    sx = -np.cos(phi) * np.sin(theta)
    sz = np.sin(phi) * np.sin(theta)
    img = np.ones((h, w, 3)) * np.array(lin(HEX[i]))
    ivory = np.array(lin("#f9f8f0"))
    if i > 8:
        img[np.abs(sy) > 0.52] = ivory
    if i > 0:
        patch = np.abs(sz) > math.sqrt(1 - 0.49 ** 2)
        img[patch] = np.array(lin("#fcfbf5"))
        mx = np.floor(((sx / 0.44) * 0.5 + 0.5) * 48).astype(int)
        my = np.floor(((-sy / 0.44) * 0.5 + 0.5) * 48).astype(int)
        ok = patch & (mx >= 0) & (mx < 48) & (my >= 0) & (my < 48)
        mask = np.array(NUMBERS[i]).reshape(48, 48) / 255
        a = np.zeros((h, w))
        a[ok] = mask[my[ok], mx[ok]]
        ink = np.array(lin("#111414"))
        img = img * (1 - a[..., None]) + ink * a[..., None]
    rgba = np.concatenate([img, np.ones((h, w, 1))], axis=2)[::-1]  # Blender images start bottom-left
    im = bpy.data.images.new(f"ball{i}", w, h, float_buffer=True)
    im.colorspace_settings.name = "Linear Rec.709"
    im.pixels = rgba.astype(np.float32).ravel()
    return im


def ball(i, x, y, spin=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=R, location=(x, y, R))
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    # Poles (stripe caps) near vertical, as balls settle: colour band and number face the room.
    o.rotation_euler = (0.35, 0, spin)
    m = bpy.data.materials.new(f"Ball {i}")
    m.use_nodes = True
    p = principled(m)
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = ball_image(i)
    m.node_tree.links.new(t.outputs["Color"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.22
    p.inputs["Coat Weight"].default_value = 1.0
    p.inputs["Coat Roughness"].default_value = 0.03
    o.data.materials.append(m)
    return o


# A game in progress: cue ball in the foreground lined up on the 3 into the far corner.
H, W = 1.27, 0.635
ball(0, -0.52, -0.16, 0.4)
ball(3, 0.42, 0.04, 1.2)
for i, (x, y, s) in {1: (0.86, -0.3, 0.3), 9: (0.62, 0.34, 2.0), 11: (1.02, 0.12, 1.6), 6: (0.2, -0.42, 0.9),
                     8: (0.95, -0.02, 1.8), 14: (0.05, 0.36, 2.6), 5: (-0.18, 0.02, 0.2), 10: (1.12, 0.44, 1.1),
                     2: (0.74, -0.12, 2.2), 13: (-0.62, 0.42, 0.7)}.items():
    ball(i, x, y, s)

# Cue resting in the shooter's hand position, aimed through the cue ball at the 3.
aim = Vector((0.42 + 0.52, 0.04 + 0.16, 0)).normalized()
shaft = mat("Maple shaft", lin("#d8bd8c"), 0.35)
butt = mat("Ebony butt", lin("#1b1411"), 0.3)
ferrule = mat("Ferrule", lin("#f4eedd"), 0.3)
for length, r0, r1, m, start in [(0.012, 0.0062, 0.0062, ferrule, 0.02), (0.72, 0.0064, 0.0078, shaft, 0.032),
                                 (0.66, 0.0082, 0.0145, butt, 0.752)]:
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=r1, radius2=r0, depth=length)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    centre = Vector((-0.52, -0.16, R + 0.004)) - aim * (R + start + length / 2)
    centre.z += (start + length / 2) * math.sin(0.06)
    o.location = centre
    o.rotation_euler = (-aim).to_track_quat("Z", "Y").to_euler()
    o.rotation_euler.rotate_axis("X", 0.06)

# Room: navy foundation, walnut panels, brass seams, a floor that catches the lamp.
floor = mat("Floor", lin("#0b1a28"), 0.55)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.72))
bpy.context.object.data.materials.append(floor)
wall = mat("Navy wall", lin("#173a58"), 0.8)
panel = mat("Walnut panel", lin("#2a1810"), 0.45)
brass = mat("Brass", (0.52, 0.35, 0.16), 0.3, 0.8)
glow = mat("Lamp glow", (1.0, 0.86, 0.66), 0.3, 0, 6)
shade = mat("Lamp shade", lin("#0e3b2c"), 0.35, 0.2)


def box(loc, scale, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    o.data.materials.append(m)
    return o


box((0, 3.4, 1.2), (14, 0.1, 5), wall)
for x in range(-6, 7):
    box((x * 0.9, 3.32, 0.2), (0.82, 0.04, 1.6), panel)
    box((x * 0.9 + 0.45, 3.3, 1.2), (0.012, 0.03, 4), brass)
box((6.5, 0, 1.2), (0.1, 8, 5), wall)
sconce = mat("Sconce", (1.0, 0.62, 0.3), 0.3, 0, 8)
for x in (-2.7, -0.9, 0.9, 2.7):
    box((x, 3.27, 1.35), (0.035, 0.03, 0.6), sconce)
    bpy.ops.object.light_add(type="AREA", location=(x, 3.1, 1.35))
    wash = bpy.context.object
    wash.data.energy = 60
    wash.data.size = 0.5
    wash.data.color = (1.0, 0.66, 0.34)
    wash.rotation_euler = (math.pi / 2, 0, 0)  # area lights emit along -Z; face the wall
# Three-shade lamp over the bed with real area lights inside each shade.
box((0, 0, 1.2), (2.1, 0.05, 0.03), brass)
for x in (-0.82, 0, 0.82):
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.22, radius2=0.06, depth=0.18, end_fill_type="NOTHING",
                                    location=(x, 0, 1.08))
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    o.data.materials.append(shade)
    o.modifiers.new("Thickness", "SOLIDIFY").thickness = 0.006
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=0.2, fill_type="NGON", location=(x, 0, 1.0))
    bpy.context.object.data.materials.append(glow)
    bpy.ops.object.light_add(type="AREA", location=(x, 0, 0.98))
    l = bpy.context.object
    l.data.energy = 22
    l.data.shape = "DISK"
    l.data.size = 0.36
    l.data.color = (1.0, 0.9, 0.76)
    l.data.spread = math.radians(110)
# Cool rim from behind the camera so rails and ball edges separate from the room.
bpy.ops.object.light_add(type="AREA", location=(-3.2, -2.4, 1.6))
rim = bpy.context.object
rim.data.energy = 30
rim.data.size = 2.5
rim.data.color = (0.62, 0.78, 1.0)
rim.rotation_euler = (Vector((0, 0, 0)) - rim.location).to_track_quat("-Z", "Y").to_euler()

# Camera at the shooter's eye, behind the cue ball, table filling the right of frame.
bpy.ops.object.camera_add(location=(-2.15, -1.62, 0.86))
cam = bpy.context.object
cam.rotation_euler = (Vector((0.3, 0.28, 0.24)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 30
cam.data.shift_x = -0.16
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = (Vector((-0.52, -0.16, R)) - cam.location).length * 1.12
cam.data.dof.aperture_fstop = 2.2
scene.camera = cam

scene.world.color = (0.004, 0.01, 0.018)
scene.render.engine = "CYCLES"
scene.cycles.samples = int(os.environ.get("HERO_SAMPLES", "128"))
scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
except Exception:
    pass
scene.view_settings.look = "AgX - Punchy"
scene.view_settings.exposure = 0.0
scene.render.resolution_x, scene.render.resolution_y = 1920, 1000
scene.render.resolution_percentage = int(os.environ.get("HERO_PERCENT", "100"))
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 90
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
