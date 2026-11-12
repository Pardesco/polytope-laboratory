"""Run from the repository root to regenerate the retained-kernel fixture."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch

from engine.formats import validate_project
from engine.history import create_history, record_source, record_operation
from engine.server import dispatch

source = {'model': {'id': 'legacy-square', 'name': 'Cartesian square',
    'dimension': 2, 'embeddingDimension': 2, 'interpretation': 'generalized-complex',
    'vertices': [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    'edges': [[0, 1], [1, 2], [2, 3], [3, 0]], 'faces': [[0, 1, 2, 3]], 'cells': [],
    'numeric': {'mode': 'float64-approximate', 'certified': False},
    'metadata': {'offColors': {'faces': [{'encoding': 'unit', 'values': [0.2, 0.5, 1, 0.25]}], 'cells': []}}},
    'view': {'coordinateUnit': 'mm'},
    'notes': 'Retained polygon-prism/0.1.0; caps retain source colors.', 'label': 'Square'}
validate_project({'format': 'polytope-laboratory', 'version': 1, 'active': 0,
                  'documents': [{'cursor': 0, 'states': [source]}]})
graph = record_source(create_history(), 'square', source)
with patch('engine.products.uuid.uuid4', return_value='legacy-prism'):
    model = dispatch({'op': 'polygon-prism', 'params': {'height': 2},
                      'model': deepcopy(source['model']), 'algorithmVersion': '0.1.0'})
state = {'model': model, 'view': {'coordinateUnit': 'mm'},
         'notes': source['notes'], 'label': 'Legacy square prism'}
graph = record_operation(graph, 'legacy-prism', 'square', 'polygon-prism',
                         {'height': 2}, state, algorithm_version='0.1.0')
source['operationNode'] = 'square'
state['operationNode'] = 'legacy-prism'
project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0,
    'documents': [{'id': 'retained-prism-v1', 'cursor': 1, 'states': [source, state],
                   'operationHistory': graph.to_dict()}]}
validate_project(project)
Path('tests/fixtures/history/polygon-prism-0.1.polyproj').write_text(
    json.dumps(project, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
