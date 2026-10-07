from copy import deepcopy
from pathlib import Path
import math
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.incidence_truncation import incidence_truncate,dispatch_incidence_truncation
from engine.generators import regular
from engine.geometry import GeometryError,identity
from engine.formats import save_project,load_file
from engine.recipes import run_recipe,replay_document
from engine import server


class IncidenceTruncationSanity(unittest.TestCase):
    def test_analytic_regular_cube_normal_quasi_and_midpoint_incidence_without_hull(self):
        source=regular('cube');before=deepcopy(source)
        with patch('engine.geometry.hull',side_effect=AssertionError('No hull construction')):
            normal=incidence_truncate(source,preset='normal');quasi=incidence_truncate(source,preset='quasi');rectified=incidence_truncate(source,preset='rectify')
        for m in (normal,quasi):
            self.assertEqual([len(m[k]) for k in ('vertices','edges','faces')],[24,36,14])
            self.assertEqual([len(f) for f in m['faces']],[8]*6+[3]*8)
            lengths=[math.dist(m['vertices'][a],m['vertices'][b]) for a,b in m['edges']]
            self.assertLess(max(lengths)-min(lengths),1e-12)
            self.assertTrue(m['metadata']['incidenceTruncation']['closedIncidence'])
        self.assertAlmostEqual(normal['metadata']['incidenceTruncation']['parameters']['amount'],1-math.sqrt(2)/2)
        self.assertAlmostEqual(quasi['metadata']['incidenceTruncation']['parameters']['amount'],1+math.sqrt(2)/2)
        face=next(f for f in quasi['faces'][:6] if len({quasi['vertices'][v][2] for v in f})==1)
        turn=0
        for a,b in zip(face,face[1:]+face[:1]):
            x,y=quasi['vertices'][a][:2];u,v=quasi['vertices'][b][:2];turn+=math.atan2(x*v-y*u,x*u+y*v)
        self.assertAlmostEqual(abs(turn),6*math.pi) # Literal regular octagram winds three times, not its convex octagon hull.
        self.assertEqual(normal['interpretation'],'convex-polytope');self.assertEqual(quasi['interpretation'],'generalized-complex')
        self.assertFalse(quasi['metadata']['incidenceTruncation']['solidInteriorInferred']);self.assertNotIn('measure',quasi)
        self.assertEqual([len(rectified[k]) for k in ('vertices','edges','faces')],[12,24,14])
        self.assertEqual(rectified['interpretation'],'convex-polytope');self.assertEqual(len(rectified['metadata']['incidenceTruncation']['vertexSources']),12)
        self.assertEqual(source,before)

    def test_generalized_literal_cycles_caps_and_strict_singular_nonplanar_guards(self):
        source=regular('cube');source['interpretation']='generalized-complex';source.pop('fingerprint',None)
        m=incidence_truncate(source,amount=1.7)
        self.assertEqual(m['interpretation'],'generalized-complex');self.assertEqual(m['metadata']['incidenceTruncation']['sourceModel']['faces'],source['faces'])
        star=incidence_truncate(regular('cube'),preset='quasi');second=incidence_truncate(star,preset='normal')
        self.assertEqual(second['metadata']['incidenceTruncation']['regularReference']['sides'],8)
        self.assertAlmostEqual(second['metadata']['incidenceTruncation']['regularReference']['cornerCoefficient'],math.cos(3*math.pi/8))
        self.assertEqual(second['metadata']['incidenceTruncation']['sourceModel']['faces'],star['faces'])
        for params in ({'amount':True},{'amount':1},{'amount':-1},{'preset':'bogus'},{'reference_face':True},{'unexpected':0}):
            with self.assertRaises(GeometryError):dispatch_incidence_truncation({'op':'incidence-truncate','model':source,'params':params})
        open_source=deepcopy(source);open_source['faces'].pop()
        with self.assertRaisesRegex(GeometryError,'two source face'):incidence_truncate(open_source)
        # Octahedron faces remain triangles, but one off-equator neighbour makes a degree-four cap nonplanar.
        warped=regular('octahedron');warped['interpretation']='generalized-complex';warped.pop('fingerprint',None);warped['vertices'][0][2]+=.2
        with self.assertRaisesRegex(GeometryError,'nonplanar'):incidence_truncate(warped)
        with self.assertRaisesRegex(GeometryError,'even-sided'):incidence_truncate(regular('tetrahedron'),preset='quasi')

    def test_literal_rgba_units_notes_real_recipe_save_open_replay(self):
        source=regular('cube');color={'encoding':'byte','values':[20,40,80,127]}
        source['metadata'].update(coordinateUnits='mm',literal={'asset':['retain',.125]},offColors={'faces':[deepcopy(color) for _ in source['faces']]})
        before=deepcopy(source)
        settings={'version':1,'enabled':True,'method':'sizing','ratio':.4,'center':None,'radius':1,'duration':5,'loop':False}
        doc={'id':'source-doc','cursor':0,'states':[{'model':source,'view':{'coordinateUnit':'mm','derivedMode':'face','dualMorph':settings},'notes':'Quasi source notes.'}]}
        built=run_recipe(doc,'incidence-truncate',{'preset':'quasi'},server.dispatch);result=built['states'][1]
        self.assertEqual(result['notes'],'Quasi source notes.');self.assertEqual(result['model']['metadata']['coordinateUnits'],'mm')
        self.assertEqual(result['model']['metadata']['offColors']['faces'],[color]*14)
        self.assertEqual(result['model']['metadata']['sourceMetadata'],source['metadata'])
        self.assertNotIn('dualMorph',result['view']);self.assertIn('dualMorph',built['states'][0]['view'])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'quasi.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[built]})
            opened=load_file(path)['project']['documents'][0]
        replay=replay_document(opened,server.dispatch)['states'][0]
        self.assertEqual(identity(replay['model']),identity(opened['states'][1]['model']))
        self.assertEqual(replay['model']['metadata'],opened['states'][1]['model']['metadata']);self.assertEqual(source,before)


if __name__=='__main__':unittest.main()
