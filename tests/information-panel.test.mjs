import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { InformationPanel, informationRows, informationCSV, informationText } from '../ui/information-panel.mjs';
import { StereoControls } from '../ui/stereo-controls.mjs';
import { SourceMeasurementSession } from '../ui/source-measurement-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
import { REUSABLE_OPERATIONS } from '../desktop/engine-pool.cjs';

const packet = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      "import json; from engine.generators import regular; from engine.information_panel import information_panel; m=regular('cuboctahedron'); print(json.dumps(dict(model=m,report=information_panel(m))))",
    ],
    { encoding: 'utf8' }
  )
);
class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.value = '';
    this.open = false;
    this.events = {};
  }
  set innerHTML(html) {
    this.children = [];
    for (const m of html.matchAll(/<(button|p|div|input)[^>]*id="([^"]+)"/g)) {
      const n = new Node(m[1]);
      n.id = m[2];
      this.append(n);
    }
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  after(...nodes) {
    this.siblings = nodes;
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  all() {
    return this.children.flatMap((n) => [n, ...n.all()]);
  }
  querySelector(s) {
    return this.all().find((n) => n.id === s.slice(1));
  }
  querySelectorAll(s) {
    return this.all().filter((n) => n.tagName === s.toUpperCase());
  }
  addEventListener(name, fn) {
    this.events[name] = fn;
  }
}
function dom() {
  const previous = globalThis.document,
    anchor = new Node('div');
  globalThis.document = { createElement: (tag) => new Node(tag), getElementById: () => anchor, activeElement: null };
  return {
    anchor,
    restore() {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

test('native information op is mounted in Analysis and allowed on warm desktop workers', () => {
  assert.ok(REUSABLE_OPERATIONS.has('information-panel'));
  const app = readAppSource(),
    main = readDesktopSource();
  matchSource(app, /new InformationPanel\(\{\.\.\.numericContext,run,api\}\)/);
  matchSource(app, /informationPanel\?\.invalidate\(\)/);
  matchSource(main, /allowed.add\('information-panel'\)/);
});
test('CSV quotes every field, escapes quotes and preserves embedded comma, newline, unicode and zero', () => {
  const rows = [
    ['Type', 'Value'],
    ['face, "star"', '36°\ncycle'],
    ['genus', 0],
  ];
  assert.equal(informationCSV(rows), '"Type","Value"\r\n"face, ""star""","36°\ncycle"\r\n"genus","0"\r\n');
  assert.equal(informationText(rows), 'Type\tValue\nface, "star"\t36°\ncycle\ngenus\t0\n');
});
test('native two-face-type report exports counts, angles, adjacency, undefined insphere and dimensional units', () => {
  const rows = informationRows(packet.report, 'mm'),
    csv = informationCSV(rows);
  assert.match(csv, /"inradius","not defined"/);
  assert.match(csv, /"Dihedral: face types 1 \/ 2"/);
  assert.ok(rows.some((r) => r[0] === 'face type 1' && r[2] === 'Interior angles'));
  assert.ok(rows.some((r) => r[0] === 'face type 2' && r[2] === 'Area' && r[4].startsWith('mm^2')));
  assert.ok(rows.some((r) => r[2] === 'Surface genus' && r[3] === '0'));
  assert.ok(rows.some((r) => r[2] === 'Intrinsic content' && r[4] === 'mm^3'));
});
test('mounted collapsible inspector computes actual native report and clears it on navigation', async () => {
  const d = dom(),
    f = numericControlFixture(Object.prototype, {});
  f.state.model = packet.model;
  try {
    const calls = [],
      control = new InformationPanel({
        ...f.context,
        run: async (op, params, model, label, options) => {
          calls.push(op);
          assert.ok(options.signal);
          return structuredClone(packet.report);
        },
      });
    assert.equal(d.anchor.siblings[0], control.panel);
    assert.equal(control.node('csv').disabled, true);
    control.panel.open = true;
    await control.panel.events.toggle();
    await flush();
    assert.deepEqual(calls, ['information-panel']);
    assert.ok(control.node('table').children[0].children.length > 15);
    assert.equal(control.node('copy').disabled, false);
    control.invalidate();
    assert.equal(control.reply, null);
    assert.equal(control.node('table').children.length, 0);
    assert.equal(control.node('csv').disabled, true);
  } finally {
    d.restore();
  }
});
for (const change of ['source', 'navigation', 'cancel'])
  test(`information query cannot publish after ${change}`, async () => {
    const f = numericControlFixture(Object.prototype, {}),
      gate = deferred(),
      session = new SourceMeasurementSession(f.context);
    const pending = session.run('information-panel', {}, () => gate.promise, 'Measure');
    if (change === 'source') f.state.model.vertices[0][0] += 0.01;
    else if (change === 'navigation') f.document.cursor = 1;
    else session.cancel();
    gate.resolve(packet.report);
    await assert.rejects(pending, /changed|canceled|superseded|Choose a source/);
  });
test('CSV destination review aborts its ticket if the source changes before writing', async () => {
  const d = dom(),
    f = numericControlFixture(Object.prototype, {}),
    gate = deferred(),
    calls = [];
  try {
    const control = new InformationPanel({
      ...f.context,
      run: async () => structuredClone(packet.report),
      api: {
        beginTextExport: () => gate.promise,
        writeTextExport: async () => calls.push('write'),
        abortTextExport: async (id) => calls.push('abort ' + id),
      },
    });
    await control.refresh();
    const pending = control.export('csv');
    await flush();
    f.state.model.vertices[0][0] += 0.1;
    gate.resolve({ id: 'ticket' });
    await assert.rejects(pending, /changed/);
    assert.deepEqual(calls, ['abort ticket']);
  } finally {
    d.restore();
  }
});
test('mounted stereo controls evaluate expressions together and preserve geometry', async () => {
  const d = dom(),
    f = numericControlFixture(Object.prototype, {}),
    calls = [];
  Object.assign(f.context, { display: () => calls.push('display'), markDirty: () => calls.push('dirty') });
  try {
    const control = new StereoControls(f.context, d.anchor);
    control.sync();
    const inputs = control.inputs(),
      before = structuredClone(f.state.model);
    assert.deepEqual(
      inputs.map((n) => n.value),
      ['0.064', '5']
    );
    inputs[0].value = '1/2';
    inputs[1].value = '2+3';
    await inputs[0].onchange();
    assert.equal(f.state.view.stereoEyeSeparation, 0.5);
    assert.equal(f.state.view.stereoConvergence, 5);
    assert.deepEqual(calls, ['display', 'dirty']);
    assert.deepEqual(f.state.model, before);
    inputs[0].value = '2';
    await assert.rejects(control.apply(), /domain/);
    assert.equal(f.state.view.stereoEyeSeparation, 0.5);
    f.setExport(true);
    control.sync();
    assert.ok(inputs.every((n) => n.disabled));
    await assert.rejects(control.apply(), /export/);
  } finally {
    d.restore();
  }
});
test('stereo numeric edit refuses source changes during native expression evaluation', async () => {
  const d = dom(),
    f = numericControlFixture(Object.prototype, {}),
    gate = deferred();
  f.context.evaluateMany = () => gate.promise;
  try {
    const control = new StereoControls(
      {
        ...f.context,
        display() {
          assert.fail('stale display');
        },
        markDirty() {
          assert.fail('stale dirty');
        },
      },
      d.anchor
    );
    control.sync();
    const pending = control.apply();
    f.state.model.vertices[0][0] += 0.1;
    gate.resolve([0.1, 4]);
    await assert.rejects(pending, /changed/);
    assert.equal(f.state.view.stereoEyeSeparation, undefined);
  } finally {
    d.restore();
  }
});
