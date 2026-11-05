export const TOOL_ICONS={
  dual:'M4 7 12 3 20 7 20 17 12 21 4 17ZM4 7 12 12 20 7M12 12V21M12 3 7 12 12 21 17 12Z',
  truncate:'M8 3h8l5 5v8l-5 5H8l-5-5V8ZM3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3',
  expand:'M9 9h6v6H9ZM3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6M6 6l3 3M15 9l3-3M18 18l-3-3M9 15l-3 3',
  subdivide:'M3 20 12 4 21 20ZM7.5 12h9M7.5 12 12 20 16.5 12M12 4v8',
  augment:'M3 11h10v10H3ZM3 11 8 3 13 11M13 11h8v10h-8M17 13v6M14 16h6',
  transform:'M4 9h10v11H4ZM9 4h11v11M4 4V2M2 4h2M16 20h6M19 17l3 3-3 3',
  fit:'M5 5h14v14H5ZM2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6M8 12l3 3 5-6',
  sphere:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-6 5-6 13 0 18 6-5 6-13 0-18Z',
  facet:'M3 7 12 3 21 7 18 20H6ZM3 7l15 13M21 7 6 20M12 3v11M3 7h18',
  stellate:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM9 9h6v6H9Z',
  compound:'M3 5h12v12H3ZM9 11h12v10H9ZM3 5l6 6M15 5l6 6M3 17l6 4',
  prism:'M4 7 12 3 20 7 20 17 12 21 4 17ZM4 7h16M4 17h16M12 3v18',
  coxeter:'M5 12h14M9 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM23 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 4v3M10 5h4',
  hull:'M3 9 9 3 20 6 22 16 13 22 3 18ZM3 9l10 13M9 3l4 19M20 6l-7 16M7 12h.01M16 12h.01',
};
export function toolIconFamily(tool){
  const id=tool.id??'';
  if(/dual/.test(id))return 'dual';
  if(/truncat/.test(id))return 'truncate';
  if(/expansion/.test(id))return 'expand';
  if(/conway|subdivision|geodesic/.test(id))return 'subdivide';
  if(/augment|placement|surgery/.test(id))return 'augment';
  if(/transform/.test(id))return 'transform';
  if(/fitting|spring/.test(id))return 'fit';
  if(/sphere|torus/.test(id))return 'sphere';
  if(/facet|face-edit/.test(id))return 'facet';
  if(/stellation|star-polygon/.test(id))return 'stellate';
  if(/compound|blending|regiment/.test(id))return 'compound';
  if(/wythoff|shape-builder|coxeter|snub/.test(id))return 'coxeter';
  if(/hull|core|waterman|zonohedron|segmentotope/.test(id))return 'hull';
  return tool.category===4?'prism':'fit';
}
export function createToolIcon(doc,tool){
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  svg.setAttribute('data-tool-icon',toolIconFamily(tool));path.setAttribute('d',TOOL_ICONS[toolIconFamily(tool)]);svg.append(path);return svg;
}
