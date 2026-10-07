"""Native explicit source-feature seed extraction for equal-edge zonohedra.

Feature conventions are declared here, not installed Stella output conformance.
Only checked convex3D sources, explicit IDs and world axes are implemented.
"""
from copy import deepcopy
from fractions import Fraction
from itertools import combinations
import hashlib
import json

import numpy as np

from engine.zonohedron_support import (_checked, _cross, _number, zonohedron_support)
from engine.augmentation import _source
from engine.formats import validate_project
from engine.geometry import GeometryError, identity
from engine.history import _json_bytes

VERSION = '0.1.0'
UNITS = ('model', 'mm', 'cm', 'm', 'in', 'ft')


def _vector(ratios):
    ratios = _checked(tuple(ratios))
    anchor = next((x for x in ratios if x), None)
    if anchor is None:
        raise GeometryError('Selected source feature gives a zero seed vector.')
    canonical = _checked(tuple(x/anchor for x in ratios))
    scale = max(map(abs, canonical))
    vector = [float(x/scale) for x in canonical]
    if any(x and not value for x, value in zip(canonical, vector)):
        raise GeometryError('Source seed conversion underflowed a nonzero component.')
    return vector, [str(x) for x in canonical]


def source_zonohedron(source, selections, *, center=None, edge_length=1.0, max_zones=None):
    try:
        return _build(source, selections, center, edge_length, max_zones)
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise GeometryError('Malformed or unresolved source zonohedron data.') from exc


def _build(source, selections, center, edge_length, max_zones):
    _json_bytes(source, 16*1024*1024)
    _json_bytes(selections, 1024*1024)
    snapshot = json.loads(json.dumps(source, allow_nan=False))
    _source(snapshot)
    if any(len(face)>64 for face in snapshot['faces']):
        raise GeometryError('Source zonohedron face vertex bound64 exceeded.')
    unit = snapshot.get('metadata', {}).get('coordinateUnits')
    if unit is not None and (type(unit) is not str or unit not in UNITS):
        raise GeometryError('Source zonohedron coordinate units are unsupported.')
    if center is None:
        center = [0,0,0]
    if type(center) is not list or len(center) != 3:
        raise GeometryError('Source zonohedron center requires three coordinates.')
    center = [_number(x, 'center', 1e100) for x in center]
    if type(selections) is not list or not 1 <= len(selections) <= 16:
        raise GeometryError('Source zonohedron requires1..16 explicit selection groups.')
    points = [[Fraction(x) for x in row] for row in snapshot['vertices']]
    origin = [Fraction(x) for x in center]
    directions, owners = [], []
    for selection in selections:
        if type(selection) is not dict or set(selection) != {'kind','ids'}:
            raise GeometryError('Seed groups require exactly kind and ids.')
        kind, ids = selection['kind'], selection['ids']
        if type(kind) is not str or kind not in ('vertices','edges','faces','world-axes'):
            raise GeometryError('Unsupported source seed feature kind.')
        cap = 3 if kind == 'world-axes' else len(snapshot[kind])
        if (type(ids) is not list or not ids or len(ids)>64 or
                any(type(i) is not int or not 0 <= i < cap for i in ids) or len(set(ids)) != len(ids)):
            raise GeometryError('Seed IDs must be a nonempty ordered distinct valid integer list.')
        for index in ids:
            if len(directions) >= 64:
                raise GeometryError('Source seed direction bound64 exceeded.')
            owner = {'kind':kind, 'sourceEntityId':index}
            if kind == 'vertices':
                raw = [x-y for x,y in zip(points[index],origin)]
                owner['definition'] = 'literal vertex minus explicit center'
            elif kind == 'edges':
                a,b = snapshot['edges'][index]
                raw = [x-y for x,y in zip(points[b],points[a])]
                owner['sourceVertexIds'] = [a,b]
                owner['definition'] = 'ordered literal edge endpoint difference'
            elif kind == 'faces':
                face = snapshot['faces'][index]
                anchor = face[0]
                # Exact source-anchor cross, choose the largest approximate
                # normalized determinant solely to avoid weak anchors.
                numeric = np.array(snapshot['vertices'],dtype=float)
                span = max(np.ptp(numeric,axis=0))
                candidates = []
                for a,b in combinations(face[1:],2):
                    size = np.linalg.norm(np.cross((numeric[a]-numeric[anchor])/span,
                                                   (numeric[b]-numeric[anchor])/span))
                    candidates.append((float(size),a,b))
                if not candidates:
                    raise GeometryError('Source face has no plane anchors.')
                size,a,b = max(candidates)
                if size <= 1e-12:
                    raise GeometryError('Source face normal has unresolved plane anchors.')
                raw = _cross([x-y for x,y in zip(points[a],points[anchor])],
                             [x-y for x,y in zip(points[b],points[anchor])])
                owner['sourceVertexIds'] = deepcopy(face)
                owner['anchorVertexIds'] = [anchor,a,b]
                owner['definition'] = 'normal to declared noncollinear literal face anchors'
            else:
                raw = [Fraction(int(i==index)) for i in range(3)]
                owner['definition'] = 'unposed world axis'
            vector, ratios = _vector(raw)
            owner['exactAnchorDirectionRatios'] = ratios
            directions.append(vector)
            owners.append(owner)
    result = zonohedron_support(directions, edge_length=edge_length, max_zones=max_zones)
    support = result['metadata']['supportZonohedron']
    zone_owners = [[deepcopy(owners[i]) for i in zone['sourceDirectionIds']] for zone in support['selectedZones']]
    evidence = {'algorithmVersion':VERSION, 'sourceModel':snapshot,
        'sourceModelId':snapshot['id'], 'sourceFingerprint':identity(snapshot),
        'selections':deepcopy(selections), 'center':center,
        'edgeLength':support['edgeLength'], 'maxZones':max_zones,
        'seedDirections':directions, 'seedOwners':owners, 'selectedZoneOwners':zone_owners,
        'attributePolicy':'coordinate units inherited; original RGBA and full source attributes remain historical; no invented colors on new incidence',
        'numericPolicy':'exact source-anchor arithmetic; conversion/normalization/realization and native measures remain approximate',
        'scope':'new equal-edge zonohedron; no zone addition to existing bodies, symmetry-type selection or installed conformance'}
    parameters = {'version':VERSION, 'source':snapshot, 'selections':selections,
                  'center':center, 'edgeLength':support['edgeLength'], 'maxZones':max_zones}
    result['id'] = 'source-zonohedron-' + hashlib.sha256(json.dumps(parameters,sort_keys=True,allow_nan=False).encode()).hexdigest()
    result['provenance'] = {'operation':'source-zonohedron','algorithmVersion':VERSION,
                            'sourceModelId':snapshot['id'],'sourceFingerprint':identity(snapshot)}
    result['metadata']['sourceZonohedron'] = evidence
    if unit is not None:
        result['metadata']['coordinateUnits'] = unit
    # Nested support receipt describes the pre-adapter generated boundary ID.
    # The outer receipt binds its full adapted result and inherited units.
    evidence['resultModelId'] = result['id']
    evidence['resultFingerprint'] = identity(result)
    _json_bytes(result,64*1024*1024)
    validate_project({'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'source-zonohedron-check','cursor':0,'states':[{'model':result,'view':{}}]}]})
    return result


def verify_source_zonohedron(model):
    try:
        _json_bytes(model,64*1024*1024)
        e = model['metadata']['sourceZonohedron']
        if e['algorithmVersion'] != VERSION:
            raise GeometryError('Unknown source zonohedron evidence version.')
        rebuilt = source_zonohedron(e['sourceModel'],e['selections'],center=e['center'],
                                  edge_length=e['edgeLength'],max_zones=e['maxZones'])
        if json.dumps(model,sort_keys=True,allow_nan=False) != json.dumps(rebuilt,sort_keys=True,allow_nan=False):
            raise GeometryError('Source zonohedron attributes or evidence changed.')
    except (KeyError,TypeError,ValueError,OverflowError,RecursionError) as exc:
        if isinstance(exc,GeometryError):
            raise
        raise GeometryError('Malformed source zonohedron evidence.') from exc
    return {'passed':True,'certified':False,'scope':'full source and result attribute reconstruction'}
