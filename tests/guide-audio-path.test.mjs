import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import * as React from 'react';
import { JSDOM } from 'jsdom';

async function audio(t, basePath, failFirst = false) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const previous = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const requests = [], voices = [], contexts = [];
  const result = await build({
    entryPoints: [new URL('../src/hooks/useGuideAudio.ts', import.meta.url).pathname],
    bundle: true, write: false, platform: 'browser', format: 'cjs', external: ['react'],
    define: { 'process.env.NEXT_PUBLIC_ARTICLE_BASE_PATH': JSON.stringify(basePath) },
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, require: id => { assert.equal(id, 'react'); return React; },
    document: dom.window.document, DOMException: dom.window.DOMException, performance, setTimeout, clearTimeout,
    AudioContext: class {
      state = 'suspended'; currentTime = 0; destination = {};
      constructor() { contexts.push(this); }
      async resume() { this.state = 'running'; } async close() { this.closed = true; }
      async decodeAudioData(bytes) { return { duration: new Uint8Array(bytes)[0] }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelAndHoldAtTime() {} }, connect() {}, disconnect() {} }; }
      createBufferSource() { const source = { connect() {}, disconnect() {}, stop() { this.stopped = true; }, start(...args) { this.started = args; voices.push(source); } }; return source; }
    },
    fetch: async url => {
      requests.push(url);
      const ok = !failFirst || requests.length > 1;
      return { ok, arrayBuffer: async () => new Uint8Array([6]).buffer };
    },
  });
  let controls;
  function Probe() { controls = module.exports.useGuideAudio(); return null; }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Probe)));
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  const act = action => React.act(async () => { await action(controls); await new Promise(resolve => setImmediate(resolve)); });
  return { requests, voices, contexts, act, rerender: () => React.act(async () => root.render(React.createElement(Probe))), controls: () => controls };
}

for (const prefix of ['', '/', '/lab/rainy-markdown-editor', '/lab/rainy-markdown-editor/']) {
  test(`guide hook primes silently then loads only the full outro at its deployment path: ${prefix || '(root)'}`, async t => {
    const f = await audio(t, prefix), base = prefix.replace(/\/+$/, '');
    await f.act(x => x.prime());
    assert.equal(f.contexts[0].state, 'running'); assert.deepEqual(f.requests, []); assert.equal(f.voices.length, 0);
    await f.act(x => x.play());
    assert.deepEqual(f.requests, [`${base}/guide-outro.mp3`]); assert.equal(f.voices.length, 1);
    assert.deepEqual(f.voices[0].started, [0]); assert.equal(f.voices[0].stopped, undefined);
    await f.rerender(); assert.equal(f.voices[0].stopped, undefined); assert.equal(f.contexts.length, 1);
    await f.act(x => x.quiet()); await f.act(x => x.prime());
    assert.equal(f.voices.length, 1, 'a new gesture must not replay the ending');
  });
}

test('a failed prefixed ending stays nonblocking; a later request uses the same deployment path', async t => {
  const f = await audio(t, '/lab/rainy-markdown-editor/', true);
  await f.act(x => x.play()); assert.equal(f.voices.length, 0);
  await f.act(x => x.play());
  assert.deepEqual(f.requests, ['/lab/rainy-markdown-editor/guide-outro.mp3', '/lab/rainy-markdown-editor/guide-outro.mp3']);
  assert.equal(f.voices.length, 1);
  await f.act(x => x.quiet()); await f.act(x => x.prime()); assert.equal(f.voices.length, 1);
});
