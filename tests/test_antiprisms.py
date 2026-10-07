"""Independent octahedron Gram/incidence and raw-step rational antiprism checks."""
from collections import Counter
from copy import deepcopy
from itertools import product
import json
import math

import numpy as np
import pytest

from engine.antiprisms import rational_antiprism
from engine.compounds import extract_component, remove_component
from engine.formats import validate_project
from engine.geometry import GeometryError, canonical_cycle, identity, validate


KINDS = ('vertices','edges','faces','cells')


def counts(model):
    return [len(model[kind]) for kind in KINDS]


def info(model):
    return model['metadata']['rationalAntiprism']


def assert_generalized(model):
    assert model['interpretation']=='generalized-complex' and model['numeric']['certified'] is False
    assert all(key not in model for key in ('measure','facetEquations','facetVertices','rationalFacetEquations'))
    assert validate(model)['passed'] and identity(model)==model['fingerprint']
    assert info(model)['resultSourceFingerprint']==identity(model)
    assert 'uniform' not in info(model)


def assert_partitions(model,g):
    parts=info(model)['componentPartitions'];assert len(parts)==g
    assert 'components' not in model and info(model)['recoverableCompoundComponents'] is False
    for kind in KINDS:
        assert sorted(i for part in parts for i in part['maps'][kind])==list(range(len(model[kind])))
    for part_index,part in enumerate(parts):
        vertices=set(part['maps']['vertices']);edges=set(part['maps']['edges'])
        assert all(set(model[kind][i]) <= vertices for kind in ('edges','faces') for i in part['maps'][kind])
        assert len(vertices)-len(edges)+len(part['maps']['faces'])==2
        if g<16 or part_index in (0,g//2,g-1):
            for operation in (extract_component,remove_component):
                with pytest.raises(GeometryError,match='component ID'):
                    operation(model,part['id'])


def test_ordinary_triangular_antiprism_is_an_octahedron_by_independent_gram_and_full_face_incidence():
    result=rational_antiprism(symbol='3')
    assert counts(result)==[6,12,8,0]
    # A regular octahedron is exactly three orthogonal antipodal pairs. This
    # checks its complete Gram matrix, independent of the generating rings.
    opposite={(0,4),(1,5),(2,3)};p=np.asarray(result['vertices'])
    expected=np.zeros((6,6));np.fill_diagonal(expected,1.5)
    for a,b in opposite:expected[a,b]=expected[b,a]=-1.5
    assert np.allclose(p@p.T,expected,rtol=0,atol=2e-15)
    expected_edges={tuple(sorted((a,b))) for a in range(6) for b in range(a+1,6)}-opposite
    assert {tuple(sorted(edge)) for edge in result['edges']}==expected_edges
    expected_faces={frozenset(vertices) for vertices in product((0,4),(1,5),(2,3))}
    assert {frozenset(face) for face in result['faces']}==expected_faces
    assert all(math.dist(result['vertices'][a],result['vertices'][b])==pytest.approx(math.sqrt(3)) for a,b in result['edges'])
    assert info(result)['height']==pytest.approx(math.sqrt(2))
    assert info(result)['sideTrianglesEquilateralWithinTolerance'] is True
    assert_generalized(result);assert_partitions(result,1)


@pytest.mark.parametrize('symbol,cycle,phase,height', [
    ('5/2',[0,2,4,1,3],2*math.pi/5,5**.25),
    ('5/3',[0,3,1,4,2],3*math.pi/5,1),
    ('5/-2',[0,3,1,4,2],-2*math.pi/5,5**.25),
    ('5/-3',[0,2,4,1,3],-3*math.pi/5,1)])
def test_raw_signed_pentagram_phase_and_independent_radical_metrics_are_not_principal_step_simplified(symbol,cycle,phase,height):
    result=rational_antiprism(symbol=symbol)
    assert counts(result)==[10,20,12,0]
    evidence=info(result);assert evidence['symbol']==symbol and evidence['upperRotationRadians']==phase
    assert evidence['orderedSourceCycles']==[cycle]
    assert result['faces'][:2]==[list(reversed(cycle)),[i+5 for i in cycle]]
    assert result['vertices'][5]==pytest.approx([math.cos(phase),math.sin(phase),height/2])
    assert evidence['height']==pytest.approx(height)
    base=math.sqrt((5+math.sqrt(5))/2)
    assert all(math.dist(result['vertices'][a],result['vertices'][b])==pytest.approx(base) for a,b in result['edges'])
    assert evidence['sourceModel']['metadata']['regularStarPolygon']['d']==int(symbol.split('/')[1])
    assert_generalized(result)


def test_pentagram5_over3_is_geometrically_distinct_from5_over2_even_when_base_geometry_matches():
    regular=rational_antiprism(symbol='5/2');crossed=rational_antiprism(symbol='5/3')
    assert info(regular)['height']!=pytest.approx(info(crossed)['height'])
    assert info(regular)['horizontalSideChord']==pytest.approx(math.sqrt((5-math.sqrt(5))/2))
    assert info(crossed)['horizontalSideChord']==pytest.approx((1+math.sqrt(5))/2)
    assert identity(regular)!=identity(crossed)
    # Principal -2 has the same 2D cycle as +3, but a different raw top phase.
    principal=rational_antiprism(symbol='5/-2')
    assert info(principal)['orderedSourceCycles']==info(crossed)['orderedSourceCycles']
    assert info(principal)['upperRotationRadians']!=info(crossed)['upperRotationRadians']
    assert info(principal)['height']!=pytest.approx(info(crossed)['height'])


@pytest.mark.parametrize('n,d', [(3,1),(5,2),(5,3),(6,2),(9,3),(10,4)])
def test_negative_raw_step_is_a_reflected_literal_model_with_explicit_angular_id_permutation(n,d):
    positive=rational_antiprism(n,d);negative=rational_antiprism(n,-d)
    permutation=[(-i)%n for i in range(n)]+[n+(-i)%n for i in range(n)]
    for i,(x,y,z) in enumerate(positive['vertices']):
        assert negative['vertices'][permutation[i]]==pytest.approx([x,-y,z],abs=1e-14)
    assert {tuple(sorted(permutation[i] for i in edge)) for edge in positive['edges']}=={tuple(sorted(edge)) for edge in negative['edges']}
    assert {canonical_cycle([permutation[i] for i in face]) for face in positive['faces']}=={canonical_cycle(face) for face in negative['faces']}


@pytest.mark.parametrize('d', [2,-2])
def test_unreduced_hexagram_has_two_literal_rotated_octahedron_boundary_partitions(d):
    result=rational_antiprism(6,d);assert counts(result)==[12,24,16,0]
    assert info(result)['symbol']==f'6/{d}'
    assert [part['maps']['vertices'] for part in info(result)['componentPartitions']]==[[0,2,4,6,8,10],[1,3,5,7,9,11]]
    for part in info(result)['componentPartitions']:
        p=np.asarray([result['vertices'][i] for i in part['maps']['vertices']]);gram=p@p.T
        assert np.allclose(np.diag(gram),1.5,atol=1e-14)
        off=gram[~np.eye(6,dtype=bool)]
        assert sorted(off)==pytest.approx([-1.5]*6+[0]*24,abs=1e-14)
        assert len(part['maps']['edges'])==12 and len(part['maps']['faces'])==8
    assert_partitions(result,2);assert_generalized(result)


@pytest.mark.parametrize('base_mode', ['radius','base_edge'])
@pytest.mark.parametrize('side_mode', ['height','side_edge'])
def test_all_four_manual_sizing_modes_agree_in_full_literal_geometry(base_mode,side_mode):
    # For a unit-radius square, e=sqrt(2), q=sqrt(2-sqrt(2)). Set h=2.
    params={base_mode:1 if base_mode=='radius' else math.sqrt(2),
            side_mode:2 if side_mode=='height' else math.sqrt(6-math.sqrt(2))}
    result=rational_antiprism(symbol='4',**params)
    reference=rational_antiprism(4,radius=1,height=2)
    assert np.allclose(result['vertices'],reference['vertices'],rtol=0,atol=1e-14)
    assert result['edges']==reference['edges'] and result['faces']==reference['faces']
    assert info(result)['radius']==pytest.approx(1) and info(result)['height']==pytest.approx(2)
    assert info(result)['sideEdgeLength']==pytest.approx(math.sqrt(6-math.sqrt(2)))
    assert info(result)['baseSizing']==('radius' if base_mode=='radius' else 'base-edge')
    assert info(result)['sideSizing']==('height' if side_mode=='height' else 'side-edge')
    assert info(result)['sideTrianglesEquilateralWithinTolerance'] is False


@pytest.mark.parametrize('n,d', [(3,2),(9,6),(4,3),(5,4),(5,-4),(1024,683)])
def test_impossible_or_flat_equal_triangle_defaults_refuse_but_explicit_height_is_supported(n,d):
    with pytest.raises(GeometryError,match='not real and positive'):
        rational_antiprism(n,d)
    explicit=rational_antiprism(n,d,height=1)
    assert info(explicit)['sideSizing']=='height' and info(explicit)['sideTrianglesEquilateralWithinTolerance'] is False
    assert_generalized(explicit)


@pytest.mark.parametrize('side', [0.5,1])
def test_side_edge_shorter_than_or_equal_to_horizontal_chord_rejects_flat_imaginary_height(side):
    with pytest.raises(GeometryError,match='no real positive'):
        rational_antiprism(3,side_edge=side)


def test_explicit_ulp_boundary_diagnoses_uncertain_height_without_rejecting_resolved_sizing():
    side=math.nextafter(1.0,math.inf)
    with pytest.raises(GeometryError,match='resolvably'):
        rational_antiprism(3,side_edge=side)
    result=rational_antiprism(3,side_edge=math.sqrt(2))
    assert info(result)['height']==pytest.approx(1)
    assert info(result)['sideTrianglesEquilateralWithinTolerance'] is False


@pytest.mark.parametrize('n,d,g', [(1024,1,1),(1023,341,341)])
def test_actual_maximum_ring_and_disconnected_triangular_cycle_sources_stay_bounded(n,d,g):
    result=rational_antiprism(n,d)
    assert counts(result)==[2*n,4*n,2*n+2*g,0]
    assert_partitions(result,g);assert_generalized(result)


def test_per_cycle_rgb_rgba_are_literal_cap_attributes_with_source_snapshot_and_color_inputs_unchanged():
    colors=[{'encoding':'unit','values':[.1,.2,.3,.4]},{'encoding':'byte','values':[20,40,60]}]
    original=deepcopy(colors);result=rational_antiprism(symbol='6/2',cap_colors=colors)
    assert colors==original
    assert result['metadata']['offColors']=={'faces':colors+colors+[None]*12,'cells':[]}
    assert info(result)['sourceModel']['metadata']['offColors']=={'faces':colors,'cells':[]}
    assert info(result)['sourceFingerprint']==identity(info(result)['sourceModel'])
    assert result['provenance']['parameters']['cap_colors']==original
    result['metadata']['offColors']['faces'][0]['values'][0]=.9
    assert info(result)['sourceModel']['metadata']['offColors']['faces'][0]['values']==[.1,.2,.3,.4]
    assert colors==original


def test_source_and_output_maps_match_every_literal_cap_copy_and_connecting_triangle_reference():
    result=rational_antiprism(9,-3);evidence=info(result);source=evidence['sourceModel'];n=9;g=3
    for i,record in enumerate(evidence['maps']['vertices']):
        assert record=={'sourceVertexId':i%n,'layer':i//n}
    for i,edge in enumerate(source['edges']):
        assert evidence['sourceMaps']['edges'][i]==[i,i+n]
        assert result['edges'][i]==edge and result['edges'][i+n]==[v+n for v in edge]
    for i,face in enumerate(source['faces']):
        assert evidence['sourceMaps']['faces'][i]==[i,i+g]
        assert result['faces'][i]==list(reversed(face)) and result['faces'][i+g]==[v+n for v in face]
    for i in range(n):
        following=(i-3)%n
        assert result['faces'][2*g+2*i:2*g+2*i+2]==[[i,following,i+n],[i+n,following,following+n]]
        for record in evidence['maps']['faces'][2*g+2*i:2*g+2*i+2]:
            assert set(source['edges'][record['sourceEdgeId']])=={i,following}
    assert_partitions(result,g)


def test_json_native_project_roundtrip_preserves_signed_source_cycles_partitions_colors_and_provenance():
    result=rational_antiprism(symbol='6/-2',base_edge=2,height=3,cap_colors=[None,{'encoding':'unit','values':[.2,.4,.6,.8]}])
    original=deepcopy(result)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'rational-antiprism-document','cursor':0,'states':[{'model':result,'view':{},'notes':'literal source'}]}]}
    restored=validate_project(json.loads(json.dumps(project,allow_nan=False)))['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(result) and restored['metadata']==result['metadata'] and restored['provenance']==result['provenance']
    assert result==original


@pytest.mark.parametrize('params,message', [
    ({},'requires n'),({'n':5,'symbol':'5/2'},'not both'),({'d':2,'symbol':'5/2'},'not both'),
    ({'n':5.0,'d':2},'numerator'),({'n':True,'d':1},'numerator'),({'n':2},'numerator'),({'n':1025},'numerator'),({'n':10**1000},'numerator'),
    ({'n':5,'d':0},'step'),({'n':5,'d':5},'step'),({'n':5,'d':2.0},'step'),({'n':5,'d':10**1000},'step'),({'n':6,'d':3},'digon'),
    ({'symbol':'5/(1+1)'},'literal'),({'symbol':'5/2','radius':1,'base_edge':2},'not both'),
    ({'n':3,'height':1,'side_edge':2},'not both'),({'n':3,'radius':True},'Radius'),
    ({'n':3,'radius':0},'Radius'),({'n':3,'radius':float('inf')},'Radius'),({'n':3,'radius':10**1000},'Radius'),
    ({'n':3,'base_edge':-1},'Base edge'),({'n':3,'base_edge':10**1000},'Base edge'),({'n':1024,'base_edge':1e100},'Computed radius'),
    ({'n':3,'height':0},'Height'),({'n':3,'height':float('nan')},'Height'),({'n':3,'height':10**1000},'Height'),
    ({'n':3,'side_edge':False},'Side edge'),({'n':3,'side_edge':float('inf')},'Side edge'),({'n':3,'side_edge':10**1000},'Side edge'),
    ({'n':3,'cap_colors':[]},'Cap colors'),({'n':3,'cap_colors':[{'encoding':'unit','values':[0,0,0,2]}]},'channels')])
def test_strict_parameter_and_attribute_domains_are_diagnosed_atomically(params,message):
    before=deepcopy(params)
    with pytest.raises(GeometryError,match=message):
        rational_antiprism(**params)
    # NaN requires a serialized comparison rather than Python number equality.
    assert json.dumps(params,sort_keys=True)==json.dumps(before,sort_keys=True)


@pytest.mark.parametrize('params', [{'n':3,'height':1e-20},{'n':3,'height':1e100},{'n':3,'radius':5e-324}])
def test_unresolved_relative_rank_or_subnormal_coordinates_are_diagnosed(params):
    with pytest.raises(GeometryError,match='numeric|planar|coordinates|height'):
        rational_antiprism(**params)


@pytest.mark.parametrize('scale', [1e-100,1e99])
def test_proportionately_small_and_large_antiprisms_preserve_normalized_geometry(scale):
    result=rational_antiprism(3,radius=scale)
    reference=rational_antiprism(3)
    assert np.allclose(np.asarray(result['vertices'])/scale,reference['vertices'],rtol=1e-14,atol=1e-14)
    assert result['faces']==reference['faces'] and result['edges']==reference['edges']
    assert_generalized(result)


@pytest.mark.parametrize('bound,value', [('MAX_ANTIPRISM_VERTICES',5),('MAX_ELEMENTS',10),('MAX_INCIDENCES',10),
                                        ('MAX_FACE_VERTICES',2),('MAX_COMPONENTS',1),('MAX_PAYLOAD_BYTES',1)])
def test_explicit_resource_caps_are_enforced(monkeypatch,bound,value):
    monkeypatch.setattr('engine.antiprisms.'+bound,value)
    with pytest.raises(GeometryError,match='resource'):
        rational_antiprism(6,2)
