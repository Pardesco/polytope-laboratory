"""Independent Tuta local rays and full finite-completion/history qualification."""

from collections import Counter
from copy import deepcopy
from itertools import permutations, product
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.convex_classification import analyze_convex_boundary
from engine.formats import load_file, save_project, validate_project
from engine.geometry import GeometryError, canonical_cycle, hull, identity, validate
from engine.history import canonical_model
from engine.operations import transform, vertex_figure
from engine.server import dispatch
from engine.vertex_figure_construction import candidate_specs, vertex_figure_candidates

DOMAIN = 'regular-wythoff-and-scaliform'
CANDIDATE = 'scaliform:scaliform4-tuta'


def supplied_figure():
    # At (-1,-1,-3,-1), five unit-edge neighbor rays have equal dot 4
    # with (1,1,3,1). Project into its perpendicular orthonormal frame.
    rays = np.array([[0, 2, 0, 2], [2, 0, 0, 2], [2, 2, 0, 0], [0, -2, 2, 0], [-2, 0, 2, 0]])
    frame = np.array([[1, -1, 0, 0], [1, 1, 0, -2], [1, 1, -1, 1]], dtype=float)
    frame /= np.linalg.norm(frame, axis=1)[:, None]
    figure = hull((rays @ frame.T).tolist(), 'Tuta five-vertex figure (independent rays)')
    figure['metadata']['coordinateUnits'] = 'mm'
    return figure


@pytest.mark.parametrize('spec', candidate_specs(DOMAIN), ids=lambda spec: spec['id'])
def test_count_pruning_agrees_with_every_constructed_candidate(spec):
    from engine.vertex_figure_construction import _candidate, _figure_vertex_count

    model, figure, _ = _candidate(spec['id'])
    degree = sum(0 in edge for edge in model['edges'])
    assert _figure_vertex_count(spec) == degree == len(figure['vertices'])


def test_five_vertex_search_does_not_build_incompatible_candidates(monkeypatch):
    from engine import vertex_figure_construction as vf

    original = vf._candidate
    built = []

    def candidate(candidate_id):
        built.append(candidate_id)
        return original(candidate_id)

    monkeypatch.setattr(vf, '_candidate', candidate)
    receipt = vf.vertex_figure_candidates(supplied_figure(), DOMAIN)
    assert built == ['wythoff:A4:1011', 'wythoff:A4:1101', 'wythoff:B4:0011', CANDIDATE]
    assert receipt['candidateCount'] == 37 and len(receipt['searchedCandidates']) == 37
    assert receipt['finiteDomainExhausted'] and [row['id'] for row in receipt['candidates']] == [CANDIDATE]


def construct(source, edge=1):
    return dispatch(
        {'op': 'construct-from-vertex-figure', 'model': source, 'params': {'candidate': CANDIDATE, 'edge_length': edge}}
    )


def test_previously_unsupported_named_figure_has_one_explicit_new_match():
    source = supplied_figure()
    before = deepcopy(source)
    assert [len(source[k]) for k in ('vertices', 'edges', 'faces')] == [5, 8, 5]
    assert Counter(map(len, source['faces'])) == {3: 4, 4: 1}
    assert not vertex_figure_candidates(source, 'regular-and-wythoff')['candidates']
    receipt = dispatch({'op': 'vertex-figure-candidates', 'model': source, 'params': {'domain': DOMAIN}})
    assert source == before and receipt['status'] == 'matched'
    assert receipt['candidateCount'] == 37 and receipt['finiteDomainExhausted']
    assert receipt['searchedCandidates'] == [s['id'] for s in candidate_specs(DOMAIN)]
    assert [r['id'] for r in receipt['candidates']] == [CANDIDATE]
    row = receipt['candidates'][0]
    assert row['counts'] == dict(vertices=24, edges=60, faces=52, cells=16)
    assert row['match']['maxNormalizedResidual'] < 1e-12 and not row['match']['certified']
    assert len(set(row['match']['sourceVertexToCandidateFigure'])) == 5


@pytest.mark.parametrize('edge', [1e-6, 2.5, 1e6])
def test_expected_polychoron_metric_complete_incidence_and_scaliform_evidence(edge):
    source = transform(supplied_figure(), matrix=[[0, -1, 0], [0, 0, 1], [-1, 0, 0]], scale=7, translation=[3, 5, -2])
    result = construct(source, edge)
    expected = []
    for p in sorted(set(permutations([3, 1, 1]))):
        for signs in product((-1, 1), repeat=4):
            if math.prod(signs) > 0:
                expected.append((np.array([*p, 1]) * signs * edge / math.sqrt(8)).tolist())
    oracle = hull(expected)
    assert np.allclose(result['vertices'], oracle['vertices'], atol=edge * 1e-12, rtol=1e-12)
    assert result['edges'] == oracle['edges']
    assert Counter(canonical_cycle(f) for f in result['faces']) == Counter(canonical_cycle(f) for f in oracle['faces'])
    cell_keys = lambda m: Counter(tuple(sorted(canonical_cycle(m['faces'][f]) for f in c)) for c in m['cells'])
    assert cell_keys(result) == cell_keys(oracle)
    assert validate(result)['passed'] and analyze_convex_boundary(result)['convex']
    assert Counter((len({v for f in c for v in result['faces'][f]}), len(c)) for c in result['cells']) == {
        (12, 8): 2,
        (9, 8): 8,
        (4, 4): 6,
    }
    evidence = result['metadata']['scaliform4Evidence']
    assert evidence['resultFingerprint'] == identity(result)
    assert evidence['symmetryOrder'] == 48 and evidence['vertexOrbitCount'] == 1
    assert evidence['edgeRelativeSpread'] < 1e-12 and evidence['maxElementCircumsphereRelativeSpread'] < 1e-12
    metric = result['metadata']['vertexFigureConstruction']['outputMetric']
    assert metric['maxRelativeEdgeResidual'] < 1e-12 and not metric['certified']
    assert result['metadata']['vertexFigureConstruction']['sourceFigure'] == source
    assert result['metadata']['coordinateUnits'] == 'mm'
    # Every local figure is similar, including vertices in all coordinate layers.
    from engine.vertex_figure_construction import match_vertex_figure

    for vertex in range(24):
        assert match_vertex_figure(source, vertex_figure(result, vertex=vertex)['model']) is not None


def test_all_ambiguous_candidates_remain_explicit_and_labels_do_not_select():
    from engine.generators import regular

    source = regular('tetrahedron')
    source['name'] = 'Tuta'
    receipt = vertex_figure_candidates(source, DOMAIN)
    assert receipt['status'] == 'ambiguous' and CANDIDATE not in [r['id'] for r in receipt['candidates']]
    expected = {
        'regular:simplex4',
        'regular:tesseract',
        'regular:cell120',
        'wythoff:A4:0001',
        'wythoff:A4:1000',
        'wythoff:B4:1000',
    }
    assert {r['id'] for r in receipt['candidates']} == expected
    for row in receipt['candidates']:
        built = dispatch({'op': 'construct-from-vertex-figure', 'model': source, 'params': {'candidate': row['id']}})
        assert {k: len(built[k]) for k in row['counts']} == row['counts']
        assert built['metadata']['vertexFigureConstruction']['candidate']['id'] == row['id']


def test_metric_and_cycle_spoofs_are_refused_and_unmatched_search_names_its_domain():
    source = transform(supplied_figure(), matrix=[[1.01, 0, 0], [0, 1, 0], [0, 0, 1]])
    receipt = vertex_figure_candidates(source, DOMAIN)
    assert receipt['status'] == 'no-match' and receipt['candidates'] == []
    assert receipt['domain'] == DOMAIN and receipt['candidateCount'] == 37 and receipt['finiteDomainExhausted']
    assert 'only the searched domain' in receipt['scope']
    with pytest.raises(GeometryError, match='no longer matches'):
        construct(source)
    bad = supplied_figure()
    face = next(f for f in bad['faces'] if len(f) == 4)
    face[1], face[2] = face[2], face[1]
    with pytest.raises(GeometryError):
        construct(bad)
    with pytest.raises(GeometryError, match='finite supported domain'):
        dispatch(
            {
                'op': 'construct-from-vertex-figure',
                'model': supplied_figure(),
                'params': {'candidate': 'scaliform:scaliform4-koho'},
            }
        )


def test_reordered_mirrored_figure_preserves_source_and_unique_completion():
    source = transform(supplied_figure(), matrix=[[-1, 0, 0], [0, 1, 0], [0, 0, 1]], scale=0.03, translation=[2, 1, 4])
    order = [4, 2, 0, 3, 1]
    mapping = {old: new for new, old in enumerate(order)}
    source['vertices'] = [source['vertices'][i] for i in order]
    source['edges'] = [[mapping[i] for i in e] for e in reversed(source['edges'])]
    source['faces'] = [[mapping[i] for i in reversed(f)] for f in reversed(source['faces'])]
    source.pop('facetEquations', None)
    source.pop('facetVertices', None)
    source['fingerprint'] = identity(source)
    before = deepcopy(source)
    receipt = vertex_figure_candidates(source, DOMAIN)
    assert [r['id'] for r in receipt['candidates']] == [CANDIDATE]
    result = construct(source)
    assert source == before and result['metadata']['vertexFigureConstruction']['sourceFigure'] == before


def test_recipe_undo_redo_reopen_replay_and_parameter_branch(tmp_path):
    source = supplied_figure()
    doc = {
        'id': 'supplied-figure',
        'cursor': 0,
        'states': [{'model': source, 'view': {'coordinateUnit': 'mm'}, 'notes': 'Keep this figure'}],
    }
    before = deepcopy(doc)
    result = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': doc,
                'operation': 'construct-from-vertex-figure',
                'parameters': {'candidate': CANDIDATE, 'edge_length': 2.5},
                'label': 'Tuta from figure',
            },
        }
    )
    assert doc == before and len(result['states']) == 2 and result['cursor'] == 1
    assert canonical_model(result['states'][0]['model']) == canonical_model(source)
    expected = result['states'][1]['model']
    assert result['states'][1]['notes'] == 'Keep this figure'
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]}
    for cursor in [0, 1]:
        project['documents'][0]['cursor'] = cursor
        checked = validate_project(project)['documents'][0]
        assert canonical_model(checked['states'][checked['cursor']]['model']) == canonical_model(
            source if cursor == 0 else expected
        )
    path = tmp_path / 'tuta.polyproj'
    save_project(path, project)
    restored = load_file(path)['project']['documents'][0]
    graph = restored['operationHistory']
    node = graph['nodes'][-1]
    assert node['op'] == 'construct-from-vertex-figure' and node['algorithmVersion'] == '0.1.0'
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': restored}})
    assert replayed['states'][0]['model'] == expected
    worker = subprocess.run(
        [sys.executable, '-B', '-u', 'engine/server.py'],
        input=json.dumps({'id': 'cold-replay', 'op': 'recipe-replay', 'params': {'document': restored}}) + '\n',
        text=True,
        capture_output=True,
        cwd=Path(__file__).resolve().parents[1],
        timeout=30,
        check=True,
    )
    response = json.loads(worker.stdout)
    assert not worker.stderr and response['ok'] and response['id'] == 'cold-replay'
    assert response['result']['states'][0]['model'] == expected
    branch = dispatch(
        {
            'op': 'recipe-branch',
            'params': {'document': restored, 'parameters': {'candidate': CANDIDATE, 'edge_length': 3}},
        }
    )
    built = branch['states'][branch['cursor']]['model']
    assert built['metadata']['vertexFigureConstruction']['outputEdgeLength'] == 3
    assert np.allclose(np.asarray(built['vertices']), np.asarray(expected['vertices']) * 1.2)


def test_replay_rejects_altered_chosen_candidate_or_output_incidence():
    doc = {'id': 'source', 'cursor': 0, 'states': [{'model': supplied_figure(), 'view': {}}]}
    built = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': doc,
                'operation': 'construct-from-vertex-figure',
                'parameters': {'candidate': CANDIDATE},
            },
        }
    )
    changed = deepcopy(built)
    changed['operationHistory']['nodes'][-1]['params']['candidate'] = 'regular:tesseract'
    with pytest.raises(GeometryError, match='no longer matches'):
        dispatch({'op': 'recipe-replay', 'params': {'document': changed}})
    changed = deepcopy(built)
    changed['states'][-1]['model']['cells'][0].pop()
    with pytest.raises(GeometryError):
        dispatch({'op': 'recipe-replay', 'params': {'document': changed}})


def test_figure_annotations_detach_without_assigning_them_to_unrelated_4d_faces():
    doc = {
        'id': 'source',
        'cursor': 0,
        'states': [{'model': supplied_figure(), 'view': {'coordinateUnit': 'mm'}, 'notes': 'Figure notes'}],
    }
    annotated = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': doc,
                'operation': 'element-content',
                'parameters': {'action': 'text', 'kind': 'face', 'index': 0, 'markup': 'Figure face'},
            },
        }
    )
    source = deepcopy(annotated['states'][-1])
    before = deepcopy(annotated)
    built = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': annotated,
                'operation': 'construct-from-vertex-figure',
                'parameters': {'candidate': CANDIDATE},
            },
        }
    )
    state = built['states'][-1]
    view = state['view']
    assert annotated == before and state['notes'] == 'Figure notes'
    assert view['elementAnnotations']['entries'] == []
    assert view['elementContentTransfer']['mapped'] == []
    assert view['elementContentTransfer']['unmapped'] == [{'kind': 'face', 'sourceIndex': 0}]
    archive = view['elementContentDetached'][0]
    assert archive['document'] == source['view']['elementAnnotations']
    assert archive['sourceNotes'] == 'Figure notes' and archive['sourceCoordinateUnit'] == 'mm'
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': built}})
    assert replayed['states'][0] == state
