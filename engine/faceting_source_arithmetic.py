"""Read-only supplied-coordinate FAC domain receipt; no algebraic substitution."""

from collections import Counter
from itertools import combinations
import math

from engine.automatic_faceting import _source, _plane, _value, _hash, _bytes, candidate_facets
from engine.geometry import GeometryError, canonical_cycle, identity

VERSION = '0.1.0'


def inspect_source_arithmetic(source, *, cancelled=None):
    snapshot = _hash(source)
    points = _source(source)
    if len(source['faces']) > 128 or any(len(face) > 20 for face in source['faces']):
        raise GeometryError('Source arithmetic inspection supports at most 128 source faces with 20 corners each.')
    pool = candidate_facets(source, source_symmetry={'mode': 'all'}, cancelled=cancelled)
    rows = []
    cycles = {tuple(row['cycle']) for row in pool['candidates']}
    for face_id, face in enumerate(source['faces']):
        if cancelled is not None and cancelled():
            raise GeometryError('Source arithmetic inspection canceled; no receipt published.')
        anchor = next((ids for ids in combinations(face, 3) if _plane(points, ids) is not None), None)
        plane = _plane(points, anchor) if anchor is not None else None
        values = [_value(plane, points[v]) for v in face] if plane is not None else []
        scale = max(map(abs, plane[:3])) if plane is not None else 0
        norm = math.hypot(*(float(x / scale) for x in plane[:3])) if scale else 0
        residual = float(max(map(abs, values)) / scale) / norm if norm else None
        rows.append(
            {
                'sourceFaceId': face_id,
                'cycle': list(face),
                'anchorVertexIds': list(anchor) if anchor else None,
                'exactPlane': [str(x) for x in plane] if plane else None,
                'exactPlaneValues': [str(x) for x in values],
                'exactlyPlanar': plane is not None and not any(values),
                'nonzeroVertexIds': [v for v, x in zip(face, values) if x],
                'maximumAnchorPlaneDistanceApprox': residual,
                'inCandidatePool': canonical_cycle(face) in cycles,
            }
        )
    discovery = pool['sourceSymmetryDiscovery']
    group = pool['symmetry']['group']
    complete = pool['status'] == 'complete'
    failed = [row['sourceFaceId'] for row in rows if not row['exactlyPlanar']]
    diagnostics = []
    if failed:
        diagnostics.append(
            'Displayed source faces fail exact supplied-coordinate planarity. Use source faces cannot recover those cycles; increasing caps cannot restore them.'
        )
    if source.get('rationalCoordinates') is not None:
        diagnostics.append(
            'Automatic faceting reads vertices as supplied integer/binary64 ratios. rationalCoordinates is not substituted by this kernel; other exact-policy helpers have a separate contract.'
        )
    diagnostics.append(
        'Intended algebraic regular geometry is a separate domain requiring an explicit provider and exact adapter. No coordinates were snapped or replaced.'
    )
    receipt = {
        'version': VERSION,
        'status': pool['status'],
        'sourceId': source['id'],
        'sourceFingerprint': identity(source),
        'sourceSnapshotHash': snapshot,
        'numericPredicate': 'exact supplied integer/binary64 ratios from vertices',
        'coordinateRatios': [[str(x) for x in point] for point in points],
        'sourceGeometryChanged': False,
        'implicitWeld': False,
        'numericCertifiedModel': False,
        'intendedAlgebraicGeometrySupported': False,
        'sourceFaces': rows,
        'nonplanarSourceFaceIds': failed,
        'maximumAnchorPlaneDistanceApprox': max(
            (row['maximumAnchorPlaneDistanceApprox'] or 0 for row in rows), default=0
        ),
        'candidateDomain': {
            'complete': complete,
            'planes': len(pool['planes']),
            'cycles': len(pool['candidates']),
            'planeVertexCounts': {
                str(k): v for k, v in sorted(Counter(len(row['sourceVertexIds']) for row in pool['planes']).items())
            },
            'cycleCornerCounts': {
                str(k): v for k, v in sorted(Counter(len(row['cycle']) for row in pool['candidates']).items())
            },
            'sourceFaceCyclesPresent': sum(row['inCandidatePool'] for row in rows),
            'candidateActionStatus': pool['symmetry']['status'],
            'candidateOrbits': len(pool['symmetry']['orbits']),
            'domain': pool['domain'],
            'planeWork': pool.get('planeWork'),
        },
        'sourceSymmetry': {
            'status': discovery['status'],
            'complete': discovery['complete'],
            'verifiedActionsFound': discovery['verifiedActionsFound'],
            'order': group['order'] if discovery['complete'] else None,
            'maximalSuppliedCoordinateGroupClaim': discovery['complete'],
            'properOrder': sum(sign == 1 for sign in group['orientationSigns']) if discovery['complete'] else None,
            'groupId': group['id'],
            'workUsed': discovery['workUsed'],
            'workLimit': discovery['workLimit'],
        },
        'searchScope': 'Candidate and action inspection only; no subset search or faceting count. Empty searches do not exclude intended algebraic facetings.',
        'diagnostics': diagnostics,
        'limitReasons': pool['limitReasons'],
    }
    if _hash(source) != snapshot:
        raise GeometryError('Source arithmetic ownership changed; no receipt published.')
    receipt['id'] = 'faceting-source-arithmetic-' + _hash(receipt)
    _bytes(receipt)
    return receipt


def dispatch_source_arithmetic(request):
    if (
        type(request) is not dict
        or set(request) - {'op', 'model', 'params', 'id'}
        or request.get('op') != 'facet-source-arithmetic'
        or type(request.get('params', {})) is not dict
        or request.get('params', {})
    ):
        raise GeometryError('Source arithmetic inspection accepts a source Model and empty parameters only.')
    return inspect_source_arithmetic(request.get('model'))
