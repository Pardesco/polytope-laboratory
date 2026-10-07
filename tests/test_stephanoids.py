from copy import deepcopy
import json
import math
from pathlib import Path
import unittest
import numpy as np
from engine.stephanoids import stephanoid
from engine.geometry import GeometryError,canonical_cycle
from engine.generators import generate
from engine.formats import validate_project
from engine.incidence_dual import incidence_dual
from engine.compounds import extract_component,remove_component
from engine.recipes import run_recipe,replay_document
from engine.server import dispatch


class StephanoidTest(unittest.TestCase):
    def test_pinned_upstream_source_coordinates_and_every_ordered_cycle(self):
        data=json.loads((Path(__file__).parent/'fixtures/stephanoid-antiprism-reference.json').read_text())
        for fixture in data['fixtures']:
            with self.subTest(parameters=fixture['parameters']):
                model=stephanoid(**fixture['parameters'])
                np.testing.assert_allclose(model['vertices'],fixture['vertices'],rtol=0,atol=2e-15)
                self.assertEqual([canonical_cycle(f) for f in model['faces']],[canonical_cycle(f) for f in fixture['faces']])
                self.assertEqual(model['interpretation'],'generalized-complex')

    def test_uniform_vertex_hull_edges_and_independent_self_dual_reciprocal_metric(self):
        from scipy.spatial import ConvexHull
        for n,a,b in [(7,1,3),(7,1,4),(4,1,2)]:
            hull_model=stephanoid(n,a,b);p=np.asarray(hull_model['vertices']);hull=ConvexHull(p)
            # Read-only independent hull: reject triangulation diagonals shared
            # by coplanar simplices. Never replace source bow-tie incidence.
            used={}
            for i,face in enumerate(hull.simplices):
                for j in range(3):used.setdefault(tuple(sorted((int(face[j]),int(face[(j+1)%3])))),[]).append(i)
            lengths=[np.linalg.norm(p[u]-p[v]) for (u,v),fs in used.items() if len(fs)==2 and not np.allclose(hull.equations[fs[0]][:3],hull.equations[fs[1]][:3],atol=1e-9)]
            np.testing.assert_allclose(lengths,2*math.sin(math.pi/n),rtol=1e-12)
            source=stephanoid(n,a,b,mode='self-dual');dual=incidence_dual(source,center=[0,0,0],radius=1);evidence=source['metadata']['stephanoid']['selfDualEvidence']
            mapping=evidence['dualVertexToSourceVertex'];q=np.asarray(dual['vertices'])*evidence['reciprocalScale'];s=np.asarray(source['vertices'])[mapping]
            np.testing.assert_allclose(np.linalg.norm(q[:,None]-q[None,:],axis=2),np.linalg.norm(s[:,None]-s[None,:],axis=2),atol=1e-12)
            self.assertEqual({canonical_cycle([mapping[v] for v in f]) for f in dual['faces']},{canonical_cycle(f) for f in source['faces']})
        self.assertGreater(stephanoid(mode='self-dual')['metadata']['stephanoid']['resolvedTotalHeight'],stephanoid()['metadata']['stephanoid']['resolvedTotalHeight'])

    def test_compound_leaf_ownership_native_roundtrip_and_history(self):
        source=generate('stephanoid',n=12,a=3,b=6,mode='self-dual');before=deepcopy(source)
        self.assertEqual(len(source['components']),3)
        for component in source['components']:
            leaf=extract_component(source,component['id']);self.assertEqual((len(leaf['vertices']),len(leaf['edges']),len(leaf['faces'])),(8,16,8))
        retained=remove_component(source,source['components'][1]['id']);self.assertEqual(len(retained['vertices']),16)
        document={'id':'source-stephanoid','cursor':0,'states':[{'model':source,'view':{},'notes':'Crown source notes'}]}
        result=run_recipe(document,'incidence-dual',{'center':[0,0,0],'radius':1},dispatch);replayed=replay_document(result,dispatch)
        self.assertEqual(replayed['states'][replayed['cursor']]['model']['faces'],result['states'][result['cursor']]['model']['faces'])
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[result]}
        restored=validate_project(json.loads(json.dumps(project)))
        self.assertEqual(restored['documents'][0]['states'][0]['model']['metadata']['stephanoid'],before['metadata']['stephanoid']);self.assertEqual(source,before)

    def test_bounded_domain_and_generator_parameters_refuse(self):
        for parameters in [{'n':True},{'n':129},{'a':2,'b':2},{'a':3,'b':4},{'radius':float('nan')},{'height':2},{'mode':'height'},{'mode':'height','height':0}]:
            with self.subTest(parameters=parameters),self.assertRaises(GeometryError):stephanoid(**parameters)
        with self.assertRaises(GeometryError):generate('stephanoid',invented=1)
        self.assertEqual(len(stephanoid(n=128,a=1,b=2)['faces']),256)


if __name__=='__main__':unittest.main()
