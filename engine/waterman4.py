"""Bounded Z4/D4 rational-ball selection and approximate four-dimensional hull."""

from copy import deepcopy
from fractions import Fraction
import hashlib
from itertools import product
import math

import numpy as np

from .geometry import GeometryError, TOLERANCE, hull, identity
from .history import _json_bytes
from .waterman import _rational, MAX_COMMON_DENOMINATOR_BITS, MAX_RATIONAL_BITS

VERSION = '0.1.0'
MAX_INSPECTED_SITES = 65536
MAX_SELECTED_POINTS = 256
MAX_OUTPUT_VERTICES = 128
MAX_COORDINATE = 1000
MAX_PAYLOAD_BYTES = 8 * 1024 * 1024


def waterman4(radius_squared=2, *, center=(0, 0, 0, 0), lattice='D4', **unsupported):
    if unsupported:
        raise GeometryError('Unknown 4D Waterman parameters: ' + ', '.join(sorted(unsupported)))
    if type(lattice) is not str or lattice not in ('Z4', 'D4'):
        raise GeometryError('4D Waterman lattice must be Z4 (integer quadruples) or D4 (even coordinate sum).')
    threshold, raw_threshold = _rational(radius_squared, '4D squared radius')
    if not 0 < threshold <= 64:
        raise GeometryError('4D Waterman squared radius must be positive and at most 64.')
    if type(center) not in (list, tuple) or len(center) != 4:
        raise GeometryError('4D Waterman center requires exactly four rational coordinates.')
    parsed = [_rational(value, '4D center coordinate ' + str(i)) for i, value in enumerate(center)]
    origin = [value for value, raw in parsed]
    if any(abs(value) > MAX_COORDINATE for value in origin):
        raise GeometryError('4D Waterman center exceeds the absolute coordinate bound of 1000.')
    denominator = math.lcm(*(value.denominator for value in origin))
    if denominator.bit_length() > MAX_COMMON_DENOMINATOR_BITS:
        raise GeometryError('4D Waterman center common denominator exceeds the 512-bit arithmetic bound.')
    numerators = [value.numerator * (denominator // value.denominator) for value in origin]
    extent = math.isqrt(threshold.numerator // threshold.denominator)
    if extent * extent < threshold:
        extent += 1
    bounds = [(math.floor(value) - extent, math.ceil(value) + extent) for value in origin]
    inspected = math.prod(hi - lo + 1 for lo, hi in bounds)
    if inspected > MAX_INSPECTED_SITES:
        raise GeometryError(f'4D Waterman inspected-site resource limit is {MAX_INSPECTED_SITES}.')
    selected, distances, boundary = [], [], []
    right = threshold.numerator * denominator**2
    for point in product(*(range(lo, hi + 1) for lo, hi in bounds)):
        if lattice == 'D4' and sum(point) % 2:
            continue
        squared = sum((p * denominator - c) ** 2 for p, c in zip(point, numerators))
        left = squared * threshold.denominator
        if left > right:
            continue
        if len(selected) >= MAX_SELECTED_POINTS:
            raise GeometryError(f'4D Waterman selected-point resource limit is {MAX_SELECTED_POINTS}.')
        if left == right:
            boundary.append(len(selected))
        selected.append(list(point))
        distances.append(str(Fraction(squared, denominator**2)))
    if len(selected) < 5:
        raise GeometryError('4D Waterman ball selects fewer than five sites; a full 4D hull is unavailable.')
    model = hull(selected, f'{lattice} Waterman 4D (r²={threshold})')
    if len(model['vertices']) > MAX_OUTPUT_VERTICES:
        raise GeometryError(f'4D Waterman output vertex resource limit is {MAX_OUTPUT_VERTICES}.')
    if any(
        not math.isfinite(model['measure'][key]) or model['measure'][key] <= 0 for key in ('content', 'boundaryMeasure')
    ):
        raise GeometryError('4D Waterman hull measures must resolve finite positive float64 values.')
    hull_evidence = deepcopy(model['provenance'])
    output_to_selected = hull_evidence['extremeInputIndices']
    if any(model['vertices'][i] != selected[j] for i, j in enumerate(output_to_selected)):
        raise GeometryError('4D Waterman hull did not preserve the original lattice coordinates.')
    selected_to_output = [None] * len(selected)
    for i, j in enumerate(output_to_selected):
        selected_to_output[j] = i
    equations = np.asarray(model['facetEquations'])
    cloud = np.asarray(selected, dtype=float)
    scale = float(np.max(np.ptp(cloud, axis=0)))
    outside = max(0.0, float(np.max(cloud @ equations[:, :4].T + equations[:, 4]))) / scale
    planarity = (
        max(
            float(np.max(np.abs(np.asarray(model['vertices'])[ids] @ eq[:4] + eq[4])))
            for ids, eq in zip(model['facetVertices'], equations)
        )
        / scale
    )
    if max(outside, planarity) > 8 * TOLERANCE:
        raise GeometryError('4D Waterman floating support residual exceeds the hull tolerance.')
    source = {
        'lattice': lattice,
        'center': [str(value) for value in origin],
        'radiusSquared': str(threshold),
        'coordinates': selected,
    }
    model['provenance'] = {
        'operation': 'waterman-4d',
        'algorithmVersion': VERSION,
        'parameters': {'radius_squared': str(threshold), 'center': source['center'], 'lattice': lattice},
        'rawInput': {'radius_squared': raw_threshold, 'center': [raw for value, raw in parsed]},
        'hullEvidence': hull_evidence,
    }
    model['metadata'].update(
        family='Waterman',
        waterman4={
            'schemaVersion': 1,
            'algorithmVersion': VERSION,
            'sourceSnapshot': source,
            'sourceSnapshotSha256': hashlib.sha256(_json_bytes(source, MAX_PAYLOAD_BYTES)).hexdigest(),
            'selectedPointCount': len(selected),
            'outputVertexToSelectedPoint': output_to_selected,
            'selectedPointToOutputVertex': selected_to_output,
            'selectionCertificate': {
                'certified': True,
                'exhausted': True,
                'property': 'complete lattice membership in the supplied closed rational ball only',
                'arithmetic': 'bounded exact integer squared distances',
                'latticeRule': 'all integer quadruples'
                if lattice == 'Z4'
                else 'integer quadruples with even coordinate sum',
                'boundingBox': [list(pair) for pair in bounds],
                'inspectedBoxSiteCount': inspected,
                'originCommonDenominator': str(denominator),
                'originScaledNumerators': [str(value) for value in numerators],
                'thresholdNumerator': str(threshold.numerator),
                'thresholdDenominator': str(threshold.denominator),
                'selectedSquaredDistances': distances,
                'boundarySelectedPointIds': boundary,
                'doesNotCertify': [
                    'hull incidence',
                    'floating supports or measures',
                    'benchmark root/sequence conventions',
                ],
            },
            'hullResiduals': {
                'certified': False,
                'normalization': 'maximum selected coordinate range',
                'maximumOutsideSupportResidual': outside,
                'maximumFacetPlanarityResidual': planarity,
                'tolerance': TOLERANCE,
            },
            'coordinateDefinition': 'Original integer lattice frame; no recentering or automatic scaling.',
            'sequenceDefinition': 'Add/subtract the supplied positive rational squared-radius increment; repeated hulls are retained. No author-root mapping asserted.',
            'knownLimits': 'Z4 and D4 only; full-dimensional float64 hull; no benchmark option/default equivalence or exact hull certificate.',
            'resourceBounds': {
                'inspectedBoxSites': MAX_INSPECTED_SITES,
                'selectedPoints': MAX_SELECTED_POINTS,
                'outputVertices': MAX_OUTPUT_VERTICES,
                'rawRationalBits': MAX_RATIONAL_BITS,
                'commonDenominatorBits': MAX_COMMON_DENOMINATOR_BITS,
                'absoluteCenterCoordinate': MAX_COORDINATE,
                'maximumSquaredRadius': 64,
                'payloadBytes': MAX_PAYLOAD_BYTES,
            },
            'sourceModelId': model['id'],
            'sourceFingerprint': identity(model),
            'evidenceScope': 'Generated source only; selection maps apply while current geometry matches sourceFingerprint.',
        },
    )
    model['numeric'].update(selectionArithmetic='exact rational ball membership only')
    _json_bytes(model, MAX_PAYLOAD_BYTES)
    return model
