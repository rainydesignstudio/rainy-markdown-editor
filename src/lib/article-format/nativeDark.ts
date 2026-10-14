import { formatPreviewDocument } from './frame';
import { assertCurrentFormat, type FormatSnapshot } from './runtime';

export async function nativeDarkRendition(root: HTMLElement, css: string, snapshot: FormatSnapshot, signal: AbortSignal): Promise<{ html: string; css: string }> {
  signal.throwIfAborted();
  const frame = document.createElement('iframe');
  const viewport = snapshot.bundle.formatter.document?.viewport;
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;border:0;pointer-events:none;width:' + (viewport?.width ?? root.clientWidth) + 'px;height:' + (viewport?.height ?? 959) + 'px';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // This processing frame executes only the existing, bundled conversion scripts.
  // Its input is a clone of the sanitized React document.
  return new Promise((resolve, reject) => {
    let done = false, observer: MutationObserver | undefined;
    const timeout = window.setTimeout(() => finish(new Error('深色转换超时。')), 20000);
    const abort = () => finish(new Error('深色转换已取消。'));
    const finish = (error?: Error) => {
      if (done) return; done = true;
      clearTimeout(timeout); signal.removeEventListener('abort', abort); observer?.disconnect();
      try {
        if (error) throw error;
        assertCurrentFormat(snapshot);
        const doc = frame.contentDocument!, element = doc.querySelector<HTMLElement>('[data-article-content-root],.article-preview');
        if (!element) throw new Error('转换后的文章根节点缺失。');
        resolve({ html: element.outerHTML, css: [...doc.head.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n') });
      } catch (cause) { reject(cause); }
      finally { frame.remove(); }
    };
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (!doc) { finish(new Error('深色转换文档无法访问。')); return; }
      const inspect = () => {
        if (doc.body.dataset.previewError) finish(new Error(doc.body.dataset.previewError));
        else if (doc.body.dataset.previewReady === 'true') finish();
      };
      observer = new MutationObserver(inspect);
      observer.observe(doc.body, { attributes: true }); inspect();
    };
    signal.addEventListener('abort', abort, { once: true });
    frame.srcdoc = formatPreviewDocument(css, root.outerHTML, true, snapshot);
    document.body.append(frame);
  });
}
