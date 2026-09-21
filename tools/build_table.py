"""Original CueMaster table. Run with Blender --background --python tools/build_table.py.
All playing dimensions shared with the simulation; exports editable .blend, GLB,
and compact evaluated mesh data usable without platform-dependent GLTF loaders.
"""
import bpy, bmesh, math, json, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'mobile/assets/models'); os.makedirs(OUT,exist_ok=True)
p=json.load(open(os.path.join(ROOT,'mobile/src/physics/table.json')))
H=p['length']/2; W=p['width']/2; c=p['cornerCut']; sh=p['sideHalf']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats={}
for name,color,metal,rough in [('cloth',(0.025,.23,.16,1),0,.9),('cushion',(.025,.17,.12,1),0,.78),('wood',(.09,.052,.035,1),0,.28),('body',(.025,.031,.029,1),.2,.35),('brass',(.52,.35,.16,1),.78,.28),('leather',(.018,.023,.021,1),0,.75),('ivory',(.82,.78,.61,1),.1,.34)]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=color;bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough;mats[name]=m

def bevel(o,w=.008,segments=3):
 m=o.modifiers.new('Soft machined edges','BEVEL');m.width=w;m.segments=segments
 m=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o

def cube(name,loc,size,mat,w=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[mat]);
 if w:bevel(o,w)
 return o
pockets=[(-H,-W,.071),(0,-W-.036,.066),(H,-W,.071),(-H,W,.071),(0,W+.036,.066),(H,W,.071)]
def holes(o, shelf=False):
 for x,y,r in pockets:
  bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=r,depth=.8,location=(x,y,0));cut=bpy.context.object
  if shelf:
   # The visible drop edge matches engine.capture; the mouth has a supporting cloth shelf.
   if x == 0:
    sy=1 if y>0 else -1
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,sy*(W+.032+2),0))
    mask=bpy.context.object;mask.dimensions=(8,4,1)
   else:
    sx=1 if x>0 else -1;sy=1 if y>0 else -1
    d=(H+W-.04)/math.sqrt(2)+2
    bpy.ops.mesh.primitive_cube_add(size=1,location=(sx*d/math.sqrt(2),sy*d/math.sqrt(2),0))
    mask=bpy.context.object;mask.dimensions=(4,4,1);mask.rotation_euler.z=math.atan2(sy,sx)
   mask.data.materials.append(mats['cloth']);cut.data.materials.append(mats['cloth'])
   bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
   bpy.context.view_layer.objects.active=cut
   clip=cut.modifiers.new('Physical fall boundary','BOOLEAN');clip.operation='INTERSECT';clip.object=mask
   bpy.ops.object.modifier_apply(modifier=clip.name);bpy.data.objects.remove(mask,do_unlink=True)
  bpy.context.view_layer.objects.active=o
  m=o.modifiers.new('True pocket opening','BOOLEAN');m.operation='DIFFERENCE';m.object=cut
  bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cut,do_unlink=True)
 return o
holes(cube('Slate and cloth', (0,0,-.024),(2*H+.07,2*W+.07,.048),'cloth',0),shelf=True)
# Rails are cut through, not painted circles over a solid surface.
for y in [-1,1]:holes(cube('Long walnut rail',(0,y*(W+.075),.011),(2*H+.27,.15,.105),'wood'))
for x in [-1,1]:holes(cube('End walnut rail',(x*(H+.075),0,.011),(.15,2*W+.27,.105),'wood'))
for y in [-1,1]:
 cube('Apron',(0,y*(W+.09),-.145),(2*H+.27,.13,.22),'body',.02)
 cube('Fine brass edge',(0,y*(W+.151),-.039),(2*H+.23,.004,.005),'brass',.002)
for x in [-1,1]:
 cube('Apron',(x*(H+.09),0,-.145),(.13,2*W+.27,.22),'body',.02)
 cube('Fine brass edge',(x*(H+.151),0,-.039),(.004,2*W+.23,.005),'brass',.002)
# Trapezoid cushion blocks. Nose points exactly match collision segments.
def prism(name,points):
 verts=[(x,y,z) for z in [.005,.037] for x,y in points];n=len(points)
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mats['cushion']);bevel(o,.003,2)
for s in [-1,1]:
 for side in [-1,1]:prism('Long cushion',[(side*sh,s*W),(side*(H-c),s*W),(side*(H-.027),s*(W+.05)),(side*(sh-.017),s*(W+.065))])
 prism('End cushion',[(s*H,-W+c),(s*H,W-c),(s*(H+.05),W-.027),(s*(H+.05),-W+.027)])
# Leather pocket liners and deep black wells.
for x,y,r in pockets:
 bpy.ops.mesh.primitive_torus_add(major_radius=r+.005,minor_radius=.006,major_segments=48,minor_segments=8,location=(x,y,.009));o=bpy.context.object;o.name='Leather pocket lip';o.data.materials.append(mats['leather'])
 # Keep leather behind the shelf, not over the playable mouth.
 bm=bmesh.new();bm.from_mesh(o.data)
 remove=[]
 for v in bm.verts:
  q=o.matrix_world@v.co
  if (abs(q.y)<W+.045 if x==0 else abs(q.x)+abs(q.y)<H+W+.012):remove.append(v)
 bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(o.data);bm.free()
 bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=r*.97,depth=.012,location=(x,y,-.15));o=bpy.context.object;o.name='Pocket darkness';o.data.materials.append(mats['leather'])
 # hollow liner
 verts=[];faces=[]
 for z in [-.15,.007]:
  for k in range(40):a=k*2*math.pi/40;verts.append((x+(r-.002)*math.cos(a),y+(r-.002)*math.sin(a),z))
 for k in range(40):j=(k+1)%40;faces.append((k,j,j+40,k+40))
 me=bpy.data.meshes.new('liner');me.from_pydata(verts,[],faces);ob=bpy.data.objects.new('Pocket liner',me);bpy.context.collection.objects.link(ob);me.materials.append(mats['leather'])
for s in [-1,1]:
 for x in [-.9525,-.635,-.3175,.3175,.635,.9525]:
  o=cube('Inlaid diamond',(x,s*(W+.09),.066),(.012,.012,.0015),'ivory',.001);o.rotation_euler.z=math.pi/4
 for y in [-.3175,0,.3175]:
  o=cube('Inlaid diamond',(s*(H+.09),y,.066),(.012,.012,.0015),'ivory',.001);o.rotation_euler.z=math.pi/4
for x in [-1,1]:
 for y in [-1,1]:
  cube('Tapered pedestal',(x*.94,y*.43,-.45),(.17,.2,.51),'body',.025)
  cube('Brass foot',(x*.94,y*.43,-.7),(.175,.205,.025),'brass',.012)
# Sculpted apron reveals and polished rail accents, outside the playing surface.
for side in [-1,1]:
 cube('Walnut apron inset',(0,side*(W+.158),-.13),(2.25,.012,.10),'wood',.007)
 for x in [-1.10,1.10]:
  cube('Brass rail binding',(x,side*(W+.082),.066),(.025,.125,.003),'brass',.001)
 for x in [-1,1]:
  cube('End apron inset',(x*(H+.158),0,-.13),(.012,1.05,.10),'wood',.007)
# Normalize winding for reflected cushion prisms before export.
for ob in bpy.context.scene.objects:
 if ob.type != 'MESH': continue
 bm=bmesh.new();bm.from_mesh(ob.data)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bm.to_mesh(ob.data);bm.free()
# Save editable source and standard interchange asset.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'cuemaster-table.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'cuemaster-table.glb'),export_format='GLB',export_apply=True)
# Merge by material: seven table draw calls, no loader or embedded textures needed.
deps=bpy.context.evaluated_depsgraph_get();groups={}
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
 for tri in me.loop_triangles:
  mat=me.materials[tri.material_index].name;g=groups.setdefault(mat,{'positions':[],'normals':[]})
  for vi in tri.vertices:
   v=ev.matrix_world@me.vertices[vi].co;n=ev.matrix_world.to_3x3()@tri.normal
   g['positions'] += [round(v.x,6),round(v.z,6),round(-v.y,6)]
   g['normals'] += [round(n.x,5),round(n.z,5),round(-n.y,5)]
 ev.to_mesh_clear()
mesh_path=os.path.join(OUT,'table-mesh.json')
with open(mesh_path+'.tmp','w') as f:json.dump(groups,f,separators=(',',':'))
os.replace(mesh_path+'.tmp',mesh_path)
print('Exported',sum(len(g['positions'])//9 for g in groups.values()),'triangles;',len(groups),'material groups')
