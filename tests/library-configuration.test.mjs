import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { activateFormatBundle, assertCurrentFormat, getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import { readLibraryFormat } from '../src/lib/article-format/library.ts';
import { DEFAULT_ALGORITHMS } from '../src/lib/article-format/algorithms.ts';
import { DEFAULT_LIBRARY_CONFIGURATION, validateResolvedLibraryConfiguration, resolveLibraryConfiguration, validateLibraryConfiguration, libraryCapability, assertLibraryCapability } from '../src/lib/article-format/libraryConfiguration.ts';
import { loadStylesheetEnvironment } from '../src/lib/article-format/styles.ts';
import { compileArticleStyles, clearArticleStyleCache } from '../src/lib/tailwind.ts';
import { resourcePreviewWidth, resourcePreviewHostClass } from '../src/lib/article-format/preview.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';

const copy = () => structuredClone(DEFAULT_FORMAT_BUNDLE);
const config = values => ({ schemaVersion: 1, meta: { id: DEFAULT_FORMAT_BUNDLE.support.meta.id }, ...values });
test.afterEach(() => activateFormatBundle(copy(), null, 'built-in'));

function fixture(files) {
  let writes = 0;
  const missing = () => new DOMException('missing', 'NotFoundError');
  const directory = (prefix = '') => ({
    kind: 'directory', name: prefix || 'isolated-library',
    async getDirectoryHandle(name) {
      const path = prefix ? prefix + '/' + name : name;
      if (!Object.keys(files).some(file => file.startsWith(path + '/'))) throw missing();
      return directory(path);
    },
    async getFileHandle(name) {
      const path = prefix ? prefix + '/' + name : name;
      if (!Object.hasOwn(files, path)) throw missing();
      return { async getFile() { return new File([files[path]], name); }, async createWritable() { writes++; throw new Error('read only'); } };
    },
    async *entries() {
      const names = new Set(Object.keys(files).filter(path => path.startsWith(prefix ? prefix + '/' : '')).map(path => path.slice(prefix ? prefix.length + 1 : 0).split('/')[0]));
      for (const name of names) yield [name, { kind: Object.hasOwn(files, (prefix ? prefix + '/' : '') + name) ? 'file' : 'directory' }];
    },
  });
  return { root: directory(), get writes() { return writes; } };
}
function libraryFiles(raw = copy()) {
  return Object.fromEntries([['format-support', raw.support], ['validator', raw.validator], ['formatter', raw.formatter]].map(([name, value]) => ['format/' + name + '.json', JSON.stringify(value)]));
}

test('absent configuration retains every legacy control and rendering behavior; metadata can only narrow capabilities', () => {
  const raw = copy();
  assert.deepEqual(resolveLibraryConfiguration(raw), DEFAULT_LIBRARY_CONFIGURATION);
  raw.validator.meta.capabilities = { copyRichText: { enabled: false, reason: 'Archive is read only' } };
  const resolved = resolveLibraryConfiguration(raw, config({ capabilities: { copyRichText: { enabled: true }, exportPdf: { enabled: false } } }));
  assert.equal(resolved.capabilities.copyRichText.enabled, false);
  assert.equal(resolved.capabilities.copyRichText.reason, 'Archive is read only');
  assert.equal(resolved.capabilities.exportPdf.enabled, false);
  assert.equal(resolved.capabilities.exportMarkdown.enabled, true);
});

test('unknown capabilities, wrong types, identities and contradictory rendering declarations fail closed', () => {
  for (const value of [config({ capabilities: { invented: { enabled: false } } }), config({ capabilities: { articleTheme: false } }), config({ rendering: { styleAuthority: 'guess' } }), config({ extra: true })]) {
    assert.throws(() => validateLibraryConfiguration(value));
  }
  const raw = copy();
  assert.throws(() => resolveLibraryConfiguration(raw, { ...config({}), meta: { id: 'another-library' } }));
  raw.formatter.meta.rendering = { styleAuthority: 'library' };
  assert.throws(() => resolveLibraryConfiguration(raw, config({ rendering: { styleAuthority: 'theme' } })));
  assert.throws(() => activateFormatBundle(raw, 'missing-styles'));
});

test('the optional fourth file is read as one configuration set and never repairs or writes partial files', async () => {
  const valid = fixture({ ...libraryFiles(), 'format/config.json': JSON.stringify(config({ capabilities: { exportPdf: { enabled: false } } })) });
  const loaded = await readLibraryFormat(valid.root);
  assert.equal(loaded.source, 'library');
  assert.equal(loaded.configuration.capabilities.exportPdf.enabled, false);
  assert.equal(valid.writes, 0);
  for (const files of [
    { 'format/config.json': JSON.stringify(config({})) },
    { ...libraryFiles(), 'format/config.json': '{broken' },
    { ...libraryFiles(), 'format/config.json': JSON.stringify({ ...config({}), meta: { id: 'mismatch' } }) },
  ]) {
    const bad = fixture(files), result = await readLibraryFormat(bad.root);
    assert.equal(result.source, 'invalid'); assert.equal(result.bundle, null); assert.equal(bad.writes, 0);
  }
  const old = await readLibraryFormat(fixture(libraryFiles()).root);
  assert.equal(old.configuration, undefined);
  assert.deepEqual(old.bundle, copy());
});

test('capabilities share immutable snapshot identity and reject programmatic actions after a configuration switch', () => {
  const first = activateFormatBundle(copy(), 'same-library');
  const next = activateFormatBundle(copy(), 'same-library', 'library', undefined, DEFAULT_ALGORITHMS, 'library', config({ capabilities: { copyRichText: { enabled: false }, articleTheme: { enabled: false } }, rendering: { previewMode: 'light' } }));
  assert.notEqual(next.id, first.id); assert.throws(() => assertCurrentFormat(first));
  assert.equal(next.officialDefault, false);
  assert.equal(libraryCapability(next, 'previewMode').enabled, false);
  assert.equal(libraryCapability(next, 'copyRichText').enabled, false);
  assert.throws(() => assertLibraryCapability(next, 'copyRichText'));
  assert.throws(() => { next.configuration.capabilities.copyRichText.enabled = true; });
  assert.equal(libraryCapability(first, 'copyRichText').enabled, true, 'old immutable inputs retain their historical declaration');
});

test('disabling algorithms cannot silently bypass required conversion or dark validators', () => {
  const disabled = config({ capabilities: { algorithm: { enabled: false } } });
  assert.throws(() => activateFormatBundle(copy(), 'invalid', 'library', undefined, DEFAULT_ALGORITHMS, 'library', disabled));
  const raw = copy();
  raw.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters = { mode: 'tokens' };
  assert.throws(() => activateFormatBundle(raw, 'invalid', 'library', undefined, DEFAULT_ALGORITHMS, 'library', disabled));
  raw.validator.meta.enabled = false;
  const snapshot = activateFormatBundle(raw, 'valid', 'library', undefined, DEFAULT_ALGORITHMS, 'library', disabled);
  assert.throws(() => assertLibraryCapability(snapshot, 'algorithm'));
  assert.equal(snapshot.bundle.formatter.preview.dark.mode, 'tokens');
});

test('library style authority prevents theme CSS from overriding its stylesheet without changing source themes', async () => {
  const raw = copy();
  raw.formatter.steps.push({ id: 'library-css', operator: 'css.stylesheets', enabled: true, parameters: { entry: 'styles/site.css', publicRoot: 'assets' } });
  const fs = fixture({ 'styles/site.css': '.article-preview .article-body p { color: #123456; }' });
  const environment = await loadStylesheetEnvironment(fs.root, compileFormatBundle(raw).formatter.stylesheets);
  const theme = { ...BASIC_THEME, css: '.article-preview .article-body p { color: #fedcba; }' }, original = JSON.stringify(theme);
  const fixed = activateFormatBundle(raw, 'website', 'library', environment, DEFAULT_ALGORITHMS, 'library', config({ rendering: { styleAuthority: 'library' } }));
  clearArticleStyleCache();
  const result = await compileArticleStyles('A paragraph', theme, { snapshot: fixed });
  assert.match(result.css, /#123456/); assert.doesNotMatch(result.css, /#fedcba/);
  assert.equal(libraryCapability(fixed, 'articleTheme').enabled, false);
  assert.equal(JSON.stringify(theme), original);
  assert.equal(fs.writes, 0);
  const again = await loadStylesheetEnvironment(fs.root, compileFormatBundle(raw).formatter.stylesheets);
  const legacy = activateFormatBundle(raw, 'website', 'library', again);
  assert.match((await compileArticleStyles('A paragraph', theme, { snapshot: legacy })).css, /#fedcba/);
});


test('resource host width has one optional policy, preserves old records and invalidates immutable configuration identity', async () => {
  const legacy = structuredClone(DEFAULT_LIBRARY_CONFIGURATION), bytes = JSON.stringify(legacy);
  assert.equal(validateResolvedLibraryConfiguration(legacy), legacy); assert.equal(JSON.stringify(legacy),bytes);
  const first = activateFormatBundle(copy(), 'width');
  assert.equal(resourcePreviewWidth(first),'default'); assert.match(resourcePreviewHostClass(first,true),/max-w-3xl/);
  const before = await compileArticleStyles('A paragraph', BASIC_THEME, { snapshot:first });
  const next = activateFormatBundle(copy(), 'width','library',undefined,DEFAULT_ALGORITHMS,'library',config({rendering:{previewWidth:'available'}}));
  assert.equal(resourcePreviewWidth(next),'available'); assert.doesNotMatch(resourcePreviewHostClass(next,true),/max-w-/);
  assert.throws(()=>assertCurrentFormat(first)); assert.throws(()=>{next.configuration.rendering.previewWidth='default';});
  assert.equal((await compileArticleStyles('A paragraph',BASIC_THEME,{snapshot:next})).css,before.css,'host policy does not alter document/export CSS');
  assert.throws(()=>validateLibraryConfiguration(config({rendering:{previewWidth:'viewport'}})));
  const raw=copy();raw.formatter.meta.rendering={previewWidth:'available'};
  assert.throws(()=>resolveLibraryConfiguration(raw,config({rendering:{previewWidth:'default'}})));
});
