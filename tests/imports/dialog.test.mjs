import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {jsx,jsxs} from 'react/jsx-runtime';
import {withUILocaleImports} from '../ui-locale-fixture.mjs';
import {BASIC_THEME} from '../../src/lib/themes.ts';
import {sanitizeFolderName} from '../../src/lib/fileSystem.ts';
import * as product from '../../src/lib/i18n/productMessages.ts';
import {importPresentation} from '../../src/lib/imports/presentation.ts';
const source=await readFile(new URL('../../src/components/imports/MarkdownImportDialog.tsx',import.meta.url),'utf8');
const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):typeof node==='string'?node:'';
function fixture(){
 const calls=[],cells=[];let cursor=0;
 const alternate={...BASIC_THEME,id:'alternate',name:'Alternate',version:'3.0.0'};
 const props={choices:[],themes:[BASIC_THEME,alternate],defaultTheme:alternate,existingFolders:[],busy:false,phase:null,jobs:[],selectedId:null,taskBusy:false,issues:[],onChooseFile:async()=>calls.push('file'),onDropFiles:async transfer=>calls.push(transfer),onChooseDirectory:async id=>calls.push(id),onRemove:id=>calls.push(id),onThemeChange:id=>{props.themeId=id;},onConfirm:async theme=>calls.push(theme.id),onClose:()=>calls.push('close'),onCancelBatch:()=>calls.push('cancel'),onSelectTask:id=>{props.selectedId=id;},onOpenTask:id=>calls.push(id),onRetry:id=>calls.push(id)};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,document:{getElementById:()=>null},require:withUILocaleImports(id=>{
  if(id==='react')return {useRef:value=>{const i=cursor++;return cells[i]??={current:value};},useState:value=>{const i=cursor++;if(!(i in cells))cells[i]=value;return [cells[i],next=>{cells[i]=next;}];},useLayoutEffect(){}};
  if(id==='react/jsx-runtime')return {jsx,jsxs};
  if(id.endsWith('/fileSystem'))return {sanitizeFolderName};
  if(id.endsWith('/imports/presentation'))return {importPresentation};
  if(id.endsWith('/ImportUploadStatus'))return {ImportUploadStatus:'upload-status'};
  if(id.endsWith('/ButtonBar'))return {ButtonBar:'button-bar'};
  if(id.endsWith('/DialogFrame'))return {DialogFrame:'frame',DialogHeader:'header',DialogFooter:'footer',DialogActions:'actions',DialogButton:'button'};
  throw Error(id);
 })});
 const render=()=>{cursor=0;return walk(module.exports.MarkdownImportDialog(props));};
 const button=label=>render().find(node=>node.type==='button'&&text(node)===label);
 const choice=(id='one')=>({id,name:id+'.md',state:'ready',source:{origin:{name:id+'.md',size:100},title:'Original title',directoryName:null,localResources:1,attachmentCount:2,chooseDirectory(){}}});
 return {calls,props,render,button,choice};
}
const job=(state='complete',states=[])=>({source:null,taskSaved:true,task:{id:'task',createdAt:'2026-11-18',state,target:{folder:'Example'},source:{name:'example.md'},resources:states.map((state,i)=>({id:String(i),source:'picture-'+i+'.png',state})),diagnostics:[]}});

test('one drop area and persistent footer replace target text, tabs and details',async()=>{
 const f=fixture(),nodes=f.render();assert.equal(nodes.some(n=>n.props.role==='tab'),false);
 assert.equal(nodes.some(n=>text(n).includes('保存到')),false);
 await f.button('拖拽或点击此处开始上传，可选多个文件').props.onClick();assert.deepEqual(f.calls,['file']);
 assert.equal(f.button('导入 0 篇').props.disabled,true);await f.button('取消操作').props.onClick();assert.deepEqual(f.calls.slice(-2),['cancel','close']);
 assert.equal(f.button('详情'),undefined);assert.equal(f.button('导入记录'),undefined);
});
test('queued cards keep article names and attachment counts, with causes only inside status popups',async()=>{
 const f=fixture();f.props.choices=[f.choice(),{id:'bad',name:'broken.md',source:null,state:'failed',error:product.productMessage('imports.invalidMarkdown')}];
 const nodes=f.render();assert.ok(nodes.some(n=>text(n)==='Original title'));assert.ok(nodes.some(n=>text(n)==='2个附件'));
 assert.equal(nodes.some(n=>text(n)==='one.md'),false);assert.equal(f.button('打开文章').props.disabled,true);
 assert.equal(f.render().find(n=>n.type==='select-field').props.value,'alternate');assert.equal(f.button('导入 1 篇').props.disabled,false);
 const status=f.render().filter(n=>n.type==='upload-status');assert.equal(status[0].props.state,'waiting');assert.equal(status[1].props.state,'waiting');
 assert.equal(nodes.some(n=>text(n).includes('Front Matter')),false);
 status[1].props.onToggle();assert.ok(f.render().some(n=>text(n).includes('Front Matter')));assert.ok(f.button('重新选择文件'));
 f.props.selectedId='one';await f.button('选择来源目录（只读）').props.onClick();assert.equal(f.calls.at(-1),'one');
});
test('real work drives ring state and numeric resource progress; native chooser waiting never does',()=>{
 const f=fixture();f.props.choices=[{...f.choice(),state:'creating'}];f.props.busy=true;f.props.phase='creating';
 assert.equal(f.render().find(n=>n.type==='upload-status').props.state,'uploading');
 f.props.choices=[f.choice()];f.props.phase='choosing';assert.equal(f.render().find(n=>n.type==='upload-status').props.state,'waiting');
 f.props.choices=[];f.props.jobs=[{...job('running',['complete','running']),source:{}}];f.props.jobs[0].task.resources[1].totalBytes=100;f.props.jobs[0].task.resources[1].receivedBytes=50;
 const status=f.render().find(n=>n.type==='upload-status');assert.equal(status.props.state,'uploading');assert.equal(status.props.progress,.75);
 delete f.props.jobs[0].task.resources[1].totalBytes;
 assert.equal(f.render().find(n=>n.type==='upload-status').props.progress,null,'bytes received without a known total stay indeterminate');
});
test('completed cards offer only status and open, with no duplicate inline state or resource details',()=>{
 const f=fixture();f.props.jobs=[job('complete',['complete'])];const nodes=f.render();
 assert.equal(nodes.find(n=>n.type==='upload-status').props.state,'uploaded');assert.equal(nodes.find(n=>n.type==='upload-status').props.hasPopup,false);
 assert.equal(f.button('打开文章').props.disabled,false);assert.ok(nodes.some(n=>text(n)==='1个附件'));
 assert.equal(nodes.some(n=>text(n)==='example.md'||text(n)==='已导入'),false);assert.equal(f.button('详情'),undefined);assert.equal(f.button('补选本地文件'),undefined);
});
test('a card retains its position while moving from the selection into the saved task list',()=>{
 const f=fixture();f.props.choices=[f.choice('one'),f.choice('two')];f.render();f.props.choices=[f.choice('two')];f.props.jobs=[{...job(),choiceId:'one'}];
 assert.deepEqual(f.render().filter(n=>n.type==='li').map(n=>n.props.id),['import-card-task','import-card-two']);
});
test('drop forwards its native payload once and cannot start another picker while a resource action is active',async()=>{
 const f=fixture(),transfer={items:[],types:['Files']};let prevented=0;
 let drop=f.render().find(n=>n.props.onDrop);await drop.props.onDrop({dataTransfer:transfer,preventDefault(){prevented++;},stopPropagation(){}});assert.equal(f.calls[0],transfer);assert.equal(prevented,1);
 f.props.taskBusy=true;drop=f.render().find(n=>n.props.onDrop);assert.equal(drop.props.disabled,true);await drop.props.onDrop({dataTransfer:transfer,preventDefault(){},stopPropagation(){}});assert.equal(f.calls.length,1);
});

test('actual controller document scopes isolate new imports without clearing undo on first save or reloading the same document', async () => {
  const source = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const openDocument = useCallback('), end = source.indexOf('  const persistEditorWorkspace = useCallback(', start);
  const root = {}, context = { articleSourceLocationRef: { current: null }, articleInfoLocationRef: { current: null }, articleDraftKindRef: { current: 'article-info' }, useCallback: fn => fn, documentTokenRef: { current: { root, articleId: 'draft' } }, sourceHistoryKeyRef: { current: 1 }, mutationQueueRef: { current: { openDocument: (root, articleId) => ({ root, articleId }) } } };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.open = openDocument;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.open(root, 'saved', true); assert.equal(context.sourceHistoryKeyRef.current, 1);
  context.open(root, 'saved'); assert.equal(context.sourceHistoryKeyRef.current, 1);
  context.open(root, 'imported'); assert.equal(context.sourceHistoryKeyRef.current, 2);
  context.open(root, 'draft'); context.open(root, 'draft'); assert.equal(context.sourceHistoryKeyRef.current, 4);
  assert.match(source, /openDocument\(root, result\.article\.id, true\)/, 'the first-save path uses the preserving scope');
});


test('status icons expose exactly waiting, real ring progress and uploaded through the shared popup',async()=>{
 const code=await readFile(new URL('../../src/components/imports/ImportUploadStatus.tsx',import.meta.url),'utf8'),module={exports:{}};
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:withUILocaleImports(id=>{
  if(id==='react/jsx-runtime')return {jsx,jsxs};
  if(id.endsWith('/IconPopover'))return {IconPopover:'popover'};
  if(id.endsWith('/TooltipButton'))return {TooltipButton:'tooltip'};
  throw Error(id);
 })});
 const render=(state,progress=null,hasPopup=false)=>walk(module.exports.ImportUploadStatus({id:'x',name:'Article',state,progress,open:false,hasPopup,onToggle(){},onClose(){}}));
 assert.equal(render('waiting').find(n=>n.type==='tooltip').props.tooltip,'待上传');
 assert.equal(render('uploaded').find(n=>n.type==='tooltip').props.tooltip,'已上传');
 const ring=render('uploading',.75).find(n=>n.props.role==='progressbar');assert.equal(ring.props['aria-valuenow'],.75);
 assert.equal(render('uploading').find(n=>n.props.role==='progressbar').props['aria-valuenow'],undefined,'unknown transaction work does not invent a percentage');
 assert.equal(render('waiting',null,true).find(n=>n.type==='popover').props.tooltip,'待上传');
});

test('unknown attachment failures have a localized short explanation and retain the original only as technical information',()=>{
 const f=fixture(),raw='A requested file or directory could not be found';f.props.jobs=[job('paused',['failed'])];f.props.jobs[0].task.resources[0].error={message:raw};f.props.selectedId='task';
 const nodes=f.render();assert.ok(nodes.some(n=>text(n)==='附件尚未导入，可重试或补选文件。'));assert.ok(nodes.some(n=>text(n)==='技术信息'));assert.ok(nodes.some(n=>text(n)===raw));
 f.props.selectedId=null;assert.equal(f.render().some(n=>text(n)===raw),false,'technical messages never become card captions');
});
