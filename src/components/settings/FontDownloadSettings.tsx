'use client';

import { OperationFeedback } from '../global/OperationFeedback';
import { useState, useSyncExternalStore } from 'react';
import { useUITranslation } from '../global/UILocaleProvider';
import { productReference } from '../../lib/i18n/productMessages';
import { DEFAULT_FONT_SOURCE, getFontSource, setFontSource, subscribeFontSource, type FontSourceId } from '../../lib/fontSources';
import { cancelLocalFontDownload, getInitialLocalFontStatus, getLocalFontStatus, subscribeLocalFontStatus } from '../../lib/localFonts';

export function FontDownloadSettings({ root, onRetry }: { root: FileSystemDirectoryHandle | null; onRetry?: () => Promise<boolean> }) {
  const { t } = useUITranslation('settings');
  const source = useSyncExternalStore(subscribeFontSource, getFontSource, () => DEFAULT_FONT_SOURCE);
  const status = useSyncExternalStore(subscribeLocalFontStatus, getLocalFontStatus, getInitialLocalFontStatus);
  const [unsaved, setUnsaved] = useState(false), [retrying, setRetrying] = useState(false);
  const current = status.root === root && root !== null;
  const downloading = current && status.phase === 'downloading';
  const ready = current && status.phase === 'ready';
  const failed = current && (status.phase === 'error' || status.phase === 'cancelled');
  const sources: FontSourceId[] = ['google-fonts', 'jsdmirror'];
  return <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-list/50 p-5" aria-labelledby="font-settings-title">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
      <div><h3 id="font-settings-title" className="font-heading text-lg font-semibold text-primary">{t('fontDownloads.heading')}</h3><p className="mt-1 text-xs text-muted">{t('fontDownloads.scope')}</p></div>
      <div className="flex items-center gap-2"><OperationFeedback label={t('common:feedback.fileProblems', { count: 1 })} id="font-download" notice={unsaved ? productReference('feedback.fontPreferenceFailed') : failed ? status.notice : null} tone={unsaved || failed ? 'warning' : 'info'} summary={unsaved ? productReference('feedback.fontPreferenceFailed') : downloading ? productReference('feedback.fontsLoading', { completed: status.completed, total: status.total }) : productReference('feedback.fontsIncomplete')} /><span className="rounded-md bg-panel px-2.5 py-1 text-xs text-muted data-[tone=success]:text-success data-[tone=warning]:text-warning-strong" data-tone={ready ? 'success' : failed ? 'warning' : 'neutral'} role="status">
        {downloading ? t('messages:feedback.fontsLoading', { completed: status.completed, total: status.total }) : t(ready ? 'fontDownloads.ready' : failed ? 'fontDownloads.incomplete' : root ? 'fontDownloads.unchecked' : 'ui.notConnected')}
      </span></div>
    </header>
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-primary">{t('fontDownloads.title')}</legend>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        {sources.map(id => <label key={id} className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-secondary hover:border-accent-line has-checked:border-accent-line has-checked:bg-accent-soft has-checked:text-accent-text has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
          <input className="size-4 shrink-0 accent-accent" type="radio" name="font-download-source" value={id} checked={source === id} onChange={() => setUnsaved(!setFontSource(id))} />
          <span className="min-w-0 break-words">{t(id === 'google-fonts' ? 'fontDownloads.google' : 'fontDownloads.mirror')}</span>
        </label>)}
      </div>
    </fieldset>
    <p className="mt-auto text-xs text-muted">{t('fontDownloads.description')}</p>
    {!root ? <p className="text-xs text-faint">{t('fontDownloads.connectFirst')}</p> : null}
    {root && !ready && (downloading || onRetry) ? <div className="flex flex-wrap items-center gap-3">
      {!downloading && onRetry ? <button type="button" className="button button-quiet" disabled={retrying} onClick={async () => {
        setRetrying(true);
        try { await onRetry(); } finally { setRetrying(false); }
      }}>{t(retrying ? 'fontDownloads.checking' : failed ? 'fontDownloads.retryDownload' : 'fontDownloads.retry')}</button> : null}
      {downloading ? <button type="button" className="button button-quiet" onClick={cancelLocalFontDownload}>{t('fontDownloads.cancel')}</button> : null}
    </div> : null}
  </section>;
}
