"""Bounded document information and an optional OFF comment envelope."""
from copy import deepcopy
import json
from .geometry import GeometryError

OFF_DOCUMENT_PREFIX = '# Polytope Laboratory document: '


def validate_metadata(metadata):
    if type(metadata) is not dict or any(key in metadata and type(metadata[key]) is not str for key in ('title', 'author', 'reference', 'description', 'license', 'source')):
        raise GeometryError('Model information needs text fields in a JSON object.')
    if 'custom' in metadata and type(metadata['custom']) is not dict:
        raise GeometryError('Additional model information needs a JSON object.')
    if 'tags' in metadata and (type(metadata['tags']) is not list or len(metadata['tags']) > 128 or any(type(tag) is not str or len(tag) > 128 for tag in metadata['tags'])):
        raise GeometryError('Model information needs at most 128 text tags of up to 128 characters.')
    try:
        encoded = json.dumps(metadata, allow_nan=False, ensure_ascii=False).encode('utf-8')
    except (ValueError, TypeError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Model information must contain finite JSON values and valid text.') from exc
    if len(encoded) > 131072:
        raise GeometryError('Model information exceeds 128 KiB.')
    return metadata


def document_comment(metadata, notes):
    validate_metadata(metadata)
    if type(notes) is not str or len(notes.encode('utf-8')) > 1024*1024:
        raise GeometryError('Document notes exceed the export limit or are not text.')
    return OFF_DOCUMENT_PREFIX + json.dumps({'metadata': metadata, 'notes': notes}, allow_nan=False, ensure_ascii=True, separators=(',', ':'))


def read_document_comment(text):
    record = None
    for line in text.splitlines():
        if not line.strip().startswith(OFF_DOCUMENT_PREFIX):
            continue
        if record is not None:
            raise GeometryError('OFF has duplicate Polytope Laboratory document comments.')
        try:
            record = json.loads(line.strip()[len(OFF_DOCUMENT_PREFIX):])
        except (ValueError, RecursionError) as exc:
            raise GeometryError('Invalid Polytope Laboratory OFF document comment.') from exc
        if type(record) is not dict or set(record) != {'metadata', 'notes'}:
            raise GeometryError('Invalid Polytope Laboratory OFF document fields.')
        document_comment(record['metadata'], record['notes'])
    return deepcopy(record)
