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
