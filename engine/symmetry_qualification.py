"""Release evidence adapter. Does not implement or cache symmetry discovery."""
from collections import Counter, deque
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import platform

import numpy as np
import scipy

from .geometry import GeometryError, identity

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(__file__).resolve().parent/'catalog_data/symmetry_qualification'
FIXTURES = DATA/'fixtures.json'
REPORT = DATA/'report.json'
KINDS = ('vertices','edges','faces','cells')
IMPLEMENTATION = ('symmetry_qualification.py','symmetry.py','geometry.py','generators.py',
    'operations.py','chiral.py','star_polyhedra.py','regular4d_validation.py','wythoff.py',
    'uniform4.py','star_uniform4.py','goursat_wythoff.py','catalog.py','formats.py')


def sha(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def source_binding(model):
    if (type(model) is not dict or type(model.get('vertices')) is not list
            or not 1<=len(model['vertices'])<=10000
            or any(type(model.get(k,[])) is not list for k in KINDS[1:])
            or sum(len(model.get(k,[])) for k in KINDS)>100000):
        raise GeometryError('Symmetry receipt matching requires a bounded source model (10,000 vertices / 100,000 entities).')
    return {'fingerprint':identity(model),
        'coordinateSha256':sha([[float(x) if x else 0.0 for x in p] for p in model['vertices']]),
        'incidenceSha256':sha({k:model.get(k,[]) for k in KINDS[1:]})}


def fixture_model(row):
    from .generators import regular
    from .operations import transform
    model = regular(row['key'])
    variant = row.get('variant','source')
    if variant=='rotated-scaled':
        d=model['dimension'];a=np.arange(1,d*d+1,dtype=float).reshape(d,d)+np.eye(d)*7
        q,_=np.linalg.qr(a)
        model=transform(model,matrix=q,scale=row['scale'],translation=np.arange(1,d+1)*row['scale']*3)
    elif variant=='missing-face':
        model['interpretation']='generalized-complex';model['faces']=model['faces'][1:]
    elif variant=='extra-open-cell':
        model['interpretation']='generalized-complex';model['cells'].append(model['cells'][0][:-1])
    elif variant!='source':
        raise GeometryError('Unknown symmetry qualification fixture variant.')
    model['fingerprint']=identity(model)
    return model


def cycle(face):
    row=tuple(face)
    return min(row[i:]+row[:i] for row in (row,row[::-1]) for i in range(len(row)))


def independent_actions(model, group):
    """Scalar boundary and flag walks independent of optimized engine row maps."""
    edges=[tuple(sorted(e)) for e in model['edges']];faces=[cycle(f) for f in model['faces']]
    cells=[tuple(sorted(faces[f] for f in cell)) for cell in model.get('cells',[])]
    indexes=[{row:i for i,row in enumerate(rows)} for rows in (edges,faces,cells)]
    maps=[];residual=0.0;orthogonal=0.0
    p=np.asarray(model['vertices'],dtype=float);p=(p-p.mean(axis=0))/np.max(np.ptp(p,axis=0))
    # Check metric and full bijection for every reported action, not only generators.
    for action in group['actions']:
        perm=action['permutation'];matrix=np.asarray(action['matrix'])
        if sorted(perm)!=list(range(len(p))):raise GeometryError('Independent vertex bijection failed.')
        residual=max(residual,float(np.max(np.linalg.norm(p@matrix.T-p[perm],axis=1))))
        orthogonal=max(orthogonal,float(np.max(abs(matrix@matrix.T-np.eye(p.shape[1])))))
        if round(float(np.linalg.det(matrix)))!=action['determinant']:
            raise GeometryError('Independent orientation check failed.')
    if max(residual,orthogonal)>group['tolerance']*4:
        raise GeometryError('Independent normalized metric residual exceeds tolerance.')
    for index in group['generatorIndices']:
        perm=group['actions'][index]['permutation']
        mapped_edges=[tuple(sorted(perm[v] for v in e)) for e in model['edges']]
        mapped_faces=[cycle([perm[v] for v in f]) for f in model['faces']]
        mapped_cells=[tuple(sorted(mapped_faces[f] for f in c)) for c in model.get('cells',[])]
        mapped=[mapped_edges,mapped_faces,mapped_cells]
        for before,after in zip((edges,faces,cells),mapped):
            if Counter(before)!=Counter(after):raise GeometryError('Independent literal incidence check failed.')
        maps.append([perm]+[[lookup[item] for item in rows] for lookup,rows in zip(indexes,mapped)])
    edge_ids={edge:i for i,edge in enumerate(edges)}
    owners=enumerate(model['cells']) if model.get('cells') else [(None,range(len(faces)))]
    flags=set()
    for c,face_ids in owners:
        for f in face_ids:
            face=model['faces'][f]
            for a,b in zip(face,face[1:]+face[:1]):
                e=edge_ids[tuple(sorted((a,b)))]
                for v in (a,b):flags.add((v,e,f,c) if c is not None else (v,e,f))
    remaining=set(flags);sizes=[]
    while remaining:
        first=min(remaining);seen={first};pending=deque([first])
        while pending:
            flag=pending.popleft()
            for mapping in maps:
                image=tuple(mapping[r][i] for r,i in enumerate(flag))
                if image not in flags:raise GeometryError('Independent flag action leaves source flags.')
                if image not in seen:seen.add(image);pending.append(image)
        remaining.difference_update(seen);sizes.append(len(seen))
    return {'normalizedCoordinateResidual':residual,'orthogonalityResidual':orthogonal,
        'actionsMetricChecked':len(group['actions']),'generatorsIncidenceChecked':len(maps),
        'flagCount':len(flags),'flagOrbitSizes':sorted(sizes),'flagOrbitCount':len(sizes)}


def qualify(row):
    from .symmetry import geometric_symmetry
    from .regular4d_validation import validate_catalog_regular4d
    model=fixture_model(row);before=deepcopy(model)
    receipt={'id':row['id'],'key':row['key'],'family':row['family'],'variant':row.get('variant','source'),
        'expected':row['expected'],'source':source_binding(model),'counts':[len(model.get(k,[])) for k in KINDS],
        'numericMode':'float64-approximate','certified':False,'maxFrames':row.get('maxFrames',100000)}
    if len(model['vertices'])>1000:
        receipt.update(status='limited',reason='Source exceeds the frame engine limit of 1,000 vertices; no full-group or flag claim.')
        if row.get('expectedStatus','passed')!='limited':receipt['unexpectedOutcome']=True
        return receipt
    try:
        group=geometric_symmetry(model,max_frames=receipt['maxFrames'])
        receipt['search']={k:group[k] for k in ('order','properOrder','complete','closureVerified','termination',
            'candidateFramesEvaluated','searchNodesEvaluated','searchNodeLimit','frameConditionNumber','tolerance','algorithmVersion')}
        if not group['complete']:
            receipt.update(status='limited',reason='Frame search did not exhaust; reported actions do not establish a complete group.')
            if group['closureVerified'] is not None or group['entityOrbits'] is not None:
                raise GeometryError('Limited search incorrectly claimed closure or source orbits.')
        else:
            expected=row['expected']
            if (group['order'],group['properOrder'])!=(expected['order'],expected['properOrder']):
                raise GeometryError('Independent expected group orders disagree with enumerated group.')
            if not group['closureVerified'] or group['termination']!='exhausted':
                raise GeometryError('Complete group lacks exhausted search and closure.')
            receipt['independent']=independent_actions(model,group)
            receipt['actionPermutationSha256']=sha(sorted(a['permutation'] for a in group['actions']))
            if 'flagOrbitCount' in expected and receipt['independent']['flagOrbitCount']!=expected['flagOrbitCount']:
                raise GeometryError('Independent expected flag orbit count disagrees.')
            if row.get('regular4dKey'):
                flag=validate_catalog_regular4d(model,row['regular4dKey'])
                receipt['regularFlagCheck']={k:flag[k] for k in ('flagCount','reachedFlags','generatedSubgroupOrder',
                    'maxCoordinateResidual','maxFaceResidual','maxMirrorResidual','relativeEdgeSpread')}
                if flag['reachedFlags']!=expected['order']:raise GeometryError('Independent regular flag order disagrees.')
            receipt['status']='passed'
        if source_binding(model)!=receipt['source'] or model!=before:raise GeometryError('Qualification mutated its source.')
    except GeometryError as error:
        receipt.update(status='failed',reason=str(error))
    if receipt['status']!=row.get('expectedStatus','passed'):
        receipt['unexpectedOutcome']=True
    return receipt


def build_report(fixtures=None):
    fixtures=fixtures or json.loads(FIXTURES.read_text(encoding='utf-8'))
    implementation={name:hashlib.sha256((ROOT/'engine'/name).read_bytes()).hexdigest() for name in IMPLEMENTATION}
    rows=[]
    for row in fixtures['scenarios']:
        print(row['id'],flush=True)
        rows.append(qualify(row))
        receipt=rows[-1]
        if receipt['variant']=='rotated-scaled' and receipt['status']=='passed':
            base=next(r for r in rows if r['key']==receipt['key'] and r['variant']=='source')
            receipt['sameSourceActionPermutations']=receipt['actionPermutationSha256']==base.get('actionPermutationSha256')
            if not receipt['sameSourceActionPermutations']:
                receipt.update(status='failed',reason='Similarity changed the complete source action permutations.')
    if implementation!={name:hashlib.sha256((ROOT/'engine'/name).read_bytes()).hexdigest() for name in IMPLEMENTATION}:
        raise GeometryError('Symmetry qualification implementation changed during execution; reproduce the report again.')
    return {'format':'polytope-symmetry-qualification','version':1,'numericMode':'float64-approximate','certified':False,
        'scope':fixtures['scope'],'references':fixtures['references'],'fixturesSha256':sha(fixtures),
        'implementationSha256':implementation,
        'environment':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__},
        'policy':'Recorded numerical evidence for literal supplied geometry; no exact algebraic certificate, baseline parity or classification promotion.',
        'receipts':rows}


def read_report(key=None, model=None, scenario=None):
    if key is not None and (type(key) is not str or len(key)>256):raise GeometryError('Choose a literal catalog key.')
    raw=REPORT.read_bytes();report=json.loads(raw)
    fixtures=json.loads(FIXTURES.read_text(encoding='utf-8'))
    fixture_current=sha(fixtures)==report['fixturesSha256']
    states={}
    for name,digest in report['implementationSha256'].items():
        path=ROOT/'engine'/name
        states[name]='unavailable' if not path.is_file() else 'current' if hashlib.sha256(path.read_bytes()).hexdigest()==digest else 'changed'
    report['binding']={'fixturesCurrent':fixture_current,'implementation':states,
        'meaning':'Implementation hashes describe the executed source version. Frozen builds may omit Python source files.'}
    report['reportSha256']=hashlib.sha256(raw).hexdigest()
    if key is not None:
        report['receipts']=[r for r in report['receipts'] if r['key']==key and r['variant']=='source']
    if scenario is not None:
        if type(scenario) is not str or len(scenario)>256:raise GeometryError('Choose a literal qualification scenario ID.')
        report['receipts']=[r for r in report['receipts'] if r['id']==scenario]
    report['sourceMatch']=None
    if model is not None:
        binding=source_binding(model)
        report['sourceMatch']=any(r['status']=='passed' and r['source']==binding for r in report['receipts'])
    report['recordedOnly']=True
    return report


def dispatch_qualification(request):
    params=request.get('params',{})
    if type(params) is not dict or set(params)-{'key','scenario'}:raise GeometryError('Symmetry evidence accepts only an optional catalog key or scenario ID.')
    return read_report(params.get('key'),request.get('model'),params.get('scenario'))
