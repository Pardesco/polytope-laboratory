"""Acquire immutable attributed Miratope 4D regular OFF sources and evidence.

Only the destination is written. Strict importer semantics remain unchanged.
Source-directory labels and numerical necessary checks are not classification
theorems or certificates of regular flag transitivity.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.formats import parse_off
from engine.geometry import GeometryError
from engine.symmetry import geometric_symmetry

DEFAULT_SOURCE = Path(r'C:\Users\Randall\Documents\art-projects\miratope-rs')
RELATIVE_SOURCE = Path('lib/4D/regular')
TOLERANCE = 1e-7
CONVEX_ALTERNATES = {'Pentachoron': 'simplex4', 'Tesseract': 'tesseract', 'Hexadecachoron': 'cross4',
                     'Icositetrachoron': 'cell24', 'Hecatonicosachoron': 'cell120', 'Hexacosichoron': 'cell600'}
SYMMETRY_SAMPLES = frozenset({'Pentachoron', 'Tesseract', 'Hexadecachoron', 'Icositetrachoron', 'Grand hecatonicosachoron'})


def digest(data):
    return hashlib.sha256(data).hexdigest()


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def histogram(values):
    return {str(key): count for key, count in sorted(Counter(values).items())}


def regular_face(points, ids):
    """Check source-cycle angular steps without a hull, fill or known symbol."""
    cloud = points[ids]
    centered = cloud - cloud.mean(axis=0)
    radii = np.linalg.norm(centered, axis=1)
    radius = float(np.mean(radii))
    if radius <= 0 or len(ids) < 3:
        return {'passed': False, 'reason': 'zero radius or short face'}
    q = centered / radius
    u = q[0] / np.linalg.norm(q[0])
    perpendicular = q[1] - (q[1] @ u) * u
    length = np.linalg.norm(perpendicular)
    if length <= TOLERANCE:
        return {'passed': False, 'reason': 'unresolved first angular step'}
    v = perpendicular / length
    local = np.column_stack((q @ u, q @ v))
    planarity = float(np.max(np.linalg.norm(q - np.outer(local[:, 0], u) - np.outer(local[:, 1], v), axis=1)))
    angles = np.arctan2(local[:, 1], local[:, 0])
    steps = (np.roll(angles, -1) - angles + math.pi) % (2 * math.pi) - math.pi
    step = int(round(float(steps[0]) * len(ids) / (2 * math.pi)))
    canonical_step = abs(step)
    angular_error = float(np.max(np.abs(steps - step * 2 * math.pi / len(ids))))
    radial_error = float(np.max(np.abs(radii / radius - 1)))
    passed = (planarity <= TOLERANCE and radial_error <= TOLERANCE and angular_error <= TOLERANCE
              and 0 < canonical_step < len(ids) / 2 and math.gcd(len(ids), canonical_step) == 1)
    return {'passed': bool(passed), 'vertexCount': len(ids), 'canonicalAngularStep': canonical_step,
            'angularStepRadians': canonical_step * 2 * math.pi / len(ids), 'angularResidualRadians': angular_error,
            'relativeRadiusResidual': radial_error, 'relativePlanarityResidual': planarity,
            'circumradius': radius,
            'stepConvention': 'unsigned shortest step; source traversal and retrograde orientation are retained, not classified'}


def numeric_checks(model):
    """Independent metric and source-incidence checks on supplied realization."""
    points = np.asarray(model['vertices'], dtype=float)
    centered = points - points.mean(axis=0)
    radii = np.linalg.norm(centered, axis=1)
    scale = float(np.max(radii))
    if scale <= 0 or not np.isfinite(scale):
        raise GeometryError('Catalog realization has unresolved source radius.')
    q = centered / scale
    lengths = np.array([np.linalg.norm(points[b] - points[a]) for a, b in model['edges']])
    if not len(lengths) or np.min(lengths) <= 0:
        raise GeometryError('Catalog realization needs nonzero source edges.')
    edge_spread = float(np.max(lengths) / np.min(lengths) - 1)
    radius_spread = float(np.max(radii) / np.min(radii) - 1) if np.min(radii) > 0 else float('inf')
    face_checks = [regular_face(q, face) for face in model['faces']]
    face_types = histogram(f"{record['vertexCount']}/{record['canonicalAngularStep']}" for record in face_checks if 'vertexCount' in record)
    vertex_edges = Counter(v for edge in model['edges'] for v in edge)
    vertex_faces = Counter(v for face in model['faces'] for v in face)
    face_cells = Counter(face for cell in model['cells'] for face in cell)
    vertex_cells = Counter()
    cell_links = Counter()
    cell_signatures = []
    cell_ranks = []
    for cell in model['cells']:
        ids = sorted({v for face in cell for v in model['faces'][face]})
        vertex_cells.update(ids)
        edge_links = Counter(tuple(sorted((a, b))) for face in cell for a, b in zip(model['faces'][face], model['faces'][face][1:] + model['faces'][face][:1]))
        cell_links.update(edge_links.values())
        face_sizes = histogram(len(model['faces'][face]) for face in cell)
        cell_signatures.append(json.dumps({'vertices': len(ids), 'edges': len(edge_links), 'faces': len(cell), 'faceSizes': face_sizes}, sort_keys=True))
        cell_ranks.append(int(np.linalg.matrix_rank(q[ids] - q[ids].mean(axis=0), tol=TOLERANCE)))
    ranks = int(np.linalg.matrix_rank(q, tol=TOLERANCE))
    incidence = {'faceCellIncidenceHistogram': histogram(face_cells[i] for i in range(len(model['faces']))),
                 'cellEdgeLinkMultiplicityHistogram': histogram(cell_links.elements()),
                 'vertexValenceHistogram': histogram(vertex_edges[i] for i in range(len(points))),
                 'vertexFaceIncidenceHistogram': histogram(vertex_faces[i] for i in range(len(points))),
                 'vertexCellIncidenceHistogram': histogram(vertex_cells[i] for i in range(len(points))),
                 'cellRankHistogram': histogram(cell_ranks),
                 'cellIncidenceSignatures': [{'signature': json.loads(signature), 'count': count} for signature, count in sorted(Counter(cell_signatures).items())],
                 'closedSourceRidges': all(face_cells[i] == 2 for i in range(len(model['faces']))),
                 'twoFaceCellEdgeLinks': set(cell_links) == {2},
                 'singleVertexIncidenceType': all(len(incidence_values) == 1 for incidence_values in (set(vertex_edges.values()), set(vertex_faces.values()), set(vertex_cells.values()))),
                 'singleCellIncidenceType': len(set(cell_signatures)) == 1}
    passed = edge_spread <= TOLERANCE and radius_spread <= TOLERANCE and ranks == 4 and all(record['passed'] for record in face_checks) and len(face_types) == 1 and incidence['closedSourceRidges'] and incidence['twoFaceCellEdgeLinks'] and incidence['singleVertexIncidenceType'] and incidence['singleCellIncidenceType'] and set(cell_ranks) == {3}
    return {'necessaryRegularityChecksPassed': bool(passed), 'numericMode': 'float64-approximate', 'tolerance': TOLERANCE,
            'definition': 'equal source edges, common vertex-mean radius, planar regular angular-step face cycles and uniform source incidence; not a flag-transitivity or exact algebraic certificate',
            'affineRank': ranks,
            'edges': {'min': float(np.min(lengths)), 'max': float(np.max(lengths)), 'relativeSpread': edge_spread, 'equalWithinTolerance': edge_spread <= TOLERANCE},
            'vertexRadius': {'definition': 'distance from source vertex arithmetic mean', 'min': float(np.min(radii)), 'max': float(np.max(radii)), 'relativeSpread': radius_spread, 'commonWithinTolerance': radius_spread <= TOLERANCE},
            'faces': {'allRegularAngularSteps': all(record['passed'] for record in face_checks), 'canonicalAngularStepHistogram': face_types,
                      'maxAngularResidualRadians': max((record.get('angularResidualRadians', 0) for record in face_checks), default=0),
                      'maxRelativePlanarityResidual': max((record.get('relativePlanarityResidual', 0) for record in face_checks), default=0),
                      'maxRelativeRadiusResidual': max((record.get('relativeRadiusResidual', 0) for record in face_checks), default=0),
                      'unsupportedFaceIds': [i for i, record in enumerate(face_checks) if not record['passed']]},
            'incidence': incidence}


def symmetry_summary(model):
    if model['name'] not in SYMMETRY_SAMPLES:
        return {'status': 'not-run', 'reason': 'full source-group enumeration not required for numerical catalog acquisition'}
    result = geometric_symmetry(model)
    return {key: result[key] for key in ('order', 'properOrder', 'complete', 'status', 'numericMode', 'tolerance', 'method', 'candidateFramesEvaluated', 'termination', 'closureVerified', 'entityOrbits', 'sourceFingerprint', 'algorithmVersion')}


def git(source, *args, binary=False):
    result = subprocess.run(['git', '-c', 'safe.directory=' + source.as_posix(), '-C', str(source), *args], capture_output=True, timeout=30)
    if result.returncode:
        raise GeometryError('Cannot establish Miratope source revision: ' + result.stderr.decode('utf-8', 'replace'))
    return result.stdout if binary else result.stdout.decode('utf-8').strip()


def acquire(source, destination, symmetry=True):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source in destination.parents:
        raise GeometryError('The Miratope source checkout is read-only; choose a separate destination.')
    directory = source / RELATIVE_SOURCE
    files = sorted(directory.glob('*.off'))
    if len(files) != 16 or not set(CONVEX_ALTERNATES) <= {file.stem for file in files}:
        raise GeometryError('Expected the pinned 16-file Miratope regular 4D source directory.')
    license_bytes = (source / 'LICENSE').read_bytes()
    if b'MIT License' not in license_bytes or b'2021 Miratope authors' not in license_bytes:
        raise GeometryError('Expected the attributed MIT Miratope license.')
    head = git(source, 'rev-parse', 'HEAD')
    raw_directory = destination / 'raw'; raw_directory.mkdir(parents=True, exist_ok=True)
    (destination / 'LICENSE').write_bytes(license_bytes)
    (destination / 'ATTRIBUTION.txt').write_text('Miratope regular 4D OFF assets\nCopyright (c) 2021 Miratope authors\nMIT License; see LICENSE.\nAcquired without modification from ' + str(directory) + '\nLocal source git HEAD: ' + head + '\n', encoding='utf-8')
    entries = []
    for file in files:
        raw = file.read_bytes()
        model = parse_off(raw.decode('utf-8-sig'), file.stem)
        checks = numeric_checks(model)
        if not checks['necessaryRegularityChecksPassed']:
            raise GeometryError('Independent numerical regularity checks failed for ' + file.name)
        alternate = CONVEX_ALTERNATES.get(file.stem)
        if (model['interpretation'] == 'convex-polytope') != bool(alternate):
            raise GeometryError('Source convex/star classification differs from the expected six-convex/ten-star partition: ' + file.name)
        (raw_directory / file.name).write_bytes(raw)
        relative = (RELATIVE_SOURCE / file.name).as_posix()
        blob = git(source, 'show', head + ':' + relative, binary=True)
        entries.append({'key': 'miratope-' + slug(file.stem), 'name': file.stem, 'dimension': 4,
                        'family': 'Regular star' if not alternate else 'Regular convex',
                        'file': 'raw/' + file.name, 'rawSha256': digest(raw), 'rawByteLength': len(raw),
                        'sourcePath': relative, 'gitBlobSha256': digest(blob), 'bytesEqualGitBlob': raw == blob,
                        'lineEndingNormalizedEqualGitBlob': raw.replace(b'\r\n', b'\n') == blob.replace(b'\r\n', b'\n'),
                        'sourceClassification': 'regular (source directory label)',
                        'registration': 'alternate-convex-source' if alternate else 'regular-star', 'alternateBuiltinKey': alternate,
                        'counts': [len(model[field]) for field in ('vertices', 'edges', 'faces', 'cells')],
                        'interpretation': model['interpretation'], 'strictImportPassed': True, 'sourceFingerprint': model['fingerprint'],
                        'numericChecks': checks, 'symmetryEvidence': symmetry_summary(model) if symmetry else {'status': 'not-run', 'reason': 'disabled by acquisition option'}})
        print(file.name + ': ' + str(entries[-1]['counts']) + ', checks passed', flush=True)
    manifest = {'schemaVersion': 1, 'supplier': 'Miratope',
                'source': {'absolutePath': str(source), 'relativeDirectory': RELATIVE_SOURCE.as_posix(), 'gitHead': head,
                           'gitRemotes': git(source, 'remote', '-v').splitlines(),
                           'workingTreeChanges': git(source, 'status', '--porcelain', '--', 'LICENSE', RELATIVE_SOURCE.as_posix()).splitlines(),
                           'readmeUpstreamReference': 'https://github.com/vihdzp/miratope-rs',
                           'acquiredAtUtc': datetime.now(timezone.utc).isoformat()},
                'license': {'file': 'LICENSE', 'rawSha256': digest(license_bytes), 'spdx': 'MIT', 'attribution': 'Copyright (c) 2021 Miratope authors'},
                'entries': entries, 'registrationKeys': [entry['key'] for entry in entries if entry['registration'] == 'regular-star'],
                'alternateSources': [{'builtinKey': entry['alternateBuiltinKey'], 'sourceKey': entry['key'], 'file': entry['file']} for entry in entries if entry['alternateBuiltinKey']],
                'strictImportFailures': [], 'summary': {'files': 16, 'newRegularStarEntries': 10, 'alternateConvexSources': 6, 'allStrictImportsPassed': True, 'allNumericalNecessaryChecksPassed': True},
                'guarantees': {'rawSourceBytesPreserved': True, 'sourceGeometryAndCyclesPreserved': True, 'exactClassificationCertified': False,
                               'schlafliSymbolsInferred': False, 'generalizedSolidInteriorsAsserted': False}}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output', type=Path, default=ROOT / 'engine/catalog_data/miratope')
    parser.add_argument('--skip-symmetry', action='store_true')
    args = parser.parse_args()
    acquire(args.source, args.output, symmetry=not args.skip_symmetry)
