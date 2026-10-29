import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { getDefaultContentLibrary, initializeContentLibraries, loadArticleSnippets, loadArticleTemplates, saveSnippetCategory, saveArticleSnippet } from '../src/lib/contentLibraries.ts';
import { getBuiltinArticleThemes } from '../src/lib/themes.ts';
import { getBuiltinEditorThemes } from '../src/lib/editorThemes.ts';
import { initializeThemeDefaults, copyDefaultThemes } from '../src/lib/themeDefaults.ts';
import { readLibrarySeedLocale, readLibrarySeedRecord, resolveSeedLocale } from '../src/lib/librarySeeds.ts';
import { PUBLIC_PLATFORM_PRESETS } from '../src/lib/article-format/library.ts';
import { createNamedDataDirectory, loadThemeLibrary } from '../src/lib/fileSystem.ts';
import { parseArticle } from '../src/lib/frontMatter.ts';
import { tree, snapshot } from './knowledge/fs-fixture.mjs';

test('both complete seeds preserve IDs, visual design, references and cursor positions', async () => {
  const en = getDefaultContentLibrary('en-US'), zh = getDefaultContentLibrary('zh-CN');
  for (const [left, right] of [[getBuiltinArticleThemes('en-US'), getBuiltinArticleThemes('zh-CN')], [getBuiltinEditorThemes('en-US'), getBuiltinEditorThemes('zh-CN')]]) {
    assert.deepEqual(left.map(({ name, ...design }) => design), right.map(({ name, ...design }) => design));
  }
  const structure = source => [...source.matchAll(/<[^>]+>/g)].map(match => match[0]);
  assert.equal(en.snippets.length, 24); assert.equal(en.templates.length, 5);
  for (let i = 0; i < en.snippets.length; i++) {
    const left = en.snippets[i], right = zh.snippets[i];
    assert.deepEqual([left.id, left.categoryId, left.trigger, left.icon], [right.id, right.categoryId, right.trigger, right.icon]);
    assert.deepEqual(structure(left.content), structure(right.content));
    assert.equal(left.content.split('▌').length, right.content.split('▌').length);
    assert.doesNotMatch(left.name + left.description + left.content, /[\p{Script=Han}]/u);
  }
  for (let i = 0; i < en.templates.length; i++) {
    const left = en.templates[i], right = zh.templates[i];
    assert.deepEqual([left.id, left.categoryId], [right.id, right.categoryId]);
    assert.deepEqual(structure(left.source), structure(right.source));
    assert.deepEqual(parseArticle(left.source).metadata.theme, parseArticle(right.source).metadata.theme);
    assert.equal(parseArticle(left.source).canCopy, true);
    assert.doesNotMatch(left.source, /[\p{Script=Han}]/u);
  }
  async function files(path, prefix = '') {
    const result = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) result.push(...await files(new URL(entry.name + '/', path), relative + '/'));
      else result.push(relative);
    }
    return result.sort();
  }
  assert.deepEqual(await files(new URL('../resources/template/fresh-library/en-US/', import.meta.url)), await files(new URL('../resources/template/fresh-library/zh-CN/', import.meta.url)));
});

test('named library creation fixes the seed language independently of platform selection', async () => {
  for (const locale of ['en-US', 'zh-CN', 'fr-FR']) for (const preset of ['wechat-article', 'empty']) {
    const root = await createNamedDataDirectory(tree('parent'), locale, preset, locale);
    assert.equal(await readLibrarySeedLocale(root), resolveSeedLocale(locale));
    const snippets = await loadArticleSnippets(root), templates = await loadArticleTemplates(root), themes = await loadThemeLibrary(root);
    assert.equal(snippets.issues.length, 0); assert.equal(templates.issues.length, 0); assert.equal(themes.issues.length, 0);
    if (preset === 'empty') { assert.equal(snippets.snippets.length, 0); assert.equal(snippets.categories.length, 0); assert.equal(templates.templates.length, 3); assert.equal(templates.categories.length, 1); }
    else { assert.equal(snippets.snippets.find(item => item.id === 'callout').name, locale === 'zh-CN' ? '提示框' : 'Callout'); assert.equal(templates.templates.length, 5); }
    assert.equal(templates.templates.find(item => item.id === 'markdown-guide').name, locale === 'zh-CN' ? 'Markdown 常用格式' : 'Common Markdown formats');
    const format = await root.getDirectoryHandle('format');
    const validator = JSON.parse(await (await (await format.getFileHandle('validator.json')).getFile()).text());
    assert.equal(validator.meta.id, preset === 'empty' ? 'empty' : 'wechat-official');
    const before = snapshot(root);
    await initializeThemeDefaults(root, locale === 'zh-CN' ? 'en-US' : 'zh-CN');
    await copyDefaultThemes(root, 'article-themes');
    await loadArticleSnippets(root); await loadArticleTemplates(root);
    assert.equal(snapshot(root), before, 'reloading and another UI language must not rewrite existing content');
  }
});

test('load defaults and empty directories reuse the persisted choice and keep edited objects', async () => {
  const root = tree('zh-library');
  await initializeThemeDefaults(root, 'zh-CN');
  await initializeContentLibraries(root);
  const articleThemes = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('article-themes');
  const basic = articleThemes.children.get('basic.json');
  basic.value = JSON.stringify({ ...JSON.parse(basic.value), name: '我的基础主题' });
  const before = basic.value;
  articleThemes.children.delete('qingyan.json');
  const result = await copyDefaultThemes(root, 'article-themes');
  assert.equal(result.added, 1); assert.equal(basic.value, before);
  assert.equal(JSON.parse(articleThemes.children.get('qingyan.json').value).name, '青砚');
  assert.equal((await loadArticleSnippets(root)).snippets.find(item => item.id === 'signature').name, '署名 / 结尾');
  assert.equal((await loadArticleTemplates(root)).templates.find(item => item.id === 'tutorial').name, '技术教程标题');
});

test('a failed Chinese initialization retains the language when retried from English', async () => {
  const root = tree('retry');
  const themes = await root.getDirectoryHandle('themes', { create: true });
  const article = await themes.getDirectoryHandle('article-themes', { create: true });
  article.failWrite = true;
  await assert.rejects(initializeThemeDefaults(root, 'zh-CN'));
  assert.equal(await readLibrarySeedLocale(root), 'zh-CN');
  assert.equal(JSON.parse(themes.children.get('default-themes.loaded').value).initialized, false);
  article.failWrite = false;
  await initializeThemeDefaults(root, 'en-US');
  assert.equal(JSON.parse(article.children.get('basic.json').value).name, '基础');
  assert.equal(JSON.parse(themes.children.get('default-themes.loaded').value).initialized, true);
});

test('legacy receipts remain byte-for-byte intact, while invalid receipts block seeding', async () => {
  const root = tree('legacy', { 'themes/default-themes.loaded': '{"version":1}', 'themes/article-themes/custom.json': '{"private":"keep"}' });
  const before = snapshot(root);
  assert.equal(await readLibrarySeedLocale(root), 'en-US');
  await initializeThemeDefaults(root, 'zh-CN');
  assert.equal(snapshot(root), before);
  for (const value of ['{', '{"version":1,"locale":"fr-FR"}', '{"version":1,"initialized":"yes"}']) {
    const invalid = tree('invalid', { 'themes/default-themes.loaded': value });
    const original = snapshot(invalid);
    await assert.rejects(loadArticleSnippets(invalid), /种子记录无效/);
    await assert.rejects(initializeThemeDefaults(invalid, 'en-US'), /种子记录无效/);
    assert.equal(snapshot(invalid), original);
  }
});

test('seed objects remain monolingual without per-object locale fields', async () => {
  for (const locale of ['en-US', 'zh-CN']) {
    const basic = JSON.parse(await readFile(new URL(`../resources/template/fresh-library/${locale}/themes/article-themes/basic.json`, import.meta.url), 'utf8'));
    assert.equal('locale' in basic || 'i18n' in basic || 'translations' in basic, false);
    assert.deepEqual(Object.keys(basic).sort(), Object.keys(getBuiltinArticleThemes(locale)[0]).sort());
  }
});

test('preset declarations select content independently of language and neutral starters contain no HTML bodies', () => {
  for (const locale of ['en-US','zh-CN']) for (const preset of PUBLIC_PLATFORM_PRESETS) {
    const content = getDefaultContentLibrary(locale,preset.contentSeed);
    if (preset.contentSeed === 'markdown') {
      assert.equal(content.snippets.length,0); assert.equal(content.snippetCategories.length,0);
      assert.deepEqual(content.templates.map(item=>item.id),['markdown-guide','project-review','tutorial']);
      assert.equal(content.templateCategories.length,1);
      for (const item of content.templates) {
        const parsed=parseArticle(item.source);assert.equal(parsed.canCopy,true);
        assert.doesNotMatch(parsed.body,/<\/?[a-z][^>]*>/i);
        if(locale==='en-US')assert.doesNotMatch(item.source,/\p{Script=Han}/u);
      }
    } else { assert.equal(content.snippets.length,24); assert.equal(content.templates.length,5); }
  }
});

test('ordinary reads preserve deliberately empty content, while explicit defaults reuse the saved profile and retain authored files', async () => {
  const root=await createNamedDataDirectory(tree('parent'),'neutral','empty','en-US');
  assert.equal((await readLibrarySeedRecord(root)).contentSeed,'markdown');
  const snippets=await root.getDirectoryHandle('snippets'),templates=await root.getDirectoryHandle('templates');
  assert.deepEqual([...snippets.children.keys()],['index.json']);
  snippets.children.clear();templates.children.clear();
  const empty=snapshot(root);
  for(let i=0;i<2;i++) {
    assert.equal((await loadArticleSnippets(root)).snippets.length,0);
    assert.equal((await loadArticleTemplates(root)).templates.length,0);
  }
  assert.equal(snapshot(root),empty,'reading a legitimate empty set never imports defaults');
  await initializeContentLibraries(root);
  assert.equal((await loadArticleSnippets(root)).categories.length,0);
  assert.equal((await loadArticleTemplates(root)).templates.length,3);
  await saveSnippetCategory(root,{id:'business',name:'My business',description:'Custom',order:1},null);
  await saveArticleSnippet(root,{id:'business-note',categoryId:'business',name:'Business note',description:'Author supplied',trigger:'//business-note',content:'A business note.▌'},null);
  const folder=await templates.getDirectoryHandle('default'),file=folder.children.get('tutorial.md');file.value+='\nMy authored notes.';
  const index=snippets.children.get('index.json');index.value=JSON.stringify({...JSON.parse(index.value),custom:{keep:true}});
  const before=snapshot(root);
  await initializeContentLibraries(root);
  assert.equal(snapshot(root),before,'explicit defaults never overwrite authors, custom categories or unknown index metadata');
});

test('partial initialization retains its chosen content profile and retries missing defaults without replacing authored data', async () => {
  const root=tree('retry-content'),templates=await root.getDirectoryHandle('templates',{create:true});templates.failWrite=true;
  await assert.rejects(initializeThemeDefaults(root,'zh-CN',{contentSeed:'markdown'}));
  const saved=await readLibrarySeedRecord(root);assert.equal(saved.initialized,false);assert.equal(saved.contentSeed,'markdown');
  const folder=await templates.getDirectoryHandle('default'),file=folder.children.get('tutorial.md');file.value+='\n用户补充。';const authored=file.value;
  templates.failWrite=false;await initializeThemeDefaults(root,'en-US',{contentSeed:'rich'});
  assert.equal((await readLibrarySeedRecord(root)).initialized,true);
  assert.equal((await readLibrarySeedRecord(root)).contentSeed,'markdown');
  assert.equal(await readLibrarySeedLocale(root),'zh-CN');
  assert.equal((await loadArticleSnippets(root)).categories.length,0);
  assert.equal((await loadArticleTemplates(root)).templates.length,3);
  assert.equal(file.value,authored);
});

test('legacy empty libraries are read without refilling or rewriting their receipt', async () => {
  const root=tree('legacy-empty',{'themes/default-themes.loaded':'{"version":1}'});
  await root.getDirectoryHandle('snippets',{create:true});await root.getDirectoryHandle('templates',{create:true});
  const before=snapshot(root);
  assert.equal((await loadArticleSnippets(root)).snippets.length,0);
  assert.equal((await loadArticleTemplates(root)).templates.length,0);
  assert.equal(snapshot(root),before);
});
