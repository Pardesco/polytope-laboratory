"""Explicit replay compatibility; recorded versions are never rewritten.

Project/history schema 1 stays schema 1. Unknown schemas are rejected by their
readers; unknown operation semantics retain validated snapshots only.
"""

from types import MappingProxyType

from .geometry import GeometryError, VERSION

PROJECT_VERSIONS = (1,)
HISTORY_VERSIONS = (1,)
RETAINED_ALGORITHMS = MappingProxyType(
    {
        'polygon-prism': ('0.1.0',),
        'cell': ('0.1.0',),
    }
)


def supported_versions(operation):
    from .history import ALGORITHM_VERSIONS

    current = VERSION if operation == 'source' else ALGORITHM_VERSIONS.get(operation)
    return (() if current is None else (current,)) + RETAINED_ALGORITHMS.get(operation, ())


def selected_nodes(graph, target=None):
    nodes = {node['id']: node for node in graph['nodes']}
    if target is not None and (type(target) is not str or target not in nodes):
        raise GeometryError('Requested history replay target is unavailable.')
    required = set(nodes) if target is None else set()
    pending = [] if target is None else [target]
    while pending:
        key = pending.pop()
        if key not in required:
            required.add(key)
            pending.extend(nodes[key]['inputs'])
    return [node for node in graph['nodes'] if node['id'] in required]


def replay_issue(node):
    from .history import NUMERIC_POLICY, REPLAY_OPERATIONS

    prefix = f'History node {node["id"]}: '
    suffix = '; retained snapshot remains readable.'
    if node['op'] != 'source' and (node['op'] not in REPLAY_OPERATIONS or len(node['inputs']) != 1):
        return prefix + f'unsupported replay operation {node["op"]}' + suffix
    if node['algorithmVersion'] not in supported_versions(node['op']):
        if node['op'] == 'spring-relaxation':
            return prefix + f'Spring algorithm version unsupported ({node["algorithmVersion"]})' + suffix
        return prefix + f'unsupported algorithm version {node["algorithmVersion"]}' + suffix
    if node['numericPolicy'] != NUMERIC_POLICY:
        return prefix + 'unsupported numeric policy' + suffix
    return None


def require_replay_support(graph, target=None):
    """Preflight a validated graph before any specialized dispatcher runs."""
    selected = selected_nodes(graph, target)
    for node in selected:
        issue = replay_issue(node)
        if issue:
            raise GeometryError(issue)
    return selected


def replay_support(history, target=None):
    from .history import validate_history, REPLAY_OPERATIONS

    graph = validate_history(history).to_dict()
    selected = selected_nodes(graph, target)
    issues = [issue for node in selected if (issue := replay_issue(node))]
    retained = [
        {'id': node['id'], 'op': node['op'], 'algorithmVersion': node['algorithmVersion']}
        for node in selected
        if node['algorithmVersion'] in RETAINED_ALGORITHMS.get(node['op'], ())
    ]
    available = bool(selected) and not issues
    node = selected[-1] if target is not None else None
    return {
        'policyVersion': 1,
        'status': 'snapshot-only' if not available else 'retained-version' if retained else 'replay-available',
        'canReplay': available,
        'canBranch': available and node is not None and node['op'] in REPLAY_OPERATIONS,
        'verified': False,
        'target': target,
        'nodeCount': len(selected),
        'retainedAlgorithms': retained,
        'issues': issues,
        'message': issues[0]
        if issues
        else 'No recorded operations to replay.'
        if not selected
        else 'Retained algorithm version available. Replay must still verify geometry and content.'
        if retained
        else 'Recorded versions are available. Replay must still verify geometry and content.',
    }


def dispatch_history_support(request):
    if (
        type(request) is not dict
        or set(request) - {'op', 'params', 'model', 'id'}
        or type(request.get('params')) is not dict
        or set(request['params']) - {'history', 'target'}
        or 'history' not in request['params']
    ):
        raise GeometryError('History support requires a history graph and optional target node.')
    return replay_support(request['params']['history'], request['params'].get('target'))
