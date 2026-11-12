from collections import Counter
from copy import deepcopy
from unittest.mock import patch
import math
import numpy as np
import pytest
from engine import server
from engine.generators import regular
from engine.catalog import load_catalog_model
from engine.geometry import GeometryError, identity, validate
from engine.incidence_truncation import incidence_truncate
from engine.operations import vertex_figure, truncate
from engine.cell_nets import cell_net, edit_cell_net
from engine.formats import save_project, load_file, validate_project
from engine.recipes import run_recipe, replay_document
from engine.regular4d_validation import CATALOG_IDENTITIES

KINDS = ('vertices', 'edges', 'faces', 'cells')
SISHI = 'miratope-stellated-hecatonicosachoron'
GASHI = 'miratope-grand-stellated-hecatonicosachoron'


def source(key):
    return load_catalog_model(key) if key.startswith('miratope-') else regular(key)


def counts(m):
    return tuple(len(m[k]) for k in KINDS)


def winding(points):
    p = np.asarray(points)
    p -= p.mean(axis=0)
    _, _, axes = np.linalg.svd(p, full_matrices=False)
    q = p @ axes[:2].T
    return abs(
        round(
            sum(math.atan2(a[0] * b[1] - a[1] * b[0], float(a @ b)) for a, b in zip(q, np.roll(q, -1, axis=0)))
            / (2 * math.pi)
        )
    )


def cell_signature(m, cell):
    faces = [m['faces'][fi] for fi in cell]
    vertices = {v for f in faces for v in f}
    edges = {tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:] + f[:1])}
    return (
        len(vertices),
        len(edges),
        tuple(sorted(Counter((len(f), winding([m['vertices'][v] for v in f])) for f in faces).items())),
    )


# Fixed independent published expectations: Bowers rectates.htm, Klitzing
# index-dimensional.htm, and H. S. Teo's qfbox rect8cell/trunc5cell/rect120cell.
@pytest.mark.parametrize(
    'key,t,expected,cell_types',
    [
        ('tesseract', 0.5, (32, 96, 88, 24), {(12, 24, (((3, 1), 8), ((4, 1), 6))): 8, (4, 6, (((3, 1), 4),)): 16}),
        ('simplex4', 1 / 3, (20, 40, 30, 10), {(12, 18, (((3, 1), 4), ((6, 1), 4))): 5, (4, 6, (((3, 1), 4),)): 5}),
        (
            'cell120',
            0.5,
            (1200, 3600, 3120, 720),
            {(30, 60, (((3, 1), 20), ((5, 1), 12))): 120, (4, 6, (((3, 1), 4),)): 600},
        ),
        (
            SISHI,
            0.5,
            (1200, 3600, 2160, 240),
            {(30, 60, (((5, 1), 12), ((5, 2), 12))): 120, (20, 30, (((5, 1), 12),)): 120},
        ),
    ],
)
def test_published_counts_cell_types_and_no_hull(key, t, expected, cell_types):
    m = source(key)
    before = deepcopy(m)
    with patch('engine.geometry.hull', side_effect=AssertionError('No hull')):
        cut = server.dispatch({'op': 'incidence-truncate', 'model': m, 'params': {'amount': t}})
    assert counts(cut) == expected
    assert Counter(cell_signature(cut, c) for c in cut['cells']) == Counter(cell_types)
    info = cut['metadata']['incidenceTruncation']
    assert info['closedIncidence'] and info['hullUsed'] is False
    assert info['maximumNormalizedPlanarityResidual'] < 1e-8 and m == before
    assert cut['validation']['passed'] and cut['interpretation'] == 'generalized-complex' and 'measure' not in cut


@pytest.mark.parametrize('key', ['simplex4', 'tesseract'])
def test_convex_coordinate_and_complete_cell_incidence_agree_with_independent_hull(key):
    m = source(key)
    a = incidence_truncate(m, amount=0.31)
    b = truncate(m, amount=0.31)
    from scipy.spatial import cKDTree

    distances, permutation = cKDTree(b['vertices']).query(a['vertices'])
    assert max(distances) < 1e-8
    assert len(set(permutation)) == len(a['vertices'])
    ac = {frozenset(permutation[v] for fi in c for v in a['faces'][fi]) for c in a['cells']}
    bc = {frozenset(v for fi in c for v in b['faces'][fi]) for c in b['cells']}
    assert ac == bc


@pytest.mark.parametrize('key', [k for k in CATALOG_IDENTITIES if k.startswith('miratope-')])
def test_ten_regular_stars_truncate_rectify_and_keep_literal_source_faces(key):
    m = source(key)
    for t in (0.29, 0.5):
        cut = incidence_truncate(m, amount=t)
        assert len(cut['vertices']) == len(m['edges']) * (1 if t == 0.5 else 2)
        assert len(cut['cells']) == len(m['cells']) + len(m['vertices'])
        info = cut['metadata']['incidenceTruncation']
        assert info['sourceModel'] == m
        for fi, f in enumerate(m['faces']):
            owners = [info['vertexSources'][v]['edge'] for v in cut['faces'][fi]]
            assert len(owners) == len(f) * (1 if t == 0.5 else 2)
        assert cut['validation']['passed']


@pytest.mark.parametrize(
    'key,expected',
    [
        ('cube', (3, 3, 1, 0)),
        ('tesseract', (4, 6, 4, 0)),
        ('great-dodecahedron', (5, 5, 1, 0)),
        (GASHI, (12, 30, 12, 0)),
    ],
)
def test_combinatorial_vertex_figures_preserve_star_links(key, expected):
    m = source(key)
    for placement in ('midpoint', 'unit-distance'):
        with patch('engine.geometry.hull', side_effect=AssertionError('No hull')):
            result = server.dispatch(
                {'op': 'vertex-figure', 'model': m, 'params': {'mode': 'combinatorial', 'placement': placement}}
            )
        v = result['model']
        assert counts(v) == expected and validate(v)['passed']
        info = v['metadata']['combinatorialVertexFigure']
        assert len(info['vertexSources']) == expected[0]
        assert len(info['edgeSources']) == expected[1] and info['maximumEmbeddingResidual'] < 1e-8
        if key == 'great-dodecahedron':
            assert winding([v['vertices'][i] for i in v['faces'][0]]) == 2
        if key == GASHI:
            assert all(winding([v['vertices'][i] for i in f]) == 1 for f in v['faces'])
            polygon = vertex_figure(v, mode='combinatorial')['model']
            assert winding([polygon['vertices'][i] for i in polygon['faces'][0]]) == 2
    if key.startswith('miratope') or key == 'great-dodecahedron':
        with pytest.raises(GeometryError, match='convex'):
            vertex_figure(m)


def assert_intact(m, net):
    assert len(net['cells']) == len(m['cells']) and len(net['connections']) == len(m['cells']) - len(net['components'])
    pairs = Counter()
    for c in net['cells']:
        ids = c['sourceVertices']
        a = np.asarray(m['vertices'])[ids]
        b = np.asarray(c['points'])
        assert np.allclose(
            np.linalg.norm(a[:, None] - a[None, :], axis=2), np.linalg.norm(b[:, None] - b[None, :], axis=2), atol=1e-8
        )
        for f in c['faces']:
            pairs[f['id']] += 1
            assert [ids[v] for v in f['vertices']] == m['faces'][f['id']]
        if c['parent'] is not None:
            parent = net['cells'][c['parent']]
            face = m['faces'][c['parentFace']]
            assert np.allclose(
                [c['points'][ids.index(v)] for v in face],
                [parent['points'][parent['sourceVertices'].index(v)] for v in face],
                atol=1e-8,
            )
    assert pairs == Counter({i: 2 for i in range(len(m['faces']))})
    assert not net['validation']['cellIntersectionsChecked']


@pytest.mark.parametrize('key', [SISHI, GASHI, 'miratope-great-hecatonicosachoron'])
def test_star_nets_matching_face_pairs_rigidity_edits_and_reconstruction(key, tmp_path):
    m = source(key)
    before = deepcopy(m)
    net = server.dispatch({'op': 'cell-net', 'model': m})
    assert_intact(m, net)
    cut = edit_cell_net(m, net, 'toggle-face', face=net['connections'][0])
    assert len(cut['components']) == 2
    moved = edit_cell_net(
        m, cut, 'move-component', component=cut['components'][1]['root'], translation=[3, -4, 2], angles=[19, 31, -47]
    )
    assert_intact(m, moved)
    joined = edit_cell_net(m, moved, 'toggle-face', face=net['connections'][0])
    assert_intact(m, joined)
    leaf = next(
        c
        for c in joined['cells']
        if c['parent'] is not None and not any(x['parent'] == c['id'] for x in joined['cells'])
    )
    face = next(f['id'] for f in leaf['faces'] if not f['connected'])
    assert_intact(m, edit_cell_net(m, joined, 'reattach-cell', face=face, moving_cell=leaf['id']))
    history = {
        'sourceFingerprint': m['fingerprint'],
        'sourceId': m['id'],
        'cursor': 1,
        'states': [{k: n[k] for k in ('root', 'connections', 'placements')} for n in (net, moved)],
    }
    cached = deepcopy(moved)
    cached['cells'][0]['points'][0] = [999, 999, 999]
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [
            {
                'id': 'star-net',
                'cursor': 0,
                'states': [
                    {
                        'model': m,
                        'view': {
                            'derivedMode': 'cell-net',
                            'cellNet': {'root': 0, 'shrink': 0.6},
                            'vertexFigureMode': 'combinatorial',
                            'vertexFigurePlacement': 'unit-distance',
                        },
                        'cellNetLayout': cached,
                        'cellNetHistory': history,
                        'notes': 'Star source notes',
                    }
                ],
            }
        ],
    }
    path = tmp_path / 'star.polyproj'
    save_project(path, project)
    restored = load_file(path)['project']['documents'][0]['states'][0]
    assert restored['cellNetLayout']['cells'] == moved['cells'] and restored['cellNetHistory'] == history
    assert restored['notes'] == 'Star source notes' and restored['view']['vertexFigureMode'] == 'combinatorial'
    assert m == before


def test_cut_recipe_history_save_open_replay_units_colors_notes(tmp_path):
    m = source(SISHI)
    rgba = {'encoding': 'byte', 'values': [20, 40, 80, 127]}
    m['metadata'].update(coordinateUnits='mm', offColors={'cells': [deepcopy(rgba) for _ in m['cells']]})
    doc = {'id': 'star-cuts', 'cursor': 0, 'states': [{'model': m, 'view': {}, 'notes': 'Literal star notes'}]}
    built = run_recipe(doc, 'incidence-truncate', {'preset': 'rectify'}, server.dispatch)
    assert built['cursor'] == 1 and built['states'][1]['notes'] == 'Literal star notes'
    output = built['states'][1]['model']
    assert output['metadata']['coordinateUnits'] == 'mm'
    assert output['metadata']['offColors']['cells'][:120] == [rgba] * 120
    path = tmp_path / 'cut.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [built]})
    reopened = load_file(path)['project']['documents'][0]
    replayed = replay_document(reopened, server.dispatch)
    assert identity(replayed['states'][0]['model']) == identity(output)
    assert reopened['states'][0]['model'] == m


def test_explicit_invalid_domains_and_nonplanar_metric_links():
    m = regular('tesseract')
    assert identity(incidence_truncate(m, amount=0)) == identity(m)
    for params in (
        {'amount': -0.0001},
        {'amount': 0.51},
        {'amount': True},
        {'amount': float('nan')},
        {'preset': 'normal'},
    ):
        with pytest.raises(GeometryError):
            incidence_truncate(m, **params)
    for vertex in (True, -1, len(m['vertices'])):
        with pytest.raises(GeometryError):
            vertex_figure(m, vertex=vertex, mode='combinatorial')
    # An irregular simplicial 16-cell retains planar tetrahedral cells but its
    # degree-six vertex caps need not lie in a hyperplane.
    m = regular('cross4')
    m['interpretation'] = 'generalized-complex'
    m.pop('fingerprint')
    m['vertices'][0][1] += 0.19
    with pytest.raises(GeometryError, match='nonplanar'):
        incidence_truncate(m, amount=0.3)
    with pytest.raises(GeometryError, match='placement'):
        vertex_figure(m, vertex=2, mode='combinatorial')
    with pytest.raises(GeometryError):
        validate_project(
            {
                'format': 'polytope-laboratory',
                'version': 1,
                'active': 0,
                'documents': [
                    {'cursor': 0, 'states': [{'model': regular('cube'), 'view': {'vertexFigureMode': 'bogus'}}]}
                ],
            }
        )


def test_unit_distance_figure_uses_its_own_scale_and_reversible_source_chart():
    m = regular('tesseract')
    m['interpretation'] = 'generalized-complex'
    m['vertices'] = (np.asarray(m['vertices']) * 1e9 + np.array([2e9, -3e9, 4e9, 5e9])).tolist()
    m['fingerprint'] = identity(m)
    packet = vertex_figure(m, mode='combinatorial', placement='unit-distance')
    v = packet['model']
    local = np.asarray(v['vertices'])
    restored = local @ np.asarray(packet['basis']).T + packet['origin']
    owner = np.asarray(m['vertices'][0])
    assert np.allclose(np.linalg.norm(restored - owner, axis=1), 1, atol=1e-6)
    assert max(np.linalg.norm(local[:, None] - local[None, :], axis=2).ravel()) == pytest.approx(math.sqrt(2))
