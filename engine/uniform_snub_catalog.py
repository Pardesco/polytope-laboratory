"""Source-relative reflected forms and a separately attributed Skilling figure."""
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
import hashlib,json
from .geometry import GeometryError
from .source_reflection import reflect_source

DATA=Path(__file__).resolve().parent/'catalog_data/uniform_snub'
SNUB_INDICES=(12,29,32,40,46,57,60,64,69,72,74,75)

@lru_cache(maxsize=1)
def _manifest():
    return json.loads((DATA/'manifest.json').read_text(encoding='utf-8'))

def uniform_snub_metadata(key,form='source',source_sha=None):
    entry=next((row for row in _manifest()['entries'] if row['sourceKey']==key),None)
    if entry is None:return {}
    if source_sha is not None and source_sha!=entry['sourceAssetSha256']:
        raise GeometryError('Uniform snub source asset changed; retained chirality evidence is stale.')
    evidence=deepcopy(entry['chiralityEvidence']);complete=evidence['complete'];improper=evidence['improperOrder']
    chiral=improper==0 if complete else None
    label='numerically chiral' if complete and chiral else 'numerically achiral' if complete else 'chirality not independently classified'
    return {'chiral':chiral,'enantiomorph':form,'chiralityStatus':label,'chiralityEvidence':evidence,
        'uniformSnubVariant':{'version':1,'sourceKey':key,'uniformId':entry['uniformId'],'form':form,
            'reflectionParity':int(form=='reflected'),'sourceAssetSha256':entry['sourceAssetSha256'],
            'labelBasis':'Form relative to pinned Antiprism coordinates; no absolute left/right convention.'}}

def uniform_snub_catalog():
    from .catalog import _sources
    result=[]
    for row in _manifest()['entries']:
        record=deepcopy(_sources()[row['sourceKey']][2]);record.update(uniform_snub_metadata(row['sourceKey'],'reflected'))
        record.update(key=row['sourceKey']+'-mirror',name=record['name']+' (reflected)',constructionOf=row['sourceKey'])
        record['aliases']=list(dict.fromkeys(record['aliases']+[row['uniformId']+' mirror',row['uniformId']+' reflected','mirror '+row['name'],'reflected '+row['name']]))
        result.append(record)
    result.append(deepcopy(_manifest()['skilling']['record']))
    return result

def load_uniform_snub_model(key):
    if key=='antiprism-skilling':
        entry=_manifest()['skilling'];path=DATA/entry['file'];raw=path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise GeometryError('Skilling source hash changed; original figure was not loaded.')
        from .formats import parse_off
        result=parse_off(raw.decode('utf-8-sig'),entry['record']['name'])
        if [len(result[k]) for k in ('vertices','edges','faces','cells')]!=entry['record']['counts']:
            raise GeometryError('Skilling literal source incidence differs from its manifest.')
        result['metadata'].update(deepcopy(entry['record']));result['metadata']['sourceAsset']=deepcopy({k:v for k,v in entry.items() if k!='record'})
        result['provenance']['catalogSource']={'provider':'Antiprism','providerVersion':'0.32','key':key,
            'file':entry['file'],'sha256':entry['sha256'],'licenseFile':'COPYING','resourcePermission':entry['resourcePermission']}
        return result
    base=key.removesuffix('-mirror')
    if base==key or base not in {row['sourceKey'] for row in _manifest()['entries']}:return None
    from .catalog import load_catalog_model
    original=load_catalog_model(base);result=reflect_source(original,0)
    record=next(row for row in uniform_snub_catalog() if row['key']==key)
    result['name']=record['name'];result['metadata'].update(deepcopy(record))
    result['provenance']['catalogConstruction']={'sourceKey':base,'form':'reflected','axis':0,'determinant':-1,'sourceModel':deepcopy(original),
        'definition':'Negate the literal X coordinate; retain source vertex/edge/face IDs, raw colors and exact ordered cycles.'}
    return result
