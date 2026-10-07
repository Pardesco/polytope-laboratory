// Source face IDs stay stable when cells are hidden or isolated for inspection.
export function cellVisibility(model, hiddenCells = [], isolatedCell = null) {
  const cells = model.cells || [], hidden = new Set(hiddenCells);
  if (isolatedCell !== null && (!Number.isInteger(isolatedCell) || isolatedCell < 0 || isolatedCell >= cells.length)) throw new Error('Choose a valid source cell to isolate.');
  if ([...hidden].some(i => !Number.isInteger(i) || i < 0 || i >= cells.length)) throw new Error('Hidden cell index is outside the source model.');
  const faceOwners = Array.from({length: model.faces.length}, () => []);
  cells.forEach((faces, cell) => faces.forEach(face => faceOwners[face].push(cell)));
  const active = cell => !hidden.has(cell) && (isolatedCell === null || isolatedCell === cell);
  const faces = faceOwners.map(owners => !owners.length || owners.some(active));
  const constrained = cells.length && (hidden.size || isolatedCell !== null);
  const edgeKeys = new Set(), vertices = new Set();
  if (constrained) model.faces.forEach((face, i) => {
    if (!faces[i]) return;
    face.forEach((v, j) => { vertices.add(v); const b=face[(j+1)%face.length]; edgeKeys.add(v<b?`${v}:${b}`:`${b}:${v}`); });
  });
  const activeCells=cells.map((_,i)=>i).filter(active);
  return {faces, faceOwners, activeCells, activeCellSet:new Set(activeCells),
    edges: model.edges.map(([a,b]) => !constrained || edgeKeys.has(a<b?`${a}:${b}`:`${b}:${a}`)),
    vertices: model.vertices.map((_,i)=>!constrained || vertices.has(i))};
}
