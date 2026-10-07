from copy import deepcopy
from pathlib import Path
import sys,unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.dual_morph_rectify import prepare_tilting_rectify
from engine.generators import regular
from engine.geometry import GeometryError


def state():
    m=regular('cube');m['metadata']['coordinateUnits']='mm';m['metadata']['literal']={'records':[.125,'retain']};m['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]} for _ in m['faces']]}
    return {'model':m,'notes':'Exact source notes.','view':{'coordinateUnit':'mm'}}


class RectifySanity(unittest.TestCase):
    def test_independent_cube_midpoint_and_quarter_polygon_rotations_and_tilted_fans(self):
        s=state();p=prepare_tilting_rectify(s,radius=2**.5);m=p.evaluate(.5)['model'];vertices=np.asarray(s['model']['vertices'])
        expected=np.asarray([(vertices[a]+vertices[b])/2 for a,b in s['model']['edges']]);np.testing.assert_allclose(m['vertices'],expected,atol=1e-12,rtol=0)
        self.assertEqual(tuple(len(m[k]) for k in ('vertices','edges','faces')), (12,24,14));self.assertEqual(sorted(map(len,m['faces'])),[3]*8+[4]*6)
        face=s['model']['faces'][0];quarter=p.evaluate(.25)['model'];corner=[]
        for i,v in enumerate(face):corner.append(vertices[v]*.5+(vertices[v]+vertices[face[(i+1)%len(face)]])*.25)
        np.testing.assert_allclose(quarter['vertices'][:4],corner,atol=1e-12,rtol=0)
        normals=[]
        for t in (.125,.375):
            # Six independently rotating source quadrilaterals precede new fans.
            triangle=np.asarray(p.evaluate(t)['model']['vertices'])[24:27];normal=np.cross(triangle[1]-triangle[0],triangle[2]-triangle[0]);normals.append(normal/np.linalg.norm(normal))
        self.assertLess(abs(float(normals[0]@normals[1])),.999)

    def test_source_context_colors_owners_endpoints_and_invalid_inputs(self):
        s=state();before=deepcopy(s);p=prepare_tilting_rectify(s,radius=2**.5)
        self.assertEqual(p.evaluate(0)['model'],s['model']);self.assertEqual(p.evaluate(1)['model'],p.dual)
        for t in (.25,.5,.75):
            f=p.evaluate(t)
            self.assertEqual(f['model']['metadata']['sourceMetadata'],s['model']['metadata']);self.assertEqual(f['model']['metadata']['coordinateUnits'],'mm')
            self.assertTrue(all(c['values']==[50,100,150,127] for c in f['model']['metadata']['offColors']['faces']))
            for kind in ('vertices','edges','faces','cells'):self.assertEqual(len(f['sourceMaps'][kind]),len(f['model'][kind]))
            self.assertFalse(f['certified']);self.assertFalse(f['model']['provenance']['convexified'])
        first=p.evaluate(.25);p.evaluate(.75);self.assertEqual(first,p.evaluate(.25));self.assertEqual(s,before)
        with self.assertRaises(GeometryError):prepare_tilting_rectify({'model':regular('tesseract')})
        for t in (None,True,'0.5',float('inf')):
            with self.assertRaises(GeometryError):p.evaluate(t)
        with self.assertRaises(GeometryError):p.evaluate(-.1,clamp=False)
        d=p.descriptor();d['rectified']['vertices'][0][0]=100;self.assertNotEqual(d,p.descriptor())


if __name__=='__main__':unittest.main()
