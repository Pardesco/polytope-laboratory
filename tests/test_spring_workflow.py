"""Native graph/project + independent policy checks for spring/0.1."""
from copy import deepcopy
import json
import math
import os
import subprocess

import numpy as np
import pytest

from engine.augmentation_workflow import checked_document,equivalent_json
from engine.formats import save_project,load_file,validate_project
from engine.geometry import GeometryError,identity
from engine.history import validate_history,validate_document_history
from engine.recipes import run_recipe
from engine.server import dispatch
from development.test_spring_relaxation import tetra,cube,pins,distances
from development import spring_relaxation as frozen
from engine import spring_workflow as flow


def document(source=None):
    source=tetra() if source is None else source
    source=deepcopy(source);source.setdefault('interpretation','generalized-complex')
    return checked_document({'id':'spring-source-document','cursor':0,'states':[{
        'model':source,
        'view':{'coordinateUnit':'mm','entity':2,'sectionNormal':[0,0,1],'derivedMode':'section',
                'orientationFrame':None,'cellFacing':'all','hiddenCells':[]},'notes':'Source note unchanged'}]})
def model(doc):return doc['states'][doc['cursor']]['model']
def project(doc):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
def owner(doc):return {'workspaceId':'workspace-1','documentId':doc['id'],'generation':4,'exporting':False}
def same(a,b):return equivalent_json(a)==equivalent_json(b)


def test_default_recorded_operation_preserves_independent_tetra_metrics_fullsource_and_attributes():
    source=document();before=deepcopy(source);result=flow.run_spring(source,{})
    assert source==before and result['cursor']==1
    child=model(result);p=np.array(child['vertices'])
    np.testing.assert_allclose(distances(p,model(source)['edges']),1,atol=1e-8)
    assert abs(np.linalg.det(np.array([p[i]-p[0] for i in [1,2,3]])))/6==pytest.approx(math.sqrt(2)/12,abs=1e-8)
    assert child['edges']==model(source)['edges'] and child['faces']==model(source)['faces']
    assert child['metadata']['coordinateUnits']=='mm'
    assert child['metadata']['offColors']==model(source)['metadata']['offColors']
    assert same(child['metadata']['springRelaxation']['sourceModel'],model(source))
    assert child['metadata']['springRelaxation']['maps']=={'vertices':list(range(4)),'edges':list(range(6)),'faces':list(range(4))}
    node=result['operationHistory']['nodes'][-1]
    assert node['op']==flow.OPERATION and node['algorithmVersion']=='0.1.0'
    assert node['params']=={'solver':{},'adoption':'constraints-satisfied'}
    assert result['states'][-1]['notes']=='Source note unchanged' and model(result)['interpretation']=='generalized-complex'
    assert flow.verify_spring_model(child,model(source))['passed']
    assert not child['metadata']['springOperation']['uniformityEstablished']


def test_replay_alltargets_original_parent_branch_and_undo_cursor_bindings():
    result=flow.run_spring(document(),{'solver':{'initialization':'random','seed':19}})
    nodes=result['operationHistory']['nodes'];source_id,operation_id=nodes[0]['id'],nodes[-1]['id']
    assert same(model(flow.replay_spring_document(result)),model(result))
    assert same(model(flow.replay_spring_document(result,source_id)),result['states'][0]['model'])
    states=flow.replay_spring_history(result['operationHistory']);assert set(states)=={source_id,operation_id}
    branch=flow.branch_spring(result,{'solver':{'edge_length':2}},operation_id)
    bnodes=branch['operationHistory']['nodes']
    assert bnodes[-1]['parent']==nodes[-1]['parent'] and bnodes[-1]['algorithmVersion']=='0.1.0'
    np.testing.assert_allclose(distances(np.array(model(branch)['vertices']),model(branch)['edges']),2,atol=1e-8)
    assert same(model(flow.replay_spring_document(branch)),model(branch))
    result['cursor']=0
    assert same(model(result),nodes[0]['snapshot']['model'])
    next_result=flow.run_spring(result,{'solver':{'edge_length':1.5}})
    assert len(next_result['states'])==2 and len(next_result['operationHistory']['nodes'])==3
    assert next_result['operationHistory']['nodes'][-1]['parent']==source_id


def test_actual_native_project_and_node_numeric_roundtrip_keeps_receipts_and_replays(tmp_path):
    result=flow.run_spring(document(),{'solver':{'edge_length':1.0,'seed':0}})
    code="let t='';process.stdin.on('data',x=>t+=x).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    process=subprocess.run(['node','-e',code],input=json.dumps(project(result)),capture_output=True,text=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert process.returncode==0,process.stderr
    serialized=json.loads(process.stdout);path=tmp_path/'springs.polyproj'
    save_project(path,serialized);restored=load_file(path)['project']['documents'][0]
    assert same(model(restored),model(result))
    assert flow.verify_spring_model(model(restored),restored['states'][0]['model'])['passed']
    assert same(model(flow.replay_spring_document(restored)),model(restored))
    assert validate_document_history(restored) is not None


def test_real_registered_transform_before_and_after_spring_replays_all_fullattributes():
    parent=run_recipe(document(),'transform',{'translation':[7,-11,3]},dispatch)
    spring=flow.run_spring(parent,{})
    child=run_recipe(spring,'transform',{'translation':[2,3,-4]},dispatch)
    assert same(model(flow.replay_spring_document(child)),model(child))
    for node in child['operationHistory']['nodes']:
        replayed=flow.replay_spring_document(child,node['id'])
        assert same(model(replayed),node['snapshot']['model'])
    assert model(child)['metadata']['coordinateUnits']=='mm'
    assert model(child)['metadata']['offColors']==model(document())['metadata']['offColors']


def test_native_source_zonohedron_descendant_after_spring_replays_full_source_lineage():
    spring=flow.run_spring(document(),{})
    child=run_recipe(spring,'source-zonohedron',{'selections':[{'kind':'world-axes','ids':[2,0,1]}]},dispatch)
    assert same(model(flow.replay_spring_document(child)),model(child))
    snapshot=model(child)['metadata']['sourceZonohedron']['sourceModel']
    assert same(snapshot,model(spring))


def test_preview_does_not_record_and_unresolved_default_adoption_refuses_atomically():
    source=document();params={'solver':{'pins':pins(model(source))}};before=deepcopy(source)
    preview=flow.preview_spring(model(source),params)
    assert preview['recipeRecorded'] is False and preview['result']['status']=='stationary-residual'
    assert preview['adoption']['publishable'] and preview['adoption']['requiresExplicitNearMiss']
    assert not preview['adoption']['uniformityEstablished']
    with pytest.raises(GeometryError,match='explicit valid-near-miss'):flow.run_spring(source,params)
    assert source==before and 'operationHistory' not in source


def test_explicit_valid_near_miss_adoption_is_not_relabelled_convergence_or_uniformity():
    source=document();params={'solver':{'pins':pins(model(source))},'adoption':'valid-near-miss'}
    result=flow.run_spring(source,params);record=model(result)['metadata']['springOperation']
    assert record['adoption']=='valid-near-miss' and record['resultStatus']=='stationary-residual'
    assert record['requestedConstraintsSatisfied'] is False and record['certified'] is False
    assert model(result)['metadata']['springRelaxation']['residuals']['maximumAbsoluteNormalizedResidual']==pytest.approx(math.sqrt(8)-1)
    assert flow.verify_spring_model(model(result),model(source))['passed']
    assert same(model(flow.replay_spring_document(result)),model(result))


def test_evaluation_limited_adopted_result_replays_identically_without_wall_clock():
    params={'solver':{'initialization':'random','seed':15,'max_evaluations':1},'adoption':'valid-near-miss'}
    a=flow.run_spring(document(),params);b=flow.run_spring(document(),params)
    assert same(model(a),model(b));assert model(a)['metadata']['springOperation']['resultStatus']=='evaluation-limit'
    assert same(model(flow.replay_spring_document(a)),model(a))
    assert 'max_seconds' not in model(a)['metadata']['springRelaxation']['parameters']


def test_time_is_never_read_for_recorded_solver_when_no_runtime_timeout(monkeypatch):
    def forbidden():raise AssertionError('Recorded solve must not branch on clock')
    monkeypatch.setattr(flow.time,'monotonic',forbidden)
    result=flow.run_spring(document(),{})
    assert same(model(flow.replay_spring_document(result)),model(result))


def test_runtime_timeout_after_actual_function_trial_records_no_hardware_partial(monkeypatch):
    source=document();before=deepcopy(source);state={'expired':False}
    monkeypatch.setattr(flow.time,'monotonic',lambda:2 if state['expired'] else 0)
    def progress(_):state['expired']=True
    with pytest.raises(GeometryError,match='no hardware-dependent partial'):
        flow.run_spring(source,{'adoption':'valid-near-miss'},runtime={'max_seconds':1},progress=progress)
    assert source==before and 'operationHistory' not in source


@pytest.mark.parametrize('change',['source','unit','palette','history','view','cursor','params','generation','workspace','export'])
def test_numeric_work_cannot_publish_after_source_params_or_owner_changes(change):
    source=document();params={'solver':{}};live=owner(source)
    def progress(_):
        if change=='source':model(source)['vertices'][0][0]=2
        elif change=='unit':model(source)['metadata']['coordinateUnits']='cm'
        elif change=='palette':model(source)['metadata']['offColors']['faces'][0]['values'][3]=.7
        elif change=='history':source['operationHistory']={'bad':True}
        elif change=='view':source['states'][0]['view']['entity']=3
        elif change=='cursor':source['cursor']=1
        elif change=='params':params['solver']['edge_length']=2
        elif change=='generation':live['generation']+=1
        elif change=='workspace':live['workspaceId']='new-workspace'
        else:live['exporting']=True
    with pytest.raises(GeometryError):flow.run_spring(source,params,get_owner=lambda:live,progress=progress)
    assert len(source['states'])==1


@pytest.mark.parametrize('stage',['before','function','validation'])
def test_canceled_solver_or_adoption_does_not_append_history(stage,monkeypatch):
    source=document();before=deepcopy(source);live={'cancel':stage=='before'}
    if stage=='validation':
        original=flow.validate_project
        def gate(*args,**kwargs):live['cancel']=True;return original(*args,**kwargs)
        monkeypatch.setattr(flow,'validate_project',gate)
    def progress(_):
        if stage=='function':live['cancel']=True
    with pytest.raises(GeometryError,match='canceled'):
        flow.run_spring(source,{},cancel=lambda:live['cancel'],progress=progress)
    assert source==before


def test_nonplanar_preview_can_be_solved_but_invalid_pinned_preview_cannot_be_adopted():
    source=cube();source['vertices'][0][0]+=.3
    solved=flow.preview_spring(source,{'solver':{'regular_faces':True}})
    assert solved['result']['status']=='constraints-satisfied' and solved['adoption']['publishable']
    before=deepcopy(source);params={'solver':{'pins':pins(source)},'adoption':'valid-near-miss'}
    bad=flow.preview_spring(source,params);assert not bad['adoption']['publishable']
    with pytest.raises(GeometryError,match='not publishable'):flow.adopt_spring(source,params)
    assert source==before


def test_closed_rank_collapsed_preview_never_becomes_a_recorded_model():
    source=tetra();source['vertices']=[[0,0,0]]*4
    preview=flow.preview_spring(source,{'adoption':'valid-near-miss'})
    assert preview['result']['status']=='invalid-realization'
    with pytest.raises(GeometryError,match='not publishable'):flow.adopt_spring(source,{'adoption':'valid-near-miss'})


@pytest.mark.parametrize('field',['unit','palette','historyAttribute'])
def test_changed_historical_source_attributes_reroot_and_replay_exactly(field):
    result=flow.run_spring(document(),{});result['cursor']=0
    source=model(result)
    if field=='unit':source['metadata']['coordinateUnits']='cm'
    elif field=='palette':source['metadata']['offColors']['faces'][0]=None
    else:source['metadata']['arbitraryHistoricalAttribute']['literal'][0]=7
    updated=flow.run_spring(result,{});nodes=updated['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['parent']==nodes[0]['id']
    assert same(model(updated)['metadata']['springRelaxation']['sourceModel'],updated['states'][0]['model'])
    assert same(model(flow.replay_spring_document(updated)),model(updated))


@pytest.mark.parametrize('change',[
    lambda d:d['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['offColors']['faces'].__setitem__(0,None),
    lambda d:d['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['springRelaxation']['residuals'].__setitem__('weightedSpringEnergy',42),
    lambda d:d['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['springOperation'].__setitem__('uniformityEstablished',True),
    lambda d:d['operationHistory']['nodes'][-1]['params']['solver'].__setitem__('edge_length',2),
    lambda d:d['operationHistory']['nodes'][0]['snapshot']['model']['metadata'].__setitem__('coordinateUnits','cm'),
])
def test_replay_rejects_tampered_full_attributes_constraints_and_residuals(change):
    result=flow.run_spring(document(),{});change(result)
    with pytest.raises(GeometryError):flow.replay_spring_document(result)


def test_unknown_algorithm_or_backend_refuses_replay_but_snapshot_remains_native_readable():
    result=flow.run_spring(document(),{});before=deepcopy(result)
    node=result['operationHistory']['nodes'][-1];node['algorithmVersion']='9.0.0'
    validate_project(project(result));assert model(result)['vertices']==model(before)['vertices']
    with pytest.raises(GeometryError,match='version unsupported'):flow.replay_spring_document(result)
    result=before;result['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['springRelaxation']['implementation']['scipyVersion']='future-version'
    with pytest.raises(GeometryError,match='backend differs'):flow.replay_spring_document(result)


@pytest.mark.parametrize('params',[
    {'max_seconds':1},{'solver':{'max_seconds':1}},{'solver':{'seed':1.0}},
    {'solver':{'pins':[{'vertex':1.0,'position':[0,0,0]}]}},
    {'adoption':True},{'adoption':'uniform'},{'solver':{'face_steps':[1.,1,1,1]}},
    {'solver':{'max_evaluations':1.0}},{'unknown':None},
])
def test_strict_policy_and_literal_parameter_syntax(params):
    with pytest.raises(GeometryError):flow.run_spring(document(),params)


@pytest.mark.parametrize('packet',[
    {'op':'spring-relaxation','model':tetra(),'params':{},'id':True},
    {'op':'spring-relaxation','model':tetra(),'params':{},'algorithmVersion':False},
    {'op':'spring-relaxation','model':tetra(),'params':{},'unexpected':1},
    {'op':'spring-relaxation','model':tetra(),'params':{},'algorithmVersion':'0.2.0'},
])
def test_dispatch_envelope_refusals(packet):
    with pytest.raises(GeometryError):flow.dispatch_spring(packet)


def test_preview_vs_recordable_model_dispatch_schema():
    source=tetra();preview=flow.dispatch_spring({'op':flow.PREVIEW_OPERATION,'model':source,'params':{}})
    assert preview['operation']==flow.PREVIEW_OPERATION and not preview['recipeRecorded']
    adopted=flow.dispatch_spring({'op':flow.OPERATION,'model':source,'params':{},'algorithmVersion':'0.1.0','id':'job-1'})
    assert adopted['metadata']['springOperation']['algorithmVersion']=='0.1.0'
    assert flow.verify_spring_model(adopted,source)['passed']


def test_workflow_numeric_geometry_matches_frozen_original_candidate_without_clock_choice():
    source=tetra();source['vertices'][0]=[1.1,.9,1.02]
    old=frozen.relax_spring_network(source,{'max_seconds':120,'initialization':'random','seed':11})
    new=flow.preview_spring(source,{'solver':{'initialization':'random','seed':11}})['result']
    np.testing.assert_array_equal(old['model']['vertices'],new['model']['vertices'])
    assert old['evidence']['residuals']==new['evidence']['residuals']


def test_literal_malformed_incidence_and_byte_rgba_are_not_repaired_by_number_normalization():
    for field in ['edge','face','dimension','byteColor']:
        source=tetra()
        if field=='edge':source['edges'][0][0]=2.
        elif field=='face':source['faces'][0][0]=2.
        elif field=='dimension':source['dimension']=3.
        else:source['metadata']['offColors']['faces'][2]['values'][0]=55.
        with pytest.raises(GeometryError):flow.preview_spring(source,{})


@pytest.mark.parametrize('field',['adoption','runtimeFlag','sourceColor','resultStatus'])
def test_standalone_adoption_verifier_rejects_forged_policy_or_attributes(field):
    source=tetra();adopted=flow.adopt_spring(source,{})
    if field=='adoption':adopted['metadata']['springOperation']['adoption']='valid-near-miss'
    elif field=='runtimeFlag':adopted['metadata']['springOperation']['runtimePartialPublished']=True
    elif field=='sourceColor':adopted['metadata']['offColors']['faces'][0]=None
    else:adopted['metadata']['springOperation']['resultStatus']='stationary-residual'
    with pytest.raises(GeometryError):flow.verify_spring_model(adopted,source)


def test_source_only_replay_does_not_compute_unrelated_later_spring(monkeypatch):
    result=flow.run_spring(document(),{});key=result['operationHistory']['nodes'][0]['id']
    monkeypatch.setattr(flow.solver,'relax_spring_network',lambda *a,**k:pytest.fail('Unrelated solver must not run'))
    replayed=flow.replay_spring_document(result,key)
    assert same(model(replayed),result['states'][0]['model'])


def mounted_recipe(source,operation,parameters):
    return dispatch({'op':'recipe-run','params':{'document':source,'operation':operation,
        'parameters':parameters,'label':'Mounted '+operation}})


def mounted_replay(source,target=None):
    return dispatch({'op':'recipe-replay','params':{'document':source,**({'target':target} if target else {})}})


def test_actual_registered_preview_adoption_recipe_replay_branch_and_portable_project(tmp_path):
    source=document();before=deepcopy(source)
    preview=dispatch({'op':flow.PREVIEW_OPERATION,'model':model(source),'params':{}})
    assert not preview['recipeRecorded'] and preview['adoption']['constraintsSatisfied']
    direct=dispatch({'op':flow.OPERATION,'model':model(source),'params':{},'algorithmVersion':'0.1.0'})
    result=mounted_recipe(source,flow.OPERATION,{})
    assert same(model(result),direct) and source==before
    assert same(model(mounted_replay(result)),direct)
    node=result['operationHistory']['nodes'][-1]
    branch=dispatch({'op':'recipe-branch','params':{'document':result,
        'parameters':{'solver':{'edge_length':2}},'target':node['id']}})
    assert branch['operationHistory']['nodes'][-1]['parent']==node['parent']
    np.testing.assert_allclose(distances(np.array(model(branch)['vertices']),model(branch)['edges']),2,atol=1e-8)
    path=tmp_path/'mounted-spring.polyproj'
    dispatch({'op':'save','params':{'path':str(path),'project':project(branch)}})
    reopened=dispatch({'op':'load','params':{'path':str(path)}})['project']['documents'][0]
    assert same(model(mounted_replay(reopened)),model(branch))
    assert same(model(reopened)['metadata']['springRelaxation']['sourceModel'],model(source))
    with pytest.raises(GeometryError):dispatch({'op':flow.OPERATION,'model':model(source),
        'params':{},'algorithmVersion':'0.2.0'})


@pytest.mark.parametrize('order',['spring-zono','zono-spring'])
def test_actual_registered_mixed_spring_zono_transform_every_target_and_original_parent_branch(order):
    source=document();before=deepcopy(source)
    zparams={'selections':[{'kind':'world-axes','ids':[2,0,1]}]}
    sparams={'solver':{'regular_faces':True}}
    operations=[(flow.OPERATION,sparams),('source-zonohedron',zparams)]
    if order=='zono-spring':operations.reverse()
    result=source
    for op,params in operations:result=mounted_recipe(result,op,params)
    result=mounted_recipe(result,'transform',{'translation':[2,-3,4]})
    assert source==before and same(model(mounted_replay(result)),model(result))
    for node in result['operationHistory']['nodes']:
        assert same(model(mounted_replay(result,node['id'])),node['snapshot']['model'])
    snode=next(n for n in result['operationHistory']['nodes'] if n['op']==flow.OPERATION)
    branch=dispatch({'op':'recipe-branch','params':{'document':result,'target':snode['id'],
        'parameters':{'solver':{'regular_faces':True,'edge_length':2}}}})
    assert branch['operationHistory']['nodes'][-1]['parent']==snode['parent']
    np.testing.assert_allclose(distances(np.array(model(branch)['vertices']),model(branch)['edges']),2,atol=1e-8)
    assert same(model(mounted_replay(branch)),model(branch))
    spring=next(n['snapshot']['model'] for n in result['operationHistory']['nodes'] if n['op']==flow.OPERATION)
    parent=next(n for n in result['operationHistory']['nodes'] if n['id']==snode['parent'])['snapshot']['model']
    assert same(spring['metadata']['springRelaxation']['sourceModel'],parent)
    assert spring['metadata']['coordinateUnits']==parent['metadata']['coordinateUnits']=='mm'
    if 'offColors' in parent['metadata']:assert spring['metadata']['offColors']==parent['metadata']['offColors']
    else:assert 'offColors' not in spring['metadata']


@pytest.mark.parametrize('version',['0.1.0','0.2.0'])
def test_actual_registered_colored_cell_versions_spring_transform_replay_preserves_ancestry(version,tmp_path):
    # Independent Boolean 4-cube incidence; no generator/Hull determines owners.
    from itertools import product,combinations
    from engine.cell_attributes import run_cell
    vertices=[list(p) for p in product((-1,1),repeat=4)];lookup={tuple(p):i for i,p in enumerate(vertices)};faces=[]
    for free in combinations(range(4),2):
        fixed=[i for i in range(4) if i not in free]
        for signs in product((-1,1),repeat=2):
            cycle=[]
            for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                p=[0]*4
                for axis,x in zip(fixed,signs):p[axis]=x
                p[free[0]]=a;p[free[1]]=b;cycle.append(lookup[tuple(p)])
            faces.append(cycle)
    cells=[[fi for fi,f in enumerate(faces) if all(vertices[v][axis]==sign for v in f)]
        for axis in range(4) for sign in (-1,1)]
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    source={'id':'spring-mixed-literal-tesseract','name':'Mixed literal source','dimension':4,'embeddingDimension':4,
        'interpretation':'generalized-complex','vertices':vertices,'edges':[list(e) for e in edges],
        'faces':faces,'cells':cells,'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'cm','offColors':{'faces':[None if i%3==0 else
            {'encoding':'unit','values':[.1,.3,.8,.25]} for i in range(24)],
            'cells':[{'encoding':'byte','values':[10+i,80,210,128]} for i in range(8)]}}}
    source_doc={'id':'spring-mixed-cell-document','cursor':0,'states':[{'model':source,
        'view':{'coordinateUnit':'cm','sectionNormal':[0,0,0,1],'derivedMode':'section'},'notes':'Original units/alpha'}]}
    before=deepcopy(source_doc)
    extracted=run_cell(source_doc,{'kind':'cell','index':0},version=version)
    result=mounted_recipe(extracted,flow.OPERATION,{'solver':{'regular_faces':True}})
    result=mounted_recipe(result,'transform',{'translation':[2,-3,4]})
    assert source_doc==before and same(model(mounted_replay(result)),model(result))
    for node in result['operationHistory']['nodes']:
        assert same(model(mounted_replay(result,node['id'])),node['snapshot']['model'])
    cellnode=next(n for n in result['operationHistory']['nodes'] if n['op']=='cell')
    assert cellnode['algorithmVersion']==version
    spring=next(n['snapshot']['model'] for n in result['operationHistory']['nodes'] if n['op']==flow.OPERATION)
    assert same(spring['metadata']['springRelaxation']['sourceModel'],model(extracted))
    if version=='0.2.0':
        assert spring['metadata']['coordinateUnits']=='cm'
        assert spring['metadata']['offColors']==model(extracted)['metadata']['offColors']
        assert spring['metadata']['springRelaxation']['sourceModel']['metadata']['cellExtraction']['selectedCellColor']==source['metadata']['offColors']['cells'][0]
    else:assert 'offColors' not in spring['metadata']
    path=tmp_path/('mixed-cell-'+version+'.polyproj');save_project(path,project(result))
    assert same(model(mounted_replay(load_file(path)['project']['documents'][0])),model(result))


def test_actual_registered_unsupported_spring_keeps_snapshot_readable_refuses_needed_replay_and_branch(tmp_path):
    result=mounted_recipe(document(),flow.OPERATION,{})
    node=result['operationHistory']['nodes'][-1];node['algorithmVersion']='future-spring-version'
    path=tmp_path/'unknown-spring.polyproj';save_project(path,project(result))
    restored=load_file(path)['project']['documents'][0]
    assert same(model(restored),model(result))
    with pytest.raises(GeometryError,match='version unsupported'):mounted_replay(restored)
    with pytest.raises(GeometryError):dispatch({'op':'recipe-branch','params':{'document':restored,'parameters':{}}})
    # An unrelated later unsupported operation does not block replay of source.
    source_node=restored['operationHistory']['nodes'][0]
    assert same(model(mounted_replay(restored,source_node['id'])),source_node['snapshot']['model'])
