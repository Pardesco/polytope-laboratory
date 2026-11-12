"""Read-only refinement receipts computed through the ordinary recipe workflow."""

from copy import deepcopy

from .geometry import GeometryError, identity
from .compounds import _colors
from .recipes import run_recipe

OPERATIONS = {'subdivide-faces', 'subdivide-edges', 'conway'}


def inheritance_receipt(source, state, operation, parameters):
    before, after = source['model'], state['model']
    parents = [None] * len(after['faces'])
    if operation == 'subdivide-edges':
        parents = list(range(len(before['faces'])))
    elif operation == 'conway':
        parents = after.get('metadata', {}).get('conway', {}).get('sourceFaceIds', parents)
    elif operation == 'subdivide-faces':
        info = after.get('metadata', {}).get('faceSubdivision', {})
        if info.get('sourceFingerprint') == identity(before):
            parents = info['sourceFaceIds']
    if len(parents) != len(after['faces']) or any(
        type(i) is not int or not 0 <= i < len(before['faces']) for i in parents if i is not None
    ):
        raise GeometryError('Subdivision face lineage does not reconstruct.')
    old, new = _colors(before, 'faces'), _colors(after, 'faces')
    owners = []
    for index, parent in enumerate(parents):
        if new[index] is not None and (parent is None or new[index] != old[parent]):
            raise GeometryError('Refinement color has no verified source face owner.')
        owners.append(parent if new[index] is not None else None)
    transfer = state['view'].get('elementContentTransfer', {})
    return {
        'schemaVersion': 1,
        'scenarioId': 'con-08-subdivision-inheritance',
        'operation': operation,
        'parameters': deepcopy(parameters),
        'sourceFingerprint': identity(before),
        'resultFingerprint': identity(after),
        'counts': {key: len(after[key]) for key in ('vertices', 'edges', 'faces', 'cells')},
        'sourceFaceIds': parents,
        'faceColorSourceIds': owners,
        'sourceColoredFaceIds': [i for i, color in enumerate(old) if color is not None],
        'detachedColorFaceIds': [i for i, color in enumerate(old) if color is not None and i not in owners],
        'mappedContent': deepcopy(transfer.get('mapped', [])),
        'detachedContent': deepcopy(transfer.get('unmapped', [])),
        'activeContentCount': len(state['view'].get('elementAnnotations', {}).get('entries', [])),
        'retainedArchiveCount': len(state['view'].get('elementContentDetached', [])),
        'contentPolicy': 'No automatic label/texture replication. Unmapped content retains its complete source, notes and units in the detached archive and source history.',
        'numericPolicy': 'Float64 approximate. Literal refinement does not assert equal edges or regular faces.',
    }


def preview_inheritance(request, dispatcher):
    params = request.get('params', {})
    if (
        type(params) is not dict
        or set(params) != {'document', 'operation', 'parameters'}
        or type(params['operation']) is not str
        or params['operation'] not in OPERATIONS
    ):
        raise GeometryError('Choose face subdivision, edge subdivision or Conway notation for an inheritance preview.')
    document = params['document']
    result = run_recipe(document, params['operation'], params['parameters'], dispatcher)
    source, state = document['states'][document['cursor']], result['states'][result['cursor']]
    return {'state': state, 'receipt': inheritance_receipt(source, state, params['operation'], params['parameters'])}
