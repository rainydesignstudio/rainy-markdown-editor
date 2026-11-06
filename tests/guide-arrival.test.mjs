import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';

const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];

test('arrival follows visible workspace geometry, clips text, bounds work and never copies article content', async () => {
  const dom = new JSDOM(`<aside class="sidebar" id="nav"><span class="brand-mark" id="brand"><svg><text>R/</text></svg></span><div id="navclip" style="overflow-x:hidden;overflow-y:hidden"><button id="action">Articles</button><button id="occluded">Clipped navigation</button></div><button id="hidden">Hidden</button></aside><aside class="article-sidebar" id="articles"><p id="article-title">Private article title</p></aside><header class="workspace-toolbar" id="toolbar"><h1 id="heading">Workspace</h1></header><main class="workspace-main" id="content"><p id="clipped">Clipped line</p>${Array.from({length:100},(_,i)=>`<p id="line-${i}">Private paragraph ${i}</p>`).join('')}</main>`);
  const {document,NodeFilter,DOMRect}=dom.window;
  const rects={nav:[0,0,192,800],brand:[16,16,29,29],navclip:[0,60,100,300],action:[10,80,172,36],occluded:[130,80,50,36],hidden:[0,0,0,0],articles:[192,0,232,800],'article-title':[208,100,180,20],toolbar:[424,0,800,72],heading:[448,18,210,36],content:[424,72,800,728],clipped:[410,82,100,20]};
  for(let i=0;i<100;i++)rects[`line-${i}`]=[448,120+i*12,230,20];
  dom.window.Element.prototype.getBoundingClientRect=function(){return new DOMRect(...(rects[this.id]??[0,0,0,0]));};
  document.createRange=()=>{let node;return {selectNodeContents(value){node=value;},getClientRects(){return [node.parentElement.getBoundingClientRect()];}};};
  const source=await readFile(new URL('../src/components/onboarding/GuideArrival.tsx',import.meta.url),'utf8');
  const module={exports:{}},cells=[],effects=[],listeners=new Map();let cursor=0,registered=false,resizeCallback,disconnected=false;
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    module,exports:module.exports,document,NodeFilter,getComputedStyle:dom.window.getComputedStyle,ResizeObserver:class { constructor(fn){resizeCallback=fn;} observe(){} disconnect(){disconnected=true;} },
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    require(id){if(id==='react/jsx-runtime')return {jsx,jsxs};if(id.endsWith('/BrandMark'))return {BrandMark:'brand-mark'};if(id==='react')return {
      useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],next=>{cells[i]=next;}];},
      useLayoutEffect(fn){if(!registered){registered=true;effects.push(fn);}},
    };throw new Error(id);},
  });
  const render=()=>{cursor=0;return module.exports.GuideArrival();};render();const cleanup=effects.shift()();
  let tree=render(),nodes=walk(tree),frames=nodes.filter(node=>node.props['data-region']);
  assert.equal(frames.length,4);
  const nav=frames.find(node=>node.props['data-region']==='navigation');
  assert.equal(nav.props.style.width,192);assert.equal(nav.props.style.height,800);
  assert.equal(walk(nav).filter(node=>node.props['data-skeleton-control']).length,1);
  assert.equal(walk(nav).find(node=>node.props['data-skeleton-control']).props.style.width,90);
  assert.ok(walk(nav).some(node=>node.type==='brand-mark'));
  const content=frames.find(node=>node.props['data-region']==='content');
  const lines=walk(content).filter(node=>node.props['data-skeleton-text']);
  assert.equal(lines.length,40);assert.equal(lines[0].props.style.left,0);assert.equal(lines[0].props.style.width,86);
  assert.doesNotMatch(JSON.stringify(tree),/Private article title|Private paragraph|Clipped line/);
  rects.nav=[0,0,360,56];rects.articles=[0,0,0,0];resizeCallback();
  frames=walk(render()).filter(node=>node.props['data-region']);
  assert.equal(frames.length,3);assert.equal(frames[0].props.style.width,360);assert.equal(frames[0].props.style.height,56);
  cleanup();assert.equal(listeners.size,0);assert.equal(disconnected,true);dom.window.close();
});
