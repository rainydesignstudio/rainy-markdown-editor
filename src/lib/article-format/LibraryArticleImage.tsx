'use client';
import { useUITranslation } from '../../components/global/UILocaleProvider';
import { ProductError, productMessage, productErrorMessage, formatProductMessage, type ProductMessageFields } from '../i18n/productMessages';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { readLibraryFile } from './styles';

export function LibraryArticleImage({ root, path, cachedUrl, source, imageProps, readFile, defer = false, refreshKey }: {
  root: FileSystemDirectoryHandle | null; path: string; cachedUrl?: string;
  source: string; imageProps: Omit<ComponentProps<'img'>, 'src'>;
  readFile?: (path: string) => Promise<File>; defer?: boolean;
  refreshKey?: string | number;
}) {
  const { t } = useUITranslation('messages');
  const [result, setResult] = useState<{ path: string; url: string; issue?: ProductMessageFields | { message: string } } | null>(null);
  const placeholder = useRef<HTMLSpanElement | null>(null), ownedUrl = useRef<string | null>(null);
  useEffect(() => {
    let active = true, url: string | undefined;
    setResult(null);
    if (cachedUrl) { setResult({ path, url: cachedUrl }); return; }
    if (!root && !readFile) return;
    const load = () => void (readFile ? readFile(path) : readLibraryFile(root!, path)).then(file => {
      if (!active) return;
      if (readFile && file.size > 16 * 1024 * 1024) throw new ProductError('image.sourcePreviewTooLarge');
      url = URL.createObjectURL(file);
      ownedUrl.current = url;
      setResult({ path, url });
    }).catch(error => { if (active) setResult({ path, url: '', issue: productErrorMessage(error) }); });
    let observer: IntersectionObserver | undefined;
    if (defer && placeholder.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); } });
      observer.observe(placeholder.current);
    } else load();
    return () => { active = false; observer?.disconnect(); if (url) URL.revokeObjectURL(url); if (ownedUrl.current === url) ownedUrl.current = null; };
  }, [root, path, cachedUrl, readFile, defer, refreshKey]);
  const issue = result?.path === path ? result.issue : undefined;
  if (!result?.url || result.path !== path) return <span ref={placeholder} role="img" aria-label={t('messages:image.missingLabel', { path })} data-local-asset-src={source} data-asset-state={issue || (!root && !readFile) ? 'error' : 'loading'} aria-busy={!issue && Boolean(root || readFile)} title={issue ? formatProductMessage(issue, t) : undefined}>{t('messages:image.missing', { path })}</span>;
  return <img {...imageProps} src={result.url} data-local-asset-src={source} data-library-asset-path={path} onError={() => { if (ownedUrl.current) { URL.revokeObjectURL(ownedUrl.current); ownedUrl.current = null; } setResult({ path, url: '', issue: productMessage('image.decodeResourceFailed', { path }) }); }} />;
}
