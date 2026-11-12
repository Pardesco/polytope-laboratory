"""Bounded sparse incidence for the existing convex 4D product morph.

Vertex posting intersections enumerate exactly A <= B, in literal ID order.
Budgets count visited postings and emitted incidences, not absent Cartesian pairs.
Coordinates, supports, face cycles and polarity remain owned by the method.
"""
from collections import defaultdict

from .dual_morph_expansion import MAX_PAIRS, MAX_VERTICES, MAX_FACES, _require, _cycle


class SparseIncidence:
    def __init__(self, lattice, budget=MAX_PAIRS):
        self.lattice = lattice
        self.budget = budget
        self.visits = 0
        self.postings = []
        self.cache = {}
        _require(len(lattice) == 4, 'Sparse morph incidence requires four source ranks.')
        for rank in lattice:
            posting = defaultdict(set)
            for i, element in enumerate(rank):
                _require(bool(element), 'Sparse morph lattice contains an empty element.')
                self.count(len(element))
                for v in element: posting[v].add(i)
            self.postings.append(posting)

    def count(self, amount):
        self.visits += amount
        _require(self.visits <= self.budget, 'Sparse 4D morph exceeds its bounded incidence-visit budget.')

    def upper(self, rank, index, target):
        key = (rank, index, target)
        if key not in self.cache:
            lists = [self.postings[target].get(v, set()) for v in self.lattice[rank][index]]
            lists.sort(key=len)
            self.count(len(lists[0]))
            found = set(lists[0])
            for posting in lists[1:]:
                self.count(len(found))
                found.intersection_update(posting)
            self.count(len(found))
            self.cache[key] = tuple(sorted(found))
        return self.cache[key]


def product_records(lattice):
    incidence = SparseIncidence(lattice)
    products = []; lookups = []
    for k in range(4):
        records = []; lookup = {}
        for r in range(k+1):
            s = k-r
            for a in range(len(lattice[r])):
                for b in incidence.upper(r, a, 3-s):
                    lookup[(r,a,s,b)] = len(records)
                    records.append((r,a,s,b))
                    _require(len(records) <= (MAX_VERTICES if k == 0 else MAX_FACES),
                             'Expanded geometry exceeds the output-element budget.')
        products.append(records); lookups.append(lookup)
    return products, lookups


def dual_topology(model, lattice):
    incidence = SparseIncidence(lattice)
    supers = [[incidence.upper(r, i, 3) for i in range(len(rank))] for r, rank in enumerate(lattice)]
    edges = [list(ids) for ids in supers[2]]
    _require(all(len(ids) == 2 for ids in edges), 'Every source ridge needs exactly two facet incidences.')
    faces = []
    for i in range(len(lattice[1])):
        adjacency = defaultdict(list)
        for ridge in incidence.upper(1, i, 2):
            a, b = edges[ridge]
            adjacency[a].append(b); adjacency[b].append(a)
        faces.append(_cycle(adjacency, 'Reciprocal face '+str(i)))
    cells = [[] for _ in lattice[0]]
    for i, edge in enumerate(model['edges']):
        for v in edge: cells[v].append(i)
    return {'edges':edges, 'faces':faces, 'cells':cells}, supers


def vertex_incidence(elements, count):
    result = [[] for _ in range(count)]; visits = 0
    for i, element in enumerate(elements):
        visits += len(element)
        _require(visits <= MAX_PAIRS, 'Sparse 4D content exceeds its incidence-visit budget.')
        for v in element: result[v].append(i)
    return result


def edge_face_incidence(faces, edges, count):
    postings = [set(ids) for ids in vertex_incidence(faces, count)]
    result = []; visits = 0
    for a,b in edges:
        visits += min(len(postings[a]),len(postings[b]))
        _require(visits <= MAX_PAIRS, 'Sparse 4D content exceeds its incidence-visit budget.')
        ids = sorted(postings[a] & postings[b])
        visits += len(ids)
        _require(visits <= MAX_PAIRS, 'Sparse 4D content exceeds its incidence-visit budget.')
        result.append(ids)
    return result
