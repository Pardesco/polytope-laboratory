"""Actual mounted native dispatch/recipes; no dispatcher monkeypatch or GUI."""
from copy import deepcopy
import json
import os
import subprocess
import sys

import numpy as np
import pytest

from engine.cell_attributes import VERSION, LEGACY_VERSION, run_cell, verify_cell_evidence
from engine.augmentation_workflow import equivalent_json
from engine.formats import load_file
from engine.geometry import GeometryError, identity
from engine.history import ALGORITHM_VERSIONS, replay_history, validate_history
from engine.nets import extract_entity
from engine.server import dispatch
from test_cell_attributes import literal_tesseract, document, model, project, assert_cube


def recipe(doc, operation='cell', parameters=None):
    return dispatch({'op':'recipe-run','params':{'document':doc,'operation':operation,
        'parameters':{} if parameters is None else parameters}})


def replay(doc, target=None):
    return dispatch({'op':'recipe-replay','params':{'document':doc,**({'target':target} if target is not None else {})}})


def without_id(value):
    result=deepcopy(value);result.pop('id',None);return equivalent_json(result)


def test_actual_default_cell_and_explicit_version_preserve_full_source_null_face_rgba_and_units():
    source=literal_tesseract();source['metadata']['offColors']['faces'][source['cells'][0][0]]=None
    before=deepcopy(source);request={'op':'cell','model':source,'params':{'index':0}}
    current=dispatch(request);explicit=dispatch({**request,'algorithmVersion':VERSION})
    assert equivalent_json(current)==equivalent_json(explicit);assert_cube(current,source)
    assert current['metadata']['offColors']['faces'][0] is None
    assert current['metadata']['offColors']['cells']==[]
    assert current['metadata']['cellExtraction']['selectedCellColor'] is not None
    assert source==before and ALGORITHM_VERSIONS['cell']==VERSION


def test_actual_explicit_legacy_cell_matches_frozen_kernel_and_face_default_remains_legacy():
    source=literal_tesseract(convex=True)
    old=dispatch({'op':'cell','model':source,'params':{},'algorithmVersion':LEGACY_VERSION})
    assert without_id(old)==without_id(extract_entity(source))
    assert 'cellExtraction' not in old['metadata'] and 'coordinateUnits' not in old['metadata']
    face=dispatch({'op':'cell','model':source,'params':{'kind':'face'}})
    assert without_id(face)==without_id(extract_entity(source,kind='face'))
    assert face['dimension']==2 and face['provenance']['algorithmVersion']==LEGACY_VERSION
    with pytest.raises(GeometryError):dispatch({'op':'cell','model':source,'params':{'kind':'face'},'algorithmVersion':VERSION})


def test_actual_new_recipe_branch_replay_and_source_only_target_keep_attribute_binding():
    source=document();model(source)['fingerprint']=identity(model(source));before=deepcopy(source);result=recipe(source,parameters={'index':0})
    assert result['operationHistory']['nodes'][-1]['algorithmVersion']==VERSION
    assert_cube(model(result),model(source));assert source==before
    assert equivalent_json(model(replay(result)))==equivalent_json(model(result))
    branch=dispatch({'op':'recipe-branch','params':{'document':result,'parameters':{'index':1}}})
    assert_cube(model(branch),model(source),1)
    assert branch['operationHistory']['nodes'][-1]['algorithmVersion']==VERSION
    assert branch['operationHistory']['nodes'][-1]['parent']==result['operationHistory']['nodes'][-1]['parent']
    assert equivalent_json(model(replay(branch)))==equivalent_json(model(branch))
    target=result['operationHistory']['nodes'][0]['id']
    assert equivalent_json(model(replay(branch,target)))==equivalent_json(model(source))


def test_actual_face_recipe_records_legacy_version_and_legacy_cell_branch_does_not_upgrade():
    face=recipe(document(),parameters={'kind':'face','index':0})
    assert model(face)['dimension']==2;assert face['operationHistory']['nodes'][-1]['algorithmVersion']==LEGACY_VERSION
    assert without_id(model(replay(face)))==without_id(model(face))
    old=run_cell(document(literal_tesseract(convex=True)),{'index':0},version=LEGACY_VERSION)
    assert without_id(model(replay(old)))==without_id(model(old))
    branch=dispatch({'op':'recipe-branch','params':{'document':old,'parameters':{'index':1}}})
    assert branch['operationHistory']['nodes'][-1]['algorithmVersion']==LEGACY_VERSION
    assert 'cellExtraction' not in model(branch)['metadata']
    assert without_id(model(replay(branch)))==without_id(model(branch))


def test_actual_undo_source_attribute_edit_reroots_full_snapshot_before_current_cell():
    first=recipe(document());first['cursor']=0
    parent=model(first);parent['metadata']['coordinateUnits']='cm'
    parent['metadata']['offColors']['cells'][1]=None
    parent['metadata']['offColors']['faces'][parent['cells'][1][0]]=None
    before=deepcopy(first);second=recipe(first,parameters={'index':1})
    nodes=second['operationHistory']['nodes'];assert nodes[-2]['op']=='source'
    assert nodes[-2]['parent']==nodes[0]['id'];assert nodes[-1]['parent']==nodes[-2]['id']
    assert model(second)['metadata']['coordinateUnits']=='cm'
    assert model(second)['metadata']['cellExtraction']['selectedCellColor'] is None
    assert model(second)['metadata']['offColors']['faces'][0] is None
    assert model(second)['metadata']['cellExtraction']['sourceModel']==equivalent_json(parent)
    assert first==before;assert equivalent_json(model(replay(second)))==equivalent_json(model(second))


def test_actual_custom_4d_ancestor_cell_and_custom_3d_descendant_use_full_attribute_replay():
    parent=recipe(document(),'convex-core-4d',{'center':[0,0,0,0]})
    extracted=recipe(parent,parameters={'index':0})
    assert model(extracted)['metadata']['cellExtraction']['sourceModel']==equivalent_json(model(parent))
    assert np.array(model(extracted)['vertices']).mean(axis=0)==pytest.approx(np.zeros(3),abs=1e-12)
    descendant=recipe(extracted,'convex-core',{'center':[0,0,0]})
    assert equivalent_json(model(replay(descendant)))==equivalent_json(model(descendant))
    assert model(descendant)['metadata']['coordinateUnits']=='mm'
    node=extracted['operationHistory']['nodes'][-1]['id']
    assert equivalent_json(model(replay(descendant,node)))==equivalent_json(model(extracted))


def test_actual_cell_zonohedron_transform_mixed_history_retains_historical_cell_owner():
    extracted=recipe(document(),parameters={'index':3});current=model(extracted)
    zoned=recipe(extracted,'source-zonohedron',{'selections':[{'kind':'world-axes','ids':[0,1,2]}]})
    transformed=recipe(zoned,'transform',{'translation':[2,3,4]})
    assert equivalent_json(model(replay(transformed)))==equivalent_json(model(transformed))
    target=extracted['states'][extracted['cursor']]['operationNode']
    retained=model(replay(transformed,target))
    assert equivalent_json(retained)==equivalent_json(current)
    assert retained['metadata']['offColors']['cells']==[]
    assert retained['metadata']['cellExtraction']['selectedCellColor']==current['metadata']['cellExtraction']['selectedCellColor']
    states=replay_history(transformed['operationHistory'],dispatch)
    for node in transformed['operationHistory']['nodes']:
        assert equivalent_json(states[node['id']]['model'])==equivalent_json(node['snapshot']['model'])


@pytest.mark.parametrize('field',['face-color','parent-cell-color','unit','face-map'])
def test_actual_replay_refuses_attribute_forgery_which_geometry_hash_cannot_detect(field):
    result=recipe(document());node=result['operationHistory']['nodes'][-1];current=node['snapshot']['model']
    before=identity(current)
    if field=='face-color':current['metadata']['offColors']['faces'][0]=None
    elif field=='parent-cell-color':current['metadata']['cellExtraction']['sourceModel']['metadata']['offColors']['cells'][0]=None
    elif field=='unit':current['metadata']['coordinateUnits']='cm'
    else:current['metadata']['cellExtraction']['maps']['faces'][0]=999
    assert identity(current)==before;assert validate_history(result['operationHistory'])
    with pytest.raises(GeometryError):replay(result)
    with pytest.raises(GeometryError):replay_history(result['operationHistory'],dispatch)


def test_actual_native_save_load_replay_preserves_face_colors_and_historical_cell_rgba(tmp_path):
    result=recipe(document());before=deepcopy(result);path=tmp_path/'cell-v02.polyproj'
    dispatch({'op':'save','params':{'path':str(path),'project':project(result)}})
    loaded=load_file(path)['project']['documents'][0]
    assert equivalent_json(model(loaded))==equivalent_json(model(result))
    assert verify_cell_evidence(model(loaded))['passed']
    assert equivalent_json(model(replay(loaded)))==equivalent_json(model(result));assert result==before


@pytest.mark.parametrize('version',[None,True,2,'future',''])
def test_actual_dispatch_refuses_explicit_unknown_version_before_any_publication(version):
    source=literal_tesseract();before=deepcopy(source)
    with pytest.raises(GeometryError):dispatch({'op':'cell','model':source,'params':{},'algorithmVersion':version})
    assert source==before


def test_actual_json_lines_server_selects_both_versions_and_continues_after_refusal():
    source=literal_tesseract();requests=[{'id':'new','op':'cell','model':source,'params':{}},
        {'id':'old','op':'cell','model':source,'params':{},'algorithmVersion':LEGACY_VERSION},
        {'id':'bad','op':'cell','model':source,'params':{},'algorithmVersion':'future'},
        {'id':'catalog','op':'catalog'}]
    child=subprocess.run([sys.executable,'-B','-m','engine.server'],input='\n'.join(json.dumps(r) for r in requests)+'\n',capture_output=True,text=True,timeout=30,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    rows=[json.loads(s) for s in child.stdout.splitlines()];assert [r['id'] for r in rows]==['new','old','bad','catalog']
    assert rows[0]['ok'];assert rows[0]['result']['provenance']['algorithmVersion']==VERSION;assert_cube(rows[0]['result'],source)
    assert rows[1]['ok'];assert rows[1]['result']['provenance']['algorithmVersion']==LEGACY_VERSION
    assert 'cellExtraction' not in rows[1]['result']['metadata'];assert 'error' in rows[2];assert rows[3]['ok']


@pytest.mark.parametrize('kind,index,counts',[('cell120',119,[20,30,12,0]),('cell600',599,[4,6,4,0])])
def test_actual_registered_regular_sources_keep_last_cell_full_owner_rgba_units_and_replay(kind,index,counts):
    source=dispatch({'op':'generate','params':{'kind':'regular','key':kind}})
    source['metadata']['coordinateUnits']='in'
    source['metadata']['retainedAttribute']={'family':kind,'literal':'full source, not selected-cell-only history'}
    source['metadata']['offColors']={
        'faces':[None if i%7==0 else {'encoding':'byte','values':[i%256,70,170,129]} for i in range(len(source['faces']))],
        'cells':[{'encoding':'unit','values':[.25,.75,.5,.3]} for _ in source['cells']]}
    before=deepcopy(source);result=recipe(document(source),parameters={'index':index});current=model(result)
    assert [len(current[k]) for k in ('vertices','edges','faces','cells')]==counts
    evidence=current['metadata']['cellExtraction'];maps=evidence['maps']
    assert maps['cells']==[index] and maps['faces']==source['cells'][index]
    assert current['metadata']['offColors']['faces']==[source['metadata']['offColors']['faces'][f] for f in maps['faces']]
    assert current['metadata']['offColors']['cells']==[] and current['metadata']['coordinateUnits']=='in'
    assert evidence['selectedCellColor']==source['metadata']['offColors']['cells'][index]
    assert evidence['sourceModel']==equivalent_json(source)
    assert [[maps['vertices'][v] for v in f] for f in current['faces']]==[source['faces'][f] for f in source['cells'][index]]
    reconstructed=np.array(current['vertices'])@np.array(evidence['frame']['basis']).T+evidence['frame']['origin']
    assert np.allclose(reconstructed,[source['vertices'][v] for v in maps['vertices']],rtol=1e-12,atol=1e-12)
    assert verify_cell_evidence(current)['passed'];assert equivalent_json(model(replay(result)))==equivalent_json(current)
    assert source==before
