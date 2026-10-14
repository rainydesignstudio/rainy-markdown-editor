import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { articleHtmlPlugins, rehypePreviewOnly } from '../src/lib/article-format/pipeline.ts';
import { loadStylesheetEnvironment, normalizeLibraryPath, stylesheetAssetPath } from '../src/lib/article-format/styles.ts';
import { DEFAULT_FORMAT_BUNDLE } from '../src/lib/article-format/config.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { compileArticleStyles, clearArticleStyleCache, articleStyleCacheStats, validateArticleUtilityClasses } from '../src/lib/tailwind.ts';

function library(files) {
  const reads = [];
  const directory = (prefix = '') => ({
    name: prefix.split('/').at(-1) || 'test-library',
    async getDirectoryHandle(name) {
      const path = prefix ? prefix + '/' + name : name;
      if (!Object.keys(files).some(key => key.startsWith(path + '/'))) throw new DOMException('Missing directory ' + path, 'NotFoundError');
      return directory(path);
    },
    async getFileHandle(name) {
      const path = prefix ? prefix + '/' + name : name;
      if (!Object.hasOwn(files, path)) throw new DOMException('Missing file ' + path, 'NotFoundError');
      return { async getFile() { reads.push(path); return new File([files[path]], name); } };
    },
    async *entries() {
      const names = new Map();
      for (const path of Object.keys(files)) {
        if (prefix && !path.startsWith(prefix + '/')) continue;
        const relative = prefix ? path.slice(prefix.length + 1) : path;
        const [name, ...rest] = relative.split('/');
        names.set(name, rest.length ? 'directory' : 'file');
      }
      for (const [name, kind] of names) yield [name, { name, kind }];
    },
  });
  return { root: directory(), reads };
}
const policy = { entry: 'styles/globals.css', publicRoot: 'assets' };
const emptyTheme = { ...BASIC_THEME, css: '', nodes: {} };

test('preview additions carry removable markers through the real Markdown pipeline', () => {
  const render = enabled => renderToStaticMarkup(React.createElement(ReactMarkdown, {
    rehypePlugins: [...articleHtmlPlugins(), [rehypePreviewOnly, { enabled }]],
  }, '# Preview addition\n\n<div><span>Nested content</span></div>'));
  assert.equal((render(true).match(/data-preview-only="true"/g) ?? []).length, 2);
  assert.doesNotMatch(render(false), /data-preview-only/);
  assert.match(render(true), /Nested content/);
});

test('CSS imports and resource URLs retain each source base and virtual site root', async () => {
  const { root, reads } = library({
    'styles/globals.css': '@import "tailwindcss"; @import "./modules/base.css";',
    'styles/modules/base.css': '.card { &.active { color: red } background-image: url("/image/icons.svg#mark"); } @font-face { font-family: Demo; src: url("../../assets/fonts/demo.woff2") }',
    'assets/image/icons.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'assets/fonts/demo.woff2': 'fixture-font',
    'articles/unrelated/article.md': 'must not be read',
  });
  const environment = await loadStylesheetEnvironment(root, policy);
  try {
    assert.deepEqual(environment.assets.map(asset => asset.path), ['assets/image/icons.svg', 'assets/fonts/demo.woff2']);
    assert.match(environment.files['styles/modules/base.css'], /blob:/);
    assert.match(environment.files['styles/modules/base.css'], /#mark/);
    assert.ok(environment.classes.has('card'));
    assert.ok(environment.classes.has('active'));
    assert.ok(!reads.includes('articles/unrelated/article.md'));
  } finally { environment.dispose(); }
});
test('cycles, escaping imports, remote resources and JS plugins fail before activation', async () => {
  for (const files of [
    { 'styles/globals.css': '@import "./b.css";', 'styles/b.css': '@import "./globals.css";' },
    { 'styles/globals.css': '@import "../../private.css";' },
    { 'styles/globals.css': '.a{background:url(https://example.test/a.png)}' },
    { 'styles/globals.css': '@plugin "./plugin.js";' },
  ]) await assert.rejects(loadStylesheetEnvironment(library(files).root, policy), /循环|越出|授权|JS/);
  assert.throws(() => normalizeLibraryPath('../outside'), /越出/);
  assert.throws(() => stylesheetAssetPath('/../../private.png', 'styles/a.css', 'assets'), /越出/);
});
test('explicit source folders respect exclusions without scanning other article folders', async () => {
  const { root, reads } = library({
    'styles/globals.css': '@source "../examples/**/*.html"; @source not "../examples/skip.html";',
    'examples/one.html': '<p class="text-red-500">one</p>',
    'examples/skip.html': '<p class="text-blue-500">skip</p>',
    'articles/draft/article.md': '<p class="text-green-500">unrelated</p>',
  });
  const environment = await loadStylesheetEnvironment(root, policy);
  try {
    assert.ok(environment.candidates.includes('text-red-500'));
    assert.ok(!environment.candidates.includes('text-blue-500'));
    assert.ok(!reads.includes('articles/draft/article.md'));
  } finally { environment.dispose(); }
});
test('a hundred body edits reuse compiled style environment and never reread library CSS', async () => {
  const { root, reads } = library({
    'styles/globals.css': '@import "tailwindcss"; @theme { --color-brand: #abcdef; } @source inline("text-brand"); .custom-note { color: var(--color-brand); }',
  });
  const environment = await loadStylesheetEnvironment(root, policy);
  const bundle = structuredClone(DEFAULT_FORMAT_BUNDLE);
  bundle.formatter.steps.push({ id: 'library-css', operator: 'css.stylesheets', enabled: true, parameters: policy });
  activateFormatBundle(bundle, root.name, 'library', environment);
  clearArticleStyleCache();
  try {
    const first = await compileArticleStyles('# Draft', emptyTheme);
    assert.match(first.css, /--color-brand/);
    assert.match(first.css, /\.custom-note/);
    const readCount = reads.length;
    const baseline = articleStyleCacheStats().baseCompiles;
    for (let index = 0; index < 100; index++) await compileArticleStyles('# Draft ' + index, emptyTheme);
    assert.equal(articleStyleCacheStats().baseCompiles, baseline);
    assert.equal(reads.length, readCount);
    assert.equal(articleStyleCacheStats().hits, 100);
    const issues = await validateArticleUtilityClasses(['custom-note'], 'fixture', undefined, undefined, emptyTheme);
    assert.deepEqual(issues, []);
  } finally { activateFormatBundle(DEFAULT_FORMAT_BUNDLE, null, 'built-in'); }
});
