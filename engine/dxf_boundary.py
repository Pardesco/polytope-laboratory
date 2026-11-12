"""Bounded ASCII DXF boundary profile: literal triangle/quad faces, lines, points."""

from .geometry import GeometryError

UNIT_CODES = {'model': 0, 'in': 1, 'ft': 2, 'mm': 4, 'cm': 5, 'm': 6}


def import_document_attributes(model):
    data = model['metadata']['dxf']
    model['metadata']['coordinateUnits'] = {v: k for k, v in UNIT_CODES.items()}.get(data['insunits'], 'model')
    if data['insunits'] not in (None, *UNIT_CODES.values()):
        data['warnings'].append(
            'DXF physical unit '
            + data['unitName']
            + ' is retained as source metadata only. Coordinates are unchanged; declare supported document units before physical export.'
        )
    colors = []
    for face in data['faces']:
        style = face.get('style', data['entities'][face['entity']])
        color = style['color']
        if color['method'] == 'bylayer':
            color = color.get('resolvedLayerColor', color)
        if (
            color.get('transparencyCode') is not None
            and 'DXF transparency is retained as source metadata only; the face RGB palette is opaque.'
            not in data['warnings']
        ):
            data['warnings'].append(
                'DXF transparency is retained as source metadata only; the face RGB palette is opaque.'
            )
        rgb = color.get('rgb')
        colors.append({'encoding': 'byte', 'values': rgb[:]} if rgb is not None else None)
    if any(color is not None for color in colors):
        model['metadata']['offColors'] = {'faces': colors}


def export_boundary(model):
    from .compounds import _component_records
    from .dxf import MAX_SOURCE_VERTICES, MAX_ENTITIES, MAX_PAIRS, MAX_COORDINATE
    from .interchange import face_colors

    points = [list(p) + ([0] if len(p) == 2 else []) for p in model['vertices']]
    if any(abs(x) > MAX_COORDINATE for point in points for x in point):
        raise GeometryError('DXF boundary coordinates must stay within ±1e100 after unit conversion.')
    if any(len(face) not in (3, 4) for face in model['faces']):
        raise GeometryError(
            'DXF face boundary profile supports triangles and quadrilaterals only. Choose Wireframe, OFF or OBJ for larger polygons; no triangulation is inferred.'
        )
    units = model.get('metadata', {}).get('coordinateUnits', 'model')
    if units not in UNIT_CODES:
        raise GeometryError('DXF output coordinate units are unsupported.')
    components = _component_records(model)
    owners = {
        kind: {v: i for i, c in enumerate(components) for v in c['maps'][kind]}
        for kind in ('vertices', 'edges', 'faces')
    }
    seen = set()
    for v, point in enumerate(points):
        key = (owners['vertices'][v], tuple(point))
        if key in seen:
            raise GeometryError(
                'DXF face boundary profile cannot retain distinct coincident vertices within one component. Use JSON or OFF; no welding is performed by this exporter.'
            )
        seen.add(key)
    boundary = {tuple(sorted((a, b))) for f in model['faces'] for a, b in zip(f, f[1:] + f[:1])}
    if len({tuple(sorted(e)) for e in model['edges']}) != len(model['edges']):
        raise GeometryError('DXF face boundary profile cannot retain repeated edge incidence. Use JSON.')
    used = {v for f in model['faces'] for v in f} | {v for e in model['edges'] for v in e}
    loose = [i for i, edge in enumerate(model['edges']) if tuple(sorted(edge)) not in boundary]
    isolated = [v for v in range(len(points)) if v not in used]
    if (
        len(model['faces']) + len(loose) + len(isolated) > MAX_ENTITIES
        or 4 * len(model['faces']) + 2 * len(loose) + len(isolated) > MAX_SOURCE_VERTICES
    ):
        raise GeometryError(
            'DXF boundary entity/source-vertex occurrence resource limit exceeded; choose a smaller source.'
        )
    colors = face_colors(model)
    supplied = model.get('metadata', {}).get('offColors', {}).get('faces') or [None] * len(colors)
    layers = ['part_' + str(i + 1) for i in range(len(components))]
    rows = [
        (0, 'SECTION'),
        (2, 'HEADER'),
        (9, '$ACADVER'),
        (1, 'AC1021'),
        (9, '$INSUNITS'),
        (70, UNIT_CODES[units]),
        (0, 'ENDSEC'),
        (0, 'SECTION'),
        (2, 'TABLES'),
        (0, 'TABLE'),
        (2, 'LAYER'),
        (70, len(layers)),
    ]
    for layer in layers:
        rows += [(0, 'LAYER'), (2, layer), (70, 0), (62, 7), (6, 'CONTINUOUS')]
    rows += [(0, 'ENDTAB'), (0, 'ENDSEC'), (0, 'SECTION'), (2, 'ENTITIES')]

    def point(v, code):
        return [(code + axis * 10, format(x, '.17g')) for axis, x in enumerate(points[v])]

    color_residual = 0.0
    for i, face in enumerate(model['faces']):
        rows += [(0, '3DFACE'), (8, layers[owners['faces'][i]])]
        if supplied[i] is not None:
            rgb = [int(x * 255 + 0.5) for x in colors[i][:3]]
            rows.append((420, (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]))
            color_residual = max(color_residual, max(abs(x / 255 - y) for x, y in zip(rgb, colors[i])))
        for slot, v in enumerate(face + ([face[-1]] if len(face) == 3 else [])):
            rows += point(v, 10 + slot)
    for e in loose:
        a, b = model['edges'][e]
        rows += [(0, 'LINE'), (8, layers[owners['edges'][e]])] + point(a, 10) + point(b, 11)
    for v in isolated:
        rows += [(0, 'POINT'), (8, layers[owners['vertices'][v]])] + point(v, 10)
    rows += [(0, 'ENDSEC'), (0, 'EOF')]
    if len(rows) > MAX_PAIRS:
        raise GeometryError('DXF boundary group-pair resource limit exceeded; choose a smaller source.')
    losses = [
        'DXF boundary surfaces do not assert a solid. Component names/IDs become numbered part layers; save a project for original ownership records.'
    ]
    if any(color[3] != 1 for i, color in enumerate(colors) if supplied[i] is not None):
        losses.append('DXF face RGB is retained, but face alpha is omitted by this boundary profile.')
    if color_residual:
        losses.append('DXF true color uses 8-bit RGB; unit color channels are rounded to the nearest byte.')
    if model.get('metadata', {}).get('dxf'):
        losses.append(
            'Original DXF handles, layer names, ACI/by-layer styles, visibility and hidden-edge flags remain in JSON/project metadata, not this boundary export.'
        )
    report = {
        'profile': 'boundary',
        'faceCount': len(model['faces']),
        'lineCount': len(loose),
        'pointCount': len(isolated),
        'componentCount': len(components),
        'coloredFaceCount': sum(c is not None for c in supplied),
        'maxRGBChannelResidual': color_residual,
        'coordinateEncoding': '17 significant decimal digits; binary64 round-trip',
        'layers': [
            {'layer': layer, 'componentId': c.get('id'), 'name': c.get('name')} for layer, c in zip(layers, components)
        ],
    }
    return ''.join(str(code) + '\n' + str(value) + '\n' for code, value in rows), report, losses
