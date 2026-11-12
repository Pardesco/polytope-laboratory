"""Regenerate small bundled learning projects using native project validation."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.generators import regular
from engine.formats import validate_project
from engine.nets import unfold

ROOT = Path(__file__).resolve().parents[1] / 'examples' / 'welcome'


def generate():
    ROOT.mkdir(parents=True, exist_ok=True)
    for key, filename, title, notes, extra in [
        (
            'tesseract',
            'four-dimensional-sections',
            'Four-dimensional sections',
            'A tesseract in 4D perspective. Use the Depth slider to move its 3D section; Rotate turns the source in the XW plane.',
            {
                'projection': 'perspective',
                'viewportLayout': 'split',
                'derivedMode': 'section',
                'sectionNormal': [0, 0, 0, 1],
                'sectionOffset': 0.2,
                'rotationPlane': 2,
                'rotationSpeed': 4,
            },
        ),
        (
            'cube',
            'paper-cube',
            'Paper cube',
            'A cube net with 25 mm reference edges and glue tabs. In Nets, pack and preview on paper, then export PDF or use File > Print net at 100% scale.',
            {
                'derivedMode': 'net',
                'viewportLayout': 'split',
                'net': {
                    'root': 0,
                    'length': 25,
                    'tabs': True,
                    'display': 'layout',
                    'fraction': 0,
                    'action': 'move',
                    'component': 0,
                },
            },
        ),
        (
            'icosahedron',
            'dual-exploration',
            'Dual exploration',
            'Construct the polar dual to get a dodecahedron. Undo/Redo preserves the construction history. The Dual morph shelf provides a view preview.',
            {'derivedMode': 'dual', 'viewportLayout': 'split'},
        ),
    ]:
        model = regular(key)
        view = {
            'angles': [0, 0, 24, 0, 18, 0] if model['dimension'] == 4 else [0] * 6,
            'projection': 'orthographic',
            'faces': True,
            'edges': True,
            'vertices': False,
            'surfaceColors': 'face',
            'surfaceOpacity': 0.2 if model['dimension'] == 4 else 1,
            'documentMetadata': {'title': title},
            **extra,
        }
        state = {'model': model, 'view': view, 'label': title, 'notes': notes}
        if key == 'cube':
            state['netLayout'] = unfold(model, edge_length_mm=25, tabs=True)
        project = validate_project(
            {
                'format': 'polytope-laboratory',
                'version': 1,
                'active': 0,
                'documents': [{'id': filename, 'cursor': 0, 'states': [state]}],
            }
        )
        (ROOT / (filename + '.polyproj')).write_text(
            json.dumps(project, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )


if __name__ == '__main__':
    generate()
