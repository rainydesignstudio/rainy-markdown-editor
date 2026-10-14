'use client';
import { useSyncExternalStore } from 'react';
import { getThemePreviewSample, getInitialThemePreviewSample, subscribeThemePreviewSample } from '../lib/themePreviewSample';

export function useThemePreviewSample() {
  return useSyncExternalStore(subscribeThemePreviewSample, getThemePreviewSample, getInitialThemePreviewSample);
}
