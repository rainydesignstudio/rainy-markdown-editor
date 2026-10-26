'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormatSnapshot } from './runtime';
import type { ThemeConfig } from '../types';
import type { ArticleMediaContext } from './MarkdownPreview';
import { renderPackage } from './package';
import { assertPackageCss, bindPackageInput, packageResourcePath, sanitizePackageHtml } from './packageRendering';
import { commitPreviewMarkup } from './previewCommit';
import { contentHash, readLibraryFile, type CssAsset } from './styles';
import { articleImageSourceSetCandidates, replaceArticleImageSourceSetUrls } from '../articleMedia';
import { localResourceReference, resourceReferenceIntent } from '../resources/references';
import { readArticleImage } from '../resources/imageCache';
import { readCurrentLinkedResource } from '../resources/download';
import { currentImportResource } from '../resources/inspection';
import { resourceState } from '../resources/state';
import { useResourceDocumentVersion } from '../../hooks/imports/useResourceVersion';
import { downloadArticleBlob } from '../articleExport';
import { ARTICLE_EXAMPLE_IMAGE, isApplicationExampleImage } from '../articleExamples';
import { ProductError } from '../i18n/productMessages';

export function PackagePreview({ source, snapshot, theme, media }: { source: string; snapshot: FormatSnapshot; theme: ThemeConfig; media?: ArticleMediaContext | null }) {
  const ref = useRef<HTMLDivElement>(null), [error, setError] = useState('');
  const revision = useResourceDocumentVersion(media?.root ?? null, media?.article?.id ?? 'draft');
  const owner = useMemo(() => new Map<string, { version: number; asset: CssAsset }>(), [media?.root, media?.sessionKey, snapshot.id]);
  useEffect(() => () => { for (const row of owner.values()) URL.revokeObjectURL(row.asset.url); owner.clear(); }, [owner]);
  useEffect(() => {
    const mount = ref.current!; let busy = false, active = true;
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.('a[href]'), href = link?.getAttribute('href') ?? '';
      if (!link || resourceReferenceIntent(href) !== 'file') return;
      event.preventDefault(); if (busy) return; busy = true; link.setAttribute('aria-busy', 'true');
      void readCurrentLinkedResource(href, media ?? null).then(result => { if (active && media?.isCurrent()) downloadArticleBlob(result.file, result.name); })
        .catch(error => { if (active) { setError(error instanceof Error ? error.message : String(error)); media?.onResourceError?.(error); } })
        .finally(() => { busy = false; link.removeAttribute('aria-busy'); });
    };
    mount.addEventListener('click', click);
    return () => { active = false; mount.removeEventListener('click', click); };
  }, [media?.root, media?.sessionKey]);
  useEffect(() => {
    let active = true; setError(''); const mount = ref.current!; delete mount.dataset.packageInput;
    const current = () => active && media?.isCurrent() !== false;
    const base = media?.article ? `articles/${media.article.month}/${media.article.folder}` : '';
    const local = (url: string) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url);
    const version = (url: string) => media?.root ? resourceState(media.root, media.article?.id ?? 'draft', url)?.version ?? 0 : 0;
    const timer = window.setTimeout(() => {
      void renderPackage(source, theme, snapshot).then(async result => {
        if (!current()) return;
        assertPackageCss(result.css!, snapshot.renderer?.declaration.permissions);
        const template = mount.ownerDocument.createElement('template'); template.innerHTML = sanitizePackageHtml(result.html!, snapshot);
        const references = new Set<string>();
        for (const node of template.content.querySelectorAll('img,source')) {
          const src = node.getAttribute('src'), set = node.getAttribute('srcset');
          if (src && local(src)) { node.setAttribute('data-local-asset-src', src); references.add(src); }
          if (set && articleImageSourceSetCandidates(set).some(candidate => local(candidate.url))) {
            node.setAttribute('data-local-asset-srcset', set); node.setAttribute('data-clipboard-srcset', set);
            articleImageSourceSetCandidates(set).filter(candidate => local(candidate.url)).forEach(candidate => references.add(candidate.url));
          }
        }
        const urls = new Map<string, string>(); const used = new Set<string>();
        for (const url of references) {
          try { const path = packageResourcePath(url, base, snapshot), known = owner.get(path); used.add(path); if (known?.version === version(url)) urls.set(url, known.asset.url); } catch { /* handled as an unavailable resource below */ }
        }
        const apply = (scope: ParentNode) => {
          for (const node of scope.querySelectorAll<HTMLElement>('img,source')) {
            const src = node.getAttribute('data-local-asset-src'), set = node.getAttribute('data-local-asset-srcset');
            if (src) { if (urls.has(src)) { node.setAttribute('src', urls.get(src)!); node.dataset.assetState = 'ready'; } else { node.removeAttribute('src'); node.dataset.assetState = 'loading'; } }
            if (set) { const pending = articleImageSourceSetCandidates(set).some(candidate => local(candidate.url) && !urls.has(candidate.url)); if (pending) { node.removeAttribute('srcset'); node.dataset.assetState = 'loading'; } else { if (!src) node.dataset.assetState = 'ready'; node.setAttribute('srcset', replaceArticleImageSourceSetUrls(set, urls)); } }
          }
        };
        apply(template.content); commitPreviewMarkup(mount, template.innerHTML);
        for (const url of references) {
          if (urls.has(url)) continue;
          try {
            const reference = localResourceReference(url);
            if (reference?.storage === 'file') throw new ProductError('resources.imageInFileStorage');
            const latest = media?.root ? await currentImportResource(media.root, media.article?.id ?? 'draft', url, current) : null;
            if (latest && latest.state !== 'complete') throw new ProductError('resources.importPending', { name: reference?.fileName ?? url });
            const path = packageResourcePath(url, base, snapshot);
            const known = owner.get(path);
            if (known?.version === version(url)) { urls.set(url, known.asset.url); used.add(path); apply(mount); continue; }
            let file: Blob;
            const retained = snapshot.resources?.find(asset => asset.path === path) ?? snapshot.environment?.assets.find(asset => asset.path === path);
            if (retained) file = retained.blob;
            else if (isApplicationExampleImage(url)) { const response = await fetch(ARTICLE_EXAMPLE_IMAGE); if (!response.ok) throw new ProductError('resources.linkUnavailable'); file = await response.blob(); }
            else if (!media?.root) throw new ProductError('resources.linkUnavailable');
            else if (reference && (reference.shared || media.article)) {
              const destination = reference.shared ? { kind: 'shared' as const } : { kind: 'article' as const, articleId: media.article!.id, month: media.article!.month, folder: media.article!.folder, title: media.articleTitle };
              file = (await readArticleImage(media.root, destination, reference.fileName, `${snapshot.id}:${media.sessionKey}:${version(url)}`, current)).file;
            } else file = await readLibraryFile(media.root, path);
            if (!current()) return;
            const objectUrl = URL.createObjectURL(file), probe = mount.ownerDocument.createElement('img'); probe.src = objectUrl;
            try { await probe.decode(); if (!probe.naturalWidth) throw new Error('Image decode failed'); }
            catch (error) { URL.revokeObjectURL(objectUrl); throw error; }
            if (!current()) { URL.revokeObjectURL(objectUrl); return; }
            let hash: string;
            try { hash = await contentHash(file); } catch (error) { URL.revokeObjectURL(objectUrl); throw error; }
            if (!current()) { URL.revokeObjectURL(objectUrl); return; }
            const previous = owner.get(path); if (previous) URL.revokeObjectURL(previous.asset.url);
            const mime = file.type || ({ svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' }[path.split('.').at(-1)!] ?? 'image/png');
            owner.set(path, { version: version(url), asset: { path, mime, hash, blob: file, url: objectUrl } });
            urls.set(url, objectUrl); used.add(path); apply(mount);
          } catch { if (current()) for (const image of mount.querySelectorAll<HTMLElement>('[data-local-asset-src],[data-local-asset-srcset]')) if (image.dataset.localAssetSrc === url || articleImageSourceSetCandidates(image.dataset.localAssetSrcset ?? '').some(candidate => candidate.url === url)) image.dataset.assetState = 'error'; }
        }
        if (!current()) return;
        for (const [path, row] of owner) if (!used.has(path)) { URL.revokeObjectURL(row.asset.url); owner.delete(path); }
        bindPackageInput(mount, { source, theme, snapshot, css: result.css!, assets: [...owner.values()].filter(row => used.has(row.asset.path)).map(row => row.asset) });
      }).catch(error => { if (current()) setError(error instanceof Error ? error.message : String(error)); });
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [source, theme, snapshot, media?.root, media?.sessionKey, owner, revision]);
  return <><div ref={ref} data-package-preview="true" />{error ? <p role="alert">{error}</p> : null}</>;
}
