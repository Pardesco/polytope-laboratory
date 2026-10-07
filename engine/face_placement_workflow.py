"""Literal face-placement dispatch and full-attribute history.

This adapter does not register an operation, patch UUID generation, or replace
source geometry. Generated IDs are rebound only in owned compound-tree records.
The source kernel version remains explicit in provenance.
"""
from copy import deepcopy
import hashlib
import json
import uuid

from .face_placement import (place_models_on_faces, VERSION as KERNEL_VERSION,
    MAX_PLACEMENTS, MAX_OUTPUT_VERTICES, MAX_OUTPUT_INCIDENCES)
from .augmentation import MAX_SOURCE_VERTICES, MAX_INPUT_BYTES
from .augmentation_workflow import bounded_bytes, checked_document, equivalent_json
from .compounds import _check_source
from .formats import validate_project
from .geometry import GeometryError, identity
from .history import (NUMERIC_POLICY, REPLAY_OPERATIONS, MAX_NODE_BYTES,
    canonical_model, create_history, record_source, record_operation,
    replay_history, validate_document_history, validate_history)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION = 'place-at-faces'
VERSION = '0.1.0'
MAX_SAFE_INTEGER = 2**53-1
MAX_DOCUMENT_BYTES = 64*1024*1024
PARAMETERS = frozenset({'addition', 'face_ids', 'addition_face_id', 'scale',
                        'height', 'angle_degrees', 'color_policy'})
REQUIRED = frozenset({'addition', 'face_ids', 'addition_face_id'})


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
        elif type(item) is float and item.is_integer() and MAX_SAFE_INTEGER < abs(item) < 1e21:
            raise GeometryError('Placement decimal integer-valued float exceeds the portable safe-integer domain; use strings for exact attributes.')
    return equivalent_json(detached, limit)


def _source_syntax(model):
    bounded_bytes(model, MAX_INPUT_BYTES)
    if type(model) is not dict or type(model.get('vertices')) is not list or not 4 <= len(model['vertices']) <= MAX_SOURCE_VERTICES:
        raise GeometryError('Placement requires a literal source Model with 4..256 vertices.')
    _check_source(model)  # BEFORE JSON normalization: no float/bool ID repair.


def parameters(value):
    bounded_bytes(value, MAX_INPUT_BYTES)
    if type(value) is not dict or not REQUIRED <= set(value) or set(value)-PARAMETERS:
        raise GeometryError('Placement parameters require addition/face_ids/addition_face_id and only supported options.')
    ids = value['face_ids']
    if (type(ids) is not list or not 1 <= len(ids) <= MAX_PLACEMENTS
            or any(type(i) is not int or not 0 <= i < 100_000 for i in ids)
            or len(set(ids)) != len(ids)):
        raise GeometryError('Placement target face IDs must be 1..16 distinct bounded literal integers in explicit order.')
    if type(value['addition_face_id']) is not int or not 0 <= value['addition_face_id'] < 100_000:
        raise GeometryError('Placement addition face ID must be a bounded literal integer.')
    _source_syntax(value['addition'])
    args = _portable_json(value, MAX_INPUT_BYTES)
    for key, default in [('scale', 1), ('height', 0), ('angle_degrees', 0), ('color_policy', 'preserve')]:
        args.setdefault(key, default)
    return args


def _generated_nodes(result):
    """Walk only fresh owned trees; never visit original source snapshots."""
    rows = []
    def visit(model, path):
        leaf = model.get('provenance', {}).get('operation') == 'face-placement-instance'
        rows.append((model, path, leaf))
        if not leaf:
            children = model['metadata']['compound']['sourceModels']
            # Root child0 is the ORIGINAL base; other compound children are fresh.
            for i in ([1] if path == 'root' else [0, 1]):
                visit(children[i], path+'.'+str(i))
    visit(result, 'root')
    return rows


def _bind_generated_ids(result, base, args):
    """Deterministic path IDs, with explicit owned references and no deep replace."""
    seed = hashlib.sha256(bounded_bytes([OPERATION, VERSION, KERNEL_VERSION, base, args], MAX_NODE_BYTES)).hexdigest()
    rows = _generated_nodes(result)
    protected = set()
    def originals(value):
        if type(value) is dict:
            if type(value.get('id')) is str: protected.add(value['id'])
            for child in value.values(): originals(child)
        elif type(value) is list:
            for child in value: originals(child)
    originals([base, args['addition']])
    remap = {}
    for model, path, leaf in rows:
        owned = [(model['id'], 'model')]
        if not leaf:
            owned += [(row['id'], 'component-'+str(i)) for i, row in enumerate(model['components'])]
        for old, role in owned:
            if old in remap or old in protected:
                raise GeometryError('Placement generated identity collided with another owner or a retained source ID.')
            remap[old] = 'placement-'+seed+'-'+path+'-'+role
    for model, path, leaf in rows:
        model['id'] = remap[model['id']]
        if leaf:
            model['metadata']['facePlacementInstance']['resultModelId'] = model['id']
            continue
        for row in model['components']:
            row['id'] = remap[row['id']]
            for key in ('sourceModelId', 'sourceComponentId'):
                if row.get(key) in remap: row[key] = remap[row[key]]
        for row in model['metadata']['compound']['inputs']+model.get('provenance', {}).get('inputs', []):
            if row.get('sourceModelId') in remap: row['sourceModelId'] = remap[row['sourceModelId']]
    evidence = result['metadata']['facePlacement']
    for row in evidence['placements']:
        row['instanceModelId'] = remap[row['instanceModelId']]
        row['componentIds'] = [remap[identifier] for identifier in row['componentIds']]
    evidence['resultModelId'] = result['id']
    evidence['generatedIdentityBinding'] = {'version': 1, 'seedSha256': seed,
        'definition': 'full normalized literal source/parameters plus explicit generated compound-tree paths; original snapshots unchanged'}


def _native_gate(model):
    _check_source(model)
    detached = json.loads(bounded_bytes(model, MAX_NODE_BYTES))
    validate_project({'format': 'polytope-laboratory', 'version': 1, 'active': 0,
        'documents': [{'id': 'placement-workflow-gate', 'cursor': 0,
                       'states': [{'model': detached, 'view': {}}]}]})
    if equivalent_json(detached) != equivalent_json(model) or 'measure' in detached or identity(detached) != model['fingerprint']:
        raise GeometryError('Placement native project gate changed source geometry or retained attributes.')


def dispatch_placement(request):
    try:
        bounded_bytes(request, MAX_NODE_BYTES)
        if (type(request) is not dict or not {'op', 'model', 'params'} <= set(request)
                or set(request)-{'op', 'model', 'params', 'id', 'algorithmVersion'} or request['op'] != OPERATION):
            raise GeometryError('Placement request requires op/model/params and only correlation/version fields.')
        if request.get('algorithmVersion', VERSION) != VERSION:
            raise GeometryError('Placement algorithm version is unsupported; retained snapshots remain readable.')
        correlation = request.get('id')
        if not (correlation is None or type(correlation) is str and 1 <= len(correlation) <= 128
                or type(correlation) is int and 0 <= correlation <= MAX_SAFE_INTEGER):
            raise GeometryError('Placement correlation ID is outside the native envelope domain.')
        _source_syntax(request['model'])
        base, args = _portable_json(request['model'], MAX_INPUT_BYTES), parameters(request['params'])
        options = {key: value for key, value in args.items() if key != 'addition'}
        result = place_models_on_faces(base, args['addition'], **options)
        _bind_generated_ids(result, base, args)
        result['provenance'].update(operation=OPERATION, algorithmVersion=VERSION, kernelVersion=KERNEL_VERSION)
        result = _portable_json(result, MAX_NODE_BYTES)
        _native_gate(result)
        return result
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Malformed placement workflow data: '+str(exc)) from exc


def verify_placement_evidence(model):
    try:
        bounded_bytes(model, MAX_NODE_BYTES)
        evidence = model['metadata']['facePlacement']
        if (evidence.get('resultModelId') != model.get('id') or evidence.get('resultFingerprint') != identity(model)
                or model['provenance'].get('operation') != OPERATION
                or model['provenance'].get('algorithmVersion') != VERSION
                or model['provenance'].get('kernelVersion') != KERNEL_VERSION):
            raise GeometryError('Placement evidence is stale, unsupported or mismatched against current identity.')
        sources = evidence['sourceModels']
        if type(sources) is not list or len(sources) != 2:
            raise GeometryError('Placement evidence requires two full original source snapshots.')
        args = {**model['provenance']['parameters'], 'addition': sources[1]}
        expected = dispatch_placement({'op': OPERATION, 'model': sources[0], 'params': args})
        expected['id'] = model['id']
        expected['metadata']['facePlacement']['resultModelId'] = model['id']
        if equivalent_json(expected) != equivalent_json(model):
            raise GeometryError('Placement reconstructed source attributes/geometry/maps/components/evidence disagree.')
        return {'passed': True, 'resultFingerprint': identity(model), 'certified': False,
                'checks': ['full source snapshots', 'ordered literal incidence', 'RGBA and units',
                           'proper frame transforms', 'genuine component paths/maps', 'generated identity binding', 'native project gate']}
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Invalid placement evidence: '+str(exc)) from exc


def run_placement(document, params, label='Place at faces'):
    args = parameters(params)
    if type(label) is not str or not 1 <= len(label) <= 256:
        raise GeometryError('Placement state label must be a bounded nonempty string.')
    result = checked_document(document)
    graph = validate_document_history(result)
    if graph is None:
        graph = create_history()
        for state in result['states']:
            node_id = str(uuid.uuid4()); graph = record_source(graph, node_id, state)
            state['operationNode'] = node_id
    source = result['states'][result['cursor']]
    retained = next(node for node in graph.to_dict()['nodes'] if node['id'] == source['operationNode'])
    if equivalent_json(source['model']) != equivalent_json(retained['snapshot']['model']) or content_source_changed(source, retained['snapshot']):
        node_id = str(uuid.uuid4()); graph = record_source(graph, node_id, source, parent=source['operationNode'])
        source['operationNode'] = node_id
    model = dispatch_placement({'op': OPERATION, 'model': source['model'], 'params': args})
    view = deepcopy(source['view'])
    for key in ('entitySelection', 'sectionAlignment', 'orientationFrame', 'cellFacingCache',
                'net', 'cellNet', 'foldFraction', 'explosionAmount', 'animation'):
        view.pop(key, None)
    view.update(entity=0, cellFacing='all', hiddenCells=[], isolatedCell=None)
    if view.get('symmetry'): view['symmetry']['generatorIds'] = ''
    if view.get('stellation'): view['stellation']['searchGeneratorIds'] = ''
    node_id = str(uuid.uuid4())
    state = {'model': model, 'view': view, 'label': label, 'notes': source.get('notes', ''), 'operationNode': node_id}
    state = transfer_content_state(source, state, OPERATION)
    graph = record_operation(graph, node_id, source['operationNode'], OPERATION, args, state, algorithm_version=VERSION)
    result['states'] = (result['states'][:result['cursor']+1]+[state])[-200:]
    result['cursor'] = len(result['states'])-1; result['operationHistory'] = graph.to_dict()
    return checked_document(result)


def replay_placement_history(history, dispatcher=native_dispatch, target=None):
    graph = validate_history(history); data = graph.to_dict()
    nodes = {node['id']: node for node in data['nodes']}
    if target is not None and target not in nodes: raise GeometryError('Placement replay target is unavailable.')
    required = set(nodes) if target is None else set(); pending = [] if target is None else [target]
    while pending:
        node_id = pending.pop()
        if node_id not in required:
            required.add(node_id); pending.extend(nodes[node_id]['inputs'])
    states = {}
    for node in data['nodes']:
        if node['id'] not in required: continue
        if node['numericPolicy'] != NUMERIC_POLICY:
            raise GeometryError('Placement replay numeric policy is unsupported; retained snapshots remain readable.')
        if node['op'] == 'source':
            states[node['id']] = replay_history(graph, dispatcher, target=node['id'])[node['id']]; continue
        if len(node['inputs']) != 1: raise GeometryError('Placement replay requires one verified source dependency.')
        parent = states[node['inputs'][0]]
        if node['op'] == OPERATION:
            if node['algorithmVersion'] != VERSION:
                raise GeometryError('Placement replay algorithm version is unsupported; retained snapshots remain readable.')
            model = dispatch_placement({'op': OPERATION, 'model': parent['model'], 'params': node['params']})
            model['id'] = node['snapshot']['model']['id']
            model['metadata']['facePlacement']['resultModelId'] = model['id']
            verify_placement_evidence(model)
            computed = {**deepcopy(node['snapshot']), 'model': model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary = record_source(create_history(), 'verified-parent', parent)
            temporary = record_operation(temporary, 'native-result', 'verified-parent', node['op'], node['params'],
                node['snapshot'], algorithm_version=node['algorithmVersion'], numeric_policy=node['numericPolicy'])
            computed = replay_history(temporary, dispatcher, target='native-result')['native-result']
            computed['model']['id'] = node['snapshot']['model']['id']
        else:
            raise GeometryError('Unsupported placement replay operation; retained snapshots remain readable.')
        expected = node['snapshot']['model']
        if (canonical_model(computed['model']) != canonical_model(expected) or identity(computed['model']) != node['resultFingerprint']
                or equivalent_json(computed['model']) != equivalent_json(expected)):
            raise GeometryError('Placement replay failed complete ordered geometry/full source-attribute verification.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[node['id']] = computed
    return states


def replay_placement_document(document, target=None, dispatcher=native_dispatch):
    source = checked_document(document); graph = validate_document_history(source)
    if graph is None: raise GeometryError('Placement replay requires a recorded operation graph.')
    target = source['states'][source['cursor']]['operationNode'] if target is None else target
    state = replay_placement_history(graph, dispatcher, target)[target]; state['operationNode'] = target
    return checked_document({'id': str(uuid.uuid4()), 'cursor': 0, 'states': [state], 'operationHistory': graph.to_dict()})


def branch_placement(document, params, target=None, dispatcher=native_dispatch):
    source = checked_document(document); graph = validate_document_history(source)
    if graph is None: raise GeometryError('Placement branches require a recorded operation graph.')
    target = target or source['states'][source['cursor']]['operationNode']
    node = next((node for node in graph.to_dict()['nodes'] if node['id'] == target), None)
    if node is None or node['op'] != OPERATION: raise GeometryError('Select a recorded face placement to branch.')
    parent = replay_placement_document(source, node['parent'], dispatcher)
    return run_placement(parent, params, 'Parameter branch: '+OPERATION)
