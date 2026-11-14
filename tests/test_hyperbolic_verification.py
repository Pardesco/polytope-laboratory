"""Development-only independent verifier regressions, including negative receipts."""

import ast
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('independent_hyperbolic', ROOT / 'scripts/verify-hyperbolic.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


@pytest.mark.parametrize('key', verifier.EXPECTED)
def test_tits_ring_counts(key):
    assert verifier.tits_rings(list(map(int, key)))['rings'] == verifier.EXPECTED[key]


def test_bucket_boundary_deduplication_compares_full_coordinates():
    index = verifier.PointIndex()
    assert index.add(np.array([1e-4, 1.5e-4, 0.0, 2e-4]))
    assert not index.add(np.array([1e-4 - 1e-10, 1.5e-4 + 1e-10, -1e-10, 2e-4]))
    assert index.add(np.array([1e-4 - 1e-5, 1.5e-4, 0.0, 2e-4]))


def test_independent_coset_integer_homology():
    result = verifier.coset_homology(ROOT / 'engine/hyperbolic_data/small-cover-v1.json')
    assert result['counts'] == [20, 60, 48, 8]
    assert result['boundarySquaredResiduals'] == [0, 0]
    assert result['H1'] == {'freeRank': 0, 'torsion': [2] * 9}
    assert result['orientable'] and result['chi'] == 0


def test_verifier_has_no_engine_imports():
    tree = ast.parse((ROOT / 'scripts/verify-hyperbolic.py').read_text(encoding='utf-8-sig'))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            assert all(not name.name.startswith('engine') for name in node.names)
        if isinstance(node, ast.ImportFrom):
            assert not (node.module or '').startswith('engine')


@pytest.fixture(scope='module')
def receipts():
    subprocess.run(
        [sys.executable, 'scripts/capture-hyperbolic-receipts.py'], cwd=ROOT, check=True, capture_output=True
    )
    return json.loads((ROOT / 'artifacts/verify-hyperbolic/engine-receipts.json').read_text())


def test_independent_offcentre_vertex_stars(receipts):
    result = verifier.check_vertex_stars(receipts)
    assert len(result) == 10
    assert all(row['missingStarCells'] == 0 and row['verticesTested'] > 0 for row in result)


def test_false_complete_receipt_with_missing_star_cells_is_refused(receipts):
    broken = json.loads(json.dumps(receipts))
    broken['receipts'][0]['pages'] = [broken['receipts'][0]['pages'][0]]
    broken['receipts'][0]['pages'][0]['instances'] = broken['receipts'][0]['pages'][0]['instances'][:1]
    broken['receipts'][0]['pages'][0]['coverage']['complete'] = True
    with pytest.raises(AssertionError, match='missing vertex-star cell'):
        verifier.check_vertex_stars(broken)
