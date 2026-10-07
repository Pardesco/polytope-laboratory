"""Independent FCC fixtures, exact threshold checks and native source maps."""
from copy import deepcopy
from fractions import Fraction as Q
import hashlib
from itertools import product, permutations
import json
import math

import numpy as np
import pytest

import engine.waterman as kernel
from engine.formats import validate_project, save_project, load_file
from engine.geometry import GeometryError, canonical_cycle, identity
from engine.history import canonical_model, _json_bytes
from engine.waterman import waterman_fcc, centered_waterman_root


def info(model):return model['metadata']['watermanFcc']
def counts(model):return tuple(len(model[k]) for k in ('vertices','edges','faces','cells'))


def exact_membership_reference(center,threshold,limit=8):
    # Independent Fraction predicates, with a fixed fixture box rather than the
    # production integer-scaled arithmetic or its computed projection bounds.
    return sorted([list(p) for p in product(range(-limit,limit+1),repeat=3)
                   if sum(p)%2==0 and sum((Q(x)-c)**2 for x,c in zip(p,center))<=threshold])


def test_standard_first_root_matches_independent_cuboctahedron_coordinates_supports_metrics():
    result=centered_waterman_root(1)
    vertices=set(permutations((1,1,0)))|set(permutations((1,-1,0)))|set(permutations((-1,1,0)))|set(permutations((-1,-1,0)))
    actual={tuple(p) for p in result['vertices']}
    assert actual==vertices and counts(result)==(12,24,14,0)
    expected_edges={frozenset((a,b)) for a in vertices for b in vertices if sum((x-y)**2 for x,y in zip(a,b))==2}
    assert {frozenset(tuple(result['vertices'][v]) for v in edge) for edge in result['edges']}==expected_edges
    expected_faces={frozenset(v for v in vertices if v[axis]==sign) for axis in range(3) for sign in (-1,1)}
    expected_faces|={frozenset(v for v in vertices if sum(a*b for a,b in zip(v,signs))==2) for signs in product((-1,1),repeat=3)}
    assert {frozenset(tuple(result['vertices'][v]) for v in face) for face in result['faces']}==expected_faces
    assert result['measure']['content']==pytest.approx(20/3)
    assert result['measure']['boundaryMeasure']==pytest.approx(12+4*math.sqrt(3))
    assert info(result)['selectedPointCount']==13
    interior=info(result)['nonextremeSelectedPointIds']
    assert [info(result)['sourceSnapshot']['coordinates'][v] for v in interior]==[[0,0,0]]
    assert result['numeric']['certified'] is False
    assert info(result)['selectionCertificate']['certified'] is True


def test_second_root_octahedron_preserves_all_nineteen_selected_points_and_nonextreme_face_sites():
    result=centered_waterman_root(2)
    expected={tuple(2*s if axis==i else 0 for axis in range(3)) for i in range(3) for s in (-1,1)}
    assert {tuple(p) for p in result['vertices']}==expected and counts(result)==(6,12,8,0)
    assert info(result)['selectedPointCount']==19 and len(info(result)['nonextremeSelectedPointIds'])==13
    assert result['measure']['content']==pytest.approx(32/3)
    assert result['measure']['boundaryMeasure']==pytest.approx(16*math.sqrt(3))
    assert all(math.dist(result['vertices'][a],result['vertices'][b])==pytest.approx(2*math.sqrt(2)) for a,b in result['edges'])


@pytest.mark.parametrize('center,threshold,vertices,expected_counts,volume',[
    ((1,0,0),1,[(0,0,0),(2,0,0),(1,1,0),(1,-1,0),(1,0,1),(1,0,-1)],(6,12,8,0),Q(4,3)),
    ((Q(1,2),)*3,Q(3,4),[(0,0,0),(0,1,1),(1,0,1),(1,1,0)],(4,6,4,0),Q(1,3)),
    ((0,0,Q(1,2)),Q(5,4),[(-1,0,1),(0,-1,1),(0,0,0),(0,1,1),(1,0,1)],(5,8,5,0),Q(2,3)),
    ((1,0,0),3,[(1+x,y,z) for x,y,z in product((-1,1),repeat=3)],(8,12,6,0),8)])
def test_offset_lattice_fixtures_are_not_recentered_or_rescaled(center,threshold,vertices,expected_counts,volume):
    result=waterman_fcc(threshold,center=center)
    assert {tuple(p) for p in result['vertices']}==set(vertices)
    assert counts(result)==expected_counts and result['measure']['content']==pytest.approx(float(volume))
    assert info(result)['sourceSnapshot']['coordinates']==exact_membership_reference(list(map(Q,center)),Q(threshold))
    assert result['numeric']['certified'] is False


@pytest.mark.parametrize('center,threshold',[
    ((0,0,0),Q(2)),((0,0,0),Q(6)),((Q(1,3),Q(2,5),Q(-1,7)),Q(5,2)),
    ((Q(-7,4),Q(3,2),Q(2,3)),Q(17,3))])
def test_certificate_independently_exhausts_fraction_membership_boundary_and_distance(center,threshold):
    result=waterman_fcc(threshold,center=center)
    data=info(result);source=data['sourceSnapshot'];certificate=data['selectionCertificate']
    assert source['coordinates']==exact_membership_reference(center,threshold)
    distances=[sum((Q(x)-c)**2 for x,c in zip(point,center)) for point in source['coordinates']]
    assert [Q(value) for value in certificate['selectedSquaredDistances']]==distances
    assert certificate['boundarySelectedPointIds']==[i for i,distance in enumerate(distances) if distance==threshold]
    assert all(distance<=threshold for distance in distances)
    assert data['sourceSnapshotSha256']==hashlib.sha256(_json_bytes(source,kernel.MAX_PAYLOAD_BYTES)).hexdigest()
    assert certificate['certified'] and certificate['exhausted']
    assert certificate['doesNotCertify']==['convex hull topology','float64 supports','float64 measures','Stella sequences or 4D variants']


def test_threshold_just_below_shell_is_not_rounded_to_float_shell():
    denominator=10**40
    below=waterman_fcc(Q(4*denominator-1,denominator))
    exact=waterman_fcc(4)
    above=waterman_fcc(Q(4*denominator+1,denominator))
    assert float(Q(4*denominator-1,denominator))==4.0
    assert counts(below)==(12,24,14,0) and info(below)['selectedPointCount']==13
    assert counts(exact)==counts(above)==(6,12,8,0)
    assert info(exact)['selectedPointCount']==info(above)['selectedPointCount']==19
    assert len(info(exact)['selectionCertificate']['boundarySelectedPointIds'])==6
    assert info(below)['selectionCertificate']['boundarySelectedPointIds']==[]
    assert info(above)['selectionCertificate']['boundarySelectedPointIds']==[]


def test_point_vertex_null_maps_and_ordered_face_facet_source_ids_cover_literal_hull():
    result=waterman_fcc(10);data=info(result)
    selected=data['sourceSnapshot']['coordinates']
    used=data['outputVertexToSelectedPoint'];reverse=data['selectedPointToOutputVertex']
    assert used==sorted(used) and len(set(used))==len(result['vertices'])
    assert len(reverse)==len(selected)
    assert [selected[v] for v in used]==result['vertices']
    assert data['nonextremeSelectedPointIds']==[i for i,value in enumerate(reverse) if value is None]
    for output_id,source_id in enumerate(used):assert reverse[source_id]==output_id
    assert sorted(used+data['nonextremeSelectedPointIds'])==list(range(len(selected)))
    assert data['faceSelectedPointCycles']==[[used[v] for v in cycle] for cycle in result['faces']]
    assert data['facetSelectedPointIds']==[[used[v] for v in face] for face in result['facetVertices']]
    assert data['sourceModelId']==result['id'] and data['sourceFingerprint']==identity(result)


def test_even_lattice_translation_retains_literal_frame_and_exact_shell_map():
    unit=waterman_fcc(2)
    shifted=waterman_fcc(2,center=(10,-4,2))
    expected=[[p[0]+10,p[1]-4,p[2]+2] for p in unit['vertices']]
    assert shifted['vertices']==expected and shifted['edges']==unit['edges']
    # A hull cycle's first vertex can change under SVD after translation; cyclic
    # adjacency and reversal equivalence remain the mathematical face identity.
    assert [canonical_cycle(f) for f in shifted['faces']]==[canonical_cycle(f) for f in unit['faces']]
    assert shifted['measure']['content']==pytest.approx(unit['measure']['content'])
    assert info(shifted)['outputVertexToSelectedPoint']==info(unit)['outputVertexToSelectedPoint']


@pytest.mark.parametrize('threshold',[2,Q(2),'2',' 4 / +2 ',{'numerator':6,'denominator':3}])
def test_explicit_rational_forms_reduce_but_preserve_raw_input(threshold):
    original=deepcopy(threshold)
    result=waterman_fcc(threshold,center=[{'numerator':0,'denominator':3},'0/2',Q(0)])
    assert counts(result)==(12,24,14,0)
    assert result['provenance']['parameters']=={'radius_squared':'2','center':['0','0','0']}
    assert result['provenance']['rawInput']['center'][0]=={'kind':'ratio-object','numerator':'0','denominator':'3'}
    assert result['provenance']['rawInput']['center'][1]=={'kind':'literal','literal':'0/2'}
    assert threshold==original


def test_same_point_set_and_geometry_can_have_distinct_exact_parameter_provenance():
    a=waterman_fcc(4);b=waterman_fcc('9/2')
    assert identity(a)==identity(b)
    assert info(a)['sourceSnapshot']['coordinates']==info(b)['sourceSnapshot']['coordinates']
    assert info(a)['sourceSnapshotSha256']!=info(b)['sourceSnapshotSha256']
    assert a['provenance']['parameters']['radius_squared']!=b['provenance']['parameters']['radius_squared']
    assert a['id']!=b['id']


def test_root_wrapper_is_separate_from_legacy_squared_radius_and_has_native_roundtrip(tmp_path):
    from engine.generators import generate
    centered=centered_waterman_root(5);direct=waterman_fcc(10);legacy=generate('waterman',radiusSquared=10)
    assert canonical_model(centered)==canonical_model(direct)==canonical_model(legacy)
    assert info(centered)['authorRoot']==5 and info(centered)['sourceSnapshot']['radiusSquared']=='10'
    assert 'authorRoot' not in info(direct)
    assert legacy['metadata']['radiusSquared']==10 and 'watermanFcc' not in legacy['metadata']
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'waterman','cursor':0,'states':[{'model':centered,'view':{},'notes':'Exact selection, approximate hull'}]}]}
    before=deepcopy(project);path=tmp_path/'waterman.json'
    save_project(path,deepcopy(project))
    restored=load_file(path)['project']['documents'][0]['states'][0]['model']
    assert restored['metadata']==centered['metadata'] and restored['provenance']==centered['provenance']
    assert canonical_model(restored)==canonical_model(centered) and project==before
    assert restored['measure']['content']==pytest.approx(centered['measure']['content'])


@pytest.mark.parametrize('value',[True,False,2.0,math.nan,math.inf,None,[], '1.5','sqrt(2)','1/0','1/-2',
    '1/'+('0'*256)+'1',10**500,Q(1,2**300),{'numerator':True,'denominator':1},
    {'numerator':1,'denominator':False},{'numerator':1,'denominator':-1},
    {'numerator':1,'denominator':0},{'numerator':1,'denominator':1,'extra':1},
    {'numerator':2**300,'denominator':2**300}])
def test_malformed_rational_inputs_reject_before_float_conversion(value):
    with pytest.raises(GeometryError):waterman_fcc(value)


@pytest.mark.parametrize('center',[True,None,{},[],[0,0],[0,0,0,0],[0,0,True],[0,0,.5],
    [0,0,'sqrt(2)'],[0,0,10**500],[0,0,1_000_001]])
def test_center_domain_and_nonmutation(center):
    before=deepcopy(center)
    with pytest.raises(GeometryError):waterman_fcc(2,center=center)
    assert center==before


@pytest.mark.parametrize('root',[True,1.0,'1',Q(1),0,-1,None,10**500])
def test_root_strict_integer_semantics(root):
    with pytest.raises(GeometryError,match='root'):centered_waterman_root(root)


@pytest.mark.parametrize('threshold',[0,-1,'-1/2',Q(1,100)])
def test_nonpositive_or_too_small_ball_domain(threshold):
    with pytest.raises(GeometryError,match='positive|fewer than four'):waterman_fcc(threshold)


def test_unknown_dimensions_lattices_scale_and_colors_are_explicitly_refused():
    for options in ({'colors':[]},{'face_colors':[]},{'dimension':4},{'lattice':'BCC'},{'scale':2}):
        with pytest.raises(GeometryError,match='unsupported'):waterman_fcc(2,**options)
        with pytest.raises(GeometryError,match='unsupported'):centered_waterman_root(1,**options)


def test_common_denominator_and_projection_site_budgets_precede_enumeration(monkeypatch):
    def forbidden(*args,**kwargs):raise AssertionError('No enumeration before resource checks.')
    monkeypatch.setattr(kernel,'product',forbidden)
    with pytest.raises(GeometryError,match='inspected-site'):waterman_fcc(1_000_000)
    with pytest.raises(GeometryError,match='common denominator'):
        waterman_fcc(2,center=[Q(1,2**250),Q(1,3**155),Q(1,5**108)])
    with pytest.raises(GeometryError,match='lattice-coordinate'):waterman_fcc(2,center=(1_000_000,0,0))


def test_selected_point_payload_and_output_limits_are_atomic(monkeypatch):
    with monkeypatch.context() as context:
        context.setattr(kernel,'MAX_SELECTED_POINTS',12)
        with pytest.raises(GeometryError,match='selected-point'):waterman_fcc(2)
    with monkeypatch.context() as context:
        context.setattr(kernel,'MAX_PAYLOAD_BYTES',100)
        with pytest.raises(GeometryError,match='resource'):waterman_fcc(2)
    with monkeypatch.context() as context:
        context.setattr(kernel,'MAX_OUTPUT_VERTICES',11)
        with pytest.raises(GeometryError,match='output vertex'):waterman_fcc(2)


@pytest.mark.parametrize('bad_measure',[0,-1,math.nan,math.inf,5e-324,10**500])
def test_nonfinite_degenerate_or_subnormal_hull_measures_are_not_returned(monkeypatch,bad_measure):
    original=kernel.hull
    def malformed(*args,**kwargs):
        model=original(*args,**kwargs);model['measure']['content']=bad_measure;return model
    monkeypatch.setattr(kernel,'hull',malformed)
    with pytest.raises(GeometryError,match='finite positive normal'):waterman_fcc(2)


def test_native_gate_rejects_incidence_or_attribute_changes_without_mutating_input(monkeypatch):
    native=kernel.validate_project
    for field in ('metadata','vertices'):
        with monkeypatch.context() as context:
            def changed(project):
                result=native(project);model=result['documents'][0]['states'][0]['model']
                if field=='metadata':model['metadata']['watermanFcc']['selectedPointCount']=-1
                else:model['vertices'][0][0]+=1
                return result
            context.setattr(kernel,'validate_project',changed)
            center=[Q(1,2)]*3;before=deepcopy(center)
            with pytest.raises(GeometryError,match='roundtrip changed'):waterman_fcc(Q(3,4),center=center)
            assert center==before


def test_hull_mapping_requires_literal_integer_coordinate_correspondence(monkeypatch):
    original=kernel.hull
    def changed(*args,**kwargs):
        model=original(*args,**kwargs);model['vertices'][0][0]+=.1;return model
    monkeypatch.setattr(kernel,'hull',changed)
    with pytest.raises(GeometryError,match='mapping'):waterman_fcc(2)


def test_native_binding_and_input_evidence_are_detached_plain_json():
    center=[{'numerator':1,'denominator':2}]*3
    before=deepcopy(center);model=waterman_fcc('6/8',center=center)
    assert center==before
    restored=json.loads(json.dumps(model,allow_nan=False))
    assert canonical_model(restored)==canonical_model(model) and restored['metadata']==model['metadata']
    assert restored['numeric']['certified'] is False
    assert 'rationalCoordinates' not in restored and 'certificate' not in restored
    model['vertices'][0][0]+=.1
    assert identity(model)!=info(model)['sourceFingerprint']


def test_large_but_bounded_integer_origin_keeps_original_coordinates_and_native_measure():
    model=waterman_fcc(2,center=(999_990,0,0))
    assert min(point[0] for point in model['vertices'])==999_989
    assert max(point[0] for point in model['vertices'])==999_991
    assert model['measure']['content']==pytest.approx(20/3)
    assert info(model)['sourceSnapshot']['center']==['999990','0','0']


@pytest.mark.parametrize('error',[ValueError('native domain'),OverflowError('native overflow')])
def test_backend_arithmetic_failures_are_structured_and_inputs_stay_untouched(monkeypatch,error):
    def failed(*args,**kwargs):raise error
    monkeypatch.setattr(kernel,'hull',failed)
    center=[0,0,0];before=deepcopy(center)
    with pytest.raises(GeometryError,match='approximate full-dimensional hull failed'):
        waterman_fcc(2,center=center)
    assert center==before
