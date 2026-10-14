'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { resourceVersion, subscribeResources, resourceDocumentVersion, subscribeResourceDocument } from '../../lib/resources/state';

export function useResourceVersion(root: FileSystemDirectoryHandle | null, articleId: string, references: readonly string[]) {
  const encoded = JSON.stringify(references);
  const subscribe = useCallback((listener: () => void) => subscribeResources(root, articleId, JSON.parse(encoded), listener), [root, articleId, encoded]);
  const snapshot = useCallback(() => resourceVersion(root, articleId, JSON.parse(encoded)), [root, articleId, encoded]);
  return useSyncExternalStore(subscribe, snapshot, () => '0');
}
export function useResourceDocumentVersion(root: FileSystemDirectoryHandle | null, id: string) {
  const subscribe = useCallback((listener: () => void) => subscribeResourceDocument(root, id, listener), [root, id]);
  const snapshot = useCallback(() => resourceDocumentVersion(root, id), [root, id]);
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
