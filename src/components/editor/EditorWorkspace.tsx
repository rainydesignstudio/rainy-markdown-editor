'use client';

import { formatDiagnosticMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColumnSplitter } from '../global/ColumnSplitter';
import { parseArticle } from '../../lib/frontMatter';
import type { ArticleSnippet, SnippetCategory, WorkingArticle } from '../../lib/types';
import type { ArticleFormatIssue } from '../../lib/articleFormat';

import type { ArticleMediaContext } from '../../lib/article-format/MarkdownPreview';
import type { Tone } from '../../hooks/useEditorController';
import { PreviewPanel } from './PreviewPanel';
import { CitationTools, type CitationRequest } from '../knowledge/CitationTools';
import type { KnowledgeCapture } from '../../lib/knowledge/model';
import { articleIdentityMap } from '../../lib/articleIdentity';
import { readKnowledgeBindings, restoreKnowledgeSource } from '../../lib/knowledge/source';
import { readResearch, updateResearch } from '../../lib/knowledge/research';
import { readCitations } from '../../lib/knowledge/citations';
import { KnowledgeReferencePanel } from '../knowledge/KnowledgeReferencePanel';
import { SourcePanel } from './SourcePanel';
import { InsertIcon } from './InsertElementsMenu';
import { PanelHeading } from '../global/CollapsiblePanel';
import type { RememberedEditingLocation } from '../../lib/editingLocation';

export type EditorWorkspaceProps = {
  article: WorkingArticle;
  librarySessionKey?: number;
  isLibraryCurrent?: () => boolean;
  themeUpdateAvailable: boolean;
  parsed: ReturnType<typeof parseArticle>;
  compiledCss: string;
  compiledRevision?: number | null;
  savedPreviewRevision?: number;
  documentGeneration?: number;
  sourceHistoryKey?: number;
  revision: number;
  mediaRevision?: number;
  sourceFormatIssues?: readonly ArticleFormatIssue[];
  status: { label: string; tone: Tone };
  importProgress?: ReactNode;
  mobilePane: 'source' | 'preview';
  directory: FileSystemDirectoryHandle | null;
  snippets: ArticleSnippet[];
  snippetCategories: SnippetCategory[];
  previewRef: MutableRefObject<HTMLElement | null>;
  attachPreview: (element: HTMLElement | null) => void;
  clipboardReceiverRef: MutableRefObject<HTMLDivElement | null>;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  editingLocationRef?: MutableRefObject<RememberedEditingLocation | null>;
  sourceFocusDisabled?: boolean;
  onChangeBody: (value: string) => void;
  onSnippetInserted: () => void;
  onOpenInfo: () => void;
  onOpenMediaPicker: () => void;
  onOpenTheme: () => void;
  onPaste: () => Promise<void>;
  onImportFiles: (files: File[], selection: { start: number; end: number }) => void | Promise<void>;
  onPasteConflict: () => void;
  onSetMobilePane: (pane: 'source' | 'preview') => void;
  media: ArticleMediaContext | null;
  mediaBusy: boolean;
  readOnly: boolean;
};

export function EditorWorkspace({
  article,
  librarySessionKey = 0,
  isLibraryCurrent = () => true,
  themeUpdateAvailable,
  parsed,
  compiledCss,
  compiledRevision = null,
  savedPreviewRevision = 0,
  documentGeneration = 0,
  sourceHistoryKey,
  revision,
  mediaRevision = 0,
  sourceFormatIssues,
  status,
  importProgress,
  mobilePane,
  directory,
  snippets,
  snippetCategories,
  previewRef,
  attachPreview,
  clipboardReceiverRef,
  sourceTextareaRef,
  editingLocationRef,
  sourceFocusDisabled,
  onChangeBody,
  onSnippetInserted,
  onOpenInfo,
  onOpenMediaPicker,
  onOpenTheme,
  onPaste,
  onImportFiles,
  onPasteConflict,
  onSetMobilePane,
  media,
  mediaBusy,
  readOnly,
}: EditorWorkspaceProps) {
  const { t } = useUITranslation('editor');
  const layout = useResizableColumns();
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeVisited, setKnowledgeVisited] = useState(false);
  const [citationRequest, setCitationRequest] = useState<CitationRequest | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [pendingOrigins, setPendingOrigins] = useState<{ id: string; root: FileSystemDirectoryHandle; capture: KnowledgeCapture; citationId: string }[]>([]), [originIssue, setOriginIssue] = useState('');
  const originBusy = useRef(false);
  useEffect(() => {
    const items = pendingOrigins.filter(item => item.root === directory && parsed.body.includes('#' + item.citationId));
    if (!directory || !article.month || !article.folder || !items.length || originBusy.current) return;
    originBusy.current = true;
    void (async () => {
      for (const [sourceId, group] of Map.groupBy(items, item => item.capture.sourceId)) {
        const connection = await restoreKnowledgeSource(directory, undefined, isLibraryCurrent, sourceId);
        if (!connection.source) throw new Error(kt('researchChanged'));
        await updateResearch(directory, connection.source, data => { for (const item of group) if (!data.citations.some(entry => entry.id === item.id)) data.citations.push({ ...item.capture, id: item.id, note: '', citationId: item.citationId, articleId: article.month + '/' + article.folder }); });
      }
      setPendingOrigins(value => value.filter(item => !items.includes(item))); setOriginIssue('');
    })().catch(error => setOriginIssue(kt('citationTrackingFailed', { cause: error instanceof Error ? error.message : String(error) }))).finally(() => { originBusy.current = false; });
  }, [pendingOrigins, directory, article.month, article.folder]);
  useEffect(() => {
    const node = workspaceRef.current; if (!node || readOnly) return;
    const edit = (event: Event) => { const id = (event as CustomEvent<string>).detail; try { if (readCitations(parsed.body).entries.some(entry => entry.id === id)) setCitationRequest({ edit: id }); } catch { /* the dialog explains malformed managed text */ } };
    node.addEventListener('rainy-citation-open', edit); return () => node.removeEventListener('rainy-citation-open', edit);
  }, [parsed.body, readOnly]);
  const { t: kt } = useUITranslation('knowledge');
  const { containerRef: gridRef, wideEnough, dragging, style: splitStyle } = layout;
  const openFindRef = useRef<(() => void) | null>(null);
  const openSourceFind = useCallback(() => {
    if (sourceFocusDisabled) return;
    if (!wideEnough && !readOnly) onSetMobilePane('source');
    requestAnimationFrame(() => openFindRef.current?.());
  }, [sourceFocusDisabled, wideEnough, readOnly, onSetMobilePane]);
  const citationTools = <CitationTools icon={<InsertIcon name="quote" className="size-4" />} body={parsed.body} textareaRef={sourceTextareaRef} onChange={onChangeBody} request={citationRequest} onConsumed={() => setCitationRequest(null)} disabled={readOnly || mediaBusy || !parsed.canCopy} loadChanges={async () => {
    if (!directory || !isLibraryCurrent()) return [];
    const ids = await articleIdentityMap(directory), path = article.month + '/' + article.folder, articleId = ids.get(path) ?? path;
    const changed: string[] = [];
    for (const binding of await readKnowledgeBindings(directory)) {
      const connection = await restoreKnowledgeSource(directory, undefined, isLibraryCurrent, binding.sourceId); if (!connection.source) continue;
      const data = await readResearch(directory, connection.source);
      changed.push(...data.citations.filter(item => item.articleId === articleId && (item.change === 'changed' || item.change === 'missing')).map(item => item.citationId));
    }
    return changed;
  }} onReferenced={async (capture, citationId) => {
    if (!directory || !isLibraryCurrent()) throw new Error(kt('researchChanged'));
    if (!article.month || !article.folder) { setPendingOrigins(value => [...value, { id: crypto.randomUUID(), root: directory, capture, citationId }]); return; }
    const connection = await restoreKnowledgeSource(directory, undefined, isLibraryCurrent, capture.sourceId);
    if (!connection.source || connection.binding?.sourceId !== capture.sourceId || !isLibraryCurrent()) throw new Error(kt('researchChanged'));
    await updateResearch(directory, connection.source, data => { data.citations.push({ ...capture, id: crypto.randomUUID(), note: '', citationId, articleId: article.month + '/' + article.folder }); });

  }} scope={librarySessionKey + ':' + (sourceHistoryKey ?? documentGeneration)} />;
  const diagnosticErrors = parsed.diagnostics.filter((item) => item.level === 'error');

  return (
    <div ref={workspaceRef} className="editor-workspace" data-wide={wideEnough} data-read-only={readOnly}>
      {!readOnly && (!wideEnough || diagnosticErrors.length > 0) ? <div className="editor-workspace-toolbar">
        <div className="preview-toggle" role="group" aria-label={t('editor:workspace.panes')}>
          <button type="button" aria-pressed={mobilePane === 'source'} data-active={mobilePane === 'source'} onClick={() => onSetMobilePane('source')} disabled={mediaBusy}>{t('editor:workspace.body')}</button>
          <button type="button" aria-pressed={mobilePane === 'preview'} data-active={mobilePane === 'preview'} onClick={() => onSetMobilePane('preview')} disabled={mediaBusy}>{t('editor:workspace.preview')}</button>
        </div>
        {diagnosticErrors.length ? <p className="editor-diagnostic-summary" role="alert">{t('editor:workspace.metadataPaused')}</p> : null}
      </div> : null}
      <div ref={gridRef} className={readOnly && !wideEnough ? 'editor-grid grid-rows-2' : 'editor-grid'} data-wide={wideEnough} data-dragging={dragging} style={splitStyle}>
        <div className="editor-source-pane" data-mobile-hidden={!readOnly && mobilePane === 'preview'}>
          <SourcePanel
            article={article}
            parsed={parsed}
            revision={revision}
            mediaRevision={mediaRevision}
            resourceSessionKey={media?.sessionKey}
            sourceFormatIssues={sourceFormatIssues}
            sourceHistoryKey={sourceHistoryKey}
            status={status}
            importProgress={importProgress}
            mobilePane={mobilePane}
            directory={directory}
            snippets={snippets}
            snippetCategories={snippetCategories}
            sourceTextareaRef={sourceTextareaRef}
            editingLocationRef={editingLocationRef}
            sourceFocusDisabled={sourceFocusDisabled}
            openFindRef={openFindRef}
            onChangeBody={onChangeBody}
            onSnippetInserted={onSnippetInserted}
            onImportFiles={onImportFiles}
            onPasteConflict={onPasteConflict}
            onOpenInfo={onOpenInfo}
            onOpenMediaPicker={onOpenMediaPicker}
            mediaBusy={mediaBusy}
            readOnly={readOnly}
            citationTools={citationTools}
            citationStatus={<>{!article.folder && pendingOrigins.length ? <span className="text-xs text-muted">{kt('citationAfterSave')}</span> : null}{originIssue ? <span role="alert" className="text-xs text-danger">{originIssue}</span> : null}</>}
          />
        </div>
        <ColumnSplitter layout={layout} label={t('editor:workspace.resize')} />
        <div className="editor-preview-pane flex-col" data-mobile-hidden={!readOnly && mobilePane === 'source'}>
          <PreviewPanel
            onOpenSourceFind={openSourceFind}
            referenceOpen={knowledgeOpen}
            referencePanel={<div className="flex min-h-0 shrink-0 flex-col border-b border-line bg-editor-surface has-[>[aria-expanded=true]]:flex-1">
              <PanelHeading compact title={kt('referencePanel')} expanded={knowledgeOpen} aria-controls="editor-knowledge-content" onClick={() => { setKnowledgeVisited(true); setKnowledgeOpen(value => !value); }} />
              <div id="editor-knowledge-content" className={knowledgeOpen ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                {knowledgeVisited ? <KnowledgeReferencePanel root={directory} sessionKey={librarySessionKey} scope={sourceHistoryKey ?? documentGeneration ?? 0} isRootCurrent={isLibraryCurrent} disabled={!directory || readOnly || mediaBusy || !parsed.canCopy} onCite={(capture, excerpt) => setCitationRequest({ capture, excerpt })} /> : null}
              </div>
            </div>}
            onOpenTheme={onOpenTheme}
            article={article}
            themeUpdateAvailable={themeUpdateAvailable}
            parsed={parsed}
            compiledCss={compiledCss}
            compiledRevision={compiledRevision}
            savedPreviewRevision={savedPreviewRevision}
            documentGeneration={documentGeneration}
            directory={directory}
            mobilePane={mobilePane}
            previewRef={previewRef}
            sourceTextareaRef={sourceTextareaRef}
            attachPreview={attachPreview}
            clipboardReceiverRef={clipboardReceiverRef}
            media={media}
            onPaste={onPaste}
            mediaBusy={mediaBusy}
            readOnly={readOnly}
          />
        </div>
      </div>
      {parsed.diagnostics.length ? <section className="diagnostic-stack editor-diagnostics" aria-label={t('editor:workspace.diagnostics')}>{parsed.diagnostics.map((diagnostic, index) => <p key={`${diagnostic.message}-${index}`} className="diagnostic" data-level={diagnostic.level}>{formatDiagnosticMessage(diagnostic, t)}</p>)}</section> : null}
    </div>
  );
}
