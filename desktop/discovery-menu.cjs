const ROLES = new Set(['quit', 'copy', 'paste', 'selectAll', 'zoomIn', 'zoomOut', 'resetZoom', 'about']);
function runDiscoveryMenu(name, { window, app, dialog }) {
  if (typeof name !== 'string' || !ROLES.has(name)) throw Error('Choose a supported menu command.');
  if (name === 'quit') return window.close();
  if (name === 'about')
    return dialog.showMessageBox(window, {
      title: 'Polytope Laboratory',
      message: 'Polytope Laboratory ' + app.getVersion(),
      detail:
        'Offline 3D/4D mathematical workspace. Convex operations use float64 predicates. Early community preview. Current focus: usability, performance and reliability.',
    });
  const contents = window.webContents;
  if (['copy', 'paste', 'selectAll'].includes(name)) return contents[name]();
  contents.setZoomLevel(
    name === 'resetZoom' ? 0 : Math.max(-3, Math.min(5, contents.getZoomLevel() + (name === 'zoomIn' ? 1 : -1)))
  );
}
module.exports = { runDiscoveryMenu };
