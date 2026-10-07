# SPDX-License-Identifier: GPL-3.0-only
"""Supplied regular-faced excavations, with actual genus checked on load."""
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from pathlib import Path
from engine.formats import parse_off
from engine.geometry import GeometryError
from engine.specialized_catalog import owned_compound
from engine.stewart_checks import stewart_report

DATA=Path(__file__).resolve().parent/'catalog_data/stewart_families'
KEYS=frozenset(('stewart-k3-2q3-s3','stewart-k3-3q3-s3','stewart-k3-4q3-s3','stewart-k3-q3t3'))
FIELDS=('key','name','dimension','family','symbol','counts','aliases','componentCount','genus','chirality','sourceClassification')


def _asset(path,expected):
    if type(path) is not str or len(path)>128:raise GeometryError('Stewart family source path requires a bounded string.')
    resolved=(DATA/path).resolve()
    if not resolved.is_relative_to(DATA.resolve()) or resolved.suffix!='.off':raise GeometryError('Stewart family asset escapes its attributed source directory.')
    if resolved.stat().st_size>256*1024:raise GeometryError('Stewart family asset exceeds its 256 KiB source bound.')
    raw=resolved.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=expected:raise GeometryError('Stewart family source hash mismatch.')
    return raw


@lru_cache(maxsize=1)
def _manifest():
    path=DATA/'manifest.json'
    if path.stat().st_size>512*1024:raise GeometryError('Stewart family manifest exceeds its bounded source contract.')
    manifest=json.loads(path.read_text(encoding='utf-8'));entries=manifest.get('entries')
    if manifest.get('version')!=1 or type(entries) is not list or len(entries)!=4 or {e.get('key') for e in entries}!=KEYS:
        raise GeometryError('Stewart family catalog requires four reviewed excavation records.')
    return manifest


def stewart_family_catalog():
    return [{k:deepcopy(e[k]) for k in FIELDS} for e in _manifest()['entries']]


def load_stewart_family_model(key):
    if type(key) is not str or len(key)>128:raise GeometryError('Stewart family key requires a bounded string.')
    if key not in KEYS:return None
    manifest=_manifest();entry=next(e for e in manifest['entries'] if e['key']==key)
    raw=_asset(entry['file'],entry['sha256']);_asset(entry['sourceFile'],entry['sourceSha256'])
    for source in entry['sourceParts']:_asset(source['file'],source['sha256'])
    model=parse_off(raw.decode('utf-8'),entry['name'])
    if [len(model[k]) for k in ('vertices','edges','faces','cells')]!=entry['counts']:raise GeometryError('Stewart family incidence differs from its retained source.')
    report=stewart_report(model)
    if not report['classified'] or report['T']['topology']['genus']!=entry['genus'][0]:
        raise GeometryError('Stewart family no longer satisfies its actual expected genus and R/A/Q/T/D contract.')
    model=owned_compound(model,key)
    model['metadata'].update({k:deepcopy(entry[k]) for k in FIELDS})
    model['metadata']['stewart']=report
    model['metadata']['sourceAsset']={k:deepcopy(entry[k]) for k in ('sourceParts','sourceSha256','sourceMaps','construction')}
    model['metadata']['specializedBoundary']['classification']='Source-part excavation with numerical R/A/Q/T/D and expected genus verified.'
    for component in model['metadata']['specializedBoundary']['components']:
        component['genusScope']='Actual closed embedded ordinary boundary; numerical disjoint-face audit passed.'
    model['provenance']['catalogSource']={'provider':manifest['provider'],'providerVersion':manifest['providerVersion'],'key':key,
        'sha256':entry['sha256'],'sourceSha256':entry['sourceSha256'],'licenseFile':'COPYING'}
    model['provenance']['construction']=deepcopy(entry['construction'])
    return model
