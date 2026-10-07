"""Ordered source-edge refinement with exact parameter lineage; no hull or weld."""
from copy import deepcopy
from fractions import Fraction
import math
import uuid

from .compounds import (_check_source, _colors, _payload_size, MAX_ELEMENTS,
                        MAX_FACE_VERTICES, MAX_INCIDENCES, MAX_PAYLOAD_BYTES)
from .geometry import GeometryError, MAX_VERTICES, TOLERANCE, identity, validate

VERSION = '0.1.0'
MAX_DIVISIONS = 128


def subdivide_edges(source, divisions=2, edge_ids=None):
    """Replace requested source edges by equal parameter segments in every face."""
    _check_source(source)
    if source.get('components') is not None:
        raise GeometryError('Compound edge subdivision needs hierarchical one-to-many maps; extract a component first.')
    if type(divisions) is not int or not 1 <= divisions <= MAX_DIVISIONS:
        raise GeometryError(f'Edge divisions must be an integer between 1 and {MAX_DIVISIONS}.')
    if edge_ids is None:
        selected = list(range(len(source['edges'])))
    elif not isinstance(edge_ids, list) or any(type(i) is not int or not 0 <= i < len(source['edges']) for i in edge_ids) or len(set(edge_ids)) != len(edge_ids):
        raise GeometryError('Selected edge IDs must be a list of distinct valid source indices.')
    else:
        selected = sorted(edge_ids)
    chosen = set(selected)
    embedding = source.get('embeddingDimension', source['dimension'])
    vertex_count = len(source['vertices'])+len(selected)*(divisions-1)
    edge_count = len(source['edges'])+len(selected)*(divisions-1)
    if vertex_count > MAX_VERTICES or edge_count > MAX_ELEMENTS:
        raise GeometryError('Edge subdivision vertex/edge resource limit exceeded.')
    source_edge_index = {tuple(sorted(edge)): i for i, edge in enumerate(source['edges'])}
    face_sizes = []
    for face in source['faces']:
        size = len(face)+(divisions-1)*sum(source_edge_index[tuple(sorted((a, b)))] in chosen for a, b in zip(face, face[1:]+face[:1]))
        if size > MAX_FACE_VERTICES:
            raise GeometryError('Edge subdivision face-boundary resource limit exceeded.')
        face_sizes.append(size)
    incidences = vertex_count*embedding+edge_count*2+sum(face_sizes)+sum(map(len, source.get('cells', [])))
    if incidences > MAX_INCIDENCES:
        raise GeometryError('Edge subdivision aggregate incidence resource limit exceeded.')
    vertices = deepcopy(source['vertices'])
    vertex_sources = [{'vertex': i} for i in range(len(vertices))]
    edges, chains, edge_maps, edge_sources = [], [], [], []
    for index, (a, b) in enumerate(source['edges']):
        chain = [a]
        if index in chosen and divisions > 1:
            if math.dist(vertices[a], vertices[b]) == 0:
                raise GeometryError('Cannot subdivide an edge with coincident geometric endpoints.')
            for step in range(1, divisions):
                fraction = Fraction(step, divisions)
                point = [((divisions-step)*x+step*y)/divisions for x, y in zip(vertices[a], vertices[b])]
                if not all(math.isfinite(x) and abs(x) <= 1e100 for x in point) or point == vertices[chain[-1]] or point == vertices[b]:
                    raise GeometryError('Edge subdivision is unresolved at float64 precision; new vertices coincide with segment endpoints.')
                chain.append(len(vertices))
                vertices.append(point)
                vertex_sources.append({'edge': index, 'parameter': {'numerator': fraction.numerator,
                                                                  'denominator': fraction.denominator}})
        chain.append(b)
        chains.append(chain)
        mapped = []
        for segment, (first, last) in enumerate(zip(chain, chain[1:])):
            mapped.append(len(edges))
            edges.append([first, last])
            denominator = divisions if index in chosen else 1
            start, end = Fraction(segment, denominator), Fraction(segment+1, denominator)
            edge_sources.append({'edge': index,
                                 'parameterInterval': [[start.numerator, start.denominator], [end.numerator, end.denominator]]})
        edge_maps.append(mapped)
    faces = []
    for face in source['faces']:
        cycle = []
        for a, b in zip(face, face[1:]+face[:1]):
            chain = chains[source_edge_index[tuple(sorted((a, b)))]]
            if chain[0] != a:
                chain = list(reversed(chain))
            cycle.extend(chain[:-1])
        faces.append(cycle)
    maps = {'vertices': list(range(len(source['vertices']))), 'edges': edge_maps,
            'faces': list(range(len(source['faces']))), 'cells': list(range(len(source.get('cells', []))))}
    metadata = {'edgeSubdivision': {'schemaVersion': 1, 'sourceModel': deepcopy(source), 'sourceMaps': maps,
                                    'vertexSources': vertex_sources, 'edgeSources': edge_sources,
                                    'edgeChains': chains, 'divisions': divisions, 'selectedEdgeIds': selected,
                                    'definition': 'linear source-edge parameter subdivision with ordered face insertion'}}
    for field in ('coordinateUnits', 'fillRule'):
        if field in source.get('metadata', {}):
            metadata[field] = deepcopy(source['metadata'][field])
    colors = {kind: deepcopy(_colors(source, kind)) for kind in ('faces', 'cells')}
    if any(color is not None for values in colors.values() for color in values):
        metadata['offColors'] = colors
    result = {'id': str(uuid.uuid4()), 'name': f"Edge subdivision of {source.get('name', 'source')}",
              'dimension': source['dimension'], 'embeddingDimension': embedding, 'interpretation': 'generalized-complex',
              'vertices': vertices, 'edges': edges, 'faces': faces, 'cells': deepcopy(source.get('cells', [])),
              'metadata': metadata, 'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False,
                                               'inputInterpretation': 'Exact rational edge parameters evaluated on supplied coordinates in float64'},
              'provenance': {'operation': 'subdivide-edges', 'algorithmVersion': VERSION,
                             'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
                             'parameters': {'divisions': divisions, 'edge_ids': selected},
                             'definition': 'no face subdivision, hull, welding, recentering or regularity inference'}}
    result['validation'] = validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Subdivided incidence failed validation: '+'; '.join(result['validation']['errors']))
    result['fingerprint'] = identity(result)
    if _payload_size(result) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Edge subdivision result payload resource limit exceeded, including source history.')
    return result
