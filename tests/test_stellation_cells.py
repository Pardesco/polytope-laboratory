from copy import deepcopy
import json
import unittest
from engine.geometry import GeometryError,hull
from engine.stellation import arrangement,region_union
from engine.stellation_cells import cell_graph,inaccessible_regions,dispatch_stellation_cells
from engine.formats import validate_project


class StellationCellsTest(unittest.TestCase):
    def octahedron(self):
        return hull([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],'Independent octahedron')

    def test_shared_facets_have_hypercube_adjacency_without_edge_point_contacts(self):
        a=arrangement(planes=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],bounds=[[-1,-1,-1],[1,1,1]])
        before=deepcopy(a);graph=cell_graph(a)
        for node in graph['nodes']:
            signs=a['regions'][node['id']]['signs'];expected=[r['id'] for r in a['regions'] if sum(u!=v for u,v in zip(signs,r['signs']))==1]
            self.assertEqual(graph['adjacency'][str(node['id'])],expected);self.assertEqual(len(expected),3)
        self.assertEqual(len(graph['links']),12);self.assertEqual(graph['unresolvedFacetRegionIds'],[]);self.assertEqual(a,before)
        self.assertTrue(all(not node['selectable'] for node in graph['nodes']))

    def test_sealed_octahedral_core_fills_but_an_opening_or_unknown_region_does_not(self):
        source=self.octahedron();a=arrangement(source);before=deepcopy(a);graph=cell_graph(a,source)
        enclosed=[n['id'] for n in graph['nodes'] if n['selectable']];core=next(n['id'] for n in graph['nodes'] if n['outsidePlaneCount']==0);shell=[i for i in enclosed if i!=core]
        self.assertEqual(len(shell),8);self.assertEqual(graph['adjacency'][str(core)],shell)
        self.assertEqual(inaccessible_regions(graph,shell),[core]);self.assertEqual(inaccessible_regions(graph,shell[:-1]),[])
        filled=region_union(a,enclosed,source=source);hollow=region_union(a,shell,source=source)
        self.assertAlmostEqual(filled['measure']['content']-hollow['measure']['content'],4/3)
        changed=deepcopy(a);changed['regions'][core]['boundedness']='unresolved';uncertain=cell_graph(changed,source)
        self.assertIn(core,uncertain['exteriorSeedIds']);self.assertEqual(inaccessible_regions(uncertain,shell),[])
        for link in graph['links']:
            self.assertTrue(link['sourceFaceIds']);self.assertEqual(sorted(link['regionFaceIds']),sorted(map(str,link['regions'])))
        self.assertEqual(a,before)

    def test_source_bound_selection_history_native_roundtrip_and_atomic_refusal(self):
        source=self.octahedron();a=arrangement(source);graph=cell_graph(a,source);ids=[n['id'] for n in graph['nodes'] if n['selectable']]
        history={'version':1,'sourceFingerprint':graph['sourceFingerprint'],'arrangementSha256':graph['arrangementSha256'],'steps':[{'before':[], 'after':ids,'action':'layer','regionId':ids[0]}],'cursor':1}
        state={'model':source,'view':{'stellation':{'selectedRegions':ids,'cellSelectionHistory':history}},'notes':'Source-owned cells','arrangement':a}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'cells','cursor':0,'states':[state]}]}
        restored=validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]
        self.assertEqual(restored['view']['stellation']['cellSelectionHistory'],history);self.assertEqual(restored['notes'],state['notes'])
        bad=deepcopy(source);bad['id']='different-source'
        with self.assertRaises(GeometryError):cell_graph(a,bad)
        incomplete=deepcopy(a);incomplete['completeWithinDeclaredDomain']=False
        with self.assertRaises(GeometryError):cell_graph(incomplete,source)
        with self.assertRaises(GeometryError):dispatch_stellation_cells({'op':'stellation-cell-graph','params':{'arrangement':a,'invented':True},'model':source})
        raw=deepcopy(a);raw['regions'][0]['touchesObservationBox']=False;raw['regions'][0]['boundedness']='bounded-numerical'
        self.assertFalse(cell_graph(raw,source)['nodes'][0]['selectable'])


if __name__=='__main__':unittest.main()
