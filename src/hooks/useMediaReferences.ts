'use client';

import { useEffect, useRef, useState } from 'react';
import { productCause, productJoin, type ProductMessageValue } from '../lib/i18n/productMessages';
import type { LibraryMediaAsset } from '../lib/articleMedia';
import type { MediaReferenceScan } from '../lib/mediaManagement';

export function useMediaReferences({ root, sessionKey, assets, loading, revision = '', isCurrent, scan }: {
  root: FileSystemDirectoryHandle | null; sessionKey: number; assets: LibraryMediaAsset[]; loading: boolean; revision?: string; isCurrent: () => boolean;
  scan: (assets: LibraryMediaAsset[], signal: AbortSignal) => Promise<MediaReferenceScan>;
}) {
  const guard = useRef(isCurrent); guard.current = isCurrent;
  const [state, setState] = useState<{ root: FileSystemDirectoryHandle; sessionKey: number; assets: LibraryMediaAsset[]; revision: string; result?: MediaReferenceScan; issue?: ProductMessageValue } | null>(null);
  useEffect(() => {
    if (!root || loading || !assets.length) { setState(null); return; }
    const abort = new AbortController(), identity = { root, sessionKey, assets, revision }; setState(identity);
    void scan(assets, abort.signal).then(result => { if (!abort.signal.aborted && guard.current()) setState({ ...identity, result }); })
      .catch(error => { if (!abort.signal.aborted && guard.current()) setState({ ...identity, issue: productCause(error) }); });
    return () => abort.abort();
  }, [root, sessionKey, assets, loading, revision, scan]);
  const current = state?.root === root && state.sessionKey === sessionKey && state.assets === assets && state.revision === revision ? state : null;
  const issue = current?.issue ?? (current?.result?.issues.length ? productJoin(current.result.issues, '\n') : null);
  return { states: !loading && current?.result && !issue ? current.result.referenced : undefined, issue, pending: Boolean(assets.length && !loading && !current?.result && !issue) };
}
