from copy import deepcopy
from itertools import combinations, product
import json

import numpy as np
import pytest

from engine.source_zonohedron import source_zonohedron, verify_source_zonohedron
from engine.geometry import GeometryError, hull


def cube(translation=None):
    translation = np.array(translation or [0,0,0])
    source = hull((np.array(list(product((-1,1),repeat=3)))+translation).tolist())
    source['id']='literal-cube'
    source['metadata']={'coordinateUnits':'mm','custom':{'notes':'historical source'},
        'offColors':{'vertices':[{'encoding':'byte','values':[i,25,128,17]} for i in range(8)],
                     'faces':[{'encoding':'unit','values':[.25,.5,.75,i/6]} for i in range(6)]}}
    return source


@pytest.mark.parametrize('kind,zones,counts',[('vertices',4,(14,24,12)),('edges',3,(8,12,6)),('faces',3,(8,12,6))])
def test_cube_source_feature_direction_counts_supports_full_attributes_and_units(kind,zones,counts):
    source=cube()
    before=deepcopy(source)
    selections=[{'kind':kind,'ids':list(range(len(source[kind])))}]
    model=source_zonohedron(source,selections,edge_length=2)
    e=model['metadata']['sourceZonohedron']
    support=model['metadata']['supportZonohedron']
    assert tuple(len(model[k]) for k in ('vertices','edges','faces')) == counts
    assert len(e['selectedZoneOwners']) == zones
    assert source == before
    assert e['sourceModel'] == before
    assert model['metadata']['coordinateUnits']=='mm'
    assert 'offColors' not in model['metadata']
    assert sorted(owner['sourceEntityId'] for group in e['selectedZoneOwners'] for owner in group)==list(range(len(source[kind])))
    assert support['endpointSignSumsEnumerated']==0
    generators=np.array([g['unitDirection'] for g in support['selectedZones']])*2
    vertices=np.array(model['vertices'])
    for normal in [[1,2,3],[-2,1,.25],[0,0,1]]:
        assert max(vertices @ normal)==pytest.approx(np.abs(generators @ normal).sum()*.5)
    expected_volume=sum(abs(np.linalg.det(generators[list(ids)])) for ids in combinations(range(zones),3))
    assert model['measure']['content']==pytest.approx(expected_volume)
    assert verify_source_zonohedron(json.loads(json.dumps(model)))['passed']
    source['metadata']['offColors']['faces'][0]['values'][3]=.99
    assert e['sourceModel']==before


def test_world_axes_plus_vertex_selection_maximum_and_explicit_center_covariance():
    selections=[{'kind':'world-axes','ids':[0,1,2]},{'kind':'vertices','ids':[0,7]}]
    original=source_zonohedron(cube(),selections,max_zones=3)
    translated=source_zonohedron(cube([11,-7,3]),selections,center=[11,-7,3],max_zones=3)
    assert original['vertices']==translated['vertices']
    assert len(translated['metadata']['sourceZonohedron']['selectedZoneOwners'])==3
    assert original['id']!=translated['id']
    full=source_zonohedron(cube(),selections)
    assert (len(full['vertices']),len(full['faces']))==(14,12)
    group=full['metadata']['sourceZonohedron']['selectedZoneOwners'][-1]
    assert [owner['sourceEntityId'] for owner in group]==[0,7]


def test_mixed_literal_edge_and_face_owners_collapse_parallel_zones_without_color_invention():
    source=cube()
    selections=[{'kind':'edges','ids':list(range(12))},{'kind':'faces','ids':list(range(6))},
                {'kind':'world-axes','ids':[2,0,1]}]
    model=source_zonohedron(source,selections)
    e=model['metadata']['sourceZonohedron']
    assert len(e['selectedZoneOwners'])==3
    assert all({owner['kind'] for owner in group}=={'edges','faces','world-axes'} for group in e['selectedZoneOwners'])
    assert model['measure']['content']==pytest.approx(1)
    assert 'offColors' not in model['metadata']


@pytest.mark.parametrize('center',[False,(),[],[0,0],[0,0,0,0],[True,0,0],[float('nan'),0,0],['0',0,0]])
def test_invalid_center_refused(center):
    with pytest.raises(GeometryError):
        source_zonohedron(cube(),[{'kind':'world-axes','ids':[0,1,2]}],center=center)


@pytest.mark.parametrize('selections',[None,(),[],[{}],[{'kind':'vertices','ids':[]}],
    [{'kind':'vertex','ids':[0]}],[{'kind':'vertices','ids':[True]}],
    [{'kind':'vertices','ids':[0,0]}],[{'kind':'vertices','ids':[8]}],
    [{'kind':'vertices','ids':[-1]}],[{'kind':'world-axes','ids':[3]}],
    [{'kind':'vertices','ids':[0],'unknown':1}],
    [{'kind':'world-axes','ids':[0,1,2]}]*17])
def test_invalid_selection_envelopes_and_ids_refused(selections):
    with pytest.raises(GeometryError):
        source_zonohedron(cube(),selections)


def test_nonzero_source_feature_and_distinct_zone_budget_are_atomic():
    source=cube([1,1,1])
    before=deepcopy(source)
    with pytest.raises(GeometryError,match='zero seed'):
        source_zonohedron(source,[{'kind':'vertices','ids':[0]}])
    assert source==before
    with pytest.raises(GeometryError,match='bound64'):
        source_zonohedron(source,[{'kind':'edges','ids':list(range(12))}]*6)
    assert source==before


@pytest.mark.parametrize('mutate',[lambda m:m.__setitem__('dimension',True),
    lambda m:m.__setitem__('id',''),lambda m:m['faces'].pop(),
    lambda m:m['metadata'].__setitem__('coordinateUnits','yards'),
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,2),
    lambda m:m['vertices'][0].__setitem__(0,float('inf'))])
def test_invalid_source_and_unsupported_metadata_refused(mutate):
    source=cube()
    mutate(source)
    with pytest.raises(GeometryError):
        source_zonohedron(source,[{'kind':'world-axes','ids':[0,1,2]}])


def test_receipt_full_literal_tamper_detection_and_source_only_semantic_changes():
    source=cube()
    selections=[{'kind':'vertices','ids':list(range(8))}]
    model=source_zonohedron(source,selections)
    assert model==source_zonohedron(source,selections)
    changed=deepcopy(source)
    changed['metadata']['offColors']['vertices'][0]['values'][3]=88
    new=source_zonohedron(changed,selections)
    assert new['vertices']==model['vertices']
    assert new['id']!=model['id']
    for mutate in [lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
        lambda m:m['metadata']['sourceZonohedron']['sourceModel']['metadata']['offColors']['faces'][0]['values'].__setitem__(3,.99),
        lambda m:m['metadata']['sourceZonohedron']['selectedZoneOwners'][0][0].__setitem__('sourceEntityId',99),
        lambda m:m['metadata']['sourceZonohedron']['seedDirections'][0].__setitem__(0,99),
        lambda m:m['metadata']['supportZonohedron']['facets'][0]['zeroZoneIds'].append(0),
        lambda m:m['numeric'].__setitem__('certified',True)]:
        broken=deepcopy(model)
        mutate(broken)
        with pytest.raises(GeometryError):
            verify_source_zonohedron(broken)
