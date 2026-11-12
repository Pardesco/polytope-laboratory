"""Bounded exact plane orbits and sound pruning for 13-20 vertex FAC sources."""

from collections import Counter, defaultdict
from itertools import combinations


def source_plane_orbits(points, group, work_limit, cancelled):
    from engine.automatic_faceting import _plane, _value, _hash, _canceled

    planes = {}
    covered = set()
    used = 0
    examined = 0
    orbits = 0
    status = 'complete'
    reasons = []

    class Stop(Exception):
        pass

    def step(amount=1):
        nonlocal used, status
        if _canceled(cancelled):
            status = 'user-cancelled'
            reasons.append('candidate-plane generation canceled')
            raise Stop
        if used + amount > work_limit:
            status = 'resource-limited'
            reasons.append('exact plane-orbit work cap')
            raise Stop
        used += amount

    try:
        for ids in combinations(range(len(points)), 3):
            if ids in covered:
                continue
            step()
            examined += 1
            plane = _plane(points, ids)
            if plane is None:
                covered.add(ids)
                continue
            step(len(points))
            vertices = [i for i, p in enumerate(points) if _value(plane, p) == 0]
            orbits += 1
            for action in group['permutations']:
                step(len(vertices))
                image = tuple(sorted(action[i] for i in vertices))
                if image in planes:
                    continue
                for anchor in combinations(image, 3):
                    step()
                    exact = _plane(points, anchor)
                    if exact is not None:
                        break
                planes[image] = {
                    'id': 'plane-' + _hash([str(x) for x in exact]),
                    'exactPlane': [str(x) for x in exact],
                    'anchorVertexIds': list(anchor),
                    'sourceVertexIds': list(image),
                }
                covered.update(combinations(image, 3))
    except Stop:
        pass
    return (
        list(planes.values()),
        examined,
        status,
        reasons,
        {
            'method': 'exact representative plane predicates; images under verified source isometries',
            'workUsed': used,
            'workLimit': work_limit,
            'planeOrbitsVisited': orbits,
            'triplesCovered': len(covered),
            'totalSourceTriples': len(points) * (len(points) - 1) * (len(points) - 2) // 6,
        },
    )


class OrbitPruning:
    def __init__(self, rows, variables, criteria, invariant):
        self.criteria = criteria
        self.invariant = invariant
        self.reasons = Counter()
        self.branches = Counter()
        self.input_count = len(variables)
        self.variables = []
        self.type_cap = (
            min([cap for cap in (1 if criteria['isohedral'] else 0, criteria['max_face_types']) if cap], default=0)
            if invariant
            else 0
        )
        for variable in variables:
            selected = [rows[i] for i in variable]
            edges = Counter(tuple(e) for row in selected for e in row['edges'])
            planes = defaultdict(list)
            for row in selected:
                planes[row['planeId']].append(row)
            reason = None
            if any(n > 2 for n in edges.values()):
                reason = 'internal edge multiplicity'
            elif criteria['coplanar_vertices'] == 'disjoint' and any(
                len(vertices := [v for row in faces for v in row['cycle']]) != len(set(vertices))
                for faces in planes.values()
            ):
                reason = 'internal coplanar vertex sharing'
            elif any(
                (criteria['max_faces_per_plane'] and len(faces) > criteria['max_faces_per_plane'])
                or (plane in criteria['plane_face_counts'] and len(faces) > criteria['plane_face_counts'][plane])
                for plane, faces in planes.items()
            ):
                reason = 'internal plane face cap'
            if reason:
                self.reasons[reason] += 1
            else:
                self.variables.append(variable)
        self.future_single = [set() for _ in range(len(self.variables) + 1)]
        self.future_vertices = [set() for _ in range(len(self.variables) + 1)]
        for i in reversed(range(len(self.variables))):
            selected = [rows[v] for v in self.variables[i]]
            edges = Counter(tuple(e) for row in selected for e in row['edges'])
            self.future_single[i] = self.future_single[i + 1] | {edge for edge, n in edges.items() if n == 1}
            self.future_vertices[i] = self.future_vertices[i + 1] | {v for row in selected for v in row['cycle']}

    def reject(self, index, counts, vertices, selected_types, vertex_count):
        reason = None
        if any(n == 1 and edge not in self.future_single[index] for edge, n in counts.items()):
            reason = 'open edge cannot receive one remaining face'
        elif not self.criteria['accept_partial'] and len(vertices | self.future_vertices[index]) < vertex_count:
            reason = 'remaining orbits cannot cover source vertices'
        elif self.invariant and selected_types + len(self.variables) - index < self.criteria['min_face_types']:
            reason = 'remaining orbits cannot reach minimum types'
        if reason:
            self.branches[reason] += 1
        return reason is not None

    def receipt(self):
        return {
            'method': 'orbit internal constraints, remaining edge/vertex coverage and invariant face-type bounds',
            'inputVariables': self.input_count,
            'retainedVariables': len(self.variables),
            'discardedVariables': sum(self.reasons.values()),
            'discardReasons': dict(sorted(self.reasons.items())),
            'prunedBranches': dict(sorted(self.branches.items())),
            'invariantFaceTypeCap': self.type_cap,
            'scope': 'sound pruning within recorded candidate domain',
        }
