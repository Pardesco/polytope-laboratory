from copy import deepcopy
from collections import Counter
import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.server import dispatch
from engine.symmetry_orientation import symmetry_orientation
from engine.element_visibility import validate_element_visibility
from engine.formats import validate_project
from engine.operations import dual


@pytest.mark.parametrize('key,counts', [('cube', {2: 6, 3: 4, 4: 3}), ('icosahedron', {2: 15, 3: 10, 5: 6})])
def test_maximal_axis_counts(key, counts):
    source = regular(key)
    before = deepcopy(source)
    report = dispatch({'op': 'symmetry-orientation', 'model': source})
    assert Counter(c['order'] for c in report['choices']) == counts
    assert report['maximumAxisResidual'] < 1e-8
    assert report['maximumNormalizedVertexResidual'] < 1e-8
    assert report['complete'] and report['numericMode'] == 'float64-approximate'
    assert source == before


@pytest.mark.parametrize('key,order', [('tesseract', 48), ('cell24', 48)])
def test_greatest_canonical_direction(key, order):
    source = regular(key)
    report = symmetry_orientation(source, 'greatest')
    assert report['selected']['entity']['kind'] == 'cell'
    assert report['selected']['order'] == order == max(c['order'] for c in report['choices'])
    frame = report['frame']
    matrix = np.asarray(frame['matrix'])
    assert matrix @ np.asarray(report['selected']['direction']) == pytest.approx([0, 0, 0, 1])
    assert matrix @ matrix.T == pytest.approx(np.eye(4))
    assert frame['sourceFingerprint'] == identity(source)
    assert 'maximum among' in report['definition']


def test_direction_choice_and_cache_ownership():
    source = regular('cube')
    report = symmetry_orientation(source)
    chosen = report['choices'][-1]['id']
    report['choices'].clear()
    assert symmetry_orientation(source, chosen)['selected']['id'] == chosen
    with pytest.raises(GeometryError, match='listed'):
        symmetry_orientation(source, 'missing')
    with pytest.raises(GeometryError, match='3D/4D'):
        symmetry_orientation({'dimension': 2, 'vertices': []})


def test_visibility_project_round_trip_and_validation():
    source = regular('cube')
    mask = {
        'version': 1,
        'sourceFingerprint': identity(source),
        'hidden': {'faces': [0, 2], 'edges': [1], 'vertices': [3], 'cells': []},
    }
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [
            {'id': 'visibility', 'cursor': 0, 'states': [{'model': source, 'view': {'elementVisibility': mask}}]}
        ],
    }
    result = validate_project(deepcopy(project))
    state = result['documents'][0]['states'][0]
    assert state['view']['elementVisibility'] == mask
    assert identity(state['model']) == identity(source)
    for ids in ([0, 0], [-1], [1000], [True]):
        broken = deepcopy(mask)
        broken['hidden']['faces'] = ids
        with pytest.raises(GeometryError):
            validate_element_visibility(source, broken)
    # Inherited masks remain inert historical view data after other constructions.
    changed = regular('tetrahedron')
    validate_element_visibility(changed, mask)


@pytest.mark.parametrize('key', ['cube', 'octahedron', 'tesseract'])
def test_dual_links_are_bijective_polar_incidence(key):
    source = regular(key)
    target = dual(source)
    links = target['metadata']['viewLinks']
    assert links['sourceFingerprint'] == identity(source)
    fields = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}
    for target_kind, rows in links['entities'].items():
        assert len(rows) == len(target[fields[target_kind]])
        assert all(row is not None for row in rows)
        assert len({row['id'] for row in rows}) == len(rows)
    if source['dimension'] == 3:
        for i, row in enumerate(links['entities']['vertex']):
            q = np.asarray(target['vertices'][i])
            p = np.asarray(source['vertices'])
            assert (p[source['faces'][row['id']]] @ q) == pytest.approx(np.ones(len(source['faces'][row['id']])))
