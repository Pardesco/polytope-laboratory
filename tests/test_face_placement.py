"""Independent literal fixtures for the native face placement kernel."""
from copy import deepcopy
import hashlib
import json
import math
import os
import subprocess

import numpy as np
import pytest

import engine.face_placement as placement
from engine.face_placement import place_models_on_faces
from engine.augmentation_workflow import equivalent_json
from engine.compounds import extract_component, remove_component
from engine.formats import load_file, save_project, validate_project
from engine.geometry import GeometryError, identity, intrinsic_measures
from engine.history import _json_bytes


def cube(source_id='base', size=1.):
    return {'id':source_id,'name':'Literal cube','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex',
        'vertices':[[size*x,size*y,size*z] for x,y,z in
            ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))],
        'edges':[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
        'faces':[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','literalAttributes':{'value':1.0,'zero':-0.0},
            'offColors':{'faces':[{'encoding':'byte','values':[i,20+i,40+i,100+i]} for i in range(6)],'cells':[]}}}


def tetrahedron():
    return {'id':'tetra','name':'Literal tetrahedron','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex',
        'vertices':[[0,0,0],[2,0,0],[1,math.sqrt(3),0],[1,math.sqrt(3)/3,math.sqrt(8/3)]],
        'edges':[[0,1],[1,2],[0,2],[0,3],[1,3],[2,3]],
        'faces':[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],'cells':[],
        'numeric':{'certified':False}, 'metadata':{'coordinateUnits':'mm'}}


def counts(model):return tuple(len(model[k]) for k in ('vertices','edges','faces','cells'))
def place(base=None, addition=None, faces=None, **kwargs):
    return place_models_on_faces(cube() if base is None else base,
        cube('addition') if addition is None else addition, [1] if faces is None else faces,
        addition_face_id=kwargs.pop('addition_face_id',0), **kwargs)
def evidence(result):return result['metadata']['facePlacement']
def placed_points(result, index=0):return [result['vertices'][i] for i in evidence(result)['placements'][index]['maps']['vertices']]


def test_unit_cube_on_cube_preserves_independent_literal_seam_incidence_and_colors():
    base, addition=cube(),cube('addition');before=deepcopy((base,addition))
    result=place(base,addition)
    assert counts(result)==(16,24,12,0)
    assert result['vertices'][:8]==base['vertices']
    assert set(map(tuple,placed_points(result)))=={(x,y,z) for x in (0,1) for y in (0,1) for z in (1,2)}
    assert result['edges'][12:]==[[v+8 for v in row] for row in addition['edges']]
    assert result['faces'][6:]==[[v+8 for v in row] for row in addition['faces']]
    assert result['metadata']['offColors']['faces']==base['metadata']['offColors']['faces']+addition['metadata']['offColors']['faces']
    assert set(result['faces'][1]).isdisjoint(result['faces'][6])
    assert {tuple(result['vertices'][i]) for i in result['faces'][1]}=={tuple(result['vertices'][i]) for i in result['faces'][6]}
    assert len(result['components'])==2 and result['interpretation']=='generalized-complex'
    assert intrinsic_measures(result) is None and 'measure' not in result and 'convexPieces' not in result
    assert result['metadata']['coordinateUnits']=='mm' and evidence(result)['nativeProjectGate']['passed']
    assert (base,addition)==before


def test_explicit_target_order_produces_stable_unwelded_maps_and_all_original_faces():
    result=place(faces=[3,1]);rows=evidence(result)['placements']
    assert counts(result)==(24,36,18,0)
    assert [row['targetFaceId'] for row in rows]==[3,1]
    assert rows[0]['maps']=={'vertices':list(range(8,16)),'edges':list(range(12,24)),'faces':list(range(6,12)),'cells':[]}
    assert rows[1]['maps']=={'vertices':list(range(16,24)),'edges':list(range(24,36)),'faces':list(range(12,18)),'cells':[]}
    assert set(map(tuple,placed_points(result,0)))=={(x,y,z) for x in (1,2) for y in (0,1) for z in (0,1)}
    assert set(map(tuple,placed_points(result,1)))=={(x,y,z) for x in (0,1) for y in (0,1) for z in (1,2)}
    assert [result['faces'][i] for i in evidence(result)['baseMaps']['faces']]==cube()['faces']


def test_all_six_cube_faces_remain_full_disjoint_component_shells():
    result=place(faces=list(range(6)))
    assert counts(result)==(56,84,42,0) and len(result['components'])==7
    for row in evidence(result)['placements']:
        own_vertices=set(row['maps']['vertices'])
        assert all(set(result['faces'][i])<=own_vertices for i in row['maps']['faces'])
        assert all(set(result['edges'][i])<=own_vertices for i in row['maps']['edges'])
    assert intrinsic_measures(result) is None


def test_actual_sixteen_placement_boundary_uses_balanced_retrievable_component_paths():
    base={'id':'octagonal-bipyramid','name':'Eight-sided bipyramid','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','numeric':{'certified':False},
        'vertices':[[math.cos(i*math.pi/4),math.sin(i*math.pi/4),0] for i in range(8)]+[[0,0,1],[0,0,-1]],
        'edges':[[i,(i+1)%8] for i in range(8)]+[[i,8] for i in range(8)]+[[i,9] for i in range(8)],
        'faces':[[i,(i+1)%8,8] for i in range(8)]+[[(i+1)%8,i,9] for i in range(8)],
        'cells':[],'metadata':{'coordinateUnits':'mm'}}
    result=place(base=base,faces=list(range(16)),scale=.2)
    assert counts(result)==(138,216,112,0) and len(result['components'])==17
    assert max(len(c['sourcePath']) for c in result['components'])==5
    for row in evidence(result)['placements']:
        extracted=extract_component(result,row['componentIds'][0])
        assert extracted['vertices']==[result['vertices'][i] for i in row['maps']['vertices']]
        assert extracted['faces']==cube()['faces']


@pytest.mark.parametrize('height',[-1.,-.5,0.,.5,2.])
def test_signed_height_preserves_overlap_coincidence_and_gap_without_interior_claim(height):
    result=place(height=height)
    assert counts(result)==(16,24,12,0)
    expected={(x,y,z+height) for x in (0,1) for y in (0,1) for z in (1,2)}
    assert set(map(tuple,placed_points(result)))==expected
    assert 'measure' not in result and intrinsic_measures(result) is None
    assert evidence(result)['outputPolicy']['overlaps'].startswith('allowed')
    if height==-1:
        assert set(map(tuple,result['vertices'][:8]))==set(map(tuple,placed_points(result)))


def test_noncongruent_face_arity_is_allowed_and_positive_scale_is_literal():
    result=place(addition=tetrahedron(),scale=.5,height=.25)
    assert counts(result)==(12,18,10,0)
    points=np.array(placed_points(result));source=np.array(tetrahedron()['vertices'])
    assert np.allclose(np.linalg.norm(points[:,None]-points[None,:],axis=2),
        .5*np.linalg.norm(source[:,None]-source[None,:],axis=2),atol=1e-14)
    assert np.allclose(points[[0,2,1]].mean(axis=0),[.5,.5,1.25])


@pytest.mark.parametrize('angle',[-180,-90,0,90,180,360])
def test_axial_angle_uses_target_outward_axis_and_proper_rigid_rotation(angle):
    result=place(angle_degrees=angle)
    transform=evidence(result)['placements'][0]['transform'];rotation=np.array(transform['rotation'])
    assert np.linalg.det(rotation)==pytest.approx(1,abs=1e-14)
    assert np.allclose(rotation.T@rotation,np.eye(3),atol=1e-14)
    assert np.allclose(rotation@transform['sourceOutwardNormal'],-np.array(transform['targetOutwardNormal']),atol=1e-14)
    target_tangent=np.array([1.,0,0])
    theta=math.radians(angle);expected=np.array([math.cos(theta),math.sin(theta),0])
    assert np.allclose(rotation@np.array([0.,1.,0.]),expected,atol=1e-14)
    assert transform['angleDegrees']==angle


def test_oblique_translated_sources_keep_source_owned_frames_and_all_pairwise_metrics():
    base,addition=cube(),cube('addition')
    axis=np.array([1.,2.,3.]);axis/=np.linalg.norm(axis);theta=.37
    cross=np.array([[0,-axis[2],axis[1]],[axis[2],0,-axis[0]],[-axis[1],axis[0],0]])
    rotation=np.eye(3)*math.cos(theta)+(1-math.cos(theta))*np.outer(axis,axis)+math.sin(theta)*cross
    base['vertices']=(np.array(base['vertices'])@rotation.T+[13,-7,22]).tolist()
    addition['vertices']=(np.array(addition['vertices'])@rotation.T+[-10,8,19]).tolist()
    before=deepcopy((base,addition));result=place(base,addition,scale=.3,height=.8,angle_degrees=21)
    output=np.array(placed_points(result));source=np.array(addition['vertices'])
    assert np.allclose(np.linalg.norm(output[:,None]-output[None,:],axis=2),.3*np.linalg.norm(source[:,None]-source[None,:],axis=2),atol=1e-13)
    row=evidence(result)['placements'][0];normal=np.array(row['transform']['targetOutwardNormal'])
    assert np.allclose(output[addition['faces'][0]].mean(axis=0),np.array(base['vertices'])[base['faces'][1]].mean(axis=0)+.8*normal)
    assert result['vertices'][:8]==base['vertices'] and (base,addition)==before


def test_arbitrary_reversed_ordered_faces_are_copied_without_forcing_orientation():
    base,addition=cube(),cube('addition')
    base['faces']=[face[::-1] if i%2 else face for i,face in enumerate(base['faces'])]
    addition['faces']=[face[::-1] for face in addition['faces']]
    result=place(base,addition)
    assert result['faces'][:6]==base['faces']
    assert result['faces'][6:]==[[v+8 for v in row] for row in addition['faces']]
    assert set(map(tuple,placed_points(result)))=={(x,y,z) for x in (0,1) for y in (0,1) for z in (1,2)}


def test_actual_component_extract_drop_and_historical_snapshots_agree_with_current_maps():
    result=place(faces=[3,1,0]);before=deepcopy(result)
    for row in evidence(result)['placements']:
        assert len(row['componentIds'])==1
        extracted=extract_component(result,row['componentIds'][0])
        assert counts(extracted)==(8,12,6,0)
        assert extracted['vertices']==[result['vertices'][i] for i in row['maps']['vertices']]
        assert extracted['faces']==cube('addition')['faces']
        assert extracted['metadata']['offColors']==cube('addition')['metadata']['offColors']
        assert extracted['metadata']['facePlacementInstance']['sourceModel']==evidence(result)['sourceModels'][1]
        dropped=remove_component(result,row['componentIds'][0])
        assert counts(dropped)==(24,36,18,0)
        remaining=[c['id'] for c in result['components'] if c['id']!=row['componentIds'][0]]
        assert [c['id'] for c in dropped['components']]==remaining
        assert dropped['vertices']==[p for i,p in enumerate(result['vertices']) if i not in row['maps']['vertices']]
        assert intrinsic_measures(dropped) is None and 'measure' not in dropped
    assert result==before


def test_native_json_project_roundtrip_and_real_node_preserve_full_snapshots_rgba_maps(tmp_path):
    result=place(faces=[1,3],height=-.5,angle_degrees=27)
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'placed-document','cursor':0,'states':[{'model':result,'view':{'coordinateUnit':'mm'}}]}]}
    script="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    response=subprocess.run(['node','-e',script],input=_json_bytes(project).decode('utf-8'),
        capture_output=True,encoding='utf-8',timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert response.returncode==0,response.stderr
    transcoded=json.loads(response.stdout);validate_project(transcoded)
    target=tmp_path/'face-placement.json';save_project(target,transcoded)
    restored=load_file(target)['project']['documents'][0]['states'][0]['model']
    assert restored==result
    assert restored['fingerprint']==identity(restored)
    for binding,source in zip(evidence(restored)['inputs'],evidence(restored)['sourceModels']):
        assert binding['sourceSnapshotSha256']==hashlib.sha256(_json_bytes(equivalent_json(source))).hexdigest()
    for row in evidence(restored)['placements']:
        assert extract_component(restored,row['componentIds'][0])['vertices']==[restored['vertices'][i] for i in row['maps']['vertices']]
    assert 'measure' not in restored


@pytest.mark.parametrize('kwargs',[
    {'scale':0},{'scale':-1},{'scale':True},{'scale':10**500},{'scale':float('inf')},
    {'height':10**500},{'height':float('nan')},{'height':True},
    {'angle_degrees':361},{'angle_degrees':-361},{'angle_degrees':True},{'angle_degrees':10**500},
    {'color_policy':'inherit'},{'weld':True},{'keep_base':False},
    {'addition_face_id':True},{'addition_face_id':1.0},{'addition_face_id':6},
])
def test_invalid_parameters_are_structured_and_leave_callers_untouched(kwargs):
    base,addition=cube(),cube('addition');before=deepcopy((base,addition))
    with pytest.raises(GeometryError):place(base,addition,**kwargs)
    assert (base,addition)==before


@pytest.mark.parametrize('faces',[[],[1,1],[True],[1.0],[-1],[6],[0]*17,'1',(1,),None])
def test_strict_target_literal_id_and_placement_bounds(faces):
    with pytest.raises(GeometryError):
        place_models_on_faces(cube(),cube('addition'),faces,addition_face_id=0)


@pytest.mark.parametrize('change',[
    lambda m:m['metadata'].update(coordinateUnits='cm'),
    lambda m:m['metadata'].update(coordinateUnits='unknown'),
    lambda m:m['metadata'].update(coordinateUnits=True),
    lambda m:m['metadata'].update(huge=10**500),
    lambda m:m['metadata'].update(unsafeInteger=2**53+1),
    lambda m:m['metadata'].update(surrogate='\ud800'),
    lambda m:m.update(id='\ud800'),
    lambda m:m['edges'][0].__setitem__(0,0.0),
    lambda m:m['vertices'][0].__setitem__(0,float('inf')),
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,256),
    lambda m:m.update(embeddingDimension=4),
    lambda m:m['faces'][0].__setitem__(slice(None),[0,2,3,1]),
    lambda m:m['faces'].pop(),
])
def test_invalid_source_units_json_incidence_crossed_cycles_and_rgba_are_rejected(change):
    addition=cube('addition');change(addition)
    with pytest.raises(GeometryError):place(addition=addition)


def test_structural_json_limits_precede_copy_and_resource_gates_are_explicit(monkeypatch):
    addition=cube('addition');addition['metadata']['self']=addition
    with pytest.raises(GeometryError,match='cyclic'):place(addition=addition)
    addition=cube('addition');node={};addition['metadata']['deep']=node
    for _ in range(80):node['next']={};node=node['next']
    with pytest.raises(GeometryError,match='structural'):place(addition=addition)
    monkeypatch.setattr(placement,'MAX_OUTPUT_VERTICES',15)
    with pytest.raises(GeometryError,match='vertex budget'):place()
    monkeypatch.setattr(placement,'MAX_OUTPUT_VERTICES',4096)
    monkeypatch.setattr(placement,'MAX_OUTPUT_INCIDENCES',1)
    with pytest.raises(GeometryError,match='incidence budget'):place()


def test_extreme_scale_native_gate_refuses_collapsed_geometry_atomically():
    base,addition=cube(),cube('addition');before=deepcopy((base,addition))
    with pytest.raises(GeometryError):place(base,addition,scale=1e-100)
    assert (base,addition)==before
    with pytest.raises(GeometryError,match='coordinates'):place(base,addition,scale=1e100,height=1e100)


def test_output_historical_snapshot_depth_budget_can_refuse_valid_deep_sources_atomically():
    addition=cube('addition');node={};addition['metadata']['deep']=node
    for _ in range(57):node['next']={};node=node['next']
    before=deepcopy(addition)
    with pytest.raises(GeometryError,match='structural'):place(addition=addition)
    assert addition==before


def test_valid_large_scientific_coordinates_preserve_boundaries_without_measure_values():
    result=place(cube(size=1e99),cube('large-addition',size=1e99))
    assert counts(result)==(16,24,12,0)
    assert max(point[2] for point in placed_points(result))==2e99
    assert 'measure' not in result and intrinsic_measures(result) is None


def test_unavailable_frames_from_nonconvex_or_subdivided_sources_are_not_hulled():
    base=cube();base['vertices'].append([.5,0,0])
    base['edges'][0]=[0,8];base['edges'].append([8,1])
    base['faces'][0]=[0,3,2,1,8];base['faces'][2]=[0,8,1,5,4]
    with pytest.raises(GeometryError,match='convex source'):place(base=base)
