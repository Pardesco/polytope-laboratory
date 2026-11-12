"""Choose one collision-free tab side for each cut with a bounded 2-SAT solve."""

import numpy as np
from .geometry import GeometryError, identity


def paper_tabs(model, net):
    from .net_tabs import tab_records_for_faces, apply_options
    from .generalized_nets import polygon_overlap

    options = {
        'version': 1,
        'sourceId': model['id'],
        'sourceFingerprint': identity(model),
        'mode': 'double',
        'widthMm': max(0.1, min(2, net['referenceEdgeLengthMm'] * 0.08)),
        'edges': [],
    }
    candidates = tab_records_for_faces(model, net, options)
    edges = sorted({t['edge'] for t in candidates})
    variables = {edge: i for i, edge in enumerate(edges)}
    owners = {edge: sorted(t['face'] for t in candidates if t['edge'] == edge) for edge in edges}
    graph = [set() for _ in range(2 * len(edges))]
    reverse = [set() for _ in graph]

    def imply(a, b):
        graph[a].add(b)
        reverse[b].add(a)

    def literal(tab):
        return 2 * variables[tab['edge']] + owners[tab['edge']].index(tab['face'])

    tolerance = net['referenceEdgeLengthMm'] * 1e-8
    for i, tab in enumerate(candidates):
        a = literal(tab)
        poly = np.asarray(tab['points'])
        if any(polygon_overlap(poly, np.asarray(face['points']), tolerance) for face in net['faces']):
            imply(a, a ^ 1)
        for other in candidates[i + 1 :]:
            if tab['edge'] == other['edge']:
                continue
            if polygon_overlap(poly, np.asarray(other['points']), tolerance):
                b = literal(other)
                imply(a, b ^ 1)
                imply(b, a ^ 1)
    seen = set()
    order = []

    def visit(start):
        stack = [(start, False)]
        while stack:
            node, done = stack.pop()
            if done:
                order.append(node)
                continue
            if node in seen:
                continue
            seen.add(node)
            stack.append((node, True))
            stack.extend((v, False) for v in sorted(graph[node], reverse=True) if v not in seen)

    for node in range(len(graph)):
        visit(node)
    components = {}
    component = 0
    for start in reversed(order):
        if start in components:
            continue
        stack = [start]
        while stack:
            node = stack.pop()
            if node in components:
                continue
            components[node] = component
            stack.extend(reverse[node] - components.keys())
        component += 1
    if any(components[2 * i] == components[2 * i + 1] for i in range(len(edges))):
        raise GeometryError(
            'Visible paper pieces have unavoidable tab conflicts; use separate faces or disable tabs and review the assembly.'
        )
    options['mode'] = 'single'
    options['edges'] = [
        {'edge': edge, 'mode': 'single', 'face': owners[edge][int(components[2 * i + 1] > components[2 * i])]}
        for i, edge in enumerate(edges)
    ]
    result = apply_options(model, net, options)
    if result['hasTabOverlap']:
        raise GeometryError('Automatic visible-surface tab ownership failed overlap verification.')
    return result
