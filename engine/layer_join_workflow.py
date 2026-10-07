"""Strict JSON transport for reproducible convex parallel-layer operations."""
from .geometry import GeometryError
from .history import _json_bytes
from .segmentotopes import (convex_layer_join, point_source, edge_source,
                           MAX_PAYLOAD_BYTES)


def run_layer_join(base, parameters, *, fit=False):
    if type(parameters) is not dict:
        raise GeometryError('Parallel layer parameters must be an object.')
    try:
        _json_bytes(parameters, MAX_PAYLOAD_BYTES)
    except (UnicodeError, RecursionError, OverflowError) as exc:
        raise GeometryError('Parallel layer parameters require bounded finite UTF-8 JSON data.') from exc
    allowed = {'top', 'height', 'top_matrix', 'top_translation', 'base_matrix', 'base_translation'}
    if fit:
        allowed.remove('height')
    unknown = set(parameters)-allowed
    if unknown:
        raise GeometryError('Unknown parallel layer parameters: '+', '.join(sorted(unknown)))
    if 'top' not in parameters:
        raise GeometryError('Choose a top layer source.')
    top = parameters['top']
    if type(top) is dict and 'kind' in top:
        kind = top['kind']
        required = {'kind', 'source_id', 'coordinates'} if kind == 'point' else {'kind', 'source_id', 'start', 'end'} if kind == 'edge' else None
        if required is None or set(top) != required:
            raise GeometryError('A point or edge layer specification requires exactly its coordinates and stable source_id.')
        if type(top['source_id']) is not str or not top['source_id']:
            raise GeometryError('Point/edge layer source_id must be a stable nonempty string, retained for replay.')
        top = point_source(top['coordinates'], source_id=top['source_id']) if kind == 'point' else edge_source(top['start'], top['end'], source_id=top['source_id'])
    options = {key: value for key, value in parameters.items() if key != 'top'}
    if fit:
        from .strict_layer_fit import fit_strict_layer_join
        return fit_strict_layer_join(base, top, **options)
    return convex_layer_join(base, top, **options)
