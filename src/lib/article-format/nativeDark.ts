import { ProductError } from "../i18n/productMessages";
import { formatPreviewDocument } from './frame';
import { assertCurrentFormat, type FormatSnapshot } from './runtime';
import { canonicalFormatJson } from './config';
import { articlePreviewMarkup } from '../articleDarkPreview';
import { createArticleColorInspection, type ArticleColorSlot } from '../themeInspection';
import type { ThemeConfig } from '../types';
import { assertLibraryCapability } from './libraryConfiguration';
import { articleDarkMode } from './styleTypes';

export type DarkRendition = { html: string; css: string; colors?: Record<string, string[]> };
const renditions = new Map<string, DarkRendition>();
const CACHE_ENTRIES = 4, CACHE_CHARACTERS = 2 * 1024 * 1024;
export function clearDarkRenditionCache() { renditions.clear(); }

export async function nativeDarkRendition(root: HTMLElement, css: string, snapshot: FormatSnapshot, signal: AbortSignal, options: { retained?: boolean; colorTheme?: ThemeConfig; width?: number } = {}): Promise<DarkRendition> {
  signal.throwIfAborted();
  if (!options.retained) assertCurrentFormat(snapshot);
  if (articleDarkMode(snapshot.bundle.formatter) === 'algorithm') assertLibraryCapability(snapshot, 'algorithm');
  const width = options.width || root.clientWidth || snapshot.bundle.formatter.output.visual.width;
  // The registered adapter captures computed paint inside its isolated document.
  // Copy authored markup here so manual tokens and external CSS resolve first.
  const html = articlePreviewMarkup(root);
  const key = snapshot.id + ':' + snapshot.algorithms.fingerprint + ':' + width + ':' + canonicalFormatJson(options.colorTheme ?? null) + ':' + css + ':' + html;
  const cached = renditions.get(key);
  if (cached) return cached;
  let slots: ArticleColorSlot[] = [];
  if (options.colorTheme) {
    const inspection = createArticleColorInspection(root, options.colorTheme, css);
    try { slots = inspection.colorSlots(); } finally { inspection.dispose(); }
  }
  const frame = document.createElement('iframe');
  const viewport = snapshot.bundle.formatter.document?.viewport;
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;border:0;pointer-events:none;width:' + (viewport?.width ?? width) + 'px;height:' + (viewport?.height ?? 959) + 'px';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // This processing frame executes only the existing, bundled conversion scripts.
  // Its input is a clone of the sanitized React document.
  return new Promise((resolve, reject) => {
    let done = false, observer: MutationObserver | undefined;
    const timeout = window.setTimeout(() => finish(new ProductError("runtime.darkTimeout")), 20000);
    const abort = () => finish(new ProductError("runtime.darkCancelled"));
    const finish = (error?: Error) => {
      if (done) return; done = true;
      clearTimeout(timeout); signal.removeEventListener('abort', abort); observer?.disconnect();
      try {
        if (error) throw error;
        // Retained display canvases have their own immutable input and are never used for output.
        if (!options.retained) assertCurrentFormat(snapshot);
        const doc = frame.contentDocument!, element = doc.querySelector<HTMLElement>('[data-article-content-root],.article-preview');
        if (!element) throw new ProductError("runtime.darkRootMissing");
        const colors: Record<string, string[]> = {};
        const elements = slots.length ? [element, ...element.querySelectorAll<HTMLElement>('*')] : [];
        for (const slot of slots) {
          const node = elements[slot.node];
          if (!node) throw new ProductError('runtime.darkRootMissing');
          const value = doc.defaultView!.getComputedStyle(node).getPropertyValue(slot.property).trim();
          const values = colors[slot.token] ??= [];
          if (value && !values.includes(value)) values.push(value);
        }
        const result: DarkRendition = { html: element.outerHTML, css: [...doc.head.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n'), ...(options.colorTheme ? { colors } : {}) };
        // Only successful, current results enter the bounded cache. The same
        // conversion supplies the preview and every read-only swatch.
        if (key.length + result.html.length + result.css.length + JSON.stringify(result.colors ?? {}).length < CACHE_CHARACTERS) {
          renditions.set(key, result);
          if (renditions.size > CACHE_ENTRIES) renditions.delete(renditions.keys().next().value!);
        }
        resolve(result);
      } catch (cause) { reject(cause); }
      finally { frame.remove(); }
    };
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (!doc) { finish(new ProductError("runtime.darkDocumentUnavailable")); return; }
      const inspect = () => {
        if (doc.body.dataset.previewError) finish(new Error(doc.body.dataset.previewError));
        else if (doc.body.dataset.previewReady === 'true') finish();
      };
      observer = new MutationObserver(inspect);
      observer.observe(doc.body, { attributes: true }); inspect();
    };
    signal.addEventListener('abort', abort, { once: true });
    frame.srcdoc = formatPreviewDocument(css, html, true, snapshot);
    document.body.append(frame);
  });
}
