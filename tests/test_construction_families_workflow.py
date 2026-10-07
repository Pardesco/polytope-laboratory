"""Actual next-release dispatch, source ownership, history and native I/O."""
from collections import Counter
from copy import deepcopy
from itertools import combinations, product
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.compounds import retrieve_source
from engine.formats import validate_project
from engine.geometry import GeometryError, identity, validate
from engine.history import canonical_model, create_history, record_source, record_operation
from engine.products import polygon_prism
from engine.star_polygons import regular_star_polygon
from engine.server import dispatch


KINDS = ('vertices','edges','faces','cells')
BYTE_RGBA = {'encoding':'byte','values':[7,70,240,128]}
UNIT_RGBA = {'encoding':'unit','values':[.2,.3,.5,.25]}


def generate(kind, **params):
    request = {'op':'generate','params':{'kind':kind,**params}}
    before = deepcopy(request)
    result = dispatch(request)
    assert request == before
    assert validate(result)['passed'] and result['fingerprint'] == identity(result)
    assert result['numeric']['certified'] is False
    return result


def counts(model):
    return tuple(len(model[kind]) for kind in KINDS)


def document(model, view=None):
    return {'id':'workflow-source','cursor':0,'states':[{
        'model':model,'view':view or {},'notes':'retained source notes'}]}


def current(doc):
    return doc['states'][doc['cursor']]


def recipe(doc, operation, **parameters):
    before = deepcopy(doc)
    result = dispatch({'op':'recipe-run','params':{'document':doc,
        'operation':operation,'parameters':parameters}})
    assert doc == before
    return result


def reopen(doc):
    before = deepcopy(doc)
    result = validate_project(json.loads(json.dumps({'format':'polytope-laboratory',
        'version':1,'active':0,'documents':[doc]},allow_nan=False)))['documents'][0]
    assert doc == before
    return result


def verify_closed(leaf):
    if leaf['dimension'] == 3:
        links = Counter(tuple(sorted((a,b))) for f in leaf['faces'] for a,b in zip(f,f[1:]+f[:1]))
        assert set(links.values()) == {2}
        assert set(links) == {tuple(sorted(e)) for e in leaf['edges']}
    else:
        assert Counter(f for cell in leaf['cells'] for f in cell) == Counter({f:2 for f in range(len(leaf['faces']))})
        for cell in leaf['cells']:
            links = Counter(tuple(sorted((a,b))) for f in cell for a,b in zip(leaf['faces'][f],leaf['faces'][f][1:]+leaf['faces'][f][:1]))
            assert set(links.values()) == {2}


def verify_cube_interval(model):
    """Independent complete hypercube incidence, using only literal corner bits."""
    assert counts(model) == (16,32,24,8)
    corners = [tuple(point) for point in model['vertices']]
    assert set(corners) == set(product((-1,1),repeat=4))
    index = {point:i for i,point in enumerate(corners)}
    expected_edges = {frozenset((a,b)) for a,b in combinations(range(16),2)
        if sum(x != y for x,y in zip(corners[a],corners[b])) == 1}
    assert set(map(frozenset,model['edges'])) == expected_edges
    expected_faces = set()
    for axes in combinations(range(4),2):
        fixed = [d for d in range(4) if d not in axes]
        for values in product((-1,1),repeat=2):
            expected_faces.add(frozenset(i for i,p in enumerate(corners) if all(p[d] == v for d,v in zip(fixed,values))))
    assert set(map(frozenset,model['faces'])) == expected_faces
    for face in model['faces']:
        assert len(face) == 4
        assert all(frozenset((a,b)) in expected_edges for a,b in zip(face,face[1:]+face[:1]))
    expected_cells = {frozenset(index[p] for p in corners if p[d] == sign) for d in range(4) for sign in (-1,1)}
    assert {frozenset(v for f in cell for v in model['faces'][f]) for cell in model['cells']} == expected_cells
    assert all(len(cell) == 6 for cell in model['cells'])


def test_actual_triangular_antiprism_is_complete_octahedron_and_safe_convex_volume():
    model = generate('rational-antiprism',symbol='3')
    assert counts(model) == (6,12,8,0)
    opposite = {(0,4),(1,5),(2,3)}
    expected = np.eye(6)*1.5
    for a,b in opposite:
        expected[a,b] = expected[b,a] = -1.5
    np.testing.assert_allclose(np.asarray(model['vertices']) @ np.asarray(model['vertices']).T,expected,atol=2e-14)
    assert {tuple(sorted(e)) for e in model['edges']} == set(combinations(range(6),2))-opposite
    assert set(map(frozenset,model['faces'])) == {frozenset(v) for v in product((0,4),(1,5),(2,3))}
    assert model['interpretation'] == 'convex-polytope'
    assert model['measure']['content'] == pytest.approx(math.sqrt(6))
    assert len(model['facetEquations']) == 8
    assert model['metadata']['rationalAntiprism']['height'] == pytest.approx(math.sqrt(2))
    restored = current(reopen(document(model)))['model']
    assert canonical_model(restored) == canonical_model(model)
    assert restored['metadata']['rationalAntiprism'] == model['metadata']['rationalAntiprism']


@pytest.mark.parametrize('symbol,cycle,phase,height', [
    ('5/2',[0,2,4,1,3],2*math.pi/5,5**.25),
    ('5/3',[0,3,1,4,2],3*math.pi/5,1),
    ('5/-2',[0,3,1,4,2],-2*math.pi/5,5**.25)])
def test_actual_star_antiprism_raw_phase_source_cycles_and_no_solid_claim(symbol,cycle,phase,height):
    model = generate('rational-antiprism',symbol=symbol,radius=1)
    evidence = model['metadata']['rationalAntiprism']
    assert counts(model) == (10,20,12,0)
    assert evidence['symbol'] == symbol and evidence['upperRotationRadians'] == pytest.approx(phase)
    assert evidence['orderedSourceCycles'] == [cycle]
    assert model['faces'][:2] == [list(reversed(cycle)),[i+5 for i in cycle]]
    assert model['vertices'][5] == pytest.approx([math.cos(phase),math.sin(phase),height/2])
    assert evidence['height'] == pytest.approx(height)
    assert evidence['sourceModel']['metadata']['regularStarPolygon']['symbol'] == symbol
    assert model['interpretation'] == 'generalized-complex'
    assert 'measure' not in model and 'facetEquations' not in model
    assert current(reopen(document(model)))['model']['metadata']['rationalAntiprism'] == evidence


@pytest.mark.parametrize('kind,expected,leaf_counts', [
    ('rational-antiprism',(12,24,16,0),(6,12,8,0)),
    ('antiduoprism',(24,60,56,20),(12,30,28,10))])
def test_actual_disconnected_families_interleaved_owners_keep_delete_replay_and_rgba(kind,expected,leaf_counts):
    params = {'symbol':'6/2','radius':1}
    if kind == 'antiduoprism': params['interval_height'] = 2
    model = generate(kind,**params)
    assert counts(model) == expected and len(model['components']) == 2
    assert model['interpretation'] == 'generalized-complex' and 'measure' not in model
    layers = 1 if kind == 'rational-antiprism' else 2
    expected_vertices = [[a+6*ring+12*layer for layer in range(layers) for ring in (0,1)
        for a in range(parity,6,2)] for parity in (0,1)]
    assert [c['maps']['vertices'] for c in model['components']] == expected_vertices
    source_snapshots = deepcopy(model['metadata']['compound']['sourceModels'])
    model['metadata']['offColors'] = {'faces':[None]*len(model['faces']),'cells':[None]*len(model['cells'])}
    model['metadata']['offColors']['faces'][0] = deepcopy(BYTE_RGBA)
    model['metadata']['offColors']['faces'][-1] = deepcopy(UNIT_RGBA)
    if model['cells']: model['metadata']['offColors']['cells'][0] = deepcopy(UNIT_RGBA)
    original = deepcopy(model)
    for c in model['components']:
        leaf = dispatch({'op':'compound-component','model':model,'params':{'component_id':c['id']}})
        assert counts(leaf) == leaf_counts
        verify_closed(leaf)
        assert leaf['vertices'] == [model['vertices'][i] for i in c['maps']['vertices']]
        source = model
        for index in c['sourcePath']: source = retrieve_source(source,index)
        assert source['id'] == c['sourceModelId'] and identity(source) == c['sourceFingerprint']
        for color_kind in ('faces','cells'):
            expected_colors = [model['metadata']['offColors'][color_kind][i] for i in c['maps'][color_kind]]
            if any(v is not None for v in expected_colors):
                assert leaf['metadata']['offColors'][color_kind] == expected_colors
    assert model == original
    source_doc = document(model,{'coordinateUnit':'mm','surfaceOpacity':.6})
    selected = model['components'][0]
    kept = recipe(source_doc,'compound-component',component_id=selected['id'])
    assert counts(current(kept)['model']) == leaf_counts
    dropped = recipe(source_doc,'compound-drop',component_id=selected['id'])
    assert counts(current(dropped)['model']) == leaf_counts
    assert current(dropped)['model']['components'][0]['id'] == model['components'][1]['id']
    assert current(dropped)['view']['coordinateUnit'] == 'mm'
    restored = reopen(dropped)
    replay = dispatch({'op':'recipe-replay','params':{'document':restored}})
    assert canonical_model(current(replay)['model']) == canonical_model(current(dropped)['model'])
    assert current(replay)['model']['components'] == current(dropped)['model']['components']
    restored['cursor'] = 0; assert canonical_model(current(restored)['model']) == canonical_model(model)
    restored['cursor'] = 1; assert counts(current(restored)['model']) == leaf_counts
    assert model['metadata']['compound']['sourceModels'] == source_snapshots


def test_cube_interval_preserves_all_source_cycles_rgba_units_dimension_reset_and_height_branch():
    cube = generate('regular',key='cube')
    cube['metadata']['offColors'] = {'faces':[BYTE_RGBA]+[None]*4+[UNIT_RGBA],'cells':[]}
    before = deepcopy(cube)
    source = document(cube,{'coordinateUnit':'mm','surfaceOpacity':.7,
        'sectionNormal':[0,1,0],'sectionOffset':.25,'derivedMode':'section','entity':2,
        'camera':{'position':[4,5,6]},'foldFraction':.4,'explosionAmount':.2})
    made = recipe(source,'polyhedron-prism',height=2)
    model,view = current(made)['model'],current(made)['view']
    verify_cube_interval(model)
    assert model['vertices'] == [p+[w] for w in (-1,1) for p in cube['vertices']]
    assert model['faces'][:6] == [list(reversed(f)) for f in cube['faces']]
    assert model['faces'][6:12] == [[v+8 for v in f] for f in cube['faces']]
    assert model['metadata']['polyhedronPrism']['sourceModel'] == cube
    assert model['metadata']['offColors']['faces'] == cube['metadata']['offColors']['faces']*2+[None]*12
    assert model['interpretation'] == 'convex-polytope' and model['measure']['content'] == pytest.approx(16)
    assert view['coordinateUnit'] == 'mm' and view['surfaceOpacity'] == .7
    assert view['sectionNormal'] == [0,0,0,1] and view['sectionOffset'] == view['entity'] == 0
    assert not {'camera','foldFraction','explosionAmount'} & view.keys()
    assert current(made)['notes'] == source['states'][0]['notes'] and cube == before
    reopened = reopen(made)
    replay = dispatch({'op':'recipe-replay','params':{'document':reopened}})
    assert canonical_model(current(replay)['model']) == canonical_model(model)
    branch = dispatch({'op':'recipe-branch','params':{'document':reopened,'parameters':{'height':6}}})
    assert set(p[3] for p in current(branch)['model']['vertices']) == {-3,3}
    assert current(branch)['model']['vertices'][:8] == [p+[-3] for p in cube['vertices']]
    assert canonical_model(branch['states'][0]['model']) == canonical_model(cube)
    assert current(reopened)['model']['vertices'] == model['vertices']


@pytest.mark.parametrize('right,expected,leaves', [('3',(18,36,30,12),2),('6/2',(36,72,60,24),4)])
def test_actual_product_generation_retains_interleaved_ids_with_recoverable_full_leaves(right,expected,leaves):
    model = generate('polygon-product',left={'symbol':'6/2','radius':1},right={'symbol':right,'radius':1})
    info = model['metadata']['orderedProduct']
    sources = deepcopy(info['sourceModels'])
    assert counts(model) == expected and len(model['components']) == leaves
    assert model['vertices'] == [a+b for a in sources[0]['vertices'] for b in sources[1]['vertices']]
    vb = len(sources[1]['vertices'])
    right_cycles = [[0,1,2]] if vb == 3 else [[0,2,4],[1,3,5]]
    blocks = [sorted(a*vb+b for a in range(parity,6,2) for b in cycle) for parity in (0,1) for cycle in right_cycles]
    assert [c['maps']['vertices'] for c in model['components']] == blocks
    for component in model['components']:
        leaf = dispatch({'op':'compound-component','model':model,'params':{'component_id':component['id']}})
        assert counts(leaf) == (9,18,15,6)
        verify_closed(leaf)
    source = document(model)
    dropped = recipe(source,'compound-drop',component_id=model['components'][0]['id'])
    restored = reopen(dropped)
    replay = dispatch({'op':'recipe-replay','params':{'document':restored}})
    assert canonical_model(current(replay)['model']) == canonical_model(current(dropped)['model'])
    assert current(replay)['model']['components'] == current(dropped)['model']['components']
    assert current(restored)['model']['metadata']['orderedProduct']['sourceModels'] == sources
    assert model['metadata']['orderedProduct']['sourceModels'] == sources


@pytest.mark.parametrize('n,step,expected', [(5,2,(5,10,10,5)),(8,3,(8,24,32,16)),(6,2,(6,15,18,9))])
def test_actual_step_generator_independent_gram_complete_incidence_and_source_ids(n,step,expected):
    model = generate('step-prism',n=n,step=step,radius=1)
    assert counts(model) == expected
    p = np.asarray(model['vertices']); gram = p@p.T
    if n == 5:
        np.testing.assert_allclose(gram,2.5*np.eye(5)-.5*np.ones((5,5)),atol=1e-14)
        facets = {frozenset(c) for c in combinations(range(5),4)}
    elif n == 8:
        expected_gram = np.eye(8)*2
        for i in range(8): expected_gram[i,(i+4)%8] = -2
        np.testing.assert_allclose(gram,expected_gram,atol=1e-14)
        facets = {frozenset(c) for c in combinations(range(8),4) if all((i+4)%8 not in c for i in c)}
    else:
        np.testing.assert_allclose(p.T@p,3*np.eye(4),atol=1e-14)
        facets = {frozenset(set(range(6))-{a,b}) for a in (0,2,4) for b in (1,3,5)}
    assert {frozenset(v for f in cell for v in model['faces'][f]) for cell in model['cells']} == facets
    assert model['metadata']['stepPrism']['selectedFactorVertexIds'] == [[i,step*i%n] for i in range(n)]
    assert model['metadata']['stepPrism']['sourceVertices'] == model['vertices']
    assert model['interpretation'] == 'convex-polytope' and model['measure']['content'] > 0
    restored = current(reopen(document(model)))['model']
    assert canonical_model(restored) == canonical_model(model)
    assert restored['metadata']['stepPrism'] == model['metadata']['stepPrism']


def test_legacy_polygon_prism_replay_preserves_raw_interpretation_and_branch_records_current_version():
    source = regular_star_polygon(3)
    raw = polygon_prism(source,2)
    source_state = {'model':source,'view':{},'operationNode':'legacy-source'}
    raw_state = {'model':raw,'view':{},'operationNode':'legacy-prism'}
    graph = record_source(create_history(),'legacy-source',source_state)
    graph = record_operation(graph,'legacy-prism','legacy-source','polygon-prism',{'height':2},
        raw_state,algorithm_version='0.1.0')
    old = {'id':'legacy-document','cursor':1,'states':[source_state,raw_state],'operationHistory':graph.to_dict()}
    old_before = deepcopy(old)
    restored = reopen(old)
    replay = dispatch({'op':'recipe-replay','params':{'document':restored}})
    assert canonical_model(current(replay)['model']) == canonical_model(raw)
    assert current(replay)['model']['interpretation'] == 'generalized-complex'
    assert 'components' not in current(replay)['model']
    assert current(replay)['model']['metadata']['orderedProduct']['recoverableCompoundComponents'] is False
    assert current(replay)['model']['vertices'] == raw['vertices']
    branch = dispatch({'op':'recipe-branch','params':{'document':restored,'parameters':{'height':4}}})
    made = current(branch)['model']
    assert made['interpretation'] == 'convex-polytope' and len(made['components']) == 1
    assert made['vertices'] == [p+[z] for z in (-2,2) for p in source['vertices']]
    assert branch['operationHistory']['nodes'][-1]['algorithmVersion'] == '0.2.0'
    assert made['measure']['content'] > 0 and old == old_before


@pytest.mark.parametrize('kind,params', [
    ('rational-antiprism',{'symbol':'3','side_edge':1}),
    ('rational-antiprism',{'symbol':'4/2'}),
    ('rational-antiprism',{'symbol':'5/2','radius':1,'base_edge':2}),
    ('rational-antiprism',{'symbol':'5/2','height':1,'side_edge':2}),
    ('antiduoprism',{'symbol':'6/2','interval_height':0}),
    ('step-prism',{'n':6,'step':3}),
    ('step-prism',{'n':5,'step':2,'radius':10**500}),
    ('step-prism',{'n':5,'step':2,'unknown':True})])
def test_actual_constructor_refusal_is_atomic_and_following_valid_request_succeeds(kind,params):
    request = {'op':'generate','params':{'kind':kind,**params}}; before = deepcopy(request)
    with pytest.raises(GeometryError): dispatch(request)
    assert request == before
    assert counts(generate('rational-antiprism',symbol='3')) == (6,12,8,0)


@pytest.mark.parametrize('height',[0,-1,True,float('inf')])
def test_prism_recipe_refusal_keeps_source_history_and_cursor(height):
    source = document(generate('regular',key='cube')); before = deepcopy(source)
    with pytest.raises(GeometryError): recipe(source,'polyhedron-prism',height=height)
    assert source == before and source['cursor'] == 0 and len(source['states']) == 1


def test_actual_json_lines_mixed_families_continue_after_native_rank_refusal():
    requests = [
        {'id':'octa','op':'generate','params':{'kind':'rational-antiprism','symbol':'3'}},
        {'id':'bad','op':'generate','params':{'kind':'step-prism','n':6,'step':3}},
        {'id':'anti4','op':'generate','params':{'kind':'antiduoprism','symbol':'6/2','interval_height':2}},
        {'id':'noncoprime','op':'generate','params':{'kind':'step-prism','n':6,'step':2}}]
    run = subprocess.run([sys.executable,'-m','engine.server'],input=''.join(json.dumps(r)+'\n' for r in requests),
        text=True,encoding='utf-8',capture_output=True,cwd=Path(__file__).resolve().parents[1],timeout=30,check=True)
    assert not run.stderr
    replies = [json.loads(line) for line in run.stdout.splitlines()]
    assert [r['id'] for r in replies] == ['octa','bad','anti4','noncoprime']
    assert [r['ok'] for r in replies] == [True,False,True,True]
    assert replies[1]['type'] == 'GeometryError' and 'dimension 3' in replies[1]['error']
    assert counts(replies[2]['result']) == (24,60,56,20)
