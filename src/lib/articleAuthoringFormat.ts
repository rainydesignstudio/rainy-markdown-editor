import { productCause, productMessage } from "./i18n/productMessages";
import { inspectArticleFormatMarkdown, type ArticleFormatIssue } from './articleFormat';
import { validateArticleUtilityClasses } from './article-format/renderer';
import { getFormatSnapshot, assertCurrentFormat } from './article-format/runtime';
import { invokeRenderer, rendererAction } from './article-format/package';
import { BASIC_THEME } from './themes';

export async function validateArticleAuthoringMarkdown(source: string, label = '正文', passed?: Set<string>, theme?: ThemeConfig): Promise<ArticleFormatIssue[]> {
  const snapshot = getFormatSnapshot();
  if (snapshot.renderer) {
    const result = await invokeRenderer(snapshot, rendererAction(snapshot, 'validate')!.id, { source, theme: theme ?? BASIC_THEME, deep: false });
    assertCurrentFormat(snapshot);
    if (typeof result.complete !== 'boolean' || !Array.isArray(result.issues) || !Array.isArray(result.passed)) throw new Error('Format validator returned an incomplete report');
    result.passed?.forEach(value => passed?.add(value));
    return (result.issues ?? []).map(issue => ({ kind: 'element', name: snapshot.renderer!.declaration.id, source: label, tier: issue.severity === 'info' ? 'safe' : issue.severity, message: issue.message, line: issue.line, domain: 'standard' }));
  }
  const inspection = inspectArticleFormatMarkdown(source, label, true, passed);
  try {
    return [...inspection.issues, ...await validateArticleUtilityClasses(inspection.classes, label, passed, inspection.classLines, theme)];
  } catch (error) {
    return [...inspection.issues, { kind: 'engine', name: 'Tailwind', source: label, tier: 'unknown', ...productMessage("articleAuthoringFormat.finalUtilityStylesCouldNotBeChecked", { "cause": productCause(error) }) }];
  }
}
import type { ThemeConfig } from './types';
