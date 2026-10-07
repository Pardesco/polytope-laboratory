"""Independent literal fixtures and adversarial evidence, versioned production module."""
from copy import deepcopy
import hashlib
from itertools import combinations, product
import json
import math
import os
from pathlib import Path
import subprocess
import shutil
import sys

import numpy as np
import pytest

from engine.formats import parse_off,save_project,load_file,validate_project
from engine.geometry import GeometryError,identity
from engine.regular4d_validation import (
    CROSSWALK,analyze_regular4d,verify_regular4d_receipt,qualify_catalog,snapshot_hash,verify_catalog_receipt)
from engine.regular4d_validation import (CATALOG_IDENTITIES,regular4d_metadata,
    validate_catalog_regular4d,verify_catalog_model_receipt)

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'engine/catalog_data/miratope'

def test_existing_sixteen_keys_have_complete_detached_primary_labels():
    from engine.catalog import get_catalog
    records={r['key']:r for r in get_catalog()}
    assert len(CATALOG_IDENTITIES)==16
    for key,name in CATALOG_IDENTITIES.items():
        labels=regular4d_metadata(key);record=records[key]
        assert record['regular4dIdentity']==name
        assert record['symbol']==CROSSWALK[name]['symbol']
        assert record['counts']==CROSSWALK[name]['counts']
        assert record['cellType'] and record['vertexFigureType']
        assert CATALOG_IDENTITIES[record['dualKey']]==CROSSWALK[name]['dual']
        assert labels['identityReferences'] and labels['regular4dValidationVersion']=='0.1.0'
        labels['aliases'].clear();assert regular4d_metadata(key)['aliases']
    assert 'Small stellated 120-cell' in records['miratope-stellated-hecatonicosachoron']['aliases']

def test_read_only_registered_validation_binds_all_attributes_without_trusting_metadata():
    m=literal_tesseract();before=deepcopy(m)
    proof=validate_catalog_regular4d(m,'tesseract')
    assert proof['catalogKey']=='tesseract' and proof['sourceRawSha256'] is None
    assert verify_catalog_model_receipt(m,proof) and m==before
    bad=deepcopy(proof);bad['catalogKey']='cross4'
    with pytest.raises(GeometryError):verify_catalog_model_receipt(m,bad)
    bad=deepcopy(m);bad['metadata']['coordinateUnits']='cm'
    with pytest.raises(GeometryError):verify_catalog_model_receipt(bad,proof)
    with pytest.raises(GeometryError):validate_catalog_regular4d(m,False)

def test_actual_mounted_cold_json_validation_binds_every_registered_source(registered_models):
    requests=[]
    for key,name in CATALOG_IDENTITIES.items():
        source=registered_models[name]
        assert source['metadata']['regular4dIdentity']==name
        requests.append({'id':key,'op':'regular4d-validate','model':source,'params':{'key':key}})
    child=subprocess.run([sys.executable,'-B',str(ROOT/'engine/server.py')],
        input=''.join(json.dumps(r)+'\n' for r in requests),encoding='utf-8',capture_output=True,
        timeout=60,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    responses=[json.loads(line) for line in child.stdout.splitlines()]
    assert len(responses)==16
    for request,response in zip(requests,responses):
        assert response['ok'],response
        receipt=response['result'];assert receipt['catalogKey']==request['id']
        assert receipt['sourceId']==request['model']['id']
        assert verify_catalog_model_receipt(request['model'],receipt)
        assert receipt['sourceRawSha256'] is None

def test_actual_json_malformed_validation_refuses_and_protocol_continues():
    source=literal_tesseract();valid={'op':'regular4d-validate','model':source,'params':{'key':'tesseract'}}
    cases=[]
    for params in (None,False,0,[],{}, {'key':True},{'key':None},{'key':'cube'},
                   {'key':'tesseract','unexpected':1}):
        cases.append({**valid,'params':params})
    cases += [{**valid,'extra':True},{**valid,'model':False},
              {**valid,'model':{**source,'fingerprint':'foreign'}},
              {**valid,'model':{**source,'edges':[[True,1]]+source['edges'][1:]}}]
    requests=[{**request,'id':str(i)} for i,request in enumerate(cases+[valid])]
    child=subprocess.run([sys.executable,'-B',str(ROOT/'engine/server.py')],
        input=''.join(json.dumps(r)+'\n' for r in requests),encoding='utf-8',capture_output=True,
        timeout=30,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    results=[json.loads(line) for line in child.stdout.splitlines()]
    assert len(results)==len(requests) and all(not r['ok'] for r in results[:-1]),results
    assert results[-1]['ok'] and results[-1]['result']['flagOrbitCount']==1


def literal_tesseract():
    points=[list(p) for p in product((-1.,1.),repeat=4)];index={tuple(p):i for i,p in enumerate(points)};faces=[]
    for free in combinations(range(4),2):
        fixed=[i for i in range(4) if i not in free]
        for values in product((-1.,1.),repeat=2):
            face=[]
            for a,b in ((-1.,-1.),(1.,-1.),(1.,1.),(-1.,1.)):
                p=[0.]*4
                for i,x in zip(fixed,values):p[i]=x
                p[free[0]]=a;p[free[1]]=b;face.append(index[tuple(p)])
            faces.append(face)
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    cells=[[f for f,face in enumerate(faces) if all(points[v][axis]==sign for v in face)]
           for axis in range(4) for sign in (-1.,1.)]
    rgba=lambda n:[{'encoding':'byte','values':[20+i,70,140,160+i]} for i in range(n)]
    return {'id':'independent-tesseract','name':'Literal cube product','dimension':4,'embeddingDimension':4,
            'interpretation':'generalized-complex','vertices':points,'edges':[list(e) for e in edges],
            'faces':faces,'cells':cells,'metadata':{'coordinateUnits':'mm',
            'offColors':{'faces':rgba(24),'cells':rgba(8)},'historicalSource':{'literal':1.0}},
            'numeric':{'mode':'float64-approximate','certified':False}}


@pytest.fixture(scope='module')
def models():
    manifest=json.loads((DATA/'manifest.json').read_text())
    return {e['name']:parse_off((DATA/e['file']).read_text(),e['name']) for e in manifest['entries']}


@pytest.fixture(scope='module')
def qualification():
    return qualify_catalog(DATA)


@pytest.fixture(scope='module')
def registered_models():
    # Actual cold JSON-lines API, not globals or the catalog asset reader.
    from engine.catalog import get_catalog
    records=get_catalog();keys={name:entry['key'] for name,entry in
        ((e['name'],e) for e in json.loads((DATA/'manifest.json').read_text())['entries'])}
    keys.update({'Pentachoron':'simplex4','Tesseract':'tesseract','Hexadecachoron':'cross4',
                 'Icositetrachoron':'cell24','Hecatonicosachoron':'cell120','Hexacosichoron':'cell600'})
    requests=[{'id':name,'op':'generate','params':{'kind':'regular','key':key}} for name,key in keys.items()]
    child=subprocess.run([sys.executable,'-B',str(ROOT/'engine/server.py')],
        input=''.join(json.dumps(r)+'\n' for r in requests),encoding='utf-8',capture_output=True,
        timeout=45,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    results=[json.loads(line) for line in child.stdout.splitlines()]
    assert len(results)==16 and all(r['ok'] for r in results),results
    assert all(any(row['key']==key for row in records) for key in keys.values())
    return {r['id']:r['result'] for r in results}


@pytest.mark.parametrize('name',list(CROSSWALK))
def test_all_sixteen_full_boundaries_have_verified_metric_actions_and_one_flag_orbit(name,models,qualification):
    source=models[name];before=deepcopy(source)
    # A separate parser-created source UUID is deliberately not interchangeable
    # with the catalog proof reader's deterministic raw-file reference ID.
    r=analyze_regular4d(source,name)
    assert r['sourceFingerprint']==identity(source)
    assert r['sourceSnapshotSha256']==snapshot_hash(source)
    assert r['flagOrbitCount']==1 and r['reachedFlags']==r['flagCount']
    expected={'Pentachoron':120,'Tesseract':384,'Hexadecachoron':384,'Icositetrachoron':1152}.get(name,14400)
    assert r['flagCount']==expected and len(r['generators'])==4
    assert r['maxCoordinateResidual']<2e-12 and r['maxMirrorResidual']<2e-12
    assert r['certified'] is False and r['hullUsed'] is False
    # Direct coordinate oracle independent of nearest-neighbor construction.
    p=np.asarray(source['vertices']);p=(p-p.mean(axis=0))/max(np.linalg.norm(p-p.mean(axis=0),axis=1))
    for g in r['generators']:
        matrix=np.array(g['matrix']);assert np.linalg.det(matrix)==pytest.approx(-1)
        assert p@matrix.T==pytest.approx(p[g['maps'][0]],abs=2e-12)
        assert g['adjacentFlag'][g['rank']]!=r['initialFlag'][g['rank']]
    assert source==before


def test_pinned_catalog_source_hashes_are_recomputed_not_trusted_from_entry_labels(qualification):
    assert qualification['sourceCount']==16 and qualification['convexCount']==6 and qualification['starCount']==10
    assert qualification['baseline6Executed'] is False
    manifest=json.loads((DATA/'manifest.json').read_text())
    for e in manifest['entries']:
        r=next(r for r in qualification['receipts'] if r['identity']['name']==e['name'])
        assert r['sourceRawSha256']==hashlib.sha256((DATA/e['file']).read_bytes()).hexdigest()


def test_all_ten_reference_dual_relations_transpose_full_source_incidence_not_just_counts(qualification):
    pairs=qualification['dualPairReceipts'];assert len(pairs)==10
    for p in pairs:
        source=CROSSWALK[p['sourceIdentity']];target=CROSSWALK[p['targetIdentity']]
        assert source['dual']==target['name'] and source['parameters']==list(reversed(target['parameters']))
        for key,size in zip(('sourceVertexToTargetCell','sourceEdgeToTargetFace',
                             'sourceFaceToTargetEdge','sourceCellToTargetVertex'),source['counts']):
            assert len(p[key])==size and set(p[key])==set(range(size))
        assert p['normalizedReciprocalCoordinateResidual']<2e-11 and p['hullUsed'] is False


def test_full_catalog_receipt_rejects_foreign_dual_ownership_not_just_regular_entry_summaries(qualification):
    forged=deepcopy(qualification)
    row=forged['dualPairReceipts'][0]['sourceCellToTargetVertex'];row[0]=row[1]
    with pytest.raises(GeometryError,match='catalog receipt'):verify_catalog_receipt(DATA,forged)


@pytest.mark.parametrize('changed',['manifest','source'])
def test_acquisition_hash_change_refuses_before_any_reclassification(tmp_path,changed):
    target=tmp_path/'catalog';shutil.copytree(DATA,target)
    path=target/'manifest.json' if changed=='manifest' else next((target/'raw').glob('*.off'))
    path.write_bytes(path.read_bytes()+b'\n')
    with pytest.raises(GeometryError,match='changed|hash'):qualify_catalog(target)


def test_independent_literal_tesseract_four_rank_reflections_and_full_attributes():
    m=literal_tesseract();before=deepcopy(m);r=analyze_regular4d(m,'Tesseract')
    assert r['identity']['symbol']=='{4,3,3}' and r['cellType']=='cube' and r['vertexFigureType']=='tetrahedron'
    assert r['flagCount']==384 and verify_regular4d_receipt(m,r)
    assert m==before and r['sourceSnapshotSha256']==snapshot_hash(m)


@pytest.mark.parametrize('name',list(CROSSWALK))
def test_actual_current_six_independent_plus_ten_registered_stars_full_source_validation(name,registered_models,tmp_path):
    source=registered_models[name];before=deepcopy(source)
    raw=source.get('provenance',{}).get('catalogSource',{}).get('sha256')
    receipt=analyze_regular4d(source,name,raw)
    assert receipt['identity']['counts']==[len(source[k]) for k in ('vertices','edges','faces','cells')]
    assert source==before
    # Save/Open all sixteen literal loaded realizations through native formats.
    p={'format':'polytope-laboratory','version':1,'active':0,
       'documents':[{'id':'loaded-'+CROSSWALK[name]['alias'],'cursor':0,
                     'states':[{'model':deepcopy(source),'view':{},'notes':'actual catalog'}]}]}
    path=tmp_path/(CROSSWALK[name]['alias']+'.json');save_project(path,p)
    restored=load_file(path)['project']['documents'][0]['states'][0]['model']
    assert restored['metadata']==source['metadata']
    assert restored['vertices']==source['vertices'] and restored['edges']==source['edges']
    assert restored['faces']==source['faces'] and restored['cells']==source['cells']
    assert verify_regular4d_receipt(restored,receipt,raw)


def test_independent_regular_simplex_has_120_flags_and_no_coordinate_generator_dependency():
    vertices=[[1,1,1,-1/math.sqrt(5)],[1,-1,-1,-1/math.sqrt(5)],[-1,1,-1,-1/math.sqrt(5)],
              [-1,-1,1,-1/math.sqrt(5)],[0,0,0,4/math.sqrt(5)]]
    faces=[list(f) for f in combinations(range(5),3)]
    m={'id':'literal-simplex','dimension':4,'embeddingDimension':4,'vertices':vertices,
       'edges':[list(e) for e in combinations(range(5),2)],'faces':faces,
       'cells':[[i for i,f in enumerate(faces) if omitted not in f] for omitted in range(5)],
       'interpretation':'generalized-complex','metadata':{}}
    r=analyze_regular4d(m,'Pentachoron');assert r['flagCount']==120 and r['identity']['symbol']=='{3,3,3}'


@pytest.mark.parametrize('edit',[
    lambda m:m['vertices'][0].__setitem__(0,-.9),
    lambda m:m['faces'][0].__setitem__(slice(None),[m['faces'][0][i] for i in (0,2,1,3)]),
    lambda m:m['cells'][0].__setitem__(0,23),
    lambda m:m['edges'][0].__setitem__(0,True),
    lambda m:m['faces'][0].__setitem__(0,[]),
    lambda m:m['vertices'][0].__setitem__(0,10**500),
    lambda m:m['vertices'][0].__setitem__(0,float('nan')),
    lambda m:m['metadata'].__setitem__('coordinateUnits','invalid'),
    lambda m:m['metadata']['offColors']['cells'][0]['values'].__setitem__(3,256),
])
def test_tampered_source_geometry_or_malformed_attributes_is_rejected_atomically(edit):
    m=literal_tesseract();edit(m);before=deepcopy(m)
    with pytest.raises(GeometryError):analyze_regular4d(m,'Tesseract')
    assert snapshot_safe(m)==snapshot_safe(before)


def snapshot_safe(m):
    return json.dumps(m,sort_keys=True,allow_nan=True)


@pytest.mark.parametrize('edit',[
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['offColors']['cells'][0]['values'].__setitem__(3,20),
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(0,22),
    lambda m:m['metadata']['historicalSource'].__setitem__('literal',2),
    lambda m:m.__setitem__('id','foreign-source'),
])
def test_valid_attribute_changes_cannot_reuse_previous_source_receipt(edit):
    m=literal_tesseract();r=analyze_regular4d(m,'Tesseract');edit(m)
    # Geometry remains regular; retained evidence must still refuse foreign attrs.
    assert analyze_regular4d(m,'Tesseract')['status']=='passed'
    with pytest.raises(GeometryError,match='receipt'):verify_regular4d_receipt(m,r)


@pytest.mark.parametrize('edit',[
    lambda r:r.__setitem__('reachedFlags',383),
    lambda r:r.__setitem__('flagOrbitCount',1.5),
    lambda r:r['generators'][0]['maps'][0].__setitem__(0,0),
    lambda r:r['generators'][0]['matrix'][0].__setitem__(0,.9),
    lambda r:r['identity'].__setitem__('symbol','{5,3,3}'),
    lambda r:r.__setitem__('certified',True),
    lambda r:r.__setitem__('sourceRawSha256','0'*64),
])
def test_fabricated_orbit_generator_identity_or_certification_receipts_fail(edit):
    m=literal_tesseract();r=analyze_regular4d(m,'Tesseract');edit(r)
    with pytest.raises(GeometryError):verify_regular4d_receipt(m,r)


def test_matching_counts_do_not_alias_different_star_identity_or_winding(models):
    # All three rows share120/720/720/120; no count-only identity classifier.
    for name in ('Grand hecatonicosachoron','Great hecatonicosachoron','Grand stellated hecatonicosachoron'):
        wrong=next(other for other in ('Grand hecatonicosachoron','Great hecatonicosachoron',
                   'Grand stellated hecatonicosachoron') if other!=name)
        with pytest.raises(GeometryError):analyze_regular4d(models[name],wrong)


def test_star_cycle_refusal_reaches_math_even_if_geometry_binding_is_refreshed(models):
    m=deepcopy(models['Great stellated hecatonicosachoron']);f=m['faces'][0]
    m['faces'][0]=[f[i] for i in (0,2,4,1,3)]
    m['fingerprint']=identity(m)
    with pytest.raises(GeometryError):analyze_regular4d(m,'Great stellated hecatonicosachoron')


def test_similarity_covariance_preserves_literal_source_and_does_not_recenter_output():
    m=literal_tesseract();matrix=np.eye(4);a=.37;c,s=math.cos(a),math.sin(a)
    matrix[0,0]=c;matrix[0,3]=-s;matrix[3,0]=s;matrix[3,3]=c
    m['vertices']=((np.array(m['vertices'])@matrix.T+[2,-3,5,7])*1e-9).tolist();before=deepcopy(m)
    assert analyze_regular4d(m,'Tesseract')['flagCount']==384 and m==before


@pytest.mark.parametrize('bad',[None,[],{},True,0])
def test_invalid_identity_domain_never_uses_falsey_fallback(bad):
    with pytest.raises(GeometryError):analyze_regular4d(literal_tesseract(),bad)


def test_deep_unicode_and_unsafe_json_are_structured_refusals_before_copy():
    for value in ('\ud800',10**500,1e18):
        m=literal_tesseract();m['metadata']['malicious']=value
        with pytest.raises(GeometryError):analyze_regular4d(m,'Tesseract')
    m=literal_tesseract();v={};m['metadata']['deep']=v
    for _ in range(65):v['child']={};v=v['child']
    with pytest.raises(GeometryError,match='resource'):analyze_regular4d(m,'Tesseract')


def test_actual_headless_node_json_and_native_save_open_preserve_evidence_rgba_units(tmp_path):
    m=literal_tesseract();m['metadata']['historicalSource']['scientificFloat']=1e99
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'literal-document','cursor':0,'states':[{'model':m,'view':{},'notes':'source'}]}]}
    validate_project(project);r=analyze_regular4d(m,'Tesseract')
    code="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    child=subprocess.run(['node','-e',code],input=json.dumps(project),encoding='utf-8',capture_output=True,
                         timeout=20,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    p=json.loads(child.stdout);path=tmp_path/'regular4d.json';save_project(path,p)
    restored=load_file(path)['project']['documents'][0]['states'][0]['model']
    assert verify_regular4d_receipt(restored,r)
    assert restored['metadata']==m['metadata'] and restored['vertices']==m['vertices']
