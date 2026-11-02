import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { resolveLibraryConfiguration } from '../src/lib/article-format/libraryConfiguration.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';

test('the generated preset initializes without Node process in browser, including a subpath deployment', async () => {
  const source = await readFile(new URL('../scripts/generate-format-assets.mjs', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('assets.mjs', source, ts.ScriptTarget.Latest, true);
  let options;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'rendererBuild') options = node.initializer.expression.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(options);
  const catalog = JSON.parse(await readFile(new URL('../resources/presets/platform/renderers.generated.json', import.meta.url), 'utf8'));
  const pkg = catalog['wechat-article'];
  const rawBundle = Object.fromEntries(['support', 'validator', 'formatter'].map((key, i) => [key, JSON.parse(pkg.files['format/' + ['format-support.json', 'validator.json', 'formatter.json'][i]])]));
  const configuration = resolveLibraryConfiguration(rawBundle, { schemaVersion: 1, meta: { id: rawBundle.support.meta.id }, resources: { aliases: { '@styles/': 'styles/', '@assets/': 'assets/' } }, renderer: pkg.declaration });
  for (const prefix of ['', '/lab/rainy-markdown-editor']) {
    const config = vm.runInNewContext('(' + options + ')', { process: { env: { NEXT_PUBLIC_ARTICLE_BASE_PATH: prefix } } });
    const result = await build({ ...config, absWorkingDir: fileURLToPath(new URL('../', import.meta.url)) });
    const code = ts.transpileModule(result.outputFiles[0].text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://review.localhost/', runScripts: 'outside-only' }), channels = [];
    class BrowserMessageChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
    Object.assign(dom.window, { exports: {}, TextEncoder, TextDecoder, ReadableStream, TransformStream, structuredClone, MessageChannel: BrowserMessageChannel });
    Object.defineProperty(dom.window, 'crypto', { value: globalThis.crypto });
    try {
      const browser = dom.getInternalVMContext();
      assert.equal(vm.runInContext('typeof process', browser), 'undefined');
      assert.doesNotThrow(() => vm.runInContext(code, browser), prefix || 'root deployment');
      assert.equal(typeof dom.window.exports.default, 'function');
      assert.doesNotMatch(code, /process\.env\.NEXT_PUBLIC_ARTICLE_BASE_PATH/);
      const result = await dom.window.exports.default('format', { source: '# New article   ', context: { rawBundle, configuration } }, { declaration: pkg.declaration, files: pkg.files });
      assert.equal(result.source, '# New article', 'resolved aliases retain their /2 declaration inside the interpreter');
      const rendered = await dom.window.exports.default('render', { source: '# New article', theme: BASIC_THEME, mode: 'light', context: { rawBundle, configuration } }, { declaration: pkg.declaration, files: pkg.files });
      assert.match(rendered.html, /<h1[^>]*>New article<\/h1>/);
      assert.match(rendered.css, /--color-article-heading/);
    } finally {
      channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    }
  }
});
