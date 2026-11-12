"""Refresh independent Klitzing facts, then admit only checked native boundaries.

Network is used by this maintenance script only. The application is offline.
"""

from concurrent.futures import ThreadPoolExecutor
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote, urljoin
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BASE = 'https://bendwavy.org/klitzing/'
INDEX = BASE + 'dimensions/polychora-neu.htm'
LINEAR = r'[xo](?:\d+(?:/\d+)?[xo]){3}'
CONVEX = {
    'pen',
    'rap',
    'tip',
    'srip',
    'spid',
    'deca',
    'grip',
    'prip',
    'gippid',
    'hex',
    'ico',
    'rit',
    'tes',
    'thex',
    'rico',
    'sidpith',
    'tah',
    'srit',
    'tat',
    'tico',
    'prit',
    'proh',
    'grit',
    'gidpith',
    'srico',
    'spic',
    'cont',
    'grico',
    'prico',
    'gippic',
    'ex',
    'rox',
    'rahi',
    'hi',
    'tex',
    'srix',
    'sidpixhi',
    'xhi',
    'srahi',
    'thi',
    'grix',
    'prahi',
    'prix',
    'grahi',
    'gidpixhi',
}


class Text(HTMLParser):
    def __init__(self, raw):
        super().__init__()
        self.parts = []
        self.feed(raw)

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            self.parts.append('\n')

    def value(self):
        return unescape(''.join(self.parts)).strip()


def text(raw):
    return Text(raw).value()


def read(url):
    with urlopen(quote(url, safe=':/#?=&'), timeout=30) as response:
        return response.read().decode('windows-1252')


def matrices(raw):
    result = []
    for pre in re.findall(r'<pre\b[^>]*>(.*?)</pre>', raw, re.S | re.I):
        links = []

        def anchor(match):
            href = re.search(r'href="([^"]+)"', match[1], re.I)
            if href and text(match[2]) == '\u2666':
                links.append(href[1])
                return '~' + str(len(links) - 1) + '~ |'
            return text(match[2])

        plain = text(re.sub(r'<a\b([^>]*)>(.*?)</a>', anchor, pre, flags=re.S | re.I))
        lines = [s.strip() for s in plain.splitlines() if s.strip()]
        if not lines or '|' not in plain:
            continue
        groups = []
        group = []
        for line in lines[1:]:
            if re.fullmatch(r'[-+]+', line):
                if group:
                    groups.append(group)
                    group = []
            elif '|' in line:
                group.append(line)
        if group:
            groups.append(group)
        if groups:
            result.append((lines[0], groups, links))
    return result


def numbers(s):
    return list(map(int, re.findall(r'\b\d+\b', re.sub(r'~\d+~', '', s))))


def diagonal(groups):
    return [sum(sum(numbers(row.split('|')[i + 1])) for row in group) for i, group in enumerate(groups)]


def cell_facts(acronym, raw):
    # The first matrix is the author's preferred realization of the named cell.
    _, groups, _ = matrices(raw)[0]
    if len(groups) != 3:
        raise ValueError('Not a polyhedron: ' + acronym)
    counts = diagonal(groups)
    polygons = {}
    for row in groups[2]:
        prefix = row.split('|')[0]
        n = numbers(row.split('|')[1])[0]
        diagram = prefix.split('~')[0].replace(' ', '')
        match = re.search(r'([xo])(\d+)(?:/(\d+))?([xo])', diagram)
        winding = 1
        if match:
            a, p, d, b = match.groups()
            p = int(p)
            d = int(d or 1)
            if n == p:
                winding = min(d, p - d)
            elif n == 2 * p:
                winding = d
        symbol = str(n) if winding == 1 else f'{n}/{winding}'
        polygons[symbol] = polygons.get(symbol, 0) + sum(numbers(row.split('|')[3]))
    rows = re.findall(r'<tr\b[^>]*>(.*?)</tr>', raw, re.I | re.S)
    name = next(
        text(row).removeprefix('Name').strip().split('\n')[0].split(',')[0]
        for row in rows
        if re.match(r'\s*Name\b', text(row))
    )
    return {
        'bowers': acronym,
        'name': name,
        'counts': counts,
        'facePolygons': dict(sorted(polygons.items())),
        'referenceUrl': BASE + 'incmats/' + acronym + '.htm',
    }


def merge_cell_types(inventory):
    merged = {}
    for cell in inventory:
        key = cell['bowers']
        if key in merged:
            merged[key]['count'] += cell['count']
        else:
            merged[key] = {**cell}
    return list(merged.values())


def build():
    raw = read(INDEX)
    candidates = {}
    for pre in re.findall(r'<pre\b[^>]*>(.*?)</pre>', raw, re.S | re.I):
        for line in pre.splitlines():
            match = re.search(r'(' + LINEAR + r')\s*-\s*<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)</a>', line)
            if not match:
                continue
            diagram, url, acronym = match.groups()
            if '/' not in diagram or not re.fullmatch('[a-z]+', acronym):
                continue
            if acronym in CONVEX:
                continue
            candidates.setdefault(acronym, (diagram, urljoin(INDEX, url)))
    with ThreadPoolExecutor(max_workers=6) as pool:
        pages = dict(zip(candidates, pool.map(read, [url for _, url in candidates.values()])))
    entries = []
    rejected = []
    cells = {}
    from engine.star_uniform4 import rational_boundary, boundary_evidence, cell_signature, polygon_symbol
    import numpy as np

    for acronym, (diagram, url) in candidates.items():
        try:
            records = [
                m for m in matrices(pages[acronym]) if re.fullmatch(LINEAR, m[0]) and '/' in m[0] and len(m[1]) == 4
            ]
            if not records:
                continue
            # Prefer the index diagram; otherwise use the first published chain.
            symbol, groups, links = next((r for r in records if r[0] == diagram), records[0])
            counts = diagonal(groups)
            inventory = []
            for row in groups[3]:
                link = int(re.search(r'~(\d+)~', row.split('|')[0])[1])
                cell_url = urljoin(url, links[link])
                cell_acronym = cell_url.rsplit('/', 1)[-1].removesuffix('.htm')
                if cell_acronym not in cells:
                    cells[cell_acronym] = cell_facts(cell_acronym, read(cell_url))
                cell = cells[cell_acronym]
                inventory.append({**cell, 'count': sum(numbers(row.split('|')[4]))})
            inventory = merge_cell_types(inventory)
            angles = re.findall(r'\d+(?:/\d+)?', symbol)
            rings = [int(c == 'x') for c in symbol if c in 'xo']
            model = rational_boundary(angles, rings, counts[0])
            actual = [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')]
            if actual != counts:
                raise ValueError(f'Face vector {actual} != {counts}')
            symbols = [polygon_symbol(np.asarray(model['vertices']), f) for f in model['faces']]
            from collections import Counter

            actual_cells = Counter(
                json.dumps(cell_signature(model, c, symbols), sort_keys=True) for c in model['cells']
            )
            expected_cells = Counter()
            for cell in inventory:
                signature = json.dumps([cell['counts'], cell['facePolygons']], sort_keys=True)
                if signature in expected_cells:
                    raise ValueError('Ambiguous cell signatures are outside this registry')
                expected_cells[signature] = cell['count']
            if actual_cells != expected_cells:
                raise ValueError('Cell signatures disagree')
            boundary_evidence(model)
            from engine.geometry import validate

            if not validate(model)['passed']:
                raise ValueError('Boundary structural validation failed')
            p = np.asarray(model['vertices'])
            e = np.asarray(model['edges'])
            lengths = np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1)
            if np.ptp(lengths) / np.mean(lengths) > 1e-7:
                raise ValueError('Unequal edges')
            rows = re.findall(r'<tr\b[^>]*>(.*?)</tr>', pages[acronym], re.I | re.S)
            name = next(
                text(row).removeprefix('Name').strip().split('\n')[0].split(',')[0]
                for row in rows
                if re.match(r'\s*Name\b', text(row))
            )
            group = 'H4' if '5' in ''.join(angles) else 'B4' if angles[1] == '3' else 'F4'
            regular = acronym in {'fix', 'gohi', 'gahi', 'sishi', 'gaghi', 'gishi', 'gashi', 'gofix', 'gax', 'gogishi'}
            entry = {
                'key': 'star-uniform4-' + acronym,
                'name': name,
                'dimension': 4,
                'family': 'Star uniform polychora (Wythoffian)',
                'bowers': acronym,
                'aliases': [acronym, name, symbol],
                'symbol': symbol,
                'coxeterDiagram': symbol,
                'diagram': angles,
                'rings': rings,
                'counts': counts,
                'cellTypes': inventory,
                'symmetryGroup': group,
                'symmetryGroups': [group, '[' + ','.join(angles) + ']'],
                'convex': False,
                'uniform': True,
                'regular': regular,
                'vertexTransitive': True,
                'chiral': False,
                'classificationVerified': True,
                'referenceUrls': [url, INDEX],
                'numericContract': 'Native rational-angle reflection orbits; approximate float64, no exact certificate',
                'cellTypeBasis': 'Published incidence-matrix counts and polygon windings; native boundary signatures checked on generation.',
            }
            entries.append(entry)
            print('ADMIT', acronym, counts, flush=True)
        except Exception as exc:
            rejected.append({'bowers': acronym, 'diagram': diagram, 'referenceUrl': url, 'reason': str(exc)})
            print('EXCLUDE', acronym, str(exc), flush=True)
    data = {
        'schemaVersion': 1,
        'sourceIndex': INDEX,
        'scope': 'Verified nonconvex linear rational-angle Wythoffians only; not a complete uniform-polychoron enumeration.',
        'entries': entries,
        'excludedCandidates': rejected,
    }
    write_manifest(data)
    print('Registered', len(entries), 'excluded', len(rejected), flush=True)


def write_manifest(data):
    from engine.generators import CATALOG

    keys = {row['name'].lower(): row['key'] for row in CATALOG if row['dimension'] == 3}
    source = json.loads((ROOT / 'engine/catalog_data/antiprism/manifest.json').read_text(encoding='utf-8'))
    for row in source['entries']:
        if row['id'].startswith('U'):
            keys.setdefault(row['name'].lower(), row['key'])
    for entry in data['entries']:
        entry['cellTypes'] = merge_cell_types(entry['cellTypes'])
        group = entry['symmetryGroup']
        entry['coxeterFamily'] = group
        canonical = {'H4': ['[5,3,3]', '[3,3,5]'], 'B4': ['[4,3,3]', '[3,3,4]'], 'F4': ['[3,4,3]']}[group]
        entry['symmetryGroups'] = list(dict.fromkeys(entry['symmetryGroups'] + canonical))
        for cell in entry['cellTypes']:
            key = {
                'trip': 'uniform-prism-3',
                'pip': 'uniform-prism-5',
                'hip': 'uniform-prism-6',
                'dip': 'uniform-prism-10',
            }.get(cell['bowers'], keys.get(cell['name'].lower()))
            if key:
                cell['key'] = key
    data['referenceReviewed'] = '2026-10-26'
    path = ROOT / 'engine/catalog_data/star_uniform4.json'
    path.write_text(json.dumps(data, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build()
