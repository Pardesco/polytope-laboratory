"""Closed intrinsic 3D incidence-product expansion, without a hull builder."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from engine.geometry import GeometryError, identity, validate
from engine.static_expansion4d import expand_runcinate4d
from engine.dual_morph_expansion import EPS, _clone, _plane, prepare_dual_morph

VERSION = '0.1.0'


def expand_runcinate(source, *, ratio=0.5, radius=1.0, center=None, color_policy='source'):
    """Commit a qualified expansion frame as a measured convex boundary.

    Interior vertices are C+(1-t)(P_v-C)+t(Q_f-C), for literal flags v<f.
    Q is the spherical reciprocal at C,r. Endpoints retain literal incidence.
    Supporting planes and oriented closed incidence are checked independently
    of the display frame. Unsupported face lattices are refused, never repaired.
    """
    if type(source) is dict and source.get('dimension') == 4:
        return expand_runcinate4d(source, ratio=ratio, radius=radius, center=center, color_policy=color_policy)
    original = _clone(source)
    if type(original) is not dict or original.get('dimension') != 3 or original.get('embeddingDimension', 3) != 3:
        raise GeometryError('Expand / runcinate requires an intrinsic convex 3D source.')
    if type(ratio) not in (int, float) or not math.isfinite(ratio) or not 0 <= ratio <= 1:
        raise GeometryError('Expansion ratio must be a finite number from 0 to 1.')
    if color_policy not in ('source', 'complement', 'none'):
        raise GeometryError('Expansion colors must be source, complement, or none.')
    working = deepcopy(original)
    if color_policy == 'none':
        working.setdefault('metadata', {})['offColors'] = {}
    plan = prepare_dual_morph({'model': working}, center, radius, complement=color_policy == 'complement')
    descriptor = plan.descriptor()
    frame = plan.evaluate('expansion', ratio)
    result = frame['model']
    points = np.asarray(result['vertices'], dtype=float)
    origin = np.asarray(descriptor['center'], dtype=float)
    scale = float(np.max(np.ptp(points, axis=0)))
    local = (points-origin)/scale
    equations = []
    area = volume = 0.0
    oriented = Counter()
    for face in result['faces']:
        normal, height = _plane(points, face, origin, scale)
        vector = sum((np.cross(local[a], local[b]) for a, b in zip(face, face[1:]+face[:1])), np.zeros(3))
        if float(vector @ normal) < 0:
            face.reverse()
        for a, b in zip(face, face[1:]+face[:1]):
            oriented[(a, b)] += 1
        anchor = local[face[0]]
        for i in range(1, len(face)-1):
            b, c = local[face[i]], local[face[i+1]]
            area += float(np.linalg.norm(np.cross(b-anchor, c-anchor)))/2
            volume += float(anchor @ np.cross(b, c))/6
        equations.append([*map(float, normal), -float(height+normal @ origin)])
    if any(count != 1 or oriented[(b, a)] != 1 for (a, b), count in oriented.items()):
        raise GeometryError('Expansion does not have a consistently oriented closed boundary.')
    if len(points)-len(result['edges'])+len(result['faces']) != 2:
        raise GeometryError('Expansion boundary does not have spherical incidence.')
    try:
        area *= scale**2
        volume *= scale**3
    except OverflowError as error:
        raise GeometryError('Expansion measures overflowed.') from error
    if not all(math.isfinite(value) and value >= np.finfo(float).tiny for value in (area, volume)):
        raise GeometryError('Expansion measures are unresolved, overflowed, or underflowed.')
    binding = {'sourceModelId': original.get('id'), 'sourceFingerprint': identity(original),
               'sourceSnapshotSha256': hashlib.sha256(json.dumps(original, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
    parameters = {'ratio': float(ratio), 'radius': descriptor['radius'], 'center': descriptor['center'], 'color_policy': color_policy}
    original_metadata = deepcopy(original.get('metadata', {}))
    derived_metadata = deepcopy(result.get('metadata', {}))
    # Arbitrary assets and original color records remain historical, not assigned
    # fabricated new element identities. Active derived colors come from the plan.
    result['metadata'] = {'sourceMetadata': original_metadata, **derived_metadata,
                          'staticExpansion': {'version': VERSION, **binding, 'parameters': parameters,
                              'sourceMaps': frame['sourceMaps'], 'endpoint': frame['endpoint'],
                              'definition': 'affine primal/reciprocal incidence product', 'hullRepair': False}}
    result.update(id=str(uuid.uuid4()), name='Expansion of '+original.get('name', 'source'),
                  interpretation='convex-polytope', facetVertices=deepcopy(result['faces']), facetEquations=equations,
                  numeric={'mode': 'float64-approximate', 'certified': False, 'tolerance': EPS},
                  provenance={'operation': 'expand-runcinate', 'algorithmVersion': VERSION,
                              **binding, 'parameters': parameters, 'convexified': False},
                  measure={'content': volume, 'boundaryMeasure': area, 'dimension': 3,
                           'units': 'model-units', 'method': 'oriented supporting-face triangulation', 'certified': False})
    result['fingerprint'] = identity(result)
    result['validation'] = validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Expansion closed convex validation failed: '+'; '.join(result['validation']['errors']))
    return result


def dispatch_static_expansion(request):
    if type(request) is not dict or set(request)-{'op', 'params', 'model', 'id', 'algorithmVersion'}:
        raise GeometryError('Expansion needs a plain source request with supported fields.')
    if request.get('op') != 'expand-runcinate' or request.get('algorithmVersion', VERSION) != VERSION:
        raise GeometryError('Unsupported expansion operation or algorithm version.')
    params = request.get('params', {})
    if type(params) is not dict or set(params)-{'ratio', 'radius', 'center', 'color_policy'}:
        raise GeometryError('Expansion accepts ratio, radius, center, and color_policy only.')
    try:
        return expand_runcinate(request.get('model'), **params)
    except GeometryError:
        raise
    except (TypeError, ValueError, KeyError, ArithmeticError, np.linalg.LinAlgError) as error:
        raise GeometryError('Malformed or numerically unresolved expansion.') from error
