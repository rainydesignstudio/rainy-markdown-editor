'use client';

import { formatDiagnosticMessage, formatProductMessage, productCause, productLabel, productText, productReference, productErrorLabel, type ProductMessageInfo } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { PageHeading } from '../global/PageHeading';
import { getFormatSnapshot } from '../../lib/article-format/runtime';

import { ButtonBar } from '../global/ButtonBar';
import { CollapsiblePanel, PanelHeading } from '../global/CollapsiblePanel';
import { TooltipButton } from '../global/TooltipButton';
import { CategoryIcon, SnippetCategoryDialog } from './SnippetCategoryDialog';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { createArticleSource, parseArticle, replaceArticleBody, updateFrontMatter } from '../../lib/frontMatter';
import { refreshRootSession } from '../../lib/rootSession';
import {
  deleteArticleSnippet, deleteArticleTemplate, loadArticleSnippets, loadArticleTemplates,
  saveArticleSnippet, saveArticleTemplate, saveSnippetCategory, saveTemplateCategory, isContentFileId, type ContentLibraryIssue,
} from '../../lib/contentLibraries';
import { readTemplateTab, templateHref, type TemplateTab } from '../../lib/templateNavigation';
import type { NavigationGuard } from '../../hooks/useRouteNavigation';
import type { ArticleSnippet, ArticleTemplate, SnippetCategory, SnippetCategoryIcon, ThemeConfig } from '../../lib/types';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { articleFormatMessage, articleFormatMessageReference, type ArticleFormatIssue } from '../../lib/articleFormat';
import { validateContentSource, type ContentValidationResult } from '../../lib/contentValidation';
import { SnippetTextarea } from './SnippetTextarea';
import { ContentRenderPreview } from './ContentRenderPreview';
import { ContentMetadataEditor, type TemplateMetadataInputs } from './ContentMetadataEditor';
import { ContentMetadataDialog } from './ContentMetadataDialog';
import { TemplateArticleCategoryTags } from './TemplateArticleCategoryTags';
import { PreviewModeSwitch } from '../editor/PreviewModeSwitch';
import { ArticleThemeSelect } from '../themes/ArticleThemeSelect';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColumnSplitter } from '../global/ColumnSplitter';

type Tone = 'neutral' | 'success' | 'warning' | 'error';
type Notice = { label: string; tone: Tone };
type Draft =
  | { tab: 'snippets'; value: ArticleSnippet; original: string | null }
  | { tab: 'templates'; value: { id: string; source: string; categoryId?: string }; original: string | null; metadataInputs?: TemplateMetadataInputs };
type Operation = { tab: TemplateTab; action: 'validate' | 'save' | 'delete' | 'refresh' | 'category' } | null;
type Validation = ContentValidationResult & { formatId: string; themeSignature: string; signature: string; root: FileSystemDirectoryHandle; sessionKey: number };
type Props = {
  root: FileSystemDirectoryHandle | null;
  librariesState: 'idle' | 'loading' | 'ready' | 'failed';
  themes: readonly ThemeConfig[];
  defaultTheme: ThemeConfig;
  snippets: ArticleSnippet[];
  snippetCategories?: SnippetCategory[];
  templates: ArticleTemplate[];
  templateCategories?: SnippetCategory[];
  snippetIssues: ContentLibraryIssue[];
  templateIssues: ContentLibraryIssue[];
  sessionKey: number;
  registerNavigationGuard: (guard: NavigationGuard) => () => void;
  isRootCurrent: (root: FileSystemDirectoryHandle, sessionKey: number) => boolean;
  onSnippetsChange: (root: FileSystemDirectoryHandle, sessionKey: number, items: ArticleSnippet[], issues: ContentLibraryIssue[], categories?: SnippetCategory[]) => void;
  onTemplatesChange: (root: FileSystemDirectoryHandle, sessionKey: number, items: ArticleTemplate[], issues: ContentLibraryIssue[], categories?: SnippetCategory[]) => void;
};

const TABS: { id: TemplateTab }[] = [
  { id: 'snippets' }, { id: 'templates' },
];

function Icon({ name }: { name: 'snippet' | 'document' | 'plus' | 'edit' | 'delete' | 'save' | 'cancel' | 'arrow' | 'check' }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'snippet' ? <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /></> : name === 'document' ? <><path d="M5 3h10l4 4v14H5V3ZM14 3v5h5M9 12h6M9 16h4" /></> : name === 'plus' ? <path d="M12 4v16M4 12h16" /> : name === 'edit' ? <path d="m4 20 4-.8L20 7l-3-3L4.8 16 4 20ZM14 7l3 3" /> : name === 'delete' ? <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></> : name === 'save' ? <path d="M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6" /> : name === 'cancel' ? <path d="m6 6 12 12M6 18 18 6" /> : name === 'check' ? <path d="m5 12 4 4L19 6" /> : <path d="m9 5 7 7-7 7" />}
  </svg>;
}


function upsert<T extends { id: string; name: string }>(items: T[], next: T): T[] {
  return [...items.filter((item) => item.id !== next.id), next].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function dirty(draft: Draft | null): boolean {
  return Boolean(draft && (draft.original === null || JSON.stringify(draft.value) !== draft.original));
}

function originalId(draft: Draft): string | null {
  return draft.original === null ? null : JSON.parse(draft.original).id;
}

function fileIdentity(draft: Draft, unnamed = productText("contentLibrary.notNamedYet")): string {
  return draft.value.id ? `${draft.value.id}${draft.tab === 'snippets' ? '.json' : '.md'}` : unnamed;
}

export function ContentLibrary(props: Props) {
  const { t } = useUITranslation('content');
  const { root, librariesState, sessionKey, themes, defaultTheme, snippets, snippetCategories = [], templates, templateCategories = [], snippetIssues, templateIssues, registerNavigationGuard, isRootCurrent, onSnippetsChange, onTemplatesChange } = props;
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [categoryDraft, setCategoryDraft] = useState<{ value: SnippetCategory; tab: TemplateTab; originalId: string | null } | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [tab, setTab] = useState<TemplateTab>('snippets');
  const [selectedIds, setSelectedIds] = useState<Record<TemplateTab, string | null>>({ snippets: null, templates: null });
  const [drafts, setDrafts] = useState<Record<TemplateTab, Draft | null>>({ snippets: null, templates: null });
  const [metadataDialog, setMetadataDialog] = useState<{ draft: Draft; baseline: string } | null>(null);
  const { dark, toggle } = useArticlePreviewMode();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const previewTheme = themes.find((item) => item.id === selectedThemeId) ?? defaultTheme;
  const [notices, setNotices] = useState<Record<TemplateTab, Notice>>({
    snippets: { ...productLabel("contentLibrary.typeASnippetTriggerInTheBodyThenPressSpaceToExpand"), tone: 'neutral' },
    templates: { ...productLabel("contentLibrary.chooseAStarterTemplateWhenCreatingAnArticleItsStructureIsRetained"), tone: 'neutral' },
  });
  const [refreshPending, setRefreshPending] = useState<Record<TemplateTab, boolean>>({ snippets: false, templates: false });
  const [operation, setOperation] = useState<Operation>(null);
  const operationLock = useRef(false);
  const [validations, setValidations] = useState<Record<TemplateTab, Validation | null>>({ snippets: null, templates: null });
  const validationRef = useRef(validations);
  const validated = (target: Draft | null) => {
    const result = target && validationRef.current[target.tab];
    return Boolean(result && target && result.root === root && result.sessionKey === sessionKey && result.formatId === getFormatSnapshot().id && result.themeSignature === JSON.stringify(previewTheme) && result.signature === JSON.stringify(target.value) && !result.errors.length);
  };
  const [confirmDelete, setConfirmDelete] = useState<{ tab: TemplateTab; id: string; name: string } | null>(null);
  const [decision, setDecision] = useState<{ label: string; scope: 'page' | 'tab'; run: () => void } | null>(null);
  const current = useRef({ drafts, operation, metadataDialog });
  current.current = { drafts, operation, metadataDialog };
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const notice = notices[tab];
  const draft = drafts[tab];
  const items = tab === 'snippets' ? snippets : templates;
  const selected = items.find((item) => item.id === selectedIds[tab]) ?? items[0] ?? null;
  const issues = tab === 'snippets' ? snippetIssues : templateIssues;
  const canManage = Boolean(root && librariesState === 'ready');
  const busy = operation !== null;
  const name = tab === 'snippets' ? productText("snippetCategoryIcons.snippet") : productText("contentLibrary.starterTemplate");
  const uiName = t('content:nouns.' + tab);
  const categories = tab === 'snippets' ? snippetCategories : templateCategories;
  const isCurrent = (expectedRoot: FileSystemDirectoryHandle) => isRootCurrent(expectedRoot, sessionKey);
  const report = (kind: TemplateTab, label: string | ProductMessageInfo, tone: Tone = 'neutral') => setNotices((previous) => ({ ...previous, [kind]: { ...productErrorLabel(label), tone } }));
  const replaceDraft = (kind: TemplateTab, next: Draft | null) => setDrafts((previous) => ({ ...previous, [kind]: next }));

  useEffect(() => {
    setTab(readTemplateTab(window.location.search));
    const syncTab = () => {
      if (operationLock.current) {
        window.history.replaceState(window.history.state, '', templateHref(tabRef.current));
        return;
      }
      setTab(readTemplateTab(window.location.search));
    };
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);

  useEffect(() => registerNavigationGuard((proceed) => {
    if (operationLock.current) return true;
    if (!dirty(current.current.drafts.snippets) && !dirty(current.current.drafts.templates) && (!current.current.metadataDialog || JSON.stringify(current.current.metadataDialog.draft.value) === current.current.metadataDialog.baseline)) return false;
    setDecision({ label: productText("contentLibrary.leaveTheTemplatePage"), scope: 'page', run: () => {
      setDrafts({ snippets: null, templates: null });
      setMetadataDialog(null);
      proceed();
    } });
    return true;
  }), [registerNavigationGuard]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty(current.current.drafts.snippets) && !dirty(current.current.drafts.templates) && (!current.current.metadataDialog || JSON.stringify(current.current.metadataDialog.draft.value) === current.current.metadataDialog.baseline) && !operationLock.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const requestDecision = (label: string, run: () => void) => {
    if (operationLock.current) return;
    if (dirty(drafts[tab])) setDecision({ label, scope: 'tab', run });
    else run();
  };

  const switchTab = (next: TemplateTab, focus = false) => {
    if (operationLock.current) return;
    setTab(next);
    tabRef.current = next;
    window.history.replaceState(window.history.state, '', templateHref(next));
    if (focus) document.getElementById(`template-tab-${next}`)?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, kind: TemplateTab) => {
    const next = event.key === 'Home' ? 'snippets' : event.key === 'End' ? 'templates'
      : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? (kind === 'snippets' ? 'templates' : 'snippets') : null;
    if (next) { event.preventDefault(); switchTab(next, true); }
  };

  const beginCreate = () => requestDecision(productText("contentLibrary.create", { "name": productReference(tab === "snippets" ? "snippetCategoryIcons.snippet" : "contentLibrary.starterTemplate") }), () => {
    if (!root || !canManage || !isCurrent(root)) return;
    const id = '';
    const next: Draft = tab === 'snippets'
      ? { tab, original: null, value: { id, name: '自定义片段', trigger: '//my-snippet', description: '', content: '▌\n', ...(snippetCategories[0] ? { categoryId: snippetCategories[0].id } : {}) } }
      : { tab, original: null, value: { id, source: `${createArticleSource('新起稿模板', previewTheme.id)}\n# 新起稿模板\n\n[在此补充正文]\n`, ...(templateCategories[0] ? { categoryId: templateCategories[0].id } : {}) } };
    replaceDraft(tab, next);
    setMetadataDialog({ draft: next, baseline: JSON.stringify(next.value) });
    report(tab, productReference("contentLibrary.editingANewSaveItToReuseIt", { "name": name }));
  });

  const draftFromEntry = (entry: ArticleSnippet | ArticleTemplate): Draft => {
    const value = tab === 'snippets' ? entry as ArticleSnippet : { id: entry.id, source: (entry as ArticleTemplate).source, ...((entry as ArticleTemplate).categoryId ? { categoryId: (entry as ArticleTemplate).categoryId } : {}) };
    return tab === 'snippets'
      ? { tab, value: value as ArticleSnippet, original: JSON.stringify(value) }
      : { tab, value: value as { id: string; source: string; categoryId?: string }, original: JSON.stringify(value) };
  };
  const selectedDraft = (): Draft | null => draft ?? (selected ? draftFromEntry(selected) : null);
  const edit = () => {
    if (!root || !canManage || busy || !isCurrent(root)) return;
    const next = selectedDraft();
    if (next) setMetadataDialog({ draft: next, baseline: JSON.stringify(next.value) });
  };
  const editEntry = (entry: ArticleSnippet | ArticleTemplate) => {
    if (!root || !canManage || busy || !isCurrent(root)) return;
    const expectedRoot = root;
    const sameDraft = Boolean(draft && draft.original !== null && originalId(draft) === entry.id);
    const open = () => {
      if (!isCurrent(expectedRoot)) return;
      const next = sameDraft ? draft! : draftFromEntry(entry);
      if (!sameDraft) replaceDraft(tab, null);
      setSelectedIds(previous => ({ ...previous, [tab]: entry.id }));
      setMetadataDialog({ draft: next, baseline: JSON.stringify(next.value) });
    };
    if (sameDraft) open();
    else requestDecision(productText("contentLibrary.editInformation", { "name": name }), open);
  };

  const refresh = (kind: TemplateTab, expectedRoot: FileSystemDirectoryHandle) => kind === 'snippets'
    ? refreshRootSession(expectedRoot, isCurrent, loadArticleSnippets, (result) => onSnippetsChange(expectedRoot, sessionKey, result.snippets, result.issues, result.categories))
    : refreshRootSession(expectedRoot, isCurrent, loadArticleTemplates, (result) => onTemplatesChange(expectedRoot, sessionKey, result.templates, result.issues, result.categories));

  const validate = async (target: Draft | null = selectedDraft()): Promise<boolean> => {
    if (!target || !root || !canManage || operationLock.current || !isCurrent(root)) return false;
    const operationRoot = root;
    const signature = JSON.stringify(target.value);
    operationLock.current = true;
    setOperation({ tab: target.tab, action: 'validate' });
    validationRef.current = { ...validationRef.current, [target.tab]: null };
    setValidations(validationRef.current);
    report(target.tab, productReference("contentLibrary.validating"));
    try {
      const formatId = getFormatSnapshot().id;
      const result = await validateContentSource(target.tab, target.tab === 'snippets' ? target.value.content : target.value.source, { theme: previewTheme });
      if (!isCurrent(operationRoot)) return false;
      if (getFormatSnapshot().id !== formatId) return false;
      const record = { ...result, signature, root: operationRoot, sessionKey, formatId, themeSignature: JSON.stringify(previewTheme) };
      validationRef.current = { ...validationRef.current, [target.tab]: record };
      setValidations(validationRef.current);
      report(target.tab, result.errors.length ? productReference("contentLibrary.validationFailedNothingWasSaved", { "details": result.errorMessage ?? result.errors.join('；') }) : result.issues.length ? productReference("contentLibrary.validationPassedFormatConcernsRequiringReview", { "result_issuesCount": result.issues.length, "value": articleFormatMessageReference(result.issues) }) : productReference("contentLibrary.validationPassedCurrentContentCanBeSaved"), result.errors.length ? 'error' : result.issues.length ? 'warning' : 'success');
      return !result.errors.length;
    } catch (cause) {
      if (isCurrent(operationRoot)) report(target.tab, productReference("createTemplateFromArticleDialog.validationFailed", { "cause": productCause(cause) }), 'error');
      return false;
    } finally {
      operationLock.current = false;
      if (isCurrent(operationRoot)) setOperation(null);
    }
  };

  const finishRefresh = async (kind: TemplateTab, expectedRoot: FileSystemDirectoryHandle, success: string | ProductMessageInfo, tone: Tone = 'success') => {
    let result: Awaited<ReturnType<typeof refresh>>;
    try { result = await refresh(kind, expectedRoot); } catch (error) { result = { kind: 'failed', error }; }
    if (!isCurrent(expectedRoot) || result.kind === 'stale') return;
    setRefreshPending((previous) => ({ ...previous, [kind]: result.kind === 'failed' }));
    report(kind, result.kind === 'failed' ? productReference("contentLibrary.butTheListCouldNotRefreshTheOperationCompletedRetryRefreshDo", { "success": success }) : success, result.kind === 'failed' ? 'warning' : tone);
  };

  const save = async (target: Draft | null = draft, keepSource = false, validateFirst = false): Promise<boolean> => {
    if (!root || !canManage || !target || !dirty(target) || operationLock.current || !isCurrent(root)) return false;
    if (!isContentFileId(target.value.id)) {
      report(target.tab, productReference("contentLibrary.enterAFilenameFirstLowercaseLettersNumbersAndHyphensWithAtMost"), 'warning');
      setDecision(null);
      setMetadataDialog({ draft: target, baseline: JSON.stringify(target.value) });
      return false;
    }
    if (!target.original && !target.value.categoryId) {
      report(target.tab, productReference("contentLibrary.chooseACategoryBeforeCreatingContent"), 'warning');
      return false;
    }
    if (!validated(target)) {
      const passed = await validate(target);
      if (!validateFirst || !passed || !isCurrent(root)) return false;
    }
    const operationRoot = root;
    const previousId = originalId(target);
    const retained = keepSource ? drafts[target.tab] : null;
    let remaining: Draft | null = null;
    let formatIssues: ArticleFormatIssue[] = [];
    operationLock.current = true;
    setOperation({ tab: target.tab, action: 'save' });
    report(target.tab, productReference("contentLibrary.saving"));
    try {
      try {
        if (target.tab === 'snippets') {
          const saved = await saveArticleSnippet(operationRoot, target.value, previousId, issues => { formatIssues = issues; });
          if (!isCurrent(operationRoot)) return false;
          onSnippetsChange(operationRoot, sessionKey, upsert(snippets.filter(item => item.id !== previousId), saved), snippetIssues);
          if (retained?.tab === 'snippets' && originalId(retained) === previousId) remaining = { tab: 'snippets', original: JSON.stringify(saved), value: { ...saved, content: retained.value.content } };
        } else {
          const saved = await saveArticleTemplate(operationRoot, target.value.id, target.value.source, previousId, target.value.categoryId, issues => { formatIssues = issues; });
          if (!isCurrent(operationRoot)) return false;
          onTemplatesChange(operationRoot, sessionKey, upsert(templates.filter(item => item.id !== previousId), saved), templateIssues);
          if (retained?.tab === 'templates' && originalId(retained) === previousId) remaining = { tab: 'templates', original: JSON.stringify({ id: saved.id, source: saved.source, ...(saved.categoryId ? { categoryId: saved.categoryId } : {}) }), value: { id: saved.id, source: replaceArticleBody(saved.source, parseArticle(retained.value.source).body), ...(saved.categoryId ? { categoryId: saved.categoryId } : {}) } };
        }
      } catch (error) {
        if (isCurrent(operationRoot)) report(target.tab, productReference("contentLibrary.savingFailedTheDraftIsRetained", { "cause": productCause(error) }), 'error');
        return false;
      }
      replaceDraft(target.tab, dirty(remaining) ? remaining : null);
      setSelectedIds((previous) => ({ ...previous, [target.tab]: target.value.id }));
      await finishRefresh(target.tab, operationRoot, formatIssues.length ? productReference("contentLibrary.savedFormatConcernsRequiringReview", { "formatIssuesCount": formatIssues.length, "value": articleFormatMessageReference(formatIssues) }) : productReference("contentLibrary.savedExistingArticlesAreUnaffected"), formatIssues.length ? 'warning' : 'success');
      return isCurrent(operationRoot);
    } finally {
      operationLock.current = false;
      if (isCurrent(operationRoot)) setOperation(null);
    }
  };

  const remove = async () => {
    if (!root || !canManage || !confirmDelete || operationLock.current || !isCurrent(root)) return;
    const operationRoot = root;
    const target = confirmDelete;
    operationLock.current = true;
    setOperation({ tab: target.tab, action: 'delete' });
    report(target.tab, productReference("contentLibrary.deleting"));
    try {
      try {
        if (target.tab === 'snippets') await deleteArticleSnippet(operationRoot, target.id);
        else await deleteArticleTemplate(operationRoot, target.id);
      } catch (error) {
        if (isCurrent(operationRoot)) report(target.tab, productReference("controller.deletionFailed", { "cause": productCause(error) }), 'error');
        return;
      }
      if (!isCurrent(operationRoot)) return;
      if (target.tab === 'snippets') onSnippetsChange(operationRoot, sessionKey, snippets.filter((item) => item.id !== target.id), snippetIssues);
      else onTemplatesChange(operationRoot, sessionKey, templates.filter((item) => item.id !== target.id), templateIssues);
      setConfirmDelete(null);
      setSelectedIds((previous) => ({ ...previous, [target.tab]: null }));
      await finishRefresh(target.tab, operationRoot, productReference("contentLibrary.deletedExistingArticlesAreUnaffected"));
    } finally {
      operationLock.current = false;
      if (isCurrent(operationRoot)) setOperation(null);
    }
  };

  const retryRefresh = async () => {
    if (!root || !canManage || !refreshPending[tab] || operationLock.current || !isCurrent(root)) return;
    const operationRoot = root;
    const kind = tab;
    operationLock.current = true;
    setOperation({ tab: kind, action: 'refresh' });
    try { await finishRefresh(kind, operationRoot, productReference("contentLibrary.listReloadedSavingOrDeletionWasNotRepeated")); }
    finally { operationLock.current = false; if (isCurrent(operationRoot)) setOperation(null); }
  };

  const updateContent = (body: string) => {
    if (!root || !canManage || busy || !isCurrent(root)) return;
    const next = selectedDraft();
    if (!next) return;
    report(tab, productReference("contentLibrary.theBodyChangedValidateItBeforeSaving"));
    if (next.tab === 'snippets') replaceDraft('snippets', { ...next, value: { ...next.value, content: body } });
    else {
      try { replaceDraft('templates', { ...next, value: { ...next.value, source: replaceArticleBody(next.value.source, body) } }); }
      catch (error) { report('templates', error instanceof Error ? error.message : String(error), 'error'); }
    }
  };
  const openCategory = (category?: SnippetCategory) => {
    if (!root || !canManage || busy || !isCurrent(root)) return;
    setCategoryError('');
    setCategoryDraft({ tab, value: category ?? { id: '', name: productText("contentLibrary.newCategory"), description: '', order: categories.length, icon: tab === 'snippets' ? 'snippet' : 'document' }, originalId: category?.id ?? null });
  };
  const saveCategory = async () => {
    if (!root || !categoryDraft || !canManage || operationLock.current || !isCurrent(root)) return;
    const expectedRoot = root, kind = categoryDraft.tab, oldId = categoryDraft.originalId;
    operationLock.current = true;
    setOperation({ tab: kind, action: 'category' });
    setCategoryError('');
    try {
      const saved = await (kind === 'snippets' ? saveSnippetCategory : saveTemplateCategory)(expectedRoot, categoryDraft.value, oldId);
      if (!isCurrent(expectedRoot)) return;
      const nextCategories = [...(kind === 'snippets' ? snippetCategories : templateCategories).filter(item => item.id !== saved.id && item.id !== oldId), saved].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
      if (kind === 'snippets') onSnippetsChange(expectedRoot, sessionKey, snippets.map(item => item.categoryId === oldId ? { ...item, categoryId: saved.id } : item), snippetIssues, nextCategories);
      else onTemplatesChange(expectedRoot, sessionKey, templates.map(item => item.categoryId === oldId ? { ...item, categoryId: saved.id } : item), templateIssues, nextCategories);
      setDrafts(previous => {
        const retained = previous[kind];
        if (!retained || (retained.value.categoryId !== oldId && !(oldId === null && !retained.value.categoryId))) return previous;
        const original = retained.original === null ? null : JSON.stringify({ ...JSON.parse(retained.original), categoryId: saved.id });
        const next: Draft = retained.tab === 'snippets' ? { ...retained, original, value: { ...retained.value, categoryId: saved.id } } : { ...retained, original, value: { ...retained.value, categoryId: saved.id } };
        return { ...previous, [kind]: next };
      });
      setCategoryDraft(null);
      await finishRefresh(kind, expectedRoot, productReference("contentLibrary.categorySaved"));
    } catch (error) { if (isCurrent(expectedRoot)) setCategoryError(error instanceof Error ? error.message : String(error)); }
    finally { operationLock.current = false; if (isCurrent(expectedRoot)) setOperation(null); }
  };
  const renderEntry = (entry: ArticleSnippet | ArticleTemplate) => {
    const snippet = tab === 'snippets' ? entry as ArticleSnippet : null;
    const parsed = tab === 'templates' ? parseArticle((entry as ArticleTemplate).source) : null;
    const selectedEntry = (draft?.value.id ?? selected?.id) === entry.id;
    return <div key={entry.id} className="group/entry relative min-w-0">
      <PanelHeading title={entry.name} icon={<CategoryIcon name={snippet ? snippet.icon : (entry as ArticleTemplate).icon ?? 'document'} />} reserveAction={canManage} aria-label={entry.name} aria-description={parsed ? t('content:templates.articleCategories', { categories: parsed.metadata.categories.length ? parsed.metadata.categories.join('、') : t('content:ui.notSet') }) : undefined} aria-current={selectedEntry ? 'true' : undefined} data-current={selectedEntry} disabled={busy} onClick={() => requestDecision(productText("contentLibrary.switchContent"), () => { replaceDraft(tab, null); setSelectedIds(previous => ({ ...previous, [tab]: entry.id })); })} className="flex-col items-stretch gap-2 rounded-lg border border-transparent px-3 py-3 data-[current=true]:border-accent-line data-[current=true]:bg-accent-soft aria-[current=true]:text-accent-text disabled:cursor-not-allowed disabled:opacity-50" details={<span className="grid min-w-0 gap-1.5 text-left font-sans font-normal"><span className="break-words text-xs text-muted">{snippet?.description || parsed?.metadata.description || (tab === 'snippets' ? t('content:ui.reusableContentSnippet') : t('content:ui.markdownStarterStructure'))}</span>{parsed ? <TemplateArticleCategoryTags categories={parsed.metadata.categories} /> : null}<code className="break-all font-mono text-xs text-faint">{snippet?.trigger || `${entry.id}.md`}</code>{parsed?.diagnostics.some(diagnostic => diagnostic.level === 'error') ? <span className="text-xs text-danger">{t('content:ui.formatErrorsOpenSourceToRepair')}</span> : null}</span>} />
      {canManage ? <TooltipButton tooltip={t('content:templates.editInfo', { type: uiName })} type="button" aria-label={t('content:templates.editNamed', { type: uiName, name: entry.name })} disabled={busy} onClick={() => editEntry(entry)} className="button button-quiet pointer-events-none absolute top-3 right-3 size-8 min-h-0 p-0 opacity-0 transition-opacity duration-300 group-hover/entry:pointer-events-auto group-hover/entry:opacity-100 group-focus-within/entry:pointer-events-auto group-focus-within/entry:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 motion-reduce:duration-0"><Icon name="edit" /></TooltipButton> : null}
    </div>;
  };
  const selectedSource = selected ? tab === 'snippets' ? (selected as ArticleSnippet).content : (selected as ArticleTemplate).source : '';
  const fullSource = draft ? draft.tab === 'snippets' ? draft.value.content : draft.value.source : selectedSource;
  const templateParsed = tab === 'templates' ? parseArticle(fullSource) : null;
  const sourceLayout = useResizableColumns(50, undefined, `${tab}:${Boolean(draft || selected)}`);
  const draftTitle = draft?.tab === 'snippets' ? draft.value.name : draft?.tab === 'templates' ? parseArticle(draft.value.source).metadata.title : '';
  const draftDiagnostics = draft?.tab === 'templates' ? parseArticle(draft.value.source).diagnostics : [];
  const sourceValue = templateParsed ? templateParsed.body : fullSource;
  const invalidMetadata = Boolean(templateParsed && !templateParsed.canCopy);
  const sourceTitle = draft ? draftTitle || t('content:templates.untitled', { type: uiName }) : selected?.name;
  const sourceIdentity = draft ? draft.tab === 'snippets' ? `${draft.value.trigger} · ${fileIdentity(draft, t('content:ui.unnamed'))}` : fileIdentity(draft, t('content:ui.unnamed'))
    : selected ? tab === 'snippets' ? `${(selected as ArticleSnippet).trigger} · ${selected.id}.json` : `${selected.id}.md` : '';
  const infoDraft = metadataDialog?.draft;
  const infoParsed = infoDraft?.tab === 'templates' ? parseArticle(infoDraft.value.source) : null;
  const infoInvalid = Boolean(infoParsed && !infoParsed.canCopy);
  const infoFileError = infoDraft?.value.id && !isContentFileId(infoDraft.value.id)
    ? productText("contentLibrary.invalidFilenameFormatUseLowercaseLettersNumbersAndHyphens")
    : infoDraft && (infoDraft.tab === 'snippets' ? snippets : templates).some(item => item.id === infoDraft.value.id && item.id !== originalId(infoDraft))
      ? productText("uiFeedback.filenameExists") : '';
  const updateFileId = (id: string) => {
    if (!metadataDialog || !infoDraft || busy) return;
    const next: Draft = infoDraft.tab === 'snippets'
      ? { ...infoDraft, value: { ...infoDraft.value, id, ...(!infoDraft.original && (infoDraft.value.trigger === '//my-snippet' || infoDraft.value.trigger === `//${infoDraft.value.id}`) ? { trigger: `//${id || 'my-snippet'}` } : {}) } }
      : { ...infoDraft, value: { ...infoDraft.value, id } };
    setMetadataDialog({ ...metadataDialog, draft: next });
  };
  const updateInfoSnippet = (patch: Partial<ArticleSnippet>) => {
    if (metadataDialog && infoDraft?.tab === 'snippets') setMetadataDialog({ ...metadataDialog, draft: { ...infoDraft, value: { ...infoDraft.value, ...patch } } });
  };
  const updateTemplateMetadata = (field: keyof TemplateMetadataInputs, value: string) => {
    if (!metadataDialog || infoDraft?.tab !== 'templates' || infoInvalid) return;
    const patch = field === 'categories' ? { categories: value.split(/[,，]/).map(item => item.trim()).filter(Boolean) } : { [field]: value };
    const nextSource = updateFrontMatter(infoDraft.value.source, patch);
    setMetadataDialog({ ...metadataDialog, draft: { ...infoDraft, value: { ...infoDraft.value, source: nextSource }, metadataInputs: { ...infoDraft.metadataInputs, [field]: value } } });
  };
  const updateTemplateIcon = (icon: SnippetCategoryIcon) => {
    if (!metadataDialog || infoDraft?.tab !== 'templates' || infoInvalid) return;
    const source = updateFrontMatter(infoDraft.value.source, { templateIcon: icon });
    setMetadataDialog({ ...metadataDialog, draft: { ...infoDraft, value: { ...infoDraft.value, source } } });
  };
  const infoSaveTarget: Draft | null = !infoDraft ? null : infoDraft.original === null || infoInvalid ? infoDraft : infoDraft.tab === 'snippets'
    ? { ...infoDraft, value: { ...infoDraft.value, content: JSON.parse(infoDraft.original).content } }
    : { ...infoDraft, value: { ...infoDraft.value, source: replaceArticleBody(infoDraft.value.source, parseArticle(JSON.parse(infoDraft.original).source).body) } };
  const saveInfo = async (validateFirst = false) => {
    if (!infoDraft || infoInvalid || !isContentFileId(infoDraft.value.id) || infoFileError || !canManage || busy || !root || !isCurrent(root)) return;
    if (infoDraft.original === null) {
      if (!infoDraft.value.categoryId) return;
      replaceDraft(infoDraft.tab, infoDraft);
      setMetadataDialog(null);
      report(infoDraft.tab, productReference("contentLibrary.informationConfirmedContinueEditingTheBodyThenClickSaveContentToCreate"));
      return;
    }
    if (await save(infoSaveTarget, true, validateFirst)) setMetadataDialog(null);
  };
  const readonlyLabel = !root ? t('content:ui.readOnlyPresets') : librariesState === 'ready' ? t('content:ui.localLibrary') : librariesState === 'loading' ? t('content:ui.loading') : t('content:ui.editingUnavailable');
  const pendingDrafts = decision?.scope === 'page'
    ? Object.values({ ...drafts, ...(infoDraft && JSON.stringify(infoDraft.value) !== metadataDialog?.baseline ? { [infoDraft.tab]: infoDraft } : {}) }).filter((target): target is Draft => Boolean(target && dirty(target)))
    : draft ? [draft] : [];
  const infoOpen = Boolean(metadataDialog && !decision);
  const dialogOpen = Boolean(metadataDialog || decision || categoryDraft || confirmDelete);
  useEffect(() => {
    const onSaveKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (busy || event.repeat || event.isComposing || event.keyCode === 229) return;
      if (dialogOpen && !infoOpen) return;
      const form = document.getElementById(infoOpen ? 'content-information-form' : 'content-library-form') as HTMLFormElement | null;
      if (form?.reportValidity?.() === false) return;
      return infoOpen ? saveInfo(true) : save(draft, false, true);
    };
    window.addEventListener('keydown', onSaveKey);
    return () => window.removeEventListener('keydown', onSaveKey);
  }, [infoOpen, dialogOpen, busy, draft, infoSaveTarget, validations]);

  return (
    <section className="page-card overflow-hidden" aria-labelledby="template-library-title">
        <PageHeading>
          <div className="min-w-0">
            <p id="template-library-kicker" className="eyebrow">{t('content:ui.templateLibrary')}</p>
            <h2 id="template-library-title" className="page-title font-heading">{t('content:ui.templates')}</h2>
            <p className="mt-3 text-sm text-muted">{t('content:ui.keepReusablePassagesAndStarterStructuresHereFor')}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs text-faint"><span className="size-1.5 rounded-full bg-faint" aria-hidden="true" />{readonlyLabel}</span>
        </PageHeading>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
            <div className="flex min-w-0 gap-1 rounded-lg bg-list p-1" role="tablist" aria-label={t('content:ui.templateType')}>
              {TABS.map((item) => <button key={item.id} id={`template-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`template-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} disabled={busy} onClick={() => switchTab(item.id)} onKeyDown={(event) => onTabKeyDown(event, item.id)} className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-selected:bg-panel aria-selected:text-accent-text">
                <Icon name={item.id === 'snippets' ? 'snippet' : 'document'} /><span>{t('content:tabs.' + item.id)}</span><span className="font-mono text-xs text-faint">{item.id === 'snippets' ? snippets.length : templates.length}</span>
                {dirty(drafts[item.id]) ? <span className="size-1.5 rounded-full bg-accent" aria-label={t('content:ui.unsavedDraft')} /> : null}
              </button>)}
            </div>
            <ButtonBar label={t('content:ui.createLibraryContent')}><button className="button button-quiet" type="button" onClick={() => openCategory()} disabled={!canManage || busy}><Icon name="plus" />{t('content:ui.newCategory')}</button><button className="button button-primary" type="button" onClick={beginCreate} disabled={!canManage || busy}><Icon name="plus" />{t('content:ui.new')}{name}</button></ButtonBar>
          </div>

          {!root || librariesState !== 'ready' ? <div className="shrink-0 border-b border-line bg-list px-5 py-3 text-xs text-muted" role="status">
            {!root ? t('content:ui.chooseALibraryToCreateEditAndSave') : librariesState === 'loading' ? t('content:ui.readingTheLibraryEditingWillResumeWhenLoading') : t('content:ui.theLibraryDidNotLoadCompletelyEditingIs')}
          </div> : null}

          {TABS.map((item) => <div key={item.id} id={`template-panel-${item.id}`} role="tabpanel" aria-labelledby={`template-tab-${item.id}`} tabIndex={0} hidden={tab !== item.id} className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {tab === item.id ? <>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-3 lg:grid-rows-1 xl:grid-cols-4">
                <nav className="flex max-h-48 min-h-32 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 p-3 lg:max-h-none lg:min-h-0 lg:border-r lg:border-b-0" aria-label={t('content:templates.list', { type: uiName })}>
                  <p className="shrink-0 px-3 py-3 text-xs font-medium tracking-wide text-faint">{tab === 'snippets' ? t('content:ui.reusablePassages') : t('content:ui.startingPointsForArticles')}</p>
                  <div aria-label={t('content:templates.listScroll', { type: uiName })} className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
                    <>
                      {items.some(entry => !entry.categoryId) ? <CollapsiblePanel id={`${tab}-legacy`} title={t('content:ui.uncategorized')} icon={<Icon name={tab === 'snippets' ? 'snippet' : 'document'} />} count={items.filter(entry => !entry.categoryId).length} open={Boolean(expandedCategories[`${tab}:legacy`])} onToggle={() => setExpandedCategories(previous => ({ ...previous, [`${tab}:legacy`]: !previous[`${tab}:legacy`] }))} className="mt-2 shrink-0 rounded-lg" contentClassName="shrink-0 px-2 pb-2"><div className="grid gap-1">{items.filter(entry => !entry.categoryId).map(renderEntry)}</div></CollapsiblePanel> : null}
                      {categories.map(category => {
                        const grouped = items.filter(entry => entry.categoryId === category.id);
                        return <CollapsiblePanel key={category.id} id={`${tab === 'snippets' ? 'snippet' : 'template'}-category-${category.id}`} title={category.name} icon={<CategoryIcon name={category.icon} />} count={grouped.length} open={Boolean(expandedCategories[`${tab}:${category.id}`])} onToggle={() => setExpandedCategories(previous => ({ ...previous, [`${tab}:${category.id}`]: !previous[`${tab}:${category.id}`] }))} className="mt-2 shrink-0" contentClassName="shrink-0 px-2 pb-2" headingActions={<TooltipButton tooltip={t('content:ui.editCategory')} className="button button-quiet size-8 min-h-0 shrink-0 p-0 opacity-0 group-hover/panel-heading:opacity-100 group-focus-within/panel-heading:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" type="button" aria-label={t('content:templates.editCategory', { name: category.name })} disabled={!canManage || busy} onClick={() => openCategory(category)}><Icon name="edit" /></TooltipButton>}>
                          {category.description ? <p className="mb-3 px-1 text-xs text-muted">{category.description}</p> : null}
                          <div className="grid gap-1">{grouped.map(renderEntry)}{!grouped.length ? <p className="px-3 py-3 text-xs text-faint">{t('content:templates.emptyCategory', { type: uiName })}</p> : null}</div>
                        </CollapsiblePanel>;
                      })}
                    </>
                    {!items.length ? <p className="px-3 py-6 text-sm text-muted">{t('content:templates.empty', { type: uiName })}{canManage ? t('content:ui.useTheButtonAboveToCreateOne') : t('content:ui.chooseALibraryToAddContent')}</p> : null}
                  </div>
                </nav>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5 md:p-6 lg:col-span-2 xl:col-span-3">
                  {draft || selected ? <form id="content-library-form" aria-label={t('content:templates.details', { type: uiName })} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:gap-5 lg:overflow-hidden" onSubmit={(event) => { event.preventDefault(); if (dirty(draft) && !invalidMetadata) void save(); }}>
                    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-3 lg:gap-4 lg:pb-5">
                      <div className="flex min-w-0 flex-1 flex-col gap-1"><h3 className="min-w-0 break-words font-heading font-semibold text-primary">{sourceTitle}</h3><code className="min-w-0 break-all font-mono text-xs text-faint">{sourceIdentity}</code></div>
                      <ButtonBar label={t('content:ui.templateEditingActions')} className="justify-end">
                        <ArticleThemeSelect themes={themes} value={previewTheme.id} onChange={setSelectedThemeId} />
                        <PreviewModeSwitch dark={dark} onToggle={toggle} />
                        <button className="button button-quiet" type="button" disabled={!canManage || busy} onClick={edit}><Icon name="edit" />{t('content:ui.edit')}</button>
                        {selected && (!draft || draft.original !== null) ? <button className="button button-danger" type="button" aria-label={t('content:templates.deleteNamed', { type: uiName, name: selected.name })} disabled={!canManage || busy || dirty(draft)} onClick={() => setConfirmDelete({ tab, id: selected.id, name: selected.name })}><Icon name="delete" />{t('content:ui.delete')}</button> : null}
                      </ButtonBar>
                    </header>
                    <div ref={sourceLayout.containerRef} className="editor-grid group/content-preview shrink-0 lg:shrink" data-wide={sourceLayout.wideEnough} data-dragging={sourceLayout.dragging} style={sourceLayout.style}>
                    <div className="editor-source-pane min-h-64 flex-col rounded-lg border border-line focus-within:border-accent-line group-data-[wide=true]/content-preview:min-h-0">
                      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-list px-4 py-3 text-xs text-faint"><label htmlFor="template-source">{dirty(draft) ? t('content:ui.editSource') : t('content:ui.sourcePreview')}</label><span>{tab === 'snippets' ? 'MARKDOWN / HTML' : 'MARKDOWN'}</span></div>
                      <SnippetTextarea id="template-source" sourceFont="editor" value={sourceValue} snippets={[]} readOnly={!canManage} disabled={busy || invalidMetadata} ariaLabel={t('content:templates.source', { type: uiName, suffix: dirty(draft) ? t('content:ui.edit') : t('content:ui.preview') })} onChange={updateContent} />
                    </div>
                    <ColumnSplitter layout={sourceLayout} label={t('content:ui.resizeSourceAndLivePreview')} controls="template-source content-render-preview" />
                    <div className="editor-preview-pane min-h-64 group-data-[wide=true]/content-preview:min-h-0"><ContentRenderPreview key={`${tab}:${draft?.value.id ?? selected?.id}:${sessionKey}`} source={sourceValue} theme={previewTheme} blocked={invalidMetadata} dark={dark} /></div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                      <p id="template-source-help" className="min-w-0 flex-1 text-xs text-muted">{draft && !isContentFileId(draft.value.id) ? t('content:ui.clickEditToEnterAFilenameBeforeSaving') : tab === 'snippets' ? (draft?.tab === 'snippets' && !draft.value.categoryId && !draft.original ? t('content:ui.chooseACategoryInTheInformationDialogBefore') : t('content:ui.triggersStartWithUseOneMarkerToSet')) : invalidMetadata ? t('content:ui.metadataHasErrorsClickEditToRepairIt') : t('content:ui.editTheBodyInSourceUseEditFor')}</p>
                      <ButtonBar label={t('content:ui.contentSaveActions')} className="justify-end"><button className="button button-quiet" type="button" disabled={!draft || busy} onClick={() => requestDecision(productText("contentLibrary.cancelEditing"), () => { replaceDraft(tab, null); report(tab, productReference("contentLibrary.editingCancelledUnsavedContentWasDiscarded")); })}><Icon name="cancel" />{t('content:ui.cancelEditing')}</button><button className="button button-quiet" type="button" disabled={!canManage || busy || invalidMetadata} onClick={() => validate()}><Icon name="check" />{operation?.action === 'validate' ? t('content:ui.validating') : t('content:ui.validateContent')}</button><button className="button button-primary" type="submit" aria-keyshortcuts="Meta+S Control+S" title={validated(draft) ? t('content:ui.saveContentSCtrlS') : t('content:ui.validateFirstSCtrlSValidatesAndSaves')} disabled={!canManage || busy || !dirty(draft) || !validated(draft) || invalidMetadata || Boolean(draft && !draft.original && !draft.value.categoryId)}><Icon name="save" />{operation?.action === 'save' ? t('content:ui.saving') : t('content:ui.saveContent')}</button></ButtonBar>
                    </div>
                    {draftDiagnostics.some((diagnostic) => diagnostic.level === 'error') ? <div className="grid max-h-20 shrink-0 gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" role="status" aria-label={t('content:ui.templateSourceDiagnostics')}>{draftDiagnostics.filter((diagnostic) => diagnostic.level === 'error').map((diagnostic, index) => <p key={index} className="break-words text-xs text-danger">{formatDiagnosticMessage(diagnostic, t)}</p>)}</div> : null}
                  </form> : <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 text-muted"><Icon name={tab === 'snippets' ? 'snippet' : 'document'} /><h3 className="font-heading text-lg font-semibold text-primary">{t('content:templates.choose', { type: uiName })}</h3><p className="text-sm">{t('content:ui.browseTheListOrCreateYourOwnContent')}</p></div>}

                </div>
              </div>
              {issues.length ? <div className="grid max-h-24 shrink-0 gap-2 overflow-x-clip overflow-y-auto border-t border-line bg-list px-5 py-4 text-xs text-danger scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" aria-label={t('content:ui.libraryFileDiagnostics')} role="status">{issues.map((issue) => <p key={`${issue.file}:${issue.message}`} className="break-words"><strong>{issue.file}</strong> · {formatDiagnosticMessage(issue, t)}</p>)}</div> : null}
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4"><p className="status-copy min-w-0 break-words" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p>{refreshPending[tab] ? <button className="button button-quiet" type="button" disabled={!canManage || busy} onClick={() => void retryRefresh()}>{t('content:ui.retryRefreshingList')}</button> : null}</footer>
            </> : null}
          </div>)}
        </div>

      {confirmDelete && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="template-delete-title" descriptionId="template-delete-description" role="alertdialog" dismissible={!busy} onClose={() => setConfirmDelete(null)}><DialogHeader titleId="template-delete-title" eyebrow={t('common:eyebrows.deleteTemplate')} title={t('content:templates.deleteType', { type: confirmDelete.tab === 'snippets' ? t('content:ui.snippets') : t('content:ui.starterTemplates') })} closeDisabled={busy} onClose={() => setConfirmDelete(null)} /><div className="dialog-content"><p className="break-words text-sm font-medium text-primary">「{confirmDelete.name}」</p><p id="template-delete-description" className="mt-3 text-sm text-muted">{t('content:ui.deletionCannotBeUndone')}{confirmDelete.tab === 'snippets' ? t('content:ui.contentAlreadyInsertedIntoArticles') : t('content:ui.articlesAlreadyCreated')}{t('content:ui.remainUnaffected')}</p>{notice.tone === 'error' ? <p className="mt-3 text-sm text-danger" role="alert">{formatProductMessage(notice, t)}</p> : null}</div><DialogFooter><DialogActions><DialogButton disabled={busy} onClick={() => setConfirmDelete(null)}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? t('content:ui.deleting') : t('content:ui.confirmDeletion')}</DialogButton></DialogActions></DialogFooter></DialogFrame>, document.body) : null}
      {decision && typeof document !== 'undefined' ? createPortal(<UnsavedChangesDialog entries={pendingDrafts.map((target) => ({ label: target.tab === 'snippets' ? target.value.name : parseArticle(target.value.source).metadata.title || t('content:ui.untitledStarterTemplate'), detail: fileIdentity(target, t('content:ui.unnamed')) }))} description={t('content:templates.leaving', { action: formatProductMessage(decision.label, t) })} saveDisabled={!canManage || busy} saveLabel={decision.scope === 'page' ? t('content:ui.saveAndLeave') : t('content:ui.saveAndContinue')} onCancel={() => setDecision(null)} onDiscard={() => { const run = decision.run; setDecision(null); run(); }} onSave={async () => { const run = decision.run; for (const target of pendingDrafts) if (!await save(target, false, true)) return false; setDecision(null); run(); return true; }} />, document.body) : null}

      {categoryDraft && typeof document !== 'undefined' ? createPortal(<SnippetCategoryDialog value={categoryDraft.value} existing={categoryDraft.originalId !== null} kind={categoryDraft.tab} count={(categoryDraft.tab === 'snippets' ? snippets : templates).filter(item => item.categoryId === categoryDraft.originalId).length} busy={busy} error={categoryError} onChange={value => setCategoryDraft({ ...categoryDraft, value })} onClose={() => { if (!busy) setCategoryDraft(null); }} onSave={() => void saveCategory()} />, document.body) : null}

      {metadataDialog && infoDraft && !decision && typeof document !== 'undefined' ? createPortal(<ContentMetadataDialog kind={infoDraft.tab} creating={infoDraft.original === null} busy={busy} validating={operation?.action === 'validate'} onValidate={infoDraft.original !== null ? () => validate(infoSaveTarget) : undefined} validationDisabled={!canManage || infoInvalid || !isContentFileId(infoDraft.value.id) || Boolean(infoFileError)} saveDisabled={!canManage || infoInvalid || !isContentFileId(infoDraft.value.id) || Boolean(infoFileError) || (infoDraft.original !== null && (!validated(infoSaveTarget) || JSON.stringify(infoDraft.value) === metadataDialog.baseline)) || (!infoDraft.original && !infoDraft.value.categoryId)} error={notice.tone === 'error' ? formatProductMessage(notice, t) : undefined} status={notice.tone === 'success' || notice.tone === 'warning' ? formatProductMessage(notice, t) : undefined} statusTone={notice.tone === 'warning' ? 'warning' : 'success'} onClose={() => { if (!busy) setMetadataDialog(null); }} onSave={() => void saveInfo()}>
        <ContentMetadataEditor fileId={infoDraft.value.id} fileError={infoFileError} creating={infoDraft.original === null} onFileIdChange={updateFileId} snippet={infoDraft.tab === 'snippets' ? infoDraft.value : undefined} metadata={infoParsed?.metadata} inputs={infoDraft.tab === 'templates' ? infoDraft.metadataInputs : undefined} categories={infoDraft.tab === 'snippets' ? snippetCategories : templateCategories} categoryId={infoDraft.value.categoryId} onCategoryChange={categoryId => { if (infoDraft.tab === 'snippets') updateInfoSnippet({ categoryId }); else setMetadataDialog({ ...metadataDialog, draft: { ...infoDraft, value: { ...infoDraft.value, categoryId } } }); }} disabled={busy} invalid={infoInvalid} onSnippetChange={updateInfoSnippet} onMetadataChange={updateTemplateMetadata} onTemplateIconChange={updateTemplateIcon} />
        {infoDraft.tab === 'templates' && infoInvalid ? <section className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3"><p className="text-sm font-medium text-danger">{t('content:ui.repairMetadataBeforeSaving')}</p><label className="field-stack mt-3"><span className="field-label">{t('content:ui.metadataSourceIncludingBoundaries')}</span><textarea className="field min-h-32 resize-y font-editor-source text-xs" name="template-metadata-repair" aria-label={t('content:ui.repairStarterTemplateMetadata')} value={infoDraft.value.source.slice(0, infoParsed?.frontMatterRange?.end ?? 0)} onChange={event => setMetadataDialog({ ...metadataDialog, draft: { ...infoDraft, metadataInputs: undefined, value: { ...infoDraft.value, source: event.target.value + (infoParsed?.body ?? '') } } })} disabled={busy} spellCheck={false} /></label></section> : null}
      </ContentMetadataDialog>, document.body) : null}

    </section>
  );
}
