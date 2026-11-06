import test from 'node:test';
import assert from 'node:assert/strict';
import { GuideScore } from '../src/lib/guideScore.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(load = async () => ({ duration: 6.191 })) {
  const sources = [], loaded = [], envelopes = []; let now = 0;
  const context = { state: 'running', currentTime: 10, destination: {}, closed: false, resumes: 0,
    resume: async () => { context.resumes++; }, close: async () => { context.closed = true; },
    createGain: () => { const trace = []; envelopes.push(trace); return { gain: { setValueAtTime: (...args) => trace.push(['set', ...args]), linearRampToValueAtTime: (...args) => trace.push(['ramp', ...args]), cancelAndHoldAtTime: (...args) => trace.push(['hold', ...args]) }, connect() {}, disconnect() {} }; },
    createBufferSource: () => { const source = { loop: true, connect() {}, disconnect() {}, start(...args) { this.started = args; }, stop(at) { this.stopped = at; } }; sources.push(source); return source; },
  };
  const score = new GuideScore(context, () => { loaded.push('outro'); return load(); }, () => now);
  return { score, sources, loaded, envelopes, context, time: value => { now = value; } };
}

test('gesture unlock is silent and does not fetch or start the ending', async () => {
  const f = fixture(); f.context.state = 'suspended'; f.score.unlock(); await tick();
  assert.equal(f.context.resumes, 1); assert.equal(f.sources.length, 0); assert.equal(f.loaded.length, 0); f.score.dispose();
});

test('the complete recording plays once at half gain without a duration cap or ending fade', async () => {
  const f = fixture(); f.score.play(); await tick();
  assert.equal(f.sources[0].buffer.duration, 6.191); assert.equal(f.sources[0].loop, false);
  assert.deepEqual(f.sources[0].started, [10]); assert.equal(f.sources[0].stopped, undefined);
  assert.deepEqual(f.envelopes[0], [['set', 0, 10], ['ramp', 0.5, 10.06]]);
  f.time(5000); assert.equal(f.sources[0].stopped, undefined, 'workspace entry must not cap an already playing ending');
  f.score.quiet();
  assert.deepEqual(f.envelopes[0].slice(-2), [['hold', 10], ['ramp', 0, 10.16]]);
  assert.equal(f.sources[0].stopped, 10.16); f.score.dispose();
});

test('a late decode within the start window still plays the full file from its beginning', async () => {
  let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
  f.score.play(); await tick(); f.time(1400); resolve({ duration: 6.191 }); await tick();
  assert.deepEqual(f.sources[0].started, [10]); f.score.dispose();
});

test('cancelling a pending load cannot produce a late voice or replay when unlocked', async () => {
  let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
  f.score.play(); await tick(); f.score.quiet(); resolve({ duration: 6.191 }); await tick(); f.score.unlock();
  assert.equal(f.sources.length, 0); f.score.dispose();
});

test('a stale load cannot unexpectedly start music long after the exit', async () => {
  let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
  f.score.play(); await tick(); f.time(4100); resolve({ duration: 6.191 }); await tick();
  assert.equal(f.sources.length, 0); f.score.dispose();
});

test('blocked autoplay is bounded and a later gesture never replays a cancelled ending', async () => {
  const f = fixture(); f.context.state = 'suspended'; f.context.resume = () => new Promise(() => {});
  f.score.play(); await new Promise(resolve => setTimeout(resolve, 145));
  assert.equal(f.sources.length, 0); assert.equal(f.loaded.length, 0);
  f.score.quiet(); f.context.state = 'running'; f.context.resume = async () => {}; f.score.unlock(); await tick();
  assert.equal(f.sources.length, 0); f.score.dispose();
});

test('backgrounding stops the tail with the existing fade and returning does not replay it', async () => {
  const f = fixture(); f.score.play(); await tick();
  f.score.setHidden(true); assert.equal(f.sources[0].stopped, 10.16);
  f.score.setHidden(false); f.score.unlock(); await tick(); assert.equal(f.sources.length, 1); f.score.dispose();
});

test('a failed load stays nonblocking and is not retained for a later ending', async () => {
  let fail = true; const f = fixture(async () => { if (fail) { fail = false; throw new Error('missing'); } return { duration: 6.191 }; });
  f.score.play(); await tick(); assert.equal(f.sources.length, 0);
  f.score.play(); await tick(); assert.equal(f.loaded.length, 2); assert.equal(f.sources.length, 1); f.score.dispose();
});

test('disposing while a decode is pending closes the context without a late voice', async () => {
  let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
  f.score.play(); await tick(); f.score.dispose(); resolve({ duration: 6.191 }); await tick();
  assert.equal(f.context.closed, true); assert.equal(f.sources.length, 0);
});
