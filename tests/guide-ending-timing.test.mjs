import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { GUIDE_OUTRO, guideOutroDuration, guideOutroState } from '../src/lib/entryGuide.ts';
const source = await fs.readFile(new URL('../src/components/onboarding/EntryGuide.tsx', import.meta.url), 'utf8');
const guard = source.indexOf('    if (outroStartedAt === null || !departing) return;');
const start = source.lastIndexOf('  useEffect(() => {', guard), end = source.indexOf('\n\n  useEffect(', guard);
const effect = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function clock(reduced = false) {
  let now = 0, serial = 0, cleanup;
  const timers = new Map(), events = [];
  class ClockDate extends Date { static now() { return now; } }
  vm.runInNewContext(effect, { GUIDE_OUTRO, guideOutroDuration, Date: ClockDate, outroStartedAt: 0, departing: true, motionReduced: reduced,
    onArrivalRef: { current: () => events.push(['arrival', now]) }, deliver: () => events.push(['finished', now]),
    window: { setTimeout: (fn, delay) => { timers.set(++serial, { fn, at: now + delay }); return serial; }, clearTimeout: id => timers.delete(id) },
    useEffect: fn => { cleanup = fn(); },
  });
  const advance = target => { for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (timer.at <= target) { timers.delete(id); now = timer.at; timer.fn(); } now = target; };
  return { events, advance, cancel: () => cleanup() };
}
test('actual welcome effect holds1800ms then finishes at2500ms, with the original skeleton activated at fade start', () => {
  const c = clock(); c.advance(1799); assert.deepEqual(c.events, []);
  c.advance(1800); assert.deepEqual(c.events, [['arrival', 1800]]);
  c.advance(2499); assert.equal(c.events.length, 1);
  c.advance(2500); assert.deepEqual(c.events, [['arrival', 1800], ['finished', 2500]]);
  assert.equal(guideOutroDuration(false, GUIDE_OUTRO.welcomeHold), 2500);
});
test('preload completion retains its independent3000ms hold and3700ms total', () => {
  assert.equal(GUIDE_OUTRO.hold, 3000); assert.equal(guideOutroDuration(false), 3700);
  assert.equal(guideOutroState({ startedAt: 0, reduced: false }, 2500).closing, false);
  assert.equal(guideOutroState({ startedAt: 0, reduced: false }, 3000).closing, true);
});
test('reduced motion keeps1800ms reading and150ms fade; cancelling the actual effect discards pending callbacks', () => {
  const c = clock(true); c.advance(1800); assert.deepEqual(c.events, [['arrival', 1800]]);
  c.advance(1949); assert.equal(c.events.length, 1); c.advance(1950); assert.deepEqual(c.events.at(-1), ['finished', 1950]);
  const cancelled = clock(); cancelled.advance(500); cancelled.cancel(); cancelled.advance(5000); assert.deepEqual(cancelled.events, []);
});
