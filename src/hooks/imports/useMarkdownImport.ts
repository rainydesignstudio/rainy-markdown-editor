'use client';
import { useEffect, useRef, useState } from 'react';
import { restoreKnowledgeSource } from '../../lib/knowledge/source';
import { chooseMarkdownImport, chooseMarkdownImports, droppedMarkdownImports, sameImportChoice, shareImportDirectory, restoreLocalImportSource, knowledgeImportSource, type MarkdownImportChoice, type ReadonlyImportSource } from '../../lib/imports/source';
import { createMarkdownImport } from '../../lib/imports/create';
import { createArticleMutationQueue } from '../../lib/articleMutationQueue';
import { ProductError, productCause, productErrorMessage, productJoin, productLabel, productReference, productText, type ProductMessageFields } from '../../lib/i18n/productMessages';
import type { StoredArticle, ThemeConfig } from '../../lib/types';
import type { ImportTask, ImportResource } from '../../lib/imports/model';
import {runImportBatch,type ImportBatchSummary} from '../../lib/imports/batch';
import {readStoredArticleById} from '../../lib/fileSystem';
import {getFormatSnapshot} from '../../lib/article-format/runtime';
import { beginResourceSession, publishResourceTasks } from '../../lib/resources/state';
import { runImportResources } from '../../lib/imports/runner';
import { createImportTaskRecord, importRecordGuard, loadImportTaskRecords, saveImportTaskRecord } from '../../lib/imports/store';
import { chooseImportReplacement, unavailableImportSource } from '../../lib/imports/recovery';

export type ImportChoice=MarkdownImportChoice&{state:'ready'|'creating'|'failed'|'skipped'};
type ImportOriginMode='local'|'knowledge';
type Request = { id: number; root: FileSystemDirectoryHandle; session: number; choices:ImportChoice[]; themeId?:string; attempted?:boolean };
export type PendingMarkdownImport = { root: FileSystemDirectoryHandle; session: number; source: ReadonlyImportSource | null; task: ImportTask; taskSaved: boolean; choiceId?:string; recordIssue?:ProductMessageFields|{message:string}; issues?:Array<ProductMessageFields|{message:string}> };
type Bridge = {
  root: FileSystemDirectoryHandle | null; session: number;
  isCurrent: (root: FileSystemDirectoryHandle, session: number) => boolean;
  protect: (action: { label: string; run: () => void | Promise<void> }) => void;
  queue: ReturnType<typeof createArticleMutationQueue>;
  onImported:(stored:StoredArticle,root:FileSystemDirectoryHandle)=>void;
  onCreated: (stored: StoredArticle, root: FileSystemDirectoryHandle) => Promise<boolean>;
  setStatus: (status: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' }) => void;
  canWriteArticle: (root: FileSystemDirectoryHandle, articleId: string) => boolean;
  onResource: (root: FileSystemDirectoryHandle, articleId: string, resource: ImportResource) => void;
  onTaskFinished: (root: FileSystemDirectoryHandle) => void;
};

export function useMarkdownImport(bridge: Bridge) {
  const latest = useRef(bridge); latest.current = bridge;
  const mountedRef=useRef(true);
  const [request, setRequest] = useState<Request | null>(null), requestRef = useRef<Request | null>(null);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), serial = useRef(0);
  const [pending, rawSetPending] = useState<PendingMarkdownImport[]>([]);
  const pendingRef = useRef(pending);
  const setPending=(update:PendingMarkdownImport[]|((items:PendingMarkdownImport[])=>PendingMarkdownImport[]))=>{const next=typeof update==='function'?update(pendingRef.current):update;pendingRef.current=next;rawSetPending(next);};
  const [tasksOpen,setTasksOpen]=useState(false),[selectedTaskId,setSelectedTaskId]=useState<string|null>(null);
  const [phase,setPhase]=useState<'choosing'|'creating'|null>(null),[batchSummary,setBatchSummary]=useState<ImportBatchSummary|null>(null);
  const creatingRef=useRef(false),cancelBatchRef=useRef(false),batchTasksRef=useRef(new Set<string>());
  const [taskBusy, setTaskBusy] = useState(false), taskBusyRef = useRef(false);
  const [taskIssues, setTaskIssues] = useState<Array<ProductMessageFields | { message: string }>>([]);
  const running = useRef<{ id: string; abort: AbortController } | null>(null);
  const replace = (next: Request | null) => { requestRef.current = next; setRequest(next); };
  const alive = (scope: Pick<Request, 'root' | 'session'>) => mountedRef.current&&latest.current.isCurrent(scope.root, scope.session);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;cancelBatchRef.current=true;running.current?.abort.abort(new ProductError('imports.changed'));};},[]);
  useEffect(() => {
    if (requestRef.current && !alive(requestRef.current)) replace(null);
    setPending(items => items.filter(item => alive(item)));
  }, [bridge.root, bridge.session]);
  useEffect(() => {
    setTasksOpen(false); setSelectedTaskId(null); setTaskIssues([]);
    if (!bridge.root) return;
    beginResourceSession(bridge.root, bridge.session);
    const scope = { root: bridge.root, session: bridge.session }; let cancelled = false;
    void loadImportTaskRecords(scope.root, () => !cancelled && alive(scope)).then(result => {
      if (cancelled || !alive(scope)) return;
      setTaskIssues(result.issues);
      publishResourceTasks(scope.root, [...result.tasks, ...pendingRef.current.filter(item => alive(item)).map(item => item.task)]);
      setPending(items => [...items.filter(item => alive(item)), ...result.tasks.filter(task => !items.some(item => alive(item) && item.task.id === task.id)).map(task => ({ ...scope, source: null, task, taskSaved: true }))]);
    }).catch(error => { if (!cancelled && alive(scope)) setTaskIssues([productErrorMessage(error)]); });
    return () => { cancelled = true; };
  }, [bridge.root, bridge.session]);
  useEffect(() => { if (bridge.root) publishResourceTasks(bridge.root, pending.filter(item => alive(item)).map(item => item.task), false); }, [pending, bridge.root, bridge.session]);
  useEffect(() => () => { running.current?.abort.abort(new ProductError('imports.changed')); running.current = null; }, [bridge.root, bridge.session]);
  useEffect(() => {
    if (running.current) return;
    const job = pending.find(item => item.source && item.taskSaved && item.task.state === 'pending' && alive(item));
    if (!job) return;
    const active = { id: job.task.id, abort: new AbortController() }; running.current = active;
    const current = () => alive(job) && latest.current.canWriteArticle(job.root, job.task.target.articleId);
    void runImportResources(job.root, job.source!, job.task, current, {
      signal: active.abort.signal,
      onChange: task => { if (alive(job)) setPending(items => items.map(item => item.task.id === task.id ? { ...item, task } : item)); },
      onResource: resource => { if (current()) latest.current.onResource(job.root, job.task.target.articleId, resource); },
    }).then(({ task, diskError }) => {
      if (!alive(job)) return;
      if (diskError) setTaskIssues([diskError]);
      latest.current.onTaskFinished(job.root);
    }).catch(error => { if (alive(job)) latest.current.setStatus({ label: productText('imports.resourcesFailed', { cause: productCause(error) }), tone: 'error' }); })
      .finally(() => { if (running.current === active) { running.current = null; setPending(items => [...items]); } });
  }, [pending, bridge.root, bridge.session]);
  const updateRequest=(id:number,change:(value:Request)=>Request)=>{
    const value=requestRef.current;if(value?.id===id&&alive(value))replace(change(value));
  };
  const ensureRequest=()=>{
    const value=requestRef.current;
    if(value&&alive(value))return value;
    if(!latest.current.root)return null;
    const request:Request={root:latest.current.root,session:latest.current.session,id:++serial.current,choices:[]};
    replace(request);return request;
  };
  const close=()=>{
    setTasksOpen(false);if(!creatingRef.current&&!requestRef.current?.attempted)replace(null);
  };
  const open=(mode:ImportOriginMode,path?:string,sourceId?:string)=>{
    if(!latest.current.root)return;
    const current=ensureRequest();if(!current)return;
    setSelectedTaskId(null);setTasksOpen(true);
    if(mode!=='knowledge'||busyRef.current)return;
    busyRef.current=true;setBusy(true);setPhase('choosing');
    void (async()=>{
      try{
        const restored=await restoreKnowledgeSource(current.root,undefined,()=>alive(current),sourceId);
        if(restored.status!=='ready'||!restored.source||restored.binding?.sourceId!==sourceId||!path)throw new ProductError('imports.sourceRequired');
        const source=await knowledgeImportSource(restored.source,path);
        updateRequest(current.id,value=>({...value,choices:[...value.choices,{id:crypto.randomUUID(),name:source.origin.name,source,state:'ready'}]}));
      }catch(error){if(alive(current))latest.current.setStatus({label:productText('imports.actionFailed',{cause:productCause(error)}),tone:'error'});}
      finally{busyRef.current=false;setBusy(false);setPhase(null);}
    })();
  };
  const addChoices=async(read:(current:()=>boolean)=>Promise<MarkdownImportChoice[]|null>)=>{
    const current=requestRef.current;if(!current||busyRef.current)return;
    setBatchSummary(null);
    busyRef.current=true;setBusy(true);setPhase('choosing');
    try{
      const chosen=await read(()=>alive(current));if(!chosen||requestRef.current?.id!==current.id||!alive(current))return;
      const added=[...requestRef.current.choices];let duplicate=0;
      for(const choice of chosen){
        let existing=-1;
        for(let i=0;i<added.length;i++)if(await sameImportChoice(added[i],choice)){existing=i;break;}
        if(existing>=0){
          if(added[existing].error||added[existing].state==='skipped')added[existing]={...choice,id:added[existing].id,state:choice.error?'failed':'ready'};
          else duplicate++;
        }else added.push({...choice,state:choice.error?'failed':'ready'});
      }
      updateRequest(current.id,value=>({...value,choices:added}));
      if(duplicate&&alive(current))latest.current.setStatus({label:productText('imports.alreadySelected',{count:duplicate}),tone:'warning'});
    }catch(error){if(alive(current))latest.current.setStatus({label:productText('imports.actionFailed',{cause:productCause(error)}),tone:'error'});}
    finally{busyRef.current=false;setBusy(false);setPhase(null);}
  };
  const chooseFile=()=>addChoices(chooseMarkdownImports);
  const dropFiles=(transfer:Pick<DataTransfer,'items'>)=>addChoices(current=>droppedMarkdownImports(transfer,current));
  const chooseDirectory=async(id?:string)=>{
    const current=requestRef.current,choice=current?.choices.find(item=>item.id===id)??current?.choices.find(item=>item.source?.chooseDirectory);
    if(!current||!choice?.source?.chooseDirectory||busyRef.current)return;
    busyRef.current=true;setBusy(true);setPhase('choosing');
    try{
      const source=await choice.source.chooseDirectory();if(!source)return;
      updateRequest(current.id,value=>({...value,choices:value.choices.map(item=>item.id===choice.id?{...item,source}:item)}));
      const others=requestRef.current?.choices.map(item=>item.source).filter((item):item is ReadonlyImportSource=>Boolean(item))??[];
      const shared=await shareImportDirectory(source,others);
      updateRequest(current.id,value=>({...value,choices:value.choices.map(item=>item.source&&shared.has(item.source)?{...item,source:shared.get(item.source)!}:item)}));
    }catch(error){if(alive(current))latest.current.setStatus({label:productText('imports.actionFailed',{cause:productCause(error)}),tone:'error'});}
    finally{busyRef.current=false;setBusy(false);setPhase(null);}
  };
  const removeChoice=(id:string)=>{const current=requestRef.current;if(current&&!busyRef.current)updateRequest(current.id,value=>({...value,choices:value.choices.filter(item=>item.id!==id)}));};
  const clearChoices=()=>{const current=requestRef.current;if(current&&!busyRef.current)updateRequest(current.id,value=>({...value,choices:[],attempted:false}));};
  const setThemeId=(themeId:string)=>{const current=requestRef.current;if(current&&!busyRef.current)updateRequest(current.id,value=>({...value,themeId}));};
  const confirm=async(theme:ThemeConfig)=>{
    const current=requestRef.current;if(!current||busyRef.current)return;
    const choices=current.choices.filter(item=>item.state==='ready'&&item.source);if(!choices.length)return;
    const selectedTheme=structuredClone(theme),formatId=getFormatSnapshot().id,folderNames=new Map<string,Set<string>>();
    updateRequest(current.id,value=>({...value,attempted:true}));
    setSelectedTaskId(null);
    const scopeCurrent=()=>alive(current)&&requestRef.current?.id===current.id&&getFormatSnapshot().id===formatId;
    busyRef.current=true;creatingRef.current=true;cancelBatchRef.current=false;batchTasksRef.current=new Set();setBusy(true);setPhase('creating');
    const summary={total:choices.length,created:0,failed:0,skipped:0,stopped:false};setBatchSummary(summary);
    let warnings=false;
    try{
      const result=await runImportBatch(choices,{
        current:scopeCurrent,cancelled:()=>cancelBatchRef.current,
        create:choice=>latest.current.queue.run(()=>createMarkdownImport(current.root,choice.source!,selectedTheme,scopeCurrent,{folderNames})),
        start:choice=>updateRequest(current.id,value=>({...value,choices:value.choices.map(item=>item.id===choice.id?{...item,state:'creating'}:item)})),
        created:async(choice,created)=>{
          if(!alive(current))return;
          const source=choice.source!,issues:Array<ProductMessageFields|{message:string}>=[];
          try{if(created.taskSaved)await source.remember?.(created.task.id,current.root);}catch{issues.push(productErrorMessage(new ProductError('imports.bookmarkFailed')));}
          if(!alive(current))return;
          if(created.result.indexError)issues.push(typeof created.result.indexError==='string'?{message:created.result.indexError}:created.result.indexError);
          if(created.taskIssue)issues.push(created.taskIssue);
          if(!created.taskSaved)issues.push(productErrorMessage(new ProductError('imports.taskNotSaved')));
          setPending(items=>[...items,{root:current.root,session:current.session,source,task:created.task,taskSaved:created.taskSaved,choiceId:choice.id,recordIssue:created.taskIssue,issues}]);
          batchTasksRef.current.add(created.task.id);
          if(cancelBatchRef.current&&created.task.state!=='complete')stopTask(created.task.id,true);
          updateRequest(current.id,value=>({...value,choices:value.choices.filter(item=>item.id!==choice.id)}));
          latest.current.onImported(created.result.article,current.root);
          warnings ||= issues.length>0||created.task.diagnostics.length>0||created.task.resources.length>0;
        },
        failed:(choice,error)=>{if(alive(current))updateRequest(current.id,value=>({...value,choices:value.choices.map(item=>item.id===choice.id?{...item,state:'failed',error:productErrorMessage(error)}:item)}));},
        skipped:choice=>{if(alive(current))updateRequest(current.id,value=>({...value,choices:value.choices.map(item=>item.id===choice.id?{...item,state:'skipped'}:item)}));},
        fatal:error=>error instanceof ProductError&&['imports.changed','resources.libraryRequired'].includes(error.messageKey)||error instanceof DOMException&&error.name==='NotAllowedError',
        progress:next=>{if(alive(current))setBatchSummary(next);},
      });
      if(alive(current))latest.current.setStatus({label:productText('imports.batchResult',{created:result.created,total:result.total,failed:result.failed,skipped:result.skipped}),tone:result.failed||result.skipped||warnings?'warning':'success'});
    }catch(error){if(alive(current))latest.current.setStatus({label:productText('imports.actionFailed',{cause:productCause(error)}),tone:'error'});}
    finally{busyRef.current=false;creatingRef.current=false;setBusy(false);setPhase(null);}
  };
  const cancelBatch=()=>{
    cancelBatchRef.current=true;
    for(const item of pendingRef.current)if(batchTasksRef.current.has(item.task.id)&&!['complete','cancelled'].includes(item.task.state))stopTask(item.task.id,true);
  };
  const openTasks=(articleId?:string)=>{const current=ensureRequest();if(!current)return;setSelectedTaskId(articleId?pendingRef.current.find(item=>alive(item)&&item.task.target.articleId===articleId)?.task.id??null:null);setTasksOpen(true);};
  const taskAction = async (id: string, action: (job: PendingMarkdownImport) => Promise<void>) => {
    const job = pendingRef.current.find(item => item.task.id === id && alive(item)); if (!job || taskBusyRef.current) return;
    taskBusyRef.current = true; setTaskBusy(true); setTaskIssues([]);
    try { await action(job); } catch (error) { if (alive(job)) setTaskIssues([productErrorMessage(error)]); }
    finally { taskBusyRef.current = false; setTaskBusy(false); }
  };
  const resolveSource = async (job: PendingMarkdownImport) => {
    if (job.source) { await job.source.assertCurrent(); return job.source; }
    const local = await restoreLocalImportSource(job.task.id, job.root, job.task.source, () => alive(job), true);
    if (local) return local;
    if (job.task.source.kind === 'knowledge') {
      const restored = await restoreKnowledgeSource(job.root, undefined, () => alive(job), job.task.source.sourceId);
      if (restored.binding?.sourceId !== job.task.source.sourceId) throw new ProductError('imports.sourceRequired');
      if (restored.status === 'needs-permission' && restored.source) await restored.source.requestReadPermission();
      if (restored.source) { const source = await knowledgeImportSource(restored.source, job.task.source.path); if (source.origin.hash !== job.task.source.hash) throw new ProductError('imports.sourceChanged'); return source; }
    }
    return unavailableImportSource(job.task, () => alive(job));
  };
  const queueRetry = async (job: PendingMarkdownImport, source: ReadonlyImportSource, onlyResource?: string, replacement?: { name: string; size: number; modified: number }) => {
    if (!alive(job) || running.current?.id === job.task.id) return;
    const task = structuredClone(job.task); task.state = 'pending';
    for (const resource of task.resources) if (resource.state !== 'complete' && (!onlyResource || resource.id === onlyResource)) { resource.state = 'pending'; resource.receivedBytes = 0; delete resource.error; }
    if (onlyResource && replacement) task.resources.find(resource => resource.id === onlyResource)!.replacement = replacement;
    const guard = importRecordGuard(job.root, () => alive(job));
    if (job.taskSaved) await saveImportTaskRecord(job.root, task, guard); else await createImportTaskRecord(job.root, task, guard);
    if (!alive(job)) return;
    setPending(items => items.map(item => item.task.id === job.task.id ? { ...item, source, task, taskSaved: true, issues:item.issues?.filter(issue=>!('messageKey'in issue)||issue.messageKey!=='imports.taskNotSaved') } : item));
  };
  const retryTask = (id: string) => taskAction(id, async job => {
    if (!job.taskSaved) {
      await createImportTaskRecord(job.root, job.task, importRecordGuard(job.root, () => alive(job)));
      if (alive(job)) setPending(items => items.map(item => item.task.id === id ? { ...item, taskSaved: true, recordIssue: undefined, issues: item.issues?.filter(issue => issue !== item.recordIssue && (!('messageKey' in issue) || issue.messageKey !== 'imports.taskNotSaved')) } : item));
      return;
    }
    await queueRetry(job, await resolveSource(job));
  });
  const chooseTaskSource = (id: string) => taskAction(id, async job => {
    const source = await chooseMarkdownImport(() => alive(job)); if (!source) return;
    if (source.origin.hash !== job.task.source.hash) throw new ProductError('imports.sourceChanged');
    await source.remember?.(job.task.id, job.root); if (!alive(job)) return;
    setPending(items => items.map(item => item.task.id === id ? { ...item, source } : item));
  });
  const chooseTaskDirectory = (id: string) => taskAction(id, async job => {
    const source = await resolveSource(job); if (!source.chooseDirectory) throw new ProductError('imports.sourceRequired');
    const chosen = await source.chooseDirectory(); if (!chosen) return; await chosen.remember?.(job.task.id, job.root);
    if (alive(job)) setPending(items => items.map(item => item.task.id === id ? { ...item, source: chosen } : item));
  });
  const replaceResource = (id: string, resourceId: string) => taskAction(id, async job => {
    const resource = job.task.resources.find(item => item.id === resourceId); if (!resource || resource.state === 'complete') return;
    const replacement = await chooseImportReplacement(job.root, job.task, resource, () => alive(job));
    if (replacement) await queueRetry(job, job.source ?? unavailableImportSource(job.task, () => alive(job)), resourceId, replacement);
  });
  const stopTask = (id: string, cancel: boolean) => {
    const job = pendingRef.current.find(item => item.task.id === id && alive(item)); if (!job) return;
    if(['complete','cancelled'].includes(job.task.state))return;
    if (running.current?.id === id) { running.current.abort.abort(new ProductError(cancel ? 'imports.cancelled' : 'imports.paused')); return; }
    const task = structuredClone(job.task); task.state = cancel ? 'cancelled' : 'paused';
    for (const resource of task.resources) if (resource.state !== 'complete') resource.state = cancel ? 'cancelled' : 'pending';
    setPending(items => items.map(item => item.task.id === id ? { ...item, task } : item));
    if (job.taskSaved) void saveImportTaskRecord(job.root, task, importRecordGuard(job.root, () => alive(job))).catch(error => { if (alive(job)) setTaskIssues([productErrorMessage(error)]); });
  };
  const cancelArticle = (root: FileSystemDirectoryHandle, articleId: string) => {
    for (const job of pendingRef.current) if (job.root === root && job.task.target.articleId === articleId && !['complete', 'cancelled'].includes(job.task.state)) {
      stopTask(job.task.id, true);
      const task = structuredClone(job.task); task.state = 'cancelled';
      for (const resource of task.resources) if (resource.state !== 'complete') resource.state = 'cancelled';
      setPending(items => items.map(item => item.task.id === task.id ? { ...item, task } : item));
      if (job.taskSaved) void saveImportTaskRecord(root, task, importRecordGuard(root, () => alive(job))).catch(error => { if (alive(job)) setTaskIssues([productErrorMessage(error)]); });
    }
  };
  const openTask=(id:string)=>{
    const scope=pendingRef.current.find(item=>item.task.id===id&&alive(item));if(!scope)return;
    latest.current.protect({label:productText('imports.openArticle'),run:()=>taskAction(id,async job=>{
      const stored=await readStoredArticleById(job.root,job.task.target.month,job.task.target.folder);
      if(!alive(job))return;if(await latest.current.onCreated(stored,job.root))close();
    })});
  };
  const isOpen=Boolean(tasksOpen&&request&&request.root===bridge.root&&request.session===bridge.session);
  return {request,busy,phase,batchSummary,pending:pending.filter(item=>alive(item)),setPending,close,chooseFile,dropFiles,chooseDirectory,removeChoice,clearChoices,setThemeId,confirm,cancelBatch,openTask,isOpen,
    open:()=>open('local'),openKnowledge:(path:string,sourceId:string)=>open('knowledge',path,sourceId),
    tasksOpen:isOpen,selectedTaskId,setSelectedTaskId,taskBusy,taskIssues,openTasks,closeTasks:close,retryTask,chooseTaskSource,chooseTaskDirectory,replaceResource,
    pauseTask:(id:string)=>stopTask(id,false),cancelTask:(id:string)=>stopTask(id,true),cancelArticle,
    articleFolderIsBusy:(root:FileSystemDirectoryHandle,id:string)=>pendingRef.current.some(job=>job.root===root&&job.task.target.articleId===id&&!['complete','cancelled'].includes(job.task.state)),
    articleFolderMoved:(root:FileSystemDirectoryHandle,id:string,folder:string)=>setPending(items=>items.map(job=>job.root===root&&job.task.target.articleId===id?{...job,task:{...job.task,target:{...job.task.target,folder,articleId:job.task.target.month+'/'+folder}}}:job)),
  };
}
