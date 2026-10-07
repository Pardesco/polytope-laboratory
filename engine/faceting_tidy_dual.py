"""Strict primal/finite polar-dual tidy filter using recorded source incidence.

Exact predicates establish tidiness. Native polar geometry independently checks
the same incidence/coordinates; unresolved numerical domains are unknown, not
false. No replacement hull, angular face order or implicit welding is used.
"""
from copy import deepcopy
from fractions import Fraction
import math

from engine.faceting_policy_predicates import analyze_reciprocal, _f, _bytes
from engine.faceting import facet
from engine.geometry import GeometryError, canonical_cycle
from engine.history import _source_hash
from engine.incidence_dual import incidence_dual

VERSION = '0.1.0'
CENTER_BOUND = 1e100
RADIUS_MIN, RADIUS_MAX = 1e-4, 1e4


def tidy_dual_parameters(value):
    """Optional schema leaves all existing criteria byte-for-byte unchanged."""
    if 'tidy_dual' in value and type(value['tidy_dual']) is not bool:
        raise GeometryError('Faceting tidy_dual must be boolean.')
    if not value.get('tidy_dual', False):
        if 'dual_center' in value or 'dual_radius' in value:
            raise GeometryError('Dual center/radius require enabled tidy_dual.')
        return {'tidy_dual':False} if 'tidy_dual' in value else {}
    center = value.get('dual_center')
    if center is not None and (type(center) is not list or len(center)!=3 or
        any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>CENTER_BOUND for x in center)):
        raise GeometryError('Dual center must be null (all-source vertex mean) or three finite bounded coordinates.')
    radius = value.get('dual_radius', 1)
    if type(radius) not in (int,float) or not math.isfinite(radius) or not RADIUS_MIN<=radius<=RADIUS_MAX:
        raise GeometryError('Dual sphere radius must be from 0.0001 through 10000.')
    return {'tidy_dual':True,'dual_center':deepcopy(center),'dual_radius':radius}


def _points_center(source, center):
    vertices=source.get('vertices') if type(source) is dict else None
    if type(vertices) is not list or not 4<=len(vertices)<=12:
        raise GeometryError('Tidy-dual search supports 4 through 12 source vertices.')
    rows = source.get('rationalCoordinates', source['vertices'])
    if type(rows) is not list or len(rows)!=len(vertices) or any(type(row) is not list or len(row)!=3 for row in rows):
        raise GeometryError('Tidy-dual requires a complete three-coordinate source table.')
    points = [tuple(_f(x) for x in row) for row in rows]
    resolved = tuple(_f(x) for x in center) if center is not None else tuple(
        sum(row[k] for row in points)/len(points) for k in range(3))
    if any(max(x.numerator.bit_length(),x.denominator.bit_length())>4096 for row in points+[resolved] for x in row):
        raise GeometryError('Tidy-dual exact coordinates/center exceed the 4096-bit bound.')
    return points, resolved


def validate_tidy_dual_equivalence(source, criteria, group, equivalence):
    if not criteria.get('tidy_dual') or equivalence!='subgroup':
        return
    # Full source distances, not degree or symmetry-count guesses: equality of
    # distances to an affine-rank-three set fixes the center uniquely.
    from engine.automatic_faceting import _symmetry
    points, center = _points_center(source, criteria['dual_center'])
    actions = group['permutations']
    try:
        _symmetry(source, points, actions)
    except StopIteration as exc:
        raise GeometryError('Tidy-dual declared exact coordinates require affine rank three.') from exc
    distances = [sum((x-c)**2 for x,c in zip(row,center)) for row in points]
    if any(distances[v]!=distances[action[v]] for action in actions for v in range(len(points))):
        raise GeometryError('Tidy-dual center is not fixed by the selected subgroup; use labeled equivalence or a subgroup-fixed center.')


def analyze_tidy_dual(source, cycles, *, center=None, radius=1, max_work=500_000, cancelled=None):
    params = tidy_dual_parameters({'tidy_dual':True,'dual_center':center,'dual_radius':radius})
    _bytes({'source':source,'cycles':cycles,'parameters':params},16*1024*1024)
    owned = _source_hash({'source':source,'cycles':cycles,'parameters':params})
    _, resolved = _points_center(source, center)
    receipt = analyze_reciprocal(source,cycles,center=[str(x) for x in resolved],radius=radius,
        max_work=max_work,cancelled=cancelled)
    receipt['version'] = VERSION
    receipt['policy'] = 'tidy-dual'
    receipt['parameters'] = {**params,'centerRule':'all-source-vertex-mean' if center is None else 'explicit'}
    witness = receipt['witnesses']
    witness['reciprocalPredicateVersion'] = '0.1.0'
    witness['nativeModelValidated'] = False
    witness['nativeQualificationWork'] = 0
    if witness.get('coincidentDualVertexSelectedFaceGroups'):
        # The frozen reciprocal utility refuses this display domain. Do not
        # turn a required identity collapse/weld into an exhaustive mathematical
        # tidy-dual rejection: separate coincident owners need broader semantics.
        receipt.update(status='unsupported',passed=None)
        receipt['diagnostics'].append('Coincident polar source-face owners are outside this distinct-vertex domain; verdict unknown, no implicit weld.')
    if receipt['status']=='complete' and receipt['passed'] is True:
        # Charge a deterministic bound before invoking bounded native routines.
        # Native loops are atomic, with cancellation/ownership checked on both
        # sides; they never run when the remaining predicate budget is too small.
        active = sorted({v for face in cycles for v in face})
        native_work = (len(cycles)**2 + len(active)*len(cycles) +
            sum(len(face)**2 for face in cycles+witness['dualFaces']))
        if receipt['workUsed']+native_work>max_work:
            receipt.update(status='resource-limited',passed=None)
            receipt['diagnostics'].append('Native polar qualification work budget reached; verdict unknown.')
        elif cancelled is not None and cancelled():
            receipt.update(status='user-cancelled',passed=None)
            receipt['diagnostics'].append('Native polar qualification canceled; verdict unknown.')
        else:
            receipt['workUsed'] += native_work
            witness['nativeQualificationWork'] = native_work
            try:
                if not witness.get('nativeFloatCoordinatesRepresentable'):
                    raise GeometryError('Finite exact polar coordinates are not representable without collapsing source identities.')
                ids = {old:new for new,old in enumerate(active)}
                # Temporary native carrier compresses only unused source IDs.
                # Its exact owner maps refer back to the full untouched source.
                carrier = facet({'id':source['id'],'name':source.get('name','Faceting'),
                    'dimension':3,'embeddingDimension':3,'vertices':[deepcopy(source['vertices'][v]) for v in active],
                    'numeric':{'mode':'float64-approximate','certified':False}},
                    [[ids[v] for v in face] for face in cycles])
                dual = incidence_dual(carrier,center=[float(x) for x in resolved],radius=radius)
                native_cycles = [list(canonical_cycle(face)) for face in dual['faces']]
                if native_cycles!=[list(canonical_cycle(face)) for face in witness['dualFaces']]:
                    raise GeometryError('Native polar dual cycles disagree with exact source vertex links.')
                exact_display = [[float(Fraction(x)) for x in row] for row in witness['dualVertices']]
                dual_span = max(max(row[k] for row in exact_display)-min(row[k] for row in exact_display) for k in range(3))
                residual = max(abs(a-b) for left,right in zip(exact_display,dual['vertices']) for a,b in zip(left,right))
                if not math.isfinite(residual) or residual>dual_span*1e-7:
                    raise GeometryError('Native polar coordinates disagree with the exact reciprocal beyond the relative tolerance.')
                witness.update(nativeModelValidated=True,nativeDualVertices=deepcopy(dual['vertices']),
                    nativeDualFaces=native_cycles,nativeActiveSourceVertexIds=active,
                    nativeCoordinateAgreementResidual=residual,nativeCoordinateAgreementTolerance=dual_span*1e-7,
                    nativePolarityResidual=dual['provenance']['maximumPolarityResidual'],
                    nativePolarityTolerance=dual['provenance']['polarityTolerance'],
                    nativeMinimumFaceCenterDistance=dual['provenance']['minimumFaceCenterDistance'],
                    nativeConvexified=False)
            except (GeometryError,ValueError,OverflowError,ArithmeticError) as exc:
                receipt.update(status='unsupported',passed=None)
                receipt['diagnostics'].append('Native polar domain unresolved: '+str(exc))
            if cancelled is not None and cancelled():
                receipt.update(status='user-cancelled',passed=None)
                receipt['diagnostics'].append('Native polar qualification canceled; verdict unknown.')
    if _source_hash({'source':source,'cycles':cycles,'parameters':params})!=owned:
        raise GeometryError('Tidy-dual source/cycle/parameter ownership changed during evaluation.')
    receipt.pop('id',None)
    receipt['id'] = 'faceting-tidy-dual-'+_source_hash(receipt)
    return receipt
