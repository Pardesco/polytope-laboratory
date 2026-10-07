from copy import deepcopy
from itertools import combinations, product
import json
import math

import numpy as np
import pytest

from engine.zonohedron import zonohedron
from engine.zonohedron_support import zonohedron_support, verify_support_zonohedron
from tests.test_zonohedron import independent_supports
from engine.geometry import GeometryError

AXES = [[1,0,0], [0,1,0], [0,0,1]]


def independent(model, directions, length=1):
    # Reuse independent determinant/support/central-cycle assertions, without
    # using either constructor as the source of expected geometric values.
    adapted = deepcopy(model)
    adapted['metadata']['zonohedron'] = adapted['metadata']['supportZonohedron']
    independent_supports(adapted, directions, length)
    e = model['metadata']['supportZonohedron']
    assert e['endpointSignSumsEnumerated'] == 0
    codes = e['vertexSignVectors']
    for edge_id, (a,b) in enumerate(model['edges']):
        changed = [i for i,(x,y) in enumerate(zip(codes[a],codes[b])) if x != y]
        assert changed == [e['edgeZoneIds'][edge_id]]
    for face, evidence in zip(model['faces'], e['facets']):
        assert set(face) == set(evidence['cycle'])
        zeros = evidence['zeroZoneIds']
        assert len(face) == 2*len(zeros)
        for i, sign in enumerate(evidence['fixedZoneSigns']):
            if sign:
                assert {codes[v][i] for v in face} == {sign}
        assert set(zeros) == {e['edgeZoneIds'][j] for j,edge in enumerate(model['edges'])
                              if set(edge) <= set(face)}


@pytest.mark.parametrize('directions,expected', [
    (AXES, (8,12,6)),
    (AXES+[[1,1,1]], (14,24,12)),
    (AXES+[[1,1,0]], (12,18,8)),
    ([[1,0,0],[1,1,0],[0,0,1]], (8,12,6)),
])
def test_literal_cube_skew_diagonal_and_hexagonal_prism(directions, expected):
    model = zonohedron_support(directions)
    assert tuple(len(model[k]) for k in ('vertices','edges','faces')) == expected
    independent(model, directions)
    assert verify_support_zonohedron(json.loads(json.dumps(model)))['passed']
    if directions == AXES:
        assert set(map(tuple,model['vertices'])) == set(product((-.5,.5),repeat=3))
        assert model['measure']['content'] == pytest.approx(1)
        assert model['measure']['boundaryMeasure'] == pytest.approx(6)
    if directions == AXES+[[1,1,0]]:
        assert sorted(map(len,model['faces'])) == [4]*6+[6]*2
        assert model['measure']['content'] == pytest.approx(1+math.sqrt(2))


@pytest.mark.parametrize('n', [6,12,20,32])
def test_polynomial_boundary_counts_for_moment_curve_no_three_coplanar(n):
    # Every determinant is a nonzero Vandermonde: all support facets have2
    # zero generators, hence n(n-1) quadrilaterals. Euler gives V=F+2.
    directions = [[1,i,i*i] for i in range(n)]
    model = zonohedron_support(directions)
    faces = n*(n-1)
    assert tuple(len(model[k]) for k in ('vertices','edges','faces')) == (faces+2,2*faces,faces)
    assert all(len(face)==4 for face in model['faces'])
    independent(model,directions)


def geometric_signature(model):
    points = [tuple(round(x,9) for x in p) for p in model['vertices']]
    return (set(points), {frozenset(points[v] for v in f) for f in model['faces']})


@pytest.mark.parametrize('directions', [AXES, AXES+[[1,1,0]], AXES+[[1,1,1]],
                                     [[1,i,i*i] for i in range(8)]])
def test_independent_endpoint_sum_implementation_matches_small_boundary(directions):
    assert geometric_signature(zonohedron_support(directions)) == geometric_signature(zonohedron(directions))


@pytest.mark.parametrize('length',[1e-6,.25,7,1e6])
def test_scale_covariance_and_analytic_volume(length):
    directions = AXES+[[1,1,0]]
    model = zonohedron_support(directions,edge_length=length)
    independent(model,directions,length)
    assert model['measure']['content'] == pytest.approx((1+math.sqrt(2))*length**3)


def test_exact_antipodal_dedup_source_order_radius_and_maximum():
    source = [[2,0,0],[-7,0,0],[0,9,0],[0,-3,0],[0,0,.25],[0,0,4],[1,1,1]]
    before = deepcopy(source)
    model = zonohedron_support(source,max_zones=3)
    e = model['metadata']['supportZonohedron']
    assert e['distinctZoneCount'] == 4
    assert [g['sourceDirectionIds'] for g in e['selectedZones']] == [[0,1],[2,3],[4,5]]
    assert geometric_signature(model) == geometric_signature(zonohedron_support(AXES))
    assert source == before
    source[0][0] = 99
    assert e['sourceDirections'] == before
    assert verify_support_zonohedron(model)['passed']


def test_input_order_and_sign_do_not_change_geometry_but_have_distinct_semantic_id():
    source = AXES+[[1,1,1]]
    variants = [source, source[::-1], [[-x for x in p] for p in source]]
    results = [zonohedron_support(s) for s in variants]
    assert all(geometric_signature(m)==geometric_signature(results[0]) for m in results)
    assert len({m['id'] for m in results}) == 3


@pytest.mark.parametrize('directions', [None,(),[],AXES*22,[[0,0,0]]+AXES,
    [[1,0]]+AXES,[[True,0,0]]+AXES,[[float('nan'),0,0]]+AXES,
    [[float('inf'),0,0]]+AXES,[[10**1000,0,0]]+AXES,
    [[1,0,0],[0,1,0],[1,1,0]],AXES+[[1,1e-8,0]],
    [[1,0,0],[0,1,0],[1,1,1e-8]],[[1,i,i*i] for i in range(33)]])
def test_invalid_singular_nearparallel_or_oversized_inputs_refused(directions):
    with pytest.raises(GeometryError):
        zonohedron_support(directions)


@pytest.mark.parametrize('length',[True,None,'1',0,-1,1e-7,1e7,float('nan'),float('inf'),10**1000])
def test_invalid_length_refused(length):
    with pytest.raises(GeometryError):
        zonohedron_support(AXES,edge_length=length)


@pytest.mark.parametrize('maximum',[True,0,-1,2,33,3.0,'3'])
def test_invalid_or_insufficient_zone_maximum_refused(maximum):
    with pytest.raises(GeometryError):
        zonohedron_support(AXES,max_zones=maximum)


def test_full_attribute_evidence_reconstruction_refuses_tampering():
    model = zonohedron_support(AXES+[[1,1,0]])
    assert model == zonohedron_support(AXES+[[1,1,0]])
    changes = [lambda m:m['vertices'][0].__setitem__(0,99),
        lambda m:m['faces'][0].reverse(),
        lambda m:m['metadata']['supportZonohedron']['facets'][0]['zeroZoneIds'].append(0),
        lambda m:m['metadata']['supportZonohedron']['vertexSignVectors'][0].__setitem__(0,0),
        lambda m:m['metadata']['supportZonohedron'].__setitem__('edgeLength',2),
        lambda m:m.__setitem__('id','forged'),lambda m:m['numeric'].__setitem__('certified',True),
        lambda m:m['metadata'].__setitem__('coordinateUnits','mm')]
    for change in changes:
        broken=deepcopy(model)
        change(broken)
        with pytest.raises(GeometryError):
            verify_support_zonohedron(broken)
