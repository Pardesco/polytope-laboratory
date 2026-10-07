"""Strict native envelope, full evidence replay and real Node JSON interchange."""
from copy import deepcopy
import hashlib
import json
import os
import subprocess

import pytest

from engine.convex_core import verify_convex_core_evidence
from engine.convex_core_workflow import (OPERATION, VERSION, branch_convex_core,
    dispatch_convex_core, replay_convex_core_document, replay_convex_core_history,
    run_convex_core)
from engine.augmentation_workflow import equivalent_json
from engine.formats import load_file, save_project
from engine.geometry import GeometryError, identity
from engine.history import ALGORITHM_VERSIONS, _json_bytes, replay_history, validate_document_history
from engine.server import dispatch as native_dispatch
from engine.generators import regular


def cube(size=1.):
    return {'id':'literal-core-cube','name':'Literal cube','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex',
        'vertices':[[size*x,size*y,size*z] for x,y,z in
            ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))],
        'edges':[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
        'faces':[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','attributes':[1.0,-0.0,.125],
            'offColors':{'faces':[{'encoding':'byte','values':[i,20,40,100+i]} for i in range(6)],'cells':[]}}}


def document(size=1.):
    return {'id':'source-document','cursor':0,'states':[{'model':cube(size),
        'view':{'coordinateUnit':'mm','angles':[0,0,0,0,0,0], 'entitySelection':{'faces':[0]}},
        'label':'Source','notes':'Preserve notes'}]}


def params(**kwargs):return {'center':[0,0,0],**kwargs}
def model(doc):return doc['states'][doc['cursor']]['model']
def project(doc):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
def request(**kwargs):return {'op':OPERATION,'model':cube(),'params':params(),**kwargs}


def javascript(value):
    code="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    result=subprocess.run(['node','-e',code],input=_json_bytes(value).decode('utf-8'),
        encoding='utf-8',capture_output=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)


def test_dispatch_production_version_immutable_rgba_units_and_source_hash():
    value=request();before=deepcopy(value);result=dispatch_convex_core(value)
    assert value==before and result['provenance']['operation']==OPERATION
    assert result['provenance']['algorithmVersion']==VERSION
    assert result['interpretation']=='convex-polytope' and result['measure']['content']==pytest.approx(8)
    assert {tuple(sorted(row)) for row in result['facetVertices']}=={tuple(sorted(row)) for row in result['faces']}
    evidence=result['metadata']['convexCore']
    assert evidence['sourceBinding']['sourceSnapshotSha256']==hashlib.sha256(_json_bytes(evidence['sourceModel'])).hexdigest()
    assert result['metadata']['coordinateUnits']=='mm' and verify_convex_core_evidence(result)['passed']


def test_record_node_save_load_actual_native_project_and_replay(tmp_path):
    original=document();before=deepcopy(original);result=run_convex_core(original,params())
    assert original==before and result['cursor']==1
    assert result['states'][-1]['notes']=='Preserve notes' and 'entitySelection' not in result['states'][-1]['view']
    nodes=result['operationHistory']['nodes'];assert nodes[-1]['op']==OPERATION and nodes[-1]['algorithmVersion']==VERSION
    portable=javascript(project(result))
    validated=native_dispatch({'op':'validate-project','params':{'project':portable}})
    path=tmp_path/'core.json';save_project(path,validated)
    restored=load_file(path)['project']['documents'][0]
    assert equivalent_json(model(replay_convex_core_document(restored)))==equivalent_json(model(result))
    assert verify_convex_core_evidence(model(restored))['passed']


def test_real_native_transform_ancestor_and_branch_original_parent_dispatch():
    transformed=native_dispatch({'op':'recipe-run','params':{'document':document(),'operation':'transform','parameters':{'scale':2}}})
    core=run_convex_core(transformed,params());calls=[]
    def tracked(value):calls.append(value['op']);return native_dispatch(value)
    assert model(replay_convex_core_document(core,dispatcher=tracked))==model(core)
    assert calls==['transform'] and model(core)['measure']['content']==pytest.approx(64)
    calls.clear();branch=branch_convex_core(core,params(center=[.25,0,0]),dispatcher=tracked)
    assert calls==['transform'] and model(branch)['measure']['content']==pytest.approx(64)
    nodes=branch['operationHistory']['nodes']
    assert nodes[-1]['parent']==nodes[-2]['parent']
    assert model(branch)['metadata']['convexCore']['sourceModel']==model(transformed)
    assert model(replay_convex_core_document(branch))==model(branch)


def test_model_attribute_edit_gets_new_genuine_source_root_with_original_parent():
    transformed=native_dispatch({'op':'recipe-run','params':{'document':document(),'operation':'transform','parameters':{'scale':1}}})
    previous=transformed['states'][-1]['operationNode']
    model(transformed)['metadata']['offColors']['faces'][2]['values'][3]=77
    model(transformed)['metadata']['coordinateUnits']='cm'
    result=run_convex_core(transformed,params());nodes=result['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['parent']==previous
    assert nodes[-1]['parent']==nodes[-2]['id']
    assert model(result)['metadata']['coordinateUnits']=='cm'
    assert model(replay_convex_core_document(result))==model(result)


def test_real_native_transform_after_core_replays_as_historical_evidence():
    result=run_convex_core(document(),params())
    scaled=native_dispatch({'op':'recipe-run','params':{'document':result,'operation':'transform','parameters':{'scale':2}}})
    calls=[]
    def tracked(value):calls.append(value['op']);return native_dispatch(value)
    replayed=replay_convex_core_document(javascript(scaled),dispatcher=tracked)
    assert calls==['transform'] and model(replayed)==equivalent_json(model(scaled))
    assert model(replayed)['vertices']==[[2*x for x in point] for point in model(result)['vertices']]
    assert model(replayed)['metadata']['offColors']==model(result)['metadata']['offColors']
    with pytest.raises(GeometryError,match='stale'):verify_convex_core_evidence(model(replayed))


def test_source_snapshot_attribute_hash_refuses_tamper_and_all_nodes_are_returned():
    result=run_convex_core(document(),params())
    states=replay_convex_core_history(result['operationHistory'])
    assert set(states)=={row['id'] for row in result['operationHistory']['nodes']}
    result['operationHistory']['nodes'][0]['snapshot']['model']['metadata']['coordinateUnits']='cm'
    with pytest.raises(GeometryError,match='source snapshot hash'):
        replay_convex_core_history(result['operationHistory'])


@pytest.mark.parametrize('policy',['require-equal','none'])
def test_duplicate_source_plane_ownership_and_explicit_color_policy_replay(policy):
    source=document();model(source)['faces'].append(deepcopy(model(source)['faces'][0]))
    color=deepcopy(model(source)['metadata']['offColors']['faces'][0])
    if policy=='none':color['values'][3]=15
    model(source)['metadata']['offColors']['faces'].append(color)
    result=run_convex_core(source,params(color_policy=policy))
    owners=model(result)['metadata']['convexCore']['faceSupportOwners']
    assert any(row['sourceFaceIds']==[0,6] for row in owners)
    assert ('offColors' in model(result)['metadata'])==(policy=='require-equal')
    assert model(replay_convex_core_document(javascript(result)))==equivalent_json(model(result))


@pytest.mark.parametrize('size,convex',[(1.,True),(1e99,True),(1e-100,True),(1e-110,False)])
def test_native_approximate_measures_and_underflow_no_measure_roundtrip(size,convex):
    result=run_convex_core(document(size),params())
    item=model(result)
    assert item['interpretation']==('convex-polytope' if convex else 'generalized-complex')
    assert ('measure' in item)==convex
    assert item['metadata']['convexCore']['nativeMeasureGate']['status']==('passed' if convex else 'unsupported')
    restored=native_dispatch({'op':'validate-project','params':{'project':javascript(project(result))}})['documents'][0]
    assert model(replay_convex_core_document(restored))==model(restored)


@pytest.mark.parametrize('change',[
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,55),
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['convexCore']['sourceBinding'].__setitem__('sourceSnapshotSha256','0'*64),
    lambda m:m['metadata']['convexCore']['candidateToOutputVertexIds'].__setitem__(0,1),
    lambda m:m['metadata']['convexCore']['faceSupportOwners'][0]['sourceFaceIds'].__setitem__(0,
        (m['metadata']['convexCore']['faceSupportOwners'][0]['sourceFaceIds'][0]+1)%6),
    lambda m:m['metadata']['convexCore']['sourceModel']['metadata']['attributes'].__setitem__(2,.25),
    lambda m:m['metadata']['convexCore']['classification'].__setitem__('sourceModelId','false-id'),
    lambda m:m['facetVertices'][0].__setitem__(0,(m['facetVertices'][0][0]+1)%8),
])
def test_geometry_equivalent_snapshot_tamper_rejects_full_evidence_replay(change):
    result=run_convex_core(document(),params());change(result['operationHistory']['nodes'][-1]['snapshot']['model'])
    assert validate_document_history(result)
    with pytest.raises(GeometryError,match='verification'):replay_convex_core_document(result)


@pytest.mark.parametrize('change',[
    lambda r:r.update(unknown=True),lambda r:r.update(op='transform'),lambda r:r.pop('model'),
    lambda r:r['params'].update(unknown=True),lambda r:r['params'].pop('center'),
    lambda r:r['params'].update(center=[True,0,0]),lambda r:r['params'].update(center=[10**500,0,0]),
    lambda r:r['params'].update(tolerance=float('nan')),lambda r:r['model']['edges'][0].__setitem__(0,0.),
    lambda r:r['model']['metadata'].update(unsafeInteger=2**53+1),
    lambda r:r['model']['metadata'].update(unsafeDecimalFloat=1e20),
    lambda r:r['model']['metadata'].update(invalidUnicode='\ud800'),
    lambda r:r.update(id=True),lambda r:r.update(id='x'*129),lambda r:r.update(algorithmVersion='future'),
])
def test_malformed_envelope_or_source_is_structured_atomic_refusal(change):
    value=request();change(value)
    with pytest.raises(GeometryError):dispatch_convex_core(value)


def test_refusal_and_undo_branch_leave_retained_document_unchanged():
    result=run_convex_core(document(),params());before=deepcopy(result)
    with pytest.raises(GeometryError):run_convex_core(result,params(center=[2,0,0]))
    assert result==before
    undo=deepcopy(result);undo['cursor']=0
    branched=run_convex_core(undo,params(center=[.2,0,0]))
    assert len(branched['states'])==2 and len(branched['operationHistory']['nodes'])==3
    old=before['operationHistory']['nodes'][-1]['id']
    assert model(replay_convex_core_document(branched,target=old))==model(before)


def test_targeted_replay_ignores_unrelated_tamper_but_unknown_version_stays_readable():
    result=run_convex_core(document(),params())
    branched=branch_convex_core(result,params(center=[.1,0,0]))
    nodes=branched['operationHistory']['nodes'];selected=nodes[-1]['id']
    nodes[-2]['snapshot']['model']['metadata']['coordinateUnits']='ft'
    assert model(replay_convex_core_document(branched,target=selected))==model(branched)
    nodes[-1]['algorithmVersion']='future'
    assert native_dispatch({'op':'validate-project','params':{'project':project(branched)}})
    with pytest.raises(GeometryError,match='version'):replay_convex_core_document(branched)
    source=nodes[0]['id'];assert model(replay_convex_core_document(branched,target=source))['id']==cube()['id']


def test_deep_and_cyclic_requests_fail_before_copy():
    value=request();value['model']['metadata']['cycle']=value
    with pytest.raises(GeometryError):dispatch_convex_core(value)
    value=document();nested={};model(value)['metadata']['deep']=nested
    for _ in range(80):nested['child']={};nested=nested['child']
    with pytest.raises(GeometryError):run_convex_core(value,params())


def test_actual_registered_native_routes_when_root_mounts():
    if OPERATION not in ALGORITHM_VERSIONS:
        pytest.skip('Root native registration pending; direct production workflow already tested.')
    result=native_dispatch({'op':'recipe-run','params':{'document':document(),'operation':OPERATION,'parameters':params()}})
    assert model(native_dispatch({'op':'recipe-replay','params':{'document':result}}))==model(result)
    states=replay_history(validate_document_history(result),native_dispatch)
    assert states[result['states'][-1]['operationNode']]['model']==model(result)
    branch=native_dispatch({'op':'recipe-branch','params':{'document':result,'parameters':params(center=[.1,0,0])}})
    assert model(branch)['metadata']['convexCore']['center']==[.1,0,0]


@pytest.mark.parametrize('operation,arguments,expected',[
    ('transform',{'scale':2},(8,12,6,0)),
    ('scale-reference',{'index':0,'desired_length':3},(8,12,6,0)),
    ('extrude',{'height':2},(16,32,24,8)),
    ('dual',{'radius':1},(6,12,8,0)),
])
def test_actual_native_convex_downstream_operations_and_replay(operation,arguments,expected):
    source=run_convex_core(document(),params())
    result=native_dispatch({'op':'recipe-run','params':{'document':source,'operation':operation,'parameters':arguments}})
    assert tuple(len(model(result)[field]) for field in ('vertices','edges','faces','cells'))==expected
    assert model(result)['validation']['passed']
    assert model(native_dispatch({'op':'recipe-replay','params':{'document':javascript(result)}}))==equivalent_json(model(result))


@pytest.mark.parametrize('core_first',[True,False])
def test_actual_mixed_geodesic_core_full_history_and_source_only_targets(core_first):
    source=document();source['states'][0]['model']=regular('tetrahedron')
    model(source)['metadata'].update(coordinateUnits='mm',arbitraryAttributes={'literal':1.0})
    model(source)['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.1,.3,.7,.4]} for _ in model(source)['faces']],'cells':[]}
    operations=[(OPERATION,params()),('triangular-geodesic',{'frequency':1})]
    if not core_first:operations.reverse()
    for operation,arguments in operations:
        source=native_dispatch({'op':'recipe-run','params':{'document':source,'operation':operation,'parameters':arguments}})
    replayed=native_dispatch({'op':'recipe-replay','params':{'document':javascript(source)}})
    assert model(replayed)==equivalent_json(model(source))
    states=replay_history(validate_document_history(source),native_dispatch)
    assert states[source['states'][-1]['operationNode']]['model']==equivalent_json(model(source))
    target=source['operationHistory']['nodes'][0]['id']
    restored=native_dispatch({'op':'recipe-replay','params':{'document':source,'target':target}})
    assert model(restored)['id']==source['states'][0]['model']['id']


@pytest.mark.parametrize('core_first',[True,False])
def test_actual_mixed_attachment_core_full_history_and_attribute_tamper(core_first):
    source=document()
    attach={'addition':cube(),'base_face_id':1,'addition_face_id':0}
    attach['addition']['id']='literal-addition'
    operations=[(OPERATION,params()),('attach-at-faces',attach)]
    if not core_first:operations.reverse()
    for operation,arguments in operations:
        source=native_dispatch({'op':'recipe-run','params':{'document':source,'operation':operation,'parameters':arguments}})
    replayed=native_dispatch({'op':'recipe-replay','params':{'document':javascript(source)}})
    assert model(replayed)==equivalent_json(model(source))
    states=replay_history(validate_document_history(source),native_dispatch)
    assert states[source['states'][-1]['operationNode']]['model']==equivalent_json(model(source))
    source['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['coordinateUnits']='cm'
    with pytest.raises(GeometryError):native_dispatch({'op':'recipe-replay','params':{'document':source}})
