"""Measure the desktop smoke fixture's exported PDF, independently of SVG math.

Requires PyMuPDF in the verification environment; it is not a runtime dependency.
"""
from pathlib import Path
from collections import Counter
import json
import math
import re
import os
import fitz

root=Path(__file__).resolve().parents[1]
artifacts=Path(os.environ.get('POLYTOPE_TEST_ARTIFACTS',root/'artifacts'))
project=json.loads((artifacts/'smoke.polyproj').read_text(encoding='utf-8'))
state=project['documents'][1]['states'][0];net=state['netLayout']
assert state['model']['metadata']['key']=='cube','This physical-output fixture checks the cube workflow.'
pdf=fitz.open(artifacts/'smoke-net.pdf');assert len(pdf)==1
page=pdf[0]
expected=[float(re.search(attribute+'="([0-9.e+-]+)mm"',net['svg']).group(1))+20 for attribute in ('width','height')]
actual=[page.rect.width*25.4/72,page.rect.height*25.4/72]
# Chromium quantizes CSS page dimensions; source edge lengths must meet a
# tighter physical tolerance than the surrounding paper-size roundoff.
assert max(abs(a-b) for a,b in zip(actual,expected))<25.4/96
lengths=[math.hypot(item[2].x-item[1].x,item[2].y-item[1].y)*25.4/72
         for draw in page.get_drawings() for item in draw['items'] if item[0]=='l']
reference=[length for length in lengths if abs(length-net['referenceEdgeLengthMm'])<.5]
assert len(reference)>=24 and max(abs(length-net['referenceEdgeLengthMm']) for length in reference)<.01
labels=Counter(int(i) for i in re.findall(r'\bF(\d+)\b',page.get_text()))
assert labels==Counter(range(net['sourceFaceCount']))
evidence={'pageCount':len(pdf),'pageMillimeters':actual,'declaredPageMillimeters':expected,'maximumPageRoundoffMm':25.4/96,
          'referenceEdgeLengthRangeMm':[min(reference),max(reference)],'sourceFaceLabelsPresent':True,
          'scope':'digital PDF cube-fixture physical scale; hardware printer calibration not established'}
(artifacts/'net-pdf-measurements.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
print(json.dumps(evidence,indent=2))
