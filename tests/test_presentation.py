"""Presentation plans reuse the real native tour and dual verification contracts."""
import copy
import json
from pathlib import Path
import subprocess
import pytest
from engine.generators import regular
from engine.operations import dual
from engine.tours import validate_tour
from engine.server import dispatch

ROOT = Path(__file__).resolve().parents[1]


def playlist(states, source='tour'):
    tour = {'version': 1, 'cursor': 0, 'events': [dict(id=str(i), state=state,
            duration=2, transition='instant') for i, state in enumerate(states)]}
    data = dict(source=source, state=states[0], tour=tour)
    script = """import {buildPresentationPlaylist} from './ui/presentation.mjs';
let text='';for await(const chunk of process.stdin)text+=chunk;
const input=JSON.parse(text),before=JSON.stringify(input);
const output=await buildPresentationPlaylist(input);
console.log(JSON.stringify({tour:output.tour,unchanged:before===JSON.stringify(input)}));"""
    result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(data),
                            text=True, capture_output=True, cwd=ROOT, timeout=30)
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert output['unchanged'] is True
    return output['tour']


def snapshot(key):
    model = regular(key)
    return dict(model=model, notes='Retained source notes', view=dict(
        angles=[0]*6, sectionOffset=0, viewportLayout='single',
        rotationPlane=2 if model['dimension'] == 4 else 1, rotationSpeed=4))


@pytest.mark.parametrize('key', ['cube', 'tesseract'])
def test_native_accepts_presentation_spin_and_preserves_source(key):
    state = snapshot(key)
    before = copy.deepcopy(state)
    tour = playlist([state], source='current')
    validated = validate_tour(tour)
    assert state == before
    event = validated['events'][0]
    assert event['state']['model']['fingerprint'] == state['model']['fingerprint']
    assert event['state']['view']['animation']['loop'] is True
    assert event['state']['view']['animation']['duration'] == 90
    assert event['state']['notes'] == state['notes']


def test_native_accepts_crossfade_plan_and_independently_verifies_automatic_dual():
    source = snapshot('cube')
    faded = playlist([source, snapshot('tesseract')])
    assert validate_tour(faded)['events'][0]['transition']['distance'] == 0
    target = copy.deepcopy(source)
    target['model'] = dual(source['model'])
    morph = playlist([source, target])
    assert morph['events'][0]['transition']['method'] == 'morph-to-dual'
    result = dispatch({'op': 'verify-dual-tour', 'model': source['model'],
                       'params': {'target': target['model']}})
    assert result['verified'] is True
    assert validate_tour(morph)['events'][0]['transition']['method'] == 'morph-to-dual'
