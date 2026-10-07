import numpy as np
import pytest
from engine.generators import regular
from engine.nets import unfold, net_svg, extract_entity
from engine.geometry import GeometryError

@pytest.mark.parametrize('key',['tetrahedron','cube','octahedron','dodecahedron','icosahedron'])
def test_net_face_areas_and_hinge_lengths(key):
    m=regular(key);net=unfold(m)
    assert net['validation']['allFacesRepresented']
    assert net['validation']['areaPreserved']
    assert len(net['hinges'])==len(m['faces'])-1
    assert len(net['faces'])==len(m['faces'])
    for f in net['faces']:
        points=np.asarray(f['points'])
        for i,e in enumerate(f['edges']):
            a,b=m['edges'][e['id']]
            expected=np.linalg.norm(np.asarray(m['vertices'][a])-m['vertices'][b])*net['scale']
            assert np.linalg.norm(points[(i+1)%len(points)]-points[i])==pytest.approx(expected)
    assert 'mm"' in net_svg(net) and 'Print at 100%' in net_svg(net)

def test_cell_and_face_extraction():
    c=extract_entity(regular('tesseract'))
    assert [len(c[k]) for k in ('vertices','edges','faces')]==[8,12,6]
    assert c['measure']['content']==pytest.approx(8)
    f=extract_entity(regular('cube'),'face',0)
    assert len(f['vertices'])==4 and f['measure']['content']==pytest.approx(4)
    with pytest.raises(GeometryError): unfold(regular('tesseract'))
