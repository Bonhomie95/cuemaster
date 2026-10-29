"""Render the shop, crate and reward icons as original transparent PNGs.

blender -b --python tools/build_icons.py            # everything
blender -b --python tools/build_icons.py -- coin    # names containing "coin"
Writes mobile/assets/icons/<name>.png (rendered at 384, saved at 256, transparent). Everything is modelled here from
primitives, so the art is ours and re-renders whenever a colour or count changes.
"""
import bpy, os, math, random, sys
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mobile/assets/icons")
os.makedirs(OUT, exist_ok=True)
ONLY = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else ""
SIZE = 384
SHIP = 256


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        s.cycles.device = "GPU"
    except Exception:
        pass
    s.cycles.samples = 96
    s.cycles.use_denoising = True
    s.render.film_transparent = True
    s.render.resolution_x = s.render.resolution_y = SIZE
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    # Game icons want saturated colour and clean highlights; AgX greys both out.
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.view_settings.exposure = 0.35
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    # A warm, bright surround is what gold and gems reflect; the film stays transparent.
    bg.inputs["Color"].default_value = (*lin("#b9a98c"), 1)
    bg.inputs["Strength"].default_value = 1.1
    s.world = w
    light("key", (3.5, -4.5, 6), 1500, "#fff3dc", 3.5)
    light("rim", (-4, 3.5, 3.5), 900, "#a9dcff", 2.5)
    light("fill", (-3.5, -5, 1.5), 400, "#ffffff", 4)
    light("top", (0, 0, 7), 500, "#ffffff", 6)
    random.seed(7)


def light(name, loc, power, color, size):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = power
    d.color = lin(color)
    d.size = size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    bpy.context.collection.objects.link(o)
    direction = Vector((0, 0, 0.4)) - o.location
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def mat(name, hexc, rough=0.3, metal=0.0, coat=0.0, transmission=0.0, ior=1.45, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*lin(hexc), 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Transmission Weight"].default_value = transmission
    p.inputs["IOR"].default_value = ior
    if emit:
        p.inputs["Emission Color"].default_value = (*lin(hexc), 1)
        p.inputs["Emission Strength"].default_value = emit
    return m


def smooth(o, bevel=0.0, segments=3, flat=False):
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    (bpy.ops.object.shade_flat if flat else bpy.ops.object.shade_smooth)()
    o.select_set(False)
    return o


def cyl(r, depth, loc, rot=(0, 0, 0), verts=64, m=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    if m:
        o.data.materials.append(m)
    return o


def box(size, loc, m=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if m:
        o.data.materials.append(m)
    return o


def parent(objs, loc=(0, 0, 0), rot=(0, 0, 0)):
    e = bpy.data.objects.new("group", None)
    bpy.context.collection.objects.link(e)
    for o in objs:
        o.parent = e
    e.location = loc
    e.rotation_euler = rot
    return e


GOLD = None


def gold():
    global GOLD
    GOLD = GOLD or mat("gold", "#f2bd42", rough=0.2, metal=1.0)
    return GOLD


def star(outer, inner, depth, m, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A five-point star prism, flat on the XY plane."""
    verts = []
    for i in range(10):
        r = outer if i % 2 == 0 else inner
        a = math.pi / 2 + i * math.pi / 5
        verts.append((r * math.cos(a), r * math.sin(a), 0))
    mesh = bpy.data.meshes.new("star")
    mesh.from_pydata(verts, [], [list(range(10))])
    o = bpy.data.objects.new("star", mesh)
    bpy.context.collection.objects.link(o)
    sol = o.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = depth
    sol.offset = 1
    bev = o.modifiers.new("bevel", "BEVEL")
    bev.width = depth * 0.35
    bev.segments = 2
    o.location = loc
    o.rotation_euler = rot
    o.data.materials.append(m)
    return o


def coin(loc=(0, 0, 0), rot=(0, 0, 0)):
    """A chunky game coin: a rolled rim, a recessed face and a raised star."""
    g = gold()
    t = 0.26
    body = smooth(cyl(1, t, (0, 0, 0), m=g), bevel=0.07, segments=4)
    face = smooth(cyl(0.8, t + 0.01, (0, 0, 0), m=mat("gold-face", "#e9a92c", rough=0.3, metal=1.0)), bevel=0.02)
    parts = [body, face]
    for z in (1, -1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.88, minor_radius=0.07, location=(0, 0, z * t / 2))
        rim = bpy.context.object
        rim.data.materials.append(g)
        smooth(rim)
        parts.append(rim)
    parts.append(star(0.5, 0.22, 0.08, g, (0, 0, t / 2)))
    return parent(parts, loc, rot)


def stacks(columns, loose=(), spread=1.15, base=0.0, size=1.0, depth=0.6):
    """Columns of coins (heights in coins), side by side, with a few loose coins in front."""
    items = []
    for i, height in enumerate(columns):
        x = (i - (len(columns) - 1) / 2) * spread * 2.05 * size
        y = (i % 2) * depth * size
        for k in range(height):
            c = coin((x + random.uniform(-0.05, 0.05) * size, y, base + (0.13 + k * 0.27) * size), (0, 0, random.uniform(0, 6)))
            c.scale = (size, size, size)
            items.append(c)
    for x, y, tilt in loose:
        c = coin((x * size, y * size, base + 0.5 * size), (math.radians(tilt), 0, random.uniform(0, 6)))
        c.scale = (size, size, size)
        items.append(c)
    return items


def heap(n, radius, layer_drop=0.11, seed=1, base=0.08):
    random.seed(seed)
    items = []
    placed = 0
    layer = 0
    while placed < n:
        ring_r = max(0.0, radius * (1 - layer * 0.28))
        count = 1 if ring_r < 0.3 else max(1, int(ring_r * 3.2))
        for k in range(count):
            if placed >= n:
                break
            a = random.uniform(0, math.tau)
            r = ring_r * math.sqrt(random.random())
            items.append(coin((r * math.cos(a), r * math.sin(a) * 0.8, base + layer * layer_drop),
                              (random.uniform(-0.35, 0.35), random.uniform(-0.35, 0.35), random.uniform(0, 6))))
            placed += 1
        layer += 1
    return items


def gem(hexc="#b5002b", loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """A brilliant-cut gem: an octagonal crown on a pointed pavilion, facets left flat."""
    # Opaque and glossy with flat facets: reads as a cut stone at icon size, where real
    # refraction only turns to pink mush.
    m = bpy.data.materials.get("gem" + hexc) or mat("gem" + hexc, hexc, rough=0.06, metal=0.1, coat=1.0, emit=0.25)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1, radius2=0.58, depth=0.42, location=(0, 0, 0.21))
    crown = bpy.context.object
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1, radius2=0.0, depth=1.05, location=(0, 0, -0.525), rotation=(math.pi, 0, 0))
    pav = bpy.context.object
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1, depth=0.1, location=(0, 0, -0.0))
    girdle = bpy.context.object
    for o in (crown, pav, girdle):
        o.data.materials.append(m)
        smooth(o, flat=True)
    g = parent([crown, pav, girdle], loc, rot)
    g.scale = (scale, scale, scale)
    return g


def dome(radius, length, m, hinge_y, loc, open_deg):
    """A half-cylinder lid lying along X, hinged on its back edge."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=length)
    o = bpy.context.object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    # Axis to X, dome up, then move the hinge (back edge) to the origin.
    o.data.transform(Matrix.Rotation(math.radians(-90), 4, "Y"))
    o.data.transform(Matrix.Translation((0, -hinge_y, 0)))
    o.data.materials.append(m)
    smooth(o, bevel=0.02)
    o.location = loc
    o.rotation_euler = (math.radians(-open_deg), 0, 0)
    return o


def chest(content, wood="#4a230e", band="#f2bd42", lid_open=True):
    w = mat("wood", wood, rough=0.55, coat=0.3)
    b = mat("band", band, rough=0.22, metal=1.0)
    parts = [smooth(box((2.2, 1.4, 1.0), (0, 0, 0.5), w), bevel=0.05)]
    for x in (-0.85, 0.85):
        parts.append(smooth(box((0.16, 1.46, 1.04), (x, 0, 0.5), b), bevel=0.02))
    parts.append(smooth(box((0.34, 0.08, 0.36), (0, -0.72, 0.78), b), bevel=0.02))
    angle = 105 if lid_open else 0
    parts.append(dome(0.7, 2.2, w, 0.7, (0, 0.7, 1.0), angle))
    for x in (-0.85, 0.85):
        strap = dome(0.73, 0.17, b, 0.73, (x, 0.7, 1.0), angle)
        parts.append(strap)
    parts += content()
    return parent(parts)


def crate(tier_hex):
    """A reward crate: dark planked wood, tier-coloured metal corners and a tier gem badge."""
    wood = mat("crate-wood", "#3d1f0c", rough=0.55, coat=0.25)
    metal = mat("crate-metal", tier_hex, rough=0.25, metal=1.0)
    parts = [smooth(box((1.8, 1.8, 1.5), (0, 0, 0.75), wood), bevel=0.06)]
    for z in (0.12, 1.38):
        parts.append(smooth(box((1.86, 1.86, 0.16), (0, 0, z), metal), bevel=0.03))
    # Two straps across the lid say "sealed"; without them the crate read as an open box.
    parts.append(smooth(box((1.88, 0.26, 0.08), (0, 0, 1.5), metal), bevel=0.02))
    parts.append(smooth(box((0.26, 1.88, 0.08), (0, 0, 1.5), metal), bevel=0.02))
    parts.append(smooth(cyl(0.3, 0.12, (0, 0, 1.54), m=metal), bevel=0.03))
    for x in (-0.88, 0.88):
        for y in (-0.88, 0.88):
            parts.append(smooth(box((0.2, 0.2, 1.56), (x, y, 0.75), metal), bevel=0.03))
    parts.append(smooth(box((0.62, 0.08, 0.62), (0, -0.93, 0.78), metal), bevel=0.04))
    parts.append(gem(tier_hex, (0, -1.0, 0.78), (math.pi / 2, 0, 0), 0.24))
    return parent(parts)


def gift():
    paper = mat("paper", "#18b894", rough=0.35, coat=0.6)
    ribbon = mat("ribbon", "#ffd05b", rough=0.25, metal=0.6)
    parts = [smooth(box((1.7, 1.7, 1.3), (0, 0, 0.65), paper), bevel=0.05)]
    parts.append(smooth(box((1.74, 0.34, 1.34), (0, 0, 0.65), ribbon), bevel=0.02))
    parts.append(smooth(box((0.34, 1.74, 1.34), (0, 0, 0.65), ribbon), bevel=0.02))
    for side in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.09, location=(0.33 * side, 0, 1.48), rotation=(math.pi / 2, 0, math.radians(18 * side)))
        loop = bpy.context.object
        loop.scale = (1, 0.7, 1)
        loop.data.materials.append(ribbon)
        smooth(loop)
        parts.append(loop)
    return parent(parts)


def medal():
    g = gold()
    purple = mat("pass-ribbon", "#8b5cf6", rough=0.4, coat=0.5)
    parts = []
    for side in (-1, 1):
        parts.append(smooth(box((0.42, 0.06, 1.3), (0.28 * side, 0.05, 1.45), purple, rot=(0, math.radians(14 * side), 0)), bevel=0.02))
    parts.append(smooth(cyl(1, 0.2, (0, 0, 0.55), rot=(math.pi / 2, 0, 0), m=g), bevel=0.04))
    parts.append(smooth(cyl(0.78, 0.26, (0, 0, 0.55), rot=(math.pi / 2, 0, 0), m=g), bevel=0.03))
    # A five-point star in relief on the face.
    verts = []
    for i in range(10):
        r = 0.6 if i % 2 == 0 else 0.26
        a = math.pi / 2 + i * math.pi / 5
        verts.append((r * math.cos(a), r * math.sin(a), 0))
    mesh = bpy.data.meshes.new("star")
    mesh.from_pydata(verts, [], [list(range(10))])
    star = bpy.data.objects.new("star", mesh)
    bpy.context.collection.objects.link(star)
    sol = star.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.12
    star.rotation_euler = (math.pi / 2, 0, 0)
    star.location = (0, -0.2, 0.55)
    star.data.materials.append(mat("star", "#fff1b8", rough=0.15, metal=1.0))
    parts.append(star)
    return parent(parts)


def frame(group, pitch=52, yaw=-28, margin=1.18):
    """Orthographic camera at a 3/4 view, fitted to the group's bounds."""
    bpy.context.view_layer.update()
    pts = []
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    centre = sum(pts, Vector()) / len(pts)
    cam_d = bpy.data.cameras.new("cam")
    cam_d.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_d)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    p, y = math.radians(pitch), math.radians(yaw)
    direction = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    cam.location = centre + direction * 20
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    local = [inv @ v for v in pts]
    span = max(max(v.x for v in local) - min(v.x for v in local), max(v.y for v in local) - min(v.y for v in local))
    cx = (max(v.x for v in local) + min(v.x for v in local)) / 2
    cy = (max(v.y for v in local) + min(v.y for v in local)) / 2
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))
    cam_d.ortho_scale = span * margin


def render(name, build, **kw):
    if ONLY and ONLY not in name:
        return
    global GOLD
    GOLD = None
    reset()
    build()
    frame(None, **kw)
    path = os.path.join(OUT, name + ".png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # Rendered large for clean edges, shipped at 256 px: plenty for a 120 pt tile at 2x.
    img = bpy.data.images.load(path)
    img.scale(SHIP, SHIP)
    img.save()
    print("wrote", name)


TIERS = {"practice": "#c8834a", "club": "#24dbb3", "silver": "#c9d6df", "gold": "#ffb82e", "champion": "#b98cff", "master": "#ff5f6d"}

render("coin", lambda: coin(rot=(math.radians(62), 0, 0)), pitch=10, yaw=0)
render("coins-1", lambda: stacks([4]), pitch=24)
render("coins-2", lambda: stacks([3, 6]), pitch=24)
render("coins-3", lambda: stacks([4, 8, 5], loose=((-0.6, -1.6, 70), (1.2, -1.5, 75))), pitch=24)
render("coins-4", lambda: chest(lambda: stacks([4, 6, 4], spread=0.75, base=0.7, size=0.5, depth=0.0)), pitch=30)
render("ruby", lambda: gem("#b5002b", rot=(math.radians(-20), 0, math.radians(22))), pitch=28)
render("rubies-1", lambda: [gem("#b5002b", (x, y, z), (tx, 0, tz), 0.75) for x, y, z, tx, tz in ((-0.8, 0, 0, -0.5, 0.3), (0.85, 0.15, 0.05, -0.2, -0.4), (0.05, 0.9, 0.35, -0.75, 0.1))], pitch=26)
render("rubies-2", lambda: [gem("#b5002b", (math.cos(a) * r, math.sin(a) * r * 0.7, 0.1 * (i % 3)), (random.uniform(-.9, -.2), random.uniform(-.4, .4), random.uniform(0, 3)), 0.6) for i, (a, r) in enumerate([(i * 1.3, 0.3 + (i % 3) * 0.6) for i in range(7)])], pitch=26)
render("rubies-3", lambda: chest(lambda: [gem("#b5002b", (random.uniform(-0.7, 0.7), random.uniform(-0.35, 0.35), 1.05), (random.uniform(-.6, .6), random.uniform(-.6, .6), 0), 0.32) for _ in range(9)]))
render("gift", gift)
render("pass", medal, pitch=18, yaw=-14)
for tier, hexc in TIERS.items():
    render("crate-" + tier, lambda hexc=hexc: crate(hexc), pitch=32)
