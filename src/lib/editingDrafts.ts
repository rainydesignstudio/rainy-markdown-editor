export type DraftKind = 'article' | 'article-info' | 'article-theme' | 'snippet' | 'starter-template' | 'editor-theme' | 'appearance' | 'media';
export type DraftArea = 'articles' | 'themes' | 'template' | 'settings' | 'assets';
export type EditingDraft = { kind: DraftKind; objectId: string; root: FileSystemDirectoryHandle | null; resume: () => void };
export type RegisteredDraft = EditingDraft & { area: DraftArea };
const AREAS: Record<DraftKind, DraftArea> = { article: 'articles', 'article-info': 'articles', 'article-theme': 'themes', snippet: 'template', 'starter-template': 'template', 'editor-theme': 'settings', appearance: 'settings', media: 'assets' };
export const EMPTY_DRAFTS: readonly RegisteredDraft[] = [];

/** Derived identities and return actions only; the owning editor retains its draft. */
export function createEditingDrafts() {
  const entries = new Map<string, RegisteredDraft>(), listeners = new Set<() => void>();
  let snapshot = EMPTY_DRAFTS;
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    set(slot: string, draft: EditingDraft | null) {
      const previous = entries.get(slot);
      if (!draft) { if (!entries.delete(slot)) return; }
      else {
        if (previous?.kind === draft.kind && previous.objectId === draft.objectId && previous.root === draft.root) { previous.resume = draft.resume; return; }
        entries.set(slot, { ...draft, area: AREAS[draft.kind] });
      }
      snapshot = [...entries.values()];
      listeners.forEach(listener => listener());
    },
  };
}

export function hasEditingDraft(drafts: readonly RegisteredDraft[], root: FileSystemDirectoryHandle | null, area: DraftArea, objectId?: string) {
  return drafts.some(draft => draft.root === root && draft.area === area && (objectId === undefined || draft.objectId === objectId));
}

type ArticleContent = { source: string; theme: unknown; themeValid: boolean };
export function articleDraftBaseline(article: ArticleContent) {
  return { ...article, themeSignature: JSON.stringify(article.theme) };
}
export function articleDraftChanged(article: ArticleContent, baseline: ReturnType<typeof articleDraftBaseline> | null) {
  return !baseline || article.source !== baseline.source || article.themeValid !== baseline.themeValid ||
    article.theme !== baseline.theme && JSON.stringify(article.theme) !== baseline.themeSignature;
}
