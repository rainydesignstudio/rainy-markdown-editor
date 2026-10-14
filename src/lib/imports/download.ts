import { ProductError } from '../i18n/productMessages';
import { ARTICLE_EXAMPLE_IMAGE } from '../articleExamples';
import type { ImportResource } from './model';
import type { ReadonlyImportSource } from './source';

export function resourceDownloadURL(reference: string): URL {
  let url: URL;
  try { url = new URL(reference); } catch { throw new ProductError('imports.unsafeResource'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') && !host.includes(':') || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)) throw new ProductError('imports.unsafeResource');
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)?.slice(1).map(Number);
  if (ipv4 && (ipv4.some(part => part > 255) || [0, 10, 127].includes(ipv4[0]) || ipv4[0] >= 224 || ipv4[0] === 169 && ipv4[1] === 254 || ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31 || ipv4[0] === 192 && [0, 168].includes(ipv4[1]) || ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127 || ipv4[0] === 198 && [18, 19].includes(ipv4[1]))) throw new ProductError('imports.unsafeResource');
  // IPv4-mapped literals can encode private addresses in several forms. Literal
  // IPv6 destinations are conservatively excluded; DNS names remain available.
  if (host.includes(':')) throw new ProductError('imports.unsafeResource');
  url.hash = ''; return url;
}

export async function openImportResource(resource: ImportResource, source: ReadonlyImportSource, signal: AbortSignal, fetcher: typeof fetch = fetch, originKind = source.origin.kind): Promise<{ stream: ReadableStream<Uint8Array>; expectedBytes?: number }> {
  if (signal.aborted) throw signal.reason;
  if (resource.location === 'local') {
    try {
      const file = await source.readResource(resource.source);
      if (signal.aborted) throw signal.reason;
      return { stream: file.stream(), expectedBytes: file.size };
    } catch (error) {
      const absent = error instanceof DOMException && error.name === 'NotFoundError' || error instanceof ProductError && error.messageKey === 'imports.sourceDirectoryRequired';
      if (originKind !== 'local' || resource.source !== ARTICLE_EXAMPLE_IMAGE || !absent || signal.aborted) throw error;
    }
  }
  const builtin = resource.source === ARTICLE_EXAMPLE_IMAGE && resource.location === 'local';
  const url = builtin ? ARTICLE_EXAMPLE_IMAGE : resourceDownloadURL(resource.source).href;
  let response: Response;
  try { response = await fetcher(url, { method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal }); }
  catch (error) { if (signal.aborted) throw signal.reason; throw new ProductError('imports.downloadFailed'); }
  if (!response.ok || ['opaque', 'opaqueredirect'].includes(response.type) || !response.body) { await response.body?.cancel(); throw new ProductError('imports.downloadStatus', { status: response.status }); }
  const length = response.headers.get('content-length'), encoded = response.headers.get('content-encoding');
  // Content-Length is CORS-safelisted, Content-Encoding is not. A missing
  // encoding header on a cross-origin response cannot prove identity encoding.
  // Fetch itself validates transport truncation; count the decoded bytes here.
  const expectedBytes = encoded === 'identity' || builtin && !encoded ? length && /^\d+$/.test(length) ? Number(length) : undefined : undefined;
  return { stream: response.body, expectedBytes: expectedBytes !== undefined && Number.isSafeInteger(expectedBytes) ? expectedBytes : undefined };
}
