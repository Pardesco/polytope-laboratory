import { elementTypesKey, getElementTypes, rememberElementTypes } from './element-types.mjs';
import { appendVisibilityControls } from './element-visibility-controls.mjs';
import { createStatus } from './status.mjs';
import { appendStarCellInventory } from './star-uniform4-types.mjs';
const fields = { vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' };
export class ElementTypeControls {
  constructor(context) {
    this.context = context;
    this.sequence = 0;
    const panel = document.createElement('section');
    panel.id = 'element-types';
    panel.className = 'inspector-card';
    document.getElementById('analysis').after(panel);
    this.panel = panel;
  }
  cancelNumeric() {
    this.sequence++;
    this.status?.settle(this.progress);
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
      this.panel.textContent = 'Element types canceled. Select the model again to retry.';
    }
  }
  sync() {
    this.refresh().catch((error) => {
      this.panel.textContent = 'Element types unavailable: ' + error.message;
    });
  }
  async refresh() {
    this.cancelNumeric();
    this.context.getEvidencePanel?.()?.replaceChildren();
    const sequence = this.sequence,
      source = this.context.getState(),
      model = source?.model;
    if (!model) {
      this.panel.replaceChildren();
      return;
    }
    const key = elementTypesKey(model),
      controller = new AbortController();
    this.controller = controller;
    const current = () =>
      this.sequence === sequence &&
      this.context.getState() === source &&
      source.model === model &&
      elementTypesKey(model) === key &&
      !controller.signal.aborted;
    this.status ??= createStatus((text) => {
      this.panel.textContent = text;
    });
    this.status.set('');
    const progress = this.status.defer('Element types · computing full numerical symmetry…');
    this.progress = progress;
    this.panel.textContent = 'Finding element types…';
    try {
      if (this.context.beforeAnalysis) {
        await this.context.beforeAnalysis();
        if (!current()) return;
      }
      let result = getElementTypes(model);
      if (!result) {
        result = await this.context.run('element-types', {}, model, 'Classify element types', {
          signal: controller.signal,
        });
        if (!current()) return;
        rememberElementTypes(model, result);
      }
      if (!current()) return;
      this.render(model, result);
      if (['face-type', 'cell-type'].includes(source.view.surfaceColors) && !this.context.isExporting()) {
        this.context.viewer.colorKey = null;
        this.context.display();
      }
    } catch (error) {
      if (current()) this.panel.textContent = 'Element types unavailable: ' + error.message;
    } finally {
      this.status.settle(progress);
      if (this.controller === controller) this.controller = null;
    }
  }
  render(model, result) {
    this.context.onTypes?.(model, result);
    const evidencePanel = this.context.getEvidencePanel?.();
    evidencePanel?.replaceChildren();
    const source = this.context.getState(),
      key = elementTypesKey(model);
    const make = (tag, text) => {
      const node = document.createElement(tag);
      node.textContent = text;
      return node;
    };
    this.panel.replaceChildren(make('div', 'Element types'));
    this.panel.firstElementChild.className = 'panel-title';
    this.panel.append(make('small', 'Open a row to highlight matching parts.'));
    const visibility = () => {
      if (this.context.markDirty)
        appendVisibilityControls(this.panel, this.context, model, result, () => this.render(model, result));
    };
    appendStarCellInventory(this.panel, result.nativeCellInventory, {
      make,
      evidence: result.nativeStarEvidence,
      select: (ids, label) =>
        this.context.guard(() => {
          if (this.context.getState() !== source || source.model !== model || elementTypesKey(model) !== key)
            throw Error('Cell inventory source changed. Select the model again.');
          return this.context.select('cell', ids, label);
        })(),
    });
    const starEvidence = this.panel.querySelector?.('#star-uniform4-evidence');
    if (starEvidence) {
      starEvidence.setAttribute('data-expert', '');
      evidencePanel?.append(starEvidence);
    }
    if (!result.available) {
      this.panel.append(make('p', result.status));
      visibility();
      return;
    }
    for (const [kind, field] of Object.entries(fields)) {
      const count = model[field]?.length ?? 0;
      if (!count) continue;
      const types = result.types[kind],
        row = make('details', '');
      row.append(
        make(
          'summary',
          `${field[0].toUpperCase() + field.slice(1)} ${count} · ${types.length} ${types.length === 1 ? 'type' : 'types'}`
        )
      );
      row.id = 'element-types-' + kind;
      this.panel.append(row);
      const list = make('div', '');
      list.className = 'element-type-list';
      for (const type of types) {
        const button = make(
          'button',
          `${type.count} × ${kind === 'face' || kind === 'cell' ? type.description : kind} · type ${type.typeId + 1}`
        );
        button.id = `element-type-${kind}-${type.typeId}`;
        button.type = 'button';
        button.onclick = this.context.guard(() => {
          if (this.context.getState() !== source || source.model !== model || elementTypesKey(model) !== key)
            throw Error('Element type source changed. Select the model again.');
          return this.context.select(
            kind,
            type.ids,
            `${kind} type ${type.typeId + 1} · ${type.description}`.slice(0, 256)
          );
        });
        list.append(button, make('span', ' '));
      }
      row.append(list);
    }
    const details = make('details', '');
    details.setAttribute?.('data-expert', '');
    details.append(
      make('summary', 'Numerical symmetry evidence'),
      make(
        'p',
        `${result.componentCount} connected ${result.componentCount === 1 ? 'component' : 'components'} · ${result.transitivity.join(', ') || 'No transitivity'}`
      ),
      make(
        'p',
        `Full group order ${result.groupOrder}; normalized vertex residual ${result.maxNormalizedVertexResidual.toExponential(2)}; tolerance ${result.tolerance}. Types are orbits under all incidence-preserving orthogonal actions, including reflections. Polygon names give side counts, not regularity. Colors repeat after eight types.`
      )
    );
    if (model.cells?.length)
      details.append(
        make(
          'p',
          'Cell type colors use the first visible owner of a shared face. Isolate cells or shrink cells to reveal each owner.'
        )
      );
    (evidencePanel ?? this.panel).append(details);
    visibility();
  }
}
