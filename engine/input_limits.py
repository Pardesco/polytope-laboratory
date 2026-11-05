"""Import-only resource checks before geometry or JSON allocation."""
from functools import wraps
import json
import math
import re

import numpy as np

from .geometry import GeometryError, MAX_VERTICES

MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_ELEMENTS = 1_000_000
MAX_BOUNDARY = 1024
MAX_REFERENCES = 1_000_000
MAX_COORDINATE = 1e150  # existing scale tests reach ~1e99; squares stay finite below ~1e154
MAX_JSON_DEPTH = 64
MAX_JSON_ENTRIES = 1_000_000
MAX_OFF_LINES = 2_100_000
MAX_OFF_RECORD_CHARS = 16_384


def input_boundary(label):
    def decorate(operation):
        @wraps(operation)
        def checked(*args, **kwargs):
            try:
                return operation(*args, **kwargs)
            except GeometryError:
                raise
            except OSError as exc:
                raise GeometryError(f'{label}: {exc}') from exc
            except (ValueError, TypeError, KeyError, IndexError, AttributeError,
                    OverflowError, RecursionError, ZeroDivisionError, np.linalg.LinAlgError) as exc:
                raise GeometryError(f'{label}: malformed or unsupported input ({type(exc).__name__}).') from exc
        return checked
    return decorate


def bounded_text(text, label, limit=MAX_FILE_BYTES):
    if not isinstance(text, str):
        raise GeometryError(f'{label} requires UTF-8 text.')
    if len(text) > limit:
        raise GeometryError(f'{label} exceeds the {limit // (1024 * 1024)} MiB UTF-8 file limit.')
    try:
        size = len(text.encode('utf-8'))
    except UnicodeError as exc:
        raise GeometryError(f'{label} contains invalid Unicode; use valid UTF-8 text.') from exc
    if size > limit:
        raise GeometryError(f'{label} exceeds the {limit // (1024 * 1024)} MiB UTF-8 file limit.')
    return text.removeprefix('\ufeff')


def line_limit(text, maximum, label):
    separators = '\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029'
    count = sum(text.count(char) for char in separators) - text.count('\r\n')
    count += bool(text and text[-1] not in separators)
    if count > maximum:
        raise GeometryError(f'{label} exceeds the resource limit: at most {maximum:,} text lines.')


@input_boundary('JSON import')
def parse_json(text):
    text = bounded_text(text, 'JSON import')
    depth, quoted, escaped, entries = 0, False, False, 0
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in '[{':
            depth += 1
            entries += 1
            if depth > MAX_JSON_DEPTH:
                raise GeometryError(f'JSON import exceeds the {MAX_JSON_DEPTH}-level nesting limit.')
        elif char in ']}':
            depth -= 1
        elif char == ',':
            entries += 1
        if entries > MAX_JSON_ENTRIES:
            raise GeometryError(f'JSON import exceeds the {MAX_JSON_ENTRIES:,}-entry structural limit.')
    def constant(value):
        raise GeometryError(f'JSON import requires finite numbers; {value} is unsupported.')
    return json.loads(text, parse_constant=constant)


def rational_limits(table):
    if not isinstance(table, list) or len(table) > MAX_VERTICES:
        raise GeometryError('Imported rational coordinates/planes require a bounded array.')
    for row in table:
        if not isinstance(row, list) or not 2 <= len(row) <= 5:
            raise GeometryError('Imported rational coordinate/plane rows require 2–5 values.')
        for value in row:
            if type(value) not in (str, int, float):
                raise GeometryError('Imported rational values must be numeric literals.')
            literal = str(value)
            exponent = re.search(r'[eE]([+-]?\d+)', literal)
            if len(literal) > 256 or exponent and (len(exponent[1].lstrip('+-')) > 4 or abs(int(exponent[1])) > 1024):
                raise GeometryError('Imported rational literals are limited to 256 characters and exponent magnitude 1,024.')


def model_limits(model):
    if not isinstance(model, dict):
        raise GeometryError('Imported geometry must be a model object.')
    vertices = model.get('vertices')
    if not isinstance(vertices, list) or not 1 <= len(vertices) <= MAX_VERTICES:
        raise GeometryError(f'Import requires 1–{MAX_VERTICES:,} vertices.')
    for row in vertices:
        if not isinstance(row, list) or len(row) not in (2, 3, 4):
            raise GeometryError('Imported coordinates must be rectangular 2D, 3D or 4D numeric arrays.')
        for value in row:
            if type(value) not in (int, float) or not -MAX_COORDINATE <= value <= MAX_COORDINATE or not math.isfinite(value):
                raise GeometryError(f'OFF/JSON coordinates must be finite numbers within ±{MAX_COORDINATE:g}.')
    references = 0
    for key in ('edges', 'faces', 'cells'):
        rows = model.get(key, [] if key == 'cells' else None)
        if not isinstance(rows, list) or len(rows) > MAX_ELEMENTS:
            raise GeometryError(f'Import supports at most {MAX_ELEMENTS:,} {key}.')
        for row in rows:
            if not isinstance(row, list) or len(row) > MAX_BOUNDARY:
                raise GeometryError(f'Imported {key} require arrays of at most {MAX_BOUNDARY:,} indices per boundary.')
            references += len(row)
            if references > MAX_REFERENCES:
                raise GeometryError(f'Import exceeds the {MAX_REFERENCES:,} total incidence-reference limit per model.')
    for key in ('numeric', 'metadata', 'provenance'):
        if key in model and not isinstance(model[key], dict):
            raise GeometryError(f'Imported model {key} must be an object.')
    for key in ('rationalCoordinates', 'rationalFacetEquations'):
        if key in model:
            rational_limits(model[key])
    if model.get('numeric', {}).get('mode') == 'rational-exact':
        certificate = model.get('certificate')
        if not isinstance(certificate, dict):
            raise GeometryError('Exact model requires an input certificate object.')
        rational_limits(certificate.get('sourceCoordinates'))
    if model.get('interpretation') == 'convex-polytope':
        from .native_uniform_validation import native_uniform_measure
        if native_uniform_measure(model) is None:hull_budget(vertices)
    for piece in model.get('convexPieces', []):
        model_limits(piece)


def hull_budget(vertices):
    """Bound the optional importer hull's support scan and 4D ridge pairs."""
    from scipy.spatial import ConvexHull, QhullError
    from .geometry import rank
    points = np.asarray(vertices, dtype=float)
    scale = float(np.max(np.ptp(points, axis=0)))
    if not scale:
        return
    points = (points - points.mean(axis=0)) / scale
    if rank(points) != points.shape[1]:
        return
    # The upper bound on 4D simplices is quadratic; refuse before Qhull.
    if points.shape[1] == 4 and len(points) > 1024:
        raise GeometryError('Convex import verification supports at most 1,024 4D vertices; use generalized incidence.')
    try:
        candidate = ConvexHull(points)
    except QhullError:
        return  # The authoritative hull reports numerical degeneracy.
    if len(candidate.simplices) > 100_000:
        raise GeometryError('Convex import verification exceeds the 100,000 triangulated-facet limit.')
    equations = np.unique(candidate.equations, axis=0)
    if len(equations) * len(points) > 5_000_000:
        raise GeometryError('Convex import verification exceeds the 5,000,000 vertex/support comparison limit.')
    if points.shape[1] == 4:
        incidence = np.abs(points @ equations[:, :-1].T + equations[:, -1]) <= 1e-8
        counts = incidence.sum(axis=1)
        if sum(int(n) * (int(n) - 1) // 2 for n in counts) > 1_000_000:
            raise GeometryError('Convex import verification exceeds the 1,000,000 candidate facet-pair limit.')
