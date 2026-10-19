import { ProductError } from "./i18n/productMessages";
import { getFormatSnapshot, type FormatSnapshot } from './article-format/runtime';
import { formatPreviewDocument } from './article-format/frame';
import { INSPECTION_CLASSES } from './themeInspection';
const INSPECTION_STATE_CLASSES = new Set(INSPECTION_CLASSES.filter(name => name.startsWith('data-[theme-inspection-')));
export function articlePreviewMarkup(root: HTMLElement): string {
  return root.outerHTML.replace(/\sdata-theme-inspection-[\w-]+="[^"]*"/g, '')
    .replace(/\sclass="([^"]*)"/g, (_, names: string) => ` class="${names.split(/\s+/).filter(name => !INSPECTION_STATE_CLASSES.has(name)).join(' ')}"`);
}
// Configured conversion runs only in a fresh document. The light DOM remains untouched.
export function observeArticlePreview(root: HTMLElement, refresh: () => void, delay = 0): () => void {
  let active = true;
  let previous = '';
  let timer: ReturnType<typeof setTimeout> | undefined, changedAt = 0;
  const sync = () => {
    timer = undefined; changedAt = 0;
    if (!active) return;
    // React can reapply identical attributes (for example checkbox defaults).
    // A notification alone must never trigger another iframe navigation.
    const content = articlePreviewMarkup(root);
    if (content === previous) return;
    previous = content;
    refresh();
  };
  const schedule = () => {
    if (!delay) { sync(); return; }
    changedAt ||= Date.now();
    clearTimeout(timer);
    // Merge a typing burst, but keep publishing during sustained input.
    timer = setTimeout(sync, Math.max(0, Math.min(delay, delay * 3 - (Date.now() - changedAt))));
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  sync();
  return () => { active = false; clearTimeout(timer); observer.disconnect(); };
}


export { createArticleColorNormalizer } from './article-format/colors';

export function cloneArticleForDarkPreview(root: HTMLElement, snapshot = getFormatSnapshot()): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.removeAttribute('hidden');
  const view = root.ownerDocument.defaultView;
  if (!view) throw new ProductError("articleDarkPreview.theArticlePreviewIsNotMountedYet");
  const originals = [root, ...root.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  const options = snapshot.bundle.formatter.output;
  originals.forEach((source, index) => {
    const computed = view.getComputedStyle(source);
    for (const property of options.inlineProperties) copies[index].style.setProperty(property, computed.getPropertyValue(property));
  });
  if (snapshot.bundle.formatter.preview.stripThemeBackground) {
    for (const node of [clone, clone.querySelector<HTMLElement>(':scope > .article-body')]) {
      node?.style.removeProperty('background-color'); node?.style.removeProperty('background-image');
    }
  }
  return clone;
}

export function articleDarkPreviewDocument(css: string, html: string, snapshot: FormatSnapshot = getFormatSnapshot()): string {
  return formatPreviewDocument(css, html, true, snapshot);
}
