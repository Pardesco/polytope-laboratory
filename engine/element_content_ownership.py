"""Explicit content ownership across native geometry operations.

Only proven element correspondence transfers content. Unmapped entries remain
as source-bound detached content, including original units/notes, and can be
recovered from the retained history. No proximity matching or hull inference.
"""
from copy import deepcopy

from .geometry import GeometryError, canonical_cycle
from . import element_annotations as content

INDEX_OPERATIONS = {'transform', 'scale-reference', 'spring-relaxation', 'sphere-project', 'reflect-source'}
RETAINED_OPERATIONS = {'facet', 'facet-adopt'}
MAX_DETACHED = 8
FIELDS = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}


def _prune(document, entries):
    result = deepcopy(document)
    result['entries'] = deepcopy(entries)
    used = {entry['texture']['asset'] for entry in entries if entry['texture'] is not None}
    result['assets'] = {key: value for key, value in result['assets'].items() if key in used}
    return result


def correspondence(source, result, operation):
    maps = {kind: {} for kind in FIELDS}
    if (source['dimension'], source['embeddingDimension']) != (result['dimension'], result['embeddingDimension']):
        return maps
    if operation in INDEX_OPERATIONS:
        if (len(source['vertices']) != len(result['vertices']) or source['edges'] != result['edges']
            or len(source['faces']) != len(result['faces'])
            or any(canonical_cycle(a) != canonical_cycle(b) for a, b in zip(source['faces'], result['faces']))
            or source['cells'] != result['cells']):
            raise GeometryError('Index-preserving content operation changed ordered element incidence.')
        return {kind: {i: i for i in range(len(source[field]))} for kind, field in FIELDS.items()}
    if operation not in RETAINED_OPERATIONS:
        return maps
    # Faceting must explicitly retain literal source vertex IDs and coordinates.
    if source['vertices'] != result['vertices']:
        return maps
    maps['vertex'] = {i: i for i in range(len(source['vertices']))}
    for kind, key in [('edge', lambda cycle: tuple(sorted(cycle))), ('face', canonical_cycle)]:
        source_keys, result_keys = {}, {}
        for i, cycle in enumerate(source[FIELDS[kind]]):
            source_keys.setdefault(key(cycle), []).append(i)
        for i, cycle in enumerate(result[FIELDS[kind]]):
            result_keys.setdefault(key(cycle), []).append(i)
        for value, ids in source_keys.items():
            targets = result_keys.get(value, [])
            if len(ids) == len(targets) == 1:
                maps[kind][ids[0]] = targets[0]
    # Cells own literal face references; all faces must have proven maps.
    result_cells = {}
    for i, cell in enumerate(result['cells']):
        result_cells.setdefault(tuple(sorted(cell)), []).append(i)
    source_cells = {}
    for i, cell in enumerate(source['cells']):
        if all(face in maps['face'] for face in cell):
            value = tuple(sorted(maps['face'][face] for face in cell))
            source_cells.setdefault(value, []).append(i)
    for value, ids in source_cells.items():
        targets = result_cells.get(value, [])
        if len(ids) == len(targets) == 1:
            maps['cell'][ids[0]] = targets[0]
    return maps


def transfer_content_state(source, state, operation):
    """Return a detached result state; caller retains source and prior history."""
    result = deepcopy(state)
    inherited = source['view'].get('elementContentDetached')
    if inherited:
        result['view']['elementContentDetached'] = deepcopy(inherited)
    else:
        result['view'].pop('elementContentDetached', None)
    original = source['view'].get('elementAnnotations')
    if original is None:
        result['view'].pop('elementAnnotations', None)
        result['view'].pop('elementContentTransfer', None)
        return result
    content.validate_document(original, source['model'])
    maps = correspondence(source['model'], state['model'], operation)
    entries, unmapped, mapped = [], [], []
    for entry in original['entries']:
        target = maps[entry['kind']].get(entry['index'])
        if target is None:
            unmapped.append(entry)
        else:
            moved = deepcopy(entry); moved['index'] = target; entries.append(moved)
            mapped.append({'kind': entry['kind'], 'sourceIndex': entry['index'], 'resultIndex': target})
    current = content.new_document(state['model'])
    current.update(entries=entries, assets=_prune(original, entries)['assets'])
    content.validate_document(current, state['model'])
    view = result['view']
    view['elementAnnotations'] = current
    archives = deepcopy(source['view'].get('elementContentDetached', []))
    if unmapped:
        if len(archives) >= MAX_DETACHED:
            raise GeometryError('Detached content limit reached; retain the source document or remove explicitly before this operation.')
        archives.append({'operation': operation, 'reason': 'No verified element correspondence for these entries.',
            'document': _prune(original, unmapped), 'sourceNotes': source.get('notes', ''),
            'sourceCoordinateUnit': source['view'].get('coordinateUnit', 'model')})
    if archives:
        view['elementContentDetached'] = archives
    else:
        view.pop('elementContentDetached', None)
    view['elementContentTransfer'] = {'version': 1, 'operation': operation,
        'sourceDocument': deepcopy(original), 'sourceNotes': source.get('notes', ''),
        'sourceCoordinateUnit': source['view'].get('coordinateUnit', 'model'),
        'mapped': mapped, 'unmapped': [{'kind': e['kind'], 'sourceIndex': e['index']} for e in unmapped]}
    for field in ('netLayout', 'netPages'):
        result.pop(field, None)
    validate_content_ownership(state['model'], view)
    return result


def validate_content_ownership(model, view):
    archives = view.get('elementContentDetached', [])
    if type(archives) is not list or len(archives) > MAX_DETACHED:
        raise GeometryError('Detached element content exceeds its retained-source limit.')
    content._json(archives, content.MAX_DOCUMENT)
    keys = {'operation', 'reason', 'document', 'sourceNotes', 'sourceCoordinateUnit'}
    for archive in archives:
        if type(archive) is not dict or set(archive) != keys or type(archive['operation']) is not str or type(archive['reason']) is not str:
            raise GeometryError('Malformed detached content record.')
        content._string(archive['sourceNotes'], 128 * 1024)
        if archive['sourceCoordinateUnit'] not in ('model', 'mm', 'cm', 'm', 'in', 'ft'):
            raise GeometryError('Detached content units are unsupported.')
        document = archive['document']
        if type(document) is not dict or type(document.get('source')) is not dict:
            raise GeometryError('Detached content requires its complete source.')
        content.validate_document(document, document['source'])
    receipt = view.get('elementContentTransfer')
    if receipt is None:
        return
    required = {'version', 'operation', 'sourceDocument', 'sourceNotes', 'sourceCoordinateUnit', 'mapped', 'unmapped'}
    if type(receipt) is not dict or set(receipt) != required or type(receipt['version']) is not int or receipt['version'] != 1 or type(receipt['operation']) is not str:
        raise GeometryError('Malformed element correspondence receipt.')
    content._json(receipt, content.MAX_DOCUMENT)
    content._string(receipt['sourceNotes'], 128 * 1024)
    if type(receipt['sourceCoordinateUnit']) is not str or receipt['sourceCoordinateUnit'] not in ('model', 'mm', 'cm', 'm', 'in', 'ft'):
        raise GeometryError('Content correspondence source units are unsupported.')
    document = receipt['sourceDocument']
    if type(document) is not dict or type(document.get('source')) is not dict:
        raise GeometryError('Content correspondence requires its complete original source.')
    content.validate_document(document, document['source'])
    maps = correspondence(document['source'], model, receipt['operation'])
    mapped, unmapped = [], []
    for entry in document['entries']:
        target = maps[entry['kind']].get(entry['index'])
        if target is None:
            unmapped.append({'kind': entry['kind'], 'sourceIndex': entry['index']})
        else:
            mapped.append({'kind': entry['kind'], 'sourceIndex': entry['index'], 'resultIndex': target})
    if mapped != receipt['mapped'] or unmapped != receipt['unmapped']:
        raise GeometryError('Content correspondence receipt does not reconstruct.')


def verify_replayed_content(source, computed, node):
    """Bind recomputed ownership to actual parent, rather than cached maps."""
    from .element_content_workflow import semantic
    expected = transfer_content_state(source, computed, node['op'])
    for field in ('elementAnnotations', 'elementContentDetached', 'elementContentTransfer'):
        if semantic(expected['view'].get(field)) != semantic(node['snapshot']['view'].get(field)):
            raise GeometryError('Geometry replay element content ownership does not reconstruct from its actual parent.')


def content_source_changed(current, recorded):
    """Reseed literal content, notes and units changed since history recording."""
    from .element_content_workflow import semantic
    def owned(state):
        view = state['view']
        return {'notes': state.get('notes', ''), 'unit': view.get('coordinateUnit', 'model'),
            **{field: view.get(field) for field in
               ('elementAnnotations', 'elementContentDetached', 'elementContentTransfer')}}
    return semantic(owned(current)) != semantic(owned(recorded))
