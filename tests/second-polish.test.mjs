import test from 'node:test';
import assert from 'node:assert/strict';
import { orderAnalysisGroups } from '../ui/analysis-order.mjs';
import { GUIDE_TOPICS, GROUP_GUIDE_TOPICS, guideContext } from '../ui/user-guide.mjs';
import { LATE_GROUP_TOPICS } from '../ui/late-feature-guide.mjs';
import { UniformCompoundControls } from '../ui/uniform-compound-controls.mjs';
import { IncidenceTruncationControls } from '../ui/incidence-truncation-controls.mjs';
import { InformationPanel } from '../ui/information-panel.mjs';
import { PolychoronRelationshipControls } from '../ui/polychoron-relationships.mjs';
import { SourceMeasurementSession } from '../ui/source-measurement-session.mjs';
import { numericControlFixture, deferred } from './numeric-control-fixture.mjs';
import { mediaControls } from '../ui/media-export-options.mjs';

test('Analysis orders summary, types, measurements and related evidence without replacing controls', () => {
  const ids = [
    'analysis',
    'polychoron-relationships',
    'library-related',
    'information-panel',
    'element-types',
    'selection-details',
  ];
  const children = ids.map((id) => ({
    id,
    handler: () => id,
    after(node) {
      children.splice(children.indexOf(node), 1);
      children.splice(children.indexOf(this) + 1, 0, node);
    },
  }));
  const nodes = new Map(children.map((n) => [n.id, n]));
  orderAnalysisGroups({ getElementById: (id) => nodes.get(id) });
  assert.deepEqual(
    children.map((n) => n.id),
    [
      'analysis',
      'element-types',
      'information-panel',
      'library-related',
      'polychoron-relationships',
      'selection-details',
    ]
  );
  for (const n of children) assert.equal(n.handler(), n.id);
  orderAnalysisGroups({ getElementById: (id) => nodes.get(id) });
  assert.equal(children[2], nodes.get('information-panel'));
});

test('late group help resolves specific offline tasks, including star evidence inside Element types', () => {
  for (const [id, topic] of Object.entries(LATE_GROUP_TOPICS)) {
    assert.equal(GROUP_GUIDE_TOPICS[id], topic);
    assert.equal(guideContext({ id }), topic);
    assert.equal(guideContext({ id: '', parentElement: { id } }), topic);
    const task = GUIDE_TOPICS.find((t) => t.id === topic);
    assert.ok(task.steps.length >= 3);
    assert.ok(task.tips);
  }
  assert.equal(guideContext({ id: 'star-uniform4-evidence', closest: () => ({}) }), 'star-polychora');
  assert.equal(
    guideContext({ id: '', dataset: { guideTopic: 'media-export' }, parentElement: { id: 'animation-settings' } }),
    'media-export'
  );
  assert.match(mediaControls('tour'), /<details data-guide-topic="media-export"><summary>Export options<\/summary>/);
});

test('UC edits and incidence previews explain disabled actions and clear reasons when available', () => {
  const f = numericControlFixture(UniformCompoundControls.prototype, {
    'uc-number': '20',
    'uc-angle': '17',
    'uc-n': '5',
    'uc-d': '1',
    'uc-k': '2',
    'uc-angle-row': '',
    'uc-polygon-options': '',
    'uc-create': '',
    'uc-apply': '',
  });
  for (const [id, node] of Object.entries(f.nodes)) node.id = id;
  f.control.source = f.state.model;
  f.control.sync();
  assert.match(f.nodes['uc-apply'].title, /Open or create/);
  f.state.model.metadata.ucNumber = 20;
  f.control.sync();
  assert.equal(f.nodes['uc-apply'].title, '');
  f.setExport(true);
  f.control.sync();
  assert.match(f.nodes['uc-create'].title, /export/);
  const g = numericControlFixture(IncidenceTruncationControls.prototype, {
    'incidence-cut-preset': 'manual',
    'incidence-cut-amount': '1/3',
    'incidence-cut-reference': '',
    'incidence-cut-colors': 'inherit',
    'preview-incidence-cut': '',
    'adopt-incidence-cut': '',
    'cancel-incidence-cut': '',
    'incidence-cut-result': '',
  });
  for (const [id, node] of Object.entries(g.nodes)) node.id = id;
  g.control.sync();
  assert.match(g.nodes['adopt-incidence-cut'].title, /Preview the current source/);
  assert.match(g.nodes['incidence-cut-reference'].title, /3D regular-face presets/);
  g.state.model.dimension = 2;
  g.control.sync();
  assert.match(g.nodes['preview-incidence-cut'].title, /closed intrinsic 3D/);
});

function informationFixture() {
  const f = numericControlFixture(InformationPanel.prototype, {
    'information-refresh': '',
    'information-copy': '',
    'information-csv': '',
    'information-status': '',
    'information-table': '',
  });
  for (const node of Object.values(f.nodes)) {
    node.textContent = '';
    node.replaceChildren = () => {};
  }
  f.control.session = new SourceMeasurementSession(f.context);
  f.control.render = () => {
    f.nodes['information-status'].textContent = 'Measurements ready.';
  };
  return f;
}

test('measurement progress stays silent for fast work and appears only after 400 ms', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = informationFixture(),
    hold = deferred();
  f.context.run = () => hold.promise;
  const work = f.control.refresh();
  t.mock.timers.tick(399);
  assert.equal(f.nodes['information-status'].textContent, '');
  t.mock.timers.tick(1);
  assert.match(f.nodes['information-status'].textContent, /Computing/);
  hold.resolve({});
  await work;
  t.mock.timers.tick(1000);
  assert.equal(f.nodes['information-status'].textContent, 'Measurements ready.');
  const fast = f.control.refresh();
  await fast;
  t.mock.timers.tick(1000);
  assert.equal(f.nodes['information-status'].textContent, 'Measurements ready.');
});

test('measurement invalidation retires deferred progress even when native work finishes late', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = informationFixture(),
    hold = deferred();
  f.context.run = () => hold.promise;
  const work = f.control.refresh();
  f.control.invalidate();
  t.mock.timers.tick(1000);
  assert.equal(f.nodes['information-status'].textContent, 'Open or compute to measure the current source.');
  hold.resolve({});
  await assert.rejects(work, /canceled|superseded/);
  assert.equal(f.control.reply, null);
});

test('vertex-link progress is deferred and cannot overwrite cancellation or a newer result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hold = deferred(),
    state = { model: { dimension: 4 } },
    output = { textContent: '' };
  const control = Object.assign(Object.create(PolychoronRelationshipControls.prototype), {
    sequence: 0,
    getState: () => state,
    output,
    run: () => hold.promise,
  });
  const work = control.check();
  t.mock.timers.tick(399);
  assert.equal(output.textContent, '');
  t.mock.timers.tick(1);
  assert.match(output.textContent, /Checking/);
  control.cancel();
  t.mock.timers.tick(1000);
  assert.equal(output.textContent, 'Relationship check canceled.');
  hold.resolve({});
  assert.equal(await work, null);
  assert.equal(output.textContent, 'Relationship check canceled.');
});
