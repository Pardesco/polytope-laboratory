"""Strict convex-core dispatch and immutable full-attribute native history.

Registration belongs to the application. Native ancestors are replayed through
source-only temporary graphs; the server dependency is deliberately lazy.
"""
from copy import deepcopy
import json
import uuid

from .augmentation_workflow import bounded_bytes, checked_document, equivalent_json
from .compounds import _check_source
from .convex_core import convex_core, verify_convex_core_evidence, VERSION, LIMITS
from .geometry import GeometryError, identity
from .history import (NUMERIC_POLICY, REPLAY_OPERATIONS, MAX_NODE_BYTES,
    canonical_model, create_history, record_operation, record_source,
    replay_history, validate_document_history, validate_history)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION = 'convex-core'
MAX_SAFE_INTEGER = 2**53-1


def native_dispatch(request):
    from .server import dispatch
    return dispatch(request)


def _portable_json(value, limit):
    detached = json.loads(bounded_bytes(value, limit))
    stack = [detached]
    while stack:
        item = stack.pop()
        if type(item) is dict:
            stack.extend(item.values())
        elif type(item) is list:
            stack.extend(item)
        elif (type(item) is float and item.is_integer()
              and MAX_SAFE_INTEGER < abs(item) < 1e21):
            # ECMAScript emits these floats as unsafe decimal integer tokens.
            # Larger scientific float spellings (e.g. 1e99) stay portable.
            raise GeometryError('Convex core decimal integer-valued float exceeds the portable JSON safe-integer domain; use strings for exact attributes.')
    return equivalent_json(detached, limit)


def parameters(value):
    bounded_bytes(value, LIMITS['inputBytes'])
    if (type(value) is not dict or 'center' not in value
            or set(value)-{'center', 'tolerance', 'color_policy'}):
        raise GeometryError('Convex core parameters require center and only optional tolerance/color_policy.')
    if type(value['center']) is not list or len(value['center']) != 3:
        raise GeometryError('Convex core center must be a literal three-coordinate array.')
    return _portable_json(value, LIMITS['inputBytes'])


def dispatch_convex_core(request):
    """Return a validated Model for the strict convex-core 0.1.0 envelope."""
    try:
        bounded_bytes(request, MAX_NODE_BYTES)
        if (type(request) is not dict or not {'op', 'model', 'params'} <= set(request)
                or set(request)-{'op', 'model', 'params', 'id', 'algorithmVersion'}
                or request['op'] != OPERATION):
            raise GeometryError('Convex core request requires op/model/params and only correlation/version fields.')
        if request.get('algorithmVersion', VERSION) != VERSION:
            raise GeometryError('Convex core algorithm version is unsupported; retained snapshots remain readable.')
        correlation = request.get('id')
        if not (correlation is None or type(correlation) is str and 1 <= len(correlation) <= 128
                or type(correlation) is int and 0 <= correlation <= MAX_SAFE_INTEGER):
            raise GeometryError('Convex core correlation ID is outside the native envelope domain.')
        bounded_bytes(request['model'], LIMITS['inputBytes'])
        _check_source(request['model'])  # Before normalization: no float/bool incidence repair.
        args = parameters(request['params'])
        source = _portable_json(request['model'], LIMITS['inputBytes'])
        model = convex_core(source, **args)
        # Gate the output's historical snapshots, exact lineage and numerical
        # evidence under the same cross-language spelling policy as its input.
        return _portable_json(model, LIMITS['outputBytes'])
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError,
            UnicodeError, RecursionError) as exc:
        raise GeometryError('Malformed convex core request: '+str(exc)) from exc


def run_convex_core(document, params, label='Convex core'):
    args = parameters(params)
    if type(label) is not str or not 1 <= len(label) <= 256:
        raise GeometryError('Convex core state label must be a bounded nonempty string.')
    result = checked_document(document)
    graph = validate_document_history(result)
    if graph is None:
        graph = create_history()
        for state in result['states']:
            node_id = str(uuid.uuid4())
            graph = record_source(graph, node_id, state)
            state['operationNode'] = node_id
    source = result['states'][result['cursor']]
    retained = next(node for node in graph.to_dict()['nodes'] if node['id'] == source['operationNode'])
    if equivalent_json(source['model']) != equivalent_json(retained['snapshot']['model']) or content_source_changed(source, retained['snapshot']):
        node_id = str(uuid.uuid4())
        graph = record_source(graph, node_id, source, parent=source['operationNode'])
        source['operationNode'] = node_id
    model = dispatch_convex_core({'op': OPERATION, 'model': source['model'], 'params': args})
    view = deepcopy(source['view'])
    for key in ('entitySelection', 'sectionAlignment', 'orientationFrame', 'cellFacingCache',
                'net', 'cellNet', 'foldFraction', 'explosionAmount', 'animation'):
        view.pop(key, None)
    view.update(entity=0, cellFacing='all', hiddenCells=[], isolatedCell=None)
    if view.get('symmetry'):
        view['symmetry']['generatorIds'] = ''
    if view.get('stellation'):
        view['stellation']['searchGeneratorIds'] = ''
    node_id = str(uuid.uuid4())
    state = {'model': model, 'view': view, 'label': label,
             'notes': source.get('notes', ''), 'operationNode': node_id}
    state = transfer_content_state(source, state, OPERATION)
    graph = record_operation(graph, node_id, source['operationNode'], OPERATION, args,
                             state, algorithm_version=VERSION)
    result['states'] = (result['states'][:result['cursor']+1]+[state])[-200:]
    result['cursor'] = len(result['states'])-1
    result['operationHistory'] = graph.to_dict()
    return checked_document(result)


def replay_convex_core_history(history, dispatcher=native_dispatch, target=None):
    """Verify complete model attributes for every required dependency state."""
    graph = validate_history(history)
    data = graph.to_dict()
    nodes = {node['id']: node for node in data['nodes']}
    if target is not None and target not in nodes:
        raise GeometryError('Convex core replay target is unavailable.')
    required = set(nodes) if target is None else set()
    pending = [] if target is None else [target]
    while pending:
        node_id = pending.pop()
        if node_id not in required:
            required.add(node_id)
            pending.extend(nodes[node_id]['inputs'])
    states = {}
    for node in data['nodes']:
        if node['id'] not in required:
            continue
        if node['numericPolicy'] != NUMERIC_POLICY:
            raise GeometryError('Convex core replay numeric policy is unsupported; retained snapshots remain readable.')
        if node['op'] == 'source':
            states[node['id']] = replay_history(graph, dispatcher, target=node['id'])[node['id']]
            continue
        if len(node['inputs']) != 1:
            raise GeometryError('Convex core replay requires one verified source dependency.')
        parent = states[node['inputs'][0]]
        if node['op'] == OPERATION:
            if node['algorithmVersion'] != VERSION:
                raise GeometryError('Convex core replay algorithm version is unsupported; retained snapshots remain readable.')
            model = dispatch_convex_core({'op': OPERATION, 'model': parent['model'],
                'params': node['params'], 'algorithmVersion': VERSION})
            model['id'] = node['snapshot']['model']['id']
            evidence = model['metadata']['convexCore']
            evidence['resultModelId'] = model['id']
            evidence['classification']['sourceModelId'] = model['id']
            verify_convex_core_evidence(model)
            computed = {**deepcopy(node['snapshot']), 'model': model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary = record_source(create_history(), 'verified-parent', parent)
            temporary = record_operation(temporary, 'native-result', 'verified-parent', node['op'],
                node['params'], node['snapshot'], algorithm_version=node['algorithmVersion'],
                numeric_policy=node['numericPolicy'])
            computed = replay_history(temporary, dispatcher, target='native-result')['native-result']
            computed['model']['id'] = node['snapshot']['model']['id']
        else:
            raise GeometryError('Unsupported convex core replay operation; retained snapshots remain readable.')
        if (canonical_model(computed['model']) != canonical_model(node['snapshot']['model'])
                or identity(computed['model']) != node['resultFingerprint']
                or equivalent_json(computed['model']) != equivalent_json(node['snapshot']['model'])):
            raise GeometryError('Convex core replay failed full ordered geometry/source attributes/evidence verification.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[node['id']] = computed
    return states


def replay_convex_core_document(document, target=None, dispatcher=native_dispatch):
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Convex core replay requires a recorded operation graph.')
    target = source['states'][source['cursor']]['operationNode'] if target is None else target
    states = replay_convex_core_history(graph, dispatcher, target)
    state = states[target]
    state['operationNode'] = target
    return checked_document({'id': str(uuid.uuid4()), 'cursor': 0, 'states': [state],
                             'operationHistory': graph.to_dict()})


def branch_convex_core(document, params, target=None, dispatcher=native_dispatch):
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Convex core branches require a recorded operation graph.')
    target = target or source['states'][source['cursor']]['operationNode']
    node = next((node for node in graph.to_dict()['nodes'] if node['id'] == target), None)
    if node is None or node['op'] != OPERATION:
        raise GeometryError('Select a recorded convex core to branch.')
    parent = replay_convex_core_document(source, node['parent'], dispatcher)
    return run_convex_core(parent, params, 'Parameter branch: '+OPERATION)
