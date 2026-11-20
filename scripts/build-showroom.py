"""Export original demonstration pieces and matching previews."""
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parents[1] / "public" / "showroom"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


oak = material("Carvalho", (.47, .26, .12), .54)
walnut = material("Nogueira", (.24, .115, .057), .52)
ivory = material("Laca marfim", (.78, .73, .61), .44)
sage = material("Laca sálvia", (.245, .34, .295), .57)
black = material("Aço grafite", (.052, .056, .058), .32, .65)
bronze = material("Latão escovado", (.6, .31, .105), .34, .67)


def box(name, x, y, z, dimensions, mat, bevel=.024):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    edge = obj.modifiers.new("Bordas arredondadas", "BEVEL")
    edge.width, edge.segments = bevel, 3
    obj.modifiers.new("Normais", "WEIGHTED_NORMAL")
    return obj


def pull_bar():
    box("Frente em laca", 0, 0, .65, (2.6,.18,1.25), sage)
    for x in (-.55,.55):
        box("Base do puxador", x,-.18,.67,(.13,.20,.14),black)
    box("Barra",0,-.285,.67,(1.49,.135,.12),black,.025)


def pull_profile():
    box("Frente amadeirada",0,0,.65,(2.6,.19,1.25),oak)
    box("Perfil de encaixe",0,-.08,1.209,(2.6,.18,.08),bronze,.014)
    box("Aba de pega",0,-.183,1.244,(2.6,.057,.14),bronze,.012)


def cabinet(inset=False):
    finish = oak if inset else sage
    for x in (-1.06,1.06):
        box("Lateral",x,0,.73,(.12,.78,1.24),finish)
    for z in (.16,1.3):
        box("Estrutura horizontal",0,0,z,(2.12,.78,.12),finish)
    box("Fundo",0,.33,.73,(2.06,.10,1.14),walnut)
    for x in (-.517,.517):
        box("Porta",x,-(.337 if inset else .425),.73,
            ((1.002 if inset else 1.096),.10,(1.0 if inset else 1.19)),ivory)
        box("Pega",x + (.33 if x < 0 else -.33),-.5,.83,(.04,.07,.24),bronze,.013)


def sideboard():
    box("Corpo",0,0,.78,(2.7,.84,.92),walnut)
    box("Tampo",0,0,1.25,(2.76,.88,.11),oak)
    for x in (-.89,0,.89):
        box("Frente frisada",x,-.453,.81,(.87,.07,.82),oak)
        for i in range(8):
            box("Friso",x-.36+.103*i,-.497,.81,(.018,.016,.79),walnut,.003)
        box("Puxador",x,-.53,1.08,(.29,.07,.04),bronze)
    for x in (-1.06,1.06):
        for y in (-.28,.28):
            box("Pé",x,y,.17,(.14,.14,.34),black)


def desk():
    box("Tampo",0,0,1.22,(2.75,1.25,.14),oak)
    for x in (-1.12,1.12):
        for y in (-.49,.49):
            box("Pé metálico",x,y,.58,(.12,.12,1.16),black)
        box("Travessa",x,0,.26,(.12,.96,.085),black)
    box("Gaveta",.65,-.27,1.03,(.99,.65,.26),sage)
    box("Puxador",.65,-.628,1.04,(.30,.08,.055),bronze)


def aim(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


scene = bpy.context.scene
scene.world = bpy.data.worlds.new("Estúdio")
scene.world.color = (.18,.18,.18)
bpy.ops.object.camera_add(location=(3.4,-6,3))
scene.camera = bpy.context.object
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = 3.65
aim(scene.camera,(0,0,.72))
for xyz, energy, color, size in [((-3,-4,6),680,(1,.82,.64),4),((4,-1,4),500,(.62,.76,1),3),((0,4,6),680,(1,.92,.75),3)]:
    bpy.ops.object.light_add(type="AREA",location=xyz)
    lamp=bpy.context.object
    lamp.data.energy,lamp.data.color,lamp.data.size=energy,color,size
    aim(lamp,(0,0,.7))
scene.render.engine = "CYCLES"
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 640, 440
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.quality = 86
ground = material("Fundo de estúdio",(.085,.105,.10),.83)
for slug, build in [
    ("barra-grafite",pull_bar),("perfil-latao",pull_profile),
    ("porta-embutida",lambda: cabinet(True)),("porta-sobreposta",cabinet),
    ("buffet-ripado",sideboard),("mesa-escritorio",desk),
]:
    for obj in list(scene.objects):
        if obj.type=="MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    build()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+".glb")),export_format="GLB",use_selection=True,export_apply=True)
    box("Piso",0,0,-.15,(200,200,.25),ground,0)
    scene.render.filepath=str(OUT/(slug+".webp"))
    bpy.ops.render.render(write_still=True)
