from copy import deepcopy
from pathlib import Path
import math,tempfile,unittest
import numpy as np
from engine import server
from engine.generators import regular
from engine.basic_solids import basic_solid
from engine.sphere_projection import project_sphere,dispatch_sphere_projection
from engine.geometry import GeometryError,identity
from engine.formats import save_project,load_file
from engine.recipes import run_recipe,replay_document
from engine.element_annotations import new_document,set_text


class SphereProjectionTest(unittest.TestCase):
    def test_intrinsic_metric_planarity_source_colors_and_4d_content(self):
        model=regular('tesseract');model['metadata']['coordinateUnits']='mm';model['metadata']['offColors']={'faces':[{'space':'rgb','values':[.2,.4,.8,.3]} for _ in model['faces']],'cells':[]};before=deepcopy(model)
        result=project_sphere(model,radius=3)
        np.testing.assert_allclose(np.linalg.norm(result['vertices'],axis=1),3,atol=1e-10)
        self.assertEqual(result['faces'],model['faces']);self.assertEqual(result['cells'],model['cells']);self.assertEqual(result['edges'],model['edges']);self.assertEqual(result['metadata']['offColors'],model['metadata']['offColors'])
        self.assertEqual(result['metadata']['coordinateUnits'],'mm');self.assertEqual(result['interpretation'],'convex-polytope');self.assertAlmostEqual(result['measure']['content'],81)
        self.assertFalse(result['metadata']['sphereProjection']['hullRepair']);self.assertEqual(model,before)

    def test_nonplanar_center_degeneracy_and_strict_controls(self):
        prism=basic_solid('triangular-prism',sides=[3,4,5],height=2,shear=[2,1])
        with self.assertRaisesRegex(GeometryError,'nonplanar'):project_sphere(prism,radius=2)
        cube=regular('cube')
        with self.assertRaisesRegex(GeometryError,'sphere center'):project_sphere(cube,center=cube['vertices'][0])
        for params in ({'radius':True},{'radius':0},{'radius':math.inf},{'center':[True,0,0]},{'center':[0,0]},{'unknown':1}):
            with self.assertRaises(GeometryError):dispatch_sphere_projection({'op':'sphere-project','model':cube,'params':params})
        result=project_sphere(cube,center=[0,0,0]);self.assertAlmostEqual(result['metadata']['sphereProjection']['radius'],math.sqrt(3))

    def test_native_recipe_content_transfer_save_open_and_replay(self):
        model=basic_solid('edge-tetrahedron',edges=[3,4,5,5,math.sqrt(34),math.sqrt(41)])
        model['metadata']['coordinateUnits']='cm';before=deepcopy(model)
        document={'id':'sphere-doc','cursor':0,'states':[{'model':model,'view':{'coordinateUnit':'cm'},'notes':'Retain source notes.'}]}
        document=run_recipe(document,'element-content',{'action':'text','kind':'face','index':0,'markup':'Surface label'},server.dispatch)
        content=document['states'][document['cursor']]['view']['elementAnnotations']
        result=run_recipe(document,'sphere-project',{'radius':2},server.dispatch)
        state=result['states'][result['cursor']];self.assertEqual(state['notes'],'Retain source notes.');self.assertEqual(state['view']['elementAnnotations']['entries'],content['entries']);self.assertEqual(state['view']['elementContentTransfer']['operation'],'sphere-project')
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'sphere.polyproj';save_project(file,{'format':'polytope-laboratory','version':1,'active':0,'documents':[result]});opened=load_file(file)['project']['documents'][0]
        replay=replay_document(opened,server.dispatch)['states'][0]
        self.assertEqual(identity(replay['model']),identity(opened['states'][opened['cursor']]['model']));self.assertEqual(replay['view']['elementAnnotations'],opened['states'][opened['cursor']]['view']['elementAnnotations']);self.assertEqual(model,before)

if __name__=='__main__':unittest.main()
