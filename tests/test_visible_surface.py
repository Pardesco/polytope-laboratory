from collections import Counter
from copy import deepcopy
from itertools import combinations, product
import json
import xml.etree.ElementTree as ET
import numpy as np
import pytest
from engine.compounds import add_models
from engine.geometry import GeometryError, hull, identity
from engine.star_polyhedra import kepler_poinsot
from engine.visible_surface import visible_surface
from engine.generalized_nets import (
    unfold_source,
    reconstruct_source_net,
    edit_source_net,
    _shell_geometry,
    _triangles_cached,
)
from engine.nets import fold_net, net_svg
from engine.net_printing import pack_net
from engine.formats import validate_project
from engine.history import canonical_model
from engine.server import dispatch

SVG = '{http://www.w3.org/2000/svg}'


def tetrahedra(count):
    if count == 2:
        p = np.asarray(list(product((-1, 1), repeat=3)), dtype=float)
        parts = [p[np.prod(p, axis=1) == sign] for sign in (1, -1)]
    else:
        phi = (1 + np.sqrt(5)) / 2
        p = np.asarray(
            list(product((-1, 1), repeat=3))
            + [(0, a / phi, b * phi) for a, b in product((-1, 1), repeat=2)]
            + [(b * phi, 0, a / phi) for a, b in product((-1, 1), repeat=2)]
            + [(a / phi, b * phi, 0) for a, b in product((-1, 1), repeat=2)]
        )
        tetra = []
        for ids in combinations(range(20), 4):
            lengths = [np.linalg.norm(p[a] - p[b]) for a, b in combinations(ids, 2)]
            if max(lengths) - min(lengths) < 1e-9:
                tetra.append(ids)

        def cover(used, chosen):
            if len(used) == 20:
                return chosen
            first = min(set(range(20)) - used)
            for ids in tetra:
                if first in ids and not used.intersection(ids):
                    result = cover(used.union(ids), chosen + [ids])
                    if result:
                        return result

        parts = [p[list(ids)] for ids in cover(set(), [])]
    models = []
    for i, points in enumerate(parts):
        model = hull(points, 'Independent tetrahedron ' + str(i))
        model['metadata']['offColors'] = {
            'faces': [{'encoding': 'unit', 'values': [i / count, 0.2, 1 - i / count, 0.7]} for _ in model['faces']]
        }
        models.append(model)
    model = models[0]
    for other in models[1:]:
        model = add_models(model, other)
    return model, models


@pytest.mark.parametrize(
    'key,vertices,edges,faces,pieces',
    [
        ('small-stellated-dodecahedron', 32, 90, 60, 12),
        ('great-stellated-dodecahedron', 32, 90, 60, 20),
        ('great-dodecahedron', 32, 90, 60, 60),
        ('great-icosahedron', 92, 270, 180, 72),
    ],
)
def test_star_surface_closure_and_nonoverlapping_paper(key, vertices, edges, faces, pieces):
    source = kepler_poinsot(key)
    before = deepcopy(source)
    model = visible_surface(source)
    assert source == before
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces')] == [vertices, edges, faces]
    assert set(map(len, model['faces'])) == {3}
    report = model['metadata']['visibleSurface']
    assert report['closed'] and report['totalGenus'] == 0 and report['eulerCharacteristic'] == 2
    assert report['maxWindingResidual'] < 1e-7 and report['triangles'] == faces
    _shell_geometry(model)
    net = unfold_source(model)
    assert len(net['components']) == pieces
    assert not net['hasOverlap'] and not net['hasTabOverlap']
    assert fold_net(net, 0.43)['validation']['rigidityPreserved']
    assert fold_net(net, 1)['validation']['endpointReconstructed']
    assert net['visibleSurface']['paperPieces'] == pieces
    assert reconstruct_source_net(model, net)['tabOptions'] == net['tabOptions']


@pytest.mark.parametrize('count,expected,pieces', [(2, (14, 36, 24), 8), (5, (92, 150, 60), 20)])
def test_compound_union_independent_halfspaces_colors_tabs_labels_and_pages(count, expected, pieces):
    source, parts = tetrahedra(count)
    before = deepcopy(source)
    model = visible_surface(source)
    assert source == before
    assert tuple(len(model[k]) for k in ('vertices', 'edges', 'faces')) == expected
    report = model['metadata']['visibleSurface']
    assert report['totalGenus'] == 0 and report['closed'] and report['shells'] == 1
    assert report['triangles'] == (24 if count == 2 else 180)
    assert report['eulerCharacteristic'] == 2
    p = np.asarray(model['vertices'])
    triangles = []
    for face in model['faces']:
        cloud = p[face]
        _, _, axes = np.linalg.svd(cloud - cloud[0])
        q = (cloud - cloud[0]) @ axes[:2].T
        for triangle in _triangles_cached(tuple(map(tuple, q))):
            triangles.append(cloud[0] + triangle @ axes[:2])

    # Independently oriented convex halfspaces, with no winding/arrangement code.
    def union_inside(point):
        return any(
            np.max(np.asarray(part['facetEquations'])[:, :3] @ point + np.asarray(part['facetEquations'])[:, 3]) < 1e-9
            for part in parts
        )

    for triangle in triangles:
        normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
        normal /= np.linalg.norm(normal)
        center = triangle.mean(axis=0)
        assert union_inside(center + normal * 1e-5) != union_inside(center - normal * 1e-5)
    colors = model['metadata']['offColors']['faces']
    assert colors == [source['metadata']['offColors']['faces'][f] for f in report['sourceFaceIds']]
    assert Counter(report['sourceComponentIds']) == {i: 12 for i in range(count)}
    net = unfold_source(model)
    assert len(net['components']) == pieces
    assert not net['hasOverlap'] and not net['hasTabOverlap']
    assert len(net['tabRecords']) == len(model['edges']) - len(net['hinges'])
    svg = ET.fromstring(net_svg(net))
    labels = Counter(t.text for t in svg.iter(SVG + 'text') if (t.text or '').startswith('E'))
    assert labels == {f'E{i}': 2 for i in range(len(model['edges'])) if i not in net['hinges']}
    for group in svg.iter(SVG + 'g'):
        if 'data-net-face' in group.attrib:
            assert (
                int(group.attrib['data-visible-source-face'])
                == report['sourceFaceIds'][int(group.attrib['data-net-face'])]
            )
            assert group.find(SVG + 'polygon').attrib['fill-opacity'] == '0.7'
    packed = pack_net(net, color_mode='separate')
    assert sorted(i for page in packed['pages'] for i in page['sourceFaceIds']) == list(range(expected[2]))
    assert packed['validation']['scalePreserved']
    assert len(packed['colorPrinting']['groups']) == count
    assert all('mm' in ET.fromstring(page['svg']).attrib['width'] for page in packed['pages'])


def test_native_recipe_saved_net_and_pages_replay_and_edit():
    source = kepler_poinsot('small-stellated-dodecahedron')
    doc = {
        'id': 'visible-history',
        'cursor': 0,
        'states': [
            {'model': source, 'view': {'net': {'root': 10, 'length': 37, 'tabs': False}}, 'notes': 'paper notes'}
        ],
    }
    result = dispatch(
        {
            'op': 'recipe-run',
            'params': {'document': doc, 'operation': 'visible-surface', 'parameters': {'fill_rule': 'nonzero'}},
        }
    )
    state = result['states'][-1]
    assert state['notes'] == 'paper notes' and state['view']['derivedMode'] == 'net' and 'net' not in state['view']
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': result}})
    assert canonical_model(replay['states'][0]['model']) == canonical_model(state['model'])
    net = dispatch({'op': 'net', 'model': state['model'], 'params': {}})
    moved = dispatch(
        {
            'op': 'net-edit',
            'model': state['model'],
            'params': {
                'net': net,
                'action': 'move-component',
                'component': net['components'][0]['root'],
                'translation': [9, 5],
                'angle': 13,
            },
        }
    )
    assert moved['visibleSurface']['closed']
    state['netLayout'] = moved
    state['netPages'] = dispatch({'op': 'net-pack', 'model': state['model'], 'params': {'net': moved}})
    state['view']['net'] = {'root': 0, 'length': 25, 'tabs': True, 'tabOptions': moved['tabOptions']}
    state['netHistory'] = {
        'sourceFingerprint': state['model']['fingerprint'],
        'cursor': 1,
        'states': [
            {
                'root': n['root'],
                'edge_length_mm': 25,
                'tabs': True,
                'tab_options': n['tabOptions'],
                'hinges': n['hinges'],
                'placements': n['placements'],
            }
            for n in (net, moved)
        ],
    }
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]}
    saved = validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][-1]
    assert saved['netLayout']['tabOptions'] == moved['tabOptions']
    assert saved['netLayout']['faces'] == moved['faces']
    assert (
        saved['netHistory'] == state['netHistory'] and saved['netPages']['pageCount'] == state['netPages']['pageCount']
    )
    assert dispatch({'op': 'net-fold', 'model': state['model'], 'params': {'net': saved['netLayout'], 'fraction': 1}})[
        'validation'
    ]['endpointReconstructed']


def test_refusals_are_atomic_and_duplicate_disjoint_nested_shells():
    model = hull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])
    duplicate = add_models(model, deepcopy(model))
    surface = visible_surface(duplicate)
    assert len(surface['faces']) == 4 and surface['metadata']['visibleSurface']['shells'] == 1
    small = hull(np.asarray(model['vertices']) * 0.1 + 0.1)
    assert len(visible_surface(add_models(model, small))['faces']) == 4
    other = hull(np.asarray(model['vertices']) + 3)
    assert visible_surface(add_models(model, other))['metadata']['visibleSurface']['shells'] == 2
    for change in ('open', 'nonplanar', 'rule'):
        bad = deepcopy(model)
        if change == 'open':
            bad['faces'].pop()
            bad['interpretation'] = 'generalized-complex'
        if change == 'nonplanar':
            bad = hull(list(product((-1, 1), repeat=3)))
            bad['vertices'][0][0] += 0.1
            bad['interpretation'] = 'generalized-complex'
        before = deepcopy(bad)
        with pytest.raises(GeometryError, match='closed|planar|fill rule'):
            visible_surface(bad, fill_rule='bogus' if change == 'rule' else 'nonzero')
        assert bad == before
    assert visible_surface(model, 'even-odd')['metadata']['visibleSurface']['fillRule'] == 'even-odd'


@pytest.mark.parametrize('scale', [1e-7, 1, 1e7])
def test_similarity_and_inconsistent_source_orientation(scale):
    from scipy.spatial.transform import Rotation

    model = kepler_poinsot('small-stellated-dodecahedron')
    rotation = Rotation.from_rotvec([0.13, 0.7, -0.24]).as_matrix()
    model['vertices'] = ((np.asarray(model['vertices']) @ rotation.T + [3, -4, 8]) * scale).tolist()
    model['faces'] = [f[::-1] if i % 2 else f for i, f in enumerate(model['faces'])]
    model['fingerprint'] = identity(model)
    surface = visible_surface(model)
    assert len(surface['faces']) == 60
    net = unfold_source(surface)
    assert len(net['components']) == 12 and not net['hasOverlap'] and not net['hasTabOverlap']


def test_point_touching_components_refuse_unresolved_manifold():
    first = hull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])
    second = hull([[1, 0, 0], [2, 0, 0], [1, 1, 0], [1, 0, 1]])
    with pytest.raises(GeometryError, match='unresolved|pinched'):
        visible_surface(add_models(first, second))


def test_coplanar_concave_source_does_not_steal_another_components_color():
    ring = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]
    vertices = [[x, y, z] for z in (0, 1) for x, y in ring]
    faces = [list(range(6)), list(range(6, 12))] + [[i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6] for i in range(6)]
    first = {
        'id': 'literal-L',
        'name': 'L prism',
        'dimension': 3,
        'embeddingDimension': 3,
        'interpretation': 'generalized-complex',
        'vertices': vertices,
        'faces': faces,
        'edges': [list(e) for e in sorted({tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:] + f[:1])})],
        'cells': [],
        'metadata': {'offColors': {'faces': [{'encoding': 'byte', 'values': [255, 0, 0]} for _ in faces]}},
    }
    first['fingerprint'] = identity(first)
    other = hull(list(product((1.5, 2), (1.5, 2), (0, 1))))
    other['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [0, 0, 255]} for _ in other['faces']]}
    model = visible_surface(add_models(first, other))
    meta = model['metadata']['visibleSurface']
    assert meta['shells'] == 2 and meta['totalGenus'] == 0 and len(model['faces']) == 14
    assert Counter(meta['sourceComponentIds']) == {0: 8, 1: 6}
    for fi, f in enumerate(model['faces']):
        if np.min(np.asarray(model['vertices'])[f, :2]) > 1:
            assert model['metadata']['offColors']['faces'][fi]['values'] == [0, 0, 255]


def test_thin_source_refuses_sampling_that_could_jump_another_sheet():
    model = hull(list(product((0, 1), (0, 1), (0, 1e-6))))
    with pytest.raises(GeometryError, match='clearance|thin'):
        visible_surface(model)
