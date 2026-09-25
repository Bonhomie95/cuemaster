"""Render original CueMaster welcome and venue artwork from our playable table."""
import bpy, os, math, json
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'mobile/assets/lounge');os.makedirs(OUT,exist_ok=True)
R=json.load(open(os.path.join(ROOT,'mobile/src/physics/table.json')))['radius']  # art follows the play ball size
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'mobile/assets/models/cuemaster-table.blend'))
def material(name,color,rough=.3,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
# Quiet slate studio; the table, balls and softbox reflections carry the image.
floor=material('Studio floor',(.013,.021,.032),.65)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.72));bpy.context.object.data.materials.append(floor)
colors=[(.97,.96,.91),(.9,.53,.012),(.02,.09,.55),(.65,.016,.019),(.18,.04,.36),(.95,.20,.016),(.014,.32,.12),(.27,.015,.034),(.006,.008,.012)]
for n,(x,y) in enumerate([(-.72,-.12),(.38,.2),(.64,-.23),(.83,.32),(-.16,.31),(.13,-.38),(.62,.02),(-.40,-.35),(.12,.03)]):
 m=material('Ball '+str(n),colors[n],.18)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=R,location=(x,y,R));o=bpy.context.object;o.data.materials.append(m)
 for p in o.data.polygons:p.use_smooth=True
 if n:
  ivory=material('Number medallion '+str(n),(.96,.95,.89),.2)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1,location=(x,y,R*1.89));o=bpy.context.object;o.scale=(R*.455,R*.455,R*.12);o.data.materials.append(ivory)
  bpy.ops.object.text_add(location=(x,y,R*2.03));o=bpy.context.object;o.data.body=str(n);o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=R*.63;o.data.extrude=.0001;o.data.materials.append(material('Ink '+str(n),(.008,.01,.013),.5))
# Fine cloth weave, restrained walnut variation.
for key in ['cloth','wood']:
 m=bpy.data.materials.get(key);nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
 tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=700 if key=='cloth' else 7
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.00035 if key=='cloth' else .0001;links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
 for d in prefs.devices:d.use=True
 scene.cycles.device='GPU'
except Exception:pass
scene.world.color=(.08,.09,.13)
scene.view_settings.exposure=-1.4
scene.view_settings.look='AgX - Medium High Contrast'
for loc,energy,size,color in [((0,-.1,3.2),380,3,(.82,.91,1)),((-2,1,1.5),330,2,(.65,.79,1)),((2,0,1.7),450,2,(1,.75,.42))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.shape='RECTANGLE';o.data.size=size;o.data.size_y=.55;o.data.color=color;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.7,-3.1,2.65));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,-.12))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=46;scene.camera=cam
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.filepath=os.path.join(OUT,'welcome.jpg');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=720;scene.render.resolution_y=440
# Runtime skin colours (session.ts), deepened a little because the AgX view lifts bright cloth.
def lin(h,k=1):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)];return tuple(k*(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4) for x in c)
scene.view_settings.look='AgX - Punchy'
for name,cloth,cushion,wood in [('heritage','#07845b','#10523e','#38241b'),('riviera','#087fab','#18516c','#202730'),('regent','#a53154','#572231','#292023'),('midnight','#4242a4','#191d43','#111525'),('jade','#079c75','#074937','#153e32'),('champion','#8b6430','#60441f','#16191b')]:
 for key,color in [('cloth',lin(cloth,.62)),('cushion',lin(cushion,.62)),('wood',lin(wood))]:bpy.data.materials.get(key).node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
 scene.render.filepath=os.path.join(OUT,name+'.jpg');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'lounge.blend'))
