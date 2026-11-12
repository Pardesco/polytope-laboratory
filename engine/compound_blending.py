"""Construct a checked outer shell, then blend its coplanar regions."""

from copy import deepcopy
import numpy as np
from .geometry import GeometryError, identity, validate
from .compounds import _check_source
from .operations import record
from .visible_surface import visible_surface
from .planar_union import blend_regions, conform_geometry, EPS
from .generalized_nets import _shell_geometry


def merge_compound(source, fill_rule='nonzero', color_policy='require-equal'):
    _check_source(source)
    if color_policy not in ('require-equal', 'first-source'):
        raise GeometryError('Merge color policy must be require-equal or first-source.')
    result = visible_surface(source, fill_rule, decompose_holes=True)
    surface = deepcopy(result['metadata']['visibleSurface'])
    if surface['shells'] != 1:
        raise GeometryError(
            'Merge compound requires a single connected outer shell; disjoint compounds remain separate.'
        )
    origins = [[f] for f in surface['sourceFaceIds']]
    processed = set()
    while True:
        p = np.asarray(result['vertices'])
        span = float(np.max(np.ptp(p, axis=0)))
        p = (p - p.mean(axis=0)) / span
        groups = []
        for fi, face in enumerate(result['faces']):
            q = p[face]
            _, _, axes = np.linalg.svd(q - q.mean(axis=0), full_matrices=False)
            normal = axes[-1]
            offset = float(q[0] @ normal)
            found = next(
                (g for g in groups if abs(abs(g[0] @ normal) - 1) < EPS and abs(float(q[0] @ g[0]) - g[1]) < EPS), None
            )
            if found is None:
                groups.append([normal, offset, [fi]])
            else:
                found[2].append(fi)
        candidates = [g[2] for g in groups if len(g[2]) > 1]
        # Process one plane once. Non-adjacent patches may remain separate.
        candidates = [ids for ids in candidates if tuple(sorted({v for i in ids for v in origins[i]})) not in processed]
        if not candidates:
            break
        selected = candidates[0]
        key = tuple(sorted({v for i in selected for v in origins[i]}))
        processed.add(key)
        blended = blend_regions(result, selected, color_policy=color_policy, fill_rule=fill_rule)
        maps = blended['metadata']['faceEditing']['faceSources']
        origins = [sorted({v for f in ids for v in origins[f]}) for ids in maps]
        colors = blended['metadata'].get('offColors')
        blended['metadata'] = {'offColors': colors} if colors else {}
        result = blended
    # Remove degree-two subdivision vertices simultaneously from both sheets.
    p = np.asarray(result['vertices'])
    removable = set()
    for v in range(len(p)):
        neighbors = {b if a == v else a for a, b in result['edges'] if v in (a, b)}
        if len(neighbors) != 2:
            continue
        a, b = sorted(neighbors)
        u = p[a] - p[v]
        w = p[b] - p[v]
        if float(u @ w) < 0 and np.linalg.norm(np.cross(u, w)) <= EPS * np.linalg.norm(u) * np.linalg.norm(w):
            removable.add(v)
    faces = [[v for v in f if v not in removable] for f in result['faces']]
    vertices, faces, edges, _ = conform_geometry(result['vertices'], faces)
    result.update(vertices=vertices, faces=faces, edges=edges)
    result['metadata'].pop('visibleSurface', None)
    _shell_geometry(result)
    evidence = {
        'sourceModel': deepcopy(source),
        'sourceFingerprint': identity(source),
        'fillRule': fill_rule,
        'colorPolicy': color_policy,
        'sourceFaceIds': origins,
        'visibleSurface': surface,
        'closed': True,
        'shells': 1,
        'eulerCharacteristic': len(result['vertices']) - len(result['edges']) + len(result['faces']),
        'definition': 'union of oriented component interiors, followed by coplanar planar-region unions',
        'certified': False,
    }
    result['metadata']['compoundMerge'] = evidence
    if 'coordinateUnits' in source.get('metadata', {}):
        result['metadata']['coordinateUnits'] = deepcopy(source['metadata']['coordinateUnits'])
    result['name'] = 'Merged ' + source.get('name', 'compound')
    result['validation'] = validate(result)
    result['fingerprint'] = identity(result)
    _check_source(result)
    return record(result, source, 'merge-compound', {'fill_rule': fill_rule, 'color_policy': color_policy})
