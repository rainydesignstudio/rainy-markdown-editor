'use client';

import { ContentIcon } from '../global/ContentIcon';

import { useUITranslation } from '../global/UILocaleProvider';

import type { ArticleSummary } from '../../lib/types';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

type Props = {
  article: ArticleSummary;
  archived: boolean;
  disabled?: boolean;
  insetSummary?: boolean;
  onInfo: (article: ArticleSummary) => void;
  onArchive: (article: ArticleSummary, archived: boolean) => void;
  onFork: (article: ArticleSummary) => void;
  onDelete: (article: ArticleSummary) => void;
};


export function ArticleActionsMenu({ article, archived, disabled = false, insetSummary = false, onInfo, onArchive, onFork, onDelete }: Props) {
  const { t } = useUITranslation('articles');
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) menuRef.current.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);
  const closeMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest('details');
    if (details) {
      details.open = false;
      const summary = details.querySelector('summary');
      queueMicrotask(() => summary?.focus());
    }
  };

  return (
    <details ref={menuRef} className="article-action-menu" onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
      event.preventDefault();
      event.stopPropagation();
    }}>
      <summary className={insetSummary ? 'mr-1' : undefined} aria-label={t('articles:actions.moreLabel', { title: article.parse.metadata.title })}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg><span className="article-action-menu-label">{t('common:actions.more')}</span>
      </summary>
      <div role="group" aria-label={t('articles:actions.articleLabel', { title: article.parse.metadata.title })}>
        <button type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onInfo(article); }}><ContentIcon name="info" />{t('articles:info')}</button>
        <button type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onFork(article); }}><ContentIcon name="fork" />{t('articles:fork')}</button>
        <button type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onArchive(article, !archived); }}><ContentIcon name={archived ? 'restore' : 'archive'} />{archived ? t('articles:unarchive') : t('articles:collections.archived')}</button>
        {archived ? <><span className="my-1 h-px bg-line" aria-hidden="true" /><button className="text-warning-strong hover:bg-warning-surface hover:text-warning-strong focus-visible:bg-warning-surface focus-visible:text-warning-strong" type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onDelete(article); }}><ContentIcon name="delete" />{t('articles:deleteArchive')}</button></> : null}
      </div>
    </details>
  );
}
