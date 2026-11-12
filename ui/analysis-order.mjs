import { organizeAnalysisOverview } from './analysis-overview.mjs';
export function orderAnalysisGroups(doc) {
  if (organizeAnalysisOverview(doc)) return;
  const summary = doc.getElementById('analysis');
  if (!summary) return;
  let anchor = summary;
  for (const id of ['element-types', 'information-panel', 'library-related', 'polychoron-relationships']) {
    const node = doc.getElementById(id);
    if (node) {
      anchor.after(node);
      anchor = node;
    }
  }
}
