'use client';

import { formatProductMessage, productText } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';

import { PageHeading } from '../global/PageHeading';

import { ButtonBar } from '../global/ButtonBar';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { useDraftLocation, useEditingDraft, useEditingDrafts, UnsavedMark } from '../global/EditingDrafts';
import { hasEditingDraft } from '../../lib/editingDrafts';
import { FontDownloadSettings } from './FontDownloadSettings';
import { EditorThemeDesigner } from './EditorThemeDesigner';
import type { NavigationGuard } from '../../hooks/useRouteNavigation';
import type { ArticleSettings } from '../../lib/articleSettings';
import { BASE_EDITOR_THEME, EDITOR_COLOR_ROLES, findEditorTheme, resolveEditorThemeColors, type EditorTheme, type EditorColorScheme, type EditorColorRole } from '../../lib/editorThemes';
import type { EditorThemeIssue } from '../../lib/editorThemeLibrary';
import {
  DEFAULT_EDITOR_APPEARANCE,
  EDITOR_COLOR_MODES,
  type EditorAppearance,
  type EditorColorMode,
  type EditorWorkspace,
} from '../../lib/editorWorkspace';

type Props = {
  root: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  rememberedDirectoryName: string | null;
  directoryRestoreState: 'checking' | 'idle' | 'permission-needed';
  directoryBookmarkIssue: string | null;
  directoryStatus: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
  fileSystemReady: boolean;
  settings: ArticleSettings;
  issue: string | null;
  notice: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
  busy: boolean;
  workspace: EditorWorkspace;
  workspaceIssue: string | null;
  workspaceBusy: boolean;
  editorThemes: EditorTheme[];
  editorThemeIssues: EditorThemeIssue[];
  onSave: (settings: ArticleSettings) => void;
  onAuthorizeDirectory: () => void;
  onCreateDirectory: () => void;
  onReopenRememberedDirectory: () => void;
  onRetryFonts?: () => Promise<boolean>;
  onSaveAppearance: (appearance: EditorAppearance) => Promise<boolean>;
  onCreateEditorTheme: (theme: EditorTheme, previous?: EditorTheme, expectedRoot?: FileSystemDirectoryHandle) => Promise<boolean>;
  onLoadDefaultEditorThemes: () => Promise<boolean>;
  onDeleteEditorTheme: (id: string, expectedRoot?: FileSystemDirectoryHandle) => Promise<boolean>;
  onPreviewAppearance: (appearance: EditorAppearance | null) => void;
  registerNavigationGuard: (guard: NavigationGuard) => () => void;
};

function SettingsIcon({ name }: { name: 'folder' | 'upload' | 'download' | 'export' | 'reset' | 'undo' | 'check' | 'save' | 'plus' | 'document' | 'theme' | 'history' | 'clock' | 'edit' | 'delete' }) {
  const paths = {
    edit: 'm4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4',
    delete: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    folder: 'M3 7V5h6l2 2h10v13H3V7Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
    download: 'M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6',
    export: 'M14 3h7v7M21 3l-9 9M10 4H4v16h16v-6',
    reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
    undo: 'm8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12',
    check: 'm4 12 5 5L20 6',
    save: 'M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6',
    plus: 'M12 5v14M5 12h14',
    document: 'M5 3h9l5 5v13H5V3ZM14 3v5h5M9 12h6M9 16h4',
    theme: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3-4-5-9-5Z',
    history: 'M4 10a8 8 0 1 1 1 8M4 4v6h6M12 7v5l3 2',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  };
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function sameAppearance(left: EditorAppearance, right: EditorAppearance) {
  return left.themeId === right.themeId && left.colorMode === right.colorMode
    && Boolean(left.custom) === Boolean(right.custom)
    && left.custom?.colorThemeId === right.custom?.colorThemeId
    && left.custom?.fontThemeId === right.custom?.fontThemeId;
}

const COLOR_SWATCH_BACKGROUNDS: Record<EditorColorRole, string> = {
  'canvas': 'bg-canvas',
  'rail': 'bg-rail',
  'list': 'bg-list',
  'panel': 'bg-panel',
  'hover': 'bg-hover',
  'popup-bg': 'bg-popup-bg',
  'primary': 'bg-primary',
  'secondary': 'bg-secondary',
  'muted': 'bg-muted',
  'faint': 'bg-faint',
  'popup-text': 'bg-popup-text',
  'line': 'bg-line',
  'line-strong': 'bg-line-strong',
  'accent': 'bg-accent',
  'accent-strong': 'bg-accent-strong',
  'accent-text': 'bg-accent-text',
  'accent-soft': 'bg-accent-soft',
  'accent-line': 'bg-accent-line',
  'selection': 'bg-selection',
  'search-hit': 'bg-search-hit',
  'on-accent': 'bg-on-accent',
  'success': 'bg-success',
  'success-surface': 'bg-success-surface',
  'warning': 'bg-warning',
  'warning-strong': 'bg-warning-strong',
  'warning-surface': 'bg-warning-surface',
  'warning-line': 'bg-warning-line',
  'danger': 'bg-danger',
  'on-danger': 'bg-on-danger',
  'editor-surface': 'bg-editor-surface',
  'editor-text': 'bg-editor-text',
  'editor-syntax': 'bg-editor-syntax',
  'editor-heading': 'bg-editor-heading',
  'editor-quote': 'bg-editor-quote',
};

// The twelve roles that carry a theme's identity, laid out four to a row in three families:
// surface and hairline, then the type ramp, then the accent family and the status colours. Roles
// are drawn from different families on purpose — themes routinely alias `list` to `canvas` and
// `secondary` to `primary`, and picking both of a pair would show the same colour twice.
const THEME_PALETTE_ROLES: EditorColorRole[] = [
  'canvas', 'panel', 'line-strong', 'muted',
  'primary', 'accent-soft', 'accent', 'accent-strong',
  'selection', 'success', 'warning', 'danger',
];

function ThemeSample({ theme, kind = 'both', scheme = 'light' }: { theme: EditorTheme; kind?: 'both' | 'colors' | 'fonts'; scheme?: EditorColorScheme }) {
  const { t } = useUITranslation('settings');
  const colors = resolveEditorThemeColors(theme, scheme);
  const tokens = Object.fromEntries(EDITOR_COLOR_ROLES.map((role) => [`--color-${role}`, colors[role]])) as CSSProperties;
  const fonts = { '--font-heading': theme.fonts.heading, '--font-sans': theme.fonts.ui } as CSSProperties;
  if (kind === 'colors') {
    const roles = EDITOR_COLOR_ROLES.filter((role) => role !== 'accent');
    const rows = [roles.slice(0, 16), roles.slice(16)];
    return <span className="flex overflow-hidden rounded-lg border border-line" aria-hidden="true" style={tokens}><span className="aspect-square w-1/3 shrink-0 bg-accent" data-color-role="accent" /><span className="flex min-w-0 flex-1 flex-col">{rows.map((row, index) => <span key={index} className="flex min-h-0 flex-1">{row.map((role) => <span key={role} className={`min-w-0 flex-1 ${COLOR_SWATCH_BACKGROUNDS[role]}`} data-color-role={role} />)}</span>)}</span></span>;
  }
  if (kind === 'fonts') return <span className="grid gap-1" style={fonts}><span className="font-heading text-lg text-primary">{t('settings:ui.manuscriptAa')}</span><span className="font-sans text-xs text-muted">{t('settings:ui.keepIdeasInWords')}</span></span>;
  // The ring is drawn in the theme's own `line-strong`, so a swatch that matches the card surface
  // still reads as a distinct dot instead of disappearing into it.
  return <span className="flex min-w-0 items-center justify-between gap-4 rounded-lg border p-4" aria-hidden="true" style={{ ...tokens, ...fonts, background: colors.canvas, borderColor: colors.line }}>
    <span className="grid min-w-0 gap-3"><span className="font-heading text-lg font-semibold" style={{ color: colors.primary }}>{t('settings:ui.manuscriptAa')}</span><span className="font-sans text-xs" style={{ color: colors.secondary }}>{t('settings:ui.wordsForAFreshStart')}</span></span>
    <span className="grid w-fit shrink-0 grid-cols-4 gap-1.5">{THEME_PALETTE_ROLES.map((role) => <i key={role} className={`size-3 rounded-full ring-1 ring-line-strong ${COLOR_SWATCH_BACKGROUNDS[role]}`} data-color-role={role} />)}</span>
  </span>;
}

const SETTINGS_TABS = [
  { id: 'library', icon: 'folder' },
  { id: 'appearance', icon: 'theme' },
  { id: 'workflow', icon: 'clock' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

export function SettingsPanel({
  root,
  directoryName,
  rememberedDirectoryName,
  directoryRestoreState,
  directoryBookmarkIssue,
  directoryStatus,
  fileSystemReady,
  settings,
  issue,
  notice,
  busy,
  workspace,
  workspaceIssue,
  workspaceBusy,
  editorThemes,
  editorThemeIssues,
  onSave,
  onAuthorizeDirectory,
  onCreateDirectory,
  onReopenRememberedDirectory,
  onRetryFonts,
  onSaveAppearance,
  onCreateEditorTheme,
  onLoadDefaultEditorThemes,
  onDeleteEditorTheme,
  onPreviewAppearance,
  registerNavigationGuard,
}: Props) {
  const { t } = useUITranslation('settings');
  const format = useFormatSnapshot();
  const transform = format.bundle.formatter.preview.dark.transform;
  const algorithm = format.algorithms.manifest.components.find(component => component.id === transform);
  const [tab, setTab] = useState<SettingsTab>('library');
  const [directoryActionRequested, setDirectoryActionRequested] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [appearanceDraft, setAppearanceDraft] = useState(workspace.appearance);
  const [appearanceEdited, setAppearanceEdited] = useState(false);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [departure, setDeparture] = useState<{ proceed: () => void } | null>(null);
  const appearanceGuardRef = useRef({ dirty: false, busy: false });
  const [combination, setCombination] = useState<EditorAppearance['custom']>(null);
  const [systemDark, setSystemDark] = useState(false);
  const previewScheme: EditorColorScheme = appearanceDraft.colorMode === 'system' ? (systemDark ? 'dark' : 'light') : appearanceDraft.colorMode;
  const appearanceDirty = appearanceEdited && !sameAppearance(appearanceDraft, workspace.appearance);
  const editingDrafts = useEditingDrafts();
  const appearanceLocation = useDraftLocation(() => document.getElementById('settings-panel-appearance'));
  const resumeAppearance = () => { setDeparture(null); setTab('appearance'); appearanceLocation.restore(); };
  useEditingDraft(appearanceDirty ? { kind: 'appearance', root, objectId: 'appearance', resume: resumeAppearance } : null);
  appearanceGuardRef.current = { dirty: appearanceDirty, busy: busy || workspaceBusy || appearanceSaving };
  const [appearanceNotice, setAppearanceNotice] = useState(productText("settingsPanel.appearancePreferencesAreSavedSeparatelyInEachLibraryDirectory"));
  const savedColorModeRef = useRef(workspace.appearance.colorMode);
  const [designerSource, setDesignerSource] = useState<EditorTheme | null>(null);
  const [designerEditing, setDesignerEditing] = useState(false);
  const [deleteThemeTarget, setDeleteThemeTarget] = useState<EditorTheme | null>(null);
  const deleteThemeRootRef = useRef<FileSystemDirectoryHandle | null>(null);
  const themeImportRef = useRef<HTMLInputElement | null>(null);
  const designerGuardRef = useRef<NavigationGuard | null>(null);
  const missingThemeIds = [appearanceDraft.custom?.colorThemeId ?? appearanceDraft.themeId, appearanceDraft.custom?.fontThemeId ?? appearanceDraft.themeId]
    .filter((id, index, ids) => ids.indexOf(id) === index && !findEditorTheme(editorThemes, id));
  useEffect(() => setDraft(settings), [root, settings]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!appearanceEdited) setAppearanceDraft(workspace.appearance);
    else if (savedColorModeRef.current !== workspace.appearance.colorMode) {
      setAppearanceDraft((current) => ({ ...current, colorMode: workspace.appearance.colorMode }));
    }
    savedColorModeRef.current = workspace.appearance.colorMode;
  }, [appearanceEdited, workspace.appearance]);
  useEffect(() => {
    onPreviewAppearance(appearanceDirty ? appearanceDraft : null);
  }, [appearanceDirty, appearanceDraft, onPreviewAppearance]);
  useEffect(() => () => onPreviewAppearance(null), [onPreviewAppearance]);
  useEffect(() => registerNavigationGuard((proceed) => {
    if (appearanceGuardRef.current.busy) return true;
    if (designerGuardRef.current?.(() => {
      if (appearanceGuardRef.current.dirty) setDeparture({ proceed }); else proceed();
    })) return true;
    if (!appearanceGuardRef.current.dirty) return false;
    appearanceLocation.capture();
    setDeparture({ proceed });
    return true;
  }), [registerNavigationGuard]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!appearanceGuardRef.current.dirty && !appearanceGuardRef.current.busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const tabBusy = busy || workspaceBusy || appearanceSaving;
  const appearanceDisabled = !root || tabBusy || Boolean(workspaceIssue);
  const appearanceActionsDisabled = appearanceDisabled || !appearanceDirty;
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: SettingsTab) => {
    if (tabBusy) return;
    const index = SETTINGS_TABS.findIndex((item) => item.id === current);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? SETTINGS_TABS.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % SETTINGS_TABS.length
      : event.key === 'ArrowLeft' ? (index + SETTINGS_TABS.length - 1) % SETTINGS_TABS.length : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = SETTINGS_TABS[nextIndex].id;
    setTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  };

  const handleSettingsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  const changeAppearance = (next: EditorAppearance) => {
    if (appearanceDisabled) return;
    appearanceLocation.capture(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    appearanceGuardRef.current.dirty = !sameAppearance(next, workspace.appearance);
    setAppearanceDraft(next);
    setAppearanceEdited(true);
    setAppearanceSaved(false);
    setAppearanceNotice(productText("settingsPanel.previewingChangesAreWrittenToTheLibraryOnlyWhenSaved"));
  };

  const selectColorMode = (mode: EditorColorMode) => changeAppearance({ ...appearanceDraft, colorMode: mode });

  const cancelAppearance = () => {
    appearanceGuardRef.current.dirty = false;
    setAppearanceDraft(workspace.appearance);
    setAppearanceEdited(false);
    setAppearanceSaved(false);
    onPreviewAppearance(null);
    setAppearanceNotice(productText("settingsPanel.changesCancelledSavedAppearanceRestored"));
  };

  const saveAppearance = async () => {
    if (appearanceActionsDisabled || missingThemeIds.length || appearanceGuardRef.current.busy) return false;
    appearanceGuardRef.current.busy = true;
    setAppearanceSaving(true);
    try {
      const saved = await onSaveAppearance(appearanceDraft);
      if (saved) {
        appearanceGuardRef.current.dirty = false;
        setAppearanceEdited(false);
        setAppearanceSaved(true);
        onPreviewAppearance(null);
      }
      setAppearanceNotice(saved ? productText("uiFeedback.appearanceSaved") : productText("settingsPanel.savingFailedThePreviewAndUnsavedChangesAreRetained"));
      return saved;
    } catch {
      setAppearanceNotice(productText("settingsPanel.savingFailedThePreviewAndUnsavedChangesAreRetained"));
      return false;
    } finally {
      appearanceGuardRef.current.busy = false;
      setAppearanceSaving(false);
    }
  };

  const resetAppearance = () => {
    changeAppearance({ ...DEFAULT_EDITOR_APPEARANCE });
    setAppearanceNotice(sameAppearance(DEFAULT_EDITOR_APPEARANCE, workspace.appearance) ? productText("uiFeedback.appearanceDefault") : productText("uiFeedback.appearancePreviewDefault"));
  };

  const openThemeDesigner = () => {
    const colorTheme = findEditorTheme(editorThemes, appearanceDraft.custom?.colorThemeId ?? appearanceDraft.themeId) ?? editorThemes[0] ?? BASE_EDITOR_THEME;
    const fontTheme = findEditorTheme(editorThemes, appearanceDraft.custom?.fontThemeId ?? appearanceDraft.themeId) ?? colorTheme;
    setDesignerEditing(false);
    setDesignerSource({ ...colorTheme, fonts: { ...fontTheme.fonts } });
  };

  return (
    <section className="page-card overflow-hidden" aria-labelledby="settings-title">
      <PageHeading>
        <div className="min-w-0">
          <p id="settings-kicker" className="eyebrow">{t('settings:ui.workspaceSettings')}</p>
          <h2 id="settings-title" className="page-title font-heading">{t('settings:ui.preferencesAndSaving')}</h2>
          <p className="mt-3 text-sm text-muted">{t('settings:ui.arrangeYourWritingEnvironmentAndKeepManuscriptsSaved')}</p>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-list px-4 py-3 text-sm data-[ready=true]:border-accent-line data-[ready=true]:bg-accent-soft" data-ready={Boolean(root)}>
          <span className="size-2 shrink-0 rounded-full bg-faint" aria-hidden="true" />
          <div className="min-w-0"><p className="text-xs text-faint">{root ? t('settings:ui.currentLibrary') : rememberedDirectoryName ? t('settings:ui.previousLibrary') : t('settings:ui.noLibrarySelected')}</p><strong className="block max-w-64 truncate font-medium text-primary">{directoryName ?? rememberedDirectoryName ?? t('settings:ui.chooseALocalDirectory')}</strong></div>
        </div>
      </PageHeading>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
        <div className="shrink-0 overflow-x-auto border-b border-line px-4 py-3 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent md:px-6">
          <div className="flex w-max gap-1 rounded-lg bg-list p-1" role="tablist" aria-label={t('settings:ui.settingsCategories')}>
            {SETTINGS_TABS.map((item) => <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} disabled={tabBusy} onClick={() => setTab(item.id)} onKeyDown={(event) => onTabKeyDown(event, item.id)} className="flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-selected:bg-panel aria-selected:text-accent-text">
              <SettingsIcon name={item.icon} />{t('settings:tabs.' + item.id)}{item.id === 'appearance' && appearanceDirty ? <UnsavedMark /> : null}
            </button>)}
          </div>
        </div>

        <section id="settings-panel-library" role="tabpanel" aria-labelledby="settings-tab-library" hidden={tab !== 'library'} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-8">
          <div className="grid gap-6">
            <div><p className="eyebrow">{t('settings:ui.localLibrary')}</p><h3 id="library-title" className="mt-1 font-heading text-xl font-semibold text-primary">{t('settings:ui.localLibraryAlternative')}</h3><p className="mt-3 text-sm text-muted">{t('settings:ui.manageManuscriptStorageAndAccessPermissions')}</p></div>
            <div className="grid min-w-0 gap-4">
              <section className="grid min-w-0 gap-4 rounded-xl border border-line bg-list/50 p-5" aria-labelledby="library-directory-name">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true"><SettingsIcon name="folder" /></span>
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <h4 id="library-directory-name" className="min-w-0 break-words font-sub-heading text-lg font-semibold text-primary">{directoryName ?? rememberedDirectoryName ?? t('settings:ui.chooseYourLibrary')}</h4>
                      <span className="flex items-center gap-2 rounded-md bg-panel px-2.5 py-1 text-xs text-muted"><span className="size-1.5 rounded-full bg-faint data-[ready=true]:bg-success" data-ready={Boolean(root)} aria-hidden="true" />{root ? t('settings:ui.connectedReadWrite') : directoryRestoreState === 'checking' ? t('settings:ui.checkingPreviousDirectory') : rememberedDirectoryName ? t('settings:ui.waitingForPermission') : t('settings:ui.notConnected')}</span>
                    </div>
                  </div>
                  <ButtonBar label={t('settings:ui.libraryDirectoryActions')}>
                    {!root && rememberedDirectoryName ? <button className="button button-primary" type="button" disabled={!fileSystemReady || tabBusy} onClick={() => { setDirectoryActionRequested(true); onReopenRememberedDirectory(); }}><SettingsIcon name="folder" />{t('settings:ui.authorizeAndOpen')}</button> : null}
                    <button className={!root && !rememberedDirectoryName ? 'button button-primary' : 'button button-quiet'} type="button" disabled={!fileSystemReady || tabBusy} onClick={() => { setDirectoryActionRequested(true); onAuthorizeDirectory(); }}><SettingsIcon name="export" />{t(root ? 'settings:ui.switchLibrary' : rememberedDirectoryName ? 'settings:ui.chooseAnotherLibrary' : 'settings:ui.openExistingLibrary')}</button>
                    <button className="button button-quiet" type="button" disabled={!fileSystemReady || tabBusy} aria-haspopup="dialog" onClick={() => {
                      const proceed = () => onCreateDirectory();
                      if (appearanceGuardRef.current.dirty) setDeparture({ proceed }); else proceed();
                    }}><SettingsIcon name="plus" />{t('settings:ui.newLibrary')}</button>
                  </ButtonBar>
                </div>
                <p className="border-t border-line pt-4 text-xs text-muted">{root ? t('settings:ui.thisDirectoryIsRememberedContinueAfterRefreshingWhile') : rememberedDirectoryName ? t('settings:ui.thePreviousDirectoryIsRememberedAuthorizeItTo') : t('settings:ui.theAppRemembersYourSelectionAndReopensIt')} <span className="text-faint">{t('settings:ui.switchLibraryKeepsFiles')}</span></p>
                {directoryActionRequested && directoryStatus.tone !== 'neutral' ? <p className="status-copy" data-tone={directoryStatus.tone} role="status">{formatProductMessage(directoryStatus, t)}</p> : null}
                {!fileSystemReady ? <p className="text-xs text-warning-strong" role="status">{t('settings:ui.thisBrowserDoesNotSupportLocalDirectoryAccess')}</p> : null}
                {directoryBookmarkIssue ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="alert">{formatProductMessage(directoryBookmarkIssue, t)}</p> : null}
              </section>
              {workspaceIssue ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="alert">{formatProductMessage(workspaceIssue, t)} {t('settings:ui.projectOrganizationAndAppearanceAreReadOnlyTo')}</p> : null}
              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <FontDownloadSettings root={root} onRetry={onRetryFonts} />
                <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-list/50 p-5" aria-label={t('settings:ui.validationAndAlgorithms')}>
                  <header className="border-b border-line pb-4">
                    <h3 className="font-heading text-lg font-semibold text-primary">{t('settings:ui.validationAndAlgorithms')}</h3>
                    <p className="mt-1 text-xs text-muted">{t('settings:ui.currentLibraryConfiguration')}</p>
                  </header>
                  {!root ? <p className="text-sm text-muted">{t('settings:ui.notConnected')}</p>
                    : format.loading ? <p className="text-sm text-muted" role="status">{t('settings:ui.loadingFormatConfiguration')}</p>
                    : format.error ? <p className="break-words text-sm text-danger" role="alert">{t('settings:ui.formatUnavailable')} · {formatProductMessage(format.error, t)}</p>
                    : <dl className="grid gap-3 text-sm text-secondary">
                      <div className="flex min-w-0 gap-3"><dt className="w-24 shrink-0 text-muted md:w-40">{t('settings:ui.validationPolicy')}</dt><dd className="min-w-0 break-words">{format.bundle.support.meta.name}{format.bundle.validator.meta.enabled === false ? t('dialogs:ui.platformValidationDisabled') : ''}</dd></div>
                      <div className="flex min-w-0 gap-3"><dt className="w-24 shrink-0 text-muted md:w-40">{t('settings:ui.configurationSource')}</dt><dd className="min-w-0 break-words">{t(format.source === 'built-in' ? 'settings:ui.builtInConfiguration' : format.officialDefault ? 'settings:ui.officialConfiguration' : 'settings:ui.customConfiguration')}</dd></div>
                      <div className="flex min-w-0 gap-3"><dt className="w-24 shrink-0 text-muted md:w-40">{t('settings:ui.darkAlgorithm')}</dt><dd className="min-w-0 break-words font-mono">{transform === 'preserve' ? t('settings:ui.noColorConversion') : algorithm?.id ?? transform}</dd></div>
                      <div className="flex min-w-0 gap-3"><dt className="w-24 shrink-0 text-muted md:w-40">{t('settings:ui.algorithmDetails')}</dt><dd className="min-w-0 break-words">{transform !== 'preserve' && algorithm ? <><span className="font-mono">v{algorithm.version}</span> · </> : null}{t('settings:algorithmSources.' + format.algorithmSource)}</dd></div>
                    </dl>}
                </section>
              </div>
              <div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2">
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-list/50 p-5"><span className="mt-0.5 text-faint" aria-hidden="true"><SettingsIcon name="document" /></span><div className="min-w-0"><h4 className="text-sm font-medium text-primary">{t('settings:ui.manuscriptsAndAssets')}</h4><p className="mt-2 text-xs text-muted">{t('settings:ui.bodyTextImagesAndArticleThemeSnapshotsAre')}</p></div></div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-list/50 p-5"><span className="mt-0.5 text-faint" aria-hidden="true"><SettingsIcon name="theme" /></span><div className="min-w-0"><h4 className="text-sm font-medium text-primary">{t('settings:ui.templatesAndPreferences')}</h4><p className="mt-2 text-xs text-muted">{t('settings:ui.snippetsStarterTemplatesProjectsAndEditorAppearanceAre')}</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={tab !== 'appearance'} tabIndex={0} className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-hidden p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-8">
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><p className="eyebrow">{t('settings:ui.editorAppearance')}</p><h3 id="appearance-title" className="mt-1 font-heading text-xl font-semibold text-primary">{t('settings:ui.chooseAnEditorTheme')}</h3><p className="mt-3 text-sm text-muted">{t('settings:ui.clickAThemeToPreviewItSaveTo')}</p></div>
            <ButtonBar label={t('settings:ui.editorThemeActions')}><button className="button button-quiet" type="button" disabled={appearanceDisabled} onClick={() => themeImportRef.current?.click()}><SettingsIcon name="upload" />{t('settings:ui.importJson')}</button><input ref={themeImportRef} className="sr-only" type="file" accept=".json,application/json" aria-label={t('settings:ui.importEditorThemeJson')} disabled={appearanceDisabled} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void file.text().then(raw => JSON.parse(raw) as EditorTheme).then(theme => root ? onCreateEditorTheme(theme, undefined, root) : false).then(saved => setAppearanceNotice(saved ? productText("uiFeedback.themeImported") : productText("uiFeedback.themeImportFailed"))).catch(error => setAppearanceNotice(String(error))); }} /><button className="button button-quiet" type="button" disabled={appearanceDisabled} onClick={() => void onLoadDefaultEditorThemes().then(saved => setAppearanceNotice(saved ? productText("uiFeedback.themesAdded") : productText("uiFeedback.themesFailed")))}><SettingsIcon name="download" />{t('settings:ui.loadDefaultThemes')}</button><button className="button button-primary" type="button" disabled={appearanceDisabled} onClick={openThemeDesigner}><SettingsIcon name="plus" />{t('settings:ui.newEditorTheme')}</button></ButtonBar>
          </header>
          {!root || workspaceIssue || missingThemeIds.length || editorThemeIssues.length ? <div className="grid max-h-24 shrink-0 gap-2 overflow-y-auto rounded-lg bg-list px-4 py-3 text-xs text-muted" role="status">
            {!root ? <p>{t('settings:ui.connectALibraryToChooseAndSaveEditor')}</p> : null}
            {workspaceIssue ? <p className="text-warning-strong" role="alert">{formatProductMessage(workspaceIssue, t)} {t('settings:ui.appearanceRemainsReadOnly')}</p> : null}
            {missingThemeIds.length ? <p className="text-warning-strong" role="alert">{t('settings:templates.missingThemes', { names: missingThemeIds.join('、') })}</p> : null}
            {editorThemeIssues.length ? <p className="text-warning-strong" role="alert">{editorThemeIssues.map((item) => `${item.file}: ${formatProductMessage(item, t)}`).join('; ')}</p> : null}
          </div> : null}
          <fieldset className="min-w-0 shrink-0"><legend className="mb-2 text-sm font-medium text-primary">{t('settings:ui.displayMode')}</legend><div className="flex flex-wrap gap-2">{EDITOR_COLOR_MODES.map((mode) => <button key={mode.id} className="min-h-9 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-muted transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-pressed={appearanceDraft.colorMode === mode.id} disabled={appearanceDisabled} onClick={() => selectColorMode(mode.id)}>{t('settings:colorModes.' + mode.id)}</button>)}</div></fieldset>
          <fieldset className="flex min-h-0 min-w-0 flex-1 flex-col">
            <legend className="mb-3 text-sm font-medium text-primary">{t('settings:ui.editorThemes')}</legend>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-scroll p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" tabIndex={0} role="region" aria-label={t('settings:ui.editorThemeList')}>
              <div className="grid content-start gap-3 md:grid-cols-2 xl:grid-cols-4">
                {editorThemes.map((theme) => {
                  const selected = !appearanceDraft.custom && appearanceDraft.themeId === theme.id;
                  return <div key={theme.id} className="group relative min-w-0"><button className="grid w-full min-w-0 content-start gap-3 rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent/20" type="button" aria-label={t('settings:templates.previewTheme', { name: theme.name })} aria-pressed={selected} disabled={appearanceDisabled} onClick={() => changeAppearance({ ...appearanceDraft, themeId: theme.id, custom: null })}>
                    <ThemeSample theme={theme} />
                    <span className="flex min-w-0 items-start justify-between gap-2 px-1"><strong className="break-words font-sub-heading text-sm font-medium text-primary">{theme.name}{hasEditingDraft(editingDrafts, root, 'settings', theme.id) ? <UnsavedMark className="ml-2 inline-block" /> : null}</strong>{selected ? <span className="shrink-0 text-xs text-accent-text">{appearanceDirty ? t('settings:ui.previewing') : t('settings:ui.selected')}</span> : null}</span><span className="break-all px-1 font-mono text-xs text-faint">{theme.id} · v{theme.version}</span>
                  </button><ButtonBar label={t('settings:templates.themeActions', { name: theme.name })} className="absolute top-5 right-5 rounded-md bg-panel p-1 opacity-100 shadow-panel md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"><button className="button button-quiet size-9 min-h-0 p-0" type="button" aria-label={t('settings:templates.editTheme', { name: theme.name })} data-tooltip={t('settings:ui.edit')} disabled={appearanceDisabled} onClick={() => { setDesignerEditing(true); setDesignerSource(theme); }}><SettingsIcon name="edit" /></button><button className="button button-danger size-9 min-h-0 p-0" type="button" aria-label={t('settings:templates.deleteTheme', { name: theme.name })} data-tooltip={t('settings:ui.delete')} disabled={appearanceDisabled || theme.id === BASE_EDITOR_THEME.id || [workspace.appearance.themeId, workspace.appearance.custom?.colorThemeId, workspace.appearance.custom?.fontThemeId, appearanceDraft.themeId, appearanceDraft.custom?.colorThemeId, appearanceDraft.custom?.fontThemeId].includes(theme.id)} onClick={() => { deleteThemeRootRef.current = root; setDeleteThemeTarget(theme); }}><SettingsIcon name="delete" /></button></ButtonBar></div>;
                })}
                <button className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-list/50 p-5 text-center text-muted transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent aria-pressed:text-accent-text" type="button" aria-pressed={Boolean(appearanceDraft.custom)} disabled={appearanceDisabled} onClick={() => setCombination(appearanceDraft.custom ?? { colorThemeId: appearanceDraft.themeId, fontThemeId: appearanceDraft.themeId })}>
                  <span className="grid size-11 place-items-center rounded-lg border border-dashed border-line-strong"><SettingsIcon name="plus" /></span><strong className="font-sub-heading text-sm font-medium">{t('settings:ui.customCombination')}</strong><span className="text-xs">{t('settings:ui.chooseColorsAndFonts')}</span>{appearanceDraft.custom ? <span className="text-xs text-accent-text">{t('settings:templates.combinationSummary', { colors: findEditorTheme(editorThemes, appearanceDraft.custom.colorThemeId)?.name, fonts: findEditorTheme(editorThemes, appearanceDraft.custom.fontThemeId)?.name })}</span> : null}
                </button>
              </div>
            </div>
          </fieldset>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-3"><button className="button button-quiet" type="button" disabled={appearanceActionsDisabled} onClick={resetAppearance}><SettingsIcon name="reset" />{t('settings:ui.resetAppearance')}</button><p className="status-copy text-xs" role="status">{formatProductMessage(appearanceNotice, t)}</p></div>
            <ButtonBar label={t('settings:ui.appearanceSaveActions')}><button className="button button-quiet" type="button" disabled={appearanceActionsDisabled} onClick={cancelAppearance}><SettingsIcon name="undo" />{t('settings:ui.cancelChanges')}</button><button className="button button-primary" type="button" aria-label={appearanceSaved ? t('settings:ui.saved') : t('settings:ui.saveAppearance')} disabled={appearanceActionsDisabled || Boolean(missingThemeIds.length)} onClick={() => void saveAppearance()}><SettingsIcon name={appearanceSaved ? 'check' : 'save'} />{appearanceSaving ? t('settings:ui.saving') : appearanceSaved ? t('settings:ui.saved') : t('settings:ui.saveAppearance')}</button></ButtonBar>
          </footer>
        </section>

        <section id="settings-panel-workflow" role="tabpanel" aria-labelledby="settings-tab-workflow" hidden={tab !== 'workflow'} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:p-8">
          <div className="grid gap-6">
            <div><p className="eyebrow">{t('settings:ui.savingHistory')}</p><h3 id="workflow-title" className="mt-1 font-heading text-xl font-semibold text-primary">{t('settings:ui.makeSavingPartOfWriting')}</h3><p className="mt-3 text-sm text-muted">{t('settings:ui.timersActOnlyOnTheCurrentArticleAnd')}</p></div>
            {!root ? <p className="rounded-lg bg-list px-4 py-3 text-xs text-muted">{t('settings:ui.connectALibraryToChangeAndSaveAutomation')}</p> : null}
            {issue ? <p className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="alert">{formatProductMessage(issue, t)} {t('settings:ui.repairSettingsJsonThenReopenTheLibrary')}</p> : null}
            <form className="grid gap-6" onSubmit={handleSettingsSubmit}>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <div className="grid gap-5 rounded-xl border border-line bg-list/50 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{t('settings:ui.autoSave')}</p><h4 className="mt-1 font-heading text-lg font-semibold text-primary">{t('settings:ui.autoSaveAlternative')}</h4></div><label className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-secondary"><input className="size-4 accent-accent" type="checkbox" role="switch" aria-label={t('settings:ui.enableAutoSave')} checked={draft.autoSave.enabled} onChange={(event) => setDraft({ ...draft, autoSave: { ...draft.autoSave, enabled: event.target.checked } })} disabled={!root || busy} />{t('settings:ui.enable')}</label></div>
                  <p className="text-sm text-muted">{t('settings:ui.unsavedChangesAreWrittenToTheArticleBody')}</p>
                  <label className="field-stack"><span className="field-label">{t('settings:ui.saveIntervalSeconds')}</span><input className="field" type="number" min="1" max="86400" step="1" value={draft.autoSave.intervalSeconds} onChange={(event) => setDraft({ ...draft, autoSave: { ...draft.autoSave, intervalSeconds: Number(event.target.value) } })} disabled={!root || busy || !draft.autoSave.enabled} /></label>
                  <p className="border-t border-line pt-4 text-xs text-faint">{t('settings:ui.saveTheCurrentManuscriptToKeepFilesAnd')}</p>
                </div>
                <div className="grid gap-5 rounded-xl border border-line bg-list/50 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{t('settings:ui.historySnapshots')}</p><h4 className="mt-1 font-heading text-lg font-semibold text-primary">{t('settings:ui.historySnapshotsAlternative')}</h4></div><label className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-secondary"><input className="size-4 accent-accent" type="checkbox" role="switch" aria-label={t('settings:ui.enableAutomaticHistorySnapshots')} checked={draft.autoSnapshot.enabled} onChange={(event) => setDraft({ ...draft, autoSnapshot: { ...draft.autoSnapshot, enabled: event.target.checked } })} disabled={!root || busy} />{t('settings:ui.enable')}</label></div>
                  <p className="text-sm text-muted">{t('settings:ui.retainTheFullBodyAndItsThemeFor')}</p>
                  <div className="grid gap-4 md:grid-cols-2"><label className="field-stack"><span className="field-label">{t('settings:ui.snapshotIntervalMinutes')}</span><input className="field" type="number" min="1" max="10080" step="1" value={draft.autoSnapshot.intervalMinutes} onChange={(event) => setDraft({ ...draft, autoSnapshot: { ...draft.autoSnapshot, intervalMinutes: Number(event.target.value) } })} disabled={!root || busy || !draft.autoSnapshot.enabled} /></label><label className="field-stack"><span className="field-label">{t('settings:ui.automaticSnapshotRetention')}</span><input className="field" type="number" min="1" max="100" step="1" value={draft.autoSnapshot.maxCount} onChange={(event) => setDraft({ ...draft, autoSnapshot: { ...draft.autoSnapshot, maxCount: Number(event.target.value) } })} disabled={!root || busy || !draft.autoSnapshot.enabled} /></label></div>
                  <p className="border-t border-line pt-4 text-xs text-faint">{t('settings:ui.identicalContentIsNotWrittenAgainKeepThe')}</p>
                </div>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><p className="status-copy" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p><ButtonBar label={t('settings:ui.autoSaveSettingsActions')}><button className="button button-primary" type="submit" disabled={!root || busy}><SettingsIcon name="save" />{t('settings:ui.saveSettings')}</button></ButtonBar></footer>
            </form>
          </div>
        </section>
      </div>
      {designerSource && typeof document !== 'undefined' ? createPortal(<EditorThemeDesigner root={root} editing={designerEditing} appearanceScheme={previewScheme} source={designerSource} themes={editorThemes} navigationGuardRef={designerGuardRef} onClose={() => { designerGuardRef.current = null; setDesignerSource(null); }} onSave={async theme => { if (!await onCreateEditorTheme(theme, designerEditing ? designerSource : undefined, root ?? undefined)) return false; changeAppearance({ themeId: theme.id, colorMode: appearanceDraft.colorMode, custom: null }); return true; }} />, document.body) : null}
      {deleteThemeTarget && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="editor-theme-delete-title" role="alertdialog" onClose={() => setDeleteThemeTarget(null)} dismissible={!workspaceBusy}><DialogHeader titleId="editor-theme-delete-title" eyebrow={t('common:eyebrows.deleteEditorTheme')} title={t('settings:ui.deleteEditorTheme')} onClose={() => setDeleteThemeTarget(null)} closeDisabled={workspaceBusy} /><div className="dialog-content"><p className="text-sm text-primary">「{deleteThemeTarget.name}」</p><p className="mt-3 text-sm text-muted">{t('settings:ui.removeThisThemeFromTheCurrentLibraryDefaults')}</p><p className="mt-3 text-xs text-faint" role="status">{formatProductMessage(appearanceNotice, t)}</p></div><DialogFooter><DialogActions><DialogButton disabled={workspaceBusy} onClick={() => setDeleteThemeTarget(null)}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" disabled={workspaceBusy} onClick={() => void onDeleteEditorTheme(deleteThemeTarget.id, deleteThemeRootRef.current ?? undefined).then(removed => { if (removed) { setDeleteThemeTarget(null); setAppearanceNotice(productText("settingsPanel.themeDeleted")); } else setAppearanceNotice(productText("settingsPanel.deletionFailedTheThemeIsRetained")); })}>{t('settings:ui.confirmDeletion')}</DialogButton></DialogActions></DialogFooter></DialogFrame>, document.body) : null}
      {departure && typeof document !== 'undefined' ? createPortal(<UnsavedChangesDialog entries={[{ label: t('settings:ui.appearanceSettings'), detail: t('settings:templates.combination', { colors: findEditorTheme(editorThemes, appearanceDraft.custom?.colorThemeId ?? appearanceDraft.themeId)?.name ?? appearanceDraft.themeId, fonts: findEditorTheme(editorThemes, appearanceDraft.custom?.fontThemeId ?? appearanceDraft.themeId)?.name ?? appearanceDraft.themeId }) }]} description={t('settings:ui.appearancePreviewIsUnsavedLeavingRestoresSavedColors')} saveDisabled={appearanceDisabled || Boolean(missingThemeIds.length)} onCancel={() => setDeparture(null)} onContinue={resumeAppearance} onDiscard={() => { const proceed = departure.proceed; cancelAppearance(); setDeparture(null); proceed(); }} onSave={async () => { const proceed = departure.proceed; if (!await saveAppearance()) return false; setDeparture(null); proceed(); return true; }} />, document.body) : null}
      {combination && typeof document !== 'undefined' ? createPortal(<DialogFrame wide titleId="appearance-combination-title" descriptionId="appearance-combination-description" onClose={() => setCombination(null)}><DialogHeader titleId="appearance-combination-title" eyebrow={t('common:eyebrows.customEditorTheme')} title={t('settings:ui.combineColorsAndFonts')} onClose={() => setCombination(null)} /><div className="dialog-content"><p id="appearance-combination-description" className="text-sm text-muted">{t('settings:ui.chooseColorsAndFontsSeparatelyForALive')}</p><div className="grid min-w-0 gap-4 md:grid-cols-2">
        <fieldset className="min-w-0 rounded-xl border border-line bg-list/50 p-3"><legend className="px-1 text-sm font-medium text-primary">{t('settings:ui.colors')}</legend><div className="grid max-h-80 gap-2 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{editorThemes.map((theme) => <button key={theme.id} className="grid min-w-0 gap-2 rounded-lg border border-line bg-panel p-3 text-left text-sm text-primary hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent-soft" type="button" aria-label={t('settings:templates.chooseColors', { name: theme.name })} aria-pressed={combination.colorThemeId === theme.id} onClick={() => setCombination({ ...combination, colorThemeId: theme.id })}><ThemeSample theme={theme} kind="colors" scheme={previewScheme} /><span>{theme.name}</span></button>)}</div></fieldset>
        <fieldset className="min-w-0 rounded-xl border border-line bg-list/50 p-3"><legend className="px-1 text-sm font-medium text-primary">{t('settings:ui.fonts')}</legend><div className="grid max-h-80 gap-2 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{editorThemes.map((theme) => <button key={theme.id} className="grid min-w-0 gap-2 rounded-lg border border-line bg-panel p-3 text-left text-sm text-primary hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent-soft" type="button" aria-label={t('settings:templates.chooseFonts', { name: theme.name })} aria-pressed={combination.fontThemeId === theme.id} onClick={() => setCombination({ ...combination, fontThemeId: theme.id })}><ThemeSample theme={theme} kind="fonts" /><span className="text-xs text-faint">{theme.name}</span></button>)}</div></fieldset>
      </div><DialogActions><DialogButton onClick={() => setCombination(null)}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" disabled={appearanceDisabled} onClick={() => { changeAppearance({ ...appearanceDraft, custom: { ...combination } }); setCombination(null); }}>{t('settings:ui.applyCombinationAndPreview')}</DialogButton></DialogActions></div></DialogFrame>, document.body) : null}
    </section>
  );
}
