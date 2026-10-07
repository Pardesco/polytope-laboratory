"""Literal star cycles, independent radicals, ray winding and component lineage."""
from copy import deepcopy
import json
import math

import numpy as np
import pytest

from engine.compounds import _check_source, add_models, extract_component, remove_component, retrieve_source
from engine.expressions import evaluate
from engine.formats import validate_project
from engine.generators import generate
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.star_polygons import parse_polygon_symbol, regular_star_polygon


def signed_area(points):
    return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(points,points[1:]+points[:1]))/2


def ray_winding(points):
    winding = 0
    for a,b in zip(points,points[1:]+points[:1]):
        cross = a[0]*b[1]-a[1]*b[0]
        if a[1]<=0<b[1] and cross>0:
            winding += 1
        elif b[1]<=0<a[1] and cross<0:
            winding -= 1
    return winding


@pytest.mark.parametrize('d,cycle,winding', [(2,[0,2,4,1,3],2),(3,[0,3,1,4,2],-2),(-2,[0,3,1,4,2],-2),(-3,[0,2,4,1,3],2)])
def test_literal_pentagrams_signed_and_retrograde_order_radical_metrics_and_winding(d,cycle,winding):
    root = math.sqrt(5)
    expected = [[1,0],[(root-1)/4,math.sqrt(10+2*root)/4],[-(root+1)/4,math.sqrt(10-2*root)/4],
                [-(root+1)/4,-math.sqrt(10-2*root)/4],[(root-1)/4,-math.sqrt(10+2*root)/4]]
    result = regular_star_polygon(5,d)
    assert np.allclose(result['vertices'],expected,rtol=0,atol=1e-15)
    assert result['faces']==[cycle] and [len(result[k]) for k in ('vertices','edges','faces','cells')]==[5,5,1,0]
    polygon = [result['vertices'][v] for v in cycle]
    assert ray_winding(polygon)==winding
    info = result['metadata']['regularStarPolygon']
    assert info['n']==5 and info['d']==d and info['symbol']==f'5/{d}'
    assert info['effectiveStep']==d%5 and info['principalSignedStep']==winding and info['originWindingPerCycle']==winding
    area = math.copysign(5*math.sqrt(10-2*root)/8,winding)
    assert signed_area(polygon)==pytest.approx(area) and info['cycleEvidence'][0]['signedAlgebraicArea']==pytest.approx(area)
    assert all(math.dist(result['vertices'][a],result['vertices'][b])==pytest.approx(math.sqrt((5+root)/2)) for a,b in result['edges'])
    assert 'components' not in result and 'measure' not in result and 'facetEquations' not in result
    assert result['interpretation']=='generalized-complex' and not result['numeric']['certified']
    assert result['validation']['passed'] and identity(result)==result['fingerprint']


def test_hexagram_keeps_two_literal_triangles_and_original_angular_vertex_ids():
    result = regular_star_polygon(6,2)
    assert result['faces']==[[0,2,4],[1,3,5]] and len(result['vertices'])==6 and len(result['edges'])==6
    info = result['metadata']['regularStarPolygon']
    assert info['symbol']=='6/2' and info['n']==6 and info['d']==2 and info['componentCount']==2
    assert info['angularVertexIds']==list(range(6)) and info['originWindingPerCycle']==1
    assert result['vertices'][0]==[1,0]
    assert result['vertices'][1]==pytest.approx([1/2,math.sqrt(3)/2])
    assert sorted(len(c['maps']['vertices']) for c in result['components'])==[3,3]
    assert all(ray_winding([result['vertices'][v] for v in f])==1 for f in result['faces'])
    assert all(signed_area([result['vertices'][v] for v in f])==pytest.approx(3*math.sqrt(3)/4) for f in result['faces'])
    assert '6/2'!=regular_star_polygon(3)['metadata']['regularStarPolygon']['symbol']
    _check_source(result)


@pytest.mark.parametrize('n,d', [(6,2),(6,-2),(9,3),(12,4),(15,6),(21,14),(1023,341)])
def test_disconnected_component_snapshots_extraction_and_addition_keep_literal_coordinates_and_full_maps(n,d):
    source = regular_star_polygon(n,d,2.5)
    original = deepcopy(source)
    global_info = source['metadata']['regularStarPolygon']
    assert len(source['components'])==math.gcd(n,abs(d))
    for source_index in (0,1):
        immediate = retrieve_source(source,source_index)
        assert immediate['validation']['passed']
        assert immediate is not source['metadata']['compound']['sourceModels'][source_index]
    components = source['components'] if n<100 else [source['components'][i] for i in (0,len(source['components'])//2,-1)]
    _check_source(source)  # All component maps/ownership validated, not only sampled leaves.
    for component in components:
        leaf = extract_component(source,component['id'])
        maps = component['maps']
        assert leaf['vertices']==[source['vertices'][v] for v in maps['vertices']]
        assert len(leaf['faces'])==1 and len(leaf['edges'])==n//math.gcd(n,abs(d))
        assert leaf['metadata']['regularStarPolygon']['sourceFingerprint']==identity(leaf)
        historical = source
        for index in component['sourcePath']:
            historical=retrieve_source(historical,index)
        assert historical['id']==component['sourceModelId'] and identity(historical)==component['sourceFingerprint']
        assert historical['provenance']['operation']=='regular-star-polygon-cycle'
        assert historical['provenance']['parameters']['n']==n and historical['provenance']['parameters']['d']==d
        assert historical['provenance']['parentPolygon']['globalVertexIds']==maps['vertices']
        assert leaf['vertices']==historical['vertices'] and leaf['edges']==historical['edges'] and leaf['faces']==historical['faces']
    assert global_info['sourceFingerprint']==identity(source) and source==original
    if n<100:
        doubled=add_models(source,source)
        assert len(doubled['components'])==2*len(source['components']) and doubled['vertices']==source['vertices']+source['vertices']
        _check_source(doubled)


def test_component_deletion_retains_identity_and_maps_without_misapplying_generated_source_evidence():
    source=regular_star_polygon(9,3)
    original=deepcopy(source)
    component=source['components'][1]
    result=remove_component(source,component['id'])
    assert [len(result[k]) for k in ('vertices','edges','faces')]==[6,6,2]
    assert [c['id'] for c in result['components']]==[source['components'][0]['id'],source['components'][2]['id']]
    assert result['vertices']==[p for i,p in enumerate(source['vertices']) if i not in component['maps']['vertices']]
    assert result['metadata']['regularStarPolygon']['sourceFingerprint']!=identity(result)
    assert 'generated source only' in result['metadata']['regularStarPolygon']['evidenceScope']
    for current in result['components']:
        leaf=extract_component(result,current['id'])
        assert leaf['metadata']['regularStarPolygon']['sourceFingerprint']==identity(leaf)
    assert source==original


def test_native_project_validation_and_json_roundtrip_preserve_components_cycles_historical_ids():
    source=regular_star_polygon(15,-6)
    original=deepcopy(source)
    project={'format':'polytope-laboratory','version':1,'active':0,
             'documents':[{'id':'literal-star-document','cursor':0,'states':[{'model':source,'view':{},'notes':''}]}]}
    checked=validate_project(json.loads(json.dumps(project,allow_nan=False)))
    restored=checked['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(source) and restored['components']==source['components']
    assert restored['metadata']['compound']==source['metadata']['compound']
    assert restored['metadata']['regularStarPolygon']==source['metadata']['regularStarPolygon']
    for component in restored['components']:
        current=extract_component(restored,component['id'])
        assert current['metadata']['regularStarPolygon']['sourceFingerprint']==identity(current)
    assert source==original


@pytest.mark.parametrize('n', [3,4,5,17,200])
@pytest.mark.parametrize('d_sign', [1,-1])
def test_ordinary_cycle_metrics_and_full_incidence_match_existing_convex_generator(n,d_sign):
    result=regular_star_polygon(n,d_sign,radius=3)
    reference=generate('polygon',n=n,radius=3)
    assert result['vertices']==reference['vertices']
    assert {tuple(e) for e in result['edges']}=={tuple(e) for e in reference['edges']}
    assert canonical_cycle(result['faces'][0])==canonical_cycle(reference['faces'][0])
    assert result['metadata']['regularStarPolygon']['originWindingPerCycle']==d_sign
    assert ray_winding([result['vertices'][v] for v in result['faces'][0]])==d_sign


@pytest.mark.parametrize('n,d', [(5,2),(5,3),(6,2),(9,3),(13,5),(13,-8),(1024,511),(1024,-1023)])
def test_edge_radius_and_literal_positive_symbol_helpers_agree_and_origin_winding_is_independent(n,d):
    result=regular_star_polygon(n,d)
    info=result['metadata']['regularStarPolygon']
    lengths=[math.dist(result['vertices'][a],result['vertices'][b]) for a,b in result['edges']]
    assert max(lengths)-min(lengths)<1e-12
    assert lengths[0]==pytest.approx(info['edgeLength'],rel=1e-10)
    assert evaluate(f'faceRad({n}/{abs(d)})')['value']==pytest.approx(1/lengths[0],rel=1e-10)
    for face,evidence in zip(result['faces'],info['cycleEvidence']):
        points=[result['vertices'][v] for v in face]
        assert ray_winding(points)==info['originWindingPerCycle']
        assert signed_area(points)==pytest.approx(evidence['signedAlgebraicArea'],abs=1e-10)


@pytest.mark.parametrize('n', [2,1025,True,5.0,'5',None])
def test_numerator_domain(n):
    with pytest.raises(GeometryError,match='numerator'):
        regular_star_polygon(n)


@pytest.mark.parametrize('d', [0,5,-5,6,-6,True,2.0,'2',None,math.inf])
def test_step_domain(d):
    with pytest.raises(GeometryError,match='step'):
        regular_star_polygon(5,d)


@pytest.mark.parametrize('n,d', [(4,2),(4,-2),(6,3),(6,-3),(1024,512)])
def test_half_turn_digons_are_explicitly_rejected(n,d):
    with pytest.raises(GeometryError,match='digon'):
        regular_star_polygon(n,d)


@pytest.mark.parametrize('radius', [0,-1,True,'1',math.nan,math.inf,1e101,10**400])
def test_radius_domain(radius):
    with pytest.raises(GeometryError,match='radius'):
        regular_star_polygon(5,2,radius)


@pytest.mark.parametrize('radius', [1e-200,1e-100,.25,1e50,1e100])
def test_extreme_uniform_scale_preserves_source_topology_and_records_area_underflow_honestly(radius):
    source=regular_star_polygon(7,2)
    result=regular_star_polygon(7,2,radius)
    assert result['faces']==source['faces'] and result['edges']==source['edges']
    assert np.allclose(np.asarray(result['vertices'])/radius,source['vertices'],rtol=1e-14,atol=1e-14)
    evidence=result['metadata']['regularStarPolygon']['cycleEvidence'][0]
    if radius==1e-200:
        assert evidence['signedAlgebraicArea'] is None and 'underflow' in evidence['areaStatus']
        assert evidence['signedAlgebraicAreaUnitRadius']>0
    assert validate(json.loads(json.dumps(result,allow_nan=False)))['passed']


def test_unresolved_subnormal_coordinates_are_diagnosed_and_hull_is_never_called(monkeypatch):
    with pytest.raises(GeometryError,match='precision'):
        regular_star_polygon(5,2,5e-324)
    def forbidden(*args,**kwargs):
        raise AssertionError('No hull may replace the supplied star cycles.')
    monkeypatch.setattr('engine.geometry.hull',forbidden)
    monkeypatch.setattr('scipy.spatial.ConvexHull',forbidden)
    assert regular_star_polygon(17,5)['validation']['passed']
    assert regular_star_polygon(12,4)['validation']['passed']


@pytest.mark.parametrize('text,pair', [('5',{'n':5,'d':1}),(' 5 / 2 ',{'n':5,'d':2}),('6/2',{'n':6,'d':2}),
                                    ('5/-3',{'n':5,'d':-3}),('5/+2',{'n':5,'d':2}),('006/002',{'n':6,'d':2})])
def test_literal_parser_preserves_unreduced_pairs_and_explicit_signed_extension(text,pair):
    assert parse_polygon_symbol(text)==pair
    assert evaluate('5/2')['value']==2.5 and parse_polygon_symbol('5/2')=={'n':5,'d':2}


@pytest.mark.parametrize('text', ['',None,5,'5.0','5/2.0','5/(1+1)','10/4/2','5/0','6/3','-5/2','5/- 2','5//2','5e0/2','five/2','5/2; import os','1'*33,'５/２'])
def test_literal_parser_rejects_arithmetic_malformed_and_unbounded_input(text):
    with pytest.raises(GeometryError):
        parse_polygon_symbol(text)
