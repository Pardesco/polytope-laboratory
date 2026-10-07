"""Independent literal boundaries, support planes and non-promotion regressions."""
from copy import deepcopy
import math

import numpy as np
import pytest

import engine.convex_classification as classifier
from engine.antiprisms import rational_antiprism
from engine.edge_subdivision import subdivide_edges
from engine.geometry import GeometryError, identity
from engine.prisms import polyhedron_prism
from engine.products import polygon_prism, polygon_product
from engine.star_polygons import regular_star_polygon


def edges(faces):
    return [list(pair) for pair in sorted({tuple(sorted((a,b))) for face in faces
                                         for a,b in zip(face,face[1:]+face[:1])})]


def source(vertices,faces,dimension):
    return {'id':'independent-literal-boundary','name':'Literal boundary',
            'dimension':dimension,'embeddingDimension':dimension,
            'interpretation':'generalized-complex','vertices':deepcopy(vertices),
            'edges':edges(faces),'faces':deepcopy(faces),'cells':[],
            'metadata':{},'numeric':{'mode':'float64-approximate','certified':False}}


def square():
    return source([[-1,-1],[1,-1],[1,1],[-1,1]],[[0,1,2,3]],2)


def cube():
    return source([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                   [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
                  [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],
                   [2,3,7,6],[3,0,4,7]],3)


def assert_passed(model):
    original=deepcopy(model);result=classifier.analyze_convex_boundary(model)
    assert model==original
    assert result['status']=='passed',result['diagnostics']
    assert result['convex'] is True
    assert result['numeric']['certified'] is False
    assert result['sourceFingerprint']==identity(model)
    assert result['sourceModelId']==model['id']
    assert 'model' not in result and 'measure' not in result
    kind={2:'edges',3:'faces',4:'cells'}[model['dimension']]
    assert [item['sourceFacetId'] for item in result['facetSupports']]==list(range(len(model[kind])))
    for item in result['facetSupports']:
        boundary=model[kind][item['sourceFacetId']]
        vertices=(set(v for f in boundary for v in model['faces'][f]) if kind=='cells' else set(boundary))
        assert item['sourceFacetKind']==kind and set(item['vertexIds'])==vertices
        normal,offset=np.array(item['equation'][:-1]),item['equation'][-1]
        assert np.linalg.norm(normal)==pytest.approx(1)
        residual=np.asarray(model['vertices'])@normal+offset
        assert float(np.max(residual))<=item['tolerance']
        assert max(abs(float(residual[i])) for i in vertices)<=item['tolerance']
        assert item['maximumSourceResidual']==pytest.approx(float(np.max(residual)))
    return result


@pytest.mark.parametrize('factory',[
    square,cube,lambda:polygon_prism(square(),2),
    lambda:rational_antiprism(3),lambda:rational_antiprism(4),
    lambda:rational_antiprism(5),lambda:rational_antiprism(4,-1),
    lambda:polyhedron_prism(cube(),2),
    lambda:polyhedron_prism(rational_antiprism(3),2),
    lambda:polygon_product(square(),square()),
    lambda:polygon_product(regular_star_polygon(3),regular_star_polygon(3))])
def test_complete_ordinary_boundaries_pass_without_promoting_or_replacing_source(factory):
    model=factory();assert_passed(model)
    assert model['interpretation']=='generalized-complex' and model['numeric']['certified'] is False


@pytest.mark.parametrize('dimension',[3,4])
def test_hypercube_support_planes_independently_are_plus_minus_each_coordinate_axis(dimension):
    model=cube() if dimension==3 else polyhedron_prism(cube(),2)
    result=assert_passed(model)
    expected={tuple(sign if i==axis else 0 for i in range(dimension))+(-1,)
              for axis in range(dimension) for sign in (-1,1)}
    assert {tuple(round(x,12) for x in record['equation']) for record in result['facetSupports']}==expected


def test_source_relabeling_rotation_reversal_and_table_order_preserve_exact_source_facet_ids():
    model=polyhedron_prism(cube(),2)
    count=len(model['vertices']);model['vertices'].reverse()
    model['edges']=[[count-1-v for v in edge[::-1]] for edge in model['edges'][::-1]]
    model['faces']=[[count-1-v for v in face[2:]+face[:2]][::-1] for face in model['faces'][::-1]]
    face_count=len(model['faces'])
    model['cells']=[[face_count-1-f for f in cell[::-1]] for cell in model['cells'][::-1]]
    assert_passed(model)


def test_attributes_cached_fields_and_rgba_remain_exactly_unchanged_and_evidence_is_detached():
    model=cube();model['metadata']={'offColors':{'faces':[
        {'encoding':'unit','values':[.1,.2,.3,.4]} for _ in model['faces']]},'literal':['untouched']}
    model['view']={'angles':[1,2,3,4,5,6]};model['validation']={'historical':'retained'}
    result=assert_passed(model);original=deepcopy(model)
    result['facetSupports'][0]['vertexIds'].clear();result['normalization']['origin'].clear()
    assert model==original


@pytest.mark.parametrize('symbol',['5/2','5/3','5/-2','5/-3'])
def test_star_antiprism_order_is_not_replaced_by_hull(symbol):
    model=rational_antiprism(symbol=symbol);original=deepcopy(model)
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='non-convex' and result['convex'] is False
    assert not result['facetSupports'] and model==original
    assert 'Ordered source face cycles' in result['diagnostics'][0]['message']


@pytest.mark.parametrize('factory',[
    lambda:polygon_prism(regular_star_polygon(5,2),2),
    lambda:polygon_product(regular_star_polygon(5,2),square()),
    lambda:polygon_product(regular_star_polygon(5,-3),regular_star_polygon(3)),
    lambda:polyhedron_prism(rational_antiprism(5,3),2),
    lambda:rational_antiprism(6,2),
    lambda:polygon_product(regular_star_polygon(6,2),regular_star_polygon(3))])
def test_crossed_and_disconnected_star_constructions_never_receive_convex_support_evidence(factory):
    model=factory();original=deepcopy(model);result=classifier.analyze_convex_boundary(model)
    assert result['status'] in ('non-convex','unsupported') and result['convex'] is False
    assert not result['facetSupports'] and model==original


@pytest.mark.parametrize('dimension',[2,3,4])
def test_bow_tie_order_fails_even_with_exact_convex_vertex_sets(dimension):
    model=square() if dimension==2 else cube() if dimension==3 else polyhedron_prism(cube(),2)
    face=model['faces'][0];model['faces'][0]=[face[0],face[2],face[1],face[3]]
    model['edges']=edges(model['faces']);original=deepcopy(model)
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='non-convex' and result['convex'] is False
    assert 'Ordered source face cycles' in result['diagnostics'][0]['message']
    assert not result['facetSupports'] and model==original


def test_incomplete_four_dimensional_cell_with_same_eight_vertices_is_rejected():
    model=polyhedron_prism(cube(),2);cell=model['cells'][0]
    before=set(v for f in cell for v in model['faces'][f]);cell.pop()
    assert set(v for f in cell for v in model['faces'][f])==before and len(before)==8
    original=deepcopy(model);result=classifier.analyze_convex_boundary(model)
    assert result['status']=='non-convex' and 'cell face-membership' in result['diagnostics'][0]['message']
    assert not result['facetSupports'] and model==original


def test_incomplete_three_dimensional_boundary_is_rejected():
    model=cube();model['faces'].pop();model['edges']=edges(model['faces'])
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='non-convex' and not result['facetSupports']


def test_extra_diagonal_edge_is_not_accepted_merely_from_matching_vertex_and_face_sets():
    model=cube();model['edges'].append([0,2])
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='non-convex'
    assert result['diagnostics'][0]['extraEdges']==[[0,2]] and not result['facetSupports']


def test_coplanar_triangulation_is_explicitly_unsupported_not_silently_simplified():
    model=cube();a,b,c,d=model['faces'].pop(0);model['faces'][:0]=[[a,b,c],[a,c,d]]
    model['edges']=edges(model['faces']);original=deepcopy(model)
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='unsupported' and 'triangulations' in result['diagnostics'][0]['message']
    assert not result['facetSupports'] and model==original


def test_collinear_subdivision_is_explicitly_unsupported_with_omitted_source_ids():
    model=subdivide_edges(cube(),2);result=classifier.analyze_convex_boundary(model)
    assert result['status']=='unsupported'
    assert result['diagnostics'][0]['omittedSourceVertexIds']==list(range(8,20))
    assert not result['facetSupports']


@pytest.mark.parametrize('point',[[0,0,0],[-1,-1,-1]])
def test_interior_or_duplicate_literal_vertex_ids_are_never_removed_or_welded(point):
    model=cube();model['vertices'].append(point);original=deepcopy(model)
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='unsupported' and not result['facetSupports'] and model==original


@pytest.mark.parametrize('bad',[float('nan'),float('inf'),10**1000,True,'1'])
def test_malformed_numeric_coordinates_return_structured_failure_not_python_exception(bad):
    model=cube();model['vertices'][0][0]=bad
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='invalid' and result['diagnostics'] and not result['facetSupports']


def test_affine_dimension_collapse_fails_before_reference_hull(monkeypatch):
    model=square();model['dimension']=model['embeddingDimension']=3
    model['vertices']=[point+[0] for point in model['vertices']]
    monkeypatch.setattr(classifier,'hull',lambda *args:pytest.fail('degenerate source must not reach hull'))
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='invalid' and not result['facetSupports']


def test_higher_embedding_coordinates_are_explicitly_unsupported():
    model=square();model['embeddingDimension']=3;model['vertices']=[point+[0] for point in model['vertices']]
    assert classifier.analyze_convex_boundary(model)['status']=='unsupported'


def test_four_dimensional_vertex_budget_is_explicit_and_does_not_run_reference_hull(monkeypatch):
    model=polygon_product(regular_star_polygon(3),regular_star_polygon(23))
    monkeypatch.setattr(classifier,'hull',lambda *args:pytest.fail('over-budget source must not reach hull'))
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='unsupported'
    assert result['diagnostics'][0]['sourceVertices']==69 and result['diagnostics'][0]['limit']==64
    assert not result['facetSupports']


@pytest.mark.parametrize('model',[None,{}, {'dimension':3}, {'vertices':'malformed'}])
def test_malformed_model_is_diagnosed_without_attempting_reference_hull(model,monkeypatch):
    monkeypatch.setattr(classifier,'hull',lambda *args:pytest.fail('invalid source must not reach hull'))
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='invalid' and result['convex'] is False and result['diagnostics']


def test_malformed_nested_historical_piece_is_diagnosed_without_attribute_error():
    model=cube();model['convexPieces']=[None]
    result=classifier.analyze_convex_boundary(model)
    assert result['status']=='invalid' and result['diagnostics'] and not result['facetSupports']


def test_reference_predicate_failure_is_unresolved_and_read_only(monkeypatch):
    def fail(*args):raise GeometryError('independent numeric predicate unresolved')
    monkeypatch.setattr(classifier,'hull',fail)
    model=cube();original=deepcopy(model);result=classifier.analyze_convex_boundary(model)
    assert result['status']=='unresolved' and not result['facetSupports'] and model==original


@pytest.mark.parametrize('corruption',['coordinates','support'])
def test_reference_cannot_change_coordinates_or_publish_partial_failed_supports(monkeypatch,corruption):
    actual=classifier.hull
    def corrupt(*args):
        result=actual(*args)
        if corruption=='coordinates':result['vertices'][0][0]+=.01
        else:result['facetEquations'][-1][-1]+=1
        return result
    monkeypatch.setattr(classifier,'hull',corrupt)
    result=classifier.analyze_convex_boundary(cube())
    assert result['status']=='unresolved' and not result['facetSupports']


@pytest.mark.parametrize('dimension,scale',[(3,1e-100),(3,1e99),(4,1e-100),(4,1e99)])
def test_normalized_verification_handles_literal_scale_without_unused_hull_volume_overflow(dimension,scale):
    model=cube() if dimension==3 else polyhedron_prism(cube(),2)
    model['vertices']=[[coordinate*scale for coordinate in point] for point in model['vertices']]
    result=assert_passed(model)
    assert result['normalization']['scale']==pytest.approx(2*scale,rel=1e-12,abs=0)
    assert all(math.isfinite(value) for record in result['facetSupports'] for value in record['equation'])


def test_source_fingerprint_binds_literal_order_while_reversed_cycles_still_pass():
    model=cube();first=assert_passed(model)
    model['faces'][0].reverse();second=assert_passed(model)
    assert first['sourceFingerprint']!=second['sourceFingerprint']
