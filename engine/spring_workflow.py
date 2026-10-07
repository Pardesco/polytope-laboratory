"""Source-owned persisted spring/0.1 workflow; registries are mounted by callers.

Finite work budgets define a recorded solve. Runtime timeout/cancellation abort
without adoption. A valid unresolved result needs explicit user adoption and
is never classified uniform or globally optimal.
"""
from copy import deepcopy
from functools import wraps
import hashlib
import json
import math
import time
import uuid

from engine.augmentation_workflow import bounded_bytes,checked_document,equivalent_json
from engine.formats import validate_project
from engine.geometry import GeometryError,identity
from engine.history import (NUMERIC_POLICY,REPLAY_OPERATIONS,canonical_model,
    create_history,record_source,record_operation,validate_history,validate_document_history,
    replay_history)
from engine import spring_relaxation as solver

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION ='spring-relaxation'
PREVIEW_OPERATION='spring-relaxation-preview'
VERSION='0.1.0'
MAX_BYTES=64*1024*1024
ADOPTIONS=('constraints-satisfied','valid-near-miss')
OWNER_KEYS={'workspaceId','documentId','generation','exporting'}


def structured(fn):
    @wraps(fn)
    def wrapped(*args,**kwargs):
        try:return fn(*args,**kwargs)
        except GeometryError:raise
        except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError) as exc:
            raise GeometryError('Malformed spring workflow: '+str(exc)) from exc
    return wrapped


def native_dispatch(request):
    from engine.server import dispatch
    return dispatch(request)


def digest(value,limit=MAX_BYTES):
    return hashlib.sha256(bounded_bytes(equivalent_json(value,limit),limit)).hexdigest()


def select_version(value=None):
    if value is None:return VERSION
    if type(value) is not str or value!=VERSION:
        raise GeometryError('Spring algorithm version unsupported; retained snapshots remain readable.')
    return value


def parameters(value,source):
    bounded_bytes(value,1024*1024)
    if type(value) is not dict or set(value)-{'solver','adoption'}:
        raise GeometryError('Spring parameters allow solver and adoption only.')
    adoption=value.get('adoption','constraints-satisfied')
    if type(adoption) is not str or adoption not in ADOPTIONS:
        raise GeometryError('Spring adoption is constraints-satisfied or explicit valid-near-miss.')
    raw=value.get('solver',{})
    checked,_,_=solver._source(source)
    # Validate literal seed/step/pin IDs before normalizing integral floats.
    solver._options(raw,checked)
    return {'solver':equivalent_json(raw,1024*1024),'adoption':adoption}


def owner_record(provider,document_id=None):
    if provider is None:return None
    if not callable(provider):raise GeometryError('Spring ownership provider must be callable.')
    owner=provider()
    bounded_bytes(owner,4096)
    if type(owner) is not dict or set(owner)!=OWNER_KEYS:
        raise GeometryError('Spring ownership requires workspaceId/documentId/generation/exporting.')
    if any(type(owner[key]) is not str or not 1<=len(owner[key])<=128 for key in ('workspaceId','documentId')):
        raise GeometryError('Spring workspace/document owner IDs are malformed.')
    if type(owner['generation']) is not int or not 0<=owner['generation']<=2**53-1 or type(owner['exporting']) is not bool:
        raise GeometryError('Spring owner generation/export state is malformed.')
    if owner['exporting']:raise GeometryError('Spring publication is unavailable during export.')
    if document_id is not None and owner['documentId']!=document_id:
        raise GeometryError('Spring source document is not the current publication owner.')
    return deepcopy(owner)


class Guard:
    """Runtime ownership only: none of this clock state becomes recipe params."""
    def __init__(self,original,params,*,cancel=None,get_owner=None,runtime=None,document_id=None):
        if cancel is not None and not callable(cancel):raise GeometryError('Spring cancel hook must be callable.')
        if runtime is None:runtime={}
        if type(runtime) is not dict or set(runtime)-{'max_seconds'}:
            raise GeometryError('Spring runtime allows an unrecorded max_seconds only.')
        seconds=runtime.get('max_seconds')
        if seconds is not None and (type(seconds) not in (int,float) or abs(seconds)>120 or not math.isfinite(seconds) or seconds<.001):
            raise GeometryError('Spring runtime timeout must be finite in [.001,120].')
        self.original=original;self.params=params;self.cancel=cancel;self.get_owner=get_owner
        self.document_id=document_id;self.owner=owner_record(get_owner,document_id)
        self.source_digest=digest(original);self.params_digest=digest(params,1024*1024)
        self.deadline=None if seconds is None else time.monotonic()+seconds
        self.check(full=True)

    def check(self,full=False):
        if self.cancel is not None:
            value=self.cancel()
            if type(value) is not bool:raise GeometryError('Spring cancel hook must return a boolean.')
            if value:raise GeometryError('Spring workflow canceled; no candidate adopted.')
        if owner_record(self.get_owner,self.document_id)!=self.owner:
            raise GeometryError('Spring source workspace/document/generation changed before publication.')
        if self.deadline is not None and time.monotonic()>self.deadline:
            raise GeometryError('Spring runtime timeout; no hardware-dependent partial result adopted or recorded.')
        if full and (digest(self.original)!=self.source_digest or digest(self.params,1024*1024)!=self.params_digest):
            raise GeometryError('Spring source/document/history or requested parameters changed before publication.')
        return False


def _preview(source,args,guard,progress):
    result=solver.relax_spring_network(source,args['solver'],cancel=guard.check,progress=progress)
    guard.check(full=True)
    valid=result['model'] is not None
    if valid:solver.verify_spring_candidate(result,source)
    response={'operation':PREVIEW_OPERATION,'algorithmVersion':VERSION,'result':result,
        'adoption':{'publishable':valid,'constraintsSatisfied':result['evidence']['requestedConstraintsSatisfied'],
            'requiresExplicitNearMiss':valid and not result['evidence']['requestedConstraintsSatisfied'],
            'uniformityEstablished':False,'optimizerExecutionCertified':False},
        'recipeRecorded':False,'runtimePartialPublished':False}
    bounded_bytes(response,solver.LIMITS['outputBytes']);guard.check(full=True)
    return response


@structured
def preview_spring(source,params=None,*,version=None,cancel=None,get_owner=None,runtime=None,progress=None):
    select_version(version);params={} if params is None else params
    guard=Guard(source,params,cancel=cancel,get_owner=get_owner,runtime=runtime)
    args=parameters(params,source)
    return _preview(deepcopy(source),args,guard,progress)


def _adopt(source,args,guard,progress):
    preview=_preview(source,args,guard,progress);result=preview['result']
    if result['model'] is None:
        raise GeometryError('Spring realization is not publishable: '+ '; '.join(result['evidence']['geometricValidity']['diagnostics']))
    satisfied=result['evidence']['requestedConstraintsSatisfied']
    if not satisfied and args['adoption']!='valid-near-miss':
        raise GeometryError('Spring residuals remain unresolved; explicit valid-near-miss adoption required.')
    model=deepcopy(result['model'])
    model['metadata']['springOperation']={'operation':OPERATION,'algorithmVersion':VERSION,
        'parameters':args,'sourceModelId':source['id'],'sourceSnapshotSha256':digest(source,solver.LIMITS['sourceBytes']),
        'resultFingerprint':identity(model),'resultStatus':result['status'],
        'adoption':args['adoption'],'requestedConstraintsSatisfied':satisfied,
        'numericalRealizationAccepted':True,'uniformityEstablished':False,'certified':False,
        'replayPolicy':'deterministic-work-budget/same-recorded-backend-v1',
        'runtimePartialPublished':False}
    model=equivalent_json(model,solver.LIMITS['outputBytes'])
    solver.verify_spring_candidate({**result,'model':model,'evidence':model['metadata']['springRelaxation']},source)
    validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[
        {'id':'spring-adoption-gate','cursor':0,'states':[{'model':model,'view':{}}]}]})
    guard.check(full=True)
    return model


@structured
def verify_spring_model(model,expected_source):
    bounded_bytes(model,solver.LIMITS['outputBytes'])
    metadata=model.get('metadata',{});record=metadata.get('springOperation');evidence=metadata.get('springRelaxation')
    if type(record) is not dict or type(evidence) is not dict:
        raise GeometryError('Spring adoption receipt is missing.')
    args=parameters(record.get('parameters'),expected_source)
    if equivalent_json(args['solver'])!=equivalent_json(evidence.get('requestedParameters')):
        raise GeometryError('Spring adoption controls differ from its numerical receipt.')
    verification=solver.verify_spring_candidate({'model':model,'evidence':evidence,'status':record.get('resultStatus'),
        'preview':None,'certified':False,'uniform':False},expected_source)
    satisfied=verification['constraintsSatisfied']
    expected={'operation':OPERATION,'algorithmVersion':VERSION,'parameters':args,
        'sourceModelId':expected_source['id'],'sourceSnapshotSha256':digest(expected_source,solver.LIMITS['sourceBytes']),
        'resultFingerprint':identity(model),'resultStatus':record.get('resultStatus'),
        'adoption':args['adoption'],'requestedConstraintsSatisfied':satisfied,
        'numericalRealizationAccepted':True,'uniformityEstablished':False,'certified':False,
        'replayPolicy':'deterministic-work-budget/same-recorded-backend-v1','runtimePartialPublished':False}
    if equivalent_json(record)!=equivalent_json(expected) or not satisfied and args['adoption']!='valid-near-miss':
        raise GeometryError('Spring adoption/version/source/policy receipt is forged or unresolved.')
    return {**verification,'algorithmVersion':VERSION,'adoption':args['adoption'],'executionCertified':False}


@structured
def adopt_spring(source,params=None,*,version=None,cancel=None,get_owner=None,runtime=None,progress=None):
    select_version(version);params={} if params is None else params
    guard=Guard(source,params,cancel=cancel,get_owner=get_owner,runtime=runtime)
    args=parameters(params,source)
    return _adopt(deepcopy(source),args,guard,progress)


@structured
def dispatch_spring(request,**runtime_hooks):
    bounded_bytes(request,solver.LIMITS['outputBytes'])
    if type(request) is not dict or not {'op','model','params'}<=set(request) or set(request)-{'op','model','params','algorithmVersion','id'}:
        raise GeometryError('Spring dispatch requires op/model/params and optional algorithmVersion/correlation ID.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or type(correlation) is int and 0<=correlation<=2**53-1):
        raise GeometryError('Spring correlation ID is malformed.')
    operation=request['op']
    if operation not in (OPERATION,PREVIEW_OPERATION):raise GeometryError('Unsupported spring dispatch operation.')
    fn=adopt_spring if operation==OPERATION else preview_spring
    return fn(request['model'],request['params'],version=request.get('algorithmVersion'),**runtime_hooks)


def _document(document):
    bounded_bytes(document,MAX_BYTES)
    # Native validation precedes any portable-number normalization.
    return checked_document(json.loads(bounded_bytes(document,MAX_BYTES)))


def _view(view):
    result=deepcopy(view)
    for key in ('entitySelection','sectionAlignment','orientationFrame','cellFacingCache',
        'net','cellNet','foldFraction','explosionAmount','animation'):
        result.pop(key,None)
    result.update(cellFacing='all',hiddenCells=[],isolatedCell=None)
    return result


@structured
def run_spring(document,params,label='Spring relaxation',version=None,*,cancel=None,get_owner=None,runtime=None,progress=None):
    select_version(version)
    if type(label) is not str or not 1<=len(label)<=256:raise GeometryError('Spring label must be bounded text.')
    guard=Guard(document,params,cancel=cancel,get_owner=get_owner,runtime=runtime,document_id=document.get('id') if type(document) is dict else None)
    result=_document(document);graph=validate_document_history(result)
    if graph is None:
        graph=create_history()
        for state in result['states']:
            key=str(uuid.uuid4());graph=record_source(graph,key,state);state['operationNode']=key
    source=result['states'][result['cursor']]
    node=next(n for n in graph.to_dict()['nodes'] if n['id']==source['operationNode'])
    if equivalent_json(source['model'])!=equivalent_json(node['snapshot']['model']) or content_source_changed(source, node['snapshot']):
        key=str(uuid.uuid4());graph=record_source(graph,key,source,parent=source['operationNode']);source['operationNode']=key
    args=parameters(params,source['model']);model=_adopt(source['model'],args,guard,progress)
    key=str(uuid.uuid4());state={'model':model,'view':_view(source['view']),
        'notes':source.get('notes',''),'label':label,'operationNode':key}
    state = transfer_content_state(source, state, OPERATION)
    graph=record_operation(graph,key,source['operationNode'],OPERATION,args,state,algorithm_version=VERSION)
    result['states']=(result['states'][:result['cursor']+1]+[state])[-200:]
    result['cursor']=len(result['states'])-1;result['operationHistory']=graph.to_dict()
    result=_document(result);guard.check(full=True)
    return result


def _backend():
    return {'solver':'scipy.optimize.least_squares/trf/lsmr','scipyVersion':solver.scipy.__version__,
        'numpyVersion':solver.np.__version__,'randomGenerator':'numpy.PCG64/default_rng'}


@structured
def replay_spring_history(history,dispatcher=native_dispatch,target=None,*,cancel=None,get_owner=None,runtime=None):
    original=history.to_dict() if hasattr(history,'to_dict') else history
    guard=Guard(original,{'target':target},cancel=cancel,get_owner=get_owner,runtime=runtime)
    graph=validate_history(original);data=graph.to_dict();nodes={n['id']:n for n in data['nodes']}
    if target is not None and (type(target) is not str or not 1<=len(target)<=128 or target not in nodes):
        raise GeometryError('Spring replay target must name a bounded existing node.')
    required=set(nodes) if target is None else set();pending=[] if target is None else [target]
    while pending:
        key=pending.pop()
        if key not in required:required.add(key);pending.extend(nodes[key]['inputs'])
    states={}
    for node in data['nodes']:
        key=node['id']
        if key not in required:continue
        guard.check()
        if node['numericPolicy']!=NUMERIC_POLICY:raise GeometryError('Spring replay numeric policy unsupported.')
        if node['op']=='source':states[key]=deepcopy(node['snapshot']);continue
        if len(node['inputs'])!=1:raise GeometryError('Spring replay requires one verified parent.')
        parent=states[node['inputs'][0]]
        if node['op']==OPERATION:
            select_version(node['algorithmVersion'])
            implementation=node['snapshot']['model'].get('metadata',{}).get('springRelaxation',{}).get('implementation')
            if implementation!=_backend():
                raise GeometryError('Spring replay solver/backend differs; retained snapshot stays readable.')
            args=parameters(node['params'],parent['model']);model=_adopt(parent['model'],args,guard,None)
            computed={**deepcopy(node['snapshot']),'model':model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary=record_source(create_history(),'verified-spring-parent',parent)
            temporary=record_operation(temporary,'native-result','verified-spring-parent',node['op'],node['params'],node['snapshot'],algorithm_version=node['algorithmVersion'])
            computed=replay_history(temporary,dispatcher,target='native-result')['native-result']
            computed['model']['id']=node['snapshot']['model']['id']
        else:raise GeometryError('Spring replay operation unsupported; retained snapshots stay readable.')
        expected=node['snapshot']['model']
        if (canonical_model(computed['model'])!=canonical_model(expected) or identity(computed['model'])!=node['resultFingerprint'] or
            equivalent_json(computed['model'],solver.LIMITS['outputBytes'])!=equivalent_json(expected,solver.LIMITS['outputBytes'])):
            raise GeometryError('Spring replay full geometry/attributes/source/residual verification failed.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[key]=computed
    guard.check(full=True)
    return states


@structured
def replay_spring_document(document,target=None,dispatcher=native_dispatch,**runtime_hooks):
    guard=Guard(document,{'target':target},**runtime_hooks,document_id=document.get('id') if type(document) is dict else None)
    result=_document(document);graph=validate_document_history(result)
    if graph is None:raise GeometryError('Spring replay requires a recorded graph.')
    target=result['states'][result['cursor']]['operationNode'] if target is None else target
    states=replay_spring_history(graph,dispatcher,target,cancel=guard.check)
    state=states[target];state['operationNode']=target
    output=_document({'id':str(uuid.uuid4()),'cursor':0,'states':[state],'operationHistory':graph.to_dict()})
    guard.check(full=True);return output


@structured
def branch_spring(document,params,target=None,dispatcher=native_dispatch,**runtime_hooks):
    guard=Guard(document,params,**runtime_hooks,document_id=document.get('id') if type(document) is dict else None)
    result=_document(document);graph=validate_document_history(result)
    if graph is None:raise GeometryError('Spring branch requires a recorded graph.')
    if target is not None and (type(target) is not str or not 1<=len(target)<=128):raise GeometryError('Spring branch target must be a bounded literal ID.')
    target=result['states'][result['cursor']]['operationNode'] if target is None else target
    node=next((n for n in graph.to_dict()['nodes'] if n['id']==target),None)
    if node is None or node['op']!=OPERATION:raise GeometryError('Select a spring operation to branch.')
    version=select_version(node['algorithmVersion'])
    parent=replay_spring_document(result,node['parent'],dispatcher,cancel=guard.check)
    output=run_spring(parent,params,'Parameter branch: spring',version,cancel=guard.check)
    guard.check(full=True);return output
