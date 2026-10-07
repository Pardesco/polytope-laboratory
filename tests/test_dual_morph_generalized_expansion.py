from collections import Counter
from copy import deepcopy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.generators import regular
from engine.faceting import facet
from engine.geometry import GeometryError
from engine.dual_morph_generalized_expansion import prepare_generalized_expansion
from engine.dual_morph import dispatch_dual_morph

STARS=['small-stellated-dodecahedron','great-dodecahedron','great-stellated-dodecahedron','great-icosahedron']
SETTING={'version':1,'enabled':True,'method':'expansion','center':None,'radius':1.,'ratio':.25,'duration':2.,'loop':False}
CONTEXT={'notes':'Literal source notes','unit':'mm'}

def source_attributes(p):
    p['metadata'].update(coordinateUnits='mm',historical={'literal':[.125,'retain']},offColors={k:[{'encoding':'byte','values':[30,60,90,127]} for e in p[k]] for k in ('vertices','edges','faces')})
    return p

class GeneralizedExpansionSanity(unittest.TestCase):
    def test_all_four_stars_actual_flag_incidence_planar_sheets_rectangles_colors_and_endpoints(self):
        for name in STARS:
            source=source_attributes(regular(name));before=deepcopy(source)
            with self.subTest(name=name),patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
                plan=prepare_generalized_expansion({'model':source,'notes':CONTEXT['notes'],'view':{'coordinateUnit':'mm'}})
                desc=plan.descriptor();flags=desc['expansion']['flags'];P=np.asarray(source['vertices']);Q=np.asarray(plan.dual['vertices'])
                self.assertEqual(len(flags),60);self.assertEqual({tuple(f) for f in flags},{(v,f) for f,F in enumerate(source['faces']) for v in F})
                self.assertEqual(plan.evaluate('expansion',0)['model'],source);self.assertEqual(plan.evaluate('expansion',1)['model'],plan.dual)
                for t in (.25,.5,.75):
                    frame=plan.evaluate('expansion',t);m=frame['model'];X=np.asarray(m['vertices'])
                    self.assertTrue(np.allclose(X,np.asarray([(1-t)*P[v]+t*Q[f] for v,f in flags])))
                    self.assertEqual([len(m[k]) for k in ('vertices','edges','faces')],[60,120,54 if len(P)==len(Q)==12 else 62])
                    incidence=Counter(tuple(sorted((a,b))) for F in m['faces'] for a,b in zip(F,F[1:]+F[:1]));self.assertTrue(all(n==2 for n in incidence.values()))
                    self.assertEqual(len(incidence),len(m['edges']));self.assertEqual(frame['statistics']['sourceEulerCharacteristic'],len(P)-len(source['edges'])+len(source['faces']))
                    for f,F in enumerate(source['faces']):
                        ids=m['faces'][f];self.assertEqual([flags[i][0] for i in ids],F)
                        self.assertTrue(np.allclose(X[ids],(1-t)*P[F]+t*Q[f]));self.assertEqual(m['metadata']['offColors']['faces'][f],source['metadata']['offColors']['faces'][f])
                    offset=len(source['faces'])
                    for v,F in enumerate(plan.dual['faces']):
                        ids=m['faces'][offset+v];self.assertEqual([flags[i][1] for i in ids],F);self.assertTrue(np.allclose(X[ids],(1-t)*P[v]+t*Q[F]))
                    offset+=len(P)
                    for e,(a,b) in enumerate(source['edges']):
                        ids=m['faces'][offset+e];x,y,z,w=X[ids];u=y-x;v=w-x
                        self.assertLess(abs(float(u@v))/(np.linalg.norm(u)*np.linalg.norm(v)),1e-12);self.assertTrue(np.allclose(z,x+u+v))
                        self.assertEqual(frame['sourceMaps']['faces'][offset+e]['sourceElement'],e)
                    self.assertLess(frame['statistics']['maximumNormalizedSheetResidual'],1e-12)
                    self.assertLess(frame['statistics']['maximumBridgeCosineResidual'],1e-12)
                self.assertEqual(source,before)
                complemented=prepare_generalized_expansion({'model':source},complement=True).evaluate('expansion',.5)['model']
                c=complemented['metadata']['offColors']['faces'][-1];self.assertEqual(c['encoding'],'float');self.assertAlmostEqual(c['values'][0],1-30/255);self.assertAlmostEqual(c['values'][3],127/255)

    def test_concave_closed_boundary_source_receipts_and_unresolved_packets_refuse_without_repair(self):
        xy=[(0,0),(3,0),(3,1),(1,1),(1,3),(0,3)];vertices=[[x,y,z] for z in (-1,1) for x,y in xy]
        faces=[list(range(5,-1,-1)),list(range(6,12))]+[[i,(i+1)%6,(i+1)%6+6,i+6] for i in range(6)]
        source=source_attributes(facet({'dimension':3,'embeddingDimension':3,'vertices':vertices,'name':'Concave prism','id':'concave-prism','numeric':{'certified':False}},faces));before=deepcopy(source)
        request={'op':'prepare-dual-morph','model':source,'params':{'settings':SETTING,'sourceContext':CONTEXT}}
        prepared=dispatch_dual_morph(request);self.assertEqual(prepared,dispatch_dual_morph(request))
        frame=dispatch_dual_morph({'op':'evaluate-dual-morph','model':source,'params':{'prepared':prepared,'ratio':.75,'sourceContext':CONTEXT}})
        self.assertEqual([len(frame['model'][k]) for k in ('vertices','edges','faces')],[36,72,38]);self.assertEqual(source,before)
        for what in ('descriptor','notes','colors'):
            p=deepcopy(source);receipt=deepcopy(prepared);context=deepcopy(CONTEXT)
            if what=='descriptor':receipt['descriptor']['expansion']['end'][0][0]+=.1
            if what=='notes':context['notes']='Changed'
            if what=='colors':p['metadata']['offColors']['faces'][0]['values'][3]=126
            with self.assertRaisesRegex(GeometryError,'changed|forged'):dispatch_dual_morph({'op':'evaluate-dual-morph','model':p,'params':{'prepared':receipt,'ratio':.5,'sourceContext':context}})
        plan=prepare_generalized_expansion({'model':source})
        with self.assertRaisesRegex(GeometryError,'near-collapsed|unresolved rank'):plan.evaluate('expansion',1-1e-12)
        with self.assertRaisesRegex(GeometryError,'expansion only'):plan.evaluate('tilting-quads',.5)
        # Deliberately corrupt a detached coefficient packet to exercise the
        # geometric verifier itself, independently of receipt comparison.
        plan._end=plan._end.copy();plan._end[0]+=[.037,.061,.089]
        with self.assertRaisesRegex(GeometryError,'nonplanar|rectangle'):plan.evaluate('expansion',.25)
        with self.assertRaises(GeometryError):prepare_generalized_expansion({'model':source},center=source['vertices'][0])

if __name__=='__main__':unittest.main()
