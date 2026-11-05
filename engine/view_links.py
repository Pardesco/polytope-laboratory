"""Polarity correspondences from actual returned hull vertex ownership."""
import numpy as np
from .geometry import identity, TOLERANCE


def attach_dual_links(source, result, equations):
    if sum(len(source.get(k, [])) for k in ('vertices','edges','faces','cells'))*sum(len(result.get(k, [])) for k in ('vertices','edges','faces','cells')) > 2000000:
        return
    points = np.asarray(source['vertices'], dtype=float)
    scale = float(np.max(np.ptp(points, axis=0)))
    facets = [set(np.flatnonzero(np.abs(points @ row[:-1] + row[-1])/np.linalg.norm(row[:-1]) <= TOLERANCE * scale * 8).tolist()) for row in equations]
    used = result.get('provenance', {}).get('extremeInputIndices', [])
    # Caller invokes this before replacing the hull's provenance record.
    owners = [facets[i] for i in used]
    if len(owners) != len(result['vertices']):
        return
    def entities(model, kind):
        if kind == 'vertex': return [{i} for i in range(len(model['vertices']))]
        if kind == 'cell': return [{v for f in c for v in model['faces'][f]} for c in model.get('cells', [])]
        return [set(row) for row in model[{'edge':'edges','face':'faces'}[kind]]]
    kinds = ['vertex','edge','face','cell'][:source['dimension']]
    links = {}
    for source_kind, target_kind in zip(kinds, reversed(kinds)):
        source_sets = entities(source, source_kind)
        rows = []
        for target in entities(result, target_kind):
            shared = set.intersection(*(owners[i] for i in target))
            matches = [i for i, item in enumerate(source_sets) if item == shared]
            rows.append({'kind':source_kind,'id':matches[0]} if len(matches)==1 else None)
        links[target_kind] = rows
    result.setdefault('metadata', {})['viewLinks'] = {'sourceFingerprint':identity(source),'entities':links,
        'definition':'polar incidence; intersect source facets owning the returned dual vertices'}
