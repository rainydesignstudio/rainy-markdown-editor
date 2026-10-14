import type { FormatBundle } from './config';
import { FRAME_MESSAGES } from './frameMessages';

// Loaded as a local static script in srcdoc frames. Configuration remains inert JSON.
export async function runFormatFrameBootstrap() {
  type Payload = { kind: 'preview' | 'inspection'; bundle: FormatBundle; dark?: boolean; token?: string; origin?: string; css?: string };
  const data = document.head.querySelector<HTMLScriptElement>('script[data-article-format-config]');
  if (!data) return;
  let payload: Payload | undefined;
  try {
    payload = JSON.parse(data.textContent ?? '') as Payload;
    const api = window as typeof window & { ArticleFormatEngine: {
      inspect: (root: HTMLElement, bundle: FormatBundle, css: string) => Promise<unknown>;
      transform: (root: HTMLElement, bundle: FormatBundle) => void;
    } };
    const root = document.querySelector<HTMLElement>('[data-article-content-root],.article-preview');
    if (!root) throw new Error(FRAME_MESSAGES.rootMissing);
    if (payload.kind === 'inspection') {
      if (!payload.token || !payload.origin || typeof payload.css !== 'string') throw new Error(FRAME_MESSAGES.parametersMissing);
      const result = await api.ArticleFormatEngine.inspect(root, payload.bundle, payload.css);
      parent.postMessage({ token: payload.token, result }, payload.origin);
    } else if (payload.kind === 'preview') {
      if (payload.dark) api.ArticleFormatEngine.transform(root, payload.bundle);
    } else throw new Error(FRAME_MESSAGES.unknownKind);
    document.body.dataset.previewReady = 'true';
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    document.body.setAttribute('data-preview-error', error);
    if (payload?.kind === 'inspection' && payload.token && payload.origin) {
      parent.postMessage({ token: payload.token, error }, payload.origin);
    }
  }
}
