import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = process.cwd(), output = path.join(root, '.next/build-tools/library-assets.mjs');
await fs.mkdir(path.dirname(output), { recursive: true });
await build({ entryPoints: ['scripts/library-assets.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node24', loader: { '.md': 'text' }, banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ARTICLE_BASE_PATH': '""' } });
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://library-build.invalid/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'DOMParser', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
globalThis.fetch = async value => {
  const url = new URL(String(value), 'http://library-build.invalid/');
  if (url.origin !== 'http://library-build.invalid') throw Error('Library build requires packaged local assets: ' + url.origin);
  const target = path.resolve(root, 'public', '.' + decodeURIComponent(url.pathname));
  if (!target.startsWith(path.join(root, 'public') + path.sep)) throw Error('Invalid build asset path');
  return new Response(await fs.readFile(target), { status: 200 });
};
try { await import(pathToFileURL(output).href); } finally { dom.window.close(); }
// React's browser renderer retains MessagePorts after all awaited build work ends.
process.exit(0);
