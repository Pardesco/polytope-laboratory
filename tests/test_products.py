"""Independent coordinate/axis fixtures and literal star boundary product checks."""
from collections import Counter
from copy import deepcopy
import hashlib
from itertools import combinations, product
import json
import math

import pytest

from engine.compounds import extract_component, remove_component
from engine.formats import validate_project
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.products import polygon_prism, polygon_product
from engine.star_polygons import regular_star_polygon


KINDS = ('vertices', 'edges', 'faces', 'cells')


def source(vertices, faces, metadata=None, edges=None):
    return {'id': 'literal-source', 'name': 'Literal cycles', 'dimension': 2, 'embeddingDimension': 2,
            'interpretation': 'generalized-complex', 'vertices': deepcopy(vertices), 'faces': deepcopy(faces),
            'edges': edges if edges is not None else [list(edge) for edge in sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face, face[1:]+face[:1])})],
            'cells': [], 'metadata': deepcopy(metadata or {}), 'numeric': {'mode': 'float64-approximate', 'certified': False}}


def square():
    return source([[-1,-1],[1,-1],[1,1],[-1,1]], [[0,1,2,3]])


def pentagram(step=2):
    root = math.sqrt(5)
    vertices = [[1,0],[(root-1)/4,math.sqrt(10+2*root)/4],[-(root+1)/4,math.sqrt(10-2*root)/4],
                [-(root+1)/4,-math.sqrt(10-2*root)/4],[(root-1)/4,-math.sqrt(10+2*root)/4]]
    return source(vertices, [[(i*step)%5 for i in range(5)]], {'symbol': f'5/{step}'})


def hexagram():
    root = math.sqrt(3)/2
    return source([[1,0],[.5,root],[-.5,root],[-1,0],[-.5,-root],[.5,-root]], [[0,2,4],[1,3,5]], {'symbol': '6/2'})


def counts(model):
    return [len(model[kind]) for kind in KINDS]


def assert_partition(model, expected):
    info = model['metadata']['orderedProduct']
    assert len(info['componentPartitions']) == expected
    assert info['recoverableCompoundComponents'] is False and 'components' not in model
    for kind in KINDS:
        ids = [i for part in info['componentPartitions'] for i in part['maps'][kind]]
        assert sorted(ids) == list(range(len(model[kind])))
    for part in info['componentPartitions']:
        vertices, faces = set(part['maps']['vertices']), set(part['maps']['faces'])
        for kind in ('edges', 'faces', 'cells'):
            assert all(set(model[kind][i]) <= (faces if kind == 'cells' else vertices) for i in part['maps'][kind])
        for operation in (extract_component, remove_component):
            with pytest.raises(GeometryError, match='component ID'):
                operation(model, part['id'])


def assert_generalized(model):
    assert model['interpretation'] == 'generalized-complex'
    assert model['numeric']['certified'] is False
    assert all(key not in model for key in ('measure', 'facetVertices', 'facetEquations', 'rationalFacetEquations'))
    assert validate(model)['passed'] and identity(model) == model['fingerprint']


def test_square_times_square_has_the_complete_independent_axis_tesseract_incidence():
    result = polygon_product(square(), square())
    assert counts(result) == [16,32,24,8]
    lookup = {tuple(point):i for i,point in enumerate(result['vertices'])}
    assert set(lookup) == set(product((-1,1), repeat=4))
    # Analytic hypercube: an edge varies exactly one axis. Each square fixes
    # exactly two axes; each complete cube cell fixes exactly one axis.
    expected_edges = {tuple(sorted((i,j))) for i,a in enumerate(result['vertices']) for j,b in enumerate(result['vertices'])
                      if i<j and sum(x!=y for x,y in zip(a,b)) == 1}
    assert {tuple(sorted(e)) for e in result['edges']} == expected_edges
    expected_faces = set()
    for varying in combinations(range(4),2):
        fixed = [axis for axis in range(4) if axis not in varying]
        for fixed_signs in product((-1,1), repeat=2):
            cycle = []
            for signs in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                point = [0]*4
                for axis,value in zip(fixed,fixed_signs):point[axis]=value
                for axis,value in zip(varying,signs):point[axis]=value
                cycle.append(lookup[tuple(point)])
            expected_faces.add(canonical_cycle(cycle))
    assert {canonical_cycle(face) for face in result['faces']} == expected_faces
    expected_cells = {frozenset(canonical_cycle(face) for face in result['faces'] if all(result['vertices'][v][axis]==sign for v in face))
                      for axis in range(4) for sign in (-1,1)}
    assert {frozenset(canonical_cycle(result['faces'][f]) for f in cell) for cell in result['cells']} == expected_cells
    assert all(math.dist(result['vertices'][a], result['vertices'][b]) == 2 for a,b in result['edges'])
    assert all(len(cell)==6 for cell in result['cells'])
    assert_generalized(result);assert_partition(result,1)


@pytest.mark.parametrize('step,cycle', [(2,[0,2,4,1,3]),(3,[0,3,1,4,2]),(-2,[0,3,1,4,2]),(-3,[0,2,4,1,3])])
def test_pentagram_prism_keeps_literal_signed_cycles_and_rectangular_wall_edges(step,cycle):
    polygon = pentagram(step)
    polygon['edges'] = [list(reversed(edge)) for edge in reversed(polygon['edges'])]
    saved = deepcopy(polygon)
    result = polygon_prism(polygon, 3)
    assert counts(result) == [10,15,7,0] and polygon == saved
    assert result['vertices'] == [point+[z] for z in (-1.5,1.5) for point in polygon['vertices']]
    assert result['faces'][0] == list(reversed(cycle)) and result['faces'][1] == [v+5 for v in cycle]
    assert result['faces'][2:] == [[a,b,b+5,a+5] for a,b in zip(cycle,cycle[1:]+cycle[:1])]
    expected = math.sqrt((5+math.sqrt(5))/2)
    assert sorted(math.dist(result['vertices'][a],result['vertices'][b]) for a,b in result['edges']) == pytest.approx(sorted([expected]*10+[3]*5))
    assert max(len(face) for face in result['faces']) == 5  # Not the convex decagonal side hull.
    links = Counter(tuple(sorted((a,b))) for face in result['faces'] for a,b in zip(face,face[1:]+face[:1]))
    assert set(links.values()) == {2}
    assert result['metadata']['orderedProduct']['sourceModels'][0] == saved
    assert_generalized(result);assert_partition(result,1)


@pytest.mark.parametrize('left,right,expected,parts', [
    (regular_star_polygon(3),regular_star_polygon(3),[9,18,15,6],1),
    (pentagram(),regular_star_polygon(3),[15,30,23,8],1),
    (hexagram(),regular_star_polygon(3),[18,36,30,12],2),
    (hexagram(),hexagram(),[36,72,60,24],4)])
def test_literal_product_counts_full_cell_links_and_disconnected_cycle_cartesian_partitions(left,right,expected,parts):
    before = deepcopy([left,right]);result = polygon_product(left,right)
    assert counts(result) == expected and [left,right] == before
    assert result['vertices'] == [a+b for a in left['vertices'] for b in right['vertices']]
    face_links = Counter(face for cell in result['cells'] for face in cell)
    assert len(face_links) == len(result['faces']) and set(face_links.values()) == {2}
    for cell in result['cells']:
        vertices = {v for f in cell for v in result['faces'][f]}
        edges = Counter(tuple(sorted((a,b))) for f in cell for a,b in zip(result['faces'][f],result['faces'][f][1:]+result['faces'][f][:1]))
        assert set(edges.values()) == {2} and len(vertices)-len(edges)+len(cell) == 2
    assert_generalized(result);assert_partition(result,parts)


def test_hexagram_prism_has_two_literal_phase_triangle_prisms_with_no_reduction():
    polygon = hexagram();result = polygon_prism(polygon,2)
    assert counts(result) == [12,18,10,0]
    assert [part['maps']['vertices'] for part in result['metadata']['orderedProduct']['componentPartitions']] == [[0,2,4,6,8,10],[1,3,5,7,9,11]]
    assert result['metadata']['orderedProduct']['sourceModels'][0]['metadata']['symbol'] == '6/2'
    assert_partition(result,2)


@pytest.mark.parametrize('step', [2,3,-2,-3])
def test_product_copies_every_signed_ordered_star_cycle_and_both_metric_edge_classes(step):
    a,b=pentagram(step),pentagram(-3)
    b['vertices']=[[3*x,3*y] for x,y in b['vertices']]
    result=polygon_product(a,b)
    assert counts(result)==[25,50,35,10]
    assert result['faces'][:5]==[[v*5+at for v in a['faces'][0]] for at in range(5)]
    assert result['faces'][5:10]==[[at*5+v for v in b['faces'][0]] for at in range(5)]
    length=math.sqrt((5+math.sqrt(5))/2)
    assert sorted(math.dist(result['vertices'][x],result['vertices'][y]) for x,y in result['edges'])==pytest.approx([length]*25+[3*length]*25)


@pytest.mark.parametrize('operation', ['prism','product'])
def test_native_project_validation_preserves_full_sources_partitions_attributes_and_current_incidence(operation):
    a,b=regular_star_polygon(6,-2),pentagram(3)
    a['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.1,.3,.5,.7]},None]}
    result=polygon_prism(a,2) if operation=='prism' else polygon_product(a,b)
    original=deepcopy(result)
    project={'format':'polytope-laboratory','version':1,'active':0,
             'documents':[{'id':'ordered-product','cursor':0,'states':[{'model':result,'view':{},'notes':'source note'}]}]}
    checked=validate_project(json.loads(json.dumps(project,allow_nan=False)))
    restored=checked['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(original)
    assert restored['metadata']['orderedProduct']==original['metadata']['orderedProduct']
    assert restored['metadata']['offColors']==original['metadata']['offColors']
    assert result==original


def test_signed_source_symbols_component_ids_and_current_full_sources_remain_independent():
    left,right = regular_star_polygon(6,-2), regular_star_polygon(5,3)
    source_before = deepcopy([left,right]);result = polygon_product(left,right)
    info = result['metadata']['orderedProduct']
    assert info['sourceModels'] == source_before
    assert [item['metadata']['regularStarPolygon']['symbol'] for item in info['sourceModels']] == ['6/-2','5/3']
    assert {tuple(part['sourceComponentIds']) for part in info['componentPartitions']} == {(component['id'],None) for component in left['components']}
    assert info['resultSourceFingerprint'] == identity(result)
    result['metadata']['orderedProduct']['sourceModels'][0]['vertices'][0][0] = 99
    assert [left,right] == source_before


@pytest.mark.parametrize('operation', ['prism','product'])
def test_full_source_snapshot_and_geometry_fingerprints_source_maps_and_rgba_policies(operation):
    a,b = square(),pentagram()
    rgba = {'encoding':'unit','values':[.1,.2,.3,.4]}
    rgb = {'encoding':'byte','values':[10,20,30]}
    a['metadata'].update({'offColors':{'faces':[rgba]},'notes':'Literal source notes','projectAttribute':{'label':'α'}})
    b['metadata']['offColors']={'faces':[rgb]}
    originals = deepcopy([a,b]);result = polygon_prism(a,2) if operation=='prism' else polygon_product(a,b)
    info = result['metadata']['orderedProduct'];colors = result['metadata']['offColors']['faces']
    assert info['sourceModels'] == originals[:len(info['sourceModels'])]
    for i,original in enumerate(originals[:len(info['sourceModels'])]):
        assert info['inputs'][i]['sourceFingerprint'] == identity(original)
        assert info['inputs'][i]['sourceSnapshotSha256'] == hashlib.sha256(json.dumps(original,allow_nan=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        for kind in KINDS:
            assert len(info['sourceMaps'][i][kind]) == len(original[kind])
            for source_id,output_ids in enumerate(info['sourceMaps'][i][kind]):
                assert output_ids == [j for j,record in enumerate(info['maps'][kind]) if [i,kind,source_id] in record['factors']]
    if operation=='prism':
        assert colors == [rgba,rgba]+[None]*4
        assert [record['intervalEndpoint'] for record in info['maps']['vertices']] == [0]*4+[1]*4
    else:
        assert colors == [rgba]*5+[rgb]*4+[None]*20
        assert result['metadata']['offColors']['cells'] == [None]*9
    assert [a,b] == originals
    result['metadata']['offColors']['faces'][0]['values'][0]=0
    assert a['metadata']['offColors']['faces'][0] == rgba
    assert_generalized(result)


def test_translation_scaling_edge_order_and_coincident_disjoint_components_are_literal():
    left = square();left['vertices']=[[x+10,y-7] for x,y in left['vertices']]
    left['edges']=[list(reversed(edge)) for edge in reversed(left['edges'])]
    right = square();right['vertices']=[[2*x-3,2*y+9] for x,y in right['vertices']]
    result = polygon_product(left,right)
    assert result['vertices'][0] == [9,-8,-5,7]
    assert sorted(math.dist(result['vertices'][a],result['vertices'][b]) for a,b in result['edges']) == [2]*16+[4]*16
    repeated = source(square()['vertices']*2, [[0,1,2,3],[4,5,6,7]])
    coincident = polygon_product(repeated,square())
    assert counts(coincident)==[32,64,48,16] and len(set(map(tuple,coincident['vertices'])))==16
    assert_partition(coincident,2)


@pytest.mark.parametrize('height', [0,-1,True,False,float('nan'),float('inf'),1e101,10**1000,'1',None])
def test_prism_height_domain_is_strict_and_atomic(height):
    polygon = square();original=deepcopy(polygon)
    with pytest.raises(GeometryError,match='height'):
        polygon_prism(polygon,height)
    assert polygon==original


@pytest.mark.parametrize('height', [1e-20,1e100,5e-324])
def test_height_extremes_diagnose_relative_numeric_rank_or_planarity_collapse(height):
    with pytest.raises(GeometryError,match='numeric|planar'):
        polygon_prism(square(),height)


def test_uniform_tiny_and_large_scales_do_not_use_an_absolute_rank_cutoff():
    for scale in (1e-100,1e100):
        a = square();a['vertices']=[[scale*x,scale*y] for x,y in a['vertices']]
        assert_generalized(polygon_prism(a,scale))
        assert_generalized(polygon_product(a,a))


def test_complete_snapshot_hash_survives_native_json_number_spellings_but_detects_attributes():
    a=square();a['vertices']=[[float(x),float(y)] for x,y in a['vertices']]
    a['vertices'][0][0]=-0.0;a['metadata']['label']='original'
    b=deepcopy(a);b['vertices']=[[int(x),int(y)] for x,y in b['vertices']]
    one=polygon_prism(a)['metadata']['orderedProduct']['inputs'][0]
    two=polygon_prism(b)['metadata']['orderedProduct']['inputs'][0]
    assert one==two
    b['metadata']['label']='changed'
    changed=polygon_prism(b)['metadata']['orderedProduct']['inputs'][0]
    assert changed['sourceFingerprint']==one['sourceFingerprint']
    assert changed['sourceSnapshotSha256']!=one['sourceSnapshotSha256']


def test_source_convex_and_measure_caches_do_not_promote_or_certify_direct_products():
    a=square();a['interpretation']='convex-polytope';a['measure']={'content':999}
    a['numeric']['certified']=True
    result=polygon_product(a,a)
    assert result['metadata']['orderedProduct']['sourceModels'][0]['measure']=={'content':999}
    assert_generalized(result)


def test_exact_vertex_budget_boundary_remains_valid():
    result=polygon_product(regular_star_polygon(50),regular_star_polygon(80))
    assert counts(result)==[4000,8000,4130,130]
    assert_generalized(result)


@pytest.mark.parametrize('change', ['dimension','embedding','cell','isolated-point','wire','shared-vertex','shared-edge','zero-edge','missing-edge','duplicate-edge','invalid-index','boolean-coordinate','color'])
def test_unsupported_or_malformed_source_domains_are_diagnosed_without_mutation(change):
    polygon=square()
    if change=='dimension':polygon['dimension']=3
    elif change=='embedding':polygon['embeddingDimension']=3;polygon['vertices']=[p+[0] for p in polygon['vertices']]
    elif change=='cell':polygon['cells']=[[0]]
    elif change=='isolated-point':polygon['vertices'].append([0,0])
    elif change=='wire':polygon['vertices'] += [[4,0],[5,0]];polygon['edges'].append([4,5])
    elif change=='shared-vertex':polygon=source([[-1,-1],[1,-1],[1,1],[-1,1],[3,0],[2,2]],[[0,1,2,3],[2,4,5]])
    elif change=='shared-edge':polygon=source([[-1,-1],[1,-1],[1,1],[-1,1],[3,0]],[[0,1,2,3],[1,4,2]])
    elif change=='zero-edge':polygon['vertices'][1]=polygon['vertices'][0][:]
    elif change=='missing-edge':polygon['edges'].pop()
    elif change=='duplicate-edge':polygon['edges'].append(polygon['edges'][0][:])
    elif change=='invalid-index':polygon['faces'][0][0]=99
    elif change=='boolean-coordinate':polygon['vertices'][0][0]=True
    elif change=='color':polygon['metadata']['offColors']={'faces':[{'encoding':'unit','values':[0,0,0,2]}]}
    before=deepcopy(polygon)
    for operation in (lambda p:polygon_prism(p),lambda p:polygon_product(p,square()),lambda p:polygon_product(square(),p)):
        with pytest.raises(GeometryError):operation(polygon)
    assert polygon==before


def test_actual_vertex_budget_and_factor_aspect_ratio_rejections_are_explicit():
    polygon=regular_star_polygon(64)
    with pytest.raises(GeometryError,match='4000'):
        polygon_product(polygon,polygon)
    tiny=square();tiny['vertices']=[[x*1e-20,y*1e-20] for x,y in tiny['vertices']]
    with pytest.raises(GeometryError,match='numeric|planar'):
        polygon_product(square(),tiny)


@pytest.mark.parametrize('bound,value,operation', [
    ('MAX_PRODUCT_VERTICES',7,'prism'),('MAX_PRODUCT_VERTICES',15,'product'),
    ('MAX_ELEMENTS',5,'prism'),('MAX_ELEMENTS',20,'product'),
    ('MAX_FACE_VERTICES',3,'prism'),('MAX_FACE_VERTICES',3,'product'),
    ('MAX_COMPONENTS',1,'prism-components'),('MAX_COMPONENTS',1,'product-components'),
    ('MAX_INCIDENCES',10,'prism'),('MAX_INCIDENCES',10,'product'),
    ('MAX_PAYLOAD_BYTES',1,'prism'),('MAX_PAYLOAD_BYTES',1,'product')])
def test_resource_caps_are_enforced_before_partial_results_escape(monkeypatch,bound,value,operation):
    monkeypatch.setattr('engine.products.'+bound,value)
    a=hexagram() if operation.endswith('components') else square();b=square()
    before=deepcopy([a,b])
    with pytest.raises(GeometryError,match='resource|4000|7|15'):
        polygon_prism(a) if operation.startswith('prism') else polygon_product(a,b)
    assert [a,b]==before
