from copy import deepcopy
from pathlib import Path
import sys
import unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.dual_morph_compound import prepare_tilting_compound
from engine.generators import regular
from engine.geometry import GeometryError


def state():
    m=regular('cube');m['metadata']['coordinateUnits']='mm';m['metadata']['literal']={'records':[.125,'preserve']};m['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]} for _ in m['faces']]}
    return {'model':m,'notes':'Exact source notes.','view':{'coordinateUnit':'mm'}}


class CompoundSanity(unittest.TestCase):
    def test_literal_source_dual_and_actual_midpoint_compound_with_colors_and_owners(self):
        s=state();before=deepcopy(s);p=prepare_tilting_compound(s,radius=2**.5)
        self.assertEqual(p.evaluate(0)['model'],s['model']);self.assertEqual(p.evaluate(1)['model'],p.dual)
        f=p.evaluate(.5);m=f['model'];self.assertEqual(tuple(len(m[k]) for k in ('vertices','edges','faces')), (14,24,14))
        np.testing.assert_allclose(m['vertices'][:8],s['model']['vertices'],atol=1e-12,rtol=0)
        np.testing.assert_allclose(m['vertices'][8:],p.dual['vertices'],atol=1e-12,rtol=0)
        self.assertEqual(m['faces'][:6],s['model']['faces']);self.assertTrue(all(c['values']==[50,100,150,127] for c in m['metadata']['offColors']['faces'][:6]))
        for t in (.25,.5,.75):
            frame=p.evaluate(t)
            for kind in ('vertices','edges','faces','cells'):self.assertEqual(len(frame['sourceMaps'][kind]),len(frame['model'][kind]))
            self.assertFalse(frame['certified']);self.assertFalse(frame['model']['provenance']['convexified'])
        self.assertEqual(s,before);self.assertEqual(p.source_snapshot,before)

    def test_independent_emerging_triangle_coordinates_and_changing_plane_normal(self):
        s=state();p=prepare_tilting_compound(s,radius=2**.5);q=p.dual;face=q['faces'][0];v,w=face[:2];e=q['edges'].index([v,w]) if [v,w] in q['edges'] else q['edges'].index([w,v]);a,b=s['model']['edges'][e]
        start=np.asarray([s['model']['vertices'][a],s['model']['vertices'][b],(np.asarray(s['model']['vertices'][a])+s['model']['vertices'][b])/2]);end=np.asarray([q['vertices'][v],q['vertices'][w],np.mean(np.asarray(q['vertices'])[face],axis=0)])
        points=np.asarray(p.evaluate(.25)['model']['vertices'])[8:11];np.testing.assert_allclose(points,(start+end)/2,atol=1e-12,rtol=0)
        normals=[]
        for t in (.125,.375):
            triangle=np.asarray(p.evaluate(t)['model']['vertices'])[8:11];normal=np.cross(triangle[1]-triangle[0],triangle[2]-triangle[0]);normals.append(normal/np.linalg.norm(normal))
        self.assertLess(abs(float(normals[0]@normals[1])),.999)
        self.assertEqual(p.evaluate(.25),p.evaluate(.25))

    def test_invalid_and_unimplemented_parameters_preserve_source(self):
        s=state();p=prepare_tilting_compound(s,radius=2**.5)
        with self.assertRaises(GeometryError):prepare_tilting_compound({'model':regular('tesseract')})
        for t in (True,None,'0.5',float('inf')):
            with self.assertRaises(GeometryError):p.evaluate(t)
        with self.assertRaises(GeometryError):p.evaluate(-.1,clamp=False)
        d=p.descriptor();d['faceFans']['dual'][0]['end'][0][0]=100;self.assertNotEqual(d,p.descriptor())


if __name__=='__main__':unittest.main()
