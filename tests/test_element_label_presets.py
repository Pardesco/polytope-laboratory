from copy import deepcopy
import base64
import json
from pathlib import Path
import unittest
from engine.element_label_presets import prepare_element_labels,dispatch_element_labels
from engine.element_annotations import new_document,set_text,set_texture
from engine.element_content_workflow import run_content
from engine.generators import regular
from engine.geometry import GeometryError
from engine.recipes import replay_document
from engine.server import dispatch


class ElementLabelPresetsTest(unittest.TestCase):
    def test_default_fill_keeps_manual_text_png_source_and_replays_one_history_operation(self):
        fixture=json.loads((Path(__file__).resolve().parent/'fixtures/element-content-native-fixture.json').read_text(encoding='utf8'))
        source=fixture['source'];document=set_text(new_document(source),source,'face',0,'Manual source face')
        asset=next(iter(fixture['descriptor']['assets'].values()));document=set_texture(document,source,0,base64.b64decode(asset['base64']))
        before=deepcopy(document);receipt=prepare_element_labels(source,kind='face',document=document)
        self.assertEqual(receipt['skippedExistingIds'],[0]);self.assertEqual(receipt['parameters']['targetIds'],[1,2,3,4,5])
        source_state={'model':source,'view':{'elementAnnotations':document,'coordinateUnit':'mm'},'notes':'Literal source notes'}
        result=run_content({'id':'preset-document','cursor':0,'states':[source_state]},receipt['parameters'])
        state=result['states'][result['cursor']];annotations=state['view']['elementAnnotations']
        self.assertEqual(annotations['assets'],before['assets']);self.assertEqual(next(e for e in annotations['entries'] if e['kind']=='face' and e['index']==0),before['entries'][0])
        self.assertEqual(state['model'],source);self.assertEqual(state['notes'],source_state['notes']);self.assertEqual(document,before)
        replayed=replay_document(result,dispatch)
        self.assertEqual(replayed['states'][replayed['cursor']]['view']['elementAnnotations'],annotations)

    def test_intrinsic_4d_lengths_coordinates_and_literal_incidence_ids(self):
        source=regular('tesseract')
        lengths=prepare_element_labels(source,kind='edge',preset='lengths',target_ids=[3,0],decimals=2)
        self.assertEqual(lengths['rows'][0]['sourceIndex'],3);self.assertIn('2.00 model units',lengths['rows'][0]['text'])
        coordinates=prepare_element_labels(source,preset='coordinates',target_ids=[0],decimals=1)
        self.assertIn('(-1.0, -1.0, -1.0, -1.0)',coordinates['rows'][0]['text'])
        incidence=prepare_element_labels(source,kind='cell',preset='incidence',target_ids=[0],index_base=1)
        self.assertEqual(incidence['rows'][0]['text'],'C1: 6 faces / 8 vertices')
        literal=prepare_element_labels(source,target_ids=[0],prefix='<b>&')
        self.assertIn('&lt;b&gt;&amp;',literal['rows'][0]['markup']);self.assertEqual(literal['rows'][0]['text'],'<b>&0')

    def test_overwrite_is_explicit_and_invalid_targets_domain_options_refuse(self):
        source=regular('cube');document=set_text(new_document(source),source,'vertex',0,'Keep')
        self.assertEqual(prepare_element_labels(source,document=document,target_ids=[0])['status'],'unchanged')
        self.assertEqual(prepare_element_labels(source,document=document,target_ids=[0],overwrite=True)['parameters']['lines'],['<font color="white">V<sub>0</sub></font>'])
        for args in [{'target_ids':[0,0]},{'index_base':True},{'kind':'face','preset':'lengths'},{'decimals':9},{'color':'transparent'}]:
            with self.subTest(args=args),self.assertRaises(GeometryError):prepare_element_labels(source,**args)
        with self.assertRaises(GeometryError):dispatch_element_labels({'op':'element-label-presets','model':source,'params':{'surprise':True}})


if __name__=='__main__':unittest.main()
