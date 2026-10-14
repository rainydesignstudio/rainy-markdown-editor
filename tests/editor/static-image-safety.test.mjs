import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../../src/lib/article-format/sanitize.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('historical Blob exceptions stay private and apply only to static HTML image sources', () => {
  const privateHooks = [], settings = [];
  const purifier = () => ({ addHook: (_name, callback) => privateHooks.push(callback), sanitize: (_html, options) => { settings.push(options); return 'clean'; } });
  purifier.sanitize = () => 'clean';
  purifier.addHook = () => { throw new Error('Global purifier hooks must not be modified'); };
  const snapshot = { bundle: { formatter: { output: { preserveAttributes: ['data-ignore-width'] } } } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, window: {}, require(id) {
    if (id === 'dompurify') return { __esModule: true, default: purifier };
    if (id === 'inline-style-parser') return { __esModule: true, default: () => [] };
    if (id === 'rehype-sanitize') return { defaultSchema: {} };
    if (id === './runtime') return { getFormatSnapshot: () => snapshot };
    throw new Error(id);
  } });
  assert.equal(module.exports.sanitizeHtml('<img src="blob:http://localhost:3501/a">'), 'clean');
  assert.equal(privateHooks.length, 1);
  const hook = privateHooks[0], html = 'http://www.w3.org/1999/xhtml', svg = 'http://www.w3.org/2000/svg';
  for (const [namespaceURI, localName, attrName, attrValue, keep] of [
    [html, 'img', 'src', 'blob:http://localhost:3501/a', true],
    [html, 'img', 'src', 'blob:null/a', true],
    [html, 'img', 'src', 'blob:javascript:alert(1)', false],
    [html, 'img', 'src', 'blob:https://example.test/a\nonerror', false],
    [html, 'a', 'href', 'blob:https://example.test/a', false],
    [svg, 'image', 'href', 'blob:https://example.test/a', false],
    [html, 'img', 'onload', 'blob:https://example.test/a', false],
  ]) {
    const attribute = { attrName, attrValue }; hook({ namespaceURI, localName }, attribute);
    assert.equal(Boolean(attribute.forceKeepAttr), keep);
  }
  assert.ok(settings[0].FORBID_TAGS.includes('script'));
  assert.ok(settings[0].FORBID_ATTR.includes('onclick'));
  module.exports.sanitizeHtml('<p>ordinary text</p>');
  assert.equal(privateHooks.length, 1, 'ordinary sanitization receives no retained exception hook');
});
