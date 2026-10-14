'use client';
import { useEffect, useState, type ComponentProps } from 'react';
import { readLibraryFile } from '../../lib/article-format/styles';

export function LibraryArticleImage({ root, path, cachedUrl, source, imageProps }: {
  root: FileSystemDirectoryHandle | null; path: string; cachedUrl?: string;
  source: string; imageProps: Omit<ComponentProps<'img'>, 'src'>;
}) {
  const [result, setResult] = useState<{ path: string; url: string; issue?: string } | null>(null);
  useEffect(() => {
    let active = true, url: string | undefined;
    setResult(null);
    if (cachedUrl) { setResult({ path, url: cachedUrl }); return; }
    if (!root) return;
    void readLibraryFile(root, path).then(file => {
      if (!active) return;
      url = URL.createObjectURL(file);
      setResult({ path, url });
    }).catch(error => { if (active) setResult({ path, url: '', issue: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [root, path, cachedUrl]);
  if (!result?.url || result.path !== path) return <span role="img" aria-label={'本地图片待补：' + path} data-local-asset-src={source} title={result?.issue}>本地图片待补 · {path}</span>;
  return <img {...imageProps} src={result.url} data-local-asset-src={source} data-library-asset-path={path} onError={() => setResult({ path, url: '', issue: '浏览器无法解码资源：' + path })} />;
}
