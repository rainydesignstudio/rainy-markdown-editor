import { productCause, productMessage } from "./i18n/productMessages";
import { inspectArticleFormatMarkdown, type ArticleFormatIssue } from './articleFormat';
import { validateArticleUtilityClasses } from './article-format/renderer';

export async function validateArticleAuthoringMarkdown(source: string, label = '正文', passed?: Set<string>, theme?: ThemeConfig): Promise<ArticleFormatIssue[]> {
  const inspection = inspectArticleFormatMarkdown(source, label, true, passed);
  try {
    return [...inspection.issues, ...await validateArticleUtilityClasses(inspection.classes, label, passed, inspection.classLines, theme)];
  } catch (error) {
    return [...inspection.issues, { kind: 'engine', name: 'Tailwind', source: label, tier: 'unknown', ...productMessage("articleAuthoringFormat.finalUtilityStylesCouldNotBeChecked", { "cause": productCause(error) }) }];
  }
}
import type { ThemeConfig } from './types';
