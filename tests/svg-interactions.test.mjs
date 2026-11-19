import test from 'node:test';
import assert from 'node:assert/strict';
import './rendering-dom-fixture.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { SAFE_REHYPE_SCHEMA, rehypeSafeStyles, sanitizeHtml } from '../src/lib/article-format/sanitize.ts';
import { sanitizePackageHtml } from '../src/lib/article-format/packageRendering.ts';
import { isSafeSvgAnimation, SVG_ANIMATION_TAGS } from '../src/lib/article-format/svgAnimation.ts';
import { buildClipboardPayload } from '../src/lib/article-format/output.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';

async function markdown(html) {
  return renderToStaticMarkup(React.createElement(ReactMarkdown,{remarkRehypeOptions:{allowDangerousHtml:true},rehypePlugins:[rehypeRaw,[rehypeSanitize,SAFE_REHYPE_SCHEMA],rehypeSafeStyles]},html));
}
const pack = {renderer:{declaration:{permissions:{images:[],styles:[],fonts:[]}}}};
const example = '<svg viewBox="0 0 320 120" pointer-events="none"><g pointer-events="all" visibility="visible"><rect width="320" height="120"/><set attributeName="visibility" to="hidden" begin="click" fill="freeze"/></g><path pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"><animate attributeName="stroke-dashoffset" from="100" to="0" begin="click" dur="1s" restart="always" fill="freeze"/></path></svg>';

test('Markdown and both safety floors retain declarative hits, gates and replay geometry', async () => {
  for (const html of [await markdown(example),sanitizeHtml(example),sanitizePackageHtml(example,pack)]) {
    const t=document.createElement('template');t.innerHTML=html;
    assert.equal(t.content.querySelector('set')?.getAttribute('to'),'hidden');
    assert.equal(t.content.querySelector('g')?.getAttribute('pointer-events'),'all');
    assert.equal(t.content.querySelector('animate')?.getAttribute('restart'),'always');
    assert.equal(t.content.querySelector('path')?.getAttribute('pathLength'),'100');
    assert.equal(t.content.querySelector('path')?.getAttribute('stroke-dasharray'),'100');
  }
  assert.ok(SVG_ANIMATION_TAGS.includes('animateTransform'),'purifier configuration must not lowercase the shared Markdown policy');
});

test('animation cannot target executable or arbitrary attributes or smuggle URL paints', async () => {
  for (const [tag,name,to] of [['set','href','javascript:alert(1)'],['set','style','display:none'],['set','opacity','2'],['animate','fill','url(https://bad.example/a)'],['animate','onclick','alert(1)'],['animateTransform','transform','url(javascript:x)']]) {
    assert.equal(isSafeSvgAnimation(tag,{attributeName:name,to,type:'translate'}),false);
    const input=`<svg><${tag} attributeName="${name}" to="${to}" type="translate" begin="click"/></svg>`;
    for (const html of [await markdown(input),sanitizeHtml(input)]) {
      const t=document.createElement('template');t.innerHTML=html;assert.equal(t.content.querySelectorAll('set,animate,animateTransform').length,0);
    }
  }
});

test('opacity sets and timed transform sequences remain data while HTML lookalikes are removed', async () => {
  const input='<svg><g opacity="0"><set attributeName="opacity" to="1" begin="click+0.2s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="0 0;40 0" begin="click" dur=".5s"/></g></svg>';
  const html=await markdown(input);assert.match(html,/<set /);assert.match(html,/<animateTransform /);
  assert.doesNotMatch(await markdown('<set attributeName="visibility" to="hidden"/>'),/<set/);
});

test('copy keeps animation base states instead of freezing sampled computed visibility and dimensions', () => {
  const root=document.createElement('article');root.innerHTML='<svg height="56"><g visibility="visible"><rect width="100" height="56"/><set attributeName="visibility" to="hidden" begin="click" fill="freeze"/></g><animate attributeName="height" values="56;200" begin="click" dur=".5s"/></svg>';
  const actual=window.getComputedStyle;
  window.getComputedStyle=node=>{const style=actual.call(window,node);return new Proxy(style,{get(target,key){if(key==='getPropertyValue')return name=>name==='visibility'?'hidden':name==='height'?'200px':target.getPropertyValue(name);const value=target[key];return typeof value==='function'?value.bind(target):value;}});};
  try {
    const result=buildClipboardPayload(root,getFormatSnapshot()),t=document.createElement('template');t.innerHTML=result.html;
    assert.equal(t.content.querySelector('g').getAttribute('visibility'),'visible');
    assert.equal(t.content.querySelector('g').style.visibility,'');
    assert.equal(t.content.querySelector('svg').getAttribute('height'),'56');
    assert.equal(t.content.querySelector('svg').style.height,'');
    assert.equal(t.content.querySelectorAll('set,animate').length,2);
  } finally {window.getComputedStyle=actual;}
});
