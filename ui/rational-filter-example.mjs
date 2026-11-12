export const RATIONAL_FILTER_POINTS = [
  ['-1', '-1', '-1'],
  ['-1', '-1', '1'],
  ['-1', '1', '-1'],
  ['-1', '1', '1'],
  ['1', '-1', '-1'],
  ['1', '-1', '1'],
  ['1', '1', '-1'],
  ['1', '1', '1000000001/1000000000'],
];
export function installRationalFilterExample(doc) {
  const input = doc.getElementById('rational-points');
  if (!input || doc.getElementById('precision-load-filter-example')) return;
  const button = doc.createElement('button');
  button.id = 'precision-load-filter-example';
  button.type = 'button';
  button.className = 'wide';
  button.textContent = 'Load rational raised-corner cube';
  button.title =
    'Eight points; exact supports preserve two nearly coplanar top triangles. Enumerate exact supporting facets to construct it.';
  button.onclick = () => {
    input.value = RATIONAL_FILTER_POINTS.map((row) => row.join(', ')).join('\n');
    input.focus();
  };
  input.after(button);
}
