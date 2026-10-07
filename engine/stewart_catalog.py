# SPDX-License-Identifier: GPL-3.0-only
"""Three attributed Stewart excavations with bounded source/model verification."""
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from engine.formats import parse_off
from engine.geometry import GeometryError
from engine.specialized_catalog import owned_compound
from engine.stewart_checks import stewart_report

DATA=Path(__file__).resolve().parent/'catalog_data/stewart'
KEYS=frozenset(('stewart-q3q3-s3s3','stewart-q4q4-b4','stewart-q3p6-p3q3'))
RECORD_FIELDS=('key','name','dimension','family','symbol','counts','aliases','componentCount','genus','chirality','sourceClassification')


def _asset(relative,expected):
    if type(relative) is not str or len(relative)>128:raise GeometryError('Stewart asset path requires a bounded string.')
    path=(DATA/relative).resolve()
    if not path.is_relative_to(DATA.resolve()) or path.suffix!='.off':raise GeometryError('Stewart asset escapes its attributed provider directory.')
    if path.stat().st_size>256*1024:raise GeometryError('Stewart asset exceeds its 256 KiB source bound.')
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=expected:raise GeometryError('Stewart catalog source hash mismatch.')
    return raw


@lru_cache(maxsize=1)
def _manifest():
    path=DATA/'manifest.json'
    if path.stat().st_size>512*1024:raise GeometryError('Stewart manifest exceeds its 512 KiB bound.')
    manifest=json.loads(path.read_text(encoding='utf-8'))
    entries=manifest.get('entries')
    if manifest.get('version')!=1 or type(entries) is not list or len(entries)!=3 or {e.get('key') for e in entries}!=KEYS:
        raise GeometryError('Stewart catalog requires the three reviewed source keys.')
    return manifest


def stewart_catalog():
    return [{k:deepcopy(entry[k]) for k in RECORD_FIELDS} for entry in _manifest()['entries']]


def load_stewart_model(key):
    if type(key) is not str or len(key)>128:raise GeometryError('Stewart catalog key requires a bounded string.')
    if key not in KEYS:return None
    manifest=_manifest();entry=next(e for e in manifest['entries'] if e['key']==key)
    raw=_asset(entry['file'],entry['sha256'])
    _asset(entry['sourceFile'],entry['sourceSha256'])
    model=parse_off(raw.decode('utf-8'),entry['name'])
    if [len(model[k]) for k in ('vertices','edges','faces','cells')]!=entry['counts']:
        raise GeometryError('Stewart source incidence differs from its retained manifest.')
    report=stewart_report(model)
    if not report['classified']:raise GeometryError('Stewart supplied boundary no longer satisfies its numerical R/A/Q/T/D contract.')
    model=owned_compound(model,key)
    model['metadata'].update({k:deepcopy(entry[k]) for k in RECORD_FIELDS})
    model['metadata']['stewart']=report
    model['metadata']['sourceAsset']={k:deepcopy(entry[k]) for k in ('adapter','construction','sourceSha256')}
    boundary=model['metadata']['specializedBoundary']
    boundary['classification']='Named regular-faced Stewart excavation; numerical R/A/Q/T/D verified for this source.'
    for component in boundary['components']:component['genusScope']='Closed embedded ordinary source boundary; numerical disjoint-face audit passed.'
    model['provenance']['catalogSource']={'provider':manifest['provider'],'providerVersion':manifest['providerVersion'],
        'key':key,'file':entry['file'],'sha256':entry['sha256'],'sourceSha256':entry['sourceSha256'],'licenseFile':'COPYING'}
    model['provenance']['construction']=deepcopy(entry['construction'])
    return model
