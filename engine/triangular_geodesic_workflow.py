"""Full-attribute native-history adapter for triangular geodesics.

Registry ownership stays with native callers. Specialized unary replay runs
here; registered native ancestors use temporary *source-only* graphs, avoiding
recursion through geodesic dependencies. Retained unknown operations
remain readable but explicit replay is refused.
"""
from copy import deepcopy
import json
import uuid

from .augmentation_workflow import equivalent_json, bounded_bytes, checked_document
from .compounds import _check_source
from .formats import validate_project
from .geometry import GeometryError, identity, validate
from .history import (NUMERIC_POLICY, REPLAY_OPERATIONS, MAX_NODE_BYTES,
                            create_history, record_source, record_operation,
                            validate_document_history, validate_history, replay_history,
                            canonical_model)
from .triangular_geodesic import (subdivide_triangular_geodesic,
                                          GeodesicRefusal, VERSION as KERNEL_VERSION)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION = 'triangular-geodesic'
VERSION = '0.1.0'
JSON_BINDING = 'native-equivalent-integral-numbers-v1'
MAX_INPUT_BYTES = 16*1024*1024
MAX_DOCUMENT_BYTES = 64*1024*1024
MAX_SAFE_INTEGER = 2**53-1


def native_dispatch(request):
    from .server import dispatch
    return dispatch(request)


def _portable_equivalent_json(value, limit):
    detached = json.loads(bounded_bytes(value, limit))
    stack = [detached]
    while stack:
        item = stack.pop()
        if type(item) is dict:
            stack.extend(item.values())
        elif type(item) is list:
            stack.extend(item)
        elif type(item) is float and item.is_integer() and MAX_SAFE_INTEGER < abs(item) < 1e21:
            # ECMAScript Number::toString uses decimal integer spelling below
            # 1e21 (e.g.1e20): the shared binding refuses that unsafe int token.
            # At/above 1e21 it uses scientific notation, retaining float JSON
            # semantics, including native resource metadata such as 1e100.
            # https://tc39.es/ecma262/#sec-numeric-types-number-tostring
            raise GeometryError('Geodesic integer-valued float JSON exceeds the portable safe-integer domain; reduce geometry scale or store exact attributes as strings.')
    return equivalent_json(detached, limit)


def parameters(value):
    bounded_bytes(value, MAX_INPUT_BYTES)
    if type(value) is not dict or set(value) != {'frequency'} or type(value['frequency']) is not int or not 1 <= value['frequency'] <= 128:
        raise GeometryError('Triangular geodesic parameters require only a literal integer frequency in 1..128.')
    return equivalent_json(value, MAX_INPUT_BYTES)


def _source_syntax(model):
    # Validate native syntax before numeric spelling normalization can turn a
    # malformed float/bool incidence index into an apparently valid integer.
    bounded_bytes(model, MAX_INPUT_BYTES)
    _check_source(model)


def _native_model_gate(model):
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0,
               'documents': [{'id': 'development-geodesic-gate', 'cursor': 0,
                              'states': [{'model': model, 'view': {}}]}]}
    detached = json.loads(bounded_bytes(project, MAX_DOCUMENT_BYTES))
    validate_project(detached)
    current = detached['documents'][0]['states'][0]['model']
    if (equivalent_json(current) != equivalent_json(model) or identity(current) != model['fingerprint']
            or current['interpretation'] != 'generalized-complex' or 'measure' in current):
        raise GeometryError('Geodesic native gate changed geometry or retained attributes.')


def dispatch_geodesic(request):
    """Strict dispatch; no registration/global patch/native file IO."""
    try:
        bounded_bytes(request, MAX_NODE_BYTES)
        if (type(request) is not dict or not {'op', 'model', 'params'} <= set(request)
                or set(request)-{'op', 'model', 'params', 'id', 'algorithmVersion'}
                or request['op'] != OPERATION):
            raise GeometryError('Triangular geodesic request requires op/model/params and only native correlation/version fields.')
        if request.get('algorithmVersion', VERSION) != VERSION:
            raise GeometryError('Triangular geodesic algorithm version is unsupported; retained snapshots remain readable.')
        if 'id' in request:
            value = request['id']
            if not (value is None or type(value) is str and 1 <= len(value) <= 128
                    or type(value) is int and 0 <= value <= MAX_SAFE_INTEGER):
                raise GeometryError('Geodesic correlation ID is outside the native envelope domain.')
        _source_syntax(request['model'])
        args = parameters(request['params'])
        # Native generators retain numpy.float64 historical support metadata.
        # Detach through native JSON first, then normalize primitive spellings:
        # otherwise an integral float subclass could become a plain 0.0 only
        # AFTER its source hash, and a second invocation would hash integer0.
        source = _portable_equivalent_json(request['model'], MAX_INPUT_BYTES)
        model = subdivide_triangular_geodesic(source, **args)
        model['provenance'].update(operation=OPERATION, algorithmVersion=VERSION,
                                  kernelVersion=KERNEL_VERSION)
        evidence = model['metadata']['triangularGeodesic']
        evidence['jsonBinding'] = {'version': JSON_BINDING,
                                  'definition': 'normalize equivalent integral/negative-zero JSON spellings before source hashes; no exact geometric certificate'}
        evidence['resultModelId'] = model['id']
        evidence['resultFingerprint'] = identity(model)
        model['fingerprint'] = identity(model)
        model['validation'] = validate(model)
        if not model['validation']['passed']:
            raise GeometryError('Constructed geodesic failed native incidence validation.')
        model = _portable_equivalent_json(model, MAX_NODE_BYTES)
        _native_model_gate(model)
        return model
    except GeometryError:
        raise
    except GeodesicRefusal as exc:
        raise GeometryError(f'Triangular geodesic {exc.code}: {exc}') from exc
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Triangular geodesic could not resolve malformed request data: '+str(exc)) from exc


def verify_geodesic_evidence(model):
    """Recompute every current coordinate/map/color/attribute, not a hash only."""
    try:
        bounded_bytes(model, MAX_DOCUMENT_BYTES)
        evidence = model['metadata']['triangularGeodesic']
        if (type(evidence) is not dict or evidence.get('jsonBinding', {}).get('version') != JSON_BINDING
                or evidence.get('resultModelId') != model.get('id')
                or evidence.get('resultFingerprint') != identity(model)
                or model['provenance'].get('algorithmVersion') != VERSION
                or model['provenance'].get('kernelVersion') != KERNEL_VERSION):
            raise GeometryError('Geodesic evidence is stale, unsupported or mismatched against current identity.')
        expected = dispatch_geodesic({'op': OPERATION, 'model': evidence['sourceModel'],
                                      'params': model['provenance']['parameters'], 'algorithmVersion': VERSION})
        expected['id'] = model['id']
        expected['metadata']['triangularGeodesic']['resultModelId'] = model['id']
        if equivalent_json(expected) != equivalent_json(model):
            raise GeometryError('Geodesic source snapshots/maps/RGBA/units/evidence disagree with independent reconstruction.')
        return {'passed': True, 'resultFingerprint': identity(model), 'jsonBinding': JSON_BINDING,
                'checks': ['complete ordered geometry', 'current result identity', 'full source attributes',
                           'exact source maps and rational parameters', 'RGBA and units', 'native project gate']}
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Invalid geodesic evidence: '+str(exc)) from exc


def run_geodesic(document, params, label='Triangular geodesic'):
    args = parameters(params)
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
    model = dispatch_geodesic({'op': OPERATION, 'model': source['model'], 'params': args})
    if type(label) is not str or not 1 <= len(label) <= 256:
        raise GeometryError('Geodesic state label must be a nonempty bounded string.')
    view = deepcopy(source['view'])
    # Incidence-indexed caches must not continue referring to the old mesh.
    for field in ('entitySelection', 'sectionAlignment', 'orientationFrame', 'cellFacingCache',
                  'net', 'cellNet', 'foldFraction', 'explosionAmount', 'animation'):
        view.pop(field, None)
    view.update(entity=0, cellFacing='all', hiddenCells=[], isolatedCell=None)
    if view.get('symmetry'):
        view['symmetry']['generatorIds'] = ''
    if view.get('stellation'):
        view['stellation']['searchGeneratorIds'] = ''
    node_id = str(uuid.uuid4())
    state = {'model': model, 'view': view, 'label': label, 'notes': source.get('notes', ''), 'operationNode': node_id}
    state = transfer_content_state(source, state, OPERATION)
    graph = record_operation(graph, node_id, source['operationNode'], OPERATION, args, state,
                             algorithm_version=VERSION)
    result['states'] = (result['states'][:result['cursor']+1]+[state])[-200:]
    result['cursor'] = len(result['states'])-1
    result['operationHistory'] = graph.to_dict()
    return checked_document(result)


def replay_geodesic_history(history, dispatcher=native_dispatch, target=None):
    """Full-attribute replay, delegating each native op from a verified source.

    Registry selection is owned by native callers. Each temporary native graph
    has exactly one source node and one registered op;
    no temporary graph includes a geodesic ancestor or calls this adapter again.
    """
    graph = validate_history(history)
    data = graph.to_dict()
    nodes = {node['id']: node for node in data['nodes']}
    if target is not None and target not in nodes:
        raise GeometryError('Geodesic replay target is unavailable.')
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
            raise GeometryError('Geodesic replay numeric policy is unsupported; retained snapshots remain readable.')
        if node['op'] == 'source':
            states[node['id']] = replay_history(graph, dispatcher, target=node['id'])[node['id']]
            continue
        if len(node['inputs']) != 1:
            raise GeometryError('Geodesic replay requires exactly one verified source dependency.')
        parent = states[node['inputs'][0]]
        if node['op'] == OPERATION:
            if node['algorithmVersion'] != VERSION:
                raise GeometryError('Geodesic replay algorithm version is unsupported; retained snapshots remain readable.')
            model = dispatch_geodesic({'op': OPERATION, 'model': parent['model'], 'params': node['params'], 'algorithmVersion': VERSION})
            model['id'] = node['snapshot']['model']['id']
            model['metadata']['triangularGeodesic']['resultModelId'] = model['id']
            verify_geodesic_evidence(model)
            computed = {**deepcopy(node['snapshot']), 'model': model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary = record_source(create_history(), 'verified-parent', parent)
            temporary = record_operation(temporary, 'native-result', 'verified-parent', node['op'], node['params'],
                                         node['snapshot'], algorithm_version=node['algorithmVersion'], numeric_policy=node['numericPolicy'])
            computed = replay_history(temporary, dispatcher, target='native-result')['native-result']
            computed['model']['id'] = node['snapshot']['model']['id']
        else:
            raise GeometryError('Unsupported geodesic replay operation; retained snapshots remain readable.')
        expected = node['snapshot']['model']
        if (canonical_model(computed['model']) != canonical_model(expected)
                or identity(computed['model']) != node['resultFingerprint']
                or equivalent_json(computed['model']) != equivalent_json(expected)):
            raise GeometryError('Geodesic replay failed complete ordered geometry/full source-attribute verification.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[node['id']] = computed
    return states


def replay_geodesic_document(document, target=None, dispatcher=native_dispatch):
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Geodesic replay requires a recorded operation graph.')
    target = source['states'][source['cursor']]['operationNode'] if target is None else target
    states = replay_geodesic_history(graph, dispatcher, target)
    state = states[target]
    state['operationNode'] = target
    return checked_document({'id': str(uuid.uuid4()), 'cursor': 0, 'states': [state], 'operationHistory': graph.to_dict()})


def branch_geodesic(document, params, target=None, dispatcher=native_dispatch):
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Geodesic branches require a recorded operation graph.')
    target = target or source['states'][source['cursor']]['operationNode']
    node = next((node for node in graph.to_dict()['nodes'] if node['id'] == target), None)
    if node is None or node['op'] != OPERATION:
        raise GeometryError('Select a recorded triangular geodesic to branch.')
    parent = replay_geodesic_document(source, node['parent'], dispatcher)
    return run_geodesic(parent, params, 'Parameter branch: '+OPERATION)
