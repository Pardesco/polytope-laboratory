"""Versioned source-owned cell extraction; cell/0.1 remains immutable.

Literal face cycles survive extraction. Cell-owned color is distinct from the
colors of its boundary faces. Explicit native dispatch/history integration.
"""
from copy import deepcopy
from functools import wraps
import hashlib
import json
import math
import uuid
from collections import Counter

import numpy as np

from engine.augmentation_workflow import bounded_bytes, checked_document, equivalent_json
from engine.compounds import _check_source, _colors
from engine.convex_classification import analyze_convex_boundary
from engine.formats import validate_project
from engine.geometry import GeometryError, identity, validate, intrinsic_measures
from engine.history import (NUMERIC_POLICY, REPLAY_OPERATIONS, canonical_model,
    create_history, record_source, record_operation, replay_history,
    validate_history, validate_document_history)

from engine.element_content_ownership import transfer_content_state, verify_replayed_content, content_source_changed

OPERATION ='cell'
VERSION='0.2.0'
LEGACY_VERSION='0.1.0'
LIMITS={'inputBytes':16*1024*1024,'outputBytes':32*1024*1024,
        'sourceVertices':1024,'sourceEdges':8192,'sourceFaces':4096,'sourceCells':1024,
        'incidences':65536,'cellVertices':256,'cellFaces':512}
MAX_SAFE_INTEGER=2**53-1
TOLERANCE=1e-8


def _structured(fn):
    @wraps(fn)
    def checked(*args,**kwargs):
        try:return fn(*args,**kwargs)
        except GeometryError:raise
        except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,
                UnicodeError,RecursionError,np.linalg.LinAlgError) as exc:
            raise GeometryError('Malformed cell extraction data: '+str(exc)) from exc
    return checked


def native_dispatch(request):
    # Legacy is a direct call to its frozen kernel, preventing server->adapter
    # recursion once cell/0.2 is mounted. All other operations use native dispatch.
    if request.get('op')==OPERATION and request.get('algorithmVersion')==LEGACY_VERSION:
        from engine.nets import extract_entity
        return extract_entity(request['model'],**dict(request.get('params') or {}))
    from engine.server import dispatch
    return dispatch(request)


def _portable(value,limit):
    value=json.loads(bounded_bytes(value,limit))
    stack=[value]
    while stack:
        item=stack.pop()
        if type(item) is dict:stack.extend(item.values())
        elif type(item) is list:stack.extend(item)
        elif type(item) is float and item.is_integer() and MAX_SAFE_INTEGER<abs(item)<1e21:
            raise GeometryError('Cell extraction decimal integer float is not portable; use an exact string attribute.')
    return equivalent_json(value,limit)


@_structured
def parameters(value):
    bounded_bytes(value,4096)
    if type(value) is not dict or set(value)-{'kind','index'}:
        raise GeometryError('Cell/0.2 parameters accept only kind and index.')
    kind=value.get('kind','cell');index=value.get('index',0)
    if kind!='cell' or type(kind) is not str:
        raise GeometryError('Cell/0.2 supports literal 4D cells only; face extraction stays legacy.')
    if type(index) is not int or not 0<=index<LIMITS['sourceCells']:
        raise GeometryError('Cell index must be a bounded literal nonnegative integer.')
    return {'kind':kind,'index':index}


def _source(source):
    bounded_bytes(source,LIMITS['inputBytes']) # Before traversal/copy/numerics.
    if type(source) is not dict or source.get('dimension')!=4 or source.get('embeddingDimension',4)!=4:
        raise GeometryError('Cell/0.2 requires an intrinsic 4D source Model.')
    if type(source.get('dimension')) is not int or type(source.get('embeddingDimension',4)) is not int:
        raise GeometryError('Source dimensions must be literal integers.')
    if type(source.get('id')) is not str or not 1<=len(source['id'])<=128:
        raise GeometryError('Source requires a bounded literal model ID.')
    total=0
    for kind,limit in [('vertices','sourceVertices'),('edges','sourceEdges'),('faces','sourceFaces'),('cells','sourceCells')]:
        table=source.get(kind)
        if type(table) is not list or not 1<=len(table)<=LIMITS[limit]:
            raise GeometryError('Cell source '+kind+' exceed bounds or are malformed.')
        for row in table:
            if type(row) is not list:raise GeometryError('Cell source geometry must use literal arrays.')
            total+=len(row)
            if total>LIMITS['incidences']:raise GeometryError('Cell source incidence budget exceeded.')
            if kind!='vertices' and any(type(v) is not int for v in row):
                raise GeometryError('Source incidence IDs must be literal integers, never float or boolean IDs.')
    _check_source(source)
    if 'fingerprint' in source and source['fingerprint']!=identity(source):
        raise GeometryError('Source cell fingerprint is stale against literal geometry.')
    metadata=source.get('metadata',{})
    if 'coordinateUnits' in metadata and metadata['coordinateUnits'] not in ('model','mm','cm','m','in','ft'):
        raise GeometryError('Cell source coordinateUnits must be an established unit label.')
    return _portable(source,LIMITS['inputBytes'])


def _project_gate(model):
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[
        {'id':'development-cell-native-gate','cursor':0,'states':[{'model':deepcopy(model),'view':{}}]}]}
    restored=validate_project(json.loads(bounded_bytes(project,LIMITS['outputBytes'])))['documents'][0]['states'][0]['model']
    if equivalent_json(restored)!=equivalent_json(model):
        raise GeometryError('Cell extraction native project gate changed geometry or attributes.')


def _document(document):
    # Native validation must see literal incidence before portable spelling
    # normalization; otherwise an invalid float endpoint could become an int.
    detached=json.loads(bounded_bytes(document,64*1024*1024))
    result=checked_document(detached)
    _portable(result,64*1024*1024) # Validate portability, retain raw parameter types.
    return result


@_structured
def extract_cell(source,index=0):
    """Detach one literal 4D cell, retaining ordered topology and ownership."""
    args=parameters({'index':index});source=_source(source);index=args['index']
    if index>=len(source['cells']):raise GeometryError('Cell index is outside this source.')
    face_ids=list(source['cells'][index]);vertex_ids=sorted({v for f in face_ids for v in source['faces'][f]})
    if not 4<=len(vertex_ids)<=LIMITS['cellVertices'] or len(face_ids)>LIMITS['cellFaces']:
        raise GeometryError('Selected cell vertex/face budget exceeded.')
    links=Counter(tuple(sorted((a,b))) for f in face_ids
                  for a,b in zip(source['faces'][f],source['faces'][f][1:]+source['faces'][f][:1]))
    if any(n!=2 for n in links.values()):
        raise GeometryError('Cell/0.2 requires a closed two-face edge link; no repair or closing face is inferred.')
    points=np.asarray([source['vertices'][v] for v in vertex_ids],dtype=float)
    anchor=points[0].copy();span=float(np.max(np.ptp(points,axis=0)))
    if not math.isfinite(span) or span<=0:raise GeometryError('Cell coordinates have zero or unresolved span.')
    normalized=(points-anchor)/span
    # Frame directions still use deterministic source-anchor differences.
    # Position the intrinsic cell at its vertex centroid, as ordinary cell
    # extraction does: origin=0 then lies in a convex cell's interior rather
    # than on the first selected corner. Average bounded normalized offsets
    # before returning to source units to avoid unnecessarily large sums.
    centroid=normalized.mean(axis=0)
    origin=anchor+centroid*span
    singular=np.linalg.svd(normalized,compute_uv=False)
    if sum(s>TOLERANCE for s in singular)!=3:
        raise GeometryError('Selected cell must resolve affine rank3 and planarity at relative tolerance.')
    vectors=[];anchors=[]
    for source_id,row in zip(vertex_ids,normalized):
        v=row.copy()
        # Reorthogonalization stabilizes source-owned ordered Gram-Schmidt.
        for _ in range(2):
            for axis in vectors:v-=np.dot(v,axis)*axis
        length=float(np.linalg.norm(v))
        if length>TOLERANCE:vectors.append(v/length);anchors.append(source_id)
        if len(vectors)==3:break
    if len(vectors)!=3:raise GeometryError('Could not resolve three source-owned frame anchors.')
    basis=np.array(vectors).T;centered=normalized-centroid;local=centered@basis
    residual=float(np.max(np.abs(centered-local@basis.T)))
    if residual>4*TOLERANCE:raise GeometryError('Cell frame reconstruction residual exceeds tolerance.')
    # Complete to a proper ambient4D frame; the reported 4x3 embedding basis
    # has no determinant by itself. The normal makes det[U,V,W,N] positive.
    normal=np.array([(-1)**i*np.linalg.det(np.delete(basis,i,axis=0)) for i in range(4)])
    normal/=np.linalg.norm(normal)
    if np.linalg.det(np.column_stack((basis,normal)))<0:normal=-normal
    vertex_map={v:i for i,v in enumerate(vertex_ids)}
    edge_ids=[i for i,e in enumerate(source['edges']) if tuple(sorted(e)) in links]
    if len(edge_ids)!=len(links):raise GeometryError('Cell boundary edge source correspondence is incomplete.')
    faces=[[vertex_map[v] for v in source['faces'][f]] for f in face_ids]
    edges=[[vertex_map[v] for v in source['edges'][e]] for e in edge_ids]
    face_colors=[deepcopy(_colors(source,'faces')[f]) for f in face_ids]
    selected_color=deepcopy(_colors(source,'cells')[index])
    binding={'operation':OPERATION,'algorithmVersion':VERSION,'source':source,'parameters':args}
    identifier='cell-'+hashlib.sha256(bounded_bytes(binding,LIMITS['inputBytes'])).hexdigest()
    model={'id':identifier,'name':'Cell '+str(index)+' of '+source.get('name','Source'),
        'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
        'vertices':(local*span).tolist(),'edges':edges,'faces':faces,'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE},
        'metadata':{'offColors':{'faces':face_colors,'cells':[]}},
        'provenance':{'operation':'extract-cell','algorithmVersion':VERSION,
            'sourceId':source['id'],'sourceFingerprint':identity(source),'parameters':args}}
    if 'coordinateUnits' in source.get('metadata',{}):model['metadata']['coordinateUnits']=source['metadata']['coordinateUnits']
    frame={'origin':origin.tolist(),'basis':basis.tolist(),'normal':normal.tolist(),
           'anchorVertexIds':[vertex_ids[0],*anchors], 'normalizationScale':span,
           'maximumNormalizedReconstructionResidual':residual,
           'ambientOrientationDeterminant':float(np.linalg.det(np.column_stack((basis,normal))))}
    evidence={'schemaVersion':1,'algorithmVersion':VERSION,'sourceModel':source,
        'sourceModelId':source['id'],'sourceFingerprint':identity(source),
        'sourceSnapshotSha256':hashlib.sha256(bounded_bytes(source,LIMITS['inputBytes'])).hexdigest(),
        'parameters':args,'maps':{'vertices':vertex_ids,'edges':edge_ids,'faces':face_ids,'cells':[index]},
        'mappingDirection':'result vertex/edge/face IDs to original source IDs; cells identifies the selected parent cell, not a result cell',
        'selectedCellColor':selected_color,'colorPolicy':'literal face RGBA unchanged; cell RGBA retained separately without implicit face fallback',
        'frame':frame,'sourceAttributesPolicy':'full historical snapshot; no inherited current component/certificate/Hull caches',
        'resourceBounds':dict(LIMITS),'resultModelId':identifier}
    model['metadata']['cellExtraction']=evidence
    model['metadata']['sourceEmbedding']={**deepcopy(frame),'sourceVertexIds':vertex_ids,'sourceEdgeIds':edge_ids,'sourceFaceIds':face_ids,'sourceCellIds':[index]}
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('Extracted ordered source cell fails native validation.')
    model['fingerprint']=identity(model)
    classification=analyze_convex_boundary(model)
    budgets=classification['resourceBounds']['referenceVerticesByDimension']
    classification['resourceBounds']['referenceVerticesByDimension']={str(k):v for k,v in budgets.items()}
    evidence['classification']=classification
    # Imported/generalized sources never gain a new solid declaration here.
    # A predeclared convex source additionally needs full boundary agreement
    # and finite native measures before its extracted cell retains that scope.
    if source.get('interpretation')=='convex-polytope' and classification['status']=='passed':
        model['interpretation']='convex-polytope'
        model['facetVertices']=[deepcopy(r['vertexIds']) for r in classification['facetSupports']]
        model['facetEquations']=[deepcopy(r['equation']) for r in classification['facetSupports']]
        model['validation']=validate(model)
        try:
            measure=intrinsic_measures(model)
            if not model['validation']['passed'] or measure is None or any(not math.isfinite(measure[k]) or measure[k]<np.finfo(float).tiny for k in ('content','boundaryMeasure')):
                raise GeometryError('Cell finite native convex measure gate unresolved.')
            model['measure']=measure;evidence['nativeMeasureGate']={'status':'passed','certified':False}
        except (GeometryError,ArithmeticError,ValueError,np.linalg.LinAlgError) as exc:
            model['interpretation']='generalized-complex'
            for key in ('measure','facetVertices','facetEquations'):model.pop(key,None)
            model['validation']=validate(model)
            evidence['nativeMeasureGate']={'status':'unsupported','diagnostic':str(exc),'certified':False}
    else:evidence['nativeMeasureGate']={'status':'not-published','reason':'source is generalized or ordered convex classification did not pass'}
    evidence['resultFingerprint']=identity(model);evidence['resultInterpretation']=model['interpretation']
    evidence['nativeProjectGate']={'passed':True,'measurePublished':'measure' in model}
    model=_portable(model,LIMITS['outputBytes']);_project_gate(model)
    return model


@_structured
def select_cell_version(params,version=None):
    """Face extraction retains legacy semantics; explicit versions never upgrade."""
    bounded_bytes(params,4096)
    if type(params) is not dict:raise GeometryError('Cell parameters require a JSON object.')
    if version is None:return LEGACY_VERSION if params.get('kind')=='face' else VERSION
    if type(version) is not str or version not in (VERSION,LEGACY_VERSION):
        raise GeometryError('Cell version unsupported; retained snapshots stay readable.')
    return version


@_structured
def dispatch_cell(request,dispatcher=native_dispatch):
    bounded_bytes(request,LIMITS['outputBytes'])
    if type(request) is not dict or not {'op','model','params'}<=set(request) or set(request)-{'op','model','params','id','algorithmVersion'} or request['op']!=OPERATION:
        raise GeometryError('Cell dispatch requires op/model/params and optional version/correlation only.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):
        raise GeometryError('Cell correlation ID is malformed.')
    if 'algorithmVersion' in request and type(request['algorithmVersion']) is not str:
        raise GeometryError('Cell algorithmVersion must be a literal supported string.')
    version=select_cell_version(request['params'],request.get('algorithmVersion'))
    if version==LEGACY_VERSION:
        legacy=json.loads(bounded_bytes(request,LIMITS['outputBytes']));legacy['algorithmVersion']=LEGACY_VERSION
        return dispatcher(legacy)
    if version!=VERSION:raise GeometryError('Cell version unsupported; retained snapshots stay readable.')
    args=parameters(request['params'])
    return extract_cell(request['model'],args['index'])


@_structured
def verify_cell_evidence(model):
    bounded_bytes(model,LIMITS['outputBytes'])
    e=model['metadata']['cellExtraction']
    if e['algorithmVersion']!=VERSION or e['resultModelId']!=model['id'] or e['resultFingerprint']!=identity(model):
        raise GeometryError('Cell extraction evidence is stale or unsupported.')
    expected=extract_cell(e['sourceModel'],parameters(e['parameters'])['index'])
    if _portable(expected,LIMITS['outputBytes'])!=_portable(model,LIMITS['outputBytes']):
        raise GeometryError('Cell source/frame/maps/RGBA/units/full attributes reconstruction disagrees.')
    return {'passed':True,'algorithmVersion':VERSION,'resultModelId':model['id'],'certified':False}


@_structured
def run_cell(document,params,label='Extract source cell',version=None,dispatcher=native_dispatch):
    version=select_cell_version(params,version)
    bounded_bytes(document,64*1024*1024)
    if type(label) is not str or not 1<=len(label)<=256:raise GeometryError('Cell state label must be bounded text.')
    result=_document(document);graph=validate_document_history(result)
    if graph is None:
        graph=create_history()
        for state in result['states']:
            node_id=str(uuid.uuid4());graph=record_source(graph,node_id,state);state['operationNode']=node_id
    source=result['states'][result['cursor']]
    node=next(n for n in graph.to_dict()['nodes'] if n['id']==source['operationNode'])
    if equivalent_json(source['model'])!=equivalent_json(node['snapshot']['model']) or content_source_changed(source, node['snapshot']):
        node_id=str(uuid.uuid4());graph=record_source(graph,node_id,source,parent=source['operationNode']);source['operationNode']=node_id
    args=parameters(params) if version==VERSION else _portable(params,4096)
    model=dispatch_cell({'op':OPERATION,'model':source['model'],'params':args,'algorithmVersion':version},dispatcher)
    view=deepcopy(source['view'])
    for field in ('entitySelection','sectionAlignment','orientationFrame','cellFacingCache','net','cellNet','foldFraction','explosionAmount','animation','camera','derivedCamera'):
        view.pop(field,None)
    dimension=model['dimension']
    view.update(entity=0,cellFacing='all',hiddenCells=[],isolatedCell=None,
        sectionNormal=[int(i==dimension-1) for i in range(dimension)],sectionOffset=0,
        derivedMode='dual' if dimension<3 else 'section')
    node_id=str(uuid.uuid4());state={'model':model,'view':view,'notes':source.get('notes',''),'label':label,'operationNode':node_id}
    state = transfer_content_state(source, state, OPERATION)
    graph=record_operation(graph,node_id,source['operationNode'],OPERATION,args,state,algorithm_version=version)
    result['states']=(result['states'][:result['cursor']+1]+[state])[-200:];result['cursor']=len(result['states'])-1;result['operationHistory']=graph.to_dict()
    return checked_document(result)


@_structured
def replay_cell_history(history,dispatcher=native_dispatch,target=None):
    raw=history.to_dict() if hasattr(history,'to_dict') else history
    bounded_bytes(raw,128*1024*1024)
    graph=validate_history(raw)
    _portable(raw,128*1024*1024) # Check portable attributes without coercing parameter/ID syntax.
    data=graph.to_dict()
    nodes={n['id']:n for n in data['nodes']}
    if target is not None and (type(target) is not str or not 1<=len(target)<=128 or target not in nodes):
        raise GeometryError('Cell replay target must name a bounded existing node.')
    required=set(nodes) if target is None else set();pending=[] if target is None else [target]
    while pending:
        key=pending.pop()
        if key not in required:required.add(key);pending.extend(nodes[key]['inputs'])
    states={}
    for node in data['nodes']:
        key=node['id']
        if key not in required:continue
        if node['numericPolicy']!=NUMERIC_POLICY:raise GeometryError('Cell replay numeric policy unsupported.')
        if node['op']=='source':
            states[key]=replay_history(graph,dispatcher,target=key)[key];continue
        if len(node['inputs'])!=1:raise GeometryError('Cell replay requires one verified parent.')
        parent=states[node['inputs'][0]]
        if node['op']==OPERATION and node['algorithmVersion']==VERSION:
            model=dispatch_cell({'op':OPERATION,'model':parent['model'],'params':node['params'],'algorithmVersion':VERSION},dispatcher)
            computed={**deepcopy(node['snapshot']),'model':model}
        elif node['op'] in REPLAY_OPERATIONS:
            temporary=record_source(create_history(),'verified-cell-parent',parent)
            temporary=record_operation(temporary,'native-result','verified-cell-parent',node['op'],node['params'],node['snapshot'],algorithm_version=node['algorithmVersion'])
            computed=replay_history(temporary,dispatcher,target='native-result')['native-result'];computed['model']['id']=node['snapshot']['model']['id']
        else:raise GeometryError('Cell replay operation unsupported; retained snapshots stay readable.')
        if canonical_model(computed['model'])!=canonical_model(node['snapshot']['model']) or identity(computed['model'])!=node['resultFingerprint'] or equivalent_json(computed['model'])!=equivalent_json(node['snapshot']['model']):
            raise GeometryError('Cell replay full geometry/attributes/RGBA/units verification failed.')
        if node['op'] == OPERATION:
            verify_replayed_content(parent, computed, node)
        states[key]=computed
    return states


@_structured
def replay_cell_document(document,target=None,dispatcher=native_dispatch):
    source=_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Cell replay requires a recorded graph.')
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    states=replay_cell_history(graph,dispatcher,target);state=states[target];state['operationNode']=target
    return checked_document({'id':str(uuid.uuid4()),'cursor':0,'states':[state],'operationHistory':graph.to_dict()})


@_structured
def branch_cell(document,params,target=None,dispatcher=native_dispatch):
    source=_document(document);graph=validate_document_history(source)
    if graph is None:raise GeometryError('Cell branch requires a recorded graph.')
    if target is not None and (type(target) is not str or not 1<=len(target)<=128):raise GeometryError('Cell branch target must be a bounded literal ID.')
    target=source['states'][source['cursor']]['operationNode'] if target is None else target
    node=next((n for n in graph.to_dict()['nodes'] if n['id']==target),None)
    if node is None or node['op']!=OPERATION:raise GeometryError('Select a cell operation to branch.')
    parent=replay_cell_document(source,node['parent'],dispatcher)
    # Branch retains the selected operation's version; upgrading is explicit.
    return run_cell(parent,params,'Parameter branch: cell',node['algorithmVersion'],dispatcher)
