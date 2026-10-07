"""Native recipe/persistence/packing tests against isolated integration code."""
import base64
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.server import dispatch
from engine.formats import save_project, load_file
from engine.history import validate_document_history
from engine.nets import unfold, net_svg, reconstruct_net, edit_net
from engine.net_printing import pack_net
from engine.element_content_workflow import active_content, semantic

NS = {'s': 'http://www.w3.org/2000/svg'}


def png64():
    output = io.BytesIO()
    image = Image.new('RGBA', (2, 2)); image.putpixel((0, 0), (255, 0, 0, 255)); image.putpixel((1, 1), (0, 0, 255, 128))
    image.save(output, format='PNG')
    return base64.b64encode(output.getvalue()).decode('ascii')


def recipe(document, params):
    return dispatch({'op': 'recipe-run', 'params': {'document': document, 'operation': 'element-content', 'parameters': params}})


class ContentWorkflowTests(unittest.TestCase):
    def setUp(self):
        model = regular('cube')
        model['faceColors'] = [[0.2, 0.5, 1, 0.25], None, None, None, None, None]
        self.document = {'id': 'owned-content', 'cursor': 0, 'states': [{'model': model,
            'view': {'coordinateUnit': 'cm', 'angles': [0] * 6}, 'notes': 'Notes α ∞', 'label': 'Cube'}]}

    def text(self, document=None, index=0, markup='<b>π</b><br>x<sup>2</sup>'):
        return recipe(document or self.document, {'action': 'text', 'kind': 'face', 'index': index, 'markup': markup})

    def test_content_edit_preserves_every_model_field_notes_units_and_prior_state(self):
        before = deepcopy(self.document)
        document = self.text()
        self.assertEqual(self.document, before)
        state = document['states'][document['cursor']]
        self.assertEqual(state['model'], before['states'][0]['model'])
        self.assertEqual(state['notes'], 'Notes α ∞')
        self.assertEqual(state['view']['coordinateUnit'], 'cm')
        self.assertEqual(document['states'][0]['view'].get('elementAnnotations'), None)
        self.assertEqual(state['view']['elementAnnotations']['source'], state['model'])
        self.assertTrue(validate_document_history(document))

    def test_undo_redo_linear_cursor_restores_literal_content(self):
        first = self.text(markup='first')
        second = self.text(first, markup='second')
        second['cursor'] -= 1
        entry = second['states'][second['cursor']]['view']['elementAnnotations']['entries'][0]
        self.assertEqual(entry['text']['markup'], 'first')
        second['cursor'] += 1
        self.assertEqual(second['states'][second['cursor']]['view']['elementAnnotations']['entries'][0]['text']['markup'], 'second')

    def test_real_replay_recomputes_formatted_content(self):
        document = self.text()
        replay = dispatch({'op': 'recipe-replay', 'params': {'document': document}})
        self.assertEqual(semantic(replay['states'][0]['view']['elementAnnotations']), semantic(document['states'][-1]['view']['elementAnnotations']))
        self.assertEqual(replay['states'][0]['model'], document['states'][-1]['model'])

    def test_branch_reexecutes_changed_markup_and_keeps_original_branch(self):
        document = self.text(markup='original')
        node = document['operationHistory']['nodes'][-1]
        params = deepcopy(node['params']); params['markup'] = 'branch'
        branch = dispatch({'op': 'recipe-branch', 'params': {'document': document, 'parameters': params}})
        self.assertEqual(branch['states'][-1]['view']['elementAnnotations']['entries'][0]['text']['markup'], 'branch')
        self.assertEqual(document['states'][-1]['view']['elementAnnotations']['entries'][0]['text']['markup'], 'original')
        self.assertEqual(branch['states'][-1]['model'], document['states'][-1]['model'])

    def test_cached_replay_content_forgery_is_refused(self):
        document = self.text(markup='original')
        document['operationHistory']['nodes'][-1]['snapshot']['view']['elementAnnotations']['entries'][0]['text']['markup'] = 'forged'
        with self.assertRaisesRegex(GeometryError, 'does not reconstruct'):
            dispatch({'op': 'recipe-replay', 'params': {'document': document}})

    def test_changed_recorded_base_content_refused(self):
        document = self.text()
        document = self.text(document, index=1)
        document['operationHistory']['nodes'][-1]['params']['baseContent']['entries'][0]['text']['markup'] = 'forged input'
        with self.assertRaisesRegex(GeometryError, 'parent content'):
            dispatch({'op': 'recipe-replay', 'params': {'document': document}})

    def test_save_open_and_actual_node_roundtrip_keep_content_and_geometry(self):
        document = recipe(self.text(), {'action': 'texture', 'index': 0, 'pngBase64': png64()})
        project = {'format': 'polytope-laboratory', 'version': 1, 'documents': [document], 'active': 0}
        raw = json.dumps(project, ensure_ascii=False, allow_nan=False).encode('utf-8')
        result = subprocess.run(['node', '-e', 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s))))'], input=raw, capture_output=True, check=True)
        portable_project = json.loads(result.stdout)
        with tempfile.TemporaryDirectory(prefix='content-native-', dir=ROOT) as folder:
            path = Path(folder) / 'content.polylab'
            save_project(path, portable_project)
            loaded = load_file(path)['project']
        restored = loaded['documents'][0]['states'][-1]
        self.assertEqual(semantic(restored['view']['elementAnnotations']), semantic(document['states'][-1]['view']['elementAnnotations']))
        self.assertEqual(restored['notes'], 'Notes α ∞')
        self.assertEqual(restored['model']['faceColors'], self.document['states'][0]['model']['faceColors'])

    def test_texture_remove_collects_only_unused_assets(self):
        document = recipe(self.text(), {'action': 'texture', 'index': 0, 'pngBase64': png64()})
        document = recipe(document, {'action': 'texture', 'index': 1, 'pngBase64': png64()})
        document = recipe(document, {'action': 'remove', 'kind': 'face', 'index': 0, 'parts': ['texture']})
        content = document['states'][-1]['view']['elementAnnotations']
        self.assertEqual(len(content['assets']), 1)
        self.assertIsNone(content['entries'][0]['texture'])
        self.assertEqual(content['entries'][0]['text']['markup'], '<b>π</b><br>x<sup>2</sup>')
        document = recipe(document, {'action': 'remove', 'kind': 'face', 'index': 1, 'parts': ['text', 'texture']})
        self.assertEqual(document['states'][-1]['view']['elementAnnotations']['assets'], {})

    def test_text_list_uses_explicit_order_and_skips_unlisted_faces(self):
        document = recipe(self.document, {'action': 'list', 'kind': 'face', 'lines': ['α', '<b>β</b>'], 'targetIds': [4, 2]})
        entries = document['states'][-1]['view']['elementAnnotations']['entries']
        self.assertEqual([(e['index'], e['text']['markup']) for e in entries], [(4, 'α'), (2, '<b>β</b>')])

    def test_text_list_atomic_invalid_later_line_does_not_partially_publish(self):
        before = deepcopy(self.document)
        with self.assertRaises(GeometryError):
            recipe(self.document, {'action': 'list', 'kind': 'face', 'lines': ['valid', '<script>x</script>']})
        self.assertEqual(self.document, before)

    def test_native_descriptor_has_actual_source_coordinates_styles_and_owners(self):
        document = self.text()
        state = document['states'][-1]
        result = dispatch({'op': 'element-content-describe', 'model': state['model'], 'params': {'document': state['view']['elementAnnotations'], 'reference_edge_mm': 37}})
        self.assertEqual(result['sourceId'], state['model']['id'])
        self.assertEqual(result['sourceFingerprint'], identity(state['model']))
        self.assertEqual(result['referenceEdgeLengthMm'], 37)
        self.assertEqual(result['entries'][0]['sourceVertexIds'], state['model']['faces'][0])
        self.assertTrue(result['entries'][0]['runs'][0]['style']['bold'])

    def test_native_nets_rotations_and_project_regeneration_keep_svg_content(self):
        document = recipe(self.text(), {'action': 'texture', 'index': 0, 'pngBase64': png64()})
        state = document['states'][-1]
        net = unfold(state['model'], edge_length_mm=37, tabs=True, element_annotations=state['view']['elementAnnotations'])
        moved = edit_net(state['model'], net, 'move-component', component=net['components'][0]['root'], translation=[9, -4], angle=37)
        for value in [net, moved, reconstruct_net(state['model'], moved)]:
            root = ET.fromstring(net_svg(value))
            self.assertEqual(len(root.findall('.//s:image', NS)), 1)
            self.assertEqual(''.join(root.find('.//s:g[@data-annotation-face]', NS).itertext()), 'πx2')
        state['netLayout'] = moved
        state['netLayout']['svg'] = '<svg><script>forged cache</script></svg>'
        project = {'format': 'polytope-laboratory', 'version': 1, 'documents': [document], 'active': 0}
        checked = dispatch({'op': 'validate-project', 'params': {'project': project}})
        svg = checked['documents'][0]['states'][-1]['netLayout']['svg']
        self.assertNotIn('forged cache', svg)
        self.assertIn('data-annotation-face', svg)

    def test_multiframe_packing_carries_every_annotation_at_original_scale(self):
        document = recipe(self.document, {'action': 'list', 'kind': 'face', 'lines': ['F' + str(i) for i in range(6)]})
        state = document['states'][-1]
        net = unfold(state['model'], edge_length_mm=65, hinges=[], tabs=True, element_annotations=state['view']['elementAnnotations'])
        for margin in [0, 10]:
            with self.subTest(margin=margin):
                packed = pack_net(net, paper='custom', width_mm=110, height_mm=110, margin_mm=margin)
                self.assertEqual(packed['contentScale'], 1)
                self.assertEqual(packed['referenceEdgeLengthMm'], 65)
                ids = []
                for page in packed['pages']:
                    root = ET.fromstring(page['svg'])
                    ids.extend(int(g.attrib['data-annotation-face']) for g in root.findall('.//s:g[@data-annotation-face]', NS))
                self.assertEqual(sorted(ids), list(range(6)))

    def test_packing_refuses_insufficient_printable_area_without_resizing_content(self):
        document = self.text()
        state = document['states'][-1]
        net = unfold(state['model'], edge_length_mm=65, hinges=[], tabs=True,
                     element_annotations=state['view']['elementAnnotations'])
        before = deepcopy(net)
        with self.assertRaisesRegex(GeometryError, 'No scaling was applied'):
            pack_net(net, paper='custom', width_mm=100, height_mm=100, margin_mm=10)
        self.assertEqual(net, before)

    def test_project_view_content_forged_owner_or_asset_refused(self):
        document = self.text()
        for field, value in [('sourceSha256', '0' * 64), ('entries', [{'kind': 'face', 'index': 99, 'text': None, 'texture': None}])]:
            bad = deepcopy(document); bad['states'][-1]['view']['elementAnnotations'][field] = value
            with self.subTest(field=field), self.assertRaises(GeometryError):
                dispatch({'op': 'validate-project', 'params': {'project': {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [bad]}}})

    def test_invalid_parameters_and_unavailable_operations_are_atomic(self):
        values = [None, [], {}, {'action': 'unknown'}, {'action': 'text', 'kind': 'face', 'index': True, 'markup': 'x'},
                  {'action': 'text', 'kind': 'face', 'index': 0, 'markup': 'x', 'unknown': 1},
                  {'action': 'texture', 'index': 0, 'pngBase64': 'https://x'},
                  {'action': 'remove', 'kind': 'face', 'index': 0, 'parts': [{}]},
                  {'action': 'list', 'kind': [], 'lines': []}]
        before = deepcopy(self.document)
        for value in values:
            with self.subTest(value=value), self.assertRaises(GeometryError):
                recipe(self.document, value)
        self.assertEqual(self.document, before)

    def test_affine_transform_keeps_literal_element_owners_and_replays(self):
        document = self.text(markup='source face')
        before = deepcopy(document)
        changed = dispatch({'op': 'recipe-run', 'params': {'document': document,
            'operation': 'transform', 'parameters': {'matrix': [[0, -1, 0], [1, 0, 0], [0, 0, 1]], 'translation': [3, -2, 5]}}})
        state = changed['states'][-1]
        self.assertEqual(document, before)
        self.assertEqual(state['view']['elementAnnotations']['entries'][0]['index'], 0)
        self.assertEqual(state['view']['elementAnnotations']['source'], state['model'])
        self.assertEqual(state['view']['elementContentTransfer']['mapped'], [{'kind': 'face', 'sourceIndex': 0, 'resultIndex': 0}])
        replay = dispatch({'op': 'recipe-replay', 'params': {'document': changed}})
        self.assertEqual(semantic(replay['states'][0]['view']['elementAnnotations']), semantic(state['view']['elementAnnotations']))

    def test_topology_change_retains_unmapped_content_with_original_source_units_notes(self):
        document = self.text(markup='original face')
        changed = dispatch({'op': 'recipe-run', 'params': {'document': document,
            'operation': 'dual', 'parameters': {}}})
        state = changed['states'][-1]
        self.assertEqual(state['view']['elementAnnotations']['entries'], [])
        archive = state['view']['elementContentDetached'][0]
        self.assertEqual(archive['document'], document['states'][-1]['view']['elementAnnotations'])
        self.assertEqual(archive['sourceNotes'], document['states'][-1]['notes'])
        self.assertEqual(archive['sourceCoordinateUnit'], 'cm')
        replay = dispatch({'op': 'recipe-replay', 'params': {'document': changed}})
        self.assertEqual(semantic(replay['states'][0]['view']['elementContentDetached']), semantic(state['view']['elementContentDetached']))

    def test_current_unit_note_observer_edits_get_a_literal_replay_source(self):
        document = self.text(markup='first')
        document['states'][-1]['view']['coordinateUnit'] = 'in'
        document['states'][-1]['notes'] = 'Edited notes'
        changed = self.text(document, index=1, markup='second')
        replay = dispatch({'op': 'recipe-replay', 'params': {'document': changed}})
        self.assertEqual(replay['states'][0]['view']['coordinateUnit'], 'in')
        self.assertEqual(replay['states'][0]['notes'], 'Edited notes')


if __name__ == '__main__':
    unittest.main(verbosity=2)
