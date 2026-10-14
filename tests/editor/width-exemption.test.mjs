import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { articleHtmlPlugins } from '../../src/lib/article-format/pipeline.ts';
import { DEFAULT_FORMAT_BUNDLE } from '../../src/lib/article-format/config.ts';

test('horizontal scrolling retains the official explicit width exemption on the inner list only', async () => {
  for (const locale of ['en-US', 'zh-CN']) for (const name of ['horizontal-scroll', 'horizontal-scroll-without-padding']) {
  const snippet = JSON.parse(await readFile(new URL(`../../resources/template/fresh-library/${locale}/snippets/default/${name}.json`, import.meta.url)));
  assert.match(snippet.content, /^<section class="overflow-x-auto/);
  assert.match(snippet.content, /<section data-ignore-width class="flex /);
  assert.equal((snippet.content.match(/data-ignore-width/g) ?? []).length, 1);
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, { rehypePlugins: articleHtmlPlugins() }, snippet.content));
  assert.equal((html.match(/data-ignore-width=""/g) ?? []).length, 1);
  }
  assert.equal(DEFAULT_FORMAT_BUNDLE.validator.rules.find(rule => rule.operator === 'dom.responsive-width').parameters.ignoreAttribute, 'data-ignore-width');
  assert.equal(DEFAULT_FORMAT_BUNDLE.formatter.steps.some(step => step.operator === 'render.svg'), false);
});
