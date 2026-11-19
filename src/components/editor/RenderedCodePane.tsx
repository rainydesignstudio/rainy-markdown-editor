'use client';
import {useLayoutEffect,useRef} from 'react';
import {SnippetTextarea} from '../content/SnippetTextarea';
import {useUITranslation} from '../global/UILocaleProvider';
import type {RenderedCode} from '../../lib/renderedCode';
import type {ArticleSnippet} from '../../lib/types';
const EMPTY:ArticleSnippet[]=[];
const unchanged=()=>{};

export function RenderedCodePane({value,context}:{value:RenderedCode;context:object}){
  const {t}=useUITranslation('editor'),host=useRef<HTMLDivElement>(null),last=useRef<{context:object;code:string}|null>(null),scroll=useRef({top:0,left:0}),previous=useRef(context);
  if(value.status==='ready')last.current={context,code:value.code??''};
  const code=last.current?.context===context?last.current.code:'';
  useLayoutEffect(()=>{
    if(previous.current!==context){previous.current=context;scroll.current={top:0,left:0};}
    const node=host.current?.querySelector<HTMLElement>('[data-source-viewport]');
    if(node){node.scrollTop=scroll.current.top;node.scrollLeft=scroll.current.left;}
  },[context,code]);
  return <div ref={host} className="relative h-full min-h-0 bg-editor-surface" role="region" aria-label={t('preview.codeLabel')} onScrollCapture={event=>{const node=event.target as HTMLElement;if(node.matches?.('[data-source-viewport]'))scroll.current={top:node.scrollTop,left:node.scrollLeft};}}>
    <div className="flex h-full min-h-0 flex-col data-[ready=false]:pointer-events-none data-[ready=false]:opacity-0" data-ready={value.status==='ready'} aria-hidden={value.status!=='ready'||undefined} inert={value.status!=='ready'}>
      <SnippetTextarea value={code} snippets={EMPTY} onChange={unchanged} readOnly ariaLabel={t('preview.codeLabel')} sourceFont="editor" syntaxHighlight wrap showLineNumbers />
    </div>
    {value.status!=='ready'?<div className="absolute inset-0 empty-state"><strong>{t(value.status==='error'?'preview.codeFailed':'preview.codePending')}</strong>{value.error?<p>{value.error}</p>:null}</div>:null}
  </div>;
}
