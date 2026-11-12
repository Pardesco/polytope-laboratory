// Check literal renderer operations against actual desktop allowlist syntax.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { sourceNodes } = require('./helpers/source-match.cjs');
const root = path.resolve(__dirname, '..');
test('renderer engine ops are allowed by the desktop geometry API', () => {
  const { allowed } = require('../desktop/engine-allowlist.cjs');
  assert.ok(allowed.size > 0, 'Find the actual desktop operation allowlist');
  const missing = [];
  let calls = 0;
  for (const f of fs.readdirSync(path.join(root, 'ui'), { recursive: true }).filter((f) => /\.m?js$/.test(f))) {
    const source = fs.readFileSync(path.join(root, 'ui', f), 'utf8');
    for (const node of sourceNodes(
      source,
      (n) => n.type === 'CallExpression' && n.callee.name === 'run' && typeof n.arguments[0]?.value === 'string'
    )) {
      const op = node.arguments[0].value;
      if (!/^[a-z0-9-]+$/.test(op)) continue;
      calls++;
      if (!allowed.has(op)) missing.push(op + ' (' + f + ')');
    }
  }
  assert.ok(calls > 0, 'Inspect literal renderer run calls');
  assert.deepEqual([...new Set(missing)], []);
});
