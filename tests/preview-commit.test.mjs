import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { commitPreviewMarkup } from '../src/lib/article-format/previewCommit.ts';

function fixture() {
  const doc = new JSDOM('<!doctype html><div id="mount"></div>').window.document;
  Object.defineProperty(doc, 'scrollingElement', { value: doc.documentElement });
  return { doc, mount: doc.getElementById('mount') };
}

test('typing updates text without replacing the preview document, article or unchanged image', () => {
  const { doc, mount } = fixture();
  commitPreviewMarkup(mount, '<article><p id="lead">before</p><img src="blob:local" alt="image"><p>end</p></article>');
  const article = mount.firstChild, image = mount.querySelector('img');
  let sourceWrites = 0;
  const set = image.setAttributeNS.bind(image);
  image.setAttributeNS = (...args) => { if (args[1] === 'src') sourceWrites++; return set(...args); };
  doc.scrollingElement.scrollTop = 400;
  for (let index = 0; index < 40; index++) commitPreviewMarkup(mount, `<article><p id="lead">after ${index}</p><img src="blob:local" alt="image"><p>end</p></article>`);
  assert.equal(mount.ownerDocument, doc);
  assert.equal(mount.firstChild, article);
  assert.equal(mount.querySelector('img'), image);
  assert.equal(sourceWrites, 0);
  assert.equal(doc.scrollingElement.scrollTop, 400);
  assert.equal(mount.querySelector('#lead').textContent, 'after 39');
});

test('insertions preserve existing image nodes while deleted content and stale attributes disappear', () => {
  const { mount } = fixture();
  commitPreviewMarkup(mount, '<article class="old"><p>before</p><img src="a.png"><p>tail</p></article>');
  const image = mount.querySelector('img');
  commitPreviewMarkup(mount, '<article><p>inserted</p><p>before</p><img src="a.png"><p>tail</p></article>');
  assert.equal(mount.querySelector('img'), image);
  assert.equal(mount.firstChild.hasAttribute('class'), false);
  commitPreviewMarkup(mount, '<article><img src="a.png"></article>');
  assert.equal(mount.querySelector('img'), image);
  assert.equal(mount.querySelectorAll('p').length, 0);
});

test('commits preserve the visible source anchor and update namespaced elements', () => {
  const { doc, mount } = fixture();
  commitPreviewMarkup(mount, '<p data-source-line="10">before</p><svg xmlns="http://www.w3.org/2000/svg"><use href="#old"/></svg>');
  const anchor = mount.querySelector('p'), svg = mount.querySelector('svg');
  doc.elementFromPoint = () => anchor;
  anchor.getBoundingClientRect = () => ({ top: anchor.textContent === 'after' ? -15 : -25 });
  doc.scrollingElement.scrollTop = 400;
  commitPreviewMarkup(mount, '<p data-source-line="10">after</p><svg xmlns="http://www.w3.org/2000/svg"><use href="#new"/></svg>');
  assert.equal(doc.scrollingElement.scrollTop, 410);
  assert.equal(mount.querySelector('svg'), svg);
  assert.equal(mount.querySelector('use').getAttribute('href'), '#new');
});

test('native radio selection survives unrelated source edits, while authored checked changes take effect', () => {
  const dom = new JSDOM('<div id="target"></div>'), target = dom.window.document.getElementById('target');
  const before = '<input type="radio" id="a" name="tabs" checked><label for="a">A</label><input type="radio" id="b" name="tabs"><label for="b">B</label><p>Before</p>';
  commitPreviewMarkup(target, before);
  const a = target.querySelector('#a'), b = target.querySelector('#b'); b.click();
  commitPreviewMarkup(target, before.replace('Before', 'After'));
  assert.equal(target.querySelector('#b'), b); assert.equal(b.checked, true); assert.equal(a.checked, false);
  commitPreviewMarkup(target, before.replace('id="a" name="tabs" checked', 'id="a" name="tabs"').replace('id="b" name="tabs"', 'id="b" name="tabs" checked'));
  assert.equal(b.checked, true); assert.equal(a.checked, false);
  commitPreviewMarkup(target, before);
  assert.equal(a.checked, true); assert.equal(b.checked, false);
});

test('unchanged SVG timelines survive unrelated edits, while a changed animated graph starts with fresh nodes',()=>{
  const {mount}=fixture();
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><g id="trigger"><rect width="20" height="20"/></g><g visibility="hidden"><set attributeName="visibility" to="visible" begin="trigger.click"/></g></svg>';
  commitPreviewMarkup(mount,'<p>Before</p>'+svg);const original=mount.querySelector('svg'),animation=mount.querySelector('set');
  commitPreviewMarkup(mount,'<p>After</p>'+svg);assert.equal(mount.querySelector('svg'),original);assert.equal(mount.querySelector('set'),animation);
  commitPreviewMarkup(mount,'<p>After</p>'+svg.replace('to="visible"','to="hidden"'));
  assert.notEqual(mount.querySelector('svg'),original);assert.notEqual(mount.querySelector('set'),animation);assert.equal(original.isConnected,false);
});

test('moving a source-line marker does not recreate an unchanged SVG timeline',()=>{
  const {mount}=fixture();const before='<svg xmlns="http://www.w3.org/2000/svg" data-source-line="2"><g data-source-line="2"><set attributeName="visibility" to="hidden" begin="click"/></g></svg>';
  commitPreviewMarkup(mount,before);const svg=mount.querySelector('svg'),animation=mount.querySelector('set');
  commitPreviewMarkup(mount,before.replaceAll('data-source-line="2"','data-source-line="9"'));
  assert.equal(mount.querySelector('svg'),svg);assert.equal(mount.querySelector('set'),animation);assert.equal(svg.getAttribute('data-source-line'),'9');
});

test('inserting text paragraphs before SVG wrappers preserves both independent timelines',()=>{
  const {mount}=fixture();const svg=id=>`<svg xmlns="http://www.w3.org/2000/svg"><g id="${id}"><set attributeName="visibility" to="hidden" begin="click"/></g></svg>`;
  commitPreviewMarkup(mount,'<article><p>First</p><p>'+svg('one')+'</p><p>Second</p><p>'+svg('two')+'</p></article>');
  const [one,two]=mount.querySelectorAll('svg'),[a,b]=mount.querySelectorAll('set');
  commitPreviewMarkup(mount,'<article><p>Outside</p><p>First</p><p>'+svg('one')+'</p><p>Second</p><p>'+svg('two')+'</p></article>');
  assert.equal(mount.querySelectorAll('svg')[0],one);assert.equal(mount.querySelectorAll('svg')[1],two);assert.equal(mount.querySelectorAll('set')[0],a);assert.equal(mount.querySelectorAll('set')[1],b);
});

test('adding the first animated SVG does not replace the article, body or existing image',()=>{
  const {mount}=fixture();const before='<article><div class="article-body"><p><img src="same.png"></p></div></article>';
  commitPreviewMarkup(mount,before);const article=mount.firstChild,body=article.firstChild,image=mount.querySelector('img');
  commitPreviewMarkup(mount,before.replace('</div>','<p><svg xmlns="http://www.w3.org/2000/svg"><g><set attributeName="visibility" to="hidden" begin="click"/></g></svg></p></div>'));
  assert.equal(mount.firstChild,article);assert.equal(article.firstChild,body);assert.equal(mount.querySelector('img'),image);
});
