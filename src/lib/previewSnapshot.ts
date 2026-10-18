import type { WorkingArticle } from './types';
import type { ParsedArticle } from './types';
import type { ArticleMediaContext } from './article-format/MarkdownPreview';
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

/** Asset arrival can refresh a saved canvas without publishing the live draft. */
export function refreshRetainedPreviewMedia(retained: ReturnType<typeof retainPreviewInput> | null, media: ArticleMediaContext | null) {
  if (!retained || !media?.article || !retained.original.media?.article || retained.original.media.root !== media.root || retained.original.media.article.id !== media.article.id || retained.original.media.sessionKey === media.sessionKey) return retained;
  return { ...retained, original: { ...retained.original, media }, input: { ...retained.input, media } };
}
