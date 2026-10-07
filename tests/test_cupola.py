"""Independent analytic metrics, literal square fixture and attributed J3/J4/J5."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest
from scipy.spatial import ConvexHull

from engine.catalog import load_catalog_model
from engine.cupola import cupola
from engine.geometry import GeometryError, canonical_cycle, identity, validate


@pytest.mark.parametrize('n,height', [(3,math.sqrt(2/3)), (4,1/math.sqrt(2)), (5,math.sqrt((5-math.sqrt(5))/10))])
def test_regular_face_heights_lengths_counts_and_outward_supports(n, height):
    result = cupola(n)
    points = np.asarray(result['vertices'])
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')] == [3*n,5*n,2*n+2,0]
    assert result['metadata']['cupola']['height'] == pytest.approx(height, abs=1e-14)
    assert max(math.dist(points[a],points[b])-1 for a,b in result['edges']) == pytest.approx(0, abs=2e-14)
    assert min(math.dist(points[a],points[b]) for a,b in result['edges']) == pytest.approx(1, abs=2e-14)
    assert result['validation']['passed'] and result['validation']['eulerCharacteristic'] == 2
    assert result['interpretation'] == 'convex-polytope' and not result['numeric']['certified']
    assert result['metadata']['cupola']['regularFacesWithinFloatTolerance']
    incidence = Counter(tuple(sorted((a,b))) for f in result['faces'] for a,b in zip(f,f[1:]+f[:1]))
    assert set(incidence.values()) == {2}
    for face, equation in zip(result['faces'],result['facetEquations']):
        normal = np.asarray(equation[:3])
        assert np.dot(np.cross(points[face[1]]-points[face[0]],points[face[2]]-points[face[0]]),normal) > 0
        residual = points @ normal+equation[3]
        assert max(abs(residual[face])) < 1e-13 and max(residual) < 1e-13
        assert all(residual[v]<-1e-4 for v in range(len(points)) if v not in face)
    assert result['fingerprint'] == identity(result)


def test_square_cupola_matches_hand_written_ring_vertices_and_faces():
    # Upper cardinal points; lower alternating combinations of a,b. No trig fixture.
    a, b, h = (1+math.sqrt(2))/2, 1/2, 1/math.sqrt(2)
    lower = [[a,-b],[a,b],[b,a],[-b,a],[-a,b],[-a,-b],[-b,-a],[b,-a]]
    expected = [[1/math.sqrt(2),0,h/2],[0,1/math.sqrt(2),h/2],[-1/math.sqrt(2),0,h/2],[0,-1/math.sqrt(2),h/2]]
    expected += [[x,y,-h/2] for x,y in lower]
    result = cupola(4)
    assert np.allclose(result['vertices'],expected,rtol=0,atol=2e-15)
    assert result['faces'] == [[0,1,2,3],[11,10,9,8,7,6,5,4], [0,4,5],[1,6,7],[2,8,9],[3,10,11],
                               [0,5,6,1],[1,7,8,2],[2,9,10,3],[3,11,4,0]]


@pytest.mark.parametrize('n,height', [(3,2), (4,0.4), (5,3), (6,1), (7,1), (19,3), (128,1)])
def test_explicit_height_rectangles_triangle_metrics_and_independent_hull(n, height):
    result = cupola(n, edge_length=2, height=height)
    assert result['validation']['passed']
    assert not result['metadata']['cupola']['regularFacesWithinFloatTolerance']
    points = np.asarray(result['vertices'])
    roles = result['metadata']['cupola']['faceRoles']
    triangle_lengths = []
    for f in roles['triangles']:
        p = points[result['faces'][f]]
        lengths = [np.linalg.norm(p[(i+1)%3]-p[i]) for i in range(3)]
        assert lengths[0] == pytest.approx(lengths[2])
        assert lengths[1] == pytest.approx(2)
        triangle_lengths.append(lengths[0])
    for f in roles['rectangles']:
        p = points[result['faces'][f]]
        vectors = np.roll(p,-1,axis=0)-p
        assert abs(np.dot(vectors[0],vectors[1])) < 1e-10
        assert np.allclose(vectors[0],-vectors[2],atol=1e-12)
        assert np.linalg.norm(vectors[1]) == pytest.approx(2)
        assert np.linalg.norm(vectors[0]) == pytest.approx(triangle_lengths[0])
    assert len(set(np.round(triangle_lengths,10))) == 1
    # Qhull appears only in independent testing; supplied facet groups match its supports.
    independent = ConvexHull(points)
    supports = set()
    for equation in independent.equations:
        supports.add(frozenset(np.flatnonzero(abs(points @ equation[:3]+equation[3])<1e-8)))
    assert supports == {frozenset(f) for f in result['faces']}


@pytest.mark.parametrize('n', [6,7,128])
def test_impossible_positive_regular_face_height_requires_explicit_height(n):
    with pytest.raises(GeometryError,match='only for n=3,4,5'):
        cupola(n)


@pytest.mark.parametrize('value', [2,129,-1,True,4.0,'4',None])
def test_strict_bounded_integral_side_count(value):
    with pytest.raises(GeometryError,match='side count'):
        cupola(value)


@pytest.mark.parametrize('value', [0,-1,True,'1',math.nan,math.inf,1e101,10**400])
def test_ring_edge_numeric_domain(value):
    with pytest.raises(GeometryError,match='ring edge length'):
        cupola(4,edge_length=value)


@pytest.mark.parametrize('value', [0,-1,True,'1',math.nan,math.inf,1e101,10**400])
def test_explicit_height_numeric_domain(value):
    with pytest.raises(GeometryError,match='height'):
        cupola(4,height=value)


def test_resource_radius_limit_and_unresolved_aspect_ratios():
    with pytest.raises(GeometryError,match='radius'):
        cupola(128,edge_length=1e100,height=1e100)
    for height in (1e-100,1e100):
        with pytest.raises(GeometryError,match='precision|tolerance'):
            cupola(4,height=height)


@pytest.mark.parametrize('scale', [1e-100,0.25,12,1e50])
def test_scaling_preserves_topology_support_and_explicit_source_parameters(scale):
    unit = cupola(5)
    result = cupola(5,edge_length=scale)
    assert result['edges'] == unit['edges'] and result['faces'] == unit['faces']
    assert np.allclose(np.asarray(result['vertices'])/scale,unit['vertices'],rtol=1e-14,atol=1e-14)
    assert result['validation']['passed'] and result['provenance']['parameters'] == {'n':5,'edge_length':scale,'height':None}
    assert 'measure' not in result and 'key' not in result['metadata'] and 'components' not in result
    assert validate(json.loads(json.dumps(result,allow_nan=False)))['passed']


def test_auto_and_equal_explicit_height_geometry_match_but_parameter_mode_retained():
    default = cupola(3)
    explicit = cupola(3,height=default['metadata']['cupola']['height'])
    assert identity(default) == identity(explicit)
    assert explicit['metadata']['cupola']['heightMode'] == 'explicit'
    assert explicit['metadata']['cupola']['regularFacesWithinFloatTolerance']


@pytest.mark.parametrize('n,height', [(3,math.sqrt(2/3)),(4,1/math.sqrt(2)),(5,math.sqrt((5-math.sqrt(5))/10)),(6,1),(11,2.3)])
def test_analytic_parallel_section_volume_against_independent_convex_measure(n,height):
    result = cupola(n,height=height)
    points = np.asarray(result['vertices'])
    # A polytope between two parallel planes is a prismoid. Simpson's exact
    # quadratic section-area rule uses upper, lower and middle cross sections.
    upper_area = n/(4*math.tan(math.pi/n))
    lower_area = 2*n/(4*math.tan(math.pi/(2*n)))
    middle = np.asarray([(points[n+j,:2]+points[j//2,:2])/2 for j in range(2*n)])
    middle_area = abs(np.dot(middle[:,0],np.roll(middle[:,1],-1))-np.dot(middle[:,1],np.roll(middle[:,0],-1)))/2
    expected = height*(upper_area+4*middle_area+lower_area)/6
    assert ConvexHull(points).volume == pytest.approx(expected,rel=1e-12)
    assert 'measure' not in result


def test_generator_never_uses_hull_and_role_maps_partition_source_incidence(monkeypatch):
    def forbidden(*args,**kwargs):
        raise AssertionError('Generator must retain analytic incidence instead of calling a hull.')
    monkeypatch.setattr('engine.geometry.hull',forbidden)
    monkeypatch.setattr('scipy.spatial.ConvexHull',forbidden)
    model = cupola(17,height=2)
    info = model['metadata']['cupola']
    for kind in ('vertex','edge','face'):
        groups = info[kind+'Roles'].values()
        values = [v for group in groups for v in group]
        assert sorted(values) == list(range(len(model[{'vertex':'vertices','edge':'edges','face':'faces'}[kind]])))
    assert [len(info['edgeRoles'][role]) for role in ('upperRing','lowerRing','lateral')] == [17,34,34]


def _metric_incidence_map(source, target, n):
    """Four affinely spanning anchor distances determine vertices and a rigid match."""
    p, q = np.asarray(source['vertices']), np.asarray(target['vertices'])
    dp = np.linalg.norm(p[:,None]-p[None,:],axis=2)
    dq = np.linalg.norm(q[:,None]-q[None,:],axis=2)
    lower = next(f for f in target['faces'] if len(f)==2*n)
    upper = [i for i in range(3*n) if i not in lower]
    anchors = [n,n+1,n+2,0]
    for start in range(2*n):
        for step in (-1,1):
            bottom = [lower[(start+step*i)%(2*n)] for i in range(3)]
            for top in upper:
                candidate = bottom+[top]
                distance = abs(dp[:,anchors,None]-dq[:,candidate].T[None,:,:]).max(axis=1)
                mapping = np.argmin(distance,axis=1)
                if max(distance[np.arange(3*n),mapping]) > 1e-8 or len(set(mapping.tolist())) != 3*n:
                    continue
                if not np.allclose(dp,dq[np.ix_(mapping,mapping)],rtol=0,atol=1e-8):
                    continue
                if {tuple(sorted((int(mapping[a]),int(mapping[b])))) for a,b in source['edges']} != {tuple(sorted(e)) for e in target['edges']}:
                    continue
                if {canonical_cycle([int(mapping[v]) for v in f]) for f in source['faces']} == {canonical_cycle(f) for f in target['faces']}:
                    return mapping
    raise AssertionError('No rigid metric and complete incidence match found.')


@pytest.mark.parametrize('n', [3,4,5])
def test_regular_cases_crosscheck_attributed_johnson_asset_hash_complete_graph_and_metric(n):
    root = Path(__file__).resolve().parents[1]/'engine'/'catalog_data'/'antiprism'
    manifest = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    entry = next(e for e in manifest['entries'] if e['id']==f'J{n}')
    assert entry['name'] == {3:'triangular cupola',4:'square cupola',5:'pentagonal cupola'}[n]
    assert entry['quality']['regularFacesAndEqualEdgesPassed']
    assert hashlib.sha256((root/entry['file']).read_bytes()).hexdigest() == entry['sha256']
    reference = load_catalog_model(entry['key'])
    original = json.dumps(reference,sort_keys=True)
    generated = cupola(n)
    mapping = _metric_incidence_map(generated,reference,n)
    assert len(mapping) == 3*n and json.dumps(reference,sort_keys=True) == original
    assert not generated['provenance'].get('catalogSource')
