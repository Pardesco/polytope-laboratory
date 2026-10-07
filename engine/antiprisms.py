"""Literal rational antiprisms with the original signed half-step rotation.

Sizing follows the independent base/side/height choices in Stella's manual:
https://software3d.com/Manual/Antiprism.php
Crossed retrograde input is described in its 4D menu:
https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro
The coordinate equations below are our explicit mathematical contract, rather
than copied undocumented implementation details. No hull or solid is inferred.
"""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from .compounds import (_colors, _payload_size, KINDS, MAX_COMPONENTS,
                        MAX_COORDINATE, MAX_ELEMENTS, MAX_FACE_VERTICES,
                        MAX_INCIDENCES, MAX_PAYLOAD_BYTES)
from .geometry import GeometryError, TOLERANCE, identity, validate
from .star_polygons import _pair, parse_polygon_symbol, regular_star_polygon

VERSION = '0.1.0'
MAX_ANTIPRISM_VERTICES = 4000


def _positive(value, name):
    if type(value) not in (int, float) or not 0 < value <= MAX_COORDINATE or not math.isfinite(value):
        raise GeometryError(name+' must be finite, positive and at most 1e100.')
    return float(value)


def _snapshot_hash(source):
    def numbers(value):
        if type(value) is dict:
            return {key: numbers(item) for key, item in value.items()}
        if type(value) is list:
            return [numbers(item) for item in value]
        if type(value) is float and value.is_integer():
            return int(value)
        return value
    try:
        encoded = json.dumps(numbers(source), allow_nan=False, sort_keys=True, separators=(',', ':')).encode()
    except (ValueError, TypeError, OverflowError, RecursionError, UnicodeEncodeError) as exc:
        raise GeometryError('Antiprism source attributes require finite bounded JSON data.') from exc
    return hashlib.sha256(encoded).hexdigest()


def rational_antiprism(n=None, d=None, *, symbol=None, radius=None, base_edge=None,
                       height=None, side_edge=None, cap_colors=None):
    """Construct an unreduced signed n/d antiprism from literal angular rings.

    Specify symbol OR integer n/d, radius OR base_edge, height OR side_edge.
    Missing ring size means unit radius. Missing both vertical/side parameters
    requests equilateral connecting triangles, which can be infeasible.
    cap_colors is an optional per-cycle OFF RGB/RGBA table; triangles are not
    assigned an invented inherited color. Disconnected partitions are explicit
    metadata, not recoverable historical compound components.
    """
    if symbol is not None:
        if n is not None or d is not None:
            raise GeometryError('Use a literal polygon symbol or integer n/d parameters, not both.')
        parsed = parse_polygon_symbol(symbol)
        n, d = parsed['n'], parsed['d']
    else:
        if n is None:
            raise GeometryError('Rational antiprism requires n or a literal polygon symbol.')
        n, d = _pair(n, 1 if d is None else d)
    if radius is not None and base_edge is not None:
        raise GeometryError('Specify radius or base edge length, not both.')
    if height is not None and side_edge is not None:
        raise GeometryError('Specify height or side edge length, not both.')
    edge_unit = 2*abs(math.sin(math.pi*d/n))
    side_unit = 2*abs(math.sin(math.pi*d/(2*n)))
    if base_edge is not None:
        radius_resolved = _positive(_positive(base_edge, 'Base edge length')/edge_unit, 'Computed radius')
        base_mode = 'base-edge'
    else:
        radius_resolved = _positive(1 if radius is None else radius, 'Radius')
        base_mode = 'radius'
    base_resolved = radius_resolved*edge_unit
    horizontal = radius_resolved*side_unit
    if height is not None:
        height_resolved = _positive(height, 'Height')
        side_resolved = math.hypot(horizontal, height_resolved)
        side_mode = 'height'
    elif side_edge is not None:
        side_resolved = _positive(side_edge, 'Side edge length')
        # A rounded sin(pi/6) lies just below 1/2. Do not fabricate a tiny
        # positive height for the analytically flat unit-chord/unit-side case.
        # Four ulps explicitly bound this float64 feasibility comparison;
        # subsequent relative rank/metric checks still govern the geometry.
        if side_resolved-horizontal <= 4*max(math.ulp(side_resolved), math.ulp(horizontal)):
            raise GeometryError('Side edge must resolvably exceed the horizontal half-step chord; no real positive antiprism height can be resolved.')
        ratio = horizontal/side_resolved
        height_resolved = _positive(side_resolved*math.sqrt((1-ratio)*(1+ratio)), 'Computed height')
        side_mode = 'side-edge'
    else:
        # This integer inequality also rejects the exactly flat 3/2 case,
        # without guessing positivity from rounded trigonometric differences.
        if 3*abs(d) >= 2*n:
            raise GeometryError('Equal-triangle antiprism height is not real and positive for this raw step; specify an explicit height or a feasible side edge.')
        height_resolved = _positive(radius_resolved*math.sqrt((edge_unit-side_unit)*(edge_unit+side_unit)), 'Computed equal-triangle height')
        side_resolved, side_mode = base_resolved, 'equal-triangle-default'
    g = math.gcd(n, abs(d))
    incidences = 6*n + 8*n + 2*n + 6*n
    if 2*n > MAX_ANTIPRISM_VERTICES or 4*n > MAX_ELEMENTS or 2*n+2*g > MAX_ELEMENTS or incidences > MAX_INCIDENCES:
        raise GeometryError('Rational antiprism incidence/vertex resource limit exceeded.')
    if g > MAX_COMPONENTS or n//g > MAX_FACE_VERTICES:
        raise GeometryError('Rational antiprism component/face boundary resource limit exceeded.')
    source = regular_star_polygon(n, d, radius_resolved)
    if cap_colors is not None:
        if type(cap_colors) is not list or len(cap_colors) != g:
            raise GeometryError('Cap colors require one OFF color record or null per source cycle.')
        source['metadata']['offColors'] = {'faces': deepcopy(cap_colors), 'cells': []}
    source_colors = _colors(source, 'faces')
    if _payload_size(source) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Rational antiprism source snapshot payload resource limit exceeded.')
    theta = math.pi*d/n  # Deliberately raw, including sign and retrograde d.
    cosine, sine = math.cos(theta), math.sin(theta)
    lower = [list(point)+[-height_resolved/2] for point in source['vertices']]
    upper = [[cosine*x-sine*y, sine*x+cosine*y, height_resolved/2] for x,y in source['vertices']]
    vertices = lower+upper
    if any(not math.isfinite(x) or abs(x) > MAX_COORDINATE for point in vertices for x in point):
        raise GeometryError('Rotated antiprism coordinates exceed the finite 1e100 bound at float64 precision.')
    edges = deepcopy(source['edges']) + [[a+n,b+n] for a,b in source['edges']]
    faces = [list(reversed(face)) for face in source['faces']] + [[v+n for v in face] for face in source['faces']]
    colors = deepcopy(source_colors)+deepcopy(source_colors)
    edge_lookup = {tuple(sorted(edge)):i for i,edge in enumerate(source['edges'])}
    face_owner = {vertex:i for i,face in enumerate(source['faces']) for vertex in face}
    maps = {'vertices': [{'sourceVertexId': i%n, 'layer': i//n} for i in range(2*n)],
            'edges': [{'role': 'source-edge', 'sourceEdgeId': i%n, 'layer': i//n} for i in range(2*n)],
            'faces': [{'role': 'source-cap', 'sourceFaceId': i%g, 'layer': i//g} for i in range(2*g)], 'cells': []}
    for i in range(n):
        following = (i+d)%n
        source_edge = edge_lookup[tuple(sorted((i, following)))]
        edges.extend([[i,i+n], [following,i+n]])
        maps['edges'].extend([{'role':'connecting-edge','lowerSourceVertexId':i,'upperSourceVertexId':i},
                             {'role':'connecting-edge','lowerSourceVertexId':following,'upperSourceVertexId':i}])
        faces.extend([[i,following,i+n], [i+n,following,following+n]])
        maps['faces'].extend([{'role':'connecting-triangle','sourceEdgeId':source_edge,'sourceFaceId':face_owner[i],'baseLayer':0,'oppositeSourceVertexId':i},
                             {'role':'connecting-triangle','sourceEdgeId':source_edge,'sourceFaceId':face_owner[i],'baseLayer':1,'oppositeSourceVertexId':following}])
        colors.extend([None,None])
    partitions = []
    for face_id, cycle in enumerate(source['faces']):
        owned = set(cycle)
        source_edges = [i for i,(a,b) in enumerate(source['edges']) if a in owned and b in owned]
        partitions.append({'id':f'partition-{face_id}', 'sourceFaceId':face_id,
                           'sourceComponentId':source.get('components',[{}]*g)[face_id].get('id'),
                           'maps': {'vertices':sorted(owned | {i+n for i in owned}),
                                    'edges':sorted({i for i in source_edges} | {i+n for i in source_edges} | {2*n+2*i+j for i in owned for j in (0,1)}),
                                    'faces':sorted({face_id,face_id+g} | {2*g+2*i+j for i in owned for j in (0,1)}), 'cells':[]}})
    inputs = {'n':n, 'd':d, 'radius':radius, 'base_edge':base_edge, 'height':height, 'side_edge':side_edge, 'cap_colors':deepcopy(cap_colors)}
    if symbol is not None:
        inputs.pop('n');inputs.pop('d');inputs['symbol']=symbol
    model = {'id':str(uuid.uuid4()), 'name':f'Rational antiprism {n}/{d}', 'dimension':3, 'embeddingDimension':3,
             'interpretation':'generalized-complex', 'vertices':vertices, 'edges':edges, 'faces':faces, 'cells':[],
             'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,
                        'algorithm':'literal raw half-step angular rings and ordered triangle incidence'},
             'provenance':{'operation':'rational-antiprism','algorithmVersion':VERSION,'parameters':inputs,
                           'definition':'raw signed pi*d/n upper rotation; no hull, weld, filled interior or volume inference'},
             'metadata':{'rationalAntiprism':{'schemaVersion':1,'algorithmVersion':VERSION,'symbol':f'{n}/{d}','n':n,'d':d,
                'upperRotationRadians':theta,'rotationDefinition':'pi*d/n from the original signed unreduced pair, not principal winding',
                'radius':radius_resolved,'height':height_resolved,'baseEdgeLength':base_resolved,'sideEdgeLength':side_resolved,
                'horizontalSideChord':horizontal,'baseSizing':base_mode,'sideSizing':side_mode,
                'sourceModel':deepcopy(source),'sourceModelId':source['id'],'sourceFingerprint':identity(source),
                'sourceSnapshotSha256':_snapshot_hash(source),'orderedSourceCycles':deepcopy(source['faces']),
                'maps':maps,'sourceMaps':{'vertices':[[i,i+n] for i in range(n)],'edges':[[i,i+n] for i in range(n)],
                                         'faces':[[i,i+g] for i in range(g)],'cells':[]},
                'componentPartitions':partitions,'recoverableCompoundComponents':False,
                'componentDefinition':'metadata-only disjoint current incidence; partition IDs are not compound Keep/Delete IDs',
                'colorPolicy':'Both source-cycle caps retain their RGB/RGBA; connecting triangles are uncolored.',
                'sizingEquations':{'baseEdge':'2*r*abs(sin(pi*d/n))','horizontalSideChord':'2*r*abs(sin(pi*d/(2*n)))','sideEdge':'hypot(horizontalSideChord,height)'},
                'sideEdgeFeasibilityRule':'side-horizontal > 4*max(ulp(side),ulp(horizontal)); relative rank/planarity/metric checks also apply',
                'measureDefinition':'No solid, filled star-cell volume or union measure inferred.'}}}
    if any(color is not None for color in colors):
        model['metadata']['offColors'] = {'faces':colors,'cells':[]}
    p = np.asarray(vertices,dtype=float)
    scale = float(np.max(np.ptp(p,axis=0)))
    normalized = (p-p[0])/scale if scale else p-p[0]
    if not scale or np.linalg.matrix_rank(normalized,TOLERANCE) != 3:
        raise GeometryError('Antiprism numeric degeneracy: full 3D rank is unresolved at the relative float64 tolerance.')
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Antiprism numeric/incidence validation failed: '+'; '.join(report['errors']))
    boundary = Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
    if set(boundary) != {tuple(sorted(edge)) for edge in edges} or any(count != 2 for count in boundary.values()):
        raise GeometryError('Antiprism boundary edges must have exactly two source face incidences.')
    for kind in KINDS:
        ownership = Counter(i for part in partitions for i in part['maps'][kind])
        if set(ownership) != set(range(len(model[kind]))) or any(value != 1 for value in ownership.values()):
            raise GeometryError('Antiprism component partitions do not cover source incidence exactly once.')
    lengths = [math.dist(vertices[a],vertices[b]) for a,b in edges]
    if any(not math.isclose(length, base_resolved if i<2*n else side_resolved, rel_tol=TOLERANCE, abs_tol=0) for i,length in enumerate(lengths)):
        raise GeometryError('Antiprism edge metric agreement is unresolved at float64 tolerance.')
    info = model['metadata']['rationalAntiprism']
    info['sideTrianglesEquilateralWithinTolerance'] = math.isclose(base_resolved,side_resolved,rel_tol=TOLERANCE,abs_tol=0)
    info['classificationDefinition'] = 'Equal triangle edge evidence only; no uniformity, convexity or exact certificate inferred.'
    model['validation'],model['fingerprint'] = report,identity(model)
    info['resultSourceModelId'],info['resultSourceFingerprint'] = model['id'],model['fingerprint']
    info['evidenceScope'] = 'generated source only; output maps and sizing apply while current geometry matches resultSourceFingerprint'
    if _payload_size(model) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Antiprism payload resource limit exceeded, including preserved source, attributes and maps.')
    return model
