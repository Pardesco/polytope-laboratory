# SPDX-License-Identifier: GPL-3.0-only
"""Attributed literal 4D sources, with no inferred mathematical deduplication."""
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from .formats import parse_off,MAX_FILE_BYTES
from .geometry import GeometryError

DATA=Path(__file__).resolve().parent/'catalog_data/miratope_expanded'


@lru_cache(maxsize=1)
def _entries():
    manifest=json.loads((DATA/'manifest.json').read_text(encoding='utf-8'))
    return {entry['key']:entry for entry in manifest['entries']}


def expanded_catalog():
    return [{k:deepcopy(entry[k]) for k in ('key','name','dimension','family','counts','aliases','sourceClassification','classificationVerified','catalogStatus','diagnostic') if k in entry}
            for entry in _entries().values()]


def load_expanded_model(key):
    entry=_entries().get(key)
    if entry is None:return None
    if entry['catalogStatus']=='unsupported':raise GeometryError(entry['diagnostic'])
    asset=(DATA/entry['file']).resolve()
    if not asset.is_relative_to(DATA.resolve()) or asset.stat().st_size>MAX_FILE_BYTES:raise GeometryError('Expanded source asset escapes catalog or exceeds its bound.')
    raw=asset.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise GeometryError('Expanded catalog source SHA256 differs from its attributed manifest.')
    # The protected importer preserves source face/cell order. No fallback hull.
    try:model=parse_off(raw.decode('utf-8-sig'),entry['name'])
    except GeometryError as error:raise GeometryError(f'{entry["name"]}: retained source importer diagnosis: {error}') from error
    if [len(model[k]) for k in ('vertices','edges','faces','cells')]!=entry['counts']:raise GeometryError('Expanded source incidence differs from retained count record.')
    model['metadata'].update({k:deepcopy(entry[k]) for k in ('key','family','aliases','sourceClassification','classificationVerified')})
    model['metadata']['source']='Miratope MIT attributed source catalog'
    model['metadata']['sourceAsset']={k:deepcopy(entry[k]) for k in ('sourcePath','sha256','gitBlobId','gitHead','collection','catalogStatus')}
    model['metadata']['sourceAsset']['mathematicalClassification']='Unverified supplied directory/name labels; strict numerical import establishes incidence compatibility only.'
    model['metadata']['sourceAsset']['chirality']={'status':'unresolved','construction':'Literal supplied coordinates, no reflection or orientation normalization.'}
    model['provenance']['expandedCatalogSource']={'provider':'Miratope authors','license':'MIT; retained LICENSE','sourceUrl':'https://github.com/galoomba1/miratope-rs','sourcePath':entry['sourcePath'],'sha256':entry['sha256'],'gitHead':entry['gitHead'],'gitBlobId':entry['gitBlobId']}
    return model
