// Actual app navigation functions with real Viewer geometry. DOM layout/panels,
// native reports and GPU rendering are controlled by the shared CPU harness.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { navigationDisplayHarness, displayBuffers } from '../tests/helpers/navigation-display.mjs';
import { readAppSource, rendererFiles } from '../tests/helpers/app-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw Error('Pass a preserved pre-change app.js');
const baseline = path.resolve(root, process.argv[2]),
  input = path.resolve(root, process.argv[3] || 'artifacts/model-view-profile-FstP3r/8-before-rotation.polyproj');
const project = JSON.parse(fs.readFileSync(input, 'utf8')),
  document = project.documents[project.active],
  initial = document.states[document.cursor];
assert.equal(initial.view.projection, 'orthographic', 'This CPU comparison excludes asynchronous projection workers');
const output = fs.mkdtempSync(path.join(root, 'artifacts', 'navigation-display-profile-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sources = () =>
  Object.fromEntries(
    [
      ...rendererFiles,
      'ui/viewer.js',
      'ui/element-content-controls.mjs',
      'ui/geometry-bounds.mjs',
      'engine/element_annotations.py',
      'engine/element_content_workflow.py',
      'tests/helpers/navigation-display.mjs',
      'scripts/profile-navigation-display.mjs',
    ].map((name) => [name, hash(fs.readFileSync(path.join(root, name)))])
  );
const result = {
  passed: false,
  scope:
    'Actual app navigation, source ownership and Viewer CPU geometry with controlled panels/DOM and native-prepared annotation descriptor; native description/startup, font/image decoding, GPU, Electron and packaged timing excluded',
  node: process.version,
  platform: os.platform() + ' ' + os.release(),
  cpu: os.cpus()[0]?.model,
  baseline: { path: baseline, sha256: hash(fs.readFileSync(baseline)) },
  input: { path: input, sha256: hash(fs.readFileSync(input)) },
  sourcesBefore: sources(),
  model: initial.model.name,
  counts: Object.fromEntries(
    ['vertices', 'edges', 'faces', 'cells'].map((name) => [name, initial.model[name]?.length ?? 0])
  ),
  samples: [],
};
try {
  const code = {
    before: fs.readFileSync(baseline, 'utf8'),
    after: readAppSource(),
  };
  const annotated = JSON.parse(
    execFileSync(
      process.env.POLYTOPE_PYTHON || 'python',
      [
        '-B',
        '-c',
        "import json,sys;from engine.element_annotations import new_document,set_text;from engine.element_content_workflow import describe_content;m=json.load(sys.stdin);d=set_text(new_document(m),m,'face',0,'Caption');print(json.dumps({'document':d,'descriptor':describe_content(m,d)}))",
      ],
      {
        cwd: root,
        input: JSON.stringify(initial.model),
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      }
    )
  );
  fs.writeFileSync(path.join(output, 'annotations.json'), JSON.stringify(annotated));
  result.annotationsSha256 = hash(JSON.stringify(annotated));
  for (const annotations of [false, true])
    for (const selected of [false, true]) {
      let expected;
      for (let run = -2; run < 9; run++)
        for (const mode of run % 2 ? ['after', 'before'] : ['before', 'after']) {
          const state = structuredClone(initial);
          delete state.view.elementAnnotations;
          if (annotations) state.view.elementAnnotations = structuredClone(annotated.document);
          if (selected) state.view.entitySelection = { kind: 'face', index: 0 };
          else delete state.view.entitySelection;
          const f = navigationDisplayHarness(code[mode], state, {
            descriptor: annotations ? annotated.descriptor : null,
          });
          try {
            const start = performance.now();
            f.scope.renderWorkspace();
            await f.settle();
            const ms = performance.now() - start;
            const bufferSha256 = hash(JSON.stringify(displayBuffers(f.v)));
            expected ??= bufferSha256;
            assert.equal(bufferSha256, expected, 'Complete geometry/ownership/highlight buffer equality');
            assert.equal(f.counts.displays, mode === 'before' && selected ? 2 : 1);
            assert.equal(f.counts.dirty, 0);
            assert.equal(f.counts.errors.length, 0);
            assert.ok(f.counts.pending.every((promise) => promise instanceof Promise));
            const publications = await Promise.allSettled(f.counts.pending);
            assert.ok(
              publications.every((item) => item.status === 'fulfilled'),
              'All content publications complete'
            );
            if (annotations)
              assert.ok(
                f.v.elementContentLayer?.group.children.some((child) => child.isMesh),
                'Retain source face text'
              );
            if (run >= 0)
              result.samples.push({
                annotations,
                selected,
                mode,
                run,
                ms,
                displayPasses: f.counts.displays,
                bufferSha256,
              });
          } finally {
            f.close();
          }
        }
    }
  result.comparisons = [false, true].flatMap((annotations) =>
    [false, true].map((selected) => ({
      annotations,
      selected,
      ...Object.fromEntries(
        ['before', 'after'].map((mode) => {
          const values = result.samples
            .filter(
              (sample) => sample.annotations === annotations && sample.selected === selected && sample.mode === mode
            )
            .map((sample) => sample.ms)
            .sort((a, b) => a - b);
          return [mode, { medianMs: values[4], iqrMs: values[6] - values[2], samples: values.length }];
        })
      ),
    }))
  );
  result.sourcesAfter = sources();
  assert.deepEqual(result.sourcesAfter, result.sourcesBefore);
  result.passed = true;
} catch (error) {
  result.error = error.stack;
  process.exitCode = 1;
}
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({ output, passed: result.passed, comparisons: result.comparisons, error: result.error }, null, 2)
);
