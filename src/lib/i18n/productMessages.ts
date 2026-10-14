import { createInstance, type TFunction } from 'i18next';
import zhMessages from '../../../resources/locale/zh-CN/messages.json' with { type: 'json' };

export type ProductMessageValue = string | number | boolean | null | undefined | ProductMessageInfo | ProductMessageSequence | readonly ProductMessageValue[];
export type ProductMessageInfo = { messageKey: string; messageParams?: Record<string, ProductMessageValue> };
export type ProductMessageSequence = { messageParts: readonly ProductMessageValue[]; separator: string };
export type ProductMessageFields = ProductMessageInfo & { message: string };

function flatten(value: unknown, prefix = ''): Array<[string, string]> {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[prefix + key, child] as [string, string]] : flatten(child, prefix + key + '.'));
}
const canonicalTemplates = flatten(zhMessages);
const literalMessages = new Map(canonicalTemplates.filter(([, text]) => !text.includes('{{')).map(([key, text]) => [text, key]));
const legacyTemplates = canonicalTemplates.filter(([, text]) => text.includes('{{') && /[\p{L}\p{N}]/u.test(text.replace(/{{[^}]+}}/g, ''))).map(([key, text]) => {
  const names: string[] = [];
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let expression = '', position = 0;
  for (const match of text.matchAll(/{{\s*([\w]+)\s*}}/g)) {
    expression += escape(text.slice(position, match.index)) + '([\\s\\S]*?)';
    names.push(match[1]); position = match.index! + match[0].length;
  }
  expression += escape(text.slice(position));
  return { key, names, expression: new RegExp('^' + expression + '$'), specificity: text.replace(/{{[^}]+}}/g, '').length };
}).sort((left, right) => right.specificity - left.specificity);

// Old product-owned notices and indexes lack message IDs. This bridge only matches complete known messages.
// User content, names and custom standard-rule descriptions must not be passed through this bridge.
export function legacyProductMessage(text: string): ProductMessageInfo | null {
  const literal = literalMessages.get(text);
  if (literal) return { messageKey: literal };
  if (text.length > 8192) return null;
  for (const template of legacyTemplates) {
    const match = template.expression.exec(text);
    if (match) return { messageKey: template.key, messageParams: Object.fromEntries(template.names.map((name, index) => [name, name === 'count' && /^\d+$/.test(match[index + 1]) ? Number(match[index + 1]) : match[index + 1]])) };
  }
  return null;
}

// Core diagnostics keep a fixed canonical language. UI locale never changes validation or stored values.
const canonical = createInstance();
void canonical.init({ lng: 'zh-CN', resources: { 'zh-CN': { messages: structuredClone(zhMessages) } }, defaultNS: 'messages', initAsync: false, interpolation: { escapeValue: false }, returnNull: false });

function parameters(info: ProductMessageInfo, t: TFunction): Record<string, unknown> {
  const render = (value: ProductMessageValue): unknown => Array.isArray(value) ? value.map(render).join('；') : isProductSequence(value) ? value.messageParts.map(render).join(value.separator) : isProductMessage(value) ? formatProductMessage(value, t) : value == null ? String(value) : value;
  return Object.fromEntries(Object.entries(info.messageParams ?? {}).map(([key, value]) => [key, render(value)]));
}

function isProductSequence(value: unknown): value is ProductMessageSequence {
  return Boolean(value && typeof value === 'object' && 'messageParts' in value && Array.isArray(value.messageParts) && 'separator' in value && typeof value.separator === 'string');
}

export function productJoin(messageParts: readonly ProductMessageValue[], separator = ''): ProductMessageSequence {
  return { messageParts, separator };
}

export function isProductMessage(value: unknown): value is ProductMessageInfo {
  return Boolean(value && typeof value === 'object' && 'messageKey' in value && typeof value.messageKey === 'string');
}

export function productMessage(messageKey: string, messageParams?: Record<string, ProductMessageValue>): ProductMessageFields {
  const info = { messageKey, ...(messageParams ? { messageParams } : {}) };
  return { ...info, message: formatProductMessage(info, canonical.getFixedT('zh-CN', 'messages')) };
}

export function productReference(messageKey: string, messageParams?: Record<string, ProductMessageValue>): ProductMessageInfo {
  return { messageKey, ...(messageParams ? { messageParams } : {}) };
}

export function productText(messageKey: string, messageParams?: Record<string, ProductMessageValue>): string {
  return productMessage(messageKey, messageParams).message;
}

export function productLabel(messageKey: string, messageParams?: Record<string, ProductMessageValue>) {
  const { message, ...info } = productMessage(messageKey, messageParams);
  return { ...info, label: message };
}

export class ProductError extends Error implements ProductMessageInfo {
  readonly messageKey: string;
  readonly messageParams?: Record<string, ProductMessageValue>;
  constructor(messageKey: string, messageParams?: Record<string, ProductMessageValue>) {
    super(productText(messageKey, messageParams));
    this.name = 'Error'; this.messageKey = messageKey; this.messageParams = messageParams;
  }
}

export function productCause(error: unknown): ProductMessageValue {
  return isProductMessage(error) ? { messageKey: error.messageKey, messageParams: error.messageParams }
    : error instanceof Error ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error);
}

export function isProductCancellation(error: unknown): boolean {
  return isProductMessage(error) && ['runtime.formatChanged', 'runtime.inspectionCancelled', 'runtime.inspectionFormatChanged', 'runtime.darkCancelled'].includes(error.messageKey);
}

export function formatProductMessage(value: unknown, t: TFunction): string {
  if (isProductMessage(value)) return t('messages:' + value.messageKey, parameters(value, t));
  if (typeof value === 'string') {
    const legacy = legacyProductMessage(value);
    return legacy ? formatProductMessage(legacy, t) : value;
  }
  if (value && typeof value === 'object') {
    if ('message' in value && typeof value.message === 'string') return formatProductMessage(value.message, t);
    if ('label' in value && typeof value.label === 'string') return formatProductMessage(value.label, t);
    if ('text' in value && typeof value.text === 'string') return formatProductMessage(value.text, t);
  }
  return value == null ? '' : String(value);
}

/** Library-owned standards text is content, including built-in library presets. */
export function formatDiagnosticMessage(value: unknown, t: TFunction): string {
  if (value && typeof value === 'object' && 'domain' in value && value.domain === 'standard' && 'message' in value && typeof value.message === 'string') return value.message;
  return formatProductMessage(value, t);
}

const productDiagnosticNames = new Map(['resources.referenceName', 'resources.outputName', 'resources.documentLinkName', 'math.name', 'mermaid.name'].map(key => [productText(key), key]));

export function formatDiagnosticName(value: { name: string; domain?: string }, t: TFunction): string {
  if (value.domain === 'standard') return value.name;
  const productKey = value.domain === 'product' ? productDiagnosticNames.get(value.name) : undefined;
  if (productKey) return t('messages:' + productKey);
  if (value.name === '图片资源') return t('messages:image.resourceName');
  if (value.name === '资源相关渲染检查') return t('messages:image.deferredRenderName');
  if (/^本地图片 /.test(value.name)) return t('messages:diagnostic.names.localImage', { fileName: value.name.slice(5) });
  const names: Record<string, string> = { '资料库格式配置': 'formatConfiguration', '格式检查': 'formatCheck', '主题预览': 'themePreview', '格式检查引擎': 'formatEngine', '实际布局／转换检查': 'layoutConversion', '人工核对项': 'manualReview' };
  const key = names[value.name];
  return key ? t('messages:diagnostic.names.' + key) : value.name;
}

export function formatDiagnosticSource(source: string, t: TFunction): string {
  if (source === '当前正文资源') return t('messages:image.resourceScope');
  if (source.startsWith('工具类 ')) return t('messages:diagnostic.utilitySource', { candidate: source.slice(4) });
  const names: Record<string, string> = { '正文': 'body', '当前文章': 'currentArticle', '当前文章正文': 'currentBody', '当前文章主题': 'currentTheme', '主题节点样式': 'themeNodes', '主题 CSS': 'themeCss', '文章主题 CSS': 'articleThemeCss', '复制内容': 'copiedContent', '当前文章使用的样式': 'usedStyles', '当前正文实际渲染': 'renderedBody', '当前正文': 'currentBodyRender', '片段正文': 'snippetBody', '起稿模板正文': 'templateBody', '人工核对项': 'manualReview' };
  const key = names[source];
  return key ? t('messages:diagnostic.sources.' + key) : source;
}

export function productErrorMessage(error: unknown) {
  const info = productCause(error);
  return isProductMessage(info) ? productMessage(info.messageKey, info.messageParams) : { message: String(info) };
}

export function productErrorLabel(error: unknown) {
  const { message, ...info } = productErrorMessage(error);
  return { ...info, label: message };
}

/** For diagnostic composition only. Authored standard text remains literal. */
export function productDiagnosticReference(issue: { message: string; domain?: string }): ProductMessageValue {
  if (issue.domain === 'standard') return issue.message;
  return isProductMessage(issue) ? productReference(issue.messageKey, issue.messageParams)
    : legacyProductMessage(issue.message) ?? issue.message;
}
