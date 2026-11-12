from collections import Counter
from copy import deepcopy
import math
import json
import subprocess
import sys
import numpy as np
import pytest
from engine import server
from engine.geometry import GeometryError, identity, validate
from engine.independent_cell_sections import independent_cell_section, LIMITS
from engine.operations import section
from engine.ordinary_cell_sections import ordinary_cell_section
from engine.recipes import run_recipe, replay_document
from engine.formats import save_project, load_file


def product_source(polygon=None):
    # Literal {5/2} x [-1,1] x [-1,1], independent of product/hull code.
    xy = polygon or [[math.cos(2 * math.pi * i / 5), math.sin(2 * math.pi * i / 5)] for i in range(5)]
    order = [0, 2, 4, 1, 3] if polygon is None else list(range(len(xy)))
    n = len(xy)
    vertices = [P + [z] for z in (-1, 1) for P in xy]
    faces = [order[::-1], [i + n for i in order]] + [[a, b, b + n, a + n] for a, b in zip(order, order[1:] + order[:1])]
    edges = sorted({tuple(sorted(E)) for F in faces for E in zip(F, F[1:] + F[:1])})
    lookup = {E: i for i, E in enumerate(edges)}
    nv = len(vertices)
    nf = len(faces)
    source = dict(
        id='literal-pentagram-prism-interval',
        name='Literal pentagram prism times interval',
        dimension=4,
        embeddingDimension=4,
        interpretation='generalized-complex',
        vertices=[P + [w] for w in (-1, 1) for P in vertices],
        edges=list(map(list, edges)) + [[i + nv for i in E] for E in edges] + [[i, i + nv] for i in range(nv)],
        faces=faces + [[i + nv for i in F] for F in faces] + [[a, b, b + nv, a + nv] for a, b in edges],
        cells=[list(range(nf)), list(range(nf, 2 * nf))]
        + [
            [f, f + nf] + [2 * nf + lookup[tuple(sorted(E))] for E in zip(F, F[1:] + F[:1])]
            for f, F in enumerate(faces)
        ],
        metadata={'coordinateUnits': 'cm'},
        numeric={'mode': 'float64-approximate', 'certified': False},
    )
    source['fingerprint'] = identity(source)
    assert validate(source)['passed']
    return source


def world(result):
    return np.asarray(result['origin']) + np.asarray(result['model']['vertices']) @ np.asarray(result['basis']).T


def patch_area(points, cycle):
    a = points[cycle[0]]
    return sum(
        math.sqrt(
            max(
                0.0,
                float((points[b] - a) @ (points[b] - a)) * float((points[c] - a) @ (points[c] - a))
                - float((points[b] - a) @ (points[c] - a)) ** 2,
            )
        )
        / 2
        for b, c in zip(cycle[1:], cycle[2:])
    )


def constants():
    phi = (1 + math.sqrt(5)) / 2
    r = 1 / phi**2
    center = 5 * r * r * math.sin(2 * math.pi / 5) / 2
    algebraic = 5 * math.sin(4 * math.pi / 5) / 2
    length = 2 * math.sin(2 * math.pi / 5)
    return center, algebraic - 2 * center, length, phi


@pytest.mark.parametrize('rule,k', [('nonzero', 1), ('even-odd', 1), ('threshold', 2)])
@pytest.mark.parametrize('depth', [-0.6, 0.137, 0.7])
def test_star_cell_analytic_areas_boundaries_volume_and_winding_regions(rule, k, depth, monkeypatch):
    source = product_source()
    before = deepcopy(source)

    def no_hull(*args, **kwargs):
        raise AssertionError('No hull replacement in cell section')

    monkeypatch.setattr('engine.geometry.hull', no_hull)
    monkeypatch.setattr('engine.operations.hull', no_hull)
    monkeypatch.setattr('engine.filled_sections.hull', no_hull)
    result = independent_cell_section(source, [0, 0, 1, 0], depth, rule, k)
    model = result['model']
    P = world(result)
    assert result['status'] == 'independent-cell-section' and validate(model)['passed']
    assert np.max(abs(P[:, 2] - depth)) < 1e-9 and source == before
    center, lobes, length, phi = constants()
    expected = lobes + center if rule == 'nonzero' else lobes if rule == 'even-odd' else center
    perimeter = 5 * length * (2 / phi**2 if rule == 'nonzero' else 1 if rule == 'even-odd' else 1 / phi**3)
    for c in (0, 1):
        entries = [r for r in result['densityLegend'] if r['sourceCell'] == c]
        assert {r['density']: r['content'] for r in entries} == pytest.approx({1: lobes, 2: center}, abs=1e-9)
        region = next(r for r in result['cellSectionRegions'] if r['sourceCell'] == c)
        assert region['area'] == pytest.approx(expected, abs=1e-9)
        assert sum(patch_area(P, model['faces'][f]) for f in region['outputFaces']) == pytest.approx(expected, abs=1e-9)
        loops = region['boundaryLoops']
        assert len(loops) == (5 if rule == 'even-odd' else 1)
        boundaryLength = sum(np.linalg.norm(P[a] - P[b]) for L in loops for a, b in zip(L, L[1:] + L[:1]))
        assert boundaryLength == pytest.approx(perimeter, abs=1e-8)
        owners = Counter(
            tuple(sorted(E)) for f in region['outputFaces'] for F in [model['faces'][f]] for E in zip(F, F[1:] + F[:1])
        )
        boundary = Counter(tuple(sorted(E)) for L in loops for E in zip(L, L[1:] + L[:1]))
        assert {E for E, count in owners.items() if count == 1} == set(boundary)
        assert set(owners.values()) <= {1, 2} and set(boundary.values()) == {1}
        report = model['metadata']['independentCellSection']['cells'][c]
        assert report['algebraicVolume'] == pytest.approx(2 * (lobes + 2 * center), abs=1e-9)
    assert not result['densityDiagnostics']['globalInteriorAsserted']
    assert result['densityDiagnostics']['maxIntegerResidual'] < 1e-6
    assert result['densityDiagnostics']['partitionResidual'] < 1e-6
    assert model['provenance']['convexified'] is False


@pytest.mark.parametrize('rule,k', [('nonzero', 1), ('even-odd', 1), ('threshold', 2)])
def test_independent_cavalieri_volume_from_emitted_star_prism_patches(rule, k):
    source = product_source()
    areas = []
    for depth in (-0.75, -0.25, 0.25, 0.75):
        result = independent_cell_section(source, [0, 0, 1, 0], depth, rule, k)
        P = world(result)
        cap = next(r for r in result['cellSectionRegions'] if r['sourceCell'] == 0)
        areas.append(sum(patch_area(P, result['model']['faces'][f]) for f in cap['outputFaces']))
    center, lobes, _, _ = constants()
    expected = 2 * (lobes + center if rule == 'nonzero' else lobes if rule == 'even-odd' else center)
    # Midpoint integration is exact for the independently known constant-section
    # prism domain; this is a per-cell check, not an assembled 4D solid claim.
    assert 0.5 * sum(areas) == pytest.approx(expected, abs=1e-9)


def test_cell_references_reconstruct_plane_points_and_own_every_output_entity():
    source = product_source()
    result = independent_cell_section(source, [0.17, 0.23, 0.31, 1], 0.137)
    model = result['model']
    P = world(result)
    reports = model['metadata']['independentCellSection']['cells']
    maps = model['metadata']['elementSourceMaps']
    for point, refs in zip(P, result['sourceReferences']):
        ref = refs[0]
        record = reports[ref['cell']]
        reconstructed = np.asarray(record['origin']) + np.asarray(record['basis']) @ ref['cellCoordinates']
        assert np.linalg.norm(point - reconstructed) < 1e-8
        sourceP = np.asarray(source['vertices'])[record['sourceVertexIds']]
        assert np.linalg.matrix_rank(np.vstack([sourceP - sourceP[0], point - sourceP[0]]), 1e-8) == 3
    for kind in ('vertices', 'edges', 'faces'):
        assert len(maps[kind]) == len(model[kind])
        assert all(len(m['owners']) == 1 and m['owners'][0]['sourceRank'] == 3 for m in maps[kind])
    for f, ref in zip(model['faces'], result['faceSourceReferences']):
        assert all(result['sourceReferences'][v][0]['cell'] == ref['cell'] for v in f)


def test_disconnected_regions_and_local_orientation_invariance():
    U = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]]
    source = product_source(U)
    result = independent_cell_section(source, [0, 1, 0, 0], 2)
    for c in (0, 1):
        region = next(r for r in result['cellSectionRegions'] if r['sourceCell'] == c)
        assert len(region['boundaryLoops']) == 2 and region['area'] == pytest.approx(4)
    star = product_source()
    first = independent_cell_section(star, [0, 0, 1, 0], 0.137)
    for i in range(0, len(star['faces']), 2):
        star['faces'][i].reverse()
    star['fingerprint'] = identity(star)
    second = independent_cell_section(star, [0, 0, 1, 0], 0.137)
    assert [(r['sourceCell'], r['density'], r['regionCount']) for r in first['densityLegend']] == [
        (r['sourceCell'], r['density'], r['regionCount']) for r in second['densityLegend']
    ]
    assert [r['content'] for r in first['densityLegend']] == pytest.approx(
        [r['content'] for r in second['densityLegend']]
    )
    assert [r['area'] for r in first['cellSectionRegions']] == pytest.approx(
        [r['area'] for r in second['cellSectionRegions']]
    )
    with pytest.raises(GeometryError, match='ordinary|cross|intersect|simple'):
        ordinary_cell_section(star, [0, 0, 1, 0], 0.137)


@pytest.mark.parametrize('rule,k', [('nonzero', 1), ('even-odd', 1), ('threshold', 2)])
def test_small_stellated_dodecahedral_prism_side_cells_with_unqualified_global_chain(rule, k):
    from engine.star_polyhedra import kepler_poinsot
    from engine.prisms import polyhedron_prism

    source = polyhedron_prism(kepler_poinsot('small-stellated-dodecahedron'), 2)
    # An explicitly supplied collection of independently closed 3-cells, whose
    # whole 4D boundary is open. Local cell interiors remain well defined.
    source['cells'].pop(0)
    source['fingerprint'] = identity(source)
    with pytest.raises(GeometryError, match='two distinct source cells'):
        section(source, [0, 0, 0, 1], 0.137, section_domain='density')
    result = section(
        source, [0, 0, 0, 1], 0.137, rule, section_domain='density', density_threshold=k, cell_orientation='independent'
    )
    P = world(result)
    center, lobes, length, phi = constants()
    assert len(result['cellSectionRegions']) == 12
    for region in result['cellSectionRegions']:
        c = region['sourceCell']
        record = result['model']['metadata']['independentCellSection']['cells'][c]
        # First face in every side cell is its original regular pentagram cap.
        polygon = np.asarray(source['vertices'])[source['faces'][source['cells'][c][0]]]
        radius = np.linalg.norm(polygon - polygon.mean(0), axis=1)
        assert np.ptp(radius) < 1e-8
        R = float(radius.mean())
        expected = (lobes + center if rule == 'nonzero' else lobes if rule == 'even-odd' else center) * R**2
        assert region['area'] == pytest.approx(expected, rel=1e-8)
        assert sum(patch_area(P, result['model']['faces'][f]) for f in region['outputFaces']) == pytest.approx(
            expected, rel=1e-8
        )
        assert record['algebraicVolume'] == pytest.approx(2 * (lobes + 2 * center) * R**2, rel=1e-8)
        perimeter = sum(np.linalg.norm(P[a] - P[b]) for L in region['boundaryLoops'] for a, b in zip(L, L[1:] + L[:1]))
        assert perimeter == pytest.approx(
            5 * length * R * (2 / phi**2 if rule == 'nonzero' else 1 if rule == 'even-odd' else 1 / phi**3), rel=1e-8
        )


def test_common_polygon_and_polyhedron_prism_constructions_reach_the_named_domain():
    from engine.star_polygons import regular_star_polygon
    from engine.products import polygon_prism
    from engine.prisms import polyhedron_prism

    source = polyhedron_prism(polygon_prism(regular_star_polygon(5, 2), 2), 2)
    result = section(source, [0, 0, 1, 0], 0.137, section_domain='density', cell_orientation='independent')
    center, lobes, _, _ = constants()
    assert result['status'] == 'independent-cell-section'
    assert [r['area'] for r in result['cellSectionRegions'][:2]] == pytest.approx([center + lobes] * 2)


def test_tangent_vertex_edge_empty_and_explicit_coplanar_event_refusals():
    source = product_source()
    n = np.array([0.17, 0.23, 0.31, 1])
    n /= np.linalg.norm(n)
    depth = float(max(np.asarray(source['vertices']) @ n))
    tangent = independent_cell_section(source, n.tolist(), depth)
    assert tangent['status'] == 'degenerate' and tangent['affineDimension'] == 0 and not tangent['model']['faces']
    assert np.max(np.linalg.norm(world(tangent) - world(tangent)[0], axis=1)) < 1e-8
    assert all('vertex' in R[0] for R in tangent['sourceReferences'])
    edgeN = np.array([0.17, 0.23, 0, 1])
    edgeN /= np.linalg.norm(edgeN)
    edgeDepth = float(max(np.asarray(source['vertices']) @ edgeN))
    edge = independent_cell_section(source, edgeN.tolist(), edgeDepth)
    assert edge['status'] == 'degenerate' and edge['affineDimension'] == 1 and edge['model']['edges']
    assert (
        not edge['model']['faces']
        and edge['model']['metadata']['densitySection']['boundaryEdges'] == edge['model']['edges']
    )
    assert independent_cell_section(source, [0, 0, 1, 0], 3)['status'] == 'empty'
    with pytest.raises(GeometryError, match='coplanar'):
        independent_cell_section(source, [0, 0, 1, 0], 1)
    with pytest.raises(GeometryError, match='coplanar'):
        independent_cell_section(source, [1, 0, 0, 0], math.cos(2 * math.pi / 5))


def test_scale_translation_reflection_and_unknown_orientation_policy():
    source = product_source()
    original = independent_cell_section(source, [0, 0, 1, 0], 0.137)
    moved = deepcopy(source)
    translation = np.array([2.0, -3.0, 7.0, 5.0])
    moved['vertices'] = (-3 * np.asarray(source['vertices']) + translation).tolist()
    moved['fingerprint'] = identity(moved)
    result = independent_cell_section(moved, [0, 0, 7, 0], 7 - 3 * 0.137)
    assert [r['content'] for r in result['densityLegend']] == pytest.approx(
        [r['content'] * 9 for r in original['densityLegend']], rel=1e-8
    )
    assert [
        r['algebraicVolume'] for r in result['model']['metadata']['independentCellSection']['cells']
    ] == pytest.approx(
        [r['algebraicVolume'] * 27 for r in original['model']['metadata']['independentCellSection']['cells']], rel=1e-8
    )
    with pytest.raises(GeometryError, match='orientation policies'):
        section(source, cell_orientation='guess')
    with pytest.raises(GeometryError, match='density section domain'):
        section(source, cell_orientation='independent')


def test_open_cell_unowned_geometry_and_work_bounds_refuse_without_mutation(monkeypatch):
    source = product_source()
    opened = deepcopy(source)
    opened['cells'][0].pop()
    opened['fingerprint'] = identity(opened)
    with pytest.raises(GeometryError, match='two distinct incident faces'):
        independent_cell_section(opened, [0, 0, 1, 0], 0.137)
    orphan = deepcopy(source)
    orphan['cells'] = orphan['cells'][:1]
    orphan['fingerprint'] = identity(orphan)
    with pytest.raises(GeometryError, match='unowned source faces'):
        independent_cell_section(orphan, [0, 0, 1, 0], 0.137)
    orphan = deepcopy(source)
    orphan['vertices'].append([9, 9, 9, 9])
    orphan['fingerprint'] = identity(orphan)
    with pytest.raises(GeometryError, match='unowned source vertices'):
        independent_cell_section(orphan, [0, 0, 1, 0], 0.137)
    zero = product_source([[-1, -1], [1, 1], [-1, 1], [1, -1]])
    with pytest.raises(GeometryError, match='zero/unresolved algebraic volume'):
        independent_cell_section(zero, [0, 0, 1, 0], 0.137)
    before = deepcopy(source)
    monkeypatch.setitem(LIMITS, 'arrangementRegions', 1)
    with pytest.raises(GeometryError, match='no partial section'):
        independent_cell_section(source, [0, 0, 1, 0], 0.137)
    assert source == before
    for normal, offset, rule, k in [
        ([False, 0, 1, 0], 0, 'nonzero', 1),
        ([0] * 4, 0, 'nonzero', 1),
        ([0, 0, 1, 0], float('nan'), 'nonzero', 1),
        ([0, 0, 1, 0], 0, 'guess', 1),
        ([0, 0, 1, 0], 0, 'threshold', True),
    ]:
        with pytest.raises(GeometryError):
            independent_cell_section(source, normal, offset, rule, k)


def native_fixture():
    source = product_source()
    view = dict(
        derivedMode='section',
        sectionNormal=[0, 0, 1, 0],
        sectionOffset=0.137,
        coordinateUnit='cm',
        densitySection=dict(enabled=True, rule='even-odd', threshold=1, cellOrientation='independent'),
    )
    state = dict(model=source, view=view, notes='Retain independent star cells')
    document = dict(id='source', states=[state], cursor=0)
    params = dict(
        normal=view['sectionNormal'],
        offset=0.137,
        fill_rule='even-odd',
        section_domain='density',
        density_threshold=1,
        cell_orientation='independent',
    )
    preview = server.dispatch(dict(op='section', model=source, params=params))
    history = run_recipe(document, 'section', params, server.dispatch, 'Promote winding cell section')
    return dict(state=state, document=document, params=params, preview=preview, history=history)


def test_native_dispatch_promotion_undo_redo_save_reopen_replay(tmp_path):
    f = native_fixture()
    document = f['document']
    before = deepcopy(document)
    history = f['history']
    promoted = history['states'][1]
    assert document == before and promoted['model'] == f['preview']['model']
    assert promoted['view']['coordinateUnit'] == 'cm' and 'densitySection' not in promoted['view']
    assert promoted['notes'] == f['state']['notes'] and promoted['view']['derivedMode'] == 'face'
    assert replay_document(history, server.dispatch)['states'][0]['model'] == promoted['model']
    path = tmp_path / 'independent.polyproj'
    save_project(path, dict(format='polytope-laboratory', version=1, active=0, documents=[history]))
    opened = load_file(path)['project']['documents'][0]
    assert opened['states'][0]['view']['densitySection']['cellOrientation'] == 'independent'
    assert opened['states'][1]['model'] == promoted['model']
    opened['cursor'] = 0
    assert opened['states'][opened['cursor']]['model'] == f['state']['model']
    opened['cursor'] = 1
    assert opened['states'][opened['cursor']]['model'] == promoted['model']
    assert replay_document(opened, server.dispatch)['states'][0]['model'] == promoted['model']


def test_reusable_json_lines_worker_recovers_after_unsupported_contact():
    f = native_fixture()
    request = dict(op='section', model=f['state']['model'], params=f['params'])
    bad = {**request, 'params': {**request['params'], 'offset': 1}}
    child = subprocess.run(
        [sys.executable, '-B', 'engine/server.py'],
        input=''.join(json.dumps(r) + '\n' for r in (bad, request)),
        text=True,
        capture_output=True,
        timeout=30,
    )
    assert child.returncode == 0, child.stderr
    responses = [json.loads(line) for line in child.stdout.splitlines()]
    assert not responses[0]['ok'] and 'coplanar' in responses[0]['error'] and responses[1]['ok']
    assert responses[1]['result']['model'] == f['preview']['model']
