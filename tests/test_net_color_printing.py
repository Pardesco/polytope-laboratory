from copy import deepcopy
from collections import Counter
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from engine.geometry import identity,validate,GeometryError
from engine.generalized_nets import unfold_source
from engine.net_printing import pack_net
from engine.element_annotations import new_document,set_text,set_texture
from engine.formats import save_project,load_file,validate_project
from engine.net_color_printing import face_colors

NS={'s':'http://www.w3.org/2000/svg'}


def cube():
    vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
    faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    colors=[{'encoding':'byte','values':[255,0,0,128]},{'encoding':'unit','values':[1,0,0,128/255]},
            {'encoding':'byte','values':[0,0,255,255]},{'encoding':'unit','values':[0,0,1]},
            {'encoding':'byte','values':[0,255,0,255]},None]
    model={'id':'literal-colored-cube','name':'Independent RGBA cube','dimension':3,'embeddingDimension':3,'interpretation':'convex-polytope','vertices':vertices,
           'faces':faces,'edges':[list(e) for e in edges],'cells':[],'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False},
           'metadata':{'offColors':{'faces':colors},'sourceNotes':'Ordered cube cycles and explicit source colors'}}
    model['fingerprint']=identity(model);assert validate(model)['passed'];return model


def tab_options(model,mode='double'):
    return {'version':1,'sourceId':model['id'],'sourceFingerprint':identity(model),'mode':mode,'widthMm':5,'edges':[]}


def xmls(packed):return [ET.fromstring(p['svg']) for p in packed['pages']]


class ColorPrintingTest(unittest.TestCase):
    def test_detached_source_color_forests_matching_ids_tabs_and_physical_edges(self):
        model=cube();source_before=deepcopy(model);net=unfold_source(model,edge_length_mm=37,tab_options=tab_options(model));before=deepcopy(net)
        packed=pack_net(net,color_mode='separate');self.assertEqual(model,source_before);self.assertEqual(net,before)
        info=packed['colorPrinting'];self.assertEqual(len(info['groups']),4);self.assertEqual(info['groups'][0]['faceIds'],[0,1])
        self.assertTrue(info['crossColorCuts']);self.assertEqual(set(info['printHinges']),set(net['hinges'])-set(info['crossColorCuts']))
        self.assertTrue(packed['validation']['printFoldEndpointReconstructed']);self.assertTrue(packed['validation']['allSourceFacesRepresented'])
        face_seen=[];edge_ids=Counter();tabs=Counter();face_colors_seen={}
        for page,xml in zip(packed['pages'],xmls(packed)):
            page_colors=set()
            for group in xml.findall('.//s:g',NS):
                if 'data-net-face' not in group.attrib:continue
                face=int(group.attrib['data-net-face']);face_seen.append(face);page_colors.add(face_colors(model)[face])
                polygon=group.find('s:polygon',NS);p=np.array([[float(x) for x in point.split(',')] for point in polygon.attrib['points'].split()])
                self.assertTrue(np.allclose(np.linalg.norm(p-np.roll(p,1,axis=0),axis=1),37,atol=1e-5));face_colors_seen[face]=polygon.attrib
            self.assertEqual(len(page_colors),1)
            for path in xml.findall('.//s:path',NS):
                if 'data-net-edge' in path.attrib:edge_ids[int(path.attrib['data-net-edge'])]+=1
                if 'data-net-tab' in path.attrib:
                    edge=int(path.attrib['data-net-tab']);tabs[edge]+=1
                    tokens=path.attrib['d'].replace('M','').replace('L','').split();p=np.array(list(map(float,tokens))).reshape(4,2);u=(p[3]-p[0])/np.linalg.norm(p[3]-p[0])
                    self.assertAlmostEqual(abs(float(np.cross(u,p[1]-p[0]))),5,places=5)
            self.assertEqual(page['sourceFaceIds'],sorted(i for part in page['parts'] for i in part['faceIds']))
        self.assertEqual(sorted(face_seen),list(range(6)));self.assertEqual(edge_ids,Counter({i:2 for i in range(12)}))
        self.assertEqual(tabs,Counter({i:2 for i in range(12) if i not in info['printHinges']}))
        self.assertAlmostEqual(float(face_colors_seen[0]['fill-opacity']),128/255)
        for mapping in info['sourceFaceMap']:
            self.assertEqual(mapping['sourceVertices'],model['faces'][mapping['face']])
            for edge in mapping['edges']:self.assertEqual(edge['hinge'],edge['id'] in info['printHinges'])

    def test_selected_color_batch_and_native_cached_project_history_reopen(self):
        model=cube();net=unfold_source(model,tab_options=tab_options(model,'single'));history={'cursor':0,'sourceFingerprint':identity(model),'states':[{'root':0,'edge_length_mm':25,'tabs':True,'hinges':net['hinges'],'placements':net['placements'],'tab_options':net['tabOptions']}]}
        packed=pack_net(net,color_mode='separate',paper_color=1,print_fill=False)
        self.assertEqual(packed['colorPrinting']['selectedSourceFaceIds'],[0,1]);self.assertFalse(packed['validation']['allSourceFacesRepresented'])
        self.assertTrue(all(p.attrib['fill']=='none' for xml in xmls(packed) for g in xml.findall('.//s:g',NS) if 'data-net-face' in g.attrib for p in [g.find('s:polygon',NS)]))
        state={'model':model,'view':{'netPrint':packed['parameters']},'netHistory':history,'netLayout':net,'netPages':packed,'notes':'Original editable net history'}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'print-source','cursor':0,'states':[state]}]}
        with TemporaryDirectory(prefix='color-net-native-') as folder:
            path=Path(folder)/'source-colored.polyproj';save_project(path,project);opened=load_file(path)['project']['documents'][0]['states'][0]
        self.assertEqual(opened['netLayout']['hinges'],net['hinges']);self.assertEqual(opened['netHistory'],history)
        self.assertEqual(opened['model']['metadata'],model['metadata']);self.assertEqual(opened['netPages']['colorPrinting'],packed['colorPrinting'])
        forged=deepcopy(project);forged['documents'][0]['states'][0]['netLayout']['printSource']['metadata']['offColors']['faces'][0]['values']=[13,14,15,16]
        rebuilt=validate_project(forged)['documents'][0]['states'][0];self.assertEqual(rebuilt['netPages']['colorPrinting'],packed['colorPrinting'])
        with self.assertRaisesRegex(GeometryError,'another source'):pack_net(net,color_mode='separate',paper_color=0,color_source_id='foreign')
        with self.assertRaisesRegex(GeometryError,'existing representative'):pack_net(net,color_mode='separate',paper_color=999)

    def test_auto_images_legacy_single_tabs_source_rgba_and_text_preserved(self):
        model=cube();model['interpretation']='generalized-complex';before=deepcopy(model);net=unfold_source(model)
        self.assertEqual(pack_net(net,color_mode='auto')['colorPrinting']['effectiveMode'],'separate')
        document=set_text(new_document(model),model,'face',0,'<b>Retained source print label</b>');png=io.BytesIO();Image.new('RGBA',(2,2),(75,91,112,107)).save(png,format='PNG');document=set_texture(document,model,0,png.getvalue())
        annotated=unfold_source(model,element_annotations=document);packed=pack_net(annotated,color_mode='separate');self.assertEqual(model,before)
        self.assertEqual(pack_net(annotated,color_mode='auto')['colorPrinting']['effectiveMode'],'mixed')
        self.assertTrue(any('Retained source print label' in p['svg'] for p in packed['pages']));self.assertTrue(any('data:image/png;base64,' in p['svg'] for p in packed['pages']))
        count=Counter(int(p.attrib['data-net-tab']) for xml in xmls(packed) for p in xml.findall('.//s:path',NS) if 'data-net-tab' in p.attrib)
        self.assertEqual(count,Counter({i:1 for i in range(12) if i not in packed['colorPrinting']['printHinges']}))
        plain=deepcopy(model);plain['metadata'].pop('offColors');self.assertEqual(pack_net(unfold_source(plain),color_mode='auto')['colorPrinting']['effectiveMode'],'separate')
        convex=cube();self.assertEqual(pack_net(unfold_source(convex),color_mode='auto')['colorPrinting']['effectiveMode'],'mixed')


if __name__=='__main__':unittest.main()
