"""Lesson content is grounded in existing native generators, sections and nets."""

from pathlib import Path
import json
import copy
import numpy as np
import pytest
from engine.server import dispatch

LESSONS = json.loads((Path(__file__).resolve().parents[1] / 'ui/learn-4d-lessons.json').read_text(encoding='utf-8'))
COUNTS = {
    'square': (4, 4, 1, 0),
    'cube': (8, 12, 6, 0),
    'tesseract': (16, 32, 24, 8),
    'simplex4': (5, 10, 10, 5),
    'cross4': (8, 24, 32, 16),
    'cell24': (24, 96, 96, 24),
    'cell120': (600, 1200, 720, 120),
    'cell600': (120, 720, 1200, 600),
}


def generate(key):
    return dispatch(
        {
            'op': 'generate',
            'params': {'kind': 'polygon', 'n': 4} if key == 'square' else {'kind': 'regular', 'key': key},
        }
    )


@pytest.mark.parametrize('key', COUNTS)
def test_lesson_sources_use_supported_dispatch_and_true_counts(key):
    model = generate(key)
    assert tuple(len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')) == COUNTS[key]


@pytest.mark.parametrize('action', [s['action'] for c in LESSONS for s in c['steps'] if s['action']['kind'] == 'slice'])
def test_sweeps_are_empty_outside_support_and_have_nonempty_3d_centers(action):
    model = generate(action['key'])
    before = copy.deepcopy(model)
    normal = np.asarray(action['normal'])
    assert np.linalg.norm(normal) == pytest.approx(1)
    levels = np.asarray(model['vertices']) @ normal
    span = float(np.ptp(levels))
    results = [
        dispatch({'op': 'section', 'model': model, 'params': {'normal': normal.tolist(), 'offset': offset}})
        for offset in (float(min(levels) - span * 0.08), 0.0, float(max(levels) + span * 0.08))
    ]
    assert results[0]['status'] == results[2]['status'] == 'empty'
    assert results[1]['model']['dimension'] == 3
    assert results[1]['model']['vertices']
    assert model == before


def test_default_tesseract_cell_tree_is_the_dali_cross_and_reports_numerical_residuals():
    model = generate('tesseract')
    before = copy.deepcopy(model)
    net = dispatch({'op': 'cell-net', 'model': model, 'params': {'root': 0}})
    assert len(net['cells']) == 8
    assert len(net['connections']) == 7
    assert len(net['components']) == 1
    root = next(c for c in net['cells'] if c['id'] == net['root'])
    children = [c for c in net['cells'] if c['parent'] == root['id']]
    assert len(children) == 6
    tail = [c for c in net['cells'] if c['parent'] is not None and c['parent'] != root['id']]
    assert len(tail) == 1
    center = lambda c: np.mean(c['points'], axis=0)
    vectors = np.array([center(c) - center(root) for c in children])
    assert np.linalg.norm(vectors, axis=1) == pytest.approx([2.0] * 6)
    assert np.sort(np.linalg.norm(vectors[:, None] + vectors[None, :], axis=2), axis=1)[:, 0] == pytest.approx(
        [0.0] * 6, abs=1e-10
    )
    assert center(tail[0]) - center(root) == pytest.approx(
        2 * (center(next(c for c in children if c['id'] == tail[0]['parent'])) - center(root))
    )
    for key in ('maxRigidDistanceError', 'maxConnectedFaceGap', 'commonHyperplaneResidual'):
        assert net['validation'][key] <= net['validation']['tolerance']
    assert net['validation']['cellIntersectionsChecked'] is False
    assert model == before
