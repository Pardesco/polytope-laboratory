"""Attributed, immutable source catalogs beside independent constructions."""
import copy
import hashlib
import json
from functools import lru_cache
from pathlib import Path

from .geometry import GeometryError
from .regular4d_validation import regular4d_metadata

DATA = Path(__file__).resolve().parent / 'catalog_data'


@lru_cache(maxsize=1)
def _sources():
    records = {}
    for provider in ('antiprism', 'miratope'):
        root = DATA/provider
        manifest_file = root/'manifest.json'
        if not manifest_file.exists():
            continue
        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        for entry in manifest['entries']:
            if provider=='miratope' and entry['registration']!='regular-star':
                continue
            key = entry['key']
            if key in records: raise GeometryError('Duplicate source catalog key.')
            record = {'key':key, 'name':entry['name'],
                      'dimension':entry.get('dimension',3 if provider=='antiprism' else 4),
                      'family':entry.get('family','Regular star'),
                      'counts':counts_of(entry), 'provider':manifest.get('provider','Miratope'),
                      'aliases':[entry.get('id',''),entry['name']],
                      'sourceClassification':entry.get('sourceClassification',entry.get('family')),
                      'numericContract':'Supplied approximate source decimals; no exact certificate'}
            if entry.get('symbol') or entry.get('wythoffSymbol'):
                record['symbol']=entry.get('symbol',entry.get('wythoffSymbol'))
                record['aliases']+=list(dict.fromkeys([record['symbol'],record['symbol'].replace(' ',''),record['symbol'].replace(' ','_').replace('|',':')]))
            if provider=='antiprism':
                from .uniform_snub_catalog import uniform_snub_metadata
                record.update(uniform_snub_metadata(key,source_sha=entry['sha256']))
            mathematical_labels=regular4d_metadata(key)
            if mathematical_labels:
                mathematical_labels['aliases']=list(dict.fromkeys(record['aliases']+mathematical_labels['aliases']))
                record.update(mathematical_labels)
            records[key]=(root,entry,record)
    return records


def get_catalog():
    from .generators import CATALOG
    from .specialized_catalog import specialized_catalog
    from .miratope_expanded_catalog import expanded_catalog
    from .stewart_catalog import stewart_catalog
    from .stewart_family_catalog import stewart_family_catalog
    from .exact_regular_sources import exact_regular_catalog
    records=copy.deepcopy(CATALOG + [value[2] for value in _sources().values()])
    for record in records[:len(CATALOG)]:
        labels=regular4d_metadata(record['key'])
        if labels:record.update(labels)
    from .uniform_snub_catalog import uniform_snub_catalog
    return records + uniform_snub_catalog() + specialized_catalog() + expanded_catalog() + stewart_catalog() + stewart_family_catalog() + exact_regular_catalog()


def load_catalog_model(key):
    from .uniform_snub_catalog import load_uniform_snub_model
    uniform_variant=load_uniform_snub_model(key)
    if uniform_variant is not None:return uniform_variant
    from .exact_regular_sources import load_exact_regular_model
    exact_regular = load_exact_regular_model(key)
    if exact_regular is not None: return exact_regular
    from .stewart_family_catalog import load_stewart_family_model
    family = load_stewart_family_model(key)
    if family is not None: return family
    from .stewart_catalog import load_stewart_model
    stewart = load_stewart_model(key)
    if stewart is not None: return stewart
    from .miratope_expanded_catalog import load_expanded_model
    expanded = load_expanded_model(key)
    if expanded is not None: return expanded
    from .specialized_catalog import load_specialized_model
    specialized = load_specialized_model(key)
    if specialized is not None: return specialized
    item = _sources().get(key)
    if item is None: return None
    root,entry,record=item
    path=(root/entry['file']).resolve()
    if not path.is_relative_to(root.resolve()):
        raise GeometryError('Catalog asset escapes its attributed provider directory.')
    raw=path.read_bytes()
    expected=entry.get('sha256',entry.get('rawSha256'))
    if hashlib.sha256(raw).hexdigest()!=expected:
        raise GeometryError('Catalog source hash mismatch; original geometry was not loaded.')
    from .formats import parse_off
    model=parse_off(raw.decode('utf-8-sig'),record['name'])
    actual=[len(model[field]) for field in ('vertices','edges','faces','cells')]
    if actual!=counts_of(entry):
        raise GeometryError('Catalog source incidence differs from its retained manifest.')
    model['metadata'].update(copy.deepcopy(record))
    model['metadata']['source']='Attributed source catalog: '+record['provider']
    model['metadata']['sourceAsset']={field:copy.deepcopy(entry[field]) for field in
        ('adapter','quality','chirality','numericChecks','symmetryEvidence') if field in entry}
    model['provenance']['catalogSource']={'provider':record['provider'],
        'key':key, 'file':entry['file'],'sha256':expected,
        'sourceSha256':entry.get('sourceSha256',expected),
        'providerVersion':manifest_version(root), 'licenseFile':
        'COPYING' if record['provider']=='Antiprism' else 'LICENSE'}
    return model


def counts_of(entry):
    counts=entry['counts']
    return [counts[field] for field in ('vertices','edges','faces','cells')] if isinstance(counts,dict) else list(counts)


def manifest_version(root):
    value=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    return value.get('providerVersion',value.get('source',{}).get('gitHead'))
