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
import { guideProfile, readGuideCompletion, rememberGuideCompletion, type GuidePlan, type GuidePhase, type GuideProgress, type GuideResult } from '../../lib/entryGuide';
import { loadArticleSettings } from '../../lib/articleSettings';
import { readStoredArticleById } from '../../lib/fileSystem';
import { getFreshGuide } from '../../lib/preparedLibrary';
import type { StoredArticle, ThemeConfig } from '../../lib/types';
import { getFormatSnapshot } from '../../lib/article-format/runtime';

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
  const [workspaceMounted, setWorkspaceMounted] = useState(false);
  const [workspacePending, setWorkspacePending] = useState(false);
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const arrivalPending = useRef<{ root: FileSystemDirectoryHandle | null; editor: boolean; resolve: () => void; reject: (error: Error) => void } | null>(null);
  const guideSetup = useRef<{ root: FileSystemDirectoryHandle; plan: string; sample?: StoredArticle; needsReload?: boolean } | null>(null);
  useEffect(() => {
    if (guideVisible !== null || !locale.ready || controller.directoryRestoreState === 'checking') return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Private browsing may deny preference storage. */ }
    const forced = new URL(window.location.href).searchParams.get('guide') === '1';
    setGuideVisible(forced || (!readGuideCompletion(storage) && !controller.directory && !controller.rememberedDirectoryName));
  }, [guideVisible, locale.ready, controller.directoryRestoreState, controller.directory, controller.rememberedDirectoryName]);
  const settleWorkspace = () => {
    const pending = arrivalPending.current;
    if (!pending) return;
    if (controller.directoryRef.current !== pending.root) { pending.reject(new Error(t('contextChanged'))); return; }
    if (!workspaceRef.current?.childElementCount) return;
    if (pending.editor && (controller.view !== 'articles' || controller.articleMode !== 'editor' || !workspaceRef.current.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)'))) return;
    pending.resolve();
  };
  const prepareGuideWorkspace = (root: FileSystemDirectoryHandle | null, editor: boolean) => new Promise<void>((resolve, reject) => {
    arrivalPending.current?.reject(new Error(t('contextChanged')));
    const timer = window.setTimeout(() => job.reject(new Error(t('workspaceUnavailable'))), 30000);
    const job = {
      root, editor,
      resolve: () => { if (arrivalPending.current !== job) return; window.clearTimeout(timer); arrivalPending.current = null; setWorkspacePending(false); resolve(); },
      reject: (error: Error) => { if (arrivalPending.current !== job) return; window.clearTimeout(timer); arrivalPending.current = null; setWorkspacePending(false); reject(error); },
    };
    arrivalPending.current = job;
    setNotificationsReady(false); setWorkspacePending(true); setWorkspaceMounted(true); setEnteredFromGuide(true);
    if (editor && (controller.view !== 'articles' || controller.articleMode !== 'editor')) controller.navigateArticleMode('editor');
    settleWorkspace();
  });
  useLayoutEffect(() => {
    if (!workspacePending || !workspaceRef.current) return;
    settleWorkspace();
    const observer = new MutationObserver(settleWorkspace);
    observer.observe(workspaceRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    return () => observer.disconnect();
  }, [workspacePending, workspaceMounted, controller.view, controller.articleMode, controller.directory]);
  const verifyGuideReady = async () => {
    const root = controller.directoryRef.current, setup = guideSetup.current;
    if (setup && setup.root !== root) throw new Error(t('contextChanged'));
    if (root) await controller.waitForEntryFonts(root, false, true);
    if (setup?.sample && root) {
      const saved = await readStoredArticleById(root, setup.sample.month, setup.sample.folder);
      if (controller.directoryRef.current !== root || saved.source !== setup.sample.source || JSON.stringify(saved.theme) !== JSON.stringify(setup.sample.theme) || !saved.themeValid || !saved.renderRecord || saved.renderRecordStale) throw new Error(t('preparationChanged'));
    }
    await prepareGuideWorkspace(root, Boolean(setup?.sample));
    return true;
  };
  const finishGuide = (remember: boolean) => {
    previewEditorAppearance(null);
    if (remember) { try { rememberGuideCompletion(window.localStorage); } catch { /* Optional preference. */ } }
    const url = new URL(window.location.href);
    if (url.searchParams.has('guide')) { url.searchParams.delete('guide'); window.history.replaceState(window.history.state, '', url); }
    setEnteredFromGuide(true);
    setArrivalVisible(true);
    setGuideVisible(false);
  };
  const reopenEntryGuide = () => controller.runWithNavigationGuard(() => controller.runAfterDraftDecision({
    label: t('reopenGuide'),
    run: () => {
      guideAudio.quiet(); guideSetup.current = null;
      setWorkspaceMounted(false); setArrivalVisible(false);
      previewEditorAppearance(null); setGuideVisible(true);
    },
  }));
  const createFromGuide = async (plan: GuidePlan, progress: GuideProgress): Promise<GuideResult> => {
    const profile = guideProfile(plan.profile);
    if (!profile) return { status: 'error', message: t('invalidProfile') };
    const identity = JSON.stringify({ ...plan, locale: locale.locale });
    const retrying = Boolean(guideSetup.current);
    let reloaded = false;
    if (!guideSetup.current) {
      const result = await controller.createDataDirectory(plan.name, profile.preset, () => progress('directory'), true, plan, detail => progress('directory', detail));
      const createdRoot = result.status === 'error' ? result.root : controller.directoryRef.current;
      if (createdRoot && (result.status === 'created' || result.status === 'error' && result.created)) guideSetup.current = { root: createdRoot, plan: identity, needsReload: result.status !== 'created' };
      if (result.status !== 'created') return result.status === 'error' ? { ...result, resumable: Boolean(guideSetup.current), message: formatProductMessage(result.message, t) } : { status: 'cancelled' };
    }
    if (guideSetup.current && guideSetup.current.plan !== identity) return { status: 'error', created: true, message: t('preparationChanged') };
    if (guideSetup.current?.needsReload) {
      progress('directory');
      const loaded = await controller.resumeEntryDirectory(guideSetup.current.root);
      if (loaded.status !== 'created') return loaded.status === 'error' ? { ...loaded, resumable: true, message: formatProductMessage(loaded.message, t) } : { status: 'cancelled' };
      guideSetup.current.needsReload = false; reloaded = true;
    }
    const root = controller.directoryRef.current, prepared = root ? getFreshGuide(root) : undefined;
    if (!root || !prepared) return { status: 'error', created: true, message: t('contextChanged') };
    const current = () => { if (controller.directoryRef.current !== root) throw new Error(t('contextChanged')); };
    try {
      progress('preferences');
      if (guideSetup.current && (guideSetup.current.root !== root || guideSetup.current.plan !== identity)) throw new Error(t('preparationChanged'));
      const sample = await readStoredArticleById(root, prepared.month, prepared.folder); current();
      const previous = guideSetup.current?.sample;
      if (previous && (previous.source !== sample.source || JSON.stringify(previous.theme) !== JSON.stringify(sample.theme))) throw new Error(t('preparationChanged'));
      if (!sample.themeValid || !sample.renderRecord || sample.renderRecordStale) throw new Error(t('sampleSaveFailed'));
      guideSetup.current = { root, plan: identity, sample };
      const settings = await loadArticleSettings(root); current();
      if (settings.issue || settings.settings.autoSave.enabled !== plan.autoSave || settings.settings.autoSnapshot.enabled !== plan.autoSnapshot) throw new Error(t('preparationChanged'));
      if (!await controller.selectEntryArticle(sample, root)) throw new Error(t('sampleUnavailable'));
      current();
      progress('fonts', { completedBytes: prepared.totalBytes, totalBytes: prepared.totalBytes, localReady: true, fontsReady: false });
      await controller.waitForEntryFonts(root, retrying && !reloaded); current();
      progress('fonts', { completedBytes: prepared.totalBytes, totalBytes: prepared.totalBytes, localReady: true, fontsReady: true });
      progress('workspace');
      await prepareGuideWorkspace(root, true); current();
      return { status: 'ready', resources: { templatePath: prepared.templatePath, samplePath: sample.filePath, themeId: prepared.themeId, themeVersion: prepared.themeVersion,
        autoSave: settings.settings.autoSave.enabled, autoSaveIntervalSeconds: settings.settings.autoSave.intervalSeconds,
        autoSnapshot: settings.settings.autoSnapshot.enabled, autoSnapshotIntervalMinutes: settings.settings.autoSnapshot.intervalMinutes, autoSnapshotMaxCount: settings.settings.autoSnapshot.maxCount } };
    } catch (error) { return { status: 'error', created: true, resumable: controller.directoryRef.current === root, message: t('createdButFailed') + formatProductMessage(error instanceof Error ? error.message : String(error), t) }; }
  };
  const openFromGuide = async (progress: GuideProgress): Promise<GuideResult> => {
    guideSetup.current = null;
    const result = await controller.openEntryDirectory(() => progress('directory'));
    if (result.status === 'created' && controller.directoryRef.current) {
      progress('fonts', { completedBytes: 0, totalBytes: 0, localReady: true, fontsReady: false });
      try { await controller.waitForEntryFonts(controller.directoryRef.current); }
      catch (error) { return { status: 'error', message: formatProductMessage(error instanceof Error ? error.message : String(error), t) }; }
      progress('fonts', { localReady: true, fontsReady: true });
      progress('workspace');
      await prepareGuideWorkspace(controller.directoryRef.current, false);
    }
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
      {guideVisible !== true || workspaceMounted ? <><EditingDraftsProvider><div ref={workspaceRef} data-guide-workspace className="hidden h-full data-[visible=true]:block" data-visible={visible} inert={guideVisible !== false || loading || !notificationsReady} aria-busy={loading}>{children}</div></EditingDraftsProvider>
        <StartupLoading fromGuide={enteredFromGuide} arrivalActive={guideVisible !== true || arrivalVisible} loading={loading || guideVisible === null} issue={controller.libraryLoadIssue} onReady={setNotificationsReady} onRetry={controller.rememberedDirectoryName ? controller.reopenRememberedDirectory : undefined} onChoose={controller.authorizeDirectory} /></> : null}
      {guideVisible ? <ToastProvider maxVisible={1}><EntryGuide audio={guideAudio} onAdoptAppearance={controller.adoptGuideAppearance} supported={controller.fileSystemReady} workspaceReady={!loading && format.loading !== true && !format.error && (controller.contentLibrariesState === 'ready' || (!controller.directory && controller.contentLibrariesState === 'idle')) && !controller.libraryLoadIssue} workspaceIssue={controller.libraryLoadIssue ? formatProductMessage(controller.libraryLoadIssue, t) : undefined} onCreate={createFromGuide} onOpen={openFromGuide} onFinish={finishGuide} onVerifyReady={verifyGuideReady} onArrival={() => setArrivalVisible(true)} onAppearance={(mode, themeId) => previewEditorAppearance({ themeId: themeId ?? appearance.themeId, colorMode: mode, custom: null })}/></ToastProvider> : null}
    </EditorContext.Provider>
  );
}

function StartupLoading({ loading, issue, onReady, onRetry, onChoose, fromGuide = false, arrivalActive = true }: { fromGuide?: boolean; arrivalActive?: boolean; loading: boolean; issue?: unknown; onReady: (ready: boolean) => void; onRetry?: () => void; onChoose: () => void }) {
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
    if (arrival.current && !arrivalActive) { onReady(false); setPresent(true); setFading(false); return; }
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
  }, [loading, failure, dismissed, onReady, arrivalActive]);
  if (!present && !loading) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas font-loading text-primary opacity-100 transition-opacity duration-300 ease-out data-[fading=true]:opacity-0 motion-reduce:transition-none" data-fading={!loading && fading} role="status" aria-live="polite" aria-label={ready ? t('common:loading.label') : undefined}>
    {arrival.current && !loading && !failure ? arrivalActive ? <GuideArrival /> : null : <div className="flex flex-col items-center gap-4 p-4">
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
