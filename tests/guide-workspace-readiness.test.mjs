import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const settleWorkspace =');
const end = source.indexOf('  const verifyGuideReady =', start);
function setup(view = 'settings', mode = 'editor') {
  let now = 0, id = 0, routeEffect;
  const root = {}, timers = new Map(), nodes = { childElementCount: 1, textarea: null, querySelector() { return this.textarea; } }, navigation = [], events = [];
  const context = {
    Error, Promise, controller: { directoryRef: { current: root }, view, articleMode: mode, directory: root, navigateArticleMode: value => navigation.push(value) },
    arrivalPending: { current: null }, workspaceRef: { current: nodes }, workspacePending: true, workspaceMounted: true,
    setWorkspacePending: value => events.push(['pending', value]), setWorkspaceMounted() {}, setEnteredFromGuide() {}, setNotificationsReady: value => events.push(['notifications', value]),
    t: key => key, window: { setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; }, clearTimeout(id) { timers.delete(id); } },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
    useLayoutEffect: callback => { routeEffect = callback; },
  };
  const compiled = ts.transpileModule(source.slice(start, end) + '\nglobalThis.prepare = prepareGuideWorkspace;globalThis.settle = settleWorkspace;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, context);
  const advance = async ms => { now += ms; for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); } await Promise.resolve(); };
  return { context, root, nodes, navigation, events, advance, ready() { context.controller.view = 'articles'; context.controller.articleMode = 'editor'; nodes.textarea = {}; routeEffect(); } };
}
test('a remembered editor preference on settings still requests the actual editor route', async () => {
  const f = setup(); let settled = false;
  const job = f.context.prepare(f.root, true).then(() => { settled = true; });
  assert.deepEqual(f.navigation, ['editor']); assert.equal(settled, false);
  f.nodes.textarea = {}; f.context.settle(); await Promise.resolve();
  assert.equal(settled, false, 'a textarea on the wrong workspace must not satisfy editor readiness');
  f.ready(); await job; assert.equal(settled, true);
});
test('cold editor routing can finish after the former ten-second deadline without a retry', async () => {
  const f = setup('settings', 'overview'); let result = 'pending';
  const job = f.context.prepare(f.root, true).then(() => { result = 'ready'; }, error => { result = error.message; });
  await f.advance(12000); assert.equal(result, 'pending');
  f.ready(); await job; assert.equal(result, 'ready');
});
test('an actual unavailable workspace times out with its own message and permits a clean retry', async () => {
  const f = setup(); const failed = f.context.prepare(f.root, true).catch(error => error.message);
  await f.advance(30000); assert.equal(await failed, 'workspaceUnavailable'); assert.equal(f.context.arrivalPending.current, null);
  const retry = f.context.prepare(f.root, true); f.ready(); await retry;
  assert.equal(f.context.arrivalPending.current, null);
});
test('a switched root rejects the old waiter and a replaced waiter cannot complete the new job', async () => {
  const f = setup(); const first = f.context.prepare(f.root, true).catch(error => error.message);
  const obsolete = f.context.arrivalPending.current;
  const second = f.context.prepare(f.root, true).catch(error => error.message);
  obsolete.resolve(); assert.notEqual(f.context.arrivalPending.current, null);
  assert.equal(await first, 'contextChanged');
  f.context.controller.directoryRef.current = {}; f.context.settle(); assert.equal(await second, 'contextChanged');
});
test('Explore with no library needs a mounted workspace but no editor or font wait', async () => {
  const f = setup(); f.context.controller.directoryRef.current = null;
  await f.context.prepare(null, false); assert.deepEqual(f.navigation, []);
});
