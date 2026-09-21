"""Original room backdrop, composed for the landscape lobby's central controls."""
import bpy, os, math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'mobile/assets/lounge/lounge.blend'))
scene=bpy.context.scene
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
 if x%2==0:
  box('Sconce',(x,2.75,1.1),(.03,.06,.58),glow)
  bpy.ops.object.light_add(type='AREA',location=(x,2.6,1.1));o=bpy.context.object;o.data.energy=45;o.data.color=(1,.6,.22);o.data.size=.7;o.rotation_euler=(math.pi/2,0,0)
# A suspended pool-room lamp, low foreground balls and a resting cue.
box('Lamp housing',(0,.6,1.85),(2.8,.32,.07),gold)
box('Lamp diffuser',(0,.6,1.80),(2.65,.26,.02),glow)
for x in [-1,1]:box('Lamp suspension',(x,.6,2.2),(.008,.008,.65),gold)
for obj in list(bpy.data.objects):
 if obj.name.startswith('Ball ') or obj.name.startswith('Number medallion') or obj.type=='FONT':pass
# Move the complete balls (meshes/text) together towards the near edge.
# Existing original spheres/number patches are retained; don't alter game geometry.
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.008,depth=2.2,location=(.35,-.47,.045),rotation=(0,math.pi/2,.13));bpy.context.object.data.materials.append(mat('Cue maple',(.42,.23,.085),0,.3))
cam=scene.camera;cam.location=(.15,-2.65,.91);cam.rotation_euler=(Vector((0,.65,.34))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=30
scene.view_settings.exposure=-1.1;scene.cycles.samples=64
scene.render.resolution_x=1920;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=os.path.join(ROOT,'mobile/assets/lounge/club-room.jpg');scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=93
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'mobile/assets/lounge/club-room.blend'))
