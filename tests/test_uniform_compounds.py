import json
import numpy as np
import pytest
from scipy.spatial import cKDTree

from engine.uniform_compounds import (definitions, uniform_compound, uniform_compound_catalog,
    ROTATIONAL, _prismatic)
from engine.compounds import _check_source, extract_component
from engine.formats import parse_off, validate_project
from engine.geometry import GeometryError
from engine.history import canonical_model
from engine.server import dispatch
from engine.specialized_catalog import DATA

ENTRIES=definitions()['entries']


def boundary(points,faces):
    keys=[tuple(p) for p in np.round(points,7)]
    def cycle(ids):
        seq=[keys[i] for i in ids]
        return min(tuple(s[i:]+s[:i]) for s in (seq,seq[::-1]) for i in range(len(s)))
    return tuple(sorted(cycle(f) for f in faces))


def components(m):
    result=[]
    for c in m['components']:
        ids=c['maps']['vertices'];reverse={v:i for i,v in enumerate(ids)}
        result.append((np.asarray(m['vertices'])[ids],[[reverse[v] for v in m['faces'][f]] for f in c['maps']['faces']]))
    return result


@pytest.mark.parametrize('e',ENTRIES,ids=lambda e:'UC'+str(e['uc']))
def test_all_75_native_counts_normalized_source_faces_ownership_and_determinism(e):
    uc=e['uc'];m=dispatch({'op':'generate','params':{'kind':'regular','key':f'compound-uc{uc}'}})
    source=parse_off((DATA/f'models/uc{uc}.off').read_text(),e['name'])
    assert [len(m[k]) for k in ('vertices','edges','faces','cells')]==e['counts']
    assert len(m['components'])==e['componentCount']
    p,q=np.asarray(m['vertices']),np.asarray(source['vertices'])
    p=(p-p.mean(axis=0))/np.sqrt(np.mean(np.sum((p-p.mean(axis=0))**2,axis=1)))
    q=(q-q.mean(axis=0))/np.sqrt(np.mean(np.sum((q-q.mean(axis=0))**2,axis=1)))
    assert max(cKDTree(q).query(p)[0])<2e-12
    assert max(cKDTree(p).query(q)[0])<2e-12
    assert boundary(np.asarray(m['vertices']),m['faces'])==boundary(np.asarray(source['vertices']),source['faces'])
    _check_source(m)
    assert m==uniform_compound(uc)
    assert len({c['id'] for c in m['components']})==e['componentCount']
    leaf=extract_component(m,m['components'][-1]['id'])
    assert len(leaf['vertices'])*e['componentCount']==len(m['vertices'])
    assert leaf['validation']['passed'] and not m['numeric']['certified']
    lengths=np.linalg.norm(np.asarray(m['vertices'])[np.asarray(m['edges'])[:,0]]-np.asarray(m['vertices'])[np.asarray(m['edges'])[:,1]],axis=1)
    assert max(lengths)-min(lengths)<2e-12
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'roundtrip','cursor':0,'states':[{'model':m,'view':{}}]}]}
    restored=validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]['model']
    assert restored['components']==m['components'] and canonical_model(restored)==canonical_model(m)


@pytest.mark.parametrize('name',list(definitions()['groups']))
def test_declared_groups_close_independently(name):
    group=np.asarray(definitions()['groups'][name]);tree=cKDTree(group.reshape(len(group),9))
    assert all(np.allclose(g.T@g,np.eye(3),atol=2e-12) for g in group)
    assert max(tree.query(np.asarray([a@b for a in group for b in group]).reshape(-1,9))[0])<2e-12


@pytest.mark.parametrize('e',ENTRIES,ids=lambda e:'UC'+str(e['uc']))
def test_group_seed_orbit_preserves_every_component_face_cycle(e):
    m=uniform_compound(e['uc']);parts=components(m);p,f=parts[0]
    group=definitions()['groups'][e['group']]
    assert {boundary(p@np.asarray(g).T,f) for g in group}=={boundary(p,f) for p,f in parts}
    assert {tuple(np.round(np.asarray(g)@p[0],7)) for g in group}==set(map(tuple,np.round(m['vertices'],7)))
    orbit={(boundary(p@np.asarray(g).T,f),tuple(np.round(np.asarray(g)@p[0],7))) for g in group}
    owned={(boundary(q,fs),tuple(np.round(v,7))) for q,fs in parts for v in q}
    if e['uc']==19:assert len(orbit)==60 and len(owned)==120
    else:assert orbit==owned


@pytest.mark.parametrize('uc',ROTATIONAL)
def test_free_angles_change_embedding_preserve_group_incidence_and_component_count(uc):
    original=uniform_compound(uc);m=uniform_compound(uc,angleDegrees=31)
    assert m['fingerprint']!=original['fingerprint']
    assert m['edges']==original['edges'] and m['faces']==original['faces']
    assert len(m['components'])==len(original['components'])
    parts=components(m);p,f=parts[0]
    group=definitions()['groups'][ENTRIES[uc-1]['group']]
    assert {boundary(p@np.asarray(g).T,f) for g in group}=={boundary(p,f) for p,f in parts}
    zero=uniform_compound(uc,angleDegrees=0)
    assert len(zero['components'])==len(m['components']) and zero['validation']['passed']


@pytest.mark.parametrize('uc,n,d,k',[(20,7,2,3),(21,7,2,3),(22,7,3,3),(23,7,3,3),
    (24,7,4,3),(25,7,4,3),(22,6,1,2),(23,6,1,2)])
def test_variable_prism_antiprism_polygons_and_repetition(uc,n,d,k):
    params={'uc':uc,'n':n,'d':d,'k':k}
    if uc in ROTATIONAL:params['angleDegrees']=12
    m=uniform_compound(**params);count=(2 if uc in ROTATIONAL else 1)*k
    assert len(m['vertices'])==count*2*n and len(m['components'])==count
    lengths=[np.linalg.norm(np.asarray(m['vertices'])[a]-m['vertices'][b]) for a,b in m['edges']]
    assert max(lengths)-min(lengths)<1e-12 and min(lengths)==pytest.approx(1)
    _,_,_,group,_=_prismatic(uc,n,d,k,params.get('angleDegrees',0))
    tree=cKDTree(np.asarray(group).reshape(len(group),9))
    assert max(tree.query(np.asarray([a@b for a in group for b in group]).reshape(-1,9))[0])<2e-12
    parts=components(m);p,f=parts[0]
    assert {boundary(p@g.T,f) for g in group}=={boundary(p,f) for p,f in parts}


@pytest.mark.parametrize('params',[{'uc':True},{'uc':0},{'uc':76},{'uc':3,'angleDegrees':17},
    {'uc':1,'angleDegrees':True},{'uc':1,'angleDegrees':float('nan')},{'uc':1,'angleDegrees':361},
    {'uc':30,'n':4},{'uc':20,'n':4,'d':2},{'uc':22,'d':2},{'uc':24,'d':1},
    {'uc':22,'n':5,'d':3,'k':13},{'uc':20,'n':32,'k':12},{'uc':22,'n':7,'d':5},
    {'uc':20,'n':3.5},{'uc':21,'k':1},{'uc':21,'d':0}])
def test_unsupported_and_malformed_domains_refuse(params):
    with pytest.raises(GeometryError):uniform_compound(**params)


def test_complete_catalog_names_properties_and_chirality():
    records=uniform_compound_catalog()
    assert {r['ucNumber'] for r in records}==set(range(1,76))
    assert {r['ucNumber'] for r in records if r['chiral']}=={5,18,19,30,32,34,36,42,44,55}
    for r in records:
        assert r['family']=='Compounds' and r['componentPolyhedron'] and r['symmetryGroup']
        assert f"UC{r['ucNumber']}" in r['aliases']
    from engine.catalog import get_catalog
    assert len([r for r in get_catalog() if r['key'].startswith('compound-uc')])==75


def test_parameter_recipe_saved_project_undo_redo_replay_and_component_edit():
    initial=uniform_compound(20);doc={'id':'uc-history','cursor':0,'states':[{'model':initial,'view':{},'notes':'UC study'}]}
    updated=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'uniform-compound',
        'parameters':{'uc':20,'n':7,'d':2,'k':3,'angleDegrees':31}}})
    assert len(doc['states'])==1 and len(updated['states'])==2
    updated['cursor']=0;assert updated['states'][0]['model']==initial
    updated['cursor']=1
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[updated]}
    restored=validate_project(json.loads(json.dumps(project)))['documents'][0]
    replayed=dispatch({'op':'recipe-replay','params':{'document':restored}})
    result=replayed['states'][0]['model'];expected=updated['states'][1]['model']
    assert canonical_model(result)==canonical_model(expected) and result['components']==expected['components']
    assert replayed['states'][0]['notes']=='UC study'
    branched=dispatch({'op':'recipe-branch','params':{'document':restored,
        'parameters':{'uc':20,'n':7,'d':2,'k':3,'angleDegrees':12}}})
    assert branched['states'][-1]['model']['metadata']['uniformCompound']['parameters']['angleDegrees']==12
    assert restored['states'][1]['model']['fingerprint']==expected['fingerprint']
    edited=dispatch({'op':'recipe-run','params':{'document':restored,'operation':'compound-component',
        'parameters':{'component_id':expected['components'][0]['id']}}})
    assert len(edited['states'][-1]['model']['vertices'])==14
