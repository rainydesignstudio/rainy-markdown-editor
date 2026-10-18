import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, loadStylesheetEnvironment } from '../src/lib/article-format/styles.ts';
import { DEFAULT_FORMAT_BUNDLE, canonicalFormatJson } from '../src/lib/article-format/config.ts';
import { DEFAULT_ALGORITHMS, algorithmHash, validateAlgorithmPackage } from '../src/lib/article-format/algorithms.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { articleDarkMode } from '../src/lib/article-format/styleTypes.ts';
import { prepareRenderRecord, persistRenderRecord, readRenderRecord, renderRecordMatches, restoreRenderEnvironment, validateRenderRecord } from '../src/lib/article-format/renderRecords.ts';
import { createArticleSource } from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { createArticleSnapshot, listArticleHistory } from '../src/lib/articleHistory.ts';
import { saveStoredArticle, getStoredArticleDirectory, readStoredArticleById } from '../src/lib/fileSystem.ts';
import { compileArticleStyles } from '../src/lib/tailwind.ts';
import DOMPurify from 'dompurify';

function memoryLibrary() {
  const files = new Map(), directories = new Set(['']), writes = [];
  let fail = '';
  const dir = (path = '') => ({
    name: path.split('/').at(-1) || 'render-test', kind: 'directory',
    async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
    async getDirectoryHandle(name, options = {}) {
      const next = path ? path + '/' + name : name;
      if (options.create) directories.add(next);
      if (!directories.has(next)) throw new DOMException('missing ' + next, 'NotFoundError');
      return dir(next);
    },
    async getFileHandle(name, options = {}) {
      const next = path ? path + '/' + name : name;
      if (!files.has(next) && !options.create) throw new DOMException('missing ' + next, 'NotFoundError');
      return { kind: 'file', name,
        async getFile() { if (!files.has(next)) throw new DOMException('missing ' + next, 'NotFoundError'); return new File([files.get(next)], name); },
        async createWritable() {
          let pending;
          return { async write(value) { pending = value; }, async close() { if (fail && next.endsWith(fail)) { fail = ''; throw new Error('injected write failure'); } files.set(next, pending); writes.push(next); }, async abort() {} };
        },
      };
    },
    async removeEntry(name) { const next = path ? path + '/' + name : name; if (!files.delete(next) && !directories.delete(next)) throw new DOMException('missing', 'NotFoundError'); },
    async *entries() {
      const entries = new Map();
      for (const name of directories) if (name && name.startsWith(path ? path + '/' : '')) {
        const rest = path ? name.slice(path.length + 1) : name;
        if (!rest.includes('/')) entries.set(rest, { kind: 'directory' });
      }
      for (const name of files.keys()) if (name.startsWith(path ? path + '/' : '')) {
        const rest = path ? name.slice(path.length + 1) : name;
        if (!rest.includes('/')) entries.set(rest, { kind: 'file' });
      }
      yield* entries;
    },
  });
  const put = (path, data) => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
    files.set(path, data);
  };
  return { root: dir(), files, writes, put, fail: suffix => { fail = suffix; } };
}
const element = { outerHTML: '<article class="article-preview"><div class="article-body"><p class="card">body</p></div></article>', cloneNode() { return { outerHTML: this.outerHTML }; } };
async function fixture(darkParameters, configuration) {
  const library = memoryLibrary();
  library.put('styles/globals.css', '@import "tailwindcss"; .card{color:red;background-image:url("/image/mark.svg")}');
  library.put('assets/image/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
  if (darkParameters) raw.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters = darkParameters;
  raw.formatter.steps.push({ id: 'library-css', operator: 'css.stylesheets', enabled: true, parameters: { entry: 'styles/globals.css', publicRoot: 'assets' } });
  const environment = await loadStylesheetEnvironment(library.root, { entry: 'styles/globals.css', publicRoot: 'assets' });
  const snapshot = activateFormatBundle(raw, 'render-test', 'library', environment, DEFAULT_ALGORITHMS, 'library', configuration);
  const source = createArticleSource('render-test', BASIC_THEME.id) + '\n<p class="card">body</p>\n';
  const saved = await saveStoredArticle(library.root, source, BASIC_THEME);
  const directory = await getStoredArticleDirectory(library.root, saved.article.month, saved.article.folder);
  const compiled = await compileArticleStyles(source, BASIC_THEME);
  const prepared = await prepareRenderRecord(source, BASIC_THEME, element, compiled.css, { snapshot });
  return { ...library, snapshot, source, saved, directory, prepared, environment };
}
test('pre-mode renditions reopen current and historical sources without migration or weaker integrity checks', async () => {
  const algorithm = structuredClone(DEFAULT_FORMAT_BUNDLE.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters);
  delete algorithm.mode;
  for (const parameters of [algorithm, { transform: 'preserve', options: {} }]) {
    const f = await fixture(parameters);
    try {
      await persistRenderRecord(f.root, f.directory, f.prepared);
      await createArticleSnapshot(f.root, f.saved.article.month, f.saved.article.folder, f.source, BASIC_THEME, { kind: 'manual', retained: true, id: 'snapshot-pre-mode' });
      for (const [path, text] of f.files) if (path.endsWith('/render.json')) {
        const record = JSON.parse(text);
        delete record.formatter.preview.dark.mode;
        f.files.set(path, JSON.stringify(record));
      }
      const pointer = 'articles/' + f.saved.article.month + '/' + f.saved.article.folder + '/render.json';
      const original = f.files.get(pointer), before = f.writes.length;
      const stored = await readStoredArticleById(f.root, f.saved.article.month, f.saved.article.folder);
      assert.equal(stored.renderIssue, undefined);
      assert.equal(await renderRecordMatches(stored.renderRecord, f.source, BASIC_THEME), true);
      assert.equal(await renderRecordMatches(stored.renderRecord, f.source + '\nchanged', BASIC_THEME), false);
      const history = await listArticleHistory(f.root, f.saved.article.month, f.saved.article.folder);
      assert.equal(history.snapshots.length, 1);
      assert.equal(history.snapshots[0].renderIssue, undefined);
      const restored = await restoreRenderEnvironment(f.root, history.snapshots[0].renderRecord);
      try {
        const mode = parameters.transform === 'preserve' ? 'tokens' : 'algorithm';
        assert.equal(articleDarkMode(restored.snapshot.bundle.formatter), mode);
        assert.equal(restored.snapshot.rawFormatter.steps.find(step => step.operator === 'preview.dark-mode').parameters.mode, undefined);
        assert.equal(stored.renderRecord.environmentHash, f.prepared.record.environmentHash);
        assert.equal(f.files.get(pointer), original);
        assert.equal(f.writes.length, before, 'opening current and historical renditions must not write');
        const altered = structuredClone(stored.renderRecord);
        altered.formatter.preview.dark.mode = mode === 'algorithm' ? 'tokens' : 'algorithm';
        assert.throws(() => validateRenderRecord(altered), /不一致/);
        delete altered.formatter.preview.dark.mode;
        altered.formatter.preview.dark.background = '#ff0000';
        assert.throws(() => validateRenderRecord(altered), /不一致/);
        const object = 'assets/.objects/' + stored.renderRecord.assets[0].hash, bytes = f.files.get(object);
        f.files.set(object, 'tampered');
        await assert.rejects(restoreRenderEnvironment(f.root, stored.renderRecord), /校验失败/);
        f.files.set(object, bytes);
        const next = await prepareRenderRecord(f.source, BASIC_THEME, element, restored.css, { snapshot: restored.snapshot });
        await persistRenderRecord(f.root, f.directory, next);
        assert.equal((await readRenderRecord(f.directory)).formatter.preview.dark.mode, mode);
      } finally { restored.dispose(); }
    } finally { f.environment.dispose(); }
  }
});
test('explicit dark-source records still reject a missing mode', async () => {
  const algorithm = structuredClone(DEFAULT_FORMAT_BUNDLE.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters);
  for (const parameters of [algorithm, { mode: 'tokens' }]) {
    const f = await fixture(parameters);
    try {
      const record = structuredClone(f.prepared.record), original = JSON.stringify(record);
      assert.equal(validateRenderRecord(record), record);
      assert.equal(JSON.stringify(record), original, 'validation must not mutate the stored record');
      delete record.formatter.preview.dark.mode;
      assert.throws(() => validateRenderRecord(record), /不一致/);
    } finally { f.environment.dispose(); }
  }
});
test('renditions keep verified immutable dependencies; opening old source performs no migration writes', async () => {
  const f = await fixture();
  try {
    assert.equal(await readRenderRecord(f.directory), null);
    const before = f.writes.length;
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const record = await readRenderRecord(f.directory);
    assert.equal(await renderRecordMatches(record, f.source, BASIC_THEME), true);
    assert.equal(await renderRecordMatches(record, f.source + '\nchanged', BASIC_THEME), false);
    assert.ok(record.css.includes('article-asset:'));
    const immutableWrites = f.writes.filter(path => path.startsWith('assets/.objects/') || path.startsWith('styles/.versions/'));
    await persistRenderRecord(f.root, f.directory, f.prepared);
    assert.deepEqual(f.writes.filter(path => path.startsWith('assets/.objects/') || path.startsWith('styles/.versions/')), immutableWrites);
    f.put('styles/globals.css', '.card{color:blue}');
    const restored = await restoreRenderEnvironment(f.root, record);
    try {
      assert.match(restored.css, /color: red/);
      assert.match(restored.css, /blob:/);
      assert.match((await compileArticleStyles(f.source, BASIC_THEME, { snapshot: restored.snapshot })).css, /color: red/);
    } finally { restored.dispose(); }
    assert.ok(f.writes.length > before);
  } finally { f.environment.dispose(); }
});
test('missing or tampered objects fail and a dependency-write failure never publishes a pointer', async () => {
  const f = await fixture();
  try {
    f.fail('manifest.json');
    await assert.rejects(persistRenderRecord(f.root, f.directory, f.prepared), /injected/);
    assert.equal(await readRenderRecord(f.directory), null);
    assert.equal(await (await f.directory.getFileHandle('article.md')).getFile().then(file => file.text()), f.source);
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const record = await readRenderRecord(f.directory);
    f.files.set('assets/.objects/' + record.assets[0].hash, 'tampered');
    await assert.rejects(restoreRenderEnvironment(f.root, record), /校验失败/);
    assert.throws(() => validateRenderRecord({ ...record, rawFormatter: { ...record.rawFormatter, steps: [{ id: 'bad', operator: 'arbitrary.js', enabled: true, parameters: {} }] } }), /未知/);
    assert.throws(() => validateRenderRecord({ ...record, css: '.x{background:url(https://example.invalid/tracker)}' }), /未留存资源/);
    assert.throws(() => validateRenderRecord({ ...record, css: '@import "https://example.invalid/style.css";' }), /额外/);
  } finally { f.environment.dispose(); }
});
test('history carries the same environment; automatic dedup compares its version as well as body and theme', async () => {
  const f = await fixture();
  try {
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const first = await createArticleSnapshot(f.root, f.saved.article.month, f.saved.article.folder, f.source, BASIC_THEME, { kind: 'automatic', id: 'snapshot-first' });
    assert.equal(first.snapshot.renderRecord.environmentHash, f.prepared.record.environmentHash);
    assert.equal((await createArticleSnapshot(f.root, f.saved.article.month, f.saved.article.folder, f.source, BASIC_THEME, { kind: 'automatic', id: 'snapshot-duplicate' })).created, false);
    const manifest = { ...f.prepared.manifest, candidates: ['card', 'p-4'] };
    const updated = { ...f.prepared, manifest, record: { ...f.prepared.record } };
    // Use the engine's canonical representation for the content-addressed manifest.
    const { canonicalFormatJson } = await import('../src/lib/article-format/config.ts');
    updated.record.environmentHash = await contentHash(canonicalFormatJson(manifest));
    await persistRenderRecord(f.root, f.directory, updated);
    assert.equal((await createArticleSnapshot(f.root, f.saved.article.month, f.saved.article.folder, f.source, BASIC_THEME, { kind: 'automatic', id: 'snapshot-second' })).created, true);
    assert.equal((await listArticleHistory(f.root, f.saved.article.month, f.saved.article.folder)).snapshots.length, 2);
  } finally { f.environment.dispose(); }
});

test('historical algorithm code is retained and verified independently of today\'s library component', async () => {
  const f = await fixture();
  try {
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const record = await readRenderRecord(f.directory);
    assert.equal(record.algorithmHash, DEFAULT_ALGORITHMS.fingerprint);
    const modified = structuredClone(DEFAULT_ALGORITHMS);
    modified.files['mp-darkmode.adapter.js'] += '\n// changed current component\n';
    modified.manifest.components[0].scripts[1].sha256 = await algorithmHash(modified.files['mp-darkmode.adapter.js']);
    modified.fingerprint = await algorithmHash(canonicalFormatJson({ manifest: modified.manifest, files: modified.files }));
    const current = await validateAlgorithmPackage(modified);
    const live = activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), 'changed', 'library', undefined, current, 'library');
    const before = f.writes.length;
    const restored = await restoreRenderEnvironment(f.root, record, live);
    try {
      assert.equal(restored.snapshot.algorithms.fingerprint, record.algorithmHash);
      assert.notEqual(restored.snapshot.algorithms.fingerprint, live.algorithms.fingerprint);
      assert.equal(restored.snapshot.algorithms.files['mp-darkmode.adapter.js'], DEFAULT_ALGORITHMS.files['mp-darkmode.adapter.js']);
      assert.equal(f.writes.length, before);
    } finally { restored.dispose(); }
    const broken = structuredClone(f.prepared); broken.manifest.algorithms.files['mp-darkmode.adapter.js'] += 'tamper';
    const pointer = f.files.get('articles/' + f.saved.article.month + '/' + f.saved.article.folder + '/render.json');
    await assert.rejects(persistRenderRecord(f.root, f.directory, broken), /校验失败/);
    assert.equal(f.files.get('articles/' + f.saved.article.month + '/' + f.saved.article.folder + '/render.json'), pointer);
  } finally { f.environment.dispose(); }
});

test('older render manifests use a marked legacy algorithm fallback without migration writes', async () => {
  const f = await fixture();
  try {
    const legacy = { ...f.prepared, manifest: { ...f.prepared.manifest }, record: { ...f.prepared.record } };
    delete legacy.manifest.algorithms; delete legacy.record.algorithmHash;
    legacy.record.environmentHash = await contentHash(canonicalFormatJson(legacy.manifest));
    await persistRenderRecord(f.root, f.directory, legacy);
    const before = f.writes.length;
    const restored = await restoreRenderEnvironment(f.root, legacy.record);
    try { assert.equal(restored.snapshot.algorithmSource, 'legacy'); assert.equal(f.writes.length, before); }
    finally { restored.dispose(); }
  } finally { f.environment.dispose(); }
});

test('an expired rendition is distinguished from broken dependencies and rebuilds without adopting live styles or writing on open', async t => {
  // Node has no DOM. Supply only this trusted fixture's sanitizer bridge so
  // browser-only candidate extraction runs; actual sanitization is tested separately.
  const previousWindow = globalThis.window, previousSanitize = DOMPurify.sanitize;
  globalThis.window = {};
  DOMPurify.sanitize = source => source;
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; if (previousSanitize === undefined) delete DOMPurify.sanitize; else DOMPurify.sanitize = previousSanitize; });
  const f = await fixture();
  try {
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const changed = f.source + '\n<p class="card p-6">changed body</p>\n';
    await saveStoredArticle(f.root, changed, BASIC_THEME, f.saved.article.folder, f.saved.article.month);
    f.put('styles/globals.css', '.card{color:blue}');
    const before = f.writes.length;
    const stored = await readStoredArticleById(f.root, f.saved.article.month, f.saved.article.folder);
    assert.equal(stored.renderRecordStale, true);
    assert.ok(stored.renderIssue);
    const restored = await restoreRenderEnvironment(f.root, stored.renderRecord);
    try {
      const compiled = await compileArticleStyles(changed, BASIC_THEME, { snapshot: restored.snapshot });
      assert.match(compiled.css, /color: red/);
      assert.ok(compiled.css.includes('.p-6'), JSON.stringify({ candidates: compiled.candidates, end: compiled.css.slice(-1600) }));
      assert.equal(await renderRecordMatches(stored.renderRecord, changed, BASIC_THEME), false);
      assert.equal(f.writes.length, before, 'opening and rebuilding preview must not migrate user files');
    } finally { restored.dispose(); }
  } finally { f.environment.dispose(); }
});

test('a retained library configuration is immutable, hash-bound and independent of the current library policy', async () => {
  const f = await fixture(undefined, { schemaVersion: 1, meta: { id: DEFAULT_FORMAT_BUNDLE.support.meta.id }, rendering: { styleAuthority: 'library', previewMode: 'light' }, capabilities: { copyRichText: { enabled: false } } });
  try {
    assert.equal(f.prepared.record.configuration.rendering.styleAuthority, 'library');
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const record = await readRenderRecord(f.directory);
    const live = activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), 'another-library');
    const writes = f.writes.length;
    const restored = await restoreRenderEnvironment(f.root, record, live);
    try {
      assert.equal(restored.snapshot.configuration.rendering.styleAuthority, 'library');
      assert.equal(restored.snapshot.configuration.rendering.previewMode, 'light');
      assert.equal(restored.snapshot.configuration.capabilities.copyRichText.enabled, false);
      assert.equal(f.writes.length, writes);
    } finally { restored.dispose(); }
    const altered = structuredClone(record);
    altered.configuration.capabilities.copyRichText.enabled = true;
    await assert.rejects(restoreRenderEnvironment(f.root, altered, live));
  } finally { f.environment.dispose(); }
});

test('legacy render records without configuration retain legacy defaults instead of inheriting a new fixed preview', async () => {
  const f = await fixture();
  try {
    assert.equal(Object.hasOwn(f.prepared.record, 'configuration'), false);
    await persistRenderRecord(f.root, f.directory, f.prepared);
    const raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
    const live = activateFormatBundle(raw, 'fixed-live', 'library', undefined, DEFAULT_ALGORITHMS, 'library', { schemaVersion: 1, meta: { id: raw.support.meta.id }, rendering: { previewMode: 'light' } });
    const writes = f.writes.length;
    const restored = await restoreRenderEnvironment(f.root, f.prepared.record, live);
    try {
      assert.equal(restored.snapshot.configuration.rendering.previewMode, 'user');
      assert.equal(restored.snapshot.configuration.capabilities.previewMode.enabled, true);
      assert.equal(f.writes.length, writes);
    } finally { restored.dispose(); }
  } finally { f.environment.dispose(); }
});
