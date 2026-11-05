"""Regenerate the original, fixed-topology near-miss catalog (offline)."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

import numpy as np
import scipy
from engine.near_miss_construction import RECIPES, construct, fit_catalog_source, vertex_configurations
from engine.near_miss_catalog import DATA, FAMILY, deviation_metrics
from engine.geometry import identity
from engine.symmetry import geometric_symmetry

WIKI='https://en.wikipedia.org/wiki/Near-miss_Johnson_solid'
MCNEILL='https://www.orchidpalms.com/polyhedra/acrohedra/nearmiss/jsmn.htm'
DEFINITIONS={
    'chamfered-cube':'Radial plane cuts of the six degree-4 vertices of the rhombic dodecahedron (dual of rectified cube).',
    'chamfered-dodecahedron':'Radial plane cuts of the twelve degree-5 vertices of the rhombic triacontahedron (dual of rectified icosahedron).',
    'rectified-truncated-icosahedron':'Rectify the uniform truncated icosahedron (atI).',
    'truncated-truncated-icosahedron':'Truncate all vertices of the uniform truncated icosahedron, initially at edge fraction 0.2 (ttI).',
    'expanded-truncated-icosahedron':'Two successive rectifications of the uniform truncated icosahedron (etI = aatI topology).',
    'truncated-triakis-tetrahedron':'Radial plane cuts of only the four degree-6 vertices of the triakis tetrahedron (t6kT).',
    'associahedron-k5':'Radial plane cuts of the three degree-4 vertices of the polar of a triangular prism (t4dP3).',
    'wedge-4-5':'Regular square and pentagon joined by one regular square and a convex belt of seven triangles; optimize the two hinge angles.',
    'wedge-4-5-top-augmented':'Attach a regular square pyramid to the square base of the square-pentagon wedge.',
    'wedge-4-5-side-augmented':'Attach a regular square pyramid to the joining square of the square-pentagon wedge.',
}


def build():
    DATA.mkdir(parents=True,exist_ok=True);entries=[]
    for slug,name,group,order in RECIPES:
        source=construct(slug);result,fit=fit_catalog_source(source)
        symmetry=geometric_symmetry(result,max_frames=10000)
        if not symmetry['complete'] or not symmetry['closureVerified'] or symmetry['order']!=order:
            raise ValueError('Near-miss fitted symmetry did not match '+slug)
        key='near-miss-'+slug;metrics=deviation_metrics(result)
        evidence={'approximate':True,'regularityEstablished':False,'certified':False,
            'construction':DEFINITIONS[slug],'metrics':metrics,'fitting':fit,
            'symmetry':{'group':group,'order':order,'properOrder':symmetry['properOrder'],'complete':True,'certified':False},
            'sourceFingerprint':identity(source),'references':[MCNEILL if 'wedge' in slug else WIKI],
            'numericContract':'Original float64 local fit; fixed incidence; approximate faces; no global optimality or exact regularity certificate.'}
        if 'wedge' in slug:
            p=np.asarray(source['vertices']);e=np.asarray(source['edges']);lengths=np.linalg.norm(p[e[:,0]]-p[e[:,1]],axis=1)
            aggregate=deviation_metrics(source)['aggregateAngleDeviationDegrees'];edge=float(np.sum(np.abs(lengths-1)))
            if abs(edge-.194)>.005 or abs(aggregate-34)>.5:raise ValueError('Published wedge reference cross-check failed.')
            evidence['publishedComparison']={'source':MCNEILL,'entry':'Number 7 and its two square augmentations',
                'published':{'aggregateEdgeErrorUnitEdge':.194,'aggregateAngleDeviationDegrees':34.,'diagonalError':0.},
                'referenceMeasured':{'aggregateEdgeErrorUnitEdge':edge,'aggregateAngleDeviationDegrees':aggregate},
                'absoluteTolerance':{'aggregateEdgeErrorUnitEdge':.005,'aggregateAngleDeviationDegrees':.5},'passed':True,
                'scope':'Independent regular-square/pentagon reference with triangular distortion. Catalog fit subsequently allows every face to vary, so its maxima and aggregate errors differ.'}
        if slug=='truncated-triakis-tetrahedron':
            evidence['publishedComparison']={'source':MCNEILL,'entry':'Number 22','published':{'aggregateEdgeErrorUnitEdge':.316,'diagonalError':3.07,'aggregateAngleDeviationDegrees':52.47},
                'passed':None,'scope':'Different constrained objective: published hexagons stay regular; this fit allows all faces to vary. Aggregate reference values are not maximum residuals and are not a numerical agreement claim.'}
        types=dict(sorted(Counter(map(len,result['faces'])).items()))
        record={'key':key,'name':name+' (near miss)','dimension':3,'family':FAMILY,
            'counts':[len(result[k]) for k in ('vertices','edges','faces','cells')],
            'faceTypes':types,'faceConfiguration':', '.join(f'{count} x {n}-gon' for n,count in types.items()),
            'vertexConfigurations':vertex_configurations(result),
            'symmetryGroup':group,'symmetryOrder':order,'nearMiss':True,'approximate':True,
            'regular':False,'uniform':False,'convex':True,'chiral':False,
            'aliases':['near miss','near-miss Johnson solid',name,slug.replace('-',' ')],
            'nearMissRealization':evidence}
        result.update(id=key,name=record['name'],metadata={},provenance={'operation':'generate','parameters':{'kind':'regular','key':key},
            'construction':DEFINITIONS[slug],'algorithmVersion':'0.1.0','numericContract':evidence['numericContract']})
        result['fingerprint']=identity(result)
        result['numeric']['algorithm']='symmetry-constrained local condition fitting'
        raw=(json.dumps(result,separators=(',',':'),allow_nan=False)+'\n').encode()
        file=slug+'.json';(DATA/file).write_bytes(raw)
        entries.append({'file':file,'sha256':hashlib.sha256(raw).hexdigest(),'record':record})
        print(slug,record['counts'],f"edges {metrics['maximumEdgeDeviationPercent']:.4f}%, angles {metrics['maximumFaceAngleDeviationDegrees']:.4f} deg",flush=True)
    manifest={'schemaVersion':1,'family':FAMILY,'generator':'scripts/build-near-miss-catalog.py',
        'backend':{'numpy':np.__version__,'scipy':scipy.__version__},'entries':entries}
    (DATA/'manifest.json').write_text(json.dumps(manifest,indent=2,allow_nan=False)+'\n',encoding='utf-8')


if __name__=='__main__':build()
