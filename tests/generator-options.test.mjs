import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { BasicSolidControls } from '../ui/basic-solid-controls.mjs';
import { WatermanControls } from '../ui/waterman-controls.mjs';
import { StepPrismControls } from '../ui/step-prism-controls.mjs';
import { TorusControls } from '../ui/torus-controls.mjs';
import { adjacentStepPrism } from '../ui/generator-sequences.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
const basic = () => {
  const f = numericControlFixture(BasicSolidControls.prototype, {
    'basic-kind': 'block',
    'basic-dimensions': '3,2,1',
    'basic-block-subdivisions': '3,2,1',
    'basic-grid-shape': 'hexagon',
    'basic-fold-angle': '60',
    'basic-sides': '3,4,5',
    'basic-height': '2',
    'basic-shear': '1,0',
    'basic-subdivisions': '2',
    'basic-edge-length': '1',
    'basic-unit': 'mm',
    'basic-generate': '',
    'basic-status': '',
    ...Object.fromEntries(['01', '02', '03', '12', '13', '23'].map((edge) => ['basic-edge' + edge, '1'])),
  });
  const query = f.panel.querySelectorAll;
  f.panel.querySelectorAll = (selector) => (selector === '.basic-input-row' ? [] : query(selector));
  return f;
};
const waterman = () =>
  numericControlFixture(WatermanControls.prototype, {
    'waterman-mode': 'exact-sphere',
    'waterman-lattice': 'SC',
    'waterman-origin': 'custom',
    'waterman-increment': '1/4',
    'waterman-sequence': 'increment',
    'waterman-root': '5',
    'waterman-radius-squared': '3/4',
    'waterman-x': '1/2',
    'waterman-y': '1/2',
    'waterman-z': '1/2',
    'waterman-root-row': '',
    'waterman-radius-row': '',
    'waterman-x-row': '',
    'waterman-y-row': '',
    'waterman-z-row': '',
    'waterman-next': '',
    'waterman-previous': '',
    'generate-waterman': '',
  });
const step = () =>
  numericControlFixture(StepPrismControls.prototype, {
    'step-prism-kind': 'gyrochoron',
    'step-prism-n': '6',
    'step-prism-step': '-2',
    'step-prism-radius': '1',
    'step-prism-previous': '',
    'step-prism-next': '',
    'generate-step-prism': '',
  });
const torus = () =>
  numericControlFixture(TorusControls.prototype, {
    'torus-ring-segments': '7',
    'torus-arm-segments': '5',
    'torus-twist': '-2',
    'torus-arm-ratio': '1/2',
    'torus-ring-radius': '1',
    'generate-torus': '',
  });

test('basic block, hexagon fold and prism controls evaluate vectors and dispatch complete new documents', async () => {
  const f = basic();
  await f.control.generate();
  assert.deepEqual(f.calls[0], ['block', { dimensions: [3, 2, 1], subdivisions: [3, 2, 1], coordinate_unit: 'mm' }]);
  f.nodes['basic-kind'].value = 'triangular-grid';
  await f.control.generate();
  assert.deepEqual(f.calls[1], [
    'triangular-grid',
    { subdivisions: 2, edge_length: 1, fold_angle: 60, shape: 'hexagon', coordinate_unit: 'mm' },
  ]);
  f.nodes['basic-kind'].value = 'triangular-prism';
  await f.control.generate();
  assert.deepEqual(f.calls[2], [
    'triangular-prism',
    { sides: [3, 4, 5], height: 2, shear: [1, 0], coordinate_unit: 'mm' },
  ]);
  f.nodes['basic-kind'].value = 'edge-tetrahedron';
  await f.control.generate();
  assert.deepEqual(f.calls[3], ['edge-tetrahedron', { edges: [1, 1, 1, 1, 1, 1], coordinate_unit: 'mm' }]);
});

test('block vector subdivisions enforce integer values and folded grid refuses invalid UI selections', async () => {
  for (const value of ['1,0,1', '1,3/2,1', '1,33,1']) {
    const f = basic();
    f.nodes['basic-block-subdivisions'].value = value;
    await assert.rejects(f.control.generate());
    assert.equal(f.calls.length, 0);
  }
  const f = basic();
  f.nodes['basic-kind'].value = 'triangular-grid';
  f.nodes['basic-grid-shape'].value = 'sphere';
  await assert.rejects(f.control.generate(), /boundary/);
  assert.equal(f.calls.length, 0);
});

test('lattice and torus twist choices publish actual native parameters with signed twist preserved', async () => {
  for (const lattice of ['SC', 'BCC']) {
    const f = waterman();
    f.nodes['waterman-lattice'].value = lattice;
    await f.control.generate();
    assert.deepEqual(f.calls, [
      ['waterman-lattice', { radius_squared: '3/4', center: ['1/2', '1/2', '1/2'], lattice }],
    ]);
  }
  const f = torus();
  await f.control.generate();
  assert.equal(f.calls[0][1].twist, -2);
  f.nodes['torus-twist'].value = '3/2';
  await assert.rejects(f.control.generate());
  assert.equal(f.calls.length, 1);
});

test('Waterman radius sequence uses native rational expressions and updates threshold only after success', async () => {
  const f = waterman();
  f.context.evaluateMany = async (parts, options) => {
    assert.equal(options.mode, 'rational');
    assert.deepEqual(parts, ['(3/4)+(1)*(1/4)', '1/4', '1/2', '1/2', '1/2']);
    return ['1', '1/4', '1/2', '1/2', '1/2'];
  };
  await f.control.generate(1);
  assert.equal(f.calls[0][1].radius_squared, '1');
  assert.equal(f.nodes['waterman-radius-squared'].value, '1');
  const g = waterman();
  g.context.evaluateMany = async () => ['1', '1/4', '1/2', '1/2', '1/2'];
  g.context.generate = async () => {
    throw Error('No full-dimensional hull');
  };
  await assert.rejects(g.control.generate(1), /hull/);
  assert.equal(g.nodes['waterman-radius-squared'].value, '3/4');
});

test('radius sequence refuses nonpositive thresholds/increments and centered root steps remain FCC', async () => {
  for (const values of [
    ['0', '1/4', '0', '0', '0'],
    ['1', '0', '0', '0', '0'],
    ['1', '-1/4', '0', '0', '0'],
  ]) {
    const f = waterman();
    f.context.evaluateMany = async () => values;
    await assert.rejects(f.control.generate(-1));
    assert.equal(f.calls.length, 0);
  }
  const f = waterman();
  f.nodes['waterman-mode'].value = 'author-root';
  f.context.evaluateMany = async (parts) => {
    assert.deepEqual(parts, ['(5)+(-1)']);
    return ['4'];
  };
  await f.control.generate(-1);
  assert.deepEqual(f.calls, [['waterman-root', { root: 4 }]]);
  assert.equal(f.nodes['waterman-root'].value, '4');
});

test('step sequence preserves signed labels, crosses n boundaries and skips rank-deficient frequencies', () => {
  assert.deepEqual(adjacentStepPrism(6, -2, 1), [6, -4]);
  assert.deepEqual(adjacentStepPrism(5, 3, 1), [6, 2]);
  for (let n = 5; n <= 128; n++)
    for (let d = 2; d < n - 1; d++)
      if (2 * d !== n) {
        if (n === 128 && d === 126) continue;
        const next = adjacentStepPrism(n, d, 1);
        assert.notEqual(2 * next[1], next[0]);
        assert.deepEqual(adjacentStepPrism(...next, -1), [n, d]);
      }
  for (const args of [
    [5, 2, -1],
    [128, 126, 1],
    [true, 2, 1],
    [5, 0, 1],
    [129, 2, 1],
  ])
    assert.throws(() => adjacentStepPrism(...args));
});

test('step sequence controls generate gyrochora and disallow expressions only during navigation', async () => {
  const f = step();
  await f.control.advance(1);
  assert.deepEqual(f.calls, [['gyrochoron', { n: 6, step: -4, radius: 1 }]]);
  f.nodes['step-prism-n'].value = '2+3';
  await assert.rejects(f.control.advance(1), /literal integers/);
  f.nodes['step-prism-step'].value = '2';
  await f.control.generate();
  assert.deepEqual(f.calls[1], ['gyrochoron', { n: 5, step: 2, radius: 1 }]);
  f.setExport(true);
  await assert.rejects(f.control.advance(1), /export/);
});

for (const [name, fixture, field] of [
  ['block', basic, 'basic-block-subdivisions'],
  ['lattice', waterman, 'waterman-lattice'],
  ['twist', torus, 'torus-twist'],
  ['gyrochoron', step, 'step-prism-kind'],
]) {
  test(`${name}: cancel and changed option fields prevent stale native publication`, async () => {
    const f = fixture(),
      hold = deferred();
    f.context.evaluateMany = () => hold.promise;
    const running = f.control.generate();
    f.control.cancel();
    await assert.rejects(running, { name: 'AbortError' });
    assert.equal(f.control.busy, false);
    const g = fixture(),
      wait = deferred();
    g.context.generate = async (kind, params, options) => {
      await wait.promise;
      options.verifyPublication();
      g.calls.push([kind, params]);
      return g.result;
    };
    const pending = g.control.generate();
    await flush();
    g.nodes[field].value = field === 'waterman-lattice' ? 'BCC' : 'changed';
    wait.resolve();
    await assert.rejects(pending, /target fields/);
    assert.equal(g.calls.length, 0);
  });
}

test('new controls mount in existing Construct sections and wire the added buttons/presets', async () => {
  const previous = globalThis.document;
  try {
    for (const [Controller, fixture, anchor, id] of [
      [BasicSolidControls, basic, 'generator', 'basic-generate'],
      [WatermanControls, waterman, 'podia-settings', 'waterman-next'],
      [StepPrismControls, step, 'antiprism-settings', 'step-prism-next'],
      [TorusControls, torus, 'step-prism-settings', 'generate-torus'],
    ]) {
      const f = fixture(),
        inserted = [];
      f.panel.insertAdjacentHTML = (position, html) => {
        f.panel.extra = html;
      };
      const placement = { after: (panel) => inserted.push(panel), before: (panel) => inserted.push(panel) };
      placement.closest = () => placement;
      globalThis.document = {
        createElement: () => f.panel,
        getElementById: (key) => (key === anchor ? placement : null),
      };
      const mounted = new Controller(f.context);
      assert.equal(inserted[0], f.panel);
      assert.equal(typeof f.nodes[id].onclick, 'function');
      assert.equal(mounted.panel.open, undefined);
      if (Controller === WatermanControls) {
        f.nodes['waterman-origin'].value = '1,0,0';
        f.nodes['waterman-origin'].onchange();
        assert.deepEqual(
          ['x', 'y', 'z'].map((k) => f.nodes['waterman-' + k].value),
          ['1', '0', '0']
        );
      }
    }
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('actual native expression-to-generation dispatch covers new controls without Electron', () => {
  const script = `import json
from engine.server import dispatch
out=[]
for kind,params in [('block',{'dimensions':[3,2,1],'subdivisions':[3,2,1]}),('torus',{'ring_segments':7,'arm_segments':5,'twist':-2}),('gyrochoron',{'n':8,'step':3}),('waterman-lattice',{'lattice':'SC','radius_squared':'3/4','center':['1/2']*3})]:
 m=dispatch({'op':'generate','params':{'kind':kind,**params}});out.append([len(m[k]) for k in ('vertices','edges','faces','cells')])
print(json.dumps(out))`;
  const result = JSON.parse(execFileSync('python', ['-c', script], { encoding: 'utf8', windowsHide: true }));
  assert.deepEqual(result, [
    [24, 44, 22, 0],
    [35, 105, 70, 0],
    [16, 32, 24, 8],
    [8, 12, 6, 0],
  ]);
});
