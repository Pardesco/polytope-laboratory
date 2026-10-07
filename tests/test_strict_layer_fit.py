"""Independent equal-edge height fixtures and atomic infeasibility checks."""
from copy import deepcopy
import math
import pytest

from engine.generators import generate
from engine.geometry import GeometryError
from engine.segmentotopes import point_source
from engine.strict_layer_fit import fit_strict_layer_join
from engine.server import dispatch


def cube(size=1):
    return generate('block', sizes=[size]*3)


def check(model, edge, height):
    info=model['metadata']['strictLayerFit']
    assert info['certified'] is False
    assert info['resolvedPositiveHeight']==pytest.approx(height)
    assert info['targetEdgeLength']==pytest.approx(edge)
    assert model['metadata']['convexLayerJoin']['height']==pytest.approx(height)
    assert info['strictPredicateEvidence']['status']=='passed'
    assert info['strictPredicateEvidence']['sourceModelId']==model['id']
    assert info['strictPredicateEvidence']['sourceFingerprint']==model['fingerprint']
    assert all(math.dist(model['vertices'][a],model['vertices'][b])==pytest.approx(edge) for a,b in model['edges'])
    assert model['numeric']['certified'] is False
    return model


@pytest.mark.parametrize('size',[.125,1,3,1000])
def test_same_cube_layers_resolve_a_tesseract(size):
    base=cube(size);top=deepcopy(base);before=deepcopy((base,top))
    result=check(fit_strict_layer_join(base,top),size,size)
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')]==[16,32,24,8]
    assert result['metadata']['strictLayerFit']['lateralEdgeCount']==8
    assert result['measure']['content']==pytest.approx(size**4)
    assert (base,top)==before


@pytest.mark.parametrize('size',[.25,1,2])
def test_cube_to_center_point_has_half_edge_positive_height(size):
    base=cube(size);top=point_source(source_id='center-point');before=deepcopy((base,top))
    result=check(fit_strict_layer_join(base,top),size,size/2)
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')]==[9,20,18,7]
    assert result['measure']['content']==pytest.approx(size**4/8)
    assert (base,top)==before


def test_regular_simplex_height_is_independent_circumradius_equation():
    base=generate('regular',key='tetrahedron')
    edge=math.dist(*(base['vertices'][v] for v in base['edges'][0]))
    center=[sum(p[i] for p in base['vertices'])/4 for i in range(3)]
    top=point_source(center,source_id='tetra-center')
    height=edge*math.sqrt(5/8)
    model=check(fit_strict_layer_join(base,top),edge,height)
    assert [len(model[k]) for k in ('vertices','edges','faces','cells')]==[5,10,10,5]
    assert model['measure']['content']==pytest.approx(math.sqrt(5)*edge**4/96)


def test_explicit_common_rigid_positioning_is_retained_without_orientation_guess():
    base=cube();rotation=[[0,-1,0],[1,0,0],[0,0,1]]
    top=deepcopy(base)
    model=check(fit_strict_layer_join(base,top,base_matrix=rotation,top_matrix=rotation,
                base_translation=[2,3,4],top_translation=[2,3,4]),1,1)
    layers=model['metadata']['convexLayerJoin']['layers']
    assert all(layer['transform']['matrix']==rotation for layer in layers)
    assert all(layer['transform']['translation']==[2,3,4] for layer in layers)


@pytest.mark.parametrize('case',['unequal-source-edges','unequal-layer-scales','off-center-point','translated-copy','zero-height','star','shear'])
def test_infeasible_sources_refuse_atomically(case):
    base=cube();top=deepcopy(base);options={}
    if case=='unequal-source-edges':base=generate('block',sizes=[1,2,1]);top=deepcopy(base)
    elif case=='unequal-layer-scales':top=cube(2)
    elif case=='off-center-point':top=point_source([.1,0,0],source_id='offset')
    elif case=='translated-copy':options['top_translation']=[.25,0,0]
    elif case=='zero-height':top=point_source([math.sqrt(.75),0,0],source_id='wide')
    elif case=='star':base=generate('rational-antiprism',symbol='5/2');top=deepcopy(base)
    elif case=='shear':options['top_matrix']=[[1,.2,0],[0,1,0],[0,0,1]]
    before=deepcopy((base,top,options))
    with pytest.raises(GeometryError):fit_strict_layer_join(base,top,**options)
    assert (base,top,options)==before
    check(fit_strict_layer_join(cube(),point_source(source_id='recovery')),1,.5)


def test_actual_native_project_roundtrip_keeps_fit_and_source_rgba(tmp_path):
    base=cube();base['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.2,.4,.8,.25]}]*6,'cells':[]}
    model=fit_strict_layer_join(base,deepcopy(base))
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'fit','cursor':0,
        'states':[{'model':model,'view':{'coordinateUnit':'mm'},'notes':'Independent height fit'}]}]}
    path=str(tmp_path/'fit.polyproj')
    dispatch({'op':'save','params':{'path':path,'project':project}})
    restored=dispatch({'op':'load','params':{'path':path}})['project']['documents'][0]['states'][0]['model']
    assert restored['metadata']==model['metadata']
    assert restored['provenance']==model['provenance']
    assert restored['metadata']['convexLayerJoin']['layers'][0]['sourceSnapshot']==base


@pytest.mark.parametrize('top_kind',['copy','point'])
def test_native_fit_recipe_replay_and_parameter_branch_keep_resolved_height(top_kind,tmp_path):
    base=cube()
    top=deepcopy(base) if top_kind=='copy' else {'kind':'point','source_id':'fit-apex-stable','coordinates':[0,0,0]}
    source={'id':'fit-source','cursor':0,'states':[{'model':base,'view':{'coordinateUnit':'cm'},'notes':'Fit source'}]}
    params={'top':top}
    made=dispatch({'op':'recipe-run','params':{'document':source,'operation':'fit-strict-layer-join','parameters':params}})
    model=made['states'][-1]['model'];height=1 if top_kind=='copy' else .5
    check(model,1,height)
    node=made['operationHistory']['nodes'][-1]
    assert node['op']=='fit-strict-layer-join' and node['algorithmVersion']=='0.1.0'
    assert node['params']==params and 'height' not in node['params']
    replayed=dispatch({'op':'recipe-replay','params':{'document':made}})
    check(replayed['states'][0]['model'],1,height)
    branched=dispatch({'op':'recipe-branch','params':{'document':made,'parameters':params}})
    check(branched['states'][-1]['model'],1,height)
    assert source['cursor']==0 and len(source['states'])==1


@pytest.mark.parametrize('extra',[{'height':1},{'tolerance':1e-3},{'guess_orientation':True}])
def test_fit_transport_rejects_implicit_or_conflicting_options(extra):
    base=cube()
    with pytest.raises(GeometryError):dispatch({'op':'fit-strict-layer-join','model':base,'params':{'top':deepcopy(base),**extra}})
    result=dispatch({'op':'fit-strict-layer-join','model':base,'params':{'top':deepcopy(base)}})
    check(result,1,1)
