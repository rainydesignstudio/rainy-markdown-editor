'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useEditorController } from '../../hooks/useEditorController';
import { DEFAULT_EDITOR_THEME, EDITOR_COLOR_ROLES, editorSurfaceTokens, findEditorTheme, resolveEditorThemeColors, resolveEditorThemeSurfaces } from '../../lib/editorThemes';
import type { EditorAppearance } from '../../lib/editorWorkspace';
import { applyEditorThemeCache, cacheSavedEditorTheme, readEditorThemeCache, writeEditorThemeStyles, type EditorThemeCache } from '../../lib/editorThemeCache';
import { useUILocale, useUITranslation } from './UILocaleProvider';
import { EditingDraftsProvider } from './EditingDrafts';
import { ToastReadiness } from './Toast';
import { formatProductMessage } from '../../lib/i18n/productMessages';

type EditorController = ReturnType<typeof useEditorController> & {
  editorAppearancePreview: EditorAppearance | null;
  previewEditorAppearance: (appearance: EditorAppearance | null) => void;
  displayedEditorAppearance: EditorAppearance;
};
const EditorContext = createContext<EditorController | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useUILocale();
  const controller = useEditorController(locale.locale);
  const format = useFormatSnapshot();
  const [editorAppearancePreview, previewEditorAppearance] = useState<EditorAppearance | null>(null);
  const [startupCache, setStartupCache] = useState<EditorThemeCache | null>(null);
  const [hasLoadedAppearance, setHasLoadedAppearance] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState(false);
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
      const colorTheme = findEditorTheme(editorThemes, colorsFrom) ?? DEFAULT_EDITOR_THEME;
      const fontTheme = findEditorTheme(editorThemes, fontsFrom) ?? DEFAULT_EDITOR_THEME;
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
  }, [appearance, editorThemes, controller.editorAppearanceReady, startupCache]);
  useEffect(() => {
    if (!controller.editorAppearanceReady || !controller.editorAppearanceVerified || !controller.editorDirectoryId) return;
    cacheSavedEditorTheme(controller.editorDirectoryId, controller.editorWorkspace.appearance, editorThemes);
  }, [controller.editorAppearanceReady, controller.editorAppearanceVerified, controller.editorDirectoryId, controller.editorWorkspace.appearance, editorThemes]);
  const visible = controller.editorAppearanceReady || Boolean(startupCache) || hasLoadedAppearance;
  const loading = !locale.ready || !controller.editorAppearanceReady || controller.contentLibrariesState === 'loading' || (!hasLoadedAppearance && format.loading === true);
  return (
    <EditorContext.Provider value={{ ...controller, editorAppearancePreview, previewEditorAppearance, displayedEditorAppearance: appearance }}>
      <ToastReadiness ready={notificationsReady && !loading} />
      <EditingDraftsProvider><div className={visible ? 'h-full' : 'hidden h-full group-data-[editor-theme-state=cached]/theme:block'} inert={loading} aria-busy={loading}>{children}</div></EditingDraftsProvider>
      <StartupLoading loading={loading} issue={controller.libraryLoadIssue} onReady={setNotificationsReady} onRetry={controller.rememberedDirectoryName ? controller.reopenRememberedDirectory : undefined} onChoose={controller.authorizeDirectory} />
    </EditorContext.Provider>
  );
}

function StartupLoading({ loading, issue, onReady, onRetry, onChoose }: { loading: boolean; issue?: unknown; onReady: (ready: boolean) => void; onRetry?: () => void; onChoose: () => void }) {
  const { t } = useUITranslation();
  const { ready } = useUILocale();
  const [present, setPresent] = useState(true);
  const [fading, setFading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const failure = formatProductMessage(issue, t);
  useEffect(() => {
    if (loading) { onReady(false); setDismissed(false); setPresent(true); setFading(false); return; }
    if (failure && !dismissed) { onReady(false); setPresent(true); setFading(false); return; }
    setFading(true);
    const timer = window.setTimeout(() => { setPresent(false); onReady(true); }, 300);
    return () => window.clearTimeout(timer);
  }, [loading, failure, dismissed, onReady]);
  if (!present && !loading) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas font-loading text-primary opacity-100 transition-opacity duration-300 ease-out data-[fading=true]:opacity-0 motion-reduce:transition-none" data-fading={!loading && fading} role="status" aria-live="polite" aria-label={ready ? t('loading.label') : undefined}>
    <div className="flex flex-col items-center gap-4 p-4">
      {failure && !loading ? <><p className="text-sm font-medium text-danger">{t('loading.failed')}</p><p className="max-h-48 max-w-xl overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted">{failure}</p><div className="flex flex-wrap justify-center gap-2">{onRetry ? <button className="button button-primary" onClick={onRetry}>{t('loading.retry')}</button> : null}<button className="button button-quiet" onClick={onChoose}>{t('loading.choose')}</button><button className="button button-quiet" onClick={() => setDismissed(true)}>{t('loading.continue')}</button></div></> : <><svg className="size-8 animate-spin text-accent motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 3a9 9 0 0 1 9 9" /></svg><p className="text-sm text-muted" hidden={!ready}>{t('loading.message')}</p></>}
    </div>
  </div>;
}

export function useEditorControllerContext(): EditorController {
  const controller = useContext(EditorContext);
  if (!controller) throw new Error('useEditorControllerContext must be used inside AppProviders');
  return controller;
}
