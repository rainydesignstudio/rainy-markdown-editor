import { ProductError, productCause, productJoin, productMessage, productReference, type ProductMessageFields } from "./i18n/productMessages";
import type { ThemeConfig } from './types';
import { articleFormatBlocks, articleFormatMessageReference, validateArticleFormatCss } from './articleFormat';

import { getFormatSnapshot } from './article-format/runtime';

function definition() { return getFormatSnapshot().bundle.validator.product.theme; }
const setOf = (values: readonly string[]) => new Set(values);

function hasUnsafeCssValue(value: string): boolean {
  return /(?:url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|@font-face|behavior\s*:|-moz-binding|<|\\)/i.test(value);
}

function validValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= definition().limits.value &&
    new RegExp(definition().valuePattern, 'u').test(value) && !hasUnsafeCssValue(value) && !/[{};]/.test(value) &&
    [...value.matchAll(/var\(\s*--([\w-]+)/gi)].every(match => setOf(definition().tokens).has(match[1]));
}

function validateCss(css: string, errors: ProductMessageFields[]): void {
  if (css.length > definition().limits.css) {
    errors.push(productMessage("themeValidation.themeCssExceedsCharacters", { "definition_limitsCss": definition().limits.css }));
    return;
  }
  if (hasUnsafeCssValue(css)) {
    errors.push(productMessage("themeValidation.themeCssContainsRemoteResourcesExecutableContentOrUnsupportedAtRules"));
    return;
  }

  const source = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!source) return;
  let cursor = 0;
  let rules = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const open = source.indexOf('{', cursor);
    const close = open < 0 ? -1 : source.indexOf('}', open + 1);
    if (open < 0 || close < 0 || source.slice(open + 1, close).includes('{')) {
      errors.push(productMessage("themeValidation.themeCssRuleBracesAreIncompleteOrContainNestedRules"));
      return;
    }
    const selectors = source.slice(cursor, open).split(',').map((selector) => selector.trim());
    const unsafeSelector = selectors.find((selector) => (selector !== '.article-preview' && !selector.startsWith('.article-preview .article-body')) ||
      !/^[\w\s.#:\[\]()='"*+>~,-]+$/.test(selector) || /:root|:host|:global|:has\(/i.test(selector));
    if (unsafeSelector) {
      errors.push(productMessage("themeValidation.themeCssSelectorsMustBeScopedWithinArticlePreviewArticleBody", { "unsafeSelector": unsafeSelector }));
      return;
    }
    const declarations = source.slice(open + 1, close).trim();
    for (const declaration of declarations.split(';').map((item) => item.trim()).filter(Boolean)) {
      const colon = declaration.indexOf(':');
      if (colon < 1) {
        errors.push(productMessage("themeValidation.themeCssContainsAnUnrecognizedDeclaration"));
        return;
      }
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (selectors.includes('.article-preview') && !definition().wrapperProperties.includes('*') && !definition().wrapperProperties.includes(property)) {
        errors.push(productMessage("themeValidation.theArticleWrapperDoesNotSupportThisCssDeclaration", { "value": (property || productReference("themeValidation.unknownProperty")) }));
        return;
      }
      if ((!definition().allowUnknownCssProperties && !definition().cssProperties.includes(property)) || !validValue(value)) {
        errors.push(productMessage("themeValidation.theThemeCssDeclarationIsUnsupportedOrUnsafe", { "value": (property || productReference("themeValidation.unknownProperty")) }));
        return;
      }
      if (property === 'display' && definition().allowedDisplayValues.length && !definition().allowedDisplayValues.includes(value)) {
        errors.push(productMessage("themeValidation.themeCssDisplaySupportsOnlyStaticValuesNeededForArticleLayout"));
        return;
      }
    }
    rules += 1;
    cursor = close + 1;
  }
  if (!rules) errors.push(productMessage("themeValidation.themeCssContainsNoRecognizableArticleStyleRules"));
}

export function inspectThemeCss(css: string): ProductMessageFields[] {
  const errors: ProductMessageFields[] = [];
  validateCss(css, errors);
  if (!errors.length) {
    // Structured reads stay separate from configured authoring/write diagnostics.
    const formatIssues = validateArticleFormatCss(css).filter(issue => articleFormatBlocks(issue.tier) || issue.kind === 'engine');
    if (formatIssues.length) errors.push(productMessage('shared.compose', { parts: articleFormatMessageReference(formatIssues) }));
  }
  return errors;
}

// Existing themes and snapshots remain readable. Authoring and publishing
// gates apply current library rules separately.
export function inspectThemeFormat(theme: ThemeConfig): ProductMessageFields[] {
  const issues = validateArticleFormatCss(theme.css);
  const blocking = issues.filter(issue => articleFormatBlocks(issue.tier) || issue.kind === 'engine');
  return blocking.length ? [productMessage('shared.compose', { parts: articleFormatMessageReference(blocking) })] : [];
}

export function inspectThemeConfig(value: unknown): ProductMessageFields[] {
  const errors: ProductMessageFields[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [productMessage("themeValidation.theTopLevelOfThemeJsonMustBeAnObject")];
  const theme = value as Partial<ThemeConfig>;
  if (theme.kind !== undefined && theme.kind !== definition().kind) errors.push(productMessage("themeValidation.articleThemeKindMustBe", { "definition_Kind": definition().kind }));
  if (typeof theme.id !== 'string' || theme.id.length > definition().limits.id || !new RegExp(definition().idPattern).test(theme.id)) errors.push(productMessage("themeValidation.theThemeIdAcceptsLowercaseLettersNumbersAndHyphensOnlyWithoutA"));
  if (typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > definition().limits.name) errors.push(productMessage("themeValidation.theThemeNameMustBeNonemptyAndContainAtMostCharacters", { "definition_limitsName": definition().limits.name }));
  if (typeof theme.version !== 'string' || !new RegExp(definition().versionPattern).test(theme.version)) errors.push(productMessage("themeValidation.theThemeVersionMustBeNumericForExample100"));
  if (theme.formatVersion !== definition().formatVersion) errors.push(productMessage("themeValidation.unsupportedThemeFormatversionCurrentVersion", { "definition_FormatVersion": definition().formatVersion }));
  if (!theme.tokens || typeof theme.tokens !== 'object' || Array.isArray(theme.tokens)) {
    errors.push(productMessage("themeValidation.themeTokensMustBeAnObject"));
  } else {
    const tokens = theme.tokens as Record<string, unknown>;
    for (const key of definition().tokens) if (!(key in tokens)) errors.push(productMessage("themeValidation.requiredTokenIsMissing", { "key": key }));
    for (const [key, token] of Object.entries(tokens)) {
      if (!definition().tokens.includes(key) || !validValue(token)) errors.push(productMessage("themeValidation.themeTokenIsUnsupportedOrUnsafe", { "key": key }));
    }
  }
  if (typeof theme.css !== 'string') errors.push(productMessage("themeValidation.themeCssMustBeText"));
  else validateCss(theme.css, errors);
  if (theme.nodes !== undefined) {
    if (!theme.nodes || typeof theme.nodes !== 'object' || Array.isArray(theme.nodes)) {
      errors.push(productMessage("themeValidation.themeNodesMustBeAnObject"));
    } else {
      for (const [node, rules] of Object.entries(theme.nodes)) {
        if (!(Object.hasOwn(definition().nodes, node)) || !rules || typeof rules !== 'object' || Array.isArray(rules)) {
          errors.push(productMessage("themeValidation.themeNodeIsUnsupported", { "node": node }));
          continue;
        }
        for (const [property, ruleValue] of Object.entries(rules)) {
          if (!(Object.hasOwn(definition().nodeProperties, property)) || !validValue(ruleValue)) {
            errors.push(productMessage("themeValidation.themeNodeContainsAnUnsupportedOrUnsafeRule", { "node": node, "property": property }));
          }
        }
      }
    }
  }
  return errors;
}

export function validateThemeCss(css: string): string[] { return inspectThemeCss(css).map(issue => issue.message); }
export function validateThemeFormat(theme: ThemeConfig): string[] { return inspectThemeFormat(theme).map(issue => issue.message); }
export function validateThemeConfig(value: unknown): string[] { return inspectThemeConfig(value).map(issue => issue.message); }

export function parseThemeConfigJson(source: string): ThemeConfig {
  let parsed: unknown;
  try {
    if (source.length > definition().limits.json) throw new ProductError("themeValidation.theFileExceedsCharacters", { "definition_limitsJson": definition().limits.json });
    parsed = JSON.parse(source);
  } catch (error) {
    throw new ProductError("themeValidation.themeJsonIsNotValidJson", { "cause": productCause(error) });
  }
  const errors = inspectThemeConfig(parsed);
  if (errors.length) throw new ProductError("fileSystem.themeConfigurationValidationFailed", { "details": productJoin(errors, '；') });
  return parsed as ThemeConfig;
}
