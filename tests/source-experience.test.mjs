import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenizeEditorSource } from '../src/lib/editorSourceHighlight.ts';
import { readSourcePreferences, getSourcePreferences, setSourcePreference, SOURCE_PREFERENCES_KEY } from '../src/hooks/useSourcePreferences.ts';

function tones(source) {
  const tokens = tokenizeEditorSource(source, true);
  assert.equal(tokens.map(token => token.text).join(''), source, 'highlighting must preserve every source character');
  return tokens.flatMap(token => [...token.text].flatMap(char => Array(char.length).fill(token.tone)));
}

test('Markdown structure, HTML attributes and inline/block CSS use existing semantic roles', () => {
  const source = '# 中文标题\n\n> 引用\n\n**强调** 与 [链接](https://example.com)\n\n<section class="my-4" style="color: red; padding: 2px">正文</section>\n\n<style>\n.sample { color: blue; }\n</style>';
  const colors = tones(source);
  assert.equal(colors[0], 'syntax'); assert.equal(colors[source.indexOf('中文')], 'heading');
  assert.equal(colors[source.indexOf('引用')], 'quote'); assert.equal(colors[source.indexOf('**')], 'syntax');
  assert.equal(colors[source.indexOf('section')], 'syntax'); assert.equal(colors[source.indexOf('class=')], 'syntax');
  assert.equal(colors[source.indexOf('my-4')], undefined); assert.equal(colors[source.indexOf('color:')], 'syntax');
  assert.equal(colors[source.indexOf('red;')], undefined); assert.equal(colors[source.indexOf('.sample')], 'syntax');
});

test('fences, inline code, code/pre content and comments are not recursively highlighted', () => {
  for (const source of ['````html\n# 文字\n<div>x</div>\n```\n````', '`**text**`', '<pre>\n# text\n<b>x</b>\n</pre>', '<code>**text**</code>', '<!--\n# text\n<div>\n-->']) {
    const colors = tones(source);
    const start = source.indexOf('#') >= 0 ? source.indexOf('#') : source.indexOf('**');
    if (start >= 0) assert.equal(colors[start], undefined, source);
  }
});

test('unfinished markup, quoted greater-than, CRLF, empty source and Unicode remain editable text', () => {
  for (const source of ['', '<section title="a > b" style="color: red">😀\r\n未闭合', '<div class="', '**unfinished', 'e\u0301 你好\t\n\n']) tones(source);
});

test('a long mixed document retains exact offsets and only known tone roles', () => {
  const source = ('## 标题\n\n<section style="color: red">正文 😀</section>\n\n').repeat(1000);
  const tokens = tokenizeEditorSource(source, true);
  assert.equal(tokens.map(token => token.text).join(''), source);
  assert.ok(tokens.every(token => token.tone === undefined || ['syntax', 'heading', 'quote'].includes(token.tone)));
});

test('source preferences default on, validate stored fields and preserve a session choice when storage is denied', () => {
  for (const raw of [null, 'bad json', 'null']) assert.deepEqual(readSourcePreferences({ getItem: () => raw }), { wrap: true, highlight: true });
  assert.deepEqual(readSourcePreferences({ getItem: () => '{"wrap":false,"highlight":false}' }), { wrap: false, highlight: false });
  assert.deepEqual(readSourcePreferences({ getItem: () => '{"wrap":"false","highlight":false}' }), { wrap: true, highlight: false });
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  setSourcePreference('wrap', false); assert.equal(JSON.parse(values.get(SOURCE_PREFERENCES_KEY)).wrap, false);
  setSourcePreference('highlight', false); assert.deepEqual(getSourcePreferences(), { wrap: false, highlight: false });
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  setSourcePreference('wrap', true); assert.deepEqual(getSourcePreferences(), { wrap: true, highlight: false });
  delete globalThis.window;
});
