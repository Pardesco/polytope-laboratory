from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

import pytest
from test_faceting_diagram import cube, tetra, ids
from engine.automatic_faceting import candidate_facets
from engine.faceting_diagram_workflow import dispatch_diagram
from engine.geometry import GeometryError
from engine.server import dispatch
from engine.formats import load_file, save_project, validate_project

ROOT=Path(__file__).resolve().parents[1]


def request(source=None,linked=False):
    source=source or cube();pool=dispatch({'op':'facet-candidates','model':source,'params':{}})
    params={'vertex_id':0}
    if linked:
        search=dispatch({'op':'facet-search','model':source,'params':{'candidate_ids':ids(pool,source['faces'])}})
        params.update(search=search,result_id=search['results'][0]['id'])
    return {'op':'facet-diagram','model':source,'params':{'catalogue':pool,'parameters':params}}


def test_actual_staged_dispatch_is_read_only_and_returns_safe_versioned_parameters():
    original=request();before=deepcopy(original)
    assert Path(sys.modules['engine.server'].__file__).resolve().is_relative_to(ROOT)
    result=dispatch(original)
    assert original==before and result['diagram']['status']=='complete'
    assert result['state']['kernelVersion']=='0.1.0' and result['state']['format']=='faceting-diagram'
    assert result['adoptionParameters'] is None and result['svg'].startswith('<svg')
    assert result['diagram']['sourceSnapshot']==original['model']
    assert not result['diagram']['enumerationComplete']


def test_native_Save_Open_history_replay_branch_and_selected_source_diagram_correspondence(tmp_path):
    # This is the actual native source publication gate used when importing a
    # literal file. Establish source caches BEFORE constructing owned evidence.
    initial={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'literal-import','cursor':0,'states':[{'model':cube(),'view':{}}]}]}
    source=validate_project(initial)['documents'][0]['states'][0]['model']
    reply=dispatch(request(source,True));state=reply['state']
    doc={'id':'diagram','cursor':0,'states':[{'model':source,'view':{'coordinateUnit':'mm','facetingDiagram':state},'notes':'literal source notes'}]}
    raw={'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
    path=tmp_path/'diagram.polyproj';save_project(path,raw)
    saved=load_file(path)['project']['documents'][0]
    restored=dispatch({'op':'facet-diagram','model':saved['states'][0]['model'],'params':{'state':saved['states'][0]['view']['facetingDiagram']}})
    assert restored==reply
    adopted=dispatch({'op':'recipe-run','params':{'document':saved,'operation':'facet-adopt','parameters':reply['adoptionParameters']}})
    assert adopted['states'][-1]['model']==reply['diagram']['adoption']['model']
    assert adopted['states'][-1]['notes']=='literal source notes'
    assert adopted['states'][-1]['view']['facetingDiagram']==state
    replay=dispatch({'op':'recipe-replay','params':{'document':adopted}})
    assert replay['states'][0]['model']==reply['diagram']['adoption']['model']
    assert replay['states'][0]['view']['facetingDiagram']==state
    branch=dispatch({'op':'recipe-branch','params':{'document':adopted,'parameters':reply['adoptionParameters']}})
    assert branch['states'][-1]['model']==reply['diagram']['adoption']['model']
    # The saved draft remains historical. It is never silently rebound to the
    # new base model, even when the selected result has the same coordinates.
    with pytest.raises(GeometryError,match='changed'):
        dispatch({'op':'facet-diagram','model':adopted['states'][-1]['model'],'params':{'state':state}})
    assert saved['states'][0]['model']==source


def test_uncached_source_changed_by_native_publication_requires_explicit_rebuild():
    original=request();reply=dispatch(original)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'fresh','cursor':0,'states':[{'model':deepcopy(original['model']),'view':{}}]}]}
    refreshed=validate_project(project)['documents'][0]['states'][0]['model']
    assert refreshed!=original['model'] and refreshed['vertices']==original['model']['vertices']
    with pytest.raises(GeometryError,match='source attributes'):
        dispatch({'op':'facet-diagram','model':refreshed,'params':{'state':reply['state']}})


def test_real_Node_state_roundtrip_and_cold_JSONL_process_are_equivalent():
    original=request(linked=True);reply=dispatch(original)
    raw=subprocess.run(['node','-e','let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s))))'],
        input=json.dumps(reply['state']),encoding='utf-8',capture_output=True,check=True).stdout
    response=dispatch({'op':'facet-diagram','model':original['model'],'params':{'state':json.loads(raw)}})
    assert response==reply
    cold=subprocess.run([sys.executable,'-B','-u','engine/server.py'],cwd=ROOT,
        input=json.dumps(original)+'\n',encoding='utf-8',capture_output=True,check=True)
    result=json.loads(cold.stdout);assert result['ok'] and result['result']==reply


@pytest.mark.parametrize('field',['RGBA','unit','notes','vertex','cycle','kernel','search'])
def test_tampered_source_state_search_receipt_or_version_rejected_without_mutation(field):
    original=request(linked=True);reply=dispatch(original);source=deepcopy(original['model']);state=deepcopy(reply['state'])
    if field=='RGBA':source['metadata']['offColors']['faces'][0]['values'][3]=.1
    elif field=='unit':source['metadata']['coordinateUnits']='cm'
    elif field=='notes':source['metadata']['notes']['owner']='altered'
    elif field=='vertex':source['vertices'][0][0]=-.5
    elif field=='cycle':state['catalogue']['candidates'][0]['cycle'].reverse()
    elif field=='kernel':state['kernelVersion']='0.2.0'
    else:state['parameters']['search']['results'][0]['cycles'][0].reverse()
    before=deepcopy((source,state))
    with pytest.raises(GeometryError):dispatch({'op':'facet-diagram','model':source,'params':{'state':state}})
    assert (source,state)==before


@pytest.mark.parametrize('change',[
    lambda r:r.update(op='other'),lambda r:r.update(extra=True),lambda r:r.update(algorithmVersion='future'),
    lambda r:r.update(id=True),lambda r:r.update(params={}),lambda r:r['params'].update(extra=1),
    lambda r:r.update(params={'state':{},'catalogue':{}}),lambda r:r.update(params=[]),
])
def test_strict_request_domain_and_native_JSON_protocol_continue_after_refusal(change):
    bad=request(tetra());change(bad)
    with pytest.raises(GeometryError):dispatch_diagram(bad)
    valid=request(tetra());run=subprocess.run([sys.executable,'-B','-u','engine/server.py'],cwd=ROOT,
        input=json.dumps(bad)+'\n'+json.dumps(valid)+'\n',encoding='utf-8',capture_output=True,check=True)
    responses=[json.loads(line) for line in run.stdout.splitlines()]
    assert not responses[0]['ok'] and responses[1]['ok']


def test_limited_canceled_and_source_mutated_jobs_never_publish_adoption_or_saved_state():
    original=request();original['params']['parameters']['max_work']=1
    limited=dispatch_diagram(original)
    assert limited['diagram']['status']=='resource-limited' and all(limited[k] is None for k in ('svg','state','adoptionParameters'))
    canceled=dispatch_diagram(request(),cancelled=lambda:True)
    assert canceled['diagram']['status']=='user-cancelled' and canceled['svg'] is None
    original=request()
    def mutate():original['model']['metadata']['coordinateUnits']='cm';return False
    with pytest.raises(GeometryError,match='ownership changed'):dispatch_diagram(original,cancelled=mutate)
