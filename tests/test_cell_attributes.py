"""Independent literal cells and actual native project/history regressions."""
from copy import deepcopy
from itertools import combinations,product
import json
import math
import os
import subprocess
import sys

import numpy as np
import pytest

from engine.cell_attributes import (VERSION,LEGACY_VERSION,LIMITS,extract_cell,
    dispatch_cell,verify_cell_evidence,run_cell,replay_cell_history,
    replay_cell_document,branch_cell)
from engine.geometry import GeometryError,identity,validate
from engine.formats import validate_project,save_project,load_file
from engine.server import dispatch
from engine.augmentation_workflow import equivalent_json
from engine.history import (ALGORITHM_VERSIONS,create_history,record_source,
    record_operation,validate_history,replay_history)


def literal_tesseract(convex=False,scale=1):
    vertices=[list(p) for p in product((-1,1),repeat=4)]
    lookup={tuple(p):i for i,p in enumerate(vertices)};faces=[]
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
    color=lambda i: {'encoding':'byte','values':[30+i,80,210,128]} if i%2 else {'encoding':'unit','values':[.25,.75,.5,.3]}
    model={'id':'literal-cell-source','name':'Literal colored tesseract','dimension':4,'embeddingDimension':4,
        'interpretation':'convex-polytope' if convex else 'generalized-complex',
        'vertices':[[x*scale for x in p] for p in vertices],'edges':[list(e) for e in edges],'faces':faces,'cells':cells,
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','offColors':{'faces':[color(i) for i in range(24)],'cells':[color(i+30) for i in range(8)]},
            'retained':{'literal':'source-owned raw attribute','signedSymbol':'5/-3','numbers':[1,.25]}}}
    assert validate(model)['passed'];return model


def document(source=None):
    return {'id':'cell-source-document','cursor':0,'states':[{'model':literal_tesseract() if source is None else source,
        'view':{'coordinateUnit':'mm','sectionNormal':[0,0,0,1],'derivedMode':'section'},'notes':'Keep source notes'}]}


def model(doc):return doc['states'][doc['cursor']]['model']
def project(doc):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
def cycle(face):
    return min(tuple(f[i:]+f[:i]) for f in (face,list(reversed(face))) for i in range(len(f)))


def assert_cube(result,source,index=0,scale=1):
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')]==[8,12,6,0]
    evidence=result['metadata']['cellExtraction'];maps=evidence['maps'];frame=evidence['frame']
    assert maps['cells']==[index] and maps['faces']==source['cells'][index]
    p=np.array(result['vertices']);reconstructed=p@np.array(frame['basis']).T+frame['origin']
    assert np.allclose(reconstructed,[source['vertices'][v] for v in maps['vertices']],rtol=1e-12,atol=abs(scale)*1e-12)
    assert np.allclose(np.array(frame['basis']).T@np.array(frame['basis']),np.eye(3),atol=1e-12)
    assert frame['ambientOrientationDeterminant']==pytest.approx(1)
    assert np.allclose(np.array(frame['basis']).T@frame['normal'],0,atol=1e-12)
    for i,e in enumerate(result['edges']):
        assert [maps['vertices'][v] for v in e]==source['edges'][maps['edges'][i]]
        assert np.linalg.norm(p[e[0]]-p[e[1]])==pytest.approx(2*abs(scale))
    for i,f in enumerate(result['faces']):
        assert [maps['vertices'][v] for v in f]==source['faces'][maps['faces'][i]]
        assert result['metadata']['offColors']['faces'][i]==source['metadata']['offColors']['faces'][maps['faces'][i]]
    assert result['metadata']['offColors']['cells']==[]
    assert evidence['selectedCellColor']==source['metadata']['offColors']['cells'][index]
    assert evidence['sourceModel']==equivalent_json(source)
    assert result['metadata']['coordinateUnits']=='mm'
    assert evidence['resultFingerprint']==identity(result)
    assert result['provenance']['algorithmVersion']==VERSION
    assert verify_cell_evidence(result)['passed']


@pytest.mark.parametrize('index',range(8))
def test_independent_literal_each_cell_full_cycles_maps_rgba_units_source_immutable(index):
    source=literal_tesseract();before=deepcopy(source);result=extract_cell(source,index)
    assert source==before;assert_cube(result,source,index)
    assert result['interpretation']=='generalized-complex' and 'measure' not in result
    assert result['metadata']['cellExtraction']['classification']['status']=='passed'


def test_selected_cell_color_does_not_override_null_or_different_face_colors():
    source=literal_tesseract();fi=source['cells'][0][0];source['metadata']['offColors']['faces'][fi]=None
    result=extract_cell(source)
    assert result['metadata']['offColors']['faces'][0] is None
    assert result['metadata']['cellExtraction']['selectedCellColor'] is not None
    assert len(result['metadata']['offColors']['faces'])==6


def test_missing_units_and_colors_remain_absent_or_null_not_fabricated():
    source=literal_tesseract();source['metadata'].pop('coordinateUnits');source['metadata'].pop('offColors')
    result=extract_cell(source)
    assert 'coordinateUnits' not in result['metadata']
    assert result['metadata']['offColors']=={'faces':[None]*6,'cells':[]}
    assert result['metadata']['cellExtraction']['selectedCellColor'] is None


def test_declared_convex_cell_complete_boundary_qualifies_measures_without_hull_substitution():
    source=literal_tesseract(convex=True);result=extract_cell(source)
    assert_cube(result,source);assert result['interpretation']=='convex-polytope'
    assert result['measure']['content']==pytest.approx(8)
    assert result['measure']['boundaryMeasure']==pytest.approx(24)
    assert {frozenset(f) for f in result['facetVertices']}=={frozenset(f) for f in result['faces']}
    assert result['numeric']['certified'] is False


@pytest.mark.parametrize('scale',[1e99,1e-100,1e-110])
def test_scale_sensitive_native_measure_gate_is_honest_and_roundtrip_valid(scale):
    source=literal_tesseract(convex=True,scale=scale);result=extract_cell(source)
    assert_cube(result,source,scale=scale)
    assert result['metadata']['cellExtraction']['nativeProjectGate']['passed']
    if scale==1e-110:assert result['interpretation']=='generalized-complex' and 'measure' not in result
    else:assert result['measure']['content']==pytest.approx(8*scale**3,rel=1e-12,abs=0)


def test_literal_star_cell_preserves_signed_source_cycles_without_convexification():
    from engine.star_polygons import regular_star_polygon
    from engine.products import polygon_prism
    from engine.prisms import polyhedron_prism
    prism=polygon_prism(regular_star_polygon(5,-3),height=2)
    source=polyhedron_prism(prism,height=2)
    source['metadata']['coordinateUnits']='cm'
    source['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.2,.4,.6,.3]}]*len(source['faces']),
                                   'cells':[{'encoding':'byte','values':[50,70,90,100]}]*len(source['cells'])}
    result=extract_cell(source,0);e=result['metadata']['cellExtraction'];maps=e['maps']
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')]==[10,15,7,0]
    assert [[maps['vertices'][v] for v in f] for f in result['faces']]==[source['faces'][f] for f in source['cells'][0]]
    assert e['classification']['status']=='non-convex' and result['interpretation']=='generalized-complex'
    assert 'measure' not in result and result['metadata']['coordinateUnits']=='cm'
    assert verify_cell_evidence(result)['passed']


@pytest.mark.parametrize('reflected',[False,True])
def test_source_owned_frame_reconstructs_oblique_translated_or_reflected_coordinates(reflected):
    source=literal_tesseract();angle=.37
    matrix=np.eye(4);matrix[0,0]=matrix[3,3]=math.cos(angle);matrix[0,3]=-math.sin(angle);matrix[3,0]=math.sin(angle)
    if reflected:matrix[1]*=-1
    source['vertices']=(np.array(source['vertices'])@matrix.T+[3,4,5,6]).tolist()
    result=extract_cell(source,2);assert_cube(result,source,2)
    assert result['metadata']['cellExtraction']['frame']['ambientOrientationDeterminant']==pytest.approx(1)
    selected=result['metadata']['cellExtraction']['maps']['vertices']
    assert np.allclose(result['metadata']['cellExtraction']['frame']['origin'],
                       np.array(source['vertices'])[selected].mean(axis=0),atol=1e-12)
    assert np.allclose(np.array(result['vertices']).mean(axis=0),0,atol=1e-12)


@pytest.mark.parametrize('index',range(8))
def test_each_cell_is_centroid_centered_without_changing_ordered_basis_incidence_or_rgba(index):
    source=literal_tesseract(convex=True);before=deepcopy(source)
    result=extract_cell(source,index);assert_cube(result,source,index)
    frame=result['metadata']['cellExtraction']['frame'];selected=result['metadata']['cellExtraction']['maps']['vertices']
    assert np.array(frame['origin'])==pytest.approx(np.array(source['vertices'])[selected].mean(axis=0))
    assert np.array(result['vertices']).mean(axis=0)==pytest.approx(np.zeros(3),abs=1e-12)
    assert np.linalg.norm(np.array(result['vertices']),axis=1)==pytest.approx(np.full(8,math.sqrt(3)))
    assert all(np.dot(row[:3],[0,0,0])+row[3]<0 for row in result['facetEquations'])
    # The original first-corner displacement directions remain source-owned;
    # moving the origin does not rotate or renumber the resulting cell.
    anchors=frame['anchorVertexIds'];assert anchors[0]==selected[0]
    assert source==before


def test_centroid_cell_origin_supports_existing_zero_center_core_and_regular_simplex_sphere():
    # Independent standard4-simplex: the cell opposite0 consists of four
    # coordinate unit vectors, so its centroid is (.25,.25,.25,.25), edge
    # length sqrt2 and each centered vertex radius sqrt3/2.
    points=[[0.,0.,0.,0.],*[[float(x) for x in row] for row in np.eye(4)]]
    faces=[list(face) for face in combinations(range(5),3)]
    source={'id':'literal-centroid-simplex','name':'Literal standard4-simplex',
        'dimension':4,'embeddingDimension':4,'interpretation':'convex-polytope',
        'vertices':points,'edges':[list(edge) for edge in combinations(range(5),2)],
        'faces':faces,'cells':[[i for i,face in enumerate(faces) if omit not in face] for omit in range(5)],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','offColors':{'faces':[None]*10,'cells':[{'encoding':'unit','values':[.1,.3,.8,.4]}]*5}}}
    before=deepcopy(source);result=dispatch({'op':'cell','model':source,'params':{'kind':'cell','index':0}})
    frame=result['metadata']['cellExtraction']['frame']
    assert frame['origin']==pytest.approx([.25]*4)
    assert np.array(result['vertices']).mean(axis=0)==pytest.approx(np.zeros(3),abs=1e-12)
    assert np.linalg.norm(np.array(result['vertices']),axis=1)==pytest.approx(np.full(4,math.sqrt(3)/2))
    assert result['metadata']['cellExtraction']['sourceModel']==equivalent_json(source)
    assert result['metadata']['offColors']['faces']==[None]*4
    assert result['metadata']['cellExtraction']['selectedCellColor']==source['metadata']['offColors']['cells'][0]
    core=dispatch({'op':'convex-core','model':result,'params':{'center':[0.,0.,0.]}})
    assert [len(core[k]) for k in ('vertices','edges','faces','cells')]==[4,6,4,0]
    assert np.array(core['vertices']).mean(axis=0)==pytest.approx(np.zeros(3),abs=1e-12)
    geodesic=dispatch({'op':'triangular-geodesic','model':core,'params':{'frequency':1}})
    assert [len(geodesic[k]) for k in ('vertices','edges','faces','cells')]==[4,6,4,0]
    assert source==before


def test_compound_cell_maps_keep_offset_ids_full_components_history_but_no_false_current_components():
    from engine.compounds import add_models
    source=add_models(literal_tesseract(),literal_tesseract())
    result=extract_cell(source,8);e=result['metadata']['cellExtraction']
    assert e['maps']['vertices']==list(range(16,24))
    assert e['maps']['faces']==source['cells'][8]
    assert e['sourceModel']['components']==source['components']
    assert 'components' not in result and 'compound' not in result['metadata']
    assert e['selectedCellColor']==source['metadata']['offColors']['cells'][8]
    assert verify_cell_evidence(result)['passed']


def test_unowned_wire_edges_are_not_falsely_attributed_to_selected_cell():
    source=literal_tesseract();source['edges'].append([0,7])
    assert validate(source)['passed']
    result=extract_cell(source)
    assert len(result['edges'])==12 and 32 not in result['metadata']['cellExtraction']['maps']['edges']
    assert result['metadata']['cellExtraction']['sourceModel']['edges'][-1]==[0,7]


@pytest.mark.parametrize('index',[True,0.0,-1,256,10**500,'0',None,[],{}])
def test_malformed_indices_structured_atomic_refusal(index):
    source=literal_tesseract();before=deepcopy(source)
    with pytest.raises(GeometryError):extract_cell(source,index)
    assert source==before


@pytest.mark.parametrize('mutation',[
    lambda s:s['edges'][0].__setitem__(0,False),lambda s:s['faces'][0].__setitem__(0,0.0),
    lambda s:s['cells'][0].__setitem__(0,False),lambda s:s.__setitem__('dimension',4.0),
    lambda s:s.__setitem__('embeddingDimension',True),lambda s:s['vertices'][0].__setitem__(0,float('nan')),
    lambda s:s['vertices'][0].__setitem__(0,10**500),lambda s:s.__setitem__('id','\ud800'),
    lambda s:s['metadata'].__setitem__('bad','\ud800'),lambda s:s['metadata'].__setitem__('bad',2**60),
    lambda s:s['metadata'].__setitem__('bad',float(2**60)),lambda s:s['metadata'].__setitem__('coordinateUnits',[]),
    lambda s:s['metadata']['offColors']['faces'][0]['values'].__setitem__(0,True),
    lambda s:s['metadata']['offColors']['cells'].pop(),lambda s:s['cells'][0].pop(),
    lambda s:s['vertices'][0].__setitem__(0,.5),
])
def test_invalid_source_numbers_json_colors_planarity_or_open_links_refused(mutation):
    source=literal_tesseract();mutation(source)
    with pytest.raises(GeometryError):extract_cell(source)


def test_budgets_checked_before_copy_deep_cyclic_and_large_source():
    for bad in ('deep','cycle','vertices','faces'):
        source=literal_tesseract()
        if bad=='deep':
            value=None
            for _ in range(1000):value=[value]
            source['metadata']['bad']=value
        elif bad=='cycle':source['metadata']['bad']=source
        elif bad=='vertices':source['vertices']*=LIMITS['sourceVertices']//len(source['vertices'])+1
        else:source['faces']*=171
        with pytest.raises(GeometryError):extract_cell(source)


def test_stale_source_fingerprint_rejected_instead_of_retained_as_current_binding():
    source=literal_tesseract();source['fingerprint']='foreign'
    with pytest.raises(GeometryError,match='fingerprint is stale'):extract_cell(source)


def test_scientific_large_float_attributes_roundtrip_but_unsafe_decimal_ints_refuse():
    source=literal_tesseract();source['metadata']['scientific']=1e99
    assert verify_cell_evidence(extract_cell(source))['passed']
    source['metadata']['scientific']=float(2**60)
    with pytest.raises(GeometryError,match='not portable'):extract_cell(source)


@pytest.mark.parametrize('field',['color','cell-color','unit','map','frame','source','provenance','classification','measure'])
def test_geometry_fingerprint_does_not_mask_full_attribute_evidence_tamper(field):
    source=literal_tesseract(convex=True);result=extract_cell(source);before=identity(result);e=result['metadata']['cellExtraction']
    if field=='color':result['metadata']['offColors']['faces'][0]=None
    elif field=='cell-color':e['selectedCellColor']=None
    elif field=='unit':result['metadata']['coordinateUnits']='cm'
    elif field=='map':e['maps']['edges'][0]=999
    elif field=='frame':e['frame']['origin'][0]+=.25
    elif field=='source':e['sourceModel']['metadata']['retained']['literal']='forged'
    elif field=='provenance':result['provenance']['sourceId']='foreign'
    elif field=='classification':e['classification']['certified']=True
    else:result['measure']['content']=9
    assert identity(result)==before
    with pytest.raises(GeometryError):verify_cell_evidence(result)


def test_native_save_load_and_real_node_numeric_serialization(tmp_path):
    result=run_cell(document(),{'index':0});before=deepcopy(result)
    code="let t='';process.stdin.on('data',x=>t+=x).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    child=subprocess.run(['node','-e',code],input=json.dumps(project(result)),capture_output=True,text=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    p=json.loads(child.stdout);file=tmp_path/'attributes.polyproj';save_project(file,p)
    restored=load_file(file)['project']['documents'][0]
    assert equivalent_json(model(restored))==equivalent_json(model(result))
    assert verify_cell_evidence(model(restored))['passed']
    assert equivalent_json(model(replay_cell_document(restored)))==equivalent_json(model(result))
    assert result==before


def test_replay_original_parent_branch_and_source_only_target():
    source=document();result=run_cell(source,{'index':0});assert source['cursor']==0 and len(source['states'])==1
    assert result['operationHistory']['nodes'][-1]['algorithmVersion']==VERSION
    branch=branch_cell(result,{'index':1});assert_cube(model(branch),result['states'][0]['model'],1)
    nodes=branch['operationHistory']['nodes'];assert nodes[-1]['parent']==nodes[-2]['parent']
    assert equivalent_json(model(replay_cell_document(branch)))==equivalent_json(model(branch))
    source_id=nodes[0]['id'];assert model(replay_cell_document(branch,source_id))['dimension']==4
    states=replay_cell_history(branch['operationHistory']);assert len(states)==3


def test_changed_unit_face_and_cell_rgba_reroot_historical_source_before_new_operation():
    first=run_cell(document(),{'index':0});first['cursor']=0
    source=model(first);source['metadata']['coordinateUnits']='cm';source['metadata']['offColors']['cells'][1]=None
    source['metadata']['offColors']['faces'][source['cells'][1][0]]=None
    result=run_cell(first,{'index':1});nodes=result['operationHistory']['nodes']
    assert nodes[-2]['op']=='source' and nodes[-2]['parent']==nodes[0]['id']
    assert model(result)['metadata']['coordinateUnits']=='cm'
    assert model(result)['metadata']['cellExtraction']['selectedCellColor'] is None
    assert model(result)['metadata']['offColors']['faces'][0] is None
    assert equivalent_json(model(replay_cell_document(result)))==equivalent_json(model(result))


def test_actual_native_transform_ancestor_and_transform_descendant_replay():
    ancestor=dispatch({'op':'recipe-run','params':{'document':document(),'operation':'transform',
        'parameters':{'translation':[2,3,4,5]}}})
    extracted=run_cell(ancestor,{'index':2});assert_cube(model(extracted),model(ancestor),2)
    descendant=dispatch({'op':'recipe-run','params':{'document':extracted,'operation':'transform',
        'parameters':{'translation':[1,2,3]}}})
    assert equivalent_json(model(replay_cell_document(descendant)))==equivalent_json(model(descendant))


def test_actual_mounted_4d_core_then_new_cell_then_3d_core_full_attributes_replay():
    core4d=dispatch({'op':'recipe-run','params':{'document':document(),
        'operation':'convex-core-4d','parameters':{'center':[0,0,0,0]}}})
    extracted=run_cell(core4d,{'index':0});source=model(core4d);current=model(extracted)
    assert current['metadata']['cellExtraction']['sourceModel']==equivalent_json(source)
    assert current['metadata']['cellExtraction']['selectedCellColor']==source['metadata']['offColors']['cells'][0]
    assert current['metadata']['offColors']['faces']==[None]*6
    core3d=dispatch({'op':'recipe-run','params':{'document':extracted,
        'operation':'convex-core','parameters':{'center':[0,0,0]}}})
    replayed=replay_cell_document(core3d)
    assert equivalent_json(model(replayed))==equivalent_json(model(core3d))
    assert model(replayed)['metadata']['coordinateUnits']=='mm'


@pytest.mark.parametrize('field',['version','policy','params','dependency','source-hash'])
def test_history_metadata_and_unknown_versions_are_strictly_refused(field):
    result=run_cell(document(),{});graph=result['operationHistory'];node=graph['nodes'][-1]
    if field=='version':node['algorithmVersion']='0.9.0'
    elif field=='policy':node['numericPolicy']['certified']=True
    elif field=='params':node['params']['index']=0.0
    elif field=='dependency':node['inputs']=[node['parent'],node['parent']]
    else:node['sourceSnapshotHash']='0'*64
    with pytest.raises(GeometryError):replay_cell_history(graph)


def test_raw_document_and_history_float_incidence_rejected_before_json_normalization():
    source=document();source['states'][0]['model']['edges'][0][0]=0.0
    with pytest.raises(GeometryError):run_cell(source,{})
    result=run_cell(document(),{})
    result['operationHistory']['nodes'][0]['snapshot']['model']['edges'][0][0]=0.0
    with pytest.raises(GeometryError):replay_cell_history(result['operationHistory'])


@pytest.mark.parametrize('field',['color','unit','selected-cell','map','parent-color'])
def test_replay_full_attribute_tamper_refused_even_when_native_history_geometry_valid(field):
    result=run_cell(document(),{'index':0});node=result['operationHistory']['nodes'][-1];m=node['snapshot']['model']
    if field=='color':m['metadata']['offColors']['faces'][0]=None
    elif field=='unit':m['metadata']['coordinateUnits']='cm'
    elif field=='selected-cell':m['metadata']['cellExtraction']['selectedCellColor']=None
    elif field=='map':m['metadata']['cellExtraction']['maps']['faces'][0]=999
    else:m['metadata']['cellExtraction']['sourceModel']['metadata']['offColors']['cells'][0]=None
    assert validate_history(result['operationHistory'])
    with pytest.raises(GeometryError):replay_cell_history(result['operationHistory'])


@pytest.mark.parametrize('target',[False,0,[],{},'',1.0])
def test_raw_bad_replay_and_branch_targets_cannot_fall_back_to_current(target):
    result=run_cell(document(),{})
    with pytest.raises(GeometryError):replay_cell_document(result,target)
    with pytest.raises(GeometryError):branch_cell(result,{},target)


def test_legacy_version_stays_actual_native_geometry_and_replay_semantics():
    source=document(literal_tesseract(convex=True));legacy=dispatch_cell({'op':'cell','model':model(source),'params':{'index':0},'algorithmVersion':LEGACY_VERSION})
    assert legacy['provenance']['algorithmVersion']==LEGACY_VERSION
    assert 'cellExtraction' not in legacy['metadata'] and 'coordinateUnits' not in legacy['metadata']
    old=run_cell(source,{'index':0},version=LEGACY_VERSION)
    assert old['operationHistory']['nodes'][-1]['algorithmVersion']==LEGACY_VERSION
    assert equivalent_json(model(replay_cell_document(old)))==equivalent_json(model(old))
    branch=branch_cell(old,{'index':1});assert branch['operationHistory']['nodes'][-1]['algorithmVersion']==LEGACY_VERSION
    assert 'cellExtraction' not in model(branch)['metadata']
    # Explicit legacy replay/branch stays legacy after the current registry
    # moves to0.2; do not assert the old registry is still current.
    assert old['operationHistory']['nodes'][-1]['algorithmVersion']==LEGACY_VERSION


def test_legacy_face_dispatch_and_history_stays_two_dimensional():
    source=document();old=run_cell(source,{'kind':'face','index':0},version=LEGACY_VERSION)
    assert model(old)['dimension']==2 and 'cellExtraction' not in model(old)['metadata']
    assert model(replay_cell_document(old))['fingerprint']==model(old)['fingerprint']


def test_actual_json_server_legacy_and_bad_input_continuation_read_only():
    source=literal_tesseract();requests=[{'id':'bad','op':'cell','model':source,'params':{'index':True}},
        {'id':'old','op':'cell','algorithmVersion':LEGACY_VERSION,'model':source,'params':{'index':0}},
        {'id':'catalog','op':'catalog'}]
    child=subprocess.run([sys.executable,'-B','-m','engine.server'],input='\n'.join(json.dumps(r) for r in requests)+'\n',
        capture_output=True,text=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    rows=[json.loads(s) for s in child.stdout.splitlines()];assert len(rows)==3
    assert rows[0]['id']=='bad' and 'error' in rows[0]
    assert rows[1]['id']=='old' and rows[1]['ok'];assert 'cellExtraction' not in rows[1]['result']['metadata']
    assert rows[2]['id']=='catalog' and rows[2]['ok']


@pytest.mark.parametrize('extra',[{'algorithmVersion':'future'},{'unexpected':True},{'id':True},{'params':{'index':0.0}},{'params':{'kind':'face'}},{'params':{'index':0,'color_policy':'none'}}])
def test_strict_future_dispatch_unknown_fields_versions_and_coercion_refused(extra):
    request={'op':'cell','model':literal_tesseract(),'params':{},'algorithmVersion':VERSION};request.update(extra)
    with pytest.raises(GeometryError):dispatch_cell(request)


def test_future_version_readable_native_project_but_not_silently_legacy_replayed():
    result=run_cell(document(),{})
    result['operationHistory']['nodes'][-1]['algorithmVersion']='0.9.0'
    assert validate_project(deepcopy(project(result)))
    with pytest.raises(GeometryError,match='unsupported algorithm version'):
        replay_history(result['operationHistory'],dispatch)
