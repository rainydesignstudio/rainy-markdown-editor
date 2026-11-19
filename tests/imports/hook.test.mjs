import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {runImportBatch} from '../../src/lib/imports/batch.ts';
import * as product from '../../src/lib/i18n/productMessages.ts';
import {BASIC_THEME} from '../../src/lib/themes.ts';

const source=await readFile(new URL('../../src/hooks/imports/useMarkdownImport.ts',import.meta.url),'utf8');
const choice=id=>({id,name:id+'.md',source:{origin:{name:id+'.md'},remember:async()=>{}}});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(){
 const dom=new JSDOM('<div id="test"></div>'),prior={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const calls=[],scope={},saved=new Map();let selected=[choice('one')],create=async(_root,source)=>{
  const id=source.origin.name,article={id};saved.set(id,article);return {result:{article},taskSaved:true,task:{id,createdAt:'2026-11-17',state:'complete',target:{articleId:id,month:'2026-11',folder:id},resources:[],diagnostics:[]}};
 };
 const bridge={root:scope,session:1,isCurrent:(root,session)=>bridge.root===root&&bridge.session===session,protect:action=>{calls.push('protect');void action.run();},queue:{run:action=>action()},onImported:article=>calls.push(['imported',article.id]),onCreated:async article=>{calls.push(['opened',article.id]);return true;},setStatus:status=>calls.push(['status',status]),canWriteArticle:()=>true,onResource(){},onTaskFinished(){}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,crypto,structuredClone,AbortController,DOMException,require:id=>{
  if(id==='react')return React;
  if(id.endsWith('/productMessages'))return product;
  if(id.endsWith('/imports/batch'))return {runImportBatch};
  if(id.endsWith('/imports/source'))return {chooseMarkdownImports:async()=>selected,droppedMarkdownImports:async()=>selected,sameImportChoice:async(a,b)=>a.id===b.id};
  if(id.endsWith('/imports/create'))return {createMarkdownImport:(...args)=>{calls.push(['create',args[1].origin.name]);return create(...args);}};
  if(id.endsWith('/imports/store'))return {loadImportTaskRecords:async()=>({tasks:[],issues:[]}),importRecordGuard:()=>({}),createImportTaskRecord:async(_root,task)=>calls.push(['save-task',task.id])};
  if(id.endsWith('/resources/state'))return {beginResourceSession(){},publishResourceTasks(){}};
  if(id.endsWith('/article-format/runtime'))return {getFormatSnapshot:()=>({id:'format'})};
  if(id.endsWith('/fileSystem'))return {readStoredArticleById:async(_root,_month,folder)=>saved.get(folder)};
  return {};
 }});
 let result;const root=createRoot(document.getElementById('test'));
 function Probe(){result=module.exports.useMarkdownImport(bridge);return null;}
 const render=async()=>{await act(async()=>root.render(React.createElement(Probe)));};await render();
 return {calls,bridge,get hook(){return result;},select:items=>{selected=items;},setCreate:fn=>{create=fn;},render,async close(){await act(async()=>root.unmount());Object.assign(globalThis,prior);dom.window.close();}};
}
test('selection closes without writes; confirmed imports stay in the list until an explicitly protected open',async()=>{
 const f=await fixture();try{
  await act(async()=>f.hook.open());await act(async()=>f.hook.chooseFile());await act(async()=>f.hook.close());
  assert.equal(f.calls.some(item=>item[0]==='create'),false);assert.equal(f.hook.request,null);
  await act(async()=>f.hook.open());await act(async()=>f.hook.chooseFile());await act(async()=>f.hook.confirm(BASIC_THEME));
  assert.deepEqual(f.calls.filter(item=>item[0]==='imported'),[['imported','one.md']]);assert.equal(f.calls.some(item=>item[0]==='opened'),false);assert.equal(f.hook.isOpen,true);
  await act(async()=>f.hook.openTask('one.md'));assert.ok(f.calls.includes('protect'));assert.deepEqual(f.calls.find(item=>item[0]==='opened'),['opened','one.md']);
 }finally{await f.close();}
});
test('a malformed selection does not block valid files and closing a running batch only hides it',async()=>{
 const f=await fixture(),wait=deferred();try{
  const one=choice('one');f.select([one,{id:'bad',name:'bad.md',source:null,error:{message:'invalid'}}]);
  f.setCreate(async()=>{await wait.promise;return {result:{article:{id:'saved'}},taskSaved:true,task:{id:'task',createdAt:'2026',state:'complete',target:{articleId:'saved'},resources:[],diagnostics:[]}};});
  await act(async()=>f.hook.open());await act(async()=>f.hook.chooseFile());let work;
  await act(async()=>{work=f.hook.confirm(BASIC_THEME);});await act(async()=>f.hook.close());assert.equal(f.hook.isOpen,false);
  await act(async()=>{wait.resolve();await work;});assert.equal(f.hook.pending.length,1);assert.equal(f.hook.request.choices[0].name,'bad.md');
  await act(async()=>f.hook.openTasks());assert.equal(f.hook.isOpen,true);assert.equal(f.calls.filter(item=>item[0]==='create').length,1);
 }finally{await f.close();}
});
test('changing libraries rejects a late create notification and stops the rest of the fixed selection',async()=>{
 const f=await fixture(),wait=deferred();try{
  f.select([choice('one'),choice('two')]);f.setCreate(async()=>{await wait.promise;return {result:{article:{id:'late'}},taskSaved:true,task:{id:'task',target:{},state:'complete',resources:[],diagnostics:[]}};});
  await act(async()=>f.hook.open());await act(async()=>f.hook.chooseFile());let work;await act(async()=>{work=f.hook.confirm(BASIC_THEME);});
  f.bridge.root={};f.bridge.session=2;await f.render();await act(async()=>{wait.resolve();await work;});
  assert.equal(f.hook.pending.length,0);assert.equal(f.calls.some(item=>item[0]==='imported'),false);assert.equal(f.calls.filter(item=>item[0]==='create').length,1);
 }finally{await f.close();}
});

test('picker and drop share a selection and task context without view modes or duplicate article creation',async()=>{
 const f=await fixture();try{
  await act(async()=>f.hook.open());await act(async()=>f.hook.dropFiles({items:[]}));assert.equal(f.hook.request.choices.length,1);
  await act(async()=>f.hook.chooseFile());assert.equal(f.hook.request.choices.length,1,'same dropped and picked file remains one choice');
  const choiceId=f.hook.request.choices[0].id;await act(async()=>f.hook.confirm(BASIC_THEME));assert.equal(f.hook.pending[0].choiceId,choiceId);
  assert.equal(f.calls.filter(x=>x[0]==='create').length,1);await act(async()=>f.hook.openTasks('one.md'));assert.equal(f.hook.selectedTaskId,'one.md');
 }finally{await f.close();}
});
test('saving a missing task record does not require reopening the original source or rewrite its saved article',async()=>{
 const f=await fixture();try{
  await act(async()=>f.hook.open());await act(async()=>f.hook.chooseFile());await act(async()=>f.hook.confirm(BASIC_THEME));
  const old=f.hook.pending[0],recordIssue={message:'record write failed'};await act(async()=>f.hook.setPending([{...old,source:null,taskSaved:false,recordIssue,issues:[recordIssue,product.productErrorMessage(new product.ProductError('imports.taskNotSaved'))]}]));
  await act(async()=>f.hook.retryTask(old.task.id));assert.equal(f.hook.pending[0].taskSaved,true);assert.equal(f.hook.pending[0].issues.length,0);
  assert.equal(f.calls.filter(x=>x[0]==='save-task').length,1);assert.equal(f.calls.filter(x=>x[0]==='create').length,1);
 }finally{await f.close();}
});
