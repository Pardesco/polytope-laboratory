"""Pure JSON hyperbolic operations; dispatch wiring belongs to integration."""

from collections import OrderedDict
import hashlib
import json
import math
import time
import sys

import numpy as np

from .geometry import GeometryError
from .hyperbolic import (
    DEVELOPMENT_GATE,
    DEVELOPMENT_RELATIVE_GATE,
    J,
    local_analysis,
    preset,
    regular_cell_template,
    matrix_discrepancy,
    point_discrepancy,
    record_residual,
)
from .hyperbolic_orbit import Development, WORD_LIMIT, budget_options

ALGORITHM_VERSION = '1'
MESSAGE_LIMIT = 4 * 1024 * 1024
CURSOR_LIMIT = 1024 * 1024
CACHE_LIMIT = 64 * 1024 * 1024
OPERATIONS = ('hyperbolic-create', 'hyperbolic-patch', 'hyperbolic-analyze', 'hyperbolic-validate')
_CACHE = OrderedDict()
_CACHE_BYTES = 0


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _hash(value):
    return hashlib.sha256(_json(value)).hexdigest()


def _bounded_json(value, limit=MESSAGE_LIMIT):
    stack = [(value, 0)]
    nodes = 0
    size = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > 300000 or depth > 40:
            raise GeometryError('Hyperbolic JSON exceeds nesting/node limits.')
        if isinstance(item, dict):
            if len(item) > 10000 or any(not isinstance(k, str) or len(k) > 256 for k in item):
                raise GeometryError('Oversized or invalid JSON object.')
            size += sum(len(k) + 4 for k in item)
            stack.extend((v, depth + 1) for v in item.values())
        elif isinstance(item, list):
            if len(item) > 50000:
                raise GeometryError('Oversized hyperbolic JSON array.')
            size += len(item)
            stack.extend((v, depth + 1) for v in item)
        elif isinstance(item, str):
            size += len(item)
        elif type(item) in (int, float):
            if abs(item) > 1e100 or not math.isfinite(item):
                raise GeometryError('Hyperbolic input must contain finite bounded numbers.')
            size += 1
        elif item is None or type(item) is bool:
            size += 1
        else:
            raise GeometryError('Hyperbolic parameters must be JSON values.')
        if size > limit:
            raise GeometryError(f'Hyperbolic JSON exceeds {limit} bytes.')
    if len(_json(value)) > limit:
        raise GeometryError(f'Hyperbolic JSON exceeds {limit} UTF-8 bytes.')


def _source(value):
    if not isinstance(value, dict) or value.get('type') != 'honeycomb' or set(value) - {'type', 'pqr', 'rings'}:
        raise GeometryError('Expected a regular honeycomb source descriptor.')
    pqr = preset(value.get('pqr'))
    rings = value.get('rings', [1, 0, 0, 0])
    if (
        not isinstance(rings, list)
        or len(rings) != 4
        or any(type(x) is not int for x in rings)
        or rings != [1, 0, 0, 0]
    ):
        raise GeometryError('Only regular rings 1000 are available; uniform ringings are deferred.')
    return {'type': 'honeycomb', 'pqr': list(pqr), 'rings': rings}


def _anchor(value, face_count):
    value = {'word': [], 'observerMatrix': np.eye(4).ravel().tolist()} if value is None else value
    if not isinstance(value, dict) or set(value) - {'word', 'observerMatrix'}:
        raise GeometryError('Invalid anchor fields.')
    word = value.get('word', [])
    if (
        not isinstance(word, list)
        or len(word) > WORD_LIMIT
        or any(type(x) is not int or not 0 <= x < face_count for x in word)
    ):
        raise GeometryError('Anchor word must have at most 256 valid face generators; rebase/chunk the address.')
    flat = value.get('observerMatrix', np.eye(4).ravel().tolist())
    if (
        not isinstance(flat, list)
        or len(flat) != 16
        or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 1e4 for x in flat)
    ):
        raise GeometryError('observerMatrix must contain 16 finite bounded row-major values.')
    matrix = np.asarray(flat, dtype=np.float64).reshape(4, 4)
    if matrix[0, 0] < 1 or np.linalg.det(matrix) <= 0 or np.max(np.abs(matrix.T @ J @ matrix - J)) > DEVELOPMENT_GATE:
        raise GeometryError('observerMatrix must be future pointing, proper and Lorentz orthonormal within 1e-8.')
    from .hyperbolic_orbit import repair_frame

    return {'word': list(word), 'observerMatrix': repair_frame(matrix, 0).ravel().tolist()}


def _options(params, source):
    unknown = set(params) - {'source', 'epoch', 'anchor', 'radius', 'depth', 'budget', 'cursor', 'mode', 'descriptor'}
    if unknown:
        raise GeometryError(f'Unknown hyperbolic parameter: {sorted(unknown)[0]}.')
    radius, depth = params.get('radius', 2), params.get('depth', 3)
    if type(radius) not in (int, float) or not math.isfinite(radius) or not 0 <= radius <= 5:
        raise GeometryError('Radius must be finite and in 0..5 hyperbolic units.')
    if type(depth) is not int or not 0 <= depth <= 12:
        raise GeometryError('Cell depth must be an integer in 0..12.')
    radius = min(radius, 2.0)
    depth = min(depth, 5 if source['pqr'] == [4, 3, 5] else 3)
    mode = params.get('mode', 'radius')
    if depth == 0:
        mode = 'complete-depth'
    if mode not in ('radius', 'complete-depth'):
        raise GeometryError('Mode must be radius or complete-depth.')
    epoch = params.get('epoch', 0)
    if not ((type(epoch) is int and 0 <= epoch < 2**53) or (isinstance(epoch, str) and 0 < len(epoch) <= 128)):
        raise GeometryError('Epoch must be a short nonempty string or nonnegative safe integer.')
    budget = budget_options(params.get('budget'))
    anchor = _anchor(params.get('anchor'), len(regular_cell_template(source['pqr'])['faces']))
    return radius, depth, mode, epoch, budget, anchor


def _bindings(source, anchor, radius, depth, mode, budget):
    return {
        'sourceHash': _hash({'source': source, 'algorithmVersion': ALGORITHM_VERSION}),
        'anchorHash': _hash(anchor),
        'budgetHash': _hash({'radius': radius, 'depth': depth, 'mode': mode, 'budget': budget}),
    }


def _cursor(checkpoint, bindings, epoch):
    cursor = {'version': 1, **bindings, 'epoch': epoch, 'state': checkpoint}
    cursor['checksum'] = _hash(cursor)
    return cursor


def _read_cursor(cursor, bindings, epoch):
    _bounded_json(cursor, CURSOR_LIMIT)
    if not isinstance(cursor, dict) or set(cursor) != {
        'version',
        'sourceHash',
        'anchorHash',
        'budgetHash',
        'epoch',
        'state',
        'checksum',
    }:
        raise GeometryError('Invalid cursor envelope.')
    payload = {k: v for k, v in cursor.items() if k != 'checksum'}
    if (
        type(cursor['version']) is not int
        or cursor['version'] != 1
        or any(cursor[k] != v for k, v in bindings.items())
        or cursor['epoch'] != epoch
        or cursor['checksum'] != _hash(payload)
    ):
        raise GeometryError('Cursor checksum/source/anchor/budget/epoch binding failed.')
    return cursor['state']


def clear_cache():
    global _CACHE_BYTES
    _CACHE.clear()
    _CACHE_BYTES = 0


def cache_info():
    return {'entries': len(_CACHE), 'bytes': _CACHE_BYTES, 'limit': CACHE_LIMIT}


def _entry_bytes(value):
    return len(value) if isinstance(value, bytes) else value[1]


def _cache_pop(key):
    global _CACHE_BYTES
    value = _CACHE.pop(key)
    _CACHE_BYTES -= _entry_bytes(value)
    return value


def _cache_put(key, value):
    global _CACHE_BYTES
    if key in _CACHE:
        _cache_pop(key)
    size = _entry_bytes(value)
    while _CACHE and _CACHE_BYTES + size > CACHE_LIMIT:
        _cache_pop(next(iter(_CACHE)))
    if size <= CACHE_LIMIT:
        _CACHE[key] = value
        _CACHE_BYTES += size


def _development_bytes(development):
    seen, stack, total = set(), [development.__dict__], sys.getsizeof(development)
    while stack:
        item = stack.pop()
        if id(item) in seen:
            continue
        seen.add(id(item))
        total += sys.getsizeof(item)
        if isinstance(item, dict):
            stack.extend(item.keys())
            stack.extend(item.values())
        elif isinstance(item, (list, tuple, set)):
            stack.extend(item)
        elif isinstance(item, np.ndarray) and item.base is not None:
            stack.append(item.base)
    return total


def _remember(key, result):
    encoded = _json(result)
    if len(encoded) > MESSAGE_LIMIT:
        raise GeometryError('Hyperbolic response exceeds the 4 MiB message limit; reduce pageSize.')
    _cache_put(key, encoded)
    return json.loads(encoded)


def _patch(params, source):
    started = time.monotonic()
    radius, depth, mode, epoch, budget, anchor = _options(params, source)
    bindings = _bindings(source, anchor, radius, depth, mode, budget)
    bindings['budgetHash'] = _hash(
        {'effective': bindings['budgetHash'], 'radius': params.get('radius', 2), 'depth': params.get('depth', 3)}
    )
    state_key = 'development:' + _hash({**bindings, 'epoch': epoch})
    development = Development(source['pqr'], depth, radius, mode, np.asarray(anchor['observerMatrix']).reshape(4, 4))
    cursor = params.get('cursor')
    if cursor is not None:
        checkpoint = _read_cursor(cursor, bindings, epoch)
        if state_key in _CACHE:
            cached, _ = _cache_pop(state_key)
            if (
                isinstance(checkpoint, dict)
                and type(checkpoint.get('candidates')) is int
                and cached.candidates <= checkpoint['candidates']
            ):
                development = cached
        development.restore(checkpoint, budget, deadline=time.monotonic() + 60)
    # Untrusted replay has its own bounded budget; page time starts afterwards.
    started = time.monotonic()
    first = True

    def clock():
        nonlocal first
        if first:
            first = False
            return started
        return time.monotonic()

    page = development.page(budget, clock=clock)
    checkpoint = page.pop('checkpoint')
    next_cursor = _cursor(checkpoint, bindings, epoch) if checkpoint else None
    if next_cursor is not None and len(_json(next_cursor)) > CURSOR_LIMIT:
        next_cursor = None
        page['coverage'].update(stopReason='cursorLimit', resumable=False, nonresumableTruncation=True)
    if next_cursor is not None:
        _cache_put(state_key, (development, _development_bytes(development)))
    return {
        'sourceHash': bindings['sourceHash'],
        'epoch': epoch,
        'anchorHash': bindings['anchorHash'],
        'templates': [development.template],
        **page,
        'nextCursor': next_cursor,
    }


def _validate(descriptor, source):
    if (
        not isinstance(descriptor, dict)
        or descriptor.get('kind') != 'hyperbolic-space'
        or descriptor.get('source') != source
    ):
        raise GeometryError('Expected a matching hyperbolic-space descriptor.')
    if (
        descriptor.get('dimension') != 3
        or descriptor.get('coordinateDimension') != 4
        or descriptor.get('curvature') != -1
        or descriptor.get('algorithmVersion') != ALGORITHM_VERSION
    ):
        raise GeometryError('Unsupported hyperbolic dimension, curvature or algorithm version.')
    patch = descriptor.get('anchorPatch')
    if not isinstance(patch, dict):
        raise GeometryError('Descriptor requires a bounded anchorPatch.')
    _bounded_json(patch, CURSOR_LIMIT)
    expected = regular_cell_template(source['pqr'])
    if patch.get('templates') != [expected]:
        raise GeometryError('Retained template does not match the regular Wythoff template.')
    instances = patch.get('instances')
    if not isinstance(instances, list) or len(instances) > 256:
        raise GeometryError('Retained anchor must contain at most 256 complete instances.')
    d = Development(source['pqr'])
    ids = set()
    retained = {}
    for instance in instances:
        if (
            not isinstance(instance, dict)
            or type(instance.get('id')) is not int
            or not 0 <= instance['id'] < 4096
            or instance['id'] in ids
            or instance.get('type') != 0
        ):
            raise GeometryError('Invalid retained instance identity/type.')
        ids.add(instance['id'])
        word = instance.get('word')
        if (
            not isinstance(word, list)
            or len(word) > WORD_LIMIT
            or any(type(f) is not int or not 0 <= f < len(d.generators) for f in word)
        ):
            raise GeometryError('Invalid retained instance word.')
        flat = instance.get('matrix')
        if (
            not isinstance(flat, list)
            or len(flat) != 16
            or any(type(x) not in (int, float) or abs(x) > 1e4 for x in flat)
        ):
            raise GeometryError('Invalid retained instance matrix.')
        matrix = np.asarray(flat, dtype=float).reshape(4, 4)
        reconstructed = d._transform(word)
        reconstruction_error = matrix_discrepancy(matrix, reconstructed)
        if reconstruction_error['relative'] > DEVELOPMENT_RELATIVE_GATE:
            raise GeometryError(f'Retained matrix does not match its word: {reconstruction_error}.')
        record_residual(d.residuals, 'matrixReconstruction', reconstruction_error)
        d._checked(matrix, word)
        retained[instance['id']] = matrix
        if instance.get('templatePermutation', list(range(len(d.vertices)))) != list(range(len(d.vertices))):
            raise GeometryError('Unsupported retained template permutation.')
        if instance.get('quotientState') is not None:
            raise GeometryError('Honeycomb instances cannot carry quotient states.')
    expected_source_hash = _hash({'source': source, 'algorithmVersion': ALGORITHM_VERSION})
    if patch.get('sourceHash') != expected_source_hash:
        raise GeometryError('Retained source hash does not match the descriptor.')
    rows = patch.get('neighbors')
    if not isinstance(rows, list) or len(rows) > 8192:
        raise GeometryError('Invalid retained neighbor array.')
    face_count = len(d.template['faces'])
    vertex_count = len(d.vertices)
    edge_set = {tuple(edge) for edge in d.template['edges']}
    seen_rows = set()
    for row in rows:
        if not isinstance(row, dict):
            raise GeometryError('Invalid retained neighbor row.')
        cell, face = row.get('cell'), row.get('face')
        target, to_face = row.get('toCell'), row.get('toFace')
        if (
            type(cell) is not int
            or not 0 <= cell < 4096
            or type(face) is not int
            or not 0 <= face < face_count
            or (cell, face) in seen_rows
        ):
            raise GeometryError('Invalid or duplicate retained neighbor identity.')
        seen_rows.add((cell, face))
        permutation = row.get('vertexPermutation')
        if target is None:
            if to_face is not None or permutation is not None or row.get('status') not in ('unexpanded', 'outsideBall'):
                raise GeometryError('Unexpanded neighbor must be explicit.')
            continue
        if (
            type(target) is not int
            or not 0 <= target < 4096
            or type(to_face) is not int
            or not 0 <= to_face < face_count
        ):
            raise GeometryError('Invalid retained target cell/face.')
        if (
            not isinstance(permutation, list)
            or len(permutation) != vertex_count
            or any(type(v) is not int for v in permutation)
            or sorted(permutation) != list(range(vertex_count))
        ):
            raise GeometryError('Invalid retained vertex correspondence.')
        if any(tuple(sorted((permutation[a], permutation[b]))) not in edge_set for a, b in edge_set):
            raise GeometryError('Retained correspondence does not preserve template edges.')
        if {permutation[v] for v in d.template['faces'][face]} != set(d.template['faces'][to_face]):
            raise GeometryError('Retained correspondence does not preserve the shared face.')
        if cell in retained and target in retained:
            a = (retained[cell] @ d.generators[face] @ d.vertices.T).T
            b = (retained[target] @ d.vertices[permutation].T).T
            correspondence_error = point_discrepancy(a, b)
            if correspondence_error['relative'] > DEVELOPMENT_RELATIVE_GATE:
                raise GeometryError(
                    f'Retained neighbor correspondence disagrees with geometry: {correspondence_error}.'
                )
            record_residual(d.residuals, 'neighborDiscrepancy', correspondence_error)
    # Receipt and boundary claims are recomputed rather than trusted.
    return {
        'valid': True,
        'approximate': True,
        'retainedInstances': len(instances),
        'residuals': d.residuals,
        'analysis': local_analysis(source['pqr']),
        'coverageReceiptTrusted': False,
    }


def handle(op, params, *, manifold_handler=None):
    """Return one JSON result. Optional manifold callback is an integration seam."""
    if op not in OPERATIONS:
        raise GeometryError('Unsupported hyperbolic operation.')
    if not isinstance(params, dict):
        raise GeometryError('Hyperbolic params must be an object.')
    _bounded_json(params)
    source_value = params.get('source')
    if isinstance(source_value, dict) and source_value.get('type') == 'manifold':
        if manifold_handler is None:
            raise GeometryError(
                'Manifold routing is not installed; integration must supply the pinned small-cover handler.'
            )
        result = manifold_handler(op, params)
        _bounded_json(result)
        return result
    source = _source(source_value)
    _options(params, source)
    key = _hash({'op': op, 'params': params, 'algorithmVersion': ALGORITHM_VERSION})
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return json.loads(_CACHE[key])
    if op == 'hyperbolic-patch':
        result = _patch(params, source)
    elif op == 'hyperbolic-create':
        if params.get('cursor') is not None:
            raise GeometryError('Create starts a new generation; cursors belong to patch.')
        page = _patch(params, source)
        # Persist bounded geometry only; disposable continuation is returned in
        # the anchor page for the renderer to move into its exploration cache.
        if len(_json(page)) > CURSOR_LIMIT:
            raise GeometryError('Anchor patch exceeds 1 MiB; reduce pageSize.')
        result = {
            'kind': 'hyperbolic-space',
            'dimension': 3,
            'coordinateDimension': 4,
            'name': 'Regular honeycomb {' + ','.join(map(str, source['pqr'])) + '}',
            'source': source,
            'curvature': -1,
            'algorithmVersion': ALGORITHM_VERSION,
            'anchorPatch': page,
            'provenance': {
                'coordinateConvention': 'time-first',
                'coordinateArithmetic': 'float64 approximation',
                'construction': 'finite Wythoff stabilizers',
            },
        }
    elif op == 'hyperbolic-analyze':
        result = local_analysis(source['pqr'])
    else:
        result = _validate(params.get('descriptor'), source)
    return _remember(key, result)
