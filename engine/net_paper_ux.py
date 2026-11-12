"""Physical-mm piece arrangement and printed-side fold conventions."""

import math
import numpy as np


def piece_numbers(net):
    if net.get('pieceNumbers'):
        return {int(root): number for root, number in net['pieceNumbers'].items()}
    roots = sorted(c['root'] for c in net.get('components', [])) or sorted({f['component'] for f in net['faces']})
    return {root: i + 1 for i, root in enumerate(roots)}


def label_size(length, text):
    return min(2.8, length * 0.16, length * 0.72 / max(1, len(text) * 0.62))


def edge_labels(points, edges):
    from .nets import overlaps

    p = np.asarray(points)
    signed = np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1))
    used = []
    result = {}

    def inside(point):
        x, y = point
        crossings = 0
        for a, b in zip(p, np.roll(p, -1, axis=0)):
            if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                crossings += 1
        return crossings % 2 == 1

    for i, edge in enumerate(edges):
        if edge['hinge']:
            continue
        a, b = p[i], p[(i + 1) % len(p)]
        length = np.linalg.norm(b - a)
        u = (b - a) / length
        inward = np.sign(signed) * np.array([-u[1], u[0]])
        text = f'E{edge["id"]}'
        size = label_size(float(length), text)
        for _ in range(24):
            center = (a + b) / 2 + inward * size * 1.15
            halfwidth = size * len(text) * 0.32
            halfheight = size * 0.65
            box = np.array(
                [
                    center + sx * u * halfwidth + sy * inward * halfheight
                    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))
                ]
            )
            if all(inside(q) for q in box) and not any(overlaps(box, other, 1e-10) for other in used):
                break
            size *= 0.8
        else:
            from .geometry import GeometryError

            raise GeometryError(
                f'Edge label E{edge["id"]} cannot fit inside its source face. Review the face geometry and physical scale.'
            )
        used.append(box)
        result[i] = {
            'size': size,
            'center': center,
            'box': box,
            'angle': math.degrees(math.atan2(float(u[1]), float(u[0]))),
        }
    return result


def fold_types(vertices, faces, edges):
    p = np.asarray(vertices, dtype=float)
    p = p - p.mean(axis=0)
    if p.shape[1] != 3:
        p = p @ np.linalg.svd(p, full_matrices=False)[2][:3].T
    p /= max(float(np.max(np.ptp(p, axis=0))), 1e-30)
    normals = []
    incidence = {}
    neighbors = [[] for _ in faces]
    for fi, cycle in enumerate(faces):
        q = p[cycle]
        normal = np.sum(np.cross(q, np.roll(q, -1, axis=0)), axis=0)
        normals.append(normal / np.linalg.norm(normal))
        for a, b in zip(cycle, cycle[1:] + cycle[:1]):
            incidence.setdefault(tuple(sorted((a, b))), []).append((fi, a, b))
    for pair in incidence.values():
        if len(pair) != 2:
            continue
        (a, u, v), (b, x, y) = pair
        relation = 1 if u == y else -1
        neighbors[a].append((b, relation))
        neighbors[b].append((a, relation))
    signs = {}
    ambiguous = set()
    for root in range(len(faces)):
        if root in signs:
            continue
        signs[root] = 1
        queue = [root]
        group = []
        while queue:
            a = queue.pop()
            group.append(a)
            for b, relation in neighbors[a]:
                if b not in signs:
                    signs[b] = signs[a] * relation
                    queue.append(b)
        volume = 0
        for fi in group:
            q = p[faces[fi]]
            volume += signs[fi] * sum(float(q[0] @ np.cross(q[i], q[i + 1])) for i in range(1, len(q) - 1))
        if abs(volume) < 1e-10:
            ambiguous.update(group)
        elif volume < 0:
            for fi in group:
                signs[fi] *= -1
    result = {}
    for ei, edge in enumerate(edges):
        pair = incidence.get(tuple(sorted(edge)), [])
        if len(pair) != 2 or any(fi in ambiguous for fi, _, _ in pair):
            result[str(ei)] = 'unknown'
            continue
        (a, u, v), (b, _, _) = pair
        axis = (p[v] - p[u]) * signs[a]
        axis /= np.linalg.norm(axis)
        na, nb = normals[a] * signs[a], normals[b] * signs[b]
        angle = math.atan2(float(axis @ np.cross(na, nb)), float(np.clip(na @ nb, -1, 1)))
        result[str(ei)] = 'flat' if abs(angle) < 1e-8 else 'valley' if angle > 0 else 'mountain'
    return result


def piece_bounds(net, padding=4):
    from .nets import tab_geometry

    tabs = tab_geometry(net)
    faces = {f['id']: f for f in net['faces']}
    result = []
    for c in net['components']:
        points = [np.asarray(faces[i]['points']) for i in c['faces']] + [
            np.asarray(t['points']) for t in tabs if t['face'] in c['faces']
        ]
        cloud = np.concatenate(points)
        low = cloud.min(axis=0) - padding
        high = cloud.max(axis=0) + padding
        result.append((c['root'], low, high))
    return result


def arrangement_shifts(net, gap=5):
    parts = piece_bounds(net)
    ordered = sorted(parts, key=lambda p: (-(p[2] - p[1])[1], -(p[2] - p[1])[0], p[0]))
    sizes = [high - low for _, low, high in ordered]
    area = sum((s[0] + gap) * (s[1] + gap) for s in sizes)
    minimum = max(s[0] for s in sizes)
    candidates = []
    for factor in (0.65, 0.8, 1, 1.2, 1.5, 2):
        limit = max(minimum, math.sqrt(area) * factor)
        x = y = row = 0
        positions = {}
        width = 0
        for (root, low, high), size in zip(ordered, sizes):
            if x and x + size[0] > limit + 1e-8:
                y += row + gap
                x = 0
                row = 0
            positions[root] = np.array([x, y]) - low
            x += size[0] + gap
            row = max(row, size[1])
            width = max(width, x - gap)
        height = y + row
        ratio = max(width / height, height / width)
        candidates.append(((width * height * (1 + abs(math.log(ratio))), ratio), positions))
    return min(candidates, key=lambda p: p[0])[1]


def arrange_net(model, net):
    from .generalized_nets import unfold_source

    if len(net['components']) <= 1:
        return net
    shifts = arrangement_shifts(net)
    old = {p['root']: p for p in net.get('placements', [])}
    placements = []
    for c in net['components']:
        previous = old.get(c['root'], {})
        translation = np.asarray(previous.get('translation', [0, 0])) + shifts[c['root']]
        placements.append({'root': c['root'], 'angle': previous.get('angle', 0), 'translation': translation.tolist()})
    return unfold_source(
        model,
        root=net['root'],
        edge_length_mm=net['referenceEdgeLengthMm'],
        tabs=net['tabs'],
        hinges=net['hinges'],
        placements=placements,
        element_annotations=net.get('elementAnnotations'),
        tab_options=net.get('tabOptions'),
    )


def finish_net(model, net, placements):
    net['foldTypes'] = fold_types(net['targetVertices'], model['faces'], model['edges'])
    if placements is None and len(net['components']) > 1:
        return arrange_net(model, net)
    sizes = [label['size'] for face in net['faces'] for label in edge_labels(face['points'], face['edges']).values()]
    net['labelDiagnostics'] = {
        'minimumFontMm': min(sizes, default=0),
        'belowReadableSize': sum(size < 1.2 for size in sizes),
        'readableThresholdMm': 1.2,
    }
    return net
