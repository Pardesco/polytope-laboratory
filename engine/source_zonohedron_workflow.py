"""Portable source-zonohedron dispatch and full-attribute history.

The frozen source kernel owns outer IDs and nested support receipts. This
adapter canonicalizes the supplied semantic source before first publication;
it never rewrites a caller's output identity to make verification succeed.
"""
from copy import deepcopy
from functools import wraps
import json
import uuid

from .source_zonohedron import (source_zonohedron,
    verify_source_zonohedron, VERSION as KERNEL_VERSION)
from engine.augmentation import _source
from engine.augmentation_workflow import bounded_bytes, checked_document, equivalent_json
from engine.geometry import GeometryError,identity
from engine.history import (NUMERIC_POLICY,REPLAY_OPERATIONS,MAX_NODE_BYTES,
    canonical_model,create_history,record_source,record_operation,replay_history,
    validate_history,validate_document_history)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION ='source-zonohedron'
VERSION='0.1.0'
INPUT_BYTES=16*1024*1024
OUTPUT_BYTES=64*1024*1024
DOCUMENT_BYTES=64*1024*1024
MAX_SAFE_INTEGER=2**53-1


def _structured(fn):
    @wraps(fn)
    def checked(*args,**kwargs):
        try:return fn(*args,**kwargs)
        except GeometryError:raise
        except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError) as exc:
            raise GeometryError('Malformed source-zonohedron workflow data: '+str(exc)) from exc
    return checked


def native_dispatch(request):
    from engine.server import dispatch
    return dispatch(request)


def _portable(value,limit):
    detached=json.loads(bounded_bytes(value,limit));stack=[detached]
    while stack:
        item=stack.pop()
        if type(item) is dict:stack.extend(item.values())
        elif type(item) is list:stack.extend(item)
        elif type(item) is float and item.is_integer() and MAX_SAFE_INTEGER<abs(item)<1e21:
            raise GeometryError('Source zonohedron unsafe decimal integer float must use a string attribute.')
    return equivalent_json(detached,limit)


def _semantic(value,limit=OUTPUT_BYTES):
    # JSON bytes, not Python equality: true and1 are distinct attributes.
    return bounded_bytes(_portable(value,limit),limit)


def _document(value):
    detached=json.loads(bounded_bytes(value,DOCUMENT_BYTES))
    result=checked_document(detached) # Raw incidence validation before canonicalization.
    _portable(result,DOCUMENT_BYTES)
    return result


@_structured
def parameters(value):
    bounded_bytes(value,1024*1024)
    if type(value) is not dict or 'selections' not in value or set(value)-{'selections','center','edge_length','max_zones'}:
        raise GeometryError('Source zonohedron requires selections and only center/edge_length/max_zones options.')
    selections=value['selections']
    if type(selections) is not list or not 1<=len(selections)<=16:
        raise GeometryError('Selections require1..16 literal groups.')
    for group in selections:
        if type(group) is not dict or set(group)!={'kind','ids'} or type(group['kind']) is not str or group['kind'] not in ('vertices','edges','faces','world-axes'):
            raise GeometryError('Selection group requires supported literal kind and ids only.')
        ids=group['ids']
        if type(ids) is not list or not 1<=len(ids)<=64 or any(type(i) is not int or not 0<=i<100000 for i in ids) or len(set(ids))!=len(ids):
            raise GeometryError('Selection IDs require bounded distinct literal integers.')
    center=value.get('center',[0,0,0]);edge_length=value.get('edge_length',1);max_zones=value.get('max_zones')
    if type(center) is not list or len(center)!=3 or any(type(x) not in (int,float) for x in center):
        raise GeometryError('Center requires three literal numeric coordinates.')
    if type(edge_length) not in (int,float):raise GeometryError('Edge length requires a literal number.')
    if max_zones is not None and (type(max_zones) is not int or not 1<=max_zones<=32):
        raise GeometryError('Maximum zones requires a literal integer1..32 or null.')
    return _portable({'selections':selections,'center':center,'edge_length':edge_length,'max_zones':max_zones},1024*1024)


@_structured
def dispatch_source_zonohedron(request):
    bounded_bytes(request,MAX_NODE_BYTES)
    if type(request) is not dict or not {'op','model','params'}<=set(request) or set(request)-{'op','model','params','id','algorithmVersion'} or request['op']!=OPERATION:
        raise GeometryError('Source-zonohedron request requires op/model/params and optional version/correlation only.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Source-zonohedron algorithm version unsupported.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):
        raise GeometryError('Source-zonohedron correlation ID malformed.')
    bounded_bytes(request['model'],INPUT_BYTES);_source(request['model']) # Raw float/bool incidence cannot be repaired.
    source=_portable(request['model'],INPUT_BYTES);args=parameters(request['params'])
    result=source_zonohedron(source,**args)
    # Only the outer source verifier understands adapted identity/units. The
    # nested support ID is intentionally its original generated boundary ID.
    verify_source_zonohedron(result)
    _portable(result,OUTPUT_BYTES) # Validate, without modifying kernel output spellings.
    return result


@_structured
def verify_source_zonohedron_workflow_evidence(model):
    bounded_bytes(model,OUTPUT_BYTES);e=model['metadata']['sourceZonohedron']
    if e['algorithmVersion']!=VERSION or e['resultModelId']!=model['id'] or e['resultFingerprint']!=identity(model):
        raise GeometryError('Source-zonohedron outer evidence is stale or unsupported.')
    params={'selections':e['selections'],'center':e['center'],'edge_length':e['edgeLength'],'max_zones':e['maxZones']}
    expected=dispatch_source_zonohedron({'op':OPERATION,'model':e['sourceModel'],'params':params,'algorithmVersion':VERSION})
    if _semantic(expected)!=_semantic(model):
        raise GeometryError('Source-zonohedron complete source/owners/units/RGBA/inner and outer receipt verification failed.')
    return {'passed':True,'algorithmVersion':VERSION,'kernelVersion':KERNEL_VERSION,
        'resultModelId':model['id'],'certified':False,'scope':'portable full regeneration; no installed baseline or exact realization certificate'}


@_structured
def run_source_zonohedron(document,params,label='Source zonohedron'):
    args=parameters(params)
    if type(label) is not str or not 1<=len(label)<=256:raise GeometryError('Source-zonohedron label must be bounded nonempty text.')
    result=_document(document);graph=validate_document_history(result)
    if graph is None:
        graph=create_history()
        for state in result['states']:
            node_id=str(uuid.uuid4());graph=record_source(graph,node_id,state);state['operationNode']=node_id
    source=result['states'][result['cursor']]
    retained=next(n for n in graph.to_dict()['nodes'] if n['id']==source['operationNode'])
    if _semantic(source['model'],INPUT_BYTES)!=_semantic(retained['snapshot']['model'],INPUT_BYTES) or content_source_changed(source, retained['snapshot']):
        node_id=str(uuid.uuid4());graph=record_source(graph,node_id,source,parent=source['operationNode']);source['operationNode']=node_id
    model=dispatch_source_zonohedron({'op':OPERATION,'model':source['model'],'params':args})
    view=deepcopy(source['view'])
    for key in ('entitySelection','sectionAlignment','orientationFrame','cellFacingCache','net','cellNet','foldFraction','explosionAmount','animation','camera','derivedCamera'):
        view.pop(key,None)
    view.update(entity=0,cellFacing='all',hiddenCells=[],isolatedCell=None)
    if view.get('symmetry'):view['symmetry']['generatorIds']=''
    if view.get('stellation'):view['stellation']['searchGeneratorIds']=''
    node_id=str(uuid.uuid4());state={'model':model,'view':view,'label':label,'notes':source.get('notes',''),'operationNode':node_id}
    state = transfer_content_state(source, state, OPERATION)
    graph=record_operation(graph,node_id,source['operationNode'],OPERATION,args,state,algorithm_version=VERSION)
    result['states']=(result['states'][:result['cursor']+1]+[state])[-200:];result['cursor']=len(result['states'])-1
    result['operationHistory']=graph.to_dict();return _document(result)


@_structured
def replay_source_zonohedron_history(history,dispatcher=native_dispatch,target=None):
    raw=history.to_dict() if hasattr(history,'to_dict') else history
    bounded_bytes(raw,128*1024*1024);graph=validate_history(raw);_portable(raw,128*1024*1024)
    data=graph.to_dict();nodes={n['id']:n for n in data['nodes']}
    if target is not None and (type(target) is not str or not 1<=len(target)<=128 or target not in nodes):
        raise GeometryError('Source-zonohedron replay target requires a bounded existing node ID.')
    required=set(nodes) if target is None else set();pending=[] if target is None else [target]
    while pending:
        node_id=pending.pop()
        if node_id not in required:required.add(node_id);pending.extend(nodes[node_id]['inputs'])
    states={}
    for node in data['nodes']:
        node_id=node['id']
        if node_id not in required:continue
        if node['numericPolicy']!=NUMERIC_POLICY:raise GeometryError('Source-zonohedron numeric policy unsupported.')
        if node['op']=='source':
            states[node_id]=replay_history(graph,dispatcher,target=node_id)[node_id];continue
        if len(node['inputs'])!=1:raise GeometryError('Source-zonohedron replay requires one verified dependency.')
        parent=states[node['inputs'][0]]
        if node['op']==OPERATION:
            model=dispatch_source_zonohedron({'op':OPERATION,'model':parent['model'],'params':node['params'],'algorithmVersion':node['algorithmVersion']})
            computed={**deepcopy(node['snapshot']),'model':model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary=record_source(create_history(),'verified-zonohedron-parent',parent)
            temporary=record_operation(temporary,'native-result','verified-zonohedron-parent',node['op'],node['params'],node['snapshot'],algorithm_version=node['algorithmVersion'])
            def recorded_dispatch(request):
                # A legacy cell must not acquire the current extraction policy
                # merely because its verified parent has zonohedron ancestry.
                if request.get('op')==node['op'] and node['op'] in ('cell','polygon-prism','spring-relaxation'):
                    request={**request,'algorithmVersion':node['algorithmVersion']}
                return dispatcher(request)
            computed=replay_history(temporary,recorded_dispatch,target='native-result')['native-result'];computed['model']['id']=node['snapshot']['model']['id']
        else:raise GeometryError('Source-zonohedron replay operation unsupported; retained snapshot remains readable.')
        if canonical_model(computed['model'])!=canonical_model(node['snapshot']['model']) or identity(computed['model'])!=node['resultFingerprint'] or _semantic(computed['model'])!=_semantic(node['snapshot']['model']):
            raise GeometryError('Source-zonohedron replay full geometry/source attributes/evidence disagrees.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[node_id]=computed
    return states


@_structured
def replay_source_zonohedron_document(document,target=None,dispatcher=native_dispatch):
    source=_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Source-zonohedron replay requires a recorded graph.')
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    states=replay_source_zonohedron_history(graph,dispatcher,target);state=states[target];state['operationNode']=target
    return _document({'id':str(uuid.uuid4()),'cursor':0,'states':[state],'operationHistory':graph.to_dict()})


@_structured
def branch_source_zonohedron(document,params,target=None,dispatcher=native_dispatch):
    source=_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Source-zonohedron branch requires a recorded graph.')
    if target is not None and (type(target) is not str or not 1<=len(target)<=128):raise GeometryError('Source-zonohedron branch target requires a bounded literal node ID.')
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    node=next((n for n in graph.to_dict()['nodes'] if n['id']==target),None)
    if node is None or node['op']!=OPERATION or node['algorithmVersion']!=VERSION:
        raise GeometryError('Select a supported source-zonohedron node to branch.')
    parent=replay_source_zonohedron_document(source,node['parent'],dispatcher)
    return run_source_zonohedron(parent,params,'Parameter branch: '+OPERATION)


@_structured
def dispatch_workflow(request,dispatcher=native_dispatch):
    bounded_bytes(request,MAX_NODE_BYTES)
    if type(request) is not dict or type(request.get('op')) is not str:raise GeometryError('Source-zonohedron workflow requires an operation envelope.')
    operation=request['op']
    if operation==OPERATION:return dispatch_source_zonohedron(request)
    if operation not in ('recipe-run','recipe-replay','recipe-branch'):return dispatcher(request)
    if set(request)-{'op','params','id','model'} or type(request.get('params')) is not dict:
        raise GeometryError('Source-zonohedron recipe envelope contains missing/unknown fields.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):
        raise GeometryError('Source-zonohedron recipe correlation ID malformed.')
    args=request['params'];allowed={'document','operation','parameters','label'} if operation=='recipe-run' else {'document','target'}
    if operation=='recipe-branch':allowed.add('parameters')
    if 'document' not in args or set(args)-allowed:raise GeometryError('Source-zonohedron recipe fields malformed.')
    if 'target' in args and args['target'] is not None and (type(args['target']) is not str or not 1<=len(args['target'])<=128):
        raise GeometryError('Source-zonohedron recipe target requires a bounded literal node ID.')
    if operation=='recipe-run':
        if not {'operation','parameters'}<=set(args) or type(args['operation']) is not str or type(args['parameters']) is not dict:
            raise GeometryError('Source-zonohedron recipe-run requires operation and parameters.')
        if args['operation']==OPERATION:
            return run_source_zonohedron(args['document'],args['parameters'],args.get('label','Source zonohedron'))
        return dispatcher(request)
    if operation=='recipe-replay':return replay_source_zonohedron_document(args['document'],args.get('target'),dispatcher)
    if 'parameters' not in args:raise GeometryError('Source-zonohedron branch requires parameters.')
    source=_document(args['document']);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Source-zonohedron branch requires recorded history.')
    target=args.get('target') if args.get('target') is not None else source['states'][source['cursor']]['operationNode']
    node=next((n for n in graph.to_dict()['nodes'] if n['id']==target),None)
    if node is None:raise GeometryError('Source-zonohedron branch target unavailable.')
    if node['op']==OPERATION:return branch_source_zonohedron(source,args['parameters'],target,dispatcher)
    if node['op'] not in REPLAY_OPERATIONS:raise GeometryError('Source-zonohedron branch operation unsupported.')
    if node['op']=='cell':
        # Cell0.1/0.2 are independent recorded semantics. Its own branch helper
        # retains the selected version and verifies the original dependency.
        from .cell_attributes import branch_cell
        return branch_cell(source,args['parameters'],target,dispatcher)
    parent=replay_source_zonohedron_document(source,node['parent'],dispatcher)
    return dispatcher({'op':'recipe-run','params':{'document':parent,'operation':node['op'],'parameters':args['parameters'],'label':'Parameter branch: '+node['op']}})
