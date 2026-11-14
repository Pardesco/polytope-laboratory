"""Development-only producer. The verifier separately reads this untrusted JSON."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.hyperbolic_document import handle
from engine.hyperbolic import boost


def main():
    sources = [{'type': 'honeycomb', 'pqr': p} for p in ([5, 3, 4], [4, 3, 5], [5, 3, 5], [3, 5, 3])]
    sources.append({'type': 'manifold', 'key': 'small-cover-v1'})
    receipts = []
    for source in sources:
        for heading in ([1, 0.3, -0.2], [-0.2, 0.7, 1]):
            observer = boost(heading, 0.65)
            # Nonzero off-centre pose, retained in the observer-centered output frame.
            params = {
                'source': source,
                'radius': 2,
                'epoch': len(receipts),
                'rebase': observer.ravel().tolist(),
                'budget': {'pageSize': 256, 'candidatesPerPage': 50000},
            }
            page = handle('hyperbolic-patch', params)
            pages = [page]
            params.pop('rebase')
            params['anchor'] = page['anchor']
            while pages[-1].get('nextCursor'):
                pages.append(handle('hyperbolic-patch', {**params, 'cursor': pages[-1]['nextCursor']}))
            assert pages[-1]['coverage']['complete'], pages[-1]['coverage']
            # Strip replay checkpoints; the verifier never trusts completeness alone.
            for page in pages:
                page.pop('nextCursor', None)
            receipts.append({'source': source, 'inputObserver': observer.ravel().tolist(), 'pages': pages})
            print(source, heading, sum(len(p['instances']) for p in pages), flush=True)
    target = ROOT / 'artifacts/verify-hyperbolic/engine-receipts.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({'receipts': receipts}, separators=(',', ':')), encoding='utf8')


if __name__ == '__main__':
    main()
