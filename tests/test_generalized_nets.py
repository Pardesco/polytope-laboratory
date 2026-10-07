from copy import deepcopy
import json
import math
import unittest
import numpy as np
from engine.generalized_nets import unfold_source,edit_source_net,reconstruct_source_net,polygon_overlap
from engine.nets import fold_net,net_svg,unfold
from engine.net_printing import pack_net
from engine.geometry import GeometryError,identity,validate,polygon_area,hull
from engine.formats import validate_project
from engine.element_annotations import new_document,set_text,set_texture
from PIL import Image
import io


def source(vertices,faces,name='Independent nonconvex shell'):
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    model={'id':'independent-shell','name':name,'dimension':3,'embeddingDimension':len(vertices[0]),
           'interpretation':'generalized-complex','vertices':vertices,'faces':faces,'edges':[list(e) for e in edges],'cells':[],
           'metadata':{'sourceNotes':'No hull or face reordering','sourceColors':{'faces':[[.1,.3,.9,.4] for _ in faces]}},
           'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False}}
    model['fingerprint']=identity(model);model['validation']=validate(model)
    assert model['validation']['passed'],model['validation']
    return model


def l_prism():
    polygon=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]]
    vertices=[[x,y,z] for z in (0,1) for x,y in polygon]
    # Deliberately inconsistent input orientation must not reorder source cycles.
    faces=[list(range(6)),list(range(6,12))]+[[i,(i+1)%6,(i+1)%6+6,i+6] for i in range(6)]
    return source(vertices,faces)


def torus(n=6,m=4):
    vertices=[]
    for i in range(n):
        a=2*math.pi*i/n
        for j in range(m):
            b=2*math.pi*j/m;radius=3+math.cos(b)
            vertices.append([radius*math.cos(a),radius*math.sin(a),math.sin(b)])
    idx=lambda i,j:(i%n)*m+j%m
    faces=[[idx(i,j),idx(i+1,j),idx(i+1,j+1),idx(i,j+1)] for i in range(n) for j in range(m)]
    return source(vertices,faces,'Independent planar-quad torus')


class GeneralizedNetsTest(unittest.TestCase):
    def assert_rigid(self,model,net):
        self.assertTrue(net['validation']['allFacesRepresented']);self.assertTrue(net['validation']['areaPreserved'])
        self.assertEqual(net['sourceFingerprint'],identity(model));self.assertEqual(net['sourceEdges'],model['edges'])
        original=np.asarray(model['vertices']);folded=fold_net(net,1)
        self.assertTrue(folded['validation']['endpointReconstructed'])
        for record in net['faces']:
            face=model['faces'][record['id']];self.assertEqual(record['sourceVertices'],face)
            cloud=original[face]*net['scale'];flat=np.asarray(record['points'])
            self.assertTrue(np.allclose(np.linalg.norm(cloud[:,None]-cloud[None,:],axis=2),np.linalg.norm(flat[:,None]-flat[None,:],axis=2),atol=1e-7))
        for fraction in (.2,.6):
            checked=fold_net(net,fraction)['validation'];self.assertTrue(checked['rigidityPreserved']);self.assertTrue(checked['hingesJoined'])

    def test_concave_prism_true_areas_source_triangles_and_inside_tabs(self):
        model=l_prism();before=deepcopy(model);net=unfold_source(model,hinges=[])
        self.assert_rigid(model,net);self.assertEqual(model,before)
        self.assertEqual(len(net['faces']),8);self.assertEqual(len(net['components']),8)
        self.assertAlmostEqual(polygon_area(net['faces'][0]['points']),5*net['scale']**2)
        # Whole polygon SAT would falsely report a square in the L's missing
        # upper-right region as overlapping. Positive-area triangulation must not.
        a=np.asarray([[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]])
        self.assertFalse(polygon_overlap(a,np.asarray([[1.2,1.2],[2,1.2],[2,2],[1.2,2]])))
        self.assertTrue(polygon_overlap(a,np.asarray([[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5]])))
        self.assertFalse(polygon_overlap(a,np.asarray([[3,0],[4,0],[4,1],[3,1]])))
        # The reentrant edge's midpoint lies on the opposite side of the vertex
        # average: an outward-from-centroid heuristic would put this tab inside.
        record=net['faces'][0];p=np.asarray(record['points']);signed=sum(p[i,0]*p[(i+1)%6,1]-p[i,1]*p[(i+1)%6,0] for i in range(6))
        edge=record['edges'][2]['id'];tab=next(t for t in net['tabRecords'] if t['face']==0 and t['edge']==edge)
        a,b=p[2],p[3];outward=np.sign(signed)*np.array([(b-a)[1],-(b-a)[0]])
        self.assertGreater(float((np.asarray(tab['points'])[1]-(a+b)/2)@outward),0)
        for fi in range(len(model['faces'])):
            triangles=[t for t in net['faceTriangles'] if t['face']==fi]
            area=sum(polygon_area(np.asarray(model['vertices'])[t['sourceVertices']]) for t in triangles)
            self.assertAlmostEqual(area,polygon_area(np.asarray(model['vertices'])[model['faces'][fi]]))
        self.assertIn('data-net-face="0"',net_svg(net));self.assertFalse(any(t['edge'] in net['hinges'] for t in net['tabRecords']))
        document=set_text(new_document(model),model,'face',0,'<b>Concave source face</b>')
        png=io.BytesIO();Image.new('RGBA',(2,2),(73,19,121,92)).save(png,format='PNG')
        document=set_texture(document,model,0,png.getvalue())
        annotated=unfold_source(model,hinges=[],element_annotations=document)
        moved=edit_source_net(model,annotated,'move-component',component=0,translation=[12,5],angle=31)
        self.assertEqual(moved['elementAnnotations'],document);self.assertIn('Concave source face',net_svg(moved))
        pages=pack_net(moved);self.assertTrue(any('data:image/png;base64,' in p['svg'] for p in pages['pages']))

    def test_torus_cut_join_move_pack_history_and_metric_embedding(self):
        model=torus();before=deepcopy(model);net=unfold_source(model,edge_length_mm=19,tabs=False)
        self.assert_rigid(model,net);self.assertEqual(len(net['hinges']),23)
        self.assertEqual(len(model['vertices'])-len(model['edges'])+len(model['faces']),0)
        edge=net['hinges'][0];cut=edit_source_net(model,net,'toggle-edge',edge=edge)
        self.assertEqual(len(cut['components']),2);joined=edit_source_net(model,cut,'toggle-edge',edge=edge);self.assertEqual(len(joined['components']),1)
        moved=edit_source_net(model,cut,'move-component',component=cut['components'][0]['root'],translation=[17,-9],angle=27)
        self.assert_rigid(model,moved);self.assert_rigid(model,reconstruct_source_net(model,moved))
        separated=unfold_source(model,edge_length_mm=19,hinges=[],tabs=True);pages=pack_net(separated)
        self.assertEqual(sum(len(p['parts']) for p in pages['pages']),24);self.assertTrue(pages['validation']['scalePreserved'])
        history={'sourceFingerprint':model['fingerprint'],'states':[{'root':0,'edge_length_mm':19,'tabs':True,'hinges':separated['hinges'],'placements':separated['placements']}],'cursor':0}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'net-source','cursor':0,'states':[{'model':model,'view':{'net':{'root':0,'length':19,'tabs':True}},'netHistory':history,'notes':'Literal source notes'}]}]}
        project['documents'][0]['states'][0]['netLayout']=separated
        reopened=validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]
        self.assertEqual(reopened['netLayout']['faceTriangles'],separated['faceTriangles'])
        self.assertEqual(reopened['netLayout']['sourceFingerprint'],model['fingerprint'])
        self.assertEqual(reopened['netHistory'],history);self.assertEqual(reopened['model']['metadata'],model['metadata']);self.assertEqual(model,before)
        embedded=deepcopy(l_prism());embedded['vertices']=[[p[0],p[1],p[2]/math.sqrt(2),p[2]/math.sqrt(2)] for p in embedded['vertices']];embedded['embeddingDimension']=4
        embedded['fingerprint']=identity(embedded);self.assert_rigid(embedded,unfold_source(embedded))

    def test_explicit_refusal_and_unchanged_convex_kernel(self):
        model=l_prism();before=deepcopy(model)
        bad=deepcopy(model);bad['faces'].pop()
        with self.assertRaisesRegex(GeometryError,'exactly two'):unfold_source(bad)
        polygon=[[0,0],[1,1],[0,1],[1,0]]
        bad=source([[x,y,z] for z in (0,1) for x,y in polygon],[[0,1,2,3],[4,5,6,7]]+[[i,(i+1)%4,(i+1)%4+4,i+4] for i in range(4)])
        with self.assertRaisesRegex(GeometryError,'self-crossing'):unfold_source(bad)
        bad=deepcopy(model);bad['vertices'][0][2]=.15
        with self.assertRaises(GeometryError):unfold_source(bad)
        bad=deepcopy(model);bad['vertices'][0][0]=.1
        with self.assertRaisesRegex(GeometryError,'source changed'):reconstruct_source_net(bad,unfold_source(model))
        with self.assertRaisesRegex(GeometryError,'cycle'):unfold_source(model,hinges=list(range(len(model['edges']))))
        with self.assertRaises(GeometryError):unfold_source(model,edge_length_mm=float('nan'))
        convex=hull([[x,y,z] for x in (-1,1) for y in (-1,1) for z in (-1,1)],'Independent convex cube')
        self.assertEqual(unfold_source(convex),unfold(convex));self.assertEqual(model,before)
        bad=deepcopy(model);bad['id']='another-owner'
        with self.assertRaisesRegex(GeometryError,'source changed'):reconstruct_source_net(bad,unfold_source(model))


if __name__=='__main__':unittest.main()
