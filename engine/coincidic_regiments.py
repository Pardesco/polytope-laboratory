"""Bounded literal 4D arrangement comparisons; no catalogue classification.

Fixed placement and declared units, binary64 relative tolerance. A regiment
receipt certifies the common 1-skeleton, not uniformity. Coincidic witnesses
are internal distinct cell pairs: common vertices span their common 3-realm.
"""
from copy import deepcopy
from collections import Counter, defaultdict
import uuid
import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError, identity, validate, canonical_cycle
from .history import _json_bytes, _source_hash

VERSION='0.1.0'
KINDS=('vertices','edges','faces','cells')
FIELDS={'vertex':'vertices','edge':'edges','face':'faces','cell':'cells'}
MAX_BYTES=16*1024*1024
MAX_PAIRS=200000

def require(ok,message):
    if not ok:raise GeometryError(message)

def source(model):
    _json_bytes(model,8*1024*1024)
    require(type(model) is dict and model.get('dimension')==4 and model.get('embeddingDimension',4)==4,
            'Arrangement comparison requires finite intrinsic 4D sources in XYZW.')
    require(model.get('interpretation') in ('convex-polytope','generalized-complex'),
            'Arrangement comparison requires literal convex or generalized source incidence.')
    require(all(type(model.get(k)) is list and len(model[k])<=8192 for k in KINDS),
            'Arrangement comparison supports at most8192 literal elements per rank.')
    require(5<=len(model['vertices'])<=2048 and 1<=len(model['cells'])<=512,
            'Arrangement comparison supports 5–2048 vertices and 1–512 cells per source.')
    require(all(type(r) is list for k in KINDS for r in model[k]),'Source coordinates and literal incidence must be arrays.')
    require(sum(len(r) for k in KINDS for r in model[k])<=100000,'Arrangement source incidence work limit exceeded.')
    require(all(type(p) is list and len(p)==4 and all(type(x) in (int,float) and np.isfinite(x) and abs(x)<=1e100 for x in p) for p in model['vertices']),
            'Arrangement coordinates must be finite XYZW values bounded to1e100.')
    require(validate(model)['passed'],'Arrangement source incidence is invalid.')
    return np.asarray(model['vertices'],dtype=float)

def options(value):
    require(type(value) is dict and not set(value)-{'relativeTolerance','vertexBijection'},
            'Comparison options are relativeTolerance and optional explicit vertexBijection only.')
    tolerance=value.get('relativeTolerance',1e-8)
    require(type(tolerance) in (int,float) and np.isfinite(tolerance) and 1e-12<=tolerance<=1e-6,
            'Arrangement relative tolerance must lie between1e-12 and1e-6.')
    return {'relativeTolerance':float(tolerance),**({'vertexBijection':deepcopy(value['vertexBijection'])} if 'vertexBijection' in value else {})}

def _rank(points,tol):
    values=np.linalg.svd(points-points[0],compute_uv=False)
    require(not any(tol<x<16*tol for x in values),'Affine-rank evidence is numerically unresolved at the declared tolerance.')
    return int(sum(values>=16*tol))

def _keys(model,mapping):
    edge=[tuple(sorted(mapping[v] for v in row)) for row in model['edges']]
    face=[canonical_cycle([mapping[v] for v in row]) for row in model['faces']]
    cell=[tuple(sorted(face[f] for f in row)) for row in model['cells']]
    return {'edges':edge,'faces':face,'cells':cell}

def _correspondences(a,b):
    targets=defaultdict(list)
    for i,key in enumerate(b):targets[key].append(i)
    reverse=defaultdict(list)
    for i,key in enumerate(a):reverse[key].append(i)
    return {'aToB':[targets.get(key,[]) for key in a], 'bToA':[reverse.get(key,[]) for key in b],
            'sameArrangement':Counter(a)==Counter(b),
            'unmatchedA':[i for i,key in enumerate(a) if key not in targets],
            'unmatchedB':[i for i,key in enumerate(b) if key not in reverse],
            'ambiguousA':[i for i,key in enumerate(a) if len(targets.get(key,[]))>1]}

def _cells(model,mapping):return [sorted(set(mapping[v] for f in row for v in model['faces'][f])) for row in model['cells']]

def _witnesses(cells,keys,points,tol,other=None):
    pairs=((i,j) for i in range(len(cells)) for j in range(i+1,len(cells))) if other is None else ((i,j) for i in range(len(cells)) for j in range(len(other[0])))
    target=cells if other is None else other[0];target_keys=keys if other is None else other[1]
    result=[];shared_count=0
    # All cells were independently qualified planar/full rank before this loop.
    for i,j in pairs:
        # Distinct internal literal cell IDs never collapse, even when their
        # full cycles coincide. Cross-model identical boundaries already have
        # an explicit rank correspondence and are omitted from cross witnesses.
        if other is not None and keys[i]==target_keys[j]:continue
        common=sorted(set(cells[i]) & set(target[j]))
        if len(common)<4 or _rank(points[common],tol)!=3:continue
        union=sorted(set(cells[i])|set(target[j]))
        if _rank(points[union],tol)==3:
            shared_count+=len(common)
            require(len(result)<4096 and shared_count<=100000,'Complete corealmic witness packet exceeds its4096-pair/100000-shared-ID limit; no partial evidence is published.')
            result.append({'cellA':i,'cellB':j,'sameCyclicBoundary':keys[i]==target_keys[j],
                'sharedVertexIdsA':common,'sharedAffineDimension':3,'unionAffineDimension':3})
    return result

def compare_models(a,b,value=None):
    p,q=source(a),source(b);opts=options({} if value is None else value);tol=opts['relativeTolerance']
    require(len(p)==len(q),'Sources have different vertex counts; no full vertex bijection exists.')
    center=p.mean(axis=0);scale=float(np.max(np.ptp(p,axis=0)))
    require(scale>0 and np.isfinite(scale),'Source arrangement has no finite span.')
    x=(p-center)/scale;y=(q-center)/scale
    require(_rank(x,tol)==4 and _rank(y,tol)==4,'Both source arrangements must span intrinsic4D.')
    if 'vertexBijection' in opts:
        mapping=opts['vertexBijection']
        require(type(mapping) is list and len(mapping)==len(p) and all(type(i) is int for i in mapping) and sorted(mapping)==list(range(len(q))),
                'Explicit vertex bijection must be a complete literal A-to-B permutation.')
        require(np.max(np.abs(x-y[mapping]))<=tol,'Explicit vertex bijection does not match source positions at the stated tolerance.')
        selection='explicit supplied literal bijection'
    else:
        choices=cKDTree(y).query_ball_point(x,tol,p=np.inf)
        require(all(choices),'Sources do not share their vertex arrangement in the current XYZW placement.')
        require(all(len(row)==1 for row in choices),'Vertex arrangement is ambiguous; supply an explicit literal vertex bijection.')
        mapping=[row[0] for row in choices]
        require(len(set(mapping))==len(p),'Vertex arrangement is ambiguous; supply an explicit literal vertex bijection.')
        selection='unique fixed-placement proximity bijection, verified against every source vertex'
    inverse=[0]*len(mapping)
    for i,j in enumerate(mapping):inverse[j]=i
    ak=_keys(a,list(range(len(p))));bk=_keys(b,inverse)
    ranks={'vertices':{'aToB':mapping,'bToA':inverse,'sameArrangement':True}}
    ranks.update({k:_correspondences(ak[k],bk[k]) for k in ('edges','faces','cells')})
    ac,bc=_cells(a,list(range(len(p)))),_cells(b,inverse)
    pairs=len(ac)*(len(ac)-1)//2+len(bc)*(len(bc)-1)//2+len(ac)*len(bc)
    require(pairs<=MAX_PAIRS,'Complete cell-pair evidence exceeds200000 comparisons; no partial classification is published.')
    for group in (ac,bc):
        for ids in group:require(_rank(x[ids],tol)==3,'A source cell does not have a complete planar3D vertex realm.')
    wa=_witnesses(ac,ak['cells'],x,tol);wb=_witnesses(bc,bk['cells'],x,tol)
    cross=_witnesses(ac,ak['cells'],x,tol,(bc,bk['cells']))
    result={'schema':'polytope-arrangement-comparison','version':1,'algorithmVersion':VERSION,
        'sourceAttributesSha256':[_source_hash(a),_source_hash(b)],'sourceFingerprints':[identity(a),identity(b)],
        'contract':{'action':'identity in supplied XYZW coordinates','units':'must agree when used as states',
            'norm':'coordinate maximum norm','relativeTolerance':tol,'absoluteTolerance':tol*scale,
            'scale':scale,'vertexSelection':selection,'faceCorrespondence':'same literal cyclic boundary modulo starting vertex and reversal; original winding/cycles remain in source snapshots',
            'classification':'literal arrangement evidence only; uniformity and catalogue membership are not inferred'},
        'maximumVertexResidual':float(np.max(np.abs(p-q[mapping]))),'rankCorrespondences':ranks,
        'sameVertexArrangement':True,'sameEdgeArrangement':ranks['edges']['sameArrangement'],
        'sameFaceArrangement':ranks['faces']['sameArrangement'],'sameCellArrangement':ranks['cells']['sameArrangement'],
        'regimentEvidence':{'verified':ranks['edges']['sameArrangement'],'meaning':'common literal vertex and edge arrangement under the declared identity action'},
        'coincidicEvidence':{'sourceA':{'verified':bool(wa),'witnesses':wa},'sourceB':{'verified':bool(wb),'witnesses':wb},
            'crossSourceWitnesses':cross,'crossSourceMeaning':'cross-model distinct-boundary corealmic arrangement witnesses; identical boundaries are retained in rank maps; neither source is classified from cross witnesses alone',
            'complete':True,'cellPairsExamined':pairs,'interiorSemantics':'none inferred'}}
    _json_bytes(result,MAX_BYTES)
    return result

def clean_state(state):
    require(type(state) is dict and type(state.get('view')) is dict,'Comparison needs complete readable source states.')
    result=deepcopy(state)
    for key in ('operationNode','sourceOperationNode','netLayout','netPages'):result.pop(key,None)
    result['view'].pop('coincidicComparison',None)
    return result

def checked_state(state):
    from .formats import validate_project
    result=clean_state(state)
    require(type(result.get('notes','')) is str and len(result.get('notes','').encode('utf-8'))<=128*1024,'Source notes must be bounded UTF-8 text.')
    _json_bytes(result,MAX_BYTES)
    validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'comparison-source','cursor':0,'states':[result]}]})
    return result

def unit(state):return state['view'].get('coordinateUnit',state['model'].get('metadata',{}).get('coordinateUnits','model'))

def record_pair(a,b,opts):
    a,b=checked_state(a),checked_state(b)
    require(unit(a)==unit(b),'Comparison source coordinate units differ; convert explicitly before comparing or compounding.')
    receipt=compare_models(a['model'],b['model'],opts)
    result={'version':1,'options':options(opts),'sourceStates':[a,b],'receipt':receipt}
    _json_bytes(result,MAX_BYTES)
    return result

def validate_record(model,record):
    require(type(record) is dict and set(record)=={'version','options','sourceStates','receipt'} and type(record['version']) is int and record['version']==1 and type(record['sourceStates']) is list and len(record['sourceStates'])==2,
            'Malformed saved arrangement comparison.')
    _json_bytes(record,MAX_BYTES)
    require(_source_hash(model)==_source_hash(record['sourceStates'][0]['model']),'Saved comparison source attributes changed; compare the current sources again.')
    computed=record_pair(*record['sourceStates'],record['options'])
    require(_source_hash(computed)==_source_hash(record),'Saved arrangement evidence or source state was altered.')

def compound_model(model,params):
    from .compounds import add_models
    require(type(params) is dict and set(params)=={'otherState','options'},'Arrangement construction requires otherState and options.')
    other=checked_state(params['otherState']);receipt=compare_models(model,other['model'],params['options'])
    result=add_models(model,other['model'])
    seed=_source_hash({'sources':[model,other['model']],'options':options(params['options'])})
    result['id']=str(uuid.uuid5(uuid.NAMESPACE_URL,'literal-arrangement-compound:'+seed))
    for i,component in enumerate(result['components']):component['id']=str(uuid.uuid5(uuid.NAMESPACE_URL,seed+':component:'+str(i)))
    # Keep every source color rank, including vertex/edge colors, in raw encoding.
    tables={}
    for rank in KINDS:
        values=[]
        for src in (model,other['model']):
            table=src.get('metadata',{}).get('offColors',{}).get(rank)
            require(table is None or type(table) is list and len(table)==len(src[rank]),'Source color table does not match literal incidence.')
            values+=deepcopy(table) if table is not None else [None]*len(src[rank])
        if any(v is not None for v in values):tables[rank]=values
    if tables:result['metadata']['offColors']=tables
    result['metadata']['arrangementComparison']=receipt
    result['provenance'].update(operation='coincidic-compound',algorithmVersion=VERSION)
    result['fingerprint']=identity(result)
    _json_bytes(result,8*1024*1024)
    return result

def compose_state(parent,params,model=None,compound=False):
    require(type(params) is dict and set(params)=={'otherState','options'},'Arrangement recipes require otherState and options.')
    pair=record_pair(parent,params['otherState'],params['options'])
    state=clean_state(parent)
    if not compound:
        state['view']['coincidicComparison']=pair
        return state
    state['model']=deepcopy(model if model is not None else compound_model(parent['model'],params))
    state['model']['metadata']['arrangementSourceStates']=deepcopy(pair['sourceStates'])
    view=state['view']
    for key in ('dualMorph','projectiveDual','coincidicComparison','entitySelection','sectionAlignment','orientationFrame','cellFacingCache','net','cellNet','animation','elementContentTransfer','elementContentDetached','elementAnnotations','coincidentAssembly'):
        view.pop(key,None)
    view.update(derivedMode='face',cellFacing='all',hiddenCells=[],isolatedCell=None)
    from . import element_annotations as content
    entries=[];assets={};archives=[]
    for i,src in enumerate(pair['sourceStates']):
        archives+=deepcopy(src['view'].get('elementContentDetached',[]))
        document=src['view'].get('elementAnnotations')
        if document:
            content.validate_document(document,src['model'])
            for key,asset in document['assets'].items():
                require(key not in assets or assets[key]==asset,'Source image asset identities conflict.')
                assets[key]=deepcopy(asset)
            maps=state['model']['metadata']['compound']['inputs'][i]['maps']
            for entry in document['entries']:
                moved=deepcopy(entry);moved['index']=maps[FIELDS[entry['kind']]][entry['index']];entries.append(moved)
    if entries:
        document=content.new_document(state['model']);document.update(entries=entries,assets=assets)
        content.validate_document(document,state['model']);view['elementAnnotations']=document
    if archives:
        require(len(archives)<=8,'Combined detached source content exceeds its eight-record limit.')
        view['elementContentDetached']=archives
    _json_bytes(state,32*1024*1024)
    return state

def dispatch_arrangement(request):
    require(type(request) is dict and not set(request)-{'op','params','model','id'},'Arrangement operations require a strict native envelope.')
    op=request.get('op');params=request.get('params')
    require(type(params) is dict and set(params)=={'otherState','options'},'Arrangement requests require complete otherState and options.')
    other=checked_state(params['otherState'])
    receipt=compare_models(request.get('model'),other['model'],params['options'])
    if op=='coincidic-compare':return receipt
    if op=='coincidic-record':return deepcopy(request['model'])
    if op=='coincidic-compound':return compound_model(request['model'],params)
    raise GeometryError('Unsupported arrangement operation.')

def verify_replay(parent,computed,node):
    state=compose_state(parent,node['params'],compound=node['op']=='coincidic-compound')
    expected=node['snapshot']
    fields=('model','notes')
    require(all(_source_hash(state.get(k))==_source_hash(expected.get(k)) for k in fields),
            'Arrangement replay changed sources, raw attributes, notes or literal compound geometry.')
    for key in ('coincidicComparison','elementAnnotations','elementContentDetached','coordinateUnit'):
        require(_source_hash(state['view'].get(key))==_source_hash(expected['view'].get(key)),
                'Arrangement replay changed comparison evidence, units or mapped source content.')
    computed.update(model=deepcopy(state['model']))
