"""Independently measure all standard-paper PDF pages from desktop smoke.

PyMuPDF is a verification-only dependency, not part of the desktop runtime.
"""
from pathlib import Path
from collections import Counter
import json
import math
import re
import os
import fitz

root = Path(__file__).resolve().parents[1]
artifacts = Path(os.environ.get('POLYTOPE_TEST_ARTIFACTS', root / 'artifacts'))
project = json.loads((artifacts / 'smoke-packed.polyproj').read_text(encoding='utf-8'))
document = project['documents'][project['active']]
state = document['states'][document['cursor']]
plan, net, model = state['netPages'], state['netLayout'], state['model']
assert model['metadata']['key'] == 'dodecahedron'
assert net['hinges'] == [] and plan['pageCount'] == 6
assert plan['referenceEdgeLengthMm'] == 65
pdf = fitz.open(artifacts / 'smoke-packed.pdf')
assert len(pdf) == plan['pageCount']
dimensions, reference, face_labels, edge_labels = [], [], Counter(), Counter()
for page, declared in zip(pdf, plan['pages']):
    actual = [page.rect.width * 25.4 / 72, page.rect.height * 25.4 / 72]
    expected = [declared['widthMm'], declared['heightMm']]
    assert max(abs(a-b) for a, b in zip(actual, expected)) < 25.4 / 96
    dimensions.append(actual)
    text = page.get_text()
    face_labels.update(int(i) for i in re.findall(r'\bF(\d+)\b', text))
    edge_labels.update(int(i) for i in re.findall(r'\bE(\d+)\b', text))
    lengths = [math.hypot(item[2].x-item[1].x, item[2].y-item[1].y) * 25.4 / 72
               for draw in page.get_drawings() for item in draw['items'] if item[0] == 'l']
    matching = [length for length in lengths if abs(length - net['referenceEdgeLengthMm']) < .5]
    assert len(matching) >= sum(len(model['faces'][i]) for part in declared['parts'] for i in part['faceIds'])
    reference.extend(matching)
assert face_labels == Counter(range(len(model['faces'])))
assert edge_labels == Counter({i: 2 for i in range(len(model['edges']))})
assert max(abs(length - net['referenceEdgeLengthMm']) for length in reference) < .01
evidence = {
    'pageCount': len(pdf), 'pageMillimeters': dimensions,
    'maximumPageRoundoffMm': 25.4 / 96, 'requestedReferenceEdgeLengthMm': net['referenceEdgeLengthMm'],
    'referenceEdgeLengthRangeMm': [min(reference), max(reference)],
    'eachSourceFaceLabelPresentOnce': True, 'eachCutEdgeLabelPresentTwice': True,
    'scope': 'digital PDF separate-face dodecahedron fixture; hardware printer calibration not established'
}
(artifacts / 'packed-net-pdf-measurements.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
print(json.dumps(evidence, indent=2))
