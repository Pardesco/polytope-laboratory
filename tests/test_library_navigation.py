from collections import Counter
import json
from pathlib import Path
import numpy as np
import pytest
from engine.catalog import get_catalog
from engine.generators import regular, generate
from engine.geometry import GeometryError, canonical_cycle, hull, identity
from engine.library_navigation import cell_inventory, crosswalk
from engine.uniform4 import manifest
from engine.server import dispatch

ENTRIES = manifest()['entries']


def test_convex_manifest_coverage_is_47_nonprismatic_and_18_prisms_with_one_overlap():
    nonprismatic = [r for r in ENTRIES if 'baseKey' not in r]
    prisms = [r for r in ENTRIES if 'baseKey' in r]
    assert len(nonprismatic) == 47 and len(prisms) == 18
    assert {r['uniformIndex'] for r in ENTRIES} == set(range(1, 65))
    assert Counter(r['uniformIndex'] for r in ENTRIES)[10] == 2
    assert len({r['key'] for r in ENTRIES}) == 65
    assert all(r['bowers'] in r['aliases'] and r['coxeterDiagram'] and r['cellTypes'] for r in ENTRIES)
    assert manifest()['countSource'] == 'https://en.wikipedia.org/wiki/Uniform_4-polytope'


@pytest.mark.parametrize('entry', ENTRIES, ids=lambda e: e['key'])
def test_every_native_convex_uniform_matches_published_counts_cell_types_and_regular_faces(entry):
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': entry['key']}})
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == entry['counts']
    assert cell_inventory(model) == entry['cellTypes']
    assert model['validation']['passed'] and not model['numeric']['certified']
    p = np.asarray(model['vertices'])
    edges = np.asarray(model['edges'])
    lengths = np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)
    assert np.ptp(lengths) / np.mean(lengths) < 1e-7
    for face in model['faces']:
        cloud = p[face]
        radii = np.linalg.norm(cloud - cloud.mean(axis=0), axis=1)
        assert np.ptp(radii) / np.mean(radii) < 1e-7
    assert Counter(i for cell in model['cells'] for i in cell) == {i: 2 for i in range(len(model['faces']))}
    assert identity(model) == model['fingerprint']


def test_native_orbit_boundary_agrees_with_independent_qhull_and_preserves_export_roundtrip():
    from engine.formats import parse_off, export_off

    for key in ('uniform4-srip', 'uniform4-gippic', 'uniform4-gap', 'uniform4-sadi', 'uniform4-prism-snub-cube'):
        model = regular(key)
        reference = hull(model['vertices'])
        assert Counter(canonical_cycle(f) for f in model['faces']) == Counter(
            canonical_cycle(f) for f in reference['faces']
        )
        restored = parse_off(export_off(model), model['name'])
        assert restored['fingerprint'] == model['fingerprint']


def test_uniform_75_crosswalk_is_complete_and_searchable_metadata_is_not_geometry_reclassification():
    records = {r['key']: r for r in get_catalog()}
    assert set(crosswalk()) == set(range(1, 76))
    for u, row in crosswalk().items():
        entry = records[f'antiprism-u{u}']
        assert {f'U{u}', f'C{row["c"]}', f'W{row["w"]}'} <= set(entry['aliases'])
        assert entry['wythoffSymbol'] and entry['uniform'] and entry['vertexTransitive']
        assert entry['convex'] == (u in (1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 22, 23, 24, 25, 26, 27, 28, 29))
    assert records['antiprism-u75']['wenningerNumber'] == 119
    assert records['antiprism-u12-mirror']['wenningerNumber'] == 17
    assert records['tesseract']['dualKey'] == 'cross4'
    assert records['cross4']['vertexFigureKey'] == 'octahedron'
    assert records['cube']['dualKey'] == 'octahedron'
    assert records['snub-cube']['dualKey'] == 'pentagonal-icositetrahedron'
    for entry in ENTRIES:
        row = records[entry['key']]
        assert row['bowers'] and row['uniform'] and row['convex']
        for cell in row['cellTypes']:
            assert cell['key'] in records
    assert records['uniform-prism-5']['uniform']


@pytest.mark.parametrize(
    'family,n,m,counts',
    [
        ('duoprism', 3, 5, [15, 30, 23, 8]),
        ('duoprism', 4, 4, [16, 32, 24, 8]),
        ('antiprism-prism', 5, 5, [20, 50, 44, 14]),
        ('prism', 7, 5, [14, 21, 9, 0]),
        ('antiprism', 7, 5, [14, 28, 16, 0]),
    ],
)
def test_uniform_parameterized_families_equalize_edges_and_roundtrip_generator(family, n, m, counts):
    model = dispatch({'op': 'generate', 'params': {'kind': 'uniform-family', 'family': family, 'n': n, 'm': m}})
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == counts
    p = np.asarray(model['vertices'])
    e = np.asarray(model['edges'])
    length = np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1)
    assert np.ptp(length) / np.mean(length) < 1e-9
    assert model['validation']['passed'] and model['metadata']['uniform']
    assert model['fingerprint'] == generate('uniform-family', **model['provenance']['parameters'])['fingerprint']


@pytest.mark.parametrize('params', [{'n': True}, {'n': 2}, {'m': 3.2}, {'n': 200, 'm': 200}, {'family': 'star'}])
def test_uniform_family_refuses_unsupported_domains(params):
    with pytest.raises(GeometryError):
        generate('uniform-family', **params)


def test_project_roundtrip_preserves_new_catalog_snapshot_and_family_provenance(tmp_path):
    from engine.formats import save_project, load_file

    model = regular('uniform4-rap')
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [
            {
                'id': 'native-uniform',
                'name': model['name'],
                'cursor': 0,
                'states': [
                    {'model': model, 'view': {'angles': [0] * 6}, 'notes': 'native uniform', 'label': 'Generate'}
                ],
            }
        ],
    }
    path = tmp_path / 'uniform.polytope'
    save_project(str(path), project)
    loaded = load_file(str(path))['project']['documents'][0]['states'][0]['model']
    assert loaded['fingerprint'] == model['fingerprint']
    assert loaded['metadata']['key'] == 'uniform4-rap'
