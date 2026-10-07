"""Ordered face placement, with no welding or interior inference.

Frames are explicit mathematical conventions, not an installed Stella oracle.
The source hull is an independent verifier only; it never supplies output
vertices, edges or faces. All placed incidence is copied from literal sources.
"""
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from .augmentation import (_frame, _normal, _number, _source,
    MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, MAX_COORDINATE, MAX_FACE_VERTICES)
from .augmentation_workflow import equivalent_json
from .compounds import KINDS, add_models, _check_source
from .formats import validate_project
from .geometry import GeometryError, TOLERANCE, identity, validate
from .history import _json_bytes

VERSION = '0.1.0'
MAX_PLACEMENTS = 16
MAX_OUTPUT_VERTICES = 4096
MAX_OUTPUT_INCIDENCES = 131_072
UNITS = ('model', 'mm', 'cm', 'm', 'in', 'ft')


def _bytes(value, limit):
    try:
        return _json_bytes(value, limit)
    except GeometryError:
        raise
    except (UnicodeError, RecursionError, OverflowError, ValueError, TypeError) as exc:
        raise GeometryError('Placement requires finite bounded UTF-8 JSON data.') from exc


def _centroid(points, face):
    # Subtract an actual source anchor before averaging, preserving stability
    # when a source has a large translation relative to its local span.
    anchor = points[face[0]]
    return anchor + (points[face] - anchor).mean(axis=0)


def _combine(models):
    """Balanced native compound tree with genuine retrievable leaf snapshots."""
    if len(models) == 1:
        return models[0]
    middle = len(models) // 2
    return add_models(_combine(models[:middle]), _combine(models[middle:]))


def _unit(model):
    unit = model.get('metadata', {}).get('coordinateUnits')
    if unit is not None and (type(unit) is not str or unit not in UNITS):
        raise GeometryError('Placement coordinate units are unsupported or malformed.')
    return unit


def _instance(addition, face_id, transform, vertices):
    # Derived convex/exact certificates and measures are not copied to newly
    # transformed coordinates. Full original attributes remain historical.
    model = {'id':str(uuid.uuid4()), 'name':addition.get('name', 'Placed model'),
        'dimension':3, 'embeddingDimension':3, 'interpretation':'generalized-complex',
        'vertices':vertices, 'edges':deepcopy(addition['edges']),
        'faces':deepcopy(addition['faces']), 'cells':[],
        'metadata':deepcopy(addition.get('metadata', {})),
        'numeric':{'mode':'float64-approximate', 'tolerance':TOLERANCE, 'certified':False},
        'provenance':{'operation':'face-placement-instance',
            'algorithmVersion':VERSION, 'sourceModelId':addition['id'],
            'sourceFingerprint':identity(addition), 'sourceFaceId':face_id,
            'transform':deepcopy(transform)}}
    if 'components' in addition:
        model['components'] = deepcopy(addition['components'])
    model['metadata']['facePlacementInstance'] = {
        'schemaVersion':1, 'sourceModel':deepcopy(addition),
        'sourceMaps':{kind:list(range(len(addition.get(kind, [])))) for kind in KINDS},
        'transform':deepcopy(transform), 'historicalAttributes':'original source snapshot; no transformed exact certification'}
    # This also independently checks that a finite transform has not collapsed
    # or invalidated the complete ordered source boundary at native tolerance.
    _source(model)
    model['validation'] = validate(model)
    model['fingerprint'] = identity(model)
    model['metadata']['facePlacementInstance'].update(
        resultModelId=model['id'], resultFingerprint=model['fingerprint'])
    return model


def place_models_on_faces(base, addition, face_ids, *, addition_face_id,
                          scale=1.0, height=0.0, angle_degrees=0.0,
                          color_policy='preserve', **unsupported):
    """Return base plus independent properly aligned copies on explicit faces.

    Both inputs must be bounded closed convex intrinsic 3D shells. The selected
    addition face's vertex-average anchor maps to the target face vertex-average
    anchor plus signed height along the independently verified outward normal.
    At angle zero, first ordered source/target edges supply the tangents. Source
    outward normal maps to negative target outward normal. No congruence is
    required. Scale is positive; overlaps, gaps and coincidences are retained.
    """
    try:
        return _place(base, addition, face_ids, addition_face_id=addition_face_id,
                      scale=scale, height=height, angle_degrees=angle_degrees,
                      color_policy=color_policy, unsupported=unsupported)
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError,
            UnicodeError, RecursionError, np.linalg.LinAlgError) as exc:
        raise GeometryError('Face placement cannot resolve malformed data or numeric geometry: '+str(exc)) from exc


def _place(base, addition, face_ids, *, addition_face_id, scale, height,
           angle_degrees, color_policy, unsupported):
    if unsupported:
        raise GeometryError('Unknown face placement parameters: '+', '.join(sorted(unsupported)))
    if color_policy != 'preserve':
        raise GeometryError('Placement currently supports only preserving source face RGB/RGBA.')
    scale = _number(scale, 'scale', minimum=0, maximum=MAX_COORDINATE, inclusive=False)
    height = _number(height, 'height', minimum=-MAX_COORDINATE, maximum=MAX_COORDINATE)
    angle_degrees = _number(angle_degrees, 'angle', minimum=-360, maximum=360)
    _bytes([base, addition, face_ids], MAX_INPUT_BYTES)  # Budget before any copy.
    # Validate original syntax before equivalent JSON can normalize 1.0/-0.0.
    base_proof, base_incidence = _source(base)
    addition_proof, addition_incidence = _source(addition)
    base, addition = equivalent_json([base, addition], MAX_INPUT_BYTES)
    if (type(face_ids) is not list or not 1 <= len(face_ids) <= MAX_PLACEMENTS
            or any(type(i) is not int or not 0 <= i < len(base['faces']) for i in face_ids)
            or len(set(face_ids)) != len(face_ids)):
        raise GeometryError('Placement requires 1–16 distinct bounded literal target face IDs in explicit order.')
    if type(addition_face_id) is not int or not 0 <= addition_face_id < len(addition['faces']):
        raise GeometryError('Placement addition face ID must be a bounded literal integer.')
    selected_faces = [base['faces'][i] for i in face_ids]+[addition['faces'][addition_face_id]]
    if any(not 3 <= len(face) <= MAX_FACE_VERTICES for face in selected_faces):
        raise GeometryError('Placement selected face boundary exceeds its 3–64 vertex domain.')
    if len(base['vertices'])+len(face_ids)*len(addition['vertices']) > MAX_OUTPUT_VERTICES:
        raise GeometryError('Placement aggregate vertex budget exceeds 4096.')
    if base_incidence+len(face_ids)*addition_incidence > MAX_OUTPUT_INCIDENCES:
        raise GeometryError('Placement aggregate incidence budget exceeds 131072.')
    unit = _unit(base)
    if _unit(addition) != unit:
        raise GeometryError('Placement source coordinate units differ; explicit conversion is required.')
    p = np.asarray(base['vertices'], dtype=float)
    q = np.asarray(addition['vertices'], dtype=float)
    source_face = addition['faces'][addition_face_id]
    source_anchor = _centroid(q, source_face)
    source_normal = _normal(addition_proof, addition_face_id)
    source_frame = _frame(q, source_face, source_normal)
    instances=[]; placements=[]
    offsets = {kind:len(base.get(kind, [])) for kind in KINDS}
    for face_id in face_ids:
        face = base['faces'][face_id]
        normal = _normal(base_proof, face_id)
        target_frame = _frame(p, face, -normal)
        angle = math.radians(angle_degrees)
        # Rodrigues rotation about the target OUTWARD normal, not frame z=-n.
        cross = np.array([[0,-normal[2],normal[1]], [normal[2],0,-normal[0]],
                          [-normal[1],normal[0],0]])
        axial = np.eye(3)*math.cos(angle)+(1-math.cos(angle))*np.outer(normal,normal)+math.sin(angle)*cross
        rotation = axial @ target_frame @ source_frame.T
        determinant = float(np.linalg.det(rotation))
        if (not np.isfinite(rotation).all() or abs(determinant-1)>1e-12
                or not np.allclose(rotation.T@rotation,np.eye(3),atol=1e-12,rtol=0)):
            raise GeometryError('Placement proper rigid frame is unresolved.')
        target_anchor = _centroid(p, face)+height*normal
        transformed = ((q-source_anchor)*scale)@rotation.T+target_anchor
        if not np.isfinite(transformed).all() or np.max(np.abs(transformed))>MAX_COORDINATE:
            raise GeometryError('Placement transformed coordinates exceed finite bounds.')
        transform = {'rotation':rotation.tolist(), 'determinant':determinant,
            'scale':scale, 'height':height, 'angleDegrees':angle_degrees,
            'sourceAnchor':source_anchor.tolist(), 'targetAnchor':target_anchor.tolist(),
            'targetOutwardNormal':normal.tolist(), 'sourceOutwardNormal':source_normal.tolist(),
            'definition':'scale * rotation * (point - sourceAnchor) + targetAnchor',
            'anchorConvention':'arithmetic average of selected ordered face vertices',
            'tangentConvention':'first ordered face edge projected into face plane'}
        instance = _instance(addition, addition_face_id, transform, transformed.tolist())
        maps = {kind:list(range(offsets[kind], offsets[kind]+len(addition.get(kind, [])))) for kind in KINDS}
        placements.append({'targetFaceId':face_id, 'additionFaceId':addition_face_id,
            'instanceModelId':instance['id'], 'instanceFingerprint':identity(instance),
            'sourceModelId':addition['id'], 'sourceFingerprint':identity(addition),
            'maps':maps, 'transform':transform})
        for kind in KINDS: offsets[kind]+=len(addition.get(kind, []))
        instances.append(instance)
    result = add_models(base, _combine(instances))
    for placement in placements:
        vertices = set(placement['maps']['vertices'])
        placement['componentIds'] = [component['id'] for component in result['components']
            if set(component['maps']['vertices']) <= vertices]
        if not placement['componentIds']:
            raise GeometryError('Placement component ownership could not be bound to current geometry.')
    bindings = [{'sourceModelId':source['id'], 'sourceFingerprint':identity(source),
        'sourceSnapshotSha256':hashlib.sha256(_bytes(source, MAX_INPUT_BYTES)).hexdigest()}
        for source in (base, addition)]
    evidence = {'schemaVersion':1, 'sourceModels':[deepcopy(base),deepcopy(addition)],
        'inputs':bindings, 'baseMaps':{kind:list(range(len(base.get(kind, [])))) for kind in KINDS},
        'placements':placements, 'outputPolicy':{'keepBase':True, 'weld':False,
            'removeCoincidentFaces':False, 'blendCoplanarFaces':False,
            'overlaps':'allowed; no solid union or interior measure inferred', 'hullReplacement':False},
        'jsonBinding':'native-equivalent-integral-numbers-v1',
        'evidenceScope':'fresh current result identity/fingerprint only; historical after transform/component editing',
        'numeric':{'mode':'float64-approximate','certified':False},
        'resourceBounds':{'placements':MAX_PLACEMENTS,'sourceVertices':256,
            'selectedFaceVertices':MAX_FACE_VERTICES,'outputVertices':MAX_OUTPUT_VERTICES,
            'outputIncidenceReferences':MAX_OUTPUT_INCIDENCES,'inputBytes':MAX_INPUT_BYTES,
            'outputBytes':MAX_OUTPUT_BYTES}}
    result['metadata']['facePlacement'] = evidence
    if unit is not None: result['metadata']['coordinateUnits'] = unit
    result['name'] = base.get('name', 'Base')+' with face placements'
    result['provenance'] = {'operation':'place-models-on-faces',
        'algorithmVersion':VERSION, 'inputs':deepcopy(bindings),
        'parameters':{'face_ids':list(face_ids), 'addition_face_id':addition_face_id,
            'scale':scale,'height':height,'angle_degrees':angle_degrees,'color_policy':color_policy}}
    result['validation']=validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Placement compound failed native ordered incidence validation.')
    _check_source(result)
    result['fingerprint']=identity(result)
    evidence.update(resultModelId=result['id'], resultFingerprint=result['fingerprint'])
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'placement-native-gate','cursor':0,'states':[{'model':result,'view':{}}]}]}
    detached=json.loads(_bytes(project, MAX_OUTPUT_BYTES))
    validate_project(detached)
    restored=detached['documents'][0]['states'][0]['model']
    if restored!=result or 'measure' in restored or identity(restored)!=result['fingerprint']:
        raise GeometryError('Placement native project gate changed retained source geometry or attributes.')
    evidence['nativeProjectGate']={'passed':True,'filledMeasurePublished':False}
    _bytes(result, MAX_OUTPUT_BYTES)
    return result
