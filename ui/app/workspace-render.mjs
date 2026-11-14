import { pointRadius } from '../geometry-bounds.mjs';
import { clearPrecisionValidation, syncPrecisionContext } from '../precision-evidence.mjs';
import { PLANES } from '../projection.js';
export function createWorkspaceRender(ctx) {
  function displayPose() {
    if (ctx.model()?.kind === 'hyperbolic-space') return;
    return displayBase({ poseOnly: true });
  }
  function displayBase({ poseOnly = false } = {}) {
    if (ctx.model()?.kind === 'hyperbolic-space') return;
    const {
      state,
      symmetryOrientation,
      sourceReflectionControls,
      coincidicRegimentControls,
      perspectiveControls,
      subdivisionControls,
      productControls,
      antiprismControls,
      stepPrismControls,
      nobleControls,
      torusControls,
      podiaControls,
      watermanControls,
      crossedSegmentotopeControls,
      elementContent,
      base,
      syncDerivedSelection,
      derived,
    } = ctx;

    if (!poseOnly) ctx.coxeterBuilder?.sync();
    const s = state();
    if (!s) return;
    // Explicit pose-only callers change angles. Source/settings edits, navigation,
    // busy-state changes and export transitions retain their full control sync.
    if (!poseOnly) {
      ctx.liveSliders?.sync();
      symmetryOrientation?.sync();
      ctx.faceSurgeryControls?.sync();
      sourceReflectionControls?.sync();
      coincidicRegimentControls?.sync();
      perspectiveControls.sync();
      subdivisionControls.sync();
      ctx.faceConwayControls?.sync();
      productControls.sync();
      antiprismControls.sync();
      stepPrismControls.sync();
      nobleControls.sync();
      torusControls.sync();
      podiaControls.sync();
      watermanControls.sync();
      crossedSegmentotopeControls.sync();
      ctx.augmentationControls.sync();
      ctx.geodesicControls.sync();
      ctx.convexCoreControls.sync();
      ctx.expansionControls.sync();
      ctx.fittingControls.sync();
      ctx.exactSectionControls.sync();
      ctx.incidenceTruncationControls.sync();
      ctx.sphereProjectionControls?.sync();
      ctx.projectiveDualControls?.sync();
      ctx.facePlacementControls.sync();
      ctx.sourceZonohedronControls.sync();
      ctx.vertexFigureConstruction?.sync();
      ctx.multipleViews?.sync();
      ctx.segmentotopeControls.sync();
      ctx.segmentotopeAnalysis.sync();
    }
    const contentDisplay = elementContent.display(base, { poseOnly });
    if (!poseOnly) syncDerivedSelection();
    displayDiagnostic(contentDisplay.diagnostic);
    if (
      derived.model &&
      (derived.view?.appearance !== s.view.appearance || derived.view?.materialEffects !== s.view.materialEffects)
    )
      derived.setDisplay({ ...derived.view, appearance: s.view.appearance, materialEffects: s.view.materialEffects });
    contentDisplay.pending.catch((e) => {
      if (e.name !== 'AbortError' && state() === s) {
        elementContent.node('status').textContent = e.message;
        elementContent.node('status').dataset.status = 'presentation-refused';
      }
    });
  }
  function displayDiagnostic(diagnostic) {
    const {
      $,
      base,
      model,
      cellFacing,
      presentationControls,
      appearanceControls,
      materialEffectsControls,
      pickingControls,
    } = ctx;

    const prismNote = $('prism-density-note');
    if (prismNote) prismNote.textContent = diagnostic?.prismDiagnostic || '';
    const messages = [];
    if (base.appearanceBumpDiagnostic) messages.push(base.appearanceBumpDiagnostic);
    if (base.appearanceEffectsDiagnostic) messages.push(base.appearanceEffectsDiagnostic);
    if (diagnostic?.clippedEdges) messages.push(`${diagnostic.clippedEdges} edges clipped by projection limits`);
    if (diagnostic?.orientationDiagnostic) messages.push(diagnostic.orientationDiagnostic);
    if (diagnostic?.facingDiagnostic) messages.push(diagnostic.facingDiagnostic);
    if (diagnostic?.presentationDiagnostic) messages.push(diagnostic.presentationDiagnostic);
    if (diagnostic?.stereographicDiagnostic) messages.push(diagnostic.stereographicDiagnostic);
    if (diagnostic?.perspectiveDiagnostic) messages.push(diagnostic.perspectiveDiagnostic);
    if (diagnostic?.explosionDiagnostic) messages.push(diagnostic.explosionDiagnostic);
    if (base.selectionHighlightDiagnostic) messages.push(base.selectionHighlightDiagnostic);
    if (diagnostic?.suppressedFaces)
      messages.push(`${diagnostic.suppressedFaces} faces omitted from surface fill; unsupported or resource limit`);
    $('view-diagnostic').textContent = messages.join(' · ');
    $('view-diagnostic').dataset.triangles = diagnostic?.filledTriangles || 0;
    const projectionData = $('view-diagnostic').dataset;
    projectionData.stereographicFrameKey = diagnostic?.stereographicDisplayedFrameKey || '';
    projectionData.stereographicPhase = diagnostic?.stereographicQuality?.phase || '';
    projectionData.stereographicTolerance = diagnostic?.stereographicQuality?.tolerance ?? '';
    projectionData.stereographicPending = String(Boolean(diagnostic?.stereographicPending));
    $('view-diagnostic').title =
      model()?.interpretation === 'generalized-complex'
        ? 'Source face surface fill; no solid interior is inferred.'
        : '';
    $('cell-visibility-summary').textContent = model()?.cells?.length
      ? `${base.visibility?.activeCells.length || 0} / ${model().cells.length} visible`
      : '';
    cellFacing?.sync();
    presentationControls?.sync();
    appearanceControls?.sync();
    materialEffectsControls?.sync();
    pickingControls?.sync();
    ctx.appearanceSheet?.sync();
  }
  function renderWorkspace() {
    if (ctx.hyperbolicDocument?.render()) return;
    const {
      workspaceAvailability,
      reports,
      derivedWork,
      automaticFaceting,
      facetingDiagram,
      elementContent,
      model,
      state,
      catalogDefaults,
      $,
      animationRenderer,
      animation,
      intrinsicReports,
      regular4dButton,
      format,
      base,
      selectEntityType,
      selectionSummary,
      selectEntity,
      elementTypes,
      symmetryEvidence,
      el,
      stellation,
      netEditor,
      cellNetEditor,
      measurementControls,
      symmetryControls,
      memories,
      entityOrientation,
      tours,
      faceEditing,
      projectMetadata,
      compoundControls,
      renderTabs,
      renderHistory,
      syncCatalogSelection,
      refreshAnalysis,
      refreshDerived,
      error,
      constructGallery,
    } = ctx;

    ctx.learn4D?.sync();
    ctx.liveSliders?.cancel();
    ctx.coxeterBuilder?.close();
    ctx.welcome?.close();
    ctx.imageCapture?.sync();
    workspaceAvailability.sync();
    reports.invalidate();
    derivedWork.cancel();
    ctx.dualMorph?.invalidate();
    automaticFaceting.invalidate();
    facetingDiagram.invalidate();
    elementContent.invalidate();
    ctx.reinforcement?.invalidate();
    ctx.coincidentAssembly?.invalidate();
    ctx.densityInfo?.invalidate();
    ctx.projectionFit?.cancel();
    const m = model(),
      v = state()?.view;
    catalogDefaults.sync();
    if (!m) return;
    $('inspector-region').scrollTop = 0;
    animationRenderer.clearTracks();
    ctx.viewportControls.stop();
    animation.sync();
    intrinsicReports.reset();
    $('model-name').textContent = v.documentMetadata?.title?.trim() || m.name;
    $('model-family').textContent = (m.metadata?.family || m.interpretation).toUpperCase();
    $('dimension-badge').textContent = m.dimension + 'D';
    syncPrecisionContext(document, m);
    $('model-unit').value = v.coordinateUnit || 'model';
    regular4dButton.hidden = !m.metadata?.regular4dIdentity;
    $('notes').value = state().notes || '';
    $('projection').value = v.projection;
    $('faces-visible').checked = v.faces;
    $('vertices-visible').checked = v.vertices;
    $('face-fill-rule').value = v.fillRule || 'nonzero';
    $('surface-opacity').value = v.surfaceOpacity ?? (m.dimension === 4 ? 0.12 : 0.28);
    $('surface-colors').value = v.surfaceColors || 'source';
    $('cell-visibility-controls').hidden = !m.cells?.length;
    $('visible-cell-id').max = Math.max(0, (m.cells?.length || 0) - 1);
    $('visible-cell-id').value = v.isolatedCell ?? 0;
    $('projection').disabled = m.dimension !== 4;
    $('rotation-controls').hidden = m.dimension < 3;
    $('derived-mode').value = v.derivedMode;
    $('section-normal').value = v.sectionNormal.join(', ');
    $('section-depth').value = v.sectionOffset;
    $('section-offset').value = v.sectionOffset;
    $('entity-id').value = v.entity || 0;
    const radius = pointRadius(m.vertices, null, 1) * 1.15;
    $('section-offset').min = -radius;
    $('section-offset').max = radius;
    $('section-offset').step = radius / 250;
    PLANES.forEach((_, i) => {
      $('plane-' + i).value = v.angles[i] || 0;
      $('plane-output-' + i).textContent = format(v.angles[i] || 0) + '°';
    });
    base.setModel(m, { deferDisplay: true });
    base.restoreCamera(v.camera);
    for (const option of $('selection-kind').options)
      option.disabled = !m[{ vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' }[option.value]]?.length;
    const selection = v.entitySelection,
      selectedCount = m[{ vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' }[selection?.kind]]?.length;
    if (selection?.ids?.length && selection.ids.every((i) => Number.isInteger(i) && i >= 0 && i < selectedCount)) {
      selectEntityType(selection.kind, selection.ids, selection.typeLabel, { persist: false, display: false });
    } else if (
      Number.isInteger(selectedCount) &&
      Array.isArray(selection?.indices) &&
      selection.indices.every((id) => Number.isInteger(id) && id >= 0 && id < selectedCount)
    ) {
      base.selectEntities(selection.kind, selection.indices);
      $('selection-kind').value = selection.kind;
      $('selection-id').value = selection.indices[0] ?? 0;
      $('selection-info').textContent = JSON.stringify(
        { kind: selection.kind, indices: selection.indices, vertices: base.selected },
        null,
        2
      );
      selectionSummary().textContent = `${selection.indices.length} source ${selection.kind} elements selected`;
    } else if (
      selection &&
      Number.isInteger(selection.index) &&
      selection.index >= 0 &&
      selection.index < selectedCount
    ) {
      $('selection-kind').value = selection.kind;
      $('selection-id').value = selection.index;
      selectEntity(false, { display: false });
    } else {
      $('selection-kind').value = 'vertex';
      $('selection-id').value = 0;
      $('selection-info').textContent = 'Click a projected vertex or select a source entity by index.';
      selectionSummary().textContent = 'Click the model to pick a vertex, edge or face.';
    }
    // Restore source selection before the one full display. That display prepares
    // highlight positions, picking and annotations together in the saved pose.
    displayBase();
    ctx.coxeterPreviewFrame?.refitReplacement(base, v, displayBase);
    ctx.sectionToolbar?.refitLayout(base, ctx.derived);
    elementTypes.sync();
    symmetryEvidence.sync();
    PLANES.forEach(([, axis], i) => {
      $('plane-' + i).parentElement.hidden = axis >= m.dimension;
    });
    ctx.viewportControls.sync();
    $('counts-strip').replaceChildren();
    ['vertices', 'edges', 'faces', 'cells'].forEach((k) => {
      if (k === 'cells' && m.dimension !== 4) return;
      const block = el('div', undefined, 'count-block');
      block.append(el('strong', format(m[k]?.length || 0)), el('small', k.toUpperCase()));
      $('counts-strip').append(block);
    });
    ctx.cellRebuildControls?.sync();
    stellation.sync();
    netEditor.sync();
    cellNetEditor.sync();
    measurementControls.sync();
    symmetryControls.sync();
    memories.sync();
    entityOrientation.sync();
    tours.sync();
    faceEditing.sync();
    automaticFaceting.sync();
    facetingDiagram.sync();
    elementContent.sync();
    ctx.sourceLabelPresets?.sync();
    ctx.stellationCells?.sync();
    ctx.reinforcement?.sync();
    ctx.coincidentAssembly?.sync();
    ctx.densityInfo?.sync();
    projectMetadata.sync();
    compoundControls.sync();
    renderTabs();
    renderHistory();
    syncCatalogSelection();
    ctx.catalogLoader?.sync();
    refreshAnalysis();
    refreshDerived();
    const restoredSource = state();
    (state().view.dualMorph?.enabled ? ctx.dualMorph.restoreSaved() : animationRenderer.restoreSavedExplosion()).catch(
      (e) => {
        if (state() === restoredSource) error(e);
      }
    );
    ctx.springControls?.sync();
    constructGallery?.sync();
  }
  return {
    displayPose,
    displayBase,
    displayDiagnostic,
    renderWorkspace,
  };
}
