'use client';

import { ProductError, productCause } from "../i18n/productMessages";
import { useUITranslation } from '../../components/global/UILocaleProvider';

import { memo, useEffect, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { articleMarkdownPlugins, articleHtmlPlugins, rehypePreviewOnly } from './pipeline';
import {
  articleImageFileNameFromSource,
  articleImageSourceSetCandidates,
  replaceArticleImageSourceSetUrls,
  type ArticleMediaAsset,
} from '../articleMedia';
import type { StoredArticle } from '../types';
import { ArticleImagePreview } from '../../components/media/ArticleImagePreview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { ARTICLE_EXAMPLE_IMAGE } from '../articleExamples';
import type { FormatSnapshot } from './runtime';
import { ArticleCodeBlock } from './ArticleCodeBlock';
import { LibraryArticleImage } from './LibraryArticleImage';
import { normalizeLibraryPath, stylesheetAssetPath } from './styles';
import { useResourceVersion } from '../../hooks/imports/useResourceVersion';
import { resourceState } from '../resources/state';
import { cachedArticleImage, readArticleImage, type CachedArticleImage } from '../resources/imageCache';
import { resourceReferenceIntent } from '../resources/references';
import { LocalFileLink } from './LocalFileLink';
import { MermaidDiagram } from './MermaidDiagram';

export type ArticleMediaContext = {
  root: FileSystemDirectoryHandle | null;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'> | null;
  articleTitle: string;
  sessionKey: string | number;
  isCurrent: () => boolean;
  onOpen?: (asset: ArticleMediaAsset) => void;
  onResourceError?: (error: unknown) => void;
};

type LocalImageProps = {
  root: FileSystemDirectoryHandle;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  articleTitle: string;
  sessionKey: string | number;
  sourcePath?: string;
  sourceSetPath?: string;
  clipboardSource?: string;
  clipboardSourceSet?: string;
  fileName: string;
  alt: string;
  imageProps: Omit<ComponentProps<'img'>, 'src' | 'alt' | 'onClick' | 'onKeyDown'>;
  isCurrent: () => boolean;
  onOpen?: (asset: ArticleMediaAsset) => void;
};

function LocalArticleImage(props: LocalImageProps) {
  const { t } = useUITranslation('messages');
  const reference = 'media/image/' + encodeURIComponent(props.fileName), version = useResourceVersion(props.root, props.article.id, [reference]);
  const scope = `${props.sessionKey}:${version}`, importState = resourceState(props.root, props.article.id, reference);
  const [asset, setAsset] = useState<CachedArticleImage | null>(() => cachedArticleImage(props.root, props.article.id, props.fileName, scope));
  const [issue, setIssue] = useState<string | null>(null);
  const currentRef = useRef(props.isCurrent);
  const onOpenRef = useRef(props.onOpen);
  currentRef.current = props.isCurrent;
  onOpenRef.current = props.onOpen;

  useEffect(() => {
    let cancelled = false;
    setAsset(cachedArticleImage(props.root, props.article.id, props.fileName, scope));
    setIssue(null);
    const current = () => !cancelled && currentRef.current();
    const load = async () => {
      try {
        if (importState?.state && importState.state !== 'complete') {
          if (importState.state === 'failed' || importState.state === 'cancelled') throw new ProductError('resources.importFailed', { name: props.fileName, cause: importState.error ? productCause(importState.error) : '' });
          return;
        }
        const value = await readArticleImage(props.root, { kind: 'article', articleId: props.article.id, month: props.article.month, folder: props.article.folder, title: props.articleTitle }, props.fileName, scope, current);
        if (!current()) return;
        setAsset(value);
      } catch (error) {
        if (current()) setIssue(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [props.article.folder, props.article.month, props.fileName, props.root, scope]);

  if (issue || !asset) {
    const label = t(issue ? 'messages:image.unavailableLabel' : 'messages:image.loadingLabel', { fileName: props.fileName });
    return (
      <span
        className="article-local-image-placeholder"
        role="img"
        aria-label={label}
        aria-busy={!issue}
        data-asset-state={issue ? 'error' : 'loading'}
        data-local-asset-src={props.sourcePath}
        data-local-asset-srcset={props.sourceSetPath}
        data-clipboard-src={props.clipboardSource}
        data-clipboard-srcset={props.clipboardSourceSet}
      >
        {issue ? t('messages:image.unavailable', { fileName: props.fileName }) : t('messages:image.loading')}
      </span>
    );
  }

  const mediaAsset: ArticleMediaAsset = {
    ...asset,
    fileName: props.fileName,
    root: props.root,
    articleId: props.article.id,
    month: props.article.month,
    folder: props.article.folder,
    articleTitle: props.articleTitle,
  };
  return (
    <ArticleImagePreview
      handle={asset.handle}
      file={asset.file}
      fileName={props.fileName}
      alt={props.alt}
      variant="article"
      sourcePath={props.sourcePath}
      sourceSetPath={props.sourceSetPath}
      clipboardSource={props.clipboardSource}
      clipboardSourceSet={props.clipboardSourceSet}
      imageProps={props.imageProps}
      sessionKey={scope}
      isCurrent={props.isCurrent}
      onOpen={onOpenRef.current ? () => onOpenRef.current?.(mediaAsset) : undefined}
    />
  );
}

type LocalSourceSetProps = {
  root: FileSystemDirectoryHandle;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  sessionKey: string | number;
  sourceSet: string;
  sourceProps: Omit<ComponentProps<'source'>, 'srcSet'>;
  isCurrent: () => boolean;
};

async function decodeTemporaryUrl(url: string): Promise<void> {
  const probe = new Image();
  probe.src = url;
  if (typeof probe.decode === 'function') {
    await probe.decode();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    probe.onload = () => resolve();
    probe.onerror = () => reject(new ProductError("markdownPreview.theBrowserCouldNotDecodeTheLocalImage"));
  });
}

function LocalArticleSourceSet(props: LocalSourceSetProps) {
  const candidates = articleImageSourceSetCandidates(props.sourceSet).filter((candidate) => candidate.fileName);
  const version = useResourceVersion(props.root, props.article.id, candidates.map(candidate => candidate.url));
  const remoteOnlySourceSet = replaceArticleImageSourceSetUrls(
    props.sourceSet,
    new Map(candidates.map((candidate) => [candidate.url, null])),
  );
  const [resolvedSourceSet, setResolvedSourceSet] = useState<string | null>(null);
  const currentRef = useRef(props.isCurrent);
  currentRef.current = props.isCurrent;

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setResolvedSourceSet(null);
    const current = () => !cancelled && currentRef.current();

    const resolve = async () => {
      try {
        const replacements = new Map<string, string | null>();
        for (const candidate of candidates) {
          if (!candidate.fileName || !current()) return;
          const entry = resourceState(props.root, props.article.id, candidate.url);
          if (entry?.state && entry.state !== 'complete') { replacements.set(candidate.url, null); continue; }
          let objectUrl: string | null = null;
          try {
            const epoch = resourceState(props.root, props.article.id, candidate.url)?.version ?? 0;
            const { file } = await readArticleImage(props.root, { kind: 'article', articleId: props.article.id, month: props.article.month, folder: props.article.folder, title: props.article.folder }, candidate.fileName, `${props.sessionKey}:${epoch}`, current);
            objectUrl = URL.createObjectURL(file);
            objectUrls.push(objectUrl);
            await decodeTemporaryUrl(objectUrl);
            if (!current()) return;
            replacements.set(candidate.url, objectUrl);
          } catch {
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
              const index = objectUrls.indexOf(objectUrl);
              if (index >= 0) objectUrls.splice(index, 1);
            }
            replacements.set(candidate.url, null);
          }
        }
        if (current()) setResolvedSourceSet(replaceArticleImageSourceSetUrls(props.sourceSet, replacements));
      } catch {
        if (current()) setResolvedSourceSet(remoteOnlySourceSet);
      }
    };
    void resolve();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [props.article.folder, props.article.month, props.root, props.sessionKey, props.sourceSet, version]);

  return (
    <source
      {...props.sourceProps}
      srcSet={resolvedSourceSet ?? remoteOnlySourceSet}
      data-local-asset-srcset={props.sourceSet}
      data-clipboard-srcset={props.sourceSet}
    />
  );
}

type MarkdownPreviewProps = { source: string; media?: ArticleMediaContext | null; snapshot?: FormatSnapshot; previewOnly?: boolean };
export function sameMarkdownPreviewInput(previous: MarkdownPreviewProps, next: MarkdownPreviewProps) {
  return previous.source === next.source && previous.snapshot === next.snapshot && previous.previewOnly === next.previewOnly && previous.media?.root === next.media?.root && previous.media?.article?.id === next.media?.article?.id && previous.media?.articleTitle === next.media?.articleTitle && previous.media?.sessionKey === next.media?.sessionKey && previous.media?.onOpen === next.media?.onOpen && previous.media?.onResourceError === next.media?.onResourceError;
}
function MarkdownPreviewContent({
  source,
  media,
  snapshot,
  previewOnly = false,
}: MarkdownPreviewProps) {
  const { t } = useUITranslation('messages');
  const translationRef = useRef(t);
  translationRef.current = t;
  const activeSnapshot = useFormatSnapshot();
  const formatSnapshot = snapshot ?? activeSnapshot;
  const snapshotRef = useRef(formatSnapshot);
  snapshotRef.current = formatSnapshot;
  const [hydrated, setHydrated] = useState(false);
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const componentsRef = useRef<Components | null>(null);

  if (!componentsRef.current) {
    componentsRef.current = {
      a: ({ node: _node, href, children, ...props }) => {
        const fileLink = typeof href === 'string' && resourceReferenceIntent(href) === 'file';
        return fileLink ? <LocalFileLink {...props} href={href!} context={mediaRef.current ?? null}>{children}</LocalFileLink> : <a {...props} href={href}>{children}</a>;
      },
      code: ({ node: _node, children, className, ...props }) => {
        const formatter = snapshotRef.current.bundle.formatter;
        const language = /language-([\w-]+)/.exec(className ?? '')?.[1];
        if (language === 'mermaid' && formatter.mermaid && (props as Record<string, unknown>)['data-mermaid-source'] === 'true') return <MermaidDiagram source={String(children).replace(/\n$/, '')} policy={formatter.mermaid} session={snapshotRef.current.id} line={_node?.position?.start.line} rejected={String((props as Record<string, unknown>)['data-mermaid-rejected'] ?? '') || undefined} />;
        if (language && formatter.codeHighlight.engine === 'prism') return <ArticleCodeBlock text={String(children)} language={language} formatter={formatter} />;
        return <code {...props} className={className}>{children}</code>;
      },
      img: ({ node: _node, src, srcSet, alt, ...imageProps }) => {
        const originalSrc = typeof src === 'string' ? src : '';
        const format = snapshotRef.current, currentLibrary = mediaRef.current;
        if (resourceReferenceIntent(originalSrc) === 'file') return <span role="img" data-local-asset-src={originalSrc} data-asset-state="error">{translationRef.current('messages:resources.imageInFileStorage')}</span>;
        // Application sample assets keep their own namespace in stylesheet libraries.
        if (originalSrc === ARTICLE_EXAMPLE_IMAGE) {
          return <img {...imageProps} src={ARTICLE_EXAMPLE_IMAGE} alt={alt || '示例图片'} data-example-image="true" />;
        }
        if (format.bundle.formatter.stylesheets && originalSrc && !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(originalSrc)) {
          const base = currentLibrary?.article ? 'articles/' + currentLibrary.article.month + '/' + currentLibrary.article.folder : '';
          try {
            const path = originalSrc.startsWith('/') ? stylesheetAssetPath(originalSrc, '', format.bundle.formatter.stylesheets.publicRoot)?.path : normalizeLibraryPath(originalSrc, base);
            if (path) return <ReactiveLibraryImage media={currentLibrary ?? null} path={path} cachedUrl={format.environment?.assets.find(asset => asset.path === path)?.url} source={originalSrc} imageProps={{ ...imageProps, alt }} />;
          } catch { return <span role="img" aria-label={translationRef.current('messages:image.invalidPathLabel', { path: originalSrc })}>{translationRef.current('messages:image.invalidPath', { path: originalSrc })}</span>; }
        }
        const originalSourceSet = typeof srcSet === 'string' ? srcSet : '';
        const localSourceSet = articleImageSourceSetCandidates(originalSourceSet).filter((candidate) => candidate.fileName);
        const directFileName = articleImageFileNameFromSource(originalSrc);
        const sourceSetCandidate = localSourceSet[0];
        const fileName = directFileName ?? sourceSetCandidate?.fileName;
        if (!fileName) return <img {...imageProps} src={src} srcSet={srcSet} alt={alt ?? ''} />;

        const currentMedia = mediaRef.current;
        if (!currentMedia?.root || !currentMedia.article) {
          if (!directFileName && sourceSetCandidate) {
            const remoteOnlySourceSet = replaceArticleImageSourceSetUrls(originalSourceSet, new Map(localSourceSet.map((candidate) => [candidate.url, null])));
            return (
              <img
                {...imageProps}
                src={src}
                srcSet={remoteOnlySourceSet}
                alt={alt ?? fileName}
                data-local-asset-srcset={originalSourceSet}
                data-clipboard-src={originalSrc}
                data-clipboard-srcset={originalSourceSet}
              />
            );
          }
          return (
            <span
              className="article-local-image-placeholder"
              role="img"
              aria-label={translationRef.current('messages:image.missingLabel', { path: fileName })}
              data-local-asset-src={originalSrc}
              data-local-asset-srcset={localSourceSet.length ? originalSourceSet : undefined}
              data-clipboard-srcset={originalSourceSet || undefined}
            >
              {translationRef.current('messages:image.missing', { path: fileName })}
            </span>
          );
        }
        return (
          <LocalArticleImage
            key={`${currentMedia.sessionKey}:${currentMedia.article.id}:${originalSrc || originalSourceSet}`}
            root={currentMedia.root}
            article={currentMedia.article}
            articleTitle={currentMedia.articleTitle}
            sessionKey={currentMedia.sessionKey}
            sourcePath={directFileName ? originalSrc : undefined}
            sourceSetPath={localSourceSet.length ? originalSourceSet : undefined}
            clipboardSource={!directFileName ? originalSrc : undefined}
            clipboardSourceSet={originalSourceSet || undefined}
            fileName={fileName}
            alt={alt ?? fileName}
            imageProps={{ ...imageProps, srcSet: undefined }}
            isCurrent={currentMedia.isCurrent}
            onOpen={currentMedia.onOpen}
          />
        );
      },
      image: ({ node: _node, href, xlinkHref, ...props }) => {
        return <image {...props} href={href} xlinkHref={xlinkHref} />;
      },
      source: ({ node: _node, srcSet, ...sourceProps }) => {
        const originalSourceSet = typeof srcSet === 'string' ? srcSet : '';
        const localCandidates = articleImageSourceSetCandidates(originalSourceSet).filter((candidate) => candidate.fileName);
        if (!originalSourceSet || !localCandidates.length) return <source {...sourceProps} srcSet={srcSet} />;
        const currentMedia = mediaRef.current;
        if (!currentMedia?.root || !currentMedia.article) {
          const remoteOnlySourceSet = replaceArticleImageSourceSetUrls(originalSourceSet, new Map(localCandidates.map((candidate) => [candidate.url, null])));
          return <source {...sourceProps} srcSet={remoteOnlySourceSet} data-local-asset-srcset={originalSourceSet} data-clipboard-srcset={originalSourceSet} />;
        }
        return (
          <LocalArticleSourceSet
            key={`${currentMedia.sessionKey}:${currentMedia.article.id}:${originalSourceSet}`}
            root={currentMedia.root}
            article={currentMedia.article}
            sessionKey={currentMedia.sessionKey}
            sourceSet={originalSourceSet}
            sourceProps={sourceProps}
            isCurrent={currentMedia.isCurrent}
          />
        );
      },
    };
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  return (
    <ReactMarkdown
      remarkPlugins={articleMarkdownPlugins(formatSnapshot)}
      remarkRehypeOptions={{ allowDangerousHtml: true }}
      rehypePlugins={[...articleHtmlPlugins(formatSnapshot), [rehypePreviewOnly, { enabled: previewOnly }]]}
      components={componentsRef.current}
    >
      {source}
    </ReactMarkdown>
  );
}

function ReactiveLibraryImage({ media, ...props }: Omit<ComponentProps<typeof LibraryArticleImage>, 'root'> & { media: ArticleMediaContext | null }) {
  const version = useResourceVersion(media?.root ?? null, media?.article?.id ?? 'draft', [props.source]);
  const { t } = useUITranslation('messages'), state = media?.root ? resourceState(media.root, media.article?.id ?? 'draft', props.source) : null;
  if (state?.state && state.state !== 'complete') return <span role="img" aria-busy={state.state === 'pending' || state.state === 'running'} data-local-asset-src={props.source} data-asset-state={state.state === 'failed' || state.state === 'cancelled' ? 'error' : 'loading'}>{t(state.state === 'failed' || state.state === 'cancelled' ? 'messages:resources.importFailed' : 'messages:resources.importPending', { name: props.source, cause: '' })}</span>;
  return <LibraryArticleImage {...props} root={media?.root ?? null} refreshKey={`${media?.sessionKey}:${version}`} />;
}
export const MarkdownPreview = memo(MarkdownPreviewContent, sameMarkdownPreviewInput);
