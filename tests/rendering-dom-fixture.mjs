import { JSDOM } from 'jsdom';
// Parser/sanitizer DOM only. This supplies no browser layout, native files or rasterization.
export const renderingDom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3501/' });
globalThis.window = renderingDom.window;
globalThis.document = renderingDom.window.document;
globalThis.DOMParser = renderingDom.window.DOMParser;
