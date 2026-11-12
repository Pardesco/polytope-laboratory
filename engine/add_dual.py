"""Literal primal/polar compounds with checked edge or ridge contact."""

from copy import deepcopy
import math
import json
import uuid
import numpy as np

from .compounds import add_models, _colors
from .geometry import GeometryError, hull, identity, TOLERANCE
from .operations import dual, require_convex

VERSION = '0.1.0'
CONTACT_TOLERANCE = 2e-7
PALETTE = [
    (73, 161, 239),
    (245, 162, 67),
    (112, 204, 144),
    (209, 118, 222),
    (235, 105, 123),
    (107, 210, 216),
    (224, 211, 101),
    (166, 154, 244),
    (235, 151, 196),
    (177, 198, 125),
]


def colored(model, index, preserve=False):
    result = deepcopy(model)
    color = {'encoding': 'byte', 'values': list(PALETTE[index % len(PALETTE)])}
    result.setdefault('metadata', {})['offColors'] = {
        kind: [deepcopy(c if preserve and c is not None else color) for c in _colors(model, kind)]
        for kind in ('faces', 'cells')
    }
    return result


def contact_sphere(model):
    """3D midpoint sphere; 4D sphere tangent to every polygonal ridge."""
    require_convex(model)
    d = model['dimension']
    if d not in (3, 4) or model.get('embeddingDimension', d) != d:
        raise GeometryError('Add Dual requires full-dimensional 3D or 4D geometry.')
    points = np.asarray(model['vertices'], dtype=float)
    origin = points.mean(axis=0)
    scale = float(np.max(np.ptp(points, axis=0)))
    p = (points - origin) / scale
    # A common midpoint perpendicular requires a common vertex sphere.
    center = np.linalg.lstsq(2 * p, np.sum(p * p, axis=1) - np.mean(np.sum(p * p, axis=1)), rcond=None)[0]
    if d == 4:
        # The declared 4D convention uses the vertex-mean center. It does not
        # assume that ridge tangencies occur at polygon vertex means.
        center = np.zeros(d)
    ridges = model['edges'] if d == 3 else model['faces']
    contacts, perpendicular = [], 0.0
    for ids in ridges:
        face = p[ids]
        _, _, vt = np.linalg.svd(face[1:] - face[0], full_matrices=False)
        basis = vt[: d - 2].T
        contact = face[0] + basis @ (basis.T @ (center - face[0]))
        if d == 3:
            midpoint = face.mean(axis=0)
            perpendicular = max(perpendicular, float(np.linalg.norm(contact - midpoint)))
            contact = midpoint
        else:
            local = (face - contact) @ basis
            crosses = [float(np.linalg.det(np.stack([a, b]))) for a, b in zip(local, np.roll(local, -1, axis=0))]
            if min(crosses) < -CONTACT_TOLERANCE and max(crosses) > CONTACT_TOLERANCE:
                raise GeometryError('Ridge sphere contact lies outside a source ridge; use explicit reciprocation.')
        contacts.append(contact)
    distances = np.linalg.norm(np.asarray(contacts) - center, axis=1)
    radius = float(np.mean(distances))
    sphere_residual = float(np.max(np.abs(distances - radius)))
    if radius <= CONTACT_TOLERANCE or max(sphere_residual, perpendicular) > CONTACT_TOLERANCE:
        raise GeometryError(
            'No common edge-midpoint sphere (3D) or vertex-mean ridge sphere (4D) was resolved; use explicit reciprocation center/radius.'
        )
    supports = np.asarray(hull(points)['facetEquations'])
    offsets = -(supports[:, :-1] @ (origin + center * scale) + supports[:, -1]) / scale
    if np.min(offsets) <= TOLERANCE:
        raise GeometryError('Contact sphere center must lie strictly inside the convex source.')
    reciprocal = center + supports[:, :-1] * (radius**2 / offsets[:, None])
    crossing = 0.0
    for ids, contact in zip(ridges, contacts):
        values = p[ids] @ supports[:, :-1].T + (supports[:, :-1] @ origin + supports[:, -1]) / scale
        adjacent = np.flatnonzero(np.max(np.abs(values), axis=0) < CONTACT_TOLERANCE)
        if len(adjacent) != 2:
            raise GeometryError('Add Dual could not resolve two supporting facets at every ridge.')
        a, b = reciprocal[adjacent]
        direction = b - a
        t = float((contact - a) @ direction / (direction @ direction))
        crossing = max(crossing, float(np.linalg.norm(contact - (a + np.clip(t, 0, 1) * direction))))
    if crossing > CONTACT_TOLERANCE:
        raise GeometryError('Polar edge contact residual exceeds tolerance; use explicit reciprocation.')
    return {
        'center': (origin + center * scale).tolist(),
        'radius': radius * scale,
        'definition': 'edge-midpoint sphere'
        if d == 3
        else 'sphere centered at vertex mean tangent to every 2-face affine plane, with contact inside the ridge',
        'ridgeDimension': d - 2,
        'contactCount': len(ridges),
        'sphereResidual': sphere_residual * scale,
        'midpointResidual': perpendicular * scale,
        'crossingResidual': crossing * scale,
        'relativeTolerance': CONTACT_TOLERANCE,
        'sourceSpan': scale,
        'certified': False,
    }


def add_dual(model, sizing='contact', center=None, radius=1):
    if sizing not in ('contact', 'reciprocal'):
        raise GeometryError('Choose contact or reciprocal Add Dual sizing.')
    if model.get('dimension') not in (3, 4):
        raise GeometryError('Add Dual supports 3D or 4D sources.')
    if type(radius) not in (int, float) or not math.isfinite(radius) or radius <= 0:
        raise GeometryError('Add Dual needs a positive finite reciprocal radius.')
    if center is not None and (
        not isinstance(center, list)
        or len(center) != model['dimension']
        or any(type(x) not in (int, float) or not math.isfinite(x) for x in center)
    ):
        raise GeometryError('Add Dual center requires one finite numeric coordinate per source dimension.')
    if sizing == 'contact':
        if center is not None or radius != 1:
            raise GeometryError(
                'Automatic contact sizing determines its own center/radius; choose reciprocal sizing to supply them.'
            )
        evidence = contact_sphere(model)
        polar = dual(model, evidence['center'], evidence['radius'])
    else:
        from .incidence_dual import incidence_dual

        polar = (dual if model.get('interpretation') == 'convex-polytope' else incidence_dual)(model, center, radius)
        evidence = {
            'definition': 'supplied polar reciprocation; no edge/ridge contact claim',
            'center': polar['provenance'].get('parameters', {}).get('center', center),
            'radius': radius,
            'certified': False,
        }
    primal = colored(model, 0, preserve=True)
    polar = colored(polar, 1)
    normalized_center = None if center is None else [float(x) if x else 0.0 for x in center]
    token = identity(model) + json.dumps([sizing, normalized_center, float(radius)], separators=(',', ':'))
    polar['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'polytope:add-dual:polar:' + token))
    result = add_models(primal, polar)
    result['name'] = model.get('name', 'Model') + ' + dual'
    for i, component in enumerate(result['components']):
        component['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, f'polytope:add-dual:{token}:{i}'))
        component['name'] = ('Dual: ' if i == len(result['components']) - 1 else 'Primal: ') + component['name']
    result['metadata']['addDual'] = {'sizing': sizing, **evidence}
    result['metadata']['componentCount'] = len(result['components'])
    result['provenance'] = {
        'operation': 'add-dual',
        'algorithmVersion': VERSION,
        'sourceId': model['id'],
        'sourceFingerprint': identity(model),
        'parameters': {'sizing': sizing, 'center': center, 'radius': radius},
    }
    return result
