'use client';
import { useLayoutEffect, useRef } from 'react';
import { ContentIcon } from '../global/ContentIcon';
import { useUITranslation } from '../global/UILocaleProvider';
import { IconButton } from '../global/IconButton';
import type { KnowledgeReaderTab } from '../../lib/knowledge/readerTabs';
export function KnowledgeReaderTabs({ tabs, activeId, onSelect, onClose, multipleSources, panelId }: { tabs: KnowledgeReaderTab[]; activeId: string; onSelect: (id: string) => void; onClose: (id: string) => void; multipleSources: boolean; panelId: string }) {
  const { t } = useUITranslation('knowledge');
  const host = useRef<HTMLDivElement>(null), closing = useRef(false);
  useLayoutEffect(() => { if (closing.current) { host.current?.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')?.focus(); closing.current = false; } }, [tabs, activeId]);
  return tabs.length > 1 ? <div ref={host} className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-line p-2 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" role="tablist" aria-label={t('readingTabs')} onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')], index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (index < 0) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    onSelect(tabs[next].id); buttons[next].focus();
  }}>{tabs.map((tab, index) => <div key={tab.id} role="presentation" data-active={activeId === tab.id} className="flex max-w-56 min-w-0 shrink-0 items-center rounded-lg pr-2 text-secondary transition-colors hover:bg-hover data-[active=true]:bg-accent-soft data-[active=true]:text-accent-text"><button className="min-w-0 flex-1 truncate rounded-lg pl-3 pr-1 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent" type="button" role="tab" id={`${panelId}-tab-${tab.id}`} aria-controls={panelId} aria-selected={activeId === tab.id} tabIndex={activeId === tab.id || !activeId && index === 0 ? 0 : -1} title={(tab.frame.sourceName ?? '') + ' · ' + tab.title + ' · ' + tab.frame.path} onClick={() => onSelect(tab.id)}>{multipleSources && tab.frame.sourceName ? tab.frame.sourceName + ': ' : ''}{tab.title}</button><IconButton variant="inline" tooltip={t('closeReadingTab', { title: tab.title })} onClick={event => { event.stopPropagation(); closing.current = true; onClose(tab.id); }} icon={<ContentIcon name="close" />} /></div>)}</div> : null;
}
