from collections import Counter
from copy import deepcopy
import json
import numpy as np
import pytest
from engine.catalog import get_catalog
from engine.geometry import GeometryError, identity
from engine.server import dispatch
from engine.star_uniform4 import (manifest, _build, load_star_uniform4, native_cell_inventory,
                                  native_star_evidence, rational_boundary, polygon_symbol)

ENTRIES=manifest()['entries']

def test_manifest_has_independent_references_unique_names_and_all_ten_native_regulars():
    assert len(ENTRIES)>=40
    assert len({r['key'] for r in ENTRIES})==len(ENTRIES)
    assert {'fix','gofix','sishi','gaghi','gahi','gishi','gashi','gohi','gax','gogishi'}=={r['bowers'] for r in ENTRIES if r['regular']}
    assert {r['symmetryGroup'] for r in ENTRIES}=={'B4','F4','H4'}
    for row in ENTRIES:
        assert row['bowers'] in row['aliases'] and row['symbol'] in row['aliases']
        assert row['classificationVerified'] and not row['convex'] and row['uniform']
        assert row['referenceUrls'][0].startswith('https://bendwavy.org/klitzing/incmats/')
        assert sum(c['count'] for c in row['cellTypes'])==row['counts'][3]
        assert all(c['referenceUrl'].startswith('https://bendwavy.org/klitzing/incmats/') for c in row['cellTypes'])
    registered={r['key']:r for r in get_catalog()}
    for entry in ENTRIES:assert registered[entry['key']]==entry

@pytest.mark.parametrize('entry',ENTRIES,ids=lambda e:e['bowers'])
def test_all_registered_native_stars_match_published_counts_cells_closed_oriented_incidence(entry):
    model=dispatch({'op':'generate','params':{'kind':'regular','key':entry['key']}})
    assert [len(model[k]) for k in ('vertices','edges','faces','cells')]==entry['counts']
    assert model['interpretation']=='generalized-complex' and model['validation']['passed']
    assert not model['numeric']['certified'] and model['numeric']['mode']=='float64-approximate'
    assert model['provenance']['orbitClosureResidual']<1e-9
    assert model['provenance']['mirrorGramResidual']<1e-12
    assert model['metadata']['uniformVerification']['edgeRelativeSpread']<1e-7
    assert identity(model)==model['fingerprint']
    assert Counter(f for c in model['cells'] for f in c)=={i:2 for i in range(len(model['faces']))}
    signs=model['provenance']['cellFaceOrientations'];face_sums=Counter()
    for cell,orientation in zip(model['cells'],signs):
        edge_sums=Counter()
        for fi,sign in zip(cell,orientation):
            assert sign in (-1,1);face_sums[fi]+=sign
            face=model['faces'][fi]
            for a,b in zip(face,face[1:]+face[:1]):edge_sums[tuple(sorted((a,b)))]+=sign*(1 if a<b else -1)
        assert all(v==0 for v in edge_sums.values())
    assert all(v==0 for v in face_sums.values())
    inventory=native_cell_inventory(model)
    assert sorted(i for c in inventory for i in c['ids'])==list(range(len(model['cells'])))
    assert [{k:v for k,v in c.items() if k!='ids'} for c in inventory]==entry['cellTypes']

@pytest.mark.parametrize('key,counts,cell,polygons',[
    ('fix',[120,720,1200,120],'ike',{'3':20}),
    ('gofix',[120,720,1200,120],'gike',{'3':20}),
    ('sishi',[120,1200,720,120],'sissid',{'5/2':12}),
    ('gaghi',[120,1200,720,120],'gad',{'5':12}),
    ('gax',[120,720,1200,600],'tet',{'3':4}),
    ('gogishi',[600,1200,720,120],'gissid',{'5/2':12}),
])
def test_independent_representative_regular_counts_and_cell_windings(key,counts,cell,polygons):
    model=load_star_uniform4('star-uniform4-'+key)
    assert [len(model[k]) for k in ('vertices','edges','faces','cells')]==counts
    inventory=native_cell_inventory(model)
    assert len(inventory)==1 and inventory[0]['bowers']==cell and inventory[0]['facePolygons']==polygons
    assert set(polygon_symbol(np.asarray(model['vertices']),f) for f in model['faces'])==set(polygons)

def test_regular_identity_is_also_verified_by_independent_flag_action_validator():
    from engine.regular4d_validation import analyze_regular4d
    for key,name in [('fix','Icosahedral hecatonicosachoron'),('sishi','Stellated hecatonicosachoron'),
                     ('gofix','Great icosahedral hecatonicosachoron'),('gaghi','Great grand hecatonicosachoron')]:
        result=analyze_regular4d(load_star_uniform4('star-uniform4-'+key),name)
        assert result['status']=='passed'

def test_deterministic_native_generation_detached_cache_and_no_asset_dependency():
    key='star-uniform4-sishi';first=load_star_uniform4(key);_build.cache_clear();second=load_star_uniform4(key)
    assert first['id']!=second['id'] and first['fingerprint']==second['fingerprint']
    assert all(first[k]==second[k] for k in ('vertices','edges','faces','cells','provenance'))
    first['vertices'][0][0]+=1
    assert load_star_uniform4(key)['fingerprint']==second['fingerprint']
    assert 'sourceAsset' not in second['metadata']

def test_named_inventory_does_not_trust_metadata_counts_or_claimed_fingerprint():
    source=load_star_uniform4('star-uniform4-sishi')
    assert native_cell_inventory(source)
    source['metadata']['cellTypes'][0]['name']='forged label'
    assert native_cell_inventory(source)[0]['name']=='small stellated dodecahedron'
    source['metadata']['uniformVerification']['edgeRelativeSpread']=100
    assert native_star_evidence(source)['verification']['edgeRelativeSpread']<1e-7
    for mutate in (lambda m:m['vertices'][0].__setitem__(0,m['vertices'][0][0]+.01),
                   lambda m:m['faces'][0].reverse(),lambda m:m['cells'].pop()):
        changed=deepcopy(source);mutate(changed)
        assert native_cell_inventory(changed) is None
    for metadata in (None,[],{},'unclassified'):
        changed=deepcopy(source);changed['metadata']=metadata
        assert native_cell_inventory(changed) is None

def test_element_types_includes_verified_named_cells_even_above_symmetry_resource_limits():
    source=load_star_uniform4('star-uniform4-rigogishi')
    result=dispatch({'op':'element-types','model':source})
    assert not result['available'] and not result['complete']
    assert result['nativeCellInventory'] and sum(c['count'] for c in result['nativeCellInventory'])==720

def test_saved_project_and_off_roundtrip_preserve_native_star_incidence(tmp_path):
    from engine.formats import save_project,load_file,parse_off,export_off
    source=load_star_uniform4('star-uniform4-sishi')
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'native-star','name':source['name'],
        'cursor':0,'states':[{'model':source,'view':{'angles':[0]*6},'notes':'native star','label':'Generate'}]}]}
    path=tmp_path/'native-star.polytope';save_project(str(path),project)
    loaded=load_file(str(path))['project']['documents'][0]['states'][0]['model']
    assert loaded['fingerprint']==source['fingerprint'] and loaded['metadata']['key']=='star-uniform4-sishi'
    assert native_cell_inventory(loaded)
    assert parse_off(export_off(source),'Native star')['fingerprint']==source['fingerprint']

def test_native_star_is_retained_as_a_history_source_and_transforms_replay():
    from engine.recipes import run_recipe,replay_document
    source=load_star_uniform4('star-uniform4-sishi')
    document={'id':'native-history','cursor':0,'states':[{'model':source,'view':{'angles':[0]*6},'label':'Generate','notes':''}]}
    changed=run_recipe(document,'transform',{'scale':2},dispatch)
    assert changed['cursor']==1 and len(changed['states'])==2
    assert native_cell_inventory(changed['states'][0]['model'])
    assert native_cell_inventory(changed['states'][1]['model']) is None
    replayed=replay_document(changed,dispatch)
    assert replayed['states'][0]['model']['fingerprint']==changed['states'][1]['model']['fingerprint']
    assert source==document['states'][0]['model']

@pytest.mark.parametrize('diagram,rings,n',[
    (['5','3','5'],[1,0,0,0],120),(['7','3','3'],[1,0,0,0],120),
    (['5/0','3','3'],[1,0,0,0],120),(['5','3','3'],[0,0,0,0],120),
    (['5','3','3'],[True,0,0,0],120),(['5','3','3'],[1,0,0,0],20000),
    (['3','5','5/2'],[1,0,0,0],119),
])
def test_unsupported_or_unresolved_domains_refuse_without_partial_models(diagram,rings,n):
    with pytest.raises(GeometryError):rational_boundary(diagram,rings,n)

def test_unknown_native_key_is_not_reclassified_or_loaded_from_external_files():
    assert load_star_uniform4('star-uniform4-unknown') is None
    with pytest.raises(GeometryError,match='Unknown catalog key'):
        dispatch({'op':'generate','params':{'kind':'regular','key':'star-uniform4-unknown'}})
