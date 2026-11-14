"""Convex default corner clearance and deterministic single-tab ownership.

Ownership uses 2-SAT, then bounded conflict descent when unsatisfiable.
Source faces and hinge forests remain untouched; callers verify intersections.
"""

import numpy as np


def trim_tab_corners(candidates, faces, tolerance):
    """Clip default bevels at neighboring convex faces, retaining the glue base.

    Keep at least a tenth of the original tab area; otherwise leave the conflict
    visible for manual editing. No face, hinge or tab base is shortened.
    """
    from .nets import overlaps

    def area(p):
        return abs(float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1)))) / 2

    result = []
    for tab in candidates:
        p = np.asarray(tab['points'], dtype=float)
        base = p[[0, -1]]
        minimum = area(p) * 0.1
        for face in faces:
            q = np.asarray(face['points'], dtype=float)
            if face['id'] == tab['face'] or not overlaps(p, q, tolerance):
                continue
            sign = np.sign(np.sum(q[:, 0] * np.roll(q[:, 1], -1) - q[:, 1] * np.roll(q[:, 0], -1)))
            choices = []
            for a, b in zip(q, np.roll(q, -1, axis=0)):
                edge = b - a
                normal = sign * np.array([-edge[1], edge[0]]) / np.linalg.norm(edge)
                if np.max((base - a) @ normal) > tolerance:
                    continue
                clipped = []
                for u, v in zip(p, np.roll(p, -1, axis=0)):
                    du, dv = float((u - a) @ normal), float((v - a) @ normal)
                    if du <= tolerance:
                        clipped.append(u)
                    if (du < -tolerance and dv > tolerance) or (dv < -tolerance and du > tolerance):
                        clipped.append(u + (v - u) * du / (du - dv))
                if len(clipped) >= 3:
                    clipped = np.asarray(clipped)
                    if area(clipped) >= minimum and not overlaps(clipped, q, tolerance):
                        choices.append((area(clipped), clipped))
            if choices:
                p = max(choices, key=lambda item: item[0])[1]
        result.append({**tab, 'points': p.tolist()})
    return result


def choose_tabs(candidates, faces, tolerance, fixed=(), convex=False):
    from .nets import overlaps
    from .generalized_nets import polygon_overlap

    test = overlaps if convex else polygon_overlap
    groups = {}
    for tab in candidates:
        groups.setdefault(tab['edge'], []).append(tab)
    groups = [sorted(group, key=lambda t: t['face']) for _, group in sorted(groups.items())]
    fixed = list(fixed)
    polygons = [np.asarray(t['points'], dtype=float) for g in groups for t in g]
    if not groups or any(len(g) != 2 for g in groups):
        return fixed + [g[0] for g in groups]
    bounds = [(p.min(axis=0), p.max(axis=0)) for p in polygons]

    def collision(p, bounds_p, q):
        lo, hi = bounds_p
        if np.any(np.minimum(hi, q.max(axis=0)) - np.maximum(lo, q.min(axis=0)) <= tolerance):
            return False
        return test(p, q, tolerance)

    obstacles = [np.asarray(f['points'], dtype=float) for f in faces] + [
        np.asarray(t['points'], dtype=float) for t in fixed
    ]
    unary = [sum(collision(p, bounds[i], q) for q in obstacles) for i, p in enumerate(polygons)]
    conflicts = [set() for _ in polygons]
    graph = [set() for _ in polygons]
    reverse = [set() for _ in polygons]

    def imply(a, b):
        graph[a].add(b)
        reverse[b].add(a)

    for i, p in enumerate(polygons):
        if unary[i]:
            imply(i, i ^ 1)
        for j in range(i + 1, len(polygons)):
            if i // 2 == j // 2:
                continue
            if collision(p, bounds[i], polygons[j]):
                conflicts[i].add(j)
                conflicts[j].add(i)
                imply(i, j ^ 1)
                imply(j, i ^ 1)
    seen, order = set(), []
    for start in range(len(graph)):
        stack = [(start, False)]
        while stack:
            node, done = stack.pop()
            if done:
                order.append(node)
            elif node not in seen:
                seen.add(node)
                stack.append((node, True))
                stack.extend((v, False) for v in sorted(graph[node], reverse=True) if v not in seen)
    components = {}
    for start in reversed(order):
        if start in components:
            continue
        component = len(components)
        stack = [start]
        while stack:
            node = stack.pop()
            if node not in components:
                components[node] = component
                stack.extend(sorted(reverse[node] - components.keys(), reverse=True))
    if all(components[i] != components[i + 1] for i in range(0, len(graph), 2)):
        choices = [i + int(components[i + 1] > components[i]) for i in range(0, len(graph), 2)]
    else:
        best = None
        for seed in range(8):
            choices = {
                i + ((i // 2 + seed) % 2 if seed else int(unary[i + 1] < unary[i])) for i in range(0, len(graph), 2)
            }
            for _ in range(20):
                changed = False
                for i in range(0, len(graph), 2):
                    old = i if i in choices else i + 1
                    new = old ^ 1
                    if unary[new] + len(conflicts[new] & choices) < unary[old] + len(conflicts[old] & choices):
                        choices.remove(old)
                        choices.add(new)
                        changed = True
                if not changed:
                    break
            score = sum(unary[i] for i in choices) + sum(len(conflicts[i] & choices) for i in choices) // 2
            entry = (score, sorted(choices))
            if best is None or entry < best:
                best = entry
        choices = best[1]
    flat = [t for g in groups for t in g]
    return fixed + [flat[i] for i in sorted(choices)]
