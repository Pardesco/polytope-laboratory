from copy import deepcopy
from pathlib import Path
import math
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.generators import regular
from engine.dual_morph_generalized_sizing import prepare_generalized_sizing
from engine.dual_morph import dispatch_dual_morph
from engine.geometry import GeometryError,identity
from engine.formats import save_project,load_file
from engine.faceting import facet

STARS={'small-stellated-dodecahedron':'great-dodecahedron','great-dodecahedron':'small-stellated-dodecahedron',
       'great-stellated-dodecahedron':'great-icosahedron','great-icosahedron':'great-stellated-dodecahedron'}
KINDS=('vertices','edges','faces')
SETTING={'version':1,'enabled':True,'method':'sizing','center':None,'radius':1.,'ratio':.25,'duration':2.,'loop':False}
CONTEXT={'notes':'Literal star notes','unit':'mm'}

def attributes(p):
    p['metadata'].update(coordinateUnits='mm',historical={'literal':[.125,'retain']},offColors={kind:[{'encoding':'byte','values':[20+i%50,40,80,127]} for i in range(len(p[kind]))] for kind in KINDS})
    return p

def prepare(p):return dispatch_dual_morph({'op':'prepare-dual-morph','model':p,'params':{'settings':SETTING,'sourceContext':CONTEXT}})
def evaluate(p,prepared,t):return dispatch_dual_morph({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':t,'sourceContext':CONTEXT}})

class GeneralizedSizingSanity(unittest.TestCase):
    def test_four_regular_stars_literal_links_homothety_and_independent_dual_orbits(self):
        for name,dualName in STARS.items():
            source=attributes(regular(name));reference=regular(dualName)
            with self.subTest(source=name),patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
                before=deepcopy(source);plan=prepare_generalized_sizing({'model':source,'notes':CONTEXT['notes'],'view':{'coordinateUnit':'mm'}})
                dual=plan.dual
                self.assertEqual([len(dual[k]) for k in KINDS],[len(reference[k]) for k in KINDS])
                # Independent analytic references need not have the same ID/order.
                # Compare their scale-free vertex distance orbit, not guessed maps.
                A=np.asarray(dual['vertices']);B=np.asarray(reference['vertices'])
                A=(A-A.mean(axis=0))/np.linalg.norm(A-A.mean(axis=0),axis=1).mean();B=(B-B.mean(axis=0))/np.linalg.norm(B-B.mean(axis=0),axis=1).mean()
                self.assertTrue(np.allclose(np.sort(np.linalg.norm(A[:,None]-A[None,:],axis=2).ravel()),np.sort(np.linalg.norm(B[:,None]-B[None,:],axis=2).ravel()),atol=1e-8))
                for e,(a,b) in enumerate(source['edges']):
                    incident=[f for f,F in enumerate(source['faces']) if any({a,b}=={u,v} for u,v in zip(F,F[1:]+F[:1]))]
                    self.assertEqual(set(dual['edges'][e]),set(incident));self.assertEqual(len(incident),2)
                    self.assertEqual(dual['metadata']['offColors']['edges'][e],source['metadata']['offColors']['edges'][e])
                for v,F in enumerate(dual['faces']):
                    self.assertEqual(set(F),{f for f,S in enumerate(source['faces']) if v in S})
                    for a,b in zip(F,F[1:]+F[:1]):self.assertTrue(any(v in source['edges'][e] and {a,b}==set(E) for e,E in enumerate(dual['edges'])))
                center=np.asarray(plan.descriptor()['center'])
                frame=plan.evaluate(.25);P=np.asarray(source['vertices']);Q=np.asarray(dual['vertices']);V=np.asarray(frame['model']['vertices'])
                self.assertTrue(np.allclose(V[:len(P)],center+.75*(P-center)));self.assertTrue(np.allclose(V[len(P):],center+.25*(Q-center)))
                self.assertEqual(frame['model']['faces'][:len(source['faces'])],source['faces'])
                self.assertEqual(plan.evaluate(0)['model'],source);self.assertEqual(plan.evaluate(1)['model'],dual)
                self.assertLess(frame['maximumPolarityResidual'],1e-7);self.assertEqual(source,before)
                roundtrip=prepare_generalized_sizing({'model':dual},center=plan.descriptor()['center']).dual
                self.assertTrue(np.allclose(roundtrip['vertices'],P))
                # Source and reciprocal keep the original face-cycle winding,
                # including genus four and pentagrams; Euler is not forced to 2.
                self.assertEqual(len(dual['vertices'])-len(dual['edges'])+len(dual['faces']),len(source['vertices'])-len(source['edges'])+len(source['faces']))

    def test_concave_closed_prism_dispatch_source_guards_and_save_open(self):
        xy=[(0,0),(3,0),(3,1),(1,1),(1,3),(0,3)];vertices=[[x,y,z] for z in (-1,1) for x,y in xy]
        faces=[list(range(5,-1,-1)),list(range(6,12))]+[[i,(i+1)%6,(i+1)%6+6,i+6] for i in range(6)]
        source=attributes(facet({'dimension':3,'embeddingDimension':3,'vertices':vertices,'name':'Concave prism','id':'concave-prism','numeric':{'certified':False}},faces));before=deepcopy(source)
        prepared=prepare(source);self.assertEqual(prepared,prepare(source));frame=evaluate(source,prepared,.75)
        self.assertEqual([len(frame['model'][k]) for k in KINDS],[20,36,20]);self.assertEqual(source,before)
        for field in ('notes','unit'):
            changed={**CONTEXT,field:'Changed' if field=='notes' else 'cm'}
            with self.assertRaisesRegex(GeometryError,'changed|forged'):dispatch_dual_morph({'op':'evaluate-dual-morph','model':source,'params':{'prepared':prepared,'ratio':.5,'sourceContext':changed}})
        forged=deepcopy(prepared);forged['descriptor']['radius']=2
        with self.assertRaisesRegex(GeometryError,'changed|forged'):evaluate(source,forged,.5)
        changed=deepcopy(source);changed['metadata']['offColors']['faces'][0]['values'][3]=126
        with self.assertRaisesRegex(GeometryError,'changed|forged'):evaluate(changed,prepared,.5)
        view={'coordinateUnit':'mm','dualMorph':{**SETTING,'ratio':.75}}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'literal-doc','cursor':0,'states':[{'model':source,'view':view,'notes':CONTEXT['notes']}]}]}
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'generalized.p4d';save_project(file,project);opened=load_file(file)['project']['documents'][0]['states'][0]
        self.assertEqual(opened['model'],source);self.assertEqual(opened['notes'],CONTEXT['notes']);self.assertEqual(opened['view']['dualMorph']['method'],'sizing')

    def test_open_nonplanar_infinite_and_unresolved_reciprocals_are_not_repaired(self):
        source=regular('small-stellated-dodecahedron')
        openSource=deepcopy(source);openSource['faces'].pop();openSource['fingerprint']=identity(openSource)
        with self.assertRaisesRegex(GeometryError,'two distinct face|open'):prepare_generalized_sizing({'model':openSource})
        malformed=deepcopy(source);malformed['vertices'][malformed['faces'][0][0]][0]+=.013;malformed['fingerprint']=identity(malformed)
        with self.assertRaisesRegex(GeometryError,'incidence|planarity'):prepare_generalized_sizing({'model':malformed})
        center=np.asarray(source['vertices'])[source['faces'][0]].mean(axis=0).tolist()
        with self.assertRaisesRegex(GeometryError,'singular|center'):prepare_generalized_sizing({'model':source},center=center)
        flat=facet({'dimension':3,'embeddingDimension':3,'vertices':[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],'name':'double sheet','id':'flat','numeric':{}},[[0,1,2],[0,2,3],[2,1,0],[3,2,0]])
        with self.assertRaisesRegex(GeometryError,'affine span'):prepare_generalized_sizing({'model':flat})
        # A split source face creates coincident reciprocal identities: refuse.
        cube=regular('cube');split=deepcopy(cube);F=split['faces'].pop(0);split['faces'][:0]=[[F[0],F[1],F[2]],[F[0],F[2],F[3]]];split=facet(cube,split['faces'])
        with self.assertRaisesRegex(GeometryError,'Coincident|collapse'):prepare_generalized_sizing({'model':split})
        with self.assertRaises(GeometryError):prepare_generalized_sizing({'model':source},radius=True)

if __name__=='__main__':unittest.main()
