import { installPrecisionExample } from './precision-example.mjs';

const make = (doc, tag, id, text) => {
  const node = doc.createElement(tag);
  if (id) node.id = id;
  if (text) node.textContent = text;
  return node;
};
export function clearPrecisionValidation(doc) {
  doc.getElementById('validation-precision-note')?.remove();
  doc.getElementById('validation-details')?.remove();
}
export function syncPrecisionContext(doc, model, report) {
  const badge = doc.getElementById('numeric-badge');
  if (!badge) return;
  const rational = model.numeric?.mode === 'rational-exact' || report?.certificateStatus === 'revalidated',
    context = badge.parentElement,
    precision = doc.getElementById('precision-details');
  badge.textContent =
    report?.certificateStatus === 'unresolved'
      ? 'EXACT · UNRESOLVED'
      : rational
        ? model.numeric?.mode === 'rational-exact'
          ? 'RATIONAL'
          : 'RATIONAL CONSTRUCTION'
        : 'FLOAT64 · APPROX';
  if (context && precision) {
    if (rational) precision.before(context);
    else precision.querySelector('summary').after(context);
  }
}
export function organizePrecisionEvidence(doc) {
  installPrecisionExample(doc);
  const checks = doc.getElementById('advanced-checks');
  if (!checks || doc.getElementById('precision-details')) return;
  const details = make(doc, 'details', 'precision-details');
  details.className = 'inspector-group';
  details.append(make(doc, 'summary', null, 'Precision details'));
  const intro = doc.getElementById('advanced-intro');
  if (intro) details.append(intro);
  const badge = doc.getElementById('numeric-badge'),
    context = badge?.parentElement;
  if (context) details.append(context);
  const information = doc.getElementById('advanced-model-information');
  if (information) {
    for (const node of [...information.children])
      if (node.tagName === 'P' && node.textContent.startsWith('Calculations use numerical coordinates')) node.remove();
    details.append(information);
  }
  const evidence = doc.getElementById('evidence');
  if (evidence) evidence.after(details);
  else checks.append(details);
}
export function renderPrecisionValidation(doc, model, validation, options = {}) {
  const report = validation.precision;
  syncPrecisionContext(doc, model, report);
  const root = doc.getElementById('evidence'),
    open = options.open ?? doc.getElementById('validation-details')?.open ?? false;
  const title = make(doc, 'p', 'validation-summary');
  title.className = 'validation-status';
  title.setAttribute('role', 'status');
  const certified = report ? report.certificateStatus === 'revalidated' : model.numeric?.certified === true;
  title.textContent =
    (validation.passed ? 'Checks passed.' : 'Geometry checks failed.') +
    ' ' +
    (report?.certificateStatus === 'unresolved'
      ? 'Exact evidence is unresolved; measurements remain approximate.'
      : certified
        ? 'A scoped exact certificate is included; display and measurements use double precision.'
        : 'Coordinates are double-precision floating point.');
  const raw = make(doc, 'pre');
  raw.className = 'code-box';
  raw.textContent = JSON.stringify(
    { numeric: model.numeric, certificate: model.certificate, provenance: model.provenance, validation },
    null,
    2
  );
  const details = make(doc, 'details', 'validation-details');
  details.className = 'inspector-group';
  details.open = open;
  details.append(make(doc, 'summary', null, 'Checks, calculation method and source'));
  if (report) {
    const properties = make(doc, 'div', 'precision-property-report');
    properties.style.overflowWrap = 'anywhere';
    properties.append(
      make(doc, 'p', null, 'Property guarantees — ' + report.certificateStatus),
      make(doc, 'p', null, report.inputInterpretation)
    );
    const statuses = { 'numerical-pass': 'numerical checks passed' },
      residualLabels = {
        exactPredicateResidual: 'Rational equality residual',
        maxDisplayCoordinateRoundingError: 'Maximum display coordinate rounding error',
        maxDisplayPlaneEquationResidual: 'Maximum display plane equation residual',
      };
    for (const row of report.properties ?? [])
      properties.append(
        make(
          doc,
          'p',
          null,
          `${row.property}: ${statuses[row.status] ?? row.status}.${row.scope ? ' ' + row.scope : ''}`
        )
      );
    for (const [key, value] of Object.entries(report.residuals ?? {}))
      properties.append(make(doc, 'p', null, `${residualLabels[key] ?? key}: ${value}`));
    if (report.guaranteeLoss) properties.append(make(doc, 'p', null, report.guaranteeLoss.reason));
    for (const text of report.unresolved ?? []) properties.append(make(doc, 'p', null, 'Unresolved: ' + text));
    if (report.fallback?.implemented === false)
      properties.append(make(doc, 'p', null, 'Fallback unavailable: ' + report.fallback.scope));
    if (report.fallback?.implemented === true)
      properties.append(make(doc, 'p', null, 'Bounded rational fallback: ' + report.fallback.scope));
    details.append(properties);
  }
  details.append(raw);
  const warnings = (validation.warnings ?? [])
    .filter((w) => w !== 'Geometry is approximate. Structural checks are evidence, not an exact certificate.')
    .map((w) => {
      const p = make(doc, 'p', null, w);
      p.className = 'validation-warning';
      return p;
    });
  const precision = doc.getElementById('precision-details');
  const note = make(
    doc,
    'p',
    'validation-precision-note',
    report?.certificateStatus === 'unresolved'
      ? 'Exact evidence is unresolved. Read the property guarantees before using a certificate. Measurements remain approximate.'
      : certified
        ? 'The certificate covers only its stated property of the supplied coordinates. Display and measurements remain numerical.'
        : 'Geometry and measurements use double-precision numerical calculations. Passing structural checks is not an exactness certificate.'
  );
  note.className = 'muted';
  if (precision) {
    clearPrecisionValidation(doc);
    precision.append(note);
    root.replaceChildren(title, ...warnings, details);
  } else root.replaceChildren(title, ...warnings, note, details);
}
