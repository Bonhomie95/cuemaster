"""Original stylized player portraits, rendered in Blender for the match HUD."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out=os.path.join(root,'mobile/assets/avatars');os.makedirs(out,exist_ok=True)
for who in range(2):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 def mat(name,c,rough=.6):
  m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
  p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough
  return m
 skin=mat('Skin',(.40,.19,.095) if who==0 else (.65,.38,.23))
 hair=mat('Hair',(.035,.023,.017));shirt=mat('Jacket',(.025,.24,.19) if who==0 else (.18,.12,.36))
 white=mat('Eye white',(.88,.9,.87));black=mat('Pupils',(.012,.018,.023));gold=mat('Trim',(.77,.51,.18))
 def ell(name,loc,scale,m):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(m)
  for p in o.data.polygons:p.use_smooth=True
  return o
 ell('Shoulders',(0,0,-.57),(.75,.32,.43),shirt)
 ell('Neck',(0,0,-.25),(.16,.15,.26),skin)
 ell('Face',(0,0,.19),(.36,.29,.47),skin)
 ell('Hair',(0,.035,.50),(.38,.29,.24),hair)
 for side in [-1,1]:
  ell('Ear',(side*.35,0,.19),(.067,.085,.12),skin)
  ell('Eye',(side*.135,-.255,.26),(.07,.035,.045),white)
  ell('Pupil',(side*.13,-.284,.26),(.026,.015,.029),black)
  brow=ell('Brow',(side*.135,-.262,.34),(.08,.025,.016),hair);brow.rotation_euler.y=side*.10
 ell('Nose',(0,-.29,.14),(.054,.065,.088),skin)
 ell('Smile',(0,-.263,-.015),(.095,.013,.019),hair)
 if who==0:
  ell('Beard',(0,-.04,-.11),(.29,.25,.17),hair)
  ell('Mouth',(0,-.286,-.03),(.082,.018,.012),skin)
 else:
  for x,z in [(-.25,.57),(-.10,.67),(.08,.66),(.24,.60)]:ell('Swept hair',(x,-.07,z),(.17,.24,.15),hair)
 ell('Shirt pin',(.30,-.28,-.43),(.033,.012,.055),gold)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
 scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100
 scene.render.film_transparent=True
 scene.world.color=(.15,.15,.15)
 for loc,power,size in [((-3,-4,5),450,4),((3,-1,2),180,3),((0,3,3),500,2)]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,.1))-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(.10,-4,.65));c=bpy.context.object;c.rotation_euler=(Vector((0,0,.02))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=1.48;scene.camera=c
 scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(out,('player','opponent')[who]+'.png')
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,('player','opponent')[who]+'.blend'))
 bpy.ops.render.render(write_still=True)
