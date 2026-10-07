"""One source-bound route and native persistence sanity check for the new method."""
from copy import deepcopy
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine import server
from engine import dual_morph as reviewed_runtime
from engine.generators import regular
from engine.formats import save_project,load_file
from engine.geometry import GeometryError

class TriangleRoute(unittest.TestCase):
    def test_prepare_evaluate_source_coefficients_context_and_native_save_open(self):
        model=regular('cube');model['metadata']['coordinateUnits']='mm';model['metadata']['literal']={'values':[.125,'retain']};model['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]} for _ in model['faces']]};before=deepcopy(model)
        settings=dict(version=1,enabled=True,method='tilting-triangles',center=None,radius=2**.5,ratio=.25,duration=2,loop=False);context={'notes':'Literal triangle notes.','unit':'mm'}
        def prepare(m,s):return server.dispatch({'op':'prepare-dual-morph','model':m,'params':{'settings':s,'sourceContext':context}})
        def evaluate(m,p,c=context):return server.dispatch({'op':'evaluate-dual-morph','model':m,'params':{'prepared':p,'ratio':.25,'sourceContext':c}})
        prepared=prepare(model,settings);frame=evaluate(model,prepared);self.assertEqual(len(frame['model']['faces']),48);self.assertEqual(model,before)
        forged=deepcopy(prepared);forged['descriptor']['offsets'][0][0]+=1;forged['descriptorSha256']=reviewed_runtime.digest(forged['descriptor'])
        with self.assertRaises(GeometryError):evaluate(model,forged)
        with self.assertRaises(GeometryError):evaluate(model,prepared,dict(context,notes='changed'))
        altered=deepcopy(model);altered['metadata']['offColors']['faces'][0]['values'][3]=126
        with self.assertRaises(GeometryError):evaluate(altered,prepared)
        state={'model':model,'notes':context['notes'],'view':{'coordinateUnit':'mm','dualMorph':frame['settings']}}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'triangles','cursor':0,'states':[state]}]}
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'triangles.polyproj';save_project(file,project);restored=load_file(file)['project']['documents'][0]['states'][0]
        self.assertEqual(restored['model'],before);self.assertEqual(restored['notes'],context['notes']);self.assertEqual(restored['view']['dualMorph']['method'],'tilting-triangles')
        rebuilt=evaluate(restored['model'],prepare(restored['model'],restored['view']['dualMorph']));self.assertEqual(rebuilt['model'],frame['model']);self.assertEqual(rebuilt['sourceMaps'],frame['sourceMaps'])

if __name__=='__main__':unittest.main()
