import DOMPurify from 'dompurify';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import type { RendererDeclaration } from './packageContract';
import { articleImageSourceSetCandidates, replaceArticleImageSourceSetUrls } from '../articleMedia';
import { localResourceReference } from '../resources/references';
import { normalizeLibraryPath, type CssAsset } from './styles';
import type { FormatSnapshot } from './runtime';
import type { ThemeConfig } from '../types';
import { restorePreviewImageAttributes } from './previewImages';
import { formatFingerprint } from './config';
import { invokeRenderer, rendererAction, renderPackage } from './package';

type Input = { source: string; theme: ThemeConfig; snapshot: FormatSnapshot; css: string; assets?: readonly CssAsset[] };
const inputs = new WeakMap<HTMLElement, Input>();
export function bindPackageInput(element: HTMLElement, input: Input) { inputs.set(element, input); element.dataset.packageInput = packageInputKey(input.source, input.theme, input.snapshot); }
export function packageInputFor(root: HTMLElement): Input | undefined {
  const direct = inputs.get(root); if (direct) return direct;
  for (const element of root.querySelectorAll<HTMLElement>('[data-package-input]')) { const input = inputs.get(element); if (input) return input; }
  for (let node: HTMLElement | null = root.parentElement; node; node = node.parentElement) { const input = inputs.get(node); if (input) return input; }
}
export const packageInputKey = (source: string, theme: ThemeConfig, snapshot: FormatSnapshot) => snapshot.id + ':' + formatFingerprint([source, theme]);
export function packageResourcePath(source: string, base: string, snapshot: FormatSnapshot): string {
  const local = localResourceReference(source);
  if (local) return normalizeLibraryPath((local.shared ? 'shared' : base + '/media') + '/' + local.storage + '/' + local.fileName);
  return source.startsWith('/') ? normalizeLibraryPath((snapshot.environment?.policy.publicRoot ?? 'assets') + source) : normalizeLibraryPath(source, base);
}
export function sanitizePackageHtml(html: string, snapshot: FormatSnapshot): string {
  assertInertPackageMarkup(html);
  const purifier = /blob:/i.test(html) ? DOMPurify(window) : DOMPurify;
  if (purifier !== DOMPurify) purifier.addHook('uponSanitizeAttribute', (node, data) => {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !['img', 'source'].includes(node.localName)) return;
    const urls = data.attrName === 'srcset' ? articleImageSourceSetCandidates(data.attrValue).map(candidate => candidate.url) : data.attrName === 'src' && node.localName === 'img' ? [data.attrValue] : [];
    if (urls.some(url => /^blob:(?:https?:\/\/|null\/)/i.test(url)) && urls.every(url => !/^(?:javascript|vbscript):|^data:(?!image\/)/i.test(url.replace(/[\u0000-\u0020\u007f]/g, '')))) data.forceKeepAttr = true;
  });
  const clean = purifier.sanitize(html, { USE_PROFILES: { html: true, svg: true, mathMl: true }, ADD_TAGS: ['animate', 'animateTransform'], ADD_ATTR: ['checked', 'disabled'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'form'], FORBID_ATTR: ['srcdoc'], ADD_FORBID_CONTENTS: ['annotation-xml'] });
  const template = document.createElement('template'); template.innerHTML = clean;
  for (const image of template.content.querySelectorAll('img,image,source')) for (const name of ['src', 'href', 'xlink:href', 'srcset']) {
    const value = image.getAttribute(name); if (!value) continue;
    const allowed = snapshot.renderer!.declaration.permissions.images;
    const urls = name === 'srcset' ? articleImageSourceSetCandidates(value).map(candidate => candidate.url) : [value];
    if (urls.some(url => /^(?:https?:)?\/\//i.test(url) && !allowed.some(origin => origin === 'https:' ? url.startsWith('https:') : new URL(url, location.href).origin === origin))) {
      image.removeAttribute(name); image.setAttribute('data-asset-state', 'error'); image.setAttribute('data-local-asset-src', value);
    }
  }
  return template.innerHTML;
}
export function assertInertPackageMarkup(html: string, allowStyles = false, permissions?: RendererDeclaration['permissions']) {
  const template = document.createElement('template'); template.innerHTML = html;
  if (template.content.querySelector('script,iframe,object,embed,base,form,link,meta[http-equiv]')) throw new Error('Format output contains active HTML');
  for (const element of template.content.querySelectorAll('*')) {
    if (element.localName === 'style') { if (!allowStyles) throw new Error('Return styles in the CSS field'); assertPackageCss(element.textContent ?? '', permissions); }
    for (const attr of element.attributes) {
      const value = attr.value.replace(/[\u0000-\u0020\u007f]/g, '');
      if (/^on/i.test(attr.name) || attr.name === 'srcdoc' || ['href', 'xlink:href', 'src', 'action', 'formaction'].includes(attr.name) && /^(?:javascript|vbscript|data:(?!image\/|font\/))/i.test(value)) throw new Error('Format output contains executable attributes');
    }
    if (['animate', 'set', 'animateTransform'].includes(element.localName) && /^(?:on|href|xlink:href)/i.test(element.getAttribute('attributeName') ?? '')) throw new Error('Format output animates an executable attribute');
  }
}
export function assertPackageCss(css: string, permissions?: RendererDeclaration['permissions']) {
  const sheet = postcss.parse(css);
  const permitted = (url: string, origins: string[] = []) => /^https:\/\//i.test(url) && origins.some(origin => origin === 'https:' || new URL(url).origin === origin);
  sheet.walkAtRules(rule => {
    if (['plugin', 'config'].includes(rule.name.toLowerCase())) throw new Error('Format output contains a code import');
    if (rule.name.toLowerCase() === 'import') {
      const first = valueParser(rule.params).nodes.find(n => n.type !== 'space' && n.type !== 'comment');
      const url = first?.type === 'string' ? first.value : first?.type === 'function' && first.value.toLowerCase() === 'url' ? valueParser.stringify(first.nodes).replace(/^(['"])(.*)\1$/, '$2') : '';
      if (!permitted(url, permissions?.styles)) throw new Error('Format stylesheet origin is not declared');
    }
  });
  sheet.walkDecls(decl => {
    if (/^(?:behavior|-moz-binding)$/i.test(decl.prop) || /expression\s*\(|(?:javascript|vbscript)\s*:/i.test(decl.value)) throw new Error('Format output contains executable CSS');
    valueParser(decl.value).walk(node => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
      const url = valueParser.stringify(node.nodes).replace(/^(['"])(.*)\1$/, '$2');
      if (/^https?:|^\/\//i.test(url) && !permitted(url, decl.parent?.type === 'atrule' && decl.parent.name === 'font-face' ? permissions?.fonts : permissions?.images)) throw new Error('Format resource origin is not declared');
      return false;
    });
  });
}
export function packageDisplayDocument(frame: HTMLIFrameElement, snapshot: FormatSnapshot, signal?: AbortSignal): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const fail = () => { clearTimeout(timer); signal?.removeEventListener('abort', fail); reject(new Error('Format preview failed or cancelled')); };
    signal?.throwIfAborted(); signal?.addEventListener('abort', fail, { once: true });
    timer = setTimeout(fail, 30000);
    frame.onload = () => {
      clearTimeout(timer); signal?.removeEventListener('abort', fail);
      const doc = frame.contentDocument;
      if (!doc) { reject(new Error('Format preview document unavailable')); return; }
      const policy = doc.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
      const permissions = snapshot.renderer!.declaration.permissions;
      policy.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' " + (permissions.styles ?? []).join(' ') + "; img-src data: blob: " + permissions.images.join(' ') + "; font-src data: blob: " + (permissions.fonts ?? []).join(' ') + "; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
      doc.head.append(policy); doc.body.style.margin = '0'; doc.documentElement.style.overflowX = 'clip';
      const style = doc.createElement('style'); style.dataset.articleStyle = ''; doc.head.append(style);
      const target = doc.createElement('div'); doc.body.append(target); resolve(target);
    };
    frame.onerror = fail;
    frame.src = '/format/article-package-preview.html';
  });
}
export function packageAuthoredMarkup(root: HTMLElement): string {
  const template = root.ownerDocument.createElement('template'), clone = root.cloneNode(true) as HTMLElement; template.content.append(clone);
  const source = [root, ...root.querySelectorAll('*')], targets = [clone, ...clone.querySelectorAll('*')];
  source.forEach((node, index) => {
    const target = targets[index] as HTMLElement;
    restorePreviewImageAttributes(node as HTMLElement, target);
    const src = node.getAttribute('data-local-asset-src'), set = node.getAttribute('data-local-asset-srcset');
    if (src && node.localName === 'img') target.setAttribute('src', src);
    if (set) target.setAttribute('srcset', set);
  });
  return clone.innerHTML;
}
export async function packageClipboard(root: HTMLElement, snapshot: FormatSnapshot) {
  const input = packageInputFor(root); if (!input) throw new Error('Format preview is not ready');
  if (input.snapshot.id !== snapshot.id || input.snapshot.renderer?.fingerprint !== snapshot.renderer?.fingerprint) throw new Error('Format preview changed');
  const action = rendererAction(snapshot, 'copy'); if (!action) throw new Error('Format package has no rich text action');
  const result = await invokeRenderer(snapshot, action.id, { source: input.source, theme: input.theme, css: input.css, html: packageAuthoredMarkup(root), observations: packageObservations(root) });
  if (typeof result.html !== 'string' || typeof result.text !== 'string') throw new Error('Format copy returned no HTML/text');
  return { html: sanitizePackageHtml(result.html, snapshot), text: result.text, localImageCount: root.querySelectorAll('[data-local-asset-src]').length };
}
export function packageObservations(root: HTMLElement | null) {
  return [...root?.querySelectorAll<HTMLImageElement>('img') ?? []].map(image => ({ complete: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight }));
}
export async function awaitPackagePreview(root: HTMLElement | null, source: string, theme: ThemeConfig, snapshot: FormatSnapshot, signal?: AbortSignal) {
  signal?.throwIfAborted(); if (!snapshot.renderer) return;
  if (!root) throw new Error('Format preview is not mounted');
  const key = packageInputKey(source, theme, snapshot);
  const ready = () => root.querySelector<HTMLElement>('[data-package-input]')?.dataset.packageInput === key;
  if (ready()) return;
  await new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => { if (ready()) finish(); else if (!root.isConnected) finish(new Error('Format preview changed')); });
    const timer = window.setTimeout(() => finish(new Error('Format preview timed out')), 30000);
    const cancel = () => finish(new DOMException('Format preview cancelled', 'AbortError'));
    function finish(error?: Error) { observer.disconnect(); clearTimeout(timer); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(); }
    signal?.addEventListener('abort', cancel, { once: true });
    observer.observe(root, { childList: true, subtree: true, attributes: true }); if (ready()) finish();
  });
}
export async function packageDarkRendition(root: HTMLElement, snapshot: FormatSnapshot) {
  const input = packageInputFor(root); if (!input) throw new Error('Format preview is not ready');
  const result = await renderPackage(input.source, input.theme, snapshot, 'dark');
  assertPackageCss(result.css!, snapshot.renderer?.declaration.permissions);
  const template = root.ownerDocument.createElement('template'); template.innerHTML = sanitizePackageHtml(result.html!, snapshot);
  const urls = new Map<string, string>();
  for (const image of root.querySelectorAll<HTMLImageElement>('img[data-local-asset-src]')) {
    const authored = image.dataset.localAssetSrc; if (authored && image.complete && image.naturalWidth) urls.set(authored, image.src);
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-local-asset-srcset]')) {
    const authored = articleImageSourceSetCandidates(node.dataset.localAssetSrcset ?? ''), current = articleImageSourceSetCandidates(node.getAttribute('srcset') ?? '');
    if (authored.length === current.length) authored.forEach((candidate, index) => urls.set(candidate.url, current[index].url));
  }
  for (const node of template.content.querySelectorAll('img,source')) {
    const src = node.getAttribute('src'), set = node.getAttribute('srcset');
    if (src && urls.has(src)) { node.setAttribute('data-local-asset-src', src); node.setAttribute('src', urls.get(src)!); }
    if (set) { node.setAttribute('data-local-asset-srcset', set); node.setAttribute('data-clipboard-srcset', set); node.setAttribute('srcset', replaceArticleImageSourceSetUrls(set, urls)); }
  }
  return { html: template.innerHTML, css: result.css! };
}

/** Read-only layout primitives; validation policy stays inside the calling package. */
export function packageMeasurementServices(snapshot: FormatSnapshot) {
  return { async 'measure-v1'(value: unknown, signal: AbortSignal) {
    const input = value as { html: string; css: string; widths: number[] };
    if (!input || typeof input.html !== 'string' || typeof input.css !== 'string' || !Array.isArray(input.widths) || !input.widths.length || input.widths.length > 8 || input.widths.some(width => !Number.isInteger(width) || width < 64 || width > 4096)) throw new Error('Invalid layout measurement');
    const html = sanitizePackageHtml(input.html, snapshot); assertPackageCss(input.css, snapshot.renderer?.declaration.permissions);
    const screens = [];
    for (const width of input.widths) {
      signal.throwIfAborted(); const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      frame.style.cssText = `position:fixed;left:-100000px;top:0;border:0;width:${width}px;height:2000px;pointer-events:none`;
      const loading = packageDisplayDocument(frame, snapshot, signal); document.body.append(frame);
      try {
        const target = await loading, doc = target.ownerDocument;
        doc.querySelector<HTMLStyleElement>('[data-article-style]')!.textContent = input.css; target.innerHTML = html;
        const root = target.firstElementChild; if (!root) throw new Error('No layout root');
        const nodes = [root, ...root.querySelectorAll('*')]; if (nodes.length > 20000) throw new Error('Layout measurement exceeds limits');
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => { clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
          const abort = () => finish(new DOMException('Layout measurement cancelled', 'AbortError'));
          const timer = setTimeout(() => finish(), 5000); signal.addEventListener('abort', abort, { once: true });
          void Promise.all([...root.querySelectorAll('img')].map(image => image.decode().catch(() => {}))).then(() => finish());
        });
        signal.throwIfAborted();
        screens.push({ width, images: [...root.querySelectorAll('img')].map(image => ({ complete: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight })), boxes: nodes.map(node => {
          const rect = node.getBoundingClientRect(), parent = (node.parentElement ?? root).getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom, height: rect.height, parent: { left: parent.left, right: parent.right, width: parent.width } };
        }) });
      } finally { frame.remove(); }
    }
    return { screens };
  } };
}
