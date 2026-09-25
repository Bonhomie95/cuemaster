"""Render the three shop cues as original transparent PNGs.

blender -b --python tools/build_cues.py
Writes mobile/assets/cues/<id>.png (1400x360, transparent). Shapes and colours follow
mobile/src/game/cues.ts, so the shop art is the cue the player then holds.
"""
import bpy, os, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mobile/assets/cues")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexc, rough=0.3, metal=0.0, coat=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*lin(hexc), 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = 0.06
    return m


def part(x, length, r_butt, r_tip, m):
    """A tapered section centred at x along the cue's axis; +X points at the tip."""
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=r_butt, radius2=r_tip, depth=length,
                                    rotation=(0, math.pi / 2, 0), location=(x, 0, 0))
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    return o


# id, shaft, butt, ring metal, forearm collar
CUES = [
    ("club", "#d9bd8b", "#604737", "#b9a67c", "#4a3527"),
    ("precision", "#e7dcc4", "#748d92", "#cfd8dc", "#2b3d43"),
    ("master", "#e3d3ae", "#171412", "#b79658", "#241d16"),
]
HALF = 0.735

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 96
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
scene.render.film_transparent = True
scene.view_settings.look = "AgX - Punchy"
scene.view_settings.exposure = -0.7
scene.render.resolution_x, scene.render.resolution_y = 1400, 360
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

bpy.ops.object.camera_add(location=(0, -1.6, 0.30))
cam = bpy.context.object
cam.rotation_euler = (math.radians(79), 0, 0)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 1.56
scene.camera = cam

for loc, energy, size, colour in [((-0.6, -1.2, 1.4), 260, 2.0, (1.0, 0.95, 0.88)),
                                  ((1.1, -1.4, 0.4), 120, 1.6, (0.72, 0.84, 1.0)),
                                  ((0.0, 1.4, 0.9), 150, 2.2, (1.0, 0.86, 0.7))]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.data.energy = energy
    light.data.size = size
    light.data.color = colour
    light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()

for cue_id, shaft_hex, butt_hex, ring_hex, collar_hex in CUES:
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    shaft = mat("shaft", shaft_hex, 0.22)
    butt = mat("butt", butt_hex, 0.2)
    ring = mat("ring", ring_hex, 0.18, 0.85, 0.2)
    collar = mat("collar", collar_hex, 0.25)
    tip = mat("tip", "#3f6f7a", 0.7, 0, 0.1)
    ferrule = mat("ferrule", "#f6f1e2", 0.25)

    part(HALF - 0.004, 0.008, 0.0062, 0.0062, tip)
    part(HALF - 0.019, 0.022, 0.0065, 0.0063, ferrule)
    part(HALF - 0.42, 0.78, 0.0093, 0.0065, shaft)      # shaft
    part(HALF - 0.815, 0.012, 0.0098, 0.0094, ring)     # joint collar
    part(HALF - 0.9, 0.16, 0.0112, 0.0098, collar)      # forearm
    part(HALF - 1.18, 0.4, 0.0145, 0.0112, butt)        # butt
    part(HALF - 1.4, 0.03, 0.0148, 0.0145, ring)        # butt cap ring
    part(HALF - 1.432, 0.036, 0.0132, 0.0148, butt)     # bumper
    for at, w in [(0.985, 0.006), (1.005, 0.006), (1.30, 0.005), (1.325, 0.005)]:
        part(HALF - at, w, 0.0132, 0.0125, ring)        # decorative rings

    scene.render.filepath = os.path.join(OUT, f"{cue_id}.png")
    bpy.ops.render.render(write_still=True)
