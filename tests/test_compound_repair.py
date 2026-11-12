"""Source bytes, independent constituent incidence and two-record corrections."""

import hashlib
from pathlib import Path

import pytest

from engine.catalog import get_catalog
from engine.catalog_audit import audit_model
from engine.compound_repair import (
    DATA,
    SOURCE_PINS,
    compound_repair_catalog,
    literal,
    load_compound_repair,
    reconstruct,
    repair_off,
)
from engine.formats import parse_off, save_project, load_file
from engine.generators import regular
from engine.geometry import GeometryError, validate


@pytest.mark.parametrize(
    'kind,bad,counts,chi', [('haddet', [22, 23], [8, 24, 32, 16], 0), ('dathah', [6, 7], [8, 24, 32, 12], 4)]
)
def test_reconstruction_and_only_two_records_change(kind, bad, counts, chi):
    file, pin = SOURCE_PINS[kind]
    raw = (DATA / file).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == pin
    before = literal(raw)
    output, evidence = repair_off(raw, kind)
    after = literal(output)
    assert (
        before['vertices'] == after['vertices']
        and before['faces'] == after['faces']
        and before['edges'] == after['edges']
    )
    assert [i for i, (a, b) in enumerate(zip(before['cells'], after['cells'])) if a != b] == bad
    assert sum(a != b for a, b in zip(raw.splitlines(keepends=True), output.splitlines(keepends=True))) == 2
    assert len(raw.splitlines()) == len(output.splitlines())
    assert evidence['componentCount'] == 2 and evidence['symmetryOrder'] == 384
    assert all(c['counts'] == counts and c['eulerCharacteristic'] == chi for c in evidence['components'])
    assert evidence['maxRelativeCellFlatnessResidual'] < 1e-9 and evidence['certified'] is False
    assert evidence['changedCellIds'] == bad
    assert validate(after)['passed']
    assert audit_model(before)['checks']['cell_flatness']['maxRelativeResidual'] == pytest.approx(0.5)
    assert audit_model(after)['checks']['cell_flatness']['status'] == 'pass'
    assert (DATA / file).read_bytes() == raw
    external = Path('data/drive-uniforms/Compounds/2demitessic') / file
    if external.exists():
        assert external.read_bytes() == raw


@pytest.mark.parametrize('kind', SOURCE_PINS)
def test_grouped_cells_have_the_declared_generalized_topology(kind):
    raw = (DATA / SOURCE_PINS[kind][0]).read_bytes()
    result, evidence = reconstruct(literal(raw), kind)
    groups = []
    for c in result['cells']:
        vs = {v for f in c for v in result['faces'][f]}
        es = {
            tuple(sorted((a, b)))
            for f in c
            for a, b in zip(result['faces'][f], result['faces'][f][1:] + result['faces'][f][:1])
        }
        if len(vs) == 8:
            assert len(c) == 8 and len(es) == 12 and len(vs) - len(es) + len(c) == 4
            groups.append(c)
        else:
            assert len(vs) - len(es) + len(c) == 2
    assert len(groups) == 8
    assert evidence['groupedEulerCharacteristic'] == (8 if kind == 'haddet' else 16)
    # Splitting the eight pairs gives the actual constituent cell counts.
    assert len(result['cells']) + 8 == sum(c['counts'][3] for c in evidence['components'])
    for component in evidence['components']:
        source_vertices = component['sourceVertexIds']
        source_faces = sorted({f for c in component['sourceCellFaceIds'] for f in c})
        vs = {v: i for i, v in enumerate(source_vertices)}
        fs = {f: i for i, f in enumerate(source_faces)}
        faces = [[vs[v] for v in result['faces'][f]] for f in source_faces]
        edges = sorted({tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:] + f[:1])})
        model = {
            'dimension': 4,
            'vertices': [result['vertices'][v] for v in source_vertices],
            'edges': list(map(list, edges)),
            'faces': faces,
            'cells': [[fs[f] for f in c] for c in component['sourceCellFaceIds']],
            'interpretation': 'convex-polytope' if kind == 'haddet' else 'generalized-complex',
        }
        report = audit_model(model)
        assert report['checks']['incidence']['status'] == 'pass'
        assert report['checks']['orientation']['orientable'] == (kind == 'haddet')
        assert sorted(map(len, model['cells'])) == ([4] * 16 if kind == 'haddet' else [4] * 8 + [8] * 4)


@pytest.mark.parametrize('kind', SOURCE_PINS)
def test_catalog_pins_native_validation_and_project_round_trip(kind, tmp_path):
    key = 'compound-repaired-' + kind
    entry = next(e for e in compound_repair_catalog() if e['key'] == key)
    assert key in {r['key'] for r in get_catalog()}
    raw = (DATA / entry['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == entry['sha256']
    assert raw == repair_off((DATA / entry['originalFile']).read_bytes(), kind)[0]
    model = regular(key)
    from engine.server import dispatch

    generated = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': key}})
    assert generated['fingerprint'] == model['fingerprint']
    assert model['interpretation'] == 'generalized-complex' and model['validation']['passed']
    assert model['metadata']['provenance'].startswith('corrected from ' + SOURCE_PINS[kind][0] + ': cells ')
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == entry['counts']
    imported = parse_off(raw.decode(), model['name'])
    assert (
        imported['vertices'] == model['vertices']
        and imported['faces'] == model['faces']
        and imported['cells'] == model['cells']
    )
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'documents': [{'id': 'review', 'name': model['name'], 'cursor': 0, 'states': [{'model': model}]}],
        'active': 0,
    }
    path = tmp_path / 'review.polyproj'
    save_project(path, project)
    restored = load_file(path)['project']
    assert restored['documents'][0]['states'][0]['model']['cells'] == model['cells']


@pytest.mark.parametrize('mutation', ['duplicate', 'nan', 'degenerate', 'face', 'cell'])
def test_refuses_changed_or_degenerate_geometry_without_qhull(monkeypatch, mutation):
    import scipy.spatial
    import engine.geometry as geometry

    def forbidden(*a, **kw):
        raise AssertionError('No Qhull call is permitted')

    monkeypatch.setattr(scipy.spatial, 'ConvexHull', forbidden)
    monkeypatch.setattr(geometry, 'ConvexHull', forbidden)
    model = literal((DATA / SOURCE_PINS['haddet'][0]).read_bytes())
    if mutation == 'duplicate':
        model['vertices'][1] = model['vertices'][0][:]
    if mutation == 'nan':
        model['vertices'][0][0] = float('nan')
    if mutation == 'degenerate':
        model['vertices'] = [[0.0, 0.0, 0.0, 0.0] for _ in range(16)]
    if mutation == 'face':
        model['faces'][0] = model['faces'][1][:]
    if mutation == 'cell':
        model['cells'][0] = model['cells'][1][:]
    with pytest.raises(GeometryError, match='Compound reconstruction'):
        reconstruct(model, 'haddet')


def test_reconstruction_loader_never_calls_native_hulls(monkeypatch):
    import scipy.spatial
    import engine.geometry as geometry

    def forbidden(*a, **kw):
        raise AssertionError('No Qhull call is permitted')

    monkeypatch.setattr(scipy.spatial, 'ConvexHull', forbidden)
    monkeypatch.setattr(geometry, 'ConvexHull', forbidden)
    for kind in SOURCE_PINS:
        assert load_compound_repair('compound-repaired-' + kind)['validation']['passed']


def test_changed_source_and_derived_pins_are_refused(tmp_path, monkeypatch):
    import engine.compound_repair as repair

    raw = (DATA / SOURCE_PINS['haddet'][0]).read_bytes()
    with pytest.raises(GeometryError, match='source hash'):
        repair_off(raw + b'\n', 'haddet')
    with pytest.raises(GeometryError, match='source hash'):
        repair_off(raw, 'unknown')
    for path in DATA.iterdir():
        (tmp_path / path.name).write_bytes(path.read_bytes())
    entry = compound_repair_catalog()[0]
    (tmp_path / entry['file']).write_bytes(b'changed')
    monkeypatch.setattr(repair, 'DATA', tmp_path)
    with pytest.raises(GeometryError, match='derived asset hash'):
        load_compound_repair(entry['key'])


def test_load_returns_detached_records_and_unknown_key_is_not_claimed():
    model = load_compound_repair('compound-repaired-haddet')
    model['cells'][0] = []
    assert load_compound_repair('compound-repaired-haddet')['cells'][0]
    assert load_compound_repair('compound-repaired-unknown') is None
