from collections import Counter
from copy import deepcopy
from pathlib import Path
import math
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from scipy.spatial import cKDTree

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.incidence_dual_4d import incidence_dual_4d,snapshot_hash
from engine.incidence_dual import incidence_dual
from engine.generators import regular
from engine.operations import dual
from engine.geometry import GeometryError,identity,validate,canonical_cycle
from engine.catalog import load_catalog_model
from engine.recipes import run_recipe,replay_document,branch_recipe
from engine.formats import save_project,load_file
from engine import element_annotations
from engine import server

KINDS=('vertices','edges','faces','cells')
STAR='miratope-grand-hexacosichoron'

def literal_concave_4d_boundary():
    # Independently supplied concave L-prism times an interval: explicit
    # ordered product incidences, no generator/hull/importer construction.
    xy=[(0,0),(3,0),(3,1),(1,1),(1,3),(0,3)]
    p=[[x,y,z] for z in (-1,1) for x,y in xy]
    shell=[list(range(5,-1,-1)),list(range(6,12))]+[[i,(i+1)%6,(i+1)%6+6,i+6] for i in range(6)]
    e=sorted({tuple(sorted((a,b))) for F in shell for a,b in zip(F,F[1:]+F[:1])});lookup={E:i for i,E in enumerate(e)}
    vertices=[v+[w] for w in (-1,1) for v in p];n=len(p)
    edges=[list(E) for E in e]+[[a+n,b+n] for a,b in e]+[[v,v+n] for v in range(n)]
    faces=deepcopy(shell)+[[v+n for v in F] for F in shell]+[[a,b,b+n,a+n] for a,b in e]
    cells=[list(range(len(shell))),list(range(len(shell),2*len(shell)))]+\
        [[f,f+len(shell)]+[2*len(shell)+lookup[tuple(sorted((a,b)))] for a,b in zip(F,F[1:]+F[:1])] for f,F in enumerate(shell)]
    model={'id':'literal-concave-4d','name':'Literal concave L-prism x interval','dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex',
        'vertices':vertices,'edges':edges,'faces':faces,'cells':cells,'numeric':{'mode':'float64-approximate','certified':False},'metadata':{}}
    model['fingerprint']=identity(model);model['validation']=validate(model);assert model['validation']['passed']
    return model

def color_source(p):
    p['metadata'].update(coordinateUnits='mm',historical={'literal':[.125,'retain']},offColors={kind:[{'encoding':'byte','values':[20+i%50,40,80,127]} for i in range(len(p[kind]))] for kind in KINDS})
    return p

class IncidenceDual4DSanity(unittest.TestCase):
    def check_full_dual(self,p,q):
        self.assertEqual([len(q[k]) for k in KINDS],[len(p[k]) for k in reversed(KINDS)])
        C=np.asarray(q['provenance']['parameters']['center']);r2=q['provenance']['parameters']['radius']**2;P=np.asarray(p['vertices']);Q=np.asarray(q['vertices'])
        for c,cell in enumerate(p['cells']):
            ids={v for f in cell for v in p['faces'][f]}
            self.assertTrue(all(abs(float((P[v]-C)@(Q[c]-C))-r2)<1e-7*r2 for v in ids))
            self.assertEqual(set(q['metadata']['incidenceDual']['sourceCellVertexIds'][c]),ids)
        for f,F in enumerate(p['faces']):
            self.assertEqual(set(q['edges'][f]),{c for c,cell in enumerate(p['cells']) if f in cell})
        for e,(a,b) in enumerate(p['edges']):
            sourceFaces={f for f,F in enumerate(p['faces']) if any({a,b}=={x,y} for x,y in zip(F,F[1:]+F[:1]))}
            actualCycle=q['faces'][e]
            self.assertEqual({tuple(sorted((x,y))) for x,y in zip(actualCycle,actualCycle[1:]+actualCycle[:1])},{tuple(sorted(q['edges'][f])) for f in sourceFaces})
        for v in range(len(P)):self.assertEqual(set(q['cells'][v]),{e for e,E in enumerate(p['edges']) if v in E})
        for r,kind in enumerate(KINDS):
            for i,record in enumerate(q['metadata']['elementSourceMaps'][kind]):
                self.assertEqual(record['sourceRank'],3-r);self.assertEqual(record['sourceElement'],i)
                self.assertEqual(q['metadata']['offColors'][kind][i],p['metadata']['offColors'][KINDS[3-r]][i])
        self.assertLess(q['provenance']['maximumPolarityResidual'],1e-7)
        back=incidence_dual_4d(q,center=C.tolist(),radius=math.sqrt(r2))
        self.assertTrue(np.allclose(back['vertices'],p['vertices'],atol=1e-7))
        self.assertEqual({tuple(sorted(E)) for E in back['edges']},{tuple(sorted(E)) for E in p['edges']})
        self.assertEqual([canonical_cycle(F) for F in back['faces']],[canonical_cycle(F) for F in p['faces']])
        self.assertEqual([set(c) for c in back['cells']],[set(c) for c in p['cells']])

    def test_convex_5_cell_tesseract_metrics_and_literal_nonconvex_product_and_regular_star(self):
        examples=[color_source(regular('simplex4')),color_source(regular('tesseract')),color_source(literal_concave_4d_boundary()),color_source(load_catalog_model(STAR))]
        references=[dual(p) for p in examples[:2]]
        for i,p in enumerate(examples):
            with self.subTest(name=p['name']),patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
                before=deepcopy(p);q=incidence_dual(p);self.check_full_dual(p,q);self.assertEqual(p,before)
                self.assertEqual(q['provenance']['sourceSnapshotSha256'],snapshot_hash(p));self.assertFalse(q['provenance']['convexified'])
                if i<2:
                    distances=cKDTree(np.asarray(references[i]['vertices'])).query(q['vertices'])[0];self.assertLess(float(max(distances)),1e-7)
        star=incidence_dual_4d(examples[-1]);self.assertEqual([len(star[k]) for k in KINDS],[600,1200,720,120])
        # An actual polar face is a pentagram: intrinsic-plane winding two,
        # retaining its supplied edge-link order rather than its pentagon hull.
        points=np.asarray(star['vertices'])[star['faces'][0]];center=points.mean(axis=0);_,_,vt=np.linalg.svd(points-center,full_matrices=False);xy=(points-center)@vt[:2].T
        turn=sum(math.atan2(float(a[0]*b[1]-a[1]*b[0]),float(a@b)) for a,b in zip(xy,np.roll(xy,-1,axis=0)))
        self.assertAlmostEqual(abs(turn),4*math.pi,places=7)

    def test_native_recipe_history_save_open_units_notes_and_detached_source_annotations(self):
        source=color_source(literal_concave_4d_boundary());annotations=element_annotations.new_document(source);annotations=element_annotations.set_text(annotations,source,'cell',0,'Original cap label')
        sourceState={'model':source,'view':{'coordinateUnit':'cm','angles':[0]*6,'derivedMode':'section','elementAnnotations':annotations},'notes':'Original source notes'}
        document={'id':'source-doc','cursor':0,'states':[sourceState]};before=deepcopy(document)
        built=run_recipe(document,'incidence-dual',{'center':[1.25,1.25,0,0],'radius':2},server.dispatch,'4D incidence dual')
        self.assertEqual(document,before);self.assertEqual(built['cursor'],1);state=built['states'][1]
        self.assertEqual(state['notes'],sourceState['notes']);self.assertEqual(state['view']['coordinateUnit'],'cm');self.assertEqual(state['view']['derivedMode'],'incidence-dual')
        self.assertEqual(state['view']['elementAnnotations']['entries'],[]);archive=state['view']['elementContentDetached'][-1]
        self.assertEqual(archive['document']['entries'],annotations['entries']);self.assertEqual(archive['sourceNotes'],sourceState['notes']);self.assertEqual(archive['sourceCoordinateUnit'],'cm')
        replay=replay_document(built,server.dispatch);self.assertEqual(replay['states'][0]['model'],state['model'])
        changed=deepcopy(built);changed['operationHistory']['nodes'][-1]['sourceSnapshotHash']='f'*64
        with self.assertRaises(GeometryError):replay_document(changed,server.dispatch)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'literal-4d-dual.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[built]});opened=load_file(path)['project']['documents'][0]
        self.assertEqual(opened['states'][1]['model'],state['model']);self.assertEqual(opened['states'][1]['view']['elementContentDetached'],state['view']['elementContentDetached'])
        self.assertEqual(replay_document(opened,server.dispatch)['states'][0]['model'],state['model'])

    def test_center_plane_open_nonplanar_duplicate_reciprocal_and_wrong_source_refusals(self):
        source=literal_concave_4d_boundary();before=deepcopy(source)
        C=[sum(source['vertices'][v][k] for v in {v for f in source['cells'][0] for v in source['faces'][f]})/12 for k in range(4)]
        with self.assertRaisesRegex(GeometryError,'center|singular'):incidence_dual_4d(source,center=C)
        for field,value in [('radius',True),('radius',float('inf')),('center',[0,0,0]),('center',[False,0,0,0])]:
            with self.assertRaises(GeometryError):incidence_dual_4d(source,**{field:value})
        opened=deepcopy(source);opened['cells'].pop();opened['fingerprint']=identity(opened)
        with self.assertRaisesRegex(GeometryError,'two distinct cells|open'):incidence_dual_4d(opened)
        nonplanar=deepcopy(source);nonplanar['vertices'][0][3]+=.017;nonplanar['fingerprint']=identity(nonplanar)
        with self.assertRaisesRegex(GeometryError,'validation|nonplanar|rank'):incidence_dual_4d(nonplanar)
        stale=deepcopy(source);stale['vertices'][0][0]+=.01
        with self.assertRaises(GeometryError):incidence_dual_4d(stale)
        # Two disjoint literal tesseract shells occupying the same coordinates
        # remain separate identities, and their coincident polar cell planes
        # must be refused rather than merged into one shell.
        t=regular('tesseract');duplicate=deepcopy(t);n=len(t['vertices']);f=len(t['faces'])
        duplicate['interpretation']='generalized-complex';duplicate['vertices']+=deepcopy(t['vertices']);duplicate['edges']+=[[v+n for v in E] for E in t['edges']];duplicate['faces']+=[[v+n for v in F] for F in t['faces']];duplicate['cells']+=[[x+f for x in C] for C in t['cells']];duplicate.pop('facetEquations',None);duplicate['fingerprint']=identity(duplicate)
        with self.assertRaisesRegex(GeometryError,'coincident|unresolved reciprocal'):incidence_dual_4d(duplicate)
        self.assertEqual(source,before)

if __name__=='__main__':unittest.main()
