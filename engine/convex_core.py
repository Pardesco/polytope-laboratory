"""Bounded source-preserving 3D centre chamber of literal source facial planes.

The source can be nonconvex, crossed, disconnected or open. Hull only builds
the explicitly convex intersection of independently derived halfspaces; it
never supplies a replacement boundary for the original source. Exact binary64
anchor-plane arithmetic does not certify approximate planarity, LP or Hull.
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

VERSION = '0.1.0'
LIMITS = {'sourceVertices':256, 'sourceFaces':256, 'faceVertices':64,
    'sourceIncidenceReferences':16_384, 'distinctPlanes':32,
    'planeTriples':4960, 'outputVertices':1024, 'fractionBits':4096,
    'inputBytes':16*1024*1024, 'outputBytes':64*1024*1024,
    'centerRelativeSpan':1e6, 'coordinateMagnitude':1e100}
UNITS = ('model', 'mm', 'cm', 'm', 'in', 'ft')


def _bytes(value, limit):
    try:
        return _json_bytes(value, limit)
    except GeometryError:
        raise
    except (UnicodeError, RecursionError, OverflowError, ValueError, TypeError) as exc:
        raise GeometryError('Convex core requires finite bounded UTF-8 JSON data.') from exc


def _number(value, label, *, maximum, positive=False):
    if (type(value) not in (int,float) or abs(value)>maximum or not math.isfinite(value)
            or (positive and value<=0)):
        raise GeometryError('Convex core '+label+' exceeds its finite numeric domain.')
    return float(value)


def _fraction(value):
    result=value if isinstance(value,Fraction) else Fraction(value)
    if max(result.numerator.bit_length(),result.denominator.bit_length())>LIMITS['fractionBits']:
        raise GeometryError('Convex core exact anchor arithmetic exceeds its 4096-bit resource bound.')
    return result


def _dot(a,b):return _fraction(sum(x*y for x,y in zip(a,b)))
def _cross(a,b):return [_fraction(a[1]*b[2]-a[2]*b[1]),_fraction(a[2]*b[0]-a[0]*b[2]),_fraction(a[0]*b[1]-a[1]*b[0])]
def _sub(a,b):return [_fraction(x-y) for x,y in zip(a,b)]
def _plane_value(plane,point):return _fraction(_dot(plane[:3],point)+plane[3])


def _plane(points, ratios, center_ratios, normalized, center_local, face, face_id, tolerance):
    anchor=face[0];differences=normalized[face]-normalized[anchor]
    second=face[int(np.argmax(np.linalg.norm(differences,axis=1)))]
    first_vector=normalized[second]-normalized[anchor]
    crosses=np.cross(first_vector,differences)
    third_index=int(np.argmax(np.linalg.norm(crosses,axis=1)))
    third=face[third_index];cross=crosses[third_index]
    length=float(np.linalg.norm(cross))
    if not math.isfinite(length) or length<=TOLERANCE**2:
        raise GeometryError(f'Convex core source face {face_id} has unresolved noncollinear plane anchors.')
    normal=cross/length
    residual=(normalized[face]-normalized[anchor])@normal
    if float(np.max(np.abs(residual)))>tolerance:
        raise GeometryError(f'Convex core source face {face_id} is nonplanar at the requested relative tolerance.')
    exact_normal=_cross(_sub(ratios[second],ratios[anchor]),_sub(ratios[third],ratios[anchor]))
    offset=-_dot(exact_normal,ratios[anchor])
    pivot=next((value for value in exact_normal if value),None)
    if pivot is None:
        raise GeometryError('Convex core face anchor determinant is exactly degenerate.')
    key=tuple(_fraction(value/pivot) for value in exact_normal+[offset])
    center_value=_plane_value(key,center_ratios)
    record={'sourceFaceId':face_id,'orderedSourceVertexIds':list(face),
        'anchorVertexIds':[anchor,second,third],
        'exactAnchorPlane':[str(x) for x in key],
        'maximumNormalizedPlanarityResidual':float(np.max(np.abs(residual))),
        'planarityTolerance':tolerance}
    if center_value==0:
        record.update(status='ignored-through-center',
            centerIncidence='zero determinant over actual supplied binary64/integer anchor coordinates',
            centerDistanceNormalized=0.0)
        return record,key,None
    # Exact anchor orientation determines the centre-containing side; use the
    # stable local floating form only after the sign has been resolved.
    raw_center_value=_fraction(_dot(exact_normal,center_ratios)+offset)
    if raw_center_value>0:normal=-normal
    bound=float(np.dot(normal,normalized[anchor]-center_local))
    if not math.isfinite(bound) or bound<=tolerance:
        raise GeometryError(f'Convex core source face {face_id} has nonzero near-center or unresolved plane incidence; it was not ignored.')
    oriented=key if center_value<0 else tuple(-x for x in key)
    record.update(status='effective',centerDistanceNormalized=bound,
        normalizedCenterRelativeEquation=[*map(float,normal),-bound],
        exactOrientedAnchorPlane=[str(x) for x in oriented])
    return record,key,{'normal':normal,'bound':bound,'exact':oriented}


def _boundedness(groups,tolerance):
    if not groups:
        raise GeometryError('Convex core is unbounded: no effective source plane remains after center-plane exclusions.')
    matrix=np.array([g['normal'] for g in groups]);bounds=np.array([g['bound'] for g in groups])
    receipts=[]
    for axis in range(3):
        for sign in (-1,1):
            objective=np.zeros(3);objective[axis]=sign
            result=linprog(objective,A_ub=matrix,b_ub=bounds,
                bounds=[(None,None)]*3,method='highs',
                options={'primal_feasibility_tolerance':max(1e-10,min(tolerance,1e-7)),
                         'dual_feasibility_tolerance':max(1e-10,min(tolerance,1e-7)),
                         'time_limit':10,'maxiter':10000})
            if result.status==3:
                raise GeometryError('Convex core is unbounded in an unconstrained coordinate LP objective; no clipping box was used.')
            if result.status!=0 or result.x is None or not np.isfinite(result.x).all() or not math.isfinite(result.fun):
                raise GeometryError('Convex core numerical boundedness/feasibility is unresolved: '+str(result.message))
            maximum=float(np.max(matrix@result.x-bounds))
            if maximum>4*tolerance:
                raise GeometryError('Convex core LP boundedness witness fails its source halfspaces.')
            receipts.append({'axis':axis,'objectiveSign':sign,'status':'bounded-numerical',
                'objectiveValue':float(result.fun),'witness':result.x.tolist(),
                'maximumHalfspaceResidual':maximum})
    return receipts


def _intersection(groups,center_ratios,scale,tolerance):
    records={};tested=0;infeasible=0;dependent=0
    matrix=np.array([g['normal'] for g in groups]);bounds=np.array([g['bound'] for g in groups])
    for ids in combinations(range(len(groups)),3):
        tested+=1
        if tested>LIMITS['planeTriples']:
            raise GeometryError('Convex core plane triple resource bound exceeded; enumeration did not complete.')
        a,b,c=(groups[i]['exact'] for i in ids)
        bc=_cross(b[:3],c[:3]);determinant=_dot(a[:3],bc)
        if not determinant:
            dependent+=1;continue
        ca=_cross(c[:3],a[:3]);ab=_cross(a[:3],b[:3])
        point=tuple(_fraction((-a[3]*bc[k]-b[3]*ca[k]-c[3]*ab[k])/determinant) for k in range(3))
        values=[_plane_value(group['exact'],point) for group in groups]
        if any(value>0 for value in values):
            infeasible+=1;continue
        if point not in records:
            if len(records)>=LIMITS['outputVertices']:
                raise GeometryError('Convex core candidate/output vertex resource bound exceeded.')
            local=np.array([float(_fraction(x-y))/scale for x,y in zip(point,center_ratios)])
            physical=[float(x) for x in point]
            if (not np.isfinite(local).all() or not all(math.isfinite(x) and abs(x)<=LIMITS['coordinateMagnitude'] for x in physical)):
                raise GeometryError('Convex core intersection coordinates exceed finite display/native bounds.')
            maximum=float(np.max(matrix@local-bounds))
            if maximum>4*tolerance:
                raise GeometryError('Convex core rational anchor intersection is unresolved by the normalized floating plane predicates.')
            records[point]={'point':physical,'local':local.tolist(),
                'exactAnchorIntersection':[str(x) for x in point],
                'planeGroupIds':[i for i,value in enumerate(values) if value==0],
                'planeTriples':[],'maximumNormalizedHalfspaceResidual':maximum}
        records[point]['planeTriples'].append(list(ids))
    vertices=[records[key] for key in sorted(records)]
    if len(vertices)<4:
        raise GeometryError('Convex core intersection has no resolved full-dimensional bounded vertex set.')
    local=np.array([record['local'] for record in vertices])
    span=float(np.max(np.ptp(local,axis=0)))
    if not span or np.linalg.matrix_rank((local-local[0])/span,TOLERANCE)!=3:
        raise GeometryError('Convex core intersection rank is unresolved at native tolerance.')
    # Different exact anchor intersections cannot be silently fused because
    # their floating coordinates happen to be equal or below the merge scale.
    for i,point in enumerate(local):
        if any(float(np.max(np.abs(point-other)))<=4*tolerance for other in local[:i]):
            raise GeometryError('Convex core distinct exact anchor intersections are numerically too close; no feature was welded.')
    return vertices,{'testedPlaneTriples':tested,'dependentPlaneTriples':dependent,
        'infeasiblePlaneTriples':infeasible,'retainedUniqueAnchorIntersections':len(vertices),
        'termination':'exhausted within explicit 3D plane and arithmetic bounds',
        'exactScope':'intersections and side signs of selected anchor planes over supplied binary64/integer ratios; not a certificate of source planarity, LP, Hull or intended algebraic coordinates'}


def _native_gate(model):
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'convex-core-native-gate','cursor':0,'states':[{'model':model,'view':{}}]}]}
    detached=json.loads(_bytes(project,LIMITS['outputBytes']))
    validate_project(detached)
    restored=detached['documents'][0]['states'][0]['model']
    if equivalent_json(restored)!=equivalent_json(model) or identity(restored)!=model['fingerprint']:
        raise GeometryError('Convex core native project gate changed ordered geometry or retained attributes.')


def convex_core(source, *, center, tolerance=1e-9, color_policy='require-equal', **unsupported):
    """Return a new native 3D centre chamber without modifying any source data.

    Complete source plane tables and ordered ownership are historical; newly
    constructed core faces have explicit support owners, not invented source
    vertex correspondence. Exactly centre-containing anchor planes are ignored;
    nonzero near-centre incidences, unbounded or unresolved chambers refuse.
    """
    try:
        return _core(source,center=center,tolerance=tolerance,color_policy=color_policy,unsupported=unsupported)
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError,
            UnicodeError, RecursionError, np.linalg.LinAlgError) as exc:
        raise GeometryError('Convex core cannot resolve malformed JSON or numeric geometry: '+str(exc)) from exc


def _core(source, *, center,tolerance,color_policy,unsupported):
    if unsupported:
        raise GeometryError('Unknown convex core parameters: '+', '.join(sorted(unsupported)))
    tolerance=_number(tolerance,'tolerance',maximum=1e-6,positive=True)
    if color_policy not in ('require-equal','none'):
        raise GeometryError('Convex core color policy must be require-equal or explicit none.')
    _bytes([source,center],LIMITS['inputBytes'])  # Before snapshots/deepcopy.
    if type(source) is not dict or type(source.get('vertices')) is not list or not 4<=len(source['vertices'])<=LIMITS['sourceVertices']:
        raise GeometryError('Convex core source vertex budget requires 4–256 vertices.')
    if type(source.get('faces')) is not list or not 1<=len(source['faces'])<=LIMITS['sourceFaces']:
        raise GeometryError('Convex core source face budget requires 1–256 ordered faces.')
    if any(type(face) is not list or not 3<=len(face)<=LIMITS['faceVertices'] for face in source['faces']):
        raise GeometryError('Convex core source faces require bounded 3–64 vertex cycles.')
    if type(source.get('id')) is not str or not 1<=len(source['id'])<=128:
        raise GeometryError('Convex core source ID requires 1–128 UTF-8 characters.')
    dimension,embedding,incidences,_=_check_source(source)
    if (dimension,embedding)!=(3,3) or source.get('cells'):
        raise GeometryError('Convex core currently requires intrinsic 3D sources without a cell table; 4D cell hyperplanes are a separate domain.')
    if incidences>LIMITS['sourceIncidenceReferences']:
        raise GeometryError('Convex core source incidence budget exceeded.')
    if type(center) is not list or len(center)!=3:
        raise GeometryError('Convex core requires an explicit three-coordinate center in source units.')
    for coordinate in center:
        _number(coordinate,'center coordinate',maximum=LIMITS['coordinateMagnitude'])
    source,center=equivalent_json([source,center],LIMITS['inputBytes'])
    unit=source.get('metadata',{}).get('coordinateUnits')
    if unit is not None and (type(unit) is not str or unit not in UNITS):
        raise GeometryError('Convex core source unit label is unsupported or malformed.')
    points=np.array(source['vertices'],dtype=float);c=np.array(center,dtype=float)
    scale=float(np.max(np.ptp(points,axis=0)))
    if not scale or not math.isfinite(scale):
        raise GeometryError('Convex core source span is unresolved.')
    normalized=(points-points[0])/scale;center_local=(c-points[0])/scale
    if not np.isfinite(center_local).all() or np.max(np.abs(center_local))>LIMITS['centerRelativeSpan']:
        raise GeometryError('Convex core center exceeds one million relative source spans.')
    if np.linalg.matrix_rank(normalized-normalized[0],TOLERANCE)!=3:
        raise GeometryError('Convex core source coordinates do not resolve intrinsic 3D rank.')
    ratios=[[_fraction(x) for x in row] for row in source['vertices']]
    center_ratios=[_fraction(x) for x in center]
    plane_records=[];by_key={}
    for face_id,face in enumerate(source['faces']):
        record,key,data=_plane(points,ratios,center_ratios,normalized,center_local,face,face_id,tolerance)
        plane_records.append(record)
        if data is None:continue
        if key not in by_key:
            if len(by_key)>=LIMITS['distinctPlanes']:
                raise GeometryError('Convex core distinct effective plane budget exceeds 32.')
            by_key[key]={**data,'key':key,'sourceFaceIds':[]}
        by_key[key]['sourceFaceIds'].append(face_id)
    groups=[by_key[key] for key in sorted(by_key)]
    for group_id,group in enumerate(groups):
        group['id']=group_id
        for face_id in group['sourceFaceIds']:plane_records[face_id]['planeGroupId']=group_id
    for i,group in enumerate(groups):
        for other in groups[:i]:
            if (float(np.max(np.abs(group['normal']-other['normal'])))<=4*tolerance
                    and abs(group['bound']-other['bound'])<=4*tolerance):
                raise GeometryError('Convex core distinct exact source planes are nearly coincident; ownership cannot be silently merged.')
    receipts=_boundedness(groups,tolerance)
    intersections,enumeration=_intersection(groups,center_ratios,scale,tolerance)
    reference=hull([row['local'] for row in intersections],'Derived convex core reference')
    used=reference['provenance']['extremeInputIndices']
    if used!=list(range(len(intersections))):
        raise GeometryError('Convex core numeric Hull omitted an exact feasible anchor intersection; no boundary substitution was accepted.')
    source_colors=_colors(source,'faces');face_owners=[];colors=[]
    for face_id,face in enumerate(reference['faces']):
        support=set(intersections[face[0]]['planeGroupIds'])
        for vertex in face[1:]:support.intersection_update(intersections[vertex]['planeGroupIds'])
        if len(support)!=1:
            raise GeometryError('Convex core output facet has unresolved exact anchor-plane support ownership.')
        group_id=next(iter(support));owners=groups[group_id]['sourceFaceIds']
        if color_policy=='require-equal':
            color=source_colors[owners[0]]
            if any(source_colors[i]!=color for i in owners[1:]):
                raise GeometryError('Convex core coincident supporting source faces have ambiguous RGB/RGBA; choose explicit none or equal source colors.')
            colors.append(deepcopy(color))
        face_owners.append({'resultFaceId':face_id,'planeGroupId':group_id,'sourceFaceIds':list(owners)})
    exposed={row['planeGroupId'] for row in face_owners}
    bindings={'sourceModelId':source['id'],'sourceFingerprint':identity(source),
        'sourceSnapshotSha256':hashlib.sha256(_bytes(source,LIMITS['inputBytes'])).hexdigest()}
    evidence={'schemaVersion':1,'sourceModel':deepcopy(source),'sourceBinding':bindings,
        'center':deepcopy(center),'tolerance':tolerance,'normalization':{'origin':center,'scale':scale},
        'sourcePlaneRecords':plane_records,
        'planeGroups':[{'id':g['id'],'sourceFaceIds':g['sourceFaceIds'],
            'exactOrientedAnchorPlane':[str(x) for x in g['exact']],
            'normalizedCenterRelativeEquation':[*map(float,g['normal']),-g['bound']],
            'role':'supporting' if g['id'] in exposed else 'redundant'} for g in groups],
        'ignoredSourceFaceIds':[r['sourceFaceId'] for r in plane_records if r['status']=='ignored-through-center'],
        'boundedness':{'status':'bounded-numerical','freeCoordinateBounds':True,'clippingBoxUsed':False,'objectives':receipts},
        'enumeration':enumeration,'vertexPlaneLineage':intersections,'faceSupportOwners':face_owners,
        'candidateToOutputVertexIds':list(range(len(intersections))),'nonextremeCandidateIds':[],
        'sourceComponentPolicy':'historical snapshots only; centre chamber is one new convex boundary',
        'sourceIncidencePolicy':'full ordered source retained historically; no one-to-one source vertex map invented',
        'jsonBinding':'native-equivalent-integral-numbers-v1','resourceBounds':dict(LIMITS)}
    model={'id':str(uuid.uuid4()),'name':'Convex core of '+source.get('name','source'),
        'dimension':3,'embeddingDimension':3,'interpretation':'convex-polytope',
        'vertices':[row['point'] for row in intersections],
        'edges':deepcopy(reference['edges']),'faces':deepcopy(reference['faces']),'cells':[],
        # Actual derived chamber supports, required by native affine transforms.
        # No source Hull or source certificate is inferred or inherited.
        'facetVertices':deepcopy(reference['facetVertices']),
        'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False,
            'constructionTolerance':tolerance,'definition':'explicit facial-plane centre chamber'},
        'metadata':{'convexCore':evidence},
        'provenance':{'operation':'convex-core','algorithmVersion':VERSION,
            **deepcopy(bindings),'parameters':{'center':center,'tolerance':tolerance,'color_policy':color_policy}}}
    display_local=(np.array(model['vertices'])-c)/scale
    maximum_display_residual=float(np.max(display_local@np.array([g['normal'] for g in groups]).T-np.array([g['bound'] for g in groups])))
    if maximum_display_residual>4*tolerance:
        raise GeometryError('Convex core final display coordinates violate a source halfspace at the requested tolerance.')
    evidence['maximumNormalizedDisplayHalfspaceResidual']=maximum_display_residual
    if unit is not None:model['metadata']['coordinateUnits']=unit
    if color_policy=='require-equal' and any(color is not None for color in colors):
        model['metadata']['offColors']={'faces':colors,'cells':[]}
    model['validation']=validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Convex core reconstructed ordered boundary failed native validation.')
    model['fingerprint']=identity(model)
    classification=analyze_convex_boundary(model)
    if classification['status']!='passed':
        raise GeometryError('Convex core complete ordered boundary failed independent numerical classification: '+classification['status'])
    # The read-only classifier's internal dimensional budget uses integer keys;
    # serialized native evidence requires plain string-keyed JSON objects.
    budgets=classification['resourceBounds']['referenceVerticesByDimension']
    classification['resourceBounds']['referenceVerticesByDimension']={str(key):value for key,value in budgets.items()}
    evidence['classification']=classification
    try:
        measure=intrinsic_measures(model)
        if (measure is None or any(not math.isfinite(measure[key]) or measure[key]<np.finfo(float).tiny
                                   for key in ('content','boundaryMeasure'))):
            raise GeometryError('Convex core native measures overflowed, underflowed or were unresolved.')
        model['measure']=measure
        evidence['nativeMeasureGate']={'status':'passed','certified':False}
        evidence.update(resultModelId=model['id'],resultFingerprint=model['fingerprint'],resultInterpretation=model['interpretation'])
        _native_gate(model)
    except (GeometryError, ArithmeticError, ValueError, np.linalg.LinAlgError) as exc:
        # Preserve the newly proved ordered chamber when frozen native measure
        # paths cannot safely publish scalars. Its source snapshot/lineage stay.
        model.pop('measure',None);model['interpretation']='generalized-complex'
        model['validation']=validate(model)
        if not model['validation']['passed']:
            raise GeometryError('Convex core measure fallback itself fails native incidence validation.') from exc
        evidence['nativeMeasureGate']={'status':'unsupported','certified':False,
            'diagnostic':'Convex boundary retained without filled measures: '+str(exc)}
        evidence.update(resultModelId=model['id'],resultFingerprint=model['fingerprint'],resultInterpretation=model['interpretation'])
        _native_gate(model)
    evidence['nativeProjectGate']={'passed':True,'measurePublished':'measure' in model}
    _bytes(model,LIMITS['outputBytes'])
    return model


def verify_convex_core_evidence(model):
    """Read-only reconstruction of a fresh core's whole source/attribute evidence.

    Native project validation alone does not authenticate arbitrary metadata.
    This helper rejects edited/stale evidence; it makes no signature/authorship
    claim and cannot turn an untrusted source snapshot into an installed oracle.
    """
    try:
        _bytes(model,LIMITS['outputBytes'])
        evidence=model['metadata']['convexCore'];provenance=model['provenance']
        if (provenance['operation']!='convex-core' or provenance['algorithmVersion']!=VERSION
                or evidence['resultModelId']!=model['id']
                or evidence['resultFingerprint']!=identity(model)
                or evidence['resultInterpretation']!=model['interpretation']):
            raise GeometryError('Convex core evidence is unsupported or stale against current result identity.')
        parameters=provenance['parameters']
        if type(parameters) is not dict or set(parameters)!={'center','tolerance','color_policy'}:
            raise GeometryError('Convex core evidence has malformed construction parameters.')
        expected=convex_core(evidence['sourceModel'],**parameters)
        expected['id']=model['id']
        expected['metadata']['convexCore']['resultModelId']=model['id']
        expected['metadata']['convexCore']['classification']['sourceModelId']=model['id']
        if equivalent_json(expected,LIMITS['outputBytes'])!=equivalent_json(model,LIMITS['outputBytes']):
            raise GeometryError('Convex core retained ordered geometry, source snapshots, plane lineage, RGBA, units or numerical evidence disagree with reconstruction.')
        return {'passed':True,'resultModelId':model['id'],'resultFingerprint':identity(model),
            'scope':'fresh full model reconstruction; no exact/uniform, authorship or installed-baseline certification'}
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError,
            UnicodeError, RecursionError, np.linalg.LinAlgError) as exc:
        raise GeometryError('Malformed convex core evidence: '+str(exc)) from exc
