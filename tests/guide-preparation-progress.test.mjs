import test from 'node:test';
import assert from 'node:assert/strict';
import { guidePreparationPercent } from '../src/lib/entryGuide.ts';
const calculate=(anchor,downloaded,prepared,ready=false)=>guidePreparationPercent({loaded:downloaded*100,total:100},{completedBytes:prepared*100,totalBytes:100,preloadAtStart:anchor},ready);
test('fifty percent joins without rewinding and allocates remaining work one to two',()=>{
 assert.equal(calculate(.5,.5,0),50);assert.equal(calculate(.5,1,0),66);assert.equal(calculate(.5,.5,1),83);
});
test('eighty percent allocates the remaining interval one to five',()=>{
 assert.equal(calculate(.8,.8,0),80);assert.equal(calculate(.8,1,0),83);assert.equal(calculate(.8,.8,1),96);
});
test('completed preload leaves a separate preparation budget including the hold overlap',()=>{
 for(const downloaded of [0,.5,1]){assert.equal(calculate(1,downloaded,0),0);assert.equal(calculate(1,downloaded,.5),50);assert.equal(calculate(1,downloaded,1),99);}
 assert.equal(calculate(1,1,1,true),100);
});
test('parallel real stage increments are monotone and cannot finish before readiness',()=>{
 for(const anchor of [0,.01,.5,.8,.99,1]){
  let last=calculate(anchor,anchor,0);
  for(let i=0;i<=100;i++){
   const next=calculate(anchor,anchor+(1-anchor)*i/100,i/100);assert.ok(next>=last,`${anchor}: ${last} -> ${next}`);assert.ok(next<100);last=next;
  }
  assert.equal(calculate(anchor,1,1,true),100);
 }
});
test('unknown totals remain indeterminate; zero-copy verification still has a real readiness gate',()=>{
 assert.equal(guidePreparationPercent({loaded:1,total:0},{preloadAtStart:.5,totalBytes:100},false),null);
 assert.equal(guidePreparationPercent({loaded:0,total:0},{totalBytes:100,completedBytes:50,preloadAtStart:1},false),50);
 assert.equal(guidePreparationPercent({loaded:0,total:0},{totalBytes:0,localReady:true,preloadAtStart:1},false),99);
 assert.equal(guidePreparationPercent({loaded:0,total:0},{totalBytes:0,localReady:true,preloadAtStart:1},true),100);
});
