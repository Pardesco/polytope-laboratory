"""Independent cube formulas, support inequalities and literal source witnesses."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
STAGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(STAGE))
from engine.dual_morph_triangles import prepare_tilting_triangles
from engine.generators import regular
from engine.geometry import GeometryError, identity, validate
from engine.dual_morph_expansion import prepare_dual_morph


def source(key='cube'):
    m = regular(key)
    m['metadata']['coordinateUnits'] = 'mm'
    m['metadata']['literal'] = {'records': [1, .125, 'retain']}
    m['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [50, 100, 150, 127]} for _ in m['faces']]}
    return {'model': m, 'notes': 'Literal source notes.', 'view': {'coordinateUnit': 'mm'}}


class TriangleMath(unittest.TestCase):
    def test_literal_endpoints_detached_coefficients_and_full_source(self):
        s = source(); before = deepcopy(s); p = prepare_tilting_triangles(s, radius=2**.5)
        self.assertEqual(p.evaluate(0)['model'], s['model'])
        self.assertEqual(p.evaluate(1)['model'], p.dual)
        d = p.descriptor(); d['offsets'][0][0] = 100; d['original']['metadata']['literal']['records'].append(9)
        snap = p.source_snapshot; snap['notes'] = 'changed'
        self.assertEqual(p.source_snapshot, before); self.assertEqual(s, before)
        self.assertEqual(len(p.descriptor()['flags']), 48)

    def test_cube_independent_coordinate_families_and_distinct_triangle_topology(self):
        s = source(); p = prepare_tilting_triangles(s, radius=2**.5)
        cube = np.asarray(s['model']['vertices'])
        edge_midpoints = np.asarray([(cube[v] + cube[w]) / 2 for v, w in s['model']['edges']])
        axes = np.vstack((np.eye(3), -np.eye(3)))
        for t in (.125, .25, .5, .75, .875):
            # Independent closed formulas derived from (x,y,z) signed cube
            # families, with no use of descriptor normals or offsets.
            expected = np.vstack((cube * (2/(2+5*t-4*t*t)),
                                  edge_midpoints / (1+2*t*(1-t)),
                                  axes * (2/(2+t-2*t*t))))
            f = p.evaluate(t); m = f['model']; actual = np.asarray(m['vertices'])
            self.assertEqual(tuple(len(m[k]) for k in ('vertices', 'edges', 'faces', 'cells')), (26, 72, 48, 0))
            self.assertTrue(all(len(face) == 3 for face in m['faces']))
            self.assertTrue(all(np.min(np.linalg.norm(actual-x, axis=1)) < 1e-10 for x in expected))
            self.assertTrue(all(np.min(np.linalg.norm(expected-x, axis=1)) < 1e-10 for x in actual))
            self.assertTrue(validate(m)['passed']); self.assertFalse(m['provenance']['convexified'])
            self.assertFalse(f['certified']); self.assertLess(f['maximumPolarityResidual'], 1e-12)
        quad = prepare_dual_morph(s, radius=2**.5).evaluate('tilting-quads', .5)['model']
        self.assertEqual((len(quad['edges']), len(quad['faces'])), (48, 24))
        self.assertFalse(np.allclose(quad['vertices'], p.evaluate(.5)['model']['vertices']))

    def test_independent_cube_omnitruncation_polar_support_and_triangular_incidence(self):
        s = source(); p = prepare_tilting_triangles(s, radius=2**.5); m = s['model']; points = np.asarray(m['vertices'])
        for t in (.2, .5, .8):
            f = p.evaluate(t); triangle_points = np.asarray(f['model']['vertices']); descriptor = p.descriptor()
            for i, (v, e, face) in enumerate(descriptor['flags']):
                a, b = m['edges'][e]
                edge = (points[a]+points[b])/2
                dual = np.mean(points[m['faces'][face]], axis=0)*2
                omnipoint = t*points[v]+2*t*(1-t)*edge+(1-t)*dual
                self.assertLessEqual(float(np.max(triangle_points @ omnipoint)), 2+1e-10)
                np.testing.assert_allclose(triangle_points[f['model']['faces'][i]] @ omnipoint, 2, atol=1e-10, rtol=0)
                owners = f['sourceMaps']['faces'][i]['owners']
                self.assertEqual([(o['sourceRank'], o['sourceElement']) for o in owners], [(0,v), (1,e), (2,face)])

    def test_all_five_platonics_counts_closed_incidence_and_literal_rgba(self):
        for key in ('cube', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'):
            with self.subTest(key=key):
                s = source(key); p = prepare_tilting_triangles(s, radius=2**.5); m = s['model']; f = p.evaluate(.37); out = f['model']
                self.assertEqual(len(out['vertices']), sum(len(m[k]) for k in ('vertices','edges','faces')))
                self.assertEqual(len(out['faces']), 4*len(m['edges']))
                self.assertEqual(len(out['edges']), 6*len(m['edges']))
                self.assertEqual(len(out['vertices'])-len(out['edges'])+len(out['faces']), 2)
                self.assertEqual(out['metadata']['sourceMetadata'], m['metadata'])
                self.assertEqual(out['metadata']['coordinateUnits'], 'mm')
                self.assertTrue(all(c['values'] == [50,100,150,127] for c in out['metadata']['offColors']['faces']))
                for kind in ('vertices','edges','faces','cells'):
                    self.assertEqual(len(f['sourceMaps'][kind]), len(out[kind]))

    def test_translation_scale_covariance_and_absolute_evaluation(self):
        s = source(); p = prepare_tilting_triangles(s, radius=2**.5); shift = np.asarray([2,-3,4]); scale = 7
        shifted = deepcopy(s); m = shifted['model']; m['vertices'] = (np.asarray(m['vertices'])*scale+shift).tolist()
        m['facetEquations'] = [eq[:3]+[eq[3]*scale-float(np.asarray(eq[:3])@shift)] for eq in m['facetEquations']]
        m['fingerprint'] = identity(m); q = prepare_tilting_triangles(shifted, center=shift.tolist(), radius=2**.5*scale)
        for t in (.25,.5,.75):
            a = p.evaluate(t); b = q.evaluate(t)
            np.testing.assert_allclose(b['model']['vertices'], np.asarray(a['model']['vertices'])*scale+shift, atol=1e-10, rtol=0)
            self.assertEqual(a['model']['faces'],b['model']['faces']); self.assertEqual(a['model']['edges'],b['model']['edges'])
        first = p.evaluate(.25); p.evaluate(.75); self.assertEqual(first,p.evaluate(.25))

    def test_dimension_generalized_invalid_values_and_unresolved_slivers_refuse(self):
        with self.assertRaises(GeometryError): prepare_tilting_triangles(source('tesseract'))
        s = source(); generalized = deepcopy(s); generalized['model']['interpretation'] = 'generalized-complex'
        with self.assertRaises(GeometryError): prepare_tilting_triangles(generalized)
        for radius in (False,0,-1,1e200):
            with self.assertRaises(GeometryError): prepare_tilting_triangles(s,radius=radius)
        p = prepare_tilting_triangles(s,radius=2**.5)
        for t in (None,False,'0.5',float('inf'),float('nan')):
            with self.assertRaises(GeometryError): p.evaluate(t)
        for t in (-.1,1.1):
            with self.assertRaises(GeometryError): p.evaluate(t,clamp=False)
        with self.assertRaises(GeometryError): p.evaluate(.5,clamp=1)
        for t in (1e-10,1-1e-10):
            with self.assertRaises(GeometryError): p.evaluate(t)


if __name__ == '__main__': unittest.main()
