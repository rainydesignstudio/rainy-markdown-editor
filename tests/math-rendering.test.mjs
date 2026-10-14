import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { articleMarkdownPlugins, articleHtmlPlugins } from '../src/lib/article-format/pipeline.ts';
import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { activateFormatBundle, getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import { inspectMathSource } from '../src/lib/article-format/math.ts';
import { inspectArticleFormatMarkdown } from '../src/lib/articleFormat.ts';
import { parseKnowledgeText } from '../src/lib/knowledge/parse.ts';
import { resourceReferences, unsupportedResourceReferences } from '../src/lib/resources/references.ts';
import { clipboardPlainText } from '../src/lib/render.ts';
import { readFile } from 'node:fs/promises';

const policy = { singleDollar: true, maxLength: 8192, maxExpressions: 128 };
function bundle(enabled = true, parameters = policy) { const raw = structuredClone(DEFAULT_FORMAT_BUNDLE); raw.formatter.steps.push({ id: 'math', operator: 'markdown.math', enabled, parameters }); return raw; }
function render(source, raw = bundle()) {
  const snapshot = activateFormatBundle(raw, 'math-test'), processor = unified().use(remarkParse).use(articleMarkdownPlugins(snapshot)).use(remarkRehype, { allowDangerousHtml: true }).use(articleHtmlPlugins(snapshot));
  return processor.runSync(processor.parse(source), { value: source });
}
const nodes = (tree, match) => [...(match(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, match))];
const math = tree => nodes(tree, node => node.tagName === 'math');
const text = tree => tree.value ?? (tree.children ?? []).map(text).join('');

test('math is a registered optional formatter; absent and disabled libraries keep dollar/fenced source behavior', () => {
  assert.equal(compileFormatBundle(DEFAULT_FORMAT_BUNDLE).formatter.math, undefined);
  assert.equal(compileFormatBundle(bundle(false)).formatter.math, undefined);
  assert.equal(math(render('$x^2$\n\n```math\nx^2\n```', bundle(false))).length, 0);
  assert.equal(math(render('$x^2$\n\n$$\nx^2\n$$')).length, 2);
  assert.equal(getFormatSnapshot().bundle.formatter.math.maxExpressions, 128);
  for (const parameters of [{ ...policy, trust: true }, { ...policy, maxExpressions: 257 }, { ...policy, maxLength: 16385 }, { ...policy, singleDollar: 'true' }]) assert.throws(() => compileFormatBundle(bundle(true, parameters)));
});

test('inline, display and fenced math produce static MathML, TeX annotation and current source positions without fonts, HTML or network', () => {
  const source = 'Before\n\nInline $x^2+1$.\n\n$$\n\\frac{1}{2}\n$$\n\n```math\n\\sum_{n=1}^{5} n\n```', tree = render(source);
  assert.equal(math(tree).length, 3);
  const wrappers = nodes(tree, node => node.properties?.dataRenderKind === 'math');
  assert.deepEqual(wrappers.map(node => node.properties.dataSourceLine), [3, 5, 9]);
  assert.ok(nodes(tree, node => node.tagName === 'annotation').some(node => text(node) === '\\frac{1}{2}'));
  assert.equal(nodes(tree, node => ['img', 'script', 'iframe', 'link', 'style'].includes(node.tagName)).length, 0);
  assert.equal(nodes(tree, node => Object.keys(node.properties ?? {}).some(name => /^on/i.test(name) || ['href','src'].includes(name))).length, 0);
  assert.equal(inspectMathSource(source, policy, 'Body').issues.length, 0);
});

test('bad syntax, untrusted commands, expansion limits and expression/length limits retain source with line diagnostics', () => {
  for (const value of ['\\frac{', '\\href{https://example.test}{click}', '\\includegraphics{https://example.test/a.png}', '\\htmlStyle{color:red}{x}', '\\def\\a{\\a}\\a']) {
    const source = 'Intro\n\n$$\n' + value + '\n$$', checked = inspectMathSource(source, policy, 'Body');
    assert.equal(checked.issues.length, 1, value); assert.equal(checked.issues[0].line, 3);
    const tree = render(source), error = nodes(tree, node => node.properties?.dataRenderError === 'math'); assert.equal(error.length, 1, value); assert.match(text(error[0]), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(inspectMathSource('$x$ $y$', { ...policy, maxExpressions: 1 }, 'Body').issues[0].line, 1);
  assert.equal(nodes(render('$x$ $y$', bundle(true, { ...policy, maxExpressions: 1 })), node => node.properties?.dataRenderError === 'math').length, 1);
  assert.equal(inspectMathSource('$abcdefgh$', { ...policy, maxLength: 2 }, 'Body').issues.length, 1);
});

test('math cannot share macro state between expressions or use author HTML to preserve executable markup', () => {
  const tree = render('$\\gdef\\abc{a}\\abc$\n\n$\\abc$\n\n<script>alert(1)</script>');
  assert.equal(nodes(tree, node => node.properties?.dataRenderError === 'math').length, 1);
  assert.equal(nodes(tree, node => node.tagName === 'script').length, 0);
  assert.equal(inspectMathSource('$x$', { ...policy, singleDollar: false }, 'Body').count, 0);
  assert.equal(inspectMathSource('$$x$$', { ...policy, singleDollar: false }, 'Body').count, 1);
});

test('source checks report math failures and pass syntax only for actually rendered expressions', () => {
  activateFormatBundle(bundle(), 'math-test'); const passed = new Set();
  assert.equal(inspectArticleFormatMarkdown('$x^2$', 'Body', false, passed).issues.filter(issue => issue.messageKey === 'math.invalid').length, 0);
  assert.ok(passed.size); const failed = inspectArticleFormatMarkdown('Intro\n\n$\\badCommand$', 'Body');
  assert.equal(failed.issues.find(issue => issue.messageKey === 'math.invalid').line, 3);
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
  assert.equal(inspectArticleFormatMarkdown('$\\badCommand$', 'Body').issues.some(issue => issue.messageKey === 'math.invalid'), false);
});

test('knowledge/resource parsers exclude formula and Mermaid source contexts without hiding normal references', () => {
  const body = '$[[Math]] [math](hidden.md) ![math](hidden.png)$\n\n$$\n[block](block.md)\n$$\n\n```mermaid\n[[Diagram]]\n```\n\n[[Visible]]\n\n[Visible](visible.md)\n\n![Visible](visible.png)';
  assert.deepEqual(parseKnowledgeText(body, 'one.md').links.map(link => link.target), ['Visible', 'visible.md']);
  assert.deepEqual(resourceReferences(body).map(link => link.url), ['visible.png']);
  assert.equal(unsupportedResourceReferences('$<section style="background:url(hidden.png)">$').length, 0);
});

test('plain-text copying preserves TeX once and dependency resolution contains a single patched KaTeX', async () => {
  const element = display => ({ nodeType: 1, tagName: 'SPAN', getAttribute: name => name === 'data-render-kind' ? 'math' : name === 'data-math-display' ? String(display) : null, querySelector: () => ({ textContent: 'x^2' }), textContent: 'xx^2', childNodes: [] });
  assert.equal(clipboardPlainText(element(false)), '$x^2$'); assert.equal(clipboardPlainText(element(true)), '\n$$\nx^2\n$$\n');
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const katex = Object.keys(lock.packages).filter(key => /(?:^|\/)node_modules\/katex$/.test(key)); assert.deepEqual(katex, ['node_modules/katex']); assert.equal(lock.packages[katex[0]].version, '0.19.0');
});
