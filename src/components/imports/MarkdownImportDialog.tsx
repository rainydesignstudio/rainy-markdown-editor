'use client';
import { IconButton } from '../global/IconButton';
import {useLayoutEffect,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {SelectField} from '../global/SelectField';
import {useUITranslation} from '../global/UILocaleProvider';
import {formatProductMessage,productDiagnosticReference,type ProductMessageFields} from '../../lib/i18n/productMessages';
import type {ThemeConfig} from '../../lib/types';
import type {ImportChoice,PendingMarkdownImport} from '../../hooks/imports/useMarkdownImport';
import {importPresentation} from '../../lib/imports/presentation';
import {sanitizeFolderName} from '../../lib/fileSystem';
import {ButtonBar} from '../global/ButtonBar';
import {ContentIcon} from '../global/ContentIcon';
import {DialogFrame,DialogHeader,DialogFooter,DialogActions,DialogButton} from '../global/DialogFrame';
import {ImportUploadStatus} from './ImportUploadStatus';
import {useLibraryCapability} from '../../hooks/useLibraryCapability';

type Props={
  choices:ImportChoice[];themeId?:string;themes:ThemeConfig[];defaultTheme:ThemeConfig;existingFolders:string[];
  busy:boolean;phase:'choosing'|'creating'|null;jobs:PendingMarkdownImport[];selectedId:string|null;taskBusy:boolean;
  issues:Array<ProductMessageFields|{message:string}>;
  onChooseFile:()=>Promise<void>;onDropFiles:(transfer:Pick<DataTransfer,'items'>)=>Promise<void>;
  onChooseDirectory:(id:string)=>Promise<void>;onRemove:(id:string)=>void;onThemeChange:(id:string)=>void;
  onConfirm:(theme:ThemeConfig)=>Promise<void>;onCancelBatch:()=>void;onClose:()=>void;
  onSelectTask:(id:string|null)=>void;onOpenTask:(id:string)=>void;onRetry:(id:string)=>void;onPause:(id:string)=>void;onCancel:(id:string)=>void;
  onChooseSource:(id:string)=>void;onChooseTaskDirectory:(id:string)=>void;onReplace:(id:string,resourceId:string)=>void;
};
export function MarkdownImportDialog(props:Props){
  const {t}=useUITranslation('messages'),[dragging,setDragging]=useState(false),order=useRef(new Map<string,number>());
  const themeCapability=useLibraryCapability('articleTheme');
  const {choices,themes,defaultTheme,busy,phase,selectedId,taskBusy}=props;
  const themeId=props.themeId??defaultTheme.id,selected=themes.find(theme=>theme.id===themeId);
  const ready=choices.filter(item=>item.source&&item.state==='ready'&&!item.error);
  const normalize=(value:string)=>sanitizeFolderName(value).normalize('NFKC').toLowerCase();
  const names=choices.map(item=>normalize(item.source?.title??item.name)),known=new Set(props.existingFolders.map(normalize));
  for(const item of choices)if(!order.current.has(item.id))order.current.set(item.id,order.current.size);
  const rows:Array<{id:string;choice?:ImportChoice;job?:PendingMarkdownImport}>=choices.map(choice=>({id:choice.id,choice}));
  rows.push(...[...props.jobs].sort((a,b)=>b.task.createdAt.localeCompare(a.task.createdAt)).map(job=>({id:job.choiceId??job.task.id,job})));
  rows.sort((a,b)=>(order.current.get(a.id)??Infinity)-(order.current.get(b.id)??Infinity));
  useLayoutEffect(()=>{
    if(!selectedId)return;
    const row=document.getElementById('import-card-'+selectedId);row?.scrollIntoView({block:'nearest'});
    row?.querySelector<HTMLButtonElement>('[data-import-status] button')?.focus();
  },[selectedId]);
  const drag=(event:DragEvent<HTMLButtonElement>)=>{if(!Array.from(event.dataTransfer.types).includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect=busy?'none':'copy';if(!busy&&!taskBusy)setDragging(true);};
  const issueContent=(issue:ProductMessageFields|{message:string},fallback:string)=>{
    const reference=productDiagnosticReference(issue);
    return typeof reference==='string'?<div className="grid min-w-0 gap-2"><p className="text-warning">{t(fallback)}</p><p className="text-xs text-muted">{t('imports.technicalInformation')}</p><p className="break-words text-xs">{issue.message}</p></div>:<p className="break-words text-warning">{formatProductMessage(reference,t)}</p>;
  };
  return <DialogFrame className="flex min-h-0 max-w-2xl flex-col overflow-hidden" titleId="markdown-import-title" onClose={props.onClose}>
    <DialogHeader titleId="markdown-import-title" eyebrow={t('imports.eyebrow')} title={t('imports.title')} onClose={props.onClose}/>
    <div className="dialog-content flex min-h-0 flex-1 flex-col overflow-hidden">
      <button type="button" disabled={busy||taskBusy} data-dragging={dragging} className="flex min-h-32 w-full shrink-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-list/30 p-4 text-sm text-muted hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 data-[dragging=true]:border-accent-line data-[dragging=true]:bg-accent-soft data-[dragging=true]:text-accent-text" onClick={()=>void props.onChooseFile()} onDragEnter={drag} onDragOver={drag} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);}} onDrop={event=>{event.preventDefault();event.stopPropagation();setDragging(false);if(!busy&&!taskBusy)void props.onDropFiles(event.dataTransfer);}}>
        <ContentIcon name="upload"/><span>{t('imports.dropPrompt')}</span>
      </button>
      {choices.some(item=>item.source)?<label className="field-stack shrink-0" htmlFor="markdown-import-theme"><span className="field-label">{t('imports.themeLabel')}</span><SelectField label={t('imports.themeLabel')} title={themeCapability.enabled?'':themeCapability.reason} id="markdown-import-theme" value={themeId} disabled={busy||!themeCapability.enabled} onChange={props.onThemeChange} options={themes.map(theme=>({value:theme.id,label:theme.name+' · v'+theme.version}))}/></label>:null}
      {props.issues.map((issue,index)=><p key={index} role="alert" className="status-copy shrink-0" data-tone="warning">{formatProductMessage(issue,t)}</p>)}
      {rows.length?<><h3 id="markdown-import-list-title" className="shrink-0 text-sm font-semibold text-primary">{t('imports.selectionList')}</h3>
      <ul className="grid min-h-0 min-w-0 flex-1 content-start gap-3 overflow-x-clip overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" aria-labelledby="markdown-import-list-title">{rows.map(row=>{
        const choice=row.choice,job=row.job,task=job?.task,status=job?importPresentation(job):null;
        const name=choice?(choice.source?.title??choice.name):task!.target.folder;
        const state=choice?.state==='creating'||status?.running&&task?.state==='running'?'uploading':status?.kind==='complete'?'uploaded':'waiting';
        const count=choice?(choice.source?.attachmentCount??choice.source?.localResources??0):task!.resources.length;
        const resources=task?.resources;
        const progress=resources?.length&&resources.every(item=>item.state==='complete'||(item.totalBytes??0)>0)
          ? resources.reduce((sum,item)=>sum+(item.state==='complete'?1:Math.min(1,item.receivedBytes/item.totalBytes!)),0)/resources.length
          : null;
        const id=task?.id??row.id,open=selectedId===id;
        const collision=choice?.source&&(known.has(normalize(choice.source.title))||names.filter(value=>value===normalize(choice.source!.title)).length>1);
        const needDirectory=Boolean(choice?.source?.chooseDirectory&&choice.source.localResources&&!choice.source.directoryName);
        const incomplete=task?.resources.filter(item=>item.state!=='complete')??[],problem=incomplete.find(item=>item.error)??incomplete[0];
        const hasPopup=Boolean(choice?.error||collision||needDirectory||job&&(!job.taskSaved||incomplete.length||job.issues?.length||task?.diagnostics.length));
        let recovery:ReactNode=null;
        if(open&&choice)recovery=<>
          {choice.error?issueContent(choice.error,'imports.fileNeedsReview'):null}
          {collision?<p>{t('imports.nameCollision')}</p>:null}
          {needDirectory||choice.error?<ButtonBar label={t('imports.tasksTitle')}>
            {needDirectory?<DialogButton icon="folder" disabled={busy} onClick={()=>void props.onChooseDirectory(choice.id)}>{t('imports.chooseDirectory')}</DialogButton>:null}
            {choice.error?<DialogButton icon="document" disabled={busy} onClick={()=>void props.onChooseFile()}>{t('imports.reselectFile')}</DialogButton>:null}
          </ButtonBar>:null}
        </>;
        if(open&&job&&task)recovery=<>
          {job.issues?.map((issue,index)=><div key={index}>{issueContent(issue,'imports.reviewRequired')}</div>)}
          {problem?<p className="break-all">{problem.source}</p>:null}
          {problem?.error?issueContent(problem.error,'imports.attachmentNeedsReview'):null}
          {task.diagnostics.length?<p className="text-warning">{t('imports.referenceNotice')}</p>:null}
          <ButtonBar label={t('imports.tasksTitle')}>
            {!job.taskSaved?<DialogButton icon="save" disabled={taskBusy} onClick={()=>props.onRetry(task.id)}>{t('imports.retryRecord')}</DialogButton>:status?.running?<>
              <DialogButton icon="pause" disabled={taskBusy} onClick={()=>props.onPause(task.id)}>{t('imports.pause')}</DialogButton>
              <DialogButton icon="stop" disabled={taskBusy} onClick={()=>props.onCancel(task.id)}>{t('imports.cancelTask')}</DialogButton>
            </>:incomplete.length?<>
              <DialogButton icon="reset" disabled={taskBusy} onClick={()=>props.onRetry(task.id)}>{t('imports.retry')}</DialogButton>
              <DialogButton icon="document" disabled={taskBusy} onClick={()=>props.onChooseSource(task.id)}>{t('imports.reselectSource')}</DialogButton>
              {incomplete.some(item=>item.location==='local')?<DialogButton icon="folder" disabled={taskBusy} onClick={()=>props.onChooseTaskDirectory(task.id)}>{t('imports.chooseDirectory')}</DialogButton>:null}
              {problem?<DialogButton icon="document" disabled={taskBusy} onClick={()=>props.onReplace(task.id,problem.id)}>{t('imports.replaceLocal')}</DialogButton>:null}
              {task.state!=='cancelled'?<DialogButton icon="stop" disabled={taskBusy} onClick={()=>props.onCancel(task.id)}>{t('imports.cancelTask')}</DialogButton>:null}
            </>:null}
          </ButtonBar>
        </>;
        return <li key={row.id} id={'import-card-'+id} className="flex min-w-0 items-center gap-3 rounded-lg border border-line p-3">
          <ImportUploadStatus id={id} name={name} state={state} progress={state==='uploading'?progress:null} open={open} hasPopup={hasPopup} onToggle={()=>props.onSelectTask(open?null:id)} onClose={()=>props.onSelectTask(null)}>{recovery}</ImportUploadStatus>
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-primary">{name}</p><p className="mt-1 text-xs text-muted">{t('imports.attachmentCount',{count})}</p></div>
          <ButtonBar label={name}><DialogButton icon="apply" disabled={!task||taskBusy} onClick={()=>{if(task)props.onOpenTask(task.id);}}>{t('imports.openArticle')}</DialogButton>{choice?<IconButton icon="close" variant="dialog" disabled={busy} tabIndex={busy ? -1 : undefined} label={t('imports.removeFile',{name:choice.name})} onClick={()=>props.onRemove(choice.id)} />:null}</ButtonBar>
        </li>;
      })}</ul></>:null}
    </div>
    <DialogFooter><DialogActions>
      <DialogButton icon="close" onClick={()=>{props.onCancelBatch();props.onClose();}}>{t('imports.cancelOperation')}</DialogButton>
      <DialogButton icon="apply" variant="primary" disabled={busy||taskBusy||!ready.length||!selected} onClick={()=>{if(selected)void props.onConfirm(selected);}}>{t('imports.confirmCount',{count:ready.length})}</DialogButton>
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
