"""Render original CueMaster welcome and venue artwork from our playable table."""
import bpy, os, math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'mobile/assets/lounge');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'mobile/assets/models/cuemaster-table.blend'))
def material(name,color,rough=.3,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
# Quiet slate studio; the table, balls and softbox reflections carry the image.
floor=material('Studio floor',(.013,.021,.032),.65)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.72));bpy.context.object.data.materials.append(floor)
colors=[(.97,.96,.91),(.9,.53,.012),(.02,.09,.55),(.65,.016,.019),(.18,.04,.36),(.95,.20,.016),(.014,.32,.12),(.27,.015,.034),(.006,.008,.012)]
for n,(x,y) in enumerate([(-.72,-.12),(.38,.2),(.64,-.23),(.83,.32),(-.16,.31),(.13,-.38),(.62,.02),(-.40,-.35),(.12,.03)]):
 m=material('Ball '+str(n),colors[n],.18)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=.028575,location=(x,y,.028575));o=bpy.context.object;o.data.materials.append(m)
 for p in o.data.polygons:p.use_smooth=True
 if n:
  ivory=material('Number medallion '+str(n),(.96,.95,.89),.2)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1,location=(x,y,.054));o=bpy.context.object;o.scale=(.013,.013,.0035);o.data.materials.append(ivory)
  bpy.ops.object.text_add(location=(x,y,.058));o=bpy.context.object;o.data.body=str(n);o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=.018;o.data.extrude=.0001;o.data.materials.append(material('Ink '+str(n),(.008,.01,.013),.5))
# Fine cloth weave, restrained walnut variation.
for key in ['cloth','wood']:
 m=bpy.data.materials.get(key);nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
 tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=700 if key=='cloth' else 7
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.00035 if key=='cloth' else .0001;links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.world.color=(.08,.09,.13)
scene.view_settings.exposure=-1.4
scene.view_settings.look='AgX - Medium High Contrast'
for loc,energy,size,color in [((0,-.1,3.2),700,3,(.82,.91,1)),((-2,1,1.5),330,2,(.65,.79,1)),((2,0,1.7),450,2,(1,.75,.42))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.shape='RECTANGLE';o.data.size=size;o.data.size_y=.55;o.data.color=color;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.7,-3.1,2.65));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,-.12))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=46;scene.camera=cam
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.filepath=os.path.join(OUT,'welcome.jpg');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=720;scene.render.resolution_y=440
for name,cloth,wood in [('heritage',(.025,.23,.16),(.09,.052,.035)),('riviera',(.025,.22,.38),(.02,.025,.035)),('regent',(.28,.035,.072),(.045,.025,.03)),('midnight',(.055,.065,.18),(.018,.02,.04)),('jade',(.018,.28,.20),(.03,.06,.055)),('champion',(.23,.13,.035),(.02,.02,.025))]:
 for key,color in [('cloth',cloth),('cushion',tuple(c*.68 for c in cloth)),('wood',wood)]:bpy.data.materials.get(key).node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
 scene.render.filepath=os.path.join(OUT,name+'.jpg');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'lounge.blend'))
