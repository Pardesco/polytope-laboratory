"""Append-only, bounded operation graphs with retained readable snapshots.

Dispatch is injected by the caller; importing the server here would create a
cycle when native project validation later incorporates this module.
"""
from dataclasses import dataclass
from types import MappingProxyType
import hashlib
import json
import math

from .geometry import GeometryError, VERSION, TOLERANCE, identity, validate

MAX_NODES = 1024
MAX_NODE_BYTES = 32 * 1024 * 1024
MAX_BYTES = 128 * 1024 * 1024
MAX_DEPTH = 64
MAX_VALUES = 8_000_000
ALGORITHM_VERSIONS = MappingProxyType({'transform': VERSION, 'section': VERSION,
    'dual': VERSION, 'incidence-dual': '0.5.0', 'truncate': VERSION,
    'extrude': VERSION, 'cell': '0.2.0', 'facet': VERSION, 'facet-adopt':'0.1.0', 'scale-reference': VERSION, 'remove-coincident-pairs': '0.1.0', 'blend-faces': '0.1.0', 'compound-component': '0.1.0', 'compound-drop': '0.1.0', 'subdivide-edges':'0.1.0', 'polygon-prism':'0.2.0', 'polyhedron-prism':'0.1.0', 'convex-layer-join':'0.1.0', 'fit-strict-layer-join':'0.1.0', 'attach-at-faces':'0.1.0', 'triangular-geodesic':'0.1.0', 'convex-core':'0.1.0', 'place-at-faces':'0.1.0', 'convex-core-4d':'0.1.0', 'source-zonohedron':'0.1.0', 'spring-relaxation':'0.1.0', 'element-content':'0.1.0', 'expand-runcinate':'0.1.0', 'geometry-fit':'0.1.0', 'exact-surface-section':'0.1.0', 'incidence-truncate':'0.1.0', 'sphere-project':'0.1.0', 'projective-incidence-dual':'0.1.0', 'reflect-source':'0.1.0', 'coincidic-record':'0.1.0', 'coincidic-compound':'0.1.0'})
REPLAY_OPERATIONS = frozenset(ALGORITHM_VERSIONS)
NUMERIC_POLICY = MappingProxyType({'mode': 'float64-approximate', 'tolerance': TOLERANCE})
NODE_KEYS = frozenset({'id', 'parent', 'inputs', 'op', 'params', 'numericPolicy',
    'algorithmVersion', 'sourceSnapshotHash', 'resultFingerprint', 'snapshot'})


def _json_bytes(value, limit=MAX_BYTES):
    """Bound traversal before serialization, rejecting non-JSON/cyclic data."""
    stack = [(value, 0, frozenset())]
    count = 0
    string_bytes = 0
    while stack:
        item, depth, ancestors = stack.pop()
        count += 1
        if depth > MAX_DEPTH or count > MAX_VALUES:
            raise GeometryError('Operation history exceeds structural resource bounds.')
        kind = type(item)
        # Native net layouts contain tuple coordinates; JSON serializes these
        # as arrays. Detachment below normalizes them before retaining nodes.
        if kind is dict or kind in (list, tuple):
            marker = id(item)
            if marker in ancestors:
                raise GeometryError('Operation history contains cyclic JSON data.')
            next_ancestors = ancestors | {marker}
            if kind is dict:
                if any(type(key) is not str for key in item):
                    raise GeometryError('Operation history requires string JSON keys.')
                string_bytes += sum(len(key.encode('utf-8')) for key in item)
                values = item.values()
            else:
                values = item
            if count + len(stack) + len(item) > MAX_VALUES:
                raise GeometryError('Operation history exceeds structural resource bounds.')
            stack.extend((child, depth + 1, next_ancestors) for child in values)
        elif kind is str:
            string_bytes += len(item.encode('utf-8'))
        elif isinstance(item, float):
            if not math.isfinite(item):
                raise GeometryError('Operation history requires finite JSON numbers.')
        elif kind not in (int, bool, type(None)):
            raise GeometryError('Operation history requires plain JSON values.')
        if string_bytes > limit:
            raise GeometryError('Operation history exceeds serialized resource bounds.')
    try:
        data = json.dumps(value, ensure_ascii=False, allow_nan=False,
                          sort_keys=True, separators=(',', ':')).encode('utf-8')
    except (ValueError, TypeError, RecursionError, UnicodeError) as exc:
        raise GeometryError('Operation history requires finite UTF-8 JSON data.') from exc
    if len(data) > limit:
        raise GeometryError('Operation history exceeds serialized resource bounds.')
    return data


def canonical_model(model):
    """Complete ordered source geometry, without volatile UUIDs or caches.

    Incidence is not sorted, cyclically rotated or converted to a convex hull.
    Numeric spellings 1/1.0 and 0/-0 denote the same source coordinate.
    """
    fields = {key: model.get(key) for key in
        ('dimension', 'embeddingDimension', 'interpretation', 'edges', 'faces',
         'cells', 'rationalCoordinates')}
    fields['vertices'] = [[float(x) if x else 0.0 for x in point]
                          for point in model['vertices']]
    if model.get('convexPieces'):
        fields['convexPieces'] = [canonical_model(piece)
                                  for piece in model['convexPieces']]
    return fields


def _snapshot(state):
    detached = json.loads(_json_bytes(state, MAX_NODE_BYTES))
    if (type(detached) is not dict or type(detached.get('model')) is not dict
            or type(detached.get('view')) is not dict):
        raise GeometryError('History snapshots require model and view objects.')
    checked = validate(detached['model'])
    if not checked['passed']:
        raise GeometryError('Invalid history snapshot: ' + '; '.join(checked['errors']))
    return detached


def _source_hash(snapshot):
    # A native float 2.0 is serialized by JavaScript as 2. Those denote the
    # same supplied JSON number, including negative zero, across project I/O.
    def numbers(value):
        if type(value) is dict:
            return {key:numbers(item) for key,item in value.items()}
        if type(value) is list:
            return [numbers(item) for item in value]
        if isinstance(value,float) and value.is_integer():
            return int(value)
        return value
    return hashlib.sha256(_json_bytes(numbers(snapshot), MAX_NODE_BYTES)).hexdigest()


@dataclass(frozen=True)
class OperationHistory:
    """Immutable serialized ownership; callers only receive detached data."""
    _data: bytes

    def __post_init__(self):
        if type(self._data) is not bytes or len(self._data)>MAX_BYTES:
            raise GeometryError('Immutable operation history requires bounded serialized bytes.')

    def to_dict(self):
        try:
            return json.loads(self._data)
        except (ValueError,UnicodeError,RecursionError) as exc:
            raise GeometryError('Operation history contains invalid serialized JSON.') from exc


def create_history():
    return OperationHistory(b'{"nodes":[],"version":1}')


def validate_history(value):
    if isinstance(value, OperationHistory):
        value = value.to_dict()
    data = _json_bytes(value)
    graph = json.loads(data)
    if (type(graph) is not dict or set(graph) != {'version', 'nodes'}
            or type(graph['version']) is not int or graph['version'] != 1
            or type(graph['nodes']) is not list or len(graph['nodes']) > MAX_NODES):
        raise GeometryError('History requires version 1 and at most 1024 ordered nodes.')
    prior = {}
    for node in graph['nodes']:
        if type(node) is not dict or set(node) != NODE_KEYS:
            raise GeometryError('History node has an invalid operation record.')
        _json_bytes(node, MAX_NODE_BYTES)
        node_id = node['id']
        if type(node_id) is not str or not node_id or len(node_id) > 128 or node_id in prior:
            raise GeometryError('History node IDs must be unique nonempty strings of at most 128 characters.')
        parent = node['parent']
        if parent is not None and (type(parent) is not str or parent not in prior):
            raise GeometryError('History parent dependencies must precede their node; cycles are invalid.')
        inputs = node['inputs']
        if (type(inputs) is not list or len(inputs) > 16
                or any(type(item) is not str or item not in prior for item in inputs)
                or len(set(inputs)) != len(inputs)):
            raise GeometryError('History input dependencies must be unique earlier nodes.')
        if (type(node['op']) is not str or not node['op']
                or type(node['params']) is not dict
                or type(node['numericPolicy']) is not dict
                or type(node['algorithmVersion']) is not str or not node['algorithmVersion']):
            raise GeometryError('History operations require parameters, numeric policy and algorithm version.')
        snapshot = _snapshot(node['snapshot'])
        if node['resultFingerprint'] != identity(snapshot['model']):
            raise GeometryError(f'History node {node_id} has a forged result fingerprint.')
        if node['op'] == 'source':
            if inputs or node['params']:
                raise GeometryError('Source history nodes cannot have operation inputs or parameters.')
            expected_source = _source_hash(snapshot)
        else:
            if parent is None or not inputs or inputs[0] != parent:
                raise GeometryError('Operation history requires its parent as the first model input.')
            expected_source = prior[parent]['sourceSnapshotHash']
        if node['sourceSnapshotHash'] != expected_source:
            raise GeometryError(f'History node {node_id} has a forged source snapshot hash.')
        prior[node_id] = node
    return OperationHistory(data)


def record_source(history, node_id, state, parent=None):
    graph = validate_history(history).to_dict()
    snapshot = _snapshot(state)
    graph['nodes'].append({'id': node_id, 'parent': parent, 'inputs': [],
        'op': 'source', 'params': {}, 'numericPolicy': dict(NUMERIC_POLICY),
        'algorithmVersion': VERSION, 'sourceSnapshotHash': _source_hash(snapshot),
        'resultFingerprint': identity(snapshot['model']), 'snapshot': snapshot})
    return validate_history(graph)


def record_operation(history, node_id, parent, op, params, state, *, inputs=None,
                     numeric_policy=None, algorithm_version=None):
    graph = validate_history(history).to_dict()
    previous = next((node for node in graph['nodes'] if node['id'] == parent), None)
    if previous is None:
        raise GeometryError('History operation parent is unavailable.')
    if op == 'cell' and algorithm_version is None:
        from .cell_attributes import select_cell_version
        algorithm_version = select_cell_version(params)
    snapshot = _snapshot(state)
    graph['nodes'].append({'id': node_id, 'parent': parent,
        'inputs': [parent] if inputs is None else inputs, 'op': op, 'params': params,
        'numericPolicy': dict(NUMERIC_POLICY) if numeric_policy is None else numeric_policy,
        'algorithmVersion': ALGORITHM_VERSIONS.get(op,VERSION) if algorithm_version is None else algorithm_version,
        'sourceSnapshotHash': previous['sourceSnapshotHash'],
        'resultFingerprint': identity(snapshot['model']), 'snapshot': snapshot})
    return validate_history(graph)


def append_operation(history, source_node_id, source_state, operation, params,
                     result_state, new_id):
    """Seed a missing source, then append an operation in one atomic return.

    Existing source IDs may also identify an earlier operation result. A
    changed geometry requires a new source ID; current display edits do not.
    """
    graph = create_history() if history is None else validate_history(history)
    source = _snapshot(source_state)
    node = next((item for item in graph.to_dict()['nodes']
                 if item['id']==source_node_id),None)
    if node is None:
        graph = record_source(graph,source_node_id,source)
    elif canonical_model(source['model']) != canonical_model(node['snapshot']['model']):
        raise GeometryError('Source node geometry changed; provide a new source node ID to branch.')
    return record_operation(graph,new_id,source_node_id,operation,params,result_state)


def validate_document_history(document):
    """Validate doc.operationHistory and every state.operationNode association.

    Legacy documents without either field remain readable. This function
    never mutates the document or its saved display state.
    """
    if type(document) is not dict:
        raise GeometryError('Document history requires a document object.')
    states = document.get('states',[])
    if type(states) is not list:
        raise GeometryError('Document history requires state snapshots.')
    if 'operationHistory' not in document:
        if any(type(state) is dict and 'operationNode' in state for state in states):
            raise GeometryError('Document state association requires an operation history graph.')
        return None
    if not states or len(states)>MAX_NODES:
        raise GeometryError('Document operation history requires 1â€“1024 state associations.')
    _json_bytes(document)
    graph = validate_history(document['operationHistory'])
    nodes = {node['id']:node for node in graph.to_dict()['nodes']}
    for index,state in enumerate(states):
        if type(state) is not dict or type(state.get('operationNode')) is not str or state['operationNode'] not in nodes:
            raise GeometryError(f'Document state {index} has a missing or invalid operation node association.')
        snapshot = _snapshot(state)
        node = nodes[state['operationNode']]
        if canonical_model(snapshot['model']) != canonical_model(node['snapshot']['model']):
            raise GeometryError(f'Document state {index} geometry disagrees with its operation node association.')
    return graph


def replay_history(history, dispatcher, target=None):
    """Replay only the target's dependencies (all nodes when target is None).

    Returns detached states indexed by node ID. Every computed intermediate
    must match the retained complete ordered geometry as well as its hash.
    """
    graph = validate_history(history).to_dict()
    nodes = {node['id']: node for node in graph['nodes']}
    if target is not None and target not in nodes:
        raise GeometryError('Requested history replay target is unavailable.')
    required = set(nodes) if target is None else set()
    pending = [] if target is None else [target]
    while pending:
        node_id = pending.pop()
        if node_id in required:
            continue
        required.add(node_id)
        node = nodes[node_id]
        pending.extend(node['inputs'])
    if any(nodes[node_id]['op'] == 'facet-adopt' for node_id in required):
        from .automatic_faceting_workflow import replay_faceting_history
        return replay_faceting_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'source-zonohedron' for node_id in required):
        from .source_zonohedron_workflow import replay_source_zonohedron_history
        return replay_source_zonohedron_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'spring-relaxation' for node_id in required):
        from .spring_workflow import replay_spring_history
        return replay_spring_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'cell' and nodes[node_id]['algorithmVersion'] == '0.2.0' for node_id in required):
        from .cell_attributes import replay_cell_history
        return replay_cell_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'place-at-faces' for node_id in required):
        from .face_placement_workflow import replay_placement_history
        return replay_placement_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'convex-core-4d' for node_id in required):
        from .convex_core4d_workflow import replay_convex_core4d_history
        return replay_convex_core4d_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'triangular-geodesic' for node_id in required):
        from .triangular_geodesic_workflow import replay_geodesic_history
        return replay_geodesic_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'convex-core' for node_id in required):
        from .convex_core_workflow import replay_convex_core_history
        return replay_convex_core_history(history, dispatcher=dispatcher, target=target)
    if any(nodes[node_id]['op'] == 'attach-at-faces' for node_id in required):
        # Attachment evidence binds full colors, seam maps and source snapshots;
        # coordinate/fingerprint equivalence alone cannot qualify its replay.
        from .augmentation_workflow import replay_attachment_history
        return replay_attachment_history(history, dispatcher=dispatcher, target=target)
    results = {}
    for node in graph['nodes']:
        node_id = node['id']
        if node_id not in required:
            continue
        version = VERSION if node['op']=='source' else ALGORITHM_VERSIONS.get(node['op'])
        supported_versions = ('0.1.0', '0.2.0') if node['op'] in ('polygon-prism','cell') else (version,)
        if version is not None and node['algorithmVersion'] not in supported_versions:
            raise GeometryError(f'History node {node_id}: unsupported algorithm version {node["algorithmVersion"]}; retained snapshot remains readable.')
        if node['numericPolicy'] != NUMERIC_POLICY:
            raise GeometryError(f'History node {node_id}: unsupported numeric policy; retained snapshot remains readable.')
        if node['op'] == 'source':
            results[node_id] = node['snapshot']
            continue
        if node['op'] not in REPLAY_OPERATIONS or len(node['inputs']) != 1:
            raise GeometryError(f'History node {node_id}: unsupported replay operation {node["op"]}; retained snapshot remains readable.')
        if node['op'] == 'element-content':
            from .element_content_workflow import replay_content_state
            computed = _snapshot(replay_content_state(results[node['inputs'][0]], node))
            if canonical_model(computed['model']) != canonical_model(node['snapshot']['model']) or identity(computed['model']) != node['resultFingerprint']:
                raise GeometryError('Element content replay changed source geometry/attributes.')
            results[node_id] = computed
            continue
        if node['op'] == 'projective-incidence-dual':
            from .projective_dual_workflow import replay_projective_state
            computed = _snapshot(replay_projective_state(results[node['inputs'][0]], node))
            if canonical_model(computed['model']) != canonical_model(node['snapshot']['model']):
                raise GeometryError('Projective reciprocal replay changed finite source geometry/attributes.')
            results[node_id] = computed
            continue
        request = {'op': node['op'], 'params': node['params'],
                   'model': results[node['inputs'][0]]['model']}
        if node['op'] in ('polygon-prism','cell','spring-relaxation'):
            request['algorithmVersion']=node['algorithmVersion']
        # A dispatcher cannot mutate an earlier replay result or retained node.
        try:
            response = dispatcher(json.loads(_json_bytes(request, MAX_NODE_BYTES)))
        except Exception as exc:
            raise GeometryError(f'History node {node_id} replay operation failed: {exc}') from exc
        model = response.get('model') if node['op'] == 'section' and type(response) is dict else response
        if type(model) is not dict:
            raise GeometryError(f'History node {node_id} produced no replayable model.')
        if any(field in results[node['inputs'][0]]['view'] for field in ('elementAnnotations', 'elementContentDetached')):
            # UUIDs are volatile in ordinary native operations; saved owner IDs
            # remain literal. Geometry is still independently compared below.
            model['id'] = node['snapshot']['model']['id']
        computed = _snapshot({**node['snapshot'], 'model': model})
        if node['op'] in ('coincidic-record','coincidic-compound'):
            from .coincidic_regiments import verify_replay
            verify_replay(results[node['inputs'][0]],computed,node)
        if node['op']=='reflect-source':
            from .source_reflection import verify_reflection_replay
            verify_reflection_replay(results[node['inputs'][0]],computed,node['snapshot'])
        expected = node['snapshot']['model']
        if (canonical_model(computed['model']) != canonical_model(expected)
                or identity(computed['model']) != node['resultFingerprint']):
            raise GeometryError(f'History node {node_id} failed full coordinate/incidence replay verification.')
        if node['op'] not in ('coincidic-record','coincidic-compound') and any(field in results[node['inputs'][0]]['view'] for field in ('elementAnnotations', 'elementContentDetached')):
            from .element_content_ownership import verify_replayed_content
            verify_replayed_content(results[node['inputs'][0]], computed, node)
        results[node_id] = computed
    return results
