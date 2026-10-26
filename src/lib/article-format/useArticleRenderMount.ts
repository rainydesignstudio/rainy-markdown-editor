'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useUITranslation } from '../../components/global/UILocaleProvider';
import { isProductCancellation } from '../i18n/productMessages';
import { nativeDarkRendition } from './nativeDark';
import { articlePreviewMarkup, observeArticlePreview } from '../articleDarkPreview';
import { sanitizeHtml } from './sanitize';
import type { FormatSnapshot } from './runtime';
import { forwardPreviewWheel } from '../editor/previewScrolling';
import { articleDarkMode } from './styleTypes';
import type { ThemeConfig } from '../types';
import { bindPreviewImages, type RenderedPreviewImage } from './previewImages';
import { commitPreviewMarkup } from './previewCommit';
import { packageDisplayDocument, sanitizePackageHtml } from './packageRendering';
export type ArticleDarkColors = { status: 'pending' | 'ready' | 'error'; values: Record<string, string[]> };
const PENDING_DARK_COLORS: ArticleDarkColors = { status: 'pending', values: {} };
function relayPreviewShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && ['s', 'f', 'g', '/'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, bubbles: true, cancelable: true }));
  }
}

function bindPreviewCitations(target: HTMLElement, host: HTMLElement) {
  const click = (event: MouseEvent) => {
    const link = (event.target as Element)?.closest?.('a[href]'), href = link?.getAttribute('href') ?? '';
    const id = /^#(?:user-content-)?(rme-cite-[a-f0-9-]+)$/.exec(href)?.[1];
    if (id) { event.preventDefault(); host.dispatchEvent(new CustomEvent('rainy-citation-open', { detail: id, bubbles: true })); }
  };
  target.addEventListener('click', click); return () => target.removeEventListener('click', click);
}

export function useArticleRenderMount(hostRef: RefObject<HTMLDivElement | null>, snapshot: FormatSnapshot, css: string, dark = false, options: { retained?: boolean; colorTheme?: ThemeConfig; onImageOpen?: (image: RenderedPreviewImage) => void; onSourceFind?: () => void } = {}) {
  const { t } = useUITranslation('editor');
  const frameTitles = useRef({ light: '', dark: '' });
  const visibleFrameRef = useRef<HTMLIFrameElement | null>(null);
  const darkFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [colorResult, setColorResult] = useState<{ snapshot: FormatSnapshot; css: string; theme?: ThemeConfig; colors: ArticleDarkColors } | null>(null);
  const darkColors = colorResult?.snapshot === snapshot && colorResult.css === css && colorResult.theme === options.colorTheme ? colorResult.colors : PENDING_DARK_COLORS;
  frameTitles.current = { light: t('preview.frame'), dark: t('preview.nativeDarkFrame') };
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const sourceFindRef = useRef(options.onSourceFind); sourceFindRef.current = options.onSourceFind;
  const relayShortcut = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) return;
    if (sourceFindRef.current && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); sourceFindRef.current();
    } else relayPreviewShortcut(event);
  };
  const imageOpenRef = useRef(options.onImageOpen); imageOpenRef.current = options.onImageOpen;
  useEffect(() => {
    if (!target || !imageOpenRef.current) return;
    return bindPreviewImages(target, image => imageOpenRef.current?.(image), () => Boolean(imageOpenRef.current));
  }, [target, Boolean(options.onImageOpen)]);
  useEffect(() => { const host = hostRef.current; if (target && host) return bindPreviewCitations(target, host); }, [target, hostRef]);
  const [darkIssue, setDarkIssue] = useState('');
  const native = Boolean(snapshot.renderer || snapshot.bundle.formatter.stylesheets || snapshot.bundle.formatter.document);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (snapshot.renderer) {
      let active = true;
      const frame = document.createElement('iframe'); frame.title = frameTitles.current.light;
      frame.setAttribute('sandbox', 'allow-same-origin'); frame.dataset.articleFrame = 'light';
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
      host.style.position = 'relative'; host.style.height = '100%'; host.style.overflow = 'hidden'; visibleFrameRef.current = frame;
      const ready = packageDisplayDocument(frame, snapshot); host.append(frame);
      void ready.then(mount => { if (!active) return; mount.ownerDocument.addEventListener('keydown', relayShortcut); setTarget(mount); }).catch(error => { if (active) setDarkIssue(String(error)); });
      return () => { active = false; frame.contentDocument?.removeEventListener('keydown', relayShortcut); frame.remove(); setTarget(null); host.style.position = ''; host.style.height = ''; host.style.overflow = ''; };
    }
    if (!native) {
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      let mount = shadow.querySelector<HTMLElement>('[data-article-preview]');
      if (!mount) { mount = document.createElement('div'); mount.dataset.articlePreview = ''; shadow.append(mount); }
      setTarget(mount);
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = frameTitles.current.light;
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('allow', 'clipboard-write');
    frame.dataset.articleFrame = 'light';
    visibleFrameRef.current = frame;
    frame.style.cssText = 'position:absolute;top:0;border:0;transform-origin:top left';
    host.style.position = 'relative'; host.style.height = '100%'; host.style.overflow = 'hidden';
    host.append(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }
    // about:blank otherwise uses quirks mode, which resets inherited table line-height.
    doc.open(); doc.write('<!doctype html><html><head></head><body></body></html>'); doc.close();
    doc.documentElement.lang = snapshot.bundle.formatter.document?.language ?? 'zh-CN';
    // Reserve no scrollbar gutter inside the fixed CSS viewport; the host owns its crop.
    doc.documentElement.style.scrollbarWidth = 'none';
    doc.documentElement.style.overflowX = 'clip';
    doc.body.style.margin = '0';
    const style = doc.createElement('style'); style.dataset.articleStyle = ''; doc.head.append(style);
    const mount = doc.createElement('div'); mount.dataset.articlePreview = ''; doc.body.append(mount);
    const size = () => {
      const availableWidth = host.clientWidth || host.parentElement?.clientWidth || 750;
      const availableHeight = host.clientHeight || host.parentElement?.clientHeight || 800;
      const viewport = snapshot.bundle.formatter.document?.viewport ?? { width: availableWidth, height: availableHeight, contentWidth: availableWidth };
      const scale = Math.min(availableWidth / viewport.contentWidth, availableHeight / viewport.height, 1);
      frame.style.width = viewport.width + 'px'; frame.style.height = viewport.height + 'px';
      frame.style.left = -Math.max(0, viewport.width - viewport.contentWidth) * scale + 'px';
      frame.style.transform = 'scale(' + scale + ')';
      mount.style.width = viewport.contentWidth + 'px';
      // A scrollbar must not change the virtual body origin and crop the first glyphs.
      mount.style.marginLeft = Math.max(0, viewport.width - viewport.contentWidth) + 'px';
      frame.dataset.renderScale = String(scale);
    };
    const observer = new ResizeObserver(size);
    observer.observe(host);
    const relayWheel = (event: WheelEvent) => {
      if (!host.closest('[data-dragging="true"]')) forwardPreviewWheel(event, visibleFrameRef.current);
    };
    host.addEventListener('wheel', relayWheel, { passive: false });
    doc.addEventListener('keydown', relayShortcut);
    size(); setTarget(mount);
    return () => { observer.disconnect(); host.removeEventListener('wheel', relayWheel); doc.removeEventListener('keydown', relayShortcut); setTarget(null); frame.remove(); if (visibleFrameRef.current === frame) visibleFrameRef.current = null; host.style.position = ''; host.style.height = ''; host.style.overflow = ''; };
  }, [hostRef, native, snapshot.bundle.formatter.document, snapshot.renderer?.fingerprint]);
  useLayoutEffect(() => {
    if (!native) return;
    hostRef.current?.querySelectorAll<HTMLIFrameElement>('iframe[data-article-frame]').forEach(frame => {
      frame.title = frame.dataset.articleFrame === 'dark' ? frameTitles.current.dark : frameTitles.current.light;
    });
  }, [hostRef, native, target, t]);
  useLayoutEffect(() => {
    if (!native || !target) return;
    const doc = target.ownerDocument;
    if (snapshot.renderer) { const style = doc.head.querySelector<HTMLStyleElement>('[data-article-style]'); if (style) style.textContent = css; return; }
    const preview = snapshot.bundle.formatter.preview;
    // This document stays canonical light even when a manual-dark overlay is shown.
    doc.documentElement.dataset.previewMode = 'light';
    doc.documentElement.classList.toggle('dark', false);
    doc.body.style.background = preview.light.background;
    doc.body.style.color = preview.color;
    doc.body.style.fontFamily = preview.fontFamily;
    const style = doc.head.querySelector<HTMLStyleElement>('[data-article-style]');
    if (style) style.textContent = css;
  }, [native, target, css, dark, snapshot.id, snapshot.bundle.formatter.preview]);
  useEffect(() => {
    const host = hostRef.current;
    setDarkIssue('');
    setColorResult(null);
    if ((!dark && !options.colorTheme) || !css || !host || !target) return;
    let active = true, controller: AbortController | undefined, overlay: HTMLIFrameElement | undefined, observer: ResizeObserver | undefined, canonicalFrame: HTMLIFrameElement | null = null, stopImages: (() => void) | undefined, stopCitations: (() => void) | undefined;
    let overlayReady: Promise<void> | undefined;
    let darkMount: HTMLDivElement | undefined, darkStyle: HTMLStyleElement | undefined;
    const render = () => {
      const root = target.querySelector<HTMLElement>('[data-article-content-root]');
      if (!root) return;
      controller?.abort(); controller = new AbortController();
      const request = controller;
      const markup = articlePreviewMarkup(root);
      const context = { snapshot, css, theme: options.colorTheme };
      setColorResult(null);
      void nativeDarkRendition(root, css, snapshot, request.signal, { ...options, width: host.clientWidth }).then(async result => {
        if (!active || request.signal.aborted || !root.isConnected || target.querySelector('[data-article-content-root]') !== root || articlePreviewMarkup(root) !== markup) return;
        setColorResult({ ...context, colors: { status: 'ready', values: result.colors ?? {} } });
        if (!dark) return;
        stopImages?.();
        if (!overlay) {
          overlay = document.createElement('iframe'); overlay.title = frameTitles.current.dark; overlay.dataset.articleFrame = 'dark';
          overlay.setAttribute('sandbox', 'allow-same-origin');
          overlay.style.cssText = native ? 'position:absolute;top:0;border:0;transform-origin:top left' : 'display:block;width:100%;height:100%;border:0';
          (native ? host : host.shadowRoot ?? host).append(overlay);
          darkFrameRef.current = overlay;
          visibleFrameRef.current = overlay;
          overlayReady = (async () => {
          const doc = overlay!.contentDocument!;
          if (snapshot.renderer) {
            const mount = await packageDisplayDocument(overlay!, snapshot);
            if (!active) return;
            darkMount = mount as HTMLDivElement;
          } else { doc.open(); doc.write('<!doctype html><html><head></head><body></body></html>'); doc.close(); }
          const actualDoc = snapshot.renderer ? darkMount!.ownerDocument : doc;
          actualDoc.documentElement.lang = snapshot.bundle.formatter.document?.language ?? 'zh-CN';
          actualDoc.documentElement.dataset.previewMode = 'dark';
          actualDoc.documentElement.classList.toggle('dark', articleDarkMode(snapshot.bundle.formatter) === 'tokens');
          actualDoc.body.style.margin = '0';
          if (native) actualDoc.documentElement.style.scrollbarWidth = 'none';
          actualDoc.documentElement.style.overflowX = 'clip';
          actualDoc.addEventListener('keydown', relayShortcut);
          darkStyle = actualDoc.createElement('style'); actualDoc.head.append(darkStyle);
          if (!darkMount) { darkMount = actualDoc.createElement('div'); actualDoc.body.append(darkMount); } stopCitations = bindPreviewCitations(darkMount, host);
          const mount = darkMount;
          const size = () => {
            if (!native) return;
            const viewport = snapshot.bundle.formatter.document?.viewport ?? { width: host.clientWidth, height: host.clientHeight, contentWidth: host.clientWidth };
            const scale = Math.min(host.clientWidth / viewport.contentWidth, host.clientHeight / viewport.height, 1);
            overlay!.style.width = viewport.width + 'px'; overlay!.style.height = viewport.height + 'px';
            overlay!.style.left = -(viewport.width - viewport.contentWidth) * scale + 'px';
            overlay!.style.transform = 'scale(' + scale + ')';
            mount.style.width = viewport.contentWidth + 'px'; mount.style.marginLeft = (viewport.width - viewport.contentWidth) + 'px';
          };
          observer = new ResizeObserver(size); observer.observe(host); size();
          })();
        }
        await overlayReady;
        if (!active || request.signal.aborted || !root.isConnected || articlePreviewMarkup(root) !== markup) return;
        if (darkStyle!.textContent !== result.css) darkStyle!.textContent = result.css;
        commitPreviewMarkup(darkMount!, snapshot.renderer ? sanitizePackageHtml(result.html, snapshot) : sanitizeHtml(result.html, snapshot));
        if (!native) { target.hidden = true; host.style.height = '100%'; }
        else {
          canonicalFrame = host.querySelector<HTMLIFrameElement>('iframe[data-article-frame="light"]');
          canonicalFrame?.setAttribute('aria-hidden', 'true');
          if (canonicalFrame) { canonicalFrame.inert = true; if (snapshot.renderer) canonicalFrame.style.opacity = '0'; }
        }
        if (imageOpenRef.current) stopImages = bindPreviewImages(darkMount!, image => imageOpenRef.current?.(image), () => active && !request.signal.aborted && root.isConnected && articlePreviewMarkup(root) === markup);
      }).catch(error => { if (active && !request.signal.aborted && error?.name !== 'AbortError' && !isProductCancellation(error)) {
        setColorResult({ ...context, colors: { status: 'error', values: {} } });
        setDarkIssue(error instanceof Error ? error.message : String(error));
      } });
    };
    const stop = observeArticlePreview(target, render, 120);
    return () => {
      active = false; stop(); controller?.abort(); stopImages?.(); observer?.disconnect(); stopCitations?.(); overlay?.remove();
      darkFrameRef.current = null;
      canonicalFrame?.removeAttribute('aria-hidden');
      if (canonicalFrame) { canonicalFrame.inert = false; canonicalFrame.style.opacity = ''; }
      if (!native) { target.hidden = false; host.style.height = ''; }
      if (visibleFrameRef.current === overlay) visibleFrameRef.current = host.querySelector<HTMLIFrameElement>('iframe[data-article-frame="light"]');
    };
  }, [hostRef, native, target, dark, css, snapshot, options.retained, options.colorTheme]);
  return { target, native, darkIssue, darkFrameRef, darkColors };
}
