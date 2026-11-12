import { installRationalFilterExample } from './rational-filter-example.mjs';

export const RATIONAL_EXAMPLE_POINTS = [
  ['-1/2', '-1/3', '-1/4'],
  ['-1/2', '-1/3', '1/4'],
  ['-1/2', '1/3', '-1/4'],
  ['-1/2', '1/3', '1/4'],
  ['1/2', '-1/3', '-1/4'],
  ['1/2', '-1/3', '1/4'],
  ['1/2', '1/3', '-1/4'],
  ['1/2', '1/3', '1/4'],
  ['0', '0', '0'],
  ['1/2', '0', '0'],
  ['1/2', '1/3', '1/4'],
];
export function installPrecisionExample(doc) {
  installRationalFilterExample(doc);
  const input = doc.getElementById('rational-points');
  if (!input || doc.getElementById('precision-load-example')) return;
  const button = doc.createElement('button');
  button.id = 'precision-load-example';
  button.type = 'button';
  button.className = 'wide';
  button.textContent = 'Load rational box example';
  button.title = 'Fill the coordinates, then enumerate exact supporting facets.';
  button.onclick = () => {
    input.value = RATIONAL_EXAMPLE_POINTS.map((row) => row.join(', ')).join('\n');
    input.focus();
  };
  input.after(button);
}
