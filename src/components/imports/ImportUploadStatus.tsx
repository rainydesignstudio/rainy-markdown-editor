'use client';
import type {ReactNode} from 'react';
import {useUITranslation} from '../global/UILocaleProvider';
import {ContentIcon} from '../global/ContentIcon';
import {IconPopover} from '../global/IconPopover';
import {TooltipButton} from '../global/TooltipButton';

export function ImportUploadStatus({id,name,state,progress,open,hasPopup,onToggle,onClose,children}:{
  id:string;name:string;state:'waiting'|'uploading'|'uploaded';progress?:number|null;open:boolean;hasPopup:boolean;
  onToggle:()=>void;onClose:()=>void;children?:ReactNode;
}){
  const {t}=useUITranslation('messages');
  const label=t(state==='waiting'?'imports.uploadWaiting':state==='uploaded'?'imports.uploaded':'imports.uploading');
  const value=progress==null?null:Math.max(0,Math.min(1,progress));
  const icon=state==='uploading'?<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value??undefined}>
    <circle cx="12" cy="12" r="9" className="opacity-25"/>
    {value===null?<path className="origin-center animate-spin motion-reduce:animate-none" strokeLinecap="round" d="M12 3a9 9 0 0 1 9 9"/>:<circle cx="12" cy="12" r="9" pathLength="1" strokeDasharray="1" strokeDashoffset={1-value} transform="rotate(-90 12 12)" strokeLinecap="round"/>}
  </svg>:<ContentIcon name={state==='uploaded'?'check':'info'}/>;
  return <span data-import-status={id} className={state==='uploaded'?'shrink-0 text-success':'shrink-0 text-muted'}>{hasPopup?<IconPopover kind="dialog" triggerVariant="inline" label={name+' · '+label} tooltip={label} icon={icon} open={open} onToggle={onToggle} onClose={onClose}>
    <div className="grid min-w-0 gap-3 p-2"><p className="text-sm font-medium">{label}</p>{children}</div>
  </IconPopover>:<TooltipButton tooltip={label} aria-label={name+' · '+label} className="icon-button icon-button-inline">{icon}</TooltipButton>}</span>;
}
