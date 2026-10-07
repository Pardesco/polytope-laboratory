from copy import deepcopy
import math,unittest
import numpy as np
from engine.generators import regular
from engine.geometry import GeometryError
from engine.measurements import entity_measure
from engine.operations import transform


def ref(kind,index):return {'kind':kind,'index':index}
def axis_entity(model,kind,axis,value):
    records=model['faces'] if kind=='face' else [[v for f in cell for v in model['faces'][f]] for cell in model['cells']]
    return next(i for i,ids in enumerate(records) if all(abs(model['vertices'][v][axis]-value)<1e-8 for v in ids))


class BoundedEntityDistances(unittest.TestCase):
    def check_distance(self,model,entities,expected):
        before=deepcopy(model);result=entity_measure(model,entities=entities,bounded=True)
        self.assertAlmostEqual(result['value'],expected,places=7);self.assertEqual(model,before)
        evidence=result['boundedDistanceEvidence'];lo,hi=evidence['distanceBounds']
        self.assertLessEqual(lo,expected+1e-7);self.assertGreaterEqual(hi,expected-1e-7)
        self.assertFalse(evidence['exactCertificate']);self.assertFalse(evidence['sourceIncidenceRebuilt'])
        for ids,weights,witness in zip(evidence['sourceVertexIds'],evidence['barycentricWeights'],result['witnessPoints']):
            self.assertTrue(all(w>=0 for w in weights));self.assertAlmostEqual(sum(weights),1)
            np.testing.assert_allclose(np.asarray(model['vertices'])[ids].T@weights,witness,atol=1e-8)
        return result

    def test_face_distance_opposite_and_intersecting_in_3d(self):
        cube=regular('cube');z0=axis_entity(cube,'face',2,-1);z1=axis_entity(cube,'face',2,1);x1=axis_entity(cube,'face',0,1)
        self.check_distance(cube,[ref('face',z0),ref('face',z1)],2)
        self.check_distance(cube,[ref('face',z0),ref('face',x1)],0)
        self.check_distance(cube,[ref('face',z1),ref('face',z0)],2)

    def test_complete_cell_interiors_and_scaled_metric_in_4d(self):
        model=regular('tesseract');a=axis_entity(model,'cell',3,-1);b=axis_entity(model,'cell',3,1)
        self.check_distance(model,[ref('cell',a),ref('cell',b)],2)
        self.check_distance(model,[ref('cell',a),ref('cell',a)],0)
        model=transform(model,scale=3,translation=[10,-20,7,12])
        self.check_distance(model,[ref('cell',a),ref('cell',b)],6)

    def test_regions_are_bounded_and_concave_star_cells_refuse(self):
        model={'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[2,2,1]],'edges':[[0,1],[1,2],[2,3],[0,3]],'faces':[[0,1,2,3]],'cells':[]}
        self.check_distance(model,[ref('vertex',4),ref('face',0)],math.sqrt(3))
        self.assertAlmostEqual(entity_measure(model,entities=[ref('vertex',4),ref('face',0)])['value'],1)
        bad=deepcopy(model);bad['vertices'][2]=[.25,.25,0]
        self.check_distance(bad,[ref('vertex',4),ref('face',0)],math.sqrt(6))  # Literal concave region, not its convex hull.
        bad=regular('tesseract');bad['interpretation']='generalized-complex'
        with self.assertRaisesRegex(GeometryError,'explicit convex'):entity_measure(bad,entities=[ref('cell',0),ref('cell',1)],bounded=True)

if __name__=='__main__':unittest.main()
