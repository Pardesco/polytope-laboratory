"""Small mounted FAC03 check; no development overlay or desktop launch."""
from copy import deepcopy
from itertools import combinations, product
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.automatic_faceting import candidate_facets, enumerate_facetings, realize_faceting
from engine.automatic_faceting_workflow import verify_search
from engine.geometry import canonical_cycle

vertices=[list(p) for p in product((-1,1),repeat=3)]
outer=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]
vertices.extend([[-.3,-.3,-.3],[.3,.3,-.3],[.3,-.3,.3],[-.3,.3,.3]])
source={'id':'literal-12-policy-source','name':'Cube with internal vertices','dimension':3,'embeddingDimension':3,
    'interpretation':'generalized-complex','vertices':vertices,'faces':outer,'cells':[],
    'edges':[list(edge) for edge in sorted({tuple(sorted((a,b))) for f in outer for a,b in zip(f,f[1:]+f[:1])})],
    'numeric':{'mode':'float64-approximate','certified':False},
    'metadata':{'coordinateUnits':'mm','note':'retain source ownership',
        'offColors':{'faces':[{'encoding':'unit','values':[.2,.4,.6,.8]} for _ in outer],'cells':[]}}}
before=deepcopy(source)
catalog=candidate_facets(source,max_face_vertices=3)
lookup={canonical_cycle(row['cycle']):row['id'] for row in catalog['candidates']}
inner=[[8,10,9],[8,9,11],[9,10,11],[10,8,11]]
args={'max_face_vertices':3,'criteria':{'tidy':True,'spiky':True,'accept_partial':True}}
search=enumerate_facetings(source,[lookup[canonical_cycle(f)] for f in inner],**args)
assert search['status']=='complete' and len(search['results'])==1
assert verify_search(source,search)['passed']
result=realize_faceting(source,search,search['results'][0]['id'])
assert result['vertices']==source['vertices'] and result['provenance']['sourceSnapshot']==source and source==before
assert result['metadata']['coordinateUnits']=='mm'
assert result['metadata']['facetingCriteria']['policyEvidence']['spiky']['passed']
parities=[[i for i,p in enumerate(vertices[:8]) if sum(x==1 for x in p)%2==j] for j in (0,1)]
diagonals=[list(f) for group in parities for f in combinations(group,3)]
rejected=enumerate_facetings(source,[lookup[canonical_cycle(f)] for f in diagonals],**args)
# Partial selection allows tetrahedron A, tetrahedron B, and their disjoint
# union: exactly three nonempty closed selections. All use boundary diagonals.
assert rejected['status']=='complete' and rejected['results']==[]
assert rejected['incidenceSelectionsExamined']==rejected['criteriaRejectedAtLeaves']==3
assert verify_search(source,rejected)['passed']
print('PASS mounted FAC03: 12-vertex interior tidy/spiky adoption and replay; hull-face diagonals reject; source/units preserved.')
