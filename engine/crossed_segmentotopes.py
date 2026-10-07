"""Derived crossed antiprism × interval layers; no Stella-checkbox claim."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import uuid

import numpy as np

from .antiprisms import rational_antiprism
from .geometry import GeometryError, TOLERANCE, identity, validate
from .formats import validate_project
from .history import canonical_model
from .prisms import polyhedron_prism
from .segmentotopes import _bounded_json, _transform
from .star_polygons import parse_polygon_symbol

VERSION = '0.1.0'
MAX_OUTPUT_VERTICES = 4000


def _native_gate(model):
    geometry = canonical_model(model)
    metadata = _bounded_json(model['metadata'])
    provenance = _bounded_json(model['provenance'])
    project = {'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'crossed-family-gate','cursor':0,'states':[{'model':model,'view':{}}]}]}
    try:
        result = validate_project(json.loads(_bounded_json(project)))['documents'][0]['states'][0]['model']
    except (ValueError,ArithmeticError) as exc:
        raise GeometryError('Crossed layer native project gate failed: '+str(exc)) from exc
    if (canonical_model(result) != geometry or result['id'] != model['id']
            or _bounded_json(result['metadata']) != metadata or _bounded_json(result['provenance']) != provenance
            or 'measure' in result):
        raise GeometryError('Crossed layer native roundtrip changed source evidence or inferred a solid measure.')
    return result


def crossed_antiprism_segmentotope(symbol='4/3', *, radius=None, base_edge=None,
                                   height=None, side_edge=None, depth=1.0,
                                   orientation=None, cap_colors=None, **unsupported):
    """Literal retrograde rational antiprism × interval, with (x,y,t,z) axes.

    |d| > n/2 is required. Raw signed n/d is never reduced or principalized.
    Equal-triangle default exists only if |d| < 2n/3; other symbols require
    height or feasible side_edge. Depth is a positive independent interval.
    Orientation is one common rigid XYZ matrix after transposition, never an
    alias for Stella gyro/gyro2/flip. Convex connected layers occur for
    |d|=n-1; disconnected symbols may have convex individual prism caps,
    while other symbols have literal star caps, explicitly reported.
    """
    if unsupported:
        raise GeometryError('Unsupported crossed layer parameters: '+', '.join(sorted(unsupported)))
    _bounded_json({'symbol':symbol,'radius':radius,'baseEdge':base_edge,'height':height,
                   'sideEdge':side_edge,'depth':depth,'orientation':orientation,'capColors':cap_colors})
    parsed = parse_polygon_symbol(symbol)
    n,d = parsed['n'],parsed['d']
    if 2*abs(d) <= n:
        raise GeometryError('Crossed layer family requires a raw retrograde symbol with n/2 < |d| < n.')
    if 4*n > MAX_OUTPUT_VERTICES:
        raise GeometryError(f'Crossed layer output vertex bound is {MAX_OUTPUT_VERTICES}.')
    # Validate the optional rigid matrix before generating source snapshots.
    _,transform = _transform([[0,0,0]],orientation,None,'common layer orientation')
    factor = rational_antiprism(symbol=symbol,radius=radius,base_edge=base_edge,
                               height=height,side_edge=side_edge,cap_colors=cap_colors)
    prism = polyhedron_prism(factor,depth)
    original_coordinates = [[x,y,t] for x,y,z,t in prism['vertices']]
    oriented,_ = _transform(original_coordinates,transform['matrix'],None,'common layer orientation')
    vertices = [point + [prism['vertices'][i][2]] for i,point in enumerate(oriented)]
    evidence = prism['metadata']['polyhedronPrism']
    source = factor['metadata']['rationalAntiprism']
    g = len(factor['metadata']['rationalAntiprism']['sourceModel']['faces'])
    partitions = deepcopy(evidence['componentPartitions'])
    for partition in partitions:
        factor_vertex_ids = {i % (2*n) for i in partition['maps']['vertices']}
        matches = [p for p in source['componentPartitions'] if set(p['maps']['vertices']) == factor_vertex_ids]
        if len(matches) != 1:
            raise GeometryError('Crossed source partition cannot be bound to its historical antiprism factor.')
        owner = matches[0]
        partition['sourceFactorPartitionId'] = owner['id']
        # The raw antiprism has no actual current component leaves. This ID
        # refers only to a genuine leaf in the retained polygon snapshot.
        partition['historicalSourceComponentIds'] = ([] if owner.get('sourceComponentId') is None else [{
            'sourceModelId':source['sourceModel']['id'], 'componentId':owner['sourceComponentId']}])
    cap_ids = list(range(2*g,4*g))
    crossed_ids = list(range(2*g))
    lateral_ids = list(range(4*g,len(prism['cells'])))
    layers = []
    for layer in (0,1):
        ids = [i for i in range(len(vertices)) if (i % (2*n)) // n == layer]
        layers.append({'role':'base' if layer == 0 else 'top', 'fourthCoordinate':(-1 if layer == 0 else 1)*source['height']/2,
                       'vertexIds':ids,'capCellIds':[2*g+layer*g+i for i in range(g)],
                       'sourceCycleIds':list(range(g)),
                       'convexCaps':abs(d)//g == n//g-1,
                       'singleConvexLayer':g == 1 and abs(d) == n-1,
                       'definition':'literal ordered polygon cycle × independent interval; may be star/compound'})
    model = {'id':str(uuid.uuid4()),'name':f'Derived crossed layers {symbol}', 'dimension':4,'embeddingDimension':4,
             'interpretation':'generalized-complex','vertices':vertices,
             'edges':deepcopy(prism['edges']),'faces':deepcopy(prism['faces']),'cells':deepcopy(prism['cells']),
             'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,
                        'algorithm':'literal retrograde antiprism × interval with explicit coordinate transpose'},
             'metadata':{'family':'Derived crossed layers','crossedAntiprismSegmentotope':{
                 'schemaVersion':1,'algorithmVersion':VERSION,'symbol':symbol,'n':n,'d':d,
                 'radius':source['radius'],'baseEdge':source['baseEdgeLength'],'height':source['height'],
                 'sideEdge':source['sideEdgeLength'],'depth':float(depth),'commonOrientation':transform,
                 'rawUpperRotationRadians':source['upperRotationRadians'],
                 'coordinateOwnership':{'sourceFactorAxes':['x','y','antiprismAxis'],
                                        'outputAxesBeforeCommonOrientation':['x','y','intervalAxis','antiprismAxis'],
                                        'sourcePrismToOutputAxisOrder':[0,1,3,2]},
                 'sourceFactorModel':deepcopy(factor),'sourceFactorModelId':factor['id'],
                 'sourceFactorFingerprint':identity(factor),
                 'sourceFactorSnapshotSha256':hashlib.sha256(_bounded_json(factor)).hexdigest(),
                 'maps':deepcopy(evidence['maps']),'sourceMaps':deepcopy(evidence['sourceMaps']),
                 'sourceFaceSideCells':deepcopy(evidence['sourceFaceSideCells']),
                 'layers':layers,'crossedAntiprismLateralCellIds':crossed_ids,
                 'triangularPrismLateralCellIds':lateral_ids,'layerCapCellIds':cap_ids,
                 'componentPartitions':partitions,
                 'recoverableCompoundComponents':False,
                 'componentDefinition':'metadata-only current incidence partitions; not compound Keep/Delete IDs',
                 'definition':'ordered crossed rational antiprism × interval, re-sliced along the antiprism axis',
                 'colorPolicy':evidence['colorPolicy'],
                 'scope':'derived mathematical family; no Stella crossed-checkbox, gyro, preset, exact, uniform or solid-volume qualification'}},
             'provenance':{'operation':'crossed-antiprism-segmentotope','algorithmVersion':VERSION,
                           'definition':'direct source incidence followed by axis transpose; no hull',
                           'sourceFactorModelId':factor['id'],'sourceFactorFingerprint':identity(factor)}}
    if 'offColors' in prism['metadata']:
        model['metadata']['offColors'] = deepcopy(prism['metadata']['offColors'])
    cloud = np.asarray(vertices); scale = float(np.max(np.ptp(cloud,axis=0)))
    normalized = (cloud-cloud[0])/scale if scale else cloud-cloud[0]
    if not scale or np.linalg.matrix_rank(normalized,TOLERANCE) != 4:
        raise GeometryError('Crossed layer full affine rank is unresolved at relative float64 tolerance.')
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Crossed layer ordered source validation failed: '+'; '.join(report['errors']))
    ridges = Counter(f for cell in model['cells'] for f in cell)
    if set(ridges) != set(range(len(model['faces']))) or any(value != 2 for value in ridges.values()):
        raise GeometryError('Every crossed layer ridge must have exactly two incident cells.')
    for cell in model['cells']:
        boundaries = Counter(tuple(sorted((a,b))) for f in cell for a,b in zip(model['faces'][f],model['faces'][f][1:]+model['faces'][f][:1]))
        if any(value != 2 for value in boundaries.values()):
            raise GeometryError('Every crossed layer cell edge must have exactly two incident faces.')
    model['validation'],model['fingerprint'] = report,identity(model)
    current = model['metadata']['crossedAntiprismSegmentotope']
    current['resultSourceModelId'],current['resultSourceFingerprint'] = model['id'],model['fingerprint']
    current['evidenceScope'] = 'generated source only; current maps apply while resultSourceFingerprint matches literal geometry'
    _bounded_json(model)
    return _native_gate(model)
