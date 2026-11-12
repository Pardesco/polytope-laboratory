// Runs the package.json test:features commands without a shell.
// cmd.exe limits a command line to 8,191 characters; the declared suite is longer,
// so `npm run test:features` fails on Windows. The declaration stays the single
// source of truth (release qualifiers parse it); each `node ...` part is spawned directly.
const { spawnSync } = require('node:child_process'),
  path = require('node:path');
const root = path.resolve(__dirname, '..'),
  declared = require(path.join(root, 'package.json')).scripts['test:features'];
for (const command of declared.split(' && ')) {
  const args = command.trim().split(/\s+/);
  if (args.shift() !== 'node' || args.some((arg) => !/^[-\w./]+$/.test(arg)))
    throw Error('test:features must contain explicit node/file commands.');
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
