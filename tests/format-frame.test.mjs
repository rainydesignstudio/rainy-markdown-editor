import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'parse5';
import { formatPreviewDocument } from '../src/lib/article-format/frame.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import { compileFormatBundle } from '../src/lib/article-format/config.ts';
import { getPublicPlatformPreset } from '../src/lib/article-format/library.ts';

test('responsive document frames retain natural content without a fixed-width crop', () => {
  const snapshot = structuredClone(getFormatSnapshot());
  snapshot.bundle.formatter.document = {
    root: { tag: 'section', id: 'article-content', classes: [] }, body: null,
    beforeHtml: '', afterHtml: '', language: 'zh-CN', preserveIds: true, viewport: null,
  };
  const content = '<section id="article-content"><p>Opening</p><img src="/images/article-sample.png"><p>End of long content</p></section>';
  const responsive = parse(formatPreviewDocument('', content, false, snapshot));
  const body = responsive.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'body');
  assert.equal(body.childNodes.length, 1);
  assert.equal(body.childNodes[0].tagName, 'section');
  assert.equal(body.childNodes[0].childNodes.at(-1).childNodes[0].value, 'End of long content');
  snapshot.bundle.formatter.document.viewport = { width: 1200, height: 800, contentWidth: 900 };
  const fixed = parse(formatPreviewDocument('', content, false, snapshot));
  const fixedBody = fixed.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'body');
  assert.equal(fixedBody.childNodes[0].tagName, 'div');
  assert.equal(fixedBody.childNodes[0].attrs.find(attribute => attribute.name === 'style').value, 'width:900px;margin-left:300px');
});

test('frame configuration is inert JSON, escapes closing tags, and runs only external scripts', () => {
  const snapshot = structuredClone(getFormatSnapshot());
  snapshot.bundle.support.meta.name = '</script><script>malicious()</script>';
  const tree = parse(formatPreviewDocument('', '<article class="article-preview">正文</article>', true, snapshot));
  const scripts = [];
  const walk = node => { if (node.tagName === 'script') scripts.push(node); node.childNodes?.forEach(walk); };
  walk(tree);
  const attributes = node => Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
  const executable = scripts.filter(node => attributes(node).type !== 'application/json');
  assert.equal(executable.length, 3);
  assert.ok(executable.every(node => attributes(node).src && !node.childNodes.length));
  assert.ok(executable.some(node => attributes(node).src === '/format/article-format-bootstrap.js'));
  const data = scripts.find(node => attributes(node).type === 'application/json');
  assert.equal(JSON.parse(data.childNodes[0].value).bundle.support.meta.name, snapshot.bundle.support.meta.name);
});

test('static frame bootstrap reports inspection results and failures without eval or inline execution', async () => {
  const script = await readFile(new URL('../public/format/article-format-bootstrap.js', import.meta.url), 'utf8');
  for (const fail of [false, true]) {
    const posted = [], attributes = [];
    const payload = { kind: 'inspection', bundle: getFormatSnapshot().bundle, token: 'nonce', origin: 'http://127.0.0.1:3501', css: 'body{}' };
    const context = {
      document: { head: { querySelector: () => ({ textContent: JSON.stringify(payload) }) }, querySelector: () => ({}), body: { dataset: {}, setAttribute: (...args) => attributes.push(args) } },
      window: { ArticleAlgorithmHost: { configure() {} }, ArticleFormatEngine: { async inspect() { if (fail) throw new Error('measurement failed'); return { checked: ['width'], issues: [], manual: [] }; } } },
      parent: { postMessage: (...args) => posted.push(args) },
    };
    vm.runInNewContext(script.replace('void runFormatFrameBootstrap();', 'window.bootComplete = runFormatFrameBootstrap();'), context, { codeGeneration: { strings: false, wasm: false } });
    await context.window.bootComplete;
    assert.equal(posted.length, 1);
    assert.equal(posted[0][0].token, 'nonce');
    assert.equal(posted[0][1], payload.origin);
    if (fail) { assert.match(posted[0][0].error, /measurement failed/); assert.equal(attributes[0][0], 'data-preview-error'); }
    else { assert.equal(posted[0][0].result.checked[0], 'width'); assert.equal(context.document.body.dataset.previewReady, 'true'); }
  }
});

test('empty light and dark previews complete without calling a platform transform', async () => {
  const script = await readFile(new URL('../public/format/article-format-bootstrap.js', import.meta.url), 'utf8');
  const preset = getPublicPlatformPreset('empty'), bundle = compileFormatBundle(preset.bundle);
  for (const dark of [false, true]) {
    const attributes = {}, classes = new Set(); let configured;
    const payload = { kind: 'preview', dark, bundle, algorithms: preset.algorithms };
    const context = {
      document: { head: { querySelector: () => ({ textContent: JSON.stringify(payload) }) }, querySelector: () => ({ setAttribute: (key, value) => { attributes[key] = value; } }), documentElement: { classList: { add: name => classes.add(name) }, dataset: {} }, body: { dataset: {}, setAttribute: (key, value) => { attributes[key] = value; } } },
      window: { ArticleAlgorithmHost: { configure: algorithms => { configured = algorithms; } }, ArticleFormatEngine: { transform: async () => { throw new Error('Empty preset must not execute platform algorithms'); } } },
    };
    vm.runInNewContext(script.replace('void runFormatFrameBootstrap();', 'window.bootComplete = runFormatFrameBootstrap();'), context, { codeGeneration: { strings: false, wasm: false } });
    await context.window.bootComplete;
    assert.equal(context.document.body.dataset.previewReady, 'true');
    assert.equal(configured.manifest.components.length, 0);
    assert.equal(classes.has('dark'), dark);
    assert.equal(attributes['data-preview-error'], undefined);
  }
});
