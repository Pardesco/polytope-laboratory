from copy import deepcopy
import math
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.static_expansion import dispatch_static_expansion, expand_runcinate
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.formats import validate_project, save_project, load_file
from engine import server
from engine.recipes import run_recipe, replay_document


class StaticExpansionSanity(unittest.TestCase):
    def test_independent_cube_coordinates_closed_counts_area_volume_and_uniform_radius(self):
        source = regular('cube')
        model = expand_runcinate(source, ratio=.5, radius=math.sqrt(2))
        self.assertEqual([len(model[k]) for k in ('vertices', 'edges', 'faces')], [24, 48, 26])
        self.assertEqual(sorted(map(len, model['faces'])), [3]*8+[4]*18)
        self.assertTrue(all(all(abs(a-b)<1e-12 for a,b in zip(sorted(map(abs,v)), [.5,.5,1.5])) for v in model['vertices']))
        self.assertAlmostEqual(model['measure']['content'], 43/3)
        self.assertAlmostEqual(model['measure']['boundaryMeasure'], 6+12*math.sqrt(2)+4*math.sqrt(3))
        uniform = expand_runcinate(source, radius=2**.25)
        for a, b in uniform['edges']:
            self.assertAlmostEqual(math.dist(uniform['vertices'][a], uniform['vertices'][b]), 1)
        self.assertEqual(model['interpretation'], 'convex-polytope')
        self.assertTrue(model['validation']['passed'])

    def test_literal_endpoints_metadata_raw_alpha_source_immutability_and_native_project(self):
        source=regular('cube');source['metadata'].update(coordinateUnits='mm', asset={'raw': [.25, 'keep']},
            offColors={'faces': [{'encoding': 'byte', 'values': [50,100,150,127]} for _ in source['faces']]})
        before=deepcopy(source)
        for t in (0, .5, 1):
            model=expand_runcinate(source, ratio=t, radius=math.sqrt(2))
            self.assertEqual(model['metadata']['sourceMetadata'], before['metadata'])
            self.assertEqual(model['metadata']['coordinateUnits'], 'mm')
            self.assertFalse(model['provenance']['convexified'])
            self.assertFalse(model['numeric']['certified'])
            document={'id':'test-doc','name':'Expanded','cursor':0,'states':[{'model': model, 'view': {}, 'notes':'Preserved notes.'}]}
            validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[document]})
        self.assertEqual(identity(expand_runcinate(source,ratio=0)), identity(source))
        mid=expand_runcinate(source, color_policy='source')
        self.assertTrue(any(c and c['encoding']=='byte' and c['values'][3]==127 for c in mid['metadata']['offColors']['faces']))
        clear=expand_runcinate(source,color_policy='none')
        self.assertTrue(all(c is None for c in clear['metadata']['offColors']['faces']))
        self.assertEqual(source,before)

    def test_strict_request_and_unsupported_domains(self):
        source=regular('cube')
        for params in ({'ratio':True},{'ratio':-.1},{'ratio':1.1},{'radius':0},{'center':[9,0,0]},{'unknown':1}):
            with self.assertRaises(GeometryError):dispatch_static_expansion({'op':'expand-runcinate','model':source,'params':params})
        for model in ({**regular('tesseract'),'interpretation':'generalized-complex'}, {**source,'interpretation':'generalized-complex'}):
            with self.assertRaises(GeometryError):expand_runcinate(model)

    def test_actual_recipe_save_open_and_replay_preserve_source_notes_units_and_derived_boundary(self):
        model=regular('cube');model['metadata']['coordinateUnits']='mm'
        source={'model':model,'view':{'coordinateUnit':'mm'},'notes':'Literal source notes.'}
        doc={'id':'source-doc','cursor':0,'states':[source]}
        before=deepcopy(doc)
        constructed=run_recipe(doc,'expand-runcinate',{'ratio':.5,'radius':math.sqrt(2)},server.dispatch)
        self.assertEqual(doc,before)
        self.assertEqual(constructed['states'][1]['notes'],source['notes'])
        self.assertEqual(constructed['states'][1]['view']['coordinateUnit'],'mm')
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[constructed]}
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'expanded.polyproj';save_project(path,project);opened=load_file(path)
        saved=opened['project']['documents'][0]
        replayed=replay_document(saved,server.dispatch)
        self.assertEqual(identity(replayed['states'][0]['model']),identity(saved['states'][1]['model']))
        self.assertEqual(replayed['states'][0]['model']['metadata'],saved['states'][1]['model']['metadata'])
        self.assertEqual(replayed['states'][0]['notes'],source['notes'])


if __name__ == '__main__': unittest.main()
