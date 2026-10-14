import './rendering-dom-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';
import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { articleMarkdownPlugins, articleHtmlPlugins } from '../src/lib/article-format/pipeline.ts';
import { mermaidSourceProblem, inspectMermaidSource, mermaidFrameDocument, renderMermaidImage, validMermaidImage } from '../src/lib/article-format/mermaid.ts';
import { sanitizeHtml } from '../src/lib/article-format/sanitize.ts';
import { clipboardPlainText } from '../src/lib/render.ts';
import { prepareRenderRecord } from '../src/lib/article-format/renderRecords.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { inspectArticleFormatReport } from '../src/lib/articleFormatReport.ts';

const policy = { theme: 'neutral', maxLength: 16384, maxDiagrams: 16 };
const source = 'flowchart TD\n A[Start] --> B[Finish]';
const raw = (enabled = true, parameters = policy) => { const bundle = structuredClone(DEFAULT_FORMAT_BUNDLE); bundle.formatter.steps.push({ id: 'mermaid', operator: 'markdown.mermaid', enabled, parameters }); return bundle; };
const key = name => error => error.messageKey === name;
const nodes = (tree, match) => [...(match(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, match))];

test('Mermaid is an optional registered formatter and old/disabled libraries preserve code fences', () => {
  assert.equal(compileFormatBundle(DEFAULT_FORMAT_BUNDLE).formatter.mermaid, undefined);
  assert.equal(compileFormatBundle(raw(false)).formatter.mermaid, undefined);
  assert.deepEqual(compileFormatBundle(raw()).formatter.mermaid, policy);
  for (const parameters of [{ ...policy, theme: 'custom' }, { ...policy, securityLevel: 'loose' }, { ...policy, maxLength: 32769 }, { ...policy, maxDiagrams: 33 }]) assert.throws(() => compileFormatBundle(raw(true, parameters)));
});

test('static Mermaid accepts the common diagram families and rejects executable/configured/remote content and limits', () => {
  for (const value of ['graph TD\n A-->B', 'sequenceDiagram\n A->>B: Hello', 'stateDiagram-v2\n [*]-->One', 'classDiagram\n class User', 'erDiagram\n A ||--o{ B : owns']) assert.equal(mermaidSourceProblem(value, policy), null, value);
  for (const value of ['%%{init:{securityLevel:"loose"}}%%\n'+source, '---\nconfig: {}\n---\n'+source, source+'\nclick A callback', source+'\nstyle A fill:url(https://example.test/a)', 'graph TD\n A["<img src=x onerror=alert(1)>"]', 'flowchart TD\n A@{img:"x"}']) assert.equal(mermaidSourceProblem(value, policy), 'mermaid.unsafe', value);
  assert.equal(mermaidSourceProblem('pie\n "One": 1', policy), 'mermaid.unsupported');
  assert.equal(mermaidSourceProblem(source, { ...policy, maxLength: 2 }), 'mermaid.limit');
  assert.equal(mermaidSourceProblem('graph TD\n'+Array.from({length:257},(_,n)=>'n'+n).join('\n'), policy), 'mermaid.limit');
  const issues = inspectMermaidSource('Intro\n\n```mermaid\n'+source+'\n```\n\n```mermaid\n'+source+'\n```', { ...policy, maxDiagrams: 1 }, 'Body'); assert.equal(issues.length, 1); assert.equal(issues[0].line, 8);
});

test('the installed official Mermaid parser validates supported grammar and rejects malformed source', async () => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, maxTextSize: 32768, maxEdges: 100, layout: 'dagre' });
  for (const value of [source, 'sequenceDiagram\n A->>B: Hello', 'stateDiagram-v2\n [*]-->One', 'classDiagram\n class User', 'erDiagram\n A ||--o{ B : owns']) assert.ok(await mermaid.parse(value));
  await assert.rejects(mermaid.parse('flowchart TD\n A --> ['), /Parse error/);
});

test('static MathML survives the output sanitizer only when enabled; unsafe content is removed and diagram plain text retains source', () => {
  const bundle = raw(); bundle.formatter.steps.push({ id: 'math', operator: 'markdown.math', enabled: true, parameters: { singleDollar: true, maxLength: 8192, maxExpressions: 128 } });
  const snapshot = activateFormatBundle(bundle, 'math-output');
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: articleMarkdownPlugins(snapshot), rehypePlugins: articleHtmlPlugins(snapshot) }, '$x^2$'));
  const clean = sanitizeHtml(html, snapshot); assert.match(clean, /<math/); assert.match(clean, /<msup>/); assert.ok(!clean.includes('x^2'), 'unsupported annotations are removed with their text, not flattened into duplicate visible TeX');
  const unsafe = sanitizeHtml('<math><mi onclick="alert(1)">x</mi><script>alert(1)</script></math>', snapshot); assert.ok(!/onclick|<script/.test(unsafe));
  const disabled = activateFormatBundle(raw(false), 'disabled'); assert.ok(!sanitizeHtml(html, disabled).includes('<math'));
  const image = document.createElement('img'); image.setAttribute('data-render-kind','mermaid'); image.setAttribute('data-diagram-source',source);
  assert.equal(clipboardPlainText(image), '\n```mermaid\n'+source+'\n```\n');
});

test('source positions, trusted fence markers and counts reach React props; author marker spoofing stays inert', () => {
  const snapshot = activateFormatBundle(raw(true, { ...policy, maxDiagrams: 1 }), 'mermaid');
  const body = 'Intro\n\n```mermaid\n'+source+'\n```\n\n```mermaid\n'+source+'\n```\n\n<code class="language-mermaid" data-mermaid-source="true">graph TD; A-->B</code>';
  const processor = unified().use(remarkParse).use(articleMarkdownPlugins(snapshot)).use(remarkRehype, { allowDangerousHtml: true }).use(articleHtmlPlugins(snapshot));
  const tree = processor.runSync(processor.parse(body));
  const codes = nodes(tree, node => node.tagName === 'code' && node.properties?.dataMermaidSource === 'true'); assert.equal(codes.length, 2); assert.equal(codes[0].position.start.line, 3); assert.equal(codes[1].properties.dataMermaidRejected, 'mermaid.limit');
  const props = [];
  renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: articleMarkdownPlugins(snapshot), rehypePlugins: articleHtmlPlugins(snapshot), components: { code: data => { props.push(data); return React.createElement('code', null, data.children); } } }, body));
  assert.equal(props.filter(value => value['data-mermaid-source'] === 'true').length, 2);
  assert.equal(props.find(value => value['data-mermaid-rejected'])['data-mermaid-rejected'], 'mermaid.limit');
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
});

test('opaque frame has no network/font/child-frame permissions or author code, and only bounded PNG results pass', () => {
  const html = mermaidFrameDocument('nonce', 'http://localhost:3501');
  for (const value of ["connect-src 'none'", "font-src 'none'", "frame-src 'none'", "base-uri 'none'", '/algorithm/mermaid/mermaid.min.js', '/format/article-mermaid-bootstrap.js']) assert.ok(html.includes(value));
  assert.ok(!html.includes('allow-same-origin')); assert.ok(!html.includes('unsafe-eval')); assert.throws(() => mermaidFrameDocument('nonce', 'javascript:alert(1)'));
  const image = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAA=', width: 20, height: 30 };
  assert.equal(validMermaidImage(image), true);
  for (const bad of [{ ...image, width: 4097 }, { ...image, height: 0 }, { ...image, dataUrl: 'data:image/svg+xml;base64,AAAA' }, { ...image, dataUrl: 'https://example.test/a.png' }, { ...image, dataUrl: 'data:image/png;base64,AAAA' }]) assert.equal(validMermaidImage(bad), false);
});

test('a pending diagram cannot be stored as a completed render/history record', async () => {
  const snapshot = activateFormatBundle(raw(), 'pending-render');
  const element = document.createElement('section'); element.innerHTML = '<span data-render-kind="mermaid" data-render-state="pending">Pending</span>';
  await assert.rejects(prepareRenderRecord('```mermaid\n'+source+'\n```', BASIC_THEME, element, '', { snapshot }), key('mermaid.pending'));
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
});

test('source and rendered Mermaid failures produce one localized finding per fence without repeating the error prefix', async () => {
  const bundle = raw(); bundle.formatter.steps.push({ id: 'math', operator: 'markdown.math', enabled: true, parameters: { singleDollar: true, maxLength: 8192, maxExpressions: 128 } });
  activateFormatBundle(bundle, 'native-error-report');
  const body = '# Source must remain\n\n$\\badCommand$\n\n```mermaid\nflowchart TD\n A --> [\n```\n\n```mermaid\nflowchart TD\n A --> B\n click A callback\n```';
  const preview = document.createElement('article');
  preview.innerHTML = '<span data-render-error="mermaid" data-render-error-key="mermaid.invalid" data-render-error-cause="Parse error" data-source-line="5" title="Already localized"></span><span data-render-error="mermaid" data-render-error-key="mermaid.unsafe" data-source-line="10" title="Already localized"></span>';
  try {
    const report = await inspectArticleFormatReport(body, BASIC_THEME, preview, undefined, { deep: false });
    const errors = report.body.issues.filter(issue => issue.messageKey?.startsWith('mermaid.') || issue.messageKey === 'math.invalid');
    assert.equal(errors.length, 3);
    assert.deepEqual(errors.map(issue => issue.line).sort((a, b) => a - b), [3, 5, 10]);
    assert.equal(errors.find(issue => issue.line === 5).messageParams.cause, 'Parse error');
    assert.equal(errors.filter(issue => issue.line === 10).length, 1);
  } finally { activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'); }
});

test('queued rendering validates message source/origin/token, discards cancelled/stale results and never returns SVG', async () => {
  const previous = { window: globalThis.window, document: globalThis.document, location: globalThis.location, setTimeout: globalThis.setTimeout };
  const listeners = new Set(), frames = []; let reply = true, removed = 0;
  const dispatch = event => { for (const listener of [...listeners]) listener(event); };
  globalThis.setTimeout = (...args) => { const timer = previous.setTimeout(...args); timer.unref(); return timer; };
  globalThis.window = { addEventListener: (name, callback) => listeners.add(callback), removeEventListener: (name, callback) => listeners.delete(callback) };
  globalThis.location = { origin: 'http://localhost:3501' };
  globalThis.document = { createElement() { const frame = { attrs: {}, style: {}, setAttribute(key,value) { this.attrs[key]=value; }, remove() { removed++; }, contentWindow: { postMessage(data) { if (!reply) return; queueMicrotask(() => { const image = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAA=', width: 20, height: 30 }; dispatch({ source: {}, origin: 'null', data: { ...data, image } }); dispatch({ source: frame.contentWindow, origin: 'https://bad.test', data: { ...data, image } }); dispatch({ source: frame.contentWindow, origin: 'null', data: { ...data, token: 'wrong', image } }); dispatch({ source: frame.contentWindow, origin: 'null', data: { ...data, image } }); }); } } }; frames.push(frame); return frame; }, body: { append(frame) { const config = JSON.parse(/data-mermaid-host>(.*?)<\/script>/.exec(frame.srcdoc)[1]); if (reply) queueMicrotask(() => dispatch({ source: frame.contentWindow, origin: 'null', data: { kind: 'mermaid-ready', hostToken: config.hostToken } })); } } };
  try {
    const image = await renderMermaidImage(source, policy, 'protocol-1', new AbortController().signal, () => true);
    assert.equal(image.dataUrl.startsWith('data:image/png;'), true); assert.equal(frames[0].attrs.sandbox, 'allow-scripts'); assert.equal(listeners.size, 0);
    await assert.rejects(renderMermaidImage(source+'\n C', policy, 'old', new AbortController().signal, () => false), key('mermaid.changed'));
    reply = false; const abort = new AbortController(), pending = renderMermaidImage(source+'\n D', policy, 'protocol-cancel', abort.signal, () => true);
    for (let n=0;n<10;n++) await Promise.resolve(); abort.abort(); await assert.rejects(pending); assert.ok(removed); assert.equal(listeners.size, 0);
    reply = true; const recovered = await renderMermaidImage(source+'\n E', policy, 'protocol-recovered', new AbortController().signal, () => true); assert.equal(recovered.width, 20); assert.equal(listeners.size, 0);
  } finally { Object.assign(globalThis, previous); }
});

test('the local renderer pins official source/build inputs and the bootstrap uses strict noninteractive raster output', async () => {
  const meta = JSON.parse(await readFile(new URL('../resources/render/mermaid.json', import.meta.url), 'utf8'));
  const bytes = await readFile(new URL('../public/algorithm/mermaid/mermaid.min.js', import.meta.url)); assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
  const entry = await readFile(new URL('../node_modules/mermaid/dist/mermaid.core.mjs', import.meta.url)); assert.equal(createHash('sha256').update(entry).digest('hex'), meta.sourceSha256); assert.equal(meta.katex, '0.19.0'); assert.ok(!bytes.toString().includes('0.16.47'));
  const bootstrap = await readFile(new URL('../public/format/article-mermaid-bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /securityLevel: 'strict'/); assert.match(bootstrap, /htmlLabels: false/); assert.match(bootstrap, /toDataURL\('image\/png'\)/); assert.ok(!bootstrap.includes('bindFunctions(')); assert.ok(!bootstrap.includes('fetch('));
  const licenses = JSON.parse(await readFile(new URL('../resources/render/mermaid-licenses.json', import.meta.url), 'utf8'));
  assert.ok(licenses.some(item => item.package === 'mermaid' && item.version === meta.version));
  for (const item of licenses) assert.equal(createHash('sha256').update(await readFile(new URL('../'+item.path, import.meta.url))).digest('hex'), item.sha256);
});
