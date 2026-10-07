"""Independent literal boundaries and mathematical references for layer joins."""
from copy import deepcopy
import hashlib
from itertools import combinations, product
import json
import math

import numpy as np
import pytest

import engine.segmentotopes as kernel
from engine.formats import load_file, save_project, validate_project
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.history import _json_bytes, canonical_model
from engine.segmentotopes import analyze_strict_segmentotope, convex_layer_join, edge_source, point_source


def source(vertices, faces, dimension, embedding=None, source_id='literal-source'):
    return {'id': source_id, 'name': 'Independent ordered boundary', 'dimension': dimension,
            'embeddingDimension': dimension if embedding is None else embedding,
            'interpretation': 'generalized-complex', 'vertices': deepcopy(vertices),
            'edges': [list(e) for e in sorted({tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:] + f[:1])})],
            'faces': deepcopy(faces), 'cells': [], 'metadata': {},
            'numeric': {'mode': 'float64-approximate', 'certified': False}}


def cube(size=2, source_id='literal-cube'):
    v = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
    f = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    return source([[x * size / 2 for x in p] for p in v], f, 3, source_id=source_id)


def tetrahedron():
    a = 1 / (2 * math.sqrt(2))
    vertices = [[a,a,a],[a,-a,-a],[-a,a,-a],[-a,-a,a]]
    return source(vertices, [[0,2,1],[0,1,3],[0,3,2],[1,2,3]], 3, source_id='unit-tetrahedron')


def square(embedding=2):
    vertices = [[-1,-1],[1,-1],[1,1],[-1,1]]
    if embedding == 3:
        # Explicit oblique plane x=z; no accidental XY-only projection.
        vertices = [[x / math.sqrt(2), y, x / math.sqrt(2)] for x, y in vertices]
    return source(vertices, [[0,1,2,3]], 2, embedding, source_id='literal-square')


def counts(model): return tuple(len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells'))
def info(model): return model['metadata']['convexLayerJoin']
def face_coordinate_cycles(model):
    return {tuple(canonical_cycle([tuple(model['vertices'][v]) for v in face])) for face in model['faces']}


def test_aligned_cubes_are_full_tesseract_literal_boundary_not_counts_only():
    result = convex_layer_join(cube(), cube(source_id='top-cube'), 2)
    assert counts(result) == (16,32,24,8)
    vertices = set(product((-1.,1.), repeat=4))
    assert {tuple(p) for p in result['vertices']} == vertices
    expected_edges = {frozenset((p,q)) for p in vertices for q in vertices if sum(a != b for a,b in zip(p,q)) == 1}
    assert {frozenset(tuple(result['vertices'][v]) for v in edge) for edge in result['edges']} == expected_edges
    expected_cycles = set()
    for axes in combinations(range(4),2):
        fixed = [axis for axis in range(4) if axis not in axes]
        for signs in product((-1.,1.),repeat=2):
            cycle = []
            for pair in ((-1.,-1.),(1.,-1.),(1.,1.),(-1.,1.)):
                point = [None] * 4
                for a,s in zip(fixed,signs): point[a] = s
                for a,s in zip(axes,pair): point[a] = s
                cycle.append(tuple(point))
            expected_cycles.add(tuple(canonical_cycle(cycle)))
    assert face_coordinate_cycles(result) == expected_cycles
    # Compare complete cell-to-face membership, independently by a fixed axis.
    expected_cells = {frozenset(cycle for cycle in expected_cycles if all(p[axis] == sign for p in cycle))
                      for axis in range(4) for sign in (-1.,1.)}
    actual_cells = {frozenset(tuple(canonical_cycle([tuple(result['vertices'][v]) for v in result['faces'][f]])) for f in cell)
                    for cell in result['cells']}
    assert actual_cells == expected_cells
    assert result['measure']['content'] == pytest.approx(16)
    assert result['measure']['boundaryMeasure'] == pytest.approx(64)
    assert result['interpretation'] == 'convex-polytope' and result['numeric']['certified'] is False
    evidence = analyze_strict_segmentotope(result)
    assert evidence['status'] == 'passed' and evidence['strictPredicatesPassed'] and evidence['certified'] is False
    assert evidence['sourceFingerprint'] == identity(result)
    assert all(entry['passed'] for entry in evidence['checks']['orderedRegularFaces']['faces'])


def test_unit_tetrahedron_point_is_independent_regular_five_cell():
    result = convex_layer_join(tetrahedron(), point_source(source_id='apex'), math.sqrt(5/8))
    assert counts(result) == (5,10,10,5)
    assert {frozenset(e) for e in result['edges']} == {frozenset(e) for e in combinations(range(5),2)}
    assert {frozenset(f) for f in result['faces']} == {frozenset(f) for f in combinations(range(5),3)}
    for cell in result['cells']:
        ids = set(v for f in cell for v in result['faces'][f])
        assert len(ids) == 4
        assert {frozenset(result['faces'][f]) for f in cell} == {frozenset(f) for f in combinations(ids,3)}
    assert all(math.dist(result['vertices'][a],result['vertices'][b]) == pytest.approx(1) for a,b in result['edges'])
    assert result['measure']['content'] == pytest.approx(math.sqrt(5)/96)
    assert result['measure']['boundaryMeasure'] == pytest.approx(5 * math.sqrt(2)/12)
    strict = analyze_strict_segmentotope(result)
    assert strict['status'] == 'passed'
    assert strict['checks']['commonHypersphere']['normalizedRadius'] * strict['checks']['commonHypersphere']['coordinateFrame']['scale'] == pytest.approx(math.sqrt(2/5))


def test_unit_cube_point_is_full_four_dimensional_pyramid():
    base = cube(1)
    result = convex_layer_join(base, point_source(), .5)
    assert counts(result) == (9,20,18,7)
    assert result['vertices'] == [p + [-.25] for p in base['vertices']] + [[0.,0.,0.,.25]]
    expected_edges = {frozenset(e) for e in base['edges']} | {frozenset((v,8)) for v in range(8)}
    assert {frozenset(e) for e in result['edges']} == expected_edges
    expected_faces = {tuple(canonical_cycle(f)) for f in base['faces']} | {tuple(canonical_cycle(e+[8])) for e in base['edges']}
    assert {tuple(canonical_cycle(f)) for f in result['faces']} == expected_faces
    expected_cells = {frozenset(tuple(canonical_cycle(f)) for f in base['faces'])}
    for f in base['faces']:
        shell = [f] + [[a,b,8] for a,b in zip(f,f[1:]+f[:1])]
        expected_cells.add(frozenset(tuple(canonical_cycle(face)) for face in shell))
    assert {frozenset(tuple(canonical_cycle(result['faces'][f])) for f in c) for c in result['cells']} == expected_cells
    assert all(math.dist(result['vertices'][a], result['vertices'][b]) == pytest.approx(1) for a,b in result['edges'])
    assert result['measure']['content'] == pytest.approx(.125)
    assert analyze_strict_segmentotope(result)['status'] == 'passed'


@pytest.mark.parametrize('top',[point_source([.2,-.3,.4]), edge_source([-.5,0,.2],[.5,0,.2]), square(), square(3)])
def test_lower_dimensional_sources_preserve_snapshot_point_ids_and_all_ordered_incidence(top):
    base = cube(); originals = deepcopy((base,top))
    result = convex_layer_join(base,top,1.2)
    assert (base,top) == originals
    assert info(result)['nonextremeInputPointIds'] == []
    assert sorted(info(result)['inputToOutputVertexIds']) == list(range(len(result['vertices'])))
    for layer, original in zip(info(result)['layers'],(base,top)):
        assert layer['sourceSnapshot'] == original
        assert layer['sourceSnapshotSha256'] == hashlib.sha256(_json_bytes(original,kernel.MAX_PAYLOAD_BYTES)).hexdigest()
        ids = layer['maps']['vertices']
        offset = -.6 if layer['role'] == 'base' else .6
        expected = [list(map(float,p)) + ([0.] if len(p) == 2 else []) + [offset] for p in original['vertices']]
        assert [result['vertices'][v] for v in ids] == expected
        for e,target in zip(original['edges'],layer['maps']['edges']):
            assert set(result['edges'][target]) == {ids[v] for v in e}
        for f,target in zip(original['faces'],layer['maps']['faces']):
            assert canonical_cycle(result['faces'][target]) == canonical_cycle([ids[v] for v in f])
    if top['dimension'] == 2 and top['embeddingDimension'] == 3:
        evidence = info(result)['layers'][1]['predicateEvidence']
        assert evidence['sourceFingerprint'] == identity(top)
        assert evidence['predicateSourceFingerprint'] != identity(top)
        assert evidence['projection']['scope'].startswith('detached')
    assert validate(result)['passed']


def test_rigid_rotations_reflections_and_signed_height_have_literal_unrecentered_coordinates():
    base, top = cube(), square()
    rotation = [[0,-1,0],[1,0,0],[0,0,1]]
    reflection = [[-1,0,0],[0,1,0],[0,0,1]]
    result = convex_layer_join(base,top,-2,base_matrix=rotation,base_translation=[2,3,4],top_matrix=reflection,top_translation=[-.1,.2,.3])
    assert result['vertices'][:8] == [[-p[1]+2,p[0]+3,p[2]+4,1.] for p in base['vertices']]
    assert result['vertices'][8:] == [[-p[0]-.1,p[1]+.2,.3,-1.] for p in top['vertices']]
    assert info(result)['layers'][0]['transform']['determinant'] == pytest.approx(1)
    assert info(result)['layers'][1]['transform']['determinant'] == pytest.approx(-1)
    assert info(result)['layers'][0]['role'] == 'base' and info(result)['height'] == -2
    assert result['validation']['passed']


def test_rgba_source_attributes_survive_native_save_and_full_snapshot_ownership(tmp_path):
    base, top = cube(), square(3)
    base['metadata'] = {'custom': {'author':'independent fixture'}, 'offColors': {'faces':[
        {'encoding':'byte','values':[20+i,40,60,128]} for i in range(6)]}}
    top['metadata'] = {'offColors':{'faces':[{'encoding':'unit','values':[.2,.4,.6,.3]}]}}
    original = deepcopy((base,top))
    result = convex_layer_join(base,top,.9)
    owned = set()
    for layer, source_model in zip(info(result)['layers'],original):
        for source_id, output_id in enumerate(layer['maps']['faces']):
            owned.add(output_id)
            assert result['metadata']['offColors']['faces'][output_id] == source_model['metadata']['offColors']['faces'][source_id]
    assert all(color is None for i,color in enumerate(result['metadata']['offColors']['faces']) if i not in owned)
    assert all(color is None for color in result['metadata']['offColors']['cells'])
    project = {'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'saved-join','cursor':0,'states':[{'model':result,'view':{}}]}]}
    target = tmp_path/'join.json'; save_project(target,project)
    restored = load_file(target)['project']['documents'][0]['states'][0]['model']
    assert canonical_model(restored) == canonical_model(result)
    assert restored['metadata'] == result['metadata'] and restored['provenance'] == result['provenance']
    assert (base,top) == original and 'components' not in result


def test_broader_unequal_sized_join_is_valid_but_strict_analysis_is_read_only_not_strict():
    result = convex_layer_join(cube(2),cube(.8),1.1,top_translation=[.1,.2,.3])
    original = deepcopy(result)
    evidence = analyze_strict_segmentotope(result)
    assert evidence['status'] == 'not-strict' and not evidence['strictPredicatesPassed']
    assert not evidence['checks']['equalEdges']['passed']
    assert not evidence['checks']['orderedRegularFaces']['passed']
    assert evidence['certified'] is False and result == original
    assert result['interpretation'] == 'convex-polytope'


def test_equal_edges_alone_do_not_claim_ordered_regular_faces_or_common_sphere():
    # A unit-sided rhombic prism has identical edge lengths, but its four-cycle
    # turns are 60/120 degrees and it is not cyclic in a common sphere.
    base = cube(1)
    base['vertices'] = [[x+.5*y,math.sqrt(.75)*y,z] for x,y,z in base['vertices']]
    result = convex_layer_join(base,base,1)
    evidence = analyze_strict_segmentotope(result)
    assert evidence['checks']['equalEdges']['passed']
    assert not evidence['checks']['orderedRegularFaces']['passed']
    assert not evidence['checks']['commonHypersphere']['passed']
    assert evidence['status'] == 'not-strict'


def test_strict_two_layer_partition_is_explicit_w_not_alternate_partition_search():
    result = convex_layer_join(cube(),cube(),2)
    mixed = deepcopy(result)
    a = math.sqrt(.5)
    mixed['vertices'] = [[a*(x+w),y,z,a*(w-x)] for x,y,z,w in mixed['vertices']]
    # Remove cached support equations; classify the unchanged intrinsic source.
    mixed['interpretation'] = 'generalized-complex'
    for key in ('facetEquations','facetVertices','validation','fingerprint','measure'):
        mixed.pop(key,None)
    evidence = analyze_strict_segmentotope(mixed)
    assert evidence['checks']['commonHypersphere']['passed']
    assert evidence['checks']['equalEdges']['passed']
    assert not evidence['checks']['twoParallelLayers']['passed'] and evidence['status'] == 'not-strict'


@pytest.mark.parametrize('value',[True,False,0,float('nan'),float('inf'),-float('inf'),10**500,-10**500,'1/2',None])
def test_bad_signed_height_is_structured_and_atomic(value):
    base, top = cube(),cube(); original = deepcopy((base,top))
    with pytest.raises(GeometryError): convex_layer_join(base,top,value)
    assert (base,top) == original


@pytest.mark.parametrize('value',[True,10**500,float('inf'),'1',None])
def test_point_edge_coordinate_malformed_inputs(value):
    with pytest.raises(GeometryError): point_source([value,0,0])
    with pytest.raises(GeometryError): edge_source([0,0,0],[0,value,0])


@pytest.mark.parametrize('matrix',[
    [[2,0,0],[0,1,0],[0,0,1]], [[1,.2,0],[0,1,0],[0,0,1]],
    [[1,0,0],[0,1,0]], [[1,0,0],[0,1,0],[0,0,10**500]],
    [[True,0,0],[0,1,0],[0,0,1]], [[1,0,0],[0,1,0],[0,0,float('nan')]]])
def test_nonrigid_malformed_matrices_reject(matrix):
    with pytest.raises(GeometryError): convex_layer_join(cube(),cube(),top_matrix=matrix)


@pytest.mark.parametrize('translation',[[0,0], [0,0,10**500], [0,0,float('inf')], [0,0,True], '0,0,0'])
def test_bad_translation_rejects(translation):
    with pytest.raises(GeometryError): convex_layer_join(cube(),cube(),top_translation=translation)


@pytest.mark.parametrize('change',[
    lambda x: x.update(version=True), lambda x: x.update(extra='not schema'),
    lambda x: x.update(edges=[[1,0]]), lambda x: x.update(dimension=True),
    lambda x: x.update(embeddingDimension=2), lambda x: x.update(vertices=[[0,0,0],[0,0,0]]),
    lambda x: x.update(id=''), lambda x: x.update(metadata={'offColors':{'faces':[None]}})])
def test_spoofed_edge_records_reject(change):
    top = edge_source([0,0,0],[1,0,0]); change(top)
    with pytest.raises(GeometryError): convex_layer_join(cube(),top)


def test_nonconvex_star_and_bowtie_ordered_polygon_reject_without_point_set_hull_repair():
    vertices = [[math.cos(2*math.pi*i/5),math.sin(2*math.pi*i/5)] for i in range(5)]
    star = source(vertices,[[0,2,4,1,3]],2)
    bowtie = square(); bowtie['faces'] = [[0,2,1,3]]
    bowtie['edges'] = [[0,2],[1,2],[1,3],[0,3]]
    for top in (star,bowtie):
        original = deepcopy(top)
        with pytest.raises(GeometryError,match='ordered convex source boundary'): convex_layer_join(cube(),top)
        assert top == original


def test_incomplete_source_shell_collinear_refinement_and_nonplanar_top_reject():
    broken = cube(); broken['faces'].pop()
    with pytest.raises(GeometryError): convex_layer_join(broken,point_source())
    refined = square(); refined['vertices'].append([0,-1]); refined['faces'] = [[0,4,1,2,3]]
    refined['edges'] = [[0,4],[1,4],[1,2],[2,3],[0,3]]
    with pytest.raises(GeometryError): convex_layer_join(cube(),refined)
    nonplanar = square(3); nonplanar['vertices'][0][2] += .1
    with pytest.raises(GeometryError): convex_layer_join(cube(),nonplanar)


def test_base_top_dimension_limits_and_unknown_options_are_explicit():
    with pytest.raises(GeometryError): convex_layer_join(point_source(),cube())
    with pytest.raises(GeometryError): convex_layer_join(square(),cube())
    higher = cube(); higher['embeddingDimension'] = 4; higher['vertices'] = [p+[0] for p in higher['vertices']]
    with pytest.raises(GeometryError): convex_layer_join(cube(),higher)
    with pytest.raises(GeometryError,match='Unsupported'): convex_layer_join(cube(),cube(),gyro=True)
    with pytest.raises(GeometryError,match='Unsupported'): convex_layer_join(cube(),cube(),color=[1,0,0])
    with pytest.raises(GeometryError): edge_source([0,0,0],[0,0,0])
    with pytest.raises(GeometryError): point_source([0,0])


def test_real_total_vertex_budget_precedes_source_hull_and_does_not_hide_cap_reason():
    top = square(); top['vertices'] = [[0,0]] * 57
    with pytest.raises(GeometryError,match='64'): convex_layer_join(cube(),top)


@pytest.mark.parametrize('size',[1e99,1e-100,1e-200])
def test_overflow_or_underflow_measure_domain_rejects_atomically(size):
    base = cube(size); original = deepcopy(base)
    with pytest.raises(GeometryError): convex_layer_join(base,base,size)
    assert base == original


def test_relative_rank_collapse_from_small_height_or_unresolvable_translation_rejects():
    with pytest.raises(GeometryError): convex_layer_join(cube(),cube(),1e-12)
    with pytest.raises(GeometryError): convex_layer_join(cube(),cube(),1,base_translation=[1e90,1e90,1e90],top_translation=[1e90,1e90,1e90])


def test_hull_dropped_source_point_is_atomic_rejection_not_silent_loss(monkeypatch):
    real = kernel.hull
    def broken(points,name):
        result = real(points,name)
        result['provenance']['extremeInputIndices'].pop()
        return result
    monkeypatch.setattr(kernel,'hull',broken)
    with pytest.raises(GeometryError,match='dropped selected'): convex_layer_join(cube(),cube(),2)


def test_native_gate_failure_and_native_attribute_change_are_atomic(monkeypatch):
    original = deepcopy(cube())
    def fail(project): raise GeometryError('independent simulated persistence failure')
    monkeypatch.setattr(kernel,'validate_project',fail)
    with pytest.raises(GeometryError,match='native convex project gate'): convex_layer_join(original,cube(),2)
    assert original == cube()
    real = validate_project
    def changed(project):
        result = real(project)
        result['documents'][0]['states'][0]['model']['metadata']['changed'] = True
        return result
    monkeypatch.setattr(kernel,'validate_project',changed)
    with pytest.raises(GeometryError,match='changed geometry or source evidence'): convex_layer_join(cube(),cube(),2)


@pytest.mark.parametrize('tolerance',[True,10**500,float('nan'),0,1e-13,1e-3,'1e-8'])
def test_strict_analysis_tolerance_bounds(tolerance):
    with pytest.raises(GeometryError): analyze_strict_segmentotope(cube(),tolerance)


def test_strict_analysis_unsupported_source_and_resource_results_not_promotion():
    assert analyze_strict_segmentotope(cube())['status'] == 'unsupported'
    assert analyze_strict_segmentotope({'vertices':[[0,0,0,0]]*65})['status'] == 'unsupported'
    assert analyze_strict_segmentotope(None)['status'] == 'unsupported'


def test_source_payload_depth_and_color_malformed_validation():
    base = cube(); base['metadata']['offColors'] = {'faces':[{'encoding':'unit','values':[1,0,0,10**500]}]*6}
    with pytest.raises(GeometryError): convex_layer_join(base,point_source())
    base = cube(); value = []
    for _ in range(70): value = [value]
    base['metadata']['excessiveDepth'] = value
    with pytest.raises(GeometryError): convex_layer_join(base,point_source())


def test_model_missing_id_fails_with_geometry_error_not_keyerror():
    base = cube(); base.pop('id')
    with pytest.raises(GeometryError): convex_layer_join(base,point_source())


@pytest.mark.parametrize('factory',[point_source, lambda **kw: edge_source([0,0,0],[1,0,0],**kw)])
@pytest.mark.parametrize('location',['id','key','value'])
@pytest.mark.parametrize('surrogate',['\ud800','\udfff'])
def test_source_record_unpaired_surrogate_is_structured_before_copy(factory,location,surrogate,monkeypatch):
    # The native JSON walker encodes keys/values during traversal, outside its
    # own serialization exception handler. Neither raw UnicodeError nor a
    # metadata copy should escape this public layer API.
    def forbidden_copy(value): raise AssertionError('Invalid UTF-8 was copied before validation')
    monkeypatch.setattr(kernel,'deepcopy',forbidden_copy)
    params = {'source_id':surrogate} if location == 'id' else {'metadata':{surrogate:'value'} if location == 'key' else {'value':surrogate}}
    with pytest.raises(GeometryError,match='UTF-8 JSON'): factory(**params)


@pytest.mark.parametrize('factory',[point_source, lambda **kw: edge_source([0,0,0],[1,0,0],**kw)])
@pytest.mark.parametrize('kind',['deep','cycle','nonplain','huge-int','nonfinite','oversize'])
def test_record_json_guard_precedes_deepcopy_and_preserves_invalid_metadata(factory,kind,monkeypatch):
    metadata = {}
    if kind == 'deep':
        value = []
        for _ in range(1100): value = [value]
        metadata['depth'] = value
    elif kind == 'cycle': metadata['self'] = metadata
    elif kind == 'nonplain':
        class Hostile:
            def __deepcopy__(self,memo): raise AssertionError('Custom object copy must never execute')
        metadata['object'] = Hostile()
    elif kind == 'huge-int': metadata['number'] = 10**5000
    elif kind == 'nonfinite': metadata['number'] = float('inf')
    else:
        monkeypatch.setattr(kernel,'MAX_PAYLOAD_BYTES',512)
        metadata['text'] = 'x'*513
    original_keys = list(metadata)
    def forbidden_copy(value): raise AssertionError('Invalid metadata was copied before JSON validation')
    monkeypatch.setattr(kernel,'deepcopy',forbidden_copy)
    with pytest.raises(GeometryError): factory(metadata=metadata)
    assert list(metadata) == original_keys
    if kind == 'cycle': assert metadata['self'] is metadata


@pytest.mark.parametrize('failure',[UnicodeError,RecursionError,OverflowError])
def test_json_walker_exception_is_converted_for_record_helpers(failure,monkeypatch):
    def fail(*args): raise failure('independent malformed input probe')
    monkeypatch.setattr(kernel,'_json_bytes',fail)
    with pytest.raises(GeometryError,match='UTF-8 JSON'): point_source(metadata={'safe':'otherwise'})


def test_valid_unicode_metadata_is_detached_after_whole_record_budget_passes():
    metadata = {'author':'\u03ba\u03bb\u03b5\u03af\u03c9', '\u661f': ['\U0001f31f',{'nested':1}]}
    result = edge_source([0,0,0],[1,0,0],source_id='\u03b1\U0001f31f',metadata=metadata)
    assert result['metadata'] == metadata and result['metadata'] is not metadata
    result['metadata']['\u661f'][1]['nested'] = 2
    assert metadata['\u661f'][1]['nested'] == 1


@pytest.mark.parametrize('role',['base','top'])
def test_join_direct_source_utf8_surrogate_failure_is_structured_and_atomic(role):
    base, top = cube(), point_source()
    malformed = base if role == 'base' else top
    malformed['metadata']['bad'] = '\ud800'
    with pytest.raises(GeometryError,match='UTF-8 JSON'): convex_layer_join(base,top)
    assert malformed['metadata']['bad'] == '\ud800'


def test_smallest_subnormal_height_and_tiny_edge_are_explicit_atomic_refusals():
    base = cube(); original = deepcopy(base)
    with pytest.raises(GeometryError): convex_layer_join(base,point_source(),math.nextafter(0.,1.))
    top = edge_source([0,0,0],[1e-320,0,0]); top_original = deepcopy(top)
    with pytest.raises(GeometryError): convex_layer_join(base,top)
    assert base == original and top == top_original
