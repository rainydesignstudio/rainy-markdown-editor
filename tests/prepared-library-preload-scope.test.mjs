import './prepared-library-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { DEFAULT_ARTICLE_SETTINGS } from '../src/lib/articleSettings.ts';
import { createDefaultEditorWorkspace } from '../src/lib/editorWorkspace.ts';
import { resolveSeedLocale } from '../src/lib/librarySeeds.ts';

const original = JSON.parse(await readFile(new URL('../resources/prepared-library.generated.json', import.meta.url), 'utf8'));
const code = ts.transpileModule(await readFile(new URL('../src/lib/preparedLibrary.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function model(catalog, fetch) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, fetch, crypto, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, AbortSignal, DOMException, structuredClone, Date, require(id) {
    if (id.endsWith('/prepared-library.generated.json')) return catalog;
    if (id.endsWith('/appBasePath')) return { appAssetPath: path => path };
    if (id.endsWith('/articleSettings')) return { DEFAULT_ARTICLE_SETTINGS };
    if (id.endsWith('/editorWorkspace')) return { createDefaultEditorWorkspace };
    if (id.endsWith('/librarySeeds')) return { resolveSeedLocale };
    throw Error('Unexpected scope test dependency: ' + id);
  } });
  return module.exports;
}

test('tenfold unselected catalog growth adds no download to the selected preload closure', async () => {
  const catalog = structuredClone(original), before = Object.keys(catalog.components).length;
  for (let n = 1; n < 10; n++) for (const [key, component] of Object.entries(original.components)) {
    if (key === 'zh-CN/empty') continue;
    const copy = structuredClone(component);
    for (const [path, oldId] of Object.entries(copy.files)) {
      const id = createHash('sha256').update(`${n}/${key}/${path}/${oldId}`).digest('hex');
      copy.files[path] = id; catalog.blobs[id] = original.blobs[oldId];
    }
    catalog.components[`future-${n}/${key}`] = copy;
  }
  assert.ok(Object.keys(catalog.components).length > before * 8);
  const requested = new Set(), realFetch = globalThis.fetch;
  const subject = model(catalog, async (...args) => { requested.add(String(args[0]).split('/').at(-1)); return realFetch(...args); });
  await subject.preloadPreparedLibraries({ locale: 'zh-CN', preset: 'empty' });
  const expected = new Set(Object.values(original.components['zh-CN/empty'].files));
  assert.deepEqual([...requested].sort(), [...expected].sort());
  await subject.prepareBuiltinLibrary({ locale: 'zh-CN', preset: 'wechat-article', profile: 'wechat' });
  for (const id of Object.values(original.components['zh-CN/wechat'].files)) expected.add(id);
  assert.deepEqual([...requested].sort(), [...expected].sort());
});

test('a failed prepared object retries without redownloading verified siblings', async () => {
  const failedId = Object.values(original.components['en-US/empty'].files)[0], requests = new Map(); let fail = true;
  const subject = model(original, async (...args) => {
    const id = String(args[0]).split('/').at(-1); requests.set(id, (requests.get(id) ?? 0) + 1);
    if (fail && String(args[0]).endsWith(failedId)) return new Response('', { status: 503 });
    return globalThis.fetch(...args);
  });
  await assert.rejects(subject.preloadPreparedLibraries({ locale: 'en-US', preset: 'empty' }), /503/);
  fail = false; await subject.preloadPreparedLibraries({ locale: 'en-US', preset: 'empty' });
  assert.equal(requests.get(failedId), 2);
  assert.ok([...requests].filter(([id]) => id !== failedId).every(([, count]) => count === 1));
});
