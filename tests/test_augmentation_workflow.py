"""Actual native-history/project APIs plus real headless Node JSON interchange."""
from copy import deepcopy
import hashlib
import json
import os
import subprocess

import pytest

from engine.augmentation import attach_at_faces
from engine.augmentation_workflow import (JSON_BINDING, OPERATION, VERSION,
    branch_attachment, dispatch_attachment, equivalent_json, replay_attachment_document,
    replay_attachment_history,
    run_attachment, verify_attachment_evidence)
from engine.formats import load_file, save_project
from engine.geometry import GeometryError, identity, intrinsic_measures
from engine.history import ALGORITHM_VERSIONS, REPLAY_OPERATIONS, _json_bytes, canonical_model, validate_document_history, replay_history
from engine.recipes import RECORD_OPERATIONS
from engine.server import dispatch as native_dispatch


def cube(source_id='base-cube', size=1.):
    return {'id':source_id,'name':'Literal cube','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex',
        'vertices':[[size*x,size*y,size*z] for x,y,z in
                    ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))],
        'edges':[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
        'faces':[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','arbitraryNumbers':[2.0,-0.0,.125],
                    'offColors':{'faces':[{'encoding':'unit','values':[i/10,.4,.6,1.0]} for i in range(6)],'cells':[]}}}


def document():
    return {'id':'source-document','cursor':0,'states':[{'model':cube(),
        'view':{'coordinateUnit':'mm','angles':[0,0,0,0,0,0]},'label':'Source','notes':'Retain original notes'}]}


def params(**changes):
    result={'addition':cube('addition-cube'),'base_face_id':1,'addition_face_id':0,'cycle_offset':0,'scale':1.0}
    result.update(changes);return result


def model(doc):return doc['states'][doc['cursor']]['model']
def project(doc):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
def counts(item):return tuple(len(item[k]) for k in ('vertices','edges','faces','cells'))


def javascript_roundtrip(value):
    javascript="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    result=subprocess.run(['node','-e',javascript],input=_json_bytes(value).decode('utf-8'),
        encoding='utf-8',capture_output=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)


def test_strict_future_dispatch_retains_real_adjacent_cube_incidence_and_full_rgba():
    base,arguments=cube(),params();before=deepcopy((base,arguments))
    result=dispatch_attachment({'op':OPERATION,'model':base,'params':arguments})
    assert counts(result)==(12,20,10,0)
    assert {tuple(p) for p in result['vertices']}=={(x,y,z) for x in (0,1) for y in (0,1) for z in (0,1,2)}
    colors=result['metadata']['offColors']['faces']
    assert colors==base['metadata']['offColors']['faces'][:1]+base['metadata']['offColors']['faces'][2:]+arguments['addition']['metadata']['offColors']['faces'][1:]
    assert result['metadata']['coordinateUnits']=='mm' and verify_attachment_evidence(result)['passed']
    assert 'measure' not in result and intrinsic_measures(result) is None
    assert (base,arguments)==before


def test_raw_kernel_snapshot_byte_hash_is_not_a_javascript_semantic_hash():
    direct=attach_at_faces(cube(),cube('addition'),1,0)
    node=javascript_roundtrip(direct);evidence=node['metadata']['augmentation']
    hash_after=hashlib.sha256(_json_bytes(evidence['sourceModels'][0])).hexdigest()
    assert hash_after!=evidence['inputs'][0]['sourceSnapshotSha256']
    # This test records the limitation; the frozen pure kernel is not modified.


def test_workflow_semantic_source_snapshot_hash_survives_actual_node_roundtrip():
    result=dispatch_attachment({'op':OPERATION,'model':cube(),'params':params()})
    transcoded=javascript_roundtrip(result)
    assert canonical_model(transcoded)==canonical_model(result)
    assert verify_attachment_evidence(transcoded)['passed']
    evidence=transcoded['metadata']['augmentation']
    assert evidence['jsonBinding']['version']==JSON_BINDING
    for i,source in enumerate(evidence['sourceModels']):
        assert hashlib.sha256(_json_bytes(equivalent_json(source))).hexdigest()==evidence['inputs'][i]['sourceSnapshotSha256']


def test_record_save_load_native_validate_and_development_replay_preserve_full_model(tmp_path):
    original=document();before=deepcopy(original)
    attached=run_attachment(original,params());assert original==before
    assert len(attached['states'])==2 and attached['cursor']==1
    history=validate_document_history(attached).to_dict();assert history['nodes'][-1]['op']==OPERATION
    assert history['nodes'][-1]['algorithmVersion']==VERSION
    assert attached['states'][1]['notes']==before['states'][0]['notes']
    portable=javascript_roundtrip(project(attached))
    validated=native_dispatch({'op':'validate-project','params':{'project':portable}})
    target=tmp_path/'attachment.json';save_project(target,validated)
    restored=load_file(target)['project']['documents'][0]
    replayed=replay_attachment_document(restored)
    assert model(replayed)==model(restored)
    assert model(replayed)['id']==model(restored)['id']
    assert model(replayed)['metadata']['offColors']==model(restored)['metadata']['offColors']
    assert replayed['states'][0]['view']['coordinateUnit']=='mm'
    assert verify_attachment_evidence(model(replayed))['passed']


def test_qualified_native_replay_keeps_unknown_future_snapshot_readable_but_refuses_execution():
    attached=run_attachment(document(),params())
    root=attached['operationHistory']['nodes'][0]['id']
    source=native_dispatch({'op':'recipe-replay','params':{'document':attached,'target':root}})
    assert counts(model(source))==(8,12,6,0)
    if OPERATION not in REPLAY_OPERATIONS:
        with pytest.raises(GeometryError,match='unsupported replay operation'):
            native_dispatch({'op':'recipe-replay','params':{'document':attached}})
    else:
        replayed=native_dispatch({'op':'recipe-replay','params':{'document':attached}})
        assert canonical_model(model(replayed))==canonical_model(model(attached))
    assert native_dispatch({'op':'validate-project','params':{'project':project(attached)}})['documents'][0]['cursor']==1
    assert (OPERATION in REPLAY_OPERATIONS)==(OPERATION in RECORD_OPERATIONS)


def test_native_transform_after_attachment_is_replayed_by_actual_native_primitives():
    attached=run_attachment(document(),params())
    scaled=native_dispatch({'op':'recipe-run','params':{'document':attached,'operation':'transform','parameters':{'scale':2},'label':'Scale'}})
    calls=[]
    def tracked(request):calls.append(request['op']);return native_dispatch(request)
    replayed=replay_attachment_document(javascript_roundtrip(scaled),dispatcher=tracked)
    assert calls==['transform']
    assert model(replayed)==model(scaled)
    assert model(replayed)['vertices']==[[2*x for x in p] for p in model(attached)['vertices']]
    assert model(replayed)['metadata']['offColors']==model(attached)['metadata']['offColors']
    # Metadata attachment binding is historical after a different operation.
    with pytest.raises(GeometryError,match='stale'):verify_attachment_evidence(model(replayed))


def test_attachment_parameter_branch_uses_original_parent_not_previously_attached_geometry():
    attached=run_attachment(document(),params());before=deepcopy(attached)
    branch=branch_attachment(attached,params(base_face_id=3,addition_face_id=5))
    assert counts(model(branch))==(12,20,10,0)
    assert {tuple(p) for p in model(branch)['vertices']}=={(x,y,z) for x in (0,1,2) for y in (0,1) for z in (0,1)}
    nodes=branch['operationHistory']['nodes']
    assert nodes[-1]['parent']==nodes[0]['id'] and nodes[-1]['parent']!=nodes[1]['id']
    assert replay_attachment_document(branch)['states'][0]['model']==model(branch)
    assert attached==before


def test_undo_branch_and_failed_operation_do_not_mutate_retained_document():
    attached=run_attachment(document(),params());attached['cursor']=0;before=deepcopy(attached)
    with pytest.raises(GeometryError,match='incongruent'):
        run_attachment(attached,params(scale=2))
    assert attached==before
    new=run_attachment(attached,params(cycle_offset=1))
    assert len(new['states'])==2 and len(new['operationHistory']['nodes'])==3
    assert new['operationHistory']['nodes'][-1]['parent']==new['operationHistory']['nodes'][0]['id']
    assert attached==before


def test_in_place_rgba_edit_gets_a_genuine_new_source_snapshot_for_replay():
    original=document()
    transformed=native_dispatch({'op':'recipe-run','params':{'document':original,'operation':'transform','parameters':{'scale':1}}})
    old_node=transformed['states'][-1]['operationNode']
    changed_color={'encoding':'byte','values':[9,20,31,128]}
    model(transformed)['metadata']['offColors']['faces'][2]=deepcopy(changed_color)
    attached=run_attachment(transformed,params())
    nodes=attached['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['parent']==old_node
    assert nodes[-1]['parent']==nodes[-2]['id']
    assert changed_color in model(attached)['metadata']['offColors']['faces']
    assert replay_attachment_document(attached)['states'][0]['model']==model(attached)


@pytest.mark.parametrize('change',[
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,.2),
    lambda m:m['metadata']['augmentation']['inputs'][0]['maps']['vertices'].__setitem__(0,1),
    lambda m:m['metadata']['augmentation']['seamVertexPairs'][0].__setitem__('resultVertexId',7),
    lambda m:m['metadata']['augmentation']['inputs'][0].__setitem__('sourceSnapshotSha256','0'*64),
    lambda m:m['metadata']['augmentation']['faceOwners'][0].__setitem__('sourceFaceId',2),
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['augmentation']['measureEvidence'].__setitem__('disjointInteriorContent',99),
    lambda m:m['provenance']['parameters'].__setitem__('scale',2),
    lambda m:m['faces'][0].reverse(),
])
def test_complete_evidence_validation_rejects_tampered_maps_cycles_colors_units_and_measures(change):
    result=dispatch_attachment({'op':OPERATION,'model':cube(),'params':params()});change(result)
    with pytest.raises(GeometryError):verify_attachment_evidence(result)


def test_geometry_only_native_graph_validation_does_not_replace_attachment_attribute_replay():
    attached=run_attachment(document(),params());node=attached['operationHistory']['nodes'][-1]
    node['snapshot']['model']['metadata']['offColors']['faces'][0]['values'][3]=.1
    # Current native history accepts geometry-equivalent attributes; development
    # replay adds a full-source-attribute equality gate for this future operation.
    assert validate_document_history(attached)
    with pytest.raises(GeometryError,match='attribute verification'):
        replay_attachment_document(attached)


@pytest.mark.parametrize('change',[
    lambda r:r.update(unexpected=True),lambda r:r.update(op='transform'),lambda r:r.pop('model'),
    lambda r:r['params'].update(unexpected=True),lambda r:r['params'].pop('addition'),
    lambda r:r['params'].update(base_face_id=True),lambda r:r['params'].update(base_face_id=1.0),
    lambda r:r['params']['addition']['edges'][0].__setitem__(0,0.0),
    lambda r:r['model'].update(dimension=3.0),
    lambda r:r['params']['addition']['metadata'].update(unsafeInteger=2**53+1),
    lambda r:r['model']['metadata'].update(unsafeInteger=10**500),
    lambda r:r['model']['metadata'].update(invalidUnicode='\ud800'),
    lambda r:r['params'].update(scale=float('nan')),
])
def test_malformed_json_and_original_float_incidence_ids_refuse_without_normalizing_repairs(change):
    request={'op':OPERATION,'model':cube(),'params':params()};change(request)
    with pytest.raises(GeometryError):dispatch_attachment(request)


def test_deep_cyclic_input_is_structured_before_native_or_copy():
    request={'op':OPERATION,'model':cube(),'params':params()};request['model']['metadata']['cycle']=request
    with pytest.raises(GeometryError):dispatch_attachment(request)
    doc=document();nested={};doc['states'][0]['model']['metadata']['deep']=nested
    for _ in range(80):nested['next']={};nested=nested['next']
    with pytest.raises(GeometryError):run_attachment(doc,params())


def test_unsupported_development_version_refuses_replay_but_retains_readable_native_snapshot():
    attached=run_attachment(document(),params());attached['operationHistory']['nodes'][-1]['algorithmVersion']='future-unknown'
    assert validate_document_history(attached)
    with pytest.raises(GeometryError,match='version is unsupported'):
        replay_attachment_document(attached)


def test_large_integral_float_js_integer_token_spelling_is_explicitly_outside_initial_workflow_domain():
    value={'largeFloat':float(2**60)}
    assert javascript_roundtrip(value)['largeFloat']==1152921504606847000
    with pytest.raises(GeometryError,match='safe-integer'):
        equivalent_json(javascript_roundtrip(value))
    # Larger scientific float tokens remain finite binary64 values.
    value={'largeFloat':1e99}
    assert equivalent_json(javascript_roundtrip(value))==value


def test_production_history_and_recipe_registries_remain_identical():
    before=(dict(ALGORITHM_VERSIONS),REPLAY_OPERATIONS,RECORD_OPERATIONS)
    attached=run_attachment(document(),params());replay_attachment_document(attached)
    assert (dict(ALGORITHM_VERSIONS),REPLAY_OPERATIONS,RECORD_OPERATIONS)==before
    if OPERATION in before[0]: assert before[0][OPERATION]==VERSION


@pytest.mark.parametrize('correlation',[None,1,'native-job-uuid'])
def test_native_transport_correlation_and_explicit_development_version_are_not_geometry_parameters(correlation):
    request={'id':correlation,'op':OPERATION,'algorithmVersion':VERSION,'model':cube(),'params':params()}
    result=dispatch_attachment(request)
    assert counts(result)==(12,20,10,0) and verify_attachment_evidence(result)['passed']


@pytest.mark.parametrize('envelope',[{'id':True},{'id':{}},{'id':'x'*129},{'algorithmVersion':'future-version'}])
def test_malformed_native_envelope_refuses_structurally(envelope):
    request={'op':OPERATION,'model':cube(),'params':params(),**envelope}
    with pytest.raises(GeometryError):dispatch_attachment(request)


def test_large_scientific_float_coordinate_source_survives_real_node_evidence_validation():
    result=dispatch_attachment({'op':OPERATION,'model':cube(size=1e99),'params':params(addition=cube('addition-large',1e99))})
    assert counts(result)==(12,20,10,0)
    assert verify_attachment_evidence(javascript_roundtrip(result))['passed']


def test_direct_native_history_replay_returns_every_verified_dependency_and_preserves_caller():
    attached=run_attachment(document(),params())
    scaled=native_dispatch({'op':'recipe-run','params':{'document':attached,'operation':'transform','parameters':{'scale':2}}})
    graph=validate_document_history(scaled);before=graph.to_dict()
    calls=[]
    def tracked(request):
        calls.append(request['op']);return native_dispatch(request)
    states=replay_history(graph,tracked)
    assert set(states)=={node['id'] for node in before['nodes']}
    assert calls==['transform']
    for node in before['nodes']:
        assert states[node['id']]['model']==node['snapshot']['model']
    assert graph.to_dict()==before
    states[before['nodes'][-1]['id']]['model']['metadata']['coordinateUnits']='cm'
    assert graph.to_dict()==before


def test_direct_native_history_replay_refuses_rgba_tamper_but_source_target_stays_replayable():
    attached=run_attachment(document(),params());nodes=attached['operationHistory']['nodes']
    nodes[-1]['snapshot']['model']['metadata']['offColors']['faces'][0]['values'][3]=.1
    graph=validate_document_history(attached)
    assert replay_history(graph,native_dispatch,target=nodes[0]['id'])[nodes[0]['id']]['model']==nodes[0]['snapshot']['model']
    with pytest.raises(GeometryError,match='attribute verification'):
        replay_history(graph,native_dispatch)
    with pytest.raises(GeometryError,match='attribute verification'):
        native_dispatch({'op':'recipe-replay','params':{'document':attached}})


def test_direct_native_history_target_excludes_unrelated_tampered_attachment_branch():
    attached=run_attachment(document(),params())
    branched=branch_attachment(attached,params(cycle_offset=1))
    nodes=branched['operationHistory']['nodes'];selected=nodes[-1]['id']
    nodes[1]['snapshot']['model']['metadata']['offColors']['faces'][0]['values'][3]=.1
    graph=validate_document_history(branched)
    states=replay_history(graph,native_dispatch,target=selected)
    assert set(states)=={nodes[0]['id'],selected}
    assert states[selected]['model']==nodes[-1]['snapshot']['model']
    with pytest.raises(GeometryError,match='attribute verification'):
        replay_history(graph,native_dispatch)


def test_shared_history_helper_accepts_plain_graph_and_empty_history_and_rejects_unavailable_target():
    attached=run_attachment(document(),params());data=attached['operationHistory'];before=deepcopy(data)
    states=replay_attachment_history(data,native_dispatch)
    assert set(states)=={node['id'] for node in data['nodes']}
    assert replay_attachment_history({'version':1,'nodes':[]},native_dispatch)=={}
    with pytest.raises(GeometryError,match='unavailable'):
        replay_attachment_history(data,native_dispatch,target='')
    assert data==before


def test_branch_attachment_forwards_injected_dispatcher_for_original_transformed_parent():
    transformed=native_dispatch({'op':'recipe-run','params':{'document':document(),'operation':'transform','parameters':{'scale':2}}})
    attached=run_attachment(transformed,params(scale=2))
    calls=[]
    def tracked(request):
        calls.append(request['op']);return native_dispatch(request)
    branched=branch_attachment(attached,params(scale=2,base_face_id=3,addition_face_id=5),dispatcher=tracked)
    assert calls==['transform']
    assert counts(model(branched))==(12,20,10,0)
    assert {tuple(p) for p in model(branched)['vertices']}=={(x,y,z) for x in (0,2,4) for y in (0,2) for z in (0,2)}
    assert replay_history(validate_document_history(branched),tracked)[branched['states'][-1]['operationNode']]['model']==model(branched)
