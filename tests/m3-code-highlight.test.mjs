import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeAlignSanitizedFragmentLinks } from '../src/lib/articleTableOfContents.ts';
import { rehypeArticleCodeHighlight, rehypeArticleCodeWhitespace } from '../src/lib/articleCodeHighlight.ts';
import { clipboardPlainText, rehypeSafeStyles, SAFE_REHYPE_SCHEMA } from '../src/lib/render.ts';
import { BASIC_THEME, RAINY_THEME, themePreviewCss, themeToCss } from '../src/lib/themes.ts';
import { getDefaultContentLibrary } from '../src/lib/contentLibraries.ts';
import { prepareSnippetInsertion } from '../src/lib/snippetComposer.ts';
import { getBuiltinArticleThemes } from '../src/themes/article-themes/index.ts';
import { articleMarkdownPlugins, articleHtmlPlugins } from '../src/lib/article-format/pipeline.ts';
import { validateArticleAuthoringMarkdown } from '../src/lib/articleAuthoringFormat.ts';
import { articleFormatBlocks } from '../src/lib/articleFormat.ts';

function findElements(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findElements(child, predicate, matches);
  return matches;
}

function textContent(node) {
  return node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(textContent).join('');
}

function authoredCodeText(node) {
  if (node.tagName === 'br') return '\n';
  if (node.properties?.['data-code-tab']) return '\t';
  return node.type === 'text' ? (node.value ?? '').replace(/\u00a0/g, ' ') : (node.children ?? []).map(authoredCodeText).join('');
}

function asDom(node, parentElement = null) {
  if (node.type === 'text') return { nodeType: 3, textContent: node.value, childNodes: [], parentElement };
  const element = { nodeType: 1, tagName: node.tagName?.toUpperCase(), parentElement, childNodes: [], hasAttribute: name => Boolean(node.properties?.[name]), getAttribute: name => node.properties?.[name] ?? null };
  element.childNodes = (node.children ?? []).map(child => asDom(child, element));
  return element;
}

function fence(language, source) {
  return `\`\`\`${language}\n${source}\`\`\``;
}

test('highlights TypeScript, SQL, JSON, and HTML code while preserving exact code text and whitespace', async () => {
  const samples = [
    { language: 'ts', value: 'const answer: number = 42;  \n\treturn answer;\n', token: 'hljs-keyword' },
    { language: 'sql', value: 'SELECT name FROM authors WHERE id = 7;\n', token: 'hljs-keyword' },
    { language: 'json', value: '{\n  "enabled": true,\n  "count": 2\n}\n', token: 'hljs-attr' },
    { language: 'html', value: '<script>alert("still text")</script>\n', token: 'hljs-tag' },
    { language: '', value: 'plain\t  text  \n', token: null },
    { language: 'm3-language-that-does-not-exist', value: 'unknown\t  text  \n', token: null },
  ];
  const source = [
    ...samples.map((sample) => fence(sample.language, sample.value)),
    '<script>window.__highlightTestShouldNotRun = true</script>',
  ].join('\n\n');
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeAlignSanitizedFragmentLinks)
    .use(rehypeSanitize, SAFE_REHYPE_SCHEMA)
    .use(rehypeArticleCodeHighlight)
    .use(rehypeArticleCodeWhitespace)
    .use(rehypeSafeStyles);
  const tree = await processor.run(processor.parse(source));
  const codeBlocks = findElements(tree, (node) => node.type === 'element' && node.tagName === 'pre')
    .map((pre) => findElements(pre, (node) => node.type === 'element' && node.tagName === 'code')[0]);

  assert.equal(codeBlocks.length, samples.length);
  for (const [index, sample] of samples.entries()) {
    const code = codeBlocks[index];
    assert.equal(authoredCodeText(code), sample.value);
    assert.equal(clipboardPlainText(asDom(code, { tagName: 'PRE' })), sample.value, 'clipboard plain text keeps the original code whitespace');
    assert.equal(findElements(code, node => node.tagName === 'br').length, (sample.value.match(/\n/g) ?? []).length);
    const tokenClasses = findElements(code, (node) => node.type === 'element' && node.tagName === 'span')
      .flatMap((span) => span.properties.className ?? []);
    if (sample.token) assert.ok(tokenClasses.includes(sample.token), `${sample.language} should contain ${sample.token}`);
    else assert.deepEqual(tokenClasses, [], `${sample.language || 'plain'} should remain unhighlighted text`);
  }
  assert.deepEqual(findElements(tree, (node) => node.type === 'element' && node.tagName === 'script'), []);
  assert.ok(authoredCodeText(codeBlocks[3]).includes('<script>alert("still text")</script>'));
  assert.ok(textContent(codeBlocks[0]).includes('\u00a0'), 'visual code spacing survives nowrap');
});

test('Basic and Rainy expose scoped code-token CSS for article, history, and theme previews', () => {
  for (const theme of [BASIC_THEME, RAINY_THEME]) {
    const css = themeToCss(theme);
    const scoped = themePreviewCss(theme, `m3-${theme.id}`);
    assert.match(css, /\.article-preview \.article-body pre \.hljs-keyword/);
    assert.match(css, /\.article-preview \.article-body pre \.hljs-string/);
    assert.match(css, /color-mix\(in oklch/);
    assert.match(scoped, new RegExp(`\\.theme-preview-instance-m3-${theme.id} \\.article-preview \\.article-body pre \\.hljs-keyword`));
    assert.match(scoped, /color-mix\(in oklch/);
  }
  assert.notEqual(BASIC_THEME.tokens['color-article-link'], RAINY_THEME.tokens['color-article-link']);
});

test('mac-style snippets keep SVG decoration outside editable HTML code and preserve clipboard whitespace', async () => {
  for (const locale of ['zh-CN', 'en-US']) {
    for (const id of ['mac-style-code-block', 'mac-style-code-block-nowrap']) {
      const defaults = getDefaultContentLibrary(locale);
      const snippet = defaults.snippets.find(item => item.id === id);
      if (id === 'mac-style-code-block') assert.equal(snippet.name, locale === 'zh-CN' ? 'MacOS 主题代码块' : 'macOS-style code block');
      assert.equal(snippet.trigger, '//' + id);
      assert.equal(snippet.categoryId, 'default');
      assert.doesNotMatch(snippet.content, /class="[^"]*mac-style-code-block/);
      const insertion = prepareSnippetInsertion(snippet.content);
      assert.equal(insertion.text.includes('▌'), false);
      assert.ok(insertion.text.slice(insertion.caretOffset).startsWith('function'));
      const original = 'const fragment = "<script>still text</script>";  \n\tconsole.log(fragment);\n';
      const encoded = original.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const source = insertion.text.replace(/(<code\b[^>]*>)[\s\S]*?<\/code>/, (_, opening) => {
        const tagged = opening.includes('class="') ? opening.replace('class="', 'class="language-typescript ') : opening.replace('<code', '<code class="language-typescript"');
        return tagged + encoded + '</code>';
      }) + '\n\n' + fence('', 'ordinary code\n');
      const processor = unified().use(remarkParse).use(articleMarkdownPlugins())
        .use(remarkRehype, { allowDangerousHtml: true }).use(articleHtmlPlugins());
      const tree = await processor.run(processor.parse(source), { value: source });
      const window = tree.children.find(node => node.tagName === 'section');
      assert.ok(window);
      assert.equal(findElements(window, node => node.tagName === 'svg').length, 1);
      assert.equal(findElements(window, node => node.tagName === 'circle').length, 3);
      const pre = window.children.find(node => node.tagName === 'pre');
      const code = pre.children.find(node => node.tagName === 'code');
      assert.equal(findElements(pre, node => node.tagName === 'svg').length, 0);
      assert.equal(authoredCodeText(code), original);
      assert.equal(clipboardPlainText(asDom(code, { tagName: 'PRE' })), original);
      assert.ok(findElements(code, node => node.properties?.className?.includes('hljs-keyword')).length);
      assert.equal(findElements(tree, node => node.tagName === 'script').length, 0);
      assert.equal(tree.children.filter(node => node.tagName === 'pre').length, 1, 'ordinary fences remain outside the optional window');
    }
  }
});

test('mac-style snippet validates in every built-in theme without theme-specific registration', async () => {
  for (const locale of ['zh-CN', 'en-US']) {
    const snippet = getDefaultContentLibrary(locale).snippets.find(item => item.id === 'mac-style-code-block');
    for (const theme of getBuiltinArticleThemes(locale)) {
      assert.equal(Object.keys(theme.tokens).length, 11);
      assert.doesNotMatch(theme.css, /\.mac-style-code-block/);
      const issues = await validateArticleAuthoringMarkdown(prepareSnippetInsertion(snippet.content).text, 'Mac code', undefined, theme);
      assert.deepEqual(issues.filter(issue => articleFormatBlocks(issue.tier) || issue.tier === 'unknown'), [], `${locale}/${theme.id}`);
    }
  }
});
