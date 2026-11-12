from copy import deepcopy
import pytest
from engine.server import dispatch
from engine.generators import regular
from engine.history import create_history, record_source, record_operation, replay_history


@pytest.mark.parametrize(
    'key,fraction,fragment',
    [
        ('cube', 0.25, 'Truncation of Cube (edge fraction 0.25)'),
        ('tesseract', 0.25, 'Truncation of Tesseract (edge fraction 0.25)'),
        ('cube', 0.5, 'Rectification of Cube'),
        ('tesseract', 0.5, 'Rectification of Tesseract'),
        ('cube', 0.75, 'Quasitruncation of Cube (edge fraction 0.75)'),
    ],
)
def test_incidence_names_survive_native_history_replay(key, fraction, fragment):
    source = regular(key)
    before = deepcopy(source)
    params = {'preset': 'manual', 'amount': fraction}
    model = dispatch({'op': 'incidence-truncate', 'model': source, 'params': params})
    assert model['name'] == fragment
    graph = record_source(create_history(), 'source', {'model': source, 'view': {}, 'notes': ''})
    graph = record_operation(
        graph, 'cut', 'source', 'incidence-truncate', params, {'model': model, 'view': {}, 'notes': ''}
    )
    replay = replay_history(graph, dispatch)
    assert replay['cut']['model']['name'] == fragment
    assert source == before
    assert not model['numeric']['certified']


@pytest.mark.parametrize(
    'kind,params,name',
    [
        (
            'block',
            {'dimensions': [3, 2, 1], 'subdivisions': [3, 2, 1]},
            'Subdivided block 3 × 2 × 1 (3 × 2 × 1 subdivisions)',
        ),
        ('triangular-grid', {'subdivisions': 4}, 'Triangular grid (4 subdivisions)'),
        (
            'triangular-grid',
            {'subdivisions': 2, 'shape': 'hexagon', 'fold_angle': -45},
            'Hexagonal grid (2 subdivisions, fold -45°)',
        ),
        (
            'torus',
            {'ring_segments': 7, 'arm_segments': 5, 'twist': -1},
            'Twisted triangular torus 7 × 5 (twist -1 arm steps)',
        ),
        (
            'waterman-lattice',
            {'lattice': 'SC', 'radius_squared': '3/4', 'center': ['1/2'] * 3},
            'SC Waterman ball (r²=3/4; origin 1/2, 1/2, 1/2)',
        ),
        ('waterman-lattice', {'lattice': 'BCC', 'radius_squared': 3}, 'BCC Waterman ball (r²=3; origin 0, 0, 0)'),
    ],
)
def test_generator_option_names_survive_save_open(kind, params, name, tmp_path):
    model = dispatch({'op': 'generate', 'params': {'kind': kind, **params}})
    assert model['name'] == name
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': model, 'view': {}, 'notes': ''}]}],
    }
    path = tmp_path / 'names.polyproj'
    dispatch({'op': 'save', 'params': {'path': str(path), 'project': project}})
    restored = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]['states'][0]['model']
    assert restored['name'] == name
    assert restored['vertices'] == model['vertices']


@pytest.mark.parametrize('uc,angle', [(1, -30), (20, 6), (24, 17)])
def test_existing_uniform_compound_names_keep_index_and_angle(uc, angle):
    model = dispatch({'op': 'generate', 'params': {'kind': 'uniform-compound', 'uc': uc, 'angleDegrees': angle}})
    assert model['name'].startswith(f'UC{uc}: ')
    assert model['name'].endswith(f'(θ={angle}°)')
    assert model['metadata']['uniformCompound']['parameters']['angleDegrees'] == angle
