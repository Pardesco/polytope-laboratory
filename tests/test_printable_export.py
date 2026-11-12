import base64
from collections import Counter
from copy import deepcopy
import io
import json
from pathlib import Path
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile
import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError
from engine.printable_export import build_printable, prepare_printable, CORE
from engine.server import dispatch


def display(model, projection=False):
    p = np.asarray(model['vertices'], dtype=float)
    if projection:
        p = p / np.linalg.norm(p, axis=1).max()
        for a, b, angle in [(0, 3, 0.41), (1, 3, 0.23)]:
            x, y = p[:, a].copy(), p[:, b].copy()
            p[:, a] = np.cos(angle) * x - np.sin(angle) * y
            p[:, b] = np.sin(angle) * x + np.cos(angle) * y
        p = p[:, :3] * 3 / (3 - p[:, 3, None])
    return {
        'nodes': p.tolist(),
        'edges': [[p[a].tolist(), p[b].tolist()] for a, b in model['edges']],
        'triangles': [],
        'face_ids': [],
        'solid_eligible': True,
    }


def assert_shell(shell):
    points, triangles = shell['vertices'], shell['triangles']
    edges = Counter((int(t[i]), int(t[(i + 1) % 3])) for t in triangles for i in range(3))
    assert all(count == 1 and edges[(b, a)] == 1 for (a, b), count in edges.items())
    assert len(points) - len(edges) // 2 + len(triangles) == 2
    p = points - points.mean(axis=0)
    volume = np.einsum('ij,ij->i', p[triangles[:, 0]], np.cross(p[triangles[:, 1]], p[triangles[:, 2]])).sum() / 6
    assert volume > 0
    areas = np.linalg.norm(
        np.cross(p[triangles[:, 1]] - p[triangles[:, 0]], p[triangles[:, 2]] - p[triangles[:, 0]]), axis=1
    )
    assert np.min(areas) > 0


@pytest.mark.parametrize('size', [25, 100, 254])
def test_tesseract_perspective_32_struts_16_nodes_closed_outward_and_size(size):
    model = regular('tesseract')
    snapshot = display(model, True)
    before = deepcopy((model, snapshot))
    shells, report = build_printable(model, snapshot, size_mm=size, strut_mm=1.6, node_mm=3, segments=16)
    assert report['struts'] == 32
    assert report['nodes'] == 16
    assert report['arcJoints'] == 0
    assert len(shells) == 48
    assert max(report['boundsMM']['size']) == pytest.approx(size, abs=1e-10)
    assert report['sizeResidualMM'] < 1e-10
    assert np.ptp(shells[-1]['vertices'], axis=0) == pytest.approx([3, 3, 3])
    for shell in shells:
        assert_shell(shell)
    assert (model, snapshot) == before


def test_binary_stl_header_count_float32_and_dispatch():
    model = regular('tesseract')
    snapshot = display(model, True)
    result = dispatch(
        {'op': 'prepare-printable-export', 'model': model, 'params': {'display': snapshot, 'segments': 8}}
    )
    raw = base64.b64decode(result['text'])
    count = result['report']['triangleCount']
    assert len(raw) == 84 + 50 * count
    assert raw.startswith(b'Polytope Laboratory printable; millimeter')
    assert struct.unpack('<I', raw[80:84])[0] == count
    data = np.dtype([('normal', '<f4', (3,)), ('vertices', '<f4', (3, 3)), ('attribute', '<u2')])
    triangles = np.frombuffer(raw, dtype=data, offset=84)
    assert max(np.ptp(triangles['vertices'].reshape((-1, 3)), axis=0)) == pytest.approx(100, abs=1e-5)
    assert np.isfinite(triangles['normal']).all()
    assert (triangles['attribute'] == 0).all()
    start = 0
    for length in [32] * 32 + [48] * 16:
        values = triangles[start : start + length]['vertices'].astype(float)
        points, indices = np.unique(values.reshape((-1, 3)), axis=0, return_inverse=True)
        assert_shell({'vertices': points, 'triangles': indices.reshape((-1, 3))})
        normal = np.cross(values[:, 1] - values[:, 0], values[:, 2] - values[:, 0])
        assert (np.einsum('ij,ij->i', normal, triangles[start : start + length]['normal']) > 0).all()
        start += length
    assert start == count


def test_3mf_core_zip_relationships_units_objects_and_triangle_indices():
    model = regular('cube')
    result = prepare_printable(model, display(model), format='3mf', segments=8)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(result['text']))) as z:
        assert set(z.namelist()) == {'[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model'}
        rel = ET.fromstring(z.read('_rels/.rels'))[0]
        assert rel.attrib['Target'] == '/3D/3dmodel.model'
        assert '3dmodel' in rel.attrib['Type']
        assert len(ET.fromstring(z.read('[Content_Types].xml'))) == 2
        root = ET.fromstring(z.read('3D/3dmodel.model'))
        assert root.attrib['unit'] == 'millimeter'
        ns = {'m': CORE}
        objects = root.findall('m:resources/m:object', ns)
        assert len(objects) - 1 == result['report']['shellCount'] == 20
        items = root.findall('m:build/m:item', ns)
        assert len(items) == 1 and items[0].attrib['objectid'] == objects[-1].attrib['id']
        assert {c.attrib['objectid'] for c in objects[-1].findall('m:components/m:component', ns)} == {
            o.attrib['id'] for o in objects[:-1]
        }
        total = 0
        for obj in objects[:-1]:
            vertices = obj.findall('m:mesh/m:vertices/m:vertex', ns)
            triangles = obj.findall('m:mesh/m:triangles/m:triangle', ns)
            total += len(triangles)
            assert all(0 <= int(i) < len(vertices) for t in triangles for i in t.attrib.values())
        assert total == result['report']['triangleCount']


def test_star_winding_filled_panels_are_closed_per_patch_and_grouped_by_face():
    model = regular('small-stellated-dodecahedron')
    script = "import {buildFaceSurfaces} from './ui/face-fill.mjs';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(buildFaceSurfaces(JSON.parse(s))));"
    filled = json.loads(
        subprocess.run(
            ['node', '--input-type=module', '-e', script],
            input=json.dumps(model),
            capture_output=True,
            text=True,
            check=True,
            cwd=Path(__file__).resolve().parents[1],
        ).stdout
    )
    assert filled['diagnostics'] == []
    snapshot = display(model)
    snapshot.update(
        triangles=[t['points'] for t in filled['triangles']], face_ids=[t['face'] for t in filled['triangles']]
    )
    shells, report = build_printable(model, snapshot, mode='panels', thickness_mm=1.6, size_mm=80)
    assert report['panels'] == len(filled['triangles'])
    assert len({s['name'].split('_panel_')[0] for s in shells}) == len(model['faces'])
    assert max(report['boundsMM']['size']) == pytest.approx(80, abs=1e-10)
    for shell in shells:
        assert_shell(shell)
        assert len(shell['triangles']) == 8
        assert np.linalg.norm(shell['vertices'][3] - shell['vertices'][0]) == pytest.approx(1.6)
    obj = prepare_printable(model, snapshot, mode='panels', format='obj')['text']
    assert obj.count('\ng face_') == len(shells)


def test_thin_strut_duplicate_degenerate_near_coincidence_warnings_and_arc_joints():
    model = regular('cube')
    snapshot = display(model)
    a, b = snapshot['edges'][0]
    middle = ((np.array(a) + b) / 2 + np.array([0.1, 0.15, 0.1])).tolist()
    snapshot['edges'][0:1] = [[a, middle], [middle, b]]
    snapshot['edges'] += [[b, middle], [a, a], [(np.array(a) + 1e-5).tolist(), (np.array(b) + 1e-5).tolist()]]
    shells, report = build_printable(model, snapshot, strut_mm=1, segments=8)
    assert report['arcJoints'] == 3
    assert any('1.2 mm' in s for s in report['warnings'])
    assert any('Skipped 2 duplicate' in s for s in report['warnings'])
    assert any('nearly coincide' in s for s in report['warnings'])
    for shell in shells:
        assert_shell(shell)


def test_convex_solid_and_ascii_stl_keep_the_existing_domain():
    model = regular('cube')
    snapshot = display(model)
    shells, report = build_printable(model, snapshot, mode='solid', size_mm=50)
    assert len(shells) == 1
    assert_shell(shells[0])
    assert report['boundsMM']['size'] == pytest.approx([50] * 3)
    text = prepare_printable(model, snapshot, mode='solid', ascii_stl=True)['text']
    assert text.startswith('solid solid\n') and text.endswith('endsolid solid\n')
    assert text.count('facet normal') == 12
    for source in [regular('tesseract')]:
        with pytest.raises(GeometryError, match='Solid requires'):
            build_printable(source, display(source, source['dimension'] == 4), mode='solid')
    star = regular('small-stellated-dodecahedron')
    shells, report = build_printable(star, display(star), mode='solid')
    assert report['solidPolicy'] == 'outer surface solid'
    assert_shell(shells[0])


@pytest.mark.parametrize(
    'options',
    [
        {'size_mm': 0},
        {'strut_mm': float('nan')},
        {'node_mm': True},
        {'segments': 9},
        {'segments': 128},
        {'mode': 'base'},
        {'size_mm': 2, 'node_mm': 3},
    ],
)
def test_invalid_dimensions_quality_and_too_small_target_refused(options):
    model = regular('cube')
    with pytest.raises(GeometryError):
        build_printable(model, display(model), **options)


def test_nonfinite_and_output_resource_bounds_refused():
    model = regular('cube')
    snapshot = display(model)
    snapshot['nodes'][0][0] = float('inf')
    with pytest.raises(GeometryError, match='finite'):
        build_printable(model, snapshot)
    snapshot = display(model)
    snapshot['edges'] = snapshot['edges'] * 10000
    with pytest.raises(GeometryError, match='bound'):
        build_printable(model, snapshot)
    with pytest.raises(GeometryError, match='formats'):
        prepare_printable(model, display(model), format='ply')
