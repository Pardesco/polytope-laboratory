"""Actual layer dispatch/history/persistence and bounded JSON transport tests."""
from collections import Counter
from copy import deepcopy
from itertools import combinations, product
import json
import math
from pathlib import Path
import subprocess
import sys

import pytest

from engine.geometry import GeometryError,canonical_cycle,identity,validate
from engine.history import canonical_model
from engine.server import dispatch


KINDS=('vertices','edges','faces','cells')
BYTE={'encoding':'byte','values':[20,50,210,128]}
UNIT={'encoding':'unit','values':[.1,.4,.7,.3]}


def cube():
    # Literal ordered cube, independent of generators/hull implementation.
    vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
    faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    model={'id':'cube-base-stable','name':'Literal cube','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':vertices,'faces':faces,'cells':[],
        'edges':[list(edge) for edge in sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'fixture':{'author':'independent workflow','preserve':['XYZ','RGBA']},
            'offColors':{'faces':[deepcopy(BYTE),None,None,None,None,deepcopy(UNIT)],'cells':[]}}}
    model['fingerprint']=identity(model)
    return model


def square():
    return {'id':'memory-square-stable','name':'Literal square memory','dimension':2,'embeddingDimension':2,
        'interpretation':'generalized-complex','vertices':[[-1,-1],[1,-1],[1,1],[-1,1]],
        'edges':[[0,1],[1,2],[2,3],[0,3]],'faces':[[0,1,2,3]],'cells':[],
        'metadata':{'memoryOrigin':'slot-2','offColors':{'faces':[deepcopy(UNIT)],'cells':[]}},
        'numeric':{'mode':'float64-approximate','certified':False}}


def point():return {'kind':'point','source_id':'apex-stable-identity','coordinates':[0,0,0]}
def edge():return {'kind':'edge','source_id':'edge-stable-identity','start':[-.5,0,0],'end':[.5,0,0]}
def counts(model):return tuple(len(model[kind]) for kind in KINDS)
def evidence(model):return model['metadata']['convexLayerJoin']
def current(document):return document['states'][document['cursor']]


def document(base):
    return {'id':'layer-document','cursor':0,'states':[{'model':base,'notes':'original source notes',
        'view':{'coordinateUnit':'mm','surfaceOpacity':.75,'sectionNormal':[0,0,1],
            'sectionOffset':.25,'entity':2,'derivedMode':'section','camera':{'position':[3,4,5]},
            'foldFraction':.4,'explosionAmount':.2}}]}


def join(base,**params):
    request={'op':'convex-layer-join','model':base,'params':params};before=deepcopy(request)
    result=dispatch(request)
    assert request==before and validate(result)['passed'] and result['fingerprint']==identity(result)
    assert result['interpretation']=='convex-polytope' and result['numeric']['certified'] is False
    return result


def recipe(doc,**params):
    before=deepcopy(doc)
    result=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'convex-layer-join',
        'parameters':params,'label':'Parallel layer join (4D)'}})
    assert doc==before
    return result


def verify_maps(model,original_base,original_top=None):
    info=evidence(model)
    assert info['nonextremeInputPointIds']==[]
    assert sorted(info['inputToOutputVertexIds'])==list(range(len(model['vertices'])))
    assert info['layers'][0]['sourceSnapshot']==original_base
    if original_top is not None:assert info['layers'][1]['sourceSnapshot']==original_top
    owned=set()
    for layer in info['layers']:
        source=layer['sourceSnapshot'];mapping=layer['maps'];matrix=layer['transform']['matrix'];translation=layer['transform']['translation']
        assert layer['sourceModelId']==source['id']
        for source_id,target in enumerate(mapping['vertices']):
            p=source['vertices'][source_id]+([0] if len(source['vertices'][source_id])==2 else [])
            xyz=[sum(row[i]*p[i] for i in range(3))+translation[j] for j,row in enumerate(matrix)]
            assert model['vertices'][target]==pytest.approx(xyz+[(-.5 if layer['role']=='base' else .5)*info['height']])
        for original,target in zip(source['edges'],mapping['edges']):
            assert set(model['edges'][target])=={mapping['vertices'][v] for v in original}
        colors=source.get('metadata',{}).get('offColors',{}).get('faces',[None]*len(source['faces']))
        for original,target,color in zip(source['faces'],mapping['faces'],colors):
            assert canonical_cycle(model['faces'][target])==canonical_cycle([mapping['vertices'][v] for v in original])
            assert model['metadata']['offColors']['faces'][target]==color;owned.add(target)
        if source['dimension']==3:
            assert len(layer['capCellIds'])==1
            assert set(model['cells'][layer['capCellIds'][0]])==set(mapping['faces'])
        else:assert layer['capCellIds']==[]
    assert all(color is None for i,color in enumerate(model['metadata']['offColors']['faces']) if i not in owned)
    assert all(color is None for color in model['metadata']['offColors']['cells'])
    assert Counter(f for cell in model['cells'] for f in cell)==Counter({i:2 for i in range(len(model['faces']))})


def verify_tesseract(model):
    assert counts(model)==(16,32,24,8)
    corners=[tuple(p) for p in model['vertices']]
    assert set(corners)==set(product((-1,1),repeat=4))
    edges={frozenset((i,j)) for i,j in combinations(range(16),2) if sum(a!=b for a,b in zip(corners[i],corners[j]))==1}
    assert set(map(frozenset,model['edges']))==edges
    faces=set()
    for varying in combinations(range(4),2):
        fixed=[d for d in range(4) if d not in varying]
        for signs in product((-1,1),repeat=2):faces.add(frozenset(i for i,p in enumerate(corners) if all(p[d]==sign for d,sign in zip(fixed,signs))))
    assert set(map(frozenset,model['faces']))==faces
    assert all(len(f)==4 and all(frozenset((a,b)) in edges for a,b in zip(f,f[1:]+f[:1])) for f in model['faces'])
    expected_cells={frozenset(i for i,p in enumerate(corners) if p[d]==sign) for d in range(4) for sign in (-1,1)}
    assert {frozenset(v for f in c for v in model['faces'][f]) for c in model['cells']}==expected_cells
    assert model['measure']['content']==pytest.approx(16) and model['measure']['boundaryMeasure']==pytest.approx(64)


def test_actual_model_dispatch_cube_copy_complete_tesseract_source_attributes_and_analysis():
    base=cube();top=deepcopy(base);top['id']='cube-top-stable';top['metadata']['fixture']['role']='top'
    originals=deepcopy((base,top));model=join(base,top=top,height=2)
    verify_tesseract(model);verify_maps(model,*originals)
    assert (base,top)==originals and 'components' not in model
    before=deepcopy(model)
    result=dispatch({'op':'analyze-strict-segmentotope','model':model,'params':{'tolerance':1e-8}})
    assert result['status']=='passed' and result['strictPredicatesPassed'] and result['certified'] is False
    assert result['sourceFingerprint']==identity(model) and model==before


@pytest.mark.parametrize('spec',[point(),edge()])
def test_actual_compact_point_edge_dispatch_keeps_explicit_ids_without_fake_model_dimensions(spec):
    base=cube();before=deepcopy((base,spec));model=join(base,top=spec,height=.5)
    layer=evidence(model)['layers'][1];record=layer['sourceSnapshot']
    assert record['format']=='polytope-layer-source' and record['embeddingDimension']==3
    assert record['id']==spec['source_id'] and layer['sourceModelId']==spec['source_id']
    assert record['dimension']==(0 if spec['kind']=='point' else 1)
    assert record['vertices']==([spec['coordinates']] if spec['kind']=='point' else [spec['start'],spec['end']])
    assert record['faces']==record['cells']==[]
    verify_maps(model,base);assert (base,spec)==before
    if spec['kind']=='point':
        assert counts(model)==(9,20,18,7)
        apex=layer['maps']['vertices'][0]
        assert {frozenset(e) for e in model['edges']}=={frozenset(e) for e in base['edges']}|{frozenset((i,apex)) for i in range(8)}


@pytest.mark.parametrize('top',[square(),point(),edge()])
def test_signed_height_all_explicit_rigid_transform_options_keep_literal_xyz_source_maps(top):
    base=cube();before=deepcopy((base,top))
    rotation=[[0,-1,0],[1,0,0],[0,0,1]];reflection=[[-1,0,0],[0,1,0],[0,0,1]]
    result=join(base,top=top,height=-2,base_matrix=rotation,base_translation=[2,3,4],
        top_matrix=reflection,top_translation=[-.1,.2,.3])
    verify_maps(result,base,top if 'kind' not in top else None)
    assert result['vertices'][:8]==[[-p[1]+2,p[0]+3,p[2]+4,1.] for p in base['vertices']]
    assert evidence(result)['height']==-2
    assert [layer['transform']['determinant'] for layer in evidence(result)['layers']]==pytest.approx([1,-1])
    assert (base,top)==before


@pytest.mark.parametrize('top',[square(),point(),edge()])
def test_recipe_reopen_undo_replay_parameter_branch_and_original_source_stability(top,tmp_path):
    source=document(cube());before=deepcopy((source,top));params={'top':top,'height':2}
    made=recipe(source,**params);model=current(made)['model'];verify_maps(model,source['states'][0]['model'])
    node=made['operationHistory']['nodes'][-1]
    assert node['op']=='convex-layer-join' and node['algorithmVersion']=='0.1.0' and node['params']==params
    view=current(made)['view']
    assert view['coordinateUnit']=='mm' and view['surfaceOpacity']==.75 and view['sectionNormal']==[0,0,0,1]
    assert view['sectionOffset']==view['entity']==0 and view['cellFacing']=='all'
    assert not {'camera','foldFraction','explosionAmount'}&view.keys()
    assert current(made)['notes']=='original source notes'
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[made]}
    path=tmp_path/'native-layer.polyproj'
    dispatch({'op':'save','params':{'path':str(path),'project':project}})
    reopened=dispatch({'op':'load','params':{'path':str(path)}})['project']['documents'][0]
    assert canonical_model(current(reopened)['model'])==canonical_model(model)
    assert current(reopened)['model']['metadata']==model['metadata'] and current(reopened)['model']['provenance']==model['provenance']
    replay=dispatch({'op':'recipe-replay','params':{'document':reopened}})
    assert canonical_model(current(replay)['model'])==canonical_model(model)
    assert evidence(current(replay)['model'])==evidence(model)
    changed={**params,'height':-3,'top_translation':[.1,.2,.3]}
    branch=dispatch({'op':'recipe-branch','params':{'document':reopened,'parameters':changed}})
    assert evidence(current(branch)['model'])['height']==-3
    assert branch['operationHistory']['nodes'][-1]['algorithmVersion']=='0.1.0'
    assert branch['operationHistory']['nodes'][-1]['params']==changed
    assert canonical_model(branch['states'][0]['model'])==canonical_model(source['states'][0]['model'])
    if 'source_id' in top:
        for result in (model,current(reopened)['model'],current(replay)['model'],current(branch)['model']):
            assert evidence(result)['layers'][1]['sourceModelId']==top['source_id']
    reopened['cursor']=0;assert reopened['states'][0]['model']==source['states'][0]['model']
    reopened['cursor']=1;assert canonical_model(current(reopened)['model'])==canonical_model(model)
    assert (source,top)==before


@pytest.mark.parametrize('top',[cube(),square(),point(),edge()])
def test_full_json_protocol_roundtrip_two_joins_keeps_model_and_compact_source_ids(top):
    requests=[{'id':'first','op':'convex-layer-join','model':cube(),'params':{'top':top,'height':2}},
        {'id':'second','op':'convex-layer-join','model':cube(),'params':{'top':top,'height':-2}}]
    replies=protocol([json.dumps(request) for request in requests])
    assert [reply['id'] for reply in replies]==['first','second']
    assert all(reply['ok'] for reply in replies)
    for reply in replies:
        model=reply['result'];assert model['fingerprint']==identity(model)
        assert evidence(model)['layers'][1]['sourceModelId']==top.get('source_id',top.get('id'))
        verify_maps(model,cube(),top if 'kind' not in top else None)


def protocol(lines):
    result=subprocess.run([sys.executable,'-B','-m','engine.server'],input='\n'.join(lines)+'\n',
        text=True,encoding='utf-8',capture_output=True,cwd=Path(__file__).resolve().parents[1],timeout=45,check=True)
    assert not result.stderr
    return [json.loads(line) for line in result.stdout.splitlines()]


@pytest.mark.parametrize('params',[
    {},{'top':[]},{'top':None},
    {'top':{'kind':'point','coordinates':[0,0,0]}},
    {'top':{'kind':'point','coordinates':[0,0,0],'source_id':''}},
    {'top':{'kind':'point','coordinates':[0,0,0],'source_id':True}},
    {'top':{'kind':'point','coordinates':[0,0,0],'source_id':'x','extra':1}},
    {'top':{'kind':'plane','coordinates':[0,0,0],'source_id':'x'}},
    {'top':{'kind':'edge','start':[0,0,0],'end':[0,0,0],'source_id':'x'}},
    {'top':{'kind':'edge','start':[0,0],'end':[1,0,0],'source_id':'x'}},
    {'top':point(),'height':0},{'top':point(),'height':True},
    {'top':point(),'height':math.inf},{'top':point(),'height':10**500},
    {'top':point(),'gyro':True},{'top':point(),'crossed':True},{'top':point(),'base':cube()},
    {'top':point(),'top_matrix':[[2,0,0],[0,1,0],[0,0,1]]},
    {'top':point(),'top_translation':[0,0]},
])
def test_malformed_transport_refuses_atomically_and_does_not_append_recipe_state(params):
    source=document(cube());before=deepcopy((source,params))
    with pytest.raises(GeometryError):dispatch({'op':'convex-layer-join','model':source['states'][0]['model'],'params':params})
    with pytest.raises(GeometryError):recipe(source,**params)
    assert (source,params)==before and source['cursor']==0 and len(source['states'])==1


def test_cyclic_nonjson_deep_and_invalid_unicode_transport_are_structured_refusals():
    base=cube();before=deepcopy(base)
    cyclic={'top':point()};cyclic['loop']=cyclic
    with pytest.raises(GeometryError):dispatch({'op':'convex-layer-join','model':base,'params':cyclic})
    assert cyclic['loop'] is cyclic
    invalid={'top':point(),'unknown':{1,2}}
    old=deepcopy(invalid)
    with pytest.raises(GeometryError):dispatch({'op':'convex-layer-join','model':base,'params':invalid})
    assert invalid==old
    deep={'top':point()};node=deep
    for _ in range(70):node['nested']={};node=node['nested']
    with pytest.raises(GeometryError):dispatch({'op':'convex-layer-join','model':base,'params':deep})
    with pytest.raises(GeometryError):dispatch({'op':'convex-layer-join','model':base,'params':{'top':point(),'\ud800':1}})
    assert base==before


def test_unknown_algorithm_and_read_only_analysis_options_are_strict():
    base=cube();before=deepcopy(base)
    with pytest.raises(GeometryError,match='algorithm version'):dispatch({'op':'convex-layer-join','model':base,'algorithmVersion':'future','params':{'top':point()}})
    made=join(base,top=point())
    with pytest.raises(GeometryError,match='only tolerance'):dispatch({'op':'analyze-strict-segmentotope','model':made,'params':{'crossed':True}})
    assert base==before


def test_json_lines_continue_after_syntax_nonfinite_and_compact_schema_errors():
    good={'id':'good','op':'convex-layer-join','model':cube(),'params':{'top':point(),'height':2}}
    bad={'id':'bad','op':'convex-layer-join','model':cube(),'params':{'top':{'kind':'point','coordinates':[0,0,0]}}}
    nonfinite=deepcopy(good);nonfinite['id']='nonfinite';nonfinite['params']['top']['coordinates'][0]=float('nan')
    replies=protocol(['{"op":','undefined',json.dumps(bad),json.dumps(nonfinite),json.dumps(good)])
    assert [r['ok'] for r in replies]==[False,False,False,False,True]
    assert [r['id'] for r in replies]==[None,None,'bad','nonfinite','good']
    assert [r['type'] for r in replies[:2]]==['JSONDecodeError','JSONDecodeError']
    assert all(r['type']=='GeometryError' for r in replies[2:4])
    assert counts(replies[4]['result'])==(9,20,18,7)
