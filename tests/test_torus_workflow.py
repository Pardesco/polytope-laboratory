"""Actual generator/server/project/history boundaries, without any GUI process."""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

import pytest

from engine.geometry import GeometryError, identity
from engine.history import canonical_model
from engine.server import dispatch


KINDS=('vertices','edges','faces','cells')


def counts(model):
    return tuple(len(model[kind]) for kind in KINDS)


def torus(**parameters):
    return dispatch({'op':'generate','params':{'kind':'torus',**parameters}})


def document(model):
    return {'id':'torus-source','cursor':0,'states':[{'model':model,
        'view':{'coordinateUnit':'mm','camera':{'position':[3,4,5]},
                'sectionNormal':[0,0,1],'sectionOffset':0,'entity':0},
        'notes':'Literal periodic genus-one source'}]}


def project(doc):
    return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}


def recipe(doc,height):
    return dispatch({'op':'recipe-run','params':{'document':doc,'operation':'polyhedron-prism',
        'parameters':{'height':height},'label':'Torus shell × interval'}})


def test_actual_default_generate_analyze_and_project_json_boundary():
    source=torus();before=deepcopy(source)
    assert counts(source)==(80,160,80,0)
    assert source['metadata']['family']=='Torus' and source['metadata']['topologicalGenus']==1
    assert source['provenance']['generator']=={'kind':'torus','parameters':{}}
    analysis=dispatch({'op':'analyze','model':source})
    assert analysis['counts']==dict(zip(KINDS,(80,160,80,0)))
    assert analysis['measure'] is None and analysis['validation']['eulerCharacteristic']==0
    restored=dispatch({'op':'validate-project','params':{
        'project':json.loads(json.dumps(project(document(source)),allow_nan=False))}})['documents'][0]['states'][0]['model']
    assert canonical_model(restored)==canonical_model(before) and restored['metadata']==before['metadata']
    assert source==before and 'constructionFinalization' not in source['metadata']


def test_actual_native_save_load_retains_generator_symbols_maps_rgba_and_no_volume(tmp_path):
    colors=[{'encoding':'unit','values':[.1,.3,.6,.25]}]+[None]*14+[{'encoding':'byte','values':[255,64,8]}]
    params={'ring_segments':4,'arm_segments':4,'arm_ratio':.25,'ring_radius':2,'face_colors':colors}
    request={'op':'generate','params':{'kind':'torus',**params}};before=deepcopy(request)
    model=dispatch(request);original=deepcopy(model)
    path=tmp_path/'torus-native.json'
    saved=dispatch({'op':'save','params':{'path':str(path),'project':project(document(model))}})
    assert saved['path']==str(path)
    restored=dispatch({'op':'load','params':{'path':str(path)}})['project']['documents'][0]['states'][0]['model']
    assert canonical_model(restored)==canonical_model(original)
    assert restored['metadata']==original['metadata'] and restored['provenance']==original['provenance']
    assert restored['metadata']['offColors']['faces']==colors
    assert request==before and model==original and 'measure' not in restored


def test_actual_torus_prism_native_recipe_replay_branch_and_undo_preserve_formal_caps():
    rgba={'encoding':'unit','values':[.2,.4,.7,.3]}
    source=torus(ring_segments=4,arm_segments=4,face_colors=[rgba]+[None]*15)
    doc=document(source);before=deepcopy(doc)
    lifted=recipe(doc,2);current=lifted['states'][-1]['model']
    assert counts(current)==(32,80,64,18)
    assert current['interpretation']=='generalized-complex' and 'measure' not in current
    info=current['metadata']['polyhedronPrism']
    assert info['sourceModel']==source and info['componentPartitions'][0]['sourceEulerCharacteristic']==0
    assert current['cells'][:2]==[list(range(16)),list(range(16,32))]
    assert current['vertices']==[point+[w] for w in (-1,1) for point in source['vertices']]
    assert current['metadata']['offColors']['faces']==[rgba]+[None]*15+[rgba]+[None]*47
    assert any('Euler characteristic differs' in warning for warning in current['validation']['warnings'])
    assert current['metadata']['constructionFinalization']['classification']['status']!='passed'
    assert current['components'] and len(current['components'])==1
    leaf=dispatch({'op':'compound-component','model':current,'params':{'component_id':current['components'][0]['id']}})
    assert canonical_model(leaf)==canonical_model(current)
    assert leaf['metadata']['offColors']==current['metadata']['offColors']
    with pytest.raises(GeometryError):
        dispatch({'op':'compound-drop','model':current,'params':{'component_id':current['components'][0]['id']}})
    native=dispatch({'op':'validate-project','params':{'project':json.loads(json.dumps(project(lifted),allow_nan=False))}})
    reopened=native['documents'][0]
    replay=dispatch({'op':'recipe-replay','params':{'document':reopened}})
    assert canonical_model(replay['states'][0]['model'])==canonical_model(current)
    assert replay['states'][0]['model']['metadata']['polyhedronPrism']['sourceModel']==source
    branch=dispatch({'op':'recipe-branch','params':{'document':reopened,'parameters':{'height':3}}})
    assert counts(branch['states'][-1]['model'])==(32,80,64,18)
    assert set(p[3] for p in branch['states'][-1]['model']['vertices'])=={-1.5,1.5}
    assert branch['states'][-1]['model']['metadata']['polyhedronPrism']['sourceModel']==source
    reopened['cursor']=0
    assert canonical_model(reopened['states'][reopened['cursor']]['model'])==canonical_model(source)
    reopened['cursor']=1
    assert canonical_model(reopened['states'][reopened['cursor']]['model'])==canonical_model(current)
    assert doc==before and source==before['states'][0]['model']


@pytest.mark.parametrize('params',[{'unknown':True},{'ring_segments':True},{'arm_segments':10**500},
    {'ring_segments':100,'arm_segments':100},{'arm_ratio':1},{'arm_ratio':1e-100},
    {'ring_radius':10**500},{'face_colors':[None]}])
def test_actual_strict_generation_refusal_is_atomic(params):
    request={'op':'generate','params':{'kind':'torus',**params}};before=deepcopy(request)
    with pytest.raises(GeometryError):
        dispatch(request)
    assert request==before and counts(torus(ring_segments=3,arm_segments=3))==(9,18,9,0)


@pytest.mark.parametrize('height',[0,-1,True,10**500])
def test_failed_prism_keeps_current_torus_document_history(height):
    doc=document(torus(ring_segments=4,arm_segments=4));before=deepcopy(doc)
    with pytest.raises(GeometryError):
        recipe(doc,height)
    assert doc==before and doc['cursor']==0 and len(doc['states'])==1


def test_actual_hidden_json_lines_process_continues_after_structured_refusal():
    source=torus(ring_segments=4,arm_segments=4)
    requests=[{'id':'default','op':'generate','params':{'kind':'torus'}},
              {'id':'huge','op':'generate','params':{'kind':'torus','ring_radius':10**500}},
              {'id':'horn','op':'generate','params':{'kind':'torus','arm_ratio':1}},
              {'id':'native','op':'validate-project','params':{'project':project(document(source))}},
              {'id':'lift','op':'polyhedron-prism','model':source,'params':{'height':2}},
              {'id':'small','op':'generate','params':{'kind':'torus','ring_segments':3,'arm_segments':3}}]
    process=subprocess.run([sys.executable,'-m','engine.server'],
        input=''.join(json.dumps(request,allow_nan=False)+'\n' for request in requests),
        text=True,encoding='utf-8',capture_output=True,cwd=Path(__file__).resolve().parents[1],
        timeout=30,check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert not process.stderr
    replies=[json.loads(line) for line in process.stdout.splitlines()]
    assert [reply['id'] for reply in replies]==['default','huge','horn','native','lift','small']
    assert [reply['ok'] for reply in replies]==[True,False,False,True,True,True]
    assert replies[1]['type']==replies[2]['type']=='GeometryError'
    restored=replies[3]['result']['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(source) and restored['metadata']==source['metadata']
    assert counts(replies[4]['result'])==(32,80,64,18)
    assert replies[4]['result']['interpretation']=='generalized-complex'
    assert counts(replies[-1]['result'])==(9,18,9,0)
