"""Reproduce the UC source cross-check and compact native orbit definitions."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import json
import hashlib
import numpy as np
from scipy.spatial import cKDTree
from engine.compound_catalog import symmetry_group, rotation
from engine.formats import parse_off
from engine.specialized_catalog import DATA, boundary_parts


def cycle(points):
    seq = [tuple(p) for p in np.round(points, 7)]
    return min(tuple(s[i:] + s[:i]) for s in (seq, seq[::-1]) for i in range(len(s)))


def signature(points, faces):
    return tuple(sorted(cycle(points[f]) for f in faces))


def main():
    manifest = json.loads((DATA / 'manifest.json').read_text())
    definitions = []
    group_table = {}
    for entry in manifest['entries']:
        uc = int(entry['key'].removeprefix('antiprism-uc'))
        raw = (DATA / entry['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry['sha256']:
            raise ValueError('Source fingerprint mismatch: ' + entry['key'])
        m = parse_off(raw.decode(), entry['name'])
        parts = boundary_parts(m)
        vs = np.asarray(m['vertices'])
        seeds = []
        for part in parts:
            ids = sorted({v for f in part for v in m['faces'][f]})
            reverse = {v: i for i, v in enumerate(ids)}
            seeds.append((vs[ids], [[reverse[v] for v in m['faces'][f]] for f in part]))
        original = {signature(p, f) for p, f in seeds}
        groups = {name: symmetry_group(name) for name in ('Oh', 'Ih')}
        if 20 <= uc <= 25:
            order = entry['parameters']['n'] * entry['parameters']['k']
            groups = {
                f'D{order}h': tuple(
                    rotation([0, 0, 1], 2 * np.pi * i / order) @ np.diag([1, s, t])
                    for i in range(order)
                    for s in (-1, 1)
                    for t in (-1, 1)
                )
            }
        best = []
        label = None
        for name, group in groups.items():
            valid = [g for g in group if all(signature(p @ g.T, f) in original for p, f in seeds)]
            if len(valid) > len(best):
                best = valid
                label = name
        p, f = seeds[0]
        images = {signature(p @ g.T, f) for g in best}
        if len(images) != len(parts):
            raise ValueError(f'UC{uc} does not form a single component orbit')
        matrices = []
        seen = set()
        for g in best:
            key = signature(p @ g.T, f)
            if key in seen:
                continue
            seen.add(key)
            matrices.append(g.tolist())
        proper = sum(np.linalg.det(g) > 0 for g in best)
        if label == 'Oh':
            label = (
                'Oh'
                if len(best) == 48
                else 'O'
                if proper == 24
                else 'Th'
                if any(np.allclose(g, -np.eye(3)) for g in best)
                else 'Td'
            )
        if label == 'Ih':
            label = 'Ih' if len(best) == 120 else 'I'
        actions = np.asarray(best)
        group_table[label] = actions.round(14).tolist()
        axis = None
        if 'angleDegrees' in entry['parameters']:
            stabilizers = [
                g
                for g in best
                if np.linalg.det(g) > 0 and not np.allclose(g, np.eye(3)) and signature(p @ g.T, f) == signature(p, f)
            ]
            g = stabilizers[0]
            _, _, vh = np.linalg.svd(g - np.eye(3))
            axis = vh[-1]
            if axis[np.argmax(abs(axis))] < 0:
                axis = -axis
            axis = axis.round(14).tolist()
        matrices = np.asarray(matrices).round(14)
        generated = np.concatenate([p @ g.T for g in matrices])
        scale = np.sqrt(np.mean(np.sum((vs - vs.mean(axis=0)) ** 2, axis=1)))
        residual = float(max(cKDTree(vs).query(generated)[0]) / scale)
        if residual > 1e-12 or len(generated) != entry['counts'][0]:
            raise ValueError('Native source cross-check failed')
        print(uc, len(parts), label, len(best), proper, residual, flush=True)
        definitions.append(
            {
                'uc': uc,
                'name': entry['name'].split(' [')[0],
                'counts': entry['counts'],
                'componentCount': len(parts),
                'parameters': entry['parameters'],
                'vertices': p.tolist(),
                'faces': f,
                'group': label,
                'angleAxis': axis,
                'matrices': matrices.tolist(),
                'sourceResidual': residual,
                'sha256': entry['sha256'],
            }
        )
    out = Path(__file__).resolve().parents[1] / 'engine/catalog_data/uniform_compounds.json'
    out.write_text(
        json.dumps(
            {
                'schemaVersion': 1,
                'provider': 'Antiprism',
                'providerVersion': '0.32',
                'sourceManifest': 'specialized/manifest.json',
                'licenseFile': 'specialized/COPYING',
                'constructionReference': 'https://github.com/antiprism/antiprism/blob/master/base/skilling.cc',
                'numericContract': 'Attributed decimal component seed and verified float64 group orbit; not an independent analytic seed or exact certificate.',
                'groups': group_table,
                'entries': definitions,
            },
            separators=(',', ':'),
        )
        + '\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
