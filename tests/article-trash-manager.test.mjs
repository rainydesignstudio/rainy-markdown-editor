import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import { JSDOM } from 'jsdom';
import * as service from '../src/lib/articleTrash.ts';
import * as journal from '../src/lib/trashCleanupCheckpoint.ts';
import * as messages from '../src/lib/i18n/productMessages.ts';
import { createToastCountdown } from '../src/lib/toastCountdown.ts';
import { saveStoredArticle } from '../src/lib/fileSystem.ts';
import { createArticleSource } from '../src/lib/frontMatter.ts';
import { getTheme } from '../src/lib/themes.ts';
import { tree } from './knowledge/fs-fixture.mjs';

async function fixture() {
  const root = tree('isolated-manager');
  const { article } = await saveStoredArticle(root, createArticleSource('Undo', 'basic'), getTheme('basic'), 'Undo', '2026-10');
  const moved = await service.trashStoredArticle(root, article, { projectId: null, archived: false }, null);
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid' });
  const originals = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); }
  let now = 0, serial = 0, tail = Promise.resolve(), api, restores = 0;
  const timers = new Map(), notices = new Map(), notify = notice => { if (notice.dismiss) notices.delete(notice.key); else notices.set(notice.key, notice); };
  const props = { root, session: 1, libraryId: 'isolated-library', ready: true, enabled: true, isCurrent: (root, session) => props.root === root && props.session === session, queue: work => { const result = tail.then(work); tail = result.catch(() => {}); return result; }, onRestored: async () => { restores++; } };
  const module = { exports: {} }, source = await readFile(new URL('../src/hooks/useArticleTrash.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports, window: dom.window, crypto, Set, Map,
    require(id) {
      if (id === 'react') return React;
      if (id.endsWith('/Toast')) return { useToast: () => notify };
      if (id.endsWith('/articleTrash')) return service;
      if (id.endsWith('/trashCleanupCheckpoint')) return journal;
      if (id.endsWith('/productMessages')) return messages;
      if (id.endsWith('/toastCountdown')) return { createToastCountdown: (duration, options) => createToastCountdown(duration, { ...options, now: () => now, schedule: (callback, delay) => { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id; }, cancel: id => timers.delete(id) }) };
      throw new Error(id);
    },
  });
  const { createRoot } = await import('react-dom/client'), reactRoot = createRoot(document.getElementById('root'));
  function Probe() { api = module.exports.useArticleTrash(props); return null; }
  async function drain() { for (let i = 0; i < 12; i++) { const pending = tail; await pending; await Promise.resolve(); if (pending === tail) { await Promise.resolve(); if (pending === tail) break; } } }
  async function act(work = () => {}) { await React.act(async () => { await work(); await drain(); }); }
  await act(() => reactRoot.render(React.createElement(Probe)));
  return { root, moved, props, notices, get api() { return api; }, get restores() { return restores; }, act,
    cleanupNotice() { return [...notices.values()].find(item => item.lifetime?.countdown); },
    async begin() { await act(() => api.requestCleanup()); await act(() => api.confirmCleanup()); return this.cleanupNotice(); },
    async advance(ms) { const end = now + ms; while (true) { const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; now = next[1].at; timers.delete(next[0]); await act(next[1].callback); } now = end; },
    async rerender() { await act(() => reactRoot.render(React.createElement(Probe))); },
    async close() { await act(() => reactRoot.unmount()); assert.equal(timers.size, 0); dom.window.close(); for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; },
  };
}

test('cleanup shares one paused clock, queued time costs nothing, and explicit dismissal never commits early', async () => {
  const f = await fixture();
  try {
    const notice = await f.begin(), clock = notice.lifetime.countdown;
    await f.advance(60000); assert.equal((await service.listArticleTrash(f.root)).entries.length, 1);
    await f.act(() => clock.start()); await f.advance(10000); await f.act(() => clock.hold('reader', true));
    await f.advance(60000); assert.equal(clock.snapshot().remainingMs, 20000);
    f.notices.delete(notice.key); await f.act(() => clock.hold('reader', false));
    await f.advance(19999); assert.equal((await service.listArticleTrash(f.root)).entries.length, 1);
    await f.advance(1); assert.equal((await service.listArticleTrash(f.root)).entries.length, 0);
    assert.equal((await service.listArticleTrash(f.root)).cleanups.length, 0);
  } finally { await f.close(); }
});

test('refresh/reopen keeps remaining grace time and cleanup undo only returns entries to trash', async () => {
  const f = await fixture();
  try {
    const notice = await f.begin(); await f.act(() => notice.lifetime.countdown.start()); await f.advance(12000);
    await f.act(() => window.dispatchEvent(new window.Event('pagehide')));
    f.props.ready = false; await f.rerender();
    assert.equal((await service.listArticleTrash(f.root)).entries.length, 1);
    f.props.ready = true; await f.rerender();
    const resumed = f.cleanupNotice(); assert.equal(resumed.lifetime.countdown.snapshot().remainingMs, 18000);
    await f.act(() => resumed.actions[0].run());
    assert.equal((await service.listArticleTrash(f.root)).entries.length, 1); assert.equal((await service.listArticleTrash(f.root)).cleanups.length, 0); assert.equal(f.restores, 0);
    await f.act(() => f.api.restore([f.moved.entry.id])); assert.equal(f.restores, 1); assert.equal((await service.listArticleTrash(f.root)).entries.length, 0);
  } finally { await f.close(); }
});

test('changing library invalidates retained undo actions and never writes into either new context', async () => {
  const f = await fixture();
  try {
    const notice = await f.begin(); f.props.root = tree('other'); f.props.session++; f.props.libraryId = 'other'; await f.rerender();
    await f.act(() => notice.actions[0].run()).then(() => assert.fail('stale action must reject'), () => {});
    assert.equal((await service.listArticleTrash(f.root)).cleanups.length, 1); assert.equal(f.props.root.children.size, 0);
  } finally { await f.close(); }
});
