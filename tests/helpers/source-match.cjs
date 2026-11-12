const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const { parseAst } = require('rollup/parseAst');

// Parser ranges protect strings, regexes and template text while syntax is compacted.
const cache = new Map();
function parseSource(source) {
  try {
    return parseAst(source);
  } catch (error) {
    if (!/Return statement is not allowed/.test(error.message)) throw error;
    const prefix = 'function __source__(){\n',
      tree = parseAst(prefix + source + '\n}').body[0].body;
    walk(tree, (node) => {
      node.start -= prefix.length;
      node.end -= prefix.length;
    });
    return { type: 'Program', start: 0, end: source.length, body: tree.body };
  }
}
function compactSource(input) {
  const source = String(input);
  if (cache.has(source)) return cache.get(source);
  let tree;
  try {
    tree = parseSource(source);
  } catch {
    try {
      return transformSync(source, { loader: 'css', minifyWhitespace: true, logLevel: 'silent' }).code;
    } catch {
      return source;
    }
  }
  const literals = new Map(),
    omitted = new Set(),
    ends = new Set();
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal')
      literals.set(node.start, {
        end: node.end,
        text:
          typeof node.value === 'string'
            ? JSON.stringify(node.value)
            : node.regex || node.bigint
              ? source.slice(node.start, node.end)
              : String(node.value),
      });
    if (node.type === 'TemplateElement' && node.end > node.start)
      literals.set(node.start, { end: node.end, text: source.slice(node.start, node.end) });
    if (node.type === 'ArrowFunctionExpression' && node.params.length === 1 && node.params[0].type === 'Identifier') {
      const p = node.params[0],
        head = source.slice(node.start, p.start),
        tail = source.slice(p.end, node.body.start),
        arrow = tail.indexOf('=>');
      const open = head.lastIndexOf('('),
        close = tail.lastIndexOf(')', arrow);
      if (open >= 0 && close >= 0) {
        omitted.add(node.start + open);
        omitted.add(p.end + close);
      }
    }
    const list =
      node.type === 'ArrayExpression'
        ? node.elements
        : node.type === 'ObjectExpression' || node.type === 'ObjectPattern'
          ? node.properties
          : (node.arguments ?? node.params);
    if (list?.length && list.at(-1)) {
      const last = list.at(-1).end,
        tail = source.slice(last, node.end),
        comma = tail.match(/^\s*,(?=\s*[\])}])/);
      if (comma) omitted.add(last + comma[0].lastIndexOf(','));
    }
    if (
      /^(ExpressionStatement|VariableDeclaration|ReturnStatement|ThrowStatement|BreakStatement|ContinueStatement|DebuggerStatement)$/.test(
        node.type
      ) &&
      !/^For/.test(parent?.type || '') &&
      source[node.end - 1] !== ';'
    )
      ends.add(node.end);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else if (value && typeof value === 'object') visit(value, node);
    }
  };
  visit(tree, null);
  const tokens = [];
  for (let i = 0; i < source.length; ) {
    if (ends.has(i) && tokens.at(-1) !== ';') tokens.push(';');
    if (omitted.has(i) || /\s/.test(source[i])) {
      i++;
      continue;
    }
    const literal = literals.get(i);
    if (literal) {
      tokens.push(literal.text);
      i = literal.end;
      continue;
    }
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (source.startsWith('/*', i)) {
      i = source.indexOf('*/', i + 2) + 2;
      continue;
    }
    const word = source.slice(i).match(/^[\w$\u0080-\uffff]+/),
      operator = source
        .slice(i)
        .match(
          /^(?:===|!==|>>>|\*\*=|&&=|\|\|=|\?\?=|=>|\.\.\.|\?\.|==|!=|<=|>=|\+\+|--|&&|\|\||\?\?|\*\*|<<|>>|[+*/%&|^!-]=)/
        );
    const token = word?.[0] ?? operator?.[0] ?? source[i];
    tokens.push(token);
    i += token.length;
  }
  if (ends.has(source.length) && tokens.at(-1) !== ';') tokens.push(';');
  const filtered = tokens.filter((token, i) => !(token === ';' && (tokens[i + 1] === '}' || i === tokens.length - 1)));
  let result = '';
  for (let i = 0; i < filtered.length; i++) {
    const a = filtered[i - 1] || '',
      b = filtered[i];
    if (
      (/[\w$\u0080-\uffff]$/.test(a) && /^[\w$\u0080-\uffff]/.test(b)) ||
      (a === '+' && b === '+') ||
      (a === '-' && b === '-')
    )
      result += ' ';
    result += b;
  }
  if (cache.size >= 32) cache.clear();
  cache.set(source, result);
  return result;
}
function sourcePattern(pattern) {
  const text = pattern.source;
  let out = '',
    inClass = false,
    quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      const next = text[++i];
      if (!inClass && !quote && ['n', 'r', 't'].includes(next)) out += '\\s*';
      else if (!inClass && !quote && next === 's' && /[+*]/.test(text[i + 1] || '')) {
        i++;
        out += '\\s*';
      } else out += '\\' + next;
    } else if (c === '[') {
      inClass = true;
      out += c;
    } else if (c === ']') {
      inClass = false;
      out += c;
    } else if (inClass) out += c;
    else if (c === "'" || c === '"') {
      out += '["\']';
      quote = quote === c ? null : (quote ?? c);
    } else if (quote) out += c;
    else if (c === ';') {
      const tail = text.slice(i + 1).replace(/^(?:\s|\\[nrt]|\\s[+*?]?)+/, '');
      out += tail.startsWith('\\}') || tail.startsWith('\\)') ? ';?' : !tail ? '(?:;|(?=[})]|$))' : ';';
    } else if (/\s/.test(c)) {
      let end = i + 1;
      while (end < text.length && /\s/.test(text[end])) end++;
      out += /[\w$]/.test(text[i - 1] || '') && /[\w$]/.test(text[end] || '') ? '\\s+' : '\\s*';
      i = end - 1;
    } else out += c;
  }
  return new RegExp(out, pattern.flags);
}
function matchSource(source, pattern, message) {
  assert.ok(sourcePattern(pattern).test(compactSource(source)), message ?? 'Expected source to match ' + pattern);
}
function doesNotMatchSource(source, pattern, message) {
  assert.ok(!sourcePattern(pattern).test(compactSource(source)), message ?? 'Expected source not to match ' + pattern);
}
function findSource(source, pattern) {
  return compactSource(source).match(sourcePattern(pattern));
}
function matchAllSource(source, pattern) {
  return compactSource(source).matchAll(sourcePattern(pattern));
}
const escapePattern = (text) => [...String(text)].map((c) => ('\\^$.*+?()[]{}|'.includes(c) ? '\\' + c : c)).join('');
function includesSource(source, text) {
  return sourcePattern(new RegExp(escapePattern(text))).test(compactSource(source));
}
function indexOfSource(source, text) {
  return compactSource(source).search(sourcePattern(new RegExp(escapePattern(text))));
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function sourceNodes(source, predicate) {
  const nodes = [];
  walk(parseSource(source), (node) => {
    if (predicate(node)) nodes.push(node);
  });
  return nodes;
}
function sourceFunction(source, name) {
  const nodes = sourceNodes(source, (node) => node.type === 'FunctionDeclaration' && node.id?.name === name);
  assert.equal(nodes.length, 1, 'Expected one function ' + name);
  return source.slice(nodes[0].start, nodes[0].end);
}
function sourceStatement(source, predicate) {
  const nodes = sourceNodes(
    source,
    (node) => /Statement$/.test(node.type) && predicate(node, source.slice(node.start, node.end))
  );
  assert.equal(nodes.length, 1, 'Expected one matching statement');
  return source.slice(nodes[0].start, nodes[0].end);
}
function sourceProperty(source, name) {
  const nodes = sourceNodes(source, (node) => node.type === 'Property' && (node.key.name ?? node.key.value) === name);
  assert.equal(nodes.length, 1, 'Expected one property ' + name);
  return source.slice(nodes[0].value.start, nodes[0].value.end);
}

function sourceAnchor(source, name) {
  const predicate = (node) =>
    (node.type === 'FunctionDeclaration' && node.id?.name === name) ||
    (node.type === 'VariableDeclaration' && node.declarations.some((d) => d.id?.name === name));
  let nodes = parseSource(source).body.filter(predicate);
  if (!nodes.length) nodes = sourceNodes(source, predicate);
  assert.equal(nodes.length, 1, 'Expected one declaration ' + name);
  return nodes[0];
}
function sourceRange(source, start, end) {
  const a = sourceAnchor(source, start),
    b = sourceAnchor(source, end);
  assert.ok(a.start < b.start, start + ' must precede ' + end);
  return source.slice(a.start, b.start);
}
function sourceAssignment(source, target) {
  return sourceStatement(
    source,
    (node) =>
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'AssignmentExpression' &&
      compactSource(source.slice(node.expression.left.start, node.expression.left.end)) === compactSource(target)
  );
}
function sourceInitializer(source, name) {
  const node = sourceAnchor(source, name);
  assert.equal(node.type, 'VariableDeclaration');
  const value = node.declarations.find((d) => d.id?.name === name).init;
  return source.slice(value.start, value.end);
}

function sourceStrings(source) {
  return sourceNodes(
    source,
    (node) => (node.type === 'Literal' && typeof node.value === 'string') || node.type === 'TemplateElement'
  ).map((node) => (node.type === 'Literal' ? node.value : node.value.raw));
}

function htmlElement(source, id) {
  const tags = [...source.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)];
  const starts = tags
    .map((tag, i) => ({ tag, i }))
    .filter(({ tag }) => tag[1] && !tag[0].startsWith('</') && tag[0].match(/\bid\s*=\s*(["'])(.*?)\1/)?.[2] === id);
  assert.equal(starts.length, 1, 'Expected one HTML element ' + id);
  const { tag, i } = starts[0],
    name = tag[1].toLowerCase();
  let depth = 0;
  for (const current of tags.slice(i)) {
    if (current[1]?.toLowerCase() !== name) continue;
    depth += current[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(tag.index, current.index + current[0].length);
  }
  assert.fail('Unclosed HTML element ' + id);
}

module.exports = {
  compactSource,
  sourcePattern,
  matchSource,
  doesNotMatchSource,
  findSource,
  matchAllSource,
  includesSource,
  indexOfSource,
  sourceNodes,
  sourceFunction,
  sourceStatement,
  sourceProperty,
  sourceRange,
  sourceAssignment,
  sourceInitializer,
  sourceStrings,
  htmlElement,
};
