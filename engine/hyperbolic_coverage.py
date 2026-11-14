"""Distance to a compact convex cell: interior, faces, edges, then vertices."""

import math
import numpy as np
from .hyperbolic import J, lorentz_inner


class CellBall:
    def __init__(self, template):
        self.vertices = np.asarray(template['vertices'])
        self.normals = np.asarray(template['facePlanes'])
        self.circumradius = math.acosh(float(self.vertices[:, 0].max()))
        self.edges = self.vertices[np.asarray(template['edges'])]
        self.edge_grams = np.linalg.inv(self.edges @ J @ self.edges.transpose(0, 2, 1))

    def meets(self, matrix, observer, radius):
        local = J @ matrix.T @ J @ observer
        if local[0] > math.cosh(radius + self.circumradius) + 1e-10:
            return False
        distances = self.normals @ J @ local
        if distances.max() <= 1e-10:
            return True
        limit = math.cosh(radius) + 1e-10
        if np.min(-lorentz_inner(self.vertices, local)) <= limit:
            return True
        projected = local - distances[:, None] * self.normals
        norms = -lorentz_inner(projected, projected)
        projected /= np.sqrt(np.maximum(norms, 1e-30))[:, None]
        inside = np.max(projected @ J @ self.normals.T, axis=1) <= 1e-9
        if np.any(inside & (-lorentz_inner(projected, local) <= limit)):
            return True
        coefficients = np.einsum('eij,ej->ei', self.edge_grams, self.edges @ J @ local)
        points = np.einsum('ei,eij->ej', coefficients, self.edges)
        points /= np.sqrt(np.maximum(-lorentz_inner(points, points), 1e-30))[:, None]
        return bool(np.any((coefficients.min(axis=1) >= -1e-10) & (-lorentz_inner(points, local) <= limit)))
