from collections import Counter
from copy import deepcopy
import xml.etree.ElementTree as ET
import numpy as np
import pytest
from engine.generators import regular
from engine.nets import unfold
from engine.net_printing import pack_net
from engine.geometry import GeometryError
from engine.formats import save_project,load_file


def test_multiple_pages_preserve_all_faces_edge_labels_and_single_global_tabs():
    model=regular('dodecahedron');net=unfold(model,hinges=[],edge_length_mm=65);before=deepcopy(net);packed=pack_net(net)
    assert packed['pageCount']==6 and packed['contentScale']==1 and net==before
    namespace={'s':'http://www.w3.org/2000/svg'};face_labels=Counter();edge_labels=Counter();tabs=Counter()
    for page in packed['pages']:
        xml=ET.fromstring(page['svg']);assert xml.attrib['width']=='210mm' and xml.attrib['height']=='297mm'
        for text in xml.findall('.//s:text',namespace):
            if text.text.startswith('F'):face_labels[text.text]+=1
            if text.text.startswith('E'):edge_labels[text.text]+=1
        tabs.update(int(p.attrib['data-net-tab']) for p in xml.findall('.//s:path',namespace) if 'data-net-tab' in p.attrib)
    assert face_labels==Counter({'F'+str(i):1 for i in range(len(model['faces']))})
    assert edge_labels==Counter({'E'+str(i):2 for i in range(len(model['edges']))})
    assert tabs==Counter({i:1 for i in range(len(model['edges']))})


@pytest.mark.parametrize('paper,orientation',[('a4','portrait'),('letter','landscape'),('a3','portrait'),('legal','landscape')])
def test_page_rectangles_are_disjoint_inside_margins_and_geometry_scale_is_unchanged(paper,orientation):
    net=unfold(regular('icosahedron'),hinges=[],edge_length_mm=55);packed=pack_net(net,paper=paper,orientation=orientation,margin_mm=12,gap_mm=6)
    ids=[]
    for page in packed['pages']:
        for i,part in enumerate(page['parts']):
            ids+=part['faceIds'];low,high=np.asarray(part['inkBounds']);assert np.all(low>=12-1e-8) and np.all(high<=np.asarray([page['widthMm'],page['heightMm']])-12+1e-8)
            for other in page['parts'][i+1:]:
                a,b=np.asarray(other['inkBounds']);assert np.any(np.minimum(high,b)-np.maximum(low,a)<=0)
        xml=ET.fromstring(page['svg']);ns={'s':'http://www.w3.org/2000/svg'}
        for group in xml.findall('.//s:g',ns):
            if 'data-net-face' not in group.attrib:continue
            source=net['faces'][int(group.attrib['data-net-face'])]
            points=np.array([[float(x) for x in p.split(',')] for p in group.find('s:polygon',ns).attrib['points'].split()]);original=np.asarray(source['points'])
            assert np.linalg.norm(points[:,None]-points[None,:],axis=2)==pytest.approx(np.linalg.norm(original[:,None]-original[None,:],axis=2),abs=2e-5)
    assert sorted(ids)==list(range(len(net['faces'])))


def test_oversize_is_diagnosed_without_scaling_or_cutting():
    net=unfold(regular('cube'),edge_length_mm=100);before=deepcopy(net)
    with pytest.raises(GeometryError,match='No scaling was applied'):pack_net(net)
    assert net==before
    with pytest.raises(GeometryError):pack_net(net,paper='custom',width_mm=10,height_mm=20)
    with pytest.raises(GeometryError):pack_net(net,margin_mm=110)
    result=pack_net(net,paper='custom',width_mm=600,height_mm=600)
    assert result['contentScale']==1 and result['pageCount']==1


def test_packed_page_caches_are_regenerated_on_native_roundtrip(tmp_path):
    source=regular('cube');net=unfold(source);packed=pack_net(net);original=deepcopy(packed);packed['pages'][0]['svg']='<svg>untrusted cached output</svg>'
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':source,'netLayout':net,'netPages':packed}]}]}
    path=tmp_path/'pages.polyproj';save_project(path,project);restored=load_file(path)['project']['documents'][0]['states'][0]['netPages']
    assert restored==original
