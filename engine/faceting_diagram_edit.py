"""Realize verified diagram selections without claiming closed-solid search acceptance."""

from copy import deepcopy

from .automatic_faceting import _hash
from .faceting import facet
from .geometry import GeometryError, identity

OPERATION = 'facet-diagram-adopt'
VERSION = '0.1.0'


def diagram_model(diagram):
    if diagram.get('status') != 'complete':
        raise GeometryError('Complete diagram required for construction.')
    selection = diagram['selection']
    cycles = selection['expandedCycles']
    if not cycles:
        return None
    source = diagram['sourceSnapshot']
    result = facet(deepcopy(source), deepcopy(cycles), 'Diagram faceting of ' + source.get('name', 'source'))
    result['id'] = 'diagram-faceted-' + _hash({'source': source, 'parameters': diagram['parameters']})
    result['metadata'].update(
        family='Faceting',
        activeSourceVertexIds=sorted({v for face in cycles for v in face}),
        sourceFaceIds=[deepcopy(row['sourceFaceIds']) for row in selection['facets']],
        offColors={'faces': [deepcopy(row['sourceColor']) for row in selection['facets']], 'cells': []},
        facetingDiagram={
            'seedCandidateIds': deepcopy(selection['seedCandidateIds']),
            'expandedFacetCount': len(cycles),
            'subgroupOrder': len(selection['actionIndices']),
            'edgeDiagnostics': deepcopy(selection['edgeDiagnostics']),
            'planarityPredicate': 'exact supplied integer/binary64 ratios',
            'closedManifoldClaim': False,
            'enumerationComplete': False,
        },
        solidInterpretation='Ordered source surface; open/nonmanifold/intersecting facets permitted; no filled-solid claim',
    )
    if 'coordinateUnits' in source.get('metadata', {}):
        result['metadata']['coordinateUnits'] = deepcopy(source['metadata']['coordinateUnits'])
    result['provenance'] = {
        'operation': OPERATION,
        'algorithmVersion': VERSION,
        'sourceSnapshot': deepcopy(source),
        'sourceSnapshotHash': _hash(source),
        'parameters': deepcopy(diagram['parameters']),
        'sourceGeometryConvexified': False,
    }
    result['fingerprint'] = identity(result)
    return result


def dispatch_diagram_adopt(request):
    from .faceting_diagram_workflow import dispatch_diagram
    from .automatic_faceting_workflow import _structured, _portable, OUTPUT_BYTES

    @_structured
    def checked():
        _portable(request, OUTPUT_BYTES)
        if (
            type(request) is not dict
            or not {'op', 'model', 'params'} <= set(request)
            or set(request) - {'op', 'model', 'params', 'id', 'algorithmVersion'}
            or request['op'] != OPERATION
            or request.get('algorithmVersion', VERSION) != VERSION
            or type(request['params']) is not dict
            or set(request['params']) != {'state'}
        ):
            raise GeometryError('Diagram adoption requires exactly a supported saved diagram state.')
        reply = dispatch_diagram({**request, 'op': 'facet-diagram'})
        if reply['diagram']['status'] != 'complete' or reply['previewModel'] is None:
            raise GeometryError('Select at least one verified facet before making a base model.')
        return reply['previewModel']

    return checked()
