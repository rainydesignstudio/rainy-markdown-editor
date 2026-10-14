'use client';

import { formatDiagnosticMessage, formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';

import { formatUIDate, formatUIMonth } from '../../lib/i18n/formatters';
import type { UILocale } from '../../lib/i18n/preferences';

import { useEffect, useMemo, useRef, useState } from 'react';
import { changedThemeSnapshotFields, type ArticleHistoryIssue, type ArticleHistorySnapshot } from '../../lib/articleHistory';
import type { StoredArticle, ThemeConfig } from '../../lib/types';
import { parseArticle } from '../../lib/frontMatter';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { HistorySnapshotPreview } from './HistorySnapshotPreview';
import { ButtonBar } from '../global/ButtonBar';
import { EditorActionIcon } from '../global/EditorTopbar';

type Props = {
  articleTitle: string;
  currentSource: string;
  currentTheme: ThemeConfig;
  currentThemeValid: boolean;
  currentDirty: boolean;
  month: string;
  folder: string;
  root: FileSystemDirectoryHandle | null;
  mediaArticle: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  snapshots: ArticleHistorySnapshot[];
  issues: ArticleHistoryIssue[];
  selectedId: string | null;
  busy: boolean;
  canRestore: boolean;
  canSaveAs: boolean;
  refreshPending: boolean;
  notice: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
  months: string[];
  onClose: () => void;
  getReturnFocus: () => HTMLElement | null;
  onSelect: (id: string) => void;
  onManualSnapshot: () => void;
  onRestore: (snapshot: ArticleHistorySnapshot) => void;
  onSaveAs: (snapshot: ArticleHistorySnapshot, title: string, month: string) => void;
  onToggleRetention: (snapshot: ArticleHistorySnapshot, retained: boolean) => void;
  onRefreshHistory: () => void;
};

type DiffRow = { left: string | null; right: string | null; kind: 'same' | 'removed' | 'added' };

function formatSnapshotTime(value: string, locale: UILocale, invalid: string): string {
  return formatUIDate(value, locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }, invalid);
}

function diffLines(previous: string, current: string): DiffRow[] {
  const left = previous.split('\n');
  const right = current.split('\n');
  if (left.length * right.length > 300_000) {
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
    return [
      ...left.slice(0, prefix).map((line) => ({ left: line, right: line, kind: 'same' as const })),
      ...left.slice(prefix, left.length - suffix).map((line) => ({ left: line, right: null, kind: 'removed' as const })),
      ...right.slice(prefix, right.length - suffix).map((line) => ({ left: null, right: line, kind: 'added' as const })),
      ...left.slice(left.length - suffix).map((line, index) => ({ left: line, right: right[right.length - suffix + index] ?? '', kind: 'same' as const })),
    ];
  }
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = left[i] === right[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ left: left[i], right: right[j], kind: 'same' });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ left: left[i], right: null, kind: 'removed' });
      i += 1;
    } else {
      rows.push({ left: null, right: right[j], kind: 'added' });
      j += 1;
    }
  }
  while (i < left.length) rows.push({ left: left[i++], right: null, kind: 'removed' });
  while (j < right.length) rows.push({ left: null, right: right[j++], kind: 'added' });
  return rows;
}

function metadataPairs(previous: ArticleHistorySnapshot, currentSource: string, currentTheme: ThemeConfig) {
  const current = parseArticle(currentSource).metadata;
  const themeLabel = (theme: ThemeConfig) => `${theme.name} · v${theme.version}`;
  const themeChanges = changedThemeSnapshotFields(previous.theme, currentTheme);
  const pairs = [
    { key: 'title', before: previous.parsed.metadata.title, after: current.title },
    { key: 'description', before: previous.parsed.metadata.description, after: current.description },
    { key: 'author', before: previous.parsed.metadata.author, after: current.author },
    { key: 'categories', before: previous.parsed.metadata.categories.join('、'), after: current.categories.join('、') },
    { key: 'theme', before: themeLabel(previous.theme), after: themeLabel(currentTheme) },
  ];
  if (themeChanges.length) pairs.push({
    key: 'themeSnapshot',
    before: '',
    after: themeChanges.join('、'),
  });
  return pairs.map((item) => ({
    ...item,
    changed: item.key === 'theme' ? item.before !== item.after || themeChanges.length > 0 : item.before !== item.after,
  }));
}

function HistoryRestoreConfirm({
  busy,
  canRestore,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  canRestore: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, onCancel);
  return (
    <div className="history-restore-confirm-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="history-restore-confirm" role="alertdialog" aria-modal="true" aria-labelledby="history-restore-title">
        <div><strong id="history-restore-title">{t('dialogs:ui.restoreThisVersion')}</strong><p>{t('dialogs:ui.aProtectedCheckpointIsSavedFirstThenThe')}</p></div>
        <div><button className="button button-quiet" type="button" disabled={busy} onClick={onCancel}>{t('common:actions.cancel')}</button><button className="button button-danger" type="button" disabled={busy || !canRestore} onClick={onConfirm}>{t('dialogs:ui.confirmRestore')}</button></div>
      </section>
    </div>
  );
}

export function ArticleHistoryView(props: Props) {
  const { t } = useUITranslation('dialogs');
  const { locale } = useUILocale();
  const {
    articleTitle, currentSource, currentTheme, currentThemeValid, currentDirty, month, folder, root, mediaArticle,
    snapshots, issues, selectedId, busy, canRestore, canSaveAs, refreshPending, notice, months, onClose,
    getReturnFocus, onSelect, onManualSnapshot, onRestore, onSaveAs, onToggleRetention, onRefreshHistory,
  } = props;
  const selected = snapshots.find((item) => item.id === selectedId) ?? snapshots[0] ?? null;
  const [copyTitle, setCopyTitle] = useState(() => t('dialogs:history.forkTitle', { title: articleTitle }));
  const [copyMonth, setCopyMonth] = useState(month);
  const [previewMode, setPreviewMode] = useState<'source' | 'render'>('source');
  const [restoreTarget, setRestoreTarget] = useState<ArticleHistorySnapshot | null>(null);
  const monthOptions = useMemo(() => [...new Set([month, ...months])].sort().reverse(), [month, months]);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const getReturnFocusRef = useRef(getReturnFocus);
  const restoreTargetRef = useRef<ArticleHistorySnapshot | null>(restoreTarget);
  onCloseRef.current = onClose;
  getReturnFocusRef.current = getReturnFocus;
  restoreTargetRef.current = restoreTarget;
  const currentParsed = useMemo(() => parseArticle(currentSource), [currentSource]);
  const currentSnapshot = useMemo<ArticleHistorySnapshot>(() => ({
    id: 'current-editor-revision',
    createdAt: '',
    kind: 'manual',
    retained: true,
    title: currentParsed.metadata.title,
    source: currentSource,
    theme: currentTheme,
    parsed: currentParsed,
    themeMatches: currentParsed.metadata.theme.id === currentTheme.id && currentParsed.metadata.theme.version === currentTheme.version,
  }), [currentParsed, currentSource, currentTheme]);
  const sourceDiff = useMemo(() => selected ? diffLines(selected.source, currentSource) : [], [currentSource, selected]);
  const metadata = useMemo(() => selected ? metadataPairs(selected, currentSource, currentTheme) : [], [currentSource, currentTheme, selected]);

  useEffect(() => {
    const focusTarget = getReturnFocusRef.current();
    const previousFocus = focusTarget?.isConnected
      ? focusTarget
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => backButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !restoreTargetRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <section className="history-view" aria-labelledby="history-view-title">
      <header className="history-view-header">
        <button ref={backButtonRef} className="button button-quiet history-view-back" type="button" data-history-back="true" onClick={onClose} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 5-7 7 7 7M8 12h12" /></svg>
          <span>{t('dialogs:ui.backToEditorAlternative')}</span>
        </button>
        <div className="history-view-heading"><p className="eyebrow">{t('dialogs:ui.versionHistory')}</p><h1 className="font-heading history-view-title" id="history-view-title">{t('dialogs:templates.historyTitle', { title: articleTitle })}</h1><p className="status-copy mt-3">{month}/{folder} {t('dialogs:ui.bodyAndThemeArePairedInSnapshots')}</p></div>
      </header>
      <div className="history-view-content">
          {issues.length ? <div className="content-library-issues" role="status">{issues.map((item) => <p className="break-words" key={`${item.snapshotId}:${item.message}`}><strong>{item.snapshotId}</strong> · {formatDiagnosticMessage(item, t)}</p>)}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <p className="status-copy m-0" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p>
            {refreshPending ? <button className="button button-quiet" type="button" onClick={onRefreshHistory} disabled={busy}>{t('dialogs:ui.retryRefreshingHistory')}</button> : null}
            <button className="button button-quiet" type="button" onClick={onManualSnapshot} disabled={busy || !canRestore}>{t('dialogs:ui.saveImportantVersion')}</button>
          </div>
          <div className="history-grid">
            <nav className="history-list" aria-label={t('dialogs:ui.historyList')}>
              {snapshots.map((snapshot) => (
                <div className="history-item" key={snapshot.id} data-current={selected?.id === snapshot.id}>
                  <button className="history-item-select" type="button" onClick={() => { onSelect(snapshot.id); setRestoreTarget(null); }} disabled={busy} aria-current={selected?.id === snapshot.id ? 'true' : undefined}>
                    <strong>{snapshot.title || t('dialogs:ui.untitledManuscript')}</strong>
                    <span>{formatSnapshotTime(snapshot.createdAt, locale, t('common:dates.invalid'))} · {t(`dialogs:historyKinds.${snapshot.kind}`)}{snapshot.retained ? t('dialogs:ui.protected') : ''}</span>
                  </button>
                  {snapshot.kind === 'automatic' ? <button className="history-retain" type="button" onClick={() => onToggleRetention(snapshot, !snapshot.retained)} disabled={busy || refreshPending}>{snapshot.retained ? t('dialogs:ui.unprotect') : t('dialogs:ui.protectVersion')}</button> : null}
                </div>
              ))}
              {!snapshots.length ? <p className="status-copy">{t('dialogs:ui.noCompleteHistoryYetSaveAnImportantVersion')}</p> : null}
            </nav>
            <section className="history-detail" aria-label={t('dialogs:ui.compareHistoryWithCurrentManuscript')}>
              {selected ? <>
                <div className="history-detail-heading"><div><h3 className="font-heading">{selected.title || t('dialogs:ui.untitledManuscript')}</h3><p className="mt-3">{formatSnapshotTime(selected.createdAt, locale, t('common:dates.invalid'))} · {t(`dialogs:historyKinds.${selected.kind}`)}{currentDirty ? t('dialogs:ui.currentManuscriptHasUnsavedChanges') : ''}</p></div></div>
                {!selected.themeMatches ? <div className="content-library-note" data-tone="warning">{t('dialogs:ui.historicalFrontMatterDoesNotMatchTheTheme')}</div> : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ButtonBar className="history-preview-tabs" label={t('dialogs:ui.comparisonMode')}>
                    <button className="button button-quiet" type="button" aria-pressed={previewMode === 'source'} onClick={() => setPreviewMode('source')}>{t('dialogs:ui.sourceAndMetadata')}</button>
                    <button className="button button-quiet" type="button" aria-pressed={previewMode === 'render'} onClick={() => setPreviewMode('render')} disabled={!selected.parsed.canCopy || !currentParsed.canCopy || !currentThemeValid}>{t('dialogs:ui.renderedLayout')}</button>
                  </ButtonBar>
                  <ButtonBar className="ml-auto" label={t('dialogs:ui.restoreThisVersionAlternative')}>
                    <button className="button button-quiet" type="button" onClick={() => setRestoreTarget(selected)} disabled={busy || !canRestore || !selected.themeMatches}><EditorActionIcon name="history" className="size-4 shrink-0" />{t('dialogs:ui.restoreThisVersionAlternative')}</button>
                  </ButtonBar>
                </div>
                {previewMode === 'source' ? (
                  <div className="history-diff-columns" aria-label={t('dialogs:ui.sourceSideBySide')}>
                    <section><h4 className="font-heading">{t('dialogs:ui.historicalVersion')}</h4><pre className="history-diff-lines" tabIndex={0} aria-label={t('dialogs:ui.historicalSource')}>{sourceDiff.map((row, index) => <span key={`left-${index}`} className="history-diff-row" data-kind={row.kind}><i>{row.left === null ? '' : String(index + 1)}</i><code>{row.left ?? ' '}</code></span>)}</pre></section>
                    <section><h4 className="font-heading">{t('dialogs:ui.currentManuscriptAlternative')}</h4><pre className="history-diff-lines" tabIndex={0} aria-label={t('dialogs:ui.currentSource')}>{sourceDiff.map((row, index) => <span key={`right-${index}`} className="history-diff-row" data-kind={row.kind}><i>{row.right === null ? '' : String(index + 1)}</i><code>{row.right ?? ' '}</code></span>)}</pre></section>
                  </div>
                ) : (
                  <div className="history-render-comparison">
                    {selected.parsed.canCopy ? <section><h4 className="font-heading">{t('dialogs:ui.historicalVersion')}</h4><HistorySnapshotPreview key={`old-${selected.id}`} snapshot={selected} root={root} article={mediaArticle} articleTitle={selected.title || articleTitle} /></section> : <div className="content-library-note" data-tone="error">{t('dialogs:ui.historyCouldNotBeParsedOnlySourceIs')}</div>}
                    {currentParsed.canCopy && currentThemeValid ? <section><h4 className="font-heading">{t('dialogs:ui.currentManuscriptAlternative')}</h4><HistorySnapshotPreview key="current-editor-revision" snapshot={currentSnapshot} root={root} article={mediaArticle} articleTitle={currentParsed.metadata.title || articleTitle} /></section> : <div className="content-library-note" data-tone="error">{t('dialogs:ui.currentManuscriptCannotRenderSafelyRepairArticleMetadata')}</div>}
                  </div>
                )}
                {restoreTarget ? <HistoryRestoreConfirm
                  busy={busy}
                  canRestore={canRestore}
                  onCancel={() => setRestoreTarget(null)}
                  onConfirm={() => { onRestore(restoreTarget); setRestoreTarget(null); }}
                /> : null}
                <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
                  <section className="history-metadata-comparison" aria-label={t('dialogs:ui.articleInformationChanges')}><h4 className="font-heading">{t('dialogs:ui.articleInformationAndTheme')}</h4>{metadata.map((item) => <div key={item.key} className="history-metadata-row" data-changed={item.changed}><strong>{t(`dialogs:historyFields.${item.key}`)}</strong><span>{item.key === 'themeSnapshot' ? t('dialogs:history.savedSnapshot') : item.before || (item.key === 'categories' ? t('dialogs:ui.none') : '—')}</span><span>{item.key === 'themeSnapshot' ? t('dialogs:history.changedFields', { fields: item.after }) : item.after || (item.key === 'categories' ? t('dialogs:ui.none') : '—')}</span></div>)}</section>
                  <form className="history-copy-form" onSubmit={(event) => { event.preventDefault(); onSaveAs(selected, copyTitle, copyMonth); }}>
                    <h4 className="font-heading">{t('dialogs:ui.forkFromHistory')}</h4>
                    <div className="history-copy-fields">
                      <label className="field-stack"><span className="field-label">{t('dialogs:ui.newManuscriptTitle')}</span><input className="field" value={copyTitle} onChange={(event) => setCopyTitle(event.target.value)} disabled={busy || !canSaveAs || !selected.themeMatches} /></label>
                      <label className="field-stack"><span className="field-label">{t('dialogs:ui.savedMonth')}</span><select className="field" value={copyMonth} onChange={(event) => setCopyMonth(event.target.value)} disabled={busy || !canSaveAs || !selected.themeMatches}>{monthOptions.map((value) => <option key={value} value={value}>{formatUIMonth(value, locale)}</option>)}</select></label>
                    </div>
                    <p className="status-copy">{t('dialogs:ui.copyArticleAssetsAndTheSelectedThemeSnapshot')}</p>
                    <button className="button button-primary" type="submit" disabled={busy || !canSaveAs || !selected.themeMatches || !copyTitle.trim()}>{t('dialogs:ui.createIndependentFork')}</button>
                  </form>
                </div>
              </> : <div className="empty-state"><strong>{t('dialogs:ui.chooseAHistoricalVersion')}</strong><p>{t('dialogs:ui.historyAndCurrentManuscriptWillBeComparedHere')}</p></div>}
            </section>
          </div>
      </div>
    </section>
  );
}
