import base64
from copy import deepcopy
import json
import struct
import xml.etree.ElementTree as ET
import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, validate
from engine.interchange import prepare_view_export, validate_glb, VIEW_FORMATS
from engine.export_context import prepare_export
from engine.formats import parse_off, load_file
from engine.operations import section
from engine.server import dispatch
from engine.dxf import parse_dxf


def display(model):
    p = np.array(model['vertices'], dtype=float)
    if p.shape[1] == 4:
        for a, b, theta in [(0, 3, 0.3), (1, 3, 0.2)]:
            x, y = p[:, a].copy(), p[:, b].copy()
            p[:, a] = np.cos(theta) * x - np.sin(theta) * y
            p[:, b] = np.sin(theta) * x + np.cos(theta) * y
        p = p[:, :3] / (3 - p[:, 3, None])
    if p.shape[1] == 2:
        p = np.column_stack((p, np.zeros(len(p))))
    triangles = [p[[f[0], f[i], f[i + 1]]].tolist() for f in model['faces'] for i in range(1, len(f) - 1)]
    return {
        'nodes': p.tolist(),
        'edges': [p[e].tolist() for e in model['edges']],
        'triangles': triangles,
        'colors': [[i % 2, 0.25, 0.5, 0.75] for i in range(len(triangles))],
    }


def accessor(blob, doc, index):
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    end = 20 + struct.unpack_from('<I', blob, 12)[0] + 8
    width = {'VEC3': 3, 'VEC4': 4}[acc['type']]
    return np.frombuffer(blob, '<f4', acc['count'] * width, end + view['byteOffset']).reshape((-1, width))


@pytest.mark.parametrize('name,triangles,edges,nodes', [('cube', 12, 12, 8), ('tesseract', 48, 32, 16)])
def test_glb_structure_colors_counts_bounds_and_metadata(name, triangles, edges, nodes):
    model = regular(name)
    before = deepcopy(model)
    result = dispatch(
        {
            'op': 'prepare-view-export',
            'model': model,
            'params': {
                'display': display(model),
                'size_m': 0.254,
                'document_metadata': {
                    'title': 'Test <title>',
                    'author': 'Researcher',
                    'description': 'Approximate projection',
                },
            },
        }
    )
    blob = base64.b64decode(result['text'])
    doc = validate_glb(blob)
    assert doc['asset']['extras']['author'] == 'Researcher'
    assert doc['asset']['extras']['coordinateUnits'] == 'm'
    assert doc['nodes'][0]['children'] == [1]
    primitives = {p['mode']: p for p in doc['meshes'][0]['primitives']}
    for mode, count in [(4, triangles * 3), (1, edges * 2), (0, nodes)]:
        assert len(accessor(blob, doc, primitives[mode]['attributes']['POSITION'])) == count
    colors = accessor(blob, doc, primitives[4]['attributes']['COLOR_0'])
    assert colors[::3] == pytest.approx(np.asarray(display(model)['colors']))
    assert result['report']['encodedSizeResidualMeters'] < 1e-7
    bounds = result['report']['boundsMeters']
    assert max(np.subtract(bounds['max'], bounds['min'])) == pytest.approx(0.254)
    assert model == before


def test_glb_hierarchy_partitions_faces_lines_and_nodes():
    model = regular('cube')
    data = display(model)
    data['components'] = ['A', 'B']
    for key in ('triangles', 'edges', 'nodes'):
        data[key + '_components'] = [i % 2 for i in range(len(data[key]))]
    doc = validate_glb(base64.b64decode(prepare_view_export(model, data)['text']))
    assert [n['name'] for n in doc['nodes'][1:]] == ['A', 'B']
    assert len(doc['nodes'][0]['children']) == 2
    assert all(len(mesh['primitives']) == 3 for mesh in doc['meshes'])


def rewrite_json(blob, change):
    size = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20 : 20 + size])
    change(doc)
    data = json.dumps(doc, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    rest = blob[20 + size :]
    return (
        struct.pack('<III', 0x46546C67, 2, 20 + len(data) + len(rest))
        + struct.pack('<II', len(data), 0x4E4F534A)
        + data
        + rest
    )


@pytest.mark.parametrize(
    'change',
    [
        lambda b: b'BAD!' + b[4:],
        lambda b: b[:8] + struct.pack('<I', 1) + b[12:],
        lambda b: b[:-1],
        lambda b: rewrite_json(b, lambda d: d['accessors'][0].update(count=9999999)),
        lambda b: rewrite_json(b, lambda d: d['accessors'][0].update(min=[0, 0, 0])),
        lambda b: rewrite_json(b, lambda d: d['bufferViews'][0].update(byteOffset=1)),
        lambda b: rewrite_json(b, lambda d: d['nodes'][0]['children'].append(0)),
        lambda b: rewrite_json(b, lambda d: d['accessors'][1].update(count=1)),
    ],
)
def test_glb_validator_rejects_corrupt_header_chunks_accessors_and_hierarchy(change):
    model = regular('cube')
    blob = base64.b64decode(prepare_view_export(model, display(model))['text'])
    with pytest.raises(GeometryError):
        validate_glb(change(blob))


def test_colored_obj_mtl_round_trip_independent_reader():
    model = regular('cube')
    model['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [255, 64, 128, 128]}] * 6}
    result = prepare_export(model, 'obj', 'mm', 'in', include_text=True)
    mats = {}
    current = None
    for row in result['materials'].splitlines():
        parts = row.split()
        if not parts:
            continue
        if parts[0] == 'newmtl':
            current = parts[1]
            mats[current] = {}
        else:
            mats[current][parts[0]] = parts[1:]
    faces = []
    vertices = []
    for row in result['text'].splitlines():
        parts = row.split()
        if not parts:
            continue
        if parts[0] == 'v':
            vertices.append(list(map(float, parts[1:])))
        if parts[0] == 'usemtl':
            current = parts[1]
        if parts[0] == 'f':
            faces.append(([int(v) - 1 for v in parts[1:]], mats[current]))
    assert np.asarray(vertices) == pytest.approx(np.asarray(model['vertices']) / 25.4)
    assert [f for f, m in faces] == model['faces']
    assert list(map(float, faces[0][1]['Kd'])) == pytest.approx([1, 64 / 255, 128 / 255])
    assert float(faces[0][1]['d'][0]) == pytest.approx(128 / 255)
    assert len([r for r in result['text'].splitlines() if r.startswith('l ')]) == 12


def test_x3d_xml_face_colors_and_lines():
    model = regular('cube')
    model['metadata']['offColors'] = {'faces': [{'encoding': 'unit', 'values': [0.2, 0.4, 0.6, 0.8]}] * 6}
    root = ET.fromstring(prepare_export(model, 'x3d', include_text=True)['text'])
    mesh = root.find('.//IndexedFaceSet')
    assert mesh.attrib['colorPerVertex'] == 'false'
    assert mesh.attrib['coordIndex'].split().count('-1') == 6
    assert len(mesh.find('Coordinate').attrib['point'].split()) == 24
    assert len(mesh.find('ColorRGBA').attrib['color'].split()) == 24
    assert root.find('.//IndexedLineSet').attrib['coordIndex'].split().count('-1') == 12


def test_native_obj_route_writes_companion_and_preserves_existing_materials(tmp_path):
    model = regular('cube')
    target = tmp_path / 'model.obj'
    target.write_text('prior')
    (tmp_path / 'materials.mtl').write_text('keep')
    result = dispatch({'op': 'export', 'model': model, 'params': {'format': 'obj', 'path': str(target)}})
    from pathlib import Path

    sidecar = Path(result['materialPath'])
    assert sidecar.parent == tmp_path and sidecar.read_text().startswith('newmtl ')
    assert 'mtllib ' + sidecar.name + '\n' in target.read_text()
    assert (tmp_path / 'materials.mtl').read_text() == 'keep'
    bundle = dispatch({'op': 'export', 'model': model, 'params': {'format': 'obj'}})
    assert 'mtllib materials.mtl' in bundle['text'] and bundle['materials']


def test_native_obj_failed_publication_removes_its_companion(tmp_path, monkeypatch):
    import engine.formats as formats

    target = tmp_path / 'model.obj'
    target.write_text('prior')

    def fail(*args):
        raise OSError('injected publication failure')

    monkeypatch.setattr(formats, 'atomic_write', fail)
    with pytest.raises(OSError, match='publication failure'):
        dispatch({'op': 'export', 'model': regular('cube'), 'params': {'format': 'obj', 'path': str(target)}})
    assert target.read_text() == 'prior' and sorted(p.name for p in tmp_path.iterdir()) == ['model.obj']


def test_x3d_declares_physical_unit_factor_and_glb_requires_meters():
    model = regular('cube')
    root = ET.fromstring(prepare_export(model, 'x3d', 'mm', 'in', include_text=True)['text'])
    assert float(root.find('./head/unit').attrib['conversionFactor']) == pytest.approx(0.0254)
    with pytest.raises(GeometryError, match='meters'):
        prepare_view_export(model, display(model), target_unit='mm')


@pytest.mark.parametrize(
    'value', [[], [{'encoding': 'byte', 'values': [1.5, 2, 3]}] * 6, [{'encoding': 'unit', 'values': [2, 0, 0]}] * 6]
)
def test_invalid_source_color_tables_do_not_produce_unbounded_materials(value):
    model = regular('cube')
    model['metadata']['offColors'] = {'faces': value}
    with pytest.raises(GeometryError):
        prepare_export(model, 'obj', include_text=True)


@pytest.mark.parametrize('format', VIEW_FORMATS)
@pytest.mark.parametrize('name', ['cube', 'tesseract'])
def test_derived_sections_export_through_every_display_format(format, name):
    model = section(regular(name))['model']
    before = deepcopy(model)
    result = prepare_view_export(
        model, display(model), format=format, notes='Kept in JSON/OFF', document_metadata={'title': 'Section'}
    )
    assert result['report']['coordinateDomain'] == 'displayed 3D geometry'
    if format == 'glb':
        validate_glb(base64.b64decode(result['text']))
    elif format == 'x3d':
        ET.fromstring(result['text'])
    elif format == 'off':
        assert validate(parse_off(result['text']))['passed']
    elif format == 'json':
        assert validate(json.loads(result['text']))['passed']
    elif format == 'obj':
        assert result['materials'] and 'mtllib __POLYTOPE_MTL__' in result['text']
    else:
        assert result['text']
    assert model == before


def test_off_display_drops_loose_lines_with_honest_counts():
    model = regular('cube')
    data = display(model)
    data['edges'].append([[4, 5, 6], [5, 6, 7]])
    result = prepare_view_export(model, data, format='off')
    assert validate(parse_off(result['text']))['passed']
    assert any('Standalone lines' in loss for loss in result['report']['losses'])


@pytest.mark.parametrize('value', [0, True, float('nan'), 1e9])
def test_display_scale_refuses_invalid_values(value):
    model = regular('cube')
    with pytest.raises(GeometryError):
        prepare_view_export(model, display(model), size_m=value)


def test_display_clipping_diagnostics_are_retained_and_incomplete_geometry_refuses():
    model = regular('cube')
    data = display(model)
    data['diagnostics'] = ['Two source vertices were clipped by the near plane.']
    assert data['diagnostics'][0] in prepare_view_export(model, data)['report']['losses']
    data['diagnostics'] = ['Projection resource limit; omitted patches.']
    with pytest.raises(GeometryError, match='complete finite'):
        prepare_view_export(model, data)


def drawing(rows):
    return ''.join(
        f'{code}\n{value}\n' for code, value in [(0, 'SECTION'), (2, 'ENTITIES')] + rows + [(0, 'ENDSEC'), (0, 'EOF')]
    )


def lw(points, closed=True, extra=()):
    return (
        [(0, 'LWPOLYLINE'), (8, 'outline'), (90, len(points)), (70, 1 if closed else 0)]
        + list(extra)
        + [pair for x, y in points for pair in [(10, x), (20, y)]]
    )


def test_binary_dxf_file_detection_precedes_utf8_decode(tmp_path):
    path = tmp_path / 'binary.dxf'
    path.write_bytes(b'AutoCAD Binary DXF\r\n\x1a\x00\xff\xfe')
    with pytest.raises(GeometryError, match='Binary DXF.*ASCII'):
        load_file(path)


@pytest.mark.parametrize('kind', ['3DSOLID', 'REGION', 'BODY'])
def test_acis_refusal_is_actionable(kind):
    with pytest.raises(GeometryError, match=kind + '.*ACIS.*3DFACE'):
        parse_dxf(drawing([(0, kind)]))


@pytest.mark.parametrize('closed,counts', [(True, (4, 4, 1)), (False, (4, 3, 0))])
def test_lwpolyline_closed_face_and_open_edges(closed, counts):
    model = parse_dxf(drawing(lw([(0, 0), (2, 0), (2, 2), (0, 2)], closed, [(38, 3)])))
    assert tuple(len(model[k]) for k in ('vertices', 'edges', 'faces')) == counts
    assert all(p[2] == 3 for p in model['vertices'])
    assert model['metadata']['dxf']['affineDimension'] == 2
    assert model['components'][0]['name'] == 'outline'


def test_lwpolyline_repeated_closing_point_and_ocs():
    model = parse_dxf(drawing(lw([(0, 0), (1, 0), (0, 1), (0, 0)], extra=[(210, 0), (220, 1), (230, 0), (38, 2)])))
    assert len(model['faces'][0]) == 3
    assert all(p[1] == 2 for p in model['vertices'])
    assert validate(model)['passed']


@pytest.mark.parametrize('extra', [[(42, 0.2)], [(43, 1)], [(40, 1)], [(90, 100)]])
def test_lwpolyline_unsupported_curves_widths_or_wrong_counts_refuse(extra):
    rows = lw([(0, 0), (1, 0), (0, 1)]) + extra
    with pytest.raises(GeometryError):
        parse_dxf(drawing(rows))


def mesh(m=2, n=2, flags=16, points=None):
    points = points or [[i, j, 0] for i in range(m) for j in range(n)]
    return (
        [(0, 'POLYLINE'), (70, flags), (71, m), (72, n)]
        + [pair for p in points for pair in [(0, 'VERTEX'), (70, 64), (10, p[0]), (20, p[1]), (30, p[2])]]
        + [(0, 'SEQEND')]
    )


def test_polygon_mesh_order_and_closed_m_seam():
    model = parse_dxf(drawing(mesh()))
    assert model['faces'] == [[0, 2, 3, 1]]
    points = [[np.cos(t), np.sin(t), z] for t in (0, 2 * np.pi / 3, 4 * np.pi / 3) for z in (0, 1)]
    closed = parse_dxf(drawing(mesh(3, 2, 17, points)))
    assert len(closed['faces']) == 3 and closed['faces'][-1] == [4, 0, 1, 5]
    assert validate(closed)['passed']


@pytest.mark.parametrize(
    'rows',
    [
        mesh()[:-1],
        mesh(points=[[0, 0, 0], [1, 0, 0], [1, 1, 0]]),
        mesh(flags=18),
        mesh(points=[[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]]),
    ],
)
def test_polygon_mesh_missing_counts_seqend_fitted_or_nonplanar_refuse(rows):
    with pytest.raises(GeometryError):
        parse_dxf(drawing(rows))


def test_dxf_layers_are_independent_components_even_at_identical_coordinates():
    first = lw([(0, 0), (1, 0), (0, 1)])
    second = [(code, 'other' if code == 8 else value) for code, value in first]
    model = parse_dxf(drawing(first + second), weld_tolerance=0.01)
    assert len(model['vertices']) == 6 and len(model['components']) == 2
    from engine.compounds import _component_records

    assert _component_records(model) == model['components']
    assert [c['maps']['faces'] for c in model['components']] == [[0], [1]]
