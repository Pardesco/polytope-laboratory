"""Pinned attributed bytes and independent regular metric conformance fixtures."""
from copy import deepcopy
import hashlib
import importlib.util
from itertools import combinations
import json
import math
from pathlib import Path

import numpy as np
import pytest

from engine.formats import parse_off
from engine.geometry import GeometryError
from engine.symmetry import geometric_symmetry

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'engine/catalog_data/miratope'
spec = importlib.util.spec_from_file_location('miratope_catalog_builder', ROOT / 'scripts/build-miratope-regular-catalog.py')
builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
MANIFEST = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
ENTRIES = {entry['name']: entry for entry in MANIFEST['entries']}
PINNED = {
    'Grand hecatonicosachoron': ('ab7102e397cf1cb3ed35cadd65057927e3f34fded4f238570d63ae300b5dae53', [120,720,720,120]),
    'Grand hexacosichoron': ('fa547263c65bae8191e12e9a01233755a383d8002501a3256baa398ff9a722c1', [120,720,1200,600]),
    'Grand stellated hecatonicosachoron': ('1b62dfd1f8eda3baa5c4859b46f8bf07a2de8dc96c0c5a40f34872f950257b89', [120,720,720,120]),
    'Great grand hecatonicosachoron': ('226c29f8557ca3e33793ebeb267e98d7f85ef6d44e008ee4be7a3614409ed9f5', [120,1200,720,120]),
    'Great grand stellated hecatonicosachoron': ('58dbcf134cb0bab2ec10d29928ec413a99bf0d8eb91f8270599aa33f7276479e', [600,1200,720,120]),
    'Great hecatonicosachoron': ('5c0dfc1465e1a567d9ded05902f7fce5baaa0f317759a5ad32bc0349d645fa30', [120,720,720,120]),
    'Great icosahedral hecatonicosachoron': ('1b7507c9de3c96572d2a53098fc16fcdae64f701a0c2b26fc3b1da552c33d88f', [120,720,1200,120]),
    'Great stellated hecatonicosachoron': ('43adc49db881b85c31cddf602e0dca968b72e5c6fdcbcce4105dc5ba65ea0443', [120,720,720,120]),
    'Hecatonicosachoron': ('d9786b0c6300fbed8465abd91691ea293669a1b67628a0d3dd1302925dd5e98e', [600,1200,720,120]),
    'Hexacosichoron': ('12d1b503532a7c9217e06df3b9003a505fde56241d64a30f3c81494d1bb75129', [120,720,1200,600]),
    'Hexadecachoron': ('27bbc12047c6dce4c292569381c0941b26f8bf6388a95b73809984b68c6ec814', [8,24,32,16]),
    'Icosahedral hecatonicosachoron': ('99f9d4b69a1c43affcc31c2b3c41d025e070a69da7926fb33505c6d779350d15', [120,720,1200,120]),
    'Icositetrachoron': ('3b711fb1b4d3c9f6dd20ee370bccdf9ca1796c916518827fc5e255f5773451b8', [24,96,96,24]),
    'Pentachoron': ('428b1ecd31b111f29554ac99d25563a1752bcbd93369ce7363f8df7aa51ab206', [5,10,10,5]),
    'Stellated hecatonicosachoron': ('6fb449ccb8b55e0f6ea7aad04a8a32d5d9f14ed30816d8b31d012b84e97e0093', [120,1200,720,120]),
    'Tesseract': ('1193662f0f4e5f934abe0eb2850b57a7d3dfd724e474962e6613336850707048', [16,32,24,8]),
}


@pytest.fixture(scope='module')
def models():
    return {name: parse_off((DATA / entry['file']).read_text(encoding='utf-8'), name) for name, entry in ENTRIES.items()}


def test_pinned_revision_license_and_registration_partition():
    assert MANIFEST['source']['gitHead'] == 'f8ecb0da7bac755586d114a6609d1b6968cff82c'
    assert MANIFEST['source']['workingTreeChanges'] == []
    license_bytes = (DATA / 'LICENSE').read_bytes()
    assert hashlib.sha256(license_bytes).hexdigest() == MANIFEST['license']['rawSha256'] == '136b8993848f2fb87fd3d021c387a6b2ed510e28e3404eeca526cf5b2b13572d'
    assert b'Copyright (c) 2021 Miratope authors' in license_bytes
    assert set(ENTRIES) == set(PINNED); assert len(MANIFEST['registrationKeys']) == 10
    assert len(MANIFEST['alternateSources']) == 6
    assert {entry['alternateBuiltinKey'] for entry in ENTRIES.values() if entry['alternateBuiltinKey']} == {'simplex4','tesseract','cross4','cell24','cell120','cell600'}
    for entry in ENTRIES.values():
        assert entry['key'] == 'miratope-' + builder.slug(entry['name'])
        assert (entry['key'] in MANIFEST['registrationKeys']) == (entry['registration'] == 'regular-star')
        assert 'symbol' not in entry and 'schlafliSymbol' not in entry
    assert MANIFEST['guarantees']['exactClassificationCertified'] is False
    assert MANIFEST['guarantees']['generalizedSolidInteriorsAsserted'] is False


@pytest.mark.parametrize('name', sorted(PINNED))
def test_every_raw_source_passes_strict_import_with_pinned_incidence_and_metric_checks(name, models):
    entry = ENTRIES[name]; raw = (DATA / entry['file']).read_bytes(); model = models[name]
    assert hashlib.sha256(raw).hexdigest() == entry['rawSha256'] == PINNED[name][0]
    assert len(raw) == entry['rawByteLength']
    assert [len(model[field]) for field in ('vertices','edges','faces','cells')] == entry['counts'] == PINNED[name][1]
    assert model['fingerprint'] == entry['sourceFingerprint']
    assert model['validation']['passed'] and entry['strictImportPassed']
    assert model['interpretation'] == entry['interpretation']
    before = deepcopy(model); checks = builder.numeric_checks(model)
    assert checks == entry['numericChecks']; assert checks['necessaryRegularityChecksPassed']
    assert checks['edges']['relativeSpread'] < 1e-10; assert checks['vertexRadius']['relativeSpread'] < 1e-10
    assert checks['faces']['allRegularAngularSteps']; assert checks['affineRank'] == 4
    assert checks['incidence']['closedSourceRidges']; assert checks['incidence']['twoFaceCellEdgeLinks']
    assert model == before
    # Read-only checkout comparison strengthens provenance where the source exists.
    source = Path(MANIFEST['source']['absolutePath']) / entry['sourcePath']
    if source.exists(): assert source.read_bytes() == raw


def test_pentagram_fixture_has_analytic_angular_step_and_retains_source_winding():
    points = np.array([[math.cos(2*math.pi*i/5),math.sin(2*math.pi*i/5),0,0] for i in range(5)])
    cycle = [0,2,4,1,3]; before = points.copy()
    result = builder.regular_face(points, cycle)
    assert result['passed']; assert result['canonicalAngularStep'] == 2
    assert result['angularStepRadians'] == pytest.approx(4*math.pi/5)
    assert result['circumradius'] == pytest.approx(1)
    expected_edge = math.sqrt((5+math.sqrt(5))/2)
    assert [np.linalg.norm(points[b]-points[a]) for a,b in zip(cycle,cycle[1:]+cycle[:1])] == pytest.approx([expected_edge]*5)
    reversed_result = builder.regular_face(points,list(reversed(cycle)))
    assert reversed_result['passed']; assert reversed_result['canonicalAngularStep'] == 2
    assert points == pytest.approx(before); assert cycle == [0,2,4,1,3]
    assert not builder.regular_face(points,[0,2,1,4,3])['passed']


def regular_simplex():
    vertices = [[1,1,1,-1/math.sqrt(5)],[1,-1,-1,-1/math.sqrt(5)],[-1,1,-1,-1/math.sqrt(5)],[-1,-1,1,-1/math.sqrt(5)],[0,0,0,4/math.sqrt(5)]]
    faces = [list(ids) for ids in combinations(range(5),3)]
    return {'dimension':4,'vertices':vertices,'edges':[list(ids) for ids in combinations(range(5),2)],'faces':faces,
            'cells':[[i for i,face in enumerate(faces) if omitted not in face] for omitted in range(5)]}


def test_literal_simplex_metric_checks_reject_regular_looking_perturbation_and_preserve_source():
    model = regular_simplex(); before = deepcopy(model); checks = builder.numeric_checks(model)
    assert checks['necessaryRegularityChecksPassed']; assert checks['edges']['min'] == pytest.approx(math.sqrt(8))
    assert checks['vertexRadius']['min'] == pytest.approx(math.sqrt(16/5))
    assert checks['faces']['canonicalAngularStepHistogram'] == {'3/1':10}
    assert model == before
    damaged = deepcopy(model); damaged['vertices'][0][0] += .01
    assert not builder.numeric_checks(damaged)['necessaryRegularityChecksPassed']


def test_metric_checks_covary_with_rigid_rotation_translation_and_uniform_scale():
    model = regular_simplex(); point = np.array(model['vertices']); matrix = np.eye(4)
    c,s = math.cos(.37),math.sin(.37); matrix[0,0] = matrix[3,3] = c; matrix[0,3] = -s; matrix[3,0] = s
    model['vertices'] = ((point@matrix.T+[2,-3,5,7])*1e-9).tolist()
    checks = builder.numeric_checks(model)
    assert checks['necessaryRegularityChecksPassed']; assert checks['edges']['min'] == pytest.approx(math.sqrt(8)*1e-9)


def test_selected_group_evidence_is_numerical_complete_and_source_incidence_preserving(models):
    expected = {'Pentachoron':120,'Tesseract':384,'Hexadecachoron':384,'Icositetrachoron':1152,'Grand hecatonicosachoron':14400}
    for name,order in expected.items():
        evidence = ENTRIES[name]['symmetryEvidence']
        assert evidence['order'] == order; assert evidence['properOrder'] == order//2
        assert evidence['complete']; assert evidence['termination'] == 'exhausted'; assert evidence['closureVerified']
        assert evidence['numericMode'] == 'float64-approximate'
        assert evidence['sourceFingerprint'] == models[name]['fingerprint']
        for field in ('vertex','edge','face','cell'):
            assert len(evidence['entityOrbits'][field]) == 1
    # The independent simplex group must consist of all 5! vertex permutations.
    result = geometric_symmetry(models['Pentachoron'])
    assert result['order'] == math.factorial(5); assert result['complete']
    assert len({tuple(action['permutation']) for action in result['actions']}) == math.factorial(5)


def test_acquisition_never_writes_inside_the_source_checkout(tmp_path):
    with pytest.raises(GeometryError, match='read-only'): builder.acquire(tmp_path,tmp_path/'generated')
    with pytest.raises(GeometryError, match='16-file'): builder.acquire(tmp_path,tmp_path.parent/'missing-source-output')
