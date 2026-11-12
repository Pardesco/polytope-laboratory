/** Scan source points without a vertex-sized argument list or temporary cloud.
 * Math.hypot still sees only the bounded coordinate dimension (2, 3 or 4). */
export function pointRadius(points, center = null, floor = -Infinity) {
  let radius = floor;
  for (const point of points)
    radius = Math.max(radius, Math.hypot(...(center ? point.map((x, k) => x - center[k]) : point)));
  return radius;
}

export function pointBounds(points, dimension) {
  const low = Array(dimension).fill(Infinity),
    high = Array(dimension).fill(-Infinity);
  for (const point of points)
    for (let k = 0; k < dimension; k++) {
      low[k] = Math.min(low[k], point[k]);
      high[k] = Math.max(high[k], point[k]);
    }
  return { low, high };
}
