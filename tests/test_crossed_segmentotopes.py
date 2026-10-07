"""Independent crossed square benchmark and literal source-ownership checks."""
from collections import Counter
from copy import deepcopy
import hashlib
import math

import numpy as np
import pytest

import engine.crossed_segmentotopes as kernel
import engine.geometry as geometry
from engine.antiprisms import rational_antiprism
from engine.convex_classification import analyze_convex_boundary
from engine.crossed_segmentotopes import crossed_antiprism_segmentotope
from engine.formats import load_file, save_project, validate_project
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.history import canonical_model


def info(model): return model['metadata']['crossedAntiprismSegmentotope']
def counts(model): return tuple(len(model[k]) for k in ('vertices','edges','faces','cells'))


def independent_square_reference(height=1, depth=1):
    a = math.sqrt(.5)
    # A literal 4/3 crossed antiprism: cap cycles are ordinary squares traversed
    # backwards, while the upper ring uses the raw 135-degree phase.
    factor_vertices = [[1,0,-height/2],[0,1,-height/2],[-1,0,-height/2],[0,-1,-height/2],
                       [-a,a,height/2],[-a,-a,height/2],[a,-a,height/2],[a,a,height/2]]
    factor_faces = [[1,2,3,0],[4,7,6,5],
                    [0,3,4],[4,3,7],[1,0,5],[5,0,4],[2,1,6],[6,1,5],[3,2,7],[7,2,6]]
    edges = sorted({tuple(sorted((a,b))) for f in factor_faces for a,b in zip(f,f[1:]+f[:1])})
    vertices = [[x,y,t,z] for t in (-depth/2,depth/2) for x,y,z in factor_vertices]
    faces = [list(reversed(f)) for f in factor_faces] + [[v+8 for v in f] for f in factor_faces]
    faces += [[a,b,b+8,a+8] for a,b in edges]
    edge_face = {edge:20+i for i,edge in enumerate(edges)}
    cell_sets = [set(range(10)),set(range(10,20))]
    for i,f in enumerate(factor_faces):
        cell_sets.append({i,i+10}|{edge_face[tuple(sorted((a,b)))] for a,b in zip(f,f[1:]+f[:1])})
    return vertices,faces,cell_sets,factor_vertices,factor_faces


def mapped_cell(model,cell_id,drop_axis):
    cell = model['cells'][cell_id]
    ids = sorted({v for f in cell for v in model['faces'][f]})
    lookup = {v:i for i,v in enumerate(ids)}
    vertices = [[x for a,x in enumerate(model['vertices'][v]) if a != drop_axis] for v in ids]
    faces = [[lookup[v] for v in model['faces'][f]] for f in cell]
    edges = sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    return {'id':'independent-cell','dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
            'vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':[],'metadata':{},
            'numeric':{'mode':'float64-approximate','certified':False}}


def test_full_square_crossed_benchmark_matches_independent_coordinates_cycles_cells():
    result = crossed_antiprism_segmentotope('4/3',height=1,depth=1)
    vertices,faces,cells,_,_ = independent_square_reference()
    assert counts(result) == (16,40,36,12)
    assert np.allclose(result['vertices'],vertices,rtol=0,atol=4e-16)
    expected = {tuple(canonical_cycle(f)) for f in faces}
    assert {tuple(canonical_cycle(f)) for f in result['faces']} == expected
    expected_cells = {frozenset(tuple(canonical_cycle(faces[f])) for f in cell) for cell in cells}
    assert {frozenset(tuple(canonical_cycle(result['faces'][f])) for f in cell) for cell in result['cells']} == expected_cells
    expected_edges = {frozenset((a,b)) for f in faces for a,b in zip(f,f[1:]+f[:1])}
    assert {frozenset(e) for e in result['edges']} == expected_edges
    assert result['interpretation'] == 'generalized-complex' and result['numeric']['certified'] is False
    assert 'measure' not in result and result['validation']['passed']
    assert len(info(result)['crossedAntiprismLateralCellIds']) == 2
    assert len(info(result)['triangularPrismLateralCellIds']) == 8
    assert len(info(result)['layerCapCellIds']) == 2


def test_benchmark_layer_caps_are_true_cubes_and_lateral_caps_are_truly_nonconvex():
    result = crossed_antiprism_segmentotope('4/3',height=1,depth=math.sqrt(2))
    for layer in info(result)['layers']:
        assert layer['convexCaps'] and layer['singleConvexLayer']
        assert {result['vertices'][v][3] for v in layer['vertexIds']} == {layer['fourthCoordinate']}
        cap = mapped_cell(result,layer['capCellIds'][0],3)
        assert counts(cap) == (8,12,6,0)
        assert all(len(face) == 4 for face in cap['faces'])
        assert all(math.dist(cap['vertices'][a],cap['vertices'][b]) == pytest.approx(math.sqrt(2)) for a,b in cap['edges'])
        # Hull is independently allowed as a verification reference in tests,
        # never the constructor's definition or replacement incidence.
        assert analyze_convex_boundary(cap)['status'] == 'passed'
    for cell_id in info(result)['crossedAntiprismLateralCellIds']:
        cap = mapped_cell(result,cell_id,2)
        assert counts(cap) == (8,16,10,0)
        assert analyze_convex_boundary(cap)['status'] == 'non-convex'
        # An explicit triangular facet cuts through its other source vertices:
        # this is not a convex source with a different label.
        face = next(f for f in cap['faces'] if len(f) == 3)
        p = np.asarray(cap['vertices']);a,b,c = p[face]
        n = np.cross(b-a,c-a); distances = (p-a)@n
        assert float(np.min(distances)) < -1e-5 and float(np.max(distances)) > 1e-5
    for cell_id in info(result)['triangularPrismLateralCellIds']:
        assert len(result['cells'][cell_id]) == 5


def test_constructor_and_native_gate_never_call_hull(monkeypatch):
    def fail(*args,**kw): raise AssertionError('Crossed incidence must not call Hull')
    monkeypatch.setattr(geometry,'hull',fail)
    result = crossed_antiprism_segmentotope('4/3',height=1)
    assert counts(result) == (16,40,36,12)


@pytest.mark.parametrize('symbol',['4/3','4/-3',' 4 / +3 ','5/3','5/-3','6/4','6/-4','10/6'])
def test_raw_signed_unreduced_factor_and_transposed_ownership_preserved(symbol):
    result = crossed_antiprism_segmentotope(symbol,height=1.2,depth=2)
    evidence = info(result); factor = evidence['sourceFactorModel']; v = len(factor['vertices'])
    assert evidence['symbol'] == symbol
    assert evidence['rawUpperRotationRadians'] == math.pi*evidence['d']/evidence['n']
    assert evidence['sourceFactorFingerprint'] == identity(factor)
    assert evidence['sourceFactorSnapshotSha256'] == hashlib.sha256(kernel._bounded_json(factor)).hexdigest()
    assert evidence['coordinateOwnership']['sourcePrismToOutputAxisOrder'] == [0,1,3,2]
    assert evidence['resultSourceModelId'] == result['id'] and evidence['resultSourceFingerprint'] == identity(result)
    for output_id, record in enumerate(evidence['maps']['vertices']):
        x,y,z = factor['vertices'][record['sourceVertexId']]
        t = -1. if record['intervalEndpoint'] == 0 else 1.
        assert result['vertices'][output_id] == [x,y,t,z]
    assert result['vertices'][v:] == [[x,y,1.,z] for x,y,z in factor['vertices']]
    if evidence['n'] == 6:
        assert evidence['d'] in (-4,4) and counts(result) == (24,60,56,20)
        assert len(evidence['componentPartitions']) == 2
        assert all(layer['convexCaps'] and not layer['singleConvexLayer'] for layer in evidence['layers'])
    if evidence['n'] == 5:
        assert all(not layer['convexCaps'] for layer in evidence['layers'])
    assert evidence['recoverableCompoundComponents'] is False and 'components' not in result


def test_explicit_common_rigid_orientation_is_not_a_stella_gyro_alias():
    matrix = [[0,-1,0],[1,0,0],[0,0,-1]]
    ordinary = crossed_antiprism_segmentotope('4/3',height=1,depth=1.5)
    reflected = crossed_antiprism_segmentotope('4/3',height=1,depth=1.5,orientation=matrix)
    assert reflected['vertices'] == [[-y,x,-z,w] for x,y,z,w in ordinary['vertices']]
    assert reflected['edges'] == ordinary['edges'] and reflected['faces'] == ordinary['faces'] and reflected['cells'] == ordinary['cells']
    assert info(reflected)['commonOrientation']['determinant'] == pytest.approx(-1)
    assert info(reflected)['sourceFactorModel']['vertices'] == info(ordinary)['sourceFactorModel']['vertices']


def test_four_sizing_modes_agree_with_unit_base_edges_and_real_explicit_side_height():
    radius = 1/math.sqrt(2); horizontal = math.sqrt(1+math.sqrt(.5))
    side = math.hypot(horizontal,1)
    models = [crossed_antiprism_segmentotope('4/3',depth=1,**kw) for kw in (
        {'radius':radius,'height':1},{'base_edge':1,'height':1},
        {'radius':radius,'side_edge':side},{'base_edge':1,'side_edge':side})]
    for model in models:
        assert np.allclose(model['vertices'],models[0]['vertices'],rtol=0,atol=1e-15)
        assert info(model)['baseEdge'] == pytest.approx(1) and info(model)['height'] == pytest.approx(1)
        assert info(model)['sideEdge'] == pytest.approx(side)
        assert model['faces'] == models[0]['faces'] and model['cells'] == models[0]['cells']


def test_equal_triangle_crossed_pentagram_default_remains_nonconvex_no_uniformity_claim():
    result = crossed_antiprism_segmentotope('5/3')
    source = info(result)['sourceFactorModel']['metadata']['rationalAntiprism']
    assert source['sideTrianglesEquilateralWithinTolerance']
    assert info(result)['baseEdge'] == pytest.approx(info(result)['sideEdge'])
    assert all(not layer['singleConvexLayer'] for layer in info(result)['layers'])
    assert result['interpretation'] == 'generalized-complex' and 'measure' not in result


def test_disconnected_raw_cycles_partition_all_literal_incidence_once_and_retain_historical_ids():
    result = crossed_antiprism_segmentotope('6/4',height=1)
    evidence = info(result)
    for kind in ('vertices','edges','faces','cells'):
        owners = Counter(i for part in evidence['componentPartitions'] for i in part['maps'][kind])
        assert set(owners) == set(range(len(result[kind]))) and all(n == 1 for n in owners.values())
    historical = evidence['sourceFactorModel']['metadata']['rationalAntiprism']['sourceModel']
    legitimate_ids = {c['id'] for c in historical['components']}
    for partition in evidence['componentPartitions']:
        assert partition['sourceComponentId'] is None
        assert partition['sourceFactorPartitionId'] in ('partition-0','partition-1')
        assert len(partition['historicalSourceComponentIds']) == 1
        record = partition['historicalSourceComponentIds'][0]
        assert record['sourceModelId'] == historical['id'] and record['componentId'] in legitimate_ids
    assert evidence['sourceFactorModel']['metadata']['rationalAntiprism']['orderedSourceCycles'] == [[0,4,2],[1,5,3]]


def test_rgb_rgba_factor_attributes_native_save_and_metadata_are_immutable(tmp_path):
    colors = [{'encoding':'unit','values':[.1,.2,.3,.4]},{'encoding':'byte','values':[10,20,30,128]}]
    original = deepcopy(colors)
    result = crossed_antiprism_segmentotope('6/4',height=1,cap_colors=colors)
    assert colors == original
    evidence = info(result); source = evidence['sourceFactorModel']
    assert source['metadata']['rationalAntiprism']['sourceModel']['metadata']['offColors']['faces'] == original
    for i,record in enumerate(evidence['maps']['faces']):
        expected = source['metadata']['offColors']['faces'][record['sourceFaceId']] if record['role'] == 'source-face' else None
        assert result['metadata']['offColors']['faces'][i] == expected
    assert all(value is None for value in result['metadata']['offColors']['cells'])
    project = {'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'crossed-native','cursor':0,'states':[{'model':result,'view':{}}]}]}
    path = tmp_path/'crossed.json'; save_project(path,project)
    restored = load_file(path)['project']['documents'][0]['states'][0]['model']
    assert canonical_model(restored) == canonical_model(result)
    assert restored['metadata'] == result['metadata'] and restored['provenance'] == result['provenance']
    assert 'measure' not in restored and colors == original


@pytest.mark.parametrize('params',[
    {'symbol':'4'}, {'symbol':'5/2'}, {'symbol':'4/2'}, {'symbol':'0/1'}, {'symbol':'5/5'},
    {'symbol':True}, {'symbol':10**500}, {'symbol':'4/3','height':None},
    {'symbol':'3/2'}, {'depth':True,'height':1}, {'depth':0,'height':1},
    {'depth':-1,'height':1}, {'depth':10**500,'height':1}, {'depth':float('nan'),'height':1},
    {'height':10**500}, {'radius':10**500,'height':1}, {'height':0},
    {'radius':1,'base_edge':1,'height':1},{'height':1,'side_edge':2},
    {'symbol':'4/3','side_edge':1}, {'gyro':True,'height':1}, {'crossed':True,'height':1},
    {'orientation':[[2,0,0],[0,1,0],[0,0,1]],'height':1},
    {'orientation':[[10**500,0,0],[0,1,0],[0,0,1]],'height':1},
    {'orientation':'gyro2','height':1}, {'cap_colors':[{'encoding':'unit','values':[2,0,0]}],'height':1},
    {'cap_colors':[{'encoding':'unit','values':[.1,.2,.3],'invalid':'\ud800'}],'height':1}])
def test_invalid_parameters_are_structured_not_silent_subset_or_false_default(params):
    with pytest.raises(GeometryError): crossed_antiprism_segmentotope(**params)


@pytest.mark.parametrize('params',[
    {'height':1e-20}, {'depth':1e-20,'height':1}, {'radius':5e-324,'height':1},
    {'symbol':'2001/2000','height':1}])
def test_scale_and_initial_resource_frontier_reject(params):
    with pytest.raises(GeometryError): crossed_antiprism_segmentotope(**params)


@pytest.mark.parametrize('scale',[1e-50,1e50])
def test_proportionate_scale_avoids_solid_measure_path(scale):
    result = crossed_antiprism_segmentotope('4/3',radius=scale,height=scale,depth=scale)
    assert counts(result) == (16,40,36,12) and result['validation']['passed']
    assert 'measure' not in result and info(result)['radius'] == scale


def test_native_gate_failure_is_structured_and_cannot_commit_false_volume(monkeypatch):
    real = validate_project
    def false_volume(project):
        result = real(project)
        result['documents'][0]['states'][0]['model']['measure'] = {'content':1}
        return result
    monkeypatch.setattr(kernel,'validate_project',false_volume)
    with pytest.raises(GeometryError,match='inferred a solid measure'): crossed_antiprism_segmentotope('4/3',height=1)
