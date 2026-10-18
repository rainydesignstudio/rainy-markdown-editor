import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { articleSourceLayout, parseArticle, replaceArticleBody } from '../../src/lib/frontMatter.ts';

test('body file coordinates retain raw YAML, blank lines and LF/CRLF boundaries', () => {
  for (const eol of ['\n', '\r\n']) {
    const header = ['---', 'title: Test', 'description: |', '  First line', '  Second line', '---', ''].join(eol);
    const source = header + eol + 'Body' + eol + 'Next';
    const parsed = parseArticle(source), layout = articleSourceLayout(parsed);
    assert.equal(layout.metadataSource, header);
    assert.equal(layout.bodyLineOffset, 6);
    assert.equal(layout.metadataLines.length, 6);
    assert.equal(source.split(/\r\n|\r|\n/)[layout.bodyLineOffset], '');
    assert.equal(parsed.body, eol + 'Body' + eol + 'Next');
    assert.equal(replaceArticleBody(source, parsed.body), source);
    assert.equal(replaceArticleBody(source, 'Changed'), header + 'Changed');
  }
  const plain = parseArticle('\n# Body\n');
  assert.deepEqual(articleSourceLayout(plain), { metadataSource: '', metadataLines: [], bodyLineOffset: 0 });
});

test('metadata ending at EOF reserves a separate body line without altering the header on read', () => {
  for (const eol of ['\n', '\r\n']) {
    const source = ['---', 'title: Test', '---'].join(eol);
    assert.equal(articleSourceLayout(parseArticle(source)).bodyLineOffset, 3);
    assert.equal(replaceArticleBody(source, ''), source);
    const written = replaceArticleBody(source, 'First body line');
    assert.equal(written, source + eol + 'First body line');
    assert.equal(parseArticle(written).body, 'First body line');
  }
  const invalid = parseArticle('---\ntitle: Test');
  assert.equal(invalid.canCopy, false);
  assert.equal(articleSourceLayout(invalid).metadataSource, invalid.source);
  assert.throws(() => replaceArticleBody(invalid.source, 'Unsafe edit'));
});

test('format report locations map all body findings once, while theme CSS keeps its own coordinates', async () => {
  const source = await readFile(new URL('../../src/components/global/FormatCheckDialog.tsx', import.meta.url), 'utf8');
  const functionSource = source.slice(source.indexOf('export function issueLocation'), source.indexOf('function FormatDisclosure')).replace('export function', 'function');
  const context = {};
  vm.runInNewContext(ts.transpileModule(functionSource + '\nglobalThis.locate = issueLocation;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const t = (key, args) => `${key}:${args?.lines ?? ''}`;
  const issue = { source: 'body', line: 1, lines: [1, 3] };
  assert.equal(context.locate(issue, 'body', t, 11), 'messages:locations.file:12、14');
  assert.equal(context.locate(issue, 'theme', t, 11), 'messages:locations.theme:1、3');
  assert.equal(context.locate({ source: 'body', line: 2 }, 'body', t, 0), 'messages:locations.file:2');
  assert.deepEqual(issue.lines, [1, 3], 'mapping never mutates cached diagnostic positions');
});
