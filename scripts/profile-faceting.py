"""Repeatable bounded R6 fixture profile; timings are observations, not gates."""

import json
from pathlib import Path
import sys
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine.automatic_faceting import candidate_facets, enumerate_facetings
from engine.formats import load_file

source = load_file(ROOT / 'examples/faceting/pyritohedron-20.off')['model']
source['id'] = 'pyritohedron-20-profile'
rows = []
for name, function, options in (
    ('identity candidate planes', candidate_facets, {}),
    ('verified group candidate planes', candidate_facets, {'source_symmetry': {'mode': 'all'}}),
    (
        'invariant isohedral search',
        enumerate_facetings,
        {'source_symmetry': {'mode': 'all'}, 'invariant_under_subgroup': True, 'criteria': {'isohedral': True}},
    ),
    (
        'invariant unions; result cap',
        enumerate_facetings,
        {'source_symmetry': {'mode': 'all'}, 'invariant_under_subgroup': True},
    ),
):
    start = perf_counter()
    result = function(source, **options)
    rows.append(
        {
            'profile': name,
            'seconds': round(perf_counter() - start, 4),
            'status': result['status'],
            'planes': len(result['planes']) if 'planes' in result else None,
            'candidates': len(result['candidates']) if 'candidates' in result else result['candidateCount'],
            'results': len(result['results']) if 'results' in result else None,
            'nodes': result.get('nodesVisited'),
            'planeWork': result.get('planeWork'),
            'searchPruning': result.get('searchPruning'),
            'limitReasons': result['limitReasons'],
        }
    )
print(
    json.dumps(
        {
            'fixture': 'integer pyritohedral dodecahedron; h=1/2, scale 4',
            'timingQualification': 'local single observations; mathematical counts/budgets are tested independently',
            'profiles': rows,
        },
        indent=2,
    )
)
