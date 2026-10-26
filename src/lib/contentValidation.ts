import { articleFormatBlocks, articleFormatMessage, articleFormatMessageReference, type ArticleFormatIssue } from './articleFormat';
import { productDiagnosticReference, productJoin, productReference, type ProductMessageInfo } from './i18n/productMessages';
import { validateArticleAuthoringMarkdown } from './articleAuthoringFormat';
import { parseArticle } from './frontMatter';
import { createArticleSource, replaceArticleBody } from './frontMatter';
import type { ThemeConfig } from './types';
import { articleFormatPreviewStructure } from './articleFormat';
import { inspectArticleFormatReport } from './articleFormatReport';
import { getFormatSnapshot } from './article-format/runtime';

export type ContentValidationResult = { issues: ArticleFormatIssue[]; errors: string[]; errorMessage?: ProductMessageInfo };

export function contentFormatBlockingIssues(issues: readonly ArticleFormatIssue[], options: { purpose?: 'theme'; sampleResources?: 'block' | 'review' } = {}): ArticleFormatIssue[] {
  const reviewSampleResources = options.purpose === 'theme' && options.sampleResources === 'review';
  return issues.filter(issue => (articleFormatBlocks(issue.tier) || issue.kind === 'engine') &&
    !(reviewSampleResources && (issue.resourceDependency === true || Boolean(issue.resourceSource))));
}

export async function validateContentSource(kind: 'snippets' | 'templates', source: string, options: { theme?: ThemeConfig; purpose?: 'theme' } = {}): Promise<ContentValidationResult> {
  const snapshot = getFormatSnapshot();
  const parsed = kind === 'templates' ? parseArticle(source) : null;
  const diagnostics = parsed?.diagnostics.filter(item => item.level === 'error') ?? [];
  const errors = diagnostics.map(item => item.message);
  if (errors.length) return { issues: [], errors, errorMessage: productReference('shared.compose', { parts: productJoin(diagnostics.map(productDiagnosticReference), '；') }) };
  const body = parsed ? parsed.body : source.replace('▌', '');
  const issues = options.theme && typeof document !== 'undefined'
    // A structural probe has no package render binding; the package validates its source through its measurement services.
    ? (await inspectArticleFormatReport(replaceArticleBody(createArticleSource('资源格式检查', options.theme.id), body), options.theme, snapshot.renderer ? null : articleFormatPreviewStructure(body))).body.issues
    : await validateArticleAuthoringMarkdown(body, kind === 'snippets' ? '片段正文' : '起稿模板正文');
  const blocking = contentFormatBlockingIssues(issues, { purpose: options.purpose, sampleResources: snapshot.bundle.validator.product.theme.savePolicy?.sampleResources });
  return { issues, errors: blocking.length ? [articleFormatMessage(blocking)] : [], ...(blocking.length ? { errorMessage: articleFormatMessageReference(blocking) } : {}) };
}
