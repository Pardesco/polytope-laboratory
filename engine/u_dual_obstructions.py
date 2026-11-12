"""Named finite-reciprocal obstruction receipts, without catalog promotion."""

from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import numpy as np
from .classification_qualification import binding, surface_checks
from .geometry import GeometryError, TOLERANCE
from .projective_incidence_dual import projective_dual

VERSION = '0.1.0'
NUMBERS = (3, 4, 15, 32, 49, 51, 62, 64, 65, 70, 71, 72, 75)
ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'catalog_data/u_dual_obstructions/manifest.json'
SCOPE = 'Source vertex mean, reciprocal radius 1; literal ordered incidence. Numerical obstructions only, no finite model, exact certificate or release qualification.'


def require(ok, message):
    if not ok:
        raise GeometryError('Named U-dual diagnostics: ' + message)


def manifest():
    require(DATA.stat().st_size <= 512 * 1024, 'provider exceeds 512 KiB.')
    value = json.loads(DATA.read_text(encoding='utf-8'))
    require(
        value.get('schemaVersion') == 1 and value.get('algorithmVersion') == VERSION, 'unsupported provider version.'
    )
    require(
        [r['id'] for r in value['entries']] == ['dual3:U' + str(n) for n in NUMBERS],
        'provider must retain the thirteen assigned identities.',
    )
    require(
        all(r['sourceKey'] == 'antiprism-u' + str(n) for n, r in zip(NUMBERS, value['entries'])),
        'source aliases changed.',
    )
    return value


def pins_current(value):
    for relative, sha in value['sourcePins'].items():
        path = (ROOT / relative).resolve()
        if not path.is_relative_to((ROOT / 'catalog_data/antiprism').resolve()) or not path.is_file():
            return False
        if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            return False
    return True


def winding_inventory(source):
    points = np.asarray(source['vertices'], float)
    counts = Counter()
    maximum = 0.0
    for face in source['faces']:
        cloud = points[face]
        cloud = cloud - cloud.mean(0)
        _, _, vt = np.linalg.svd(cloud, full_matrices=False)
        xy = cloud @ vt[:2].T
        angles = np.arctan2(xy[:, 1], xy[:, 0])
        steps = (np.roll(angles, -1) - angles + np.pi) % (2 * np.pi) - np.pi
        turn = abs(float(steps.sum() / (2 * np.pi)))
        winding = round(turn)
        maximum = max(maximum, abs(turn - winding))
        counts[(len(face), winding)] += 1
    return {
        'polygons': [[n, d, count] for (n, d), count in sorted(counts.items())],
        'maximumIntegerWindingResidual': maximum,
        'definition': '[cycle length, absolute turning number about polygon center, count]; cycles are never reordered.',
    }


def diagnose(source, expected):
    """Retain every plane identity, including multiple faces on one plane."""
    descriptor = projective_dual(source)
    span = float(np.max(np.ptp(np.asarray(source['vertices']), axis=0)))
    planes = descriptor['vertices']
    threshold = 4 * TOLERANCE * span
    center_faces = [v['id'] for v in planes if abs(v['planeOffset']) <= threshold]
    ideal = [v['id'] for v in planes if v['kind'] == 'ideal-numerical']
    groups = descriptor['coincidentPlaneIdentityGroups']
    winding = winding_inventory(source)
    topology = surface_checks(source)
    dual_topology = surface_checks(
        {'vertices': [v['homogeneous'] for v in planes], 'faces': [f['dualVertices'] for f in descriptor['faces']]}
    )
    counts = [len(source[k]) for k in ('vertices', 'edges', 'faces', 'cells')]
    require(counts == expected['counts'], 'source rank counts differ from the independent fixture.')
    require(len(topology) == 1 and topology[0]['closedVertexManifold'], 'one closed literal vertex-manifold required.')
    t = topology[0]
    require(
        all(t[k] == expected[k] for k in ('eulerCharacteristic', 'orientable', 'genus')),
        'source topology differs from the independent fixture.',
    )
    require(
        len(dual_topology) == 1
        and dual_topology[0]['closedVertexManifold']
        and all(dual_topology[0][k] == expected[k] for k in ('eulerCharacteristic', 'orientable', 'genus')),
        'abstract dual topology differs from the independent fixture.',
    )
    require(
        winding['polygons'] == expected['polygons'] and winding['maximumIntegerWindingResidual'] < 1e-8,
        'ordered polygon winding differs from the independent fixture.',
    )
    require(
        len(center_faces) == expected['centerPlaneCount'] and len(groups) == expected['coincidentGroupCount'],
        'plane obstructions differ from the independent fixture.',
    )
    require(all(len(g) == 2 for g in groups), 'coincident-plane multiplicity differs from the paired fixture.')
    require(center_faces or groups, 'no finite reciprocal obstruction established.')
    kinds = []
    if center_faces:
        kinds.append('center-plane-singularity')
    if groups:
        kinds.append('coincident-reciprocal-planes')
    reasons = []
    if center_faces:
        reasons.append(
            f'{len(center_faces)} source face planes meet the finite-refusal tolerance at the vertex mean; {len(ideal)} have numerical ideal reciprocal vertices.'
        )
    if groups:
        reasons.append(
            f'{len(groups)} pairs of distinct source face identities share a numerical projective reciprocal point; welding them would change literal topology.'
        )
    summary = {
        'status': 'obstruction-confirmed',
        'obstructions': kinds,
        'reason': ' '.join(reasons),
        'source': binding(source),
        'topology': t,
        'abstractDualTopology': dual_topology[0],
        'abstractDualCounts': [len(planes), len(descriptor['edges']), len(descriptor['faces']), 0],
        'winding': winding,
        'center': descriptor['resolvedCenter'],
        'radius': 1,
        'finiteRefusalTolerance': threshold,
        'idealTolerance': span * 1e-12,
        'coincidenceTolerance': 1e-9,
        'centerPlaneFaceIds': center_faces,
        'idealFaceIds': ideal,
        'coincidentPlaneGroups': groups,
        'maximumPlaneFitResidual': max(v['planeFitResidual'] for v in planes),
        'maximumHomogeneousPolarityResidual': descriptor['maximumPolarityResidual'],
        'finiteModelAvailable': False,
        'certified': False,
        'releaseQualified': False,
    }
    witnesses = {
        'objectClass': 'projective-incidence-complex',
        'geometryModel': False,
        'sourceFaceCycles': deepcopy(source['faces']),
        'sourceEdges': deepcopy(source['edges']),
        'planes': [
            {
                'sourceFace': v['id'],
                'sourceCycle': deepcopy(source['faces'][v['id']]),
                'normal': v['planeNormal'],
                'offset': v['planeOffset'],
                'planeFitResidual': v['planeFitResidual'],
                'homogeneous': v['homogeneous'],
                'kind': v['kind'],
            }
            for v in planes
        ],
        'dualFaceCycles': [f['dualVertices'] for f in descriptor['faces']],
        'dualEdgeSourceLinks': [
            {'sourceEdge': e['sourceEdge'], 'dualVertices': e['dualVertices']} for e in descriptor['edges']
        ],
        'policy': 'Ideal and coincident identities retained separately. No infinite face fill, solid, volume or net assigned.',
    }
    return summary, witnesses


def report(params=None):
    params = {} if params is None else params
    require(type(params) is dict and not set(params) - {'id', 'verify'}, 'options are named id and verify only.')
    require(type(params.get('verify', False)) is bool, 'verify must be boolean.')
    value = manifest()
    current = pins_current(value)
    rows = deepcopy(value['entries'])
    for row in rows:
        row['status'] = 'recorded-unchecked' if current else 'stale-provider'
    result = {
        'schemaVersion': 1,
        'provider': value['provider'],
        'sourcePinsCurrent': current,
        'scope': SCOPE,
        'entries': rows,
        'finiteModelsAdded': 0,
        'releaseQualified': False,
    }
    if 'id' in params:
        require(type(params['id']) is str, 'id must be a named identity.')
        row = next((r for r in rows if r['id'] == params['id']), None)
        require(row is not None, 'identity is outside this thirteen-source tranche.')
        result['entry'] = row
        if params.get('verify'):
            require(current, 'source pins changed or are missing; rebuild and review the provider before checking.')
            from .generators import regular

            try:
                source = regular(row['sourceKey'])
                require(
                    binding(source) == row['receipt']['source'],
                    'source coordinate or ordered-incidence binding changed.',
                )
                summary, witnesses = diagnose(source, row['expected'])
                for key in ('centerPlaneFaceIds', 'idealFaceIds', 'coincidentPlaneGroups'):
                    require(summary[key] == row['receipt'][key], key + ' changed since the recorded receipt.')
                row['status'] = 'obstruction-confirmed'
                result.update(verification=summary, witnesses=witnesses)
            except GeometryError as error:
                row['status'] = 'unresolved'
                result['verification'] = {
                    'status': 'unresolved',
                    'reason': str(error),
                    'certified': False,
                    'releaseQualified': False,
                }
    else:
        require(not params.get('verify'), 'select a named identity before checking.')
    return result


def dispatch_obstructions(request):
    require(
        not set(request) - {'op', 'id', 'params', 'model'} and request.get('model') is None,
        'catalog diagnostics accept no model or path input.',
    )
    return report(request.get('params', {}))


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--identity')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    params = {'verify': args.verify}
    if args.identity:
        params['id'] = args.identity
    text = json.dumps(report(params), indent=2, allow_nan=False) + '\n'
    if args.output:
        args.output.write_text(text, encoding='utf-8')
    else:
        print(text, end='')
