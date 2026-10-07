from collections import Counter
from copy import deepcopy
import io
import json
import unittest
import numpy as np
from PIL import Image
from engine.geometry import GeometryError,identity,validate
from engine.generalized_concave_cell_nets import ordinary_cell_net,qualify_cell_shells
from engine.generalized_cell_nets import generalized_cell_net
from engine.cell_nets import cell_net,edit_cell_net,reconstruct_cell_net
from engine.prisms import polyhedron_prism
from engine.formats import validate_project
from engine.element_annotations import new_document,set_text,set_texture


def shell(vertices,faces,name='Independent nonconvex 3D shell'):
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    model={'id':'ordinary-source-shell','name':name,'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':[],
           'metadata':{'offColors':{'faces':[{'encoding':'byte','values':[73,29,113,92]} for _ in faces]},'units':'literal-source-units'},'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False}}
    model['fingerprint']=identity(model);model['validation']=validate(model);assert model['validation']['passed'],model['validation']
    return model


def dented_prism():
    vertices=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.2,.2,.2]]
    faces=[[0,1,2],[0,1,3],[0,2,3],[4,1,2],[4,1,3],[4,2,3]]
    return polyhedron_prism(shell(vertices,faces,'Literal dented tetrahedron'),height=2)


def l_prism4():
    polygon=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]]
    vertices=[[x,y,z] for z in (0,1) for x,y in polygon]
    faces=[list(range(6)),list(range(6,12))]+[[i,(i+1)%6,(i+1)%6+6,i+6] for i in range(6)]
    return polyhedron_prism(shell(vertices,faces,'Literal L-shaped prism'),height=2)


class ConcaveCellNetsTest(unittest.TestCase):
    def assert_intact(self,model,net):
        self.assertEqual(net['sourceFingerprint'],identity(model));self.assertEqual(net['sourceId'],model['id'])
        self.assertEqual(len(net['cells']),len(model['cells']));self.assertFalse(net['validation']['cellIntersectionsChecked'])
        self.assertEqual(Counter(f['id'] for c in net['cells'] for f in c['faces']),Counter({i:2 for i in range(len(model['faces']))}))
        for cell in net['cells']:
            self.assertEqual([f['id'] for f in cell['faces']],model['cells'][cell['id']])
            q=np.asarray(model['vertices'])[cell['sourceVertices']];p=np.asarray(cell['points'])
            self.assertTrue(np.allclose(np.linalg.norm(p[:,None]-p[None,:],axis=2),np.linalg.norm(q[:,None]-q[None,:],axis=2),atol=1e-8))
            for f in cell['faces']:self.assertEqual([cell['sourceVertices'][v] for v in f['vertices']],model['faces'][f['id']])
            if cell['parent'] is not None:
                parent=net['cells'][cell['parent']]
                for v in model['faces'][cell['parentFace']]:self.assertTrue(np.allclose(cell['points'][cell['sourceVertices'].index(v)],parent['points'][parent['sourceVertices'].index(v)],atol=1e-8))

    def test_dented_tetrahedron_cap_cells_are_preserved_as_whole_nonconvex_cells(self):
        source=dented_prism();before=deepcopy(source);net=ordinary_cell_net(source)
        self.assert_intact(source,net);self.assertEqual(len(net['cells']),8);self.assertEqual(len(net['connections']),7)
        self.assertEqual(net['cellQualification']['nonconvexCellsRepresented'],2)
        # Literal dent removes a pyramid of volume 1/15 from a tetrahedron of
        # volume 1/6. The two complete cap cells therefore have volume 1/10,
        # rather than a convex replacement's 1/6.
        for ci in (0,1):
            proof=net['cellShellQualifications'][ci];self.assertFalse(proof['convexBoundary']);self.assertAlmostEqual(proof['orientationVolume'],.1)
            self.assertEqual(len(net['cells'][ci]['sourceVertices']),5);self.assertEqual(len(net['cells'][ci]['faces']),6)
        self.assertFalse(net['cellQualification']['replacementCellsUsed']);self.assertEqual(source,before)
        self.assertEqual(cell_net(source),net)

    def test_concave_face_cycles_cut_move_join_reattach_and_cached_native_layout(self):
        source=l_prism4();before=deepcopy(source);net=cell_net(source);self.assert_intact(source,net)
        self.assertEqual(len(net['cells']),10);self.assertEqual(net['cellQualification']['nonconvexCellsRepresented'],4)
        self.assertAlmostEqual(net['cellShellQualifications'][0]['orientationVolume'],5)
        self.assertEqual(len([t for t in net['sourceFaceTriangles'] if t['face']==0]),4)
        face=net['connections'][0];cut=edit_cell_net(source,net,'toggle-face',face=face);self.assertEqual(len(cut['components']),2)
        for a,b in zip(net['cells'],cut['cells']):self.assertTrue(np.allclose(a['points'],b['points'],atol=1e-8))
        moved=edit_cell_net(source,cut,'move-component',component=cut['components'][1]['root'],translation=[3,-4,2],angles=[19,31,-47]);self.assert_intact(source,moved)
        joined=edit_cell_net(source,moved,'toggle-face',face=face);self.assertEqual(len(joined['components']),1)
        leaf=next(c for c in joined['cells'] if c['parent'] is not None and not any(x['parent']==c['id'] for x in joined['cells']))
        alternative=next(f['id'] for f in leaf['faces'] if not f['connected']);reattached=edit_cell_net(source,joined,'reattach-cell',face=alternative,moving_cell=leaf['id']);self.assert_intact(source,reattached)
        document=set_text(new_document(source),source,'face',0,'<b>Intact concave cell</b>');png=io.BytesIO();Image.new('RGBA',(2,2),(73,19,121,92)).save(png,format='PNG');document=set_texture(document,source,0,png.getvalue())
        cached=deepcopy(moved);cached['cells'][0]['points'][0]=[999,998,997]
        history={'sourceFingerprint':source['fingerprint'],'sourceId':source['id'],'cursor':1,'states':[{'root':net['root'],'connections':net['connections'],'placements':net['placements']},{'root':moved['root'],'connections':moved['connections'],'placements':moved['placements']}]}
        state={'model':source,'view':{'derivedMode':'cell-net','cellNet':{'root':0,'shrink':.6},'elementAnnotations':document},'cellNetLayout':cached,'cellNetHistory':history,'notes':'Original literal source notes'}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'source-cells','cursor':0,'states':[state]}]}
        restored=validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]
        self.assertEqual(restored['cellNetLayout']['cells'],moved['cells']);self.assertEqual(restored['cellNetHistory'],history)
        self.assertEqual(restored['view']['elementAnnotations'],document);self.assertEqual(restored['model']['metadata'],source['metadata']);self.assertEqual(source,before)

    def test_atomic_domain_refusals_and_existing_full_convex_cell_route(self):
        source=dented_prism();before=deepcopy(source);net=cell_net(source)
        bad=deepcopy(source);bad['cells'].pop()
        with self.assertRaisesRegex(GeometryError,'two distinct'):cell_net(bad)
        bad=deepcopy(source);bad['vertices'][4][3]+=.2
        with self.assertRaises(GeometryError):cell_net(bad)
        bad=deepcopy(source);bad['id']='another-owner'
        with self.assertRaisesRegex(GeometryError,'source changed'):reconstruct_cell_net(bad,net)
        with self.assertRaisesRegex(GeometryError,'cycle'):cell_net(source,connections=list(range(len(source['faces']))))
        bad_shell=shell([[0,0,0],[1,1,0],[0,1,0],[1,0,0],[0,0,1],[1,1,1],[0,1,1],[1,0,1]],[[0,1,2,3],[4,5,6,7]]+[[i,(i+1)%4,(i+1)%4+4,i+4] for i in range(4)])
        with self.assertRaisesRegex(GeometryError,'self-crossing'):cell_net(polyhedron_prism(bad_shell))
        zero_volume=shell([[0,0,0],[1,0,0],[0,1,0],[0,0,1],[0,0,0]],[[0,1,2],[0,1,3],[0,2,3],[4,1,2],[4,1,3],[4,2,3]],'Closed doubled zero-volume shell')
        with self.assertRaisesRegex(GeometryError,'zero or numerically unresolved'):cell_net(polyhedron_prism(zero_volume))
        tetra=shell([[0,0,0],[1,0,0],[0,1,0],[0,0,1]],[[0,1,2],[0,1,3],[0,2,3],[1,2,3]],'Independent full convex tetrahedron')
        convex_cells=polyhedron_prism(tetra);self.assertTrue(qualify_cell_shells(convex_cells)['allFullConvexCells']);self.assertEqual(cell_net(convex_cells),generalized_cell_net(convex_cells))
        self.assertEqual(source,before)


if __name__=='__main__':unittest.main()
