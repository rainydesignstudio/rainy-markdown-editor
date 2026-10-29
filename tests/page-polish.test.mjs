import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import * as messages from '../src/lib/i18n/productMessages.ts';
import { feedbackNotice, formatBriefFeedback } from '../src/lib/i18n/feedback.ts';
import { sortArticleList, ARTICLE_SORTS } from '../src/lib/articleListSorting.ts';
import * as organization from '../src/lib/editorWorkspace.ts';
import { libraryCapability } from '../src/lib/article-format/libraryConfiguration.ts';
import { DEFAULT_FORMAT_BUNDLE } from '../src/lib/article-format/config.ts';
import { activateLibraryFormat } from '../src/lib/article-format/library.ts';
import { activateFormatBundle, assertFormatReady } from '../src/lib/article-format/runtime.ts';

test('article view sorting covers all six orders, retains ties and never mutates manual organization', () => {
  const article = (id, title, createdAt, updatedAt) => ({ id, parse: { metadata: { title, createdAt, updatedAt } } });
  const input = [article('a', 'Note 10', '2026-01-01', '2026-03-01'), article('b', 'Note 2', '2026-02-01', '2026-02-01'), article('c', 'Note 1', '2026-03-01', '2026-01-01')];
  const before = JSON.stringify(input);
  const expected = [['a','b','c'], ['c','b','a'], ['c','b','a'], ['a','b','c'], ['c','b','a'], ['a','b','c']];
  ARTICLE_SORTS.forEach((sort, index) => assert.deepEqual(sortArticleList(input, sort, 'en-US').map(item => item.id), expected[index]));
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(sortArticleList([input[0], { ...input[0], id: 'tie' }], 'updated-desc', 'zh-CN').map(item => item.id), ['a','tie']);
  assert.doesNotThrow(() => sortArticleList([article('bad', 'Bad date', 'invalid', 'invalid'), input[0]], 'created-desc', 'en-US'));
});

test('all short feedback stays below thirty characters in both languages even with large counts', async () => {
  for (const locale of ['zh-CN','en-US']) {
    const data = JSON.parse(await readFile(new URL('../resources/locale/' + locale + '/messages.json', import.meta.url), 'utf8'));
    const t = createUII18n(locale).getFixedT(locale, 'messages');
    for (const [key, template] of Object.entries(data.feedback)) {
      const params = Object.fromEntries([...template.matchAll(/{{\s*(\w+)\s*}}/g)].map(match => [match[1], 1000000000000]));
      const text = formatBriefFeedback({ messageKey: 'feedback.' + key, messageParams: params }, t, locale);
      assert.ok([...text].length < 30, locale + ' feedback.' + key + ': ' + text);
      assert.doesNotMatch(text, /{{|messages:feedback/);
    }
  }
});

test('partial writes summarize retained source and index-repair states, while full details keep author filenames', () => {
  const retained = messages.productMessage('mediaManagement.destinationWasWritten', { copiedFileName: '作者文件.png', value: 'disk busy', value2: messages.productReference('mediaManagement.theSourceFileIsRetained') });
  const outcome = messages.productMessage('controller.completed', { outcomes_filter_result_result_ok_Count: 0, operation_assetsCount: 1, details: messages.productJoin([retained]) });
  const before = JSON.stringify(outcome), result = feedbackNotice(outcome, 'warning');
  assert.equal(result.summary.messageKey, 'feedback.targetSaved'); assert.equal(result.tone, 'warning');
  const t = createUII18n('en-US').getFixedT('en-US', 'messages');
  assert.equal(formatBriefFeedback(result.summary, t, 'en-US'), 'Target saved; source retained');
  assert.match(messages.formatProductMessage(outcome, t), /作者文件.png/);
  assert.equal(JSON.stringify(outcome), before);
  const repair = messages.productMessage('controller.fileWasDeletedButItsDescriptionIndexWasNotCleaned', { assetFileName: 'a.png', cause: 'disk busy' });
  assert.equal(feedbackNotice(repair).summary.messageKey, 'feedback.indexRepair');
});

test('article saves keep full paths and partial failure causes out of the short heading in both languages', () => {
  const path = 'articles/2026-10/' + '长标题'.repeat(30) + '/article.md';
  for (const locale of ['zh-CN', 'en-US']) {
    const t = createUII18n(locale).getFixedT(locale, 'messages');
    const saved = messages.productMessage('controller.sourceSaved', { result_articleFilePath: path });
    const heading = formatBriefFeedback(feedbackNotice(saved, 'success').summary, t, locale);
    assert.ok([...heading].length < 30); assert.ok(!heading.includes(path));
    assert.ok(messages.formatProductMessage(saved, t).includes(path));
    const partial = messages.productMessage('shared.compose', { parts: messages.productJoin([messages.productReference('controller.sourceSavedTheRenderRecordWasNotUpdated'), 'disk full']) });
    assert.equal(feedbackNotice(partial, 'warning').summary.messageKey, 'feedback.renderRecordPending');
    assert.match(messages.formatProductMessage(partial, t), /disk full/);
  }
});

test('library configuration errors retain nested message IDs through activation and change UI language without changing canonical errors', async () => {
  let writes = 0;
  const files = { 'config.json': { schemaVersion: 1, meta: { id: 'mismatched' } }, 'format-support.json': DEFAULT_FORMAT_BUNDLE.support, 'validator.json': DEFAULT_FORMAT_BUNDLE.validator, 'formatter.json': DEFAULT_FORMAT_BUNDLE.formatter };
  const root = { name: 'isolated-format-errors', async getDirectoryHandle(name, options) { assert.equal(name, 'format'); assert.equal(options, undefined); return { async getFileHandle(name) { return { async getFile() { const text = JSON.stringify(files[name]); return { size: text.length, text: async () => text }; }, async createWritable() { writes++; throw new Error('forbidden'); } }; } }; } };
  try {
    const { snapshot } = await activateLibraryFormat(root, () => true);
    assert.equal(snapshot.source, 'invalid'); assert.equal(snapshot.issue.messageKey, 'library.theLibraryFormatConfigurationIsUnavailable');
    assert.equal(snapshot.issue.messageParams.cause.messageKey, 'libraryConfiguration.identity');
    const canonical = snapshot.error;
    const en = messages.formatProductMessage(snapshot.issue, createUII18n('en-US').getFixedT('en-US', 'messages'));
    const zh = messages.formatProductMessage(snapshot.issue, createUII18n('zh-CN').getFixedT('zh-CN', 'messages'));
    assert.doesNotMatch(en, /\p{Script=Han}/u); assert.match(en, /config.json/); assert.match(zh, /资料库标识/);
    assert.equal(snapshot.error, canonical); assert.equal(writes, 0);
    const capability = libraryCapability(snapshot, 'previewMode'); assert.equal(capability.enabled, false);
    assert.doesNotMatch(messages.formatProductMessage(capability.reason, createUII18n('en-US').getFixedT('en-US', 'messages')), /\p{Script=Han}/u);
    assert.throws(() => assertFormatReady(snapshot), error => error.messageKey === 'library.theLibraryFormatConfigurationIsUnavailable');
  } finally { activateFormatBundle(DEFAULT_FORMAT_BUNDLE, null, 'built-in'); }
});

test('article asset navigation keeps All separate, orders project groups, and puts nonempty Ungrouped and Archive last', async () => {
  const workspace = organization.createDefaultEditorWorkspace();
  workspace.projects = [{ id:'one',name:'作者项目',pinned:true }, { id:'two',name:'Two',pinned:true }]; workspace.projectOrder = ['two','one'];
  const articles = ['one','two','loose','old'].map(id => ({ id, parse: { metadata: { title:id,updatedAt:'2026-01-01' } } }));
  workspace.articleOrganization = { one:{projectId:'one',archived:false},two:{projectId:'two',archived:false},loose:{projectId:null,archived:false},old:{projectId:'one',archived:true} };
  const source = await readFile(new URL('../src/components/media/MediaArticleNavigation.tsx', import.meta.url), 'utf8'), module = { exports:{} };
  const t = createUII18n('en-US').getFixedT('en-US','articles');
  vm.runInNewContext(ts.transpileModule(source,{ compilerOptions:{ module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX } }).outputText,{ module,exports:module.exports,require(id) {
    if(id==='react') return React; if(id==='react/jsx-runtime') return jsx;
    if(id.endsWith('/editorWorkspace')) return organization;
    if(id.endsWith('/UILocaleProvider')) return { useUITranslation:()=>({t}) };
    if(id.endsWith('/ScrollViewport')) return { ScrollViewport:({children})=>jsx.jsx('div',{children}) };
    if(id.endsWith('/ContentIcon')) return { ContentIcon:()=>null };
    if(id.endsWith('/LibraryCard')) return { LibraryCard:({title,icon,...props})=>jsx.jsx('button',{...props,children:title}) };
    if(id.endsWith('/CollapsiblePanel')) return { CollapsiblePanel:({title,open,children})=>jsx.jsxs('section',{'data-group':title,children:[jsx.jsx('h3',{children:title}),open?children:null]}) };
    throw new Error(id);
  }});
  const dom = new JSDOM(renderToStaticMarkup(jsx.jsx(module.exports.MediaArticleNavigation,{articles,workspace,selected:'one',onSelect(){},disabled:false})));
  try {
    assert.equal(dom.window.document.querySelector('aside button').textContent,'All articles');
    assert.deepEqual([...dom.window.document.querySelectorAll('section')].map(node=>node.dataset.group),['Two','作者项目','Ungrouped','Archive']);
    assert.equal(dom.window.document.querySelector('[data-group="作者项目"] button').getAttribute('aria-pressed'),'true');
    assert.equal(dom.window.document.querySelector('[data-group=Archive] button'),null,'other groups stay folded');
  } finally { dom.window.close(); }
});

test('content validation gives package renderers source/theme without waiting for an unbound structure probe', async () => {
  const source = await readFile(new URL('../src/lib/contentValidation.ts', import.meta.url), 'utf8'), module = { exports:{} }, probe = {}, calls = [];
  let renderer = {}, reported = [];
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.CommonJS } }).outputText, { module, exports:module.exports, document:{}, require(id) {
    if(id.endsWith('/productMessages')) return messages;
    if(id.endsWith('/article-format/runtime')) return { getFormatSnapshot:()=>({renderer,bundle:{validator:{product:{theme:{savePolicy:{}}}}}}) };
    if(id.endsWith('/articleFormatReport')) return { inspectArticleFormatReport:async (...args)=>{calls.push(args);return {body:{issues:reported}};} };
    if(id.endsWith('/articleFormat')) return { articleFormatPreviewStructure:()=>probe, articleFormatBlocks:tier=>tier==='error',articleFormatMessage:()=> 'blocked',articleFormatMessageReference:()=>messages.productReference('feedback.validationFailed') };
    if(id.endsWith('/frontMatter')) return { createArticleSource:()=> 'metadata',replaceArticleBody:(_source,body)=>body };
    if(id.endsWith('/articleAuthoringFormat')) return { validateArticleAuthoringMarkdown:()=>{throw new Error('the selected theme must remain part of validation');} };
    throw new Error(id);
  }});
  const theme={id:'authored-theme'}, body='<p>Actual draft</p>';
  assert.equal((await module.exports.validateContentSource('snippets',body,{theme})).errors.length,0);
  assert.equal(calls[0][0],body);assert.equal(calls[0][1],theme);assert.equal(calls[0][2],null);
  renderer=undefined;await module.exports.validateContentSource('snippets',body,{theme});assert.equal(calls[1][2],probe);
  renderer={};reported=[{kind:'element',tier:'error',message:'unsafe authoring'}];
  assert.deepEqual([...(await module.exports.validateContentSource('snippets',body,{theme})).errors],['blocked'],'package validation errors still block saving');
});


test('explicit operation tones survive adaptation, including state objects and all-failed batches', () => {
  const saved = { label: 'Editor appearance saved in the current library.', tone: 'success' };
  assert.equal(feedbackNotice(saved).tone, 'success');
  assert.equal(feedbackNotice(saved, 'error').tone, 'error');
  const batch = (done,total) => messages.productReference('controller.completed', { outcomes_filter_result_result_ok_Count: done, operation_assetsCount: total });
  assert.equal(feedbackNotice(batch(0,2)).tone, 'error');
  assert.equal(feedbackNotice(batch(1,2)).tone, 'warning');
  assert.equal(feedbackNotice(batch(2,2)).tone, 'success');
  assert.equal(feedbackNotice(messages.productReference('mediaManagement.copiedTheSourceIsReferencedByTheBodyOrHistoryAndIs')).tone, 'success');
});
