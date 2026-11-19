import test from 'node:test';
import assert from 'node:assert/strict';
import './rendering-dom-fixture.mjs';
import {readRenderedCode,renderedCodeMarkup} from '../src/lib/renderedCode.ts';
import {getFormatSnapshot} from '../src/lib/article-format/runtime.ts';
import {BASIC_THEME} from '../src/lib/themes.ts';
import {packageInputKey,bindPackageInput} from '../src/lib/article-format/packageRendering.ts';
const base=getFormatSnapshot();
const input=(source='hello',snapshot=base,css='')=>({parsed:{body:source},article:{theme:BASIC_THEME},snapshot,compiledCss:css});
function legacy(value){const host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'}),target=document.createElement('div'),root=document.createElement('article');root.dataset.articleContentRoot='';root.dataset.previewCodeKey=packageInputKey(value.parsed.body,value.article.theme,value.snapshot);root.innerHTML='<p data-source-line="1" data-role="author-content">hello</p>';target.append(root);shadow.append(target);return {host,target,shadow,root};}

test('code is sourced from the visible shadow document and accepts a successful empty stylesheet',()=>{
 const value=input(),{host,target,shadow}=legacy(value);const style=document.createElement('style');style.dataset.articleStyle='true';style.textContent='p{color:red}';shadow.append(style);
 const result=readRenderedCode(target,null,value,false,true);assert.equal(result.status,'ready');assert.match(result.code,/p\{color:red\}/);assert.match(result.code,/data-role="author-content"/);assert.doesNotMatch(result.code,/data-source-line|data-preview-code-key|data-article-content-root/);
 style.textContent='';assert.equal(readRenderedCode(target,null,value,false,true).status,'ready');assert.doesNotMatch(readRenderedCode(target,null,value,false,true).code,/<style>/);host.remove();
});

test('pending compilation or a different document never labels previous HTML as current',()=>{
 const value=input(),{host,target}=legacy(value);assert.equal(readRenderedCode(target,null,value,false,false).status,'pending');assert.equal(readRenderedCode(target,null,input('another'),false,true).status,'pending');assert.equal(readRenderedCode(target,null,value,false,true,'failed').status,'error');host.remove();
});

test('dark code waits for its matching committed overlay and reads its own CSS',()=>{
 const value=input('hello',base,'p{color:black}'),{host,target}=legacy(value),frame=document.createElement('iframe');document.body.append(frame);
 assert.equal(readRenderedCode(target,null,value,true,true).status,'pending');const mount=frame.contentDocument.createElement('div');mount.dataset.previewCodeKey='old';mount.innerHTML='<article data-article-content-root><p>dark result</p></article>';frame.contentDocument.body.append(mount);
 assert.equal(readRenderedCode(target,frame,value,true,true).status,'pending');mount.dataset.previewCodeKey=packageInputKey(value.parsed.body,BASIC_THEME,base);const style=frame.contentDocument.createElement('style');style.textContent='p{color:white}';frame.contentDocument.head.append(style);
 const result=readRenderedCode(target,frame,value,true,true);assert.equal(result.status,'ready');assert.match(result.code,/color:white/);assert.match(result.code,/dark result/);assert.doesNotMatch(result.code,/color:black/);frame.remove();host.remove();
});

test('package code waits for its real bound source and handles packages without host document markers',()=>{
 const snapshot={...base,renderer:{fingerprint:'fixture'}},value=input('current',snapshot),target=document.createElement('div'),wrapper=document.createElement('div'),mount=document.createElement('div');wrapper.dataset.previewCodeKey=packageInputKey('current',BASIC_THEME,snapshot);mount.innerHTML='<section>package body</section>';wrapper.append(mount);target.append(wrapper);document.body.append(target);
 bindPackageInput(mount,{source:'old',theme:BASIC_THEME,snapshot,css:''});assert.equal(readRenderedCode(target,null,value,false,true).status,'pending');bindPackageInput(mount,{source:'current',theme:BASIC_THEME,snapshot,css:''});const result=readRenderedCode(target,null,value,false,false);assert.equal(result.status,'ready','a committed package does not need the unrelated manual-style revision');assert.match(result.code,/<section>package body<\/section>/);assert.doesNotMatch(result.code,/data-package/);delete mount.dataset.packageInput;assert.equal(readRenderedCode(target,null,value,false,true).status,'pending','a pending replacement invalidates the old binding');target.remove();
});

test('serialization retains declared animation bases and author attributes while restoring authored media paths',()=>{
 const root=document.createElement('article');root.innerHTML='<p data-preview-only>host addition</p><svg data-rainy-interactive="x"><g visibility="visible"><set attributeName="visibility" to="hidden" begin="click" fill="freeze"/></g></svg><img src="blob:test" data-local-asset-src="media/image/a.png" data-asset-state="ready">';
 const result=renderedCodeMarkup(root);assert.match(result,/visibility="visible"/);assert.match(result,/<set/);assert.match(result,/src="media\/image\/a.png"/);assert.doesNotMatch(result,/host addition|blob:test|data-asset-state|data-rainy-interactive/);assert.match(root.innerHTML,/blob:test/);
});
