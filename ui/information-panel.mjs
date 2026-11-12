import { SourceMeasurementSession } from './source-measurement-session.mjs';
import { publishBoundedExport } from './bounded-export.mjs';
import { createStatus } from './status.mjs';
import { explainAvailability } from './availability-copy.mjs';
const number = (value) =>
  value === null || value === undefined
    ? 'not defined'
    : typeof value === 'number'
      ? Number(value.toPrecision(10)).toString()
      : String(value);
const list = (values) => values.map(number).join('; ');
export function informationRows(report, unit = 'model') {
  const rows = [['Kind / type', 'Count', 'Measurement', 'Value', 'Units / definition']];
  const add = (kind, count, metric, value, definition) =>
    rows.push([kind, String(count ?? ''), metric, number(value), definition]);
  for (const [name, r] of Object.entries(report.radii))
    if (name !== 'tolerance') {
      add('Model', '', name, r.value, `${unit}; ${r.definition}`);
      add('Model', '', name + ' fit residual', r.residual, unit);
    }
  add('Model', '', 'Radius fit tolerance', report.radii.tolerance, unit);
  if (report.measure) {
    add('Model', '', 'Intrinsic content', report.measure.content, unit + `^${report.dimension}`);
    add('Model', '', 'Boundary measure', report.measure.boundaryMeasure, unit + `^${report.dimension - 1}`);
  }
  if (report.algebraicMeasures) {
    const m = report.algebraicMeasures;
    if (report.dimension === 4)
      add(
        'Model',
        '',
        'Oriented algebraic 4D content',
        m.orientedAlgebraicContent4D,
        unit + '^4; signed multiplicity, not union content'
      );
    else {
      add(
        'Model',
        '',
        'Oriented algebraic volume',
        m.orientedAlgebraicVolume,
        unit + '^3; signed multiplicity, not union volume'
      );
      add(
        'Model',
        '',
        'Absolute algebraic face-area sum',
        m.absoluteAlgebraicFaceAreaSum,
        unit + '^2; not filled star area'
      );
    }
  }
  add('Model', '', 'Density', report.density.value, report.density.definition + ' ' + report.density.status);
  if (report.density.point) add('Model', '', 'Density point', list(report.density.point), unit);
  if (report.density.maxIntegerResidual !== undefined)
    add(
      'Model',
      '',
      'Density integer residual',
      report.density.maxIntegerResidual,
      'dimensionless; agreement of two independent 4D rays'
    );
  if (report.density.windingApproximate !== undefined && report.density.windingApproximate !== null)
    add(
      'Model',
      '',
      'Density integer residual',
      Math.abs(report.density.windingApproximate - Math.round(report.density.windingApproximate)),
      'dimensionless; solid-angle winding fit'
    );
  if (report.typeEvidence?.maxNormalizedVertexResidual !== undefined)
    add(
      'Types',
      '',
      'Symmetry vertex residual',
      report.typeEvidence.maxNormalizedVertexResidual,
      'normalized by source span; tolerance ' + report.typeEvidence.tolerance
    );
  add('Model', '', 'Euler characteristic', report.topology.euler, 'V − E + F (− C in 4D)');
  add('Model', '', 'Surface genus', report.topology.genus, report.definitions.genus);
  for (const [kind, types] of Object.entries(report.rows))
    for (const t of types) {
      const label = `${kind} type ${t.typeId + 1}`,
        count = t.count;
      add(label, count, 'Shape', t.shape, 'Symmetry orbit; representative source ID ' + t.representative);
      if (kind === 'edge') add(label, count, 'Length range', list(t.lengthRange), unit);
      if (kind === 'face') {
        add(label, count, 'Side lengths', list(t.sideLengths), unit);
        add(label, count, 'Interior angles', list(t.interiorAngles), 'degrees; ' + report.definitions.angles);
        add(label, count, 'Area', t.area, unit + '^2; ' + report.definitions.area);
      }
      if (kind === 'cell') {
        add(
          label,
          count,
          'Volume',
          t.volume,
          unit + '^3; only when the complete cell boundary matches its convex hull'
        );
        if (t.algebraicVolume !== undefined)
          add(label, count, 'Algebraic volume', t.algebraicVolume, unit + '^3; signed multiplicity');
        add(label, count, 'Surface area', t.surfaceArea, unit + '^2; ' + t.surfaceAreaDefinition);
      }
      if ('dihedrals' in t) {
        if (!t.dihedrals.length)
          add(label, count, 'Interior dihedral', null, 'Unavailable for generalized facet branches.');
        for (const a of t.dihedrals)
          add(
            label,
            count,
            `Dihedral: ${a.adjacentKind} types ${a.adjacentTypes.map((i) => i + 1).join(' / ')}`,
            list([a.min, a.max]),
            'degrees; convex interior, min / max'
          );
      }
    }
  if (!report.typesAvailable) add('Types', '', 'Unavailable', report.typeStatus, report.definitions.types);
  return rows;
}
export function informationCSV(rows) {
  return (
    rows.map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n') +
    '\r\n'
  );
}
export function informationText(rows) {
  return rows.map((row) => row.join('\t')).join('\n') + '\n';
}
export class InformationPanel {
  constructor(context) {
    this.context = context;
    this.session = new SourceMeasurementSession(context);
    const panel = document.createElement('details');
    panel.id = 'information-panel';
    panel.className = 'inspector-group';
    panel.innerHTML =
      '<summary>Measurements by element type</summary><p class="muted">Source coordinates; numerical measurements. Types are full symmetry orbits. Radii show not defined when their fit fails. See radius definitions and residuals below.</p><div class="button-row"><button id="information-refresh">Compute table</button><button id="information-copy">Copy as text</button><button id="information-csv">Export CSV</button></div><p id="information-status">Open to compute source measurements.</p><div id="information-table" class="information-table"></div>';
    document.getElementById('analysis').after(panel);
    this.panel = panel;
    this.node('status').setAttribute?.('role', 'status');
    panel.addEventListener('toggle', () => {
      if (panel.open && !this.reply && !this.busy) context.guard(() => this.refresh())();
    });
    this.node('refresh').onclick = context.guard(() => this.refresh());
    this.node('copy').onclick = context.guard(() => this.export('text'));
    this.node('csv').onclick = context.guard(() => this.export('csv'));
    this.sync();
  }
  node(key) {
    return this.panel.querySelector('#information-' + key);
  }
  invalidate() {
    this.cancel();
    this.reply = null;
    this.verify = null;
    this.node('table').replaceChildren();
    this.node('status').textContent = 'Open or compute to measure the current source.';
    this.sync();
  }
  cancel() {
    this.status?.settle(this.progress);
    this.session.cancel();
  }
  sync() {
    const s = this.context.getState(),
      disabled = this.busy || this.context.isExporting?.() || ![3, 4].includes(s?.model.dimension);
    for (const action of ['refresh', 'copy', 'csv'])
      this.node(action).disabled = disabled || (action !== 'refresh' && !this.reply);
    const reason = this.busy
      ? 'Finish or cancel the current measurement query.'
      : this.context.isExporting?.()
        ? 'Finish or cancel export first.'
        : 'Choose an intrinsic 3D or 4D model.';
    explainAvailability(this.panel, reason, {
      'information-copy': disabled ? reason : 'Compute the current measurement table first.',
      'information-csv': disabled ? reason : 'Compute the current measurement table first.',
    });
  }
  async refresh() {
    if (this.busy) throw Error('Finish or cancel the current information query first.');
    this.busy = true;
    this.reply = null;
    this.node('table').replaceChildren();
    this.status ??= createStatus((text) => {
      this.node('status').textContent = text;
    });
    this.status.set('');
    const progress = (this.progress = this.status.defer('Computing source measurements and symmetry types…'));
    this.sync();
    try {
      const reply = await this.session.run('information-panel', {}, this.context.run, 'Measure element types');
      reply.verify();
      this.reply = reply.result;
      this.verify = reply.verify;
      this.render();
    } catch (error) {
      this.node('status').textContent =
        error.name === 'AbortError' ? 'Information query canceled. Compute again to retry.' : error.message;
      throw error;
    } finally {
      this.status.settle(progress);
      this.busy = false;
      this.sync();
    }
  }
  rows() {
    this.verify();
    return informationRows(this.reply, this.context.getState().view.coordinateUnit ?? 'model');
  }
  render() {
    const rows = this.rows(),
      table = document.createElement('table');
    table.id = 'information-measurements';
    rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      for (const text of row) {
        const td = document.createElement(i ? 'td' : 'th');
        td.textContent = text;
        tr.append(td);
      }
      table.append(tr);
    });
    this.node('table').replaceChildren(table);
    this.node('status').textContent =
      'Numerical source measurements. ' +
      (this.reply.typesAvailable
        ? 'Types grouped by the numerically checked full symmetry group.'
        : this.reply.typeStatus);
  }
  async export(format) {
    if (this.context.isExporting?.()) throw Error('Finish the active export first.');
    const rows = this.rows(),
      verify = this.verify,
      unit = this.context.getState().view.coordinateUnit ?? 'model';
    const verifyPublication = () => {
      verify();
      if ((this.context.getState().view.coordinateUnit ?? 'model') !== unit)
        throw Error('Coordinate unit changed. Repeat the information export.');
    };
    verifyPublication();
    if (format === 'text') {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable. Use Export CSV.');
      await navigator.clipboard.writeText(informationText(rows));
      verifyPublication();
      this.node('status').textContent = 'Measurements copied as tab-separated text.';
      return;
    }
    this.busy = true;
    this.sync();
    try {
      return await publishBoundedExport(this.context.api, 'csv', informationCSV(rows), {
        verifyPublication,
        defaultName: 'Polytope measurements',
      });
    } finally {
      this.busy = false;
      this.sync();
    }
  }
}
