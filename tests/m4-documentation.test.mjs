import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEditorThemeJson, EDITOR_COLOR_ROLES } from '../src/lib/editorThemes.ts';
import { parseThemeConfigJson, validateThemeFormat } from '../src/lib/themeValidation.ts';
import { parseArticle, instantiateArticleTemplate } from '../src/lib/frontMatter.ts';
import { validateArticleAuthoringMarkdown } from '../src/lib/articleAuthoringFormat.ts';
import { contentFormatBlockingIssues } from '../src/lib/contentValidation.ts';
import { loadArticleSnippets, loadArticleTemplates, saveArticleSnippet, saveArticleTemplate } from '../src/lib/contentLibraries.ts';

import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { createUII18n } from '../src/lib/i18n/runtime.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['README.md', 'AGENT-GUIDE.md', 'THEME.md', 'FORMAT.md'];
const locales = ['zh-CN', 'en-US'];
const documents = await Promise.all(['README.md', ...locales.flatMap(locale => names.map(name => `docs/locale/${locale}/${name}`))].map(async file => ({ file, source: await readFile(path.join(root, file), 'utf8') })));
const examples = locales.map(locale => {
  const themeDocument = documents.find(doc => doc.file === `docs/locale/${locale}/THEME.md`).source;
  const blocks = [...themeDocument.matchAll(/^```(json|markdown)\r?\n([\s\S]*?)^```\s*$/gm)].map(match => ({ type: match[1], source: match[2] }));
  const records = blocks.filter(block => block.type === 'json').map(block => JSON.parse(block.source));
  return { locale, editor: records.find(record => record.kind === 'editor-theme'), article: records.find(record => record.kind === 'article-theme'), snippet: records.find(record => record.trigger), markdown: blocks.filter(block => block.type === 'markdown') };
});

const withoutCode = source => source.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
const slug = text => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
const explicitAnchors = source => [...withoutCode(source).matchAll(/<a name="([^"]+)"\s*><\/a>/g)].map(match => match[1]);

test('all bilingual documentation links and anchors resolve without maintainer paths', async () => {
  for (const doc of documents) {
    assert.doesNotMatch(doc.source, /\/Users\/rainy|sandbox\/knowledge/);
    assert.equal(new Set(explicitAnchors(doc.source)).size, explicitAnchors(doc.source).length, doc.file + ': duplicate explicit anchor');
    const source = withoutCode(doc.source);
    const references = [
      ...[...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]),
      ...[...source.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1].replaceAll('&amp;', '&')),
    ];
    for (const reference of references) {
      if (/^https?:\/\//.test(reference)) continue;
      const [target, fragment] = reference.split('#');
      const filename = target ? path.resolve(root, path.dirname(doc.file), target) : path.join(root, doc.file);
      assert.ok(filename.startsWith(root), doc.file + ': link escapes repository');
      const info = await stat(filename);
      if (fragment) {
        assert.ok(info.isFile(), doc.file + ': directory fragment');
        const source = await readFile(filename, 'utf8');
        const headings = [...withoutCode(source).matchAll(/^#{1,6}\s+(.+)$/gm)].map(heading => slug(heading[1]));
        assert.ok([...headings, ...explicitAnchors(source)].includes(fragment), `${doc.file}: missing anchor ${reference}`);
      }
    }
  }
});

test('root entry, paired language navigation and stable anchors match the public document layout', async () => {
  const entry = documents.find(doc => doc.file === 'README.md').source;
  for (const name of names) {
    for (const locale of locales) assert.ok(entry.includes(`docs/locale/${locale}/${name}`));
    const zh = documents.find(doc => doc.file === `docs/locale/zh-CN/${name}`).source;
    const en = documents.find(doc => doc.file === `docs/locale/en-US/${name}`).source;
    assert.ok(zh.includes(`../en-US/${name}`)); assert.ok(en.includes(`../zh-CN/${name}`));
    assert.deepEqual(explicitAnchors(en).sort(), explicitAnchors(zh).sort(), name);
  }
  for (const name of names.filter(name => name !== 'README.md')) await assert.rejects(stat(path.join(root, name)), { code: 'ENOENT' });
  assert.ok(entry.includes('https://github.com/user-attachments/assets/'));
});

for (const { locale, editor, article, snippet, markdown } of examples) {
  test(`${locale}: complete editor and article examples pass production validators`, () => {
    assert.ok(editor && article && snippet);
    const parsedEditor = parseEditorThemeJson(JSON.stringify(editor));
    assert.equal(parsedEditor.formatVersion, 4);
    assert.deepEqual(Object.keys(parsedEditor.colors.light).sort(), [...EDITOR_COLOR_ROLES].sort());
    assert.deepEqual(Object.keys(parsedEditor.colors.dark).sort(), [...EDITOR_COLOR_ROLES].sort());
    assert.equal(Object.keys(parsedEditor.fonts).length, 8);
    assert.equal(parseThemeConfigJson(JSON.stringify(article)).id, article.id);
    assert.deepEqual(validateThemeFormat(article), []);
  });

  test(`${locale}: starter and complete article examples retain metadata and pass authoring gates`, async () => {
    assert.equal(markdown.length, 2);
    for (const block of markdown) {
      const parsed = parseArticle(block.source);
      assert.equal(parsed.canCopy, true);
      assert.equal(parsed.metadata.theme.id, article.id);
      const issues = await validateArticleAuthoringMarkdown(parsed.body);
      assert.deepEqual(contentFormatBlockingIssues(issues), []);
      assert.ok(!issues.some(issue => issue.kind === 'engine'), 'validation must execute');
    }
    const completed = markdown[1].source;
    assert.doesNotMatch(completed, /▌|\/\/guide-note|\[填写|\[Write the article/);
    const headings = [...completed.matchAll(/^## (.+)$/gm)].map(match => match[0]);
    assert.equal(headings.length, 2);
    assert.ok(completed.indexOf(headings[0]) < completed.indexOf('/images/article-sample.png'));
    assert.ok(completed.indexOf('/images/article-sample.png') < completed.indexOf(headings[1]));
    const next = parseArticle(instantiateArticleTemplate(markdown[0].source, { theme: article }));
    assert.equal(next.metadata.theme.id, article.id);
    assert.notEqual(next.metadata.createdAt, parseArticle(markdown[0].source).metadata.createdAt);
  });

  test(`${locale}: documentation snippet and starter save/reload through production library functions`, async () => {
    const directory = new MemoryDirectory('documentation-' + locale);
    await loadArticleSnippets(directory); await loadArticleTemplates(directory);
    await saveArticleSnippet(directory, { ...snippet, categoryId: 'default' }, null);
    await saveArticleTemplate(directory, 'guide-starter', markdown[0].source, null, 'default');
    const savedSnippet = (await loadArticleSnippets(directory)).snippets.find(item => item.id === snippet.id);
    const savedTemplate = (await loadArticleTemplates(directory)).templates.find(item => item.id === 'guide-starter');
    assert.equal(savedSnippet.content, snippet.content); assert.equal(savedSnippet.trigger, snippet.trigger);
    assert.equal(savedTemplate.source, markdown[0].source);
    await assert.rejects(saveArticleSnippet(directory, { ...snippet, categoryId: 'default' }, null), /已被其他片段占用/);
  });
}

for (const locale of locales) test(`${locale}: format MVP objects compile through registered capability contracts`, () => {
  const source = documents.find(doc => doc.file === `docs/locale/${locale}/FORMAT.md`).source;
  const records = [...source.matchAll(/^```json\r?\n([\s\S]*?)^```\s*$/gm)].map(match => JSON.parse(match[1]));
  const validator = records.find(record => record.operator === 'style.values');
  const support = records.find(record => record.validator === validator.id);
  const origin = records.find(record => record[support.source]);
  const bundle = structuredClone(DEFAULT_FORMAT_BUNDLE);
  bundle.support.meta.sources[support.source] = origin[support.source];
  bundle.support.rules.push(support); bundle.validator.rules.push(validator);
  for (const step of records.filter(record => record.operator && record.operator !== 'style.values').concat(records.filter(Array.isArray).flat())) {
    const at = bundle.formatter.steps.findIndex(existing => existing.operator === step.operator && step.operator !== 'css.drop-properties');
    if (at < 0) bundle.formatter.steps.push(step); else bundle.formatter.steps[at] = step;
  }
  const result = compileFormatBundle(bundle);
  assert.equal(result.formatter.markdown.softBreaks, 'line-break');
  assert.ok(result.formatter.output.dropCssProperties.includes('text-transform'));
  assert.equal(result.formatter.stylesheets.entry, 'styles/globals.css');
  assert.equal(result.formatter.document.viewport.contentWidth, 996);
  assert.equal(result.validator.rules.at(-1).id, 'custom-alignment');
});

test('both installation guides reference repository npm scripts and runtime repair hints target existing localized files', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await stat(path.join(root, 'package-lock.json'));
  for (const locale of locales) {
    for (const name of ['README.md', 'AGENT-GUIDE.md']) {
      const source = documents.find(doc => doc.file === `docs/locale/${locale}/${name}`).source;
      for (const block of source.matchAll(/^```sh\r?\n([\s\S]*?)^```\s*$/gm)) for (const line of block[1].trim().split('\n')) {
        if (line === 'npm install') continue;
        if (line.startsWith('npm run ')) assert.ok(manifest.scripts[line.slice(8)], line);
        else assert.ok(manifest.scripts[line.slice(4)], line);
      }
    }
    const instance = createUII18n(locale);
    const hint = instance.t('messages:uiFeedback.repairFormat');
    const target = `docs/locale/${locale}/FORMAT.md`;
    assert.ok(hint.includes(target)); await stat(path.join(root, target));
  }
});

class MemoryFile {
  kind = 'file';
  constructor(name) { this.name = name; this.content = ''; }
  async getFile() { const content = this.content; return { text: async () => content, size: content.length }; }
  async createWritable() { let pending = this.content; return { write: async content => { pending = content; }, close: async () => { this.content = pending; }, abort: async () => {} }; }
}
class MemoryDirectory {
  kind = 'directory';
  constructor(name) { this.name = name; this.children = new Map(); }
  async getDirectoryHandle(name, options = {}) { return this.get(name, 'directory', options); }
  async getFileHandle(name, options = {}) { return this.get(name, 'file', options); }
  get(name, kind, options) {
    if (!this.children.has(name) && options.create) this.children.set(name, kind === 'directory' ? new MemoryDirectory(name) : new MemoryFile(name));
    const item = this.children.get(name);
    if (!item) throw new DOMException(name, 'NotFoundError');
    if (item.kind !== kind) throw new DOMException(name, 'TypeMismatchError');
    return item;
  }
  async removeEntry(name) { this.children.delete(name); }
  async *entries() { yield* this.children.entries(); }
}
