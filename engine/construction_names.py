"""Conservative display names; numerical recognition is not an identity certificate."""
from collections import Counter
from functools import lru_cache
import numpy as np


def _signature(model):
    if model.get('dimension')!=3 or model.get('cells') or model.get('components'):
        return None
    p=np.asarray(model['vertices'],dtype=float)
    if not 4<=len(p)<=120:return None
    edges=np.asarray(model['edges'],dtype=int)
    lengths=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)
    unit=float(np.mean(lengths))
    if unit<=0 or np.ptp(lengths)>unit*1e-6:return None
    incidence=[[] for _ in p]
    for face in model['faces']:
        n=len(face);q=p[face]/unit
        distances=np.linalg.norm(q[:,None]-q[None,:],axis=2)
        steps=np.arange(n)
        ideal=np.abs(np.sin(np.pi*(steps[:,None]-steps[None,:])/n))/np.sin(np.pi/n)
        if not np.allclose(distances,ideal,rtol=0,atol=1e-6):return None
        for v in face:incidence[v].append(n)
    if len({tuple(sorted(row)) for row in incidence})!=1:return None
    distances=np.sort(np.linalg.norm(p[:,None]-p[None,:],axis=2)/unit,axis=1)
    if not np.allclose(distances,distances[0],rtol=0,atol=1e-6):return None
    return tuple(sorted(Counter(map(len,model['faces'])).items())),distances[0]


@lru_cache(maxsize=32)
def _reference(key):
    from .generators import regular
    return _signature(regular(key))


def construction_name(result, fallback):
    from .generators import CATALOG
    counts=[len(result.get(key,[])) for key in ('vertices','edges','faces','cells')]
    candidates=[row for row in CATALOG if row['dimension']==3 and row['family'] in ('Platonic','Archimedean')
                and not row.get('chiral') and row['counts']==counts]
    if not candidates:return fallback
    signature=_signature(result)
    if signature is None:return fallback
    matches=[]
    for row in candidates:
        reference=_reference(row['key'])
        if reference is not None and signature[0]==reference[0] and np.allclose(signature[1],reference[1],rtol=0,atol=1e-6):
            matches.append(row['name'])
    return matches[0] if len(matches)==1 else fallback


def surgery_name(base, params):
    source=base.get('name','Model');mode=params.get('mode','augment')
    piece=params.get('piece','pyramid')
    if piece=='model':piece=params.get('addition',{}).get('name','model')
    elif piece=='library':piece=params.get('library_key','library model').replace('-',' ')
    if mode=='drill':return source+' with prism tunnel'
    if mode=='vertices':return source+' + '+piece+' at '+('matching vertices' if params.get('all_of_type') else 'vertex '+str(params['vertex_id']))
    target='matching faces' if params.get('all_of_type') else 'face '+str(params['face_id'])
    return source+(' with '+piece+' excavation on ' if mode=='excavate' else ' + '+piece+' on ')+target
