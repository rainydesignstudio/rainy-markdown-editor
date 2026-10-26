import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FORMAT_BUNDLE, enabledFormatRules, validateFormatBundle, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { activateFormatBundle, assertCurrentFormat, assertFormatReady, getFormatSnapshot, invalidateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { initializeLibraryFormat, readLibraryFormat, PUBLIC_PLATFORM_PRESETS, getPublicPlatformPreset } from '../src/lib/article-format/library.ts';
import { findSourceMatches, replaceAllSourceMatches } from '../src/lib/sourceSearch.ts';
import { validateArticleFormatMarkdown, validateArticleFormatCss } from '../src/lib/articleFormat.ts';

const copy = () => structuredClone(DEFAULT_FORMAT_BUNDLE);
test('dark source is exclusive, token mode requires no algorithm, and legacy JSON is read without migration', async () => {
  const legacy = copy();
  delete legacy.validator.product.theme.darkTokens;
  delete legacy.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters.mode;
  const before = JSON.stringify(legacy);
  const old = activateFormatBundle(legacy, 'legacy');
  assert.equal(old.bundle.formatter.preview.dark.mode, 'algorithm');
  assert.equal(old.officialDefault, true);
  assert.equal(JSON.stringify(legacy), before);
  const raw = copy(), step = raw.formatter.steps.find(step => step.operator === 'preview.dark-mode');
  step.parameters = { mode: 'tokens' };
  const manual = compileFormatBundle(raw);
  assert.deepEqual(manual.formatter.preview.dark, { mode: 'tokens', transform: 'preserve', options: {}, background: '#191919' });
  const { assertAlgorithmCapabilities } = await import('../src/lib/article-format/algorithms.ts');
  assert.doesNotThrow(() => assertAlgorithmCapabilities({ manifest: { components: [] } }, manual));
  for (const parameters of [{ mode: 'tokens', transform: 'mp-darkmode' }, { mode: 'tokens', options: {} }, { mode: 'algorithm' }, { mode: 'algorithm', transform: 'preserve', options: {} }, { mode: 'guess', transform: 'mp-darkmode', options: {} }]) {
    step.parameters = parameters; assert.throws(() => compileFormatBundle(raw));
  }
  const preserve = copy();
  preserve.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters = { transform: 'preserve', options: {} };
  assert.equal(compileFormatBundle(preserve).formatter.preview.dark.mode, 'tokens');
  activateFormatBundle(copy(), null, 'built-in');
});
test('only public presets can initialize a library and invalid selection writes nothing', async () => {
  assert.deepEqual(PUBLIC_PLATFORM_PRESETS.map(preset => preset.id), ['wechat-article', 'empty']);
  const root = directory();
  await assert.rejects(initializeLibraryFormat(root, 'unlisted-platform'), /未知/);
  assert.equal(root.children.size, 0);
  await initializeLibraryFormat(root, 'wechat-article');
  assert.deepEqual((await readLibraryFormat(root)).bundle, copy());
  assert.ok(root.children.get('format').children.get('algorithms').children.has('manifest.json'));
});
test('configuration can add registered rules and additive formatter steps without consumer props', () => {
  const raw = copy();
  raw.support.rules.push({ id: 'alignment', section: 'custom', title: '自定义对齐', severity: 'warning', source: 'wechat-editor', validator: 'alignment' });
  raw.validator.rules.push({ id: 'alignment', operator: 'style.values', enabled: true, stages: ['authoring', 'rendered'], parameters: { property: 'text-align', values: ['justify'] } });
  raw.formatter.steps.push({ id: 'custom-css', operator: 'css.drop-properties', enabled: true, parameters: { properties: ['text-transform'] } });
  const result = compileFormatBundle(raw);
  assert.deepEqual(result.formatter.output.dropCssProperties, ['font-family', 'text-transform']);
  assert.equal(result.validator.rules.at(-1).parameters.property, 'text-align');
});
test('the empty preset retains product safety and theme contracts while platform rules and formatting stay empty', t => {
  t.after(() => activateFormatBundle(copy(), null, 'built-in'));
  const { bundle, algorithms } = getPublicPlatformPreset('empty');
  assert.deepEqual(bundle.validator.product, DEFAULT_FORMAT_BUNDLE.validator.product);
  const snapshot = activateFormatBundle(bundle, 'empty-library', 'library', undefined, algorithms, 'library');
  assert.equal(snapshot.officialDefault, false);
  assert.equal(snapshot.bundle.validator.meta.enabled, false);
  assert.deepEqual(enabledFormatRules(snapshot.bundle), []);
  assert.deepEqual(bundle.support.rules, []);
  assert.deepEqual(bundle.support.manualReview, []);
  assert.deepEqual(bundle.formatter.steps, []);
  assert.equal(snapshot.bundle.formatter.preview.dark.transform, 'preserve');
  assert.equal(snapshot.bundle.formatter.codeHighlight.enabled, false);
  assert.ok(validateArticleFormatCss('.example { width: expression(x); }').some(issue => issue.domain === 'product' && issue.tier === 'error'));
  assert.ok(validateArticleFormatMarkdown('<script>alert(1)</script>').some(issue => issue.domain === 'product' && issue.tier === 'error'));
  assert.equal(validateArticleFormatCss('.example { font-family: Georgia; }').some(issue => issue.domain === 'standard'), false);
  for (const mutate of [raw => { delete raw.validator.product; }, raw => { raw.formatter.meta.id = 'other'; }, raw => { raw.validator.rules.push({ id: 'bad', operator: 'invented', enabled: false, stages: ['authoring'], parameters: {} }); }]) {
    const bad = structuredClone(bundle); mutate(bad); assert.throws(() => validateFormatBundle(bad));
  }
});
test('unknown fields, operators, wrong parameter types, conflicting steps and missing references fail explicitly', () => {
  for (const mutate of [
    b => { b.formatter.steps[0].parameters.mdoe = 'space'; },
    b => { b.validator.rules[0].parameters.value = '0'; },
    b => { b.validator.rules[0].operator = 'invented.algorithm'; },
    b => { b.formatter.steps.push({ ...b.formatter.steps[0], id: 'duplicate-soft-breaks' }); },
    b => { b.support.rules[0].validator = 'missing'; },
    b => { b.formatter.steps[0].enabled = 'false'; },
    b => { b.formatter.markdown = {}; },
    b => { b.validator.rules[0].stages = ['authoring']; },
    b => { b.formatter.steps.find(s => s.operator === 'output.html').parameters.preserveAttributes.push('onclick'); },
    b => { b.formatter.steps.find(s => s.operator === 'preview.surface').parameters.darkBackground = 'red;}body{display:none'; },
  ]) { const raw = copy(); mutate(raw); assert.throws(() => validateFormatBundle(raw)); }
});
test('snapshots are immutable and stale tasks cannot commit after switching configurations', () => {
  const raw = copy(); const first = activateFormatBundle(raw, 'test');
  assert.equal(first.officialDefault, true);
  assert.throws(() => { first.bundle.formatter.markdown.softBreaks = 'line-break'; });
  raw.formatter.steps[0].parameters.mode = 'line-break';
  assert.equal(first.bundle.formatter.markdown.softBreaks, 'space');
  const second = activateFormatBundle(raw, 'test');
  assert.equal(second.officialDefault, false);
  assert.equal(second.bundle.formatter.markdown.softBreaks, 'line-break');
  assert.throws(() => assertCurrentFormat(first));
  invalidateFormatBundle('test', '坏配置'); assert.throws(() => assertFormatReady());
  assert.equal(getFormatSnapshot().officialDefault, false);
  activateFormatBundle(copy(), null, 'built-in');
});

test('validator meta.enabled is a platform-only boolean gate; absent and true retain official defaults', async () => {
  const original = activateFormatBundle(copy(), 'test');
  assert.ok(enabledFormatRules(original.bundle).length);
  const explicit = copy(); explicit.validator.meta.enabled = true;
  assert.equal(activateFormatBundle(explicit, 'test').officialDefault, true);
  const disabled = copy(); disabled.validator.meta.enabled = false;
  const snapshot = activateFormatBundle(disabled, 'test');
  assert.equal(snapshot.officialDefault, false);
  assert.equal(enabledFormatRules(snapshot.bundle).length, 0);
  assert.notEqual(snapshot.id, original.id); assert.throws(() => assertCurrentFormat(original));
  assert.deepEqual(snapshot.bundle.formatter, compileFormatBundle(copy()).formatter);
  assert.deepEqual(snapshot.bundle.validator.product, copy().validator.product);
  assert.equal(validateArticleFormatCss('.example { font-family: Georgia; }').some(issue => issue.domain === 'standard'), false);
  assert.ok(validateArticleFormatCss('.example { width: expression(x); }').some(issue => issue.domain === 'product' && issue.tier === 'error'));
  assert.ok(validateArticleFormatMarkdown('<script>alert(1)</script>').some(issue => issue.domain === 'product' && issue.tier === 'error'));
  for (const mutate of [raw => { raw.validator.meta.enabled = 'false'; }, raw => { raw.validator.rules[0].operator = 'unregistered'; }, raw => { delete raw.validator.product; }, raw => { raw.formatter.meta.id = 'other'; }]) {
    const bad = structuredClone(disabled); mutate(bad); assert.throws(() => validateFormatBundle(bad));
  }
  const root = directory(); await seedLegacy(root);
  const format = root.children.get('format');
  format.children.set('validator.json', JSON.stringify(disabled.validator));
  const before = format.counts.reads;
  assert.equal((await readLibraryFormat(root)).bundle.validator.meta.enabled, false);
  assert.equal(format.counts.reads - before, 3, 'disabled policies still read every member of the trio');
  format.children.delete('formatter.json'); assert.equal((await readLibraryFormat(root)).source, 'invalid');
  activateFormatBundle(copy(), null, 'built-in');
});

function directory(name = 'test') {
  const children = new Map(); let reads = 0, writes = 0;
  const notFound = () => new DOMException('missing', 'NotFoundError');
  return { name, children, get counts() { return { reads, writes }; },
    async getDirectoryHandle(key, options) { if (!children.has(key)) { if (!options?.create) throw notFound(); children.set(key, directory(key)); } return children.get(key); },
    async getFileHandle(key, options) {
      if (!children.has(key)) { if (!options?.create) throw notFound(); children.set(key, ''); }
      return { async getFile() { reads++; const value = children.get(key); return { size: value.length, text: async () => value }; },
        async createWritable() { let value; return { write: async text => { value = text; }, close: async () => { writes++; children.set(key, value); }, abort: async () => {} }; } };
    },
  };
}
async function seedLegacy(root) {
  const format = await root.getDirectoryHandle('format', { create: true });
  for (const [name, value] of Object.entries({ 'format-support.json': copy().support, 'validator.json': copy().validator, 'formatter.json': copy().formatter })) {
    const writer = await (await format.getFileHandle(name, { create: true })).createWritable(); await writer.write(JSON.stringify(value)); await writer.close();
  }
}
test('library fallback is explicit; partial or old bundles are invalid; initialization never overwrites', async () => {
  const root = directory(); const absent = await readLibraryFormat(root);
  assert.equal(absent.source, 'built-in'); assert.ok(absent.message);
  await seedLegacy(root); const format = root.children.get('format');
  assert.equal(format.counts.writes, 3); assert.equal((await readLibraryFormat(root)).source, 'library');
  await initializeLibraryFormat(root); assert.equal(format.counts.writes, 3);
  format.children.delete('validator.json'); assert.equal((await readLibraryFormat(root)).source, 'invalid');
  await initializeLibraryFormat(root); assert.equal(format.counts.writes, 3);
  format.children.set('validator.json', '{'); assert.equal((await readLibraryFormat(root)).source, 'invalid');
  format.children.set('validator.json', JSON.stringify({ ...copy().validator, schemaVersion: 0 }));
  assert.equal((await readLibraryFormat(root)).source, 'invalid');
});
test('literal source find handles regex punctuation, Unicode offsets, case and literal replacement dollars', () => {
  assert.deepEqual(findSourceMatches('😀A.[ a.[', 'a.[', false), [{ start: 2, end: 5 }, { start: 6, end: 9 }]);
  assert.equal(findSourceMatches('Aa', 'a', true).length, 1);
  assert.equal(replaceAllSourceMatches('x x', 'x', '$&', false), '$& $&');
  assert.equal(findSourceMatches('aaaa', 'aa', true).length, 2);
  assert.deepEqual(findSourceMatches('source', '', false), []);
});
