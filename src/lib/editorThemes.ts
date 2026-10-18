import { ProductError, productCause, productJoin, productMessage, productReference, productText, type ProductMessageFields, type ProductMessageValue } from "./i18n/productMessages";
import { getEditorThemeTemplateJson, LEGACY_MIST_THEME_JSON } from '../themes/editor-themes/index';
import { codeFontStack } from './fontCatalog';

export const EDITOR_COLOR_ROLES = [
  'canvas', 'rail', 'list', 'panel', 'hover', 'popup-bg',
  'primary', 'secondary', 'muted', 'faint', 'popup-text',
  'line', 'line-strong',
  'accent', 'accent-strong', 'accent-text', 'accent-soft', 'accent-line', 'selection', 'search-hit', 'on-accent',
  'success', 'success-surface', 'warning', 'warning-strong', 'warning-surface', 'warning-line', 'danger', 'on-danger',
  'editor-surface', 'editor-text', 'editor-syntax', 'editor-heading', 'editor-quote',
] as const;

export type EditorColorRole = (typeof EDITOR_COLOR_ROLES)[number];
export const DEFAULT_EDITOR_SEARCH_COLOR = '#eeff00';
export type EditorColorScheme = 'light' | 'dark';
export type EditorThemeFontRole = 'ui' | 'serif' | 'mono' | 'editorSource' | 'articleSource' | 'heading' | 'subHeading' | 'eyebrow';

export type EditorThemeSurfaces = Record<EditorColorScheme, Partial<{
  primaryButton: string;
  primaryText: string;
  primaryHover: string | [string, string, string, string];
  primaryLine: string;
  secondaryButton: string;
  eyebrow: string;
  dangerSurface: string;
  field: { color: string; opacity: number };
  shadow: { color: string; opacity: number };
  panelShadow: { color: string; opacity: number };
  toggleShadow: { color: string; opacity: number };
  backdrop?: { color: string; opacity: number };
  canvasWash: { colors: [string, string, string]; opacity: number };
}>>;

export type EditorTheme = {
  kind: 'editor-theme';
  id: string;
  name: string;
  version: string;
  formatVersion: 4;
  palette: Record<string, string>;
  colors: Record<EditorColorScheme, Record<EditorColorRole, string>>;
  fonts: Record<EditorThemeFontRole, string>;
  surfaces?: EditorThemeSurfaces;
};

// Surface overrides are optional; absence preserves the existing theme's paint.
// One registry drives the designer and its preview bindings.
export const EDITOR_SURFACE_FIELDS = [
  { path: 'primaryButton', token: '--color-action', role: 'accent' },
  { path: 'primaryText', token: '--color-action-text', role: 'on-accent' },
  { path: 'primaryHover', token: '--color-action-hover', role: 'accent-strong' },
  { path: 'primaryLine', token: '--color-action-line', role: 'accent' },
  { path: 'secondaryButton', token: '--color-button-surface', role: 'panel' },
  { path: 'eyebrow', token: '--color-eyebrow', role: 'accent-text' },
  { path: 'dangerSurface', token: '--color-danger-surface', role: 'panel' },
  { path: 'field', token: '--editor-field-background', role: 'panel', opacity: 100 },
  { path: 'shadow', token: '--editor-popup-shadow', role: 'secondary', opacity: 15 },
  { path: 'panelShadow', token: '--editor-panel-shadow', role: 'secondary', opacity: 6 },
  { path: 'toggleShadow', token: '--editor-toggle-shadow', role: 'secondary', opacity: 8 },
  { path: 'backdrop', token: '--editor-dialog-backdrop', role: 'secondary', opacity: 45 },
  { path: 'canvasWash', token: '--editor-canvas-wash', role: 'canvas', opacity: 0 },
] as const;
export type EditorSurfaceField = typeof EDITOR_SURFACE_FIELDS[number]['path'];

export function mapEditorSurfaceColors(surface: EditorThemeSurfaces['light'], map: (key: string, path: string) => string): EditorThemeSurfaces['light'] {
  return Object.fromEntries(Object.entries(surface).map(([key, value]) => [key,
    typeof value === 'string' ? map(value, key) : Array.isArray(value) ? value.map(color => map(color, key)) :
      'colors' in value ? { ...value, colors: value.colors.map(color => map(color, key)) } : { ...value, color: map(value.color, key) },
  ])) as EditorThemeSurfaces['light'];
}

export function editorSurfaceValue(theme: EditorTheme, mode: EditorColorScheme, path: EditorSurfaceField) {
  const field = EDITOR_SURFACE_FIELDS.find(item => item.path === path)!;
  const value = theme.surfaces?.[mode][path];
  const fallback = theme.colors[mode][path === 'primaryLine' && theme.surfaces ? 'accent-line' : field.role];
  return {
    colors: value === undefined ? path === 'canvasWash' ? [fallback, fallback, fallback] : [fallback] :
      typeof value === 'string' ? [value] : Array.isArray(value) ? value : 'colors' in value ? value.colors : [value.color],
    opacity: value && typeof value === 'object' && !Array.isArray(value) ? value.opacity : 'opacity' in field ? field.opacity : undefined,
    inherited: value === undefined,
  };
}

export function updateEditorSurface(theme: EditorTheme, mode: EditorColorScheme, path: EditorSurfaceField, change: { color?: string; index?: number; opacity?: number; gradient?: boolean }): EditorTheme {
  const value = editorSurfaceValue(theme, mode, path), palette = { ...theme.palette };
  let colors = [...value.colors];
  if (change.gradient !== undefined) colors = change.gradient ? Array.from({ length: 4 }, (_, i) => colors[i] ?? colors[0]) : [colors[0]];
  if (change.color !== undefined) {
    const index = change.index ?? 0, key = `${mode}-surface-${path.toLowerCase()}-${index}`;
    palette[key] = change.color; colors[index] = key;
  }
  const opacity = change.opacity ?? value.opacity;
  const next = path === 'canvasWash' ? { colors: colors as [string, string, string], opacity: opacity! } :
    opacity !== undefined ? { color: colors[0], opacity } : path === 'primaryHover' && colors.length === 4 ? colors : colors[0];
  const surfaces: EditorThemeSurfaces = { light: { ...theme.surfaces?.light }, dark: { ...theme.surfaces?.dark }, [mode]: { ...theme.surfaces?.[mode], [path]: next } };
  const used = new Set(Object.values(theme.colors).flatMap(roles => Object.values(roles)));
  for (const surface of Object.values(surfaces)) mapEditorSurfaceColors(surface, key => { used.add(key); return key; });
  for (const key of value.colors) if (!used.has(key)) delete palette[key];
  return { ...theme, palette, surfaces };
}

// Self-contained so cached, resolved colors can be checked before hydration too.
export function validEditorThemeSurfaces(value: unknown, palette?: Record<string, unknown>): value is EditorThemeSurfaces {
  const record = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const keys = (item: Record<string, unknown>, expected: string[]) => Object.keys(item).length === expected.length && expected.every(key => key in item);
  const color = (item: unknown) => typeof item === 'string' && (palette ? Object.hasOwn(palette, item) : /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item));
  const opacity = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 100;
  const tint = (item: unknown) => record(item) && keys(item, ['color', 'opacity']) && color(item.color) && opacity(item.opacity);
  if (!record(value) || !keys(value, ['light', 'dark'])) return false;
  for (const mode of ['light', 'dark']) {
    const surface = value[mode];
    const plain = ['primaryButton', 'primaryText', 'primaryLine', 'secondaryButton', 'eyebrow', 'dangerSurface'];
    const tints = ['field', 'shadow', 'panelShadow', 'toggleShadow', 'backdrop'];
    if (!record(surface) || Object.keys(surface).some(key => ![...plain, ...tints, 'primaryHover', 'canvasWash'].includes(key))) return false;
    if (plain.some(key => key in surface && !color(surface[key])) || tints.some(key => key in surface && !tint(surface[key]))) return false;
    if ('primaryHover' in surface && !color(surface.primaryHover) && (!Array.isArray(surface.primaryHover) || surface.primaryHover.length !== 4 || !surface.primaryHover.every(color))) return false;
    if ('canvasWash' in surface) {
      const wash = surface.canvasWash;
      if (!record(wash) || !keys(wash, ['colors', 'opacity']) || !opacity(wash.opacity) || !Array.isArray(wash.colors) || wash.colors.length !== 3 || !wash.colors.every(color)) return false;
    }
  }
  return true;
}

export function resolveEditorThemeSurfaces(theme: EditorTheme): EditorThemeSurfaces | undefined {
  if (!theme.surfaces) return undefined;
  return Object.fromEntries((['light', 'dark'] as const).map(mode => {
    return [mode, mapEditorSurfaceColors(theme.surfaces![mode], key => theme.palette[key])];
  })) as EditorThemeSurfaces;
}

// Only fixed shapes plus validated color data enter CSS; JSON never supplies CSS.
export function editorSurfaceTokens(colors: Record<EditorColorRole, string>, surface?: EditorThemeSurfaces['light'], searchDefault = DEFAULT_EDITOR_SEARCH_COLOR): Record<string, string> {
  const tint = (color: string, opacity: number) => opacity === 100 ? color : `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
  const shadow = surface?.shadow ? tint(surface.shadow.color, surface.shadow.opacity) : '';
  const search = colors['search-hit'] ?? searchDefault;
  const full = search.length === 4 ? search.slice(1).split('').map(value => value + value).join('') : search.slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(full.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return {
    '--color-search-hit': search,
    '--color-search-hit-ink': luminance > .179 ? '#000000' : '#ffffff',
    '--color-action': surface?.primaryButton ?? colors.accent,
    '--color-action-hover': surface?.primaryHover ? (typeof surface.primaryHover === 'string' ? surface.primaryHover : surface.primaryButton ?? colors.accent) : colors['accent-strong'],
    '--color-action-text': surface?.primaryText ?? colors['on-accent'],
    '--color-action-line': surface?.primaryLine ?? (surface ? colors['accent-line'] : colors.accent),
    '--color-button-surface': surface?.secondaryButton ?? 'transparent',
    '--editor-quiet-bar-background': surface?.secondaryButton ?? colors.panel,
    '--editor-field-background': surface?.field ? tint(surface.field.color, surface.field.opacity) : colors.panel,
    '--color-eyebrow': surface?.eyebrow ?? colors['accent-text'],
    '--color-danger-surface': surface?.dangerSurface ?? colors.panel,
    '--editor-action-gradient': surface && Array.isArray(surface.primaryHover) ? `linear-gradient(90deg, ${surface.primaryHover.join(', ')})` : 'none',
    '--editor-canvas-wash': surface?.canvasWash && surface.canvasWash.opacity > 0 ? surface.canvasWash.colors.map((color, index) => `radial-gradient(ellipse at ${[0, 50, 100][index]}% 0%, ${tint(color, surface.canvasWash!.opacity)}, transparent 65%)`).join(', ') : 'none',
    '--editor-dialog-backdrop': surface?.backdrop ? tint(surface.backdrop.color, surface.backdrop.opacity) : tint(colors.secondary, 45),
    '--editor-popup-shadow': surface?.shadow ? `0 4px 6px -1px ${shadow}, 0 2px 4px -2px ${shadow}` : `0 0.5rem 1.25rem ${tint(colors.secondary, 15)}`,
    '--editor-dialog-shadow': surface?.shadow ? `0 4px 6px -1px ${shadow}, 0 2px 4px -2px ${shadow}` : `0 2rem 4rem ${tint(colors.secondary, 25)}`,
    '--editor-panel-shadow': `0 1rem 2.5rem ${tint(surface?.panelShadow?.color ?? colors.secondary, surface?.panelShadow?.opacity ?? 6)}`,
    '--editor-toggle-shadow': `0 0.15rem 0.45rem ${tint(surface?.toggleShadow?.color ?? colors.secondary, surface?.toggleShadow?.opacity ?? 8)}`,
  };
}

const LEGACY_FONT_ROLES = ['ui', 'serif', 'mono', 'editorSource'] as const;
const V3_FONT_ROLES = [...LEGACY_FONT_ROLES, 'heading', 'subHeading', 'eyebrow'] as const;
const FONT_ROLES: readonly EditorThemeFontRole[] = [...V3_FONT_ROLES, 'articleSource'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const PALETTE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT_PATTERN = /^[\p{L}\p{N}\s,'"_-]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], label: ProductMessageValue, errors: ProductMessageFields[]): void {
  const required = new Set(expected);
  for (const key of expected) if (!(key in record)) errors.push(productMessage("editorThemes.isMissing", { "label": label, "key": key }));
  for (const key of Object.keys(record)) if (!required.has(key)) errors.push(productMessage("editorThemes.containsUnknownField", { "label": label, "key": key }));
}

export function inspectEditorTheme(value: unknown): ProductMessageFields[] {
  const errors: ProductMessageFields[] = [];
  if (!isRecord(value)) return [productMessage("editorThemes.theTopLevelOfAnEditorThemeMustBeAnObject")];
  exactKeys(value, ['kind', 'id', 'name', 'version', 'formatVersion', 'palette', 'colors', 'fonts', ...('surfaces' in value ? ['surfaces'] : [])], 'Editor theme', errors);
  if (value.kind !== 'editor-theme') errors.push(productMessage("editorThemes.themeKindMustBeEditorTheme"));
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) errors.push(productMessage("editorThemes.theThemeIdAcceptsLowercaseLettersNumbersAndHyphensOnlyWithAt"));
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) errors.push(productMessage("editorThemes.theThemeNameMustContain180Characters"));
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) errors.push(productMessage("editorThemes.theThemeVersionMustContainThreeNumericSegments"));
  if (![1, 2, 3, 4].includes(value.formatVersion as number)) errors.push(productMessage("editorThemes.editorThemeFormatversionSupportsOnly123Or4"));

  const palette = value.palette;
  if (!isRecord(palette) || !Object.keys(palette).length || Object.keys(palette).length > 130) {
    errors.push(productMessage("editorThemes.theThemePaletteMustContain1100Colors"));
  } else {
    for (const [key, color] of Object.entries(palette)) {
      if (!PALETTE_KEY_PATTERN.test(key) || typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
        errors.push(productMessage("editorThemes.paletteEntryAcceptsHexColorsWithoutTransparencyOnly", { "key": key }));
      }
    }
  }
  if ('surfaces' in value && (!isRecord(palette) || !validEditorThemeSurfaces(value.surfaces, palette))) errors.push(productMessage("editorThemes.themeSurfacesRequireLightAndDarkPaletteReferencesBoundedOpacityAndA"));

  if (!isRecord(value.colors)) errors.push(productMessage("editorThemes.themeColorsMustContainLightAndDark"));
  else {
    exactKeys(value.colors, ['light', 'dark'], productReference("editorThemes.themeColors"), errors);
    for (const mode of ['light', 'dark'] as const) {
      const roles = value.colors[mode];
      if (!isRecord(roles)) {
        errors.push(productMessage("editorThemes.theColorRolesMustBeAnObject", { "mode": mode }));
        continue;
      }
      // Existing theme files inherit the added role without a disk migration.
      exactKeys(roles, EDITOR_COLOR_ROLES.filter(role => role !== 'search-hit' || role in roles), productReference("editorThemes.colorRoles", { "mode": mode }), errors);
      for (const [role, key] of Object.entries(roles)) {
        if (typeof key !== 'string' || !isRecord(palette) || !(key in palette)) errors.push(productMessage("editorThemes.doesNotReferenceAValidPaletteColor", { "mode": mode, "role": role }));
      }
    }
  }

  if (!isRecord(value.fonts)) errors.push(productMessage("editorThemes.themeFontsMustBeAnObject"));
  else {
    // Older v2 files inherit the UI font for eyebrows without rewriting the file.
    const expectedFonts = value.formatVersion === 1 ? LEGACY_FONT_ROLES : value.formatVersion === 2
      ? [...LEGACY_FONT_ROLES, 'heading', ...('eyebrow' in value.fonts ? ['eyebrow'] : [])] : value.formatVersion === 3 ? V3_FONT_ROLES : FONT_ROLES;
    exactKeys(value.fonts, expectedFonts, productReference("editorThemes.themeFonts"), errors);
    for (const [role, stack] of Object.entries(value.fonts)) {
      if (typeof stack !== 'string' || !stack.trim() || stack.length > 180 || !FONT_PATTERN.test(stack)) {
        errors.push(productMessage("editorThemes.fontIsUnsupportedOrUnsafe", { "role": role }));
      }
    }
  }
  return errors;
}

export function validateEditorTheme(value: unknown): string[] {
  return inspectEditorTheme(value).map(issue => issue.message);
}

export function parseEditorThemeJson(source: string): EditorTheme {
  if (source.length > 60_000) throw new ProductError("editorThemes.editorThemeJsonExceeds60000Characters");
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch (error) { throw new ProductError("editorThemes.editorThemeJsonIsInvalid", { "cause": productCause(error) }); }
  const errors = inspectEditorTheme(parsed);
  if (errors.length) throw new ProductError('shared.compose', { parts: productJoin(errors, '；') });
  const theme = parsed as EditorTheme;
  const legacy = (parsed as { formatVersion: number }).formatVersion < 4;
  const palette = { ...theme.palette };
  const colors = Object.fromEntries((['light', 'dark'] as const).map(mode => {
    let searchKey = theme.colors[mode]['search-hit'];
    if (!searchKey) {
      searchKey = `default-search-${mode}`;
      while (searchKey in palette) searchKey += '-x';
      palette[searchKey] = DEFAULT_EDITOR_SEARCH_COLOR;
    }
    return [mode, Object.fromEntries(EDITOR_COLOR_ROLES.map(role => [role, role === 'search-hit' ? searchKey : theme.colors[mode][role]]))];
  })) as EditorTheme['colors'];
  return { ...theme, palette, colors, formatVersion: 4, fonts: { ...theme.fonts,
    heading: theme.fonts.heading ?? theme.fonts.ui,
    subHeading: theme.fonts.subHeading ?? theme.fonts.ui, eyebrow: theme.fonts.eyebrow ?? theme.fonts.ui,
    articleSource: legacy ? theme.fonts.editorSource : theme.fonts.articleSource,
    editorSource: legacy ? codeFontStack(theme.fonts.mono) : theme.fonts.editorSource,
  } };
}

const builtinEditorThemes = {
  'en-US': getEditorThemeTemplateJson('en-US').map(source => parseEditorThemeJson(JSON.stringify(source))),
  'zh-CN': getEditorThemeTemplateJson('zh-CN').map(source => parseEditorThemeJson(JSON.stringify(source))),
};
export function getBuiltinEditorThemes(locale: string = 'en-US'): readonly EditorTheme[] { return builtinEditorThemes[locale === 'zh-CN' ? 'zh-CN' : 'en-US']; }
export const BUILTIN_EDITOR_THEMES = getBuiltinEditorThemes();

export const BASE_EDITOR_THEME = BUILTIN_EDITOR_THEMES[0];
export const DEFAULT_EDITOR_THEME = BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'rainy-design-slate')!;

export function resolveEditorThemeColors(theme: EditorTheme, mode: EditorColorScheme): Record<EditorColorRole, string> {
  return Object.fromEntries(EDITOR_COLOR_ROLES.map((role) => [role, theme.palette[theme.colors[mode][role]]])) as Record<EditorColorRole, string>;
}

export function findEditorTheme(themes: readonly EditorTheme[], id: string): EditorTheme | undefined {
  return themes.find((theme) => theme.id === id);
}

export function composeLegacyEditorTheme(preset: string, accent: string, font: string): EditorTheme {
  // Freeze the original Mist colors so v1 workspace migration stays lossless.
  const legacyThemes = BUILTIN_EDITOR_THEMES.map((theme) => theme.id === 'mist' ? parseEditorThemeJson(JSON.stringify(LEGACY_MIST_THEME_JSON)) : theme);
  const neutral = findEditorTheme(legacyThemes, preset);
  const accentTheme = findEditorTheme(legacyThemes, { teal: 'sea-glass', moss: 'linen', berry: 'mist' }[accent] ?? '');
  if (!neutral || !accentTheme || !['sans', 'serif'].includes(font)) throw new ProductError("editorThemes.legacyAppearanceOptionsCannotBeMigrated");
  const accentRoles = new Set<EditorColorRole>(['accent', 'accent-strong', 'accent-text', 'accent-soft', 'accent-line', 'selection']);
  const colors = Object.fromEntries((['light', 'dark'] as const).map((mode) => [mode,
    Object.fromEntries(EDITOR_COLOR_ROLES.map((role) => [role,
      accentRoles.has(role) ? accentTheme.colors[mode][role] : neutral.colors[mode][role],
    ])),
  ])) as EditorTheme['colors'];
  const theme: EditorTheme = {
    kind: 'editor-theme', id: `legacy-${preset}-${accent}-${font}`, name: productText("editorThemes.legacyAppearanceMigration"), version: '1.0.0', formatVersion: 4,
    palette: { ...neutral.palette, ...accentTheme.palette }, colors,
    fonts: { ...neutral.fonts, ui: font === 'serif' ? neutral.fonts.serif : BASE_EDITOR_THEME.fonts.ui, heading: font === 'serif' ? neutral.fonts.serif : BASE_EDITOR_THEME.fonts.ui, subHeading: font === 'serif' ? neutral.fonts.serif : BASE_EDITOR_THEME.fonts.ui, eyebrow: font === 'serif' ? neutral.fonts.serif : BASE_EDITOR_THEME.fonts.ui },
  };
  const errors = inspectEditorTheme(theme);
  if (errors.length) throw new ProductError("editorThemes.legacyAppearanceMigrationFailed", { "details": productJoin(errors, '；') });
  return theme;
}
