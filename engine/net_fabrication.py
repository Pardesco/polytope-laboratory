"""Bounded, approximate paper reinforcement patterns and physical-mm cut lists."""

import csv
import io
import math
from html import escape
import numpy as np

from .automatic_faceting import _hash
from .automatic_faceting_workflow import _portable, _structured
from .geometry import GeometryError
from .generalized_nets import unfold_source, _shell_geometry, _simple, _signed_area, _touch, _triangles_cached
from .net_paper_ux import piece_numbers, edge_labels
from .net_printing import pack_net
from .net_reinforcement import NET_KEYS, _stop


def _number(value, low, high, name):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise GeometryError(f'{name} requires a finite number from {low} to {high}.')
    return float(value)


def inset_polygon(points, margin):
    """Simple miter inset; refuse topology changes rather than repairing by hull."""
    margin = _number(margin, 0.01, 100, 'Brace margin (mm)')
    p = np.asarray(points, dtype=float)
    _simple(p, 'brace source')
    sign = 1 if _signed_area(p) > 0 else -1
    vectors = np.roll(p, -1, axis=0) - p
    lengths = np.linalg.norm(vectors, axis=1)
    u = vectors / lengths[:, None]
    normals = sign * np.column_stack((-u[:, 1], u[:, 0]))
    q = []
    for i in range(len(p)):
        matrix = np.array([normals[i - 1], normals[i]])
        if abs(np.linalg.det(matrix)) < 1e-10:
            if normals[i - 1] @ normals[i] < 0:
                raise GeometryError('Brace offset has a reversing corner.')
            shift = normals[i] * margin
        else:
            shift = np.linalg.solve(matrix, [margin, margin])
        q.append(p[i] + shift)
    q = np.asarray(q)
    _simple(q, 'brace offset')

    def inside(point):
        x, y = point
        crossings = 0
        for a, b in zip(p, np.roll(p, -1, axis=0)):
            if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                crossings += 1
        return crossings % 2 == 1

    def distance(a, b, c):
        v = c - b
        t = np.clip((a - b) @ v / (v @ v), 0, 1)
        return float(np.linalg.norm(a - b - t * v))

    minimum = math.inf
    for i, (a, b) in enumerate(zip(q, np.roll(q, -1, axis=0))):
        if (b - a) @ u[i] <= 1e-8 or not inside(a):
            raise GeometryError('Brace margin collapses or splits the face; reduce the margin.')
        for c, d in zip(p, np.roll(p, -1, axis=0)):
            if _touch(a, b, c, d):
                raise GeometryError('Brace margin crosses the source boundary; reduce the margin.')
            minimum = min(minimum, distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b))
    if (
        sign * _signed_area(q) <= 0
        or abs(_signed_area(q)) >= abs(_signed_area(p))
        or minimum < margin - 1e-7 * max(1, margin)
    ):
        raise GeometryError('Brace margin changes face topology or clearance; reduce the margin.')
    return q, minimum


def _context(source, params, cancelled):
    _stop(cancelled)
    source = _portable(source, 16 * 1024 * 1024)
    if type(params) is not dict or set(params) - NET_KEYS:
        raise GeometryError('Use supported net layout parameters.')
    if (
        type(source) is not dict
        or source.get('dimension') != 3
        or source.get('embeddingDimension', 3) != 3
        or len(source.get('vertices', [])) > 512
    ):
        raise GeometryError('Fabrication requires a closed intrinsic 3D shell with at most 512 vertices.')
    if 'edge_length_mm' in params:
        _number(params['edge_length_mm'], 1, 1000, 'E0 length (mm)')
    if 'tabs' in params and type(params['tabs']) is not bool:
        raise GeometryError('Net tabs require a boolean.')
    _, normals, _ = _shell_geometry(source)
    net = unfold_source(source, **params)
    points = np.asarray(net['targetVertices'])
    numbers = piece_numbers(net)
    face_records = {f['id']: f for f in net['faces']}
    labels = {fi: f'P{numbers[f["component"]]}/F{fi}' for fi, f in face_records.items()}
    incidence = {i: [] for i in range(len(source['edges']))}
    lookup = {tuple(sorted(e)): i for i, e in enumerate(source['edges'])}
    faces = []
    for fi, cycle in enumerate(source['faces']):
        _stop(cancelled)
        flat = np.asarray(face_records[fi]['points'])
        sign = 1 if _signed_area(flat) > 0 else -1
        angles = []
        sides = []
        for j, (a, b) in enumerate(zip(cycle, cycle[1:] + cycle[:1])):
            ei = lookup[tuple(sorted((a, b)))]
            incidence[ei].append(fi)
            sides.append(float(np.linalg.norm(points[b] - points[a])))
            left = flat[j - 1] - flat[j]
            right = flat[(j + 1) % len(flat)] - flat[j]
            angle = math.degrees(
                math.acos(float(np.clip(left @ right / np.linalg.norm(left) / np.linalg.norm(right), -1, 1)))
            )
            angles.append(360 - angle if sign * float(np.linalg.det(np.array([-left, right]))) < 0 else angle)
        faces.append(
            {
                'id': fi,
                'label': labels[fi],
                'vertices': cycle,
                'polygon': f'{len(cycle)}-gon',
                'sideLengthsMm': sides,
                'anglesDegrees': angles,
            }
        )
    edges = []
    for ei, (a, b) in enumerate(source['edges']):
        fa, fb = incidence[ei]
        bend = math.degrees(math.acos(float(np.clip(normals[fa] @ normals[fb], -1, 1))))
        fold = net['foldTypes'].get(str(ei), 'unknown')
        angle = None if fold == 'unknown' else 180 + bend if fold == 'mountain' else 180 - bend
        edges.append(
            {
                'id': ei,
                'label': f'E{ei}',
                'vertices': [a, b],
                'lengthMm': float(np.linalg.norm(points[b] - points[a])),
                'adjacentFaces': [labels[fa], labels[fb]],
                'dihedralDegrees': angle,
                'fold': fold,
                'netHinge': ei in net['hinges'],
            }
        )
    residual = max(
        abs(
            float(
                np.linalg.norm(
                    np.asarray(flat['points'])[j] - np.asarray(flat['points'])[(j + 1) % len(face['vertices'])]
                )
            )
            - length
        )
        for face, flat in zip(faces, net['faces'])
        for j, length in enumerate(face['sideLengthsMm'])
    )
    net['fabricationResidualMm'] = residual
    return source, net, points, faces, edges


def _svg(width, height, body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.12g}mm" height="{height:.12g}mm" viewBox="0 0 {width:.12g} {height:.12g}"><title>{escape(title)}</title>{body}</svg>'


def _text(x, y, text, size=2.5, center=False):
    anchor = ' text-anchor="middle" dominant-baseline="middle"' if center else ''
    return f'<text x="{x:.12g}" y="{y:.12g}" font-size="{size:.12g}" fill="black"{anchor}>{escape(str(text))}</text>'


def _inside_label(points, label):
    candidates = []
    for triangle in _triangles_cached(tuple(map(tuple, points))):
        lengths = np.linalg.norm(np.roll(triangle, -1, axis=0) - np.roll(triangle, -2, axis=0), axis=1)
        center = np.sum(triangle * lengths[:, None], axis=0) / sum(lengths)
        radius = 2 * abs(_signed_area(triangle)) / sum(lengths)
        candidates.append((radius, center))
    radius, center = max(candidates, key=lambda item: item[0])
    return center, min(2.5, radius * 0.7 / max(len(label) * 0.32, 0.7))


def _line(a, b, dashed=False):
    return (
        f'<line x1="{a[0]:.12g}" y1="{a[1]:.12g}" x2="{b[0]:.12g}" y2="{b[1]:.12g}" stroke="black" stroke-width="0.2"'
        + (' stroke-dasharray="1 1"' if dashed else '')
        + '/>'
    )


def _polygon(points):
    return (
        '<polygon points="'
        + ' '.join(f'{x:.12g},{y:.12g}' for x, y in points)
        + '" fill="none" stroke="black" stroke-width="0.2"/>'
    )


def _paper(paper):
    if type(paper) is not dict or set(paper) - {'width_mm', 'height_mm', 'margin_mm'}:
        raise GeometryError('Paper accepts width_mm/height_mm/margin_mm only.')
    w = _number(paper.get('width_mm', 210), 60, 2000, 'Paper width')
    h = _number(paper.get('height_mm', 297), 60, 2000, 'Paper height')
    m = _number(paper.get('margin_mm', 10), 0, min(w, h) / 2 - 10, 'Paper margin')
    return w, h, m


def _part_pages(parts, paper, cancelled):
    w, h, m = _paper(paper)
    pages = []
    body = ''
    x = m
    y = m
    row = 0

    def flush():
        nonlocal body
        if body:
            pages.append({'kind': 'reinforcement', 'svg': _svg(w, h, body, 'Reinforcement parts; mm; print at 100%')})
            body = ''

    for part in parts:
        _stop(cancelled)
        p = np.asarray(part['pointsMm'])
        lo = p.min(axis=0)
        extent = np.ptp(p, axis=0)
        lines = part['notes']
        pw = max(extent[0] + 8, max(map(len, lines), default=1) * 1.35 + 8)
        ph = extent[1] + 12 + len(lines) * 4
        if pw > w - 2 * m or ph > h - 2 * m:
            raise GeometryError(
                f'{part["label"]} does not fit the paper at physical scale. Choose larger paper or smaller E0; no scaling applied.'
            )
        if x + pw > w - m:
            x = m
            y += row + 5
            row = 0
        if y + ph > h - m:
            flush()
            x = m
            y = m
            row = 0
        shift = np.array([x + 4, y + 6]) - lo
        q = p + shift
        body += _text(x + 2, y + 3, part['label']) + ('' if part.get('noOutline') else _polygon(q))
        for line in part.get('lines', []):
            body += _line(np.asarray(line[0]) + shift, np.asarray(line[1]) + shift, line[2])
        for point, label, size in part.get('pointLabels', []):
            body += _text(*(np.asarray(point) + shift), label, size, True)
        for j, line in enumerate(lines):
            body += _text(x + 2, y + extent[1] + 12 + j * 4, line)
        x += pw + 5
        row = max(row, ph)
    flush()
    return pages


def _hubs(source, points, edges, radius, cancelled):
    hubs = []
    types = {}
    for vi, point in enumerate(points):
        _stop(cancelled)
        incident = [e for e in edges if vi in e['vertices']]
        directions = []
        for e in incident:
            other = next(v for v in e['vertices'] if v != vi)
            d = points[other] - point
            directions.append(d / np.linalg.norm(d))
        d = np.asarray(directions)
        normal = -d.sum(axis=0)
        if np.linalg.norm(normal) < 1e-8:
            raise GeometryError(f'Hub V{vi} has no stable mean direction; rosette projection is unsupported.')
        normal /= np.linalg.norm(normal)
        x = d[0] - normal * (d[0] @ normal)
        if np.linalg.norm(x) < 1e-8:
            raise GeometryError(f'Hub V{vi} has a singular projection axis.')
        x /= np.linalg.norm(x)
        y = np.cross(normal, x)
        pairs = []
        spokes = []
        for i, e in enumerate(incident):
            az = math.degrees(math.atan2(float(d[i] @ y), float(d[i] @ x)))
            elevation = math.degrees(math.asin(float(np.clip(d[i] @ normal, -1, 1))))
            spokes.append(
                {'edge': e['label'], 'direction3D': d[i].tolist(), 'azimuthDegrees': az, 'elevationDegrees': elevation}
            )
            for j in range(i):
                pairs.append(
                    {
                        'edges': [incident[j]['label'], e['label']],
                        'angleDegrees': math.degrees(math.acos(float(np.clip(d[i] @ d[j], -1, 1)))),
                    }
                )
        signature = (
            len(incident),
            tuple(sorted(round(p['angleDegrees'], 6) for p in pairs)),
            tuple(sorted(round(e['lengthMm'], 6) for e in incident)),
        )
        if signature not in types:
            types[signature] = len(types) + 1
        hubs.append(
            {
                'vertex': vi,
                'label': f'V{vi} / H{types[signature]}',
                'type': types[signature],
                'spokes': spokes,
                'pairAngles': pairs,
                'frame': {'x': x.tolist(), 'y': y.tolist(), 'normal': normal.tolist()},
                'radiusMm': radius,
            }
        )
    return hubs


def reinforcement_parts(source, net_parameters, options=None, paper=None, include_net=False, cancelled=None):
    options = {} if options is None else options
    if type(options) is not dict or set(options) - {
        'braces',
        'hinges',
        'hubs',
        'margin_mm',
        'strip_width_mm',
        'hub_radius_mm',
    }:
        raise GeometryError('Unsupported reinforcement options.')
    if (
        any(type(options.get(k, True)) is not bool for k in ('braces', 'hinges', 'hubs'))
        or type(include_net) is not bool
    ):
        raise GeometryError('Choose boolean reinforcement families and include-net option.')
    margin = _number(options.get('margin_mm', 2), 0.01, 100, 'Brace margin')
    width = _number(options.get('strip_width_mm', 10), 1, 100, 'Strip width')
    radius = _number(options.get('hub_radius_mm', 12), 3, 100, 'Hub radius')
    paper = {} if paper is None else paper
    w, h, m = _paper(paper)
    src, net, points, faces, edges = _context(source, net_parameters, cancelled)
    parts = []
    braces = []
    strips = []
    hubs = []
    if options.get('braces', True):
        for face, flat in zip(faces, net['faces']):
            _stop(cancelled)
            try:
                q, clearance = inset_polygon(flat['points'], margin)
            except GeometryError as exc:
                raise GeometryError(f'{face["label"]}: {exc}') from exc
            record = {
                'face': face['id'],
                'label': 'Brace ' + face['label'],
                'pointsMm': q.tolist(),
                'minimumClearanceMm': clearance,
                'marginMm': margin,
                'sourceEdgeIds': [e['id'] for e in flat['edges']],
            }
            center, size = _inside_label(q, face['label'])
            labels = [[center.tolist(), face['label'], size]]
            positions = edge_labels(q, [{'id': e['id'], 'hinge': False} for e in flat['edges']])
            labels += [
                [entry['center'].tolist(), f'E{flat["edges"][i]["id"]}', entry['size']]
                for i, entry in positions.items()
            ]
            braces.append(record)
            parts.append(
                {**record, 'notes': [f'Inset {margin:g} mm; glue inside {face["label"]}.'], 'pointLabels': labels}
            )
    if options.get('hinges', True):
        for edge in edges:
            if edge['dihedralDegrees'] is None:
                raise GeometryError(f'{edge["label"]}: shell fold orientation is unknown; hinge angle unavailable.')
            length = edge['lengthMm']
            p = [[0, 0], [length, 0], [length, width], [0, width]]
            gauge = np.array(
                [
                    [0, 0],
                    [width, 0],
                    [
                        width * math.cos(math.radians(edge['dihedralDegrees'])),
                        width * math.sin(math.radians(edge['dihedralDegrees'])),
                    ],
                ]
            )
            gauge[:, 1] += width + 3 - gauge[:, 1].min()
            # Include the angle-gauge extents in packing; its two rays are guides, not cuts.
            low = np.minimum([0, 0], gauge.min(axis=0))
            high = np.maximum([length, width], gauge.max(axis=0))
            record = {
                'edge': edge['id'],
                'label': 'Hinge ' + edge['label'],
                'dihedralDegrees': edge['dihedralDegrees'],
                'fold': edge['fold'],
                'widthMm': width,
                'lengthMm': length,
                'pointsMm': p,
                'gaugePointsMm': gauge.tolist(),
            }
            strips.append(record)
            parts.append(
                {
                    'label': record['label'],
                    'pointsMm': [low.tolist(), [high[0], low[1]], high.tolist(), [low[0], high[1]]],
                    'notes': [
                        f'{" + ".join(edge["adjacentFaces"])}',
                        f'{edge["dihedralDegrees"]:.6g} deg interior; {edge["fold"]}.',
                        'Score center; set angle with gauge; glue halves.',
                    ],
                    'lines': [[p[i], p[(i + 1) % 4], False] for i in range(4)]
                    + [
                        [[0, width / 2], [length, width / 2], True],
                        [gauge[0].tolist(), gauge[1].tolist(), True],
                        [gauge[0].tolist(), gauge[2].tolist(), True],
                    ],
                    'pointLabels': [
                        [
                            [length / 2, width * fraction],
                            edge['label'] + ' ' + label,
                            min(2.5, width / 6, length * 0.7 / (len(edge['label'] + ' ' + label) * 0.62)),
                        ]
                        for fraction, label in zip((0.25, 0.75), edge['adjacentFaces'])
                    ],
                    'noOutline': True,
                }
            )
    if options.get('hubs', True):
        hubs = _hubs(src, points, edges, radius, cancelled)
        for hub in hubs:
            theta = np.arange(32) * 2 * math.pi / 32
            q = np.column_stack((np.cos(theta), np.sin(theta))) * radius
            lines = []
            labels = []
            notes = ['Direction template: azimuth / elevation (deg).']
            for spoke in hub['spokes']:
                angle = math.radians(spoke['azimuthDegrees'])
                end = (radius * 0.78 * np.array([math.cos(angle), math.sin(angle)])).tolist()
                lines.append([[0, 0], end, True])
                labels.append([end, spoke['edge'], 2])
                notes.append(f'{spoke["edge"]}: {spoke["azimuthDegrees"]:.5g} / {spoke["elevationDegrees"]:.5g}')
            notes += ['True 3D angles (deg):'] + [
                f'{" / ".join(p["edges"])}: {p["angleDegrees"]:.7g}' for p in hub['pairAngles']
            ]
            labels.append([[0, 0], hub['label'], min(2.5, radius * 0.8 / len(hub['label']))])
            parts.append(
                {'label': hub['label'], 'pointsMm': q.tolist(), 'notes': notes, 'lines': lines, 'pointLabels': labels}
            )
    if not parts:
        raise GeometryError('Select at least one reinforcement family.')
    pages = _part_pages(parts, paper, cancelled)
    if include_net:
        packed = pack_net(net, paper='custom', width_mm=w, height_mm=h, margin_mm=m)
        pages = [{'kind': 'net', 'svg': p['svg']} for p in packed['pages']] + pages
    if len(pages) > 250:
        raise GeometryError('Reinforcement output exceeds 250 pages; choose fewer families or larger paper.')
    # A standalone SVG preserves separate paper viewports in a vertical sheet stack.
    svg = _svg(
        w,
        h * len(pages),
        ''.join(
            f'<svg y="{i * h:.12g}" width="{w:.12g}" height="{h:.12g}" viewBox="0 0 {w:.12g} {h:.12g}">'
            + p['svg'].split('>', 1)[1]
            for i, p in enumerate(pages)
        ),
        'Net and reinforcement sheets; mm',
    )
    _stop(cancelled)
    return {
        'sourceHash': _hash(src),
        'units': 'mm',
        'contentScale': 1,
        'referenceEdgeLengthMm': net['referenceEdgeLengthMm'],
        'pages': pages,
        'svg': svg,
        'braces': braces,
        'hinges': strips,
        'hubs': hubs,
        'numericMode': 'float64-approximate',
        'limits': [
            'Miter insets refuse collapsed/split faces.',
            'Hinge strips require setting/gluing at the printed angle.',
            'Rosettes project directions; use printed elevations and true 3D angles. H types are metric signatures, not proven symmetry orbits.',
            'No material thickness, kerf, joint strength or mechanical fit qualification.',
        ],
        'sourceNetOverlap': net['hasOverlap'],
        'sourceNetTabOverlap': net['hasTabOverlap'],
        'maxEdgeFlatteningResidualMm': net['fabricationResidualMm'],
    }


def _cut_dxf(net, faces):
    lines = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']
    cursor = 0
    for face, flat in zip(faces, net['faces']):
        p = np.asarray(flat['points'])
        p = p - p.min(axis=0) + [cursor, 0]
        cursor = float(p[:, 0].max()) + 10
        for a, b in zip(p, np.roll(p, -1, axis=0)):
            lines += ['0', 'LINE', '8', 'CUT']
            for code, point in ((10, a), (11, b)):
                for axis, value in enumerate([*point, 0.0]):
                    lines += [str(code + 10 * axis), format(value, '.17g')]
        center = p.mean(axis=0)
        lines += [
            '0',
            'TEXT',
            '8',
            'LABELS',
            '10',
            format(center[0], '.17g'),
            '20',
            format(center[1], '.17g'),
            '30',
            '0',
            '40',
            '2.5',
            '1',
            face['label'],
        ]
        for edge, a, b in zip(flat['edges'], p, np.roll(p, -1, axis=0)):
            center = (a + b) / 2
            lines += [
                '0',
                'TEXT',
                '8',
                'LABELS',
                '10',
                format(center[0], '.17g'),
                '20',
                format(center[1], '.17g'),
                '30',
                '0',
                '40',
                '1.5',
                '1',
                f'E{edge["id"]}',
            ]
    return '\n'.join(lines + ['0', 'ENDSEC', '0', 'EOF']) + '\n'


def measurement_export(source, net_parameters, paper=None, cancelled=None):
    src, net, points, faces, edges = _context(source, net_parameters, cancelled)
    w, h, m = _paper({} if paper is None else paper)
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer)
    writer.writerow(
        [
            'entity',
            'label',
            'vertices',
            'polygon',
            'side_lengths_mm',
            'corner_angles_deg',
            'length_mm',
            'adjacent_faces',
            'dihedral_deg',
            'fold',
            'net_hinge',
        ]
    )
    lines = [
        'Physical mm at E0 = ' + format(net['referenceEdgeLengthMm'], '.9g') + ' mm; angles in degrees.',
        'Approximate float64; no thickness/kerf compensation. Print at 100%.',
        f'Max flattened-edge residual: {net["fabricationResidualMm"]:.3g} mm.',
        'Fold: printed-side convention (convex bends are valley).',
        'EDGE | LENGTH mm | ADJACENT P/F | INTERIOR deg | FOLD',
    ]
    for edge in edges:
        _stop(cancelled)
        angle = edge['dihedralDegrees']
        angle_text = '' if angle is None else format(angle, '.12g')
        writer.writerow(
            [
                'edge',
                edge['label'],
                ' '.join(map(str, edge['vertices'])),
                '',
                '',
                '',
                format(edge['lengthMm'], '.17g'),
                ';'.join(edge['adjacentFaces']),
                angle_text,
                edge['fold'],
                edge['netHinge'],
            ]
        )
        lines.append(
            f'{edge["label"]} | {edge["lengthMm"]:.9g} | {" + ".join(edge["adjacentFaces"])} | {angle_text or "unknown"} | {edge["fold"]}'
        )
    lines += ['FACE | POLYGON | SOURCE VERTICES; then side index: length mm / corner deg']
    # Long face cycles remain complete in CSV; PDF uses bounded per-vertex rows.
    for face in faces:
        writer.writerow(
            [
                'face',
                face['label'],
                ' '.join(map(str, face['vertices'])),
                face['polygon'],
                ';'.join(format(x, '.17g') for x in face['sideLengthsMm']),
                ';'.join(format(x, '.12g') for x in face['anglesDegrees']),
                '',
                '',
                '',
                '',
                '',
            ]
        )
        lines.append(face['label'] + ' | ' + face['polygon'])
        for j, (vertex, length, angle) in enumerate(
            zip(face['vertices'], face['sideLengthsMm'], face['anglesDegrees'])
        ):
            lines.append(f'  side {j} from V{vertex}: {length:.9g} mm / corner {angle:.9g} deg')
    # Wrap literal table text to paper width; never truncate values or face lists.
    columns = max(12, int((w - 2 * m) / 1.55))
    wrapped = []
    for line in lines:
        wrapped.extend(line[i : i + columns] for i in range(0, len(line), columns))
    capacity = max(1, int((h - 2 * m - 12) / 4))
    pages = []
    for start in range(0, len(wrapped), capacity):
        _stop(cancelled)
        body = _text(m, m + 4, f'Builder measurements / {len(pages) + 1}', 3)
        body += ''.join(_text(m, m + 10 + j * 4, line) for j, line in enumerate(wrapped[start : start + capacity]))
        pages.append({'kind': 'measurements', 'svg': _svg(w, h, body, 'Builder measurement table; mm and degrees')})
    if len(pages) > 250:
        raise GeometryError('Measurement table exceeds 250 pages; choose larger paper.')
    return {
        'units': 'mm',
        'angleUnit': 'degrees',
        'sourceHash': _hash(src),
        'referenceEdgeLengthMm': net['referenceEdgeLengthMm'],
        'edges': edges,
        'faces': faces,
        'csv': buffer.getvalue(),
        'dxf': _cut_dxf(net, faces),
        'pages': pages,
        'numericMode': 'float64-approximate',
        'maxEdgeFlatteningResidualMm': net['fabricationResidualMm'],
        'dihedralDefinition': 'Printed-side interior angle: 180 minus outward normal bend for valley, 180 plus bend for mountain; unknown for unoriented shells.',
        'limits': [
            'DXF faces are separate closed LINE loops on CUT; TEXT on LABELS. Units: mm ($INSUNITS=4). Disable LABELS when cutting.',
            'No kerf, material thickness or joint allowances. Nonconvex global shell intersections are not certified.',
        ],
    }


@_structured
def dispatch_fabrication(request, *, cancelled=None):
    original = request
    ownership = _hash(original)
    request = _portable(request, 32 * 1024 * 1024)
    if (
        type(request) is not dict
        or not {'op', 'model', 'params'} <= set(request)
        or set(request) - {'op', 'model', 'params', 'id'}
    ):
        raise GeometryError('Fabrication jobs require op/model/params.')
    p = request['params']
    if type(p) is not dict or 'netParameters' not in p:
        raise GeometryError('Fabrication requires netParameters.')
    if request['op'] == 'net-reinforcement-parts':
        if set(p) - {'netParameters', 'options', 'paper', 'include_net'}:
            raise GeometryError('Unsupported reinforcement job parameters.')
        result = reinforcement_parts(
            request['model'],
            p['netParameters'],
            p.get('options'),
            p.get('paper'),
            p.get('include_net', False),
            cancelled,
        )
    elif request['op'] == 'net-hinge-strip-allowance':
        from .hinge_strip_allowance import hinge_strip_allowance

        if set(p) - {'netParameters', 'options', 'paper'}:
            raise GeometryError('Unsupported hinge strip job parameters.')
        result = hinge_strip_allowance(
            request['model'], p['netParameters'], p.get('options'), p.get('paper'), cancelled=cancelled
        )
    elif request['op'] == 'net-measurement-export':
        if set(p) - {'netParameters', 'paper'}:
            raise GeometryError('Unsupported measurement export parameters.')
        result = measurement_export(request['model'], p['netParameters'], p.get('paper'), cancelled)
    else:
        raise GeometryError('Unsupported fabrication operation.')
    _stop(cancelled)
    if _hash(original) != ownership:
        raise GeometryError('Fabrication source ownership changed during computation.')
    return _portable(result, 32 * 1024 * 1024)
