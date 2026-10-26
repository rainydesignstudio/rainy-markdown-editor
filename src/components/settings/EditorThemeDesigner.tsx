'use client';

import { SelectField } from '../global/SelectField';
import { formatProductMessage, productErrorMessage, productMessage, productText, type ProductMessageFields } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { BASE_EDITOR_THEME, EDITOR_COLOR_ROLES, EDITOR_SURFACE_FIELDS, editorSurfaceValue, updateEditorSurface, mapEditorSurfaceColors, editorSurfaceTokens, inspectEditorTheme, parseEditorThemeJson, resolveEditorThemeColors, resolveEditorThemeSurfaces, type EditorTheme, type EditorColorRole, type EditorColorScheme, type EditorThemeFontRole, type EditorSurfaceField } from '../../lib/editorThemes';
import type { NavigationGuard } from '../../hooks/useRouteNavigation';
import { tokenizeEditorSource } from '../../lib/editorSourceHighlight';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { useDraftLocation, useEditingDraft } from '../global/EditingDrafts';
import { canonicalFontStack, fontFamily, fontOptions } from '../../lib/fontCatalog';
import { CollapsiblePanel, PanelIcon } from '../global/CollapsiblePanel';
import { EditorColorPicker } from './EditorColorPicker';
import { ColorSwatchButton } from '../global/ColorSwatchButton';
import { ThemeInspectionPreview, useThemeInspection, INSPECTION_ROW_CLASSES, type ThemeInspection } from '../global/ThemeInspection';
import { uniqueBindings, type ColorBinding } from '../../lib/themeInspection';

const FONT_TOKENS: Record<EditorThemeFontRole, string> = { ui: '--font-sans', heading: '--font-heading', subHeading: '--font-sub-heading', eyebrow: '--font-eyebrow', serif: '--font-serif', mono: '--font-mono', editorSource: '--font-editor-source', articleSource: '--font-article-source' };
const FONT_ROLES = Object.keys(FONT_TOKENS) as EditorThemeFontRole[];
const COLOR_LABELS: Record<EditorColorRole, string> = {
  canvas: '工作区背景', rail: '侧栏背景', list: '列表背景', panel: '面板背景', hover: '悬停背景', 'popup-bg': '浮层背景',
  primary: '主要文字', secondary: '次要文字', muted: '辅助文字', faint: '弱化文字', 'popup-text': '浮层文字',
  line: '常规分隔线', 'line-strong': '强调分隔线',
  accent: '主题主色', 'accent-strong': '主色强调', 'accent-text': '主色文字', 'accent-soft': '主色浅底', 'accent-line': '主色边线', selection: '文字选区', 'search-hit': '搜索高亮色', 'on-accent': '主色上的文字',
  success: '成功文字', 'success-surface': '成功背景', warning: '警告主色', 'warning-strong': '警告强调', 'warning-surface': '警告背景', 'warning-line': '警告边线', danger: '错误主色', 'on-danger': '错误色上的文字',
  'editor-surface': '源码背景', 'editor-text': '源码正文', 'editor-syntax': '语法标记', 'editor-heading': '源码标题', 'editor-quote': '源码引用',
};
const SAMPLE = '# 从容写下第一句\n\n文字与装饰使用当前编辑器主题。\n\n## 一个清楚的小标题\n\n> 留下想法，也留下一点空白。\n\n- 颜色按语义角色映射\n- 字体独立选择\n\n`const draft = true;`';

export function forkEditorTheme(source: EditorTheme): EditorTheme {
  const palette: Record<string, string> = {};
  const colors = {} as EditorTheme['colors'];
  for (const mode of ['light', 'dark'] as const) {
    const resolved = resolveEditorThemeColors(source, mode);
    colors[mode] = Object.fromEntries(EDITOR_COLOR_ROLES.map(role => {
      const key = `${mode}-${role}`;
      const color = resolved[role];
      palette[key] = color.length === 4 ? `#${[...color.slice(1)].map(channel => channel + channel).join('')}` : color;
      return [role, key];
    })) as EditorTheme['colors']['light'];
  }
  const surfaceReferences = new Map<string, string>();
  const paletteKey = (mode: EditorColorScheme, reference: string, preferred?: EditorColorRole) => {
    // Equal colors can have independent roles. Preserve the authored reference.
    const role = preferred && source.colors[mode][preferred] === reference ? preferred : EDITOR_COLOR_ROLES.find(role => source.colors[mode][role] === reference);
    if (role) return `${mode}-${role}`;
    const identity = `${mode}:${reference}`;
    const existing = surfaceReferences.get(identity);
    if (existing) return existing;
    const key = `surface-${Object.keys(palette).length}`;
    palette[key] = source.palette[reference];
    surfaceReferences.set(identity, key);
    return key;
  };
  const surfaces = source.surfaces ? Object.fromEntries((['light', 'dark'] as const).map(mode =>
    [mode, mapEditorSurfaceColors(source.surfaces![mode], (key, path) => paletteKey(mode, key, EDITOR_SURFACE_FIELDS.find(field => field.path === path)?.role))],
  )) as EditorTheme['surfaces'] : undefined;
  return { kind: 'editor-theme', id: `editor-custom-${Date.now().toString(36)}`, name: `${source.name} 新主题`, version: '1.0.0', formatVersion: 4, palette, colors, fonts: { ...source.fonts }, ...(surfaces ? { surfaces } : {}) };
}

function surfaceBindings(theme: EditorTheme, mode: EditorColorScheme): Record<string, ColorBinding[]> {
  const surface = theme.surfaces?.[mode];
  const binding = (token: string, label: string, reference: string): ColorBinding => {
    const role = EDITOR_COLOR_ROLES.find(role => theme.colors[mode][role] === reference);
    return { key: role ?? `surface:${mode}:${reference}`, label: role ? COLOR_LABELS[role] : label, token: role ? `${token} ← --color-${role}` : token, value: reference };
  };
  const refs: Record<string, [string, string[]]> = {
    action: ['按钮底色', [surface?.primaryButton ?? theme.colors[mode].accent]],
    'action-text': ['按钮文字', [surface?.primaryText ?? theme.colors[mode]['on-accent']]],
    'action-hover': ['按钮悬停底色', surface?.primaryHover ? typeof surface.primaryHover === 'string' ? [surface.primaryHover] : [surface.primaryButton ?? theme.colors[mode].accent] : [theme.colors[mode]['accent-strong']]],
    'editor-action-gradient': ['按钮悬停渐变', surface && Array.isArray(surface.primaryHover) ? surface.primaryHover : []],
    'action-line': ['按钮边线', [surface?.primaryLine ?? theme.colors[mode][surface ? 'accent-line' : 'accent']]],
    eyebrow: ['装饰上标', [surface?.eyebrow ?? theme.colors[mode]['accent-text']]],
    'danger-surface': ['危险操作底色', [surface?.dangerSurface ?? theme.colors[mode].panel]],
    'editor-field-background': ['表单底色', surface?.field?.opacity === 0 ? [] : [surface?.field?.color ?? theme.colors[mode].panel]],
    'editor-canvas-wash': ['工作区点缀', surface?.canvasWash?.opacity ? surface.canvasWash.colors : []],
  };
  const paths: Record<string, EditorSurfaceField> = { action: 'primaryButton', 'action-text': 'primaryText', 'action-hover': 'primaryHover', 'editor-action-gradient': 'primaryHover', 'action-line': 'primaryLine', eyebrow: 'eyebrow', 'danger-surface': 'dangerSurface', 'editor-field-background': 'field', 'editor-canvas-wash': 'canvasWash' };
  return Object.fromEntries(Object.entries(refs).map(([key, [label, values]]) => [key, values.flatMap(value => {
    const token = key.startsWith('editor-') ? `--${key}` : `--color-${key}`;
    const alias = binding(token, label, value);
    return [...(alias.key.startsWith('surface:') ? [] : [alias]), { key: `surface:${mode}:${paths[key]}`, label, token, value }];
  })]));
}

function editorElementBindings(element: HTMLElement, root: HTMLElement, theme: EditorTheme, mode: EditorColorScheme): ColorBinding[] {
  const derived = surfaceBindings(theme, mode);
  const surface = theme.surfaces?.[mode];
  const output: ColorBinding[] = [];
  const placeholderOnly = element.classList.contains('field') && element.matches(':placeholder-shown');
  const ownText = !placeholderOnly && (Array.from(element.childNodes).some(node => node.nodeType === 3 && Boolean(node.textContent?.trim())) || element.matches('input,button,svg,path'));
  const fromClass = (node: HTMLElement, prefix: string) => {
    const color = Array.from(node.classList).filter(value => !value.endsWith('/0')).map(value => value.split('/')[0]).find(value => value.startsWith(`${prefix}-`) && (EDITOR_COLOR_ROLES.includes(value.slice(prefix.length + 1) as EditorColorRole) || value.slice(prefix.length + 1) === 'eyebrow'))?.slice(prefix.length + 1);
    if (color === 'eyebrow') return derived.eyebrow;
    if (color) return [{ key: color, label: COLOR_LABELS[color as EditorColorRole], token: `--color-${color}` }];
    const fallback = prefix === 'text' ? node.classList.contains('editor-theme-preview-caption') ? 'faint' : node.classList.contains('field') ? 'secondary' : null : prefix === 'bg' && node.classList.contains('editor-theme-preview-card') ? 'panel' : null;
    return fallback ? [{ key: fallback, label: COLOR_LABELS[fallback], token: `--color-${fallback}` }] : [];
  };
  if (ownText) {
    let current: HTMLElement | null = element;
    while (current && root.contains(current)) {
      const text = current.classList.contains('button-primary') ? derived['action-text'] : current.classList.contains('button-danger') ? [{ key: current.matches(':hover') ? 'on-danger' : 'danger', label: COLOR_LABELS[current.matches(':hover') ? 'on-danger' : 'danger'], token: current.matches(':hover') ? '--color-on-danger' : '--color-danger' }] : fromClass(current, 'text');
      if (text.length) { output.push(...text); break; }
      current = current.parentElement;
    }
  }
  let background: HTMLElement | null = element;
  while (background && root.contains(background)) {
    const values = background.classList.contains('button-primary') ? derived[background.matches(':hover') ? derived['editor-action-gradient'].length ? 'editor-action-gradient' : 'action-hover' : 'action'] : background.classList.contains('button-danger') ? background.matches(':hover') ? [{ key: 'danger', label: COLOR_LABELS.danger, token: '--color-danger' }] : derived['danger-surface'] : background.classList.contains('field') ? derived['editor-field-background'] : fromClass(background, 'bg');
    output.push(...values);
    if (background === root) output.push(...derived['editor-canvas-wash']);
    const translucent = background.classList.contains('field') && surface?.field && surface.field.opacity < 100 || Array.from(background.classList).some(value => value.startsWith('bg-') && /\/(?:0|[1-9]\d?)$/.test(value));
    if (values.length && !translucent) break;
    background = background.parentElement;
  }
  if (element.classList.contains('button-primary')) output.push(...(element.matches(':hover') ? [{ key: 'accent-strong', label: COLOR_LABELS['accent-strong'], token: '--color-accent-strong' }] : derived['action-line']));
  else if (element.classList.contains('button-danger')) output.push({ key: 'danger', label: COLOR_LABELS.danger, token: '--color-danger' });
  else if (element.classList.contains('field')) {
    const border = element.matches(':focus') ? 'accent' : 'line';
    output.push({ key: border, label: COLOR_LABELS[border], token: `--color-${border}` });
    if (placeholderOnly) output.push({ key: 'faint', label: COLOR_LABELS.faint, token: '--color-faint' });
  }
  else if (element.classList.contains('editor-theme-preview-card')) output.push({ key: 'line', label: COLOR_LABELS.line, token: '--color-line' });
  else output.push(...fromClass(element, 'border'));
  return uniqueBindings(output);
}

function Preview({ theme, mode, inspection }: { theme: EditorTheme; mode: EditorColorScheme; inspection: ThemeInspection }) {
  const { t } = useUITranslation('dialogs');
  const colors = resolveEditorThemeColors(theme, mode);
  const tokens = Object.fromEntries([
    ...EDITOR_COLOR_ROLES.map(role => [`--color-${role}`, colors[role]]),
    ...FONT_ROLES.map(role => [FONT_TOKENS[role], theme.fonts[role]]),
    ...Object.entries(editorSurfaceTokens(colors, resolveEditorThemeSurfaces(theme)?.[mode])),
  ]) as CSSProperties;
  return <ThemeInspectionPreview inspection={inspection} dialogOwner="editor-theme-designer-title" revision={theme} resolve={(element, root) => editorElementBindings(element, root, theme, mode)} className="flex min-h-0 flex-1 flex-col"><div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-canvas bg-(image:--editor-canvas-wash) font-sans text-secondary" data-font-role="ui" style={tokens} aria-label={t('dialogs:ui.liveEditorThemePreview')}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3"><div><p data-font-role="eyebrow" className="font-eyebrow text-2xs font-medium tracking-widest text-eyebrow">{t('dialogs:ui.writingDesk')}</p><h3 data-font-role="heading" className="mt-1 font-heading text-base font-semibold text-primary">{t('dialogs:ui.manuscriptWorkspace')}</h3></div><div className="ml-auto flex min-w-0 flex-wrap items-center gap-2"><span className="rounded-md bg-accent-strong px-2 py-1 text-2xs text-on-accent">{t('dialogs:ui.currentManuscriptAlternative')}</span><input className="field w-36 min-w-0 text-xs" aria-label={t('dialogs:ui.sampleForm')} placeholder={t('dialogs:ui.sampleForm')} /><span className="rounded-md bg-success-surface px-2 py-1 text-2xs text-success">{t('dialogs:ui.saved')}</span></div></header>
    <div className="flex min-h-0 flex-1"><aside className="hidden w-28 shrink-0 border-r border-line bg-rail p-4 md:block"><p className="mb-3 text-xs text-faint">{t('dialogs:ui.library')}</p><div className="rounded-lg border border-accent-line bg-accent-soft p-2 font-sub-heading text-xs text-accent-text">{t('dialogs:ui.articles')}</div><p className="mt-4 text-xs text-muted">{t('dialogs:ui.themes')}</p><p className="mt-4 text-xs text-muted">{t('dialogs:ui.templates')}</p><section className="mt-5 rounded-md border border-line-strong bg-popup-bg p-2 text-popup-text" aria-label={t('dialogs:ui.popupAndHoverSamples')}><p className="text-2xs font-medium">{t('dialogs:ui.insertElement')}</p><div className="mt-2 rounded bg-hover px-1.5 py-1 text-2xs">{t('dialogs:ui.quotePassage')}</div></section></aside><div className="flex min-h-0 min-w-0 flex-1 flex-col"><div className="flex shrink-0 items-center justify-between border-b border-line bg-list px-4 py-3"><span data-font-role="mono" className="font-mono text-xs text-primary">article.md</span><div className="flex min-w-0 items-center gap-2"><span className="text-2xs text-muted">{t('dialogs:ui.compilationProgress')}</span><span className="h-1.5 w-12 overflow-hidden rounded-full bg-hover" aria-label={t('dialogs:ui.compilationProgressSample')}><span className="block h-full w-3/4 rounded-full bg-accent" /></span><span className="text-2xs text-faint">{t('dialogs:ui.livePreview')}</span></div></div><div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      {/* Geometry rationale: the status card needs more width for three single-line labels; adjacent text cards can truncate. */}
      <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]"><section className="editor-theme-preview-card" aria-label={t('dialogs:ui.listAndSecondaryHeadingFontSample')}><p className="editor-theme-preview-caption">{t('dialogs:ui.listsAndSecondaryHeadings')}</p><h4 data-font-role="subHeading" className="editor-theme-preview-text font-sub-heading text-sm font-semibold text-primary" title={t('dialogs:ui.writingInspiration')}>{t('dialogs:ui.writingInspiration')}</h4></section><section className="editor-theme-preview-card" aria-label={t('dialogs:ui.serifFontSample')}><p className="editor-theme-preview-caption">{t('dialogs:ui.serifText')}</p><p data-font-role="serif" className="editor-theme-preview-text font-serif text-sm text-secondary" title={t('dialogs:ui.turnScatteredIdeasIntoAPageOfWords')}>{t('dialogs:ui.turnScatteredIdeasIntoAPageOfWords')}</p></section><section className="editor-theme-preview-card" aria-label={t('dialogs:ui.statusTextSample')}><p className="editor-theme-preview-caption">{t('dialogs:ui.statusText')}</p><div className="flex min-w-0 items-center gap-1 text-2xs"><span className="min-w-0 truncate text-success" title={t('dialogs:ui.savedSuccessfully')}>{t('dialogs:ui.savedSuccessfully')}</span><span className="min-w-0 truncate text-warning" title={t('dialogs:ui.pending')}>{t('dialogs:ui.pending')}</span><span className="min-w-0 truncate rounded bg-danger px-1.5 py-0.5 text-on-danger" title={t('dialogs:ui.saveFailed')}>{t('dialogs:ui.saveFailed')}</span></div></section></div><section className="editor-theme-preview-card mb-4 overflow-hidden p-0" aria-label={t('dialogs:ui.codeSourceFontSample')}><p className="editor-theme-preview-caption mb-0 border-b border-line bg-panel px-3 py-2">{t('dialogs:ui.codeSourceCssJsonHtml')}</p><pre data-font-role="editorSource" className="bg-editor-surface p-3 whitespace-pre-wrap break-words font-editor-source text-xs text-editor-text"><span className="text-editor-text">{'const theme = { name: "Rainy", enabled: true };\n.article { color: var(--color-primary); }'}</span></pre></section><section className="editor-theme-preview-card mb-4" aria-label={t('dialogs:ui.textSelectionAndEmphasisSample')}><p className="editor-theme-preview-caption">{t('dialogs:ui.selectionAndEmphasis')}</p><p className="flex flex-wrap items-center gap-2 rounded bg-editor-surface p-2 text-xs"><mark className="rounded bg-selection/60 px-2 py-1 text-editor-text">{t('dialogs:ui.selectedText')}</mark><mark className="rounded bg-search-hit px-2 py-1 text-search-hit-ink">{t('dialogs:ui.searchHitSample')}</mark><span className="rounded border border-accent-line bg-accent-soft px-2 py-1 text-accent-text">{t('dialogs:ui.keyContent')}</span><span className="rounded bg-accent px-2 py-1 text-on-accent">{t('dialogs:ui.themeAccent')}</span></p></section><section className="editor-theme-preview-card overflow-hidden p-0" aria-label={t('dialogs:ui.articleSourceFontSample')}><p className="editor-theme-preview-caption mb-0 border-b border-line bg-panel px-3 py-2">{t('dialogs:ui.articleSourceMarkdown')}</p><pre data-font-role="articleSource" className="m-0 bg-editor-surface p-3 whitespace-pre-wrap wrap-anywhere font-article-source text-editor-source text-editor-text">{tokenizeEditorSource(SAMPLE).map((segment, index) => <span key={index} className={segment.tone ? { syntax: 'text-editor-syntax', heading: 'text-editor-heading', quote: 'text-editor-quote' }[segment.tone] : 'text-editor-text'}>{segment.text}</span>)}</pre></section></div></div></div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-panel p-3"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning-line bg-warning-surface px-3 py-2 text-2xs" aria-label={t('dialogs:ui.warningStateSample')}><strong className="font-semibold text-warning-strong">{t('dialogs:ui.autoSavePaused')}</strong><span className="text-warning">{t('dialogs:ui.localDirectoryNotConnected')}</span></div><div className="flex shrink-0 items-center gap-2"><button type="button" className="button button-danger">{t('common:actions.delete')}</button><button type="button" className="button button-primary">{t('dialogs:ui.sampleButton')}</button></div></footer>
  </div></ThemeInspectionPreview>;
}

export function EditorThemeDesigner({ root, source, themes, appearanceScheme, navigationGuardRef, onClose, onSave, editing = false }: {
  root: FileSystemDirectoryHandle | null; source: EditorTheme; themes: EditorTheme[]; navigationGuardRef: MutableRefObject<NavigationGuard | null>;
  appearanceScheme: EditorColorScheme;
  onClose: () => void; onSave: (theme: EditorTheme) => Promise<boolean>;
  editing?: boolean;
}) {
  const { t } = useUITranslation('dialogs');
  const [draft, setDraft] = useState(() => editing ? { ...forkEditorTheme(source), id: source.id, name: source.name, version: source.version } : forkEditorTheme(source));
  const inspection = useThemeInspection();
  const initial = useRef(JSON.stringify(draft));
  const [mode, setMode] = useState<EditorColorScheme>(appearanceScheme);
  useEffect(() => { inspection.clear(); setMode(appearanceScheme); }, [appearanceScheme]);
  const [colorsOpen, setColorsOpen] = useState(true);
  const [fontsOpen, setFontsOpen] = useState(true);
  const [colorPicker, setColorPicker] = useState<{ scheme: EditorColorScheme; role?: EditorColorRole; key?: string; label?: string; token?: string; surface?: EditorSurfaceField; index?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | ProductMessageFields | { message: string }>('');
  const [departure, setDeparture] = useState<(() => void) | null>(null);
  const busyRef = useRef(false);
  const dirty = JSON.stringify(draft) !== initial.current;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const location = useDraftLocation(() => document.getElementById('editor-theme-designer-title')?.closest<HTMLElement>('[role=dialog]') ?? null);
  const resumeDesigner = () => { setDeparture(null); location.restore(); };
  useEditingDraft(dirty ? { kind: 'editor-theme', root, objectId: editing ? source.id : draft.id, resume: resumeDesigner } : null);
  useEffect(() => { if (dirty && !departure && !colorPicker) location.capture(); }, [draft, dirty, departure, colorPicker]);
  const errors = inspectEditorTheme(draft);
  if (themes.some(theme => theme.id === draft.id && (!editing || theme.id !== source.id))) errors.push(productMessage("editorThemeDesigner.theFileJsonAlreadyExists", { "draftId": draft.id }));
  const availableFonts = [...themes.flatMap(theme => Object.values(theme.fonts)), ...Object.values(draft.fonts)];
  // The inspector keeps role aliases; every surface also has an independent editable control.
  useEffect(() => { if (inspection.selected) setColorsOpen(true); }, [inspection.selected]);
  const close = () => {
    if (busyRef.current) return;
    if (dirtyRef.current) { location.capture(); setDeparture(() => onClose); } else onClose();
  };
  const save = async () => {
    if (busyRef.current || errors.length || (editing && !dirtyRef.current)) return false;
    busyRef.current = true; setSaving(true); setError('');
    try {
      const saved = await onSave(parseEditorThemeJson(JSON.stringify(draft)));
      if (!saved) setError(productText("editorThemeDesigner.themeSavingFailedYourChangesAreRetained"));
      return saved;
    } catch (failure) { setError(productErrorMessage(failure)); return false; }
    finally { busyRef.current = false; setSaving(false); }
  };
  useEffect(() => {
    navigationGuardRef.current = proceed => {
      if (busyRef.current) return true;
      if (dirtyRef.current) { location.capture(); setDeparture(() => () => { onClose(); proceed(); }); return true; }
      onClose(); return false;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { navigationGuardRef.current = null; window.removeEventListener('beforeunload', beforeUnload); };
  }, [navigationGuardRef, onClose]);

  return <>
    <DialogFrame large titleId="editor-theme-designer-title" descriptionId="editor-theme-designer-description" onClose={close} dismissible={!saving && !colorPicker} focusActive={!colorPicker && !departure}>
      <DialogHeader titleId="editor-theme-designer-title" eyebrow={t('common:eyebrows.editorThemeDesigner')} title={editing ? t('dialogs:ui.editEditorTheme') : t('dialogs:ui.newEditorTheme')} onClose={close} closeDisabled={saving} />
      <div className="shrink-0 border-b border-line p-4"><div className="grid min-w-0 gap-3 md:grid-cols-3"><label className="grid min-w-0 gap-2 text-xs text-muted">{t('dialogs:ui.themeName')}<input className="field w-full min-w-0" value={draft.name} maxLength={80} disabled={saving} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label className="grid min-w-0 gap-2 text-xs text-muted">{t('dialogs:ui.filenameWithoutJson')}<input className="field w-full min-w-0 font-mono" value={draft.id} maxLength={48} autoCapitalize="none" spellCheck={false} disabled={saving} aria-describedby="editor-theme-id-hint" onChange={event => setDraft(current => ({ ...current, id: event.target.value }))} /></label><label className="grid min-w-0 gap-2 text-xs text-muted">{t('dialogs:ui.version')}<input className="field w-full min-w-0 font-mono" value={draft.version} maxLength={32} spellCheck={false} disabled={saving} aria-describedby="editor-theme-version-hint" onChange={event => setDraft(current => ({ ...current, version: event.target.value }))} /></label></div><div className="mt-2 grid gap-1 text-2xs text-faint md:grid-cols-3"><span /><span id="editor-theme-id-hint" className="break-all">{t('dialogs:ui.savedInTheCurrentLibraryThemesEditorThemes')}{draft.id || '<id>'}.json{editing && source.id === BASE_EDITOR_THEME.id && draft.id !== source.id ? t('dialogs:ui.theBasicThemeSOriginalFileIsRetained') : ''}</span><span id="editor-theme-version-hint">{t('dialogs:ui.savingIncrementsTheLastVersionSegmentUnlessYou')}</span></div></div>
      <p id="editor-theme-designer-description" className="shrink-0 p-4 text-xs text-muted">{t('dialogs:ui.adjustLightAndDarkColorsSeparatelyPreviewThe')}</p>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:flex-row lg:overflow-hidden">
        <aside ref={inspection.listRef} {...inspection.listProps} className="flex h-96 min-h-0 shrink-0 flex-col gap-4 lg:h-auto lg:w-96" aria-label={t('dialogs:ui.themeColorsAndFonts')}>
          <CollapsiblePanel id="editor-theme-colors" title={t('dialogs:ui.colors')} icon={<PanelIcon kind="colors" />} count={EDITOR_COLOR_ROLES.length + EDITOR_SURFACE_FIELDS.length} open={colorsOpen} onToggle={() => setColorsOpen(current => !current)} className="data-[open=true]:flex-1 data-[open=false]:shrink-0" contentClassName="flex flex-1 flex-col pb-2">
            <><div className="flex shrink-0 items-center justify-between gap-3 border-b border-line pb-2 text-2xs text-faint"><span>{t('dialogs:ui.semanticRoles')}</span><div className="flex gap-3"><span className="w-8 text-center">{t('dialogs:ui.light')}</span><span className="w-8 text-center">{t('dialogs:ui.dark')}</span></div></div><div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" aria-label={t('dialogs:ui.colorRoleList')} onClick={event => { if (event.target === event.currentTarget) inspection.clear(); }}>{EDITOR_COLOR_ROLES.map(role => <div key={role} {...inspection.rowProps(role)} className={`flex items-center justify-between gap-3 border-b border-line/60 py-3 last:border-0 ${INSPECTION_ROW_CLASSES}`}><div className="min-w-0"><p className="text-xs font-medium text-primary">{t('dialogs:colorRoles.' + role)}</p><p className="mt-1 break-all font-mono text-2xs text-faint">--color-{role}</p></div><div className="flex shrink-0 gap-3">{(['light', 'dark'] as const).map(scheme => <ColorSwatchButton key={scheme} color={draft.palette[draft.colors[scheme][role]]} colorName={draft.colors[scheme][role]} type="button" data-color-swatch="true" className="size-8 shrink-0 rounded-full border border-line-strong hover:ring-2 hover:ring-line focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed" aria-label={`${scheme}.${role}`} aria-haspopup="dialog" disabled={saving} onClick={() => setColorPicker({ scheme, role })} />)}</div></div>)}{EDITOR_SURFACE_FIELDS.map(field => <section key={field.path} className="border-t border-line py-3">
              <p className="text-xs font-medium text-primary">{t('dialogs:surfaceRoles.' + field.token.slice(2))}</p>
              <p className="mt-1 break-all font-mono text-2xs text-faint">{field.token}</p>
              <div className="mt-2 grid gap-2">{(['light', 'dark'] as const).map(scheme => {
                const value = editorSurfaceValue(draft, scheme, field.path);
                return <div key={scheme} {...inspection.rowProps(`surface:${scheme}:${field.path}`)} className={`flex flex-wrap items-center gap-2 ${INSPECTION_ROW_CLASSES}`}>
                  <span className="w-8 text-2xs text-faint">{t('dialogs:ui.' + scheme)}</span>
                  {value.colors.map((reference, index) => <ColorSwatchButton key={index} color={draft.palette[reference]} colorName={reference} className="size-7 shrink-0 rounded-full border border-line-strong focus-visible:outline-2 focus-visible:outline-accent" disabled={saving} aria-label={`${t('dialogs:surfaceRoles.' + field.token.slice(2))} · ${t('dialogs:ui.' + scheme)} · ${index + 1}`} aria-haspopup="dialog" onClick={() => setColorPicker({ scheme, surface: field.path, index, label: t('dialogs:surfaceRoles.' + field.token.slice(2)), token: field.token })} />)}
                  {value.opacity !== undefined ? <label className="ml-auto inline-flex items-center gap-1 text-2xs text-muted"><span>{t('dialogs:ui.opacity')}</span><input className="field w-16 min-h-0 px-2 py-1 text-xs" type="number" min="0" max="100" step="1" value={value.opacity} disabled={saving} aria-label={`${t('dialogs:surfaceRoles.' + field.token.slice(2))} · ${t('dialogs:ui.' + scheme)} · ${t('dialogs:ui.opacity')}`} onChange={event => { if (event.target.value !== '') setDraft(current => updateEditorSurface(current, scheme, field.path, { opacity: Math.max(0, Math.min(100, Number(event.target.value))) })); }} />%</label> : null}
                  {field.path === 'primaryHover' ? <SelectField label={`${t('dialogs:surfaceRoles.' + field.token.slice(2))} · ${t('dialogs:ui.' + scheme)}`} className="ml-auto min-h-0 w-24 px-2 py-1 text-xs" value={value.colors.length === 4 ? 'gradient' : 'solid'} disabled={saving} onChange={nextValue => setDraft(current => updateEditorSurface(current, scheme, field.path, { gradient: nextValue === 'gradient' }))} options={[{ value: "solid", label: t('dialogs:ui.solidColor') }, { value: "gradient", label: t('dialogs:ui.gradientColor') }]} /> : null}
                </div>;
              })}</div>
            </section>)}</div></>
          </CollapsiblePanel>
          <CollapsiblePanel id="editor-theme-fonts" title={t('dialogs:ui.fonts')} icon={<PanelIcon kind="fonts" />} count={FONT_ROLES.length} open={fontsOpen} onToggle={() => setFontsOpen(current => !current)} className="data-[open=true]:flex-1 data-[open=false]:shrink-0" contentClassName="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" contentLabel={t('dialogs:ui.fontRoleList')}>
            <div className="grid gap-4">{FONT_ROLES.map(role => <label key={role} className="grid gap-2"><span><span className="block text-xs font-medium text-primary">{t('dialogs:fontRoles.' + role)}</span><span className="mt-1 block font-mono text-2xs text-faint">{FONT_TOKENS[role]}</span></span><SelectField label={t('dialogs:templates.font', { name: t('dialogs:fontRoles.' + role) })} value={canonicalFontStack(draft.fonts[role])} disabled={saving} onChange={nextValue => setDraft(current => ({ ...current, fonts: { ...current.fonts, [role]: nextValue } }))} options={[...(fontOptions([draft.fonts[role], ...availableFonts], role === 'editorSource' || role === 'mono').map(font => ({ value: font.value, label: t('dialogs:fontOptions.' + fontFamily(font.value), { defaultValue: font.label }) })) ?? [])]} /></label>)}</div>
          </CollapsiblePanel>
        </aside>
        <div className="flex min-h-80 min-w-0 flex-1 flex-col gap-3 lg:min-h-0"><div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><p className="text-xs font-medium text-muted">{t('dialogs:ui.editorPreview')}<span className="ml-2 font-normal text-faint" role="status">{dirty || !editing ? t('dialogs:ui.unsavedDraft') : t('dialogs:ui.savedColors')}{mode !== appearanceScheme ? t('dialogs:ui.temporaryDisplayMode') : ''}</span></p><div className="flex gap-1 rounded-lg bg-list p-1" aria-label={t('dialogs:ui.editorPreviewMode')}>{(['light', 'dark'] as const).map(scheme => <button type="button" key={scheme} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted aria-pressed:bg-panel aria-pressed:text-accent-text focus-visible:outline-2 focus-visible:outline-accent" aria-pressed={mode === scheme} onClick={() => { inspection.clear(); setMode(scheme); }}><svg className="size-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{scheme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M19.5 15.7A8.4 8.4 0 0 1 8.3 4.5 8.6 8.6 0 1 0 19.5 15.7Z" />}</svg>{scheme === 'light' ? t('dialogs:ui.light') : t('dialogs:ui.dark')}</button>)}</div></div><Preview key={mode} theme={draft} mode={mode} inspection={inspection} /></div>
      </div>
      <DialogFooter className="pt-4">{error || errors.length ? <p role="alert" className="mb-3 text-xs text-danger">{error ? formatProductMessage(error, t) : errors.map(issue => formatProductMessage(issue, t)).join('; ')}</p> : null}<DialogActions><DialogButton disabled={saving} onClick={close}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" disabled={saving || Boolean(errors.length) || (editing && !dirty)} onClick={() => void save().then(saved => { if (saved) onClose(); })}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6" /></svg>{saving ? t('dialogs:ui.saving') : t('dialogs:ui.saveTheme')}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame>
    {colorPicker ? <EditorColorPicker label={colorPicker.label ?? t('dialogs:colorRoles.' + colorPicker.role)} token={colorPicker.token ?? `--color-${colorPicker.role}`} modeLabel={colorPicker.scheme === 'light' ? t('dialogs:ui.light') : t('dialogs:ui.dark')} value={draft.palette[colorPicker.surface ? editorSurfaceValue(draft, colorPicker.scheme, colorPicker.surface).colors[colorPicker.index ?? 0] : colorPicker.key ?? draft.colors[colorPicker.scheme][colorPicker.role!]]} onClose={() => setColorPicker(null)} onSelect={hex => setDraft(current => colorPicker.surface ? updateEditorSurface(current, colorPicker.scheme, colorPicker.surface, { color: hex, index: colorPicker.index }) : ({ ...current, palette: { ...current.palette, [colorPicker.key ?? current.colors[colorPicker.scheme][colorPicker.role!]]: hex } }))} /> : null}
    {departure ? <UnsavedChangesDialog entries={[{ label: draft.name || t('dialogs:ui.newEditorThemeAlternative'), detail: t('dialogs:ui.colorsAndFontsAreUnsaved') }]} description={t('dialogs:ui.thisNewThemeHasUnsavedChanges')} saveLabel={t('dialogs:ui.saveAndContinue')} saveDisabled={Boolean(errors.length)} onCancel={() => setDeparture(null)} onContinue={resumeDesigner} onDiscard={departure} onSave={async () => { if (!await save()) return false; departure(); return true; }} /> : null}
  </>;
}
