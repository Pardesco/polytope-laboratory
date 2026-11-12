const picks = '[data-source-vertex-id],[data-candidate-id],[data-plane-id]';
export function labelDiagramPicks(root) {
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Interactive faceting diagram');
  let index = 0;
  for (const node of root.querySelectorAll(picks)) {
    if (node.localName === 'text') continue;
    const vertex = node.getAttribute('data-source-vertex-id');
    const label = vertex !== null ? 'Select source vertex ' + vertex : 'Select facet boundary ' + ++index;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', label);
    const title = root.ownerDocument.createElementNS(root.namespaceURI, 'title');
    title.textContent = label;
    node.append(title);
  }
  return root;
}
export function activateDiagramKey(event, activate) {
  if ((event.key === 'Enter' || event.key === ' ') && event.target?.closest?.(picks)) {
    event.preventDefault();
    activate(event);
  }
}
