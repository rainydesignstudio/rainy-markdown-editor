import { ProductError, productJoin } from "./i18n/productMessages";
import type { ThemeConfig } from './types';
import { inspectThemeConfig } from './themeValidation';
import { BASIC_THEME, THEMES } from '../themes/article-themes/index';
export { BASIC_THEME, RAINY_THEME, ARTICLE_THEME_PRESETS, THEMES } from '../themes/article-themes/index';
import type { ThemeNodeKey } from './types';
import { getFormatSnapshot, type FormatSnapshot } from './article-format/runtime';

function articleCodeHighlightCss(scope = '', snapshot = getFormatSnapshot()): string {
  const config = snapshot.bundle.formatter.codeHighlight;
  if (!config.enabled || config.themeDefaults === false) return '';
  const body = `${scope ? `${scope} ` : ''}.article-preview .article-body`;
  return config.styles.map(group => `${group.selectors.map(selector => `${body} ${selector}`).join(', ')} { ${Object.entries(group.declarations).map(([property, value]) => `${property}: ${value};`).join(' ')} }`).join('\n');
}

export function getTheme(id: string | undefined): ThemeConfig {
  return THEMES.find((theme) => theme.id === id) ?? BASIC_THEME;
}

export function resolveDefaultArticleTheme(themes: readonly ThemeConfig[], id: string | null): ThemeConfig {
  return themes.find((theme) => theme.id === id)
    ?? themes.find((theme) => theme.id === BASIC_THEME.id)
    ?? themes[0]
    ?? BASIC_THEME;
}

function assertValidTheme(theme: ThemeConfig): void {
  const errors = inspectThemeConfig(theme);
  if (errors.length) throw new ProductError("fileSystem.themeConfigurationValidationFailed", { "details": productJoin(errors, '；') });
}

function nodeOverrideCss(theme: ThemeConfig, scope = ''): string {
  const definition = getFormatSnapshot().bundle.validator.product.theme;
  const selectors = definition.nodes;
  const nodeCss = Object.entries(theme.nodes ?? {}).map(([node, values]) => {
    const declarations = Object.entries(values).map(([property, value]) => {
      const cssProperty = definition.nodeProperties[property];
      return `  ${cssProperty}: ${value};`;
    }).join('\n');
    const previewRoot = `${scope ? `${scope} ` : ''}.article-preview`;
    return declarations
      ? `${(selectors[node] ?? []).map((selector) => `${previewRoot} .article-body ${selector}`).join(', ')} {\n${declarations}\n}`
      : '';
  }).filter(Boolean).join('\n');
  return nodeCss;
}

export function themeAuthoredCss(theme: ThemeConfig): string {
  return `${theme.css}\n${nodeOverrideCss(theme)}`;
}

function themeTokenDeclarations(theme: ThemeConfig): string {
  return Object.entries(theme.tokens)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
}

export function themePreviewCss(theme: ThemeConfig, instanceScope: string): string {
  assertValidTheme(theme);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(instanceScope)) throw new ProductError("themes.theThemePreviewInstanceScopeIsInvalid");
  const scope = `.theme-preview-instance-${instanceScope}`;
  const scopedCss = theme.css.replace(/\.article-preview/g, `${scope} .article-preview`);
  return `${scope} .article-preview {\n${themeTokenDeclarations(theme)}\n}\n${scopedCss}\n${articleCodeHighlightCss(scope)}\n${nodeOverrideCss(theme, scope)}`;
}

export function themeToCss(theme: ThemeConfig, snapshot: FormatSnapshot = getFormatSnapshot()): string {
  assertValidTheme(theme);
  const tokens = themeTokenDeclarations(theme);
  const nodeCss = nodeOverrideCss(theme);
  return `@theme static {\n${tokens}\n}\n@layer components {\n${theme.css}\n${articleCodeHighlightCss('', snapshot)}\n${nodeCss}\n}`;
}
