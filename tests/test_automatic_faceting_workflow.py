from copy import deepcopy
from itertools import combinations
import json
from pathlib import Path
import subprocess
import sys

import pytest

from test_automatic_faceting import cube, tetra, selected, cube_group, cube_tetra_cycles
from engine.automatic_faceting import candidate_facets
from engine.automatic_faceting_workflow import (dispatch_faceting, verify_search,
    verify_faceting_evidence, replay_faceting_history, VERSION)
from engine.server import dispatch
from engine.geometry import GeometryError, identity
from engine.formats import save_project, load_file
from engine.history import replay_history

ROOT=Path(__file__).resolve().parents[1]


def document(source=None):
    return {'id':'literal-document','cursor':0,'states':[{'model':source or tetra(),
        'view':{'coordinateUnit':'mm','angles':[0]*6},'notes':'entire original notes','label':'Literal source'}]}


def search(source,**params):return dispatch({'op':'facet-search','model':source,'params':params})


def adoption(source=None,**params):
    source=source or tetra();receipt=search(source,**params)
    return source,{'search':receipt,'result_id':receipt['results'][0]['id']}


def recipe(doc,params):return dispatch({'op':'recipe-run','params':{
    'document':doc,'operation':'facet-adopt','parameters':params}})


def test_actual_copied_dispatch_and_recipe_adoption_retain_full_source_and_receipts():
    source,args=adoption();before=deepcopy(source)
    assert Path(sys.modules['engine.server'].__file__).resolve().is_relative_to(ROOT)
    candidates=dispatch({'op':'facet-candidates','model':source,'params':{}})
    assert candidates['status']=='complete' and len(candidates['candidates'])==4
    assert all(c['sourceFaceIds'] for c in candidates['candidates'])
    model=dispatch({'op':'facet-adopt','model':source,'params':args})
    assert [len(model[k]) for k in ('vertices','edges','faces')]==[4,6,4]
    assert model['provenance']['sourceSnapshot']==source and model['metadata']['coordinateUnits']=='mm'
    assert model['metadata']['offColors']['faces']==source['metadata']['offColors']['faces']
    assert model['metadata']['automaticFacetingWorkflow']['search']==args['search']
    assert verify_faceting_evidence(model)['passed'] and source==before
    doc=document(source);before_doc=deepcopy(doc);result=recipe(doc,args)
    assert result['cursor']==1 and len(result['states'])==2 and doc==before_doc
    assert result['states'][-1]['model']==model and result['states'][-1]['notes']=='entire original notes'
    assert result['operationHistory']['nodes'][-1]['algorithmVersion']==VERSION


def test_native_history_replay_source_target_original_parent_branch_and_transform_descendant():
    source,args=adoption();doc=recipe(document(source),args)
    adopted=doc['states'][-1];node=doc['operationHistory']['nodes'][-1]
    states=replay_history(doc['operationHistory'],dispatch)
    assert states[node['id']]['model']==adopted['model']
    source_only=dispatch({'op':'recipe-replay','params':{'document':doc,'target':node['parent']}})
    assert source_only['states'][0]['model']==source
    replayed=dispatch({'op':'recipe-replay','params':{'document':doc}})
    assert replayed['states'][0]['model']==adopted['model']
    branch=dispatch({'op':'recipe-branch','params':{'document':doc,'parameters':args,'target':node['id']}})
    assert branch['states'][-1]['model']==adopted['model']
    assert branch['states'][-1]['model']['provenance']['sourceSnapshot']==source
    transformed=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'transform','parameters':{'scale':2}}})
    reread=dispatch({'op':'recipe-replay','params':{'document':transformed}})
    assert reread['states'][0]['model']==transformed['states'][-1]['model']
    assert reread['states'][0]['model']['vertices']==[[2*x for x in point] for point in adopted['model']['vertices']]
    for target in transformed['operationHistory']['nodes']:
        state=dispatch({'op':'recipe-replay','params':{'document':transformed,'target':target['id']}})['states'][0]
        assert state['model']==target['snapshot']['model']


def test_model_and_entire_history_survive_real_node_serialization_and_native_project_save_open(tmp_path):
    source,args=adoption(cube(),candidate_ids=selected(cube(),cube()['faces']))
    doc=recipe(document(source),args)
    serialized=subprocess.run(['node','-e','let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s))))'],
        input=json.dumps(doc),text=True,capture_output=True,check=True).stdout
    converted=json.loads(serialized)
    assert dispatch({'op':'recipe-replay','params':{'document':converted}})['states'][0]['model']==doc['states'][-1]['model']
    path=tmp_path/'faceting.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[converted]})
    loaded=load_file(path)['project']['documents'][0]
    assert loaded['states'][-1]['model']['metadata']==doc['states'][-1]['model']['metadata']
    assert dispatch({'op':'recipe-replay','params':{'document':loaded}})['states'][0]['model']==doc['states'][-1]['model']


def test_cooperative_cancellation_is_not_a_serialized_callback_and_prefix_adoption_reconstructs():
    source=cube();actions=cube_group(source);ids=selected(source,source['faces']+cube_tetra_cycles(source))
    generation_calls=0
    def count():
        nonlocal generation_calls
        generation_calls+=1;return False
    candidate_facets(source,symmetry_permutations=actions,cancelled=count)
    calls=0
    def cancel():
        nonlocal calls
        calls+=1;return calls>generation_calls+4
    receipt=dispatch_faceting({'op':'facet-search','model':source,'params':{
        'candidate_ids':ids,'symmetry_permutations':actions,'invariant_under_subgroup':True}},cancelled=cancel)
    assert receipt['status']=='user-cancelled' and receipt['nodesVisited']==4 and len(receipt['results'])==1
    assert verify_search(source,receipt)['passed']
    adopted=dispatch({'op':'facet-adopt','model':source,'params':{'search':receipt,'result_id':receipt['results'][0]['id']}})
    assert adopted['metadata']['automaticFacetingWorkflow']['search']['status']=='user-cancelled'
    assert verify_faceting_evidence(adopted)['passed']
    with pytest.raises(GeometryError,match='canceled'):
        dispatch_faceting({'op':'facet-adopt','model':source,'params':{'search':receipt,'result_id':receipt['results'][0]['id']}},cancelled=lambda:True)


@pytest.mark.parametrize('change',[
    lambda r:r.__setitem__('nodesVisited',0),
    lambda r:r.__setitem__('status','resource-limited'),
    lambda r:r.__setitem__('labeledSelectionsAccepted',99),
    lambda r:r['phaseStatus'].__setitem__('subsetSearch','not-started'),
    lambda r:r['limits'].__setitem__('nodeLimit',1),
    lambda r:r['criteria'].__setitem__('isohedral',True),
    lambda r:r['symmetry']['group']['orientationSigns'].__setitem__(0,-1),
    lambda r:r['results'][0]['criteriaEvidence']['planeFaceCounts'][0].__setitem__('faceCount',2),
    lambda r:r.__setitem__('unownedExtra',True)])
def test_search_accounting_and_every_source_action_filter_receipt_field_are_verified_not_just_selection(change):
    source,args=adoption();change(args['search']);before=deepcopy(source)
    with pytest.raises(GeometryError):dispatch({'op':'facet-adopt','model':source,'params':args})
    assert source==before


@pytest.mark.parametrize('change',[
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,.5),
    lambda m:m['metadata']['automaticFacetingWorkflow'].__setitem__('kernelResultModelId','forged'),
    lambda m:m['provenance']['sourceSnapshot']['metadata']['owner'].__setitem__('note','forged'),
    lambda m:m['metadata']['sourceFaceIds'][0].clear()])
def test_entire_adopted_model_source_attributes_and_maps_must_reconstruct(change):
    source,args=adoption();model=dispatch({'op':'facet-adopt','model':source,'params':args});change(model)
    with pytest.raises(GeometryError):verify_faceting_evidence(model)


@pytest.mark.parametrize('envelope',[
    [],{'op':'facet-search','model':tetra(),'params':[]},
    {'op':'facet-search','model':tetra(),'params':{},'extra':1},
    {'op':'facet-search','model':tetra(),'params':{},'id':True},
    {'op':'facet-search','model':tetra(),'params':{},'algorithmVersion':'future'},
    {'op':'facet-search','model':tetra(),'params':{'cancelled':True}},
    {'op':'facet-search','model':tetra(),'params':{'path':'arbitrary'}},
    {'op':'facet-candidates','model':tetra(),'params':{'criteria':{}}},
    {'op':'facet-search','model':tetra(),'params':{'criteria':{'spiky':True}}},
    {'op':'facet-search','model':tetra(),'params':{'criteria':{'tidy_dual':True}}},
    {'op':'facet-adopt','model':tetra(),'params':{}},
    {'op':'facet-adopt','model':tetra(),'params':{'search':{},'result_id':True}},
    {'op':'facet-search','model':tetra(),'params':{'node_limit':10**500}}])
def test_strict_native_envelopes_refuse_unknown_malformed_or_unsupported_requests(envelope):
    with pytest.raises(GeometryError):dispatch(envelope)


def test_empty_refused_or_limited_jobs_never_publish_a_model_and_recover_next_json_line():
    source=tetra();requests=[{'id':'bad','op':'facet-search','model':source,'params':{'criteria':{'spiky':True}}},
        {'id':'empty','op':'facet-search','model':source,'params':{'candidate_ids':[]}},
        {'id':'limited','op':'facet-search','model':source,'params':{'node_limit':1}},
        {'id':'good','op':'facet-search','model':source,'params':{}}]
    run=subprocess.run([sys.executable,'-B','-u','engine/server.py'],cwd=ROOT,
        input=''.join(json.dumps(r)+'\n' for r in requests),text=True,capture_output=True,check=True)
    replies=[json.loads(line) for line in run.stdout.splitlines()]
    assert len(replies)==4 and not replies[0]['ok'] and replies[0]['type']=='GeometryError'
    assert replies[1]['ok'] and replies[1]['result']['status']=='complete' and not replies[1]['result']['results']
    assert replies[2]['ok'] and replies[2]['result']['status']=='resource-limited' and not replies[2]['result']['results']
    assert replies[3]['ok'] and len(replies[3]['result']['results'])==1
    assert [r['id'] for r in replies]==['bad','empty','limited','good']


@pytest.mark.parametrize('target',[False,0,[],{},''])
def test_falsey_history_targets_are_never_silently_changed_to_current(target):
    source,args=adoption();doc=recipe(document(source),args)
    with pytest.raises(GeometryError):dispatch({'op':'recipe-replay','params':{'document':doc,'target':target}})
    with pytest.raises(GeometryError):dispatch({'op':'recipe-branch','params':{'document':doc,'target':target,'parameters':args}})


def test_portable_source_guards_and_bounded_history_publication_are_atomic(monkeypatch):
    import engine.automatic_faceting_workflow as workflow
    source,args=adoption();source['metadata']['unsafe']=2**60
    with pytest.raises(GeometryError,match='Unsafe integer'):search(source)
    source,args=adoption();doc=document(source);before=deepcopy(doc)
    monkeypatch.setattr(workflow,'DOCUMENT_BYTES',32)
    with pytest.raises(GeometryError):recipe(doc,args)
    assert doc==before


def test_recorded_history_attribute_tamper_fails_at_any_required_ancestor_without_recursion():
    source,args=adoption();doc=recipe(document(source),args)
    node=doc['operationHistory']['nodes'][-1]
    node['snapshot']['model']['metadata']['coordinateUnits']='cm'
    with pytest.raises(GeometryError):replay_faceting_history(doc['operationHistory'],dispatch)


def test_actual_convex_generated_source_transform_ancestor_and_alternative_original_parent_branch():
    source=dispatch({'op':'generate','params':{'kind':'regular','key':'cube'}})
    source['metadata']['coordinateUnits']='in'
    source['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.3,.5,.7,.9]} for _ in source['faces']],'cells':[]}
    base=dispatch({'op':'recipe-run','params':{'document':document(source),'operation':'transform','parameters':{'scale':2}}})
    parent=base['states'][-1]['model'];before=deepcopy(base)
    groups=[[i for i,point in enumerate(parent['vertices']) if sum(x>0 for x in point)%2==parity] for parity in (0,1)]
    assert [len(group) for group in groups]==[4,4]
    ids=selected(parent,parent['faces']+[list(face) for group in groups for face in combinations(group,3)])
    receipt=search(parent,candidate_ids=ids)
    assert receipt['status']=='complete' and len(receipt['results'])==2
    square=next(row for row in receipt['results'] if len(row['cycles'])==6)
    compound=next(row for row in receipt['results'] if len(row['cycles'])==8)
    adopted=recipe(base,{'search':receipt,'result_id':square['id']});assert base==before
    result=adopted['states'][-1]['model']
    assert result['vertices']==parent['vertices'] and result['provenance']['sourceSnapshot']==parent
    assert result['metadata']['coordinateUnits']=='in' and 'measure' not in result
    branched=dispatch({'op':'recipe-branch','params':{'document':adopted,
        'parameters':{'search':receipt,'result_id':compound['id']}}})
    other=branched['states'][-1]['model']
    assert len(other['faces'])==8 and other['provenance']['sourceSnapshot']==parent
    assert other['metadata']['offColors']['faces']==[None]*8
    assert dispatch({'op':'recipe-replay','params':{'document':branched}})['states'][0]['model']==other


def test_coincident_cycle_color_ambiguity_native_refusal_never_appends_or_changes_document():
    source=tetra();source['faces'].append(source['faces'][0].copy())
    source['metadata']['offColors']['faces'].append({'encoding':'unit','values':[1,0,0,1]})
    _,args=adoption(source);doc=document(source);before=deepcopy(doc)
    with pytest.raises(GeometryError,match='ambiguous'):recipe(doc,args)
    assert doc==before


def test_legitimate_notes_and_display_unit_edits_reroot_current_source_before_new_adoption():
    source,args=adoption();base=recipe(document(source),args)
    current=base['states'][-1];current['notes']='new literal note';current['view']['coordinateUnit']='cm'
    new_source,new_args=adoption(current['model'])
    committed=recipe(base,new_args);nodes=committed['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['snapshot']['notes']=='new literal note'
    assert nodes[-2]['snapshot']['view']['coordinateUnit']=='cm'
    replay=dispatch({'op':'recipe-replay','params':{'document':committed}})['states'][0]
    assert replay['notes']=='new literal note' and replay['view']['coordinateUnit']=='cm'
    assert replay['model']['provenance']['sourceSnapshot']==new_source


def test_actual_jsonl_nonobjects_invalid_utf8_correlations_and_syntax_errors_do_not_kill_next_job():
    source=tetra();bad_id={'id':'\ud800','op':'facet-search','model':source,'params':{}}
    good={'id':'recovered','op':'facet-search','model':source,'params':{}}
    lines=['[]','false','{"op":','{}',json.dumps(bad_id),json.dumps(good)]
    result=subprocess.run([sys.executable,'-B','-u','engine/server.py'],cwd=ROOT,
        input='\n'.join(lines)+'\n',text=True,capture_output=True,check=True)
    replies=[json.loads(line) for line in result.stdout.splitlines()]
    assert len(replies)==6 and all(not reply['ok'] for reply in replies[:-1])
    assert all(reply['id'] is None for reply in replies[:-1])
    assert replies[-1]['id']=='recovered' and replies[-1]['ok']
