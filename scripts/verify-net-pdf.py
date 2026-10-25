"""Read-only verification of the one-page A4 cube-net QA export."""
import argparse
import json
from pathlib import Path
from pypdf import PdfReader

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pdf', type=Path)
args = parser.parse_args()
reader = PdfReader(args.pdf)
assert len(reader.pages) == 1, 'The cube net should fit on one page'
assert reader.metadata.title == 'Polytope Laboratory - Net', reader.metadata.title
page = reader.pages[0]
dimensions = [float(page.mediabox.width)*25.4/72, float(page.mediabox.height)*25.4/72]
assert abs(dimensions[0]-210) < .3 and abs(dimensions[1]-297) < .3, dimensions
text = page.extract_text()
assert all('F'+str(i) in text for i in range(6)), 'Source face labels are missing'
receipt = {'passed': True, 'pdf': str(args.pdf.resolve()), 'pages': 1, 'title': reader.metadata.title,
           'dimensionsMm': dimensions, 'dimensionToleranceMm': .3, 'sourceFaceLabels': list(range(6)),
           'scope': 'Page size, metadata and text extraction; inspect the separate rendered PNG for visual layout.'}
with args.pdf.with_suffix('.qa.json').open('x', encoding='utf-8') as stream:
    stream.write(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt, indent=2))
