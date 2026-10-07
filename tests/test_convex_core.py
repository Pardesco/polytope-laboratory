"""Analytic literal source-plane chambers, without generator/Hull fixture oracles."""
from copy import deepcopy
import hashlib
import json
import math
import os
import subprocess
from types import SimpleNamespace

import numpy as np
import pytest

import engine.convex_core as kernel
from engine.convex_core import convex_core, verify_convex_core_evidence
from engine.compounds import extract_component
from engine.augmentation_workflow import equivalent_json
from engine.formats import load_file, save_project, validate_project
from engine.geometry import GeometryError, identity, intrinsic_measures, validate
from engine.history import _json_bytes, canonical_model


def cube(size=1.,source_id='literal-cube'):
    return {'id':source_id,'name':'Literal cube','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex',
        'vertices':[[size*x,size*y,size*z] for x,y,z in
            ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))],
        'edges':[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
        'faces':[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','arbitraryAttributes':{'float':1.0,'negativeZero':-0.0},
            'offColors':{'faces':[{'encoding':'byte','values':[i,20+i,40+i,100+i]} for i in range(6)],'cells':[]}}}


def tetrahedron():
    return {'id':'right-tetrahedron','name':'Right tetrahedron','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
        'edges':[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
        'faces':[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],'cells':[],
        'numeric':{'certified':False},'metadata':{'coordinateUnits':'cm'}}


def literal_prism(n,d=1,height=2.):
    cycles=[];seen=set()
    for first in range(n):
        if first in seen:continue
        cycle=[];current=first
        while current not in seen:
            cycle.append(current);seen.add(current);current=(current+d)%n
        cycles.append(cycle)
    faces=[cycle[::-1] for cycle in cycles]+[[v+n for v in cycle] for cycle in cycles]
    for cycle in cycles:
        faces.extend([[a,b,b+n,a+n] for a,b in zip(cycle,cycle[1:]+cycle[:1])])
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    return {'id':f'literal-{n}/{d}-prism','name':f'Literal {n}/{d} prism',
        'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
        'vertices':[[math.cos(2*math.pi*i/n),math.sin(2*math.pi*i/n),z]
            for z in (-height/2,height/2) for i in range(n)],
        'edges':[list(row) for row in edges],'faces':faces,'cells':[],
        'numeric':{'certified':False},'metadata':{'coordinateUnits':'model',
            'rawSymbol':f'{n}/{d}','sourceOrderedCycles':cycles}}


def core(source=None,**kwargs):return convex_core(cube() if source is None else source,center=kwargs.pop('center',[0,0,0]),**kwargs)
def evidence(model):return model['metadata']['convexCore']
def counts(model):return tuple(len(model[k]) for k in ('vertices','edges','faces','cells'))
def key(point):return tuple(round(x,10) for x in point)
def project(model):return {'format':'polytope-laboratory','version':1,'active':0,
    'documents':[{'id':'core-document','cursor':0,'states':[{'model':model,'view':{}}]}]}


def test_cube_plane_chamber_is_literal_cube_with_complete_support_owners_rgba_and_measures():
    source=cube();before=deepcopy(source);result=core(source)
    assert counts(result)==(8,12,6,0)
    assert set(map(tuple,result['vertices']))==set(map(tuple,source['vertices']))
    assert result['interpretation']=='convex-polytope' and result['numeric']['certified'] is False
    assert result['measure']['content']==pytest.approx(8)
    assert result['measure']['boundaryMeasure']==pytest.approx(24)
    assert result['metadata']['coordinateUnits']=='mm'
    assert evidence(result)['sourceModel']==source
    for row in evidence(result)['faceSupportOwners']:
        assert len(row['sourceFaceIds'])==1
        source_face=row['sourceFaceIds'][0]
        assert {tuple(result['vertices'][i]) for i in result['faces'][row['resultFaceId']]}=={tuple(source['vertices'][i]) for i in source['faces'][source_face]}
        assert result['metadata']['offColors']['faces'][row['resultFaceId']]==source['metadata']['offColors']['faces'][source_face]
    assert evidence(result)['boundedness']['status']=='bounded-numerical'
    assert len(evidence(result)['boundedness']['objectives'])==6
    assert evidence(result)['boundedness']['clippingBoxUsed'] is False
    assert evidence(result)['enumeration']['testedPlaneTriples']==20
    assert evidence(result)['enumeration']['termination'].startswith('exhausted')
    assert evidence(result)['classification']['status']=='passed'
    assert evidence(result)['classification']['sourceModelId']==result['id']
    assert evidence(result)['classification']['sourceFingerprint']==identity(result)
    assert source==before


def test_right_tetrahedron_and_nonspherical_affine_dimensions_have_analytic_volume():
    source=tetrahedron();result=core(source,center=[.25,.25,.25])
    assert counts(result)==(4,6,4,0)
    assert set(map(tuple,result['vertices']))==set(map(tuple,source['vertices']))
    assert result['measure']['content']==pytest.approx(1/6)
    assert result['metadata']['coordinateUnits']=='cm'
    source['vertices']=[[2*x+7,3*y-5,4*z+9] for x,y,z in source['vertices']]
    result=core(source,center=[7.5,-4.25,10])
    assert set(map(tuple,result['vertices']))==set(map(tuple,source['vertices']))
    assert result['measure']['content']==pytest.approx(4)


@pytest.mark.parametrize('d',[2,3,-2,-3])
def test_crossed_pentagram_prism_core_is_independent_smaller_ordinary_pentagonal_prism(d):
    source=literal_prism(5,d,height=3);before=deepcopy(source)
    result=core(source)
    radius=(3-math.sqrt(5))/2
    expected={key([radius*math.cos((2*i+1)*math.pi/5),radius*math.sin((2*i+1)*math.pi/5),z])
        for i in range(5) for z in (-1.5,1.5)}
    assert counts(result)==(10,15,7,0)
    assert set(map(key,result['vertices']))==expected
    assert all(math.hypot(*point[:2])==pytest.approx(radius,abs=1e-14) for point in result['vertices'])
    assert result['measure']['content']==pytest.approx(3*5*radius**2*math.sin(2*math.pi/5)/2)
    assert len([face for face in result['faces'] if len(face)==5])==2
    assert all(len(face) in (4,5) for face in result['faces'])
    assert evidence(result)['sourceModel']['metadata']['rawSymbol']==f'5/{d}'
    assert evidence(result)['sourceModel']['faces']==source['faces']
    assert source==before
    # Source Hull would have circumradius 1, a different mathematical object.
    assert max(math.hypot(*point[:2]) for point in result['vertices'])<.4


def test_disconnected_hexagram_prism_core_has_hexagonal_chamber_and_historical_component_cycles():
    source=literal_prism(6,2);before=deepcopy(source);result=core(source)
    radius=1/math.sqrt(3)
    assert counts(result)==(12,18,8,0)
    assert all(math.hypot(*point[:2])==pytest.approx(radius,abs=1e-14) for point in result['vertices'])
    assert result['measure']['content']==pytest.approx(math.sqrt(3))
    assert evidence(result)['sourceModel']['metadata']['sourceOrderedCycles']==[[0,2,4],[1,3,5]]
    assert 'components' not in result
    caps=[row for row in evidence(result)['faceSupportOwners'] if len(result['faces'][row['resultFaceId']])==6]
    assert sorted(len(row['sourceFaceIds']) for row in caps)==[2,2]
    assert source==before


def test_genuine_disconnected_source_leaf_snapshots_and_ids_remain_historical_not_fake_core_components():
    source=literal_prism(6,2);leaves=[];components=[]
    for index,ids in enumerate(([0,2,4,6,8,10],[1,3,5,7,9,11])):
        owned=set(ids);reverse={v:i for i,v in enumerate(ids)}
        maps={'vertices':list(ids),'edges':[i for i,e in enumerate(source['edges']) if set(e)<=owned],
              'faces':[i for i,f in enumerate(source['faces']) if set(f)<=owned],'cells':[]}
        leaf={'id':f'triangle-prism-{index}','name':'Literal triangle prism','dimension':3,'embeddingDimension':3,
            'interpretation':'generalized-complex','vertices':[deepcopy(source['vertices'][i]) for i in ids],
            'edges':[[reverse[v] for v in source['edges'][i]] for i in maps['edges']],
            'faces':[[reverse[v] for v in source['faces'][i]] for i in maps['faces']],
            'cells':[],'numeric':{'certified':False},'metadata':{'coordinateUnits':'model'}}
        leaves.append(leaf)
        components.append({'id':f'original-triangle-component-{index}','name':leaf['name'],
            'sourceModelId':leaf['id'],'sourceFingerprint':identity(leaf),
            'sourceComponentId':None,'sourcePath':[index],'maps':maps})
    source['components']=components
    source['metadata']['compound']={'schemaVersion':1,'sourceModels':leaves,
        'inputs':[{'sourceIndex':i,'sourceModelId':leaves[i]['id'],'sourceFingerprint':identity(leaves[i]),
                   'maps':deepcopy(components[i]['maps'])} for i in range(2)]}
    before=deepcopy(source);result=core(source)
    assert counts(result)==(12,18,8,0) and 'components' not in result
    historical=evidence(result)['sourceModel'];assert historical==before
    for component in components:
        extracted=extract_component(historical,component['id'])
        assert counts(extracted)==(6,9,5,0)
        assert extracted['vertices']==[historical['vertices'][i] for i in component['maps']['vertices']]
    assert source==before and verify_convex_core_evidence(result)['passed']


def test_duplicate_plane_support_ownership_preserves_both_face_ids_and_equal_rgba():
    source=cube();source['faces'].append(deepcopy(source['faces'][1]))
    source['metadata']['offColors']['faces'].append(deepcopy(source['metadata']['offColors']['faces'][1]))
    result=core(source)
    row=next(row for row in evidence(result)['faceSupportOwners'] if 6 in row['sourceFaceIds'])
    assert row['sourceFaceIds']==[1,6] and counts(result)==(8,12,6,0)
    assert result['metadata']['offColors']['faces'][row['resultFaceId']]==source['metadata']['offColors']['faces'][1]
    assert evidence(result)['enumeration']['testedPlaneTriples']==20


def test_triangulated_plane_source_retains_owner_ids_and_does_not_triangulate_the_core():
    source=cube();source['faces'][0]=[0,3,2];source['faces'].append([0,2,1]);source['edges'].append([0,2])
    source['metadata']['offColors']['faces'].append(deepcopy(source['metadata']['offColors']['faces'][0]))
    result=core(source)
    assert counts(result)==(8,12,6,0)
    assert all(len(face)==4 for face in result['faces'])
    assert any(row['sourceFaceIds']==[0,6] for row in evidence(result)['faceSupportOwners'])
    assert evidence(result)['sourceModel']['faces']==source['faces']


@pytest.mark.parametrize('color',[None,{'encoding':'byte','values':[99,1,2,3]}])
def test_duplicate_color_ambiguity_refuses_atomically_and_explicit_none_retains_historical_rgba(color):
    source=cube();source['faces'].append(deepcopy(source['faces'][1]));source['metadata']['offColors']['faces'].append(color)
    before=deepcopy(source)
    with pytest.raises(GeometryError,match='ambiguous RGB/RGBA'):core(source)
    assert source==before
    result=core(source,color_policy='none')
    assert counts(result)==(8,12,6,0) and 'offColors' not in result['metadata']
    assert evidence(result)['sourceModel']['metadata']['offColors']==source['metadata']['offColors']
    assert source==before


def test_exact_through_center_plane_is_ignored_without_welding_or_deleting_source_incidence():
    source=cube();source['faces'].append([0,2,6,4]);source['edges'].extend([[0,2],[4,6]])
    source['metadata']['offColors']['faces'].append(None);before=deepcopy(source)
    result=core(source)
    assert counts(result)==(8,12,6,0)
    assert evidence(result)['ignoredSourceFaceIds']==[6]
    assert evidence(result)['sourcePlaneRecords'][6]['status']=='ignored-through-center'
    assert evidence(result)['sourceModel']==before and source==before


@pytest.mark.parametrize('center',[[0,0,1],[0,0,-1],[1,0,0],[2,0,0]])
def test_ignored_cube_facet_or_external_center_has_genuine_unbounded_chamber(center):
    source=cube();before=deepcopy(source)
    with pytest.raises(GeometryError,match='unbounded'):core(source,center=center)
    assert source==before


@pytest.mark.parametrize('distance',[1e-13,-1e-13,1e-10])
def test_nonzero_near_center_plane_is_refused_not_called_an_exact_ignored_plane(distance):
    with pytest.raises(GeometryError,match='nonzero near-center'):core(center=[0,0,1-distance])
    # Safely separated inside centre recovers the same bounded chamber.
    assert counts(core(center=[0,0,.9]))==(8,12,6,0)


def test_open_source_with_five_cube_planes_is_unbounded_while_extra_wire_source_is_historical():
    source=cube();source['faces'].pop(1);source['metadata']['offColors']['faces'].pop(1)
    assert validate(source)['passed']
    with pytest.raises(GeometryError,match='unbounded'):core(source)
    source=cube();source['vertices'].append([7,4,3]);source['edges'].append([0,8]);before=deepcopy(source)
    result=core(source)
    assert counts(result)==(8,12,6,0)
    assert evidence(result)['sourceModel']==before
    assert set(map(tuple,result['vertices']))==set(map(tuple,source['vertices'][:8]))
    assert source==before


def test_all_planes_through_center_and_no_clipping_box_refuse_as_unbounded():
    source={'id':'central-three-planes','name':'Plane complex','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
        'faces':[[0,1,2],[0,1,3],[0,2,3]],'edges':[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
        'cells':[],'numeric':{'certified':False},'metadata':{}}
    with pytest.raises(GeometryError,match='no effective source plane'):core(source)


def test_close_distinct_planes_are_not_rounded_into_one_owner_group_and_separated_ones_remain():
    source=cube();x=1-1e-12
    source['vertices'] += [[x,-1,-1],[x,1,-1],[x,1,1],[x,-1,1]]
    source['edges'] += [[8,9],[9,10],[10,11],[8,11]];source['faces'].append([8,9,10,11])
    source['metadata']['offColors']['faces'].append({'encoding':'unit','values':[.1,.2,.3,.4]})
    with pytest.raises(GeometryError,match='nearly coincident'):core(source)
    x=1-1e-5
    for point in source['vertices'][8:]:point[0]=x
    result=core(source)
    assert counts(result)==(8,12,6,0)
    assert max(p[0] for p in result['vertices'])==x
    assert result['measure']['content']==pytest.approx(4*(2-1e-5))
    assert len(evidence(result)['planeGroups'])==7
    assert sum(row['role']=='redundant' for row in evidence(result)['planeGroups'])==1


def test_source_face_cycle_reversal_is_not_used_to_pick_the_wrong_halfspace():
    source=cube();forward=core(source)
    source['faces']=[row[::-1] for row in source['faces']]
    reverse=core(source)
    assert canonical_model(forward)==canonical_model(reverse)
    assert evidence(reverse)['sourceModel']['faces']==source['faces']


def test_native_validate_save_load_and_actual_headless_node_json_keep_lineage_rgba_and_units(tmp_path):
    result=core();before=deepcopy(result);portable=project(result)
    javascript="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    response=subprocess.run(['node','-e',javascript],input=_json_bytes(portable).decode('utf-8'),
        capture_output=True,encoding='utf-8',timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert response.returncode==0,response.stderr
    transcoded=json.loads(response.stdout);validate_project(transcoded)
    target=tmp_path/'convex-core.json';save_project(target,transcoded)
    restored=load_file(target)['project']['documents'][0]['states'][0]['model']
    assert restored==before and result==before
    binding=evidence(restored)['sourceBinding'];source=evidence(restored)['sourceModel']
    assert binding['sourceSnapshotSha256']==hashlib.sha256(_json_bytes(equivalent_json(source))).hexdigest()
    assert binding['sourceFingerprint']==identity(source)
    assert evidence(restored)['resultFingerprint']==identity(restored) and evidence(restored)['resultModelId']==restored['id']
    assert restored['numeric']['certified'] is False
    assert verify_convex_core_evidence(restored)['passed']


def test_large_scientific_source_scale_has_real_finite_3d_native_measures_without_invented_refusal():
    result=core(cube(size=1e99))
    assert counts(result)==(8,12,6,0)
    assert result['interpretation']=='convex-polytope'
    assert result['measure']['content']==pytest.approx(8e297)
    assert result['measure']['boundaryMeasure']==pytest.approx(24e198)
    assert evidence(result)['classification']['status']=='passed'
    assert evidence(result)['nativeMeasureGate']['status']=='passed'
    assert evidence(result)['nativeProjectGate']=={'passed':True,'measurePublished':True}
    validate_project(project(deepcopy(result)))


def test_tiny_scale_measure_underflow_keeps_valid_generalized_core_without_zero_filled_volume():
    result=core(cube(size=1e-110))
    assert counts(result)==(8,12,6,0)
    assert result['interpretation']=='generalized-complex' and 'measure' not in result
    assert evidence(result)['nativeMeasureGate']['status']=='unsupported'
    assert evidence(result)['classification']['sourceFingerprint']==identity(result)
    validate_project(project(deepcopy(result)))


def test_small_safe_scale_publishes_real_finite_native_measures():
    result=core(cube(size=1e-100))
    assert result['interpretation']=='convex-polytope'
    assert result['measure']['content']==pytest.approx(8e-300,abs=0)
    assert result['measure']['boundaryMeasure']==pytest.approx(24e-200,abs=0)
    assert evidence(result)['nativeMeasureGate']['status']=='passed'


def test_native_measure_arithmetic_failure_preserves_full_generalized_source_lineage(monkeypatch):
    def failing_measure(model):raise OverflowError('native downstream overflow')
    monkeypatch.setattr(kernel,'intrinsic_measures',failing_measure)
    result=core()
    assert counts(result)==(8,12,6,0)
    assert result['interpretation']=='generalized-complex' and 'measure' not in result
    assert evidence(result)['nativeMeasureGate']['status']=='unsupported'
    assert 'native downstream overflow' in evidence(result)['nativeMeasureGate']['diagnostic']
    assert evidence(result)['sourceModel']==cube()
    assert len(evidence(result)['faceSupportOwners'])==6
    assert intrinsic_measures(result) is None
    validate_project(project(deepcopy(result)))


def test_stale_source_facet_equations_fingerprint_and_measure_caches_do_not_define_the_chamber():
    source=cube();source.update(facetEquations=[[1,0,0,-1e20]],facetVertices=[[0,1,2]],
        fingerprint='f'*64,measure={'content':-99,'boundaryMeasure':-99})
    result=core(source)
    assert counts(result)==(8,12,6,0) and result['measure']['content']==pytest.approx(8)
    assert evidence(result)['sourceBinding']['sourceFingerprint']==identity(source)
    assert evidence(result)['sourceModel']==source


@pytest.mark.parametrize('kwargs',[
    {'center':None},{'center':(0,0,0)},{'center':[0,0]},{'center':[True,0,0]},
    {'center':[10**500,0,0]},{'center':[float('nan'),0,0]},{'center':[0,float('inf'),0]},
    {'center':[2**53+1,0,0]},
    {'center':[1e8,0,0]}, {'tolerance':0},{'tolerance':-1},{'tolerance':True},
    {'tolerance':10**500},{'tolerance':float('nan')},{'tolerance':1e-4},
    {'color_policy':'auto'},{'center_radius':1},{'planes':[[1,0,0,1]]},
])
def test_strict_numeric_parameters_and_unknown_options_refuse_atomically(kwargs):
    source=cube();before=deepcopy(source)
    with pytest.raises(GeometryError):core(source,**kwargs)
    assert source==before


@pytest.mark.parametrize('change',[
    lambda m:m.update(id='\ud800'),lambda m:m.update(id='x'*129),
    lambda m:m['metadata'].update(surrogate='\ud800'),
    lambda m:m['metadata'].update(unsafeInteger=2**53+1),
    lambda m:m['metadata'].update(hugeInteger=10**500),
    lambda m:m['metadata'].update(coordinateUnits='unknown'),
    lambda m:m.update(dimension=3.0),lambda m:m.update(dimension=4),
    lambda m:m.update(embeddingDimension=4),lambda m:m.update(faces=[]),
    lambda m:m['edges'][0].__setitem__(0,0.0),lambda m:m['faces'][0].__setitem__(0,True),
    lambda m:m['vertices'][0].__setitem__(0,float('inf')),
    lambda m:m['vertices'][0].__setitem__(0,10**500),
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,256),
])
def test_malformed_source_syntax_json_units_and_colors_are_structured(change):
    source=cube();change(source)
    with pytest.raises(GeometryError):core(source)


def test_source_nonplanarity_rank_and_degenerate_faces_are_refused_without_source_hull_repair():
    source=cube();source['vertices'][0][2]=-.9
    with pytest.raises(GeometryError):core(source)
    source=cube();source['vertices']=[[x,y,0] for x,y,z in source['vertices']]
    with pytest.raises(GeometryError):core(source)
    source=cube();source['faces'][0]=[0,1,1]
    with pytest.raises(GeometryError):core(source)


def test_json_cycles_depth_and_payload_bounds_precede_snapshot_copy(monkeypatch):
    source=cube();source['metadata']['self']=source
    with pytest.raises(GeometryError,match='cyclic'):core(source)
    source=cube();node={};source['metadata']['deep']=node
    for _ in range(80):node['next']={};node=node['next']
    with pytest.raises(GeometryError,match='structural'):core(source)
    monkeypatch.setitem(kernel.LIMITS,'inputBytes',500)
    with pytest.raises(GeometryError,match='serialized'):core()


def test_real_plane_limit_and_all_triples_boundary_is_bounded_and_exhausted():
    result=core(literal_prism(30))
    assert counts(result)==(60,90,32,0)
    assert len(evidence(result)['planeGroups'])==32
    assert evidence(result)['enumeration']['testedPlaneTriples']==4960
    with pytest.raises(GeometryError,match='plane budget'):core(literal_prism(31))


def test_vertex_face_incidence_candidate_and_arithmetic_caps_are_explicit(monkeypatch):
    source=cube();source['vertices']*=33
    with pytest.raises(GeometryError,match='vertex budget'):core(source)
    source=cube();source['faces']*=43
    with pytest.raises(GeometryError,match='face budget'):core(source)
    monkeypatch.setitem(kernel.LIMITS,'sourceIncidenceReferences',1)
    with pytest.raises(GeometryError,match='incidence budget'):core()
    monkeypatch.setitem(kernel.LIMITS,'sourceIncidenceReferences',16384)
    monkeypatch.setitem(kernel.LIMITS,'outputVertices',7)
    with pytest.raises(GeometryError,match='vertex resource'):core()
    monkeypatch.setitem(kernel.LIMITS,'outputVertices',1024)
    monkeypatch.setitem(kernel.LIMITS,'fractionBits',2)
    with pytest.raises(GeometryError,match='arithmetic'):core(tetrahedron(),center=[.25,.25,.25])


def test_unresolved_lp_and_false_success_residuals_do_not_become_finite_core(monkeypatch):
    monkeypatch.setattr(kernel,'linprog',lambda *a,**k:SimpleNamespace(status=4,x=None,fun=None,message='numeric failure'))
    with pytest.raises(GeometryError,match='unresolved'):core()
    monkeypatch.setattr(kernel,'linprog',lambda *a,**k:SimpleNamespace(status=0,x=np.array([100.,0,0]),fun=100.,message='claimed success'))
    with pytest.raises(GeometryError,match='witness fails'):core()


def test_boundedness_uses_six_actual_free_coordinate_objectives_with_no_box(monkeypatch):
    actual=kernel.linprog;calls=[]
    def traced(*args,**kwargs):
        calls.append((args,deepcopy(kwargs)));return actual(*args,**kwargs)
    monkeypatch.setattr(kernel,'linprog',traced);result=core()
    assert len(calls)==6
    assert {tuple(args[0]) for args,_ in calls}=={(-1,0,0),(1,0,0),(0,-1,0),(0,1,0),(0,0,-1),(0,0,1)}
    assert all(kwargs['bounds']==[(None,None)]*3 for _,kwargs in calls)
    assert all(len(kwargs['A_ub'])==6 for _,kwargs in calls)
    assert evidence(result)['boundedness']['clippingBoxUsed'] is False


def test_unbounded_output_resource_gate_fails_atomically_without_discarding_lineage(monkeypatch):
    source=cube();before=deepcopy(source);monkeypatch.setitem(kernel.LIMITS,'outputBytes',1000)
    with pytest.raises(GeometryError,match='serialized'):core(source)
    assert source==before


@pytest.mark.parametrize('change',[
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,17),
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:evidence(m)['sourceBinding'].__setitem__('sourceSnapshotSha256','0'*64),
    lambda m:evidence(m)['sourcePlaneRecords'][0]['orderedSourceVertexIds'].reverse(),
    lambda m:evidence(m)['sourcePlaneRecords'][0].__setitem__('centerDistanceNormalized',999),
    lambda m:evidence(m)['faceSupportOwners'][0]['sourceFaceIds'].__setitem__(0,999),
    lambda m:evidence(m)['vertexPlaneLineage'][0]['planeTriples'][0].__setitem__(0,999),
    lambda m:evidence(m)['boundedness']['objectives'][0].__setitem__('objectiveValue',999),
    lambda m:evidence(m)['enumeration'].__setitem__('termination','cancelled'),
    lambda m:evidence(m)['classification'].__setitem__('sourceModelId','wrong-model'),
    lambda m:m['provenance']['parameters'].__setitem__('center',[.1,.2,.3]),
    lambda m:m['faces'][0].reverse(),
])
def test_fresh_evidence_reconstruction_rejects_geometry_equivalent_or_cache_attribute_tamper(change):
    result=core();change(result)
    # Native geometric validation is not an oracle for arbitrary metadata.
    assert validate(result)['passed']
    with pytest.raises(GeometryError):verify_convex_core_evidence(result)


def test_model_transform_makes_core_evidence_stale_without_claiming_old_maps_are_current():
    result=core();result['vertices']=[[2*x for x in point] for point in result['vertices']]
    result['fingerprint']=identity(result)
    with pytest.raises(GeometryError,match='stale'):verify_convex_core_evidence(result)


def test_core_evidence_version_and_malformed_missing_fields_are_explicitly_refused():
    result=core();result['provenance']['algorithmVersion']='future-unsupported'
    with pytest.raises(GeometryError,match='unsupported'):verify_convex_core_evidence(result)
    result=core();evidence(result).pop('sourceModel')
    with pytest.raises(GeometryError,match='Malformed'):verify_convex_core_evidence(result)
