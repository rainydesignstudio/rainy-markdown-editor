import type { WorkingArticle } from './types';
import type { ParsedArticle } from './types';
import type { ArticleMediaContext } from '../components/editor/MarkdownPreview';
import type { FormatSnapshot } from './article-format/runtime';

export type PreviewInput = {
  article: WorkingArticle; parsed: ParsedArticle; compiledCss: string;
  media: ArticleMediaContext | null; snapshot: FormatSnapshot;
};

/** Retain already loaded Blob resources without rereading the library or sharing URL lifetimes. */
export function retainPreviewInput(original: PreviewInput): { original: PreviewInput; input: PreviewInput; dispose: () => void } {
  const environment = original.snapshot.environment;
  const replacements = new Map<string, string>();
  const assets = environment?.assets.map(asset => {
    const url = URL.createObjectURL(asset.blob); replacements.set(asset.url, url);
    return Object.freeze({ ...asset, url });
  });
  const rewrite = (text: string) => { for (const [from, to] of replacements) text = text.replaceAll(from, to); return text; };
  const dispose = () => { replacements.forEach(url => URL.revokeObjectURL(url)); replacements.clear(); };
  const snapshot = environment ? Object.freeze({ ...original.snapshot, environment: Object.freeze({
    ...environment, assets: Object.freeze(assets!),
    files: Object.freeze(Object.fromEntries(Object.entries(environment.files).map(([path, css]) => [path, rewrite(css)]))),
    // Display-only snapshots are never passed to compilation, validation, or persistence.
    resolveCss: environment.resolveCss, dispose,
  }) }) : original.snapshot;
  return { original, input: { ...original, compiledCss: rewrite(original.compiledCss), snapshot }, dispose };
}

export function previewInputMatches(saved: PreviewInput, current: PreviewInput): boolean {
  return saved.parsed.body === current.parsed.body && saved.parsed.canCopy === current.parsed.canCopy &&
    saved.article.theme === current.article.theme && saved.article.themeValid === current.article.themeValid &&
    saved.snapshot.id === current.snapshot.id && saved.compiledCss === current.compiledCss &&
    saved.media?.sessionKey === current.media?.sessionKey;
}
