"""Four-dimensional correlated polygon hulls (step prisms).

Unlike literal polygon products, convexification defines this family. The
published Stella author explanation selects (i, step*i mod n) in an n×n
duoprism and takes that point subset's hull. Numeric topology is approximate.
"""
from copy import deepcopy
import math

import numpy as np

from .geometry import GeometryError, TOLERANCE, hull, rank

VERSION = '0.1.0'
MAX_ORDER = 128
MIN_RADIUS = 1e-70
MAX_RADIUS = 1e70
MANUAL = 'https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro'
DEFINITION = 'https://www.software3d.com/Forums/viewtopic.php?p=1676'


def step_prism(n, step, radius=1.0):
    """Ordinary n-gonal equal-radius factors; signed steps remain explicit.

    Rank-deficient diagonal subsets fail explicitly. Non-coprime steps can
    still span four dimensions and are retained when their hull resolves.
    This does not claim rational-symbol or arbitrary multiprism parity.
    """
    if type(n) is not int or not 5 <= n <= MAX_ORDER:
        raise GeometryError(f'Step-prism order must be an integer from 5 to {MAX_ORDER}.')
    if type(step) is not int or not 0 < abs(step) < n:
        raise GeometryError('Step size must be a nonzero integer with absolute value below the polygon order.')
    if type(radius) not in (int, float) or not MIN_RADIUS <= radius <= MAX_RADIUS or not math.isfinite(radius):
        raise GeometryError('Step-prism radius must be finite and lie between 1e-70 and 1e70 so float64 four-volume remains representable.')
    indices = [[i, (step*i) % n] for i in range(n)]
    normalized = [[math.cos(math.tau*a/n), math.sin(math.tau*a/n),
                   math.cos(math.tau*b/n), math.sin(math.tau*b/n)]
                  for a, b in indices]
    dimension = rank(np.asarray(normalized))
    if dimension != 4:
        raise GeometryError(f'Correlated vertices have affine dimension {dimension}; a full 4D step prism requires dimension 4.')
    points = [[radius*x for x in p] for p in normalized]
    # The existing kernel normalizes before floating support predicates. All
    # distinct vertices lie on a common sphere, hence each should be extreme.
    result = hull(points, name=f'{n}-{step} step prism')
    if result['vertices'] != points:
        raise GeometryError('Numeric hull did not retain all ordered spherical source vertices.')
    result['metadata']['stepPrism'] = {
        'schemaVersion': 1, 'algorithmVersion': VERSION,
        'parameters': {'n': n, 'step': step, 'radius': radius},
        'selectedFactorVertexIds': indices,
        'sourceVertices': deepcopy(points),
        'resultVertexIds': list(range(n)),
        'generatedSourceModelId': result['id'],
        'generatedSourceFingerprint': result['fingerprint'],
        'evidenceScope': 'Generated source geometry only; original radius, selected factor IDs and vertex map remain historical after geometry operations.',
        'definition': 'convex hull of (i, step*i mod n) vertices in ordinary n×n duoprism',
        'manualSource': MANUAL, 'definitionSource': DEFINITION,
        'numericContract': 'Float64 coordinates; normalized floating support predicates, tolerance '+str(TOLERANCE),
        'certified': False,
        'knownLimits': 'Orders 5..128, radius 1e-70..1e70, equal-radius ordinary polygons and full-rank 4D steps only; rational symbols, exact arithmetic and installed competitor domain qualification pending.'}
    result['provenance'] = {'operation': 'step-prism', 'algorithmVersion': VERSION,
        'parameters': {'n': n, 'step': step, 'radius': radius},
        'definitionSource': DEFINITION}
    return result
