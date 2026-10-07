"""Bounded 4D centre chamber of literal source CELL hyperplanes.

The 4D cellular interpretation is a dimensional inference from the published
Stella core definition, not installed-output equivalence. Source geometry is
never replaced by its vertex Hull. Exact supplied-coordinate anchor arithmetic
does not certify approximate cell planarity, LP, reconstruction or measures.
"""
from copy import deepcopy
from fractions import Fraction
from itertools import combinations
import hashlib
import json
import math
import uuid

import numpy as np
from scipy.optimize import linprog

from .augmentation_workflow import equivalent_json
from .compounds import _check_source, _colors
from .convex_classification import analyze_convex_boundary
from .formats import validate_project
from .geometry import GeometryError, TOLERANCE, hull, identity, intrinsic_measures, validate
from .history import _json_bytes

VERSION='0.1.0'
LIMITS={'sourceVertices':256,'sourceCells':64,'cellVertices':128,
    'sourceIncidenceReferences':32768,'distinctHyperplanes':16,'hyperplaneQuadruples':1820,
    'outputVertices':64,'fractionBits':4096,'inputBytes':16*1024*1024,
    'outputBytes':64*1024*1024,'centerRelativeSpan':1e6,'coordinateMagnitude':1e100}
UNITS=('model','mm','cm','m','in','ft')


def _bytes(value,limit):
    try:return _json_bytes(value,limit)
    except GeometryError:raise
    except (UnicodeError,RecursionError,ArithmeticError,ValueError,TypeError) as exc:
        raise GeometryError('4D convex core requires finite bounded UTF-8 JSON.') from exc


def _number(value,label,maximum,positive=False):
    if (type(value) not in (int,float) or abs(value)>maximum or not math.isfinite(value)
            or positive and value<=0):
        raise GeometryError('4D convex core '+label+' exceeds its finite numeric domain.')
    return float(value)


def _fraction(value):
    result=value if isinstance(value,Fraction) else Fraction(value)
    if max(result.numerator.bit_length(),result.denominator.bit_length())>LIMITS['fractionBits']:
        raise GeometryError('4D convex core exact anchor arithmetic exceeds its bit resource bound.')
    return result


def _det(rows):
    if len(rows)==1:return _fraction(rows[0][0])
    total=Fraction(0)
    for column,value in enumerate(rows[0]):
        if value:
            minor=[row[:column]+row[column+1:] for row in rows[1:]]
            total=_fraction(total+_fraction((-1 if column%2 else 1)*value*_det(minor)))
    return total


def _dot(a,b):return _fraction(sum((_fraction(x*y) for x,y in zip(a,b)),Fraction(0)))
def _value(plane,point):return _fraction(_dot(plane[:4],point)+plane[4])


def _cell_plane(source,cell_id,ratios,normalized,center_ratios,center_local,tolerance):
    face_ids=source['cells'][cell_id]
    ids=list(dict.fromkeys(v for fi in face_ids for v in source['faces'][fi]))
    if not 4<=len(ids)<=LIMITS['cellVertices']:
        raise GeometryError('4D convex core cell vertex resource/rank domain requires4..128 IDs.')
    anchor=ids[0];differences=normalized[ids]-normalized[anchor]
    remaining=differences.copy();chosen=[anchor];basis=[]
    for _ in range(3):
        lengths=np.linalg.norm(remaining,axis=1);index=int(np.argmax(lengths))
        if not math.isfinite(float(lengths[index])) or lengths[index]<=TOLERANCE:
            raise GeometryError(f'4D convex core source cell {cell_id} does not resolve rank3 hyperplane anchors.')
        chosen.append(ids[index]);vector=remaining[index]/lengths[index];basis.append(vector)
        remaining=remaining-np.outer(remaining@vector,vector)
    rows=[[_fraction(x-y) for x,y in zip(ratios[v],ratios[anchor])] for v in chosen[1:]]
    raw=[_fraction((-1 if j%2 else 1)*_det([row[:j]+row[j+1:] for row in rows])) for j in range(4)]
    pivot=next((v for v in raw if v),None)
    if pivot is None:raise GeometryError('4D convex core cell anchor hyperplane is exactly singular.')
    offset=-_dot(raw,ratios[anchor]);key=tuple(_fraction(v/pivot) for v in raw+[offset])
    largest=max(map(abs,raw));normal=np.array([float(v/largest) for v in raw]);normal=normal/math.hypot(*normal)
    residual=differences@normal;maximum=float(np.max(np.abs(residual)))
    if maximum>tolerance:
        raise GeometryError(f'4D convex core source cell {cell_id} is nonplanar at the requested tolerance.')
    center_value=_value(key,center_ratios)
    record={'sourceCellId':cell_id,'orderedSourceFaceIds':list(face_ids),
        'sourceVertexIds':ids,'anchorVertexIds':chosen,'exactAnchorHyperplane':[str(x) for x in key],
        'maximumNormalizedPlanarityResidual':maximum,'planarityTolerance':tolerance}
    if center_value==0:
        record.update(status='ignored-through-center',centerDistanceNormalized=0.,
            centerIncidence='zero determinant over actual supplied binary64/integer cell anchors')
        return record,key,None
    if _value(raw+[offset],center_ratios)>0:normal=-normal
    bound=float(normal@(normalized[anchor]-center_local))
    if not math.isfinite(bound) or bound<=tolerance:
        raise GeometryError(f'4D convex core source cell {cell_id} has nonzero near-center or unresolved hyperplane incidence; it was not ignored.')
    oriented=key if center_value<0 else tuple(-x for x in key)
    record.update(status='effective',centerDistanceNormalized=bound,
        normalizedCenterRelativeEquation=[*map(float,normal),-bound],
        exactOrientedAnchorHyperplane=[str(x) for x in oriented])
    return record,key,{'normal':normal,'bound':bound,'exact':oriented}


def _boundedness(groups,tolerance):
    if not groups:raise GeometryError('4D convex core is unbounded: no effective source cell hyperplanes.')
    matrix=np.array([g['normal'] for g in groups]);bounds=np.array([g['bound'] for g in groups]);receipts=[]
    for axis in range(4):
        for sign in (-1,1):
            objective=np.zeros(4);objective[axis]=sign
            result=linprog(objective,A_ub=matrix,b_ub=bounds,bounds=[(None,None)]*4,method='highs',
                options={'primal_feasibility_tolerance':max(1e-10,min(tolerance,1e-7)),
                    'dual_feasibility_tolerance':max(1e-10,min(tolerance,1e-7)),'time_limit':10,'maxiter':10000})
            if result.status==3:raise GeometryError('4D convex core is unbounded in a free-coordinate LP objective; no clipping box used.')
            if result.status!=0 or result.x is None or not np.isfinite(result.x).all() or not math.isfinite(result.fun):
                raise GeometryError('4D convex core numerical boundedness/feasibility unresolved: '+str(result.message))
            maximum=float(np.max(matrix@result.x-bounds))
            if maximum>4*tolerance:raise GeometryError('4D convex core LP witness fails its source cell halfspaces.')
            receipts.append({'axis':axis,'objectiveSign':sign,'status':'bounded-numerical',
                'objectiveValue':float(result.fun),'witness':result.x.tolist(),'maximumHalfspaceResidual':maximum})
    return receipts


def _intersection(groups,center_ratios,scale,tolerance):
    records={};tested=dependent=infeasible=0
    matrix=np.array([g['normal'] for g in groups]);bounds=np.array([g['bound'] for g in groups])
    for ids in combinations(range(len(groups)),4):
        tested+=1
        if tested>LIMITS['hyperplaneQuadruples']:raise GeometryError('4D core hyperplane quadruple budget exceeded.')
        planes=[groups[i]['exact'] for i in ids];a=[list(p[:4]) for p in planes];determinant=_det(a)
        if not determinant:dependent+=1;continue
        point=[]
        for column in range(4):
            replaced=[[(-p[4] if j==column else row[j]) for j in range(4)] for row,p in zip(a,planes)]
            point.append(_fraction(_det(replaced)/determinant))
        point=tuple(point);values=[_value(group['exact'],point) for group in groups]
        if any(value>0 for value in values):infeasible+=1;continue
        if point not in records:
            if len(records)>=LIMITS['outputVertices']:
                raise GeometryError('4D core exact candidate/output vertex count exceeds its64-vertex classifier frontier.')
            local=np.array([float(_fraction(x-y))/scale for x,y in zip(point,center_ratios)])
            physical=[float(x) for x in point]
            if not np.isfinite(local).all() or not all(math.isfinite(x) and abs(x)<=LIMITS['coordinateMagnitude'] for x in physical):
                raise GeometryError('4D core candidate coordinates exceed finite native bounds.')
            maximum=float(np.max(matrix@local-bounds))
            if maximum>4*tolerance:raise GeometryError('4D core exact anchor intersection is unresolved by normalized floating predicates.')
            records[point]={'point':physical,'local':local.tolist(),'exactAnchorIntersection':[str(x) for x in point],
                'hyperplaneGroupIds':[i for i,value in enumerate(values) if value==0],
                'hyperplaneQuadruples':[],'maximumNormalizedHalfspaceResidual':maximum}
        records[point]['hyperplaneQuadruples'].append(list(ids))
    vertices=[records[p] for p in sorted(records)]
    if len(vertices)<5:raise GeometryError('4D core intersection has no full-dimensional bounded vertex set.')
    local=np.array([record['local'] for record in vertices]);span=float(np.max(np.ptp(local,axis=0)))
    if not span or np.linalg.matrix_rank((local-local[0])/span,TOLERANCE)!=4:
        raise GeometryError('4D core intersection affine rank unresolved at native tolerance.')
    for i,point in enumerate(local):
        if any(float(np.max(np.abs(point-other)))<=4*tolerance for other in local[:i]):
            raise GeometryError('4D core distinct exact anchor intersections too close; no welding performed.')
    return vertices,{'testedHyperplaneQuadruples':tested,'dependentHyperplaneQuadruples':dependent,
        'infeasibleHyperplaneQuadruples':infeasible,'retainedUniqueAnchorIntersections':len(vertices),
        'termination':'exhausted within explicit4D hyperplane/bit bounds',
        'exactScope':'anchor intersections and side signs over supplied binary64/integer ratios only; not source planarity/LP/Hull/intended algebraic certification'}


def _native_gate(model):
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'development-core4d-gate','cursor':0,'states':[{'model':model,'view':{}}]}]}
    detached=json.loads(_bytes(project,LIMITS['outputBytes']));validate_project(detached)
    restored=detached['documents'][0]['states'][0]['model']
    if equivalent_json(restored)!=equivalent_json(model) or identity(restored)!=model['fingerprint']:
        raise GeometryError('4D core native project gate changed ordered source geometry or attributes.')


def convex_core4d(source,*,center,tolerance=1e-9,color_policy='require-equal',**unsupported):
    try:return _core(source,center,tolerance,color_policy,unsupported)
    except GeometryError:raise
    except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError,np.linalg.LinAlgError) as exc:
        raise GeometryError('4D core cannot resolve malformed JSON or numeric source: '+str(exc)) from exc


def _core(source,center,tolerance,color_policy,unsupported):
    if unsupported:raise GeometryError('Unknown4D core parameters: '+', '.join(sorted(unsupported)))
    tolerance=_number(tolerance,'tolerance',1e-6,True)
    if color_policy not in ('require-equal','none'):raise GeometryError('4D core colors require require-equal or explicit none.')
    _bytes([source,center],LIMITS['inputBytes'])
    if type(source) is not dict or type(source.get('vertices')) is not list or not 5<=len(source['vertices'])<=LIMITS['sourceVertices']:
        raise GeometryError('4D core source vertex budget requires5..256 IDs.')
    if type(source.get('cells')) is not list or not 1<=len(source['cells'])<=LIMITS['sourceCells']:
        raise GeometryError('4D core requires a nonempty bounded literal source CELL table.')
    if type(source.get('id')) is not str or not 1<=len(source['id'])<=128:
        raise GeometryError('4D core source requires a bounded UTF-8 model ID.')
    dimension,embedding,incidences,_=_check_source(source)
    if (dimension,embedding)!=(4,4):raise GeometryError('4D core requires intrinsic4D embedding4 source cells.')
    if incidences>LIMITS['sourceIncidenceReferences']:raise GeometryError('4D core source incidence resource bound exceeded.')
    if type(center) is not list or len(center)!=4:raise GeometryError('4D core center requires four literal source-unit coordinates.')
    for coordinate in center:_number(coordinate,'center coordinate',LIMITS['coordinateMagnitude'])
    source,center=equivalent_json([source,center],LIMITS['inputBytes']);unit=source.get('metadata',{}).get('coordinateUnits')
    if unit is not None and (type(unit) is not str or unit not in UNITS):raise GeometryError('4D core source unit label unsupported.')
    points=np.array(source['vertices'],dtype=float);c=np.array(center,dtype=float);scale=float(np.max(np.ptp(points,axis=0)))
    if not scale or not math.isfinite(scale):raise GeometryError('4D core source span unresolved.')
    normalized=(points-points[0])/scale;center_local=(c-points[0])/scale
    if not np.isfinite(center_local).all() or np.max(np.abs(center_local))>LIMITS['centerRelativeSpan']:
        raise GeometryError('4D core center exceeds relative source-span bound.')
    if np.linalg.matrix_rank(normalized-normalized[0],TOLERANCE)!=4:raise GeometryError('4D core source does not resolve full affine rank4.')
    ratios=[[_fraction(x) for x in p] for p in source['vertices']];center_ratios=[_fraction(x) for x in center]
    grouped={};records=[]
    for cell_id in range(len(source['cells'])):
        record,key,plane=_cell_plane(source,cell_id,ratios,normalized,center_ratios,center_local,tolerance);records.append(record)
        if plane is None:continue
        if key not in grouped:grouped[key]={**plane,'sourceCellIds':[]}
        grouped[key]['sourceCellIds'].append(cell_id)
    if len(grouped)>LIMITS['distinctHyperplanes']:raise GeometryError('4D core distinct hyperplane resource bound16 exceeded.')
    groups=[grouped[key] for key in sorted(grouped)]
    for i,g in enumerate(groups):
        g['id']=i
        for cell_id in g['sourceCellIds']:records[cell_id]['hyperplaneGroupId']=i
        for prior in groups[:i]:
            if np.max(np.abs(g['normal']-prior['normal']))<=4*tolerance and abs(g['bound']-prior['bound'])<=4*tolerance:
                raise GeometryError('4D core distinct exact hyperplanes numerically near-coincident; no perturbation/merge performed.')
    receipts=_boundedness(groups,tolerance);intersections,enumeration=_intersection(groups,center_ratios,scale,tolerance)
    reference=hull([v['local'] for v in intersections],'Derived4D core chamber reference')
    if reference['provenance']['extremeInputIndices']!=list(range(len(intersections))):
        raise GeometryError('4D core derived Hull discarded exact feasible candidate IDs.')
    colors=_colors(source,'cells');output_colors=[];owners=[]
    for cell_id,face_ids in enumerate(reference['cells']):
        vertex_ids=list(dict.fromkeys(v for fi in face_ids for v in reference['faces'][fi]))
        shared=set(range(len(groups)))
        for v in vertex_ids:shared.intersection_update(intersections[v]['hyperplaneGroupIds'])
        if len(shared)!=1:raise GeometryError('4D core output cell has unresolved exact source hyperplane ownership.')
        group_id=next(iter(shared));source_ids=groups[group_id]['sourceCellIds']
        value=None
        if color_policy=='require-equal':
            value=colors[source_ids[0]]
            if any(colors[ci]!=value for ci in source_ids[1:]):
                raise GeometryError('4D core coincident supporting source cells have ambiguous RGBA; choose explicit none or equal colors.')
        output_colors.append(deepcopy(value));owners.append({'resultCellId':cell_id,'hyperplaneGroupId':group_id,'sourceCellIds':list(source_ids)})
    exposed={row['hyperplaneGroupId'] for row in owners}
    binding={'sourceModelId':source['id'],'sourceFingerprint':identity(source),
        'sourceSnapshotSha256':hashlib.sha256(_bytes(source,LIMITS['inputBytes'])).hexdigest()}
    e={'schemaVersion':1,'sourceModel':deepcopy(source),'sourceBinding':binding,'center':deepcopy(center),'tolerance':tolerance,
        'normalization':{'origin':deepcopy(center),'scale':scale},'sourceCellHyperplaneRecords':records,
        'hyperplaneGroups':[{'id':g['id'],'sourceCellIds':g['sourceCellIds'],
            'exactOrientedAnchorHyperplane':[str(x) for x in g['exact']],
            'normalizedCenterRelativeEquation':[*map(float,g['normal']),-g['bound']],
            'role':'supporting' if g['id'] in exposed else 'redundant'} for g in groups],
        'ignoredSourceCellIds':[r['sourceCellId'] for r in records if r['status']=='ignored-through-center'],
        'boundedness':{'status':'bounded-numerical','freeCoordinateBounds':True,'clippingBoxUsed':False,'objectives':receipts},
        'enumeration':enumeration,'vertexHyperplaneLineage':intersections,'cellSupportOwners':owners,
        'candidateToOutputVertexIds':list(range(len(intersections))),'nonextremeCandidateIds':[],
        'sourceFaceColorPolicy':'source face RGBA retained historically; no new ridge color ownership inferred',
        'sourceComponentPolicy':'historical snapshots only; no inherited current component maps',
        'sourceIncidencePolicy':'literal source cells define hyperplanes; source2D faces and source vertex Hull do not define core',
        'jsonBinding':'native-equivalent-integral-numbers-v1','resourceBounds':dict(LIMITS)}
    model={'id':str(uuid.uuid4()),'name':'4D convex core of '+source.get('name','source'),'dimension':4,'embeddingDimension':4,
        'interpretation':'convex-polytope','vertices':[v['point'] for v in intersections],
        'edges':deepcopy(reference['edges']),'faces':deepcopy(reference['faces']),'cells':deepcopy(reference['cells']),
        'facetVertices':deepcopy(reference['facetVertices']),
        'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,'constructionTolerance':tolerance},
        'metadata':{'convexCore4d':e},'provenance':{'operation':'convex-core-4d','algorithmVersion':VERSION,
            **deepcopy(binding),'parameters':{'center':center,'tolerance':tolerance,'color_policy':color_policy}}}
    if unit is not None:model['metadata']['coordinateUnits']=unit
    if color_policy=='require-equal' and any(value is not None for value in output_colors):
        model['metadata']['offColors']={'faces':[None]*len(model['faces']),'cells':output_colors}
    display_local=(np.array(model['vertices'])-c)/scale
    e['maximumNormalizedDisplayHalfspaceResidual']=float(np.max(display_local@np.array([g['normal'] for g in groups]).T-np.array([g['bound'] for g in groups])))
    if e['maximumNormalizedDisplayHalfspaceResidual']>4*tolerance:raise GeometryError('4D core display vertices violate source halfspaces.')
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('4D core complete ordered boundary failed native validation.')
    model['fingerprint']=identity(model);classification=analyze_convex_boundary(model)
    if classification['status']!='passed':raise GeometryError('4D core independent full boundary classification failed: '+classification['status'])
    budgets=classification['resourceBounds']['referenceVerticesByDimension']
    classification['resourceBounds']['referenceVerticesByDimension']={str(k):v for k,v in budgets.items()};e['classification']=classification
    try:
        measure=intrinsic_measures(model)
        if measure is None or any(not math.isfinite(measure[key]) or measure[key]<np.finfo(float).tiny for key in ('content','boundaryMeasure')):
            raise GeometryError('4D core native measure overflow/underflow/unresolved.')
        model['measure']=measure;e['nativeMeasureGate']={'status':'passed','certified':False}
        e.update(resultModelId=model['id'],resultFingerprint=model['fingerprint'],resultInterpretation=model['interpretation']);_native_gate(model)
    except (GeometryError,ArithmeticError,ValueError,np.linalg.LinAlgError) as exc:
        model.pop('measure',None);model['interpretation']='generalized-complex';model['validation']=validate(model)
        if not model['validation']['passed']:raise GeometryError('4D core no-measure fallback fails native incidence validation.') from exc
        e['nativeMeasureGate']={'status':'unsupported','certified':False,'diagnostic':'Convex4D chamber retained without filled measures: '+str(exc)}
        e.update(resultModelId=model['id'],resultFingerprint=model['fingerprint'],resultInterpretation=model['interpretation']);_native_gate(model)
    e['nativeProjectGate']={'passed':True,'measurePublished':'measure' in model};_bytes(model,LIMITS['outputBytes']);return model


def verify_convex_core4d_evidence(model):
    try:
        _bytes(model,LIMITS['outputBytes']);e=model['metadata']['convexCore4d'];p=model['provenance']
        if (p['operation']!='convex-core-4d' or p['algorithmVersion']!=VERSION
                or e['resultModelId']!=model['id'] or e['resultFingerprint']!=identity(model)
                or e['resultInterpretation']!=model['interpretation']):
            raise GeometryError('4D core evidence unsupported or stale against current identity.')
        params=p['parameters']
        if type(params) is not dict or set(params)!={'center','tolerance','color_policy'}:raise GeometryError('4D core evidence parameters malformed.')
        expected=convex_core4d(e['sourceModel'],**params);expected['id']=model['id']
        expected['metadata']['convexCore4d']['resultModelId']=model['id'];expected['metadata']['convexCore4d']['classification']['sourceModelId']=model['id']
        if equivalent_json(expected)!=equivalent_json(model):
            raise GeometryError('4D core full source/cell hyperplane lineage/RGBA/units/ordered result disagrees with reconstruction.')
        return {'passed':True,'resultFingerprint':identity(model),'scope':'fresh complete reconstruction; no exact/uniform/installed-output certification'}
    except GeometryError:raise
    except (ArithmeticError,AttributeError,KeyError,TypeError,ValueError,UnicodeError,RecursionError,np.linalg.LinAlgError) as exc:
        raise GeometryError('Malformed4D core evidence: '+str(exc)) from exc
