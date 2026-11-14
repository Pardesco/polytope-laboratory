"""Kind adapter: bounded native documents, retained geometry and local rebasing."""

from copy import deepcopy
import hashlib
import json
import numpy as np
from .geometry import GeometryError
from .hyperbolic import J, reflection_matrix, regular_cell_template
from . import hyperbolic_protocol as protocol
from . import hyperbolic_manifold as manifold
from .hyperbolic_orbit import repair_frame

KIND = 'hyperbolic-space'
IDENTITY = np.eye(4).ravel().tolist()
PRESET_NAMES = {
    (5, 3, 4): 'Order-4 dodecahedral honeycomb {5,3,4}',
    (4, 3, 5): 'Order-5 cubic honeycomb {4,3,5}',
    (5, 3, 5): 'Order-5 dodecahedral honeycomb {5,3,5}',
    (3, 5, 3): 'Order-3 icosahedral honeycomb {3,5,3}',
}


def is_hyperbolic(model):
    return isinstance(model, dict) and model.get('kind') == KIND


def fingerprint(model):
    return hashlib.sha256(protocol._json(canonical_model(model))).hexdigest()


def canonical_model(model):
    def numbers(value):
        if isinstance(value, dict):
            return {k: numbers(v) for k, v in value.items()}
        if isinstance(value, list):
            return [numbers(v) for v in value]
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value

    return numbers(
        {
            k: deepcopy(model.get(k))
            for k in (
                'kind',
                'dimension',
                'coordinateDimension',
                'source',
                'curvature',
                'algorithmVersion',
                'pinnedDomain',
            )
        }
    )


def _frame(value, proper=False):
    if not isinstance(value, list) or len(value) != 16 or any(type(x) not in (int, float) for x in value):
        raise GeometryError('Hyperbolic frame requires 16 finite numbers.')
    m = np.asarray(value, dtype=float).reshape(4, 4)
    if (
        not np.isfinite(m).all()
        or np.max(np.abs(m)) > 1e4
        or m[0, 0] < 1
        or np.max(np.abs(m.T @ J @ m - J)) > 1e-8
        or proper
        and np.linalg.det(m) <= 0
    ):
        raise GeometryError('Hyperbolic frame must be future Lorentz orthonormal within 1e-8.')
    return repair_frame(m, int(np.linalg.det(m) < 0)) if np.max(np.abs(m.T @ J @ m - J)) > 1e-14 else m


def _developed_frame(value):
    from .hyperbolic import matrix_metric_residual

    if not isinstance(value, list) or len(value) != 16 or any(type(x) not in (int, float) for x in value):
        raise GeometryError('Retained matrix requires 16 finite numbers.')
    matrix = np.asarray(value, dtype=float).reshape(4, 4)
    if (
        not np.isfinite(matrix).all()
        or np.max(np.abs(matrix)) > 1e4
        or matrix[0, 0] < 1
        or matrix_metric_residual(matrix)['relative'] > 1e-12
    ):
        raise GeometryError('Retained matrix exceeds relative development gate 1e-12.')
    return matrix


def _inverse(m):
    return J @ m.T @ J


def _anchor(value, source):
    if value is not None and not isinstance(value, dict):
        raise GeometryError('Hyperbolic anchor requires an object.')
    a = deepcopy(value or {})
    if source['type'] == 'manifold':
        if set(a) - {'quotientState', 'localPose', 'frame', 'observerMatrix'}:
            raise GeometryError('Unsupported manifold anchor fields.')
        g = manifold._state(a.get('quotientState', 0))
        pose = manifold._pose(g, a.get('localPose'))
        return {'quotientState': g, 'localPose': pose.ravel().tolist()}
    if set(a) - {'word', 'wordChunks', 'localFrame', 'observerMatrix'}:
        raise GeometryError('Unsupported honeycomb anchor fields.')
    chunks = a.get('wordChunks', [])
    if (
        not isinstance(chunks, list)
        or len(chunks) > 64
        or any(not isinstance(chunk, list) or not 1 <= len(chunk) <= 256 for chunk in chunks)
    ):
        raise GeometryError('Navigation address requires bounded 256-generator chunks.')
    tail = a.get('word', [])
    if not isinstance(tail, list):
        raise GeometryError('Navigation word requires an array.')
    word = [f for chunk in chunks for f in chunk] + tail
    faces = len(regular_cell_template(source['pqr'])['faces'])
    if (
        not isinstance(word, list)
        or len(word) > 16000
        or any(type(f) is not int or not 0 <= f < faces for f in word)
        or len(protocol._json(word)) > 64 * 1024
    ):
        raise GeometryError('Navigation address exceeds 64 KiB or contains an invalid face.')
    default_frame = np.diag([1.0, (-1.0) ** len(word), 1.0, 1.0]).ravel().tolist()
    frame = _frame(a.get('localFrame', default_frame))
    if np.linalg.det(frame) * (-1) ** len(word) <= 0:
        raise GeometryError('Honeycomb anchor frame has the wrong address handedness.')
    observer = _frame(a.get('observerMatrix', IDENTITY), proper=True)
    whole = len(word) // 256 * 256
    result = {'word': word[whole:], 'localFrame': frame.ravel().tolist(), 'observerMatrix': observer.ravel().tolist()}
    if whole:
        result['wordChunks'] = [word[i : i + 256] for i in range(0, whole, 256)]
    return result


def _rebase(source, anchor, observer):
    c = _frame(observer, proper=True)
    is_manifold = source['type'] == 'manifold'
    pose = np.asarray(anchor['localPose' if is_manifold else 'localFrame']).reshape(4, 4) @ c
    pose = repair_frame(pose, int(np.linalg.det(pose) < 0))
    template = manifold.fundamental_domain()['template'] if is_manifold else regular_cell_template(source['pqr'])
    normals = np.asarray(template['facePlanes'])
    g = anchor.get('quotientState', 0)
    word = [f for chunk in anchor.get('wordChunks', []) for f in chunk] + list(anchor.get('word', []))
    for _ in range(256):
        distances = normals @ J @ pose[:, 0]
        face = int(np.argmax(distances))
        if distances[face] <= 1e-9:
            break
        if is_manifold:
            crossed = manifold.cross_face(g, pose.ravel().tolist(), face)
            g, pose = crossed['quotientState'], np.asarray(crossed['localPose']).reshape(4, 4)
        else:
            pose = repair_frame(reflection_matrix(normals[face]) @ pose, len(word) + 1)
            if word and word[-1] == face:
                word.pop()
            else:
                word.append(face)
    else:
        raise GeometryError('Navigation crossing limit reached; return to center.')
    return _anchor(
        {'quotientState': g, 'localPose': pose.ravel().tolist()}
        if is_manifold
        else {'word': word, 'localFrame': pose.ravel().tolist()},
        source,
    )


def _native_anchor(anchor):
    matrix = np.asarray(anchor['localFrame']).reshape(4, 4) @ np.asarray(anchor['observerMatrix']).reshape(4, 4)
    if np.linalg.det(matrix) < 0:
        matrix = matrix @ np.diag([1.0, -1.0, 1.0, 1.0])
    return {'word': [], 'observerMatrix': matrix.ravel().tolist()}


def _honeycomb_page(params, source, anchor):
    base = {k: deepcopy(v) for k, v in params.items() if k not in ('rebase', 'descriptor')}
    base['anchor'] = _native_anchor(anchor)
    cursor = base.get('cursor')
    if cursor is not None:
        if (
            not isinstance(cursor, dict)
            or set(cursor) != {'version', 'anchorHash', 'native'}
            or cursor['version'] != 'document-1'
            or cursor['anchorHash'] != protocol._hash(anchor)
        ):
            raise GeometryError('Cursor is bound to a different document anchor.')
        base['cursor'] = cursor['native']
    page = protocol.handle('hyperbolic-patch', base)
    frame = np.asarray(anchor['localFrame']).reshape(4, 4)
    inverse = _inverse(frame)
    page['coverage']['observer'] = (inverse @ np.asarray(page['coverage']['observer'])).tolist()
    for cell in page['instances']:
        transformed = inverse @ np.asarray(cell['matrix']).reshape(4, 4)
        from .hyperbolic import matrix_metric_residual, point_metric_residual, record_residual

        for name, residual in (
            ('anchorTransformMetric', matrix_metric_residual(transformed)),
            (
                'anchorCoordinates',
                point_metric_residual((transformed @ np.asarray(page['templates'][0]['vertices']).T).T),
            ),
        ):
            record_residual(page['residuals'], name, residual)
            if residual['relative'] > 1e-12:
                raise GeometryError(f'Anchor development exceeds relative 1e-12: {name} {residual}.')
        cell['matrix'] = transformed.ravel().tolist()
    page['anchorHash'] = protocol._hash({'nativeAnchorHash': page['anchorHash'], 'anchor': anchor})
    page['anchor'] = deepcopy(anchor)
    if page.get('nextCursor') is not None:
        page['nextCursor'] = {
            'version': 'document-1',
            'anchorHash': protocol._hash(anchor),
            'native': page['nextCursor'],
        }
        if len(protocol._json(page['nextCursor'])) > protocol.CURSOR_LIMIT:
            page['nextCursor'] = None
            page['coverage'].update(
                stopReason='cursorLimit', resumable=False, truncation='document cursor exceeds 1 MiB'
            )
    return page


def _analysis(domain=None):
    domain = manifold.fundamental_domain() if domain is None else domain
    key = protocol._hash({'manifoldDomain': domain})
    cached = protocol._CACHE.get(key)
    if isinstance(cached, bytes):
        protocol._CACHE.move_to_end(key)
        return json.loads(cached)
    return protocol._remember(key, manifold.analyze(domain))


def manifold_handler(op, params):
    source = manifold.validate_source(params.get('source'))
    if params.get('mode', 'complete-depth') not in ('complete-depth', 'radius'):
        raise GeometryError('Unsupported manifold patch mode.')
    if type(params.get('epoch', 0)) is not int or not 0 <= params.get('epoch', 0) < 2**53:
        raise GeometryError('Manifold epoch must be a nonnegative safe integer.')
    if op == 'hyperbolic-analyze':
        return _analysis()
    if op == 'hyperbolic-validate':
        if not isinstance(params.get('descriptor'), dict) or params['descriptor'].get('source') != source:
            raise GeometryError('Descriptor source mismatch.')
        return validate_document(params.get('descriptor'))
    if op == 'hyperbolic-create' and params.get('cursor') is not None:
        raise GeometryError('Create starts a new generation; cursors belong to patch.')
    anchor = _anchor(params.get('anchor'), source)
    if params.get('rebase') is not None:
        anchor = _rebase(source, anchor, params['rebase'])
    budget = params.get('budget', {})
    if not isinstance(budget, dict):
        raise GeometryError('Manifold budget requires an object.')
    budget = dict(budget)
    if 'maxInstances' in budget:
        budget['pageSize'] = budget.pop('maxInstances')
    page = manifold.develop_patch(
        anchor['quotientState'],
        anchor['localPose'],
        depth=params.get('depth', 3),
        radius=params.get('radius', 2),
        budget=budget or None,
        mode=params.get('mode', 'radius') if params.get('depth') != 0 else 'complete-depth',
        cursor=params.get('cursor'),
        epoch=params.get('epoch', 0),
        source=source,
    )
    if op == 'hyperbolic-patch':
        return page
    return _descriptor(source, page, anchor, 'Dodecahedral small cover', manifold.fundamental_domain())


def _descriptor(source, page, anchor, name, domain=None):
    page.pop('nextCursor', None)
    result = {
        'kind': KIND,
        'dimension': 3,
        'coordinateDimension': 4,
        'name': name,
        'source': source,
        'curvature': -1,
        'algorithmVersion': '1',
        'anchorPatch': page,
        'anchor': anchor,
        'provenance': {'coordinateConvention': 'time-first', 'coordinateArithmetic': 'float64 approximation'},
    }
    if domain is not None:
        result['pinnedDomain'] = domain
    result['analysisReceipt'] = (
        _analysis(domain) if domain is not None else protocol.handle('hyperbolic-analyze', {'source': source})
    )
    protocol._bounded_json(page, protocol.CURSOR_LIMIT)
    result['fingerprint'] = fingerprint(result)
    return result


def handle(op, params):
    if op not in protocol.OPERATIONS:
        raise GeometryError('Unsupported hyperbolic operation.')
    protocol._bounded_json(params)
    if not isinstance(params, dict):
        raise GeometryError('Hyperbolic parameters require an object.')
    if set(params) - {
        'source',
        'epoch',
        'anchor',
        'radius',
        'depth',
        'mode',
        'budget',
        'cursor',
        'descriptor',
        'rebase',
    }:
        raise GeometryError('Unknown hyperbolic parameter.')
    if isinstance(params.get('source'), dict) and params['source'].get('type') == 'manifold':
        result = protocol.handle(op, params, manifold_handler=manifold_handler)
    else:
        source = protocol._source(params.get('source'))
        if op == 'hyperbolic-validate':
            if params.get('descriptor', {}).get('source') != source:
                raise GeometryError('Descriptor source mismatch.')
            result = validate_document(params.get('descriptor'))
        elif op == 'hyperbolic-analyze':
            result = protocol.handle(op, params)
        else:
            anchor = _anchor(params.get('anchor'), source)
            if params.get('rebase') is not None:
                if params.get('cursor') is not None:
                    raise GeometryError('Rebase starts a new page generation.')
                anchor = _rebase(source, anchor, params['rebase'])
            page = _honeycomb_page(params, source, anchor)
            result = (
                page
                if op == 'hyperbolic-patch'
                else _descriptor(source, page, anchor, PRESET_NAMES[tuple(source['pqr'])])
            )
    protocol._bounded_json(result)
    return result


def validate_document(model):
    protocol._bounded_json(model)
    if (
        not is_hyperbolic(model)
        or model.get('dimension') != 3
        or model.get('coordinateDimension') != 4
        or model.get('curvature') != -1
        or model.get('algorithmVersion') != '1'
    ):
        raise GeometryError('Unsupported hyperbolic document descriptor.')
    source = model.get('source', {})
    if not isinstance(source, dict):
        raise GeometryError('Hyperbolic source requires an object.')
    source = manifold.validate_source(source) if source.get('type') == 'manifold' else protocol._source(source)
    anchor = _anchor(model.get('anchor'), source)
    page = deepcopy(model.get('anchorPatch'))
    protocol._bounded_json(page, protocol.CURSOR_LIMIT)
    if not isinstance(page, dict) or page.get('nextCursor') is not None:
        raise GeometryError('Retain bounded anchor geometry without a continuation cursor.')
    if source['type'] == 'honeycomb':
        frame = np.asarray(anchor['localFrame']).reshape(4, 4)
        native = protocol.handle(
            'hyperbolic-patch',
            {'source': source, 'epoch': page.get('epoch', 0), 'depth': 0, 'anchor': _native_anchor(anchor)},
        )
        expected_hash = protocol._hash({'nativeAnchorHash': native['anchorHash'], 'anchor': anchor})
        if page.get('anchorHash') != expected_hash:
            raise GeometryError('Retained anchor hash mismatch.')
        for cell in page.get('instances', []):
            cell['matrix'] = (frame @ _developed_frame(cell['matrix'])).ravel().tolist()
        page['anchorHash'] = native['anchorHash']
        receipt = protocol.handle(
            'hyperbolic-validate', {'source': source, 'descriptor': {**model, 'anchorPatch': page}}
        )
    else:
        domain = model.get('pinnedDomain')
        if not isinstance(domain, dict):
            raise GeometryError('Small-cover documents require their pinned domain.')
        analysis = _analysis(domain)
        if not analysis['pass']:
            raise GeometryError('Invalid pinned small-cover domain.')
        expected = manifold.develop_patch(
            anchor['quotientState'], anchor['localPose'], depth=0, source=source, epoch=page.get('epoch', 0)
        )
        if (
            page.get('sourceHash') != expected['sourceHash']
            or page.get('anchorHash') != expected['anchorHash']
            or page.get('templates') != expected['templates']
        ):
            raise GeometryError('Retained manifold source/anchor/template mismatch.')
        if not isinstance(page.get('instances'), list) or not 1 <= len(page['instances']) <= 256:
            raise GeometryError('Invalid retained manifold instances.')
        template = np.asarray(expected['templates'][0]['vertices'])
        generators = [reflection_matrix(n) for n in expected['templates'][0]['facePlanes']]
        inverse = _inverse(np.asarray(anchor['localPose']).reshape(4, 4))
        from .hyperbolic import matrix_discrepancy, point_metric_residual

        retained_cells = {}
        for cell in page['instances']:
            if (
                not isinstance(cell, dict)
                or type(cell.get('id')) is not int
                or not 0 <= cell['id'] < 4096
                or cell['id'] in retained_cells
            ):
                raise GeometryError('Invalid retained manifold instance identity.')
            word = cell.get('word')
            if (
                not isinstance(word, list)
                or len(word) > 256
                or any(type(f) is not int or not 0 <= f < 12 for f in word)
            ):
                raise GeometryError('Invalid retained manifold word.')
            matrix, g = np.eye(4), anchor['quotientState']
            data = manifold.load_data()
            for face in word:
                matrix = matrix @ generators[face]
                g ^= manifold._bits(data['lambda'][face])
            matrix = inverse @ matrix
            retained = _developed_frame(cell.get('matrix'))
            if (
                cell.get('type') != manifold.KEY
                or cell.get('quotientState') != g
                or matrix_discrepancy(matrix, retained)['relative'] > 1e-12
                or point_metric_residual((retained @ template.T).T)['relative'] > 1e-12
            ):
                raise GeometryError('Retained manifold geometry disagrees with its word/state.')
            retained_cells[cell['id']] = (retained, g)
        _validate_manifold_neighbors(page, retained_cells, expected['templates'][0], generators)
        receipt = {'valid': True, 'analysis': analysis, 'coverageReceiptTrusted': False}
    return receipt


def _validate_manifold_neighbors(page, cells, template, generators):
    from .hyperbolic import point_discrepancy

    rows = page.get('neighbors')
    if not isinstance(rows, list) or len(rows) > 3072:
        raise GeometryError('Invalid retained manifold neighbors.')
    seen = set()
    vertices = np.asarray(template['vertices'])
    data = manifold.load_data()
    for row in rows:
        if not isinstance(row, dict):
            raise GeometryError('Invalid retained manifold neighbor.')
        cell, face, target, to_face = (row.get(k) for k in ('cell', 'face', 'toCell', 'toFace'))
        if (
            type(cell) is not int
            or cell not in cells
            or type(face) is not int
            or not 0 <= face < 12
            or (cell, face) in seen
        ):
            raise GeometryError('Invalid retained manifold face identity.')
        seen.add((cell, face))
        g = cells[cell][1] ^ manifold._bits(data['lambda'][face])
        if row.get('quotientState') != g:
            raise GeometryError('Retained manifold neighbor state/boundary mismatch.')
        permutation = row.get('vertexPermutation')
        legacy = 'templatePermutation' in row
        if legacy:
            permutation = row['templatePermutation']
            face_permutation = row.get('vertexPermutation')
            if (
                type(to_face) is not int
                or not 0 <= to_face < 12
                or not isinstance(permutation, list)
                or sorted(permutation) != list(range(20))
                or not isinstance(face_permutation, list)
                or sorted(face_permutation) != list(range(5))
                or row.get('unexpanded') != (target is None)
                or [permutation[v] for v in template['faces'][face]]
                != [template['faces'][to_face][i] for i in face_permutation]
            ):
                raise GeometryError('Retained manifold face/template permutations disagree.')
        if target is None:
            if not legacy and (
                to_face is not None or permutation is not None or row.get('status') not in ('unexpanded', 'outsideBall')
            ):
                raise GeometryError('Invalid retained manifold boundary.')
            continue
        if (
            type(target) is not int
            or not 0 <= target < 4096
            or type(to_face) is not int
            or not 0 <= to_face < 12
            or not isinstance(permutation, list)
            or any(type(i) is not int for i in permutation)
            or sorted(permutation) != list(range(20))
        ):
            raise GeometryError('Invalid retained manifold face permutation.')
        if {permutation[v] for v in template['faces'][face]} != set(template['faces'][to_face]):
            raise GeometryError('Retained manifold face/template permutations disagree.')
        if target in cells:
            if cells[target][1] != g:
                raise GeometryError('Retained manifold neighbor target mismatch.')
            a = (cells[cell][0] @ generators[face] @ vertices.T).T
            b = (cells[target][0] @ vertices[permutation].T).T
            if point_discrepancy(a, b)['relative'] > 1e-12:
                raise GeometryError('Retained manifold neighbor geometry mismatch.')


def validate_view(model, view):
    protocol._bounded_json(view, 256 * 1024)
    if (
        not isinstance(view, dict)
        or view.get('hyperbolicModel', 'poincare') not in ('poincare', 'klein')
        or view.get('hyperbolicLod', 'normal') not in ('coarse', 'normal', 'fine')
        or view.get('mode', 'overview') not in ('overview', 'explore')
    ):
        raise GeometryError('Unsupported hyperbolic display state.')
    _frame(view.get('observerMatrix', IDENTITY), proper=True)
    if view.get('anchor') is not None and _anchor(view['anchor'], model['source']) != _anchor(
        model.get('anchor'), model['source']
    ):
        raise GeometryError('Saved view anchor disagrees with retained geometry.')
    for key in ('net', 'cellNet', 'dualMorph', 'animation', 'elementVisibility'):
        if view.get(key):
            raise GeometryError('Euclidean presentation is unavailable for hyperbolic documents.')
    return view


def recipe_source(parameters):
    """Start a new hyperbolic recipe inside the same isolated native request."""
    import uuid

    if parameters.get('cursor') is not None:
        raise GeometryError('Hyperbolic creation starts a new generation.')
    model = handle('hyperbolic-create', {**parameters, 'depth': 0})
    view = {
        'hyperbolicModel': 'poincare',
        'hyperbolicLod': 'normal',
        'mode': 'overview',
        'observerMatrix': IDENTITY,
        'anchor': model['anchor'],
    }
    return {
        'id': str(uuid.uuid4()),
        'cursor': 0,
        'states': [{'model': model, 'view': view, 'label': 'Hyperbolic source', 'notes': ''}],
    }
