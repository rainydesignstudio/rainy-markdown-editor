'use client';

import { useRef, useState } from 'react';
import { createArticleSource, instantiateArticleTemplate, parseArticle, updateFrontMatter } from '../../lib/frontMatter';
import { monthKey, sanitizeFolderName } from '../../lib/fileSystem';
import { productCause, productErrorLabel, productLabel, productText } from '../../lib/i18n/productMessages';
import type { EditorWorkspace } from '../../lib/editorWorkspace';
import type { ArticleTemplate, SnippetCategory, ThemeConfig, WorkingArticle } from '../../lib/types';
import { ArticleInfoDialog } from '../editor/ArticleInfoDialog';
import { TemplateDialog } from './TemplateDialog';
import { useToast } from '../global/Toast';

export function ArticleCreationDialog({ templates, categories, themes, defaultTheme, workspace, onClose, onCreate }: {
  templates: ArticleTemplate[];
  categories: SnippetCategory[];
  themes: readonly ThemeConfig[];
  defaultTheme: ThemeConfig;
  workspace: EditorWorkspace;
  onClose: () => void;
  onCreate: (source: string, theme: ThemeConfig, projectId: string | null) => Promise<boolean>;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'template' | 'information'>('template');
  const [choice, setChoice] = useState<{ template: ArticleTemplate | null; theme: ThemeConfig }>({ template: null, theme: defaultTheme });
  const [draft, setDraft] = useState<WorkingArticle | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const next = (template: ArticleTemplate | null, theme: ThemeConfig) => {
    try {
      const now = new Date().toISOString();
      let source = draft && template?.id === choice.template?.id ? draft.source
        : template ? instantiateArticleTemplate(template.source, { now, theme })
          : createArticleSource(productText('controller.untitledTechnicalManuscript'), theme.id);
      if (draft) {
        const { title, description, author, categories, createdAt } = parseArticle(draft.source).metadata;
        source = updateFrontMatter(source, { title, description, author, categories, createdAt });
      }
      source = updateFrontMatter(source, { theme: { id: theme.id, version: theme.version } });
      setChoice({ template, theme });
      setDraft({ source, theme, themeValid: true, month: null, folder: null, dirty: true });
      setStep('information');
    } catch (error) {
      toast({ key: 'article-creation', ...productLabel('controller.thisTemplateCannotBeUsedNoNewDraftWasCreated', { cause: productCause(error) }), tone: 'error' });
    }
  };
  const submit = async () => {
    if (!draft || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try { if (await onCreate(draft.source, draft.theme, projectId)) onClose(); }
    catch (error) { toast({ key: 'article-creation', ...productErrorLabel(error), tone: 'error' }); }
    finally { submitting.current = false; setBusy(false); }
  };

  if (step === 'template' || !draft) return <TemplateDialog
    templates={templates} categories={categories} themes={themes} defaultTheme={defaultTheme}
    initialTemplateId={choice.template?.id ?? null} initialThemeId={choice.theme.id}
    onClose={onClose} onCreate={next}
  />;
  const parsed = parseArticle(draft.source);
  return <ArticleInfoDialog
    article={draft} parsed={parsed} stored={null} workspace={workspace} archived={false} busy={busy}
    folderName={sanitizeFolderName(parsed.metadata.title)} onFolderName={() => {}}
    creation={{ month: monthKey(), projectId, onBack: () => setStep('template') }}
    onClose={onClose} onOpenTheme={() => setStep('template')} onChangeProject={setProjectId}
    onChangeField={(field, value) => setDraft(current => current ? {
      ...current, source: updateFrontMatter(current.source, { [field]: field === 'categories' ? value.split(',').map(item => item.trim()).filter(Boolean) : value }),
    } : current)}
    onSave={() => void submit()} onOpenHistory={() => {}} onDelete={() => {}} onUnarchive={() => {}}
  />;
}
