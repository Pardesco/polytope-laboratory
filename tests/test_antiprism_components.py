"""Independent dimensional leaves, exact source IDs, native I/O and replay."""
from collections import Counter
from copy import deepcopy
import json
import math
import uuid

import numpy as np
import pytest

import engine.antiprism_components as attachment
from engine.antiprism_components import (attach_construction_components,
                                        attach_antiprism_components,
                                        attach_polyhedron_prism_components)
from engine.antiprisms import rational_antiprism
from engine.antiprisms import _snapshot_hash
from engine.compounds import add_models, extract_component, remove_component, retrieve_source
from engine.convex_classification import analyze_convex_boundary
from engine.formats import validate_project
from engine.geometry import GeometryError, identity, validate
from engine.history import canonical_model
from engine.prisms import polyhedron_prism
from engine.prisms import _hash
from engine.server import dispatch


KINDS=('vertices','edges','faces','cells')
BYTE_RGBA={'encoding':'byte','values':[17,30,220,128]}
UNIT_RGBA={'encoding':'unit','values':[.1,.3,.8,.25]}


def generated(dimension,n=6,d=2):
    colors=[deepcopy(BYTE_RGBA if i%2==0 else UNIT_RGBA) for i in range(math.gcd(n,abs(d)))]
    anti=rational_antiprism(n,d,cap_colors=colors)
    model=anti if dimension==3 else polyhedron_prism(anti,2)
    model['metadata']['fixtureAttribute']={'preserve':['literal','attributes']}
    # Current generated colors are independently editable. Historical polygon
    # cap colors stay in the complete source snapshot, rather than being guessed.
    model['metadata']['offColors']['faces'][-1]=deepcopy(UNIT_RGBA)
    if model['cells']:
        model['metadata']['offColors']['cells'][0]=deepcopy(BYTE_RGBA)
        model['metadata']['offColors']['cells'][-1]=deepcopy(UNIT_RGBA)
    return model


def schema(model):return 'rationalAntiprism' if model['dimension']==3 else 'polyhedronPrism'
def evidence(model):return model['metadata'][schema(model)]
def counts(model):return tuple(len(model[kind]) for kind in KINDS)


def expected_maps(model,vertices):
    owned=set(vertices);faces=[i for i,face in enumerate(model['faces']) if set(face)<=owned]
    return {'vertices':sorted(owned),'edges':[i for i,edge in enumerate(model['edges']) if set(edge)<=owned],
            'faces':faces,'cells':[i for i,cell in enumerate(model['cells']) if set(cell)<=set(faces)]}


def historical(root,path):
    for index in path:root=retrieve_source(root,index)
    return root


def verify_tree(model):
    if 'compound' not in model['metadata']:return
    for index,info in enumerate(model['metadata']['compound']['inputs']):
        source=retrieve_source(model,index);maps=info['maps']
        assert info['sourceModelId']==source['id'] and info['sourceFingerprint']==identity(source)
        assert [model['vertices'][i] for i in maps['vertices']]==source['vertices']
        for kind in ('edges','faces','cells'):
            lower='faces' if kind=='cells' else 'vertices'
            assert [model[kind][i] for i in maps[kind]]==[[maps[lower][v] for v in row] for row in source[kind]]
        verify_tree(source)


def verify_leaf(leaf):
    assert leaf['dimension']==leaf['embeddingDimension']
    assert np.linalg.matrix_rank(np.asarray(leaf['vertices'])-leaf['vertices'][0])==leaf['dimension']
    if leaf['dimension']==3:
        links=Counter(tuple(sorted((a,b))) for face in leaf['faces'] for a,b in zip(face,face[1:]+face[:1]))
        assert set(links)=={tuple(sorted(edge)) for edge in leaf['edges']} and set(links.values())=={2}
    else:
        ridges=Counter(face for cell in leaf['cells'] for face in cell)
        assert ridges==Counter({i:2 for i in range(len(leaf['faces']))})
        for cell in leaf['cells']:
            links=Counter(tuple(sorted((a,b))) for f in cell for a,b in zip(leaf['faces'][f],leaf['faces'][f][1:]+leaf['faces'][f][:1]))
            assert set(links.values())=={2}


@pytest.mark.parametrize('dimension',[3,4])
@pytest.mark.parametrize('n,d',[(6,2),(6,-2),(9,3),(15,5)])
def test_complete_leaf_geometry_id_permutations_historical_source_ids_rgba_and_no_source_mutation(dimension,n,d):
    model=generated(dimension,n,d);before=deepcopy(model);result=attach_construction_components(model)
    assert model==before and result['id']==model['id'] and result['fingerprint']==identity(model)
    for kind in KINDS:assert result[kind]==before[kind]
    for key in ('name','numeric','provenance'):assert result[key]==before[key]
    assert result['metadata']['offColors']==before['metadata']['offColors']
    g=math.gcd(n,abs(d));block=2*n
    assert len(result['components'])==g
    assert [record['maps'] for record in result['components']]==[
        expected_maps(model,[angular+ring*n+layer*block for layer in range(1 if dimension==3 else 2)
                             for ring in (0,1) for angular in range(parity,n,g)])
        for parity in range(g)]
    verify_tree(result)
    assert evidence(result)['recoverableCompoundComponents'] is True
    for original_partition,record,proof in zip(evidence(before)['componentPartitions'],result['components'],result['metadata']['constructionComponents']['partitionComponents']):
        leaf=historical(result,record['sourcePath']);extracted=extract_component(result,record['id'])
        uuid.UUID(record['id']);uuid.UUID(record['sourceModelId'])
        assert leaf['id']==record['sourceModelId'] and identity(leaf)==record['sourceFingerprint']==identity(extracted)
        assert counts(leaf)==((6,12,8,0) if dimension==3 else (12,30,28,10))
        assert leaf['vertices']==[before['vertices'][i] for i in record['maps']['vertices']]
        info=leaf['metadata']['constructionLeaf']
        assert info['sourceModel']==evidence(before)['sourceModel']
        assert info['sourceComponentId']==original_partition['sourceComponentId']==proof['sourceComponentId']
        assert info['generatedSourceMaps']==record['maps']
        assert info['generatedSourceAttributes']['fixtureAttribute']==before['metadata']['fixtureAttribute']
        for kind in ('faces','cells'):
            assert extracted['metadata']['offColors'][kind]==[before['metadata']['offColors'][kind][i] for i in record['maps'][kind]]
        verify_leaf(extracted)
    result['vertices'][0][0]=999
    result['metadata']['compound']['sourceModels'][0]['vertices'][0][0]=888
    result['metadata'][schema(result)]['sourceModel']['vertices'][0][0]=777
    assert model==before


@pytest.mark.parametrize('dimension',[3,4])
def test_hexagram_phases_are_literal_octahedron_leaves_not_recentred_reduced_generators(dimension):
    model=generated(dimension);result=attach_construction_components(model)
    hexagon=[[1,0],[.5,math.sqrt(3)/2],[-.5,math.sqrt(3)/2],[-1,0],[-.5,-math.sqrt(3)/2],[.5,-math.sqrt(3)/2]]
    theta=math.pi/3;cosine,sine=math.cos(theta),math.sin(theta);height=math.sqrt(2)
    anti_vertices=[point+[-height/2] for point in hexagon]+[
        [cosine*x-sine*y,sine*x+cosine*y,height/2] for x,y in hexagon]
    assert np.asarray(model['vertices'])==pytest.approx(np.asarray(anti_vertices if dimension==3 else [p+[w] for w in (-1,1) for p in anti_vertices]),abs=1e-15)
    leaves=[extract_component(result,record['id']) for record in result['components']]
    assert leaves[0]['vertices']!=leaves[1]['vertices']
    for ordinal,leaf in enumerate(leaves):
        assert np.asarray(leaf['vertices'][0][:2])==pytest.approx(np.asarray(hexagon[ordinal]),abs=1e-15)
        if dimension==3:
            cloud=np.asarray(leaf['vertices']);gram=cloud@cloud.T
            assert np.diag(gram)==pytest.approx(np.ones(6)*1.5)
            assert sorted(round(x,12) for x in gram[np.triu_indices(6,1)])==[-1.5]*3+[0.0]*12


@pytest.mark.parametrize('dimension',[3,4])
def test_component_drop_retains_current_order_colors_remaining_id_and_full_historical_snapshots(dimension):
    attached=attach_construction_components(generated(dimension,9,3));before=deepcopy(attached)
    removed=attached['components'][1];result=remove_component(attached,removed['id'])
    assert attached==before and len(result['components'])==2
    keep={kind:[i for i in range(len(attached[kind])) if i not in removed['maps'][kind]] for kind in KINDS}
    reverse={kind:{old:new for new,old in enumerate(keep[kind])} for kind in KINDS}
    assert result['vertices']==[attached['vertices'][i] for i in keep['vertices']]
    for kind in ('edges','faces','cells'):
        lower='faces' if kind=='cells' else 'vertices'
        assert result[kind]==[[reverse[lower][v] for v in attached[kind][i]] for i in keep[kind]]
    assert result['metadata']['compound']['sourceModels']==before['metadata']['compound']['sourceModels']
    assert evidence(result)['sourceModel']==evidence(before)['sourceModel']
    assert evidence(result)['resultSourceFingerprint']!=identity(result)  # Historical evidence is explicitly stale.
    for record in result['components']:
        original=next(c for c in before['components'] if c['id']==record['id'])
        assert record['sourcePath']==original['sourcePath']
        assert identity(extract_component(result,record['id']))==identity(extract_component(before,record['id']))
    for kind in ('faces','cells'):
        assert result['metadata']['offColors'][kind]==[before['metadata']['offColors'][kind][i] for i in keep[kind]]


@pytest.mark.parametrize('dimension',[3,4])
def test_native_project_roundtrip_undo_redo_existing_drop_and_keep_recipe_replay(dimension):
    attached=attach_construction_components(generated(dimension));before=deepcopy(attached)
    document={'id':'native-fixture','cursor':0,'states':[{'model':attached,'view':{},'notes':'literal dimensional source'}]}
    for operation in ('compound-drop','compound-component'):
        result=dispatch({'op':'recipe-run','params':{'document':document,'operation':operation,
                         'parameters':{'component_id':attached['components'][0]['id']}}})
        project=validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,'active':0,'documents':[result]})))
        reopened=project['documents'][0];replay=dispatch({'op':'recipe-replay','params':{'document':reopened}})
        assert canonical_model(replay['states'][0]['model'])==canonical_model(reopened['states'][1]['model'])
        assert replay['states'][0]['model']['metadata']['offColors']==reopened['states'][1]['model']['metadata']['offColors']
        if operation=='compound-drop':assert replay['states'][0]['model']['components']==reopened['states'][1]['model']['components']
        reopened['cursor']=0
        assert reopened['states'][0]['model']['vertices']==before['vertices']
        assert reopened['states'][0]['model']['components']==before['components']
        reopened['cursor']=1
        assert counts(reopened['states'][1]['model'])==((6,12,8,0) if dimension==3 else (12,30,28,10))
    assert attached==before


@pytest.mark.parametrize('dimension',[3,4])
@pytest.mark.parametrize('symbol',['3','5/2','5/3','5/-3'])
def test_single_full_dimensional_leaf_has_no_fake_second_source_and_last_drop_is_rejected(dimension,symbol):
    anti=rational_antiprism(symbol=symbol);model=anti if dimension==3 else polyhedron_prism(anti,2)
    result=attach_construction_components(model);record=result['components'][0]
    assert len(result['components'])==1 and record['sourcePath']==[] and record['sourceModelId']==model['id']
    snapshot=result['metadata']['constructionComponents']['directLeafSource']
    assert identity(snapshot)==identity(model) and counts(snapshot)==counts(model)
    assert snapshot['dimension']==dimension and snapshot['metadata']['constructionLeaf']['sourceModel']==evidence(model)['sourceModel']
    assert canonical_model(extract_component(result,record['id']))==canonical_model(model)
    with pytest.raises(GeometryError,match='last'):remove_component(result,record['id'])


@pytest.mark.parametrize('dimension',[3,4])
def test_regenerated_random_source_uuids_do_not_change_current_leaf_component_ids(dimension):
    a,b=generated(dimension),generated(dimension)
    first,second=attach_construction_components(a),attach_construction_components(b)
    assert a['id']!=b['id'] and evidence(a)['sourceModelId']!=evidence(b)['sourceModelId']
    assert first['components']==second['components']
    assert attach_construction_components(a)==first
    for root,attached in ((a,first),(b,second)):
        assert [record['sourceComponentId'] for record in attached['metadata']['constructionComponents']['partitionComponents']]==[
            partition['sourceComponentId'] for partition in evidence(root)['componentPartitions']]
    with pytest.raises(GeometryError,match='already'):attach_construction_components(first)


@pytest.mark.parametrize('dimension',[3,4])
def test_json_integral_float_normalization_does_not_make_valid_snapshot_hashes_stale(dimension):
    def numbers(value):
        if type(value) is dict:return {key:numbers(item) for key,item in value.items()}
        if type(value) is list:return [numbers(item) for item in value]
        return int(value) if type(value) is float and value.is_integer() else value
    model=numbers(generated(dimension));before=deepcopy(model);result=attach_construction_components(model)
    assert model==before and identity(result)==model['fingerprint']
    assert evidence(result)['sourceModel']==evidence(model)['sourceModel']


@pytest.mark.parametrize('change',['symbol','boolean-count','boolean-cycle','cap-colors','source-binding'])
def test_refreshed_snapshot_hash_does_not_authorize_conflicting_historical_polygon_math(change):
    model=generated(3);info=evidence(model);source=info['sourceModel']
    polygon=source['metadata']['regularStarPolygon']
    if change=='symbol':polygon['symbol']='6/1'
    elif change=='boolean-count':polygon['n']=True
    elif change=='boolean-cycle':polygon['orderedCycles'][0][0]=False
    elif change=='cap-colors':source['metadata']['offColors']['faces'][0]=deepcopy(UNIT_RGBA)
    elif change=='source-binding':polygon['sourceModelId']='unrelated'
    info['sourceSnapshotSha256']=_snapshot_hash(source);before=deepcopy(model)
    with pytest.raises(GeometryError):attach_construction_components(model)
    assert model==before


@pytest.mark.parametrize('dimension',[3,4])
def test_numeric_evidence_boolean_and_cycle_boolean_ids_are_not_json_number_equivalents(dimension):
    model=generated(dimension)
    if dimension==3:evidence(model)['orderedSourceCycles'][0][0]=False
    else:evidence(model)['sourceFaceSideCells'][0][0]=float(evidence(model)['sourceFaceSideCells'][0][0])
    with pytest.raises(GeometryError):attach_construction_components(model)
    anti=rational_antiprism(3,height=1)
    model=anti if dimension==3 else polyhedron_prism(anti,1)
    if dimension==3:evidence(model)['sideTrianglesEquilateralWithinTolerance']=0
    else:evidence(model)['interval']['height']=True
    with pytest.raises(GeometryError):attach_construction_components(model)


@pytest.mark.parametrize('dimension',[3,4])
def test_huge_numeric_input_and_malformed_retained_source_return_geometry_error(dimension):
    model=generated(dimension);model['vertices'][0][0]=10**1000
    with pytest.raises(GeometryError):attach_construction_components(model)
    model=generated(dimension);evidence(model)['sourceModel']['convexPieces']=[None]
    with pytest.raises(GeometryError):attach_construction_components(model)


@pytest.mark.parametrize('height',[-1,0,float('inf'),10**1000])
def test_invalid_retained_interval_parameter_cannot_create_attached_geometry(height):
    model=generated(4);model['provenance']['parameters']['height']=height
    with pytest.raises(GeometryError):attach_construction_components(model)


def test_preserved_attribute_changes_with_refreshed_hash_are_copied_without_changing_source_geometry():
    model=generated(4);source=evidence(model)['sourceModel']
    source['metadata']['userAnnotation']={'exact':['retained','source','note']}
    evidence(model)['sourceSnapshotSha256']=_hash(source)
    result=attach_construction_components(model)
    for record in result['components']:
        leaf=extract_component(result,record['id'])
        assert leaf['metadata']['constructionLeaf']['sourceModel']==source


@pytest.mark.parametrize('dimension',[3,4])
@pytest.mark.parametrize('mutation',['fingerprint','model-id','binding-id','binding-hash','schema-bool',
    'snapshot','source-id','source-hash','geometry','refreshed-geometry','source-map','map-bool',
    'partition','partition-float','source-component-id','color','parameters','version'])
def test_stale_or_forged_current_geometry_historical_source_and_maps_refuse_atomically(dimension,mutation):
    model=generated(dimension);info=evidence(model)
    if mutation=='fingerprint':model['fingerprint']='stale'
    elif mutation=='model-id':model['id']=str(uuid.uuid4())
    elif mutation=='binding-id':info['resultSourceModelId']='stale'
    elif mutation=='binding-hash':info['resultSourceFingerprint']='stale'
    elif mutation=='schema-bool':info['schemaVersion']=True
    elif mutation=='snapshot':info['sourceModel']['metadata']['literalAttribute']='changed'
    elif mutation=='source-id':info['sourceModelId']='stale'
    elif mutation=='source-hash':info['sourceFingerprint']='stale'
    elif mutation in ('geometry','refreshed-geometry'):
        model['vertices'][0][0]+=.1
        if mutation=='refreshed-geometry':model['fingerprint']=info['resultSourceFingerprint']=identity(model)
    elif mutation=='source-map':info['sourceMaps']['vertices'][0].reverse()
    elif mutation=='map-bool':info['maps']['vertices'][0]['sourceVertexId']=False
    elif mutation=='partition':info['componentPartitions'][0]['maps']['vertices'][0]=1
    elif mutation=='partition-float':info['componentPartitions'][0]['maps']['vertices'][0]=0.0
    elif mutation=='source-component-id':info['componentPartitions'][0]['sourceComponentId']='not-the-historical-source'
    elif mutation=='color':model['metadata']['offColors']['faces'][0]['values'][3]=999
    elif mutation=='parameters':model['provenance']['parameters']['height']=3
    elif mutation=='version':info['algorithmVersion']='future'
    before=deepcopy(model)
    with pytest.raises(GeometryError):attach_construction_components(model)
    assert model==before


@pytest.mark.parametrize('dimension',[3,4])
@pytest.mark.parametrize('limit',['MAX_CONSTRUCTION_VERTICES','MAX_COMPONENTS','MAX_LEAF_SNAPSHOT_BYTES',
                                'MAX_TREE_WORK_BYTES','MAX_PAYLOAD_BYTES'])
def test_all_adapter_budgets_are_explicit_atomic_refusals(monkeypatch,dimension,limit):
    model=generated(dimension);before=deepcopy(model);monkeypatch.setattr(attachment,limit,1)
    with pytest.raises(GeometryError,match='resource|byte limit'):attach_construction_components(model)
    assert model==before


@pytest.mark.parametrize('dimension',[3,4])
def test_cyclic_and_overdeep_retained_metadata_are_rejected_before_allocation(dimension):
    model=generated(dimension);model['metadata']['cycle']=model['metadata']
    with pytest.raises(GeometryError,match='cyclic'):attach_construction_components(model)
    assert model['metadata']['cycle'] is model['metadata'] and 'components' not in model
    model=generated(dimension);current=model['metadata']
    for _ in range(70):current['next']={};current=current['next']
    with pytest.raises(GeometryError,match='structural resource'):attach_construction_components(model)


def cube():
    vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
    faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    return {'id':'independent-cube','name':'Cube','dimension':3,'embeddingDimension':3,
            'interpretation':'generalized-complex','vertices':vertices,'edges':[list(e) for e in edges],
            'faces':faces,'cells':[],'metadata':{'literalAttribute':['keep']},'numeric':{'certified':False}}


def test_coincident_cube_shells_keep_distinct_tesseract_leaves_without_coordinate_weld():
    source=add_models(cube(),cube());model=polyhedron_prism(source,2);original=deepcopy(model)
    result=attach_polyhedron_prism_components(model)
    assert counts(result)==(32,64,48,16) and len(result['components'])==2 and model==original
    leaves=[extract_component(result,component['id']) for component in result['components']]
    assert all(counts(leaf)==(16,32,24,8) for leaf in leaves)
    assert identity(leaves[0])==identity(leaves[1])
    assert len({component['sourceModelId'] for component in result['components']})==2
    assert len({tuple(component['sourcePath']) for component in result['components']})==2
    verify_tree(result)


def test_nested_source_shell_owners_come_from_current_historical_snapshot_leaf_ids():
    a,b,c=cube(),cube(),cube()
    b['vertices']=[[x+5,y,z] for x,y,z in b['vertices']]
    c['vertices']=[[x-5,y,z] for x,y,z in c['vertices']]
    source=add_models(add_models(a,b),c);model=polyhedron_prism(source,2)
    result=attach_polyhedron_prism_components(model)
    assert len(result['components'])==3
    proof=result['metadata']['constructionComponents']['partitionComponents']
    assert [item['sourceComponentId'] for item in proof]==[record['id'] for record in source['components']]
    for record in result['components']:
        leaf=extract_component(result,record['id']);assert counts(leaf)==(16,32,24,8)
        assert leaf['metadata']['constructionLeaf']['sourceModel']==source
    verify_tree(result)


def test_closed_genus_one_source_retains_formal_prism_cap_cells_without_convex_claim():
    vertices=[]
    for i in range(4):
        for j in range(4):
            theta,phi=math.pi*i/2,math.pi*j/2
            vertices.append([(3+math.cos(phi))*math.cos(theta),(3+math.cos(phi))*math.sin(theta),math.sin(phi)])
    faces=[[4*i+j,4*((i+1)%4)+j,4*((i+1)%4)+(j+1)%4,4*i+(j+1)%4] for i in range(4) for j in range(4)]
    source=cube();source['vertices']=vertices;source['faces']=faces
    source['edges']=[list(e) for e in sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})]
    model=polyhedron_prism(source,2);result=attach_polyhedron_prism_components(model)
    assert counts(result)==(32,80,64,18) and len(result['components'])==1
    assert result['interpretation']=='generalized-complex' and not result['numeric']['certified']
    assert counts(extract_component(result,result['components'][0]['id']))==counts(model)
    assert analyze_convex_boundary(result)['convex'] is False


@pytest.mark.parametrize('dimension',[3,4])
def test_ownership_adapter_remains_separate_from_read_only_convex_classification(dimension):
    anti=rational_antiprism(3);model=anti if dimension==3 else polyhedron_prism(anti,2)
    result=attach_construction_components(model);before=deepcopy(result)
    assert analyze_convex_boundary(result)['status']=='passed' and result==before
    result['interpretation']='convex-polytope'
    with pytest.raises(GeometryError):attach_construction_components(result)


def test_strict_convenience_entry_points_and_malformed_models():
    with pytest.raises(GeometryError,match='dimension three'):attach_antiprism_components(generated(4))
    with pytest.raises(GeometryError,match='dimension four'):attach_polyhedron_prism_components(generated(3))
    for model in (None,{},cube(),{'dimension':True}):
        with pytest.raises(GeometryError):attach_construction_components(model)
    assert validate(attach_antiprism_components(generated(3)))['passed']
