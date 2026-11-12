import { startupMark, afterModelPaint } from '../startup-performance.mjs';
import { compileCatalogQuery } from '../catalog-query.mjs';
import { CatalogDefaults, catalogBrowseEntries, isDiscoveryCandidate } from '../catalog-defaults.mjs';
import { LibraryPropertyControls, RelatedLibraryControls } from '../library-navigation.mjs';
import { LibraryCollections } from '../library-collections.mjs';
import { libraryFamilyLabel, libraryProvenance } from '../library-visual.mjs';
import { LibraryThumbnails } from '../library-thumbnails.mjs';
import { PolychoronRelationshipControls } from '../polychoron-relationships.mjs';
import { CatalogLoading } from '../catalog-loading.mjs';
import { NativeJobs } from '../native-jobs.mjs';
import { CatalogDiscovery } from '../catalog-discovery.mjs';
import { CorpusReconciliationControls } from '../corpus-reconciliation-controls.mjs';
import { SymmetryEvidenceControls } from '../symmetry-evidence-controls.mjs';
import { ClassificationQualificationControls } from '../classification-qualification-controls.mjs';
import { UDualObstructionsControls } from '../u-dual-obstructions-controls.mjs';
export function createCatalogView(ctx) {
  function syncCatalogDiscovery() {
    const { discoveryPanel, catalogRetry, animation, discoveryStatus, $ } = ctx;

    const status = ctx.catalogDiscovery?.state ?? 'loading';
    discoveryPanel.hidden = status === 'ready';
    catalogRetry.hidden = status === 'loading';
    catalogRetry.disabled = animation.exporting || ctx.tourExporting;
    discoveryStatus.textContent =
      status === 'loading'
        ? 'Loading Library…'
        : status === 'error'
          ? 'Library could not load.'
          : status === 'canceled'
            ? 'Library loading canceled.'
            : 'Load the model Library.';
    catalogRetry.textContent = status === 'error' ? 'Retry Library' : 'Load Library';
    $('catalog').setAttribute('aria-busy', String(status === 'loading'));
  }
  function syncCatalogLoading() {
    const { animation, catalogLoadingStatus, $, el } = ctx;

    syncCatalogDiscovery();
    const pending = ctx.catalogLoader?.pending || new Map(),
      exporting = animation.exporting || ctx.tourExporting;
    const names = [...pending.values()].map((job) => job.entry.name);
    catalogLoadingStatus.textContent = pending.size
      ? 'Opening ' +
        (pending.size === 1
          ? names[0].length > 80
            ? names[0].slice(0, 79) + '…'
            : names[0]
          : pending.size + ' models') +
        '…'
      : '';
    catalogLoadingStatus.title = names.join('\n');
    catalogLoadingStatus.hidden = !pending.size;
    for (const button of $('catalog').querySelectorAll('[data-key]')) {
      const busy = [...pending.values()].some((job) => job.entry.key === button.dataset.key);
      button.disabled = button.dataset.catalogDisabled === 'true' || busy || exporting;
      button.setAttribute('aria-busy', String(busy));
      let note = button.querySelector('.catalog-loading-note');
      if (busy && !note) {
        note = el('small', 'Opening…', 'catalog-loading-note');
        button.append(note);
      } else if (!busy) note?.remove();
    }
    $('library-open-anyway').disabled =
      exporting || [...pending.values()].some((job) => job.entry.key === ctx.inspectedLibraryEntry?.key);
    $('new').disabled = exporting;
  }
  async function readCatalogEntry(entry, { signal, background = false }) {
    const { libraryPreviewJobs, nativeJobs, api } = ctx;

    return (background ? libraryPreviewJobs : nativeJobs).run(
      async (id) =>
        entry.external
          ? (await api.libraryModel(entry.key, id)).model
          : api.engine({ op: 'generate', params: { kind: 'regular', key: entry.key }, model: null }, id),
      'Open ' + entry.name,
      { signal }
    );
  }
  function inspectLibraryEntry(entry) {
    const { $ } = ctx;

    ctx.inspectedLibraryEntry = entry;
    $('library-source-info').textContent = JSON.stringify(
      {
        path: entry.key,
        relativePath: entry.relativePath,
        counts: entry.counts,
        auditStatus: entry.auditStatus || 'untested',
        diagnostic: entry.auditDiagnostic || entry.diagnostic,
        errors: entry.auditErrors,
        warnings: entry.auditWarnings,
        sourceHash: entry.sourceHash,
      },
      null,
      2
    );
    $('library-repair-copy').disabled = !entry.supported;
    syncCatalogLoading();
    $('library-dialog').showModal();
  }
  function syncCatalogSelection() {
    const { model, $ } = ctx;

    const key = model()?.metadata?.key;
    for (const button of $('catalog').querySelectorAll('.catalog-entry'))
      button.classList.toggle('active', button.dataset.key === key);
  }
  function renderCatalog() {
    const {
      $,
      catalogDefaults,
      libraryProperties,
      relatedLibrary,
      compoundControls,
      auditFilter,
      libraryVisual,
      el,
      model,
      guard,
      animation,
      activateDocument,
    } = ctx;

    const query = $('search').value.toLowerCase().trim(),
      matches = compileCatalogQuery(query),
      includeDiscoveryCandidates = catalogDefaults.includeDiscoveryCandidates,
      entries = catalogBrowseEntries([...ctx.catalog, ...ctx.external], { includeDiscoveryCandidates });
    libraryProperties.update(entries);
    relatedLibrary.sync();
    compoundControls.uniforms.sync();
    const familySelect = $('library-family'),
      selectedFamily = familySelect.value;
    const families = [...new Set(entries.map((e) => e.family || 'Linked OFF'))].sort();
    familySelect.replaceChildren(new Option('All families', 'all'), ...families.map((f) => new Option(f, f)));
    familySelect.value = families.includes(selectedFamily) ? selectedFamily : 'all';
    const available = entries.filter(
      (e) =>
        (ctx.filter === 'all' || String(e.dimension) === ctx.filter) &&
        (familySelect.value === 'all' || (e.family || 'Linked OFF') === familySelect.value) &&
        (auditFilter.value === 'all' ||
          (e.external ? e.auditStatus || 'untested' : 'reference') === auditFilter.value) &&
        libraryProperties.matches(e) &&
        matches(e)
    );
    const filtered = available.filter((e) => libraryVisual.matches(e));
    libraryVisual.updateCount(filtered.length);
    ctx.presentationLibraryEntries = filtered;
    $('catalog').replaceChildren();
    libraryVisual.prepare(entries, {
      query,
      filtered: available,
      filtersActive: familySelect.value !== 'all',
      includeDiscoveryCandidates,
    });
    // Window the external listing; full name search still covers every record.
    filtered.slice(0, 250).forEach((entry) => {
      const button = el('button', undefined, 'catalog-entry');
      button.dataset.key = entry.key;
      button.disabled = entry.external && entry.supported === false;
      button.dataset.catalogDisabled = String(Boolean(button.disabled));
      button.title = entry.external
        ? [
            entry.relativePath,
            entry.diagnostic || 'Header indexed; geometry is checked when opened.',
            entry.counts ? 'V / E / F / C: ' + entry.counts.join(' / ') : '',
            libraryProvenance(entry),
          ]
            .filter(Boolean)
            .join('\n')
        : [
            entry.name,
            entry.catalogStatus,
            libraryProvenance(entry),
            entry.chiralityStatus,
            entry.uniformSnubVariant?.labelBasis,
            entry.classificationVerified === false ? 'Classification unverified' : '',
          ]
            .filter(Boolean)
            .join('\n');
      if (entry.key === model()?.metadata?.key) button.classList.add('active');
      button.append(
        el('span', entry.dimension ? entry.dimension + 'D' : 'OFF', 'dim'),
        el('span', entry.name, 'entry-name'),
        el('small', [entry.symbol, libraryFamilyLabel(entry)].filter(Boolean).join(' · '))
      );
      if (isDiscoveryCandidate(entry)) button.append(el('small', 'Unverified', 'badge'));
      if (entry.external && entry.supported === false)
        button.append(el('small', entry.diagnostic || 'Unsupported OFF file', 'muted'));
      if (entry.external) {
        const status = entry.auditStatus || 'untested';
        button.append(
          el(
            'small',
            status + (entry.auditDiagnostic ? ' · ' + entry.auditDiagnostic : ''),
            'audit-badge audit-' + status
          )
        );
      }
      button.onclick = guard(() => {
        if (entry.external && entry.auditStatus === 'rejected') {
          inspectLibraryEntry(entry);
          return;
        }
        // An unmodified copy that is already open is reused instead of adding a duplicate tab.
        const open = ctx.project.documents.findIndex(
          (d) => d.states.length === 1 && d.states[0].model?.metadata?.key === entry.key
        );
        if (open >= 0 && !(animation.exporting || ctx.tourExporting)) return activateDocument(open);
        return ctx.catalogLoader.open(entry);
      });
      button.oncontextmenu = (event) => {
        if (entry.external) {
          event.preventDefault();
          inspectLibraryEntry(entry);
        }
      };
      libraryVisual.decorate(button, entry);
      $('catalog').append(button);
    });
    if (filtered.length > 250)
      $('catalog').append(el('p', 'Showing 250 matches. Refine search to find any indexed entry.', 'muted'));
    if (!filtered.length && (entries.length || ctx.catalogDiscovery?.state === 'ready'))
      $('catalog').append(el('p', 'No matching models. Try another family or search.', 'muted'));
    ctx.catalogLoader?.sync();
  }
  function renderLinkedLibraries() {
    const { $, el, guard, api, setStatus } = ctx;

    $('linked-libraries').replaceChildren();
    for (const library of ctx.linkedLibraries) {
      const row = el('div', undefined, 'linked-library'),
        label = el('small', library.path.split(/[\\/]/).filter(Boolean).pop(), 'muted');
      label.title = library.path;
      const remove = el('button', 'Remove');
      remove.title = 'Unlink folder; source files remain unchanged';
      remove.onclick = guard(async () => {
        await api.unlinkLibrary(library.path);
        ctx.linkedLibraries = ctx.linkedLibraries.filter((l) => l.path !== library.path);
        ctx.external = [...new Map(ctx.linkedLibraries.flatMap((l) => l.entries).map((e) => [e.key, e])).values()];
        renderLinkedLibraries();
        renderCatalog();
        setStatus('Unlinked ' + library.path);
      });
      const audit = el('button', 'Audit');
      audit.title = 'Attach an importer audit or compact evidence index';
      audit.onclick = guard(async () => {
        const updated = await api.attachLibraryAudit(library.path);
        if (updated) {
          acceptLinkedLibrary(updated);
          setStatus('Attached audit evidence to ' + library.path);
        }
      });
      const verify = el('button', 'Verify');
      verify.disabled = !library.auditPath;
      verify.title = 'Recheck source hashes against attached audit evidence';
      verify.onclick = guard(async () => {
        setStatus('Verifying source hashes…');
        const updated = await api.verifyLibraryAudit(library.path);
        acceptLinkedLibrary(updated);
        setStatus('Source hashes verified for ' + library.path);
      });
      row.append(label, remove, audit, verify);
      $('linked-libraries').append(row);
      if (library.error) $('linked-libraries').append(el('small', library.error, 'muted'));
      if (library.auditError)
        $('linked-libraries').append(el('small', 'Audit unavailable: ' + library.auditError, 'muted'));
    }
  }
  function acceptLinkedLibrary(library) {
    ctx.linkedLibraries = ctx.linkedLibraries.filter((l) => l.path !== library.path);
    ctx.linkedLibraries.push(library);
    ctx.external = [...new Map(ctx.linkedLibraries.flatMap((l) => l.entries).map((e) => [e.key, e])).values()];
    renderLinkedLibraries();
    renderCatalog();
  }
  return {
    syncCatalogSelection,
    renderCatalog,
    renderLinkedLibraries,
    acceptLinkedLibrary,
    syncCatalogDiscovery,
    syncCatalogLoading,
    readCatalogEntry,
    inspectLibraryEntry,
    mountCatalog() {
      const { el, $, model, guard, animation, state, run, uid, api, nativeJobs } = ctx;
      const auditFilter = el('select');
      ctx.auditFilter = auditFilter;
      auditFilter.id = 'library-audit-filter';
      auditFilter.setAttribute('aria-label', 'Filter library validation status');
      for (const [value, label] of [
        ['all', 'All validation statuses'],
        ['passed', 'Passed'],
        ['rejected', 'Rejected'],
        ['untested', 'Untested'],
        ['stale', 'Stale evidence'],
        ['reference', 'Independent references'],
      ])
        auditFilter.append(new Option(label, value));
      $('library-family').after(auditFilter);
      const libraryProperties = new LibraryPropertyControls({
        document,
        after: auditFilter,
        change: () => renderCatalog(),
      });
      ctx.libraryProperties = libraryProperties;
      const relatedLibrary = new RelatedLibraryControls({
        document,
        after: $('analysis'),
        getModel: model,
        getEntries: () => ctx.catalog,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
        open: (entry) => ctx.catalogLoader.open(entry),
      });
      ctx.relatedLibrary = relatedLibrary;
      ctx.polychoronRelationships = new PolychoronRelationshipControls({
        document,
        after: $('analysis'),
        getState: state,
        getEntries: () => ctx.catalog,
        open: (entry) => ctx.catalogLoader.open(entry),
        run,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
      });
      ctx.inspectedLibraryEntry = null;
      const catalogLoadingStatus = el('output', undefined, 'muted');
      ctx.catalogLoadingStatus = catalogLoadingStatus;
      catalogLoadingStatus.id = 'catalog-loading-status';
      catalogLoadingStatus.setAttribute('role', 'status');
      catalogLoadingStatus.setAttribute('aria-live', 'polite');
      $('catalog').before(catalogLoadingStatus);
      const discoveryPanel = el('div', undefined, 'catalog-discovery'),
        discoveryStatus = el('output', undefined, 'muted'),
        catalogRetry = el('button', 'Load Library', 'wide');
      ctx.discoveryPanel = discoveryPanel;
      ctx.discoveryStatus = discoveryStatus;
      ctx.catalogRetry = catalogRetry;
      discoveryStatus.id = 'catalog-discovery-status';
      discoveryStatus.setAttribute('role', 'status');
      catalogRetry.id = 'catalog-retry';
      discoveryPanel.append(discoveryStatus, catalogRetry);
      $('catalog').before(discoveryPanel);
      const libraryPreviewJobs = new NativeJobs({
        id: uid,
        now: () => performance.now(),
        start: () => null,
        complete: () => {},
        cancel: (id) => api.cancel(id),
      });
      ctx.libraryPreviewJobs = libraryPreviewJobs;
      ctx.catalogLoader = new CatalogLoading({
        getProject: () => ctx.project,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        read: readCatalogEntry,
        publish: (m, entry, { activate }) =>
          ctx.addDocument(m, entry.external ? 'Import OFF' : 'Generate', { activate, catalog: true }),
        onChange: syncCatalogLoading,
      });
      ctx.catalogDiscovery = new CatalogDiscovery({
        read: (options) => run('catalog', {}, null, 'Load local catalog', options),
        publish: (entries) => {
          ctx.catalog = entries;
          startupMark('catalog-loaded');
          renderCatalog();
        },
        change: syncCatalogDiscovery,
      });
      const corpusReconciliation = new CorpusReconciliationControls({
        document,
        before: $('catalog'),
        run,
        guard,
        open: (entry) => ctx.catalogLoader.open(entry),
      });
      ctx.corpusReconciliation = corpusReconciliation;
      corpusReconciliation.receipts.api = api;
      corpusReconciliation.receipts.sync();
      const symmetryEvidence = new SymmetryEvidenceControls({
        document,
        before: $('library-corpus'),
        run,
        guard,
        getState: state,
        open: (entry) => ctx.catalogLoader.open(entry),
      });
      ctx.symmetryEvidence = symmetryEvidence;
      const classificationQualification = new ClassificationQualificationControls({
        document,
        before: $('catalog'),
        run,
        guard,
        open: (entry) => ctx.catalogLoader.open(entry),
      });
      ctx.classificationQualification = classificationQualification;
      $('cancel').addEventListener('click', () => classificationQualification.cancel());
      const uDualObstructions = new UDualObstructionsControls({
        document,
        before: $('catalog'),
        run,
        guard,
        open: (entry) => ctx.catalogLoader.open(entry),
      });
      ctx.uDualObstructions = uDualObstructions;
      $('cancel').addEventListener('click', () => uDualObstructions.cancel());
      const libraryThumbnails = new LibraryThumbnails({
        document,
        read: readCatalogEntry,
        isIdle: () =>
          !nativeJobs.pending.size &&
          !animation.exporting &&
          !ctx.tourExporting &&
          !document.hidden &&
          !ctx.welcome?.panel?.matches(':not([hidden])'),
      });
      ctx.libraryThumbnails = libraryThumbnails;
      const libraryVisual = new LibraryCollections({
        document,
        guard,
        thumbnails: libraryThumbnails,
        change: () => renderCatalog(),
        resetFilters: () => {
          $('search').value = '';
          $('library-family').value = 'all';
          auditFilter.value = 'all';
          ctx.filter = 'all';
          catalogDefaults.reset();
          for (const select of libraryProperties.selects.values()) select.value = 'all';
          document
            .querySelectorAll('[data-filter]')
            .forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));
        },
      });
      ctx.libraryVisual = libraryVisual;
      const catalogDefaults = new CatalogDefaults({
        document,
        after: $('library-family'),
        change: () => renderCatalog(),
        model: () => model(),
      });
      ctx.catalogDefaults = catalogDefaults;
      catalogRetry.onclick = guard(() => ctx.catalogDiscovery.load());
    },
    wireCatalog() {
      const { $, libraryVisual, auditFilter, guard, api, setStatus } = ctx;
      $('search').oninput = () => {
        if (libraryVisual.collection && $('search').value.trim()) {
          libraryVisual.collection = null;
          libraryVisual.showAll = true;
        }
        renderCatalog();
      };
      $('library-family').onchange = renderCatalog;
      document.querySelectorAll('[data-filter]').forEach(
        (b) =>
          (b.onclick = () => {
            ctx.filter = b.dataset.filter;
            document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b));
            renderCatalog();
          })
      );
      auditFilter.onchange = renderCatalog;
      $('close-library-dialog').onclick = () => $('library-dialog').close();
      $('library-open-anyway').onclick = guard(() => {
        const entry = ctx.inspectedLibraryEntry;
        $('library-dialog').close();
        return ctx.catalogLoader.open(entry);
      });
      $('library-repair-copy').onclick = guard(async () => {
        const result = await api.repairLibraryCopy(ctx.inspectedLibraryEntry.key);
        if (result) {
          setStatus('Saved validated edge-count copy ' + result.path);
          $('library-dialog').close();
        }
      });
    },
    wireLinkedLibrary() {
      const { $, guard, api, setStatus } = ctx;
      $('link-library').onclick = guard(async () => {
        const result = await api.library();
        if (!result) return;
        acceptLinkedLibrary(result);
        const supported = result.entries.filter((e) => e.supported !== false).length;
        setStatus(
          `Indexed ${result.entries.length} OFF files from ${result.path}; ${supported} have supported headers. Geometry is checked when opened.`
        );
      });
    },
  };
}
