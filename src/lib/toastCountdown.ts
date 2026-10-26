export type ToastCountdownSnapshot = { durationMs: number; remainingMs: number; running: boolean; elapsed: boolean };
export type ToastCountdown = {
  snapshot: () => ToastCountdownSnapshot;
  start: () => void;
  hold: (owner: unknown, paused: boolean) => void;
  subscribe: (listener: (snapshot: ToastCountdownSnapshot) => void) => () => void;
  onElapsed: (listener: () => void) => () => void;
  dispose: () => void;
};

/** One clock drives the visual ring and an operation's independently retained undo window. */
export function createToastCountdown(durationMs: number, options: {
  remainingMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
} = {}): ToastCountdown {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('Countdown duration must be positive');
  const initial = options.remainingMs ?? durationMs;
  if (!Number.isFinite(initial) || initial < 0 || initial > durationMs) throw new RangeError('Invalid remaining countdown time');
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback: () => void, delay: number) => typeof window === 'undefined' ? globalThis.setTimeout(callback, delay) : window.setTimeout(callback, delay));
  const cancel = options.cancel ?? ((timer: unknown) => { if (typeof window === 'undefined') globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>); else window.clearTimeout(timer as number); });
  let remaining = initial, startedAt: number | null = null, timer: unknown = null, started = false, elapsed = false, disposed = false;
  const holds = new Set<unknown>(), listeners = new Set<(snapshot: ToastCountdownSnapshot) => void>(), completions = new Set<() => void>();
  const snapshot = (): ToastCountdownSnapshot => ({ durationMs, remainingMs: Math.max(0, remaining - (startedAt === null ? 0 : Math.max(0, now() - startedAt))), running: startedAt !== null, elapsed });
  const emit = () => { const value = snapshot(); for (const listener of [...listeners]) listener(value); };
  const stop = () => {
    remaining = snapshot().remainingMs;
    if (timer !== null) cancel(timer);
    timer = null; startedAt = null;
  };
  const run = () => {
    if (disposed || elapsed || !started || holds.size || startedAt !== null) return;
    startedAt = now();
    timer = schedule(() => {
      timer = null; startedAt = null; remaining = 0; elapsed = true;
      emit();
      for (const listener of [...completions]) listener();
    }, remaining);
  };
  return {
    snapshot,
    start() { if (disposed || started) return; started = true; run(); emit(); },
    hold(owner, paused) {
      if (disposed || elapsed || holds.has(owner) === paused) return;
      stop(); if (paused) holds.add(owner); else holds.delete(owner);
      run(); emit();
    },
    subscribe(listener) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    onElapsed(listener) { if (!disposed) completions.add(listener); return () => { completions.delete(listener); }; },
    dispose() { if (disposed) return; stop(); disposed = true; listeners.clear(); completions.clear(); holds.clear(); },
  };
}
