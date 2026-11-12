"""Transverse vertex/edge events of independently oriented closed 3-cell sheets."""

import numpy as np
from .geometry import GeometryError
from .filled_sections import EPS, LIMITS, COLORS, _Surface, _plane, _arrange, _content, _output

VERSION = '0.1.0-transverse-cell-contacts'


def _require(value, message):
    if not value:
        raise GeometryError('Independent winding cell contact: ' + message)


def transverse_cell_contact_section(source, normal, offset, fill_rule, density_threshold):
    """Internal adapter: source is the parent's validated intrinsic cell shell."""
    raw = np.asarray(source['vertices'], dtype=float)
    center = raw.mean(0)
    span = float(np.max(np.ptp(raw, axis=0)))
    p = (raw - center) / span
    n = np.asarray(normal, dtype=float)
    n /= np.linalg.norm(n)
    depth = (offset - float(center @ n)) / span
    ds = p @ n - depth
    _require(
        min(ds) < -EPS * 16 and max(ds) > EPS * 16,
        'requires a transverse cut; supporting contacts use the literal-stratum policy.',
    )
    _require(
        not any(np.max(abs(ds[F])) <= EPS * 16 for F in source['faces']),
        'coplanar source face/cell contact is unsupported; choose Surface / convex or move depth. No limiting fill is inferred.',
    )
    _, _, vt = np.linalg.svd(n[None, :], full_matrices=True)
    basis = vt[1:].T
    origin = n * depth
    common = dict(
        normal=n.tolist(),
        offset=float(offset),
        origin=(center + span * origin).tolist(),
        basis=basis.tolist(),
        sourceId=source['id'],
    )
    params = dict(
        normal=list(normal),
        offset=offset,
        fill_rule=fill_rule,
        density_threshold=density_threshold,
        section_domain='density',
    )
    surface = _Surface({**source, 'vertices': p.tolist()})
    planes = []
    for F in source['faces']:
        if min(ds[F]) > EPS * 16 or max(ds[F]) < -EPS * 16:
            continue
        _, _, axes = np.linalg.svd(p[F] - p[F[0]], full_matrices=True)
        m = axes[-1]
        _plane(planes, m @ basis, float((origin - p[F[0]]) @ m))
    _require(bool(planes), 'no resolved section walls at the contact.')
    projected = (p - origin) @ basis
    low = projected.min(0) - 0.25
    high = projected.max(0) + 0.25
    regions, conservation = _arrange(planes, low, high, 2)
    classified = []
    residual = 0.0
    visits = 0
    for region in regions:
        witness = np.mean(region, axis=0)
        query = origin + basis @ witness
        # A face-plane witness is unresolved even when its solid angle happens
        # to round to an integer. Contacts belong to boundaries, never samples.
        distances = (
            abs(np.einsum('ij,ij->i', query - np.asarray(surface.triangles)[:, 0], surface.normals)) / surface.lengths
        )
        _require(
            float(min(distances)) > EPS * 16,
            'arrangement witness approaches a source sheet; no perturbed fill is returned.',
        )
        visits += len(surface.triangles)
        _require(visits <= LIMITS['densityVisits'], 'signed-fan work bound exceeded; no partial section is returned.')
        value, error = surface.value(query)
        residual = max(residual, error)
        if value:
            _require(
                not np.any(abs(np.asarray(region) - low) <= EPS * 16)
                and not np.any(abs(np.asarray(region) - high) <= EPS * 16),
                'nonzero winding reaches the observation box.',
            )
            classified.append((region, value, witness, _content(region, 2) * span**2))

    def selected(w):
        return w != 0 if fill_rule == 'nonzero' else w % 2 != 0 if fill_rule == 'even-odd' else w >= density_threshold

    legend = [
        dict(
            density=w,
            color=list(COLORS[(abs(w) - 1) % len(COLORS)]),
            selected=selected(w),
            regionCount=sum(r[1] == w for r in classified),
            content=sum(r[3] for r in classified if r[1] == w),
        )
        for w in sorted({r[1] for r in classified})
    ]
    diagnostics = dict(
        algorithm=VERSION,
        numericMode='float64-approximate',
        certified=False,
        partitionResidual=conservation,
        maxIntegerResidual=residual,
        arrangementRegions=len(regions),
        densityTriangleVisits=visits,
        supportingPlanes=len(planes),
        contactPolicy='transverse source vertex/edge events; open arrangement witnesses; coplanar faces/cells refuse',
        limits=LIMITS,
    )
    chosen = [r for r in classified if selected(r[1])]
    if not chosen:
        return dict(status='empty', model=None, densityLegend=legend, densityDiagnostics=diagnostics, **common)
    return _output(source, chosen, span, center, origin, basis, common, params, legend, diagnostics)
