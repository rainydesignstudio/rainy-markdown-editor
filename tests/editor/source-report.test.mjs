import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const controller = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const start = controller.indexOf('  const snapshotFor = useCallback(');
const end = controller.indexOf('  const cacheLoadedArticleReport = useCallback(', start);
const code = ts.transpileModule(controller.slice(start, end) + '\nglobalThis.diagnostics = { snapshotFor, publishSourceFormatReport, sourceFormatIssues };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const root = {}, token = { root, articleId: 'a' };
  const context = {
    useCallback: fn => fn, articleRef: { current: { source: '# Body', theme: {}, folder: 'a', month: '2026-10' } },
    revisionRef: { current: 3 }, directoryRef: { current: root }, documentTokenRef: { current: token },
    mediaRefreshRevisionRef: { current: 5 }, mediaRefreshRevision: 5, format: { id: 'format-one' },
    sourceFormatReport: null, articleId: article => article.folder,
    compiledFormatRef: { current: null },
  };
  context.getFormatSnapshot = () => context.format;
  context.setSourceFormatReport = value => { context.sourceFormatReport = value; };
  const render = () => { const scope = { ...context }; vm.runInNewContext(code, scope); return scope.diagnostics; };
  return { context, render };
}

test('completed body findings are reused by the source gutter without leaking theme CSS line numbers', () => {
  const f = fixture(), current = f.render(), snapshot = current.snapshotFor();
  const report = { theme: { issues: [{ line: 2, message: 'CSS issue' }] }, body: { issues: [{ line: 50, message: 'overflow' }] } };
  current.publishSourceFormatReport(snapshot, report);
  assert.equal(f.render().sourceFormatIssues, report.body.issues);
  assert.equal('source' in f.context.sourceFormatReport.snapshot, false);
  assert.equal('renderSnapshot' in f.context.sourceFormatReport.snapshot, false, 'diagnostics do not retain an old rendering environment');
  f.context.revisionRef.current++;
  assert.equal(f.render().sourceFormatIssues, undefined);
  assert.equal(f.context.sourceFormatReport.report, report, 'the completed result is retained without another inspection');
});

test('stale body, document, library, configuration and resource reports never mark the current source', () => {
  const mutations = [
    f => { f.context.revisionRef.current++; },
    f => { f.context.documentTokenRef.current = { ...f.context.documentTokenRef.current }; },
    f => { f.context.directoryRef.current = {}; },
    f => { f.context.articleRef.current = { ...f.context.articleRef.current, folder: 'b' }; },
    f => { f.context.format = { id: 'format-two' }; },
    f => { f.context.mediaRefreshRevisionRef.current++; f.context.mediaRefreshRevision++; },
  ];
  for (const change of mutations) {
    const f = fixture(), initial = f.render(), snapshot = initial.snapshotFor();
    const report = { body: { issues: [{ line: 1 }] } };
    initial.publishSourceFormatReport(snapshot, report);
    assert.equal(f.render().sourceFormatIssues, report.body.issues);
    change(f);
    assert.equal(f.render().sourceFormatIssues, undefined);
    f.context.sourceFormatReport = null;
    f.render().publishSourceFormatReport(snapshot, report);
    assert.equal(f.context.sourceFormatReport, null, 'late asynchronous results are discarded');
  }
});
