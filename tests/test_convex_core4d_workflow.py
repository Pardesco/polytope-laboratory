"""Unregistered4D adapter against actual native graphs/project/Node operations."""
from copy import deepcopy
import hashlib
import json
import os
import subprocess
import sys

import pytest

from test_convex_core4d import tesseract,simplex,counts,assert_literal_tesseract
from engine.convex_core4d_workflow import (OPERATION,VERSION,KERNEL_VERSION,
    dispatch_convex_core4d,dispatch_workflow,run_convex_core4d,replay_convex_core4d_history,
    replay_convex_core4d_document,branch_convex_core4d,verify_convex_core4d_workflow_evidence)
from engine.augmentation_workflow import equivalent_json
from engine.formats import load_file,save_project
from engine.geometry import GeometryError,identity
from engine.generators import regular
from engine.history import ALGORITHM_VERSIONS,REPLAY_OPERATIONS,_json_bytes,validate_document_history,replay_history
from engine.server import dispatch as native_dispatch


def document(source=None):
    return {'id':'development-core4d-source','cursor':0,'states':[{'model':tesseract() if source is None else source,
        'view':{'coordinateUnit':'mm','angles':[0]*6,'entitySelection':{'cells':[0]}},'label':'Source','notes':'Retain notes'}]}
def model(doc):return doc['states'][doc['cursor']]['model']
def params(**kwargs):return {'center':[0]*4,**kwargs}
def request(**kwargs):return {'op':OPERATION,'model':tesseract(),'params':params(),**kwargs}
def project(doc):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
def run(doc,op,args):return native_dispatch({'op':'recipe-run','params':{'document':doc,'operation':op,'parameters':args}})
def replay(doc,target=None):return native_dispatch({'op':'recipe-replay','params':{'document':doc,**({'target':target} if target is not None else {})}})
def branch(doc,args,target=None):return native_dispatch({'op':'recipe-branch','params':{'document':doc,'parameters':args,**({'target':target} if target is not None else {})}})


def javascript(value):
    code="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    child=subprocess.run(['node','-e',code],input=_json_bytes(value).decode('utf-8'),encoding='utf-8',capture_output=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    return json.loads(child.stdout)


def test_strict_dispatch_reproducible_full_semantic_ids_version_and_kernel_disclosure():
    value=request();before=deepcopy(value);a=dispatch_convex_core4d(value);b=dispatch_convex_core4d(javascript(value))
    assert value==before and a==b
    assert a['id'].startswith('convex-core-4d-') and len(a['id'])==79
    assert a['provenance']['operation']==OPERATION and a['provenance']['algorithmVersion']==VERSION
    assert a['provenance']['kernelVersion']==KERNEL_VERSION=='0.1.0'
    assert a['metadata']['convexCore4d']['classification']['sourceModelId']==a['id']
    assert verify_convex_core4d_workflow_evidence(a)['passed']
    value['params'].update(tolerance=1e-9,color_policy='require-equal')
    assert dispatch_convex_core4d(value)['id']==a['id']
    value['model']['metadata']['retainedAttributes']['literal']=2
    assert dispatch_convex_core4d(value)['id']!=a['id']


def test_immutable_run_native_file_node_save_open_and_complete_replay(tmp_path):
    source=document();before=deepcopy(source);result=run_convex_core4d(source,params())
    assert source==before and result['cursor']==1 and len(result['states'])==2
    assert result['states'][-1]['notes']=='Retain notes' and 'entitySelection' not in result['states'][-1]['view']
    assert result['operationHistory']['nodes'][-1]['op']==OPERATION
    assert result['operationHistory']['nodes'][-1]['algorithmVersion']==VERSION
    p=native_dispatch({'op':'validate-project','params':{'project':javascript(project(result))}})
    path=tmp_path/'core4d-workflow.json';save_project(path,p);restored=load_file(path)['project']['documents'][0]
    assert equivalent_json(model(replay(restored)))==equivalent_json(model(result))
    e=model(restored)['metadata']['convexCore4d'];assert e['sourceBinding']['sourceSnapshotSha256']==hashlib.sha256(_json_bytes(e['sourceModel'])).hexdigest()
    assert verify_convex_core4d_workflow_evidence(model(restored))['passed']


def test_actual_native_transform_ancestor_and_original_parent_parameter_branch():
    scaled=run(document(),'transform',{'scale':2});result=run_convex_core4d(scaled,params());calls=[]
    def tracked(value):calls.append(value['op']);return native_dispatch(value)
    assert model(replay_convex_core4d_document(result,dispatcher=tracked))==model(result) and calls==['transform']
    calls.clear();branched=branch_convex_core4d(result,params(center=[.25,0,0,0]),dispatcher=tracked)
    assert calls==['transform'];assert_literal_tesseract(model(branched),2)
    nodes=branched['operationHistory']['nodes'];assert nodes[-1]['parent']==nodes[-2]['parent']
    assert model(branched)['metadata']['convexCore4d']['sourceModel']==model(scaled)
    assert model(replay(branched))==model(branched)


def test_model_rgba_unit_attribute_edit_reroots_genuine_full_source_snapshot():
    source=run(document(),'transform',{'scale':1});old=source['states'][-1]['operationNode']
    model(source)['metadata']['coordinateUnits']='cm';model(source)['metadata']['offColors']['cells'][2]['values'][3]=77
    model(source)['metadata']['retainedAttributes']['literal']='edited'
    result=run_convex_core4d(source,params());nodes=result['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['parent']==old and nodes[-1]['parent']==nodes[-2]['id']
    assert model(result)['metadata']['coordinateUnits']=='cm' and model(replay(result))==model(result)


@pytest.mark.parametrize('size,convex',[(1.,True),(1e50,True),(1e99,False),(1e-50,True),(1e-100,False)])
def test_scientific_scale_portability_and_native4d_measure_failure_keeps_no_measure_source(size,convex):
    result=run_convex_core4d(document(tesseract(size)),params());item=model(result)
    assert ('measure' in item)==convex and item['interpretation']==('convex-polytope' if convex else 'generalized-complex')
    restored=native_dispatch({'op':'validate-project','params':{'project':javascript(project(result))}})['documents'][0]
    assert model(replay(restored))==model(restored) and verify_convex_core4d_workflow_evidence(model(restored))['passed']


@pytest.mark.parametrize('operation,args,expected',[
    ('transform',{'scale':2},(16,32,24,8)),
    ('scale-reference',{'index':0,'desired_length':3},(16,32,24,8)),
    ('dual',{'radius':1},(8,24,32,16)),
    ('cell',{'kind':'cell','index':0},(8,12,6,0)),
])
def test_actual_native4d_downstream_ops_replay_through_source_only_temporary_registered_graphs(operation,args,expected):
    source=run_convex_core4d(document(),params());result=run(source,operation,args)
    assert counts(model(result))==expected and model(result)['validation']['passed']
    assert model(replay(javascript(result)))==equivalent_json(model(result))
    assert result['states'][1]['model']==model(source)
    if operation=='transform':
        with pytest.raises(GeometryError,match='stale'):verify_convex_core4d_workflow_evidence(model(result))


def test_local_native_transform_branch_replays_its_original4d_core_parent_not_latest_geometry():
    source=run_convex_core4d(document(),params());scaled=run(source,'transform',{'scale':2})
    branched=branch(scaled,{'scale':3});assert_literal_tesseract(model(branched),3)
    assert model(replay(branched))==model(branched)


def _regular_tetra_doc():
    source=regular('tetrahedron');source['metadata'].update(coordinateUnits='mm',sourceRole='original-tetra')
    source['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.2,.4,.6,.5]}]*4,'cells':[]}
    return document(source)


def test_mixed_native_geo3d_core3d_extrusion_then_core4d_all_required_states_and_selected_targets():
    source=_regular_tetra_doc()
    for operation,args in [('triangular-geodesic',{'frequency':1}),('convex-core',{'center':[0]*3}),
                           ('extrude',{'height':2}),(OPERATION,params())]:
        source=run(source,operation,args)
    assert counts(model(source))==(8,16,14,6)
    assert model(replay(javascript(source)))==equivalent_json(model(source))
    states=replay_convex_core4d_history(source['operationHistory']);assert len(states)==5
    for node in source['operationHistory']['nodes']:
        assert model(replay(source,node['id']))==node['snapshot']['model']
    assert source['operationHistory']['nodes'][0]['snapshot']['model']['metadata']['offColors']['faces'][0]['values'][3]==.5


def test_core4d_then_native_cell_then_core3d_geo_and_4d_extrusion_return_chain():
    source=run_convex_core4d(document(simplex()),params(center=[.2]*4));current=model(source)
    index=next(i for i,c in enumerate(current['cells']) if all(sum(current['vertices'][v])==1 for fi in c for v in current['faces'][fi]))
    for operation,args in [('cell',{'index':index}),('convex-core',{'center':[0]*3}),
                           ('triangular-geodesic',{'frequency':1}),('convex-core',{'center':[0]*3}),
                           ('extrude',{'height':2}),(OPERATION,params())]:
        source=run(source,operation,args)
    assert counts(model(source))==(8,16,14,6)
    assert model(replay(javascript(source)))==equivalent_json(model(source))
    assert len(replay_convex_core4d_history(source['operationHistory']))==8


def test_core4d_cell_then_native_attachment_and_core3d_mixed_history_preserves_actual_native_attributes():
    source=run(run_convex_core4d(document(),params()),'cell',{'index':0})
    source=run(source,'convex-core',{'center':[0]*3})
    addition=deepcopy(model(source));addition['id']='literal-current-cell-copy'
    source=run(source,'attach-at-faces',{'addition':addition,'base_face_id':0,'addition_face_id':1})
    assert counts(model(source))==(12,20,10,0)
    assert model(replay(javascript(source)))==equivalent_json(model(source))
    # Centered source-owned cube axes now make the attached planes exactly
    # coincident. Exact duplicates may form one ownership group; distinct
    # nearby planes must still refuse, as the independent closed fixture below
    # verifies. Preserve the actual attachment/core/history workflow here.
    before=deepcopy(source)
    cored=run(source,'convex-core',{'center':[0]*3})
    assert counts(model(cored))==(8,12,6,0)
    assert model(cored)['measure']['content']==pytest.approx(16)
    assert model(cored)['measure']['boundaryMeasure']==pytest.approx(40)
    assert model(replay(javascript(cored)))==equivalent_json(model(cored))
    branched=branch(cored,{'center':[0]*3})
    for field in ('vertices','edges','faces','cells'):
        assert model(branched)[field]==model(cored)[field]
    assert model(branched)['metadata'].get('offColors')==model(cored)['metadata'].get('offColors')
    assert model(branched)['metadata']['convexCore']['sourceModel']==equivalent_json(model(source))
    assert model(branched)['metadata']['coordinateUnits']=='mm'
    assert branched['operationHistory']['nodes'][-1]['parent']==cored['operationHistory']['nodes'][-1]['parent']
    assert model(replay(javascript(branched)))==equivalent_json(model(branched))
    assert source==before
    # Cell0.2 retains actual source-face RGBA and units; parent-cell RGBA is
    # historical evidence rather than a fabricated current3D cell palette.
    cell=source['states'][2]['model'];parent=source['states'][1]['model']
    assert 'sourceEmbedding' in cell['metadata']
    evidence=cell['metadata']['cellExtraction'];mapping=evidence['maps']
    assert evidence['algorithmVersion']=='0.2.0' and mapping['cells']==[0]
    assert mapping['faces']==parent['cells'][0]
    assert cell['metadata']['offColors']['faces']==[
        parent['metadata']['offColors']['faces'][i] for i in mapping['faces']]
    assert cell['cells']==[] and cell['metadata']['offColors']['cells']==[]
    assert evidence['selectedCellColor']==parent['metadata']['offColors']['cells'][0]
    assert evidence['sourceModel']==equivalent_json(parent)
    assert cell['metadata']['coordinateUnits']==parent['metadata']['coordinateUnits']=='mm'


def test_cell_core_near_distinct_planes_closed_source_refuses_atomically_without_welding():
    from itertools import product
    from collections import Counter
    from engine.compounds import add_models
    # Two independently closed literal cubes, with the second translated by
    # exactly the supplied binary64 1e-12. No face is opened or invented by the
    # operation; the distinct supports must not be merged as coincident.
    points=[list(p) for p in product((-1,1),repeat=3)];lookup={tuple(p):i for i,p in enumerate(points)};faces=[]
    for axis in range(3):
        free=[a for a in range(3) if a!=axis]
        for sign in (-1,1):
            cycle=[]
            for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                p=[0]*3;p[axis]=sign;p[free[0]]=a;p[free[1]]=b;cycle.append(lookup[tuple(p)])
            faces.append(cycle)
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    first={'id':'literal-near-plane-base','name':'Independent closed cube','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':points,'edges':[list(e) for e in edges],'faces':faces,'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','offColors':{'faces':[{'encoding':'unit','values':[.2,.4,.6,.3]}]*6,'cells':[]}}}
    second=deepcopy(first);second['id']='literal-near-plane-shifted';second['vertices']=[[p[0]+1e-12,*p[1:]] for p in points]
    combined=add_models(first,second)
    links=Counter(tuple(sorted((a,b))) for f in combined['faces'] for a,b in zip(f,f[1:]+f[:1]))
    assert all(n==2 for n in links.values()) and set(links)=={tuple(sorted(e)) for e in combined['edges']}
    current=document(combined);before=deepcopy(current)
    with pytest.raises(GeometryError,match='nearly coincident'):run(current,'convex-core',{'center':[0]*3})
    assert current==before


@pytest.mark.parametrize('change',[
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['offColors']['cells'][0]['values'].__setitem__(3,55),
    lambda m:m['metadata']['convexCore4d']['sourceBinding'].__setitem__('sourceSnapshotSha256','0'*64),
    lambda m:m['metadata']['convexCore4d']['candidateToOutputVertexIds'].__setitem__(0,1),
    lambda m:m['metadata']['convexCore4d']['cellSupportOwners'][0]['sourceCellIds'].__setitem__(0,99),
    lambda m:m['metadata']['convexCore4d']['classification'].__setitem__('sourceModelId','wrong'),
    lambda m:m['metadata']['convexCore4d']['sourceModel']['metadata']['offColors']['faces'][0]['values'].__setitem__(3,77),
    lambda m:m['measure'].__setitem__('content',99),
    lambda m:m['provenance'].__setitem__('kernelVersion','invented'),
])
def test_native_readable_geometry_equivalent_full_attribute_evidence_tamper_refuses_selected_replay(change):
    source=run_convex_core4d(document(),params());change(source['operationHistory']['nodes'][-1]['snapshot']['model'])
    assert validate_document_history(source)
    with pytest.raises(GeometryError):replay(source)


def test_current_id_is_bound_deterministically_and_cannot_be_relabelled_as_valid_evidence():
    value=dispatch_convex_core4d(request());value['id']='replacement'
    value['metadata']['convexCore4d']['resultModelId']='replacement'
    value['metadata']['convexCore4d']['classification']['sourceModelId']='replacement'
    with pytest.raises(GeometryError,match='reconstruction'):verify_convex_core4d_workflow_evidence(value)


def test_unsupported_versions_stay_readable_and_source_only_or_other_branch_targets_ignore_them():
    source=run_convex_core4d(document(),params());branched=branch_convex_core4d(source,params(center=[.25,0,0,0]))
    graph=branched['operationHistory'];selected=graph['nodes'][-1]['id']
    graph['nodes'][-2]['algorithmVersion']='unknown-future'
    graph['nodes'][-2]['snapshot']['model']['metadata']['coordinateUnits']='cm'
    assert model(replay(branched,selected))==model(branched)
    assert native_dispatch({'op':'validate-project','params':{'project':project(branched)}})
    with pytest.raises(GeometryError,match='version'):replay(branched,graph['nodes'][-2]['id'])
    assert model(replay(branched,graph['nodes'][0]['id']))['id']=='literal-tesseract'


def test_source_attribute_hash_tamper_fails_and_atomic_failed_run_undo_retains_branch():
    source=run_convex_core4d(document(),params());before=deepcopy(source)
    with pytest.raises(GeometryError):run_convex_core4d(source,params(center=[2,0,0,0]))
    assert source==before
    source['cursor']=0;branched=run_convex_core4d(source,params(center=[.25,0,0,0]))
    assert len(branched['states'])==2 and len(branched['operationHistory']['nodes'])==3
    assert model(replay(branched,before['states'][-1]['operationNode']))==model(before)
    branched['operationHistory']['nodes'][0]['snapshot']['model']['metadata']['coordinateUnits']='cm'
    with pytest.raises(GeometryError,match='source snapshot hash'):replay(branched)


@pytest.mark.parametrize('change',[
    lambda r:r.update(op='convex-core'),lambda r:r.update(unknown=True),lambda r:r.pop('model'),
    lambda r:r.update(id=True),lambda r:r.update(id='x'*129),lambda r:r.update(algorithmVersion='future'),
    lambda r:r['params'].update(center=[0]*3),lambda r:r['params'].update(center=[True,0,0,0]),
    lambda r:r['params'].update(center=[10**500,0,0,0]),lambda r:r['params'].update(extra=True),
    lambda r:r['model']['cells'][0].__setitem__(0,0.),
    lambda r:r['model']['metadata'].update(unsafe=2**53+1),
    lambda r:r['model']['metadata'].update(decimalFloat=1e20),
    lambda r:r['model']['metadata'].update(unicode='\ud800'),
])
def test_malformed_native_envelope_params_or_source_never_repairs_incidence(change):
    value=request();change(value)
    with pytest.raises(GeometryError):dispatch_convex_core4d(value)


@pytest.mark.parametrize('value',[1e21,-1e21,1e99,1e100])
def test_scientific_integral_floats_remain_real_node_portable_full_attributes(value):
    req=request();req['model']['metadata']['scientificAttribute']=value
    a=dispatch_convex_core4d(req);b=dispatch_convex_core4d(javascript(req))
    assert a==b and verify_convex_core4d_workflow_evidence(javascript(a))['passed']


def test_bounded_cyclic_and_deep_data_fails_before_snapshot_copy_and_registries_never_change():
    before=(dict(ALGORITHM_VERSIONS),REPLAY_OPERATIONS)
    value=request();value['model']['metadata']['cycle']=value
    with pytest.raises(GeometryError):dispatch_convex_core4d(value)
    value=document();nested={};model(value)['metadata']['deep']=nested
    for _ in range(80):nested['child']={};nested=nested['child']
    with pytest.raises(GeometryError):run_convex_core4d(value,params())
    result=run(document(),OPERATION,params());replay(result);branch(result,params(center=[.25,0,0,0]))
    assert (dict(ALGORITHM_VERSIONS),REPLAY_OPERATIONS)==before and OPERATION in REPLAY_OPERATIONS
    assert ALGORITHM_VERSIONS[OPERATION]==VERSION
    states=replay_history(validate_document_history(result),native_dispatch)
    assert states[result['states'][-1]['operationNode']]['model']==model(result)


@pytest.mark.parametrize('target',[False,0,[],{},'','x'*129])
def test_malformed_public_target_ids_refuse_without_silently_selecting_current(target):
    result=run_convex_core4d(document(),params())
    for call in [lambda:replay_convex_core4d_history(result['operationHistory'],target=target),
                 lambda:replay_convex_core4d_document(result,target=target),
                 lambda:branch_convex_core4d(result,params(),target=target),
                 lambda:replay(result,target),lambda:branch(result,params(),target)]:
        with pytest.raises(GeometryError):call()


@pytest.mark.parametrize('value',[
    {'op':'recipe-run','params':{}},
    {'op':'recipe-run','params':{'document':{},'operation':[],'parameters':{}}},
    {'op':'recipe-run','params':{'document':{},'operation':OPERATION,'parameters':[]}},
    {'op':'recipe-replay','params':{'document':{},'unknown':True}},
    {'op':'recipe-replay','id':True,'params':{'document':{}}},
    {'op':'recipe-branch','params':{'document':{}}},
    {'op':'recipe-branch','params':{'document':{},'parameters':{},'target':{}}},
])
def test_isolated_recipe_envelopes_are_strict_structured_errors(value):
    with pytest.raises(GeometryError):dispatch_workflow(value)


def test_actual_cold_native_json_lines_strict_version_failure_and_continued_success():
    good=request(id='cold-core4d')
    failed=request(id='wrong-version',algorithmVersion='future')
    changed=request(id='malformed-incidence');changed['model']['cells'][0][0]=0.
    final=request(id='continued')
    child=subprocess.run([sys.executable,'-B','-m','engine.server'],input='\n'.join(json.dumps(value) for value in [good,failed,changed,final])+'\n',
        encoding='utf-8',capture_output=True,timeout=30,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    output=[json.loads(line) for line in child.stdout.splitlines()]
    assert [row['id'] for row in output]==['cold-core4d','wrong-version','malformed-incidence','continued']
    assert [row['ok'] for row in output]==[True,False,False,True]
    assert output[1]['type']=='GeometryError' and output[2]['type']=='GeometryError'
    assert output[0]['result']==output[3]['result']
    assert_literal_tesseract(output[0]['result'])
    assert verify_convex_core4d_workflow_evidence(output[0]['result'])['passed']


def test_actual_native_core4d_cell_core3d_placement_replay_and_original_parent_branch():
    source=run(document(),OPERATION,params())
    core_node=source['states'][-1]['operationNode']
    source=run(source,'cell',{'index':0})
    source=run(source,'convex-core',{'center':[0]*3})
    addition=deepcopy(model(source));addition['id']='literal-current-placement-copy'
    placed=run(source,'place-at-faces',{'addition':addition,'face_ids':[0],'addition_face_id':1,'scale':.5,'height':0})
    assert counts(model(placed))==(16,24,12,0) and len(model(placed)['components'])==2
    assert model(replay(javascript(placed)))==equivalent_json(model(placed))
    states=replay_history(validate_document_history(placed),native_dispatch)
    assert len(states)==5 and states[placed['states'][-1]['operationNode']]['model']==model(placed)
    changed=branch(placed,{'addition':addition,'face_ids':[0],'addition_face_id':1,'scale':.25,'height':0})
    assert counts(model(changed))==(16,24,12,0) and model(replay(changed))==model(changed)
    old=placed['operationHistory']['nodes'][-1];new=changed['operationHistory']['nodes'][-1]
    assert new['parent']==old['parent']
    core_branch=branch(placed,params(center=[.25,0,0,0]),target=core_node)
    assert_literal_tesseract(model(core_branch))
    assert model(core_branch)['metadata']['convexCore4d']['sourceModel']==placed['states'][0]['model']
    assert model(replay(placed,core_node))==placed['states'][1]['model']
    assert model(replay(core_branch))==model(core_branch)


def test_production_kernel_dispatch_has_no_development_import_dependency():
    code="import sys; from engine.server import dispatch; import json; m=dispatch(json.load(sys.stdin)); print(json.dumps({'id':m['id'],'developmentImports':[name for name in sys.modules if name=='development' or name.startswith('development.')]}))"
    child=subprocess.run([sys.executable,'-B','-c',code],input=json.dumps(request()),encoding='utf-8',capture_output=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    result=json.loads(child.stdout);assert result['developmentImports']==[] and result['id'].startswith('convex-core-4d-')
