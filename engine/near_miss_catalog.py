"""Original fitted near-miss catalog assets; no exact regularity claims."""
from collections import Counter
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path

import numpy as np

from .condition_fitting import condition_arrays
from .geometry import GeometryError, identity, validate
from .geometric_fitting import _qualify

DATA=Path(__file__).resolve().parent/'catalog_data/near_miss'
FAMILY='Near-miss Johnson solids'


def deviation_metrics(model):
    p=np.asarray(model['vertices'],dtype=float);edges=np.asarray(model['edges'],dtype=int)
    scale=float(np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1).mean())
    a=condition_arrays((p-p.mean(axis=0))/scale,edges,model['faces'])
    maximum=lambda key:float(np.max(np.abs(a[key]),initial=0))
    return {'maximumEdgeDeviationPercent':100*maximum('equal-edges'),
        'maximumFaceEdgeDeviationPercent':100*maximum('face-edges'),
        'maximumFaceAngleDeviationDegrees':math.degrees(maximum('face-angles')),
        'maximumPlanarity':maximum('planar-faces'),
        'aggregateAngleDeviationDegrees':math.degrees(float(np.sum(np.abs(a['face-angles'])))),
        'definition':'Maximum edge error from global mean; face edges from face mean; angles from regular n-gon; planarity is best-fit-plane coordinate residual / mean edge.',
        'certified':False}


@lru_cache(maxsize=1)
def _manifest():
    return json.loads((DATA/'manifest.json').read_text(encoding='utf-8'))


def near_miss_catalog():
    return [deepcopy(entry['record']) for entry in _manifest()['entries']]


def load_near_miss_model(key):
    if not isinstance(key,str) or not key.startswith('near-miss-'):return None
    entry=next((e for e in _manifest()['entries'] if e['record']['key']==key),None)
    if entry is None:return None
    path=(DATA/entry['file']).resolve()
    if not path.is_relative_to(DATA.resolve()):raise GeometryError('Near-miss asset escapes its catalog directory.')
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise GeometryError('Near-miss catalog source hash mismatch.')
    model=json.loads(raw);record=deepcopy(entry['record'])
    if [len(model[k]) for k in ('vertices','edges','faces','cells')]!=record['counts'] or dict(Counter(map(len,model['faces'])))!={int(k):v for k,v in record['faceTypes'].items()}:
        raise GeometryError('Near-miss catalog incidence differs from its manifest.')
    if not validate(model)['passed']:raise GeometryError('Near-miss catalog incidence failed validation.')
    _qualify(model,np.asarray(model['vertices']).mean(axis=0))
    model['metadata'].update(record)
    model['metadata']['nearMissRealization']['metrics']=deviation_metrics(model)
    model['fingerprint']=identity(model)
    model['metadata']['nearMissRealization']['resultFingerprint']=model['fingerprint']
    model['validation']=validate(model)
    return model
