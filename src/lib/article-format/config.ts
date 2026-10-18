import { productText } from "../i18n/productMessages";
import supportDefaults from '../../../resources/presets/platform/wechat-article/format/format-support.json' with { type: 'json' };
import validatorDefaults from '../../../resources/presets/platform/wechat-article/format/validator.json' with { type: 'json' };
import formatterDefaults from '../../../resources/presets/platform/wechat-article/format/formatter.json' with { type: 'json' };
import { VALIDATOR_CAPABILITIES, FORMATTER_CAPABILITIES, SOURCE_STRUCTURE_SELECTOR, record, shape, text, bool, number, strings, array, mapping, property, selector, choice, fail, type Guard } from './contracts';
import type { StylesheetsPolicy, RenderDocumentPolicy, RenderNodePolicy, CodeLayoutPolicy, PrismStylePolicy } from './styleTypes';
import { configurationMetadataGuards, type ConfigurationMetadata } from './libraryConfiguration';

export type RuleParameters = Record<string, unknown>;
export type FormatRule = { id: string; operator: string; enabled: boolean; stages: string[]; parameters: RuleParameters };
export type SupportRule = { id: string; section: string; title: string; severity: 'warning' | 'error'; source: string; validator: string; description?: string; anchor?: string };
export type FormatSupport = {
  schemaVersion: number;
  meta: { id: string; name: string; sources: Record<string, { url: string; version?: string; commit?: string }> } & ConfigurationMetadata;
  rules: SupportRule[];
  manualReview: { id: string; section: string; title: string; selector: string; description?: string; anchor?: string; source: string }[];
};
export type ProductThemeDefinition = {
  tokens: string[]; cssProperties: string[]; nodes: Record<string, string[]>;
  nodeProperties: Record<string, string>; wrapperProperties: string[];
  allowUnknownCssProperties: boolean; allowedDisplayValues: string[];
  limits: { id: number; name: number; value: number; css: number; json: number };
  formatVersion: number; kind: string; idPattern: string; versionPattern: string; valuePattern: string;
  darkTokens?: { allowPartial: boolean; fallback: 'light' };
  savePolicy?: { sampleResources: 'block' | 'review' };
};
export type FormatValidator = { schemaVersion: number; meta: { id: string; enabled?: boolean } & ConfigurationMetadata; product: { theme: ProductThemeDefinition }; rules: FormatRule[] };
export type FormatFormatter = {
  schemaVersion: number; meta: { id: string } & ConfigurationMetadata;
  markdown: { softBreaks: 'space' | 'line-break'; preserveExtraBlankLines: boolean; betweenBlocks: number; atEdges: number };
  preview: {
    light: { background: string }; dark: { background: string; mode?: 'algorithm' | 'tokens'; transform: string; options: Record<string, unknown> };
    fontFamily: string; color: string; stripThemeBackground: boolean;
  };
  output: {
    wrapperTag: string; dropCssProperties: string[]; inlineProperties: string[]; dimensionProperties: string[];
    preserveAutoDimensions: boolean; preserveAttributes: string[]; removeClasses: boolean;
    stripRootBackground: boolean; colorEncoding: 'rgb' | 'preserve';
    tagMap?: Record<string, string>; rootStyleOmissions?: string[];
    plainText: { maxConsecutiveNewlines: number; trim: boolean };
    visual: { width: number; pngBackground: string; pdfBackground: string; maxCanvasSide: number; pdfMargin: number };
  };
  css: { utilityPropertyAliases: Record<string, string> }; codeHighlight: { enabled: boolean; styles: { selectors: string[]; declarations: Record<string, string> }[]; engine?: 'highlight' | 'prism'; themeDefaults?: boolean; prismStyles?: PrismStylePolicy };
  codeWhitespace: { enabled: boolean; tabSize: number };
  stylesheets?: StylesheetsPolicy;
  document?: RenderDocumentPolicy;
  nodes?: RenderNodePolicy;
  codeLayout?: CodeLayoutPolicy;
  headingIds?: 'auto' | 'explicit';
  math?: { singleDollar: boolean; maxLength: number; maxExpressions: number };
  mermaid?: { theme: 'default' | 'neutral' | 'dark'; maxLength: number; maxDiagrams: number };
};
export type FormatBundle = { support: FormatSupport; validator: FormatValidator; formatter: FormatFormatter };

// A raw formatter is editable JSON; the resolved policy is an immutable engine input.
export type FormatterStep = { id: string; operator: string; enabled: boolean; parameters: RuleParameters };
export type RawFormatter = { schemaVersion: number; meta: { id: string } & ConfigurationMetadata; steps: FormatterStep[] };
export type RawFormatBundle = { support: FormatSupport; validator: FormatValidator; formatter: RawFormatter };
export const DEFAULT_FORMAT_BUNDLE = { support: supportDefaults, validator: validatorDefaults, formatter: formatterDefaults } as unknown as RawFormatBundle;
export const FORMAT_OPERATORS = new Set(Object.keys(VALIDATOR_CAPABILITIES));

// This only gates platform standards. Product syntax, safety and resources stay active.
export function enabledFormatRules(bundle: Pick<FormatBundle, 'validator'>): FormatRule[] {
  return bundle.validator.meta.enabled === false ? [] : bundle.validator.rules.filter(rule => rule.enabled);
}

const identifier: Guard = (value, path) => { text(value, path); if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(value))) fail(path, productText("config.invalidId")); };
const pattern: Guard = (value, path) => { text(value, path); if (String(value).length > 512) fail(path, productText("config.regularExpressionIsTooLong")); try { new RegExp(String(value), 'u'); } catch { fail(path, productText("config.invalidRegularExpression")); } };
const sourceGuard = shape({ url: text }, { version: text, commit: text });
const themeGuard = shape({
  tokens: strings, cssProperties: array(property), nodes: mapping(array(selector, 1), identifier),
  nodeProperties: mapping(property, identifier), wrapperProperties: strings, allowUnknownCssProperties: bool,
  allowedDisplayValues: strings, limits: shape({ id: number(1, 10000, true), name: number(1, 10000, true), value: number(1, 100000, true), css: number(1, 10000000, true), json: number(1, 10000000, true) }),
  formatVersion: number(1, 1, true), kind: choice('article-theme'), idPattern: pattern, versionPattern: pattern, valuePattern: pattern,
}, {
  darkTokens: shape({ allowPartial: bool, fallback: choice('light') }),
  savePolicy: shape({ sampleResources: choice('block', 'review') }),
});
export function validateFormatBundle(input: unknown): RawFormatBundle {
  shape({ support: shape({ schemaVersion: number(1, 1, true), meta: shape({ id: identifier, name: text, sources: mapping(sourceGuard, identifier) }, configurationMetadataGuards),
    rules: array(shape({ id: identifier, section: text, title: text, severity: choice('warning', 'error'), source: identifier, validator: identifier }, { description: text, anchor: text })),
    manualReview: array(shape({ id: identifier, section: text, title: text, selector, source: identifier }, { description: text, anchor: text })),
  }), validator: shape({ schemaVersion: number(1, 1, true), meta: shape({ id: identifier }, { enabled: bool, ...configurationMetadataGuards }), product: shape({ theme: themeGuard }),
    rules: array(shape({ id: identifier, operator: text, enabled: bool, stages: array(choice('authoring', 'rendered'), 1), parameters: (value, path) => { record(value, path); } })),
  }), formatter: shape({ schemaVersion: number(1, 1, true), meta: shape({ id: identifier }, configurationMetadataGuards), steps: array(shape({ id: identifier, operator: text, enabled: bool, parameters: (value, path) => { record(value, path); } })) }),
  })(input, productText("config.formatTrio"));
  const bundle = input as RawFormatBundle;
  if (new Set([bundle.support.meta.id, bundle.validator.meta.id, bundle.formatter.meta.id]).size !== 1) fail('meta.id', productText("config.theThreeConfigurationsDoNotAgreeAndCannotBeMixed"));
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) fail(path, productText("config.duplicateIdOrValue")); };
  unique([...bundle.support.rules, ...bundle.support.manualReview].map(rule => rule.id), productText("config.formatSupportRuleId"));
  unique(bundle.support.rules.map(rule => rule.validator), productText("config.formatSupportValidatorReference"));
  unique(bundle.validator.rules.map(rule => rule.id), productText("config.validatorRuleId"));
  unique(bundle.formatter.steps.map(step => step.id), productText("config.formatterStepId"));
  for (const rule of bundle.support.rules) {
    if (!Object.hasOwn(bundle.support.meta.sources, rule.source)) fail(rule.id, productText("config.theStandardsSourceDoesNotExist"));
    if (!bundle.validator.rules.some(item => item.id === rule.validator)) fail(rule.id, productText("config.theValidatorReferenceDoesNotExist"));
  }
  for (const rule of bundle.support.manualReview) if (!Object.hasOwn(bundle.support.meta.sources, rule.source)) fail(rule.id, productText("config.theManualReviewItemSourceDoesNotExist"));
  for (const rule of bundle.validator.rules) {
    if (!bundle.support.rules.some(item => item.validator === rule.id)) fail(rule.id, productText("config.theValidatorHasNoCorrespondingStandardsEntry"));
    if (!Object.hasOwn(VALIDATOR_CAPABILITIES, rule.operator)) fail(rule.id, productText("config.unknownValidationOperator", { "ruleOperator": rule.operator }));
    const contract = VALIDATOR_CAPABILITIES[rule.operator];
    contract.parameters(rule.parameters, `validator.${rule.id}.parameters`);
    unique(rule.stages, `${rule.id}.stages`);
    if (['dom.leaf-content', 'dom.nodeleaf-content'].includes(rule.operator) && rule.stages.includes('authoring') && !SOURCE_STRUCTURE_SELECTOR.test(String(rule.parameters.selector))) fail(rule.id, productText("config.sourceStructureChecksSupportOnlyTagOrTagAttributeSelectorsComplexSelectors"));
    if (rule.stages.some(stage => !contract.stages.includes(stage))) fail(rule.id, productText("config.theOperatorDoesNotSupportTheSpecifiedStage"));
    if (rule.operator.startsWith('style.') && rule.parameters.selector && rule.stages.includes('authoring')) fail(rule.id, productText("config.selectorScopingRequiresTheRenderedStage"));
  }
  const used = new Set<string>();
  for (const step of bundle.formatter.steps) {
    if (!Object.hasOwn(FORMATTER_CAPABILITIES, step.operator)) fail(step.id, productText("config.unknownFormattingOperator", { "stepOperator": step.operator }));
    const contract = FORMATTER_CAPABILITIES[step.operator];
    contract.parameters(step.parameters, `formatter.${step.id}.parameters`);
    if (step.enabled && used.has(step.operator) && !contract.multiple) fail(step.id, productText("config.multipleEnabledStepsUseTheSameOperatorAndWouldConflict"));
    if (step.enabled) used.add(step.operator);
  }
  return bundle;
}

export function compileFormatBundle(input: RawFormatBundle): FormatBundle {
  const raw = validateFormatBundle(input);
  // Neutral engine behavior is used when a capability is disabled. These are not platform rules.
  const formatter: FormatFormatter = {
    schemaVersion: raw.formatter.schemaVersion, meta: raw.formatter.meta,
    markdown: { softBreaks: 'space', preserveExtraBlankLines: false, betweenBlocks: 2, atEdges: 1 },
    preview: { light: { background: 'transparent' }, dark: { background: 'transparent', transform: 'preserve', options: {} }, fontFamily: 'inherit', color: 'inherit', stripThemeBackground: false },
    output: { wrapperTag: 'section', dropCssProperties: [], inlineProperties: [], dimensionProperties: [], preserveAutoDimensions: true, preserveAttributes: [], removeClasses: false, stripRootBackground: false, colorEncoding: 'preserve', plainText: { maxConsecutiveNewlines: 100, trim: false }, visual: { width: 750, pngBackground: 'transparent', pdfBackground: '#ffffff', maxCanvasSide: 16000, pdfMargin: 36 } },
    css: { utilityPropertyAliases: {} }, codeHighlight: { enabled: false, styles: [] }, codeWhitespace: { enabled: false, tabSize: 4 },
  };
  for (const step of raw.formatter.steps) {
    if (!step.enabled) continue;
    const p = step.parameters;
    switch (step.operator) {
      case 'markdown.soft-breaks': formatter.markdown.softBreaks = p.mode as 'space' | 'line-break'; break;
      case 'markdown.blank-lines': Object.assign(formatter.markdown, { preserveExtraBlankLines: p.preserve, betweenBlocks: p.betweenBlocks, atEdges: p.atEdges }); break;
      case 'markdown.code-highlight': Object.assign(formatter.codeHighlight, { enabled: true, ...p }); break;
      case 'markdown.heading-ids': formatter.headingIds = p.mode as 'auto' | 'explicit'; break;
      case 'markdown.math': formatter.math = p as NonNullable<FormatFormatter['math']>; break;
      case 'markdown.mermaid': formatter.mermaid = p as NonNullable<FormatFormatter['mermaid']>; break;
      case 'markdown.code-layout': formatter.codeLayout = p as CodeLayoutPolicy; break;
      case 'markdown.code-whitespace': Object.assign(formatter.codeWhitespace, { enabled: true, tabSize: p.tabSize }); break;
      case 'preview.surface': Object.assign(formatter.preview, { light: { background: p.lightBackground }, fontFamily: p.fontFamily, color: p.color, stripThemeBackground: p.stripThemeBackground }); formatter.preview.dark.background = p.darkBackground as string; break;
      case 'preview.dark-mode': Object.assign(formatter.preview.dark, p, {
        mode: p.mode ?? (p.transform === 'preserve' ? 'tokens' : 'algorithm'),
        transform: p.mode === 'tokens' ? 'preserve' : p.transform,
        options: p.mode === 'tokens' ? {} : p.options,
      }); break;
      case 'css.drop-properties': formatter.output.dropCssProperties.push(...p.properties as string[]); break;
      case 'css.utility-aliases': formatter.css.utilityPropertyAliases = p.aliases as Record<string, string>; break;
      case 'css.stylesheets': formatter.stylesheets = p as StylesheetsPolicy; break;
      case 'render.document': formatter.document = p as RenderDocumentPolicy; break;
      case 'render.nodes': formatter.nodes = p as RenderNodePolicy; break;
      case 'output.css': case 'output.html': Object.assign(formatter.output, p); break;
      case 'output.text': Object.assign(formatter.output.plainText, p); break;
      case 'output.visual': Object.assign(formatter.output.visual, p); break;
      default: fail(step.id, productText("config.theOperatorHasNoExecutionImplementation"));
    }
  }
  formatter.output.dropCssProperties = [...new Set(formatter.output.dropCssProperties)];
  return { support: raw.support, validator: raw.validator, formatter };
}

export function canonicalFormatJson(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, normalize(val)])) : item;
  return JSON.stringify(normalize(value));
}
export function formatFingerprint(value: unknown): string {
  const text = canonicalFormatJson(value); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function freezeFormatBundle<T>(bundle: T): T {
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  const copy = JSON.parse(JSON.stringify(bundle)) as T; freeze(copy); return copy;
}
