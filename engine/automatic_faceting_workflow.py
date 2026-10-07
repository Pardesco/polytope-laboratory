"""Isolated candidate 0.21 integration: strict automatic-faceting envelopes.

Search jobs are read-only. Adoption verifies the deterministic search (or its
recorded cancellation prefix), selected cycles and native realization before
publishing a complete model/history snapshot. This is not Stella parity.
"""
from copy import deepcopy
from functools import wraps
import hashlib
import json
import uuid

from .automatic_faceting import (VERSION as KERNEL_VERSION, CRITERIA_KEYS,
    candidate_facets, enumerate_facetings, realize_faceting, _source)
from .augmentation_workflow import bounded_bytes, checked_document, equivalent_json
from .geometry import GeometryError, identity
from .history import (NUMERIC_POLICY, REPLAY_OPERATIONS, MAX_NODE_BYTES,
    canonical_model, create_history, record_source, record_operation,
    replay_history, validate_history, validate_document_history)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION ='facet-adopt'
VERSION='0.1.0'
READ_OPERATIONS=('facet-candidates','facet-search')
INPUT_BYTES=16*1024*1024
OUTPUT_BYTES=64*1024*1024
DOCUMENT_BYTES=64*1024*1024
MAX_SAFE_INTEGER=2**53-1
GENERATION_KEYS={'max_face_vertices','max_candidates','max_cycles_per_plane','symmetry_permutations','source_symmetry'}
SEARCH_KEYS=GENERATION_KEYS|{'candidate_ids','criteria','node_limit','result_limit','equivalence','invariant_under_subgroup'}


def _structured(fn):
    @wraps(fn)
    def checked(*args,**kwargs):
        try:return fn(*args,**kwargs)
        except GeometryError:raise
        except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError) as exc:
            raise GeometryError('Malformed automatic faceting data: '+str(exc)) from exc
    return checked


def native_dispatch(request):
    from .server import dispatch
    return dispatch(request)


def _portable(value,limit):
    detached=json.loads(bounded_bytes(value,limit));stack=[detached]
    while stack:
        item=stack.pop()
        if type(item) is dict:stack.extend(item.values())
        elif type(item) is list:stack.extend(item)
        elif type(item) is int and abs(item)>MAX_SAFE_INTEGER:
            raise GeometryError('Unsafe integer source attributes must use strings for portable faceting history.')
        elif type(item) is float and item.is_integer() and MAX_SAFE_INTEGER<abs(item)<1e21:
            raise GeometryError('Unsafe decimal integer floats must use strings for portable faceting history.')
    return equivalent_json(detached,limit)


def _semantic(value,limit=OUTPUT_BYTES):return bounded_bytes(_portable(value,limit),limit)


def _document(value):
    result=json.loads(bounded_bytes(value,DOCUMENT_BYTES))
    # Native project validation refreshes derived measures/fingerprints. Run
    # its complete gate on a separate copy; ownership binds the literal input,
    # including whether optional cached fields were supplied in that snapshot.
    checked_document(deepcopy(result))
    return _portable(result,DOCUMENT_BYTES)


@_structured
def parameters(value,operation=OPERATION):
    bounded_bytes(value,INPUT_BYTES)
    allowed=GENERATION_KEYS if operation=='facet-candidates' else SEARCH_KEYS if operation=='facet-search' else {'search','result_id'}
    if operation not in (*READ_OPERATIONS,OPERATION) or type(value) is not dict or set(value)-allowed:
        raise GeometryError('Faceting requires exact supported parameter keys; callbacks/paths/unknown criteria are not JSON job options.')
    if operation==OPERATION and (set(value)!={'search','result_id'} or type(value['search']) is not dict or
        type(value['result_id']) is not str or not 1<=len(value['result_id'])<=128):
        raise GeometryError('Facet adoption requires a retained search object and bounded literal result_id.')
    return _portable(value,INPUT_BYTES)


@_structured
def verify_search(source,search):
    """Reexecute bounded deterministic search; canceled jobs qualify a prefix."""
    bounded_bytes(search,INPUT_BYTES)
    if type(search) is not dict or search.get('version')!=KERNEL_VERSION:
        raise GeometryError('Unsupported or malformed faceting search version.')
    domain=search['domain'];limits=search['limits'];group=search['symmetry']['group']
    args={'max_face_vertices':domain['maximumFaceVertices'],'max_candidates':domain['maximumCandidates'],
        'max_cycles_per_plane':domain['maximumCyclesPerPlane'],'symmetry_permutations':group['permutations'],
        'node_limit':limits['nodeLimit'],'result_limit':limits['resultLimit'],
        'criteria':{key:search['criteria'][key] for key in CRITERIA_KEYS if key in search['criteria']},
        'equivalence':search['equivalence'],'invariant_under_subgroup':search['invariantUnderSubgroup']}
    if 'sourceSymmetryOptions' in search:
        args.pop('symmetry_permutations')
        args['source_symmetry']=search['sourceSymmetryOptions']
    if type(search['explicitCandidateSelection']) is not bool:raise GeometryError('Explicit candidate-selection flag must be boolean.')
    if search['explicitCandidateSelection']:args['candidate_ids']=search['selectedCandidateIds']
    canceled=search.get('status')=='user-cancelled'
    if canceled:
        if (search['phaseStatus']!={**({'sourceSymmetryDiscovery':'complete'} if 'sourceSymmetryOptions' in search else {}),
                                     'candidateGeneration':'complete','symmetryAction':'complete','subsetSearch':'user-cancelled'} or
            type(search['nodesVisited']) is not int or not 1<=search['nodesVisited']<=limits['nodeLimit'] or
            search['limitReasons']!=['subset search canceled'] or not search['results']):
            raise GeometryError('Only a retained subset-search cancellation prefix with independently verifiable results can be adopted.')
        args['node_limit']=search['nodesVisited']
    expected=enumerate_facetings(source,**args)
    if canceled:
        if expected['limitReasons']!=['subset node cap'] or expected['status']!='resource-limited':
            raise GeometryError('Recorded cancellation does not bind a deterministic interrupted search prefix.')
        expected['limits']['nodeLimit']=limits['nodeLimit']
        expected['status']='user-cancelled';expected['phaseStatus']['subsetSearch']='user-cancelled'
        expected['limitReasons']=['subset search canceled']
    if _semantic(expected)!=_semantic(search):
        raise GeometryError('Faceting search accounting/source/criteria/action/results receipt does not reconstruct.')
    return {'passed':True,'scope':'recorded deterministic domain or cancellation prefix; no full baseline completeness claim'}


@_structured
def dispatch_faceting(request,*,cancelled=None):
    bounded_bytes(request,OUTPUT_BYTES)
    if (type(request) is not dict or not {'op','model','params'}<=set(request) or
        set(request)-{'op','model','params','id','algorithmVersion'} or request['op'] not in (*READ_OPERATIONS,OPERATION)):
        raise GeometryError('Automatic faceting request requires op/model/params and optional version/correlation only.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Automatic faceting operation version unsupported.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or
        type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):raise GeometryError('Faceting correlation ID malformed.')
    bounded_bytes(request['model'],INPUT_BYTES);_source(request['model'])
    source=_portable(request['model'],INPUT_BYTES);op=request['op'];args=parameters(request['params'],op)
    if op=='facet-candidates':result=candidate_facets(source,**args,cancelled=cancelled)
    elif op=='facet-search':result=enumerate_facetings(source,**args,cancelled=cancelled)
    else:
        if cancelled is not None and (not callable(cancelled) or cancelled()):raise GeometryError('Facet adoption canceled before verification.')
        verify_search(source,args['search'])
        result=realize_faceting(source,args['search'],args['result_id'])
        kernel_id=result['id']
        result['id']='faceted-'+hashlib.sha256(_semantic({'source':source,'params':args,'algorithmVersion':VERSION})).hexdigest()
        result['metadata']['automaticFacetingWorkflow']={'operation':OPERATION,'algorithmVersion':VERSION,
            'kernelVersion':KERNEL_VERSION,'kernelResultModelId':kernel_id,'search':args['search'],'resultId':args['result_id']}
        result['provenance']['workflowOperation']=OPERATION;result['provenance']['workflowAlgorithmVersion']=VERSION
        result['fingerprint']=identity(result)
        if cancelled is not None and cancelled():raise GeometryError('Facet adoption canceled before publication.')
    _portable(result,OUTPUT_BYTES)
    bounded_bytes(result,OUTPUT_BYTES-1024) # Raw spelling + protocol envelope headroom.
    return result


@_structured
def verify_faceting_evidence(model):
    bounded_bytes(model,OUTPUT_BYTES);receipt=model['metadata']['automaticFacetingWorkflow']
    if receipt['operation']!=OPERATION or receipt['algorithmVersion']!=VERSION or receipt['kernelVersion']!=KERNEL_VERSION:
        raise GeometryError('Unsupported automatic faceting evidence version.')
    expected=dispatch_faceting({'op':OPERATION,'model':model['provenance']['sourceSnapshot'],
        'params':{'search':receipt['search'],'result_id':receipt['resultId']}})
    if _semantic(expected)!=_semantic(model):raise GeometryError('Automatic faceting full source/criteria/geometry/unit/RGBA evidence disagrees.')
    return {'passed':True,'algorithmVersion':VERSION,'kernelVersion':KERNEL_VERSION,'resultModelId':model['id'],'certified':False}


@_structured
def run_faceting(document,params,label='Adopt faceting'):
    args=parameters(params)
    if type(label) is not str or not 1<=len(label)<=256:raise GeometryError('Faceting label requires bounded nonempty text.')
    result=_document(document);graph=validate_document_history(result)
    if graph is None:
        graph=create_history()
        for state in result['states']:
            node_id=str(uuid.uuid4());graph=record_source(graph,node_id,state);state['operationNode']=node_id
    source=result['states'][result['cursor']]
    retained=next(n for n in graph.to_dict()['nodes'] if n['id']==source['operationNode'])
    def owner(state):return {'model':state['model'],'notes':state.get('notes',''),
                             'coordinateUnit':state['view'].get('coordinateUnit')}
    if _semantic(owner(source))!=_semantic(owner(retained['snapshot'])) or content_source_changed(source, retained['snapshot']):
        node_id=str(uuid.uuid4());graph=record_source(graph,node_id,source,parent=source['operationNode']);source['operationNode']=node_id
    model=dispatch_faceting({'op':OPERATION,'model':source['model'],'params':args})
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
def replay_faceting_history(history,dispatcher=native_dispatch,target=None):
    raw=history.to_dict() if hasattr(history,'to_dict') else history
    bounded_bytes(raw,128*1024*1024);graph=validate_history(raw);_portable(raw,128*1024*1024)
    data=graph.to_dict();nodes={n['id']:n for n in data['nodes']}
    if target is not None and (type(target) is not str or not 1<=len(target)<=128 or target not in nodes):
        raise GeometryError('Faceting replay target requires a bounded existing literal node ID.')
    required=set(nodes) if target is None else set();pending=[] if target is None else [target]
    while pending:
        node_id=pending.pop()
        if node_id not in required:required.add(node_id);pending.extend(nodes[node_id]['inputs'])
    states={}
    for node in data['nodes']:
        node_id=node['id']
        if node_id not in required:continue
        if node['numericPolicy']!=NUMERIC_POLICY:raise GeometryError('Faceting numeric policy unsupported.')
        if node['op']=='source':states[node_id]=replay_history(graph,dispatcher,target=node_id)[node_id];continue
        if len(node['inputs'])!=1:raise GeometryError('Faceting replay requires one verified dependency.')
        parent=states[node['inputs'][0]]
        if node['op']==OPERATION:
            model=dispatch_faceting({'op':OPERATION,'model':parent['model'],'params':node['params'],'algorithmVersion':node['algorithmVersion']})
            computed={**deepcopy(node['snapshot']),'model':model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary=record_source(create_history(),'verified-faceting-parent',parent)
            temporary=record_operation(temporary,'native-result','verified-faceting-parent',node['op'],node['params'],node['snapshot'],algorithm_version=node['algorithmVersion'])
            def recorded_dispatch(request):
                if request.get('op')==node['op'] and node['op'] in ('cell','polygon-prism','spring-relaxation'):
                    request={**request,'algorithmVersion':node['algorithmVersion']}
                return dispatcher(request)
            computed=replay_history(temporary,recorded_dispatch,target='native-result')['native-result']
            computed['model']['id']=node['snapshot']['model']['id']
        else:raise GeometryError('Faceting replay operation unsupported; retained snapshot remains readable.')
        if (canonical_model(computed['model'])!=canonical_model(node['snapshot']['model']) or
            identity(computed['model'])!=node['resultFingerprint'] or _semantic(computed['model'])!=_semantic(node['snapshot']['model'])):
            raise GeometryError('Faceting replay full geometry/source attributes/receipt disagrees.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[node_id]=computed
    return states


@_structured
def replay_faceting_document(document,target=None,dispatcher=native_dispatch):
    source=_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Faceting replay requires a recorded graph.')
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    states=replay_faceting_history(graph,dispatcher,target);state=states[target];state['operationNode']=target
    return _document({'id':str(uuid.uuid4()),'cursor':0,'states':[state],'operationHistory':graph.to_dict()})


@_structured
def branch_faceting(document,params,target=None,dispatcher=native_dispatch):
    source=_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Faceting branch requires a recorded graph.')
    if target is not None and (type(target) is not str or not 1<=len(target)<=128):raise GeometryError('Faceting branch target requires a bounded literal node ID.')
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    node=next((n for n in graph.to_dict()['nodes'] if n['id']==target),None)
    if node is None or node['op']!=OPERATION or node['algorithmVersion']!=VERSION:
        raise GeometryError('Select a supported faceting adoption node to branch.')
    parent=replay_faceting_document(source,node['parent'],dispatcher)
    return run_faceting(parent,params,'Parameter branch: '+OPERATION)
