import type { ArticleSummary } from './types';
import type { UILocale } from './i18n/preferences';

export const ARTICLE_SORTS = ['updated-desc', 'updated-asc', 'created-desc', 'created-asc', 'title-asc', 'title-desc'] as const;
export type ArticleSort = typeof ARTICLE_SORTS[number];

/** View ordering never changes the library's manually organized article order. */
export function sortArticleList(articles: readonly ArticleSummary[], sort: ArticleSort, locale: UILocale) {
  const [field, direction] = sort.split('-'), sign = direction === 'desc' ? -1 : 1;
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  return [...articles].sort((a, b) => sign * (field === 'title'
    ? a.parse.metadata.title.localeCompare(b.parse.metadata.title, locale, { numeric: true })
    : date(field === 'created' ? a.parse.metadata.createdAt : a.parse.metadata.updatedAt) - date(field === 'created' ? b.parse.metadata.createdAt : b.parse.metadata.updatedAt)));
}
