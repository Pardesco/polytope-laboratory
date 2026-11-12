"""Approximate equilateral realizations after literal convex constructions."""

from copy import deepcopy
import math
from .geometry import GeometryError, identity
from .operations import require_convex, record
from .incidence_truncation import incidence_truncate
from .static_expansion import expand_runcinate
from .condition_fitting import fit_conditions


def pseudo_uniform(
    source, operation='truncate', amount=1 / 3, max_evaluations=100, residual_tolerance=1e-7, keep_symmetry=True
):
    require_convex(source)
    if source.get('dimension') != 3 or source.get('embeddingDimension', 3) != 3:
        raise GeometryError('Pseudo-uniform transformations currently require intrinsic convex 3D sources.')
    if operation not in ('truncate', 'expand'):
        raise GeometryError('Pseudo-uniform operation must be truncate or expand.')
    if type(amount) not in (int, float) or not math.isfinite(amount) or not 0 < amount < 0.5:
        raise GeometryError('Pseudo-uniform seed amount must be strictly between 0 and 1/2.')
    if len(source['vertices']) > 64 or 2 * len(source['edges']) > 64:
        raise GeometryError('Pseudo-uniform fitting supports at most 64 constructed vertices.')
    constructed = (
        incidence_truncate(source, amount=amount) if operation == 'truncate' else expand_runcinate(source, ratio=amount)
    )
    if len(constructed['vertices']) > 64:
        raise GeometryError('Pseudo-uniform fitting supports at most 64 constructed vertices.')
    packet = fit_conditions(
        constructed,
        {
            'objectives': ['equal-edges'],
            'fix_scale': True,
            'keep_symmetry': keep_symmetry,
            'max_evaluations': max_evaluations,
            'residual_tolerance': residual_tolerance,
        },
    )
    evidence = packet['evidence']
    if not evidence['requestedConstraintsSatisfied'] or packet['model'] is None:
        raise GeometryError(
            'Pseudo-uniform equal-edge/planarity constraints remain unresolved: '
            f"relative edge residual {evidence['residuals']['maximum']:.6g}; "
            f"planarity {evidence['residuals']['maximumPlanarity']:.6g}; {packet['status']}. "
            + '; '.join(evidence['geometricValidity']['diagnostics'])
        )
    result = packet['model']
    result['name'] = (
        'Pseudo-uniform ' + ('truncation' if operation == 'truncate' else 'expansion') + ' of ' + source['name']
    )
    result['metadata']['pseudoUniform'] = {
        'operation': operation,
        'seedAmount': amount,
        'sourceFingerprint': identity(source),
        'sourceModel': deepcopy(source),
        'construction': deepcopy(constructed['provenance']),
        'definition': 'convex combinatorial construction then equal-edge and planar-face least-squares fitting',
        'relativeEdgeResidual': evidence['residuals']['maximum'],
        'relativePlanarityResidual': evidence['residuals']['maximumPlanarity'],
        'toleranceMet': True,
        'uniformityEstablished': False,
        'certified': False,
    }
    return record(
        result,
        source,
        'pseudo-uniform',
        {
            'operation': operation,
            'amount': amount,
            'max_evaluations': max_evaluations,
            'residual_tolerance': residual_tolerance,
            'keep_symmetry': keep_symmetry,
        },
    )
