import test from 'node:test';
import assert from 'node:assert/strict';
import {runImportBatch} from '../../src/lib/imports/batch.ts';
import {chooseMarkdownImports,droppedMarkdownImports,sameImportChoice,shareImportDirectory} from '../../src/lib/imports/source.ts';
import {tree,snapshot,allCounts} from '../knowledge/fs-fixture.mjs';

function batch(overrides={}){
  const created=[],failed=[],skipped=[],progress=[];
  return {created,failed,skipped,progress,options:{current:()=>true,cancelled:()=>false,start(){},create:async item=>item,created:async(item,result)=>created.push(result),failed:(item,error)=>failed.push(item),skipped:item=>skipped.push(item),fatal:()=>false,progress:summary=>progress.push(summary),...overrides}};
}
test('per-file failure retains successes and continues, while shared failures stop only the remaining items',async()=>{
  const f=batch({create:async item=>{if(item===2)throw Error('bad file');return item;}});
  const summary=await runImportBatch([1,2,3],f.options);
  assert.deepEqual(f.created,[1,3]);assert.deepEqual(f.failed,[2]);assert.equal(summary.created,2);assert.equal(summary.failed,1);
  const g=batch({...f.options,fatal:()=>true});await runImportBatch([1,2,3],{...g.options,created:async item=>g.created.push(item),skipped:item=>g.skipped.push(item)});
  assert.deepEqual(g.created,[1]);assert.deepEqual(g.skipped,[3]);
});
test('cancel or a changed target finishes the current atomic create and never starts the remainder',async()=>{
  for(const reason of ['cancel','context']){
    let stop=false;const f=batch({current:()=>reason!=='context'||!stop,cancelled:()=>reason==='cancel'&&stop,create:async item=>{stop=true;return item;}});
    const result=await runImportBatch([1,2,3],f.options);
    assert.deepEqual(f.created,[1]);assert.deepEqual(f.skipped,[2,3]);assert.equal(result.stopped,true);
  }
});
test('post-save notification failures cannot turn a saved article into a failed create',async()=>{
  const f=batch({created:()=>{throw Error('notification');}});
  await assert.rejects(runImportBatch([1,2],f.options),/notification/);
  assert.equal(f.failed.length,0);
});

const grant=async file=>{file.queryPermission=async()=> 'granted';return file;};
test('native multiselect isolates invalid files, keeps order, identifies handles and shares only a containing read-only directory',async()=>{
  const root=tree('source',{'a.md':'# Same\n![asset](pic.png)','b.md':'# Same\n![asset](pic.png)','bad.md':'---\ntitle: [broken\n---\nbody','pic.png':'image'});
  const outside=tree('outside',{'a.md':'# Same\n![asset](pic.png)'});
  const files=await Promise.all(['a.md','bad.md','b.md'].map(async name=>grant(await root.getFileHandle(name))));
  const foreign=await grant(await outside.getFileHandle('a.md'));
  const before=snapshot(root),oldWindow=globalThis.window;let options;
  globalThis.window={showOpenFilePicker:async value=>{options=value;return [...files,foreign];},showDirectoryPicker:async()=>root};
  try{
    const choices=await chooseMarkdownImports(()=>true);
    assert.equal(options.multiple,true);assert.deepEqual(choices.map(item=>item.name),['a.md','bad.md','b.md','a.md']);
    assert.ok(choices[1].error);assert.equal(choices[2].source.localResources,1);
    assert.equal(await sameImportChoice(choices[0],choices[3]),false,'same names and bytes are not the same file');
    assert.equal(await sameImportChoice(choices[0],choices[0]),true);
    const chosen=await choices[0].source.chooseDirectory();
    const shared=await shareImportDirectory(chosen,[choices[2].source,choices[3].source]);
    assert.equal(shared.get(choices[2].source).directoryName,'source');assert.equal(shared.has(choices[3].source),false);
    assert.equal(snapshot(root),before);assert.equal(allCounts(root).writes,0);assert.ok(allCounts(root).permission.every(([,mode])=>mode==='read'));
    globalThis.window.showOpenFilePicker=async()=>{throw new DOMException('cancel','AbortError');};
    assert.equal(await chooseMarkdownImports(()=>true),null);
  }finally{globalThis.window=oldWindow;}
});

test('drop captures all native handles before awaiting and shares picker validation and read-only boundaries',async()=>{
 const root=tree('drop-source',{'first.md':'# First\n![one](pic.png)\n![again](pic.png)\n![remote](https://example.test/a.png)','broken.md':'---\ntitle: [broken\n---\nBody'});
 const first=await grant(await root.getFileHandle('first.md')),broken=await grant(await root.getFileHandle('broken.md')),calls=[];
 const item=file=>({kind:'file',getAsFile:()=>({name:file.name}),getAsFileSystemHandle(){calls.push(file.name);return Promise.resolve(file);}});
 const before=snapshot(root),reading=droppedMarkdownImports({items:[item(first),item(broken)]},()=>true);
 assert.deepEqual(calls,['first.md','broken.md'],'both handles are captured synchronously in the drop activation');
 const choices=await reading;assert.deepEqual(choices.map(x=>x.name),['first.md','broken.md']);assert.equal(choices[0].source.title,'First');
 assert.equal(choices[0].source.attachmentCount,2);assert.equal(choices[0].source.localResources,1);assert.ok(choices[1].error);
 await assert.rejects(choices[0].source.assertTarget(first),/来源目录|source directory/);assert.equal(snapshot(root),before);assert.equal(allCounts(root).writes,0);
 const unsupported=await droppedMarkdownImports({items:[{kind:'file',getAsFile:()=>({name:'no-handle.md'})}]},()=>true);
 assert.equal(unsupported[0].source,null);assert.equal(unsupported[0].error.messageKey,'imports.dropUnsupported');
});
