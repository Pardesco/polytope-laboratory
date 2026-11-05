from copy import deepcopy
import json
import pytest
from engine.generators import regular
from engine.geometry import GeometryError,identity
from engine.stellation import arrangement
from engine.stellation_diagrams import diagram_data,enumerate_supported,make_base
from engine.formats import validate_project
from engine.server import dispatch


@pytest.fixture(scope='module')
def octa():
    source=regular('octahedron');a=arrangement(source)
    return source,a,diagram_data(a,source)


@pytest.fixture(scope='module')
def ico():
    source=regular('icosahedron');a=arrangement(source,box_scale=10)
    return source,a,diagram_data(a,source)


def test_source_bound_diagrams_and_orbit_actions(octa):
    source,a,g=octa;s=g['symmetry'];assert s['sourceOrder']==s['actingOrder']==48
    assert sorted(map(len,s['orbits']['full']))==[1,8]
    assert s['preservesFullGroup'] and s['maxVertexResidual']<s['tolerance'] and not s['certified']
    assert not s['clippedBoundedRegionIds'] and len(g['diagrams'])==8
    domain=set(s['regionIds']);assert all(set(action['regionIds'])==domain for action in s['actions'])
    assert {action['orientation'] for action in s['actions']}=={-1,1}
    for d in g['diagrams']:
        assert d['sourceFace']==a['source']['faceIds'][d['plane']]
        for p in d['polygons']:
            assert {a['regions'][i]['signs'][d['plane']] for i in p['regionIds']}=={-1,1}
    bad=deepcopy(source);bad['vertices'][0][0]+=.01
    with pytest.raises(GeometryError):diagram_data(a,bad)


def test_diagram_operation_dispatch(octa):
    source,a,g=octa
    reply=dispatch({'op':'stellation-diagram-data','model':source,'params':{'arrangement':a}})
    assert reply['symmetry']['orbits']==g['symmetry']['orbits']
    assert reply['arrangementSha256']==g['arrangementSha256']


@pytest.mark.parametrize('orientation,mirrors,count,chiral',[('full',True,16,0),('proper',True,18,2),('proper',False,20,4)])
def test_icosahedron_supported_counts_and_chiral_pairs(ico,monkeypatch,orientation,mirrors,count,chiral):
    source,a,g=ico
    monkeypatch.setattr('engine.stellation_diagrams.diagram_data',lambda *_:g)
    result=enumerate_supported(a,source,orientation,mirrors)
    assert len(result['candidates'])==count
    assert sum(not r['reflexibleWithinSourceGroup'] for r in result['candidates'])==chiral
    assert len(g['symmetry']['regionIds'])==473 and len(g['symmetry']['orbits']['proper'])==12
    assert result['termination']=='exhausted' and result['completeWithinDeclaredCriteria']
    assert not result['criteria']['millerRules'] and not result['unrestrictedStellationEnumerationComplete']
    for candidate in result['candidates']:
        selected=set(candidate['regionIds'])
        assert all(set(g['nodes'][i]['supports'])<=selected for i in selected)


@pytest.mark.parametrize('key,scale,count',[('octahedron',3,2),('dodecahedron',5,4)])
def test_small_supported_counts_and_limits(key,scale,count,monkeypatch):
    source=regular(key);a=arrangement(source,box_scale=scale);g=diagram_data(a,source)
    monkeypatch.setattr('engine.stellation_diagrams.diagram_data',lambda *_:g)
    assert len(enumerate_supported(a,source)['candidates'])==count
    limited=enumerate_supported(a,source,max_results=1)
    assert limited['termination']=='result-limit' and not limited['completeWithinDeclaredCriteria']
    with pytest.raises(GeometryError):enumerate_supported(a,source,orientation='none')


def test_clipped_domain_does_not_claim_supported_completion():
    source=regular('dodecahedron');a=arrangement(source);g=diagram_data(a,source)
    assert g['symmetry']['clippedBoundedRegionIds'] and not g['symmetry']['preservesFullGroup']
    with pytest.raises(GeometryError,match='enlarge'):enumerate_supported(a,source)


def test_saved_diagram_state_make_base_history_and_replay(octa):
    source,a,g=octa;selected=g['symmetry']['regionIds'];before=deepcopy(a)
    params={'region_signs':[a['regions'][i]['signs'] for i in selected],'box_scale':3,'plane_ids':a['source']['faceIds'],'bounds':a['bounds']}
    view={'derivedMode':'stellation','stellation':{'selectedRegions':selected,'diagramPlane':2,'diagramSymmetry':'proper','diagramSide':'above','diagramAttached':True,'diagramFill':False,
          'cellSelectionHistory':{'version':1,'sourceFingerprint':g['sourceFingerprint'],'arrangementSha256':g['arrangementSha256'],'steps':[{'before':[],'after':selected,'action':'toggle','regionId':selected[0]}],'cursor':1}}}
    doc={'id':'stellation','cursor':0,'states':[{'model':source,'view':view,'arrangement':a,'notes':'keep source notes'}]}
    result=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'stellation-make-base','parameters':params}})
    assert result['cursor']==1 and len(result['states'])==2 and a==before
    assert result['states'][1]['model']['measure']['content']==pytest.approx(4)
    assert result['states'][1]['view']['derivedMode']=='section' and 'stellation' not in result['states'][1]['view']
    project=validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,'active':0,'documents':[result]})))
    saved=project['documents'][0];assert saved['states'][0]['view']==view
    replay=dispatch({'op':'recipe-replay','params':{'document':saved}})
    assert identity(replay['states'][0]['model'])==identity(saved['states'][1]['model'])
    assert saved['states'][1]['notes']=='keep source notes'
    with pytest.raises(GeometryError):make_base(source,params['region_signs']*2)
    with pytest.raises(GeometryError):make_base(source,[[True]*8])
    with pytest.raises(GeometryError):make_base(source,[[1]])
