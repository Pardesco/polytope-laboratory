"""Independent analytic and reciprocal witnesses against the complete engine."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

import numpy as np

STAGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STAGE))
from engine.dual_morph_augmentation import prepare_augmentation
from engine.generators import regular
from engine.geometry import GeometryError, identity, validate
from engine.dual_morph_truncation import prepare_truncation


def state(key='cube'):
    m = regular(key)
    m['metadata']['coordinateUnits'] = 'mm'
    m['metadata']['literal'] = {'records': [1, .125, 'preserve']}
    m['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [50, 100, 150, 127]} for _ in m['faces']]}
    return {'model': m, 'notes': 'Original literal notes.', 'view': {'coordinateUnit': 'mm'}}


def counts(model):
    return tuple(len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells'))


class AugmentationTests(unittest.TestCase):
    def test_complete_production_package_imports_no_test_engine_adapter(self):
        import engine
        root = STAGE
        self.assertEqual(Path(engine.__file__).resolve(), root/'engine/__init__.py')
        self.assertEqual(list(engine.__path__), [str(root/'engine')])

    def test_literal_endpoints_source_attributes_and_detached_descriptor(self):
        s = state(); before = deepcopy(s); plan = prepare_augmentation(s, radius=2**.5)
        self.assertEqual(plan.evaluate(0)['model'], s['model'])
        self.assertEqual(plan.evaluate(1)['model'], plan.dual)
        self.assertEqual(counts(plan.dual), (6, 12, 8, 0))
        descriptor = plan.descriptor(); descriptor['original']['metadata']['literal']['records'].append(9)
        descriptor['reversedTruncation']['normals'][0][0] = 100
        snapshot = plan.source_snapshot; snapshot['notes'] = 'changed'
        self.assertEqual(s, before); self.assertEqual(plan.source_snapshot, before)
        self.assertEqual(plan.evaluate(0)['model'], before['model'])

    def test_independent_cube_tetrakis_and_rhombic_and_triakis_witnesses(self):
        s = state(); plan = prepare_augmentation(s, radius=2**.5)
        corners = np.asarray(s['model']['vertices'])
        for ratio, corner_scale, apex in ((.25, 1, 4/3), (.5, 1, 2), (.75, .8, 2)):
            frame = plan.evaluate(ratio); model = frame['model']
            self.assertEqual(counts(model), (14, 24 if ratio == .5 else 36, 12 if ratio == .5 else 24, 0))
            expected = np.vstack((corners*corner_scale, np.eye(3)*apex, -np.eye(3)*apex))
            actual = np.asarray(model['vertices'])
            self.assertTrue(all(np.min(np.linalg.norm(actual-p, axis=1)) < 1e-10 for p in expected))
            self.assertTrue(all(np.min(np.linalg.norm(expected-p, axis=1)) < 1e-10 for p in actual))
            self.assertTrue(all(len(f) == (4 if ratio == .5 else 3) for f in model['faces']))
            self.assertTrue(validate(model)['passed'])

    def test_independent_polar_incidence_and_support_inequalities(self):
        for key in ('cube', 'tetrahedron', 'octahedron'):
            s = state(key); plan = prepare_augmentation(s, radius=2**.5)
            truncate = prepare_truncation(s, radius=2**.5)
            for ratio in (.2, .5, .8):
                a = plan.evaluate(ratio); q = truncate.evaluate(1-ratio)['model']
                av = np.asarray(a['model']['vertices']); qv = np.asarray(q['vertices'])
                self.assertLessEqual(float(np.max(qv@av.T)), 2+1e-9)
                for f, face in enumerate(q['faces']):
                    np.testing.assert_allclose(qv[face]@av[f], 2, atol=1e-9, rtol=0)
                self.assertEqual(counts(a['model']), (len(q['faces']), len(q['edges']), len(q['vertices']), 0))
                self.assertLess(a['maximumPolarityResidual'], 1e-9)

    def test_translation_and_positive_scale_covariance(self):
        s = state(); original = prepare_augmentation(s, radius=2**.5)
        center = np.asarray([2, -3, 4]); factor = 7
        shifted = deepcopy(s); shifted['model']['vertices'] = (np.asarray(s['model']['vertices'])*factor+center).tolist()
        shifted['model']['facetEquations'] = [eq[:3]+[eq[3]*factor-float(np.asarray(eq[:3])@center)] for eq in s['model']['facetEquations']]
        shifted['model']['fingerprint'] = identity(shifted['model'])
        transformed = prepare_augmentation(shifted, center=center.tolist(), radius=2**.5*factor)
        for ratio in (.25, .5, .75):
            a = original.evaluate(ratio)['model']; b = transformed.evaluate(ratio)['model']
            np.testing.assert_allclose(b['vertices'], np.asarray(a['vertices'])*factor+center, atol=1e-10, rtol=0)
            self.assertEqual(a['edges'], b['edges']); self.assertEqual(a['faces'], b['faces'])

    def test_owner_maps_retain_source_entities_and_literal_rgba_alpha(self):
        s = state(); plan = prepare_augmentation(s, radius=2**.5)
        for ratio in (.25, .5, .75):
            f = plan.evaluate(ratio)
            for kind in ('vertices', 'edges', 'faces', 'cells'):
                self.assertEqual(len(f['sourceMaps'][kind]), len(f['model'][kind]))
            for owner in f['sourceMaps']['vertices']:
                self.assertTrue(owner['owners'])
                for o in owner['owners']:
                    self.assertIn(o['sourceRank'], (0, 2)); self.assertLess(o['sourceElement'], len(s['model']['vertices' if o['sourceRank'] == 0 else 'faces']))
            self.assertEqual(f['model']['metadata']['sourceMetadata'], s['model']['metadata'])
            self.assertEqual(f['model']['metadata']['coordinateUnits'], 'mm')
            self.assertTrue(any(c and c['values'][3] == 127 for c in f['model']['metadata']['offColors']['faces']))

    def test_refuses_unsupported_dimensions_parameters_and_unresolved_transition(self):
        s = state()
        with self.assertRaises(GeometryError): prepare_augmentation(state('tesseract'))
        for radius in (0, -1, True, 1e200):
            with self.assertRaises(GeometryError): prepare_augmentation(s, radius=radius)
        plan = prepare_augmentation(s, radius=2**.5)
        for value in (True, None, '0.5', float('inf'), float('nan')):
            with self.assertRaises(GeometryError): plan.evaluate(value)
        for value in (-.1, 1.1):
            with self.assertRaises(GeometryError): plan.evaluate(value, clamp=False)
        with self.assertRaisesRegex(GeometryError, 'unresolved'): plan.evaluate(.5-1e-8)
        with self.assertRaises(GeometryError): plan.evaluate(.2, clamp=1)

    def test_absolute_reproducibility_and_approximate_status(self):
        s = state(); before = deepcopy(s); plan = prepare_augmentation(s, radius=2**.5)
        f = plan.evaluate(.25); plan.evaluate(.75)
        self.assertEqual(f, plan.evaluate(.25)); self.assertEqual(s, before)
        self.assertFalse(f['certified']); self.assertFalse(f['model']['numeric']['certified'])
        self.assertFalse(f['model']['provenance']['convexified'])


if __name__ == '__main__':
    unittest.main()
