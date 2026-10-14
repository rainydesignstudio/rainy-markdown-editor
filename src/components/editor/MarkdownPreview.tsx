'use client';

import { ProductError } from "../../lib/i18n/productMessages";
import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { articleMarkdownPlugins, articleHtmlPlugins, rehypePreviewOnly } from '../../lib/article-format/pipeline';
import {
  articleImageFileNameFromSource,
  articleImageSourceSetCandidates,
  inspectArticleImage,
  replaceArticleImageSourceSetUrls,
  type ArticleMediaAsset,
} from '../../lib/articleMedia';
import { getArticleMediaDirectory } from '../../lib/fileSystem';
import type { StoredArticle } from '../../lib/types';
import { ArticleImagePreview } from '../media/ArticleImagePreview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { ARTICLE_EXAMPLE_IMAGE, isLegacyExampleImage } from '../../lib/articleExamples';
import type { FormatSnapshot } from '../../lib/article-format/runtime';
import { ArticleCodeBlock } from './ArticleCodeBlock';
import { LibraryArticleImage } from './LibraryArticleImage';
import { normalizeLibraryPath, stylesheetAssetPath } from '../../lib/article-format/styles';

export type ArticleMediaContext = {
  root: FileSystemDirectoryHandle | null;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'> | null;
  articleTitle: string;
  sessionKey: string | number;
  isCurrent: () => boolean;
  onOpen?: (asset: ArticleMediaAsset) => void;
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
  const [asset, setAsset] = useState<{ handle: FileSystemFileHandle; mimeType: string; size: number } | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const currentRef = useRef(props.isCurrent);
  const onOpenRef = useRef(props.onOpen);
  currentRef.current = props.isCurrent;
  onOpenRef.current = props.onOpen;

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setIssue(null);
    const current = () => !cancelled && currentRef.current();
    const load = async () => {
      try {
        const imageDirectory = await getArticleMediaDirectory(props.root, props.article.month, props.article.folder, false);
        const handle = await imageDirectory.getFileHandle(props.fileName);
        const file = await handle.getFile();
        const format = await inspectArticleImage(file);
        if (!current()) return;
        setAsset({ handle, mimeType: format.mimeType, size: file.size });
      } catch (error) {
        if (current()) setIssue(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [props.article.folder, props.article.month, props.fileName, props.root, props.sessionKey]);

  if (issue || !asset) {
    const label = t(issue ? 'messages:image.unavailableLabel' : 'messages:image.loadingLabel', { fileName: props.fileName });
    return (
      <span
        className="article-local-image-placeholder"
        role="img"
        aria-label={label}
        aria-busy={!issue}
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
      fileName={props.fileName}
      alt={props.alt}
      variant="article"
      sourcePath={props.sourcePath}
      sourceSetPath={props.sourceSetPath}
      clipboardSource={props.clipboardSource}
      clipboardSourceSet={props.clipboardSourceSet}
      imageProps={props.imageProps}
      sessionKey={props.sessionKey}
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
        const imageDirectory = await getArticleMediaDirectory(props.root, props.article.month, props.article.folder, false);
        const replacements = new Map<string, string | null>();
        for (const candidate of candidates) {
          if (!candidate.fileName || !current()) return;
          let objectUrl: string | null = null;
          try {
            const handle = await imageDirectory.getFileHandle(candidate.fileName);
            const file = await handle.getFile();
            await inspectArticleImage(file);
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
  }, [props.article.folder, props.article.month, props.root, props.sessionKey, props.sourceSet]);

  return (
    <source
      {...props.sourceProps}
      srcSet={resolvedSourceSet ?? remoteOnlySourceSet}
      data-local-asset-srcset={props.sourceSet}
      data-clipboard-srcset={props.sourceSet}
    />
  );
}

export function MarkdownPreview({
  source,
  media,
  placeholderRelativeImages = false,
  snapshot,
  previewOnly = false,
}: {
  source: string;
  media?: ArticleMediaContext | null;
  placeholderRelativeImages?: boolean;
  snapshot?: FormatSnapshot;
  previewOnly?: boolean;
}) {
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
  const relativeImagePolicyRef = useRef(placeholderRelativeImages);
  relativeImagePolicyRef.current = placeholderRelativeImages;
  const componentsRef = useRef<Components | null>(null);

  if (!componentsRef.current) {
    componentsRef.current = {
      code: ({ node: _node, children, className, ...props }) => {
        const formatter = snapshotRef.current.bundle.formatter;
        const language = /language-([\w-]+)/.exec(className ?? '')?.[1];
        if (language && formatter.codeHighlight.engine === 'prism') return <ArticleCodeBlock text={String(children)} language={language} formatter={formatter} />;
        return <code {...props} className={className}>{children}</code>;
      },
      img: ({ node: _node, src, srcSet, alt, ...imageProps }) => {
        const originalSrc = typeof src === 'string' ? src : '';
        const format = snapshotRef.current, currentLibrary = mediaRef.current;
        if (format.bundle.formatter.stylesheets && originalSrc && !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(originalSrc)) {
          const base = currentLibrary?.article ? 'articles/' + currentLibrary.article.month + '/' + currentLibrary.article.folder : '';
          try {
            const path = originalSrc.startsWith('/') ? stylesheetAssetPath(originalSrc, '', format.bundle.formatter.stylesheets.publicRoot)?.path : normalizeLibraryPath(originalSrc, base);
            if (path) return <LibraryArticleImage root={currentLibrary?.root ?? null} path={path} cachedUrl={format.environment?.assets.find(asset => asset.path === path)?.url} source={originalSrc} imageProps={{ ...imageProps, alt }} />;
          } catch { return <span role="img" aria-label={translationRef.current('messages:image.invalidPathLabel', { path: originalSrc })}>{translationRef.current('messages:image.invalidPath', { path: originalSrc })}</span>; }
        }
        if (isLegacyExampleImage(originalSrc) || (relativeImagePolicyRef.current && originalSrc && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(originalSrc))) {
          return <img {...imageProps} src={ARTICLE_EXAMPLE_IMAGE} alt={alt || '示例图片'} data-example-image="true" />;
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
