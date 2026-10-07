from copy import deepcopy
from fractions import Fraction
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.exact_surface_sections import exact_surface_section,dispatch_exact_section
from engine.generators import regular
from engine.geometry import GeometryError,identity
from engine.formats import save_project,load_file
from engine.recipes import run_recipe,replay_document
from engine import server


def face_source(points,cycle=None):
    cycle=list(range(len(points))) if cycle is None else cycle
    return {'id':'literal-face','name':'Literal face','dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
            'vertices':[list(p)+[0] for p in points],'edges':[sorted((a,b)) for a,b in zip(cycle,cycle[1:]+cycle[:1])],
            'faces':[cycle],'cells':[],'metadata':{'coordinateUnits':'mm','literal':{'asset':[.125,'retain']},
                'offColors':{'faces':[{'encoding':'byte','values':[20,40,80,127]}]}},'numeric':{'mode':'float64-approximate','certified':False}}


class ExactSurfaceSanity(unittest.TestCase):
    def test_exact_concave_disconnected_intervals_and_star_winding_difference(self):
        source=face_source([(0,0),(4,0),(4,4),(3,4),(3,1),(1,1),(1,4),(0,4)])
        cut=exact_surface_section(source,[0,1,0],2)['model']
        intervals=sorted(tuple(sorted(Fraction(cut['rationalCoordinates'][i][0]) for i in edge)) for edge in cut['edges'])
        self.assertEqual(intervals,[(Fraction(0),Fraction(1)),(Fraction(3),Fraction(4))])
        star=face_source([(0,3),(3,1),(2,-3),(-2,-3),(-3,1)],[0,2,4,1,3]);before=deepcopy(star)
        a=exact_surface_section(star,[0,1,0],0,'nonzero')['model'];b=exact_surface_section(star,[0,1,0],0,'even-odd')['model']
        def segments(m):return sorted(tuple(sorted(Fraction(m['rationalCoordinates'][i][0]) for i in edge)) for edge in m['edges'])
        self.assertEqual(segments(a),[(Fraction(-7,4),Fraction(-1)),(Fraction(-1),Fraction(1)),(Fraction(1),Fraction(7,4))])
        self.assertEqual(segments(b),[(Fraction(-7,4),Fraction(-1)),(Fraction(1),Fraction(7,4))])
        self.assertEqual(star,before);self.assertEqual(a['embeddingDimension'],3);self.assertFalse(a['metadata']['exactSurfaceSection']['solidInteriorInferred'])
        for records in a['metadata']['edgeSourceColors']:self.assertEqual(records[0]['color']['values'],[20,40,80,127])

    def test_tilted_world_metric_exact_plane_parameters_and_coplanar_raw_alpha(self):
        cube=regular('cube');packet=exact_surface_section(cube,[1,1,1],'1/3');m=packet['model']
        self.assertEqual(len(m['vertices']),6);self.assertEqual(len(m['edges']),6)
        for row in m['rationalCoordinates']:self.assertEqual(sum(map(Fraction,row)),Fraction(1,3))
        self.assertEqual(m['vertices'],[[float(Fraction(x)) for x in row] for row in m['rationalCoordinates']])
        for refs in packet['sourceReferences']:
            self.assertTrue(any('edge' in r and 'parameter' in r for r in refs))
        star=face_source([(0,3),(3,1),(2,-3),(-2,-3),(-3,1)],[0,2,4,1,3])
        coplanar=exact_surface_section(star,[0,0,1],0)['model']
        self.assertEqual(coplanar['metadata']['offColors']['faces'],star['metadata']['offColors']['faces'])
        self.assertEqual(coplanar['metadata']['coordinateUnits'],'mm');self.assertEqual(coplanar['metadata']['sourceMetadata'],star['metadata'])
        self.assertEqual(coplanar['numeric']['mode'],'float64-approximate');self.assertTrue(coplanar['metadata']['exactSurfaceSection']['exactConstruction'])

    def test_strict_empty_ambiguous_nonplanar_guards_and_real_recipe_save_open_replay(self):
        cube=regular('cube')
        self.assertEqual(exact_surface_section(cube,[1,0,0],9)['status'],'empty')
        for params in ({'normal':[0,0,0]},{'normal':[True,0,1]},{'unknown':0},{'offset':'NaN'},{'normal':[1,0,0],'offset':9}):
            with self.assertRaises(GeometryError):dispatch_exact_section({'op':'exact-surface-section','model':cube,'params':params})
        nonplanar=deepcopy(cube);nonplanar['vertices'][0][0]+=.1
        with self.assertRaises(GeometryError):exact_surface_section(nonplanar,[0,0,1],0)
        bow=face_source([(-1,-1),(1,1),(-1,1),(1,-1)])
        with self.assertRaises(GeometryError):exact_surface_section(bow,[0,1,0],0)
        source=face_source([(0,3),(3,1),(2,-3),(-2,-3),(-3,1)],[0,2,4,1,3]);before=deepcopy(source)
        doc={'id':'source-doc','cursor':0,'states':[{'model':source,'view':{'coordinateUnit':'mm','derivedMode':'section'},'notes':'Literal section notes.'}]}
        built=run_recipe(doc,'exact-surface-section',{'normal':['0','1','0'],'offset':'0','fill_rule':'even-odd'},server.dispatch)
        self.assertEqual(built['states'][1]['notes'],'Literal section notes.');self.assertEqual(built['states'][1]['view']['derivedMode'],'section-evidence')
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'section.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[built]})
            opened=load_file(path)['project']['documents'][0]
        replay=replay_document(opened,server.dispatch)['states'][0]
        self.assertEqual(identity(replay['model']),identity(opened['states'][1]['model']));self.assertEqual(replay['model']['metadata'],opened['states'][1]['model']['metadata'])
        self.assertEqual(source,before)


if __name__=='__main__':unittest.main()
