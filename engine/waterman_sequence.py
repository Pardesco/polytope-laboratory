"""Version 1 occupied-shell convention for the existing 3D Waterman lattices."""

from fractions import Fraction
from itertools import product
import json
import math

import numpy as np

from .geometry import GeometryError, TOLERANCE
from .history import _json_bytes
from .waterman import (
    _rational,
    _native_gate,
    waterman_ball,
    MAX_COMMON_DENOMINATOR_BITS,
    MAX_INSPECTED_SITES,
    MAX_LATTICE_COORDINATE,
    MAX_PAYLOAD_BYTES,
)

VERSION = '1.0.0'
CONVENTION = 'waterman-occupied-shell-v1'


def _ceiling_radius(value):
    radius = math.isqrt(value.numerator // value.denominator)
    return radius + (radius * radius < value)


def adjacent_shell(radius_squared, *, direction=1, center=(0, 0, 0), lattice='FCC'):
    if type(direction) is not int or direction not in (-1, 1):
        raise GeometryError('Waterman shell direction must be -1 (previous) or 1 (next).')
    if type(lattice) is not str or lattice not in ('SC', 'FCC', 'BCC'):
        raise GeometryError('Waterman occupied shells support SC, FCC and BCC in 3D only.')
    anchor, raw_anchor = _rational(radius_squared, 'shell anchor squared radius')
    if anchor < 0:
        raise GeometryError('Waterman shell anchor squared radius must be nonnegative.')
    if type(center) not in (list, tuple) or len(center) != 3:
        raise GeometryError('Waterman shell origin requires exactly three rational coordinates.')
    parsed = [_rational(value, 'shell origin coordinate ' + str(i)) for i, value in enumerate(center)]
    origin = [value for value, raw in parsed]
    if any(abs(value) > MAX_LATTICE_COORDINATE for value in origin):
        raise GeometryError('Waterman shell origin exceeds the bounded lattice-coordinate domain.')
    denominator = math.lcm(*(value.denominator for value in origin))
    if denominator.bit_length() > MAX_COMMON_DENOMINATOR_BITS:
        raise GeometryError('Waterman shell origin common denominator exceeds the bounded arithmetic domain.')
    numerators = [value.numerator * (denominator // value.denominator) for value in origin]
    upper, witness = anchor, None
    if direction == 1:
        # All-even sites belong to every supported lattice. This witness lies
        # strictly outside the anchor ball, bounding a complete next-shell search.
        witness = [2 * math.floor(value / 2) for value in origin]
        witness[0] = 2 * math.ceil((origin[0] + _ceiling_radius(anchor) + 1) / 2)
        upper = sum((Fraction(p) - c) ** 2 for p, c in zip(witness, origin))
    extent = _ceiling_radius(upper)
    bounds = [(math.floor(value) - extent, math.ceil(value) + extent) for value in origin]
    inspected = math.prod(hi - lo + 1 for lo, hi in bounds)
    if inspected > MAX_INSPECTED_SITES:
        raise GeometryError(
            f'Waterman occupied-shell search exceeds the {MAX_INSPECTED_SITES} inspected-site resource limit.'
        )
    if any(max(abs(lo), abs(hi)) > MAX_LATTICE_COORDINATE for lo, hi in bounds):
        raise GeometryError('Waterman shell search exceeds the bounded lattice-coordinate domain.')
    best, points = None, []
    d2 = denominator**2
    for point in product(*(range(lo, hi + 1) for lo, hi in bounds)):
        if lattice == 'FCC' and sum(point) % 2:
            continue
        if lattice == 'BCC' and not point[0] % 2 == point[1] % 2 == point[2] % 2:
            continue
        squared = sum((p * denominator - c) ** 2 for p, c in zip(point, numerators))
        comparison = squared * anchor.denominator - anchor.numerator * d2
        if comparison * direction <= 0 or squared * upper.denominator > upper.numerator * d2:
            continue
        if best is None or (squared - best) * direction < 0:
            best, points = squared, [list(point)]
        elif squared == best:
            points.append(list(point))
    if best is None:
        raise GeometryError('No previous occupied Waterman shell exists below this squared radius.')
    resolved = Fraction(best, d2)
    evidence = {
        'schemaVersion': 1,
        'algorithmVersion': VERSION,
        'convention': CONVENTION,
        'definition': 'Strict nearest occupied squared-distance shell at the fixed rational origin and lattice; closed-ball hull; no topology filtering.',
        'anchorRadiusSquared': str(anchor),
        'radiusSquared': str(resolved),
        'direction': direction,
        'lattice': lattice,
        'center': [str(value) for value in origin],
        'rawInput': {'radius_squared': raw_anchor, 'center': [raw for value, raw in parsed]},
        'shellCoordinates': points,
        'searchCertificate': {
            'certified': True,
            'exhausted': True,
            'property': 'nearest occupied lattice squared distance only; no hull or benchmark sequence certificate',
            'arithmetic': 'bounded exact integer/Fraction comparisons',
            'boundingBox': [list(pair) for pair in bounds],
            'inspectedBoxSiteCount': inspected,
            'upperSquaredRadius': str(upper),
            'outsideAnchorWitness': witness,
            'originCommonDenominator': str(denominator),
            'originScaledNumerators': [str(value) for value in numerators],
        },
        'knownLimits': '3D SC/FCC/BCC only; full-dimensional hull required; no skipping degenerate shells, distinct-hull filtering, numbered-root or benchmark sequence equivalence.',
    }
    return str(resolved), evidence


def waterman_shell(
    radius_squared=0, *, direction=1, center=(0, 0, 0), lattice='FCC', convention=CONVENTION, **unsupported
):
    if unsupported:
        raise GeometryError('Unknown Waterman shell parameters: ' + ', '.join(sorted(unsupported)))
    if convention != CONVENTION:
        raise GeometryError('Unsupported Waterman occupied-shell convention; expected ' + CONVENTION + '.')
    params = {
        'radius_squared': radius_squared,
        'direction': direction,
        'center': center,
        'lattice': lattice,
        'convention': convention,
    }
    retained = json.loads(_json_bytes(params, MAX_PAYLOAD_BYTES))
    resolved, evidence = adjacent_shell(radius_squared, direction=direction, center=center, lattice=lattice)
    if resolved == '0':
        raise GeometryError('Previous occupied shell has squared radius 0; its ball cannot form a full 3D hull.')
    model = waterman_ball(resolved, center=center, lattice=lattice)
    info = model['metadata'].get('watermanFcc', model['metadata'].get('watermanBall'))
    cloud = np.asarray(info['sourceSnapshot']['coordinates'], dtype=float)
    equations = np.asarray(model['facetEquations'])
    scale = float(np.max(np.ptp(cloud, axis=0)))
    outside = max(0.0, float(np.max(cloud @ equations[:, :3].T + equations[:, 3]))) / scale
    planarity = (
        max(
            float(np.max(np.abs(np.asarray(model['vertices'])[ids] @ eq[:3] + eq[3])))
            for ids, eq in zip(model['facetVertices'], equations)
        )
        / scale
    )
    if max(outside, planarity) > 8 * TOLERANCE:
        raise GeometryError('Waterman shell floating support residual exceeds the hull tolerance.')
    evidence['hullResiduals'] = {
        'certified': False,
        'normalization': 'maximum selected coordinate range',
        'maximumOutsideSupportResidual': outside,
        'maximumFacetPlanarityResidual': planarity,
        'tolerance': TOLERANCE,
    }
    evidence.update(
        sourceModelId=model['id'],
        sourceFingerprint=model['fingerprint'],
        evidenceScope='Generated source only; shell evidence is historical after geometry operations.',
    )
    model['metadata']['watermanSequence'] = evidence
    model['provenance']['generator'] = {'kind': 'waterman-shell', 'parameters': retained}
    return _native_gate(model)
