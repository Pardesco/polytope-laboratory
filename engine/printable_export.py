"""Closed printable shells from a detached, finite viewport snapshot (mm)."""

import base64
import io
import math
import struct
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from scipy.spatial import ConvexHull, cKDTree
from .geometry import GeometryError, identity, validate

MAX_TRIANGLES = 500000
MAX_INPUT = 100000
MAX_BYTES = 64 * 1024 * 1024
CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'


def _number(value, name, low, high):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise GeometryError(f'{name} must be finite and between {low} and {high}.')
    return value


def _points(rows, width, name):
    if type(rows) is not list or len(rows) > MAX_INPUT:
        raise GeometryError(f'Printable {name} exceeds the {MAX_INPUT} record bound.')

    def point(p):
        return (
            type(p) is list
            and len(p) == 3
            and all(type(x) in (int, float) and math.isfinite(x) and abs(x) <= 1e8 for x in p)
        )

    if any(
        not (point(row) if width == 1 else type(row) is list and len(row) == width and all(point(p) for p in row))
        for row in rows
    ):
        raise GeometryError(f'Printable {name} needs finite bounded 3D points.')
    return np.asarray(rows, dtype=float).reshape((-1, 3) if width == 1 else (-1, width, 3))


def _shell(name, points, triangles):
    p = np.asarray(points, dtype=float)
    t = np.asarray(triangles, dtype=int)
    relative = p - p.mean(axis=0)
    volume = float(np.einsum('ij,ij->i', relative[t[:, 0]], np.cross(relative[t[:, 1]], relative[t[:, 2]])).sum() / 6)
    if not math.isfinite(volume) or abs(volume) <= 1e-18:
        raise GeometryError('A printable shell is degenerate at the requested scale.')
    if volume < 0:
        t = t[:, [0, 2, 1]]
    return {'name': name, 'vertices': p, 'triangles': t}


def _cylinder(a, b, radius, n, name):
    direction = b - a
    direction /= np.linalg.norm(direction)
    axis = np.eye(3)[np.argmin(np.abs(direction))]
    u = np.cross(direction, axis)
    u /= np.linalg.norm(u)
    v = np.cross(direction, u)
    ring = np.array(
        [radius * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * v) for k in range(n)]
    )
    points = np.concatenate((a + ring, b + ring, [a, b]))
    triangles = []
    for i in range(n):
        j = (i + 1) % n
        triangles.extend(((i, j, n + j), (i, n + j, n + i), (2 * n, j, i), (2 * n + 1, n + i, n + j)))
    return _shell(name, points, triangles)


def _sphere(center, radius, n, name):
    rings = n // 2 - 1
    points = [[0, 0, radius]]
    for k in range(1, rings + 1):
        theta = math.pi * k / (rings + 1)
        points.extend(
            [
                [
                    radius * math.sin(theta) * math.cos(2 * math.pi * j / n),
                    radius * math.sin(theta) * math.sin(2 * math.pi * j / n),
                    radius * math.cos(theta),
                ]
                for j in range(n)
            ]
        )
    points.append([0, 0, -radius])
    bottom = len(points) - 1
    triangles = []
    for i in range(n):
        j = (i + 1) % n
        triangles.extend(((0, 1 + i, 1 + j), (bottom, 1 + (rings - 1) * n + j, 1 + (rings - 1) * n + i)))
        for k in range(rings - 1):
            a, b = 1 + k * n + i, 1 + k * n + j
            triangles.extend(((a, a + n, b + n), (a, b + n, b)))
    return _shell(name, np.asarray(points) + center, triangles)


def _panel(triangle, thickness, name):
    a, b, c = triangle
    normal = np.cross(b - a, c - a)
    normal /= np.linalg.norm(normal)
    points = np.concatenate((triangle - normal * thickness / 2, triangle + normal * thickness / 2))
    return _shell(
        name, points, [(0, 2, 1), (3, 4, 5), (0, 1, 4), (0, 4, 3), (1, 2, 5), (1, 5, 4), (2, 0, 3), (2, 3, 5)]
    )


def _bounds(shells):
    low = np.min([s['vertices'].min(axis=0) for s in shells], axis=0)
    high = np.max([s['vertices'].max(axis=0) for s in shells], axis=0)
    return low, high


def _qualify(shells, float32=False):
    minimum = math.inf
    for s in shells:
        p = s['vertices'].astype(np.float32).astype(float) if float32 else s['vertices']
        p = p - p.mean(axis=0)
        t = s['triangles']
        a, b, c = (p[t[:, i]] for i in range(3))
        volume = float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)
        area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
        if not np.isfinite(area).all() or np.any(area <= 0) or not math.isfinite(volume) or volume <= 0:
            raise GeometryError(
                'A printable shell collapses at the requested scale or STL precision. Increase size or simplify the display.'
            )
        minimum = min(minimum, volume)
    return minimum


def build_printable(
    model,
    display,
    mode='strut',
    size_mm=100,
    strut_mm=2,
    node_mm=3,
    thickness_mm=1.6,
    segments=16,
    wall_mm=0,
    fill_rule='nonzero',
):
    if type(model) is not dict or not validate(model)['passed']:
        raise GeometryError('Printable export requires valid source geometry.')
    if mode not in ('strut', 'panels', 'solid'):
        raise GeometryError('Choose Strut, Panels or Solid.')
    size_mm = _number(size_mm, 'Target size (mm)', 0.1, 10000)
    strut_mm = _number(strut_mm, 'Strut diameter (mm)', 0.05, 1000)
    node_mm = _number(node_mm, 'Node diameter (mm)', 0.05, 1000)
    thickness_mm = _number(thickness_mm, 'Panel thickness (mm)', 0.05, 1000)
    wall_mm = _number(wall_mm, 'Hollow wall thickness (mm)', 0, 1000)
    if fill_rule not in ('nonzero', 'even-odd'):
        raise GeometryError('Solid fill rule must be nonzero or even-odd.')
    if wall_mm and mode != 'solid':
        raise GeometryError('Hollow shell is available in Solid mode only.')
    if type(segments) is not int or not 8 <= segments <= 64 or segments % 4:
        raise GeometryError('Quality segments must be a multiple of 4 between 8 and 64.')
    if type(display) is not dict or set(display) - {
        'nodes',
        'edges',
        'triangles',
        'face_ids',
        'diagnostics',
        'projection',
        'solid_eligible',
    }:
        raise GeometryError('Supply a supported printable display snapshot.')
    nodes = _points(display.get('nodes'), 1, 'nodes')
    edges = _points(display.get('edges'), 2, 'edges')
    triangles = _points(display.get('triangles'), 3, 'triangles')
    face_ids = display.get('face_ids', list(range(len(triangles))))
    if (
        type(face_ids) is not list
        or len(face_ids) != len(triangles)
        or any(type(i) is not int or not 0 <= i < len(model['faces']) for i in face_ids)
    ):
        raise GeometryError('Printable patches need valid source face IDs.')
    diagnostics = display.get('diagnostics', [])
    if (
        type(diagnostics) is not list
        or len(diagnostics) > 128
        or any(type(x) is not str or len(x) > 4096 for x in diagnostics)
    ):
        raise GeometryError('Printable display diagnostics exceed their bound.')
    warnings = list(dict.fromkeys(diagnostics))
    if mode == 'solid':
        from .solid_printing import build_solid

        return build_solid(model, display, nodes, size_mm, wall_mm, fill_rule)
    seen = set()
    unique = []
    skipped = 0
    for edge in edges:
        key = tuple(sorted(tuple(float(x) for x in p) for p in edge))
        if np.linalg.norm(edge[1] - edge[0]) <= 1e-12 or key in seen:
            skipped += 1
            continue
        seen.add(key)
        unique.append(edge)
    edges = np.asarray(unique).reshape((-1, 2, 3))
    if skipped:
        warnings.append(f'Skipped {skipped} duplicate or zero-length display segments.')
    if len(nodes):
        nodes = np.unique(nodes, axis=0)
    joint_nodes = np.empty((0, 3))
    if mode == 'strut':
        if not len(edges) and not len(nodes):
            raise GeometryError('The displayed geometry has no finite struts or nodes.')
        if strut_mm < 1.2:
            warnings.append(
                'Struts are thinner than the suggested 1.2 mm printable minimum; qualify material and printer settings.'
            )
        if node_mm < strut_mm:
            warnings.append('Node diameter is smaller than strut diameter; joints may be weak.')
        # Arc/clipping endpoints receive balls to close bends between capped rods.
        source_keys = {tuple(p) for p in nodes}
        joint_nodes = np.array(
            [p for p in np.unique(edges.reshape((-1, 3)), axis=0) if tuple(p) not in source_keys]
        ).reshape((-1, 3))
        count = len(edges) * 4 * segments + (len(nodes) + len(joint_nodes)) * 2 * segments * (segments // 2 - 1)
        cloud = np.concatenate((nodes, edges.reshape((-1, 3))))
    elif mode == 'panels':
        areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]), axis=1)
        keep = areas > 1e-12
        if not keep.all():
            warnings.append(f'Skipped {int((~keep).sum())} collapsed display patches.')
        triangles = triangles[keep]
        face_ids = np.asarray(face_ids)[keep].tolist()
        if not len(triangles):
            raise GeometryError('The display has no nondegenerate filled face patches. Enable faces or choose Strut.')
        count = len(triangles) * 8
        cloud = triangles.reshape((-1, 3))
        warnings.append(
            'Each displayed face triangle is a separate closed panel, grouped by source face. Panels meet or overlap; no Boolean union or solid interior is inferred.'
        )
    if count > MAX_TRIANGLES:
        raise GeometryError(
            f'Printable mesh needs {count} triangles; reduce quality or geometry below {MAX_TRIANGLES}.'
        )
    center = (cloud.min(axis=0) + cloud.max(axis=0)) / 2
    span = float(np.ptp(cloud, axis=0).max())
    if span <= 1e-12:
        raise GeometryError('The displayed geometry has zero extent.')

    def make(scale):
        shells = []
        if mode == 'strut':
            shells.extend(
                _cylinder((a - center) * scale, (b - center) * scale, strut_mm / 2, segments, f'strut_{i}')
                for i, (a, b) in enumerate(edges)
            )
            shells.extend(
                _sphere((p - center) * scale, node_mm / 2, segments, f'node_{i}') for i, p in enumerate(nodes)
            )
            shells.extend(
                _sphere((p - center) * scale, strut_mm / 2, segments, f'joint_{i}') for i, p in enumerate(joint_nodes)
            )
        elif mode == 'panels':
            shells.extend(
                _panel((p - center) * scale, thickness_mm, f'face_{face_ids[i]}_panel_{i}')
                for i, p in enumerate(triangles)
            )
        return shells

    # Positions scale while physical wall/rod diameters remain fixed. The mesh
    # bound is piecewise linear; bisect using per-vertex centers and offsets.
    reference = make(1)
    offsets = []
    centers = []
    if mode == 'strut':
        for i, (a, b) in enumerate(edges):
            centers.append(
                np.concatenate(
                    (np.tile(a - center, (segments, 1)), np.tile(b - center, (segments, 1)), [a - center, b - center])
                )
            )
        centers.extend(
            np.tile(p - center, (len(s['vertices']), 1))
            for p, s in zip(np.concatenate((nodes, joint_nodes)), reference[len(edges) :])
        )
    elif mode == 'panels':
        centers = [np.concatenate((p - center, p - center)) for p in triangles]
    for s, c in zip(reference, centers):
        offsets.append(s['vertices'] - c)
    c = np.concatenate(centers)
    o = np.concatenate(offsets)

    def extent(scale):
        return float(np.ptp(c * scale + o, axis=0).max())

    if extent(0) >= size_mm:
        raise GeometryError('Target size must exceed the physical diameters or panel thickness.')
    low, high = 0.0, max(1.0, size_mm / span)
    while extent(high) < size_mm:
        high *= 2
    for _ in range(55):
        mid = (low + high) / 2
        if extent(mid) < size_mm:
            low = mid
        else:
            high = mid
    scale = (low + high) / 2
    for s, c, o in zip(reference, centers, offsets):
        s['vertices'] = c * scale + o
    lo, hi = _bounds(reference)
    translation = (lo + hi) / 2
    for s in reference:
        s['vertices'] -= translation
    lo, hi = _bounds(reference)
    minimum_volume = _qualify(reference)
    # Close endpoint pairs are a cheap conservative joint warning. Pair output
    # is bounded; no quadratic pair materialization for dense projections.
    if mode == 'strut' and len(edges) > 1:
        endpoints = np.unique(edges.reshape((-1, 3)), axis=0) * scale
        near = len(endpoints) > 1 and np.min(cKDTree(endpoints).query(endpoints, k=2)[0][:, 1]) < strut_mm
        directions = (edges[:, 1] - edges[:, 0]) * scale
        midpoints = edges.mean(axis=1) * scale
        distances, neighbors = cKDTree(midpoints).query(midpoints, k=2)
        parallel = np.linalg.norm(np.cross(directions, directions[neighbors[:, 1]]), axis=1) <= 1e-6 * np.linalg.norm(
            directions, axis=1
        ) * np.linalg.norm(directions[neighbors[:, 1]], axis=1)
        if near or np.any((distances[:, 1] < strut_mm) & parallel):
            warnings.append(
                'Some displayed edges or endpoints nearly coincide at the requested diameter; inspect joint overlap in a slicer.'
            )
    warnings.append(
        'Closed outward triangle shells overlap and are not Boolean-unioned. Ask the slicer to union overlapping volumes; inspect connectivity and supports before printing.'
    )
    report = {
        'mode': mode,
        'units': 'millimeter',
        'triangleCount': count,
        'shellCount': len(reference),
        'struts': len(edges) if mode == 'strut' else 0,
        'nodes': len(nodes) if mode == 'strut' else 0,
        'arcJoints': len(joint_nodes),
        'panels': len(triangles) if mode == 'panels' else 0,
        'boundsMM': {'min': lo.tolist(), 'max': hi.tolist(), 'size': (hi - lo).tolist()},
        'targetSizeMM': size_mm,
        'sizeResidualMM': abs(float((hi - lo).max()) - size_mm),
        'minimumShellVolumeMM3': minimum_volume,
        'centerlineScale': scale,
        'warnings': warnings,
        'sourceFingerprint': identity(model),
        'coordinateDomain': 'current displayed 3D geometry',
        'precision': 'Approximate tessellated mesh; binary STL coordinates are float32.',
    }
    return reference, report


def encode_printable(shells, format='stl', ascii_stl=False):
    if format not in ('stl', 'obj', '3mf', 'glb') or type(ascii_stl) is not bool:
        raise GeometryError('Printable formats are binary/ASCII STL, OBJ, 3MF and GLB.')
    if format == 'glb':
        from .solid_print_formats import glb

        return glb(shells), 'base64'
    if format == 'obj' and any('colors' in s for s in shells):
        from .solid_print_formats import obj

        return obj(shells)[0], 'utf8'
    if format == 'obj':
        rows = ['# Polytope Laboratory printable mesh; units millimeter']
        offset = 1
        for s in shells:
            rows.append('g ' + s['name'])
            rows.extend('v ' + ' '.join(f'{x:.17g}' for x in p) for p in s['vertices'])
            rows.extend('f ' + ' '.join(str(int(i) + offset) for i in t) for t in s['triangles'])
            offset += len(s['vertices'])
        return '\n'.join(rows) + '\n', 'utf8'
    if format == '3mf':
        ET.register_namespace('', CORE)
        root = ET.Element(
            '{' + CORE + '}model', {'unit': 'millimeter', '{http://www.w3.org/XML/1998/namespace}lang': 'en-US'}
        )

        def element(parent, name, attrs=None):
            return ET.SubElement(parent, '{' + CORE + '}' + name, attrs or {})

        resources = element(root, 'resources')
        build = element(root, 'build')
        if any('colors' in s for s in shells):
            from .solid_print_formats import color_group

            color_id, color_indices = color_group(root, resources, shells)
        for i, s in enumerate(shells, 1):
            obj = element(resources, 'object', {'id': str(i), 'type': 'model', 'name': s['name']})
            mesh = element(obj, 'mesh')
            vertices = element(mesh, 'vertices')
            triangles = element(mesh, 'triangles')
            for p in s['vertices']:
                element(vertices, 'vertex', dict(zip(('x', 'y', 'z'), (f'{x:.17g}' for x in p))))
            for j, t in enumerate(s['triangles']):
                attrs = dict(zip(('v1', 'v2', 'v3'), map(str, t)))
                if 'colors' in s:
                    index = str(color_indices[tuple(s['colors'][j])])
                    attrs.update(pid=str(color_id), p1=index, p2=index, p3=index)
                element(triangles, 'triangle', attrs)
        assembly = element(
            resources, 'object', {'id': str(len(shells) + 1), 'type': 'model', 'name': 'Printable sculpture'}
        )
        components = element(assembly, 'components')
        for i in range(1, len(shells) + 1):
            element(components, 'component', {'objectid': str(i)})
        element(build, 'item', {'objectid': str(len(shells) + 1)})
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr(
                '[Content_Types].xml',
                '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
            )
            z.writestr(
                '_rels/.rels',
                '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
            )
            z.writestr('3D/3dmodel.model', ET.tostring(root, encoding='utf-8', xml_declaration=True))
        return out.getvalue(), 'base64'
    out = io.StringIO() if ascii_stl else io.BytesIO()
    if not ascii_stl:
        out.write(b'Polytope Laboratory printable; millimeter'.ljust(80, b'\0'))
        out.write(struct.pack('<I', sum(len(s['triangles']) for s in shells)))
    for s in shells:
        if ascii_stl:
            out.write('solid ' + s['name'] + '\n')
        for t in s['triangles']:
            p = s['vertices'][t]
            normal = np.cross(p[1] - p[0], p[2] - p[0])
            normal /= np.linalg.norm(normal)
            if ascii_stl:
                out.write('facet normal ' + ' '.join(f'{x:.17g}' for x in normal) + '\nouter loop\n')
                for v in p:
                    out.write('vertex ' + ' '.join(f'{x:.17g}' for x in v) + '\n')
                out.write('endloop\nendfacet\n')
            else:
                out.write(struct.pack('<12fH', *normal, *p.ravel(), 0))
        if ascii_stl:
            out.write('endsolid ' + s['name'] + '\n')
    return out.getvalue(), 'utf8' if ascii_stl else 'base64'


def prepare_printable(model, display, format='stl', ascii_stl=False, source_unit='model', target_unit='mm', **options):
    if target_unit != 'mm':
        raise GeometryError('Printable exports use millimeters.')
    shells, report = build_printable(model, display, **options)
    report['encodedSizeResidualMM'] = report['sizeResidualMM']
    if format == 'stl' and ascii_stl is False:
        _qualify(shells, float32=True)
        lo = np.min([s['vertices'].astype(np.float32).min(axis=0).astype(float) for s in shells], axis=0)
        hi = np.max([s['vertices'].astype(np.float32).max(axis=0).astype(float) for s in shells], axis=0)
        report['encodedSizeResidualMM'] = abs(float((hi - lo).max()) - report['targetSizeMM'])
    if report['mode'] == 'solid':
        from .solid_printing import qualify_solid

        if format == 'glb':
            encoded = [
                {**s, 'vertices': (s['vertices'] * 0.001).astype(np.float32).astype(float) * 1000} for s in shells
            ]
            volumes, _ = qualify_solid(encoded, intersections=True)
            lo, hi = _bounds(encoded)
            report['encodedSizeResidualMM'] = abs(float((hi - lo).max()) - report['targetSizeMM'])
        else:
            volumes, _ = qualify_solid(shells, float32=format == 'stl' and not ascii_stl)
        report['encodedVolumeResidualMM3'] = abs(sum(volumes) - report['volumeMM3'])
    payload, encoding = encode_printable(shells, format, ascii_stl)
    if len(payload.encode('utf-8') if isinstance(payload, str) else payload) > MAX_BYTES:
        raise GeometryError('Printable output exceeds 64 MiB; reduce quality or geometry.')
    colored = any('colors' in s for s in shells) and format in ('obj', '3mf', 'glb')
    report.update(
        {
            'sourceUnit': source_unit,
            'targetUnit': 'mm',
            'format': format,
            'encoding': encoding,
            'losses': ['Construction history and document notes are omitted.']
            if colored
            else [
                'Display projection replaces intrinsic coordinates and incidence; notes, colors and history are omitted.'
            ],
        }
    )
    if format == 'glb':
        report['serializedCoordinateUnit'] = 'meter'
    result = {'text': base64.b64encode(payload).decode('ascii') if encoding == 'base64' else payload, 'report': report}
    if colored and format == 'obj':
        from .solid_print_formats import obj

        result['materials'] = obj(shells)[1]
        if len(payload.encode('utf-8')) + len(result['materials'].encode('utf-8')) > MAX_BYTES:
            raise GeometryError('Printable OBJ and materials exceed 64 MiB.')
    return result
