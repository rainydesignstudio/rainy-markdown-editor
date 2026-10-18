'use client';

import { useFormatSnapshot } from './useFormatSnapshot';
import { useUITranslation } from '../components/global/UILocaleProvider';
import { libraryCapability, type LibraryCapability } from '../lib/article-format/libraryConfiguration';
import { formatProductMessage } from '../lib/i18n/productMessages';

export function useLibraryCapabilities() {
  const snapshot = useFormatSnapshot();
  const { t } = useUITranslation('messages');
  return { get(key: LibraryCapability) {
    const state = libraryCapability(snapshot, key);
    return { enabled: state.enabled, reason: state.reason ? formatProductMessage(state.reason, t) : undefined };
  } };
}

export function useLibraryCapability(key: LibraryCapability) { return useLibraryCapabilities().get(key); }
