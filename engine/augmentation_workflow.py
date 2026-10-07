"""Native-history adapter for source-preserving bounded face attachment.

Uses immutable native history/project APIs without changing their registries.
Registration remains the caller's responsibility. Extended replay delegates
registered operations to actual native replay primitives.
"""
from copy import deepcopy
import json
import uuid

from .compounds import _check_source
from .formats import validate_project
from .geometry import GeometryError, identity
from .history import (NUMERIC_POLICY, REPLAY_OPERATIONS, MAX_NODE_BYTES,
    _json_bytes, canonical_model, create_history, record_operation, record_source,
    replay_history, validate_document_history, validate_history)

from .augmentation import attach_at_faces, VERSION, MAX_SOURCE_VERTICES, MAX_INPUT_BYTES

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION = 'attach-at-faces'
JSON_BINDING = 'native-equivalent-integral-numbers-v1'
MAX_SAFE_INTEGER = 2**53 - 1
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
PARAMETERS = frozenset({'addition', 'base_face_id', 'addition_face_id',
                       'cycle_offset', 'scale', 'tolerance', 'color_policy'})
REQUIRED = frozenset({'addition', 'base_face_id', 'addition_face_id'})


def native_dispatch(request):
    # Lazy dependency: server imports this module when the operation is mounted.
    from .server import dispatch
    return dispatch(request)


def bounded_bytes(value, limit):
    try:
        return _json_bytes(value, limit)
    except (UnicodeError, RecursionError, OverflowError, ValueError, TypeError) as exc:
        raise GeometryError('Attachment workflow requires finite bounded UTF-8 JSON.') from exc


def equivalent_json(value, limit=MAX_DOCUMENT_BYTES):
    """Detach native-equivalent JSON, normalizing 1.0/-0.0 to 1/0.

    Integer tokens outside the interoperable safe-integer domain are refused.
    Larger float tokens retain their float spelling. This is not an incidence
    repair: native syntax validation must
    precede this helper when it will supply a Model to a construction.
    """
    bounded_bytes(value, limit)  # Structural/UTF-8 budget before traversal/copy.
    size = 0
    def account(count):
        nonlocal size
        size += count
        if size > limit:
            raise GeometryError('Canonical attachment JSON exceeds its serialized resource budget.')
    def clone(item):
        kind = type(item)
        if kind is dict:
            account(2 + len(item))
            result = {}
            for key, child in item.items():
                account(len(json.dumps(key, ensure_ascii=False).encode('utf-8')) + 1)
                result[key] = clone(child)
            return result
        if kind in (list, tuple):
            account(2 + len(item)); return [clone(child) for child in item]
        if kind is int:
            if abs(item) > MAX_SAFE_INTEGER:
                raise GeometryError('Attachment integer JSON tokens exceed the JavaScript safe-integer domain; use strings for exact large attributes.')
        if kind is float and item.is_integer() and abs(item)<=MAX_SAFE_INTEGER: item = int(item)
        if item is None: account(4)
        elif type(item) is bool: account(4 if item else 5)
        elif type(item) is str: account(len(json.dumps(item, ensure_ascii=False).encode('utf-8')))
        else: account(len(str(item)))
        return item
    result = clone(value)
    return json.loads(bounded_bytes(result, limit))


def _source_syntax(model):
    if type(model) is not dict or type(model.get('vertices')) is not list or not 4 <= len(model['vertices']) <= MAX_SOURCE_VERTICES:
        raise GeometryError('Attachment workflow requires a bounded source Model with 4–256 vertices.')
    # In particular reject float/bool incidence IDs before numeric spelling
    # normalization can turn an invalid 1.0 endpoint into an integer endpoint.
    _check_source(model)


def parameters(value):
    bounded_bytes(value, MAX_INPUT_BYTES)
    if type(value) is not dict or not REQUIRED <= set(value) or set(value) - PARAMETERS:
        raise GeometryError('Attachment parameters require addition, base_face_id and addition_face_id, with no unknown keys.')
    for key in ('base_face_id', 'addition_face_id', 'cycle_offset'):
        if key in value and (type(value[key]) is not int or not 0 <= value[key] < 100_000):
            raise GeometryError('Attachment face IDs and cycle offset must be bounded literal integer values.')
    _source_syntax(value['addition'])
    return equivalent_json(value, MAX_INPUT_BYTES)


def _native_model_gate(model):
    project = {'format':'polytope-laboratory', 'version':1, 'active':0,
               'documents':[{'id':'development-attachment-gate', 'cursor':0,
                             'states':[{'model':model, 'view':{}}]}]}
    detached = json.loads(bounded_bytes(project, MAX_DOCUMENT_BYTES))
    validate_project(detached)
    restored = detached['documents'][0]['states'][0]['model']
    if restored != model or identity(restored) != model['fingerprint'] or 'measure' in restored:
        raise GeometryError('Attachment workflow native gate changed retained geometry or attributes.')


def dispatch_attachment(request):
    """Future strict server dispatch shape, isolated from .server."""
    try:
        bounded_bytes(request, MAX_NODE_BYTES)
        if (type(request) is not dict or not {'op','model','params'} <= set(request)
                or set(request)-{'op','model','params','id','algorithmVersion'}
                or request['op'] != OPERATION):
            raise GeometryError('Attachment request requires op, model and params with only native correlation/version envelope fields.')
        if request.get('algorithmVersion',VERSION)!=VERSION:
            raise GeometryError('Attachment request algorithm version is unsupported.')
        if 'id' in request:
            correlation=request['id']
            if not (correlation is None or (type(correlation) is str and 1<=len(correlation)<=128)
                    or (type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER)):
                raise GeometryError('Attachment correlation ID is outside the native envelope domain.')
        _source_syntax(request['model'])
        args = parameters(request['params'])
        base = equivalent_json(request['model'], MAX_INPUT_BYTES)
        addition = args.pop('addition')
        model = attach_at_faces(base, addition, **args)
        model['metadata']['augmentation']['jsonBinding'] = {
            'version':JSON_BINDING,
            'definition':'integral float/negative-zero spelling normalized before source snapshot hashes; no mathematical exact certification'}
        _native_model_gate(model)
        return model
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Attachment workflow could not resolve malformed request data: '+str(exc)) from exc


def verify_attachment_evidence(model):
    """Recompute a fresh attachment and verify all retained maps/RGBA/snapshots.

    An edited or subsequently transformed model may remain a valid native Model;
    it no longer qualifies as this fresh attachment evidence. No repair occurs.
    """
    try:
        bounded_bytes(model, MAX_DOCUMENT_BYTES)
        evidence = model['metadata']['augmentation']
        if (type(evidence) is not dict or evidence.get('jsonBinding',{}).get('version') != JSON_BINDING
                or evidence.get('resultModelId') != model.get('id')
                or evidence.get('resultFingerprint') != identity(model)):
            raise GeometryError('Attachment evidence is unsupported or stale against current source identity.')
        sources = evidence['sourceModels']
        if type(sources) is not list or len(sources) != 2:
            raise GeometryError('Attachment evidence requires exactly two full source snapshots.')
        params = {key:value for key,value in model['provenance']['parameters'].items() if key in PARAMETERS}
        params['addition'] = sources[1]
        expected = dispatch_attachment({'op':OPERATION, 'model':sources[0], 'params':params})
        expected['id'] = model['id']
        expected['metadata']['augmentation']['resultModelId'] = model['id']
        if equivalent_json(expected) != equivalent_json(model):
            raise GeometryError('Attachment retained seam/source maps, coordinates, attributes or evidence disagree with independent reconstruction.')
        return {'passed':True, 'resultFingerprint':identity(model), 'jsonBinding':JSON_BINDING,
                'checks':['complete ordered geometry','current result identity', 'source snapshots and semantic hashes',
                          'seam and full source maps', 'RGBA and coordinate units', 'native project gate']}
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise GeometryError('Invalid attachment evidence: '+str(exc)) from exc


def checked_document(document):
    # Native validation first: never normalize malformed float incidence IDs.
    detached = json.loads(bounded_bytes(document, MAX_DOCUMENT_BYTES))
    validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[detached]})
    detached = equivalent_json(detached)
    validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[detached]})
    return detached


def run_attachment(document, params, label='Attach faces (3D)'):
    """Append an attachment node using immutable native history APIs."""
    args = parameters(params)
    result = checked_document(document)
    graph = validate_document_history(result)
    if graph is None:
        graph = create_history()
        for state in result['states']:
            node_id = str(uuid.uuid4()); graph = record_source(graph,node_id,state)
            state['operationNode'] = node_id
    source = result['states'][result['cursor']]
    # Native append checks geometry; color/attribute edits also need a new root
    # for faithful attachment replay rather than an old geometrically equal root.
    retained = next(node for node in graph.to_dict()['nodes'] if node['id']==source['operationNode'])
    if equivalent_json(source['model']) != equivalent_json(retained['snapshot']['model']) or content_source_changed(source, retained['snapshot']):
        node_id = str(uuid.uuid4())
        graph = record_source(graph,node_id,source,parent=source['operationNode'])
        source['operationNode'] = node_id
    model = dispatch_attachment({'op':OPERATION,'model':source['model'],'params':args})
    view = deepcopy(source['view'])
    for key in ('entitySelection','sectionAlignment','orientationFrame','cellFacingCache'):
        view.pop(key,None)
    view.update(cellFacing='all',hiddenCells=[],isolatedCell=None)
    if view.get('symmetry'): view['symmetry']['generatorIds']=''
    if view.get('stellation'): view['stellation']['searchGeneratorIds']=''
    node_id = str(uuid.uuid4())
    state = {'model':model,'view':view,'label':label,'notes':source.get('notes',''),'operationNode':node_id}
    state = transfer_content_state(source, state, OPERATION)
    graph = record_operation(graph,node_id,source['operationNode'],OPERATION,args,state,
                             algorithm_version=VERSION)
    result['states']=(result['states'][:result['cursor']+1]+[state])[-200:]
    result['cursor']=len(result['states'])-1; result['operationHistory']=graph.to_dict()
    return checked_document(result)


def replay_attachment_history(history, dispatcher, target=None):
    """Return verified dependency states, or every node when target is None.

    Every registered non-attachment node is replayed by actual native replay
    against its verified parent. Source targets and temporary native graphs
    contain no attachment dependency, so native delegation cannot recurse.
    """
    graph=validate_history(history)
    data=graph.to_dict(); nodes={node['id']:node for node in data['nodes']}
    if target is not None and target not in nodes:
        raise GeometryError('Attachment replay target is unavailable.')
    required=set(nodes) if target is None else set()
    pending=[] if target is None else [target]
    while pending:
        node_id=pending.pop()
        if node_id not in required:
            required.add(node_id);pending.extend(nodes[node_id]['inputs'])
    states={}
    for node in data['nodes']:
        node_id=node['id']
        if node_id not in required: continue
        if node['numericPolicy']!=NUMERIC_POLICY:
            raise GeometryError('Attachment replay numeric policy is unsupported.')
        if node['op']=='source':
            states[node_id]=replay_history(graph,dispatcher,target=node_id)[node_id];continue
        if len(node['inputs'])!=1:
            raise GeometryError('Attachment replay requires exactly one current source dependency.')
        parent=states[node['inputs'][0]]
        if node['op']==OPERATION:
            if node['algorithmVersion']!=VERSION:
                raise GeometryError('Attachment replay algorithm version is unsupported; retained snapshot remains readable.')
            model=dispatch_attachment({'op':OPERATION,'model':parent['model'],'params':node['params']})
            model['id']=node['snapshot']['model']['id']
            model['metadata']['augmentation']['resultModelId']=model['id']
            verify_attachment_evidence(model)
            computed={**deepcopy(node['snapshot']),'model':model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary=record_source(create_history(),'verified-parent',parent)
            temporary=record_operation(temporary,'native-result','verified-parent',node['op'],
                                       node['params'],node['snapshot'],algorithm_version=node['algorithmVersion'],
                                       numeric_policy=node['numericPolicy'])
            computed=replay_history(temporary,dispatcher,target='native-result')['native-result']
            computed['model']['id']=node['snapshot']['model']['id']
        else:
            raise GeometryError('Unsupported attachment replay operation; retained snapshot remains readable.')
        expected=node['snapshot']['model']
        if (canonical_model(computed['model'])!=canonical_model(expected)
                or identity(computed['model'])!=node['resultFingerprint']
                or equivalent_json(computed['model'])!=equivalent_json(expected)):
            raise GeometryError('Attachment replay failed complete ordered geometry/source-attribute verification.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[node_id]=computed
    return states


def replay_attachment_document(document, target=None, dispatcher=native_dispatch):
    """Build a native document from the same verified history traversal."""
    source=checked_document(document); graph=validate_document_history(source)
    if graph is None: raise GeometryError('Attachment replay requires a recorded graph.')
    data=graph.to_dict()
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    states=replay_attachment_history(graph, dispatcher=dispatcher, target=target)
    state=states[target];state['operationNode']=target
    result={'id':str(uuid.uuid4()),'cursor':0,'states':[state],'operationHistory':data}
    return checked_document(result)


def branch_attachment(document, params, target=None, dispatcher=native_dispatch):
    source=checked_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Attachment parameter branches require recorded history.')
    target=target or source['states'][source['cursor']]['operationNode']
    node=next((n for n in graph.to_dict()['nodes'] if n['id']==target),None)
    if node is None or node['op']!=OPERATION:
        raise GeometryError('Select a recorded face attachment to branch.')
    parent=replay_attachment_document(source,target=node['parent'],dispatcher=dispatcher)
    return run_attachment(parent,params,'Parameter branch: '+OPERATION)
