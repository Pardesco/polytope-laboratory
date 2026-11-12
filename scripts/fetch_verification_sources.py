"""Optional network refresh; verify_external.py itself never uses the network."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
CACHE = ROOT / 'data-external/verification'
BASE = 'https://bendwavy.org/klitzing/'


def plain(value):
    return html.unescape(re.sub(r'<[^>]*>', '', value)).strip()


def extract_page(raw):
    text = raw.decode('utf-8', errors='replace')
    facts = {}
    facts['externalNames'] = sorted(set(urllib.parse.unquote(link.rsplit('/', 1)[-1]).replace('_', ' ')
                                        for link in re.findall(r'href="([^"]+)"', text)
                                        if 'wikipedia.org/wiki/' in link or 'polytope.miraheze.org/wiki/' in link))
    for label, value in re.findall(r'<tr><td[^>]*>(.*?)</td><td[^>]*>(.*?)</td>', text, re.S | re.I):
        label = ' '.join(plain(label).split())
        if label in ('Acronym', 'Name', 'Face vector', 'Vertex figure') and label not in facts:
            facts[label] = {'text': plain(re.sub(r'<br\s*/?>', '; ', value)),
                            'links': re.findall(r'<a\b[^>]*href="([^"]+)"', value)}
    matrices = re.findall(r'<pre\s+class="IncMat"[^>]*>(.*?)</pre>', text, re.S)
    if matrices:
        # First, full-symmetry matrix only; omit alternative subsymmetry tables.
        facts['matrix'] = plain(matrices[0])
        facts['matrixLinks'] = re.findall(r'<a\b[^>]*href="([^"]+)"', matrices[0])
        facts['matrixRowLinks'] = [re.findall(r'<a\b[^>]*href="([^"]+)"', line)
                                   for line in matrices[0].splitlines()
                                   if '|' in plain(line) or '♦' in plain(line)]
    return facts


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = {'schemaVersion': 1, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
                'sources': [], 'failures': []}
    old = {}
    if (CACHE / 'manifest.json').exists():
        old = {s['url']: s for s in json.loads((CACHE / 'manifest.json').read_text())['sources']}

    def fetch(url, filename, extract):
        path = CACHE / filename
        prior = old.get(url)
        version = 3 if filename.startswith('klitzing/') else 2
        if prior and prior.get('extractVersion') == version and path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == prior['extractSha256']:
            manifest['sources'].append(prior)
            return json.loads(path.read_bytes())
        request = urllib.request.Request(url, headers={'User-Agent': 'PolytopeLaboratory-external-verification/1'})
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read(16 * 1024 * 1024 + 1)
        if len(raw) > 16 * 1024 * 1024:
            raise ValueError('Source exceeds refresh bound')
        value = extract(raw)
        data = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        manifest['sources'].append({'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'extractVersion': version,
                                    'sha256': hashlib.sha256(raw).hexdigest(), 'downloadBytes': len(raw),
                                    'file': filename, 'extractSha256': hashlib.sha256(data).hexdigest()})
        return value

    def safe(job):
        try:
            return fetch(*job)
        except Exception as error:
            manifest['failures'].append({'url': job[0], 'error': str(error)})
            return None

    def index(raw):
        s = raw.decode(errors='replace')
        return {'links': sorted(set(re.findall(r'href="(?:\.\./)?incmats/([^"#]+)\.htm', s)))}

    indexes = [safe((BASE + 'dimensions/' + n + '.htm', n + '-index.json', index))
               for n in ('polyhedra', 'polychora')]
    from engine.catalog import get_catalog
    from engine.regular4d_validation import CROSSWALK, CATALOG_IDENTITIES
    catalog = [r for r in get_catalog() if r['family'] != '4D discovery candidates'
               and r.get('sourceClassification') != 'Unclassified discovery candidate']
    acronyms = {r['bowers'].lower() for r in catalog if r.get('bowers')}
    for r in catalog:
        for url in r.get('referenceUrls', []):
            if url.startswith(BASE + 'incmats/') and url.endswith('.htm'):
                acronyms.add(url.rsplit('/', 1)[-1].removesuffix('.htm'))
    acronyms.update(CROSSWALK[n]['alias'].lower() for n in CATALOG_IDENTITIES.values())
    acronyms.update(indexes[0]['links'] if indexes[0] else [])
    acronyms.update(indexes[1]['links'] if indexes[1] else [])
    acronyms = {a for a in acronyms if re.fullmatch(r'[a-z0-9-]+', a)}
    jobs = [(BASE + 'incmats/' + a + '.htm', 'klitzing/' + a + '.json', extract_page) for a in sorted(acronyms)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(safe, jobs))

    # Immutable remote revision, not the app's bundled source tree.
    repo = 'https://api.github.com/repos/vihdzp/miratope-rs'
    tree = safe((repo + '/git/trees/main?recursive=1', 'miratope-tree.json',
                 lambda raw: {k: json.loads(raw)[k] for k in ('sha', 'tree')}))
    if tree:
        revision = tree['sha']
        safe(('https://raw.githubusercontent.com/vihdzp/miratope-rs/' + revision + '/LICENSE',
              'miratope-license.json', lambda raw: {'text': raw.decode('utf-8'), 'spdx': 'MIT'}))
        paths = [r['path'] for r in tree['tree'] if r['path'].endswith('.off') and
                 (r['path'].startswith('lib/3D/uniform/') or r['path'].startswith('lib/3D/rf/') or
                  r['path'].startswith('lib/4D/regular/') or r['path'].startswith('lib/4D/convex uniform/') or
                  r['path'].startswith('lib/4D/nonconvex uniform/'))]

        def off_extract(raw):
            from engine.catalog_audit import read_off_literal
            # Reuse the engine's literal OFF reader without inventing an importer.
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.off', dir=CACHE, delete=False) as f:
                tmp = Path(f.name)
                f.write(raw)
            try:
                model, _ = read_off_literal(tmp)
            finally:
                tmp.unlink()
            result = {'dimension': model['dimension'],
                      'counts': [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')]}
            if len(model['vertices']) <= 640:
                result['model'] = model
            else:
                result['coordinateOmission'] = 'Above 640-vertex retained coordinate bound; counts only.'
            return result

        jobs = [('https://raw.githubusercontent.com/vihdzp/miratope-rs/' + revision + '/' + urllib.parse.quote(path),
                 'miratope/' + path.removeprefix('lib/').removesuffix('.off') + '.json', off_extract)
                for path in paths]
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(safe, jobs))

    # Small factual excerpts only; no full prose mirrors.
    excerpts = [
        ('http://www.polytope.net/hedrondude/polychora.htm', 'bowers-counts.json',
         r'.{0,80}(?:2191|2188|47 |64 |six |ten ).{0,120}'),
        ('http://www.polytope.net/hedrondude/polyhedra.htm', 'bowers-polyhedra-counts.json',
         r'.{0,80}(?:75 |53 |13 |five |four |Platonic|Archimedean|Kepler).{0,120}'),
        (BASE + 'explain/polytope-tree.htm', 'klitzing-counts.json',
         r'.{0,60}(?:8190|1849|13 further).{0,150}'),
    ]
    for url, filename, pattern in excerpts:
        safe((url, filename, lambda raw, pattern=pattern: {
            'excerpts': re.findall(pattern, ' '.join(plain(raw.decode(errors='replace')).split()), re.I)}))
    def group_orders(raw):
        text = plain(raw.decode())
        orders = {}
        for group in ('A3', 'B3', 'H3', 'A4', 'B4', 'D4', 'F4', 'H4'):
            match = re.search(r'\|' + group + r'\|\s*=\s*([\d,]+)', text)
            if match:
                orders[group] = int(match[1].replace(',', ''))
        return {'orders': orders, 'scope': 'Full finite Coxeter groups; no automatic snub or augmented symmetry inference.'}
    safe((BASE + 'explain/dynkin.htm', 'group-orders.json', group_orders))
    for source in old.values():
        if source.get('manualExtract'):
            path = CACHE / source['file']
            if hashlib.sha256(path.read_bytes()).hexdigest() != source['extractSha256']:
                raise ValueError('Manually reviewed extract changed: ' + source['file'])
            manifest['sources'].append(source)
    manifest['sources'].sort(key=lambda s: s['file'])
    (CACHE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'sources': len(manifest['sources']), 'failures': manifest['failures']}, indent=2))


if __name__ == '__main__':
    main()
