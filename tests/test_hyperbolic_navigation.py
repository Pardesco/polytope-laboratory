"""Navigation regressions from the independent 13 November review."""

import math
import numpy as np
import pytest
from engine.hyperbolic import J, PRESETS, boost, reflection_matrix, regular_cell_template, lorentz_inner
from engine.hyperbolic_document import handle
from engine import hyperbolic_manifold as manifold
from engine.hyperbolic_orbit import Development

SOURCES = [{'type': 'honeycomb', 'pqr': list(p)} for p in PRESETS] + [manifold.source_descriptor()]


@pytest.mark.parametrize('source', SOURCES)
def test_200_random_heading_rebases_without_gate_trips(source):
    model = handle('hyperbolic-create', {'source': source, 'depth': 0})
    anchor = model['anchor']
    rng = np.random.default_rng(1132026)
    maximum = 0.0
    for epoch in range(200):
        observer = np.eye(4)
        heading = rng.normal(size=3)
        for step in range(151):
            observer = observer @ boost(heading + rng.normal(size=3) * 0.2, 0.4 / 60)
        page = handle(
            'hyperbolic-patch',
            {
                'source': source,
                'anchor': anchor,
                'rebase': observer.ravel().tolist(),
                'epoch': epoch,
                'depth': 0,
            },
        )
        anchor = page['anchor']
        frame = np.asarray(anchor.get('localPose', anchor.get('localFrame'))).reshape(4, 4)
        maximum = max(maximum, float(np.max(np.abs(frame.T @ J @ frame - J))))
        assert maximum < 1e-12
        assert page['residuals']['transformMetricRelative'] <= 1e-12
        if source['type'] == 'honeycomb':
            word = sum(anchor.get('wordChunks', []), []) + anchor['word']
            assert not any(a == b for a, b in zip(word, word[1:]))
    print(source, '200-rebase maximum frame residual', maximum)


def star(template, vertex):
    """Independent local star: cross only faces incident to the fixed vertex."""
    normals = np.asarray(template['facePlanes'])
    generators = [reflection_matrix(n) for n in normals]
    matrices = [np.eye(4)]
    for matrix in matrices:
        local = J @ matrix.T @ J @ vertex
        for f in np.flatnonzero(np.abs(normals @ J @ local) < 1e-8):
            candidate = matrix @ generators[f]
            if not any(np.max(np.abs(candidate[:, 0] - old[:, 0])) < 1e-8 for old in matrices):
                matrices.append(candidate)
                assert len(matrices) <= 20
    return matrices


@pytest.mark.parametrize('source,expected', zip(SOURCES, (8, 20, 20, 12, 8)))
def test_observer_ball_contains_complete_vertex_stars_off_centre(source, expected):
    template = (
        manifold.fundamental_domain()['template']
        if source['type'] == 'manifold'
        else regular_cell_template(source['pqr'])
    )
    # Every anchor vertex at the default observer, plus two off-centre probes
    # along distinct vertex rays, including one unit beyond the vertex.
    vertices = np.asarray(template['vertices'])
    probes = [(np.eye(4), vertices)]
    for vertex in (vertices[0], vertices[-1]):
        distance = math.acosh(vertex[0])
        probes.extend((boost(vertex[1:], distance + offset), [vertex]) for offset in (-0.01, 1.0))
    for observer, selected in probes:
        d = Development(
            [5, 3, 4] if source['type'] == 'manifold' else source['pqr'], radius=2, observer=observer, template=template
        )
        while True:
            page = d.page({'candidatesPerPage': 50000})
            if not page['checkpoint']:
                break
        assert page['coverage']['complete'], page['coverage']
        assert len(d.words) < 4096
        for vertex in selected:
            assert math.acosh(max(1, -float(lorentz_inner(observer[:, 0], vertex)))) < 2
            incident = star(template, vertex)
            assert len(incident) == expected
            for matrix in incident:
                assert any(np.max(np.abs(matrix[:, 0] - cell[:, 0])) < 1e-8 for cell in d.matrices)
        print(source, 'observer', observer[:, 0], 'complete cells', len(d.words))


def test_manifold_pages_resume_after_cold_cache_and_keep_shared_neighbor_shape():
    from engine import hyperbolic_protocol as protocol
    from engine.geometry import GeometryError

    params = {'source': SOURCES[-1], 'radius': 2, 'budget': {'pageSize': 7, 'candidatesPerPage': 48}}
    ids = []
    page = handle('hyperbolic-patch', params)
    with pytest.raises(GeometryError, match='Create starts a new generation'):
        handle('hyperbolic-create', {**params, 'cursor': page['nextCursor']})
    while True:
        ids.extend(i['id'] for i in page['instances'])
        for row in page['neighbors']:
            assert 'templatePermutation' not in row
            if row['toCell'] is not None:
                assert sorted(row['vertexPermutation']) == list(range(20))
        if not page['nextCursor']:
            break
        protocol.clear_cache()
        page = handle('hyperbolic-patch', {**params, 'cursor': page['nextCursor']})
    assert len(ids) == len(set(ids)) > 16
    assert page['coverage']['complete']


def test_cold_cursor_verification_has_a_separate_page_time_budget(monkeypatch):
    from engine import hyperbolic_protocol as protocol
    import time

    params = {'source': SOURCES[3], 'mode': 'complete-depth', 'budget': {'pageSize': 8, 'candidatesPerPage': 48}}
    first = protocol.handle('hyperbolic-patch', params)
    protocol.clear_cache()
    real_clock, original_restore = time.monotonic, Development.restore
    offset = [0]

    def replay(*args, **kwargs):
        result = original_restore(*args, **kwargs)
        offset[0] += 3
        return result

    monkeypatch.setattr(Development, 'restore', replay)
    monkeypatch.setattr(time, 'monotonic', lambda: real_clock() + offset[0])
    second = protocol.handle('hyperbolic-patch', {**params, 'cursor': first['nextCursor']})
    assert second['coverage']['visitedCandidates'] > first['coverage']['visitedCandidates']
    assert second['coverage']['stopReason'] != 'timeLimit'


def test_linear_discrepancies_coordinate_cap_and_near_centres_are_not_squared():
    from engine.hyperbolic import point_discrepancy, matrix_discrepancy, point_metric_residual
    from engine.geometry import GeometryError

    a = boost([1, 0, 0], 7)
    b = a.copy()
    b[0, 0] += 1e-6
    assert point_discrepancy(a[:, 0], b[:, 0])['relative'] > 1e-10
    assert matrix_discrepancy(a, b)['relative'] > 1e-10
    with pytest.raises(GeometryError, match='scale exceeds'):
        point_metric_residual([1e4 + 1, 1e4, 0, 0])
    with pytest.raises(GeometryError, match='Near-coincident'):
        Development([5, 3, 4])._match(boost([1, 0, 0], 0.05))
