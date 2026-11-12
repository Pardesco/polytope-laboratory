"""Repeated section jobs retain isolated dispatch semantics and literal sources."""

from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import UUID
from engine.generators import regular
from engine.server import dispatch


def test_repeated_sections_generalized_cell_domains_and_refusals_are_request_local():
    cube = regular('cube')
    tess = regular('tesseract')
    cube['metadata']['coordinateUnits'] = 'cm'
    cube['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [255, i * 20, 0, 128]} for i in range(6)]}
    generalized = deepcopy(cube)
    generalized['interpretation'] = 'generalized-complex'
    sources = [cube, tess, generalized]
    originals = deepcopy(sources)
    requests = [
        {'op': 'section', 'model': cube, 'params': {'normal': [0, 0, 1], 'offset': 0}},
        {'op': 'section', 'model': tess, 'params': {'normal': [0.2, 0.3, 0.4, 1], 'offset': 0.1}},
        {'op': 'section', 'model': generalized, 'params': {'normal': [0, 0, 1], 'offset': 0, 'fill_rule': 'even-odd'}},
        {
            'op': 'section',
            'model': tess,
            'params': {'normal': [0, 0, 0, 1], 'offset': 0, 'section_domain': 'ordinary-cells'},
        },
        {'op': 'section', 'model': tess, 'params': {'normal': [0, 0, 0, 1], 'offset': 100}},
        {
            'op': 'section',
            'model': tess,
            'params': {'normal': [1, 1, 1, 1], 'offset': max(sum(v) / 2 for v in tess['vertices'])},
        },
        {'op': 'section', 'model': tess, 'params': {'normal': [0, 0, 0, 0], 'offset': 0}},
        {'op': 'section', 'model': tess, 'params': {'normal': [0, 0, 0, 1], 'offset': 0}},
    ]
    requests = [dict(deepcopy(r), id=str(i)) for i, r in enumerate(requests * 2)]
    expected = []
    for request in requests:
        try:
            expected.append({'id': request['id'], 'ok': True, 'result': dispatch(deepcopy(request))})
        except Exception as error:
            expected.append({'id': request['id'], 'ok': False, 'error': str(error), 'type': type(error).__name__})
    assert all(item['ok'] for i, item in enumerate(expected) if i % 8 != 6)
    assert not expected[6]['ok']
    root = Path(__file__).resolve().parents[1]
    completed = subprocess.run(
        [sys.executable, '-u', str(root / 'engine/server.py')],
        input=''.join(json.dumps(r) + '\n' for r in requests),
        capture_output=True,
        text=True,
        encoding='utf-8',
        cwd=root,
        timeout=60,
        env={
            **os.environ,
            'PYTHONUTF8': '1',
            'PYTHONIOENCODING': 'utf-8',
            'OPENBLAS_NUM_THREADS': '1',
            'OMP_NUM_THREADS': '1',
        },
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
    )
    assert completed.returncode == 0, completed.stderr
    actual = [json.loads(line) for line in completed.stdout.splitlines()]

    # Hull-derived models intentionally receive a fresh UUID on each call.
    # Compare every other field, including source IDs, topology, validation,
    # colors, units and request correlation IDs without discarding provenance.
    def comparable(records):
        records = deepcopy(records)
        for record in records:
            model = record.get('result', {}).get('model') if record.get('ok') else None
            if model is not None:
                try:
                    uuid = UUID(model['id'])
                except ValueError:
                    continue  # Generalized packets have stable, source-bound IDs.
                assert uuid.version == 4
                assert model['id'] not in {source['id'] for source in sources}
                model['id'] = '<fresh-derived-model>'
        return records

    assert comparable(actual) == comparable(expected)
    assert sources == originals
