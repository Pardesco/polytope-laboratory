"""Portable mounted zonohedron dispatch and real native ancestry tests."""
from copy import deepcopy
from itertools import combinations,product
import json
import os
import subprocess

import numpy as np
import pytest

from engine.source_zonohedron_workflow import (OPERATION,VERSION,KERNEL_VERSION,
    dispatch_source_zonohedron,verify_source_zonohedron_workflow_evidence,
    run_source_zonohedron,replay_source_zonohedron_history,
    replay_source_zonohedron_document,branch_source_zonohedron,dispatch_workflow)
from engine.source_zonohedron import verify_source_zonohedron
from engine.zonohedron_support import verify_support_zonohedron
from engine.geometry import GeometryError,identity,validate
from engine.formats import validate_project,save_project,load_file
from engine.server import dispatch
from engine.augmentation_workflow import equivalent_json,bounded_bytes
from engine.history import ALGORITHM_VERSIONS,validate_history,replay_history


def cube():
    p=[list(v) for v in product((-1,1),repeat=3)];lookup={tuple(v):i for i,v in enumerate(p)};faces=[]
    for fixed in range(3):
        free=[i for i in range(3) if i!=fixed]
        for sign in (-1,1):
            face=[]
            for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                row=[0]*3;row[fixed]=sign;row[free[0]]=a;row[free[1]]=b;face.append(lookup[tuple(row)])
            faces.append(face)
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    result={'id':'literal-zonohedron-source','name':'Literal cube','dimension':3,'embeddingDimension':3,
        'interpretation':'convex-polytope','vertices':p,'edges':[list(e) for e in edges],'faces':faces,'cells':[],
        'facetVertices':deepcopy(faces),'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','literal':{'owned':True,'value':1.0,'symbol':'5/-3'},
            'offColors':{'vertices':[{'encoding':'byte','values':[i,25,128,17]} for i in range(8)],
                'faces':[{'encoding':'unit','values':[.25,.5,.75,i/6]} for i in range(6)],'cells':[]}}}
    assert validate(result)['passed'];return result


def document(source=None):
    return {'id':'zonohedron-document','cursor':0,'states':[{'model':cube() if source is None else source,
        'view':{'coordinateUnit':'mm','sectionNormal':[0,0,1],'derivedMode':'section'},'notes':'Preserve notes'}]}
def model(doc):return doc['states'][doc['cursor']]['model']
def project(doc):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
def params(kind='vertices',**kwargs):return {'selections':[{'kind':kind,'ids':list(range({'vertices':8,'edges':12,'faces':6,'world-axes':3}[kind]))}],**kwargs}
def request(**kwargs):return {'op':OPERATION,'model':cube(),'params':params(),**kwargs}
def semantic(value):
    # Native kernels contain NumPy float64 derived support coefficients. Their
    # JSON representation must be detached BEFORE normalizing integral values;
    # an exact-type Python float predicate does not see these scalar subclasses.
    # Still compare every field and ID as JSON bytes (true is distinct from1).
    detached=json.loads(bounded_bytes(value,64*1024*1024))
    return bounded_bytes(equivalent_json(detached),64*1024*1024)


def node(value):
    code="let t='';process.stdin.on('data',x=>t+=x).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    child=subprocess.run(['node','-e',code],input=json.dumps(value),capture_output=True,text=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr;return json.loads(child.stdout)


@pytest.mark.parametrize('kind,counts,zones',[('vertices',[14,24,12,0],4),('edges',[8,12,6,0],3),('faces',[8,12,6,0],3),('world-axes',[8,12,6,0],3)])
def test_independent_literal_source_feature_counts_supports_volume_rgba_units(kind,counts,zones):
    value=request(params=params(kind,edge_length=2));before=deepcopy(value);result=dispatch_source_zonohedron(value)
    assert value==before and [len(result[k]) for k in ('vertices','edges','faces','cells')]==counts
    e=result['metadata']['sourceZonohedron'];support=result['metadata']['supportZonohedron']
    assert semantic(e['sourceModel'])==semantic(value['model'])
    assert e['sourceModel']['metadata']['offColors']['faces'][5]['values'][3]==pytest.approx(5/6)
    assert result['metadata']['coordinateUnits']=='mm' and 'offColors' not in result['metadata']
    assert e['resultModelId']==result['id'] and support['resultModelId']!=result['id']
    assert support['classification']['sourceModelId']==support['resultModelId']
    assert len(e['selectedZoneOwners'])==zones and support['endpointSignSumsEnumerated']==0
    generators=np.array([z['unitDirection'] for z in support['selectedZones']])*2
    for normal in ([1,2,3],[-2,1,.25],[0,0,1]):
        assert max(np.array(result['vertices'])@normal)==pytest.approx(np.abs(generators@normal).sum()*.5)
    volume=sum(abs(np.linalg.det(generators[list(ids)])) for ids in combinations(range(zones),3))
    assert result['measure']['content']==pytest.approx(volume)
    assert verify_source_zonohedron_workflow_evidence(result)['passed']
    assert verify_source_zonohedron(result)['passed']
    with pytest.raises(GeometryError):verify_support_zonohedron(result)


def test_real_node_input_and_output_preserve_both_receipts_and_full_semantic_ids():
    value=request(params=params(edge_length=2.0,center=[0.0,-0.0,0.0]));result=dispatch_source_zonohedron(value)
    counterpart=dispatch_source_zonohedron(node(value));assert semantic(result)==semantic(counterpart)
    restored=node(result);assert result['id']==restored['id'];assert verify_source_zonohedron_workflow_evidence(restored)['passed']
    assert semantic(result)==semantic(restored)
    # Frozen standalone verifier uses Python lexical spellings; the adapter
    # qualifies portable spellings through canonical input regeneration.
    with pytest.raises(GeometryError):verify_source_zonohedron(restored)


def test_semantic_source_attribute_id_binding_not_geometry_only_fingerprint():
    source=cube();a=dispatch_source_zonohedron(request(model=source));changed=deepcopy(source)
    changed['metadata']['offColors']['vertices'][0]['values'][3]=88
    b=dispatch_source_zonohedron(request(model=changed))
    assert a['vertices']==b['vertices'] and identity(a)==identity(b) and a['id']!=b['id']
    changed=deepcopy(source);changed['metadata']['literal']['owned']=1
    c=dispatch_source_zonohedron(request(model=changed));assert c['id']!=a['id']


def test_immutable_native_save_node_open_replay_original_parent_branch(tmp_path):
    original=document();before=deepcopy(original);result=run_source_zonohedron(original,params())
    assert original==before;assert result['operationHistory']['nodes'][-1]['algorithmVersion']==VERSION
    path=tmp_path/'zonohedron.polyproj';save_project(path,node(project(result)));restored=load_file(path)['project']['documents'][0]
    assert verify_source_zonohedron_workflow_evidence(model(restored))['passed']
    assert semantic(model(replay_source_zonohedron_document(restored)))==semantic(model(result))
    branch=branch_source_zonohedron(restored,params('edges',edge_length=2));assert [len(model(branch)[k]) for k in ('vertices','edges','faces')]==[8,12,6]
    assert model(branch)['measure']['content']==pytest.approx(8)
    nodes=branch['operationHistory']['nodes'];assert nodes[-1]['parent']==nodes[-2]['parent']
    assert semantic(model(branch)['metadata']['sourceZonohedron']['sourceModel'])==semantic(result['states'][0]['model'])
    assert semantic(model(replay_source_zonohedron_document(branch)))==semantic(model(branch))
    assert len(replay_source_zonohedron_history(branch['operationHistory']))==3
    assert model(replay_source_zonohedron_document(branch,nodes[0]['id']))['id']==cube()['id']


def test_full_attribute_changed_source_reroot_and_actual_mounted_version_registry():
    first=run_source_zonohedron(document(),params());first['cursor']=0;source=model(first)
    source['metadata']['coordinateUnits']='cm';source['metadata']['offColors']['faces'][0]=None
    result=run_source_zonohedron(first,params('world-axes'));nodes=result['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['parent']==nodes[0]['id']
    assert model(result)['metadata']['coordinateUnits']=='cm'
    assert model(result)['metadata']['sourceZonohedron']['sourceModel']['metadata']['offColors']['faces'][0] is None
    assert semantic(model(replay_source_zonohedron_document(result)))==semantic(model(result))
    assert ALGORITHM_VERSIONS[OPERATION]==VERSION
    assert validate_project(deepcopy(project(result)))
    replayed=replay_history(result['operationHistory'],dispatch)
    assert semantic(replayed[nodes[-1]['id']]['model'])==semantic(model(result))


def test_actual_native_transform_ancestry_descendant_and_ordinary_branch():
    ancestor=dispatch({'op':'recipe-run','params':{'document':document(),'operation':'transform','parameters':{'translation':[3,4,5]}}})
    result=run_source_zonohedron(ancestor,params(center=[3,4,5]))
    descendant=dispatch({'op':'recipe-run','params':{'document':result,'operation':'transform','parameters':{'translation':[1,2,3]}}})
    assert semantic(model(replay_source_zonohedron_document(descendant)))==semantic(model(descendant))
    ordinary=dispatch_workflow({'op':'recipe-branch','params':{'document':descendant,'parameters':{'scale':2}}})
    assert ordinary['operationHistory']['nodes'][-1]['parent']==descendant['operationHistory']['nodes'][-1]['parent']
    assert semantic(model(replay_source_zonohedron_document(ordinary)))==semantic(model(ordinary))


def test_actual_mixed_attachment_and_core_native_ancestors_and_descendant():
    attached=dispatch({'op':'recipe-run','params':{'document':document(),'operation':'attach-at-faces',
        'parameters':{'addition':cube(),'base_face_id':0,'addition_face_id':0}}})
    core=dispatch({'op':'recipe-run','params':{'document':attached,'operation':'convex-core','parameters':{'center':[0,0,0],'color_policy':'none'}}})
    result=run_source_zonohedron(core,params('world-axes'))
    descendant=dispatch({'op':'recipe-run','params':{'document':result,'operation':'convex-core','parameters':{'center':[0,0,0]}}})
    assert semantic(model(replay_source_zonohedron_document(descendant)))==semantic(model(descendant))


@pytest.mark.parametrize('field',['unit','rgba','outer-id','inner-id','owner','seed','certified','bool-attribute','measure'])
def test_full_attribute_and_two_receipt_tamper_refused_even_if_fingerprint_same(field):
    result=dispatch_source_zonohedron(request());before=identity(result);e=result['metadata']['sourceZonohedron']
    if field=='unit':result['metadata']['coordinateUnits']='cm'
    elif field=='rgba':e['sourceModel']['metadata']['offColors']['faces'][0]=None
    elif field=='outer-id':result['id']='foreign'
    elif field=='inner-id':result['metadata']['supportZonohedron']['resultModelId']=result['id']
    elif field=='owner':e['selectedZoneOwners'][0][0]['sourceEntityId']=999
    elif field=='seed':e['seedDirections'][0][0]=9
    elif field=='certified':result['numeric']['certified']=True
    elif field=='bool-attribute':result['numeric']['certified']=0
    else:result['measure']['content']=123
    assert identity(result)==before
    with pytest.raises(GeometryError):verify_source_zonohedron_workflow_evidence(result)


@pytest.mark.parametrize('field',['unit','source-rgba','zone-owner','inner-id','bool'])
def test_history_metadata_tamper_cannot_pass_geometry_only_native_checks(field):
    result=run_source_zonohedron(document(),params());m=result['operationHistory']['nodes'][-1]['snapshot']['model'];e=m['metadata']['sourceZonohedron']
    if field=='unit':m['metadata']['coordinateUnits']='cm'
    elif field=='source-rgba':e['sourceModel']['metadata']['offColors']['faces'][0]=None
    elif field=='zone-owner':e['selectedZoneOwners'][0][0]['sourceEntityId']=999
    elif field=='inner-id':m['metadata']['supportZonohedron']['resultModelId']=m['id']
    else:m['numeric']['certified']=0
    assert validate_history(result['operationHistory'])
    with pytest.raises(GeometryError):replay_source_zonohedron_history(result['operationHistory'])


@pytest.mark.parametrize('bad',[{'op':'bad'},{'unexpected':True},{'id':True},{'algorithmVersion':'0.1.0-development'},
    {'params':{}},{'params':{'selections':[]}}, {'params':params('edges',extra=True)},
    {'params':params('edges',center=[True,0,0])},{'params':params('edges',edge_length=True)},
    {'params':params('edges',edge_length=10**500)}, {'params':params('edges',max_zones=3.0)},
    {'params':params('edges',max_zones=True)},{'params':{'selections':[{'kind':'vertices','ids':[0.0,1,2]}]}},
    {'params':{'selections':[{'kind':'vertices','ids':[True,1,2]}]}},
    {'params':params('edges',center=[float('inf'),0,0])}])
def test_strict_native_envelope_params_numbers_and_selection_ids_refused(bad):
    value=request();value.update(bad)
    with pytest.raises(GeometryError):dispatch_source_zonohedron(value)


@pytest.mark.parametrize('field',['float-edge','bool-face','surrogate','large-int','decimal-float','deep','cyclic'])
def test_malformed_source_and_json_rejected_before_copy_or_numeric_normalization(field):
    source=cube()
    if field=='float-edge':source['edges'][0][0]=0.0
    elif field=='bool-face':source['faces'][0][0]=False
    elif field=='surrogate':source['metadata']['bad']='\ud800'
    elif field=='large-int':source['metadata']['bad']=2**60
    elif field=='decimal-float':source['metadata']['bad']=float(2**60)
    elif field=='cyclic':source['metadata']['bad']=source
    else:
        value=None
        for _ in range(1000):value=[value]
        source['metadata']['bad']=value
    with pytest.raises(GeometryError):dispatch_source_zonohedron(request(model=source))


def test_scientific_float_full_attributes_supported_across_real_node():
    source=cube();source['metadata']['scientific']=1e99
    result=dispatch_source_zonohedron(request(model=source));assert verify_source_zonohedron_workflow_evidence(node(result))['passed']


@pytest.mark.parametrize('target',[False,0,[],{},'',1.0])
def test_no_falsey_fallback_target_in_replay_branch_and_workflow(target):
    result=run_source_zonohedron(document(),params())
    with pytest.raises(GeometryError):replay_source_zonohedron_document(result,target)
    with pytest.raises(GeometryError):branch_source_zonohedron(result,params(),target)
    for op in ('recipe-replay','recipe-branch'):
        args={'document':result,'target':target}
        if op=='recipe-branch':args['parameters']=params()
        with pytest.raises(GeometryError):dispatch_workflow({'op':op,'params':args})


@pytest.mark.parametrize('field',['version','policy','dependency','source-hash','float-param'])
def test_history_version_policy_dependencies_and_raw_id_syntax_refused(field):
    result=run_source_zonohedron(document(),params());graph=result['operationHistory'];n=graph['nodes'][-1]
    if field=='version':n['algorithmVersion']='future'
    elif field=='policy':n['numericPolicy']['certified']=True
    elif field=='dependency':n['inputs']=[n['parent'],n['parent']]
    elif field=='source-hash':n['sourceSnapshotHash']='0'*64
    else:n['params']['selections'][0]['ids'][0]=0.0
    with pytest.raises(GeometryError):replay_source_zonohedron_history(graph)


def test_isolated_workflow_shape_delegate_and_required_ancestry_unsupported_sibling_readable():
    result=dispatch_workflow({'op':'recipe-run','params':{'document':document(),'operation':OPERATION,'parameters':params('edges')}})
    replayed=dispatch_workflow({'op':'recipe-replay','params':{'document':result}})
    assert semantic(model(replayed))==semantic(model(result))
    branch=dispatch_workflow({'op':'recipe-branch','params':{'document':result,'parameters':params('world-axes',edge_length=2)}})
    assert model(branch)['measure']['content']==pytest.approx(8)
    unsupported=deepcopy(branch['operationHistory']);unsupported['nodes'][1]['algorithmVersion']='unknown'
    target=unsupported['nodes'][-1]['id'];assert len(replay_source_zonohedron_history(unsupported,target=target))==2
    with pytest.raises(GeometryError):replay_source_zonohedron_history(unsupported)
    assert dispatch_workflow({'op':'catalog'})==dispatch({'op':'catalog'})


def test_real_node_entire_history_save_open_native_descendant_original_parent_branches(tmp_path):
    source=cube();source['metadata']['scientific']=1e99
    ancestor=dispatch({'op':'recipe-run','params':{'document':document(source),'operation':'transform','parameters':{'translation':[3,4,5]}}})
    selections=[{'kind':'edges','ids':[0,1,2]},{'kind':'world-axes','ids':[0,1,2]}]
    value={'op':'recipe-run','params':{'document':node(ancestor),'operation':OPERATION,
        'parameters':{'selections':selections,'center':[3.0,4.0,5.0],'edge_length':2.0}}}
    before=deepcopy(value);built=dispatch_workflow(value);assert value==before
    expected=model(built);retained=node(built)
    assert verify_source_zonohedron_workflow_evidence(model(retained))['passed']
    assert model(retained)['id']==expected['id']
    assert model(retained)['metadata']['supportZonohedron']['resultModelId']==expected['metadata']['supportZonohedron']['resultModelId']
    assert semantic(model(retained))==semantic(expected)
    filename=tmp_path/'full-node-history.polyproj';save_project(filename,node(project(retained)))
    reopened=node(load_file(filename)['project']['documents'][0])
    assert semantic(model(replay_source_zonohedron_document(reopened)))==semantic(expected)
    descendant=dispatch({'op':'recipe-run','params':{'document':reopened,'operation':'transform','parameters':{'translation':[1,2,3]}}})
    descendant=node(descendant)
    assert semantic(model(replay_source_zonohedron_document(descendant)))==semantic(model(descendant))
    graph=descendant['operationHistory'];states=replay_source_zonohedron_history(graph)
    assert set(states)=={n['id'] for n in graph['nodes']}
    zono_target=graph['nodes'][-2]['id']
    branch=dispatch_workflow(node({'op':'recipe-branch','params':{'document':descendant,
        'target':zono_target,'parameters':params('world-axes',edge_length=3,center=[3,4,5])}}))
    assert branch['operationHistory']['nodes'][-1]['parent']==graph['nodes'][-2]['parent']
    assert model(branch)['measure']['content']==pytest.approx(27)
    assert semantic(model(replay_source_zonohedron_document(node(branch))))==semantic(model(branch))
    assert semantic(model(branch)['metadata']['sourceZonohedron']['sourceModel'])==semantic(model(ancestor))
    ordinary=dispatch_workflow(node({'op':'recipe-branch','params':{'document':descendant,'parameters':{'scale':2}}}))
    assert ordinary['operationHistory']['nodes'][-1]['parent']==graph['nodes'][-1]['parent']
    assert semantic(model(replay_source_zonohedron_document(node(ordinary))))==semantic(model(ordinary))


@pytest.mark.parametrize('field',['unit','alpha','owner','outer-id','inner-id','scientific','bool'])
def test_real_node_serialized_receipt_tampering_is_refused_as_full_payload(field):
    source=cube();source['metadata']['scientific']=1e99
    result=node(run_source_zonohedron(document(source),params()))
    current=model(result);stored=result['operationHistory']['nodes'][-1]['snapshot']['model']
    for m in [current,stored]:
        e=m['metadata']['sourceZonohedron']
        if field=='unit':m['metadata']['coordinateUnits']='cm'
        elif field=='alpha':e['sourceModel']['metadata']['offColors']['faces'][0]['values'][3]=.9
        elif field=='owner':e['selectedZoneOwners'][0][0]['sourceEntityId']=99
        elif field=='outer-id':m['id']='foreign-semantic-id'
        elif field=='inner-id':m['metadata']['supportZonohedron']['resultModelId']='foreign-support-id'
        elif field=='scientific':e['sourceModel']['metadata']['scientific']=1e98
        else:e['sourceModel']['metadata']['literal']['owned']=1
    assert validate_history(result['operationHistory'])
    with pytest.raises(GeometryError):verify_source_zonohedron_workflow_evidence(current)
    with pytest.raises(GeometryError):replay_source_zonohedron_document(result)


def test_real_native_json_loop_with_isolated_adapter_rejects_then_continues_and_replays():
    # Mount only in this separate process. Qualified server bytes/registry stay
    # unchanged; the actual bounded native input/output loop handles all lines.
    code="""import engine.server as server
from engine.source_zonohedron_workflow import dispatch_workflow
original=server.dispatch
server.dispatch=lambda request:dispatch_workflow(request,dispatcher=original)
server.main()
"""
    built=run_source_zonohedron(document(),params('faces'))
    requests=[request(id='bad-ids',params={'selections':[{'kind':'edges','ids':[0.0]}]}),
        request(id='valid',params=params('world-axes',edge_length=2.0)),
        {'id':'replay','op':'recipe-replay','params':{'document':node(built)}},
        {'id':'branch','op':'recipe-branch','params':{'document':node(built),'parameters':params('world-axes',edge_length=3)}}]
    child=subprocess.run(['python','-B','-c',code],input='\n'.join(json.dumps(r) for r in requests)+'\n',
        capture_output=True,text=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr;replies=[json.loads(line) for line in child.stdout.splitlines()]
    assert [r['id'] for r in replies]==[r['id'] for r in requests]
    assert replies[0]['ok'] is False and replies[0]['type']=='GeometryError'
    assert all(r['ok'] is True for r in replies[1:])
    assert verify_source_zonohedron_workflow_evidence(node(replies[1]['result']))['passed']
    assert replies[1]['result']['measure']['content']==pytest.approx(8)
    assert semantic(model(replies[2]['result']))==semantic(model(built))
    assert model(replies[3]['result'])['measure']['content']==pytest.approx(27)


def tesseract():
    vertices=[list(p) for p in product((-1,1),repeat=4)];lookup={tuple(p):i for i,p in enumerate(vertices)};faces=[]
    for free in combinations(range(4),2):
        fixed=[k for k in range(4) if k not in free]
        for signs in product((-1,1),repeat=2):
            cycle=[]
            for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                point=[0]*4
                for k,s in zip(fixed,signs):point[k]=s
                point[free[0]]=a;point[free[1]]=b;cycle.append(lookup[tuple(point)])
            faces.append(cycle)
    cells=[[f for f,cycle in enumerate(faces) if all(vertices[v][axis]==sign for v in cycle)]
        for axis in range(4) for sign in (-1,1)]
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    result={'id':'literal-colored-tesseract-source','name':'Literal colored tesseract','dimension':4,'embeddingDimension':4,
        'interpretation':'convex-polytope','vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':cells,
        'facetVertices':[sorted({v for f in c for v in faces[f]}) for c in cells],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','literal':{'rawSymbol':'5/-3','keep':True},
            'offColors':{'faces':[{'encoding':'byte','values':[i,64,128,96]} for i in range(24)],
                'cells':[{'encoding':'unit','values':[.2,.4,.6,(i+1)/9]} for i in range(8)]}}}
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')]==[16,32,24,8]
    assert validate(result)['passed'];return result


@pytest.mark.parametrize('version',['0.1.0','0.2.0'])
def test_mounted_literal_cell_versions_zonohedron_transform_replay_all_targets_and_cell_branch(version,tmp_path):
    from engine.cell_attributes import run_cell,verify_cell_evidence
    source=tesseract();before=deepcopy(source);extracted=run_cell(document(source),{'kind':'cell','index':0},version=version)
    cell=model(extracted);assert [len(cell[k]) for k in ('vertices','edges','faces','cells')]==[8,12,6,0]
    assert extracted['operationHistory']['nodes'][-1]['algorithmVersion']==version
    if version=='0.2.0':
        assert verify_cell_evidence(cell)['passed'];assert cell['metadata']['coordinateUnits']=='mm'
        assert cell['metadata']['cellExtraction']['selectedCellColor']==source['metadata']['offColors']['cells'][0]
        assert all(c['values'][3]==96 for c in cell['metadata']['offColors']['faces'])
    else:
        assert 'cellExtraction' not in cell['metadata'] and 'coordinateUnits' not in cell['metadata']
    built=dispatch({'op':'recipe-run','params':{'document':node(extracted),'operation':OPERATION,'parameters':params('world-axes')}})
    assert semantic(model(built)['metadata']['sourceZonohedron']['sourceModel'])==semantic(cell)
    descendant=dispatch({'op':'recipe-run','params':{'document':node(built),'operation':'transform','parameters':{'translation':[.1,.2,.3]}}})
    path=tmp_path/f'cell-{version}-source-zonohedron.polyproj';save_project(path,node(project(descendant)))
    reopened=node(load_file(path)['project']['documents'][0]);graph=reopened['operationHistory'];seen=[]
    def observed(request):
        if request.get('op')=='cell':seen.append(request.get('algorithmVersion'))
        return dispatch(request)
    replayed=replay_source_zonohedron_history(graph,dispatcher=observed)
    # The strict cell0.2 router calls its own versioned kernel directly. Legacy
    # cell0.1 traverses the injected dispatcher and must explicitly forward0.1.
    assert seen==(['0.1.0'] if version=='0.1.0' else []) and len(replayed)==4
    for n in graph['nodes']:
        native=replay_history(graph,dispatch,target=n['id'])
        candidate=native[n['id']]['model']
        if n['op']=='cell' and n['algorithmVersion']=='0.1.0':
            # The unchanged legacy Hull operation intentionally owns a fresh
            # volatile UUID when replayed without zonohedron ancestry. Compare
            # every other payload field; do not alter its historical semantics.
            assert isinstance(candidate['id'],str) and candidate['id']
            candidate=deepcopy(candidate);candidate['id']=n['snapshot']['model']['id']
        assert semantic(candidate)==semantic(n['snapshot']['model'])
        explicit=replay_source_zonohedron_history(graph,dispatch,target=n['id'])
        assert semantic(explicit[n['id']]['model'])==semantic(n['snapshot']['model'])
        by_recipe=dispatch({'op':'recipe-replay','params':{'document':reopened,'target':n['id']}})
        assert semantic(model(by_recipe))==semantic(n['snapshot']['model'])
    assert semantic(model(dispatch({'op':'recipe-replay','params':{'document':reopened}})))==semantic(model(descendant))
    target=graph['nodes'][1]['id']
    for branch in [dispatch({'op':'recipe-branch','params':{'document':reopened,'target':target,'parameters':{'kind':'cell','index':1}}}),
        dispatch_workflow({'op':'recipe-branch','params':{'document':reopened,'target':target,'parameters':{'kind':'cell','index':1}}})]:
        assert branch['operationHistory']['nodes'][-1]['algorithmVersion']==version
        assert branch['operationHistory']['nodes'][-1]['parent']==graph['nodes'][1]['parent']
        assert semantic(model(dispatch({'op':'recipe-replay','params':{'document':node(branch)}})))==semantic(model(branch))
    assert source==before


def test_actual_cold_registered_native_json_protocol_and_recipe_roundtrip(tmp_path):
    value=request(id='literal-source',params=params('world-axes',edge_length=2.0))
    built=dispatch({'op':'recipe-run','params':{'document':node(document()),'operation':OPERATION,'parameters':params('faces')}})
    before=deepcopy(built);path=tmp_path/'mounted-source-zonohedron.polyproj'
    requests=[request(id='malformed',params={'selections':[{'kind':'edges','ids':[False]}]}),value,
        {'id':'save','op':'save','params':{'path':str(path),'project':node(project(built))}},
        {'id':'load','op':'load','params':{'path':str(path)}},
        {'id':'replay','op':'recipe-replay','params':{'document':node(built)}},
        {'id':'branch','op':'recipe-branch','params':{'document':node(built),'parameters':params('world-axes',edge_length=3)}}]
    child=subprocess.run(['python','-B','-m','engine.server'],input='\n'.join(json.dumps(r) for r in requests)+'\n',
        capture_output=True,text=True,timeout=40,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr;replies=[json.loads(line) for line in child.stdout.splitlines()]
    assert [r['id'] for r in replies]==[r['id'] for r in requests]
    assert replies[0]['ok'] is False and replies[0]['type']=='GeometryError'
    assert all(r['ok'] is True for r in replies[1:])
    assert verify_source_zonohedron_workflow_evidence(node(replies[1]['result']))['passed']
    assert replies[1]['result']['measure']['content']==pytest.approx(8)
    assert semantic(model(replies[3]['result']['project']['documents'][0]))==semantic(model(built))
    assert semantic(model(replies[4]['result']))==semantic(model(built))
    assert model(replies[5]['result'])['measure']['content']==pytest.approx(27)
    assert semantic(model(dispatch({'op':'recipe-replay','params':{'document':node(replies[5]['result'])}})))==semantic(model(replies[5]['result']))
    assert built==before
