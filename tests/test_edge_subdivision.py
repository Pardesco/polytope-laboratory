"""Literal expected edge chains, ordered cycles and independent product incidence."""
from copy import deepcopy
from itertools import product
import json
import math

import pytest

import engine.edge_subdivision as subdivision
from engine.edge_subdivision import subdivide_edges
from engine.compounds import add_models
from engine.geometry import GeometryError, identity, validate


def model(vertices, faces, cells=None, edges=None, dimension=None):
    if edges is None:
        edges = [list(e) for e in sorted({tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:]+f[:1])})]
    result = {'id': 'literal-subdivision-source', 'name': 'Literal fixture', 'dimension': dimension or len(vertices[0]),
              'embeddingDimension': len(vertices[0]), 'interpretation': 'generalized-complex',
              'vertices': vertices, 'edges': edges, 'faces': faces, 'cells': cells or [],
              'metadata': {'arbitraryAttribute': {'original': True}}, 'numeric': {'certified': False}}
    assert validate(result)['passed']
    return result


def cube():
    return model([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
                 [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])


def tesseract():
    vertices = [list(p) for p in product((0, 1), repeat=4)]
    lookup = {tuple(p): i for i, p in enumerate(vertices)}
    faces, constraints = [], []
    for a in range(4):
        for b in range(a+1, 4):
            fixed = [d for d in range(4) if d not in (a, b)]
            for values in product((0, 1), repeat=2):
                cycle = []
                for x, y in ((0,0),(1,0),(1,1),(0,1)):
                    point = [0]*4
                    point[a], point[b] = x, y
                    for d, value in zip(fixed, values):
                        point[d] = value
                    cycle.append(lookup[tuple(point)])
                faces.append(cycle)
                constraints.append(dict(zip(fixed, values)))
    cells = [[i for i, fixed in enumerate(constraints) if fixed.get(d) == value] for d in range(4) for value in (0,1)]
    return model(vertices, faces, cells)


@pytest.mark.parametrize('factory,expected', [(cube,(20,24,6,0)),(tesseract,(48,64,24,8))])
def test_midpoint_counts_coordinates_every_cycle_and_cells_from_literal_sources(factory, expected):
    source = factory()
    original = deepcopy(source)
    result = subdivide_edges(source)
    assert tuple(len(result[k]) for k in ('vertices','edges','faces','cells')) == expected
    assert result['vertices'][:len(source['vertices'])] == source['vertices']
    assert result['vertices'][len(source['vertices']):] == [[(a+b)/2 for a,b in zip(source['vertices'][u],source['vertices'][v])] for u,v in source['edges']]
    assert all(len(f)==8 for f in result['faces'])
    assert [[v for v in f if v<len(source['vertices'])] for f in result['faces']] == source['faces']
    assert result['cells'] == source['cells'] and result['validation']['passed']
    assert source == original and 'measure' not in result and 'facetEquations' not in result
    assert result['metadata']['edgeSubdivision']['sourceModel'] == source


def test_partial_reversed_edge_orientation_inserts_same_ids_into_opposite_face_directions():
    source = cube()
    index = source['edges'].index([0,1])
    source['edges'][index] = [1,0]
    result = subdivide_edges(source, 3, [index])
    new = len(source['vertices'])
    assert result['vertices'][new:] == [[2/3,0,0],[1/3,0,0]]
    assert result['faces'][0] == [0,3,2,1,new,new+1]
    assert result['faces'][2] == [0,new+1,new,1,5,4]
    assert len(result['vertices']) == 10 and len(result['edges']) == 14
    assert result['metadata']['edgeSubdivision']['sourceMaps']['edges'][index] == list(range(index,index+3))
    assert result['metadata']['edgeSubdivision']['vertexSources'][new]['parameter'] == {'numerator':1,'denominator':3}
    assert result['metadata']['edgeSubdivision']['edgeChains'][index] == [1,new,new+1,0]


def test_2d_star_cycle_winding_is_literal_and_crossing_points_not_welded():
    vertices = [[math.cos(i*2*math.pi/5),math.sin(i*2*math.pi/5)] for i in range(5)]
    face = [0,2,4,1,3]
    source = model(vertices,[face])
    result = subdivide_edges(source,4)
    assert len(result['vertices']) == 20 and len(result['edges']) == 20 and len(result['faces'][0]) == 20
    assert [v for v in result['faces'][0] if v<5] == face
    assert result['metadata']['edgeSubdivision']['vertexSources'][6]['parameter'] == {'numerator':1,'denominator':2}
    assert result['interpretation'] == 'generalized-complex' and not result['numeric']['certified']


def test_wire_strata_isolated_points_and_coincident_midpoints_preserve_identity():
    source = model([[-1,0],[1,0],[0,-1],[0,1],[10,10]],[],edges=[[0,1],[2,3]])
    result = subdivide_edges(source)
    assert result['vertices'][5:] == [[0,0],[0,0]]
    assert result['edges'] == [[0,5],[5,1],[2,6],[6,3]]
    assert result['vertices'][4] == [10,10] and result['faces'] == []
    assert result['metadata']['edgeSubdivision']['sourceMaps']['vertices'] == [0,1,2,3,4]


def test_rgba_units_source_history_and_json_persistence_are_separate_from_classification():
    source = tesseract()
    face_color = {'encoding':'byte','values':[20,40,60,128]}
    cell_color = {'encoding':'unit','values':[.2,.3,.4,.25]}
    source['metadata'].update(coordinateUnits='mm',fillRule='evenodd',key='do-not-inherit-catalog-claim',
                              offColors={'faces':[face_color]*24,'cells':[cell_color]*8})
    result = subdivide_edges(source)
    assert result['metadata']['offColors'] == source['metadata']['offColors']
    assert result['metadata']['coordinateUnits'] == 'mm' and result['metadata']['fillRule'] == 'evenodd'
    assert 'key' not in result['metadata']
    restored = json.loads(json.dumps(result))
    assert identity(restored) == identity(result)
    result['metadata']['offColors']['faces'][0]['values'][0] = 255
    result['metadata']['edgeSubdivision']['sourceModel']['vertices'][0][0] = 900
    assert source['metadata']['offColors']['faces'][0]['values'][0] == 20 and source['vertices'][0][0] == 0


@pytest.mark.parametrize('divisions', [1,2,7])
def test_empty_selection_is_valid_explicit_no_geometry_change(divisions):
    source = cube()
    result = subdivide_edges(source,divisions,[])
    assert identity(result) == identity(source)
    assert result['provenance']['parameters']['edge_ids'] == []


def test_divisions_one_keeps_literal_incidence_and_records_explicit_parameters():
    source = cube()
    result = subdivide_edges(source,1)
    assert identity(result) == identity(source)
    assert result['metadata']['edgeSubdivision']['vertexSources'] == [{'vertex':i} for i in range(8)]


@pytest.mark.parametrize('divisions', [0,-1,129,True,2.,'2',math.inf])
def test_division_domain_diagnosed(divisions):
    with pytest.raises(GeometryError,match='divisions'):
        subdivide_edges(cube(),divisions)


@pytest.mark.parametrize('edges', [[-1],[99],[0,0],[True],'all'])
def test_invalid_selected_edge_ids_diagnosed(edges):
    with pytest.raises(GeometryError,match='edge IDs'):
        subdivide_edges(cube(),2,edges)


def test_compound_hierarchical_map_domain_explicit_not_silently_discarded():
    with pytest.raises(GeometryError,match='hierarchical'):
        subdivide_edges(add_models(cube(),cube()))


@pytest.mark.parametrize('limit,value', [('MAX_VERTICES',19),('MAX_ELEMENTS',23),('MAX_FACE_VERTICES',7),('MAX_INCIDENCES',10)])
def test_output_resource_budgets_prevent_partial_result(monkeypatch,limit,value):
    source = cube()
    original = deepcopy(source)
    monkeypatch.setattr(subdivision,limit,value)
    with pytest.raises(GeometryError,match='resource limit'):
        subdivide_edges(source)
    assert source == original


def test_history_payload_budget_is_explicit(monkeypatch):
    monkeypatch.setattr(subdivision,'MAX_PAYLOAD_BYTES',10)
    with pytest.raises(GeometryError,match='payload resource'):
        subdivide_edges(cube())


def test_malformed_incidence_and_unresolved_wire_coordinates_are_diagnosed():
    invalid = cube()
    invalid['faces'][0][0] = 99
    with pytest.raises(GeometryError,match='source incidence'):
        subdivide_edges(invalid)
    collapsed = model([[0,0],[0,0]],[],edges=[[0,1]])
    with pytest.raises(GeometryError,match='coincident geometric'):
        subdivide_edges(collapsed)
    near = model([[1e16,0],[1e16+2,0]],[],edges=[[0,1]])
    with pytest.raises(GeometryError,match='float64 precision'):
        subdivide_edges(near)


def test_2d_face_embedded_in_4d_uses_literal_ambient_interpolation():
    source = model([[0,0,0,0],[1,0,1,0],[1,1,1,3],[0,1,0,3]],[[0,1,2,3]],dimension=2)
    result = subdivide_edges(source)
    assert result['dimension'] == 2 and result['embeddingDimension'] == 4
    assert result['vertices'][4] == [.5,0,.5,0]
    assert result['validation']['passed']


def test_repeated_subdivision_preserves_previous_parameterized_source_history():
    source = cube()
    first = subdivide_edges(source)
    second = subdivide_edges(first)
    assert (len(second['vertices']),len(second['edges']),len(second['faces'])) == (44,48,6)
    assert all(len(face)==16 for face in second['faces'])
    assert second['metadata']['edgeSubdivision']['sourceModel'] == first
    assert second['metadata']['edgeSubdivision']['sourceModel']['metadata']['edgeSubdivision']['sourceModel'] == source
