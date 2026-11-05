import test from 'node:test';
import assert from 'node:assert/strict';
import {createStatus} from '../ui/status.mjs';

function fixture() {
  const shown = [], status = createStatus(text => shown.push(text));
  return {status, shown};
}

test('the current operation reports its completion once', () => {
  const {status, shown} = fixture(), token = status.set('Analyze incidence…');
  assert.equal(status.complete(token, 'Analyze incidence completed'), true);
  assert.equal(status.complete(token, 'Repeated completion'), false);
  assert.deepEqual(shown, ['Analyze incidence…', 'Analyze incidence completed']);
});

test('opening or saving remains visible when earlier background work completes', () => {
  for (const action of ['Opened project.polyproj', 'Saved project.polyproj']) {
    const {status, shown} = fixture(), analyze = status.set('Analyze incidence…');
    const section = status.set('Compute section…');
    status.set(action);
    assert.equal(status.complete(analyze, 'Analyze incidence completed'), false);
    assert.equal(status.complete(section, 'Compute section completed'), false);
    assert.equal(shown.at(-1), action);
  }
});

test('out-of-order concurrent completions cannot replace the newer operation', () => {
  const {status, shown} = fixture(), first = status.set('First…'), second = status.set('Second…');
  assert.equal(status.complete(first, 'First completed'), false);
  assert.equal(shown.at(-1), 'Second…');
  assert.equal(status.complete(second, 'Second completed'), true);
  assert.equal(status.complete(first, 'First completed'), false);
  assert.equal(shown.at(-1), 'Second completed');
});

test('an error or cancellation diagnosis is preserved after outstanding work returns', () => {
  const {status, shown} = fixture(), token = status.set('Construct…');
  status.set('Construction cancelled');
  assert.equal(status.complete(token, 'Construct completed'), false);
  assert.equal(shown.at(-1), 'Construction cancelled');
});

test('queued completion after an explicit action cannot publish in the next microtask', async () => {
  const {status, shown} = fixture(), token = status.set('Analyze incidence…');
  const pending = Promise.resolve().then(() => status.complete(token, 'Analyze incidence completed'));
  status.set('Opened project.polyproj');
  assert.equal(await pending, false);
  assert.equal(shown.at(-1), 'Opened project.polyproj');
});

test('another status instance cannot complete this instance, even with matching messages', () => {
  const a = fixture(), b = fixture();
  const alien = a.status.set('Analyze…');
  b.status.set('Analyze…');
  for (const token of [alien, undefined, null, {}]) assert.equal(b.status.complete(token, 'Wrong'), false);
  assert.equal(b.shown.at(-1), 'Analyze…');
});

test('quick deferred work never replaces the visible status; slow work reports progress and completion', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {status, shown} = fixture();
  status.set('Opened project.polyproj');
  const quick = status.defer('Evaluate section…');
  assert.equal(status.settle(quick), false);
  t.mock.timers.tick(1000);
  assert.deepEqual(shown, ['Opened project.polyproj']);
  const slow = status.defer('Evaluate section…');
  t.mock.timers.tick(400);
  assert.equal(shown.at(-1), 'Evaluate section…');
  assert.equal(status.settle(slow), true);
  assert.equal(status.complete(slow, 'Evaluate section completed in 0.50 s'), true);
  assert.equal(shown.at(-1), 'Evaluate section completed in 0.50 s');
});

test('a deferred message stays hidden once newer status is set, and a stale-load diagnosis can still report', t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {status, shown} = fixture(), token = status.defer('Open…');
  status.set('Saved project.polyproj');
  t.mock.timers.tick(1000);
  assert.equal(shown.at(-1), 'Saved project.polyproj');
  assert.equal(status.complete(token, 'File loading canceled'), false);
  const loading = status.defer('Open…');
  assert.equal(status.complete(loading, 'File loading canceled'), true);
  t.mock.timers.tick(1000);
  assert.equal(shown.at(-1), 'File loading canceled');
});
