"""Exact optional FAC03 leaf filters; bounded recorded domains, no full parity claim."""
from copy import deepcopy

from engine.faceting_policy_predicates import analyze_tidy, analyze_spiky
from engine.geometry import GeometryError
from engine.faceting_tidy_dual import analyze_tidy_dual

VERSION = '0.1.0'
WORK_LIMIT = 500_000


class PolicyStop(Exception):
    def __init__(self, status, reason):
        self.status, self.reason = status, reason


class PolicyBudget:
    def __init__(self, maximum=WORK_LIMIT):
        if type(maximum) is not int or not 1 <= maximum <= WORK_LIMIT:
            raise GeometryError('Faceting policy work cap must be 1 through 500000.')
        self.maximum, self.used = maximum, 0


def policy_evidence(source, cycles, criteria, *, budget=None, cancelled=None):
    """Complete witness content is independent of the remaining job work budget.

    Full source and selected cycles already belong to the surrounding search
    receipt. Do not duplicate their potentially large snapshots at every leaf.
    Unknown predicates interrupt enumeration; they never become a false check.
    """
    budget = budget if budget is not None else PolicyBudget()
    evidence = {}
    for name, function in (('tidy', analyze_tidy), ('spiky', analyze_spiky), ('tidy_dual', analyze_tidy_dual)):
        if not criteria.get(name, False):
            continue
        remaining = budget.maximum - budget.used
        if remaining <= 0:
            raise PolicyStop('resource-limited', 'exact faceting policy work cap')
        params = {'allow_coplanar_sharing': criteria['coplanar_vertices'] == 'allow'} if name == 'tidy' else {}
        if name == 'tidy_dual':
            params = {'center':criteria['dual_center'],'radius':criteria['dual_radius']}
        receipt = function(source, cycles, max_work=remaining, cancelled=cancelled, **params)
        budget.used += receipt['workUsed']
        if receipt['status'] != 'complete' or type(receipt['passed']) is not bool:
            reason = 'exact faceting policy canceled' if receipt['status'] == 'user-cancelled' else 'exact faceting policy verdict unknown'
            if name == 'tidy_dual':
                reason += ': ' + '; '.join(receipt['diagnostics'])
            raise PolicyStop(receipt['status'], reason)
        evidence[name] = {key: deepcopy(receipt[key]) for key in (
            'version', 'policy', 'sourceId', 'sourceFingerprint', 'sourceSnapshotHash',
            'parameters', 'numericPredicate', 'numericCertifiedModel', 'status', 'passed',
            'diagnostics', 'witnesses', 'workUsed', 'sourceGeometryChanged', 'implicitWeld')}
    return evidence


def apply_policy_evidence(source, result, criteria, *, budget=None, cancelled=None):
    if not any(criteria.get(key, False) for key in ('tidy', 'spiky', 'tidy_dual')):
        return result
    evidence = policy_evidence(source, result['cycles'], criteria, budget=budget, cancelled=cancelled)
    filters = result['criteriaEvidence']
    filters['exactPolicyVersion'] = VERSION
    filters['policyEvidence'] = evidence
    filters['checks'].update({name: row['passed'] for name, row in evidence.items()})
    filters['accepted'] = all(filters['checks'].values())
    filters['policyScope'] = 'Exact supplied coordinates; existing closed single-link recorded candidate domain'
    return result
