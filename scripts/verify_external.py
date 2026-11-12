"""Read-only external catalog cross-check. Default inputs are pinned, offline extracts."""

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
from scipy.linalg import orthogonal_procrustes
from scipy.spatial import cKDTree
from engine.catalog_audit import KINDS, Worker, _safe_hulls, audit_model, source_digest
from engine.geometry import canonical_cycle

CACHE = ROOT / 'data-external/verification'
TOLERANCE = 1e-7


def normalized_name(value):
    value = re.sub(r'\s*\((?:reflected|generated|[AB])\)$', '', value, flags=re.I)
    return re.sub(r'[^a-z0-9]', '', value.lower())


def visible_catalog():
    from engine.catalog import get_catalog
    return [r for r in get_catalog() if r.get('family') != '4D discovery candidates'
            and r.get('sourceClassification') != 'Unclassified discovery candidate']


def load_cache(directory=CACHE):
    directory = Path(directory).resolve()
    manifest = json.loads((directory / 'manifest.json').read_bytes())
    files = {}
    for source in manifest['sources']:
        path = (directory / source['file']).resolve()
        if not path.is_relative_to(directory):
            raise ValueError('External extract escapes the cache directory.')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != source['extractSha256']:
            raise ValueError('External extract hash mismatch: ' + source['file'])
        files[source['file']] = {'source': source, 'data': json.loads(raw)}
    return manifest, files


def incidence_rows(page, dimension):
    """Decode the retained first orbit-incidence matrix; refuse unfamiliar syntax."""
    rank = 0
    rows = []
    for line in page.get('matrix', '').splitlines():
        if re.fullmatch(r'[-+\s]+', line) and '+' in line:
            rank += 1
            continue
        parts = line.replace('♦', '|').split('|')
        if len(parts) != dimension + 1 or rank >= dimension:
            continue
        blocks = [part.strip().split() for part in parts[1:]]
        if not all(all(re.fullmatch(r'\d+|\*', x) for x in block) for block in blocks):
            continue
        rows.append({'rank': rank, 'label': parts[0].strip(),
                     'blocks': [[int(x) if x != '*' else 0 for x in block] for block in blocks]})
    if {r['rank'] for r in rows} != set(range(dimension)):
        return []
    links = page.get('matrixRowLinks', [])
    for i, row in enumerate(rows):
        row['links'] = links[i] if len(links) == len(rows) else []
        row['count'] = sum(row['blocks'][row['rank']])
    return rows


def face_vector(page):
    text = page.get('Face vector', {}).get('text', '')
    if not re.fullmatch(r'\s*\d+(?:\s*,\s*\d+){2,3}\s*', text):
        return None
    values = [int(x) for x in text.split(',')]
    return values + ([0] if len(values) == 3 else [])


def source_indexes(files):
    names = defaultdict(set)
    acronyms = {}
    off_names = defaultdict(set)
    off_acronyms = {}
    for filename, item in files.items():
        page = item['data']
        if filename.startswith('klitzing/') and face_vector(page):
            acronym = Path(filename).stem
            acronyms[acronym] = filename
            for name in re.split(r';|,', page.get('Name', {}).get('text', '')) + page.get('externalNames', []):
                if name.strip():
                    names[normalized_name(name)].add(filename)
        if filename.startswith('miratope/'):
            name = Path(filename).stem
            off_names[normalized_name(name)].add(filename)
            if '/3D/uniform/' in filename:
                off_acronyms[name] = filename
    return names, acronyms, off_names, off_acronyms


def map_entry(record, files, indexes):
    names, acronyms, off_names, off_acronyms = indexes
    from engine.regular4d_validation import CROSSWALK, CATALOG_IDENTITIES
    acronym = record.get('bowers', '').lower()
    if record['key'] in CATALOG_IDENTITIES:
        acronym = CROSSWALK[CATALOG_IDENTITIES[record['key']]]['alias'].lower()
    labels = [record['name']]
    if 'compound' not in record.get('family', '').lower() and not record.get('componentPolyhedron'):
        labels += record.get('aliases', [])
    aliases = {'rhombicuboctahedron': 'sirco', 'rhombicosidodecahedron': 'srid',
               'truncatedcuboctahedron': 'girco', 'truncatedicosidodecahedron': 'grid',
               'snubcube': 'snic', 'snubdodecahedron': 'snid',
               # Antiprism's nonconvex U17/U67 names collide with convex synonyms.
               'greatrhombicuboctahedron': 'querco', 'greatrhombicosidodecahedron': 'qrid'}
    page = acronyms.get(acronym)
    if not page:
        for url in record.get('referenceUrls', []):
            if url.startswith('https://bendwavy.org/klitzing/incmats/') and url.endswith('.htm'):
                filename = 'klitzing/' + url.rsplit('/', 1)[-1].removesuffix('.htm') + '.json'
                if filename in files and face_vector(files[filename]['data']):
                    page = filename
                    acronym = Path(filename).stem
                    break
    if not page:
        for label in labels:
            name = normalized_name(label)
            candidates = {f for f in names.get(name, [])
                          if len(face_vector(files[f]['data'])) == 4
                          and (len(files[f]['data']['Face vector']['text'].split(',')) == record['dimension'])}
            if record['dimension'] == 3 and name in aliases:
                candidates = {acronyms[aliases[name]]} if aliases[name] in acronyms else set()
            if len(candidates) == 1:
                page = next(iter(candidates))
                acronym = Path(page).stem
                break
    off = off_acronyms.get(acronym) if record['dimension'] == 3 else None
    if not off:
        for label in labels:
            candidates = {f for f in off_names.get(normalized_name(label), [])
                          if files[f]['data']['dimension'] == record['dimension']}
            if len(candidates) == 1:
                off = next(iter(candidates))
                break
    return {'acronym': acronym or None, 'page': page, 'off': off}


def compare(actual, expected, **extra):
    return {'status': 'match' if actual == expected else 'mismatch', 'ours': actual, 'outside': expected, **extra}


def unknown(reason):
    return {'status': 'not-checked', 'reason': reason}


def incidence_signature(model, permutation=None):
    mapping = list(range(len(model['vertices']))) if permutation is None else permutation
    edges = Counter(tuple(sorted(mapping[i] for i in edge)) for edge in model['edges'])
    faces = [tuple(canonical_cycle([mapping[i] for i in face])) for face in model['faces']]
    cells = Counter(tuple(sorted(faces[i] for i in cell)) for cell in model.get('cells', []))
    return edges, Counter(faces), cells


def similarity(source, target, node_limit=100000):
    """Find correspondence by metric frames, then fit a numerical Procrustes map.

    This is comparison logic, not a hull, coordinate generator or OFF importer.
    Reflections are allowed; ordered faces and cell incidence must also map.
    """
    if [len(source[k]) for k in KINDS] != [len(target[k]) for k in KINDS]:
        return {'status': 'mismatch', 'reason': 'Incidence counts differ before fitting.'}
    d = source['dimension']
    arrays = []
    for model in (source, target):
        p = np.asarray(model['vertices'], dtype=float)
        p -= p.mean(axis=0)
        radius = float(np.sqrt(np.mean(np.sum(p * p, axis=1))))
        if radius <= 0 or not np.isfinite(p).all() or np.linalg.matrix_rank(p) != d:
            return unknown('No finite, full-rank cloud for Procrustes.')
        arrays.append(p / radius)
    a, b = arrays
    tree = cKDTree(b)
    if np.min(tree.query(b, k=2)[0][:, 1]) <= TOLERANCE:
        return unknown('Coincident target vertices require abstract correspondence; not welded.')
    basis = []
    for _ in range(d):
        possible = [i for i in range(len(a)) if np.linalg.matrix_rank(a[basis + [i]], TOLERANCE) == len(basis) + 1]
        basis.append(max(possible, key=lambda i: float(np.prod(np.linalg.svd(a[basis + [i]], compute_uv=False)))))
    frame = a[basis]
    inverse = np.linalg.inv(frame)
    gram = frame @ frame.T
    radii = np.sum(b * b, axis=1)
    choices = [np.flatnonzero(np.abs(radii - np.dot(a[i], a[i])) <= TOLERANCE) for i in basis]
    target_signature = incidence_signature(target)
    nodes = 0
    receipt = None

    def visit(ids):
        nonlocal nodes, receipt
        nodes += 1
        if receipt or nodes > node_limit:
            return
        k = len(ids)
        if k == d:
            matrix = inverse @ b[ids]
            if np.max(np.abs(matrix.T @ matrix - np.eye(d))) > TOLERANCE * 8:
                return
            errors, mapping = tree.query(a @ matrix)
            if max(errors) > TOLERANCE or len(set(mapping)) != len(a):
                return
            if incidence_signature(source, mapping) != target_signature:
                return
            rotation, _ = orthogonal_procrustes(a, b[mapping])
            residuals = np.linalg.norm(a @ rotation - b[mapping], axis=1)
            receipt = {'status': 'match', 'rmsResidual': float(np.sqrt(np.mean(residuals ** 2))),
                       'maxResidual': float(max(residuals)), 'normalization': 'unit RMS radius',
                       'determinant': float(np.linalg.det(rotation)), 'tolerance': TOLERANCE,
                       'incidencePreserved': True, 'reflectionAllowed': True}
            return
        eligible = choices[k]
        if ids:
            eligible = eligible[np.all(np.abs(b[eligible] @ b[ids].T - gram[k, :k]) <= TOLERANCE, axis=1)]
        for i in eligible:
            if receipt or nodes > node_limit:
                break
            if int(i) not in ids:
                visit(ids + [int(i)])

    visit([])
    return receipt or (unknown('Metric correspondence frame bound exhausted.') if nodes > node_limit else
                       {'status': 'mismatch', 'reason': 'No similarity preserving full incidence within tolerance.'})


def polygon_histogram(model):
    # Explicitly vertex-count types, not a star-winding or congruence certificate.
    return dict(sorted(Counter(str(len(f)) for f in model['faces']).items()))


def polygon_symbols(model):
    from engine.star_uniform4 import polygon_symbol
    p = np.asarray(model['vertices'], dtype=float)
    return [polygon_symbol(p, face) for face in model['faces']]


def matrix_polygon(row):
    n = sum(row['blocks'][0])
    if n <= 4:
        return str(n)
    values = re.findall(r'\d+(?:/\d+)?', row['label'])
    if len(values) != 1:
        return None
    value = Fraction(values[0])
    if n not in (value.numerator, 2 * value.numerator):
        return None
    step = min(value.denominator, n - value.denominator)
    return str(n) if step == 1 else f'{n}/{step}'


def cell_histogram(model):
    from engine.library_navigation import cell_signature
    return dict(sorted(Counter(json.dumps(cell_signature(model, c), separators=(',', ':'))
                               for c in model.get('cells', [])).items()))


def matrix_checks(model, page, files):
    rows = incidence_rows(page, model['dimension'])
    checks = {}
    if not rows:
        return {'incidence-matrix': unknown('First matrix syntax unsupported; no inferred values.')}
    counts = [sum(r['count'] for r in rows if r['rank'] == rank) for rank in range(model['dimension'])]
    checks['matrix-counts'] = compare([len(model[k]) for k in KINDS[:model['dimension']]], counts)
    expected_faces = Counter()
    expected_cells = Counter()
    for row in rows:
        if row['rank'] == 2:
            expected_faces[str(sum(row['blocks'][0]))] += row['count']
        if row['rank'] == 3:
            sides = Counter()
            face_rows = [r for r in rows if r['rank'] == 2]
            if len(row['blocks'][2]) != len(face_rows):
                continue
            for face, multiplicity in zip(face_rows, row['blocks'][2]):
                sides[sum(face['blocks'][0])] += multiplicity
            sides = {k: v for k, v in sides.items() if v}
            signature = (sum(row['blocks'][0]), sum(row['blocks'][1]), sum(row['blocks'][2]), tuple(sorted(sides.items())))
            expected_cells[json.dumps(signature, separators=(',', ':'))] += row['count']
    checks['face-size-counts'] = compare(polygon_histogram(model), dict(sorted(expected_faces.items())))
    face_rows = [r for r in rows if r['rank'] == 2]
    expected_symbols = Counter()
    for face in face_rows:
        symbol = matrix_polygon(face)
        if symbol:
            expected_symbols[symbol] += face['count']
    try:
        symbols = polygon_symbols(model)
        if sum(expected_symbols.values()) == len(model['faces']):
            checks['face-polygon-counts'] = compare(dict(sorted(Counter(symbols).items())), dict(sorted(expected_symbols.items())))
        else:
            checks['face-polygon-counts'] = unknown('Cannot decode every star winding from the primary matrix labels.')
    except Exception as error:
        checks['face-polygon-counts'] = unknown(str(error))
    if model['dimension'] == 4 and sum(expected_cells.values()) == len(model['cells']):
        checks['cell-signature-counts'] = compare(cell_histogram(model), dict(sorted(expected_cells.items())))
    # Necessary vertex-figure f-vector from the source vertex row, never a type proof.
    vertex_rows = [r for r in rows if r['rank'] == 0]
    if len(vertex_rows) == 1:
        expected = [sum(block) for block in vertex_rows[0]['blocks'][1:]]
        signatures = []
        cell_vertices = [set(v for fi in cell for v in model['faces'][fi]) for cell in model.get('cells', [])]
        for v in range(len(model['vertices'])):
            signatures.append([sum(v in e for e in model['edges']), sum(v in f for f in model['faces'])] +
                              ([sum(v in c for c in cell_vertices)] if model['dimension'] == 4 else []))
        checks['vertex-figure-f-vector'] = compare(sorted({tuple(s) for s in signatures}), [tuple(expected)])
        links = vertex_rows[0]['links']
        checks['vertex-figure-type'] = unknown('Only local f-vector checked; no independent type/congruence proof.')
        checks['vertex-figure-type']['outsideLabel'] = links[0] if links else page.get('Vertex figure', {}).get('text')
        # Compare reported named types only when both names have explicit source matches.
        metadata = model.get('metadata', {})
        label = metadata.get('vertexFigureType', metadata.get('vertexFigureKey'))
        if label and links and model['dimension'] == 4:
            from engine.catalog import get_catalog
            reference = next((r for r in get_catalog() if r['key'] == label), None)
            if reference:
                label = reference['name']
            named = map_entry({'key': '', 'name': label, 'dimension': 3}, files, source_indexes(files))
            if named['page']:
                checks['vertex-figure-reported-label'] = compare(named['acronym'], Path(links[0].split('#')[0]).stem)
    return checks


def outside_group_order(page, files):
    # Only ordinary unbranched reflection diagrams. Snubs, stars, products and
    # hidden symmetry enlargements remain outside this inference's scope.
    header = page.get('matrix', '').splitlines()[0].strip() if page.get('matrix') else ''
    diagram = re.sub('[xo]', 'o', header)
    groups = {'o3o3o': 'A3', 'o3o4o': 'B3', 'o4o3o': 'B3', 'o3o5o': 'H3', 'o5o3o': 'H3',
              'o3o3o3o': 'A4', 'o4o3o3o': 'B4', 'o3o3o4o': 'B4', 'o3o4o3o': 'F4',
              'o5o3o3o': 'H4', 'o3o3o5o': 'H4'}
    group = groups.get(diagram)
    orders = files.get('group-orders.json', {}).get('data', {}).get('orders', {})
    return (orders[group], group) if group in orders else None


def verify_entry(record, mapping, files, max_vertices=640, symmetry_vertices=64):
    row = {'key': record['key'], 'name': record['name'], 'family': record['family'],
           'dimension': record['dimension'], 'mapping': mapping, 'checks': {}}
    checks = row['checks']
    refs = [f for f in (mapping['page'], mapping['off']) if f]
    if not refs:
        row['status'] = 'no-outside-data'
        return row
    for ref in refs:
        outside = files[ref]['data']
        counts = face_vector(outside) if ref == mapping['page'] else outside['counts']
        checks['declared-counts:' + ref] = compare(record['counts'], counts)
    if record['counts'][0] > max_vertices:
        checks['geometry'] = unknown(f"Above {max_vertices}-vertex local computation bound; metadata counts only.")
    else:
        try:
            from engine.generators import regular
            model = regular(record['key'])
            for ref in refs:
                outside = files[ref]['data']
                counts = face_vector(outside) if ref == mapping['page'] else outside['counts']
                checks['loaded-counts:' + ref] = compare([len(model[k]) for k in KINDS], counts)
                actual_euler = sum((-1) ** i * len(model[k]) for i, k in enumerate(KINDS))
                checks['euler:' + ref] = compare(actual_euler, sum((-1) ** i * n for i, n in enumerate(counts)))
            audit = audit_model(model, record)['checks']
            row['engineAudit'] = {k: audit[k] for k in ('incidence', 'euler', 'equal_edges', 'vertex_figures')}
            if mapping['page']:
                checks.update(matrix_checks(model, files[mapping['page']]['data'], files))
            if mapping['off']:
                outside = files[mapping['off']]['data']
                if outside.get('model'):
                    target = outside['model']
                    checks['off-face-size-counts'] = compare(polygon_histogram(model), polygon_histogram(target))
                    checks['off-cell-signature-counts'] = compare(cell_histogram(model), cell_histogram(target))
                    try:
                        checks['off-face-polygon-counts'] = compare(dict(sorted(Counter(polygon_symbols(model)).items())),
                                                                   dict(sorted(Counter(polygon_symbols(target)).items())))
                    except Exception as error:
                        checks['off-face-polygon-counts'] = unknown(str(error))
                    checks['off-similarity'] = similarity(model, target)
                    external_edges = audit_model(target, {'uniform': True})['checks']['equal_edges']
                    ours = audit['equal_edges'].get('maxRelativeDeviation')
                    theirs = external_edges.get('maxRelativeDeviation')
                    if ours is not None and theirs is not None:
                        checks['off-edge-uniformity'] = {
                            'status': 'match' if max(ours, theirs) <= 1e-9 else 'mismatch',
                            'ours': ours, 'outside': theirs, 'tolerance': 1e-9,
                            'definition': 'Both clouds have max deviation from mean edge length below tolerance.'}
                else:
                    checks['off-similarity'] = unknown(outside['coordinateOmission'])
            evidence = record.get('chiralityEvidence', {})
            if evidence.get('complete'):
                row['symmetry'] = {'order': evidence['order'], 'basis': 'retained engine exhaustive chirality receipt'}
            elif type(record.get('groupOrder')) is int:
                row['symmetry'] = {'order': record['groupOrder'], 'basis': 'engine catalog construction groupOrder; not full-group enumeration'}
            elif len(model['vertices']) <= symmetry_vertices:
                try:
                    from engine.symmetry import geometric_symmetry
                    group = geometric_symmetry(model, max_frames=20000)
                    row['symmetry'] = {k: group[k] for k in ('order', 'complete', 'termination')}
                except Exception as error:
                    row['symmetry'] = {'reason': str(error)}
            checks['symmetry-outside-order'] = unknown('No explicit independent group-order extract; group labels are not orders.')
            external_order = outside_group_order(files[mapping['page']]['data'], files) if mapping['page'] else None
            symmetry = row.get('symmetry', {})
            if external_order and symmetry.get('order') is not None and symmetry.get('complete', True):
                checks['symmetry-outside-order'] = compare(symmetry['order'], external_order[0],
                                                          outsideGroup=external_order[1], source='group-orders.json',
                                                          caveat='Diagram subgroup order; an enlarged geometric symmetry is reported as a difference.')
        except Exception as error:
            checks['geometry'] = unknown(type(error).__name__ + ': ' + str(error))
    states = [c['status'] for c in checks.values()]
    row['status'] = 'mismatch' if 'mismatch' in states else 'match'
    row['scopeIncomplete'] = 'not-checked' in states
    return row


class ExternalWorker(Worker):
    def run(self, item):
        if self.process is None:
            env = {**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'PYTHONIOENCODING': 'utf-8'}
            self.process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker',
                                             '--cache', item['cache']], cwd=ROOT, stdin=subprocess.PIPE,
                                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                                            encoding='utf-8', env=env,
                                            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
        result = super().run(item)
        if result.get('kind') == 'external':
            return {'key': item['id'], 'name': item['record']['name'], 'family': item['record']['family'],
                    'mapping': item['mapping'], 'status': 'incomplete', 'checks': result['checks']}
        return result


def summary(rows):
    families = {}
    for row in rows:
        bucket = families.setdefault(row['family'], {'total': 0, 'checked': 0, 'match': 0, 'mismatch': 0,
                                                     'no-outside-data': 0, 'incomplete': 0})
        bucket['total'] += 1
        bucket[row['status']] += 1
        if row['status'] in ('match', 'mismatch'):
            bucket['checked'] += 1
    return dict(sorted(families.items()))


def dual_mapping_status(catalog):
    from engine.corpus_reconciliation import report
    from engine.classification_qualification import manifest, source_pins_current
    corpus = report({'group': 'dual3'})
    supplied = {r['id'] for r in corpus['identities'] if r['status'] == 'mapped-unverified'}
    provider = manifest('3d')
    current = source_pins_current(provider)
    keys = {r['key'] for r in catalog}
    generated = {r['id'] for r in provider['entries'] if r['kind'] == 'dual'
                 and r['receipt']['status'] == 'numerical-pass' and r.get('generatedKey') in keys and current}
    obligations = {r['id'] for r in corpus['identities']}
    return {'crosswalkMapped': len(supplied), 'crosswalkUnmatched': len(obligations - supplied),
            'currentPinnedGeneratedRealizations': len(generated), 'distinctLocalRepresentations': len(supplied | generated),
            'withoutFiniteLocalRepresentation': sorted(obligations - supplied - generated),
            'providerPinsCurrent': current, 'releaseQualified': False,
            'scope': 'Source mappings and retained generated numerical receipts; not an independent external dual audit.',
            'obstructions': [{'id': r['id'], 'reason': r['receipt'].get('reason')} for r in provider['entries']
                             if r['kind'] == 'dual' and r['receipt']['status'] != 'numerical-pass']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=CACHE)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/external-verification.json')
    parser.add_argument('--keys', nargs='*')
    parser.add_argument('--max-vertices', type=int, default=640)
    parser.add_argument('--symmetry-vertices', type=int, default=64)
    parser.add_argument('--timeout', type=float, default=60)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    manifest, files = load_cache(args.cache)
    if args.worker:
        _safe_hulls()
        for line in sys.stdin:
            item = json.loads(line)
            result = verify_entry(item['record'], item['mapping'], files, item['maxVertices'], item['symmetryVertices'])
            print(json.dumps(result, allow_nan=False), flush=True)
        return 0
    catalog = visible_catalog()
    engine_digest = source_digest()
    checker_digest = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    cache_digest = hashlib.sha256((args.cache / 'manifest.json').read_bytes()).hexdigest()
    if args.keys is not None:
        missing = set(args.keys) - {r['key'] for r in catalog}
        if missing:
            parser.error('Unknown or hidden catalog keys: ' + ', '.join(sorted(missing)))
    indexes = source_indexes(files)
    mappings = {r['key']: map_entry(r, files, indexes) for r in catalog}
    selected = [r for r in catalog if args.keys is None or r['key'] in args.keys]
    rows = []
    worker = ExternalWorker(args.timeout)
    try:
        for i, record in enumerate(selected):
            mapping = mappings[record['key']]
            if mapping['page'] or mapping['off']:
                row = worker.run({'kind': 'external', 'id': record['key'], 'record': record, 'mapping': mapping,
                                  'cache': str(args.cache.resolve()), 'maxVertices': args.max_vertices,
                                  'symmetryVertices': args.symmetry_vertices})
            else:
                row = verify_entry(record, mapping, files, args.max_vertices, args.symmetry_vertices)
            rows.append(row)
            if (i + 1) % 25 == 0:
                print(f'{i + 1}/{len(selected)} checked', flush=True)
    finally:
        worker.close()
    from engine.corpus_reconciliation import report
    reconciliation = report()
    uniforms = [r for r in catalog if r['dimension'] == 4 and r.get('uniform') is True]
    mapped = [r for r in uniforms if mappings[r['key']]['page']]
    named = [r for r in catalog if r['dimension'] == 4 and 'compound' not in r['family'].lower()
             and (r.get('uniform') is True or r['family'] in ('convex uniform (Miratope source)', 'nonconvex uniform (Miratope source)'))]
    if (engine_digest != source_digest() or checker_digest != hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            or cache_digest != hashlib.sha256((args.cache / 'manifest.json').read_bytes()).hexdigest()):
        raise ValueError('Checker, engine sources or external cache changed during verification; rerun against stable inputs.')
    result = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'scope': 'Default-visible catalog, excluding discovery candidates; matches apply only to performed checks.',
              'cacheManifestSha256': cache_digest, 'engineSourceSha256': engine_digest, 'checkerSha256': checker_digest,
              'runtime': {'python': sys.version.split()[0], 'numpy': np.__version__,
                          'scipy': __import__('scipy').__version__},
              'limits': {'maxVertices': args.max_vertices, 'symmetryVertices': args.symmetry_vertices,
                         'timeoutSeconds': args.timeout, 'similarityTolerance': TOLERANCE},
              'catalogRows': len(catalog), 'selectedRows': len(rows), 'families': summary(rows),
              'uniform4Mapping': {'rows': len(uniforms), 'explicitBowersField': sum(bool(r.get('bowers')) for r in uniforms),
                                  'mappedRows': len(mapped), 'distinctAcronyms': len({mappings[r['key']]['acronym'] for r in mapped}),
                                  'unmappedKeys': [r['key'] for r in uniforms if not mappings[r['key']]['page']],
                                  'namedNonCompoundRowsIncludingAttributed': len(named),
                                  'namedNonCompoundRowsMapped': sum(bool(mappings[r['key']]['page']) for r in named)},
              'dualMapping': dual_mapping_status(catalog), 'reconciliation': reconciliation['groups'], 'rows': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'statuses': dict(Counter(r['status'] for r in rows)),
                      'uniform4Mapping': result['uniform4Mapping']}, indent=2))
    return 1 if any(r['status'] in ('mismatch', 'incomplete') for r in rows) else 0


if __name__ == '__main__':
    raise SystemExit(main())
