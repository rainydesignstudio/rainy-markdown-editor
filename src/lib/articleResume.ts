import { ProductError } from './i18n/productMessages';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type ArticleResumeRecord = { version: 1; libraryId: string; articleId: string; createdAt: string };
const key = (libraryId: string) => `rainy-article-resume-v1:${libraryId}`;
const validId = (id: unknown): id is string => typeof id === 'string' && /^\d{4}-(0[1-9]|1[0-2])\/[^/\\\u0000-\u001f]+$/.test(id) && !['.', '..'].includes(id.split('/')[1]);
export function rememberArticleResume(store: Store | null, libraryId: string | null, articleId: string, createdAt: string) {
  if (!store || !libraryId || !validId(articleId) || !Number.isFinite(Date.parse(createdAt))) return false;
  try { store.setItem(key(libraryId), JSON.stringify({ version: 1, libraryId, articleId, createdAt })); return true; } catch { return false; }
}
export function readArticleResume(store: Store | null, libraryId: string | null): ArticleResumeRecord | null {
  if (!store || !libraryId) return null;
  let raw: string | null; try { raw = store.getItem(key(libraryId)); } catch { return null; }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version === 1 && value.libraryId === libraryId && validId(value.articleId) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))) return value;
  } catch { /* invalid remembered identity is not a new draft */ }
  throw new ProductError('resume.invalid');
}
export function forgetArticleResume(store: Store | null, libraryId: string | null) { if (store && libraryId) try { store.removeItem(key(libraryId)); } catch { /* keep saved files untouched */ } }
export function articleResumeStorage() { try { return window.sessionStorage; } catch { return null; } }
