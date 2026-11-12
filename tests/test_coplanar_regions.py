from copy import deepcopy
from itertools import product
import json
import math
import numpy as np
import pytest
from engine.geometry import GeometryError, hull, identity, validate
from engine.planar_union import blend_regions
from engine.compound_blending import merge_compound
from engine.pseudo_uniform import pseudo_uniform
from engine.incidence_truncation import incidence_truncate
from engine.compounds import add_models
from engine.add_dual import add_dual
from engine.generators import regular
from engine.generalized_nets import _triangles_cached, unfold_source, _shell_geometry
from engine.nets import fold_net, net_svg
from engine.server import dispatch
from engine.history import canonical_model
from engine.formats import validate_project, export_model, parse_off


def planar(points, faces):
    return {
        'id': 'planar',
        'name': 'Planar fixture',
        'dimension': 2,
        'embeddingDimension': 2,
        'interpretation': 'generalized-complex',
        'vertices': points,
        'faces': faces,
        'edges': [list(e) for e in sorted({tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:] + f[:1])})],
        'cells': [],
        'metadata': {},
    }


def area(model):
    total = 0
    for face in model['faces']:
        q = np.asarray(model['vertices'])[face]
        total += abs(np.sum(q[:, 0] * np.roll(q[:, 1], -1) - q[:, 1] * np.roll(q[:, 0], -1))) / 2
    return total


def ring():
    points = [[x, y] for x, y in [(0, 0), (3, 0), (3, 3), (0, 3), (1, 1), (2, 1), (2, 2), (1, 2)]]
    return planar(points, [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]])


def test_hole_is_preserved_by_simple_tiles_and_triangulation():
    source = ring()
    before = deepcopy(source)
    result = blend_regions(source, list(range(4)))
    e = result['metadata']['faceEditing']['evidence']
    assert e['holes'] == 1 and result['validation']['passed']
    assert area(result) == pytest.approx(8)
    assert source == before
    for face in result['faces']:
        assert len(face) == len(set(face))
        triangles = _triangles_cached(tuple(tuple(result['vertices'][v]) for v in face))
        for tri in triangles:
            center = np.mean(tri, axis=0)
            assert not (1 < center[0] < 2 and 1 < center[1] < 2)
    assert all(result['metadata']['faceEditing']['sourceMaps']['faces'])


def tube():
    flat = ring()
    p = flat['vertices']
    vertices = [[x, y, z] for z in (0, 1) for x, y in p]
    faces = [f[::-1] for f in flat['faces']] + [[v + 8 for v in f] for f in flat['faces']]
    for cycle in ([0, 1, 2, 3], [4, 7, 6, 5]):
        faces += [[a, b, b + 8, a + 8] for a, b in zip(cycle, cycle[1:] + cycle[:1])]
    source = planar(vertices, faces)
    source['dimension'] = source['embeddingDimension'] = 3
    return source


def test_square_hole_closed_shell_net_fold_and_off_export():
    source = tube()
    result = blend_regions(source, [4, 5, 6, 7])
    _shell_geometry(result)
    assert result['metadata']['faceEditing']['evidence']['holes'] == 1
    net = unfold_source(result, tabs=False)
    assert len(net['faces']) == len(result['faces'])
    assert fold_net(net, 1)['validation']['endpointReconstructed']
    assert '<svg' in net_svg(net)
    assert export_model(result, 'off').startswith('OFF')
    loaded = parse_off(export_model(result, 'off'))
    assert loaded['faces'] == result['faces']
    _shell_geometry(loaded)
    assert export_model(result, 'obj').count('\nf ') == len(result['faces'])
    with pytest.raises(GeometryError, match='convex 3D'):
        export_model(result, 'stl')


def test_two_overlapping_triangles_star_union_has_twelve_boundary_corners():
    source = planar(
        [[0, 2], [-math.sqrt(3), -1], [math.sqrt(3), -1], [0, -2], [math.sqrt(3), 1], [-math.sqrt(3), 1]],
        [[0, 1, 2], [3, 4, 5]],
    )
    result = blend_regions(source, [0, 1])
    assert len(result['faces']) == 1 and len(result['faces'][0]) == 12
    assert area(result) == pytest.approx(4 * math.sqrt(3))
    assert result['metadata']['faceEditing']['faceSources'] == [[0, 1]]


@pytest.mark.parametrize('rule', ['nonzero', 'even-odd'])
def test_self_crossing_pentagram_winding_rules(rule):
    p = [[math.cos(i * 2 * math.pi / 5), math.sin(i * 2 * math.pi / 5)] for i in range(5)]
    # Duplicate star cycles union; independent filling never cancels their winding.
    source = planar(p, [[0, 2, 4, 1, 3], [3, 1, 4, 2, 0]])
    result = blend_regions(source, [0, 1], fill_rule=rule)
    assert result['validation']['passed'] and area(result) > 0
    assert len(result['faces']) == (5 if rule == 'even-odd' else 1)
    if rule == 'even-odd':
        assert area(result) < area(blend_regions(source, [0, 1], fill_rule='nonzero'))


def test_union_color_policy_and_invalid_domains():
    source = ring()
    source['metadata']['offColors'] = {'faces': [{'encoding': 'unit', 'values': [i / 4, 0, 1, 0.4]} for i in range(4)]}
    # Tile representation retains each tile's contributing colors.
    result = blend_regions(source, [0, 1, 2, 3])
    assert all(c['values'][-1] == 0.4 for c in result['metadata']['offColors']['faces'])
    duplicate = planar([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 1, 2, 3], [0, 1, 2, 3]])
    duplicate['metadata']['offColors'] = {'faces': source['metadata']['offColors']['faces'][:2]}
    with pytest.raises(GeometryError, match='different source colors'):
        blend_regions(duplicate, [0, 1])
    result = blend_regions(duplicate, [0, 1], color_policy='first-source')
    assert result['metadata']['offColors']['faces'] == duplicate['metadata']['offColors']['faces'][:1]
    with pytest.raises(GeometryError, match='fill rule'):
        blend_regions(ring(), [0, 1], fill_rule='bogus')
    with pytest.raises(GeometryError, match='distinct valid'):
        blend_regions(ring(), [0, 0])


def test_rotated_embedded_ring_preserves_chart_and_coordinate_units():
    source = ring()
    source['embeddingDimension'] = 4
    source['vertices'] = [[x + 2, y - 3, x + y + 1, x - y] for x, y in source['vertices']]
    source['metadata']['coordinateUnits'] = 'mm'
    result = blend_regions(source, [0, 1, 2, 3])
    e = result['metadata']['faceEditing']['evidence']
    assert result['metadata']['coordinateUnits'] == 'mm' and e['holes'] == 1
    assert e['normalizedOutputArea'] == pytest.approx(e['normalizedBoundaryArea'])
    basis = np.asarray(e['planeBasis'])
    origin = np.asarray(e['planeOrigin'])
    outer = next(q for q in e['boundaryCycles'] if len(q) == 4)
    points = origin + np.asarray(outer) @ basis * e['areaCoordinateScale']
    assert points.shape == (4, 4)
    assert result['validation']['passed']


def test_union_conforms_t_junctions_and_containment_without_hulling():
    source = planar([[0, 0], [2, 0], [2, 1], [0, 1], [1, 1], [1, 2], [0, 2]], [[0, 1, 2, 3], [3, 4, 5, 6]])
    result = blend_regions(source, [0, 1])
    assert area(result) == pytest.approx(3) and len(result['faces']) == 1
    source = planar([[0, 0], [3, 0], [3, 3], [0, 3], [1, 1], [2, 1], [2, 2], [1, 2]], [[0, 1, 2, 3], [4, 5, 6, 7]])
    result = blend_regions(source, [0, 1])
    assert area(result) == pytest.approx(9) and not result['metadata']['faceEditing']['evidence']['holes']
    assert result['metadata']['faceEditing']['faceSources'] == [[0, 1]]


def test_nonplanar_and_resource_domains_refuse_atomically(monkeypatch):
    source = tube()
    before = deepcopy(source)
    with pytest.raises(GeometryError, match='coplanar'):
        blend_regions(source, [0, 4])
    assert source == before
    import engine.planar_union as union

    monkeypatch.setattr(union, 'MAX_CORNERS', 4)
    with pytest.raises(GeometryError, match='128 selected corners'):
        blend_regions(ring(), [0, 1])


def stella():
    p = np.asarray(list(product((-1, 1), repeat=3)))
    return add_models(hull(p[np.prod(p, axis=1) == 1]), hull(p[np.prod(p, axis=1) == -1]))


@pytest.mark.parametrize('source,counts', [(stella, (14, 36, 24)), (lambda: add_dual(regular('cube')), (26, 72, 48))])
def test_compound_merge_expected_outer_surface_counts_and_net(source, counts):
    source = source()
    before = deepcopy(source)
    result = merge_compound(source)
    assert tuple(len(result[k]) for k in ('vertices', 'edges', 'faces')) == counts
    assert result['metadata']['compoundMerge']['closed'] and not result.get('components')
    assert result['metadata']['compoundMerge']['sourceModel'] == before and source == before
    _shell_geometry(result)
    net = unfold_source(result, tabs=False)
    assert fold_net(net, 1)['validation']['endpointReconstructed']


def test_adjacent_cubes_have_coplanar_faces_blended():
    a = regular('cube')
    p = np.asarray(a['vertices'])
    side = np.ptp(p, axis=0)[0]
    b = hull(p + [side, 0, 0])
    result = merge_compound(add_models(a, b))
    assert len(result['faces']) == 6 and len(result['edges']) == 12 and len(result['vertices']) == 8


def test_disconnected_compound_refused():
    a = regular('tetrahedron')
    b = hull(np.asarray(a['vertices']) + 10)
    with pytest.raises(GeometryError, match='single connected'):
        merge_compound(add_models(a, b))


def test_pseudo_uniform_refuses_unresolved_fit_and_unsupported_sources():
    source = regular('cube')
    before = deepcopy(source)
    with pytest.raises(GeometryError, match='remain unresolved'):
        pseudo_uniform(source, max_evaluations=1)
    assert source == before
    with pytest.raises(GeometryError, match='convex 3D'):
        pseudo_uniform(regular('tesseract'))
    with pytest.raises(GeometryError, match='64 constructed'):
        pseudo_uniform(incidence_truncate(source), operation='expand')
    with pytest.raises(GeometryError, match='strictly between'):
        pseudo_uniform(source, amount=0.5)


@pytest.mark.parametrize('seed,operation', [('cube', 'truncate'), ('tetrahedron', 'truncate'), ('cube', 'expand')])
def test_pseudo_uniform_independent_equal_edge_residual(seed, operation):
    source = regular(seed)
    before = deepcopy(source)
    result = pseudo_uniform(source, operation=operation)
    p = np.asarray(result['vertices'])
    e = np.asarray(result['edges'])
    lengths = np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1)
    assert max(abs(lengths / lengths.mean() - 1)) < 1e-7
    assert result['validation']['passed'] and not result['numeric']['certified']
    assert result['metadata']['pseudoUniform']['toleranceMet']
    assert not result['metadata']['pseudoUniform']['uniformityEstablished'] and source == before


@pytest.mark.parametrize(
    'operation,source,params',
    [
        ('blend-regions', tube, {'face_ids': [4, 5, 6, 7]}),
        ('merge-compound', stella, {}),
        ('pseudo-uniform', lambda: regular('tetrahedron'), {}),
    ],
)
def test_dispatch_recipe_replay_and_native_project_roundtrip(operation, source, params):
    document = {
        'id': 'doc',
        'name': 'W48',
        'cursor': 0,
        'states': [{'model': source(), 'view': {'derivedMode': 'section'}, 'notes': 'Keep notes'}],
    }
    response = dispatch(
        {'op': 'recipe-run', 'params': {'document': document, 'operation': operation, 'parameters': params}}
    )
    state = response['states'][-1]
    assert state['notes'] == 'Keep notes'
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': response}})
    assert canonical_model(replay['states'][0]['model']) == canonical_model(state['model'])
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [response]}
    assert (
        validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][-1]['model']['metadata']
        == state['model']['metadata']
    )
