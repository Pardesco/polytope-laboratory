"""Independent actual 3D leaves, original interleaved IDs and strict ownership."""
from collections import Counter
from copy import deepcopy
import json
import math
import uuid

import numpy as np
import pytest

import engine.podia_components as attachment
from engine.antiprisms import _snapshot_hash
from engine.compounds import extract_component,remove_component,retrieve_source
from engine.formats import validate_project
from engine.geometry import GeometryError,identity,validate
from engine.history import canonical_model
from engine.podia import rational_podium,rational_antipodium
from engine.podia_components import attach_podia_components,attach_podium_components,attach_antipodium_components
from engine.server import dispatch


CONSTRUCTORS=(rational_podium,rational_antipodium)
KINDS=('vertices','edges','faces','cells')
BYTE={'encoding':'byte','values':[30,60,220,128]}
UNIT={'encoding':'unit','values':[.1,.3,.8,.25]}


def evidence(model):
    return model['metadata']['rationalAntipodium' if 'rationalAntipodium' in model['metadata'] else 'rationalPodium']


def generated(constructor,n=6,d=2):
    colors=[deepcopy(BYTE if i%2==0 else UNIT) for i in range(math.gcd(n,abs(d)))]
    model=constructor(n,d,base_radius=2,top_radius=1,height=3,cap_colors=colors)
    # Current drawing attributes can differ from retained historical cap colors.
    model['metadata']['offColors']['faces'][-1]=deepcopy(UNIT)
    model['metadata']['fixtureAttribute']={'literal':['keep','independent']}
    return model


def expected_maps(model,n,g,ordinal):
    vids={angular+ring*n for ring in (0,1) for angular in range(ordinal,n,g)}
    return {'vertices':sorted(vids),'edges':[i for i,edge in enumerate(model['edges']) if set(edge)<=vids],
            'faces':[i for i,face in enumerate(model['faces']) if set(face)<=vids],'cells':[]}


def historical(root,path):
    for index in path:root=retrieve_source(root,index)
    return root


def verify_tree(root):
    if 'compound' not in root['metadata']:return
    for index,record in enumerate(root['metadata']['compound']['inputs']):
        source=retrieve_source(root,index);maps=record['maps']
        assert record['sourceModelId']==source['id'] and record['sourceFingerprint']==identity(source)
        assert [root['vertices'][i] for i in maps['vertices']]==source['vertices']
        for kind in ('edges','faces','cells'):
            lower='faces' if kind=='cells' else 'vertices'
            assert [root[kind][i] for i in maps[kind]]==[[maps[lower][v] for v in row] for row in source[kind]]
        verify_tree(source)


def verify_leaf(leaf):
    assert leaf['dimension']==leaf['embeddingDimension']==3
    assert validate(leaf)['passed']
    p=np.asarray(leaf['vertices']);p=(p-p[0])/np.ptp(p,axis=0).max()
    assert np.linalg.matrix_rank(p,1e-8)==3
    boundary=Counter(tuple(sorted((a,b))) for f in leaf['faces'] for a,b in zip(f,f[1:]+f[:1]))
    assert boundary==Counter({tuple(sorted(e)):2 for e in leaf['edges']})
    for v in range(len(leaf['vertices'])):
        links=[]
        for face in leaf['faces']:
            if v in face:
                j=face.index(v);links.append((face[j-1],face[(j+1)%len(face)]))
        degrees=Counter(i for edge in links for i in edge)
        assert set(degrees.values())=={2}
        seen={next(iter(degrees))}
        while True:
            expanded=seen|{b for a,b in links if a in seen}|{a for a,b in links if b in seen}
            if expanded==seen:break
            seen=expanded
        assert seen==set(degrees)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('n,d',[(6,2),(6,-2),(9,3),(15,5)])
def test_real_3d_leaves_original_global_ids_two_full_factors_and_rgba_nonmutation(constructor,n,d):
    model=generated(constructor,n,d);before=deepcopy(model)
    result=attach_podia_components(model);g=math.gcd(n,abs(d))
    assert model==before and result['id']==model['id'] and result['fingerprint']==identity(model)
    for kind in KINDS:assert result[kind]==before[kind]
    for key in ('name','numeric','provenance'):assert result[key]==before[key]
    assert result['metadata']['offColors']==before['metadata']['offColors']
    assert evidence(result)['sourceModels']==evidence(before)['sourceModels']
    assert evidence(result)['inputs']==evidence(before)['inputs']
    assert [c['maps'] for c in result['components']]==[expected_maps(model,n,g,i) for i in range(g)]
    assert evidence(result)['recoverableCompoundComponents'] is True
    verify_tree(result)
    for ordinal,(part,record,proof) in enumerate(zip(evidence(before)['componentPartitions'],result['components'],result['metadata']['podiaComponents']['partitionComponents'])):
        uuid.UUID(record['id']);uuid.UUID(record['sourceModelId'])
        leaf=historical(result,record['sourcePath']);extracted=extract_component(result,record['id'])
        assert leaf['id']==record['sourceModelId'] and identity(leaf)==record['sourceFingerprint']==identity(extracted)
        assert [len(leaf[k]) for k in KINDS]==([6,12,8,0] if constructor is rational_antipodium else [6,9,5,0])
        assert leaf['vertices']==[before['vertices'][i] for i in record['maps']['vertices']]
        info=leaf['metadata']['podiaLeaf']
        assert info['sourceFactorModels']==evidence(before)['sourceModels']
        assert info['sourceFactorInputs']==evidence(before)['inputs']
        assert info['sourcePartition']==part and proof['sourceComponentIds']==part['sourceComponentIds']
        assert info['generatedSourceMaps']==record['maps']
        assert info['generatedSourceAttributes']['fixtureAttribute']==before['metadata']['fixtureAttribute']
        assert extracted['metadata']['offColors']['faces']==[before['metadata']['offColors']['faces'][i] for i in record['maps']['faces']]
        # Literal ring phases stay distinct; extraction is not a recentered 3-gon generator.
        assert leaf['vertices'][0][:2]==pytest.approx([2*math.cos(2*math.pi*ordinal/n),2*math.sin(2*math.pi*ordinal/n)])
        verify_leaf(extracted)
    result['vertices'][0][0]=999
    result['metadata']['compound']['sourceModels'][0]['vertices'][0][0]=888
    evidence(result)['sourceModels'][0]['vertices'][0][0]=777
    assert model==before


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_drop_keeps_original_order_current_colors_paths_and_both_factors(constructor):
    attached=attach_podia_components(generated(constructor,9,3));before=deepcopy(attached)
    removed=attached['components'][1];result=remove_component(attached,removed['id'])
    assert attached==before and len(result['components'])==2
    keep={kind:[i for i in range(len(attached[kind])) if i not in removed['maps'][kind]] for kind in KINDS}
    reverse={kind:{old:new for new,old in enumerate(keep[kind])} for kind in KINDS}
    assert result['vertices']==[attached['vertices'][i] for i in keep['vertices']]
    for kind in ('edges','faces','cells'):
        lower='faces' if kind=='cells' else 'vertices'
        assert result[kind]==[[reverse[lower][v] for v in attached[kind][i]] for i in keep[kind]]
    assert result['metadata']['compound']['sourceModels']==before['metadata']['compound']['sourceModels']
    assert evidence(result)['sourceModels']==evidence(before)['sourceModels']
    assert evidence(result)['resultSourceFingerprint']!=identity(result)
    for record in result['components']:
        old=next(c for c in before['components'] if c['id']==record['id'])
        assert record['sourcePath']==old['sourcePath']
        assert identity(extract_component(result,record['id']))==identity(extract_component(before,record['id']))
    assert result['metadata']['offColors']['faces']==[before['metadata']['offColors']['faces'][i] for i in keep['faces']]


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('operation',['compound-drop','compound-component'])
def test_native_project_reopen_undo_redo_and_existing_recipe_replay(constructor,operation):
    attached=attach_podia_components(generated(constructor));before=deepcopy(attached)
    document={'id':'podium-workflow','cursor':0,'states':[{'model':attached,'view':{},'notes':'two literal factors'}]}
    result=dispatch({'op':'recipe-run','params':{'document':document,'operation':operation,'parameters':{'component_id':attached['components'][0]['id']}}})
    reopened=validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,'active':0,'documents':[result]})))['documents'][0]
    replay=dispatch({'op':'recipe-replay','params':{'document':reopened}})
    assert canonical_model(replay['states'][0]['model'])==canonical_model(reopened['states'][1]['model'])
    assert replay['states'][0]['model']['metadata']['offColors']==reopened['states'][1]['model']['metadata']['offColors']
    if operation=='compound-drop':assert replay['states'][0]['model']['components']==reopened['states'][1]['model']['components']
    reopened['cursor']=0
    assert reopened['states'][0]['model']['faces']==before['faces'] and reopened['states'][0]['model']['components']==before['components']
    reopened['cursor']=1
    assert len(reopened['states'][1]['model']['vertices'])==6
    assert attached==before


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('d',[1,2,3,-3])
def test_single_leaf_still_full_3d_keeps_both_factors_without_fake_sibling(constructor,d):
    model=generated(constructor,5,d);result=attach_podia_components(model);record=result['components'][0]
    assert len(result['components'])==1 and record['sourcePath']==[] and record['sourceModelId']==model['id']
    snapshot=result['metadata']['podiaComponents']['directLeafSource']
    assert identity(snapshot)==identity(model) and snapshot['dimension']==3
    assert snapshot['metadata']['podiaLeaf']['sourceFactorModels']==evidence(model)['sourceModels']
    assert canonical_model(extract_component(result,record['id']))==canonical_model(model)
    with pytest.raises(GeometryError,match='last'):remove_component(result,record['id'])


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_regeneration_current_component_ids_stable_and_reattachment_refused(constructor):
    a,b=generated(constructor),generated(constructor)
    first,second=attach_podia_components(a),attach_podia_components(b)
    assert a['id']!=b['id'] and evidence(a)['inputs']!=evidence(b)['inputs']
    assert first['components']==second['components'] and attach_podia_components(a)==first
    assert evidence(first)['inputs']==evidence(a)['inputs']
    with pytest.raises(GeometryError,match='already'):attach_podia_components(first)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_native_json_integral_float_equivalence_preserves_factor_snapshot_proofs(constructor):
    def numbers(value):
        if type(value) is dict:return {key:numbers(item) for key,item in value.items()}
        if type(value) is list:return [numbers(item) for item in value]
        return int(value) if type(value) is float and value.is_integer() else value
    model=numbers(generated(constructor));before=deepcopy(model);result=attach_podia_components(model)
    assert model==before and identity(result)==identity(model)
    assert evidence(result)['sourceModels']==evidence(before)['sourceModels']


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('change',['id','fingerprint','coordinate','cycle','dimension','interpretation','version','provenance','parameter','map-bool','map-float','partition','cycles','n-bool','embedding','height','owned-flag','info-extra'])
def test_forged_or_edited_generated_evidence_refused_atomically(constructor,change):
    model=generated(constructor);info=evidence(model)
    if change=='id':model['id']=str(uuid.uuid4())
    elif change=='fingerprint':model['fingerprint']='bad'
    elif change=='coordinate':model['vertices'][0][0]+=.01
    elif change=='cycle':model['faces'][0]=model['faces'][0][::-1]
    elif change=='dimension':model['dimension']=2
    elif change=='interpretation':model['interpretation']='convex-polytope'
    elif change=='version':info['algorithmVersion']='bad'
    elif change=='provenance':model['provenance']['definition']='invented source'
    elif change=='parameter':model['provenance']['parameters']['height']=4
    elif change=='map-bool':info['componentPartitions'][0]['maps']['vertices'][0]=False
    elif change=='map-float':info['maps']['vertices'][0]['sourceVertexId']=0.0
    elif change=='partition':info['componentPartitions'][0]['maps']['faces'].pop()
    elif change=='cycles':info['orderedSourceCycles'][0][0]=False
    elif change=='n-bool':info['n']=True
    elif change=='embedding':info['sourceEmbedding'][1]['rotationRadians']+=1
    elif change=='height':info['height']=4
    elif change=='owned-flag':info['recoverableCompoundComponents']=True
    elif change=='info-extra':info['arbitraryClaims']='uniform'
    if change in ('coordinate','cycle'):
        model['fingerprint']=identity(model);info['resultSourceFingerprint']=model['fingerprint']
    before=deepcopy(model)
    with pytest.raises(GeometryError):attach_podia_components(model)
    assert model==before


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('change',['polygon-symbol','polygon-binding','polygon-count','polygon-cycle','cap-color','snapshot','source-id','history-leaf-reference','history-input-reference','history-component-reference'])
def test_refreshed_factor_hash_does_not_authorize_forged_source_math_or_uuid_references(constructor,change):
    model=generated(constructor);info=evidence(model);source=info['sourceModels'][1];polygon=source['metadata']['regularStarPolygon']
    if change=='polygon-symbol':polygon['symbol']='6/1'
    elif change=='polygon-binding':polygon['sourceModelId']=str(uuid.uuid4())
    elif change=='polygon-count':polygon['n']=6.0
    elif change=='polygon-cycle':polygon['orderedCycles'][0][0]=False
    elif change=='cap-color':source['metadata']['offColors']['faces'][0]=deepcopy(UNIT)
    elif change=='snapshot':info['inputs'][1]['sourceSnapshotSha256']='bad'
    elif change=='source-id':source['id']='not-uuid'
    elif change=='history-leaf-reference':source['components'][0]['sourceModelId']=str(uuid.uuid4())
    elif change=='history-input-reference':source['metadata']['compound']['inputs'][0]['sourceModelId']=str(uuid.uuid4())
    elif change=='history-component-reference':source['components'][0]['sourceComponentId']=str(uuid.uuid4())
    if change!='snapshot':
        info['inputs'][1]={'sourceModelId':source['id'],'sourceFingerprint':identity(source),'sourceSnapshotSha256':_snapshot_hash(source)}
    before=deepcopy(model)
    with pytest.raises(GeometryError):attach_podia_components(model)
    assert model==before


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('bound,value',[('MAX_PODIA_VERTICES',5),('MAX_COMPONENTS',1),('MAX_LEAF_SNAPSHOT_BYTES',1),('MAX_TREE_WORK_BYTES',1),('MAX_PAYLOAD_BYTES',100)])
def test_attachment_caps_refuse_without_input_mutation(constructor,monkeypatch,bound,value):
    model=generated(constructor);before=deepcopy(model)
    monkeypatch.setattr(attachment,bound,value)
    with pytest.raises(GeometryError):attach_podia_components(model)
    assert model==before


def test_named_helpers_reject_other_family_and_malformed_provenance():
    podium=generated(rational_podium);anti=generated(rational_antipodium)
    assert identity(attach_podium_components(podium))==identity(podium)
    assert identity(attach_antipodium_components(anti))==identity(anti)
    for method,model in ((attach_podium_components,anti),(attach_antipodium_components,podium),(attach_podium_components,{'provenance':'bad'})):
        with pytest.raises(GeometryError):method(model)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_cyclic_and_excessively_deep_current_metadata_refused_before_copy(constructor):
    model=generated(constructor);model['metadata']['cycle']=model
    with pytest.raises(GeometryError,match='cyclic'):attach_podia_components(model)
    model=generated(constructor);node=model['metadata']
    for _ in range(70):node['next']={};node=node['next']
    with pytest.raises(GeometryError,match='structural'):attach_podia_components(model)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('field',['numeric-certification','numeric-algorithm','measure','facetEquations','certificate'])
def test_forged_numeric_authority_or_mathematical_caches_are_not_retained(constructor,field):
    model=generated(constructor)
    if field=='numeric-certification':model['numeric']['certified']=True
    elif field=='numeric-algorithm':model['numeric']['algorithm']='exact theorem'
    else:model[field]={} if field!='facetEquations' else []
    before=deepcopy(model)
    with pytest.raises(GeometryError):attach_podia_components(model)
    assert model==before


@pytest.mark.parametrize('kind',['rational-podium','rational-antipodium'])
@pytest.mark.parametrize('ring_mode',['radii','edges'])
@pytest.mark.parametrize('side_mode',['height','side'])
def test_actual_server_raw_generator_transport_attaches_and_preserves_original_json_record(monkeypatch,kind,ring_mode,side_mode):
    # Exercise native dispatch/strict generator parameters; isolate the raw
    # attachment boundary from the separate convex-finalization qualification.
    monkeypatch.setattr('engine.construction_finalization.finalize_construction',lambda model:model)
    n,d=6,2;edge_unit=math.sqrt(3)
    params={'symbol':' 6 / +2 ','cap_colors':[deepcopy(BYTE),deepcopy(UNIT)]}
    params.update({'base_radius':2,'top_radius':1} if ring_mode=='radii' else {'base_edge':2*edge_unit,'top_edge':edge_unit})
    q=math.sqrt(3) if kind=='rational-antipodium' else 1
    params.update({'height':3} if side_mode=='height' else {'side_edge':math.hypot(q,3)})
    request={'op':'generate','params':{'kind':kind,**params}};original_request=deepcopy(request)
    model=dispatch(request);before=deepcopy(model)
    expected_record={'kind':kind,'parameters':params}
    assert model['provenance']['generator']==expected_record
    result=attach_podia_components(model)
    assert request==original_request and model==before
    assert result['provenance']==before['provenance']
    assert result['provenance']['generator']==expected_record
    for record in result['components']:
        leaf=historical(result,record['sourcePath'])
        assert leaf['metadata']['podiaLeaf']['constructionProvenance']==before['provenance']
        assert leaf['metadata']['podiaLeaf']['constructionProvenance']['generator']==expected_record
        verify_leaf(extract_component(result,record['id']))
    reopened=validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,'active':0,'documents':[
        {'id':'generator-record','cursor':0,'states':[{'model':result,'view':{}}]}]})))['documents'][0]['states'][0]['model']
    assert reopened['provenance']['generator']==expected_record


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('change',['wrong-kind','unknown-kind','kind-type','parameters-type','missing-key','extra-key','extra-param','changed-size','changed-symbol','alternate-mode','alternate-spelling'])
def test_optional_generator_kind_parameters_and_keys_are_strict_atomic_evidence(constructor,change):
    model=generated(constructor)
    record={'kind':model['provenance']['operation'],'parameters':deepcopy(model['provenance']['parameters'])}
    # Native generator records can omit defaulted/null parameters.
    record['parameters']={k:v for k,v in record['parameters'].items() if v is not None}
    if change=='wrong-kind':record['kind']='rational-antipodium' if constructor is rational_podium else 'rational-podium'
    elif change=='unknown-kind':record['kind']='not-a-generator'
    elif change=='kind-type':record['kind']=True
    elif change=='parameters-type':record['parameters']=[]
    elif change=='missing-key':record.pop('parameters')
    elif change=='extra-key':record['certified']=True
    elif change=='extra-param':record['parameters']['unknown']=1
    elif change=='changed-size':record['parameters']['height']=4
    elif change=='changed-symbol':record['parameters']['d']=-2
    elif change=='alternate-mode':
        # Same radii/geometry, different original sizing mode is not provenance.
        record['parameters']['base_edge']=record['parameters'].pop('base_radius')*math.sqrt(3)
        record['parameters']['top_edge']=record['parameters'].pop('top_radius')*math.sqrt(3)
    elif change=='alternate-spelling':
        # Literal-symbol input cannot be invented for a recorded integer pair.
        record['parameters'].pop('n');record['parameters'].pop('d');record['parameters']['symbol']='6/2'
    model['provenance']['generator']=record;before=deepcopy(model)
    with pytest.raises(GeometryError):attach_podia_components(model)
    assert model==before


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_optional_generator_default_triangle_and_omitted_fields_are_verified_without_rewriting(constructor):
    params={'base_radius':2,'top_radius':1,'height':3}
    model=constructor(**params)
    model['provenance']['generator']={'kind':model['provenance']['operation'],'parameters':deepcopy(params)}
    before=deepcopy(model);result=attach_podia_components(model)
    assert model==before and result['provenance']==before['provenance']
    assert result['metadata']['podiaComponents']['directLeafSource']['metadata']['podiaLeaf']['constructionProvenance']==before['provenance']
