import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactSource,
  matchSource,
  doesNotMatchSource,
  includesSource,
  indexOfSource,
  sourceFunction,
  sourceProperty,
  sourceInitializer,
  sourceStatement,
  sourceStrings,
  htmlElement,
} from './helpers/source-match.mjs';

test('source matching preserves tokens, literals and order across formatter choices', () => {
  const variants = [
    "const handler=event=>{before('source');after({mode:'exact'});};",
    'const handler = (event) => {\n // formatting\n before(\n "source",\n );\n after({mode: "exact",});\n};',
    'const handler = event => { before("source")\n after({ mode: "exact" })\n }',
  ];
  assert.equal(new Set(variants.map(compactSource)).size, 1);
  for (const source of variants) {
    matchSource(source, /event=>\{before\('source'\);after\(\{mode:'exact'\}\)/);
    doesNotMatchSource(source, /after\(.*before\(/);
    assert.ok(includesSource(source, "before('source')"));
    assert.ok(indexOfSource(source, "before('source')") < indexOfSource(source, 'after('));
    assert.ok(!includesSource(source, "before('other')"));
    assert.ok(!includesSource(source, "after({mode:'approximate'})"));
  }
});
test('normalization retains shadowed identifiers, operators and literal whitespace', () => {
  const source = 'const model=()=>null; const f=(model)=>({model, text:"a  b", pattern:/a b/});';
  matchSource(source, /f=model=>\(\{model,text:'a  b',pattern:\/a b\//);
  assert.ok(!includesSource(source, "text:'a b'"));
  assert.ok(!includesSource("const text='ab';", "text:'a;b'"));
  assert.ok(!includesSource('function f(){return value;}', 'return;'));
  assert.ok(includesSource('function f(){return;}', 'return;'));
  assert.notEqual(compactSource('if(a&&b)call()'), compactSource('if(a||b)call()'));
  assert.notEqual(compactSource('const a=[1,,];'), compactSource('const a=[1];'));
});
test('AST extraction executes complete original functions, statements and callback properties', () => {
  const source =
    'const panel = new Panel({ preview: (value,) => { return value + 1; }, });\nasync function run(\n value,\n) { return await Promise.resolve(value); }\nbase.onCamera = (value) => { draw(value); };';
  assert.equal(new Function('return ' + sourceProperty(sourceInitializer(source, 'panel'), 'preview'))()(2), 3);
  assert.match(sourceFunction(source, 'run'), /Promise.resolve/);
  assert.equal(
    sourceStatement(source, (n) => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression'),
    'base.onCamera = (value) => { draw(value); };'
  );
  assert.throws(() => sourceFunction(source, 'absent'), /Expected one function/);
});

test('markup checks inspect decoded literals while comments cannot supply wiring', () => {
  const source = "// before('source')\npanel.innerHTML = '<p id=\"note\" data-expert>Text</p>';";
  assert.ok(sourceStrings(source).some((text) => text.includes('id="note" data-expert')));
  assert.ok(!includesSource(source, "before('source')"));
});

test('HTML fixtures retain whole nested elements across attribute wrapping and quotes', () => {
  const fragment =
    "<section\n class='panel'\n id = 'evidence'>before<section>nested</section><!-- </section> -->after</section>";
  assert.equal(htmlElement('<!-- <section id="evidence"> -->' + '<main>' + fragment + '</main>', 'evidence'), fragment);
  assert.throws(() => htmlElement('<section id="evidence">', 'evidence'), /Unclosed/);
});
