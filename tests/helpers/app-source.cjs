const fs = require('node:fs');
const path = require('node:path');
const { sourceNodes } = require('./source-match.cjs');

const root = path.resolve(__dirname, '../..');
const rendererFiles = [
  'ui/app.js',
  ...['context', 'startup', 'history-wiring', 'panels', 'catalog-view', 'export', 'workspace-render'].map(
    (name) => 'ui/app/' + name + '.mjs'
  ),
];
const desktopFiles = [
  'desktop/main.cjs',
  'desktop/engine-allowlist.cjs',
  'desktop/ipc-handlers.cjs',
  'desktop/dialogs.cjs',
  'desktop/menu.cjs',
];

// Structural assertions may span composition boundaries. Keep each real file in
// its own scope, omitting only module linkage so the combined AST is parseable.
function readSources(files) {
  const imports = [],
    bindings = new Set();
  const bodies = files
    .map((file) => {
      let source = fs.readFileSync(path.join(root, file), 'utf8');
      const nodes = sourceNodes(
        source,
        (node) => node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration'
      );
      for (const node of nodes.filter((node) => node.type === 'ImportDeclaration')) {
        const names = node.specifiers.map((specifier) => specifier.local.name);
        if (names.some((name) => bindings.has(name))) continue;
        names.forEach((name) => bindings.add(name));
        imports.push(source.slice(node.start, node.end));
      }
      for (const node of nodes.reverse()) {
        const end = node.type === 'ImportDeclaration' ? node.end : node.declaration.start;
        source = source.slice(0, node.start) + source.slice(end);
      }
      return '{\n' + source + '\n}';
    })
    .join('\n');
  return imports.join('\n') + '\n' + bodies;
}
const readAppSource = () => readSources(rendererFiles);
const readDesktopSource = () => readSources(desktopFiles);
module.exports = { readAppSource, readDesktopSource, rendererFiles, desktopFiles };
