import { ProductError, productCause, productJoin, productMessage, productReference, productText, type ProductMessageFields, type ProductMessageValue } from "./i18n/productMessages";
import { EDITOR_THEME_TEMPLATE_JSON, LEGACY_MIST_THEME_JSON } from '../themes/editor-themes/index';
import { codeFontStack } from './fontCatalog';

export const EDITOR_COLOR_ROLES = [
  'canvas', 'rail', 'list', 'panel', 'hover', 'popup-bg',
  'primary', 'secondary', 'muted', 'faint', 'popup-text',
  'line', 'line-strong',
  'accent', 'accent-strong', 'accent-text', 'accent-soft', 'accent-line', 'selection', 'on-accent',
  'success', 'success-surface', 'warning', 'warning-strong', 'warning-surface', 'warning-line', 'danger', 'on-danger',
  'editor-surface', 'editor-text', 'editor-syntax', 'editor-heading', 'editor-quote',
] as const;

export type EditorColorRole = (typeof EDITOR_COLOR_ROLES)[number];
export type EditorColorScheme = 'light' | 'dark';
export type EditorThemeFontRole = 'ui' | 'serif' | 'mono' | 'editorSource' | 'articleSource' | 'heading' | 'subHeading' | 'eyebrow';

export type EditorThemeSurfaces = Record<EditorColorScheme, {
  primaryButton: string;
  primaryText: string;
  primaryHover: string | [string, string, string, string];
  secondaryButton: string;
  eyebrow: string;
  dangerSurface: string;
  field: { color: string; opacity: number };
  shadow: { color: string; opacity: number };
  backdrop?: { color: string; opacity: number };
  canvasWash: { colors: [string, string, string]; opacity: number };
}>;

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
    if (!record(surface) || !keys(surface, ['primaryButton', 'primaryText', 'primaryHover', 'secondaryButton', 'eyebrow', 'dangerSurface', 'field', 'shadow', 'canvasWash', ...('backdrop' in surface ? ['backdrop'] : [])])) return false;
    if (!color(surface.primaryHover) && (!Array.isArray(surface.primaryHover) || surface.primaryHover.length !== 4 || !surface.primaryHover.every(color))) return false;
    if (![surface.primaryButton, surface.primaryText, surface.secondaryButton, surface.eyebrow, surface.dangerSurface].every(color) || !tint(surface.field) || !tint(surface.shadow)) return false;
    if ('backdrop' in surface && !tint(surface.backdrop)) return false;
    const wash = surface.canvasWash;
    if (!record(wash) || !keys(wash, ['colors', 'opacity']) || !opacity(wash.opacity) || !Array.isArray(wash.colors) || wash.colors.length !== 3 || !wash.colors.every(color)) return false;
  }
  return true;
}

export function resolveEditorThemeSurfaces(theme: EditorTheme): EditorThemeSurfaces | undefined {
  if (!theme.surfaces) return undefined;
  return Object.fromEntries((['light', 'dark'] as const).map(mode => {
    const surface = theme.surfaces![mode], color = (key: string) => theme.palette[key];
    return [mode, { ...surface, primaryButton: color(surface.primaryButton), primaryText: color(surface.primaryText), primaryHover: typeof surface.primaryHover === 'string' ? color(surface.primaryHover) : surface.primaryHover.map(color), secondaryButton: color(surface.secondaryButton), eyebrow: color(surface.eyebrow), dangerSurface: color(surface.dangerSurface),
      ...(surface.backdrop ? { backdrop: { ...surface.backdrop, color: color(surface.backdrop.color) } } : {}),
      field: { ...surface.field, color: color(surface.field.color) }, shadow: { ...surface.shadow, color: color(surface.shadow.color) }, canvasWash: { ...surface.canvasWash, colors: surface.canvasWash.colors.map(color) } }];
  })) as EditorThemeSurfaces;
}

// Only fixed shapes plus validated color data enter CSS; JSON never supplies CSS.
export function editorSurfaceTokens(colors: Record<EditorColorRole, string>, surface?: EditorThemeSurfaces['light']): Record<string, string> {
  const tint = (color: string, opacity: number) => opacity === 100 ? color : `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
  const shadow = surface ? tint(surface.shadow.color, surface.shadow.opacity) : '';
  return {
    '--color-action': surface?.primaryButton ?? colors.accent,
    '--color-action-hover': surface ? (typeof surface.primaryHover === 'string' ? surface.primaryHover : surface.primaryButton) : colors['accent-strong'],
    '--color-action-text': surface?.primaryText ?? colors['on-accent'],
    '--color-action-line': surface ? colors['accent-line'] : colors.accent,
    '--color-button-surface': surface?.secondaryButton ?? 'transparent',
    '--editor-quiet-bar-background': surface?.secondaryButton ?? colors.panel,
    '--editor-field-background': surface ? tint(surface.field.color, surface.field.opacity) : colors.panel,
    '--color-eyebrow': surface?.eyebrow ?? colors['accent-text'],
    '--color-danger-surface': surface?.dangerSurface ?? colors.panel,
    '--editor-action-gradient': surface && Array.isArray(surface.primaryHover) ? `linear-gradient(90deg, ${surface.primaryHover.join(', ')})` : 'none',
    '--editor-canvas-wash': surface && surface.canvasWash.opacity > 0 ? surface.canvasWash.colors.map((color, index) => `radial-gradient(ellipse at ${[0, 50, 100][index]}% 0%, ${tint(color, surface.canvasWash.opacity)}, transparent 65%)`).join(', ') : 'none',
    '--editor-dialog-backdrop': surface?.backdrop ? tint(surface.backdrop.color, surface.backdrop.opacity) : tint(colors.secondary, 45),
    '--editor-popup-shadow': surface ? `0 4px 6px -1px ${shadow}, 0 2px 4px -2px ${shadow}` : `0 0.5rem 1.25rem ${tint(colors.secondary, 15)}`,
    '--editor-dialog-shadow': surface ? `0 4px 6px -1px ${shadow}, 0 2px 4px -2px ${shadow}` : `0 2rem 4rem ${tint(colors.secondary, 25)}`,
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
  if (!isRecord(palette) || !Object.keys(palette).length || Object.keys(palette).length > 100) {
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
      exactKeys(roles, EDITOR_COLOR_ROLES, productReference("editorThemes.colorRoles", { "mode": mode }), errors);
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
  return { ...theme, formatVersion: 4, fonts: { ...theme.fonts,
    heading: theme.fonts.heading ?? theme.fonts.ui,
    subHeading: theme.fonts.subHeading ?? theme.fonts.ui, eyebrow: theme.fonts.eyebrow ?? theme.fonts.ui,
    articleSource: legacy ? theme.fonts.editorSource : theme.fonts.articleSource,
    editorSource: legacy ? codeFontStack(theme.fonts.mono) : theme.fonts.editorSource,
  } };
}

export const BUILTIN_EDITOR_THEMES: readonly EditorTheme[] = EDITOR_THEME_TEMPLATE_JSON.map((source) => {
  return parseEditorThemeJson(JSON.stringify(source));
});

export const BASE_EDITOR_THEME = BUILTIN_EDITOR_THEMES[0];
export const DEFAULT_EDITOR_THEME = BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'rainy-studio-slate')!;

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
