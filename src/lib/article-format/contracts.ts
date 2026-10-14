import { ProductError, productReference, productText } from "../i18n/productMessages";
// Capability contracts describe engine inputs. Platform decisions belong to library JSON.
export type Guard = (value: unknown, path: string) => void;
export const record = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductError("contracts.mustBeAnObject", { "path": path });
  return value as Record<string, unknown>;
};
export const fail = (path: string, detail: string): never => { throw new Error(`${path}：${detail}。`); };
export const text: Guard = (value, path) => { if (typeof value !== 'string' || !value.trim()) fail(path, productText("contracts.mustBeANonemptyString")); };
export const bool: Guard = (value, path) => { if (typeof value !== 'boolean') fail(path, productText("contracts.mustBeABoolean")); };
export const number = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER, integer = false): Guard => (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || integer && !Number.isInteger(value)) fail(path, productText("contracts.valueMustBeBetweenAnd", { "minimum": minimum, "maximum": maximum, "value": (integer ? productReference("contracts.andMustBeAnInteger") : '') }));
};
export const choice = (...values: string[]): Guard => (value, path) => { if (!values.includes(String(value))) fail(path, productText("contracts.supportedValues", { "details": values.join('／') })); };
export const array = (guard: Guard, minimum = 0): Guard => (value, path) => {
  if (!Array.isArray(value) || value.length < minimum) fail(path, productText("contracts.arrayIsMissingOrTooShort"));
  (value as unknown[]).forEach((item, index) => guard(item, `${path}[${index}]`));
};
export const strings = array(text);
export const mapping = (guard: Guard, keyGuard: Guard = text): Guard => (value, path) => {
  Object.entries(record(value, path)).forEach(([key, item]) => { keyGuard(key, productText("contracts.keyName", { "path": path })); guard(item, `${path}.${key}`); });
};
export const shape = (required: Record<string, Guard>, optional: Record<string, Guard> = {}): Guard => (value, path) => {
  const object = record(value, path);
  for (const name of Object.keys(object)) if (!Object.hasOwn(required, name) && !Object.hasOwn(optional, name)) fail(`${path}.${name}`, productText("contracts.unknownField"));
  for (const [name, guard] of Object.entries(required)) { if (!Object.hasOwn(object, name)) fail(`${path}.${name}`, productText("contracts.requiredFieldIsMissing")); guard(object[name], `${path}.${name}`); }
  for (const [name, guard] of Object.entries(optional)) if (Object.hasOwn(object, name)) guard(object[name], `${path}.${name}`);
};
export const SOURCE_STRUCTURE_SELECTOR = /^([a-z][a-z0-9-]*)(?:\[([a-z][a-z0-9-]*)\])?$/;
export const property: Guard = (value, path) => { text(value, path); if (!/^(?:--|-)?[a-z][a-z0-9-]*$/.test(String(value))) fail(path, productText("contracts.invalidCssProperty")); };
export const attribute: Guard = (value, path) => { text(value, path); if (!/^[a-z][a-z0-9-]*$/.test(String(value)) || /^on/i.test(String(value)) || ['srcdoc', 'style', 'class'].includes(String(value))) fail(path, productText("contracts.thisAttributeCannotBeRetained")); };
export const cssValue: Guard = (value, path) => { text(value, path); if (/[;{}<>\\]|url\s*\(|expression\s*\(|javascript:/i.test(String(value))) fail(path, productText("contracts.notASafeCssValue")); };
export const selector: Guard = (value, path) => { text(value, path); if (typeof document !== 'undefined') { try { document.createDocumentFragment().querySelector(String(value)); } catch { fail(path, productText("contracts.selectorSyntaxIsInvalid")); } } if (/[{}<]|@/.test(String(value))) fail(path, productText("contracts.invalidSelector")); };
export const tag: Guard = (value, path) => { text(value, path); if (!/^[a-z][a-z0-9-]*$/.test(String(value)) || ['script', 'style', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'area', 'br', 'col', 'hr', 'img', 'input', 'param', 'source', 'track', 'wbr', 'svg', 'body', 'html'].includes(String(value))) fail(path, productText("contracts.invalidOrUnsafeContainerTag")); };
export const boundedString = (maximum: number): Guard => (value, path) => {
  if (typeof value !== 'string' || value.length > maximum) fail(path, productText("contracts.textTypeOrLengthIsInvalid"));
};
export const libraryPath: Guard = (value, path) => {
  text(value, path);
  if (typeof value !== 'string' || value.startsWith('/') || /[\\\u0000-\u001f?#]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..') || /^[a-z][a-z\d+.-]*:/i.test(value)) fail(path, productText("contracts.mustBeARelativePathWithinTheAuthorizedLibrary"));
};
const container = shape({ tag, classes: strings }, { id: (value, path) => {
  text(value, path); if (!/^[a-zA-Z][\w:-]*$/.test(String(value))) fail(path, productText("contracts.invalidContainerId"));
} });
const nullable = (guard: Guard): Guard => (value, path) => { if (value !== null) guard(value, path); };
const httpBase: Guard = (value, path) => {
  if (value === '') return;
  text(value, path); let parsed: URL;
  try { parsed = new URL(String(value)); } catch { fail(path, productText("contracts.linkBaseUrlIsInvalid")); }
  if (!['https:', 'http:'].includes(parsed!.protocol) || parsed!.username || parsed!.password) fail(path, productText("contracts.linkBaseMustBeAnHttpUrlWithoutCredentials"));
};
const highlightStyleKey: Guard = (value, path) => {
  text(value, path);
  if (String(value).length > 512 || /[{};@\u0000-\u001f]/.test(String(value)) || ['__proto__', 'constructor', 'prototype'].includes(String(value))) fail(path, productText("contracts.codeHighlightingStyleKeyIsInvalid"));
};
export const darkOptions = shape({}, {
  mode: choice('dark'), defaultDarkTextColor: cssValue, needJudgeFirstPage: bool, noEmit: bool,
  whitelist: shape({}, { attribute: array(attribute), tagName: strings }),
});

export const VALIDATOR_CAPABILITIES: Record<string, { stages: string[]; parameters: Guard }> = {
  'style.present': { stages: ['authoring', 'rendered'], parameters: shape({ property }, { selector }) },
  'style.values': { stages: ['authoring', 'rendered'], parameters: shape({ property, values: strings }, { selector }) },
  'style.transparent': { stages: ['authoring', 'rendered'], parameters: shape({ property }, { selector }) },
  'style.important': { stages: ['authoring', 'rendered'], parameters: shape({}, { selector }) },
  'dom.opacity-overlay': { stages: ['rendered'], parameters: shape({ property, value: number(0, 1), overlaySelector: selector }) },
  'dom.text-overlap': { stages: ['rendered'], parameters: shape({ property, singleLineExempt: bool, imageOnlyExempt: bool, sameLineOverlap: number(0, 1), inkHeightFactor: number(0, 1) }) },
  'dom.responsive-width': { stages: ['rendered'], parameters: shape({ widths: array(number(1, 10000, true), 2), ignoreAttribute: attribute, widthDifference: number(), ratioDifference: number(0, 1), overflowTolerance: number(), imageLoadTimeoutMs: number(1, 10000, true), responsiveFillTolerance: number(0, 1), constrainMaxWidth: bool, excludeCenteredOverflow: bool, candidateSelector: selector, paragraphSelector: selector, dimensionProperty: property, ignoredWidthValues: strings, exemptElements: strings }) },
  'dom.height-overflow': { stages: ['rendered'], parameters: shape({ property, zero: number(), svgExempt: bool, imageOnlyExempt: bool, scrollExempt: bool, ignoreSelector: selector }) },
  'dom.animation-begin': { stages: ['rendered'], parameters: shape({ selector, touch: text, click: text }) },
  'dom.pre-text': { stages: ['rendered'], parameters: shape({ selector, codeExempt: bool }) },
  'dom.redundant-nesting': { stages: ['rendered'], parameters: shape({ limit: number(1, 1000, true), mediaExempt: strings }) },
  'dom.leaf-content': { stages: ['authoring', 'rendered'], parameters: shape({ selector, blockElements: strings }) },
  'dom.nodeleaf-content': { stages: ['authoring', 'rendered'], parameters: shape({ selector, allowedElements: strings, disallowedElements: strings, unknownComponents: choice('review', 'violation') }) },
  'official.dark-contrast': { stages: ['rendered'], parameters: shape({ minimum: number(1, 21), ignoreAttribute: attribute, ignoreValue: text }) },
  'official.dark-gradient': { stages: ['rendered'], parameters: shape({ ignoreAttribute: attribute, ignoreValue: text }) },
};

export const FORMATTER_CAPABILITIES: Record<string, { phase: string; multiple?: boolean; parameters: Guard }> = {
  'markdown.soft-breaks': { phase: 'markdown', parameters: shape({ mode: choice('space', 'line-break') }) },
  'markdown.blank-lines': { phase: 'markdown', parameters: shape({ preserve: bool, betweenBlocks: number(1, 100, true), atEdges: number(1, 100, true) }) },
  'markdown.code-highlight': { phase: 'markdown', parameters: shape({ styles: array(shape({ selectors: array(selector, 1), declarations: mapping(cssValue, property) })) }, { engine: choice('highlight', 'prism'), themeDefaults: bool, prismStyles: mapping(mapping(cssValue, property), highlightStyleKey) }) },
  'markdown.heading-ids': { phase: 'markdown', parameters: shape({ mode: choice('auto', 'explicit') }) },
  'markdown.code-layout': { phase: 'markdown', parameters: shape({ wrapperClasses: strings, preTag: choice('div', 'pre'), contentClasses: strings, copyClasses: strings, copyHtml: boundedString(65536), copyLabel: text }) },
  'markdown.code-whitespace': { phase: 'markdown', parameters: shape({ tabSize: number(1, 16, true) }) },
  'preview.surface': { phase: 'preview', parameters: shape({ lightBackground: cssValue, darkBackground: cssValue, fontFamily: cssValue, color: cssValue, stripThemeBackground: bool }) },
  'preview.dark-mode': { phase: 'preview', parameters: shape({ transform: choice('preserve', 'mp-darkmode'), options: darkOptions }) },
  'css.drop-properties': { phase: 'css', multiple: true, parameters: shape({ properties: array(property) }) },
  'css.utility-aliases': { phase: 'css', parameters: shape({ aliases: mapping(property, property) }) },
  'css.stylesheets': { phase: 'css', parameters: shape({ entry: libraryPath, publicRoot: libraryPath }, { allowUnknownClasses: bool }) },
  'render.document': { phase: 'preview', parameters: shape({
    root: container, body: nullable(container), beforeHtml: boundedString(65536), afterHtml: boundedString(65536),
    language: text, preserveIds: bool,
    viewport: nullable(shape({ width: number(1, 10000, true), height: number(1, 10000, true), contentWidth: number(1, 10000, true) })),
  }) },
  'render.nodes': { phase: 'markdown', parameters: shape({
    image: shape({ width: number(1, 10000, true), height: number(1, 10000, true), classes: strings, style: mapping(cssValue, property), alt: boundedString(1000) }),
    link: shape({ classes: strings, rootBase: httpBase, externalTarget: choice('_blank', '_self') }),
  }) },
  'output.css': { phase: 'output', parameters: shape({ inlineProperties: array(property), dimensionProperties: array(property), preserveAutoDimensions: bool, colorEncoding: choice('rgb', 'preserve') }) },
  'output.html': { phase: 'output', parameters: shape({ wrapperTag: tag, preserveAttributes: array(attribute), removeClasses: bool, stripRootBackground: bool }) },
  'output.text': { phase: 'output', parameters: shape({ maxConsecutiveNewlines: number(1, 100, true), trim: bool }) },
  'output.visual': { phase: 'output', parameters: shape({ width: number(1, 10000, true), pngBackground: cssValue, pdfBackground: cssValue, maxCanvasSide: number(1, 32767, true), pdfMargin: number() }) },
};
