'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useEditorController } from '../../hooks/useEditorController';
import { useGuideAudio } from '../../hooks/useGuideAudio';
import { DEFAULT_EDITOR_THEME, getBuiltinEditorThemes, EDITOR_COLOR_ROLES, editorSurfaceTokens, findEditorTheme, resolveEditorThemeColors, resolveEditorThemeSurfaces } from '../../lib/editorThemes';
import type { EditorAppearance } from '../../lib/editorWorkspace';
import { applyEditorThemeCache, cacheSavedEditorTheme, readEditorThemeCache, writeEditorThemeStyles, type EditorThemeCache } from '../../lib/editorThemeCache';
import { useUILocale, useUITranslation } from './UILocaleProvider';
import { EditingDraftsProvider } from './EditingDrafts';
import { ToastProvider, ToastReadiness } from './Toast';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import { ContentIcon } from './ContentIcon';
import { EntryGuide } from '../onboarding/EntryGuide';
import { GuideArrival } from '../onboarding/GuideArrival';
import { GuideSampleRenderer, type GuideRenderRequest } from '../onboarding/GuideSampleRenderer';
import { guideProfile, guideTemplateSource, guideSampleSource, readGuideCompletion, rememberGuideCompletion, type GuidePlan, type GuidePhase, type GuideResult } from '../../lib/entryGuide';
import { loadArticleSettings, saveArticleSettings, type ArticleSettings } from '../../lib/articleSettings';
import { loadArticleTemplates, saveArticleTemplate, saveTemplateCategory } from '../../lib/contentLibraries';
import { getStoredArticleDirectory, loadThemeLibrary, readStoredArticleById, rebuildArticleIndexes, saveStoredArticle } from '../../lib/fileSystem';
import type { StoredArticle, ThemeConfig } from '../../lib/types';
import { getFormatSnapshot } from '../../lib/article-format/runtime';
import { persistRenderRecord, type PreparedRenderRecord } from '../../lib/article-format/renderRecords';

type EditorController = ReturnType<typeof useEditorController> & {
  editorAppearancePreview: EditorAppearance | null;
  previewEditorAppearance: (appearance: EditorAppearance | null) => void;
  displayedEditorAppearance: EditorAppearance;
  reopenEntryGuide: () => void;
};
const EditorContext = createContext<EditorController | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useUILocale();
  const { t } = useUITranslation('onboarding');
  const controller = useEditorController(locale.locale);
  const guideAudio = useGuideAudio();
  const format = useFormatSnapshot();
  const [editorAppearancePreview, previewEditorAppearance] = useState<EditorAppearance | null>(null);
  const [startupCache, setStartupCache] = useState<EditorThemeCache | null>(null);
  const [hasLoadedAppearance, setHasLoadedAppearance] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [enteredFromGuide, setEnteredFromGuide] = useState(false);
  const [guideVisible, setGuideVisible] = useState<boolean | null>(null);
  const guideSetup = useRef<{ root: FileSystemDirectoryHandle; plan: string; category?: boolean; template?: boolean; theme?: ThemeConfig; sample?: StoredArticle; themeIncomplete?: boolean; indexed?: boolean; rendered?: boolean; settings?: ArticleSettings; appearance?: boolean } | null>(null);
  const [guideRendering, setGuideRendering] = useState<GuideRenderRequest | null>(null);
  const renderGuideSample = (root: FileSystemDirectoryHandle, article: StoredArticle) => {
    const formatId = getFormatSnapshot().id;
    return new Promise<PreparedRenderRecord>((resolve, reject) => setGuideRendering({ root, article, formatId, isCurrent: () => controller.directoryRef.current === root && getFormatSnapshot().id === formatId, resolve, reject })).finally(() => setGuideRendering(null));
  };
  useEffect(() => {
    if (guideVisible !== null || !locale.ready || controller.directoryRestoreState === 'checking') return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Private browsing may deny preference storage. */ }
    const forced = new URL(window.location.href).searchParams.get('guide') === '1';
    setGuideVisible(forced || (!readGuideCompletion(storage) && !controller.directory && !controller.rememberedDirectoryName));
  }, [guideVisible, locale.ready, controller.directoryRestoreState, controller.directory, controller.rememberedDirectoryName]);
  const finishGuide = (remember: boolean) => {
    previewEditorAppearance(null);
    if (remember) { try { rememberGuideCompletion(window.localStorage); } catch { /* Optional preference. */ } }
    const url = new URL(window.location.href);
    if (url.searchParams.has('guide')) { url.searchParams.delete('guide'); window.history.replaceState(window.history.state, '', url); }
    setEnteredFromGuide(true);
    setGuideVisible(false);
    if (guideSetup.current?.sample && guideSetup.current.root === controller.directoryRef.current) controller.navigateArticleMode('editor');
  };
  const reopenEntryGuide = () => controller.runWithNavigationGuard(() => controller.runAfterDraftDecision({
    label: t('reopenGuide'),
    run: () => {
      guideAudio.quiet(); guideSetup.current = null;
      previewEditorAppearance(null); setGuideVisible(true);
    },
  }));
  const createFromGuide = async (plan: GuidePlan, progress: (phase: GuidePhase) => void): Promise<GuideResult> => {
    const profile = guideProfile(plan.profile);
    if (!profile) return { status: 'error', message: t('invalidProfile') };
    const identity = JSON.stringify({ ...plan, locale: locale.locale });
    if (!guideSetup.current) {
      const result = await controller.createDataDirectory(plan.name, profile.preset, () => progress('directory'), true);
      if (result.status !== 'created') return result.status === 'error' ? { ...result, message: formatProductMessage(result.message, t) } : { status: 'cancelled' };
      const root = controller.directoryRef.current;
      if (root) guideSetup.current = { root, plan: identity };
    }
    const setup = guideSetup.current;
    const root = setup?.root;
    if (!root) return { status: 'error', message: t('contextChanged'), created: true };
    if (setup.plan !== identity || controller.directoryRef.current !== root) return { status: 'error', message: t('preparationChanged'), created: true };
    const current = () => { if (controller.directoryRef.current !== root) throw new Error(t('contextChanged')); };
    try {
      progress('template');
      const themes = await loadThemeLibrary(root); current();
      const theme = setup.theme ?? themes.themes[0];
      if (!theme) throw new Error(t('missingTheme'));
      setup.theme = theme;
      if (!setup.category) {
        await saveTemplateCategory(root, { id: 'entry-guide', name: t('templateCategory'), description: '', order: 0 }); current();
        setup.category = true;
      }
      if (!setup.template) {
        await saveArticleTemplate(root, `entry-${profile.id}`, guideTemplateSource(t(`profiles.${profile.id}.title`), profile.sections.map(section => t(`sections.${section}`)), theme), null, 'entry-guide'); current();
        setup.template = true;
      }
      const templates = await loadArticleTemplates(root); current();
      if (!templates.templates.some(item => item.id === `entry-${profile.id}`)) throw new Error(t('preparationChanged'));
      controller.setTemplates(templates.templates); controller.setTemplateCategories(templates.categories);
      if (!setup.sample) {
        const saved = await saveStoredArticle(root, guideSampleSource(t(`starterExamples.${profile.id}.title`), t(`starterExamples.${profile.id}.body`), theme), theme);
        setup.sample = saved.article; setup.themeIncomplete = !saved.article.themeValid; setup.indexed = saved.indexUpdated; current();
        if (!saved.article.themeValid || !saved.indexUpdated) throw new Error(saved.indexError || t('sampleSaveFailed'));
      } else {
        const stored = await readStoredArticleById(root, setup.sample.month, setup.sample.folder); current();
        if (stored.source !== setup.sample.source || stored.themeValid && JSON.stringify(stored.theme) !== JSON.stringify(theme)) throw new Error(t('preparationChanged'));
        if (!stored.themeValid) {
          if (!setup.themeIncomplete) throw new Error(t('preparationChanged'));
          const repaired = await saveStoredArticle(root, stored.source, theme, stored.folder, stored.month, { expectedSource: stored.source }); current();
          if (!repaired.article.themeValid) throw new Error(repaired.indexError || t('sampleSaveFailed'));
          setup.sample = repaired.article;
          setup.themeIncomplete = false; setup.indexed = repaired.indexUpdated;
        } else setup.sample = stored;
        if (!setup.indexed) { await rebuildArticleIndexes(root, [stored.month]); current(); setup.indexed = true; }
      }
      if (!setup.rendered) {
        const prepared = await renderGuideSample(root, setup.sample); current();
        const stored = await readStoredArticleById(root, setup.sample.month, setup.sample.folder); current();
        if (stored.source !== setup.sample.source || JSON.stringify(stored.theme) !== JSON.stringify(theme)) throw new Error(t('preparationChanged'));
        await persistRenderRecord(root, await getStoredArticleDirectory(root, stored.month, stored.folder), prepared); current();
        setup.rendered = true;
      }
      progress('preferences');
      if (!setup.settings) {
        const loaded = await loadArticleSettings(root); current();
        if (loaded.issue) throw new Error(formatProductMessage(loaded.issue, t));
        setup.settings = await saveArticleSettings(root, { ...loaded.settings, autoSave: { ...loaded.settings.autoSave, enabled: plan.autoSave }, autoSnapshot: { ...loaded.settings.autoSnapshot, enabled: plan.autoSnapshot } }); current();
      }
      const verified = await loadArticleSettings(root); current();
      if (verified.issue || verified.settings.autoSave.enabled !== plan.autoSave || verified.settings.autoSnapshot.enabled !== plan.autoSnapshot) throw new Error(t('preparationChanged'));
      const settings = verified.settings;
      controller.setArticleSettings(settings);
      if (!setup.appearance) {
        if (!await controller.saveEditorAppearance({ themeId: plan.themeId, colorMode: plan.colorMode, custom: null })) throw new Error(t('preferencesFailed'));
        setup.appearance = true;
      }
      current();
      const sample = await readStoredArticleById(root, setup.sample.month, setup.sample.folder); current();
      if (sample.source !== setup.sample.source || !sample.themeValid) throw new Error(t('preparationChanged'));
      if (!await controller.selectEntryArticle(sample, root)) throw new Error(t('sampleUnavailable'));
      await controller.refreshArticles(root); current();
      return { status: 'ready', resources: { templatePath: `templates/entry-guide/entry-${profile.id}.md`, samplePath: sample.filePath, themeId: sample.theme.id, themeVersion: sample.theme.version, autoSave: settings.autoSave.enabled, autoSaveIntervalSeconds: settings.autoSave.intervalSeconds, autoSnapshot: settings.autoSnapshot.enabled, autoSnapshotIntervalMinutes: settings.autoSnapshot.intervalMinutes, autoSnapshotMaxCount: settings.autoSnapshot.maxCount } };
    } catch (error) { return { status: 'error', created: true, resumable: controller.directoryRef.current === root, message: t('createdButFailed') + formatProductMessage(error instanceof Error ? error.message : String(error), t) }; }
  };
  const openFromGuide = async (progress: (phase: GuidePhase) => void): Promise<GuideResult> => {
    guideSetup.current = null;
    const result = await controller.openEntryDirectory(() => progress('directory'));
    return result.status === 'created' ? { status: 'ready' } : result.status === 'error' ? { ...result, message: formatProductMessage(result.message, t) } : { status: 'cancelled' };
  };
  useLayoutEffect(() => { setStartupCache(readEditorThemeCache()); }, []);
  useLayoutEffect(() => {
    if (controller.editorAppearanceReady) {
      setStartupCache(null);
      setHasLoadedAppearance(true);
    }
  }, [controller.editorAppearanceReady]);
  const appearance = editorAppearancePreview ?? (controller.editorAppearanceReady
    ? controller.editorWorkspace.appearance : startupCache?.appearance ?? controller.editorWorkspace.appearance);
  const editorThemes = controller.editorThemes;
  const displayedThemes = guideVisible ? getBuiltinEditorThemes(locale.locale) : editorThemes;
  useLayoutEffect(() => {
    if (!controller.editorAppearanceReady && !startupCache) return;
    const root = document.documentElement;
    const systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
    root.dataset.colorMode = appearance.colorMode;
    const syncEditorColorScheme = () => {
      if (!controller.editorAppearanceReady && startupCache) {
        applyEditorThemeCache(document, startupCache, systemScheme.matches);
        return;
      }
      const mode = appearance.colorMode === 'system'
        ? (systemScheme.matches ? 'dark' : 'light')
        : appearance.colorMode;
      root.dataset.editorColorScheme = mode;
      const colorsFrom = appearance.custom?.colorThemeId ?? appearance.themeId;
      const fontsFrom = appearance.custom?.fontThemeId ?? appearance.themeId;
      const colorTheme = findEditorTheme(displayedThemes, colorsFrom) ?? DEFAULT_EDITOR_THEME;
      const fontTheme = findEditorTheme(displayedThemes, fontsFrom) ?? DEFAULT_EDITOR_THEME;
      const colors = resolveEditorThemeColors(colorTheme, mode);
      const tokens: Record<string, string> = {};
      for (const role of EDITOR_COLOR_ROLES) tokens[`--color-${role}`] = colors[role];
      Object.assign(tokens, editorSurfaceTokens(colors, resolveEditorThemeSurfaces(colorTheme)?.[mode]));
      Object.assign(tokens, {
        '--font-sans': fontTheme.fonts.ui,
        '--font-heading': fontTheme.fonts.heading,
        '--font-sub-heading': fontTheme.fonts.subHeading,
        '--font-eyebrow': fontTheme.fonts.eyebrow ?? fontTheme.fonts.ui,
        '--font-serif': fontTheme.fonts.serif,
        '--font-mono': fontTheme.fonts.mono,
        '--font-editor-source': fontTheme.fonts.editorSource,
        '--font-article-source': fontTheme.fonts.articleSource,
      });
      writeEditorThemeStyles(document, tokens);
      root.dataset.editorTheme = appearance.custom ? 'custom' : colorTheme.id;
      root.dataset.editorThemeState = 'ready';
    };
    const syncSystemScheme = () => {
      if (appearance.colorMode === 'system') syncEditorColorScheme();
    };
    syncEditorColorScheme();
    systemScheme.addEventListener('change', syncSystemScheme);
    return () => {
      systemScheme.removeEventListener('change', syncSystemScheme);
    };
  }, [appearance, displayedThemes, controller.editorAppearanceReady, startupCache]);
  useEffect(() => {
    if (!controller.editorAppearanceReady || !controller.editorAppearanceVerified || !controller.editorDirectoryId) return;
    cacheSavedEditorTheme(controller.editorDirectoryId, controller.editorWorkspace.appearance, editorThemes);
  }, [controller.editorAppearanceReady, controller.editorAppearanceVerified, controller.editorDirectoryId, controller.editorWorkspace.appearance, editorThemes]);
  const visible = controller.editorAppearanceReady || Boolean(startupCache) || hasLoadedAppearance;
  const loading = !locale.ready || !controller.editorAppearanceReady || controller.contentLibrariesState === 'loading' || (!hasLoadedAppearance && format.loading === true);
  return (
    <EditorContext.Provider value={{ ...controller, editorAppearancePreview, previewEditorAppearance, displayedEditorAppearance: appearance, reopenEntryGuide }}>
      <ToastReadiness ready={guideVisible === false && notificationsReady && !loading} />
      {guideRendering ? <GuideSampleRenderer request={guideRendering} /> : null}
      {guideVisible ? <ToastProvider maxVisible={1}><EntryGuide audio={guideAudio} onAdoptAppearance={controller.adoptGuideAppearance} supported={controller.fileSystemReady} workspaceReady={!loading && format.loading !== true && !format.error && (controller.contentLibrariesState === 'ready' || (!controller.directory && controller.contentLibrariesState === 'idle')) && !controller.libraryLoadIssue} workspaceIssue={controller.libraryLoadIssue ? formatProductMessage(controller.libraryLoadIssue, t) : undefined} onCreate={createFromGuide} onOpen={openFromGuide} onFinish={finishGuide} onAppearance={(mode, themeId) => previewEditorAppearance({ themeId: themeId ?? appearance.themeId, colorMode: mode, custom: null })}/></ToastProvider>
        : <><EditingDraftsProvider><div className="hidden h-full data-[visible=true]:block" data-visible={guideVisible === false && visible} inert={loading || guideVisible === null || !notificationsReady} aria-busy={loading}>{children}</div></EditingDraftsProvider>
          <StartupLoading fromGuide={enteredFromGuide} loading={loading || guideVisible === null} issue={controller.libraryLoadIssue} onReady={setNotificationsReady} onRetry={controller.rememberedDirectoryName ? controller.reopenRememberedDirectory : undefined} onChoose={controller.authorizeDirectory} /></>}
    </EditorContext.Provider>
  );
}

function StartupLoading({ loading, issue, onReady, onRetry, onChoose, fromGuide = false }: { fromGuide?: boolean; loading: boolean; issue?: unknown; onReady: (ready: boolean) => void; onRetry?: () => void; onChoose: () => void }) {
  const { t } = useUITranslation();
  const { ready } = useUILocale();
  const [present, setPresent] = useState(true);
  const arrival = useRef(fromGuide);
  const [fading, setFading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const failure = formatProductMessage(issue, t);
  useEffect(() => {
    if (loading) { onReady(false); setDismissed(false); setPresent(true); setFading(false); return; }
    if (failure && !dismissed) { onReady(false); setPresent(true); setFading(false); return; }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hold = arrival.current && !media.matches ? 720 : 0;
    let fade: number | null = null, timer: number | null = null, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (fade !== null) window.clearTimeout(fade);
      if (timer !== null) window.clearTimeout(timer);
      media.removeEventListener('change', syncMotion);
      arrival.current = false; setPresent(false); onReady(true);
    };
    const syncMotion = () => { if (media.matches) finish(); };
    setFading(hold === 0);
    fade = hold ? window.setTimeout(() => setFading(true), hold) : null;
    timer = window.setTimeout(finish, hold + (media.matches ? 0 : 300));
    media.addEventListener('change', syncMotion);
    return () => { if (fade !== null) window.clearTimeout(fade); if (timer !== null) window.clearTimeout(timer); media.removeEventListener('change', syncMotion); };
  }, [loading, failure, dismissed, onReady]);
  if (!present && !loading) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas font-loading text-primary opacity-100 transition-opacity duration-300 ease-out data-[fading=true]:opacity-0 motion-reduce:transition-none" data-fading={!loading && fading} role="status" aria-live="polite" aria-label={ready ? t('common:loading.label') : undefined}>
    {arrival.current && !loading && !failure ? <GuideArrival /> : <div className="flex flex-col items-center gap-4 p-4">
      {failure && !loading ? <>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-danger/30 bg-danger-surface text-danger" aria-hidden="true"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h7l2 2h9v11H3ZM3 7V4h7l2 3M12 12v3m0 2v1" /></svg></span>
          <p className="text-sm font-medium text-danger">{t('common:loading.failed')}</p>
        </div>
        <p className="max-h-48 max-w-xl overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words text-center text-sm text-muted">{failure}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry ? <button className="button button-primary" onClick={onRetry}><ContentIcon name="reset" />{t('common:loading.retry')}</button> : null}
          <button className="button button-quiet" onClick={onChoose}><ContentIcon name="folder" />{t('common:loading.choose')}</button>
          <button className="button button-quiet" onClick={() => setDismissed(true)}><ContentIcon name="expand" />{t('common:loading.continue')}</button>
        </div>
      </> : <><svg className="size-8 animate-spin text-accent motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 3a9 9 0 0 1 9 9" /></svg><p className="text-sm text-muted" hidden={!ready}>{t('common:loading.message')}</p></>}
    </div>}
  </div>;
}

export function useEditorControllerContext(): EditorController {
  const controller = useContext(EditorContext);
  if (!controller) throw new Error('useEditorControllerContext must be used inside AppProviders');
  return controller;
}
