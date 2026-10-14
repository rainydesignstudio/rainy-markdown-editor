'use client';

import { formatProductMessage, productCause, productErrorMessage, productReference, productText, type ProductMessageInfo } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useRef, useState } from 'react';
import { isContentFileId, saveArticleTemplate } from '../../lib/contentLibraries';
import { parseArticle, updateFrontMatter } from '../../lib/frontMatter';
import { articleFormatMessageReference } from '../../lib/articleFormat';
import { validateContentSource, type ContentValidationResult } from '../../lib/contentValidation';
import type { ArticleTemplate, SnippetCategory, SnippetCategoryIcon } from '../../lib/types';
import { ContentMetadataDialog } from './ContentMetadataDialog';
import { ContentMetadataEditor, type TemplateMetadataInputs } from './ContentMetadataEditor';

export function CreateTemplateFromArticleDialog({ source, dirty, root, categories, templates, isCurrent, onCreated, onClose }: {
  source: string;
  dirty: boolean;
  root: FileSystemDirectoryHandle;
  categories: SnippetCategory[];
  templates: ArticleTemplate[];
  isCurrent: () => boolean;
  onCreated: (template: ArticleTemplate, formatIssueCount: number, hasLocalMedia: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const [fileId, setFileId] = useState(() => `template-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`);
  const [templateSource, setTemplateSource] = useState(() => {
    const now = new Date().toISOString();
    return updateFrontMatter(source, { createdAt: now, updatedAt: now, templateIcon: 'document' });
  });
  const initial = parseArticle(source).metadata;
  const [inputs, setInputs] = useState<TemplateMetadataInputs>(() => ({ title: initial.title, author: initial.author, description: initial.description, categories: initial.categories.join(', ') }));
  const [categoryId, setCategoryId] = useState<string | undefined>(() => categories[0]?.id);
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ signature: string; result: ContentValidationResult } | null>(null);
  const [error, setError] = useState<string | ProductMessageInfo | { message: string }>('');
  const savingRef = useRef(false);
  const parsed = parseArticle(templateSource);
  const invalid = parsed.diagnostics.some(item => item.level === 'error');
  const hasLocalMedia = /(?:^|[\s('"=])(?:\.\/)?media\//m.test(parsed.body);
  const fileError = !fileId || !isContentFileId(fileId)
    ? productText("uiFeedback.filenameInvalid")
    : templates.some(template => template.id === fileId) ? productText("uiFeedback.filenameExists") : '';
  const signature = JSON.stringify([fileId, categoryId, templateSource]);
  const validated = validation?.signature === signature && !validation.result.errors.length;
  const changeField = (field: keyof TemplateMetadataInputs, value: string) => {
    setInputs(previous => ({ ...previous, [field]: value }));
    const patch = field === 'categories' ? { categories: value.split(/[,，]/).map(item => item.trim()).filter(Boolean) } : { [field]: value };
    setTemplateSource(previous => updateFrontMatter(previous, patch));
  };
  const validate = async (): Promise<boolean> => {
    if (savingRef.current || fileError || !categoryId || invalid || !isCurrent()) return false;
    savingRef.current = true; setBusy(true); setValidating(true); setValidation(null); setError('');
    try {
      const result = await validateContentSource('templates', templateSource);
      if (!isCurrent()) return false;
      setValidation({ signature, result });
      if (result.errors.length) setError(productReference("createTemplateFromArticleDialog.validationFailedNothingWasCreated", { "details": result.errorMessage ?? result.errors.join('；') }));
      return !result.errors.length;
    } catch (cause) {
      if (isCurrent()) setError(productReference("createTemplateFromArticleDialog.validationFailed", { "cause": productCause(cause) }));
      return false;
    } finally {
      savingRef.current = false;
      if (isCurrent()) { setBusy(false); setValidating(false); }
    }
  };
  const save = async (validateFirst = false) => {
    if (savingRef.current || fileError || !categoryId || invalid || !isCurrent()) return;
    if (!validated) { const passed = await validate(); if (!validateFirst || !passed || !isCurrent()) return; }
    savingRef.current = true;
    setBusy(true);
    setError('');
    let formatIssueCount = 0;
    let completed = false;
    try {
      const template = await saveArticleTemplate(root, fileId, templateSource, null, categoryId, issues => { formatIssueCount = issues.length; });
      completed = true;
      if (isCurrent()) onCreated(template, formatIssueCount, hasLocalMedia);
      else onClose();
    } catch (cause) {
      if (isCurrent()) setError(productErrorMessage(cause));
    } finally {
      savingRef.current = false;
      if (!completed && isCurrent()) setBusy(false);
    }
  };
  return <ContentMetadataDialog kind="templates" creating busy={busy} validating={validating} onValidate={() => validate()} validationDisabled={Boolean(fileError || !categoryId || invalid || !isCurrent())} saveDisabled={Boolean(fileError || !categoryId || invalid || !isCurrent() || !validated)} submitLabel={t('dialogs:ui.createTemplate')} shortcutEnabled onShortcut={() => save(true)} error={error} status={validated ? validation.result.issues.length ? t('dialogs:templates.validatedConcerns', { count: validation.result.issues.length, details: formatProductMessage(articleFormatMessageReference(validation.result.issues), t) }) : t('dialogs:ui.validationPassedYouCanCreateTheStarterTemplate') : undefined} statusTone={validation?.result.issues.length ? 'warning' : 'success'} onClose={onClose} onSave={() => void save()}>
    <div className="grid gap-4">
      <p className="rounded-lg border border-line bg-list/50 p-4 text-sm text-muted">{t('dialogs:ui.useTheFullCurrentDraftBody')}{dirty ? t('dialogs:ui.includingUnsavedEdits') : ''}{t('dialogs:ui.creatingATemplateLeavesTheCurrentArticleUnchanged')}</p>
      {hasLocalMedia ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">{t('dialogs:ui.theBodyReferencesLocalMediaTemplatesStoreText')}</p> : null}
      {!categories.length ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">{t('dialogs:ui.thisLibraryHasNoTemplateCategoriesCreateOne')}</p> : null}
      {invalid ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">{t('dialogs:ui.repairManuscriptMetadataBeforeCreatingATemplate')}</p> : null}
      <ContentMetadataEditor fileId={fileId} fileError={fileError} creating creationSavesContent onFileIdChange={setFileId} metadata={parsed.metadata} inputs={inputs} categories={categories} categoryId={categoryId} onCategoryChange={setCategoryId} disabled={busy} invalid={invalid} onSnippetChange={() => {}} onMetadataChange={changeField} onTemplateIconChange={(icon: SnippetCategoryIcon) => setTemplateSource(previous => updateFrontMatter(previous, { templateIcon: icon }))} />
    </div>
  </ContentMetadataDialog>;
}
