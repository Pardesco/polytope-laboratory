// Search supplied catalog metadata without guessing absent properties.
const fields = { v: 0, vertices: 0, e: 1, edges: 1, f: 2, faces: 2, c: 3, cells: 3 };
const numeric = (entry, key) =>
  key in fields
    ? entry.counts?.[fields[key]]
    : key === 'd' || key === 'dim' || key === 'dimension'
      ? entry.dimension
      : key === 'genus'
        ? entry.genus
        : key === 'parts' || key === 'components'
          ? entry.componentCount
          : undefined;
const textOf = (entry) =>
  [
    entry.name,
    entry.relativePath,
    entry.category,
    entry.key,
    entry.family,
    entry.symbol,
    entry.wythoffSymbol,
    entry.coxeterDiagram,
    entry.symmetryGroup,
    ...(entry.symmetryGroups ?? []),
    entry.status,
    entry.diagnostic,
    entry.auditStatus,
    entry.auditDiagnostic,
    entry.coxeterFamily,
    entry.rings?.join(''),
    entry.coxeterFamily && entry.rings ? entry.coxeterFamily + ' ' + entry.rings.join('') : '',
    ...(entry.counts ?? []),
    ...(entry.aliases ?? []),
  ]
    .join(' ')
    .toLowerCase();
const properties = {
  uniform: 'uniform',
  regular: 'regular',
  vt: 'vertexTransitive',
  'vertex-transitive': 'vertexTransitive',
  vertextransitive: 'vertexTransitive',
  convex: 'convex',
  chiral: 'chiral',
  nearmiss: 'nearMiss',
  'near-miss': 'nearMiss',
  scaliform: 'scaliform',
  fissary: 'fissary',
};
const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s/g, '');
export function catalogPropertyMatches(entry, key, value) {
  if (key === 'symmetry')
    return [entry.symmetryGroup, entry.coxeterFamily, ...(entry.symmetryGroups ?? [])].some(
      (v) => v !== undefined && norm(v) === norm(value)
    );
  if (key === 'shape')
    return value === 'convex' ? entry.convex === true : value === 'star' ? entry.convex === false : false;
  const actual = entry[properties[key] ?? key];
  return value === 'unknown'
    ? typeof actual !== 'boolean'
    : value === 'true' || value === 'yes'
      ? actual === true
      : value === 'false' || value === 'no'
        ? actual === false
        : false;
}
/** Parse once per search. Entry values remain live: no object-identity cache may
 * hide changed counts, aliases or audit metadata on a later render. */
export function compileCatalogQuery(query) {
  const tokens =
    String(query ?? '')
      .toLowerCase()
      .match(/"[^"]*"|\S+/g) ?? [];
  const tests = tokens.map((token) => {
    const property = token.match(
      /^(symmetry|shape|uniform|regular|vt|vertex-transitive|vertextransitive|convex|chiral|nearmiss|near-miss|scaliform|fissary):(.+)$/
    );
    if (property) return { property: property[1], value: property[2] };
    const index = token.match(/^(uc|[ucwko])0*(\d+)$/);
    if (index) return { index: index[1] + Number(index[2]) };
    const match = token.match(
      /^(v|vertices|e|edges|f|faces|c|cells|d|dim|dimension|genus|parts|components)(:|=|>=|<=|>|<)(\d+)$/
    );
    return match
      ? { key: match[1], operator: match[2], target: Number(match[3]) }
      : { text: token.replace(/^"|"$/g, '') };
  });
  return (entry) => {
    let haystack;
    for (const test of tests) {
      if (test.property) {
        if (!catalogPropertyMatches(entry, test.property, test.value)) return false;
        continue;
      }
      if (test.index) {
        if (
          !(entry.aliases ?? []).some((alias) =>
            String(alias)
              .toLowerCase()
              .split(/\s+/)
              .some((word) => {
                const m = word.match(/^(uc|[ucwko])0*(\d+)$/);
                return m && m[1] + Number(m[2]) === test.index;
              })
          )
        )
          return false;
        continue;
      }
      if (test.text !== undefined) {
        haystack ??= textOf(entry);
        if (!haystack.includes(test.text)) return false;
        continue;
      }
      const value = numeric(entry, test.key),
        target = test.target;
      if (!Number.isFinite(value)) return false;
      switch (test.operator) {
        case ':':
        case '=':
          if (value !== target) return false;
          break;
        case '>=':
          if (value < target) return false;
          break;
        case '<=':
          if (value > target) return false;
          break;
        case '>':
          if (value <= target) return false;
          break;
        case '<':
          if (value >= target) return false;
          break;
      }
    }
    return true;
  };
}
export function catalogMatches(entry, query) {
  return compileCatalogQuery(query)(entry);
}
