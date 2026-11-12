"""Fixed combinatorics, independent metrics, symmetry, persistence and replay."""

from collections import Counter
from copy import deepcopy
import hashlib
import math

import numpy as np
import pytest

from engine.catalog import get_catalog, load_catalog_model
from engine.formats import load_file, save_project
from engine.geometry import GeometryError, canonical_cycle, hull, identity
from engine.near_miss_catalog import FAMILY, deviation_metrics, near_miss_catalog
from engine.near_miss_construction import construct, fit_catalog_source, vertex_configurations
from engine.recipes import run_recipe, replay_document
from engine.server import dispatch
from engine.symmetry import geometric_symmetry

EXPECTED = [
    ('chamfered-cube', [32, 48, 18, 0], {4: 6, 6: 12}, 48, 2.39893, 10.52878),
    ('chamfered-dodecahedron', [80, 120, 42, 0], {5: 12, 6: 30}, 120, 0.79971, 3.43495),
    ('rectified-truncated-icosahedron', [90, 180, 92, 0], {3: 60, 5: 12, 6: 20}, 120, 1.45500, 3.15294),
    ('truncated-truncated-icosahedron', [180, 270, 92, 0], {3: 60, 10: 12, 12: 20}, 120, 2.12998, 2.06297),
    ('expanded-truncated-icosahedron', [180, 360, 182, 0], {3: 60, 4: 90, 5: 12, 6: 20}, 120, 1.98618, 1.54908),
    ('truncated-triakis-tetrahedron', [28, 42, 16, 0], {5: 12, 6: 4}, 24, 3.08504, 5.17996),
    ('associahedron-k5', [14, 21, 9, 0], {4: 3, 5: 6}, 12, 7.92311, 8.71489),
    ('wedge-4-5', [9, 17, 10, 0], {3: 7, 4: 2, 5: 1}, 2, 2.49980, 2.64222),
    ('wedge-4-5-top-augmented', [10, 21, 13, 0], {3: 11, 4: 1, 5: 1}, 2, 2.42666, 2.59991),
    ('wedge-4-5-side-augmented', [10, 21, 13, 0], {3: 11, 4: 1, 5: 1}, 2, 2.46695, 2.64016),
]


@pytest.mark.parametrize('slug,counts,types,order,edge,angle', EXPECTED)
def test_normal_catalog_generation_counts_independent_metrics_and_full_symmetry(
    slug, counts, types, order, edge, angle
):
    key = 'near-miss-' + slug
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': key}})
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == counts
    assert Counter(map(len, model['faces'])) == types
    assert model == dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': key}})
    source = construct(slug)
    assert source['edges'] == model['edges'] and source['faces'] == model['faces']
    assert model['interpretation'] == 'convex-polytope' and model['validation']['passed']
    assert not model['numeric']['certified'] and identity(model) == model['fingerprint']
    assert Counter(canonical_cycle(f) for f in hull(model['vertices'])['faces']) == Counter(
        canonical_cycle(f) for f in model['faces']
    )
    e = model['metadata']['nearMissRealization']
    m = e['metrics']
    p = np.asarray(model['vertices'])
    edges = np.asarray(model['edges'])
    lengths = np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)
    assert 100 * np.max(np.abs(lengths / lengths.mean() - 1)) == pytest.approx(
        m['maximumEdgeDeviationPercent'], abs=1e-10
    )
    angles = []
    for f in model['faces']:
        q = p[f]
        a = np.roll(q, 1, axis=0) - q
        b = np.roll(q, -1, axis=0) - q
        angles.extend(
            np.abs(
                np.arccos(
                    np.clip(np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1)), -1, 1)
                )
                - (len(f) - 2) * math.pi / len(f)
            )
        )
        assert np.linalg.svd(q - q.mean(axis=0), compute_uv=False)[-1] / lengths.mean() < 1e-7
    assert math.degrees(max(angles)) == pytest.approx(m['maximumFaceAngleDeviationDegrees'], abs=1e-9)
    assert m['maximumEdgeDeviationPercent'] == pytest.approx(edge, abs=0.0002)
    assert m['maximumFaceAngleDeviationDegrees'] == pytest.approx(angle, abs=0.0002)
    assert m['maximumPlanarity'] < 1e-8 and not e['regularityEstablished'] and not e['certified']
    symmetry = geometric_symmetry(model, max_frames=10000)
    assert symmetry['complete'] and symmetry['closureVerified'] and symmetry['order'] == order
    assert symmetry['properOrder'] * 2 == order
    assert model['metadata']['vertexConfigurations'] == vertex_configurations(model)


def test_catalog_registration_aliases_and_copy_isolation():
    records = [r for r in get_catalog() if r.get('family') == FAMILY]
    assert len(records) == 10 and len({r['key'] for r in records}) == 10
    assert all(r['nearMiss'] and r['approximate'] and not r['regular'] and 'near miss' in r['aliases'] for r in records)
    records[0]['nearMissRealization']['metrics']['maximumEdgeDeviationPercent'] = -1
    assert near_miss_catalog()[0]['nearMissRealization']['metrics']['maximumEdgeDeviationPercent'] > 0
    assert load_catalog_model('near-miss-unknown') is None
    with pytest.raises(GeometryError, match='Unknown'):
        construct('unsupported')


@pytest.mark.parametrize('slug', ['wedge-4-5', 'wedge-4-5-top-augmented', 'wedge-4-5-side-augmented'])
def test_published_wedge_reference_aggregate_deviations_cross_checked(slug):
    model = load_catalog_model('near-miss-' + slug)
    source = construct(slug)
    p = model['metadata']['nearMissRealization']['publishedComparison']
    q = np.asarray(source['vertices'])
    e = np.asarray(source['edges'])
    independent_edge = float(np.sum(np.abs(np.linalg.norm(q[e[:, 0]] - q[e[:, 1]], axis=1) - 1)))
    assert p['passed'] and p['referenceMeasured']['aggregateEdgeErrorUnitEdge'] == pytest.approx(
        independent_edge, abs=1e-10
    )
    assert (
        abs(independent_edge - p['published']['aggregateEdgeErrorUnitEdge'])
        <= p['absoluteTolerance']['aggregateEdgeErrorUnitEdge']
    )
    assert abs(deviation_metrics(source)['aggregateAngleDeviationDegrees'] - 34) <= 0.5
    assert abs(deviation_metrics(model)['aggregateAngleDeviationDegrees'] - 34) > 0.5


def test_vertex_configurations_keep_cyclic_order_and_published_counts():
    model = load_catalog_model('near-miss-rectified-truncated-icosahedron')
    assert model['metadata']['vertexConfigurations'] == {'3.5.3.6': 60, '3.6.3.6': 30}
    model = load_catalog_model('near-miss-expanded-truncated-icosahedron')
    assert model['metadata']['vertexConfigurations'] == {'3.4.5.4': 60, '3.4.6.4': 120}


@pytest.mark.parametrize('slug', ['chamfered-cube', 'expanded-truncated-icosahedron', 'wedge-4-5'])
def test_offline_fit_regeneration_is_deterministic_and_preserves_incidence(slug):
    source = construct(slug)
    before = deepcopy(source)
    rebuilt, evidence = fit_catalog_source(source)
    stored = load_catalog_model('near-miss-' + slug)
    assert source == before and rebuilt['edges'] == source['edges'] and rebuilt['faces'] == source['faces']
    assert evidence['success'] and not evidence['globalMinimumEstablished']
    assert np.max(np.abs(np.asarray(rebuilt['vertices']) - stored['vertices'])) < 1e-7


def test_generation_history_save_open_and_replay_keep_catalog_evidence(tmp_path):
    source = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': 'near-miss-chamfered-dodecahedron'}})
    doc = {'id': 'near-miss-doc', 'cursor': 0, 'states': [{'model': source, 'view': {}, 'notes': 'Keep notes'}]}
    before = deepcopy(doc)
    built = run_recipe(doc, 'truncate', {'amount': 0.15}, dispatch)
    assert doc == before and built['cursor'] == 1 and identity(built['states'][0]['model']) == identity(source)
    path = tmp_path / 'near-miss.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [built]})
    opened = load_file(path)['project']['documents'][0]
    replayed = replay_document(opened, dispatch)['states'][0]['model']
    assert identity(replayed) == identity(opened['states'][1]['model'])
    assert opened['states'][0]['model']['metadata'] == source['metadata']
    assert opened['states'][1]['notes'] == 'Keep notes'


def test_asset_hash_and_incidence_mismatch_refuse(monkeypatch, tmp_path):
    import engine.near_miss_catalog as catalog

    entry = deepcopy(catalog._manifest()['entries'][0])
    raw = (catalog.DATA / entry['file']).read_bytes()
    monkeypatch.setattr(catalog, 'DATA', tmp_path)
    monkeypatch.setattr(catalog, '_manifest', lambda: {'entries': [entry]})
    (tmp_path / entry['file']).write_bytes(raw + b' ')
    with pytest.raises(GeometryError, match='hash mismatch'):
        catalog.load_near_miss_model(entry['record']['key'])
    entry['sha256'] = hashlib.sha256(raw + b' ').hexdigest()
    entry['record']['counts'][0] += 1
    with pytest.raises(GeometryError, match='incidence differs'):
        catalog.load_near_miss_model(entry['record']['key'])
