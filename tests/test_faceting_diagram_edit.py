from copy import deepcopy
from itertools import permutations, product
import json

import pytest

from engine.automatic_faceting import candidate_facets
from engine.faceting_diagram_workflow import dispatch_diagram
from engine.formats import validate_project, save_project, load_file
from engine.geometry import GeometryError, canonical_cycle, identity
from engine.generators import regular
from engine.server import dispatch
from engine.star_polyhedra import kepler_poinsot
from engine.faceting_policy_predicates import analyze_spiky
from test_faceting_diagram import cube, ids


def draw(source, pool, seeds):
    vertex = next(row['cycle'][0] for row in pool['candidates'] if row['id'] == seeds[0])
    return dispatch_diagram(
        {
            'op': 'facet-diagram',
            'model': source,
            'params': {'catalogue': pool, 'parameters': {'vertex_id': vertex, 'seed_ids': seeds}},
        }
    )


def tetra_group(source):
    lookup = {tuple(p): i for i, p in enumerate(source['vertices'])}
    actions = []
    for axes in permutations(range(3)):
        for signs in product((-1, 1), repeat=3):
            if signs[0] * signs[1] * signs[2] != 1:
                continue
            actions.append([lookup[tuple(signs[i] * p[axes[i]] for i in range(3))] for p in source['vertices']])
    return actions


def test_cube_one_tetrahedron_and_full_stella_octangula_replication():
    source = cube()
    before = deepcopy(source)
    pool = candidate_facets(source, max_face_vertices=3, symmetry_permutations=tetra_group(source))
    seed = ids(pool, [[1, 2, 4]])
    reply = draw(source, pool, seed)
    model = reply['previewModel']
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces')] == [8, 6, 4]
    assert model['metadata']['activeSourceVertexIds'] == [1, 2, 4, 7]
    assert len(reply['diagram']['selection']['actionIndices']) == 24
    full = candidate_facets(source, max_face_vertices=3, source_symmetry={'mode': 'all'})
    expanded = draw(source, full, ids(full, [[1, 2, 4]]))
    assert [len(expanded['previewModel'][k]) for k in ('vertices', 'edges', 'faces')] == [8, 12, 8]
    assert expanded['diagram']['catalogue']['sourceSymmetryDiscovery']['complete']
    assert expanded['previewModel']['vertices'] == source['vertices'] and source == before
    assert not expanded['previewModel']['metadata']['facetingDiagram']['closedManifoldClaim']


def test_cuboctahedron_to_octahemioctahedron_counts_and_center_planes():
    source = regular('cuboctahedron')
    pool = candidate_facets(source, max_face_vertices=6, source_symmetry={'mode': 'all'})
    points = source['vertices']
    lookup = {tuple(round(x, 9) for x in p): i for i, p in enumerate(points)}
    # Scale is irrelevant; this generator's cuboctahedron lies at (+/-a,+/-a,0).
    a = max(abs(x) for p in points for x in p)
    hexagon = [
        lookup[tuple(round(a * x, 9) for x in p)]
        for p in [(1, -1, 0), (1, 0, -1), (0, 1, -1), (-1, 1, 0), (-1, 0, 1), (0, -1, 1)]
    ]
    triangle = next(face for face in source['faces'] if len(face) == 3)
    reply = draw(source, pool, ids(pool, [triangle, hexagon]))
    model = reply['previewModel']
    assert sorted(map(len, model['faces'])) == [3] * 8 + [6] * 4
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces')] == [12, 24, 12]
    assert all(row['incidentFacetCount'] == 2 for row in reply['diagram']['selection']['edgeDiagnostics'])


def test_icosahedron_to_great_icosahedron_preserves_long_edge_cycles():
    source = regular('icosahedron')
    reference = kepler_poinsot('great-icosahedron')
    pool = candidate_facets(source, max_face_vertices=3, source_symmetry={'mode': 'all'})
    reply = draw(source, pool, ids(pool, reference['faces']))
    model = reply['previewModel']
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces')] == [12, 30, 20]
    assert {canonical_cycle(f) for f in model['faces']} == {canonical_cycle(f) for f in reference['faces']}
    assert model['vertices'] == source['vertices'] and model['numeric']['certified'] is False
    # Binary64 phi does not obey its algebraic identity exactly: do not claim order120.
    assert pool['symmetry']['group']['order'] == 24


def test_spiky_filter_distinguishes_long_interior_segments_from_hull_face_diagonals():
    source = regular('icosahedron')
    star = kepler_poinsot('great-icosahedron')
    accepted = analyze_spiky(source, star['faces'])
    assert accepted['status'] == 'complete' and accepted['passed'] is True
    assert all(not row['hullBoundarySegment'] for row in accepted['witnesses']['edges'])
    rejected = analyze_spiky(cube(), [[1, 2, 4], [1, 4, 7], [1, 7, 2], [2, 7, 4]])
    assert rejected['status'] == 'complete' and rejected['passed'] is False
    assert all(row['hullBoundarySegment'] for row in rejected['witnesses']['edges'])


def test_rounded_small_stellated_dodecahedron_pentagrams_are_not_silently_snapped():
    source = regular('icosahedron')
    star = kepler_poinsot('small-stellated-dodecahedron')
    pool = candidate_facets(source, max_face_vertices=5)
    keys = {canonical_cycle(row['cycle']) for row in pool['candidates']}
    assert not any(canonical_cycle(face) in keys for face in star['faces'])
    assert pool['generationStatus'] == 'complete'


def test_saved_diagram_adoption_project_roundtrip_replay_and_branch(tmp_path):
    project = validate_project(
        {
            'format': 'polytope-laboratory',
            'version': 1,
            'active': 0,
            'documents': [
                {
                    'id': 'editor',
                    'cursor': 0,
                    'states': [{'model': cube(), 'view': {'coordinateUnit': 'mm'}, 'notes': 'kept'}],
                }
            ],
        }
    )
    doc = project['documents'][0]
    source = doc['states'][0]['model']
    pool = candidate_facets(source, max_face_vertices=3, symmetry_permutations=tetra_group(source))
    reply = draw(source, pool, ids(pool, [[1, 2, 4]]))
    doc['states'][0]['view']['facetingDiagram'] = reply['state']
    path = tmp_path / 'diagram.polyproj'
    save_project(path, project)
    restored = load_file(path)['project']['documents'][0]
    args = {'state': json.loads(json.dumps(restored['states'][0]['view']['facetingDiagram']))}
    result = dispatch(
        {'op': 'recipe-run', 'params': {'document': restored, 'operation': 'facet-diagram-adopt', 'parameters': args}}
    )
    assert result['cursor'] == 1 and result['states'][0]['model'] == source
    base = result['states'][1]['model']
    assert identity(base) == identity(reply['previewModel'])
    assert base['metadata']['coordinateUnits'] == 'mm' and result['states'][1]['notes'] == 'kept'
    assert result['states'][1]['view']['facetingDiagram'] == reply['state']
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': result}})
    assert identity(replay['states'][0]['model']) == identity(base)
    branch = dispatch({'op': 'recipe-branch', 'params': {'document': result, 'parameters': args}})
    assert identity(branch['states'][-1]['model']) == identity(base)


@pytest.mark.parametrize(
    'change',
    [
        lambda s: s['parameters'].update(seed_ids=['facet-' + '0' * 64]),
        lambda s: s['source']['vertices'][0].__setitem__(0, 42),
        lambda s: s['catalogue']['symmetry']['candidateActionIndices'][0].reverse(),
    ],
)
def test_adoption_reconstructs_untrusted_state_without_mutating_source(change):
    source = cube()
    pool = candidate_facets(source, max_face_vertices=3)
    reply = draw(source, pool, ids(pool, [[0, 1, 2]]))
    bad = deepcopy(reply['state'])
    change(bad)
    before = deepcopy(source)
    with pytest.raises(GeometryError):
        dispatch({'op': 'facet-diagram-adopt', 'model': source, 'params': {'state': bad}})
    assert source == before


def test_empty_draft_cannot_become_base_and_colors_remain_owned():
    source = cube()
    pool = candidate_facets(source)
    empty = dispatch_diagram(
        {'op': 'facet-diagram', 'model': source, 'params': {'catalogue': pool, 'parameters': {'vertex_id': 0}}}
    )
    assert empty['previewModel'] is None
    with pytest.raises(GeometryError, match='at least one'):
        dispatch({'op': 'facet-diagram-adopt', 'model': source, 'params': {'state': empty['state']}})
    reply = draw(source, pool, ids(pool, [source['faces'][0]]))
    assert reply['previewModel']['metadata']['offColors']['faces'] == [source['metadata']['offColors']['faces'][0]]
    assert reply['previewModel']['validation']['passed']
