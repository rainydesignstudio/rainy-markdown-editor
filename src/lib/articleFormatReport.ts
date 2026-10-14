import { productMessage, productReference, productText, productLabel, productErrorMessage } from "./i18n/productMessages";
import { inspectArticleResources } from './resources/inspection';
import { localResourceReference, resourceReferences } from './resources/references';
import type { ThemeConfig } from './types';
import { parseArticle } from './frontMatter';
import { themeAuthoredCss } from './themes';
import { articleFormatSeverity, standardFormatIssue, validateRenderedArticleCss, type ArticleFormatIssue } from './articleFormat';
import { assertCurrentFormat, getFormatSnapshot } from './article-format/runtime';
import { inspectRenderedFormat, type RenderedResourceFinding } from './article-format/frame';
import { articleImageFileNameFromSource } from './articleMedia';
import { prepareInspectionAssets } from './article-format/inspectionAssets';
import { compileArticleStyles } from './tailwind';
import { validateArticleAuthoringMarkdown } from './articleAuthoringFormat';

export type FormatCheckSection = { passed: string[]; issues: ArticleFormatIssue[] };
export type ArticleFormatReport = { theme: FormatCheckSection; body: FormatCheckSection; complete?: boolean; formatId?: string };

export function finalizeFormatSection(section: FormatCheckSection, failedRules = new Set(section.issues.flatMap(issue => issue.ruleId ? [issue.ruleId] : []))): FormatCheckSection {
  const seen = new Set<string>();
  const issues = section.issues.filter(issue => {
    const key = issue.ruleId ? JSON.stringify([issue.ruleId, issue.line, issue.tier]) : JSON.stringify([issue.kind, issue.name, issue.source, issue.line, issue.tier, issue.resourceSource, issue.messageKey]);
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  return { passed: section.passed.filter(name => ![...failedRules].some(id => name === productText("articleFormatReport.rule", { "id": id }))), issues };
}

export function renderedResourceIssue(resource: RenderedResourceFinding): ArticleFormatIssue {
  const source = resource.source.startsWith('data:') ? productText('image.embeddedResource') : resource.source.slice(0, 200);
  return { kind: 'element', name: productText('image.resourceName'), source: productText('image.resourceScope'),
    tier: resource.reason === 'loading' ? 'conditional' : 'danger', line: resource.line,
    ...productMessage('image.resource.' + resource.reason, resource.reason === 'empty' ? undefined : { source }),
    domain: 'product', resourceSource: resource.source };
}

export function articleFormatReportCounts(report: ArticleFormatReport): { pass: number; warning: number; error: number } {
  const counts = { pass: report.theme.passed.length + report.body.passed.length, warning: 0, error: 0 };
  for (const issue of [...report.theme.issues, ...report.body.issues]) {
    const severity = articleFormatSeverity(issue.tier);
    if (severity === 'warning' || severity === 'error') counts[severity] += 1;
  }
  return counts;
}

export function compiledArticleFormatStatus(report: ArticleFormatReport, revision: number, classes: number): { label: string; tone: 'success' | 'warning' | 'error'; formatRevision: number } {
  const counts = articleFormatReportCounts(report);
  const tone = counts.error ? 'error' : counts.warning ? 'warning' : 'success';
  return { ...productLabel('report.compiled', { revision, classes, pass: counts.pass, warning: counts.warning, error: counts.error, prefix: tone === 'success' ? productReference('articleFormatReport.stylesGenerated') : '', suffix: report.complete === false ? productReference('articleFormatReport.layoutAndDarkModeCheckingAreIncomplete') : '' }), tone, formatRevision: revision };
}

export function hasFormatConcerns(report: ArticleFormatReport): boolean {
  return [...report.theme.issues, ...report.body.issues].some(issue => articleFormatSeverity(issue.tier) !== 'safe');
}

export async function inspectArticleFormatReport(source: string, theme: ThemeConfig, preview: HTMLElement | null, media?: { root: FileSystemDirectoryHandle | null; month: string | null; folder: string | null }, options: { deep?: boolean; signal?: AbortSignal; purpose?: 'copy' | 'visual' } = {}): Promise<ArticleFormatReport> {
  options.signal?.throwIfAborted();
  const snapshot = getFormatSnapshot();
  const body = parseArticle(source).body;
  const bodyPassed = new Set<string>();
  const bodyIssues = await validateArticleAuthoringMarkdown(body, '当前文章正文', bodyPassed, theme);
  if (options.purpose && preview?.querySelector('[data-render-kind="math"]')) bodyIssues.push({ kind: 'engine', name: productText('math.name'), source: '当前文章正文', tier: 'warning', ...productMessage('math.platform'), domain: 'product' });
  for (const node of preview?.querySelectorAll('[data-render-error="math"]') ?? []) {
    const line = Number(node.getAttribute('data-source-line')) || undefined;
    if (!bodyIssues.some(issue => issue.messageKey === 'math.invalid' && issue.line === line)) bodyIssues.push({ kind: 'element', name: productText('math.name'), source: '当前文章正文', tier: 'error', line, ...productMessage('math.invalid', { cause: node.getAttribute('title') ?? '' }), domain: 'product' });
  }
  for (const node of preview?.querySelectorAll('[data-render-error="mermaid"]') ?? []) {
    const line = Number(node.getAttribute('data-source-line')) || undefined;
    if (line && bodyIssues.some(issue => issue.line === line && issue.messageKey?.startsWith('mermaid.'))) continue;
    const key = node.getAttribute('data-render-error-key');
    const message = key && /^mermaid\.(invalid|limit|unsafe|unsupported|timeout|invalidOutput|changed)$/.test(key)
      ? productMessage(key, { cause: node.getAttribute('data-render-error-cause') ?? '' })
      : { message: node.getAttribute('title') ?? productText('mermaid.invalid', { cause: '' }) };
    bodyIssues.push({ kind: 'element', name: productText('mermaid.name'), source: '当前文章正文', tier: 'error', line, ...message, domain: 'product' });
  }
  const pendingDiagrams = Boolean(preview?.querySelector('[data-render-state="pending"][data-render-kind="mermaid"]'));
  if (pendingDiagrams) bodyIssues.push({ kind: 'engine', name: productText('mermaid.name'), source: '当前文章正文', tier: 'conditional', ...productMessage('mermaid.pending'), domain: 'product' });
  if (options.purpose && preview?.querySelector('[data-render-kind="mermaid"]')) bodyIssues.push({ kind: 'engine', name: productText('mermaid.name'), source: '当前文章正文', tier: 'warning', ...productMessage('mermaid.platform'), domain: 'product' });
  if (media) bodyIssues.push(...await inspectArticleResources(body, media, { signal: options.signal, output: Boolean(options.purpose) }));
  if (options.purpose && resourceReferences(body).some(ref => localResourceReference(ref.url)?.storage === 'file')) bodyIssues.push({ kind: 'engine', name: productText('resources.outputName'), source: '当前文章正文', tier: 'warning', ...productMessage('resources.outputFilesNotEmbedded'), domain: 'product' });
  const themePassed = new Set<string>();
  let themeIssues: ArticleFormatIssue[] = [];
  // An empty document uses no article formatting. The theme library checks all rules when edited;
  // the article report checks only rules that affect the loaded article.
  if (body.trim()) {
    themeIssues = preview
      ? validateRenderedArticleCss(preview, themeAuthoredCss(theme), themePassed)
      : [{ kind: 'engine', name: '主题预览', source: '当前文章主题', tier: 'unknown', ...productMessage("articleFormatReport.thePreviewIsNotReadyThemeRulesUsedByTheCurrentArticle") }];
    const cssLines = theme.css.split(/\r?\n/).length;
    themeIssues = themeIssues.map(issue => issue.line && issue.line > cssLines
      ? { ...issue, source: '主题节点样式', line: undefined }
      : { ...issue, source: issue.kind === 'engine' ? issue.source : '主题 CSS' });
  }
  let complete = !body.trim() && !snapshot.error;
  const knownResourceFailure = bodyIssues.some(issue => issue.resourceSource && issue.resourceKind !== 'file' && articleFormatSeverity(issue.tier) === 'error');
  const pendingImages = bodyIssues.some(issue => issue.resourceKind === 'image' && issue.resourceState === 'pending');
  const pendingResources = bodyIssues.some(issue => issue.resourceState === 'pending');
  if (body.trim() && options.deep !== false && (knownResourceFailure || pendingImages || pendingDiagrams)) {
    if (knownResourceFailure || pendingImages) bodyIssues.push({ kind: 'engine', name: productText('image.deferredRenderName'), source: productText('image.resourceScope'),
      tier: 'unknown', ...productMessage(pendingImages ? 'image.resourcesPendingRender' : 'image.resourcesBlockRender'), domain: 'product' });
  } else if (body.trim() && options.deep !== false && preview) {
    try {
      const shadow = preview.getRootNode();
      const css = shadow instanceof ShadowRoot ? shadow.querySelector('style')?.textContent ?? '' : preview.ownerDocument.querySelector('style[data-article-style]')?.textContent ?? (await compileArticleStyles(body, theme)).css;
      const assets = await prepareInspectionAssets(preview, media, snapshot, options.signal);
      bodyIssues.push(...assets.renderIssues);
      let checked;
      try { checked = await inspectRenderedFormat(assets.root, css, snapshot, options.signal); }
      finally { assets.dispose(); }
      for (const resource of checked.resources ?? []) {
        const name = articleImageFileNameFromSource(resource.source);
        const alreadyReported = bodyIssues.some(issue => issue.resourceSource &&
          (issue.resourceSource === resource.source || name && articleImageFileNameFromSource(issue.resourceSource) === name));
        if (!alreadyReported) bodyIssues.push(renderedResourceIssue(resource));
      }
      for (const id of checked.checked) bodyPassed.add(productText("articleFormatReport.rule", { "id": id }));
      for (const finding of checked.issues) {
        const rule = snapshot.bundle.validator.rules.find(item => item.id === finding.ruleId);
        if (!rule) continue;
        const issue = standardFormatIssue(rule, '当前正文实际渲染', finding.line, finding.detail);
        if (finding.outcome === 'incomplete') { issue.kind = 'engine'; issue.tier = 'unknown'; }
        if (finding.outcome === 'review') issue.tier = 'warning';
        if (finding.resourceDependency) {
          issue.domain = 'product'; issue.name = productText('image.deferredRenderName');
          Object.assign(issue, productMessage(checked.resources?.some(resource => resource.reason === 'loading') ? 'image.resourcesPendingRender' : 'image.resourcesBlockRender'));
        }
        bodyIssues.push(issue);
      }
      for (const id of checked.manual) {
        const review = snapshot.bundle.support.manualReview.find(item => item.id === id);
        if (review) bodyIssues.push({ kind: 'value', name: review.title, source: '人工核对项', tier: 'warning', message: review.title, ruleId: review.id, reference: `${snapshot.bundle.support.meta.sources[review.source]?.url ?? ''}${review.anchor ? `#${encodeURIComponent(review.anchor)}` : ''}`, domain: 'standard' });
      }
      complete = !checked.issues.some(item => item.outcome === 'incomplete') && !checked.resources?.some(item => item.reason === 'loading');
    } catch (error) {
      bodyIssues.push({ kind: 'engine', name: '实际布局／转换检查', source: '当前正文', tier: 'unknown', ...productErrorMessage(error), domain: 'product' });
    }
  }
  options.signal?.throwIfAborted();
  assertCurrentFormat(snapshot);
  const failedRules = new Set([...themeIssues, ...bodyIssues].flatMap(issue => issue.ruleId ? [issue.ruleId] : []));
  return {
    theme: finalizeFormatSection({ passed: [...themePassed], issues: themeIssues }, failedRules),
    body: finalizeFormatSection({ passed: [...bodyPassed], issues: bodyIssues }, failedRules),
    complete: complete && !pendingResources && !pendingDiagrams, formatId: snapshot.id,
  };
}
