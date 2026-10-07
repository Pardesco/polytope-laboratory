"""Record each independent reference construction and its measured incidence."""
from pathlib import Path
import json
import sys

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from engine import __version__
from engine.generators import CATALOG,regular
from engine.geometry import analyze

entries=[]
for item in CATALOG:
    model=regular(item['key']);analysis=analyze(model)
    actual=[len(model[k]) for k in ('vertices','edges','faces','cells')]
    assert actual==item['counts'] and model['validation']['passed'],item['key']
    entries.append({**item,'geometryFingerprint':model['fingerprint'],'interpretation':model['interpretation'],
                    'actualCounts':actual,'faceTypes':analysis['faceTypes'],'edgeLengths':analysis['edgeLength'],
                    'eulerCharacteristic':model['validation']['eulerCharacteristic'],
                    'numericContract':'float64-approximate; no algebraic certificate',
                    'construction':model['provenance']['operation']})
(root/'docs/reference-manifest.json').write_text(json.dumps({
    'schemaVersion':1,'version':__version__,'independentlyGenerated':True,
    'baselineLibraryComplete':False,'entries':entries},indent=2),encoding='utf-8')
print(f'Recorded {len(entries)} reference constructions and measured incidence.')
