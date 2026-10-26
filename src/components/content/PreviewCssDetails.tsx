'use client';

import { useId, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { getFormatSnapshot, type FormatSnapshot } from '../../lib/article-format/runtime';
import { useUITranslation } from '../global/UILocaleProvider';
import { IconButton } from '../global/IconButton';
import { ContentIcon } from '../global/ContentIcon';
import { DialogFrame, DialogHeader } from '../global/DialogFrame';
import { SnippetTextarea } from './SnippetTextarea';

/** Observe the existing visible rendition; this never changes the frame or starts another compilation. */
export function readPreviewCss(css: string, dark: boolean, host: HTMLElement | null, target: HTMLElement | null, frame: HTMLIFrameElement | null): string | null {
  if (!dark || css === '') return css;
  const canonical = host?.querySelector<HTMLIFrameElement>('iframe[data-article-frame="light"]');
  if (!(canonical?.inert || target?.hidden)) return null;
  const styles = frame?.contentDocument?.head?.querySelectorAll<HTMLStyleElement>('style:not([data-theme-inspection-utilities])');
  return styles?.length ? styles[styles.length - 1].textContent ?? '' : null;
}

export function PreviewCssDetails({ css, ready, revision, snapshot, dark, hostRef, target, darkFrameRef }: {
  css: string; ready: boolean; revision: unknown; snapshot: FormatSnapshot; dark: boolean;
  hostRef: RefObject<HTMLDivElement | null>; target: HTMLElement | null; darkFrameRef?: RefObject<HTMLIFrameElement | null>;
}) {
  const { t } = useUITranslation('dialogs'), id = useId();
  const [open, setOpen] = useState(false), [record, setRecord] = useState<{ revision: unknown; formatId: string; dark: boolean; css: string | null } | null>(null);
  const current = ready && record && record.revision === revision && record.formatId === snapshot.id && record.dark === dark;
  const generated = current && record ? record.css : null;
  const stylesheetEntry = snapshot.environment?.policy.entry ?? null;
  const renderer = snapshot.renderer?.declaration;
  const close = () => setOpen(false);
  return <>
    <IconButton tooltip={t(ready ? 'previewCss.view' : 'previewCss.notReady')} icon={<ContentIcon name="code" />} disabled={!ready} onClick={() => {
      if (!ready || getFormatSnapshot().id !== snapshot.id) return;
      setRecord({ revision, formatId: snapshot.id, dark, css: readPreviewCss(css, dark, hostRef.current, target, darkFrameRef?.current ?? null) }); setOpen(true);
    }} />
    {open && typeof document !== 'undefined' ? createPortal(<DialogFrame large titleId={id} onClose={close}>
      <DialogHeader titleId={id} eyebrow={t('previewCss.readOnly')} title={t('previewCss.view')} onClose={close} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="grid shrink-0 gap-2 wrap-anywhere text-xs text-muted">
          <p>{t(snapshot.configuration?.rendering.styleAuthority === 'library' ? 'previewCss.library' : 'previewCss.theme')} · {t(dark ? 'ui.dark' : 'ui.light')}</p>
          <p>{t('previewCss.configuration', { id: snapshot.rawBundle?.support.meta.id ?? snapshot.bundle.support.meta.id })} · {snapshot.id}</p>
          {renderer ? <p>{t('previewCss.renderer', { id: renderer.id, version: renderer.version })} · {renderer.protocol} · format/{renderer.entry}</p> : null}
          <p>{stylesheetEntry ? t('previewCss.entry', { path: stylesheetEntry }) : t('previewCss.noMapping')}</p>
        </div>
        {generated === null ? <p className="text-sm text-muted" role="status">{t('previewCss.notReady')}</p> : generated === '' ? <p className="text-sm text-muted">{t('previewCss.empty')}</p> : <div className="flex min-h-64 min-w-0 flex-1 flex-col"><SnippetTextarea value={generated} onChange={() => {}} snippets={[]} readOnly sourceFont="editor" ariaLabel={t('previewCss.generated')} /></div>}
      </div>
    </DialogFrame>, document.body) : null}
  </>;
}
