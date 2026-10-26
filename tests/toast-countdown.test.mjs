import test from 'node:test';
import assert from 'node:assert/strict';
import { createToastCountdown } from '../src/lib/toastCountdown.ts';

function clock(duration, remainingMs = duration) {
  let now = 0, next = 0; const timers = new Map();
  const value = createToastCountdown(duration, { remainingMs, now: () => now, schedule(callback, delay) { const id = ++next; timers.set(id, { at: now + delay, callback }); return id; }, cancel(id) { timers.delete(id); } });
  return { value, timers, advance(ms) { const end = now + ms; for (;;) { const first = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!first) break; now = first[1].at; timers.delete(first[0]); first[1].callback(); } now = end; } };
}

test('queued clocks do not run; independent reading owners pause one remaining duration and completion fires once', () => {
  const f = clock(10000), hover = Symbol(), details = Symbol(); let elapsed = 0;
  f.value.onElapsed(() => elapsed++); f.advance(20000); assert.equal(f.value.snapshot().remainingMs, 10000);
  f.value.start(); f.advance(2500); f.value.hold(hover, true); f.value.hold(details, true);
  assert.equal(f.value.snapshot().remainingMs, 7500); f.advance(30000); f.value.hold(hover, false);
  f.advance(30000); assert.equal(elapsed, 0); f.value.hold(details, false); f.advance(7499); assert.equal(elapsed, 0);
  f.advance(1); assert.equal(elapsed, 1); assert.equal(f.value.snapshot().elapsed, true);
  f.value.start(); f.value.hold(details, false); f.advance(60000); assert.equal(elapsed, 1);
});

test('a persisted undo window resumes its remaining time; disposing a view clock never commits deletion', () => {
  const f = clock(30000, 12000); let expired = 0; const seen = [];
  f.value.subscribe(s => seen.push(s)); f.value.onElapsed(() => expired++); f.value.start(); f.advance(2000);
  f.value.hold('persist', true); assert.equal(seen.at(-1).remainingMs, 10000);
  f.value.dispose(); f.advance(60000); assert.equal(expired, 0); assert.equal(f.timers.size, 0);
  const reopened = clock(30000, seen.at(-1).remainingMs); reopened.value.onElapsed(() => expired++); reopened.value.start();
  reopened.advance(9999); assert.equal(expired, 0); reopened.advance(1); assert.equal(expired, 1);
});

test('invalid durations are rejected and an elapsed persisted record completes only after explicitly starting', () => {
  for (const value of [0, -1, NaN, Infinity]) assert.throws(() => createToastCountdown(value));
  assert.throws(() => createToastCountdown(10, { remainingMs: 11 }));
  const f = clock(30000, 0); let elapsed = false; f.value.onElapsed(() => { elapsed = true; });
  f.advance(1); assert.equal(elapsed, false); f.value.start(); f.advance(0); assert.equal(elapsed, true);
});
