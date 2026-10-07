"""Actual specialist construction/history ownership; no GUI claims."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.generators import regular
from engine.server import dispatch
from engine.geometry import GeometryError
from engine.element_content_workflow import semantic
from engine.element_content_ownership import transfer_content_state, correspondence


def recipe(document, operation, parameters):
    return dispatch({'op': 'recipe-run', 'params': {
        'document': document, 'operation': operation, 'parameters': parameters}})


def annotated(key='cube'):
    model = regular(key)
    model['metadata']['coordinateUnits'] = 'cm'
    model['faceColors'] = [[.2, .4, .6, .25] for _ in model['faces']]
    document = {'id': 'specialist-content', 'cursor': 0, 'states': [{
        'model': model, 'view': {'coordinateUnit': 'cm', 'angles': [0]*6},
        'notes': 'Full original notes π'}]}
    return recipe(document, 'element-content', {'action': 'text',
        'kind': 'face', 'index': 0, 'markup': '<b>Owned</b>'})


class SpecialistContentTests(unittest.TestCase):
    def cases(self):
        cube = regular('cube')
        cube['metadata']['coordinateUnits'] = 'cm'
        yield 'convex-core', annotated(), {'center': [0, 0, 0]}, False
        yield 'convex-core-4d', annotated('tesseract'), {'center': [0]*4}, False
        yield 'cell', annotated('tesseract'), {'index': 0}, False
        yield 'triangular-geodesic', annotated('icosahedron'), {'frequency': 1}, False
        yield 'source-zonohedron', annotated(), {'selections': [{'kind': 'world-axes', 'ids': [0, 1, 2]}]}, False
        yield 'attach-at-faces', annotated(), {'addition': cube, 'base_face_id': 1, 'addition_face_id': 0, 'cycle_offset': 0, 'scale': 1}, False
        yield 'place-at-faces', annotated(), {'addition': cube, 'face_ids': [1], 'addition_face_id': 0}, False
        yield 'spring-relaxation', annotated('tetrahedron'), {}, True
        source = annotated('tetrahedron')
        search = dispatch({'op': 'facet-search', 'model': source['states'][-1]['model'], 'params': {}})
        yield 'facet-adopt', source, {'search': search, 'result_id': search['results'][0]['id']}, True

    def test_all_specialist_results_and_replay_bind_content_to_actual_parent(self):
        for operation, source, params, mapped in self.cases():
            with self.subTest(operation=operation):
                before = deepcopy(source)
                result = recipe(source, operation, params)
                self.assertEqual(source, before)
                current = result['states'][-1]
                self.assertEqual(current['view']['elementAnnotations']['source'], current['model'])
                if mapped:
                    self.assertEqual(current['view']['elementAnnotations']['entries'][0]['text']['markup'], '<b>Owned</b>')
                else:
                    self.assertEqual(current['view']['elementAnnotations']['entries'], [])
                    archive = current['view']['elementContentDetached'][-1]
                    self.assertEqual(archive['document'], before['states'][-1]['view']['elementAnnotations'])
                    self.assertEqual(archive['sourceNotes'], 'Full original notes π')
                    self.assertEqual(archive['sourceCoordinateUnit'], 'cm')
                replay = dispatch({'op': 'recipe-replay', 'params': {'document': result}})
                for field in ('elementAnnotations', 'elementContentDetached', 'elementContentTransfer'):
                    self.assertEqual(semantic(replay['states'][0]['view'].get(field)), semantic(current['view'].get(field)))
                forged = deepcopy(result)
                if mapped:
                    for state in (forged['states'][-1], forged['operationHistory']['nodes'][-1]['snapshot']):
                        state['view']['elementAnnotations']['entries'][0]['text']['markup'] = 'Forged cached content'
                else:
                    for state in (forged['states'][-1], forged['operationHistory']['nodes'][-1]['snapshot']):
                        state['view']['elementContentDetached'][-1]['sourceNotes'] = 'Forged cached notes'
                with self.assertRaises(GeometryError):
                    dispatch({'op': 'recipe-replay', 'params': {'document': forged}})

    def test_changed_notes_units_seed_actual_specialist_parent_and_mixed_descendant(self):
        document = annotated()
        document['states'][-1]['notes'] = 'Changed current notes'
        document['states'][-1]['view']['coordinateUnit'] = 'in'
        core = recipe(document, 'convex-core', {'center': [0, 0, 0]})
        self.assertEqual(core['operationHistory']['nodes'][-2]['op'], 'source')
        archive = core['states'][-1]['view']['elementContentDetached'][-1]
        self.assertEqual(archive['sourceNotes'], 'Changed current notes')
        self.assertEqual(archive['sourceCoordinateUnit'], 'in')
        edited = recipe(core, 'element-content', {'action': 'text', 'kind': 'face', 'index': 1, 'markup': 'New result content'})
        transformed = recipe(edited, 'transform', {'scale': 2})
        replay = dispatch({'op': 'recipe-replay', 'params': {'document': transformed}})
        self.assertEqual(semantic(replay['states'][0]['view']), semantic(transformed['states'][-1]['view']))

    def test_reflection_and_scale_keep_exact_literal_ids_and_text_placement(self):
        source = annotated()['states'][-1]
        for factor in (-1, 3.5):
            result = deepcopy(source)
            result['model'] = dispatch({'op': 'transform', 'model': source['model'], 'params': {'scale': factor}})
            state = transfer_content_state(source, result, 'transform')
            self.assertEqual(state['view']['elementAnnotations']['source'], result['model'])
            self.assertEqual(state['view']['elementAnnotations']['entries'], source['view']['elementAnnotations']['entries'])
            self.assertEqual(state['view']['elementContentTransfer']['mapped'], [{'kind': 'face', 'sourceIndex': 0, 'resultIndex': 0}])

    def test_index_preserving_claim_refuses_changed_incidence_instead_of_reusing_ids(self):
        source = annotated()['states'][-1]
        result = deepcopy(source)
        result['model']['edges'][0] = [0, 2]
        with self.assertRaisesRegex(GeometryError, 'ordered element incidence'):
            transfer_content_state(source, result, 'spring-relaxation')

    def test_duplicate_retained_face_owner_is_detached_and_forged_correspondence_refuses(self):
        source = annotated()['states'][-1]
        result = deepcopy(source)
        result['model']['id'] = 'ambiguous-result'
        result['model']['faces'].append(deepcopy(source['model']['faces'][0]))
        self.assertNotIn(0, correspondence(source['model'], result['model'], 'facet')['face'])
        with self.assertRaises(GeometryError):
            transfer_content_state(source, result, 'facet')
        result['model']['faces'].pop()
        state = transfer_content_state(source, result, 'facet')
        self.assertEqual(state['view']['elementAnnotations']['entries'], source['view']['elementAnnotations']['entries'])
        state['view']['elementContentTransfer']['mapped'] = [{'kind': 'face', 'sourceIndex': 0, 'resultIndex': 1}]
        from engine.element_content_ownership import validate_content_ownership
        with self.assertRaisesRegex(GeometryError, 'does not reconstruct'):
            validate_content_ownership(state['model'], state['view'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
