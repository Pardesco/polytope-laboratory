"""Strict4D convex-core dispatch and immutable full-attribute native history.

Registration belongs to the application. Native ancestors are replayed through
source-only temporary graphs; the server dependency is deliberately lazy.
"""
from copy import deepcopy
from functools import wraps
import json
import hashlib
import uuid

from .augmentation_workflow import bounded_bytes, checked_document, equivalent_json
from .compounds import _check_source
from .convex_core4d import convex_core4d, VERSION as KERNEL_VERSION, LIMITS, _native_gate
from .geometry import GeometryError, identity
from .history import (NUMERIC_POLICY, REPLAY_OPERATIONS, MAX_NODE_BYTES,
    canonical_model, create_history, record_operation, record_source,
    replay_history, validate_document_history, validate_history)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION = 'convex-core-4d'
VERSION = '0.1.0'
MAX_SAFE_INTEGER = 2**53-1


def _structured(function):
    @wraps(function)
    def checked(*args,**kwargs):
        try:return function(*args,**kwargs)
        except GeometryError:raise
        except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError) as exc:
            raise GeometryError('Malformed4D core workflow data: '+str(exc)) from exc
    return checked


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


@_structured
def parameters(value):
    bounded_bytes(value, LIMITS['inputBytes'])
    if (type(value) is not dict or 'center' not in value
            or set(value)-{'center', 'tolerance', 'color_policy'}):
        raise GeometryError('Convex core parameters require center and only optional tolerance/color_policy.')
    if type(value['center']) is not list or len(value['center']) != 4:
        raise GeometryError('Convex core center must be a literal four-coordinate array.')
    return _portable_json(value, LIMITS['inputBytes'])


def dispatch_convex_core4d(request):
    """Return a validated Model for the strict convex-core-4d 0.1.0 envelope."""
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
        model = convex_core4d(source, **args)
        # A current output ID binds the full semantic source and normalized
        # construction parameters, never the correlation ID or a kernel UUID.
        binding={'operation':OPERATION,'algorithmVersion':VERSION,'kernelVersion':KERNEL_VERSION,
                 'source':source,'parameters':model['provenance']['parameters']}
        model['id']='convex-core-4d-'+hashlib.sha256(bounded_bytes(binding,MAX_NODE_BYTES)).hexdigest()
        model['provenance'].update(operation=OPERATION,algorithmVersion=VERSION,kernelVersion=KERNEL_VERSION)
        evidence=model['metadata']['convexCore4d']
        evidence['workflow']={'operation':OPERATION,'algorithmVersion':VERSION,'kernelVersion':KERNEL_VERSION,
            'identityBinding':'sha256 of semantic full source and normalized kernel parameters; no authenticity certificate'}
        evidence['resultModelId']=model['id']
        evidence['classification']['sourceModelId']=model['id']
        # Gate the output's historical snapshots, exact lineage and numerical
        # evidence under the same cross-language spelling policy as its input.
        model=_portable_json(model, LIMITS['outputBytes'])
        _native_gate(model)
        return model
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError,
            UnicodeError, RecursionError) as exc:
        raise GeometryError('Malformed convex core request: '+str(exc)) from exc


def verify_convex_core4d_workflow_evidence(model):
    """Reconstruct full adapter output, including its deterministic current ID."""
    try:
        bounded_bytes(model,LIMITS['outputBytes'])
        evidence=model['metadata']['convexCore4d'];provenance=model['provenance']
        if (provenance['operation']!=OPERATION or provenance['algorithmVersion']!=VERSION
                or provenance['kernelVersion']!=KERNEL_VERSION
                or evidence['resultModelId']!=model['id'] or evidence['resultFingerprint']!=identity(model)
                or evidence['resultInterpretation']!=model['interpretation']
                or evidence['workflow']['kernelVersion']!=KERNEL_VERSION):
            raise GeometryError('4D core workflow evidence unsupported or stale against current identity.')
        expected=dispatch_convex_core4d({'op':OPERATION,'model':evidence['sourceModel'],
            'params':provenance['parameters'],'algorithmVersion':VERSION})
        if equivalent_json(expected)!=equivalent_json(model):
            raise GeometryError('4D core workflow full source/maps/cell RGBA/units/identity/evidence reconstruction disagrees.')
        return {'passed':True,'resultModelId':model['id'],'resultFingerprint':identity(model),
            'algorithmVersion':VERSION,'kernelVersion':KERNEL_VERSION,
            'scope':'complete fresh reconstruction; no exact/uniform/installed-output or authorship certification'}
    except GeometryError:raise
    except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError) as exc:
        raise GeometryError('Malformed4D core workflow evidence: '+str(exc)) from exc


@_structured
def run_convex_core4d(document, params, label='4D convex core'):
    args = parameters(params)
    if type(label) is not str or not 1 <= len(label) <= 256:
        raise GeometryError('Convex core state label must be a bounded nonempty string.')
    bounded_bytes(label,4096)
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
    model = dispatch_convex_core4d({'op': OPERATION, 'model': source['model'], 'params': args})
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


@_structured
def replay_convex_core4d_history(history, dispatcher=native_dispatch, target=None):
    """Verify complete model attributes for every required dependency state."""
    graph = validate_history(history)
    data = graph.to_dict()
    nodes = {node['id']: node for node in data['nodes']}
    if target is not None and (type(target) is not str or not 1<=len(target)<=128):
        raise GeometryError('4D core replay target requires a bounded literal node ID.')
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
            model = dispatch_convex_core4d({'op': OPERATION, 'model': parent['model'],
                'params': node['params'], 'algorithmVersion': VERSION})
            verify_convex_core4d_workflow_evidence(model)
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


@_structured
def replay_convex_core4d_document(document, target=None, dispatcher=native_dispatch):
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Convex core replay requires a recorded operation graph.')
    target = source['states'][source['cursor']]['operationNode'] if target is None else target
    states = replay_convex_core4d_history(graph, dispatcher, target)
    state = states[target]
    state['operationNode'] = target
    return checked_document({'id': str(uuid.uuid4()), 'cursor': 0, 'states': [state],
                             'operationHistory': graph.to_dict()})


@_structured
def branch_convex_core4d(document, params, target=None, dispatcher=native_dispatch):
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Convex core branches require a recorded operation graph.')
    if target is not None and (type(target) is not str or not 1<=len(target)<=128):
        raise GeometryError('4D core branch target requires a bounded literal node ID.')
    target = target or source['states'][source['cursor']]['operationNode']
    node = next((node for node in graph.to_dict()['nodes'] if node['id'] == target), None)
    if node is None or node['op'] != OPERATION:
        raise GeometryError('Select a recorded convex core to branch.')
    parent = replay_convex_core4d_document(source, node['parent'], dispatcher)
    return run_convex_core4d(parent, params, 'Parameter branch: '+OPERATION)


@_structured
def dispatch_workflow(request,dispatcher=native_dispatch):
    """Isolated proposed recipe hooks; never patch native/global registries.

    Other operation dispatch stays actual native dispatch. Ordinary branches
    replay their original parent through this adapter, then use native recipes.
    This is not the production JSON-lines server or a filesystem capability.
    """
    bounded_bytes(request,MAX_NODE_BYTES)
    if type(request) is not dict or type(request.get('op')) is not str:
        raise GeometryError('4D core workflow request requires a native operation envelope.')
    if request['op']==OPERATION:return dispatch_convex_core4d(request)
    if request['op'] not in ('recipe-run','recipe-replay','recipe-branch'):
        return dispatcher(request)
    if set(request)-{'op','params','model','id'} or type(request.get('params')) is not dict:
        raise GeometryError('4D core workflow recipe envelope contains unknown fields.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128
            or type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):
        raise GeometryError('4D core recipe correlation ID outside native envelope domain.')
    args=request['params'];operation=request['op']
    allowed={'document','operation','parameters','label'} if operation=='recipe-run' else {'document','target'}
    if operation=='recipe-branch':allowed.add('parameters')
    if 'document' not in args or set(args)-allowed:
        raise GeometryError('4D core workflow recipe parameters contain missing/unknown fields.')
    if 'target' in args and args['target'] is not None and (type(args['target']) is not str or not 1<=len(args['target'])<=128):
        raise GeometryError('4D core workflow recipe target requires a bounded literal node ID.')
    if operation=='recipe-run':
        if not {'operation','parameters'}<=set(args):raise GeometryError('Recipe run requires operation and parameters.')
        if type(args['operation']) is not str or type(args['parameters']) is not dict:
            raise GeometryError('Recipe run requires a literal operation and parameter object.')
        if args['operation']==OPERATION:
            return run_convex_core4d(args['document'],args['parameters'],args.get('label') or '4D convex core')
        return dispatcher(request)
    if operation=='recipe-replay':
        return replay_convex_core4d_document(args['document'],target=args.get('target'),dispatcher=dispatcher)
    if 'parameters' not in args:raise GeometryError('Recipe branch requires parameters.')
    source=checked_document(args['document']);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Recipe branch requires recorded history.')
    target=args.get('target') or source['states'][source['cursor']]['operationNode']
    node=next((row for row in graph.to_dict()['nodes'] if row['id']==target),None)
    if node is None:raise GeometryError('Recipe branch target unavailable.')
    if node['op']==OPERATION:return branch_convex_core4d(source,args['parameters'],target,dispatcher)
    if node['op'] not in REPLAY_OPERATIONS:raise GeometryError('Recipe branch operation unsupported.')
    parent=replay_convex_core4d_document(source,node['parent'],dispatcher)
    return dispatcher({'op':'recipe-run','params':{'document':parent,'operation':node['op'],
        'parameters':args['parameters'],'label':'Parameter branch: '+node['op']}})
