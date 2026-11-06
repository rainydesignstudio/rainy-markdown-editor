import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUIDE_PROFILES, GUIDE_STORAGE_KEY, guideProfile, guideTemplateSource, profilesFor, readGuideCompletion, rememberGuideCompletion } from '../src/lib/entryGuide.ts';
import { parseArticle } from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';

test('every purpose resolves to distinct declared profiles and compatible base recipes',()=>{
 assert.equal(new Set(GUIDE_PROFILES.map(p=>p.id)).size,6);
 for(const purpose of ['development','commerce','media'])assert.equal(profilesFor(purpose).length,2);
 assert.equal(guideProfile('unknown'),undefined);
 assert.equal(guideProfile('wechat').preset,'wechat-article');
 for(const p of GUIDE_PROFILES.filter(p=>p.id!=='wechat'))assert.equal(p.preset,'empty');
});
test('completion storage accepts its own version and tolerates blocked or damaged storage',()=>{
 for(const data of ['null','{}','{','{"version":2,"completed":true}','{"version":1,"completed":"true"}'])assert.equal(readGuideCompletion({getItem:()=>data}),false);
 assert.equal(readGuideCompletion({getItem:()=>'{"version":1,"completed":true}'}),true);
 assert.equal(readGuideCompletion({getItem(){throw Error('blocked');}}),false);
 const data=new Map();rememberGuideCompletion({setItem:(key,value)=>data.set(key,value)});assert.equal(readGuideCompletion({getItem:key=>data.get(key)}),true);assert(data.has(GUIDE_STORAGE_KEY));
 assert.doesNotThrow(()=>rememberGuideCompletion({setItem(){throw Error('blocked');}}));
});
test('starter source is a valid article, escapes titles, and keeps the actual theme identity',()=>{
 const source=guideTemplateSource('Title: "a"\nnew line',['Context','Details'],BASIC_THEME,'2026-10-29T00:00:00.000Z');
 const result=parseArticle(source);assert.equal(result.canCopy,true);assert.equal(result.metadata.title,'Title: "a"\nnew line');assert.deepEqual(result.metadata.theme,{id:BASIC_THEME.id,version:BASIC_THEME.version});assert.match(result.body,/## Context/);
});
test('all six starters and setup outcomes have both languages',async()=>{
 const read=async lang=>JSON.parse(await readFile(new URL(`../resources/locale/${lang}/onboarding.json`,import.meta.url),'utf8'));
 const zh=await read('zh-CN'),en=await read('en-US');
 const keys=(v,p='')=>Object.entries(v).flatMap(([key,value])=>typeof value==='string'?[p+key]:keys(value,p+key+'.')).sort();
 assert.deepEqual(keys(zh),keys(en));for(const profile of GUIDE_PROFILES){assert(zh.profiles[profile.id].note);assert(en.profiles[profile.id].detail);for(const section of profile.sections)assert(zh.sections[section]&&en.sections[section]);}
});
