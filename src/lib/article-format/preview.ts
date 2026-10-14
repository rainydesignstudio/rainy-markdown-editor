import type { CSSProperties } from 'react';
import { getFormatSnapshot } from './runtime';

export function previewSurfaceStyle(dark = false, snapshot = getFormatSnapshot()): CSSProperties {
  const preview = snapshot.bundle.formatter.preview;
  return { backgroundColor: dark ? preview.dark.background : preview.light.background };
}
export function articlePreviewStyle(css: string, snapshot = getFormatSnapshot()): string {
  const preview = snapshot.bundle.formatter.preview;
  const font = preview.fontFamily ? `font-family:${preview.fontFamily};` : '';
  const surface = preview.stripThemeBackground ? '\narticle.article-preview,article.article-preview>.article-body{background:transparent;}' : '';
  return `:host{${font}color:${preview.color};}\n${css}${surface}`;
}
