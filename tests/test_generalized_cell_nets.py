from collections import Counter
from copy import deepcopy
from itertools import combinations
import json
import unittest
import numpy as np
from engine.geometry import GeometryError,identity,validate,hull
from engine.generalized_cell_nets import generalized_cell_net,qualified_cell_normals
from engine.cell_nets import cell_net,edit_cell_net,reconstruct_cell_net
from engine.formats import validate_project
from engine.prisms import polyhedron_prism


def dented_simplex(depth=.15):
    # A literal 4-simplex shell with the facet opposite 0 subdivided into four
    # full tetrahedra through an inward dent. No hull generates this incidence.
    vertices=[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1],[depth]*4]
    tetrahedra=[list(c) for c in combinations(range(5),4) if set(c)!={1,2,3,4}]
    tetrahedra += [[5,*triangle] for triangle in combinations([1,2,3,4],3)]
    faces=[];lookup={};cells=[]
    for ci,tetrahedron in enumerate(tetrahedra):
        cell=[]
        for triangle in combinations(tetrahedron,3):
            key=tuple(sorted(triangle))
            if key not in lookup:
                lookup[key]=len(faces);faces.append(list(triangle)[::-1] if len(faces)%2 else list(triangle))
            cell.append(lookup[key])
        cells.append(cell[::-1] if ci%2 else cell)
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    model={'id':'independent-dented-4-simplex','name':'Literal concave tetrahedral 4D shell','dimension':4,'embeddingDimension':4,
           'interpretation':'generalized-complex','vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':cells,
           'metadata':{'sourceNotes':'Original ordered cells and face cycles','offColors':{'faces':[{'encoding':'byte','values':[73,29,113,92]} for _ in faces]}},
           'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False}}
    model['fingerprint']=identity(model);model['validation']=validate(model)
    assert model['validation']['passed'],model['validation']
    return model


class GeneralizedCellNetsTest(unittest.TestCase):
    def assert_intact(self,source,net):
        self.assertEqual(net['sourceFingerprint'],identity(source));self.assertEqual(net['sourceId'],source['id'])
        self.assertEqual(len(net['cells']),len(source['cells']));self.assertFalse(net['validation']['cellIntersectionsChecked'])
        count=Counter(f['id'] for cell in net['cells'] for f in cell['faces']);self.assertEqual(count,Counter({i:2 for i in range(len(source['faces']))}))
        cloud=np.asarray(source['vertices'])
        for cell in net['cells']:
            self.assertEqual([f['id'] for f in cell['faces']],source['cells'][cell['id']])
            p=np.asarray(cell['points']);q=cloud[cell['sourceVertices']]
            self.assertTrue(np.allclose(np.linalg.norm(p[:,None]-p[None,:],axis=2),np.linalg.norm(q[:,None]-q[None,:],axis=2),atol=1e-8))
            for face in cell['faces']:
                self.assertEqual([cell['sourceVertices'][i] for i in face['vertices']],source['faces'][face['id']])
            if cell['parent'] is not None:
                parent=net['cells'][cell['parent']]
                for v in source['faces'][cell['parentFace']]:
                    self.assertTrue(np.allclose(p[cell['sourceVertices'].index(v)],parent['points'][parent['sourceVertices'].index(v)],atol=1e-8))

    def test_actual_globally_concave_shell_preserves_full_cells_and_shared_faces(self):
        source=dented_simplex();before=deepcopy(source);net=generalized_cell_net(source)
        self.assert_intact(source,net);self.assertEqual(len(net['connections']),7);self.assertEqual(source,before)
        normals=qualified_cell_normals(source);cloud=np.asarray(source['vertices'])
        # An inward dent creates a source cell hyperplane with source vertices
        # on both sides: this fixture is not a convex 4D boundary in disguise.
        sides=[]
        for ci,n in enumerate(normals):
            v=source['faces'][source['cells'][ci][0]][0];signed=(cloud-cloud[v])@n
            sides.append(float(min(signed))<-.01 and float(max(signed))>.01)
        self.assertTrue(any(sides));self.assertFalse(net['cellQualification']['hullReplacementUsed'])
        self.assertEqual(cell_net(source),net)

    def test_coplanar_subdivision_cut_move_join_reattach_and_native_open(self):
        # depth .25 lies exactly on the original facet: the four supplied
        # cells are coplanar neighboring tetrahedra, not a singular refusal.
        coplanar=dented_simplex(.25);self.assert_intact(coplanar,cell_net(coplanar))
        source=dented_simplex();net=cell_net(source);face=net['connections'][0]
        cut=edit_cell_net(source,net,'toggle-face',face=face);self.assertEqual(len(cut['components']),2)
        for a,b in zip(net['cells'],cut['cells']):self.assertTrue(np.allclose(a['points'],b['points'],atol=1e-8))
        root=cut['components'][1]['root'];moved=edit_cell_net(source,cut,'move-component',component=root,translation=[3,-4,2],angles=[19,31,-47])
        self.assert_intact(source,moved);joined=edit_cell_net(source,moved,'toggle-face',face=face);self.assertEqual(len(joined['components']),1)
        leaf=next(c for c in joined['cells'] if c['parent'] is not None and not any(x['parent']==c['id'] for x in joined['cells']))
        alternative=next(f['id'] for f in leaf['faces'] if not f['connected'])
        reattached=edit_cell_net(source,joined,'reattach-cell',face=alternative,moving_cell=leaf['id']);self.assert_intact(source,reattached)
        self.assertIn(alternative,reattached['connections']);self.assertNotIn(leaf['parentFace'],reattached['connections'])
        cached=deepcopy(moved);cached['cells'][0]['points'][0]=[999,998,997]
        history={'sourceFingerprint':source['fingerprint'],'sourceId':source['id'],'cursor':1,'states':[{'root':net['root'],'connections':net['connections'],'placements':net['placements']},{'root':moved['root'],'connections':moved['connections'],'placements':moved['placements']}]}
        state={'model':source,'view':{'derivedMode':'cell-net','cellNet':{'root':0,'shrink':.7}},'cellNetLayout':cached,'cellNetHistory':history,'notes':'Original literal source notes'}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'source-cells','cursor':0,'states':[state]}]}
        reopened=validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]
        self.assertEqual(reopened['cellNetLayout']['cells'],moved['cells']);self.assertEqual(reopened['cellNetHistory'],history)
        self.assertEqual(reopened['model']['metadata'],source['metadata']);self.assertEqual(reopened['notes'],state['notes'])

    def test_source_domain_and_owner_refusals_are_atomic(self):
        source=dented_simplex();before=deepcopy(source);net=cell_net(source)
        bad=deepcopy(source);bad['cells'].pop()
        with self.assertRaisesRegex(GeometryError,'two distinct cells'):cell_net(bad)
        bad=deepcopy(source);bad['vertices'][5]=[.5,.5,0,0]
        with self.assertRaises(GeometryError):cell_net(bad)
        bad=deepcopy(source);bad['id']='other-owner'
        with self.assertRaisesRegex(GeometryError,'source changed'):reconstruct_cell_net(bad,net)
        bad=deepcopy(source);bad['vertices'][5][0]+=.01
        with self.assertRaisesRegex(GeometryError,'source changed'):reconstruct_cell_net(bad,net)
        with self.assertRaisesRegex(GeometryError,'cycle'):cell_net(source,connections=list(range(len(source['faces']))))
        with self.assertRaises(GeometryError):cell_net(source,connections=[True])
        with self.assertRaises(GeometryError):cell_net(source,placements=[{'root':0,'quaternion':[0,0,0,0]}])
        vertices=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.2,.2,.2]]
        faces=[[0,1,2],[0,1,3],[0,2,3],[4,1,2],[4,1,3],[4,2,3]]
        edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
        shell={'id':'concave-3d-cap','name':'Literal dented tetrahedron','dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':[]}
        shell['fingerprint']=identity(shell)
        with self.assertRaisesRegex(GeometryError,'nonconvex'):qualified_cell_normals(polyhedron_prism(shell))
        convex=hull([[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]])
        self.assertEqual(cell_net(convex)['algorithmVersion'],'0.4.0');self.assertNotIn('cellQualification',cell_net(convex))
        self.assertEqual(source,before)


if __name__=='__main__':unittest.main()
