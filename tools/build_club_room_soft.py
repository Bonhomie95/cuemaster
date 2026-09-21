"""Original room backdrop, composed for the landscape lobby's central controls."""
import bpy, os, math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'mobile/assets/lounge/lounge.blend'))
scene=bpy.context.scene
for o in list(bpy.data.objects):
 if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
# Retain the original table but stage a new room around it.
for key,color in [('cloth',(.016,.12,.075)),('cushion',(.01,.065,.04)),('wood',(.042,.023,.014))]:
 bpy.data.materials[key].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
def mat(name,color,metal=0,rough=.5,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emit:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
def box(name,loc,scale,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(m);b=bpy.context.object.modifiers.new('Soft edges','BEVEL');b.width=.015;b.segments=3;return o
wall=mat('Midnight teal walls',(.011,.033,.032));wood=mat('Walnut room panels',(.034,.019,.013));gold=mat('Brass trim',(.36,.20,.055),.75,.25);glow=mat('Amber sconces',(.95,.53,.16),0,.3,4)
box('Back wall',(0,3,1.15),(12,.15,5),wall)
for x in [-4,-3,-2,-1,0,1,2,3,4]:
 box('Wall panel',(x,2.88,.65),(.85,.05,2.8),wood)
 box('Brass seam',(x+.48,2.83,.65),(.014,.03,2.8),gold)
 if x in [-2,2]:
  box('Sconce',(x,2.75,1.1),(.03,.06,.58),glow)
  bpy.ops.object.light_add(type='AREA',location=(x,2.6,1.1));o=bpy.context.object;o.data.energy=12;o.data.color=(1,.6,.22);o.data.size=.7;o.rotation_euler=(math.pi/2,0,0)
# A suspended pool-room lamp, low foreground balls and a resting cue.
box('Lamp housing',(0,.6,1.85),(1.8,.24,.055),gold)
box('Lamp diffuser',(0,.6,1.80),(1.65,.20,.015),glow)
for x in [-1,1]:box('Lamp suspension',(x,.6,2.2),(.008,.008,.65),gold)
# Four legs and quiet wall upholstery establish believable scale.
for x in [-.95,.95]:
 for y in [-.4,.4]:box('Tapered table support',(x,y,-.48),(.15,.15,.48),wood)
seat=mat('Leather seating',(.024,.033,.028),0,.6)
box('Bench seat',(-2,1.9,-.30),(1.6,.52,.18),seat)
box('Bench back',(-2,2.12,.13),(1.6,.16,.82),seat)
# Broad, indirect sources keep highlights restrained.
for loc,target,energy,size,color in [((0,.3,1.73),(0,0,0),95,1.7,(1,.86,.67)),((-3,-1,2.4),(0,0,0),200,3,(.74,.84,1)),((2,2,2.5),(0,1,0),80,2,(1,.72,.43))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.data.color=color;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.008,depth=1.45,location=(.35,-.47,.045),rotation=(0,math.pi/2,.13));bpy.context.object.data.materials.append(mat('Cue maple',(.42,.23,.085),0,.3))
cam=scene.camera;cam.location=(2.9,-4.9,1.85);cam.rotation_euler=(Vector((0,.65,.28))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=42
scene.view_settings.exposure=-.4;scene.cycles.samples=96
scene.render.resolution_x=1920;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=os.path.join(ROOT,'mobile/assets/lounge/club-room-soft.jpg');scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=93
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'mobile/assets/lounge/club-room-soft.blend'))
