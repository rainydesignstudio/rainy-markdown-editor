import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as resume from '../src/lib/articleResume.ts';
import * as messages from '../src/lib/i18n/productMessages.ts';
const store = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const createdAt = '2026-10-25T00:00:00.000Z';

test('remembered article is library-scoped, validated, and contains no unsaved body', () => {
  const storage = store(); assert.equal(resume.rememberArticleResume(storage, 'one', '2026-10/Article', createdAt), true);
  assert.deepEqual(resume.readArticleResume(storage, 'one'), { version: 1, libraryId: 'one', articleId: '2026-10/Article', createdAt });
  assert.equal(resume.readArticleResume(storage, 'another'), null);
  assert.equal(resume.rememberArticleResume(storage, 'one', '2026-10/../Other', createdAt), false);
  storage.setItem('rainy-article-resume-v1:one', '{'); assert.throws(() => resume.readArticleResume(storage, 'one'), error => error.messageKey === 'resume.invalid');
  resume.forgetArticleResume(storage, 'one'); assert.equal(resume.readArticleResume(storage, 'one'), null);
  const denied = { getItem() { throw new Error(); }, setItem() { throw new Error(); } }; assert.equal(resume.rememberArticleResume(denied, 'one', '2026-10/Article', createdAt), false); assert.equal(resume.readArticleResume(denied, 'one'), null);
});

const source = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
function operation({ invalid = false, missing = false, record = true, active = true, late = false } = {}) {
  const storage = store(), root = {}, calls = [], toasts = [];
  if (record) resume.rememberArticleResume(storage, 'library', '2026-10/Article', createdAt);
  const context = { ...resume, ...messages, handle: root, bookmarkId: 'library', directoryRef: { current: root }, resumeIntentRef: { current: { active } }, routePathRef: { current: '/editor' }, isCurrentSelection: () => true,
    articleResumeStorage: () => storage, readStoredArticleById: async () => { if (late) context.resumeIntentRef.current.active = false; if (missing) throw new Error('missing article'); return { parse: { metadata: { createdAt: invalid ? '2025-01-01' : createdAt }, diagnostics: [] } }; },
    applyStoredArticle: async (_article, navigate, _root, guard) => { if (!guard()) return false; calls.push(['open', navigate]); return true; },
    navigateArticleMode: mode => calls.push(['navigate', mode]), setPreferredArticleMode: mode => calls.push(['mode', mode]), notifyToast: value => toasts.push(value),
  };
  const start = source.indexOf('          if (resumeIntentRef.current.active) {'), end = source.indexOf('          if (startedForResume) return;', start);
  vm.runInNewContext(ts.transpileModule('globalThis.run = async () => {\n' + source.slice(start, end) + '\n};', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, storage, calls, toasts, run: () => context.run() };
}
test('editor refresh opens the remembered saved article only after the matching library is ready', async () => {
  const f = operation(); await f.run(); assert.deepEqual(f.calls, [['open', false], ['mode', 'editor']]); assert.equal(f.toasts.length, 0); assert.equal(f.context.resumeIntentRef.current.active, false);
});
test('missing, trashed or replaced identities return to the list with honest feedback and never open another article', async () => {
  for (const options of [{ missing: true }, { invalid: true }]) { const f = operation(options); await f.run(); assert.deepEqual(f.calls, [['navigate', 'overview']]); assert.equal(f.toasts.length, 1); assert.equal(f.toasts[0].tone, 'warning'); assert.equal(resume.readArticleResume(f.storage, 'library'), null); }
});
test('ordinary routes and an explicit navigation during reading do not receive a late automatic open', async () => {
  for (const options of [{ active: false }, { late: true }]) { const f = operation(options); await f.run(); assert.deepEqual(f.calls, []); assert.deepEqual(f.toasts, []); }
  const f = operation({ record: false }); await f.run(); assert.deepEqual(f.calls, [['navigate', 'overview']]);
});
