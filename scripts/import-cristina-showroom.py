"""Convert the Cristina SketchUp COLLADA export into two showroom exhibits.

Usage: blender -b --python-exit-code 1 -P scripts/import-cristina-showroom.py -- input.dae
"""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

SOURCE = Path(sys.argv[sys.argv.index("--") + 1])
OUT = Path(__file__).resolve().parents[1] / ".showroom-local"
OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
root = ET.parse(SOURCE).getroot()
for element in root.iter():
    element.tag = element.tag.rsplit("}", 1)[-1]
scale = float(root.find("./asset/unit").get("meter"))
geometries = {element.get("id"): element.find("mesh") for element in root.findall("./library_geometries/geometry")}
visual = root.find("./library_visual_scenes/visual_scene/node")
groups = {element.get("id"): element for element in visual.iter("node") if element.get("id")}
parents = {child: element for element in visual.iter("node") for child in element.findall("node")}


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


white = material("Branco acetinado", (.88, .87, .84), 0, .36)
gold = material("Dourado escovado", (.83, .51, .14), .74, .3)
gold.node_tree.nodes.get("Principled BSDF").inputs["Coat Weight"].default_value = .14
studio = material("Fundo do estúdio", (.24, .23, .20), 0, .74)


def matrix(node):
    if node.find("matrix") is not None:
        values = list(map(float, node.findtext("matrix").split()))
        return Matrix([values[i:i+4] for i in range(0, 16, 4)])
    return Matrix.Identity(4)


def ancestor_transform(node):
    parent = parents.get(node)
    if parent is None:
        return Matrix.Identity(4)
    return ancestor_transform(parent) @ matrix(parent)


def read_triangles(node, parent, batches, finish, lateral=(1, 0)):
    transform = parent @ matrix(node)
    for instance in node.findall("instance_geometry"):
        mesh = geometries[instance.get("url")[1:]]
        for triangles in mesh.findall("triangles"):
            inputs = triangles.findall("input")
            vertex = next(item for item in inputs if item.get("semantic") == "VERTEX")
            vertices = mesh.find(f'vertices[@id="{vertex.get("source")[1:]}"]')
            source_id = next(item.get("source")[1:] for item in vertices.findall("input")
                             if item.get("semantic") == "POSITION")
            source = mesh.find(f'source[@id="{source_id}"]')
            coords = list(map(float, source.findtext("float_array").split()))
            positions = [transform @ Vector(coords[i:i+3]) * scale for i in range(0, len(coords), 3)]
            points = [(round(p.y * lateral[0] + lateral[1], 6), round(-p.x, 6), round(p.z, 6)) for p in positions]
            stride = 1 + max(int(item.get("offset", "0")) for item in inputs)
            offset = int(vertex.get("offset", "0"))
            indices = list(map(int, triangles.findtext("p").split()))[offset::stride]
            for i in range(0, len(indices), 3):
                face = tuple(points[j] for j in indices[i:i+3])
                if len(set(face)) == 3:
                    batches[finish].setdefault(tuple(sorted(face)), face)
    for child in node.findall("node"):
        read_triangles(child, transform, batches, finish, lateral)


def emit(slug, specification):
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    batches = defaultdict(dict)
    for ids, finish, lateral in specification:
        for key in ids.split():
            group = groups[key]
            read_triangles(group, ancestor_transform(group), batches, finish, lateral)
    all_points = [point for batch in batches.values() for triangle in batch.values() for point in triangle]
    min_xyz = [min(point[i] for point in all_points) for i in range(3)]
    max_xyz = [max(point[i] for point in all_points) for i in range(3)]
    center = [(min_xyz[i] + max_xyz[i]) / 2 for i in range(2)] + [min_xyz[2]]
    for finish, triangles in batches.items():
        lookup = {}
        points, faces = [], []
        for triangle in triangles.values():
            face = []
            for point in triangle:
                if point not in lookup:
                    lookup[point] = len(points)
                    points.append(tuple(point[i] - center[i] for i in range(3)))
                face.append(lookup[point])
            faces.append(face)
        mesh = bpy.data.meshes.new(finish.name)
        mesh.from_pydata(points, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(finish.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(finish)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (slug + ".glb")), export_format="GLB", use_selection=True, export_apply=True)
    print(slug, "m:", [round(max_xyz[i] - min_xyz[i], 3) for i in range(3)])

    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.012))
    bpy.context.object.data.materials.append(studio)
    camera.location = (3.7, -7.5, 3.0) if max_xyz[0] - min_xyz[0] > 2 else (2.1, -5.2, 2.35)
    aim(camera, (0, 0, max_xyz[2] / 2))
    camera.data.ortho_scale = max(max_xyz[0] - min_xyz[0], max_xyz[2] * 1.64) * 1.3
    scene.render.filepath = str(OUT / (slug + ".webp"))
    bpy.ops.render.render(write_still=True)


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


scene = bpy.context.scene
scene.world = bpy.data.worlds.new("Luz ambiente")
scene.world.color = (.23, .23, .23)
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = "ORTHO"
scene.camera = camera
for position, energy, size in [((-3, -4, 5), 900, 4), ((5, -1, 4.8), 620, 3), ((0, 3, 5), 850, 4)]:
    bpy.ops.object.light_add(type="AREA", location=position)
    lamp = bpy.context.object
    lamp.data.energy = energy
    lamp.data.size = size
    aim(lamp, (0, 0, 1))
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 960, 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.quality = 88

emit("gaveteiros-arara", [
    ("ID11 ID20 ID33 ID46 ID53 ID89 ID125 ID132 ID139 ID146 ID159", white, (1, 0)),
    ("ID246 ID3713 ID7176 ID10639 ID14102 ID215", gold, (1, 0)),
    ("ID215", gold, (.78, 1.75 - 3.74 * .78)),
])
emit("balcao-frigobar", [
    ("ID188 ID201 ID208 ID17566", white, (1, 0)),
    ("ID17583 ID21048", gold, (1, 0)),
])
