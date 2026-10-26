'use client';

import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useRef } from 'react';
import { IconButton } from '../global/IconButton';
import { INLINE_FORMATS, isInlineFormat, type InlineFormat } from '../../lib/editor/inlineFormatting';

type InsertIconName = 'heading' | 'quote' | 'link' | 'code' | 'list' | 'ordered-list' | 'task-list' | 'bold' | 'italic' | 'underline' | 'strike' | 'inline-code' | 'table' | 'rule' | 'snippets';
type InsertItem = { id: string; content: string; caret: number; icon: InsertIconName };
type InsertGroup = { id: string; icon: InsertIconName; items: InsertItem[] };

const STANDARD_GROUPS: InsertGroup[] = [
  {
    id: 'headings',
    icon: 'heading',
    items: [
      { id: 'heading-1', content: '# ▌标题', caret: 2, icon: 'heading' },
      { id: 'heading-2', content: '## ▌标题', caret: 3, icon: 'heading' },
      { id: 'heading-3', content: '### ▌标题', caret: 4, icon: 'heading' },
      { id: 'heading-4', content: '#### ▌标题', caret: 5, icon: 'heading' },
      { id: 'heading-5', content: '##### ▌标题', caret: 6, icon: 'heading' },
      { id: 'heading-6', content: '###### ▌标题', caret: 7, icon: 'heading' },
    ],
  },
  {
    id: 'text-formatting',
    icon: 'bold',
    items: [
      { id: 'bold', content: '**▌粗体文字**', caret: 2, icon: 'bold' },
      { id: 'italic', content: '*▌斜体文字*', caret: 1, icon: 'italic' },
      { id: 'underline', content: '<u>▌下划线文字</u>', caret: 3, icon: 'underline' },
      { id: 'strikethrough', content: '~~▌删除线~~', caret: 2, icon: 'strike' },
      { id: 'inline-code', content: '▌`行内代码`', caret: 0, icon: 'inline-code' },
      { id: 'link', content: '[▌链接文字](https://)', caret: 1, icon: 'link' },
    ],
  },
  {
    id: 'lists',
    icon: 'list',
    items: [
      { id: 'unordered-list', content: '- ▌列表项', caret: 2, icon: 'list' },
      { id: 'ordered-list', content: '1. ▌列表项', caret: 3, icon: 'ordered-list' },
      { id: 'task-list', content: '- [ ] ▌待办事项', caret: 6, icon: 'task-list' },
      { id: 'table', content: '\n| 表头 1 | 表头 2 |\n| --- | --- |\n| ▌内容 | 内容 |\n', caret: 33, icon: 'table' },
    ],
  },
  {
    id: 'blocks',
    icon: 'quote',
    items: [
      { id: 'quote', content: '> ▌引用内容', caret: 2, icon: 'quote' },
      { id: 'code-block', content: "```text\n▌\n```", caret: 8, icon: 'code' },
      { id: 'rule', content: '\n---\n', caret: 5, icon: 'rule' },
    ],
  },
];

export function InsertIcon({ name, className }: { name: InsertIconName; className?: string }) {
  const common = { className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'heading') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 5v14M19 5v14M5 12h14" /></svg>;
  if (name === 'quote') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 6v12m0-9h5m-5 5h5m4-8v12m0-9h5m-5 5h5" /></svg>;
  if (name === 'link') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M9.5 14.5 14.5 9.5m-7 8H6a4 4 0 0 1 0-8h4m4-4h4a4 4 0 0 1 0 8h-1" /></svg>;
  if (name === 'code' || name === 'inline-code') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14" /></svg>;
  if (name === 'list') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>;
  if (name === 'ordered-list') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 5h1v3M4 11h2l-2 2h2M4 17h2l-2 2h2" /></svg>;
  if (name === 'task-list') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m4 6 1.5 1.5L8 5M10 6h10M4 13l1.5 1.5L8 12m2 1h10M4 20h4m2 0h10" /></svg>;
  if (name === 'bold') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M7 5h6a3 3 0 0 1 0 6H7zm0 6h7a3 3 0 0 1 0 6H7z" /></svg>;
  if (name === 'italic') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M10 5h9M5 19h9m3-14-6 14" /></svg>;
  if (name === 'underline') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M7 4v7a5 5 0 0 0 10 0V4M5 21h14" /></svg>;
  if (name === 'strike') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 12h14M8 8c0-2 1.5-3 4-3s4 1 4 3M8 16c0 2 1.5 3 4 3s4-1 4-3" /></svg>;
  if (name === 'table') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><path d="M3.5 10h17M9 5v14M15 5v14" /></svg>;
  if (name === 'snippets') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 12h16" /></svg>;
}

function closeInsertMenu(target: Element): void {
  const menu = target.closest('.insert-elements-menu') as HTMLDetailsElement | null;
  if (menu) menu.open = false;
}

export function InsertElementsMenu({
  disabled,
  readOnly,
  onChooseImage,
  onOpenMediaPicker,
  onOpenSnippetPicker,
  onInsert,
  onFormat,
}: {
  disabled: boolean;
  readOnly: boolean;
  onChooseImage: () => void;
  onOpenMediaPicker: () => void;
  onOpenSnippetPicker: () => void;
  onInsert: (text: string, caretOffset: number) => void;
  onFormat: (format: InlineFormat) => void;
}) {
  const { t } = useUITranslation('editor');
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) menuRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuRef.current?.open) return;
      menuRef.current.open = false;
      menuRef.current.querySelector('summary')?.focus();
      event.preventDefault();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const insert = (content: string, fallbackCaret = content.length) => {
    const marker = content.indexOf('▌');
    const text = content.replace('▌', '');
    onInsert(text, marker < 0 ? fallbackCaret : marker);
  };

  const triggerIcon = <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 7v10M7 12h10" /></svg>;

  if (disabled) {
    const reason = readOnly ? t('editor:insert.readOnly') : t('editor:insert.unavailable');
    return <IconButton disabled tooltip={t('editor:insert.disabled', { reason: reason })} icon={triggerIcon} />;
  }

  return (
    <details ref={menuRef} className="insert-elements-menu">
      <IconButton as="summary" tooltip={t('editor:insert.label')} icon={triggerIcon} />
      <div className="insert-elements-panel" role="group" aria-label={t('editor:insert.label')}>
        <p className="insert-menu-label">{t('editor:insert.markdown')}</p>
        {STANDARD_GROUPS.map((group) => (
          <details key={group.id} className="insert-standard-category">
            <summary><InsertIcon name={group.icon} /><span>{t('editor:insert.groups.' + group.id)}</span><span aria-hidden="true">›</span></summary>
            <div className="insert-standard-options" role="group" aria-label={t('editor:insert.groups.' + group.id)}>
              {group.items.map((item) => <button key={item.id} type="button" disabled={disabled} onClick={(event) => { closeInsertMenu(event.currentTarget); if (isInlineFormat(item.id)) onFormat(item.id); else insert(item.content, item.caret); }}><InsertIcon name={item.icon} /><span>{t('editor:insert.items.' + item.id)}</span>{isInlineFormat(item.id) ? <kbd className="ml-auto whitespace-nowrap font-mono text-xs text-faint">⌘ {INLINE_FORMATS[item.id].key.toUpperCase()} / Ctrl + {INLINE_FORMATS[item.id].key.toUpperCase()}</kbd> : null}</button>)}
            </div>
          </details>
        ))}
        <p className="insert-menu-label insert-menu-label--divider">{t('editor:insert.images')}</p>
        <button type="button" disabled={disabled} onClick={(event) => { closeInsertMenu(event.currentTarget); onOpenMediaPicker(); }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="m5 17 5-4 3 2 3-3 3 3" /></svg><span>{t('editor:insert.fromLibrary')}</span></button>
        <button type="button" disabled={disabled} onClick={(event) => { closeInsertMenu(event.currentTarget); onChooseImage(); }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 5-4 3 2 3-3 3 3" /></svg><span>{t('editor:insert.chooseImage')}</span></button>
        <p className="insert-menu-label insert-menu-label--divider">{t('editor:insert.snippets')}</p>
        <button type="button" onClick={(event) => { closeInsertMenu(event.currentTarget); onOpenSnippetPicker(); }}><InsertIcon name="snippets" /><span>{t('editor:insert.openSnippets')}</span></button>
      </div>
    </details>
  );
}
