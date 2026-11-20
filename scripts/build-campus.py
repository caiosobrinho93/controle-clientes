"""Run with Blender in background mode to export the conceptual Oficina campus."""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parents[1] / "public" / "campus"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(16)


def material(name, color, rough=.55, metal=0, emission=0, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    shader.inputs["Alpha"].default_value = alpha
    return mat


steel = material("Aço azul", (.052,.076,.103), .43, .38)
roof = material("Cobertura", (.07,.112,.16), .53, .37)
frame = material("Alumínio grafite", (.023,.039,.063), .35, .38)
glass = material("Vidro fumê", (.25,.47,.66), .19, .08, alpha=.23)
warm = material("Luz âmbar", (1,.49,.15), emission=2)
pale = material("Luz de trabalho", (.72,.86,1), emission=2)
wood = material("Carvalho", (.53,.29,.115), .63)
cream = material("Superfície clara", (.68,.62,.49))
floor = material("Concreto", (.25,.27,.29), .62)
road = material("Asfalto", (.023,.036,.057), .78)
line = material("Sinalização", (.83,.58,.19), emission=.15)
grass = material("Jardim", (.039,.087,.066), .9)
leaves = [material("Folhagem " + str(i), c, .88) for i,c in enumerate(
    [(.028,.078,.062),(.046,.13,.088),(.083,.174,.106)])]


def textured(mat, color, grain, seams=False):
    size = 128
    image = bpy.data.images.new(mat.name + " albedo", width=size, height=size)
    pixels = []
    for y in range(size):
        for x in range(size):
            tone = .91 + rng.random() * .11 + math.sin((x + math.sin(y/7)) * grain) * .035
            if seams:
                tone *= .69 if x % 8 == 0 else (1.11 if x % 8 == 1 else 1)
            pixels.extend([c * tone for c in color] + [1])
    image.pixels.foreach_set(pixels)
    image.pack()
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    mat.node_tree.links.new(node.outputs["Color"], mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])


textured(wood, (.68,.49,.3), 1.05)
textured(road, (.20,.24,.29), .2)
textured(roof, (.26,.33,.41), .27, seams=True)
textured(steel, (.24,.30,.37), .42, seams=True)
floor_nodes = floor.node_tree.nodes
floor_links = floor.node_tree.links
floor_shader = floor_nodes.get("Principled BSDF")
for channel in ("diff", "nor_gl"):
    source = OUT.parent / "showroom" / "materials" / f"concrete_floor_worn_001_{channel}_1k.jpg"
    node = floor_nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(source))
    node.image.pack()
    if channel == "diff":
        floor_links.new(node.outputs["Color"], floor_shader.inputs["Base Color"])
    else:
        node.image.colorspace_settings.name = "Non-Color"
        normal = floor_nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = .55
        floor_links.new(node.outputs["Color"], normal.inputs["Color"])
        floor_links.new(normal.outputs["Normal"], floor_shader.inputs["Normal"])


def box(name, x, y, z, w, d, h, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,y,z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (w,d,h)
    obj.data.materials.append(mat)
    return obj


def strip(x,y,z,w,d,mat=warm):
    return box("Faixa", x,y,z,w,d,.045,mat)


def hall(name,x,y,w,d,h,side=False):
    box(name+" piso",x,y,.17,w,d,.24,floor)
    box(name+" cobertura",x,y,h,w+.25,d+.25,.33,roof)
    box(name+" empena",x,y+d/2,h/2,w,.18,h,steel)
    box(name+" lateral oeste",x-w/2,y,h/2,.18,d,h,steel)
    if side:
        box(name+" vidro lateral",x+w/2,y,h/2,.035,d,h-.4,glass)
        for i in range(7):
            box("Montante lateral",x+w/2,y-d/2+d*i/6,h/2,.11,.10,h,frame)
    else:
        box(name+" lateral leste",x+w/2,y,h/2,.18,d,h,steel)
    opening=2.6
    for side_sign in (-1,1):
        box(name+" vidro frontal",x+side_sign*(w+opening)/4,y-d/2,h/2,(w-opening)/2,.035,h-.42,glass)
        box("Batente",x+side_sign*opening/2,y-d/2,1.39,.12,.17,2.78,frame)
    box("Verga de entrada",x,y-d/2,2.78,opening,.17,.13,frame)
    for i in range(round(w/1.65)+1):
        n=round(w/1.65)
        offset=-w/2+w*i/n
        if abs(offset)>opening/2+.12:
            box("Montante frontal",x+offset,y-d/2,h/2,.095,.14,h,frame)
    box("Travessa superior",x,y-d/2,h-.28,w,.2,.17,frame)
    for side_sign in (-1,1):
        box("Travessa inferior",x+side_sign*(w+opening)/4,y-d/2,.32,(w-opening)/2,.2,.17,frame)
    strip(x,y-d/2-.12,h-.32,w,.08)
    for offset in (-.24,.24):
        strip(x,y+d*offset,h-.23,w*.83,.12,pale if name=="Produção" else warm)
    strip(x,y,h+.19,w*.49,.24,pale)


box("Base",0,0,-.49,44,34,.8,frame)
box("Pátio",0,0,-.04,43.7,33.7,.2,floor)
box("Entorno",0,0,-1.13,88,76,.45,road)
for x in range(-32,33,5):
    strip(x,-21,-.88,2.1,.095,cream)
for x in range(-20,22,3):
    strip(x,-15,.074,.035,2,frame)
for y in range(-12,14,3):
    strip(20,y,.072,1.5,.04,frame)
for x in (-21.5,21.5):
    box("Muro",x,0,.48,.19,33.7,.86,steel)
    for y in (-13,-7,0,7,13):
        strip(x,y,.94,.28,.42)

hall("Produção",-6,6,23,13,6.1)
hall("Depósito",14,8,13,10,5.6,True)
hall("Showroom",-11,-8,15,8,3.8,True)
hall("Administrativo",5,-8,11,7,4.7,True)
hall("Expedição",16,-4,8,8,3.5,True)

for x in (-13,-6,1):
    box("Base CNC",x,3.7,.53,4,2.55,.6,frame)
    box("Mesa CNC",x,3.7,.9,3.85,2.35,.18,cream)
    for side in (-1,1):
        box("Trilho CNC",x+side*1.85,3.7,1.03,.11,2.48,.12,steel)
        box("Coluna CNC",x+side*1.68,3.7,1.52,.22,.32,1.06,cream)
    box("Ponte CNC",x,3.7,2.0,3.55,.37,.3,cream)
    box("CNC_Head",x,3.55,1.63,.41,.49,.65,steel)
    strip(x,1.9,.074,4.6,.06,line)

for x in (-16,-7,2,8):
    y=-8
    box("Tampo de carvalho",x,y,1.02,2.65,1.4,.14,wood)
    for dx in (-1.04,1.04):
        box("Estrutura de mesa",x+dx,y,.53,.17,1.12,.93,wood)
    for dy in (-1.12,1.12):
        box("Assento",x,y+dy,.57,.62,.62,.2,cream)
        box("Encosto",x,y+dy*1.18,.94,.62,.13,.7,cream)
for x in (10,13,16,19):
    for y in (6,9):
        for tier in range(rng.randint(1,3)):
            box("Caixa de madeira",x,y,.53+tier*.68,1.45,1.24,.66,wood)
for x in (13.5,18.5):
    for j in range(9):
        box("Porta de expedição",x,-7.99,.46+j*.25,1.9,.04,.22,steel)

box("Portaria cobertura",11,-15.6,2.55,6.8,1.8,.31,roof)
for x in (7.8,14.2):
    box("Portaria coluna",x,-15.6,1.23,.42,1.8,2.45,steel)
    box("Portaria luz",x,-16.52,1.22,.07,.075,2.45,warm)
strip(11,-16.51,2.38,6.45,.07)

for x,y in [(-19,-10),(-19,7),(-5,-14),(1,-14),(7,-13),(19,-13),(20,13),(-15,15),(-8,15),(0,15),(7,15)]:
    box("Canteiro",x,y,.09,2.25,2.2,.15,grass)
    box("Tronco",x,y,.8,.16,.16,1.5,wood)
    for i in range(6):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rng.uniform(.48,.93),
            location=(x+rng.uniform(-.67,.67),y+rng.uniform(-.66,.66),1.8+rng.uniform(0,.83)))
        bpy.context.object.name = "Copa"
        bpy.context.object.data.materials.append(leaves[i%3])
    strip(x+.65,y-.72,.21,.23,.23)

# Street level detail keeps the nearby blocks in scale with the factory.
brick = material("Tijolo urbano", (.22,.12,.078), .84)
cladding = material("Alvenaria cinza", (.20,.23,.25), .82)
window = material("Vidro da rua", (.06,.13,.19), .29, .26)
lit_window = material("Janelas acesas", (.83,.55,.27), .48, emission=.65)
red = material("Lanternas vermelhas", (.56,.022,.018), emission=.55)
blue = material("Carro azul petróleo", (.045,.19,.23), .33, .45)
silver = material("Carro prata", (.37,.42,.46), .34, .4)
rubber = material("Pneus", (.023,.027,.029), .91)

for y in (-25.8, -17.6, 18.5):
    box("Calçada",0,y,-.76,85,1.25,.2,floor)
    box("Meio-fio",0,y-.62,-.67,85,.12,.14,cream)
    for x in range(-40,41,3):
        strip(x,y,-.653,.035,1.1,frame)
box("Calçada lateral",25.5,0,-.76,1.4,52,.2,floor)
for y in range(-23,26,5):
    strip(28.4,y,-.88,.10,2.2,cream)
for x in range(11,16):
    strip(x-.25,-22.3,-.88,.47,3.35,cream)
box("Rampa da entrada",11.1,-17.5,-.58,5.1,2.7,.44,floor)

def streetlight(x,y):
    box("Poste",x,y,1.05,.085,.085,3.5,frame)
    box("Braço do poste",x,y-.42,2.78,.085,.83,.06,frame)
    box("Luminária",x,y-.84,2.71,.24,.46,.07,warm)

for x in (-33,-22,-4,17,32):
    streetlight(x,-25.8)
for x in (-20,-6,8,23):
    streetlight(x,18.7)

for x, levels, facade in [(-31,2,brick),(-22,3,cladding),(-12,2,brick),(-2,3,cladding),(9,2,cladding),(19,3,brick),(31,2,cladding)]:
    y=25+ .7 * (x%3)
    w=7.5 if levels==2 else 8.4
    h=levels*2.25
    front=y-3.15
    box("Edifício do bairro",x,y,h/2-.87,w,6.3,h,facade)
    box("Platibanda",x,y,h-.83,w+.22,6.48,.24,roof)
    box("Instalação na cobertura",x+1.3,y+1,h-.45,1.5,1.65,.62,steel)
    for level in range(levels):
        z=.41+level*2.25
        box("Friso horizontal",x,front-.035,z+.98,w,.10,.11,frame)
        for bay in (-2.6,-.87,.87,2.6):
            box("Caixilho",x+bay,front-.09,z,1.17,.1,1.24,frame)
            box("Janela",x+bay,front-.151,z,1.04,.018,1.08,
                lit_window if rng.random() < .49 else window)
            box("Montante urbano",x+bay,front-.176,z,.045,.028,1.11,frame)
    box("Marquise da rua",x,front-.39,.95,3.6,.9,.16,steel)
    strip(x,front-.74,.865,2.8,.063,warm)

def parked_car(x,y,paint):
    box("Carroceria",x,y,-.38,3.75,1.58,.53,paint)
    box("Cabine envidraçada",x-.14,y,.025,1.95,1.41,.38,window)
    box("Teto do carro",x-.15,y,.23,1.7,1.34,.07,paint)
    for dx in (-1.09,1.09):
        for dy in (-.79,.79):
            bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.30,depth=.18,
                location=(x+dx,y+dy,-.56),rotation=(math.pi/2,0,0))
            bpy.context.object.name = "Roda"
            bpy.context.object.data.materials.append(rubber)
    for dy in (-.52,.52):
        box("Farol",x+1.88,y+dy,-.29,.045,.35,.12,pale)
        box("Lanterna",x-1.88,y+dy,-.28,.045,.31,.13,red)

for x,y,paint in [(-21,-24,blue),(-11,-24,silver),(24,-24,cream),(-12,20.5,cream),(15,20.5,blue)]:
    parked_car(x,y,paint)
for x in (-18.5,-16.3,-14.1,-11.9,-9.7):
    strip(x,-14.75,.071,.044,3.05,cream)
strip(-14.1,-13.22,.071,8.8,.055,cream)
for x in (13.5,18.5):
    strip(x-1.12,-10.0,.074,.055,3.65,line)
    strip(x+1.12,-10.0,.074,.055,3.65,line)
    strip(x,-11.81,.074,2.28,.055,line)
for x,y in [(-28,-17.5),(-24,-25.9),(-12,-25.9),(3,-25.9),(22,-25.9),(34,-25.9),
            (-26,18.6),(-16,18.6),(-2,18.6),(12,18.6),(33,18.6),(25.4,-11),(25.4,3),(25.4,15)]:
    box("Jardineira da calçada",x,y,-.58,1.25,1.05,.19,grass)
    box("Tronco urbano",x,y,.18,.12,.12,1.54,wood)
    for i in range(5):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=rng.uniform(.40,.73),
            location=(x+rng.uniform(-.54,.54),y+rng.uniform(-.43,.43),1.35+rng.uniform(0,.57)))
        bpy.context.object.name = "Folhagem da rua"
        bpy.context.object.data.materials.append(leaves[i%3])

# Bake transforms and batch the static architecture by material.
meshes = [o for o in bpy.context.scene.objects if o.type=="MESH"]
for mat in bpy.data.materials:
    batch = [o for o in meshes if o.data.materials[0] == mat and not o.name.startswith("CNC_Head")]
    if not batch:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in batch:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=batch[0]
    bpy.ops.object.join()
    batch[0].name = mat.name
    meshes = [o for o in bpy.context.scene.objects if o.type=="MESH"]

bpy.ops.export_scene.gltf(filepath=str(OUT/"oficina.glb"), export_format="GLB", export_yup=True)


def light(name,xyz,color,energy,size,target):
    data=bpy.data.lights.new(name,"AREA")
    data.color=color
    data.energy=energy
    data.shape="DISK"
    data.size=size
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=xyz
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


light("Lua",(12,-19,29),(.47,.66,1),4600,22,(0,0,0))
light("Recorte",(-19,16,17),(.32,.52,1),3600,14,(0,0,0))
for x,y,z,power in [(-11,-8,3.4,620),(5,-8,4.3,700),(14,7,5.1,1050),(16,-4,3.12,480),(-12,3,5.7,900),(-2,3,5.7,900)]:
    light("Interior",(x,y,z),(1,.64,.29),power,3,(x,y-2,0))

scene=bpy.context.scene
scene.world=bpy.data.worlds.new("Noite")
scene.world.color=(.04,.07,.14)
bpy.ops.object.camera_add(location=(43,-56,41))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.5))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=56
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=1120
scene.render.resolution_y=720
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="WEBP"
scene.render.image_settings.quality=85
scene.render.filepath=str(OUT/"oficina.webp")
bpy.ops.render.render(write_still=True)
