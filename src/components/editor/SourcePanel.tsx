'use client';

import { formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MutableRefObject, type ReactNode } from 'react';
import { captureEditingLocation, restoreEditingLocation, type RememberedEditingLocation } from '../../lib/editingLocation';
import type { ArticleSnippet, SnippetCategory, WorkingArticle } from '../../lib/types';
import type { ArticleFormatIssue } from '../../lib/articleFormat';
import { validateArticleAuthoringMarkdown } from '../../lib/articleAuthoringFormat';
import { groupSourceLineIssues, logicalSourceLines } from '../../lib/sourceLineDiagnostics';
import type { Tone } from '../../hooks/useEditorController';
import { inspectArticleResources, type ResourceProbeCache } from '../../lib/resources/inspection';
import { useResourceDocumentVersion } from '../../hooks/imports/useResourceVersion';
import { useAuthoringChecks } from '../../hooks/useMediaPreferences';
import { useSourceLineNumbers } from '../../hooks/useSourceLineNumbers';
import { SnippetTextarea } from '../content/SnippetTextarea';
import { InsertElementsMenu } from './InsertElementsMenu';
import type { InlineFormat } from '../../lib/editor/inlineFormatting';
import { IconButton } from '../global/IconButton';
import { FindIcon } from '../content/SourceFindBar';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { InformationButton, InformationIcon } from '../global/InformationButton';
import { articleSourceLayout, type parseArticle } from '../../lib/frontMatter';
import { usePreviewPreferences } from '../../hooks/usePreviewPreferences';
import { sourceLinePaddingClass, SOURCE_LINE_NUMBER_CLASS } from '../../lib/sourceViewport';
import { PanelHeading } from '../global/CollapsiblePanel';

const EMPTY_FORMAT_ISSUES: readonly ArticleFormatIssue[] = [];

export function SourceMetadataHeader({ lines, showLineNumbers }: { lines: string[]; showLineNumbers: boolean }) {
  const { t } = useUITranslation('editor');
  return <details className="group/panel shrink-0 border-b border-line bg-editor-surface" data-source-metadata="true">
    <PanelHeading as="summary" compact title={t('editor:source.metadataLines', { count: lines.length })}><span className="ml-auto text-faint">{t('editor:source.metadataViewOnly')}</span></PanelHeading>
    <div className={`max-h-64 min-w-0 overflow-x-clip overflow-y-auto pr-5 pb-3 font-article-source text-editor-source scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent md:pr-8 ${sourceLinePaddingClass(showLineNumbers)}`} aria-label={t('editor:source.metadataViewOnly')}>
      {lines.map((line, index) => <div className="relative min-w-0 whitespace-pre-wrap wrap-anywhere" key={index}>{showLineNumbers ? <span className={`${SOURCE_LINE_NUMBER_CLASS} select-none`} aria-hidden="true">{index + 1}</span> : null}<code className="font-article-source text-secondary">{line || '\u200b'}</code></div>)}
    </div>
  </details>;
}

type Props = {
  article: WorkingArticle;
  parsed: ReturnType<typeof parseArticle>;
  revision: number;
  mediaRevision?: number;
  resourceSessionKey?: string | number;
  sourceFormatIssues?: readonly ArticleFormatIssue[];
  sourceHistoryKey?: number;
  status: { label: string; tone: Tone; formatRevision?: number };
  importProgress?: ReactNode;
  mobilePane: 'source' | 'preview';
  directory: FileSystemDirectoryHandle | null;
  snippets: ArticleSnippet[];
  snippetCategories: SnippetCategory[];
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  editingLocationRef?: MutableRefObject<RememberedEditingLocation | null>;
  sourceFocusDisabled?: boolean;
  openFindRef?: MutableRefObject<(() => void) | null>;
  onChangeBody: (value: string) => void;
  onSnippetInserted: () => void;
  onImportFiles: (files: File[], selection: { start: number; end: number }) => void | Promise<void>;
  onPasteConflict: () => void;
  onOpenInfo: () => void;
  onOpenMediaPicker: () => void;
  mediaBusy: boolean;
  readOnly: boolean;
  citationTools?: ReactNode;
  citationStatus?: ReactNode;
};

export function SourcePanel({
  article,
  parsed,
  revision,
  mediaRevision = 0,
  resourceSessionKey,
  sourceFormatIssues = EMPTY_FORMAT_ISSUES,
  sourceHistoryKey,
  status,
  importProgress,
  mobilePane,
  directory,
  snippets,
  snippetCategories,
  sourceTextareaRef,
  editingLocationRef,
  sourceFocusDisabled = false,
  openFindRef: suppliedOpenFindRef,
  onChangeBody,
  onSnippetInserted,
  onImportFiles,
  onPasteConflict,
  onOpenInfo,
  onOpenMediaPicker,
  mediaBusy,
  readOnly,
  citationTools,
  citationStatus,
}: Props) {
  const { t } = useUITranslation('editor');
  const { preferences } = usePreviewPreferences();
  const dirtyRef = useRef(article.dirty); dirtyRef.current = article.dirty;
  useLayoutEffect(() => {
    const textarea = sourceTextareaRef.current;
    const viewport = textarea?.closest<HTMLElement>('[data-source-viewport]') ?? null;
    const remembered = editingLocationRef?.current;
    if (remembered && remembered.key === sourceHistoryKey) restoreEditingLocation(remembered.location, () => viewport, !sourceFocusDisabled);
    return () => {
      const location = dirtyRef.current ? captureEditingLocation(viewport, textarea) : null;
      if (location && editingLocationRef) editingLocationRef.current = { key: sourceHistoryKey, location };
    };
    // Restore only when this document's editor mounts, not on typing or dialog toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceHistoryKey, sourceTextareaRef, editingLocationRef]);
  const formatSnapshot = useFormatSnapshot();
  const localOpenFindRef = useRef<(() => void) | null>(null);
  const openFindRef = suppliedOpenFindRef ?? localOpenFindRef;
  const openPickerRef = useRef<(() => void) | null>(null);
  const insertTextRef = useRef<((text: string, caretOffset: number) => boolean) | null>(null);
  const formatSelectionRef = useRef<((format: InlineFormat) => boolean) | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const { showLineNumbers, toggle: toggleLineNumbers } = useSourceLineNumbers();
  const [checksEnabled, setChecksEnabled] = useAuthoringChecks();
  const [fileRevision, setFileRevision] = useState(0);
  const resourceDocumentId = article.month && article.folder ? `${article.month}/${article.folder}` : 'draft';
  const resourceDocumentRevision = useResourceDocumentVersion(directory, resourceDocumentId);
  const probeCache = useRef<{ root: FileSystemDirectoryHandle | null; id: string; entries: ResourceProbeCache }>({ root: directory, id: resourceDocumentId, entries: new Map() });
  if (probeCache.current.root !== directory || probeCache.current.id !== resourceDocumentId) probeCache.current = { root: directory, id: resourceDocumentId, entries: new Map() };
  useEffect(() => { const refresh = () => setFileRevision(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  const [lineIssues, setLineIssues] = useState<ArticleFormatIssue[]>([]);
  const [lineValidationError, setLineValidationError] = useState('');
  const sourceLayout = useMemo(() => articleSourceLayout(parsed), [parsed.source, parsed.body]);
  const lineCount = useMemo(() => logicalSourceLines(parsed.source).length, [parsed.source]);
  const bodyLineCount = useMemo(() => logicalSourceLines(parsed.body).length, [parsed.body]);
  const lineConcerns = useMemo(() => groupSourceLineIssues(checksEnabled ? [...lineIssues, ...sourceFormatIssues] : [], bodyLineCount), [checksEnabled, lineIssues, sourceFormatIssues, bodyLineCount]);
  const sourceHeader = useMemo(() => sourceLayout.metadataSource ? <SourceMetadataHeader key={sourceHistoryKey} lines={sourceLayout.metadataLines} showLineNumbers={showLineNumbers} /> : null, [sourceLayout, sourceHistoryKey, showLineNumbers]);

  useEffect(() => {
    setLineIssues([]);
    setLineValidationError('');
    if (!checksEnabled) return;
    let current = true;
    // Utility checks compile CSS. Wait until typing pauses so the source field
    // stays responsive while the reader edits a long article.
    const timer = window.setTimeout(() => {
      void Promise.all([validateArticleAuthoringMarkdown(parsed.body, '当前文章正文'), inspectArticleResources(parsed.body, { root: directory, month: article.month, folder: article.folder }, { readTasks: false, isCurrent: () => current, cache: probeCache.current.entries, cacheScope: `${resourceSessionKey}:${fileRevision}` })]).then((results) => {
        const issues = results.flat();
        if (!current) return;
        setLineIssues(issues);
        const engineIssue = issues.find((issue) => issue.kind === 'engine');
        if (engineIssue) setLineValidationError(engineIssue.message);
      }).catch((error: unknown) => {
        if (current) setLineValidationError(error instanceof Error ? error.message : String(error));
      });
    }, 600);
    return () => { current = false; window.clearTimeout(timer); };
  }, [parsed.body, checksEnabled, directory, article.month, article.folder, mediaRevision, resourceSessionKey, resourceDocumentRevision, fileRevision, formatSnapshot.id]);
  const handleImageFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    const textarea = sourceTextareaRef.current;
    const selection = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : { start: parsed.body.length, end: parsed.body.length };
    event.currentTarget.value = '';
    if (files.length) void onImportFiles(files, selection);
  };
  const fileName = article.month && article.folder ? article.folder : t('editor:source.unsavedTitle');

  return (
    <section className="panel source-panel" data-mobile-hidden={mobilePane === 'preview'} onKeyDownCapture={event => {
      if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey
        || !(event.metaKey || event.ctrlKey) || event.key !== '/' || !event.currentTarget.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleLineNumbers();
    }}>
      <div className="panel-header source-panel-header">
        <InformationButton icon={<InformationIcon />} title={fileName} subtitle={t('editor:source.info')} titleClassName="font-mono" onClick={onOpenInfo} disabled={!directory || readOnly || mediaBusy || parsed.diagnostics.some((item) => item.level === 'error')} />
        <div className="toolbar-actions source-actions">
          <input ref={imagePickerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif" multiple hidden onChange={handleImageFiles} />
          <IconButton tooltip={t('editor:source.lineToggle', { action: showLineNumbers ? t('editor:source.hideLines') : t('editor:source.showLines') })} aria-pressed={showLineNumbers} onClick={toggleLineNumbers} icon={<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5h13M8 12h13M8 19h13" /><path d="M3 4h1v4M3 11h1v4M3 18h1v3" /></svg>} />
          <IconButton tooltip={t('editor:source.find')} icon={<FindIcon />} onClick={() => openFindRef.current?.()} />
          {citationTools}
          <InsertElementsMenu
            disabled={readOnly || mediaBusy || parsed.diagnostics.some(item => item.level === 'error')}
            readOnly={readOnly}
            onOpenSnippetPicker={() => openPickerRef.current?.()}
            onChooseImage={() => imagePickerRef.current?.click()}
            onOpenMediaPicker={onOpenMediaPicker}
            onInsert={(text, caretOffset) => insertTextRef.current?.(text, caretOffset)}
            onFormat={format => formatSelectionRef.current?.(format)}
          />
        </div>
      </div>
      <SnippetTextarea
        historyKey={sourceHistoryKey}
        key={typeof parsed.metadata?.id === 'string' ? parsed.metadata.id : undefined}
        ref={sourceTextareaRef}
        value={parsed.body}
        snippets={snippets}
        categories={snippetCategories}
        openFindRef={openFindRef}
        openPickerRef={openPickerRef}
        insertTextRef={insertTextRef}
        formatSelectionRef={formatSelectionRef}
        onChange={onChangeBody}
        onSnippetInserted={onSnippetInserted}
        disabled={mediaBusy || readOnly || parsed.diagnostics.some((item) => item.level === 'error')}
        onImportFiles={onImportFiles}
        onPasteConflict={onPasteConflict}
        showLineNumbers={showLineNumbers}
        lineOffset={sourceLayout.bodyLineOffset}
        sourceHeader={sourceHeader}
        lineConcerns={lineConcerns}
      />
      {lineCount > 1000 ? <p className="shrink-0 border-t border-warning-line bg-warning-surface px-3 py-2 text-xs text-warning-strong" role="status">{t(preferences.saveOnly ? 'editor:source.longDocumentSavedOnly' : 'editor:source.longDocumentWarning', { count: lineCount })}</p> : null}
      <div className="source-footer">
        <label className="flex shrink-0 items-center gap-1.5 text-2xs text-muted"><input type="checkbox" role="switch" className="size-3 accent-accent" checked={checksEnabled} onChange={event => setChecksEnabled(event.target.checked)} aria-label={checksEnabled ? t('editor:source.checksOn') : t('editor:source.checksOff')} />{checksEnabled ? t('editor:source.checksOn') : t('editor:source.checksOff')}</label>
        {status.formatRevision !== undefined || status.tone === 'neutral' ? <span className="status-copy" data-tone={status.tone} role="status">{formatProductMessage(status, t)}</span> : null}
        {importProgress}
        {citationStatus}
        <span className="status-copy">{article.dirty ? t('editor:source.unsaved') : t('editor:source.saved')}{preferences.saveOnly ? ` · ${t('editor:source.saveRefreshPreview')}` : ''}{status.formatRevision === revision ? '' : ` · revision ${revision}`}</span>
        {parsed.diagnostics.some((item) => item.level === 'error') ? <span className="status-copy" data-tone="error">{t('editor:source.metadataReadOnly')}</span> : null}
        {checksEnabled && lineValidationError ? <span className="status-copy" data-tone="warning" role="status">{t('editor:source.diagnosticsUnavailable', { message: lineValidationError })}</span> : null}
      </div>
    </section>
  );
}
