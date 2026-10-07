from copy import deepcopy
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.geometric_fitting import fit_geometry, dispatch_geometry_fit
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.formats import save_project, load_file
from engine.recipes import run_recipe, replay_document
from engine import server


def stretched(key='tetrahedron'):
    model=regular(key);model['vertices']=(np.asarray(model['vertices'])*[1.2,.9,1.05]).tolist()
    for field in ('facetEquations','facetVertices','fingerprint','measure'):model.pop(field,None)
    model['numeric']={'mode':'float64-approximate','certified':False}
    model['metadata'].update(coordinateUnits='mm',literal={'asset':[.125,'keep']},
        offColors={'faces':[{'encoding':'byte','values':[20,40,80,127]} for _ in model['faces']]})
    return model


class FittingSanity(unittest.TestCase):
    def test_three_modes_independent_distances_chords_and_areas(self):
        source=stretched();before=deepcopy(source)
        edges=fit_geometry(source,{'mode':'equal-edges','target':2,'max_evaluations':60})
        self.assertTrue(edges['evidence']['requestedConstraintsSatisfied']);self.assertIsNotNone(edges['model'])
        p=np.asarray(edges['model']['vertices'])
        for a,b in source['edges']:self.assertAlmostEqual(float(np.linalg.norm(p[a]-p[b])),2,places=6)
        selected=fit_geometry(source,{'mode':'regular-faces','face_ids':[0],'max_evaluations':60})
        self.assertTrue(selected['evidence']['requestedConstraintsSatisfied']);self.assertIsNotNone(selected['model'])
        face=np.asarray(selected['model']['vertices'])[source['faces'][0]]
        lengths=np.linalg.norm(face-np.roll(face,-1,axis=0),axis=1);self.assertLess(float(np.ptp(lengths)),1e-6)
        areas=fit_geometry(source,{'mode':'equal-areas','max_evaluations':60})
        self.assertTrue(areas['evidence']['requestedConstraintsSatisfied']);self.assertIsNotNone(areas['model'])
        p=np.asarray(areas['model']['vertices'])
        values=[float(np.linalg.norm(np.cross(p[f[1]]-p[f[0]],p[f[2]]-p[f[0]])))/2 for f in source['faces']]
        self.assertLess(max(values)-min(values),1e-6)
        for packet in (edges,selected,areas):
            self.assertEqual(packet['model']['faces'],source['faces']);self.assertEqual(packet['model']['edges'],source['edges'])
            self.assertEqual(packet['model']['metadata']['offColors'],source['metadata']['offColors'])
            self.assertFalse(packet['evidence']['hullRepair']);self.assertFalse(packet['evidence']['uniformityEstablished'])
        self.assertEqual(source,before)

    def test_non_solution_requires_explicit_valid_adoption_and_rejected_geometry_never_adopts(self):
        source=stretched();params={'mode':'equal-edges','target':2,'max_evaluations':1}
        packet=dispatch_geometry_fit({'op':'geometry-fit-preview','model':source,'params':params})
        self.assertIsNotNone(packet['model']);self.assertFalse(packet['evidence']['requestedConstraintsSatisfied'])
        with self.assertRaises(GeometryError):dispatch_geometry_fit({'op':'geometry-fit','model':source,'params':params})
        adopted=dispatch_geometry_fit({'op':'geometry-fit','model':source,'params':{**params,'adoption':'valid-near-miss'}})
        self.assertEqual(adopted['metadata']['geometryFitting']['adoption'],'valid-near-miss')
        invalid=deepcopy(source);invalid['vertices'][0]=invalid['vertices'][1]
        with self.assertRaises(GeometryError):dispatch_geometry_fit({'op':'geometry-fit','model':invalid,'params':{**params,'adoption':'valid-near-miss'}})
        with self.assertRaises(GeometryError):fit_geometry(source,{},cancel=lambda:True)
        def change():source['metadata']['literal']['asset'][0]=99;return False
        with self.assertRaises(GeometryError):fit_geometry(source,params,cancel=change)

        # A numerical backend reporting success still cannot publish a warped
        # quad boundary. The improved edge objective does not override geometry.
        box=regular('cube')
        def warped_trial(fun,initial,**options):
            fun(initial);trial=initial.reshape((-1,3)).copy()*2;trial[0,0]+=.001;fun(trial.ravel())
            return SimpleNamespace(success=True,status=1,message='reported success',nfev=2)
        with patch.object(sys.modules['engine.geometric_fitting'],'least_squares',warped_trial):
            bad=fit_geometry(box,{'mode':'equal-edges','target':4})
            self.assertIsNone(bad['model']);self.assertEqual(bad['status'],'invalid-realization')
            with self.assertRaises(GeometryError):dispatch_geometry_fit({'op':'geometry-fit','model':box,
                'params':{'mode':'equal-edges','target':4,'adoption':'valid-near-miss'}})

    def test_4d_qualified_zero_residual_and_real_recipe_save_open_replay(self):
        four=fit_geometry(regular('tesseract'),{'mode':'equal-areas','max_evaluations':2})
        self.assertTrue(four['evidence']['requestedConstraintsSatisfied']);self.assertTrue(four['model']['validation']['passed'])
        source=stretched();doc={'id':'fit-doc','cursor':0,'states':[{'model':source,'view':{'coordinateUnit':'mm'},'notes':'Keep source notes.'}]};before=deepcopy(doc)
        built=run_recipe(doc,'geometry-fit',{'mode':'equal-edges','target':2,'max_evaluations':60},server.dispatch)
        self.assertEqual(doc,before);self.assertEqual(built['states'][1]['notes'],'Keep source notes.')
        self.assertEqual(built['states'][1]['view']['coordinateUnit'],'mm')
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'fit.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[built]})
            opened=load_file(path)['project']['documents'][0]
        replay=replay_document(opened,server.dispatch)['states'][0]
        self.assertEqual(identity(replay['model']),identity(opened['states'][1]['model']))
        self.assertEqual(replay['model']['metadata'],opened['states'][1]['model']['metadata'])


if __name__=='__main__':unittest.main()
