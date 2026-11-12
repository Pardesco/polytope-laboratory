const paths = Object.freeze({
  polytope: ['M9 1.5 16.5 5.5V13L9 16.5 1.5 13V5.5Z', 'M1.5 5.5 9 9l7.5-3.5M9 9v7.5M9 1.5V9M1.5 13 9 9l7.5 4'],
  new: ['M10.5 1.5h-7v15h11v-11Z', 'M10.5 1.5v4h4M6 10h6M9 7v6'],
  open: ['M1.5 6V3.5H7l2 2h7.5V8', 'M1.5 6h6l2 2h7L14 15.5H1.5Z'],
  save: ['M13 1.5H2v15h14v-12Z', 'M5 1.5v5h7v-5M5 16.5v-6h8v6'],
  snapshot: ['M1.5 5.5h4l1.5-3h4l1.5 3h4v10h-15Z', 'M12 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  undo: ['M6 3 2 7l4 4', 'M2 7h8a5 5 0 0 1 0 10'],
  redo: ['m12 3 4 4-4 4', 'M16 7H8a5 5 0 0 0 0 10'],
  export: ['M9 11V1.5M5.5 5 9 1.5 12.5 5', 'M2 10v6.5h14V10'],
  search: ['M11.5 11.5 16 16', 'M13.5 7.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0'],
  help: ['M9 16.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15', 'M6.5 6.5a2.5 2.5 0 1 1 4.2 1.8C9.5 9 9 9.5 9 11M9 13.5h.01'],
  presentation: ['M1.5 2.5h15v10h-15Z', 'm7 5 4 2.5L7 10ZM9 12.5v4M5.5 16.5h7'],
  fullscreen: ['M6 1.5H1.5V6M12 1.5h4.5V6M1.5 12v4.5H6M16.5 12v4.5H12'],
  library: ['M1.5 2.5h4v13h-4ZM5.5 2.5h4v13h-4ZM11 3l3.5-1 3 12.5-3.5 1Z'],
  inspector: ['M1.5 2.5h15v13h-15ZM10 2.5v13M12.5 6h1.5M12.5 9h1.5M12.5 12h1.5'],
  more: [
    'M3.75 9a.75 .75 0 1 1-1.5 0 .75 .75 0 0 1 1.5 0M9.75 9a.75 .75 0 1 1-1.5 0 .75 .75 0 0 1 1.5 0M15.75 9a.75 .75 0 1 1-1.5 0 .75 .75 0 0 1 1.5 0',
  ],
});

export const ICON_NAMES = Object.freeze(Object.keys(paths));
export function icon(name, { document: doc = globalThis.document, size = 18 } = {}) {
  if (!Object.hasOwn(paths, name)) throw Error('Unknown icon: ' + name);
  const ns = 'http://www.w3.org/2000/svg',
    svg = doc.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 18 18',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'app-icon',
  }))
    svg.setAttribute(key, value);
  for (const d of paths[name]) {
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
