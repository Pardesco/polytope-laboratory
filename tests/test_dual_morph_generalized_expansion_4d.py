from collections import Counter
from copy import deepcopy
from pathlib import Path
import math,os,runpy,sys,tempfile,unittest
from unittest.mock import patch
import numpy as np
ROOT=Path(os.environ.get('POLYTOPE_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT))
from engine.dual_morph_generalized_expansion_4d import prepare_generalized_expansion_4d
from engine.dual_morph_expansion import prepare_dual_morph
from engine.dual_morph import dispatch_dual_morph
from engine.incidence_dual_4d import incidence_dual_4d
from engine.generators import regular
from engine.catalog import load_catalog_model
from engine.geometry import GeometryError,identity,canonical_cycle
from engine.formats import save_project,load_file
from engine import element_annotations
helper=runpy.run_path(str(ROOT/'tests/test_incidence_dual_4d.py'))
literal=helper['literal_concave_4d_boundary'];color_source=helper['color_source'];KINDS=helper['KINDS'];STAR=helper['STAR']
SETTING={'version':1,'enabled':True,'method':'expansion','center':None,'radius':1.,'ratio':.25,'duration':2.,'loop':False}
CONTEXT={'notes':'Literal source notes','unit':'mm'}

class GeneralizedExpansion4DSanity(unittest.TestCase):
    def verify_frame(self,source,plan,t):
        frame=plan.evaluate('expansion',t);m=frame['model'];desc=plan.descriptor();flags=desc['expansion']['flags'];X=np.asarray(m['vertices']);P=np.asarray(source['vertices']);dual=plan.dual;Q=np.asarray(dual['vertices'])
        self.assertTrue(np.allclose(X,[(1-t)*P[v]+t*Q[c] for v,c in flags]))
        self.assertEqual(set(map(tuple,flags)),{(v,c) for c,C in enumerate(source['cells']) for f in C for v in source['faces'][f]})
        self.assertEqual(sum((-1)**r*len(m[k]) for r,k in enumerate(KINDS)),0)
        faceCells=Counter(f for C in m['cells'] for f in C);self.assertEqual(set(faceCells),set(range(len(m['faces']))));self.assertTrue(all(n==2 for n in faceCells.values()))
        edgeIndex={tuple(sorted(E)):i for i,E in enumerate(m['edges'])}
        for C in m['cells']:
            counts=Counter(edgeIndex[tuple(sorted((a,b)))] for f in C for a,b in zip(m['faces'][f],m['faces'][f][1:]+m['faces'][f][:1]))
            self.assertTrue(all(n==2 for n in counts.values()))
            ids=sorted({v for f in C for v in m['faces'][f]});s=np.linalg.svd(X[ids]-X[ids[0]],compute_uv=False)
            self.assertGreater(s[2],1e-7);self.assertLess(s[3],1e-7)
        types=set()
        for r,kind in enumerate(KINDS[1:],1):
            for i,owner in enumerate(frame['sourceMaps'][kind]):
                a,origin,s=owner['sourceElement'],owner['dualOriginElement'],owner['dualRank'];pr=owner['sourceRank'];self.assertEqual(pr+s,r)
                types.add((r,pr,s))
                expected=source['metadata']['offColors'][KINDS[pr]][a] if pr else dual['metadata']['offColors'][KINDS[s]][origin]
                self.assertEqual(m['metadata']['offColors'][kind][i],expected)
                if r==2:
                    F=m['faces'][i]
                    if pr==2:
                        self.assertEqual([flags[v][0] for v in F],source['faces'][a]);self.assertEqual(owner['sourceSheetFace'],a)
                    elif pr==0:self.assertEqual([flags[v][1] for v in F],dual['faces'][origin]);self.assertIsNone(owner['sourceSheetFace'])
                    else:
                        u=X[F[1]]-X[F[0]];v=X[F[3]]-X[F[0]]
                        self.assertTrue(np.allclose(X[F[2]],X[F[0]]+u+v));self.assertAlmostEqual(float(u@v),0.,places=7);self.assertIsNone(owner['sourceSheetFace'])
        self.assertEqual({(r,pr,s) for r in (1,2,3) for pr in range(r+1) for s in [r-pr]},types)
        self.assertLess(frame['statistics']['maximumNormalizedCellResidual'],1e-8)
        return frame

    def test_independent_5_cell_tesseract_comparison_full_product_cells(self):
        for name in ('simplex4','tesseract'):
            source=color_source(regular(name));before=deepcopy(source)
            with self.subTest(name=name),patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
                plan=prepare_generalized_expansion_4d({'model':source,'notes':CONTEXT['notes'],'view':{'coordinateUnit':'mm'}})
                reference=prepare_dual_morph({'model':source})
                self.assertEqual(plan.evaluate('expansion',0)['model'],source);self.assertEqual(plan.evaluate('expansion',1)['model'],plan.dual)
                for t in (.25,.75):
                    frame=self.verify_frame(source,plan,t);ref=reference.evaluate('expansion',t)['model'];model=frame['model']
                    self.assertTrue(np.allclose(model['vertices'],ref['vertices']))
                    self.assertEqual({tuple(sorted(E)) for E in model['edges']},{tuple(sorted(E)) for E in ref['edges']})
                    self.assertEqual([canonical_cycle(F) for F in model['faces']],[canonical_cycle(F) for F in ref['faces']])
                    self.assertEqual([set(C) for C in model['cells']],[set(C) for C in ref['cells']])
                self.assertEqual(source,before)

    def test_literal_nonconvex_product_regular_4d_star_and_ordered_pentagram_caps(self):
        star=color_source(load_catalog_model(STAR));reverse=color_source(incidence_dual_4d(star))
        sources=[color_source(literal()),star,reverse]
        for source in sources:
            before=deepcopy(source)
            with self.subTest(name=source['name']),patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
                plan=prepare_generalized_expansion_4d({'model':source});frame=self.verify_frame(source,plan,.25)
                self.assertEqual(plan.evaluate('expansion',0)['model'],source);self.assertEqual(plan.evaluate('expansion',1)['model'],plan.dual);self.assertEqual(source,before)
                if source['id'] in (star['id'],reverse['id']):
                    self.assertEqual([len(frame['model'][k]) for k in KINDS],[2400,7200,7440,2640])
                    index=next(i for i,o in enumerate(frame['sourceMaps']['faces']) if (o['sourceRank']==0 and o['dualOriginElement']==0 if source['id']==star['id'] else o['sourceRank']==2 and o['sourceElement']==0))
                    points=np.asarray(frame['model']['vertices'])[frame['model']['faces'][index]];points-=points.mean(axis=0);_,_,vt=np.linalg.svd(points,full_matrices=False);xy=points@vt[:2].T
                    turn=sum(math.atan2(float(a[0]*b[1]-a[1]*b[0]),float(a@b)) for a,b in zip(xy,np.roll(xy,-1,axis=0)))
                    self.assertAlmostEqual(abs(turn),4*math.pi,places=7)

    def test_actual_native_receipts_context_refusals_save_open_and_atomic_bad_packets(self):
        source=color_source(literal());before=deepcopy(source)
        req={'op':'prepare-dual-morph','model':source,'params':{'settings':SETTING,'sourceContext':CONTEXT}}
        prepared=dispatch_dual_morph(req);self.assertEqual(prepared['descriptor']['dimension'],4)
        evaluate={'op':'evaluate-dual-morph','model':source,'params':{'prepared':prepared,'ratio':.75,'sourceContext':CONTEXT}}
        frame=dispatch_dual_morph(evaluate);self.assertTrue(frame['statistics']['closedLiteralCellShells'])
        for mutation in ('color','context','descriptor'):
            changed=deepcopy(evaluate)
            if mutation=='color':changed['model']['metadata']['offColors']['faces'][0]['values'][3]=126
            elif mutation=='context':changed['params']['sourceContext']['notes']='changed'
            else:changed['params']['prepared']['descriptor']['expansion']['end'][0][0]+=.01
            with self.assertRaisesRegex(GeometryError,'changed|forged'):dispatch_dual_morph(changed)
        evaluate['params']['ratio']=1-1e-12
        with self.assertRaisesRegex(GeometryError,'near-collapsed|unresolved'):dispatch_dual_morph(evaluate)
        plan=prepare_generalized_expansion_4d({'model':source});plan._end[0,0]+=.17
        with self.assertRaisesRegex(GeometryError,'nonplanar|rectangle|unresolved'):plan.evaluate('expansion',.5)
        settings=deepcopy(SETTING);doc=element_annotations.new_document(source)
        for kind in ('vertex','edge','face','cell'):doc=element_annotations.set_text(doc,source,kind,0,kind+' owner')
        state={'model':source,'view':{'coordinateUnit':'mm','elementAnnotations':doc,'dualMorph':settings},'notes':CONTEXT['notes']}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'source','cursor':0,'states':[state]}]}
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'4d-expansion.polyproj';save_project(path,project);opened=load_file(path)['project']['documents'][0]['states'][0]
        self.assertEqual(opened['model'],source);self.assertEqual(opened['view']['dualMorph'],settings);self.assertEqual(opened['view']['elementAnnotations'],doc);self.assertEqual(opened['notes'],CONTEXT['notes'])
        c0={v for f in source['cells'][0] for v in source['faces'][f]};C=np.asarray(source['vertices'])[sorted(c0)].mean(axis=0).tolist()
        with self.assertRaisesRegex(GeometryError,'center|singular'):prepare_generalized_expansion_4d({'model':source},center=C)
        openedSource=deepcopy(source);openedSource['cells'].pop();openedSource['fingerprint']=identity(openedSource)
        with self.assertRaises(GeometryError):prepare_generalized_expansion_4d({'model':openedSource})
        self.assertEqual(source,before)

if __name__=='__main__':unittest.main()
