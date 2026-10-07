from copy import deepcopy
import math

import numpy as np
import pytest

from engine.generalized_sections import generalized_section, MAX_FACE_VERTICES
from engine.geometry import GeometryError, identity, validate
from engine.generators import regular
from engine.operations import section, transform
from engine.star_polyhedra import kepler_poinsot


def face_model(points, cycle=None, dimension=3):
    cycle = list(range(len(points))) if cycle is None else cycle
    return {'id': 'face-fixture', 'name': 'Face fixture', 'dimension': dimension, 'embeddingDimension': dimension,
            'interpretation': 'generalized-complex', 'vertices': [list(p)+[0]*(dimension-len(p)) for p in points],
            'edges': [list(sorted((a,b))) for a,b in zip(cycle,cycle[1:]+cycle[:1])], 'faces': [cycle], 'cells': []}


def source_points(result):
    return np.asarray(result['intersection']) @ np.asarray(result['basis']).T + result['origin']


def edge_length(result):
    p = np.asarray(result['model']['vertices'])
    return sum(float(np.linalg.norm(p[a]-p[b])) for a,b in result['model']['edges'])


def test_concave_face_slice_retains_two_intervals_without_hull_bridge():
    source = face_model([[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3]])
    before = deepcopy(source)
    result = section(source, normal=[0,1,0], offset=2)
    assert result['status'] == 'surface-intersection'
    assert edge_length(result) == pytest.approx(2)
    assert len(result['model']['edges']) == 2
    p = source_points(result)
    intervals = sorted(sorted([p[a,0],p[b,0]]) for a,b in result['model']['edges'])
    assert np.allclose(intervals, [[0,1],[2,3]])
    assert source == before
    assert result['model']['validation']['passed']
    assert result['model']['interpretation'] == 'surface-section'
    assert result['model']['metadata']['fillSemantics'] == 'source-face-intersection'
    assert result['model']['provenance']['convexified'] is False
    assert all(any('edge' in ref for ref in refs) for refs in result['sourceReferences'])


def test_pentagram_slice_nonzero_keeps_center_even_odd_has_hole():
    points = [[math.cos(i*2*math.pi/5),math.sin(i*2*math.pi/5)] for i in range(5)]
    source = face_model(points, [0,2,4,1,3])
    nonzero = section(source,normal=[1,0,0],fill_rule='nonzero')
    parity = section(source,normal=[1,0,0],fill_rule='even-odd')
    def covers_center(result):
        p = source_points(result)
        return any(p[a,1]*p[b,1]<0 for a,b in result['model']['edges'])
    assert covers_center(nonzero)
    assert not covers_center(parity)
    assert edge_length(nonzero) > edge_length(parity)
    assert len(parity['model']['edges']) == 2
    assert nonzero['fillRule'] == 'nonzero' and parity['fillRule'] == 'even-odd'
    # Inner pentagon has radius cos(72)/cos(36). This axis meets its two
    # symmetric sides at y = apothem/cos(18), independently of slice code.
    inner_radius = math.cos(2*math.pi/5)/math.cos(math.pi/5)
    hole_length = 2*inner_radius*math.cos(math.pi/5)/math.cos(math.pi/10)
    assert edge_length(nonzero)-edge_length(parity) == pytest.approx(hole_length)


def test_coplanar_pentagram_keeps_original_winding_and_source_face():
    source = face_model([[math.cos(i*2*math.pi/5),math.sin(i*2*math.pi/5)] for i in range(5)], [0,2,4,1,3])
    result = section(source, normal=[0,0,1], fill_rule='even-odd')
    assert len(result['model']['faces']) == 1
    p = source_points(result)
    cycle = result['model']['faces'][0]
    assert np.allclose(p[cycle],np.asarray(source['vertices'])[source['faces'][0]])
    assert result['faceSourceReferences'] == [{'face':0,'cells':[],'coplanar':True}]
    assert result['model']['metadata']['fillRule'] == 'even-odd'


def test_source_edge_parameters_follow_stored_edge_orientation():
    source = face_model([[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3]])
    source['edges'] = [edge[::-1] for edge in source['edges']]
    result = section(source,normal=[0,1,0],offset=2)
    points = source_points(result)
    original = np.asarray(source['vertices'])
    for point, references in zip(points,result['sourceReferences']):
        for ref in references:
            if 'parameter' in ref:
                a,b = source['edges'][ref['edge']]
                assert np.allclose(point,original[a]+ref['parameter']*(original[b]-original[a]))


def test_coincident_source_ids_keep_winding_without_source_mutation():
    source = face_model([[0,0],[1,0],[1,1],[0,1],[0,0],[1,0],[1,1],[0,1]])
    before = deepcopy(source)
    nonzero = section(source,normal=[1,0,0],offset=.5)
    parity = section(source,normal=[1,0,0],offset=.5,fill_rule='even-odd')
    assert edge_length(nonzero) == pytest.approx(1)
    assert parity['model']['edges'] == []
    assert any(len(refs)>=4 for refs in nonzero['sourceReferences'])
    assert source == before


def test_tangency_and_empty_sections_are_retained():
    source = face_model([[0,0],[2,0],[1,1]])
    tangent = section(source,normal=[0,1,0],offset=1)
    assert tangent['affineDimension'] == 0
    assert len(tangent['intersection']) == 1
    assert tangent['model']['edges'] == []
    boundary = section(source,normal=[0,1,0],offset=0)
    assert edge_length(boundary) == pytest.approx(2)
    assert section(source,normal=[0,1,0],offset=2)['status'] == 'empty'


def test_generalized_cube_surface_curve_has_no_filled_polygon_claim():
    source = regular('cube'); source['interpretation'] = 'generalized-complex'
    result = section(source)
    assert len(result['model']['edges']) == 4
    assert result['model']['faces'] == []
    assert edge_length(result) == pytest.approx(8)
    assert 'measure' not in result['model']
    assert 'no filled-solid' in result['semantics']


def test_two_disconnected_components_stay_separate():
    cube = regular('cube')
    source = deepcopy(cube); source['interpretation'] = 'generalized-complex'
    n = len(source['vertices'])
    source['vertices'] += [[x+5,y,z] for x,y,z in cube['vertices']]
    source['edges'] += [[a+n,b+n] for a,b in cube['edges']]
    source['faces'] += [[v+n for v in f] for f in cube['faces']]
    result = section(source)
    assert len(result['model']['edges']) == 8
    assert edge_length(result) == pytest.approx(16)
    p = source_points(result)
    assert all(abs(p[a,0]-p[b,0])<=2+1e-8 for a,b in result['model']['edges'])


def test_4d_source_cell_references_and_surface_edges():
    source = regular('tesseract'); source['interpretation'] = 'generalized-complex'
    before = identity(source)
    result = section(source)
    assert result['model']['dimension'] == 3
    assert len(result['model']['vertices']) == 8
    assert len(result['model']['edges']) == 12
    assert result['model']['faces'] == []
    assert all(refs and all('face' in ref and ref['cells'] for ref in refs) for refs in result['edgeSourceReferences'])
    assert identity(source) == before


@pytest.mark.parametrize('key', ['small-stellated-dodecahedron','great-dodecahedron','great-stellated-dodecahedron','great-icosahedron'])
def test_named_regular_stars_have_valid_surface_intersections(key):
    source = kepler_poinsot(key)
    before = identity(source)
    result = section(source,normal=[1,2,3],offset=.13)
    assert result['model']['validation']['passed']
    assert result['model']['edges']
    assert identity(source) == before
    p = source_points(result)
    assert np.allclose(p @ (np.array([1,2,3])/math.sqrt(14)),.13)


@pytest.mark.parametrize('scale', [1e-9,1e9])
def test_surface_slices_are_scale_covariant(scale):
    source = regular('cube'); source['interpretation'] = 'generalized-complex'
    moved = transform(source, scale=scale)
    result = section(moved)
    assert len(result['model']['edges']) == 4
    assert edge_length(result)/scale == pytest.approx(8)


def test_convex_section_contract_is_unchanged():
    result = section(regular('cube'),fill_rule='even-odd')
    assert result['status'] == 'full-dimensional'
    assert result['model']['measure']['content'] == pytest.approx(4)


def test_invalid_parameters_and_explicit_face_resource_diagnostics():
    source = face_model([[0,0],[1,0],[0,1]])
    for kwargs in ({'fill_rule':'bad'},{'normal':[0,0,0]},{'offset':float('nan')},{'normal':[1,0]}):
        with pytest.raises(GeometryError):
            generalized_section(source,**kwargs)
    count = MAX_FACE_VERTICES+1
    big = face_model([[math.cos(i*2*math.pi/count),math.sin(i*2*math.pi/count)] for i in range(count)])
    result = generalized_section(big,normal=[1,0,0])
    assert result['diagnostics'][0]['face'] == 0
    assert 'resource limit' in result['diagnostics'][0]['reason']
    assert result['model']['validation']['passed']


@pytest.mark.parametrize('normal_scale', [1e-200,1e200])
def test_normal_direction_is_scale_invariant(normal_scale):
    source = face_model([[0,0],[1,0],[0,1]])
    result = section(source,normal=[normal_scale,0,0],offset=.25)
    assert edge_length(result) == pytest.approx(.75)
