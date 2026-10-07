from copy import deepcopy
import math
import unittest
import numpy as np
from engine.geometry import GeometryError, identity, validate
from engine.generators import regular
from engine.operations import transform, vertex_figure
from engine.wythoff import wythoff
from engine.vertex_figure_construction import (REGULAR_KEYS, match_vertex_figure,
    vertex_figure_candidates, construct_from_vertex_figure)
from engine.vertex_figure_construction_workflow import dispatch_vertex_figure_construction


class VertexFigureConstructionTest(unittest.TestCase):
    def test_all_six_regular_native_figures_offer_their_complete_candidate(self):
        for key in REGULAR_KEYS:
            with self.subTest(candidate=key):
                figure=vertex_figure(regular(key))['model']
                receipt=vertex_figure_candidates(figure)
                self.assertIn('regular:'+key,[row['id'] for row in receipt['candidates']])
                model=construct_from_vertex_figure(figure,'regular:'+key,2.5)
                self.assertTrue(validate(model)['passed'])
                self.assertEqual(model['dimension'],4)
                lengths=[math.dist(model['vertices'][a],model['vertices'][b]) for a,b in model['edges']]
                self.assertAlmostEqual(min(lengths),2.5,places=6)
                self.assertAlmostEqual(max(lengths),2.5,places=6)

    def test_tetrahedral_ambiguity_and_similarity_permutation_preserve_full_source(self):
        figure=transform(regular('tetrahedron'),matrix=[[0,1,0],[0,0,-1],[1,0,0]],scale=7,translation=[3,-5,2])
        permutation=[2,0,3,1];inverse={old:new for new,old in enumerate(permutation)}
        figure['vertices']=[figure['vertices'][i] for i in permutation]
        figure['edges']=[[inverse[i] for i in e] for e in reversed(figure['edges'])]
        figure['faces']=[[inverse[i] for i in reversed(f)] for f in reversed(figure['faces'])]
        figure.pop('facetEquations',None);figure.pop('facetVertices',None);figure['fingerprint']=identity(figure)
        figure['metadata']['coordinateUnits']='mm';figure['metadata']['offColors']={'faces':[{'encoding':'byte','values':[2,4,6,128]}]*4}
        before=deepcopy(figure);receipt=vertex_figure_candidates(figure)
        self.assertEqual(receipt['status'],'ambiguous')
        self.assertEqual({r['id'] for r in receipt['candidates']},{'regular:simplex4','regular:tesseract','regular:cell120'})
        model=construct_from_vertex_figure(figure,'regular:tesseract',3)
        self.assertEqual(model['metadata']['vertexFigureConstruction']['sourceFigure'],before)
        self.assertEqual(model['metadata']['coordinateUnits'],'mm')
        self.assertEqual(figure,before)
        self.assertEqual(model['id'],construct_from_vertex_figure(figure,'regular:tesseract',3)['id'])

    def test_count_and_label_spoofs_do_not_replace_complete_metric_or_incidence(self):
        source=transform(regular('tetrahedron'),matrix=[[1.3,0,0],[0,1,0],[0,0,1]])
        source['name']='Regular tetrahedral vertex figure';source['metadata']['vertexFigure']='tetrahedron'
        self.assertEqual(vertex_figure_candidates(source)['candidates'],[])
        with self.assertRaisesRegex(GeometryError,'no longer matches'):
            construct_from_vertex_figure(source,'regular:tesseract')
        cube=regular('cube');bad=deepcopy(cube);bad['faces'][0][1],bad['faces'][0][2]=bad['faces'][0][2],bad['faces'][0][1]
        self.assertIsNone(match_vertex_figure(cube,bad))
        with self.assertRaises(GeometryError):vertex_figure_candidates(bad)

    def test_small_finite_wythoff_extension_is_an_explicit_domain(self):
        candidate=wythoff('A4',[0,1,0,0]);figure=vertex_figure(candidate)['model']
        self.assertEqual(vertex_figure_candidates(figure)['candidates'],[])
        receipt=vertex_figure_candidates(figure,'regular-and-wythoff')
        self.assertIn('wythoff:A4:0100',[r['id'] for r in receipt['candidates']])
        self.assertEqual(receipt['candidateCount'],36)
        result=construct_from_vertex_figure(figure,'wythoff:A4:0100',1.5)
        self.assertTrue(validate(result)['passed'])
        self.assertEqual(len(result['vertices']),len(candidate['vertices']))

    def test_strict_dispatch_rejects_unsupported_sources_choices_and_parameters(self):
        source=regular('tetrahedron')
        for params in [{'candidate':'made-up'},{'candidate':'regular:tesseract','edge_length':True},
                       {'candidate':'regular:tesseract','edge_length':0},{'candidate':'regular:tesseract','guess':True}]:
            with self.subTest(params=params),self.assertRaises(GeometryError):
                dispatch_vertex_figure_construction({'op':'construct-from-vertex-figure','model':source,'params':params})
        with self.assertRaises(GeometryError):vertex_figure_candidates(regular('tesseract'))
        with self.assertRaises(GeometryError):vertex_figure_candidates(source,'universal-uniform')


if __name__=='__main__':unittest.main()
