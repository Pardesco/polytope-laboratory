"""Offline ungated numerical probe, never a publishable patch.

Run: python scripts/measure-hyperbolic-drift.py
Measures the bounded depth-four BFS prefix, including out-of-gate samples.
The production Development._checked gate is not changed or parameterized.
"""

from collections import defaultdict
from decimal import Decimal, localcontext
import json
import math
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.hyperbolic import J, PRESETS, lorentz_inner
from engine.hyperbolic_orbit import Development, DevelopmentResidualError, budget_options, repair_frame


class Probe(Development):
    def __init__(self, pqr, repair):
        super().__init__(pqr, depth=4)
        self.repair = repair
        self.by_word = defaultdict(dict)
        self.by_distance = defaultdict(dict)

    def _checked(self, matrix, word):
        before = (matrix @ self.vertices.T).T
        pre_error = np.abs(lorentz_inner(before, before) + 1)
        pre_metric = float(np.max(np.abs(matrix.T @ J @ matrix - J)))
        repaired = repair_frame(matrix, len(word)) if self.repair else matrix
        points = (repaired @ self.vertices.T).T
        errors = np.abs(lorentz_inner(points, points) + 1)
        distance = math.acosh(max(1, float(repaired[0, 0])))
        metric = float(np.max(np.abs(repaired.T @ J @ repaired - J)))
        values = {
            'centerDistance': distance,
            'vertexTime': float(points[:, 0].max()),
            'coordinatesPre': float(pre_error.max()),
            'coordinates': float(errors.max()),
            'coordinateRelative': float(np.max(errors / points[:, 0] ** 2)),
            'metricPre': pre_metric,
            'metric': metric,
            'metricRelative': metric / max(1, float(repaired[0, 0]) ** 2),
        }
        for row in (self.by_word[len(word)], self.by_distance[int(distance // 2) * 2]):
            row['samples'] = row.get('samples', 0) + 1
            for key, value in values.items():
                row[key] = max(row.get(key, 0), value)
        return repaired


def run(development):
    budget = budget_options()
    while len(development.words) < budget['maxCells']:
        reason = development.step(budget)
        if reason:
            return reason
    return 'cellLimit'


def rejection(pqr):
    d = Development(pqr, depth=4)
    try:
        return {'outcome': run(d), 'cells': len(d.words), 'residuals': d.residuals}
    except DevelopmentResidualError as error:
        word = d.words[d.cell_index] + [d.face_index]
        matrix = d.matrices[d.cell_index] @ d.generators[d.face_index]
        points = (matrix @ d.vertices.T).T
        with localcontext() as ctx:
            ctx.prec = 70
            exact_float_errors = []
            product_errors = []
            rounding_errors = []
            m = [[Decimal.from_float(float(x)) for x in row] for row in matrix]
            for point, vertex in zip(points, d.vertices):
                terms = [Decimal.from_float(float(x)) ** 2 for x in point]
                exact_float_errors.append(float(abs(-terms[0] + sum(terms[1:]) + 1)))
                v = [Decimal.from_float(float(x)) for x in vertex]
                product = [sum(a * b for a, b in zip(row, v)) for row in m]
                squares = [x**2 for x in product]
                product_errors.append(float(abs(-squares[0] + sum(squares[1:]) + 1)))
                rounding_errors.extend(float(abs(Decimal.from_float(float(x)) - y)) for x, y in zip(point, product))
            matrix_errors = [
                abs(sum((-1 if k == 0 else 1) * m[k][i] * m[k][j] for k in range(4)) - Decimal(int(J[i, j])))
                for i in range(4)
                for j in range(4)
            ]
        return {
            'outcome': 'rejected',
            'cells': len(d.words),
            'word': word,
            **error.diagnostics,
            'decimalFloatPointResidual': max(exact_float_errors),
            'decimalUnroundedProductResidual': max(product_errors),
            'decimalMatrixMetric': float(max(matrix_errors)),
            'pointProductRounding': max(rounding_errors),
            'tSquaredEpsilon': float(points[:, 0].max() ** 2 * np.finfo(float).eps),
        }


def main():
    for pqr in PRESETS:
        for repair in (False, True):
            d = Probe(pqr, repair)
            outcome = run(d)
            print(
                json.dumps(
                    {
                        'pqr': pqr,
                        'repair': repair,
                        'outcome': outcome,
                        'byWord': dict(d.by_word),
                        'byDistance': dict(d.by_distance),
                    }
                )
            )
        print(json.dumps({'pqr': pqr, 'production': rejection(pqr)}))


if __name__ == '__main__':
    main()
