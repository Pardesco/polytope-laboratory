"""Symmetric end relief for rectangular dihedral hinge strips; physical mm."""

import csv
import io
import numpy as np

from .automatic_faceting import _hash
from .geometry import GeometryError
from .net_fabrication import _context, _number, _paper, _svg, _text
from .net_reinforcement import _stop

POLICY = 'symmetric-end-setback-v1'


def _pages(parts, paper, cancelled):
    w, h, m = _paper(paper)
    pages = []
    placements = []
    body = ''
    x = m
    y = m
    row = 0

    def flush():
        nonlocal body, placements
        if body:
            pages.append(
                {
                    'kind': 'hinge-strips',
                    'placements': placements,
                    'svg': _svg(w, h, body, 'Dihedral hinge strips; mm; print at 100%'),
                }
            )
        body = ''
        placements = []

    for part in parts:
        _stop(cancelled)
        length = part['cutLengthMm']
        width = part['widthMm']
        notes = [
            f"{part['id']} / {part['matchId']}: {' + '.join(part['adjacentFaces'])}",
            f"Cut {length:.8g} x {width:.8g} mm; ends -{part['endSetbackMm']:.8g} mm each.",
            f"Interior {part['dihedralDegrees']:.8g} deg; {part['fold']}.",
            'Score center; glue labeled halves inside faces.',
        ]
        pw = max(length + 8, max(map(len, notes)) * 1.35 + 4)
        ph = width + 28
        if pw > w - 2 * m or ph > h - 2 * m:
            raise GeometryError(
                f"{part['id']} does not fit the paper at physical scale; choose larger paper. No scaling applied."
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
        shift = np.array([x + 4, y + 5])
        q = np.asarray(part['pointsMm']) + shift
        attrs = f'data-part-id="{part["id"]}" data-source-edge-id="{part["sourceEdgeId"]}"'
        body += (
            f'<polygon {attrs} points="'
            + ' '.join(f'{a:.12g},{b:.12g}' for a, b in q)
            + '" fill="none" stroke="black" stroke-width="0.2"/>'
        )
        a, b = np.asarray(part['scoreSegmentMm']) + shift
        body += f'<line {attrs} data-role="score" x1="{a[0]:.12g}" y1="{a[1]:.12g}" x2="{b[0]:.12g}" y2="{b[1]:.12g}" stroke="black" stroke-width="0.2" stroke-dasharray="1 1"/>'
        for fraction, label in zip((0.25, 0.75), part['adjacentFaces']):
            text = part['matchId'] + ' ' + label
            size = min(2.5, width / 6, length * 0.7 / (len(text) * 0.62))
            body += _text(x + 4 + length / 2, y + 5 + width * fraction, text, size, True)
        for j, note in enumerate(notes):
            body += _text(x + 2, y + width + 10 + j * 4, note)
        placements.append(
            {
                'partId': part['id'],
                'sourceEdgeId': part['sourceEdgeId'],
                'translationMm': shift.tolist(),
                'angleDegrees': 0,
            }
        )
        x += pw + 5
        row = max(row, ph)
    flush()
    if len(pages) > 250:
        raise GeometryError('Hinge strips exceed 250 paper pages; choose larger paper.')
    return pages


def hinge_strip_allowance(source, net_parameters, options=None, paper=None, *, cancelled=None):
    options = {} if options is None else options
    paper = {} if paper is None else paper
    if type(options) is not dict or set(options) - {'end_setback_mm', 'strip_width_mm'}:
        raise GeometryError('Hinge strip allowance accepts end_setback_mm and strip_width_mm only.')
    setback = _number(options.get('end_setback_mm', 2), 0, 100, 'End setback (mm)')
    width = _number(options.get('strip_width_mm', 10), 1, 100, 'Strip width (mm)')
    if type(source) is not dict or source.get('interpretation') != 'convex-polytope':
        raise GeometryError(
            'End-relieved hinge strips require a closed convex 3D shell; generalized, coincident-edge and nonmanifold assemblies are unsupported.'
        )
    src, net, points, faces, edges = _context(source, net_parameters, cancelled)
    parts = []
    residual = 0.0
    flat = {f['id']: f for f in net['faces']}
    for edge in edges:
        _stop(cancelled)
        length = edge['lengthMm']
        cut = length - 2 * setback
        a, b = edge['vertices']
        if cut <= max(1e-7, length * 1e-8):
            raise GeometryError(
                f"{edge['label']}: end setback collapses the hinge strip; require 2 x setback < edge length. No clipping applied."
            )
        if edge['dihedralDegrees'] is None:
            raise GeometryError(f"{edge['label']}: an oriented interior dihedral is required.")
        direction = (points[b] - points[a]) / length
        source_segment = [(points[a] + direction * setback).tolist(), (points[b] - direction * setback).tolist()]
        segments = []
        owners = []
        for face in faces:
            if a not in face['vertices'] or b not in face['vertices']:
                continue
            fi = face['id']
            record = flat[fi]
            if not any(e['id'] == edge['id'] for e in record['edges']):
                continue
            q = np.asarray(record['points'])
            pa = q[face['vertices'].index(a)]
            pb = q[face['vertices'].index(b)]
            unit = (pb - pa) / length
            start = pa + unit * setback
            end = pb - unit * setback
            residual = max(residual, abs(float(np.linalg.norm(end - start)) - cut))
            owners.append(fi)
            segments.append(
                {
                    'sourceFaceId': fi,
                    'faceLabel': face['label'],
                    'component': record['component'],
                    'componentRoot': net['components'][record['component']]['root'],
                    'pointsMm': [start.tolist(), end.tolist()],
                }
            )
        parts.append(
            {
                'id': f'H-E{edge["id"]}',
                'matchId': edge['label'],
                'sourceEdgeId': edge['id'],
                'sourceVertexIds': [a, b],
                'sourceFaceIds': owners,
                'adjacentFaces': edge['adjacentFaces'],
                'sourceLengthMm': length,
                'endSetbackMm': setback,
                'cutLengthMm': cut,
                'widthMm': width,
                'cutPerimeterMm': 2 * (cut + width),
                'scoreLengthMm': cut,
                'pointsMm': [[0, 0], [cut, 0], [cut, width], [0, width]],
                'scoreSegmentMm': [[0, width / 2], [cut, width / 2]],
                'sourceScoreSegmentMm': source_segment,
                'netScoreSegments': segments,
                'dihedralDegrees': edge['dihedralDegrees'],
                'fold': edge['fold'],
                'netHinge': edge['netHinge'],
            }
        )
    if residual > 1e-7 * max(1, net['referenceEdgeLengthMm']):
        raise GeometryError('Trimmed hinge attachment residual exceeds the physical-mm tolerance.')
    pages = _pages(parts, paper, cancelled)
    w, h, _ = _paper(paper)
    source_hash = _hash(src)
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(
        [
            'policy',
            'source_hash',
            'part_id',
            'match_id',
            'source_edge_id',
            'source_vertex_ids',
            'source_face_ids',
            'adjacent_faces',
            'reference_e0_mm',
            'source_length_mm',
            'end_setback_mm',
            'cut_length_mm',
            'width_mm',
            'cut_perimeter_mm',
            'score_length_mm',
            'interior_dihedral_deg',
            'fold',
            'net_hinge',
        ]
    )
    for part in parts:
        writer.writerow(
            [
                POLICY,
                source_hash,
                part['id'],
                part['matchId'],
                part['sourceEdgeId'],
                ';'.join(map(str, part['sourceVertexIds'])),
                ';'.join(map(str, part['sourceFaceIds'])),
                ';'.join(part['adjacentFaces']),
                *[
                    format(value, '.17g')
                    for value in (
                        net['referenceEdgeLengthMm'],
                        part['sourceLengthMm'],
                        setback,
                        part['cutLengthMm'],
                        width,
                        part['cutPerimeterMm'],
                        part['scoreLengthMm'],
                        part['dihedralDegrees'],
                    )
                ],
                part['fold'],
                part['netHinge'],
            ]
        )
    svg = _svg(
        w,
        h * len(pages),
        ''.join(
            f'<svg y="{i * h:.12g}" width="{w:.12g}" height="{h:.12g}" viewBox="0 0 {w:.12g} {h:.12g}">'
            + page['svg'].split('>', 1)[1]
            for i, page in enumerate(pages)
        ),
        'End-relieved hinge strip sheets; mm',
    )
    _stop(cancelled)
    return {
        'policy': POLICY,
        'sourceHash': source_hash,
        'units': 'mm',
        'contentScale': 1,
        'referenceEdgeLengthMm': net['referenceEdgeLengthMm'],
        'parts': parts,
        'pages': pages,
        'svg': svg,
        'csv': output.getvalue(),
        'numericMode': 'float64-approximate',
        'maxEdgeFlatteningResidualMm': net['fabricationResidualMm'],
        'maxAttachmentResidualMm': residual,
        'totalCutLengthMm': sum(p['cutPerimeterMm'] for p in parts),
        'totalScoreLengthMm': sum(p['scoreLengthMm'] for p in parts),
        'sourceNetOverlap': net['hasOverlap'],
        'sourceNetTabOverlap': net['hasTabOverlap'],
        'limits': [
            'Symmetric end setback is a user chosen corner clearance, not thickness or kerf compensation.',
            'One rectangular strip per source edge; glue the labeled halves inside its two source faces.',
            'Net attachment segments identify placement; no collision, joint strength or physical fit certificate.',
            'Convex intrinsic 3D closed shells only. Print at 100% and calibrate on paper.',
        ],
    }
