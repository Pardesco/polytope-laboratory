"""Independent literal attachment fixtures, outside the frozen native suite."""
from copy import deepcopy
import hashlib
import math

import numpy as np
import pytest

import engine.augmentation as kernel
from engine.augmentation import attach_at_faces
from engine.formats import load_file, save_project
from engine.geometry import GeometryError, canonical_cycle, identity, intrinsic_measures, validate
from engine.history import _json_bytes, canonical_model


def source(vertices, faces, source_id='literal-source'):
    return {'id': source_id, 'name': 'Independent source', 'dimension': 3,
            'embeddingDimension': 3, 'interpretation': 'generalized-complex',
            'vertices': deepcopy(vertices), 'faces': deepcopy(faces),
            'edges': [list(e) for e in sorted({tuple(sorted((a,b))) for face in faces
                                              for a,b in zip(face,face[1:]+face[:1])})],
            'cells': [], 'metadata': {'unrelatedSourceAttribute': {'keep': 'literal'}},
            'numeric': {'mode': 'float64-approximate', 'certified': False}}


def cube(size=1, source_id='cube'):
    return source([[x*size,y*size,z*size] for x,y,z in
                   ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))],
                  [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]], source_id)


def tetrahedron():
    return source([[0,0,0],[1,0,0],[.5,math.sqrt(3)/2,0],
                   [.5,math.sqrt(3)/6,math.sqrt(2/3)]],
                  [[0,2,1],[0,1,3],[1,2,3],[2,0,3]], 'unit-tetrahedron')


def square_pyramid():
    return source([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[.5,.5,math.sqrt(.5)]],
                  [[0,3,2,1],[0,1,4],[1,2,4],[2,3,4],[3,0,4]], 'unit-sided-pyramid')


def info(model): return model['metadata']['augmentation']
def counts(model): return tuple(len(model[k]) for k in ('vertices','edges','faces','cells'))
def measures(model): return info(model)['measureEvidence']


def face_coordinates(model):
    return {tuple(canonical_cycle([tuple(model['vertices'][v]) for v in face])) for face in model['faces']}


def assert_maps(result, sources):
    for si, original in enumerate(sources):
        row = info(result)['inputs'][si]; maps = row['maps']
        assert row['sourceModelId'] == original['id']
        assert row['sourceFingerprint'] == identity(original)
        assert row['sourceSnapshotSha256'] == hashlib.sha256(_json_bytes(original)).hexdigest()
        for edge_id, edge in enumerate(original['edges']):
            assert set(result['edges'][maps['edges'][edge_id]]) == {maps['vertices'][v] for v in edge}
        for face_id, face in enumerate(original['faces']):
            target = maps['faces'][face_id]
            if target is not None:
                assert result['faces'][target] == [maps['vertices'][v] for v in face]
        assert info(result)['sourceModels'][si] == original
    assert info(result)['resultFingerprint'] == result['fingerprint'] == identity(result)
    assert info(result)['resultModelId'] == result['id']
    assert 'components' not in result and 'convexPieces' not in result
    assert result['interpretation'] == 'generalized-complex'
    assert 'measure' not in result and intrinsic_measures(result) is None
    assert result['numeric']['certified'] is False
    assert info(result)['nativeProjectGate']['passed']


def test_two_cubes_retain_exact_seam_vertices_edges_and_faces_not_box_hull():
    base, addition = cube(source_id='base-cube'), cube(source_id='added-cube')
    original = deepcopy((base,addition))
    result = attach_at_faces(base,addition,1,0,tolerance=0)
    assert counts(result) == (12,20,10,0)
    assert result['vertices'][:8] == base['vertices']
    assert {tuple(v) for v in result['vertices']} == {(x,y,z) for x in (0.,1.) for y in (0.,1.) for z in (0.,1.,2.)}
    expected = {tuple(canonical_cycle([tuple(base['vertices'][v]) for v in face]))
                for fi,face in enumerate(base['faces']) if fi != 1}
    expected |= {tuple(canonical_cycle([(x,y,z+1) for x,y,z in (addition['vertices'][v] for v in face)]))
                 for fi,face in enumerate(addition['faces']) if fi != 0}
    assert face_coordinates(result) == expected
    assert measures(result)['surfaceArea'] == pytest.approx(10)
    assert measures(result)['disjointInteriorContent'] == pytest.approx(2)
    assert info(result)['boundary']['eulerCharacteristic'] == 2
    assert info(result)['alignment']['maximumSnapResidual'] == 0
    assert len(set(info(result)['inputs'][0]['maps']['edges']) & set(info(result)['inputs'][1]['maps']['edges'])) == 4
    assert_maps(result,(base,addition)); assert (base,addition) == original


@pytest.mark.parametrize('offset',[0,1,2])
def test_regular_tetrahedra_are_actual_triangular_bipyramid(offset):
    base,addition = tetrahedron(),tetrahedron(); original=deepcopy((base,addition))
    result=attach_at_faces(base,addition,0,0,cycle_offset=offset)
    assert counts(result)==(5,9,6,0)
    assert measures(result)['surfaceArea']==pytest.approx(3*math.sqrt(3)/2)
    assert measures(result)['disjointInteriorContent']==pytest.approx(math.sqrt(2)/6)
    assert result['vertices'][3][2] > 0 and result['vertices'][4][2] < 0
    assert np.linalg.norm(np.asarray(result['vertices'][3])-result['vertices'][4])==pytest.approx(2*math.sqrt(2/3))
    assert all(np.linalg.norm(np.asarray(result['vertices'][a])-result['vertices'][b])==pytest.approx(1)
               for a,b in result['edges'])
    assert_maps(result,(base,addition)); assert (base,addition)==original


def test_cube_plus_regular_square_pyramid_counts_and_analytic_content():
    base,addition=cube(),square_pyramid()
    result=attach_at_faces(base,addition,1,0)
    assert counts(result)==(9,16,9,0)
    assert result['vertices'][-1]==pytest.approx([.5,.5,1+1/math.sqrt(2)])
    assert measures(result)['surfaceArea']==pytest.approx(5+math.sqrt(3))
    assert measures(result)['disjointInteriorContent']==pytest.approx(1+1/(3*math.sqrt(2)))
    assert_maps(result,(base,addition))


@pytest.mark.parametrize('offset',[0,1,2,3])
@pytest.mark.parametrize('reverse_base,reverse_addition',[(False,False),(True,False),(False,True),(True,True)])
def test_every_square_offset_and_source_winding_keeps_proper_rotation(offset,reverse_base,reverse_addition):
    base,addition=cube(),cube()
    if reverse_base: base['faces']=[face[::-1] for face in base['faces']]
    if reverse_addition: addition['faces']=[face[::-1] for face in addition['faces']]
    result=attach_at_faces(base,addition,1,0,cycle_offset=offset)
    assert counts(result)==(12,20,10,0)
    assert info(result)['alignment']['determinant']==pytest.approx(1)
    assert measures(result)['disjointInteriorContent']==pytest.approx(2)
    assert_maps(result,(base,addition))


def test_oblique_translated_input_and_explicit_scale_preserve_base_coordinates():
    base,addition=cube(),cube(.5)
    c,s=math.cos(.37),math.sin(.37)
    rotation=np.asarray([[c,-s,0],[s,c,0],[0,0,1]])
    for model,shift in ((base,[2,-3,4]),(addition,[-8,11,-2])):
        model['vertices']=(np.asarray(model['vertices'])@rotation.T+shift).tolist()
    original=deepcopy((base,addition))
    result=attach_at_faces(base,addition,1,0,scale=2)
    assert result['vertices'][:8]==base['vertices'] and counts(result)==(12,20,10,0)
    assert measures(result)['disjointInteriorContent']==pytest.approx(2)
    assert measures(result)['surfaceArea']==pytest.approx(10)
    assert_maps(result,(base,addition)); assert (base,addition)==original


def test_rgba_full_snapshots_source_maps_and_native_project_survive(tmp_path):
    base,addition=cube(),cube()
    for si,model in enumerate((base,addition)):
        model['metadata']['coordinateUnits']='mm'
        model['metadata']['offColors']={'faces':[{'encoding':'byte','values':[si*90,fi*10,20,128+fi]}
                                               for fi in range(6)],'cells':[]}
        model['fingerprint']='stale-cache-is-not-a-binding'
    original=deepcopy((base,addition)); result=attach_at_faces(base,addition,1,0)
    expected=base['metadata']['offColors']['faces'][:1]+base['metadata']['offColors']['faces'][2:]+addition['metadata']['offColors']['faces'][1:]
    assert result['metadata']['offColors']['faces']==expected
    assert result['metadata']['coordinateUnits']=='mm'
    assert info(result)['inputs'][0]['maps']['faces'][1] is None
    assert info(result)['inputs'][1]['maps']['faces'][0] is None
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'joined','cursor':0,'states':[{'model':result,'view':{}}]}]}
    target=tmp_path/'attachment.json'; save_project(target,project)
    restored=load_file(target)['project']['documents'][0]['states'][0]['model']
    assert canonical_model(restored)==canonical_model(result)
    assert restored['metadata']==result['metadata'] and restored['provenance']==result['provenance']
    assert_maps(restored,(base,addition)); assert (base,addition)==original


@pytest.mark.parametrize('value',[0,-1,True,False,None,'1',math.nan,math.inf,10**500])
def test_bad_scale_is_structured_and_atomic(value):
    base,addition=cube(),cube(); original=deepcopy((base,addition))
    with pytest.raises(GeometryError,match='scale'): attach_at_faces(base,addition,1,0,scale=value)
    assert (base,addition)==original


@pytest.mark.parametrize('value',[-1,True,None,'0',math.nan,math.inf,10**500,.1])
def test_bad_tolerance_is_structured(value):
    with pytest.raises(GeometryError,match='tolerance'): attach_at_faces(cube(),cube(),1,0,tolerance=value)


@pytest.mark.parametrize('value',[-1,True,None,'0',10**500,6])
@pytest.mark.parametrize('parameter',['base_face_id','addition_face_id','cycle_offset'])
def test_bad_integer_ids_and_offsets(value,parameter):
    args={'base_face_id':1,'addition_face_id':0,'cycle_offset':0}; args[parameter]=value
    with pytest.raises(GeometryError): attach_at_faces(cube(),cube(),**args)


@pytest.mark.parametrize('mode',['unequal-scale','unequal-shape','arity','bow-tie','missing-face','mixed-dimension','units'])
def test_incongruent_or_invalid_sources_refuse_atomically(mode):
    base,addition=cube(),cube()
    if mode=='unequal-scale': addition=cube(.5)
    if mode=='unequal-shape': addition['vertices']=[[x+.2*y,y,z] for x,y,z in addition['vertices']]
    if mode=='arity': addition=tetrahedron()
    if mode=='bow-tie': addition['faces'][0]=[0,2,3,1]
    if mode=='missing-face': addition['faces'].pop()
    if mode=='mixed-dimension': addition['dimension']=4
    if mode=='units': addition['metadata']['coordinateUnits']='cm'
    original=deepcopy((base,addition))
    with pytest.raises(GeometryError): attach_at_faces(base,addition,1,0)
    assert (base,addition)==original


def test_zero_tolerance_rejects_nonzero_snapping_but_explicit_relative_tolerance_records_it():
    addition=cube(1+1e-9)
    with pytest.raises(GeometryError,match='incongruent'): attach_at_faces(cube(),addition,1,0,tolerance=0)
    result=attach_at_faces(cube(),addition,1,0,tolerance=1e-8)
    assert 0 < info(result)['alignment']['maximumSnapResidual'] <= info(result)['alignment']['absoluteTolerance']
    assert result['numeric']['certified'] is False and counts(result)==(12,20,10,0)


@pytest.mark.parametrize('mode',['deep','cycle','surrogate-metadata','surrogate-id','huge-int-metadata','nonstring-key'])
def test_malicious_source_json_is_structured_before_copy(mode):
    base=cube()
    if mode=='deep':
        row={}; base['metadata']['nested']=row
        for _ in range(80): row['nested']={}; row=row['nested']
    if mode=='cycle': base['metadata']['cycle']=base
    if mode=='surrogate-metadata': base['metadata']['text']='\ud800'
    if mode=='surrogate-id': base['id']='\ud800'
    if mode=='huge-int-metadata': base['metadata']['value']=10**5000
    if mode=='nonstring-key': base['metadata'][3]='invalid'
    with pytest.raises(GeometryError): attach_at_faces(base,cube(),1,0)


@pytest.mark.parametrize('bound',['MAX_SOURCE_VERTICES','MAX_FACE_VERTICES','MAX_INCIDENCES','MAX_INPUT_BYTES','MAX_OUTPUT_BYTES'])
def test_resource_caps_refuse_atomically(monkeypatch,bound):
    base,addition=cube(),cube(); original=deepcopy((base,addition))
    monkeypatch.setattr(kernel,bound,1)
    with pytest.raises(GeometryError): attach_at_faces(base,addition,1,0)
    assert (base,addition)==original


@pytest.mark.parametrize('kwargs',[{'reflect':True},{'excavate':True},{'color_policy':'inherit'},{'scale':1e100}])
def test_unimplemented_modes_or_overflowing_alignment_are_explicit(kwargs):
    with pytest.raises(GeometryError): attach_at_faces(cube(),cube(),1,0,**kwargs)


def test_separation_guard_rejects_an_overlapping_alignment(monkeypatch):
    # An erroneous inward support still aligns square vertices exactly but
    # folds the addition onto the base interior. The whole-source test rejects.
    normal=kernel._normal
    def inward(proof,face_id):
        return -normal(proof,face_id) if face_id==1 else normal(proof,face_id)
    monkeypatch.setattr(kernel,'_normal',inward)
    with pytest.raises(GeometryError,match='separation.*overlapping'):
        attach_at_faces(cube(),cube(),1,0)


def test_extreme_scale_does_not_fabricate_a_native_or_finite_measure():
    large=attach_at_faces(cube(1e99),cube(1e99),1,0)
    assert measures(large)['disjointInteriorContent']==pytest.approx(2e297)
    assert measures(large)['surfaceArea']==pytest.approx(1e199)
    assert 'measure' not in large and info(large)['nativeProjectGate']['passed']
    result=attach_at_faces(cube(1e-100),cube(1e-100),1,0)
    assert counts(result)==(12,20,10,0) and validate(result)['passed']
    assert measures(result)['status']=='passed'
    smaller=attach_at_faces(cube(1e-110),cube(1e-110),1,0)
    assert measures(smaller)['status']=='unsupported'
    assert 'disjointInteriorContent' not in measures(smaller) and 'measure' not in smaller


def test_result_source_snapshots_and_colors_are_independent_mutable_copies():
    base,addition=cube(),cube(); result=attach_at_faces(base,addition,1,0)
    info(result)['sourceModels'][0]['vertices'][0][0]=99
    result['vertices'][0][0]=77
    assert base['vertices'][0][0]==0 and addition['vertices'][0][0]==0


def test_numerically_unresolved_thin_separation_refuses_without_overlap_guess():
    addition=cube(); addition['vertices']=[[x,y,z*1e-7] for x,y,z in addition['vertices']]
    with pytest.raises(GeometryError,match='separation'):
        attach_at_faces(cube(),addition,1,0,tolerance=1e-6)


def test_current_input_component_ids_remain_historical_not_fabricated_result_leaves():
    base=cube(); base['components']=[{'id':'original-leaf','name':'Owned cube','sourceModelId':'earlier-source',
                                     'sourceFingerprint':'earlier-fingerprint','sourcePath':[0],
                                     'maps':{k:list(range(len(base[k]))) for k in ('vertices','edges','faces','cells')}}]
    base['metadata']['compound']={'sourceModels':[cube(source_id='earlier-source')],
                                  'historicalPolicy':'retain'}
    original=deepcopy(base); result=attach_at_faces(base,cube(),1,0)
    assert info(result)['sourceModels'][0]['components'][0]['id']=='original-leaf'
    assert info(result)['sourceModels'][0]['metadata']['compound']==base['metadata']['compound']
    assert 'components' not in result and base==original


def test_asymmetric_addition_chirality_is_preserved_by_the_proper_transform():
    addition=square_pyramid(); addition['vertices'][-1]=[.2,.3,.9]
    result=attach_at_faces(cube(),addition,1,0,cycle_offset=1)
    maps=info(result)['inputs'][1]['maps']['vertices']
    original=np.asarray(addition['vertices']); transformed=np.asarray(result['vertices'])[maps]
    def oriented(points):
        return float(np.linalg.det(np.asarray([points[1]-points[0],points[3]-points[0],points[4]-points[0]])))
    assert oriented(transformed)==pytest.approx(oriented(original))
    alignment=info(result)['alignment']; rotation=np.asarray(alignment['rotation'])
    expected=(original-np.asarray(alignment['sourceAnchor']))@rotation.T*alignment['scale']+alignment['targetAnchor']
    assert transformed==pytest.approx(expected)


@pytest.mark.parametrize('unit',[{},True,'parsec'])
def test_malformed_unit_labels_refuse_without_inventing_units(unit):
    base,addition=cube(),cube()
    for model in (base,addition): model['metadata']['coordinateUnits']=unit
    with pytest.raises(GeometryError,match='unit'): attach_at_faces(base,addition,1,0)


def test_native_gate_failure_is_atomic_and_never_discards_attributes(monkeypatch):
    base,addition=cube(),cube(); original=deepcopy((base,addition))
    native=kernel.validate_project
    def changed(project):
        result=native(project)
        result['documents'][0]['states'][0]['model']['metadata']['offColors']['faces'][0]={'encoding':'unit','values':[1,0,0]}
        return result
    monkeypatch.setattr(kernel,'validate_project',changed)
    with pytest.raises(GeometryError,match='project gate changed'): attach_at_faces(base,addition,1,0)
    assert (base,addition)==original


def test_snapped_addition_must_still_pass_full_ordered_boundary_verification(monkeypatch):
    classify=kernel.analyze_convex_boundary; calls=0
    def invalid_snap(model):
        nonlocal calls
        calls+=1
        return {'status':'non-convex'} if calls==3 else classify(model)
    monkeypatch.setattr(kernel,'analyze_convex_boundary',invalid_snap)
    with pytest.raises(GeometryError,match='seam welding invalidates'): attach_at_faces(cube(),cube(),1,0)


def test_exact_vertex_face_and_incidence_resource_boundaries_are_inclusive(monkeypatch):
    monkeypatch.setattr(kernel,'MAX_SOURCE_VERTICES',8)
    monkeypatch.setattr(kernel,'MAX_FACE_VERTICES',4)
    monkeypatch.setattr(kernel,'MAX_INCIDENCES',144)
    assert counts(attach_at_faces(cube(),cube(),1,0))==(12,20,10,0)
