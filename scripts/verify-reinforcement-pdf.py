"""Independent PDF physical vector oracle for the20mm cube support fixture."""
import json
import math
import sys
import fitz

document=fitz.open(sys.argv[1]);assert len(document)==2,'Every internal panel must have one real PDF sheet.'
expected=[[20.,20.*math.sqrt(2)],[20.*math.sqrt(2)]];evidence=[]
for index,page in enumerate(document):
    width=page.rect.width*25.4/72;height=page.rect.height*25.4/72
    # Chromium paper boxes are quantized; verify the vectors separately below.
    assert abs(width-210)<.25 and abs(height-297)<.25,'PDF paper dimensions changed.'
    lengths=[]
    for drawing in page.get_drawings():
        for item in drawing['items']:
            if item[0]=='l':lengths.append(math.hypot(item[2].x-item[1].x,item[2].y-item[1].y)*25.4/72)
            elif item[0]=='re':lengths.extend([item[1].width*25.4/72,item[1].height*25.4/72])
    for length in expected[index]:assert any(abs(actual-length)<.02 for actual in lengths),f'Physical support edge{length}mm was not preserved.'
    assert 'V0' in page.get_text(),'Source vertex labels must remain printable.'
    evidence.append({'page':index,'widthMm':width,'heightMm':height,'vectorLengthsMm':lengths,'text':page.get_text()})
print(json.dumps({'passed':True,'pages':evidence,'physicalToleranceMm':.02,'paperBoxToleranceMm':.25}))
