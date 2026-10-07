from copy import deepcopy
import math
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.static_expansion import expand_runcinate, dispatch_static_expansion
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.formats import save_project, load_file
from engine.recipes import run_recipe, replay_document
from engine import server


class Expansion4DSanity(unittest.TestCase):
    def test_independent_tesseract_l1_offset_coordinates_incidence_and_hypervolume(self):
        source=regular('tesseract');m=expand_runcinate(source,ratio=.5,radius=math.sqrt(2))
        self.assertEqual([len(m[k]) for k in ('vertices','edges','faces','cells')],[64,192,208,80])
        self.assertTrue(all(all(abs(a-b)<1e-12 for a,b in zip(sorted(map(abs,v)),[.5,.5,.5,1.5])) for v in m['vertices']))
        # Independently decompose [-a,a]^4 + b*L1-ball by outside-coordinate subsets:
        # sum binomial(4,k)*(2a)^(4-k)*2^k*b^k/k!, a=.5,b=1 -> 27.
        expected=sum(math.comb(4,k)*2**k/math.factorial(k) for k in range(5))
        self.assertAlmostEqual(m['measure']['content'],expected)
        self.assertAlmostEqual(m['measure']['boundaryMeasure'],8+24*math.sqrt(2)+16*math.sqrt(3)+16/3)
        self.assertEqual(m['interpretation'],'convex-polytope');self.assertTrue(m['validation']['passed'])
        self.assertEqual(len(m['facetEquations']),80)
        for t,expected in ((0,16),(1,32/3)):
            self.assertAlmostEqual(expand_runcinate(source,ratio=t,radius=math.sqrt(2))['measure']['content'],expected)

    def test_real_recipe_save_open_replay_units_notes_raw_cell_alpha_and_source_immutability(self):
        model=regular('tesseract');model['metadata'].update(coordinateUnits='mm',asset={'literal':[.125,'keep']},
            offColors={'cells':[{'encoding':'byte','values':[20,40,80,127]} for _ in model['cells']]})
        source={'model':model,'view':{'coordinateUnit':'mm'},'notes':'Literal 4D notes.'}
        doc={'id':'source4d','cursor':0,'states':[source]};before=deepcopy(doc)
        built=run_recipe(doc,'expand-runcinate',{'ratio':.5,'radius':math.sqrt(2)},server.dispatch)
        self.assertEqual(doc,before);result=built['states'][1]
        self.assertEqual(result['notes'],source['notes']);self.assertEqual(result['view']['coordinateUnit'],'mm')
        self.assertEqual(result['model']['metadata']['sourceMetadata'],model['metadata'])
        self.assertTrue(any(c and c['encoding']=='byte' and c['values'][3]==127 for c in result['model']['metadata']['offColors']['cells']))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'expanded4d.polyproj'
            save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[built]})
            opened=load_file(path)['project']['documents'][0]
        replay=replay_document(opened,server.dispatch)['states'][0]
        self.assertEqual(identity(replay['model']),identity(opened['states'][1]['model']))
        self.assertEqual(replay['model']['metadata'],opened['states'][1]['model']['metadata'])
        for params in ({'center':[0,0,0]},{'center':[9,0,0,0]},{'ratio':True}):
            with self.assertRaises(GeometryError):dispatch_static_expansion({'op':'expand-runcinate','model':model,'params':params})


if __name__=='__main__':unittest.main()
