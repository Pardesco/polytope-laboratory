from copy import deepcopy
import json
import unittest
import numpy as np
from engine.geometry import identity,GeometryError,validate
from engine.generalized_nets import unfold_source,edit_source_net
from engine.nets import unfold,fold_net,net_svg,tab_geometry
from engine.net_printing import pack_net
from engine.formats import validate_project
from engine.formats import save_project,load_file
from tempfile import TemporaryDirectory
from pathlib import Path
from engine.element_annotations import new_document,set_text,set_texture
from PIL import Image
import io


def fixture():
    polygon=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]]
    vertices=[[x,y,z] for z in (0,1) for x,y in polygon]
    faces=[list(range(6)),list(range(6,12))]+[[i,(i+1)%6,(i+1)%6+6,i+6] for i in range(6)]
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    model={'id':'independent-tab-l-prism','name':'Literal L prism tab fixture','dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
           'vertices':vertices,'faces':faces,'edges':[list(e) for e in edges],'cells':[],
           'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False},'metadata':{'sourceNotes':'Keep complete ordered concave faces'}}
    model['fingerprint']=identity(model);assert validate(model)['passed'];return model


def options(model,mode='double',width=5,edges=None):
    return {'version':1,'sourceId':model['id'],'sourceFingerprint':identity(model),'mode':mode,'widthMm':width,'edges':edges or []}


class NetTabsTest(unittest.TestCase):
    def test_double_tabs_concave_outward_fixed_physical_width_and_svg(self):
        model=fixture();before=deepcopy(model);prefs=options(model)
        for e0 in (25,73):
            net=unfold(model,edge_length_mm=e0,hinges=[],tab_options=prefs)
            self.assertEqual(len(tab_geometry(net)),2*len(model['edges']));self.assertEqual(model,before)
            svg=net_svg(net);self.assertEqual(svg.count('data-net-tab='),2*len(model['edges']))
            for tab in net['tabRecords']:
                face=net['faces'][tab['face']];i=next(i for i,e in enumerate(face['edges']) if e['id']==tab['edge'])
                p=np.array(face['points']);a,b=p[i],p[(i+1)%len(p)];u=(b-a)/np.linalg.norm(b-a)
                signed=sum(p[j,0]*p[(j+1)%len(p),1]-p[j,1]*p[(j+1)%len(p),0] for j in range(len(p)))
                outward=np.sign(signed)*np.array([u[1],-u[0]])
                self.assertAlmostEqual(float((np.array(tab['points'])[1]-a)@outward),5)
            # Source corner 2->3 is reentrant; the tab must occupy the notch side,
            # not the centroid side. Assert in independently specified source XY.
            edge=model['edges'].index([2,3]);tab=next(t for t in net['tabRecords'] if t['edge']==edge and t['face']==0)
            self.assertGreater(np.array(tab['points'])[1,1],net['faces'][0]['points'][2][1])
            self.assertTrue(fold_net(net,1)['validation']['endpointReconstructed'])
            packed=pack_net(net);self.assertTrue(packed['validation']['scalePreserved'])
            self.assertEqual(sum(p['svg'].count('data-net-tab=') for p in packed['pages']),2*len(model['edges']))

    def test_edge_sides_none_reset_dormant_hinge_and_rigid_edits(self):
        model=fixture();net=unfold_source(model);edge=net['hinges'][0];owners=[f['id'] for f in net['faces'] if any(e['id']==edge for e in f['edges'])]
        prefs=options(model,'none',3,[{'edge':edge,'mode':'single','face':owners[1]}])
        net=edit_source_net(model,net,'set-tab-options',tab_options=prefs)
        self.assertEqual(net['tabRecords'],[])
        cut=edit_source_net(model,net,'toggle-edge',edge=edge)
        self.assertEqual([(t['edge'],t['face']) for t in cut['tabRecords']],[(edge,owners[1])])
        moved=edit_source_net(model,cut,'move-component',component=cut['components'][1]['root'],translation=[9,-8],angle=19)
        self.assertEqual(moved['tabOptions'],prefs);self.assertTrue(fold_net(moved,1)['validation']['endpointReconstructed'])
        prefs['edges'][0]['face']=owners[0];flipped=edit_source_net(model,moved,'set-tab-options',tab_options=prefs)
        self.assertEqual(flipped['tabRecords'][0]['face'],owners[0])
        joined=edit_source_net(model,flipped,'toggle-edge',edge=edge);self.assertEqual(joined['tabRecords'],[]);self.assertEqual(joined['tabOptions'],prefs)
        prefs['edges']=[];reset=edit_source_net(model,joined,'set-tab-options',tab_options=prefs);self.assertEqual(reset['tabOptions']['edges'],[])
        prefs=options(model,'double');on=edit_source_net(model,reset,'set-tab-options',tab_options=prefs)
        off=edit_source_net(model,on,'set-tabs',tabs=False);self.assertEqual(off['tabRecords'],[])
        restored=edit_source_net(model,off,'set-tabs',tabs=True);self.assertEqual(len(restored['tabRecords']),2*(len(model['edges'])-len(restored['hinges'])))

    def test_native_cached_history_content_pack_reopen_and_source_fences(self):
        model=fixture();document=set_text(new_document(model),model,'face',0,'<b>Literal concave tab source</b>')
        png=io.BytesIO();Image.new('RGBA',(2,2),(52,71,92,108)).save(png,format='PNG');document=set_texture(document,model,0,png.getvalue())
        prefs=options(model);net=unfold_source(model,hinges=[],tab_options=prefs,element_annotations=document)
        state={'model':model,'view':{'net':{'root':0,'length':25,'tabs':True,'tabOptions':prefs},'elementAnnotations':document},'netLayout':net,'netPages':pack_net(net),
               'netHistory':{'cursor':0,'sourceFingerprint':identity(model),'states':[{'root':0,'edge_length_mm':25,'tabs':True,'hinges':[],'placements':[],'tab_options':prefs}]}}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'source','cursor':0,'states':[state]}]}
        tampered=json.loads(json.dumps(project));tampered['documents'][0]['states'][0]['netLayout']['tabRecords'][0]['points']=[[9,9]]*4
        reopened=validate_project(tampered)['documents'][0]['states'][0]
        self.assertEqual(reopened['netLayout']['tabRecords'],net['tabRecords']);self.assertEqual(reopened['netHistory'],state['netHistory'])
        self.assertEqual(reopened['netLayout']['elementAnnotations'],document);self.assertIn('Literal concave tab source',reopened['netLayout']['svg'])
        self.assertTrue(any('data:image/png;base64,' in p['svg'] for p in reopened['netPages']['pages']))
        self.assertEqual(sum(p['svg'].count('data-net-tab=') for p in reopened['netPages']['pages']),2*len(model['edges']))
        with TemporaryDirectory(prefix='net-tab-native-') as folder:
            path=Path(folder)/'literal-tabs.polyproj';save_project(path,project)
            disk=load_file(path)['project']['documents'][0]['states'][0]
            self.assertEqual(disk['netLayout']['tabOptions'],prefs);self.assertEqual(disk['netHistory'],state['netHistory'])
            self.assertEqual(disk['netLayout']['tabRecords'],net['tabRecords'])
        other=deepcopy(model);other['id']='another-owner'
        with self.assertRaisesRegex(GeometryError,'another source'):unfold_source(other,tab_options=prefs)
        for bad in [dict(prefs,widthMm=True),dict(prefs,widthMm=float('nan')),dict(prefs,edges=[{'edge':0,'mode':'single','face':999}]),dict(prefs,edges=[{'edge':0,'mode':'none'}]*2)]:
            with self.assertRaises(GeometryError):unfold_source(model,tab_options=bad)


if __name__=='__main__':unittest.main()
