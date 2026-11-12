import base64
from collections import Counter
from copy import deepcopy
from itertools import combinations, product
import io
import json
import struct
import xml.etree.ElementTree as ET
import zipfile
import numpy as np
import pytest
from scipy.optimize import linprog
from scipy.spatial import ConvexHull, HalfspaceIntersection
from engine.compound_catalog import load_compound_model
from engine.compounds import add_models, extract_component
from engine.generators import regular, generate
from engine.geometry import GeometryError, hull
from engine.interchange import validate_glb
from engine.printable_export import build_printable, prepare_printable, CORE
from engine.solid_print_formats import MATERIAL
from engine.solid_printing import triangulate, volume, qualify_solid, _unexpected_intersections
from engine.server import dispatch


def display(m):
    return {'nodes': deepcopy(m['vertices']), 'edges': [], 'triangles': [], 'solid_eligible': True}


def solid(m, **options):
    return build_printable(m, display(m), mode='solid', **options)


def check(shells, report):
    total = 0.0
    for s in shells:
        p = s['vertices']
        t = s['triangles']
        edges = Counter((int(a), int(b)) for tri in t for a, b in zip(tri, np.roll(tri, -1)))
        assert all(n == 1 and edges[b, a] == 1 for (a, b), n in edges.items())
        assert np.min(np.linalg.norm(np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]]), axis=1)) > 0
        assert volume(p, t) > 0
        total += volume(p, t)
        assert len(s['sourceFaceIds']) == len(t) == len(s['colors'])
    assert total == pytest.approx(report['volumeMM3'], rel=1e-12)
    assert report['sizeResidualMM'] < 1e-10
    assert report['validation']['edgeManifold'] and report['validation']['vertexManifold']


def test_small_stellated_known_augmented_dodecahedron_formula():
    m = regular('small-stellated-dodecahedron')
    before = deepcopy(m)
    p = np.asarray(m['vertices'])
    size = float(np.ptp(p, axis=0).max())
    shells, r = solid(m, size_mm=size)
    # MathWorld's augmented unit-core dodecahedron convention, not the
    # self-crossing pentagram edge. Core edge = pentagram edge / phi**3.
    source_edge = np.linalg.norm(p[m['edges'][0][0]] - p[m['edges'][0][1]])
    core_edge = source_edge * (np.sqrt(5) - 2)
    expected = 5 / 4 * (7 + 3 * np.sqrt(5)) * core_edge**3
    assert r['volumeMM3'] == pytest.approx(expected, rel=2e-12)
    assert r['triangleCount'] == 60 and r['shellCount'] == 1
    assert r['surfaceDiagnostics']['maxWindingResidual'] < 1e-7
    check(shells, r)
    assert m == before


def test_great_stellated_volume_by_independent_icosahedron_and_twenty_pyramids():
    m = regular('great-stellated-dodecahedron')
    p = np.asarray(m['vertices'])
    size = float(np.ptp(p, axis=0).max())
    shells, r = solid(m, size_mm=size)
    # Symmetry gives 20 congruent pyramids on an icosahedral core. The inner
    # triangle edge is the shortest boundary edge of each pentagram's fill.
    phi = (1 + np.sqrt(5)) / 2
    source_edge = np.linalg.norm(p[m['edges'][0][0]] - p[m['edges'][0][1]])
    core_edge = source_edge / phi**3
    core_volume = 5 * (3 + np.sqrt(5)) / 12 * core_edge**3
    height = np.sqrt((phi * core_edge) ** 2 - core_edge**2 / 3)
    expected = core_volume + 20 * (np.sqrt(3) / 4 * core_edge**2) * height / 3
    assert r['volumeMM3'] == pytest.approx(expected, rel=2e-12)
    assert r['triangleCount'] == 60
    check(shells, r)


def test_stella_octangula_union_is_half_cube_and_not_sum_of_overlapping_tetrahedra():
    m = load_compound_model('compound-stella-octangula')
    shells, r = solid(m, size_mm=80)
    # Each tetrahedron occupies cube/3; their common octahedron occupies cube/6.
    assert r['volumeMM3'] == pytest.approx(80**3 * (2 / 3 - 1 / 6), rel=2e-12)
    assert r['shellCount'] == 1 and r['triangleCount'] == 24
    check(shells, r)


def intersection_volume(parts):
    equations = np.concatenate([ConvexHull(p).equations for p in parts])
    a = equations[:, :3]
    b = equations[:, 3]
    center = linprog(
        [0, 0, 0, -1], A_ub=np.column_stack((a, np.ones(len(a)))), b_ub=-b, bounds=[(None, None)] * 4, method='highs'
    )
    if not center.success or center.x[3] < 1e-9:
        return 0.0
    vertices = HalfspaceIntersection(equations, center.x[:3]).intersections
    return ConvexHull(vertices).volume


@pytest.mark.parametrize('key', ['compound-five-tetrahedra-a', 'compound-five-tetrahedra-b'])
def test_five_tetrahedra_concave_faces_against_independent_inclusion_exclusion(key):
    m = load_compound_model(key)
    p = np.asarray(m['vertices'])
    size = float(np.ptp(p, axis=0).max())
    parts = [np.asarray(extract_component(m, c['id'])['vertices']) for c in m['components']]
    expected = sum(
        (-1) ** (n + 1) * sum(intersection_volume(group) for group in combinations(parts, n)) for n in range(1, 6)
    )
    shells, r = solid(m, size_mm=size)
    assert r['volumeMM3'] == pytest.approx(expected, rel=1e-10)
    assert r['triangleCount'] == 180 and r['shellCount'] == 1
    source_colors = m['metadata']['offColors']['faces']
    for s in shells:
        for color, fi in zip(s['colors'], s['sourceFaceIds']):
            row = source_colors[fi]
            expected = [v / (255 if row['encoding'] == 'byte' else 1) for v in row['values']]
            assert color == expected + ([1] if len(expected) == 3 else [])
    check(shells, r)


@pytest.fixture(scope='module')
def miller():
    from engine.stellation import arrangement
    from engine.miller_stellations import enumerate_miller

    m = regular('icosahedron')
    a = arrangement(m, box_scale=10)
    return m, a, enumerate_miller(a, m)


@pytest.mark.parametrize('index', [3, 7, 8, 33])
def test_miller_exposed_region_boundaries_against_disjoint_cell_volume(miller, index):
    from engine.stellation import region_union

    source, a, search = miller
    row = search['candidates'][index - 1]
    m = region_union(a, row['regionIds'], source=source)
    size = float(np.ptp(np.asarray(m['vertices']), axis=0).max())
    shells, r = solid(m, size_mm=size)
    assert len(m['faces']) > 100
    assert r['volumeMM3'] == pytest.approx(row['volume'], rel=1e-9)
    check(shells, r)


def test_near_miss_and_face_surgery_excavation_volume():
    for m in [
        regular('near-miss-chamfered-cube'),
        dispatch(
            {
                'op': 'face-surgery',
                'model': generate('block', sizes=[1, 1, 1]),
                'params': {'face_id': 0, 'piece': 'pyramid', 'mode': 'excavate', 'height': 0.25},
            }
        ),
    ]:
        size = float(np.ptp(np.asarray(m['vertices']), axis=0).max())
        shells, r = solid(m, size_mm=size)
        expected = m['measure']['content'] if m['interpretation'] == 'convex-polytope' else 1 - 0.25 / 3
        assert r['volumeMM3'] == pytest.approx(expected, rel=1e-9)
        check(shells, r)


def test_large_already_embedded_nonconvex_boundary_without_paper_limits():
    from engine.visible_surface import visible_surface

    m = visible_surface(regular('great-icosahedron'))
    assert len(m['faces']) == 180
    p = np.asarray(m['vertices'])
    size = float(np.ptp(p, axis=0).max())
    shells, r = solid(m, size_mm=size)
    assert r['triangleCount'] == 180 and r['shellCount'] == 1
    assert r['volumeMM3'] == pytest.approx(abs(volume(p, np.asarray(m['faces']))), rel=1e-10)
    check(shells, r)


def test_alleged_region_union_with_nested_overlapping_boundaries_is_refused():
    outer = regular('tetrahedron')
    inner = hull(np.asarray(outer['vertices']) * 0.1)
    m = add_models(outer, inner)
    m['interpretation'] = 'polyhedral-region-union'
    m['convexPieces'] = [outer, inner]
    with pytest.raises(GeometryError, match='region-union exterior'):
        solid(m)


def test_disconnected_duplicate_and_nested_components_are_unioned_without_overlap():
    m = regular('tetrahedron')
    other = hull(np.asarray(m['vertices']) + 5)
    for combined, count in [
        (add_models(m, other), 2),
        (add_models(m, deepcopy(m)), 1),
        (add_models(m, hull(np.asarray(m['vertices']) * 0.1)), 1),
    ]:
        shells, r = solid(combined)
        assert len(shells) == r['shellCount'] == count
        check(shells, r)


@pytest.mark.parametrize('key', ['cube', 'tetrahedron', 'dodecahedron'])
def test_hollow_convex_offset_nested_outward_material_and_safe_wall(key):
    m = regular(key)
    shells, r = solid(m, size_mm=100, wall_mm=2)
    assert r['boundaryShellCount'] == 2 and r['shellCount'] == 1
    assert r['volumeMM3'] == pytest.approx(r['outerVolumeMM3'] - r['cavityVolumeMM3'])
    if key == 'cube':
        assert r['volumeMM3'] == pytest.approx(100**3 - 96**3, rel=1e-10)
    check(shells, r)
    result = prepare_printable(m, display(m), mode='solid', wall_mm=2)
    assert result['report']['wallThicknessMM'] == 2


@pytest.mark.parametrize('key,wall', [('cube', 51), ('tetrahedron', 49), ('small-stellated-dodecahedron', 2)])
def test_hollow_unsafe_offsets_are_refused_atomically(key, wall):
    m = regular(key)
    before = deepcopy(m)
    with pytest.raises(GeometryError, match='Hollow'):
        solid(m, wall_mm=wall)
    assert before == m


def test_ear_clipping_retains_collinear_boundary_and_handles_concavity():
    p = np.array([[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]], float)
    triangles = triangulate(p, list(range(len(p))))
    assert len(triangles) == len(p) - 2
    edges = Counter(tuple(sorted((a, b))) for t in triangles for a, b in zip(t, t[1:] + t[:1]))
    assert {e for e, n in edges.items() if n == 1} == {tuple(sorted((i, (i + 1) % len(p)))) for i in range(len(p))}
    assert sum(np.linalg.norm(np.cross(p[b] - p[a], p[c] - p[a])) / 2 for a, b, c in triangles) == pytest.approx(3)


def test_triangle_guard_rejects_crossing_and_coplanar_overlap():
    for p in [
        np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0.1, 0.1, -1], [0.1, 0.1, 1], [0.8, 0.1, 0]]),
        np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0.1, 0.1, 0], [1, 0.1, 0], [0.1, 1, 0]]),
    ]:
        with pytest.raises(GeometryError, match='intersect|overlap|touch'):
            _unexpected_intersections(p, np.array([[0, 1, 2], [3, 4, 5]]))


def test_refuse_4d_partial_distorted_open_and_nonmanifold_sources():
    m = regular('cube')
    d = display(m)
    d['solid_eligible'] = False
    with pytest.raises(GeometryError, match='Solid requires'):
        build_printable(m, d, mode='solid')
    d = display(m)
    d['nodes'][0][0] += 0.1
    with pytest.raises(GeometryError, match='rigid rotation'):
        build_printable(m, d, mode='solid')
    four = regular('tesseract')
    d = display(four)
    d['nodes'] = [p[:3] for p in d['nodes']]
    with pytest.raises(GeometryError, match='Solid requires'):
        build_printable(four, d, mode='solid')
    bad = deepcopy(m)
    bad['interpretation'] = 'generalized-complex'
    bad['faces'].pop()
    with pytest.raises(GeometryError, match='closed'):
        solid(bad)
    shells, _ = solid(m)
    bad = deepcopy(shells)
    bad[0]['triangles'][0] = bad[0]['triangles'][0][::-1]
    with pytest.raises(GeometryError, match='orientation'):
        qualify_solid(bad)


def colored_star():
    m = regular('small-stellated-dodecahedron')
    m['metadata']['offColors'] = {
        'faces': [
            {'encoding': 'byte', 'values': [255, 0, 0, 128] if i % 2 else [0, 0, 255, 255]}
            for i in range(len(m['faces']))
        ]
    }
    return m


def test_3mf_color_group_per_triangle_and_source_alpha():
    m = colored_star()
    result = prepare_printable(m, display(m), mode='solid', format='3mf')
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(result['text']))) as z:
        root = ET.fromstring(z.read('3D/3dmodel.model'))
        ns = {'c': CORE, 'm': MATERIAL}
        assert root.attrib['unit'] == 'millimeter' and root.attrib['requiredextensions'] == 'm'
        group = root.find('c:resources/m:colorgroup', ns)
        palette = [c.attrib['color'] for c in group]
        assert set(palette) == {'#FF000080', '#0000FFFF'}
        triangles = root.findall('.//c:triangles/c:triangle', ns)
        assert len(triangles) == 60
        for t in triangles:
            assert t.attrib['pid'] == group.attrib['id']
            assert t.attrib['p1'] == t.attrib['p2'] == t.attrib['p3']
            assert 0 <= int(t.attrib['p1']) < len(palette)


def test_obj_mtl_and_glb_colors_units_and_binary_stl_volume():
    m = colored_star()
    obj = prepare_printable(m, display(m), mode='solid', format='obj')
    assert obj['text'].startswith('# Polytope Laboratory colored boundary geometry\nmtllib __POLYTOPE_MTL__\n')
    assert obj['text'].count('\nf ') == 60 and obj['text'].count('\nusemtl ') == 60
    assert obj['materials'].count('newmtl ') == 2 and 'd 0.50196078431372548' in obj['materials']
    result = prepare_printable(m, display(m), mode='solid', format='glb')
    raw = base64.b64decode(result['text'])
    validate_glb(raw)
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20 : 20 + length])
    prim = doc['meshes'][0]['primitives'][0]
    assert 'COLOR_0' in prim['attributes']
    bounds = doc['accessors'][prim['attributes']['POSITION']]
    assert max(np.asarray(bounds['max']) - bounds['min']) == pytest.approx(0.1, abs=1e-8)
    stl = prepare_printable(m, display(m), mode='solid')
    raw = base64.b64decode(stl['text'])
    dtype = np.dtype([('normal', '<f4', (3,)), ('p', '<f4', (3, 3)), ('attribute', '<u2')])
    ts = np.frombuffer(raw, dtype=dtype, offset=84)['p'].astype(float)
    p, ids = np.unique(ts.reshape(-1, 3), axis=0, return_inverse=True)
    qualify_solid([{'vertices': p, 'triangles': ids.reshape(-1, 3)}])
    assert volume(p, ids.reshape(-1, 3)) == pytest.approx(stl['report']['volumeMM3'], rel=1e-7)


def test_rotated_float32_display_preserves_source_solid_and_reports_residual():
    from scipy.spatial.transform import Rotation

    m = regular('small-stellated-dodecahedron')
    d = display(m)
    d['nodes'] = (
        (np.asarray(d['nodes']) @ Rotation.from_rotvec([0.2, 0.4, -0.3]).as_matrix() + [2, 3, 4])
        .astype(np.float32)
        .tolist()
    )
    shells, r = build_printable(m, d, mode='solid')
    check(shells, r)
    assert r['displaySimilarityResidual'] < 2e-6
