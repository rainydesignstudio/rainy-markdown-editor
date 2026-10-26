'use client';

import { productCause, productMessage, type ProductMessageValue } from "../lib/i18n/productMessages";

import { useEffect, useMemo, useRef, useState } from 'react';
import { listResourceAssets, type ResourceDestination } from '../lib/resources/storage';
import type { LibraryMediaAsset } from '../lib/articleMedia';
import type { ArticleSummary } from '../lib/types';

export function useMediaLibrary({ root, sessionKey, refreshSignal, articles, isRootCurrent }: {
  root: FileSystemDirectoryHandle | null;
  sessionKey: number;
  refreshSignal: number;
  articles: ArticleSummary[];
  isRootCurrent: (root: FileSystemDirectoryHandle, session: number) => boolean;
}) {
  const [result, setResult] = useState<{ root: FileSystemDirectoryHandle | null; session: number; assets: LibraryMediaAsset[]; issues: ProductMessageValue[]; revision: number }>({ root: null, session: -1, assets: [], issues: [], revision: -1 });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0), refreshRef = useRef(0);
  const currentRef = useRef(isRootCurrent);
  currentRef.current = isRootCurrent;
  useEffect(() => {
    const request = ++requestRef.current;
    let cancelled = false;
    const current = () => !cancelled && request === requestRef.current && root !== null && currentRef.current(root, sessionKey);
    if (!root) { setLoading(false); return () => { cancelled = true; }; }
    setLoading(true);
    void (async () => {
      const destinations: ResourceDestination[] = [{ kind: 'shared' }, ...articles.map(article => ({ kind: 'article' as const, articleId: article.id, month: article.month, folder: article.folder, title: article.parse.metadata.title }))];
      const rows: Array<{ assets: LibraryMediaAsset[]; issues: ProductMessageValue[] }> = []; let index = 0;
      await Promise.all(Array.from({ length: Math.min(4, destinations.length) }, async () => {
        while (index < destinations.length && current()) {
          const target = destinations[index++];
          try { const issues: ProductMessageValue[] = []; const assets = await listResourceAssets(root, target, current, error => issues.push(productMessage('resources.metadataIssue', { cause: productCause(error) }))); rows.push({ assets, issues }); }
          catch (error) {
            if (!current()) return;
            if (error instanceof DOMException && error.name === 'NotFoundError') continue;
            rows.push({ assets: [], issues: [productMessage('resources.listFailed', { name: target.kind === 'shared' ? root.name : target.title, cause: productCause(error) })] });
          }
        }
      }));
      if (!current()) return;
      setResult({ root, session: sessionKey, assets: rows.flatMap((row) => row.assets), issues: rows.flatMap((row) => row.issues), revision: refreshKey });
      setLoading(false);
    })().catch((error: unknown) => {
      if (!current()) return;
      setResult({ root, session: sessionKey, assets: [], issues: [productCause(error)], revision: refreshKey });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [root, sessionKey, refreshSignal, refreshKey, articles]);
  const visible = result.root === root && result.session === sessionKey;
  const assets = useMemo(() => visible ? result.assets : [], [visible, result.assets]);
  return { assets, issues: visible ? result.issues : [], loading, ready: visible && !loading && result.revision === refreshKey, revision: visible ? result.revision : -1, refresh: () => { const next = ++refreshRef.current; setRefreshKey(next); return next; } };
}
