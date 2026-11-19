import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryCacheScope,readBrowserCache,writeBrowserCache,clearBrowserCache,browserCacheUsage,BROWSER_CACHE_LIMIT} from '../src/lib/browserCache.ts';
test('optional caches isolate equal-named libraries and kinds, evict least-used entries and can be cleared without storage permission',async()=>{
 await clearBrowserCache();const a=libraryCacheScope({name:'same'}),b=libraryCacheScope({name:'same'});assert.notEqual(a,b);
 await writeBrowserCache('render',a,'one','body');assert.equal(await readBrowserCache('render',b,'one'),null);assert.equal(await readBrowserCache('compile',a,'one'),null);
 for(let i=0;i<512;i++)await writeBrowserCache('render',a,String(i),'value');
 assert.equal(await readBrowserCache('render',a,'one'),null);assert.equal((await browserCacheUsage()).entries,512);
 await readBrowserCache('render',a,'0');await writeBrowserCache('render',a,'last','value');assert.equal(await readBrowserCache('render',a,'0'),'value');assert.equal(await readBrowserCache('render',a,'1'),null);
 class Oversized extends Blob{get size(){return BROWSER_CACHE_LIMIT+1;}}
 await writeBrowserCache('resources',a,'too-large',new Oversized());assert.equal(await readBrowserCache('resources',a,'too-large'),null);
 const previous=globalThis.indexedDB;globalThis.indexedDB={open(){throw new DOMException('quota','QuotaExceededError');}};
 try{await writeBrowserCache('compile',a,'quota','rebuildable');assert.equal(await readBrowserCache('compile',a,'quota'),null,'an unavailable persistent store degrades to rebuilding, without adding a second hidden budget');}finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
 await clearBrowserCache();assert.equal((await browserCacheUsage()).bytes,0);
});
