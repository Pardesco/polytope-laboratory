import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  GoursatWythoffControls,
  GOURSAT_FIXTURES,
  SCHWARZ_FIXTURES,
  appendGeneratedTranches,
} from '../ui/goursat-wythoff-controls.mjs';
import { CONSTRUCT_TOOLS, matchesConstructTool } from '../ui/construct-gallery.mjs';
import { generateConstruction } from '../ui/construction-workflow.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';

function fixture() {
  const f = numericControlFixture(GoursatWythoffControls.prototype, {
    'goursat-wythoff-choice': 'goursat-wythoff-gax',
    'generate-goursat-wythoff': '',
    'goursat-wythoff-result': '',
    'goursat-wythoff-evidence': '',
  });
  Object.assign(f.result, {
    name: 'Grand hexacosichoron',
    vertices: [],
    edges: [],
    faces: [],
    cells: [],
    metadata: { goursatVerification: { status: 'passed' } },
    provenance: { goursatQualification: { algorithmVersion: '1' } },
  });
  return f;
}
const observed = (p) =>
  p.then(
    (value) => ({ value }),
    (error) => ({ error })
  );

test('the ordinary gallery exposes the bounded Goursat tranche with retained rational symbols', () => {
  assert.equal(GOURSAT_FIXTURES.length, 79);
  assert.equal(GOURSAT_FIXTURES.filter((row) => row.regular).length, 10);
  assert.equal(SCHWARZ_FIXTURES.length, 63);
  assert.ok(SCHWARZ_FIXTURES.some((row) => row.key === 'schwarz-wythoff-u39' && row.symbol === '2 5/2 5|'));
  const tool = CONSTRUCT_TOOLS.find((row) => row.id === 'goursat-wythoff-settings');
  assert.equal(tool.category, 4);
  assert.ok(matchesConstructTool(tool, 'Goursat stars'));
  assert.equal(tool.primary, 'generate-goursat-wythoff');
  const app = readAppSource(),
    layout = readFileSync(new URL('../ui/inspector-layout.mjs', import.meta.url), 'utf8');
  matchSource(app, /new GoursatWythoffControls/);
  matchSource(app, /goursatWythoffControls\?\.sync\(\)/);
  matchSource(app, /goursatWythoffControls.cancel\(\)/);
  matchSource(layout, /GENERATORS.add\('goursat-wythoff-settings'\)/);
});

test('mounted controls keep common actions visible and advanced evidence collapsed', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let mounted,
    guarded = 0;
  const nodes = new Map(),
    node = (id) => {
      if (!nodes.has(id))
        nodes.set(id, {
          value: '',
          disabled: false,
          children: [],
          append(child) {
            this.children.push(child);
          },
        });
      return nodes.get(id);
    };
  const panel = { querySelector: (selector) => node(selector.slice(1)), querySelectorAll: () => [...nodes.values()] };
  try {
    globalThis.document = {
      createElement: (tag) => (tag === 'details' ? panel : {}),
      getElementById: (id) => {
        assert.equal(id, 'uniform-family-settings');
        return { after: (value) => (mounted = value) };
      },
    };
    new GoursatWythoffControls({
      guard: (fn) => {
        guarded++;
        return fn;
      },
      isExporting: () => false,
    });
    assert.equal(mounted, panel);
    assert.equal(panel.id, 'goursat-wythoff-settings');
    assert.equal(guarded, 1);
    assert.equal(node('goursat-wythoff-choice').children.length, 142);
    assert.ok(node('goursat-wythoff-choice').children.some((row) => row.textContent.includes('5/2')));
    assert.match(panel.innerHTML, /<details><summary>Construction evidence/);
    assert.doesNotMatch(panel.innerHTML, /data-expert|<input| open/);
    assert.match(node('goursat-wythoff-queue').textContent, /7 unregistered/);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('generation uses existing document construction and renders bound native evidence', async () => {
  const f = fixture(),
    before = structuredClone(f.state);
  await f.control.generate();
  assert.deepEqual(f.calls, [['regular', { key: 'goursat-wythoff-gax' }]]);
  assert.equal(f.expressionCalls.length, 0);
  assert.ok(f.options[0].signal instanceof AbortSignal);
  assert.deepEqual(f.state, before);
  assert.equal(f.control.busy, false);
  assert.match(f.nodes['goursat-wythoff-result'].textContent, /Last generated: Grand hexacosichoron/);
  assert.match(f.nodes['goursat-wythoff-evidence'].textContent, /"status": "passed"/);
});

test('unsupported choices, export and duplicate requests refuse without publication', async () => {
  for (const change of [
    (f) => (f.nodes['goursat-wythoff-choice'].value = 'unregistered'),
    (f) => f.setExport(true),
    (f) => (f.control.busy = true),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(f.control.generate());
    assert.equal(f.calls.length, 0);
  }
});

test('held generation rejects cancellation and changes to source, workspace, units, notes or choice', async () => {
  for (const change of [
    (f) => f.control.cancel(),
    (f) => (f.state.model.vertices[0][0] = 4),
    (f) => (f.state.notes = 'edited'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => f.setProject({ ...f.project }),
    (f) => (f.nodes['goursat-wythoff-choice'].value = 'goursat-wythoff-fix'),
    (f) => f.setExport(true),
  ]) {
    const f = fixture(),
      gate = deferred();
    let published = false;
    f.context.generate = async (_kind, _params, opts) => {
      await gate.promise;
      opts.verifyPublication();
      published = true;
      return f.result;
    };
    const pending = observed(f.control.generate());
    await flush();
    change(f);
    gate.resolve();
    assert.ok((await pending).error);
    assert.equal(published, false);
    assert.equal(f.control.busy, false);
    assert.equal(f.control.controller, null);
  }
});

test('failure unlocks controls and allows a successful retry', async () => {
  const f = fixture(),
    generate = f.context.generate;
  f.context.generate = async () => {
    throw Error('Native reflection unresolved');
  };
  await assert.rejects(f.control.generate(), /unresolved/);
  assert.match(f.nodes['goursat-wythoff-result'].textContent, /Construction failed/);
  f.context.generate = generate;
  await f.control.generate();
  assert.match(f.nodes['goursat-wythoff-result'].textContent, /numerical checks passed/);
});

test('corpus supplement shows symbols, definition hashes and queue without promoting baseline counts', async () => {
  const make = (tag, id, text) => ({
      tag,
      id,
      textContent: text,
      children: [],
      append(...rows) {
        this.children.push(...rows);
      },
    }),
    summary = make('div'),
    opened = [];
  const control = { make, summary, guard: (fn) => fn, open: async (row) => opened.push(row) };
  appendGeneratedTranches(control, {
    generatedTranches: [
      {
        id: 'goursat-h4-stars-1',
        label: 'Goursat H4 stars, tranche 1',
        registeredGeneratedIdentities: 16,
        scope: 'Zero new baseline identities.',
        manifestSha256: 'a'.repeat(64),
        entries: [
          {
            key: 'goursat-wythoff-gax',
            name: 'Grand hexacosichoron',
            coxeterDynkinSymbol: 'x3o3o5/2o',
            definitionCurrent: true,
            identity: 'regular4:gax',
            status: 'registered-generated-rechecked-on-load',
            definitionSha256: 'b'.repeat(64),
          },
        ],
        queue: [{ symbol: 'x3o3o5/2x', reason: 'Unregistered seed.' }],
      },
    ],
  });
  const root = summary.children[0],
    button = root.children.find((row) => row.tag === 'button');
  await button.onclick();
  assert.deepEqual(opened, [{ key: 'goursat-wythoff-gax', name: 'Grand hexacosichoron' }]);
  assert.match(button.textContent, /5\/2/);
  assert.match(root.children[1].textContent, /Zero new baseline/);
  assert.match(root.children[2].textContent, /SHA-256/);
  assert.match(root.children.at(-1).children[0].textContent, /1 unqualified/);
});

test('native renderer-to-engine path publishes the validated source as an ordinary history document', async () => {
  const f = fixture();
  let added;
  f.context.generate = (kind, params, options) =>
    generateConstruction(
      {
        getProject: () => f.project,
        isExporting: () => false,
        run: async (op, parameters) =>
          JSON.parse(
            execFileSync(
              'python',
              [
                '-c',
                'import json,sys; from engine.server import dispatch; print(json.dumps(dispatch(json.load(sys.stdin))))',
              ],
              { input: JSON.stringify({ op, params: parameters }), encoding: 'utf8' }
            )
          ),
        addDocument: (model, label) => {
          added = { model, label };
        },
      },
      kind,
      params,
      'Goursat star Wythoff',
      options
    );
  const model = await f.control.generate();
  assert.equal(model, added.model);
  assert.equal(added.label, 'Goursat star Wythoff');
  assert.deepEqual(
    ['vertices', 'edges', 'faces', 'cells'].map((k) => model[k].length),
    [120, 720, 1200, 600]
  );
  assert.equal(model.metadata.goursatVerification.regularFlagAction.reachedFlags, 14400);
  assert.match(f.nodes['goursat-wythoff-evidence'].textContent, /coordinateSha256/);
});

test('Schwarz generation uses the same guarded document path and displays its own evidence', async () => {
  const f = fixture();
  let added;
  f.nodes['goursat-wythoff-choice'].value = 'schwarz-wythoff-u39';
  f.context.generate = (kind, params, options) =>
    generateConstruction(
      {
        getProject: () => f.project,
        isExporting: () => false,
        run: async (op, parameters) =>
          JSON.parse(
            execFileSync(
              'python',
              [
                '-c',
                'import json,sys; from engine.server import dispatch; print(json.dumps(dispatch(json.load(sys.stdin))))',
              ],
              { input: JSON.stringify({ op, params: parameters }), encoding: 'utf8' }
            )
          ),
        addDocument: (model, label) => {
          added = { model, label };
        },
      },
      kind,
      params,
      'Schwarz Wythoff',
      options
    );
  const model = await f.control.generate();
  assert.equal(model, added.model);
  assert.equal(added.label, 'Schwarz Wythoff');
  assert.equal(model.dimension, 3);
  assert.equal(model.metadata.schwarzVerification.vertexTransitive, true);
  assert.match(f.nodes['goursat-wythoff-evidence'].textContent, /uniform3:U39/);
  assert.match(f.nodes['goursat-wythoff-evidence'].textContent, /orderedFaceCyclesMatched/);
});
