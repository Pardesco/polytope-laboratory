import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { WHATS_NEW_LINKS } from '../ui/guide-refresh.mjs';
import { FEATURE_ACTION_INDEX } from '../ui/guide-action-index.mjs';
import { GUIDE_CONTROLS } from '../ui/guide-control-index.mjs';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test('mounted Guide, contextual help, Welcome, menu action and live command/shortcut indexes work offline', async (t) => {
  const engine = spawn('python', ['-B', 'engine/server.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
    }),
    pending = new Map();
  let next = 0,
    stderr = '';
  engine.stderr.on('data', (data) => (stderr += data));
  engine.on('error', (error) => {
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  });
  const lines = createInterface({ input: engine.stdout });
  lines.on('line', (line) => {
    const result = JSON.parse(line),
      job = pending.get(result.id);
    if (!job) return;
    pending.delete(result.id);
    result.ok ? job.resolve(result.result) : job.reject(Error(result.error));
  });
  const compute = (request) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
    });
  const server = await createServer({
    configFile: false,
    root: 'ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
      errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('nativeEngine', compute);
    await page.addInitScript(() => {
      window.polytope = {
        engine: (request) => window.nativeEngine(request),
        cancel: async () => {},
        setDirty: async () => {},
        setWorkspaceAvailability: async () => {},
        onAction: (callback) => (window.menuAction = callback),
        libraries: async () => ({ libraries: [], errors: [] }),
        recoveryInfo: async () => null,
        startupInfo: async () => ({ hidden: false }),
        autosave: async () => {},
        recentFiles: async () => [],
        discoveryMenu: async () => {},
      };
    });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
    await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
    await page.locator('#welcome-whats-new').click();
    await page.waitForFunction(() => document.getElementById('help-dialog').open);
    assert.match(await page.locator('#help-topic h3').innerText(), /What’s new/);
    assert.equal(await page.locator('#welcome-panel').isVisible(), false);
    assert.equal(await page.locator('.guide-layout > nav h4').count(), 10);
    assert.equal(await page.locator('#help-topic [data-guide-topic]').count(), WHATS_NEW_LINKS.length);
    for (const [id] of WHATS_NEW_LINKS) {
      await page.locator('#help-topic [data-guide-topic="' + id + '"]').click();
      assert.ok((await page.locator('#help-topic ol li').count()) >= 3, id);
      await page.locator('[data-topic="whats-new"]').click();
    }
    await page.keyboard.press('Escape');
    const order = await page.locator('#info-panel > [id]').evaluateAll((nodes) => nodes.map((n) => n.id));
    for (const [before, after] of [
      ['analysis-overview', 'element-types'],
      ['element-types', 'library-related'],
      ['library-related', 'analysis-details-heading'],
      ['analysis-details-heading', 'analysis-measurements'],
      ['analysis-measurements', 'information-panel'],
      ['information-panel', 'polychoron-relationships'],
    ])
      assert.ok(
        order.includes(before) && order.includes(after) && order.indexOf(before) < order.indexOf(after),
        before + ' before ' + after
      );
    assert.equal(await page.locator('#analysis-measurements > #analysis').count(), 1);
    assert.equal(await page.locator('#uc-polygon-options').evaluate((n) => n.open), false);
    for (const [id, title] of [
      ['uniform-compound-settings', 'Create and adjust a uniform compound'],
      ['presentation-settings', 'Present and record a playlist'],
    ]) {
      const helpSelector =
        id === 'uniform-compound-settings'
          ? '#construct-pane-' + id + ' .construct-pane-help'
          : '#' + id + ' .chrome-drawer-help';
      const help = page.locator(helpSelector);
      if (id === 'uniform-compound-settings') await page.evaluate((id) => window.openConstructTool(id), id);
      await help.evaluate((n) => {
        if (document.body.classList.contains('inspector-hidden')) document.getElementById('toggle-inspector').click();
        for (let p = n.parentElement; p; p = p.parentElement) {
          if (p.tagName === 'DETAILS') p.open = true;
        }
        const panel = n.closest('.inspector-panel');
        if (panel) document.querySelector('[data-panel="' + panel.id.replace('-panel', '') + '"]').click();
      });
      await help.click();
      assert.equal(await page.locator('#help-topic h3').innerText(), title);
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        (selector) => document.activeElement === document.querySelector(selector),
        helpSelector
      );
    }
    await page.evaluate(() => window.menuAction('whatsnew'));
    assert.match(await page.locator('#help-topic h3').innerText(), /What’s new/);
    await page.keyboard.press('Escape');
    const expertOff = async () =>
      assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('expert-mode')), false);
    const helpSource = await page.evaluate(() => ({
      model: document.getElementById('model-name').textContent,
      documents: document.querySelectorAll('#document-tabs > *').length,
      history: document.getElementById('history-list').textContent,
    }));
    const revealHelp = async (selector) => {
      await page.locator(selector).evaluate((node) => {
        const doc = node.ownerDocument,
          region = node.closest('#library-region') ? 'library' : 'inspector';
        if (doc.body.classList.contains(region + '-hidden')) doc.getElementById('toggle-' + region).click();
        const panel = node.closest('.inspector-panel');
        if (panel) doc.querySelector('[data-panel="' + panel.id.replace('-panel', '') + '"]').click();
      });
      await reveal(page, selector);
      await expertOff();
    };
    const openHelp = async (selector, title) => {
      await revealHelp(selector);
      const pane = await page
        .locator(selector)
        .evaluate((node) => node.closest('summary.construct-tool-summary')?.closest('[data-construct-tool]')?.id);
      if (pane) selector = '#' + pane + ' .construct-pane-help';
      await page.locator(selector).click();
      assert.equal(await page.locator('#help-topic h3').innerText(), title, selector);
      await expertOff();
      await page.keyboard.press('Escape');
    };
    await t.test(
      'desk-01-help-r6-topics: nine Round 6 disclosures open their intended help with Expert off',
      async () => {
        for (const [id, title] of [
          ['stellation-arbitrary-settings', 'Edit a facial stellation diagram'],
          ['stellation-face-subgroup-settings', 'Edit a facial stellation diagram'],
          ['waterman4-settings', 'Create blocks, grids and generator variants'],
          ['waterman4-sequence-settings', 'Create blocks, grids and generator variants'],
          ['goursat-wythoff-settings', 'Generate Goursat / Schwarz Wythoff shapes'],
          ['fabrication-measure-options', 'Arrange pieces and print assembly sheets'],
          ['fabrication-presets', 'Arrange pieces and print assembly sheets'],
          ['fabrication-custom', 'Arrange pieces and print assembly sheets'],
          ['hinge-strip-settings', 'Arrange pieces and print assembly sheets'],
        ])
          await openHelp('#' + id + ' > summary .group-help', title);
      }
    );
    await t.test(
      'desk-01-help-r7-evidence: Library and generated evidence keep specific help with Expert off',
      async () => {
        for (const id of ['library-corpus', 'library-classification', 'library-symmetry-evidence'])
          await page.locator('#' + id).evaluate((node) => (node.open = true));
        for (const selector of [
          '#corpus-schwarz-wythoff-u63 > summary .group-help',
          '#classification-receipt',
          '#symmetry-evidence-receipt:not(:empty)',
        ]) {
          try {
            await page.locator(selector).waitFor({ state: 'attached' });
          } catch (error) {
            throw Error(
              selector +
                ' did not load: ' +
                JSON.stringify(
                  await page.evaluate(() =>
                    ['corpus-status', 'classification-status', 'symmetry-evidence-status'].map((id) => [
                      id,
                      document.getElementById(id)?.textContent,
                    ])
                  )
                ),
              { cause: error }
            );
          }
        }
        for (const [selector, title] of [
          ['#library-corpus > summary .group-help', 'Review corpus coverage and source evidence'],
          ['#library-classification > summary .group-help', 'Review specialized relationships'],
          ['#classification-detail > details > summary .group-help', 'Review specialized relationships'],
          ['#library-symmetry-evidence > summary .group-help', 'Review recorded symmetry evidence'],
          ['#library-symmetry-evidence > details > summary .group-help', 'Review recorded symmetry evidence'],
          ['#corpus-goursat-h4-stars-1 > summary .group-help', 'Generate Goursat / Schwarz Wythoff shapes'],
          ['#corpus-goursat-h4-stars-1 > details > summary .group-help', 'Generate Goursat / Schwarz Wythoff shapes'],
          ['#corpus-schwarz-wythoff-u63 > summary .group-help', 'Generate Goursat / Schwarz Wythoff shapes'],
          ['#corpus-schwarz-wythoff-u63 > details > summary .group-help', 'Generate Goursat / Schwarz Wythoff shapes'],
          ['#goursat-wythoff-settings > details > summary .group-help', 'Generate Goursat / Schwarz Wythoff shapes'],
          ['#vertex-figure-construction-settings > summary .group-help', 'Construct 4D from a supplied vertex figure'],
          [
            '#vertex-figure-construction-settings > details > summary .group-help',
            'Construct 4D from a supplied vertex figure',
          ],
        ])
          await openHelp(selector, title);
        for (const [id, title] of [
          ['stellation-arbitrary-planes', 'Edit a facial stellation diagram'],
          ['classification-identity', 'Review specialized relationships'],
          ['symmetry-evidence-scenario', 'Review recorded symmetry evidence'],
          ['vertex-figure-domain', 'Construct 4D from a supplied vertex figure'],
        ]) {
          await revealHelp('#' + id);
          await page.locator('#' + id).focus();
          await page.keyboard.press('F1');
          assert.equal(await page.locator('#help-topic h3').innerText(), title, id + ' F1');
          await page.keyboard.press('Escape');
          await expertOff();
        }
        const selector = '#library-symmetry-evidence > details > summary .group-help';
        await page.locator(selector).evaluate((node) => (node.disabled = true));
        await page.waitForFunction((selector) => !document.querySelector(selector).disabled, selector);
        assert.equal(await page.locator(selector).count(), 1, 'Library help repair is idempotent');
      }
    );
    const contexts = await page.evaluate(async () => {
      const { GROUP_GUIDE_TOPICS, GUIDE_TOPICS, guideContext } = await import('/user-guide.mjs'),
        valid = new Set(GUIDE_TOPICS.map((topic) => topic.id));
      return Array.from(document.querySelectorAll('#inspector-region details,#library-region details')).map((node) => ({
        id: node.id,
        topic: guideContext(node),
        mapped: !node.id || valid.has(node.dataset.guideTopic || GROUP_GUIDE_TOPICS[node.id]),
        help: !!node.querySelector(':scope > summary .group-help'),
      }));
    });
    assert.ok(contexts.length > 60);
    assert.deepEqual(
      contexts.filter((row) => !row.mapped || !row.help || row.topic === 'start'),
      []
    );
    await t.test(
      'desk-01-help-fallback: unregistered tools retain usable inherited and getting-started help',
      async () => {
        await page.locator('#info-panel').evaluate((panel) => {
          const root = document.createElement('details');
          root.id = 'future-help-tool';
          root.innerHTML = '<summary>Future tool</summary>';
          panel.append(root);
        });
        await page.waitForFunction(() => document.querySelector('#future-help-tool > summary .group-help'));
        await openHelp('#future-help-tool > summary .group-help', 'Selection and measurements');
        await page.locator('#future-help-tool').evaluate((node) => node.remove());
        await page.locator('#help').focus();
        await page.keyboard.press('F1');
        assert.equal(await page.locator('#help-topic h3').innerText(), 'Getting started');
        await page.keyboard.press('Escape');
        await expertOff();
      }
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        model: document.getElementById('model-name').textContent,
        documents: document.querySelectorAll('#document-tabs > *').length,
        history: document.getElementById('history-list').textContent,
      })),
      helpSource,
      'contextual help does not change the mathematical document'
    );
    for (const [id, title] of [
      ['information-panel', 'Read and export a measurement table'],
      ['zone-extension-settings', 'Build zonohedra from axes or add zones'],
      ['density-section-settings', 'Fill a section by winding density'],
    ]) {
      await page.evaluate((id) => document.querySelector('#' + id + ' > summary .group-help').click(), id);
      assert.equal(await page.locator('#help-topic h3').innerText(), title);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(
      () => (document.querySelector('#zone-extension-settings > summary .group-help').disabled = true)
    );
    await page.waitForFunction(
      () => !document.querySelector('#zone-extension-settings > summary .group-help').disabled
    );
    await page
      .locator('#timeline-animation-export details[data-guide-topic="media-export"] > summary .group-help')
      .evaluate((n) => n.click());
    assert.equal(await page.locator('#help-topic h3').innerText(), 'Choose image and video export options');
    await page.keyboard.press('Escape');
    await page
      .locator('#timeline-animation-export details[data-guide-topic="media-export"] > summary .group-help')
      .evaluate((n) => (n.disabled = true));
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '#timeline-animation-export details[data-guide-topic="media-export"] > summary .group-help'
        ).disabled
    );
    assert.equal(
      await page
        .locator('#timeline-animation-export details[data-guide-topic="media-export"] > summary .group-help')
        .count(),
      1,
      'Timeline help repair is idempotent'
    );
    await page.keyboard.press('Control+k');
    for (const item of FEATURE_ACTION_INDEX) {
      await page.locator('#command-query').fill(item.query);
      assert.ok((await page.locator('#command-results [role="option"]').count()) > 0, item.query);
    }
    for (const item of FEATURE_ACTION_INDEX.filter((item) => item.control)) {
      await page.locator('#command-query').fill(item.query);
      const matches = await page.evaluate(async (query) => {
        const { DiscoverabilityControls } = await import('/discoverability-controls.mjs');
        const { rankCommands } = await import('/command-index.mjs');
        const stub = Object.create(DiscoverabilityControls.prototype);
        Object.assign(stub, {
          doc: document,
          nodeIds: new WeakMap(),
          nextNodeId: 0,
          context: { actions: {}, library: () => [] },
        });
        return rankCommands(stub.index(), query).map((row) => row.id);
      }, item.query);
      assert.ok(matches.includes('control:' + item.control), item.query + ' reaches its live control');
    }
    for (const [query, label] of [
      ['uniform compound Skilling', 'Create compound'],
      ['Apply parameters', 'Apply parameters'],
      ['Preview edge cut', 'Preview edge cut'],
      ['Adopt edge cut', 'Adopt edge cut'],
      ['Check literal vertex links', 'Check literal vertex links'],
      ['Start presentation', 'Start presentation (F5)'],
      ['Record presentation', 'Record presentation'],
      ['Compute table', 'Compute table'],
      ['Re-arrange pieces', 'Re-arrange pieces'],
      ['Export assembly sheet SVG', 'Export assembly sheet SVG'],
      ['Export selected format', 'Export selected format'],
    ]) {
      await page.locator('#command-query').fill(query);
      assert.ok(
        (await page.locator('#command-results strong').allTextContents()).includes(label),
        query + ' finds live action'
      );
    }
    for (const [query, expected] of [
      ['Miller', 'Miller'],
      ['Interpolate face colors', 'Interpolate face colors'],
      ['Bcc', 'BCC'],
      ['printable model', 'Export model'],
      ['hollow shell', 'Export model'],
      ['displayed geometry', 'Export model'],
    ]) {
      await page.locator('#command-query').fill(query);
      assert.ok((await page.locator('#command-results').innerText()).includes(expected), query);
    }
    await page.locator('#command-query').fill('whatsnew');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#help-topic h3').innerText(), /What’s new/);
    // Lazy feature notes are loaded locally and preserve a route back to the task.
    await page.locator('[data-topic="solid-printing"]').click();
    await page.locator('a[href="#guide-note-SOLID_PRINTING.md"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#help-topic pre')?.textContent.includes('Outer surface solid printing')
    );
    await page.locator('[data-topic="solid-printing"]').click();
    assert.equal(await page.locator('#help-topic ol li').count(), 5);
    await page.keyboard.press('Escape');
    const before = await page.evaluate(() => ({
      model: document.getElementById('model-name').textContent,
      documents: document.querySelectorAll('#document-tabs > *').length,
      history: document.getElementById('history-list').textContent,
    }));
    for (const [topic, controls] of Object.entries(GUIDE_CONTROLS))
      for (const [id] of controls) {
        await page.evaluate(() => window.menuAction('help'));
        await page.locator('[data-topic="' + topic + '"]').click();
        assert.equal(await page.locator('#help-topic [data-guide-control]').count(), controls.length, topic);
        await page.locator('[data-guide-control="' + id + '"]').click();
        await assert.doesNotReject(
          page.waitForFunction((id) => {
            const node = document.getElementById(id);
            return (
              !document.getElementById('help-dialog').open &&
              node?.getBoundingClientRect().width > 0 &&
              getComputedStyle(node).visibility !== 'hidden'
            );
          }, id),
          id + ' is revealed'
        );
        assert.equal(await page.locator('#' + id).count(), 1, id + ' retains identity');
        assert.equal(
          await page
            .locator('#' + id)
            .evaluate(
              (node) =>
                node.matches(':disabled') ||
                document.activeElement === (node.tagName === 'DETAILS' ? node.querySelector(':scope > summary') : node)
            ),
          true,
          id + ' receives focus when enabled'
        );
        assert.equal(await page.locator('dialog[open]').count(), 0, id + ' reveals without running');
        if (id === 'animation-format' || id === 'tour-format')
          assert.equal(await page.locator('#timeline-panel').isVisible(), true, id + ' reveals Timeline');
      }
    assert.deepEqual(
      await page.evaluate(() => ({
        model: document.getElementById('model-name').textContent,
        documents: document.querySelectorAll('#document-tabs > *').length,
        history: document.getElementById('history-list').textContent,
      })),
      before,
      'Guide links do not construct, branch, replay or export'
    );
    assert.equal(
      await page.locator('body').evaluate((node) => node.classList.contains('expert-mode')),
      false,
      'common Guide destinations keep Expert off'
    );
    await page.evaluate(() => window.menuAction('shortcuts'));
    assert.equal(await page.locator('#shortcut-action-index button').count(), FEATURE_ACTION_INDEX.length);
    await page.locator('#shortcut-action-index button').filter({ hasText: 'Hollow solid printing' }).click();
    assert.equal(await page.locator('#command-query').inputValue(), 'Hollow shell');
    assert.equal(await page.locator('#shortcut-sheet').evaluate((node) => node.open), false);
    assert.equal(await page.locator('#command-palette').evaluate((node) => node.open), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'command-query');
    assert.deepEqual(errors, []);
    assert.equal(stderr, '');
  } finally {
    await browser?.close();
    await server.close();
    lines.close();
    engine.kill();
    for (const job of pending.values()) job.reject(Error('Test complete.'));
  }
});
