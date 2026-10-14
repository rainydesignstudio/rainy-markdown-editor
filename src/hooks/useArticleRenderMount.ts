'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { nativeDarkRendition } from '../lib/article-format/nativeDark';
import { observeArticlePreview } from '../lib/articleDarkPreview';
import { sanitizeHtml } from '../lib/article-format/sanitize';
import type { FormatSnapshot } from '../lib/article-format/runtime';
function relayPreviewShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && ['s', 'f', 'g', '/'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, bubbles: true, cancelable: true }));
  }
}

export function useArticleRenderMount(hostRef: RefObject<HTMLDivElement | null>, snapshot: FormatSnapshot, css: string, dark = false) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [darkIssue, setDarkIssue] = useState('');
  const native = Boolean(snapshot.bundle.formatter.stylesheets || snapshot.bundle.formatter.document);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!native) {
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      let mount = shadow.querySelector<HTMLElement>('[data-article-preview]');
      if (!mount) { mount = document.createElement('div'); mount.dataset.articlePreview = ''; shadow.append(mount); }
      setTarget(mount);
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = '文章排版预览';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('allow', 'clipboard-write');
    frame.dataset.articleFrame = '';
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
    doc.addEventListener('keydown', relayPreviewShortcut);
    size(); setTarget(mount);
    return () => { observer.disconnect(); doc.removeEventListener('keydown', relayPreviewShortcut); setTarget(null); frame.remove(); host.style.position = ''; host.style.height = ''; host.style.overflow = ''; };
  }, [hostRef, native, snapshot.bundle.formatter.document]);
  useLayoutEffect(() => {
    if (!native || !target) return;
    const doc = target.ownerDocument;
    const preview = snapshot.bundle.formatter.preview;
    doc.documentElement.dataset.previewMode = dark ? 'dark' : 'light';
    doc.documentElement.classList.toggle('dark', dark && preview.dark.transform === 'preserve');
    doc.body.style.background = dark && preview.dark.transform === 'preserve' ? preview.dark.background : preview.light.background;
    doc.body.style.color = preview.color;
    doc.body.style.fontFamily = preview.fontFamily;
    const style = doc.head.querySelector<HTMLStyleElement>('[data-article-style]');
    if (style) style.textContent = css;
  }, [native, target, css, dark, snapshot.id, snapshot.bundle.formatter.preview]);
  useEffect(() => {
    const host = hostRef.current;
    setDarkIssue('');
    if (!native || !dark || snapshot.bundle.formatter.preview.dark.transform === 'preserve' || !host || !target) return;
    let active = true, controller: AbortController | undefined, overlay: HTMLIFrameElement | undefined, observer: ResizeObserver | undefined;
    const render = () => {
      const root = target.querySelector<HTMLElement>('[data-article-content-root]');
      if (!root) return;
      controller?.abort(); controller = new AbortController();
      void nativeDarkRendition(root, css, snapshot, controller.signal).then(result => {
        if (!active) return;
        overlay?.remove(); observer?.disconnect();
        overlay = document.createElement('iframe'); overlay.title = '深色文章排版预览';
        overlay.setAttribute('sandbox', 'allow-same-origin');
        overlay.style.cssText = 'position:absolute;top:0;border:0;transform-origin:top left';
        host.append(overlay);
        const doc = overlay.contentDocument!;
        doc.open(); doc.write('<!doctype html><html><head></head><body></body></html>'); doc.close();
        doc.body.style.margin = '0';
        doc.documentElement.style.scrollbarWidth = 'none';
        doc.documentElement.style.overflowX = 'clip';
        doc.addEventListener('keydown', relayPreviewShortcut);
        const style = doc.createElement('style'); style.textContent = result.css; doc.head.append(style);
        const mount = doc.createElement('div'); mount.innerHTML = sanitizeHtml(result.html, snapshot); doc.body.append(mount);
        const size = () => {
          const viewport = snapshot.bundle.formatter.document?.viewport ?? { width: host.clientWidth, height: host.clientHeight, contentWidth: host.clientWidth };
          const scale = Math.min(host.clientWidth / viewport.contentWidth, host.clientHeight / viewport.height, 1);
          overlay!.style.width = viewport.width + 'px'; overlay!.style.height = viewport.height + 'px';
          overlay!.style.left = -(viewport.width - viewport.contentWidth) * scale + 'px';
          overlay!.style.transform = 'scale(' + scale + ')';
          mount.style.width = viewport.contentWidth + 'px'; mount.style.marginLeft = (viewport.width - viewport.contentWidth) + 'px';
        };
        observer = new ResizeObserver(size); observer.observe(host); size();
      }).catch(error => { if (active && error?.name !== 'AbortError' && !String(error).includes('已取消')) setDarkIssue(error instanceof Error ? error.message : String(error)); });
    };
    const stop = observeArticlePreview(target, render);
    return () => { active = false; stop(); controller?.abort(); observer?.disconnect(); overlay?.remove(); };
  }, [hostRef, native, target, dark, css, snapshot]);
  return { target, native, darkIssue };
}
