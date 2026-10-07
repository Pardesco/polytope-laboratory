"""Independent bounded triangular geodesic fixtures."""
from collections import Counter, defaultdict
from copy import deepcopy
from itertools import combinations
import json
import math

import pytest

from engine.triangular_geodesic import GeodesicRefusal, subdivide_triangular_geodesic as subdivide
from engine.generators import regular
from engine.geometry import validate


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def difference(a, b):
    return [x-y for x, y in zip(a, b)]


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def model(vertices, faces, name='Literal source'):
    edges = sorted({tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:]+face[:1])})
    return {'id': 'literal-source', 'name': name, 'dimension': 3, 'vertices': vertices,
            'edges': [list(edge) for edge in edges], 'faces': faces, 'cells': [], 'metadata': {}}


def icosahedron():
    # Independent coordinates, graph by literal edge distance2, and triangle
    # supports by all triples in that graph. No native hull/catalog is involved.
    phi = (1+math.sqrt(5))/2
    vertices = ([[0, a, b] for a in (-1, 1) for b in (-phi, phi)]
                + [[a, b, 0] for a in (-1, 1) for b in (-phi, phi)]
                + [[b, 0, a] for a in (-1, 1) for b in (-phi, phi)])
    graph = {pair for pair in combinations(range(12), 2) if abs(math.dist(*(vertices[i] for i in pair))-2) < 1e-12}
    faces = []
    for ids in combinations(range(12), 3):
        if all(tuple(sorted(edge)) in graph for edge in combinations(ids, 2)):
            a, b, c = [vertices[i] for i in ids]
            faces.append(list(ids) if dot(cross(difference(b, a), difference(c, a)), a) > 0 else [ids[0], ids[2], ids[1]])
    assert len(graph) == 30 and len(faces) == 20
    return model(vertices, faces, 'Independent icosahedron')


def evidence(result):
    return result['metadata']['triangularGeodesic']


def edge_uses(result):
    uses = defaultdict(list)
    for fi, face in enumerate(result['faces']):
        for a, b in zip(face, face[1:]+face[:1]):
            uses[tuple(sorted((a, b)))].append((fi, a, b))
    assert set(uses) == {tuple(sorted(edge)) for edge in result['edges']}
    assert all(len(items) == 2 for items in uses.values())
    return uses


@pytest.mark.parametrize('frequency', [1, 2, 3, 5])
def test_independent_icosa_counts_seams_valences_and_common_radius(frequency):
    source = icosahedron()
    result = subdivide(source, frequency)
    assert [len(result[k]) for k in ('vertices', 'edges', 'faces')] == [10*frequency**2+2, 30*frequency**2, 20*frequency**2]
    uses = edge_uses(result)
    degrees = Counter(v for edge in result['edges'] for v in edge)
    assert [degrees[i] for i in range(12)] == [5]*12
    assert all(degrees[i] == 6 for i in range(12, len(result['vertices'])))
    assert len(result['vertices'])-len(result['edges'])+len(result['faces']) == 2
    radius = math.sqrt((1+math.sqrt(5))/2+2)
    assert all(abs(math.hypot(*p)-radius) < 1e-12 for p in result['vertices'])
    assert result['vertices'][:12] == source['vertices']
    for fi, face in enumerate(result['faces']):
        a, b, c = [result['vertices'][i] for i in face]
        assert dot(cross(difference(b, a), difference(c, a)), a) > 0
    for items in uses.values():
        assert items[0][1:] == tuple(reversed(items[1][1:]))


@pytest.mark.parametrize('name,counts', [('icosahedron', (12, 30, 20)), ('tetrahedron', (4, 6, 4)), ('octahedron', (6, 12, 8))])
def test_actual_native_defaults_eligible_with_literal_frequency_one(name, counts):
    source = regular(name)
    before = json.loads(json.dumps(source))
    for frequency in (1, 2, 3):
        result = subdivide(source, frequency)
        v, e, f = counts
        assert [len(result[k]) for k in ('vertices', 'edges', 'faces')] == [v+e*(frequency-1)+f*(frequency-1)*(frequency-2)//2,
                                                                        e*frequency+f*3*frequency*(frequency-1)//2,
                                                                        f*frequency**2]
        edge_uses(result)
        assert validate(result)['passed'] is True
        assert evidence(result)['sourceModel'] == before
        if frequency == 1:
            for kind in ('vertices', 'edges', 'faces', 'cells'):
                assert result[kind] == source[kind]
    assert json.loads(json.dumps(source)) == before


def test_arbitrary_literal_winding_and_reversed_edge_storage_preserve_source_and_child_traversal():
    source = icosahedron()
    source['faces'][0].reverse()
    source['edges'] = [edge[::-1] if i%2 else edge for i, edge in enumerate(source['edges'])]
    one = subdivide(source, 1)
    assert one['vertices'] == source['vertices'] and one['edges'] == source['edges'] and one['faces'] == source['faces']
    result = subdivide(source, 4)
    ev = evidence(result)
    assert ev['sourceTraversalGloballyConsistent'] is False
    assert ev['outputTraversalGloballyConsistent'] is False
    assert ev['sphere']['sourceFaceOutwardSigns'][0] == -1
    uses = edge_uses(result)
    for fi, child_ids in enumerate(ev['sourceMaps']['faces']):
        assert len(child_ids) == 16
        for child in child_ids:
            face = result['faces'][child]
            a, b, c = [result['vertices'][i] for i in face]
            assert ev['sphere']['sourceFaceOutwardSigns'][fi]*dot(cross(difference(b, a), difference(c, a)), a) > 0
    for ei, mapped in enumerate(ev['sourceMaps']['edges']):
        chain = ev['sourceEdgeVertexChains'][ei]
        assert chain[0] == source['edges'][ei][0] and chain[-1] == source['edges'][ei][1]
        assert [result['edges'][i] for i in mapped] == [list(pair) for pair in zip(chain, chain[1:])]
        for output_edge in mapped:
            face_owners = {ev['faceSources'][fi]['sourceFaceId'] for fi, _, _ in uses[tuple(sorted(result['edges'][output_edge]))]}
            assert face_owners == set(ev['edgeSources'][output_edge]['sourceFaceIds'])


def test_exact_shared_barycentric_edge_identity_and_every_source_map_is_complete():
    source, frequency = icosahedron(), 6
    result = subdivide(source, frequency)
    ev = evidence(result)
    assert len(ev['vertexSources']) == len(result['vertices'])
    assert len(ev['edgeSources']) == len(result['edges'])
    assert len(ev['faceSources']) == len(result['faces'])
    assert sorted(i for ids in ev['sourceMaps']['faces'] for i in ids) == list(range(len(result['faces'])))
    for ei, chain in enumerate(ev['sourceEdgeVertexChains']):
        assert len(chain) == frequency+1
        for step, vi in enumerate(chain[1:-1], 1):
            record = ev['vertexSources'][vi]
            numerator, denominator = record['parameter']
            assert numerator*frequency == step*denominator
            assert math.gcd(numerator, denominator) == 1
            assert record['sourceEdgeId'] == ei
            owner_faces = [set(result['faces'][i]) for fi in record['sourceFaceIds'] for i in ev['sourceMaps']['faces'][fi]]
            assert sum(vi in face for face in owner_faces) == 6
    for face, record in zip(result['faces'], ev['faceSources']):
        source_face = source['faces'][record['sourceFaceId']]
        for vi, fractions in zip(face, record['cornerBarycentric']):
            assert sum(n/d for n, d in fractions) == pytest.approx(1)
            for n, d in fractions:
                assert math.gcd(n, d) == 1 and frequency%d == 0
            planar = [sum(source['vertices'][i][axis]*n/d for i, (n, d) in zip(source_face, fractions)) for axis in range(3)]
            projected = [x*evidence(result)['sphere']['radius']/math.hypot(*planar) for x in planar]
            assert result['vertices'][vi] == pytest.approx(projected, abs=1e-12)


def test_checked_translated_scaled_sphere_ignores_forged_source_center_metadata():
    source = icosahedron()
    center, scale = [10, -4, 2], 7.125
    source['vertices'] = [[c+scale*x for c, x in zip(center, p)] for p in source['vertices']]
    source['metadata']['sphere'] = {'center': [999, 999, 999], 'radius': .0001}
    result = subdivide(source, 3)
    sphere = evidence(result)['sphere']
    assert sphere['center'] == pytest.approx(center, abs=1e-12)
    assert all(math.dist(p, center) == pytest.approx(sphere['radius'], abs=1e-12) for p in result['vertices'])
    assert evidence(result)['sourceModel']['metadata']['sphere']['center'] == [999, 999, 999]
    assert sphere['relativeRadiusResidual'] <= 1e-9


def test_rgba_units_offline_metadata_and_full_source_snapshot_detach_through_json():
    source = icosahedron()
    colors = [{'encoding': 'byte', 'values': [i, 80, 120, 73]} if i%2 else {'encoding': 'unit', 'values': [.1, .2, .3, .25]} for i in range(20)]
    source['metadata'] = {'coordinateUnits': 'mm', 'fillRule': 'evenodd', 'offColors': {'faces': colors, 'cells': []},
                          'offlineAsset': {'relativePath': 'textures/a.png', 'contentHash': 'literal-source-hash'}, 'notes': 'source'}
    source['measure'] = {'volume': 999, 'certified': True}
    before = deepcopy(source)
    result = subdivide(source, 3)
    restored = json.loads(json.dumps(result))
    assert restored == result
    assert source == before
    assert result['metadata']['coordinateUnits'] == 'mm' and result['metadata']['fillRule'] == 'evenodd'
    for color, owner in zip(result['metadata']['offColors']['faces'], evidence(result)['faceSources']):
        assert color == colors[owner['sourceFaceId']]
    assert evidence(result)['sourceModel'] == before
    assert 'measure' not in result and result['interpretation'] == 'generalized-complex'
    assert result['numeric']['certified'] is False
    assert result['provenance']['solidClassification'] == 'not-run'
    source['vertices'][0][0] = 100
    colors[0]['values'][0] = .9
    result['vertices'][0][0] = 200
    assert evidence(result)['sourceModel'] == before
    assert source['vertices'][0][0] == 100


def test_supplied_coplanar_triangular_convex_faces_are_checked_without_hull_replacement(monkeypatch):
    source = regular('cube')
    triangles = [triangle for face in source['faces'] for triangle in ([face[0], face[1], face[2]], [face[0], face[2], face[3]])]
    source = model(source['vertices'], triangles, 'Triangulated cube')
    import scipy.spatial
    monkeypatch.setattr(scipy.spatial, 'ConvexHull', lambda *a, **k: (_ for _ in ()).throw(AssertionError('Hull must not be used')))
    result = subdivide(source, 2)
    assert len(result['faces']) == 48
    assert evidence(result)['sphere']['checkedSupportGroups'] == 6
    assert evidence(result)['sourceModel']['faces'] == source['faces']
    edge_uses(result)


@pytest.mark.parametrize('frequency', [0, -1, True, 2.5, '2', 129])
def test_bad_frequencies_are_clear_refusals_and_source_unchanged(frequency):
    source = icosahedron()
    before = deepcopy(source)
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, frequency)
    assert raised.value.code == 'frequency'
    assert source == before


def test_not_triangular_not_cospherical_and_malformed_incidence_refuse_then_recover():
    with pytest.raises(GeodesicRefusal, match='ordered triangle'):
        subdivide(regular('cube'), 2)
    source = icosahedron()
    source['vertices'][0] = [x*1.03 for x in source['vertices'][0]]
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 2)
    assert raised.value.code == 'not-cospherical'
    source = icosahedron()
    source['edges'].pop()
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 2)
    assert raised.value.code == 'source-incidence'
    assert len(subdivide(icosahedron(), 2)['vertices']) == 42


def test_ambiguous_origin_affine_rank_and_nonconvex_faces_refuse():
    source = model([[0, 0, 1], [1, 0, 1], [0, 1, 1], [0, 0, 2]], [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]])
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 2)
    assert raised.value.code == 'ambiguous-origin'
    flat = deepcopy(source)
    flat['vertices'] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(flat, 2)
    assert raised.value.code == 'ambiguous-sphere'
    crossed = icosahedron()
    crossed['vertices'][0], crossed['vertices'][7] = crossed['vertices'][7], crossed['vertices'][0]
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(crossed, 2)
    assert raised.value.code in ('not-convex', 'ambiguous-origin')


def test_resource_caps_and_primitive_json_refusals_before_output_allocation():
    source = icosahedron()
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 20)
    assert raised.value.code == 'output-resource'
    source['metadata']['blob'] = 'a'*(16*1024*1024)
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 1)
    assert raised.value.code == 'source-resource'
    for bad in [float('inf'), object()]:
        source = icosahedron()
        source['metadata']['bad'] = bad
        with pytest.raises(GeodesicRefusal):
            subdivide(source, 1)
    source = icosahedron()
    source['vertices'][0][0] = 1e101
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 1)
    assert raised.value.code == 'source-coordinates'


def test_open_disconnected_compound_and_ambient_four_sources_are_explicitly_outside_domain():
    source = icosahedron()
    source['faces'].pop()
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(source, 2)
    assert raised.value.code == 'not-closed'
    first = icosahedron()
    second = deepcopy(first)
    joined = {'dimension': 3, 'vertices': first['vertices']+second['vertices'],
              'edges': first['edges']+[[v+12 for v in edge] for edge in second['edges']],
              'faces': first['faces']+[[v+12 for v in face] for face in second['faces']], 'cells': []}
    with pytest.raises(GeodesicRefusal) as raised:
        subdivide(joined, 2)
    assert raised.value.code == 'not-connected'
    for change in [{'components': []}, {'embeddingDimension': 4}, {'dimension': 4}, {'embeddingDimension': 3.0}]:
        source = {**icosahedron(), **change}
        with pytest.raises(GeodesicRefusal) as raised:
            subdivide(source, 2)
        assert raised.value.code in ('source-components', 'source-dimension')


def test_sphere_projection_is_not_falsely_uniform_and_source_claims_do_not_transfer():
    source = icosahedron()
    source['metadata'].update({'uniform': True, 'family': 'Platonic'})
    source['numeric'] = {'mode': 'rational-exact', 'certified': True}
    result = subdivide(source, 2)
    lengths = [math.dist(*(result['vertices'][i] for i in edge)) for edge in result['edges']]
    assert max(lengths)-min(lengths) > .1
    assert 'uniform' not in result['metadata'] and 'family' not in result['metadata']
    assert result['numeric']['certified'] is False
    assert evidence(result)['sourceModel']['metadata']['uniform'] is True


def test_geometry_equal_attribute_changes_keep_distinct_snapshot_result_identity():
    source = icosahedron()
    first = subdivide(source, 2)
    changed = deepcopy(source)
    changed['metadata']['coordinateUnits'] = 'mm'
    second = subdivide(changed, 2)
    assert first['vertices'] == second['vertices'] and first['faces'] == second['faces']
    assert evidence(first)['sourceFingerprint'] == evidence(second)['sourceFingerprint']
    assert evidence(first)['sourceAttributesFingerprint'] != evidence(second)['sourceAttributesFingerprint']
    assert first['id'] != second['id']
    assert evidence(first)['sourceModel'] == source and evidence(second)['sourceModel'] == changed


def test_largest_supported_icosa_frequency_and_deterministic_identity():
    source = icosahedron()
    result = subdivide(source, 19)
    assert [len(result[k]) for k in ('vertices', 'edges', 'faces')] == [3612, 10830, 7220]
    edge_uses(result)
    assert result == subdivide(source, 19)
