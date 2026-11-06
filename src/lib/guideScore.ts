/** The ending plays once to its natural end, independently of the guide's visual exit. */
export class GuideScore {
  private hidden = false;
  private disposed = false;
  private serial = 0;
  private cue: { started: number } | null = null;
  private voice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private buffer: Promise<AudioBuffer> | null = null;
  private context: AudioContext;
  private load: () => Promise<AudioBuffer>;
  private now: () => number;

  constructor(context: AudioContext, load: () => Promise<AudioBuffer>, now = () => performance.now()) {
    this.context = context; this.load = load; this.now = now;
  }

  unlock() {
    if (!this.disposed && this.context.state !== 'running') void this.context.resume().catch(() => {});
  }

  play() {
    this.fade();
    this.cue = { started: this.now() };
    void this.start(++this.serial);
  }

  quiet() { this.cue = null; this.serial++; this.fade(); }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    // Returning from the background must not restart the ending.
    if (hidden) this.quiet();
  }

  private async start(serial: number) {
    if (this.disposed || this.hidden) return;
    const current = () => !this.disposed && !this.hidden && serial === this.serial;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Browsers can leave resume() pending until a gesture; it must not hold the UI or a stale cue.
      await Promise.race([this.context.resume(), new Promise<void>(resolve => { timer = setTimeout(resolve, 120); })]);
      if (!current()) return;
      if (this.context.state !== 'running') return;
      const cue = this.cue;
      if (!cue) return;
      this.buffer ??= this.load().catch(error => { this.buffer = null; throw error; });
      const buffer = await this.buffer;
      if (!current() || this.cue !== cue || this.context.state !== 'running') return;
      // Discard a stale load; once started, keep the complete recording, including its tail.
      if (this.now() - cue.started >= 4000 || buffer.duration <= 0.05) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = false;
      source.connect(gain); gain.connect(this.context.destination);
      const at = this.context.currentTime;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.5, at + Math.min(0.06, buffer.duration / 2));
      const voice = { source, gain };
      this.voice = voice;
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (this.voice === voice) this.voice = null;
      };
      source.start(at);
    } catch { /* Optional ending audio must never prevent entry into the workspace. */ }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }

  private fade() {
    const voice = this.voice;
    if (!voice) return;
    this.voice = null;
    const at = this.context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(at);
    voice.gain.gain.linearRampToValueAtTime(0, at + 0.16);
    try { voice.source.stop(at + 0.16); } catch { /* The cue may already have ended. */ }
  }

  dispose() {
    this.disposed = true;
    this.quiet();
    void this.context.close().catch(() => {});
  }
}
