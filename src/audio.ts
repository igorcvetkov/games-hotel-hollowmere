// All sound is synthesized with Web Audio, so no audio files are needed.
export class Sound {
  ctx!: AudioContext;
  master!: GainNode;
  noise!: AudioBuffer;
  private droneGain!: GainNode;
  private beatT = 0;

  start() {
    // Safari on older iOS only has the prefixed constructor; if audio is unavailable the game still runs, silently.
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try { this.build(new AC()); } catch (err) { console.warn("Audio disabled:", err); this.ctx = undefined as unknown as AudioContext; }
  }

  // iOS keeps the context suspended until it is resumed from a user gesture
  resume() { if (this.ctx && this.ctx.state !== "running") void this.ctx.resume(); }

  private build(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.12;
    this.droneGain.connect(this.master);
    for (const f of [41, 43.2, 61.7]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 160;
      o.connect(lp).connect(this.droneGain);
      o.start();
    }
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 400;
    bp.Q.value = 0.8;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg).connect(wg.gain);
    lfo.start();
    wind.connect(bp).connect(wg).connect(this.master);
    wind.start();
  }

  private burst(freq: number, q: number, dur: number, vol: number, type: BiquadFilterType = "bandpass") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  bell(vol: number) {
    if (vol <= 0.02 || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, v] of [[880, 1], [1318, 0.6], [2217, 0.35], [3520, 0.2]]) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * (1 + Math.random() * 0.01);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * v * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 1.2);
    }
  }
  flash() { this.tone(2400, 0.5, 0.3, "sine", 300); this.burst(4000, 0.5, 0.4, 0.5, "highpass"); }
  squeak() { this.tone(900, 0.12, 0.15, "sine", 1700); setTimeout(() => this.ctx && this.tone(1300, 0.1, 0.12, "sine", 1900), 110); }
  zap() { this.tone(1800, 0.35, 0.3, "sawtooth", 120); this.burst(5000, 0.4, 0.35, 0.5, "highpass"); }
  crackle(vol: number) { if (vol > 0.02) for (let i = 0; i < 3; i++) setTimeout(() => this.ctx && this.burst(3000 + Math.random() * 3000, 2, 0.04, 0.25 * vol, "bandpass"), i * 50 + Math.random() * 40); }
  questDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.ctx && this.tone(f, 0.35, 0.18, "triangle"), i * 110)); }
  // off-key hummed tune that wobbles; vol 0..1 by distance
  hum(vol: number, n: number) {
    if (vol <= 0.02 || !this.ctx) return;
    const tune = [220, 247, 196, 233, 208, 262, 185, 220];
    const f = tune[n % tune.length] * 0.5;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    o.type = "triangle"; o2.type = "sine";
    o.frequency.value = f; o2.frequency.value = f * 1.02;
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    lfo.frequency.value = 6; lg.gain.value = f * 0.03;
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.master);
    for (const n of [o, o2, lfo]) { n.start(t); n.stop(t + 0.6); }
  }
  hummanRise() { this.tone(60, 2, 0.5, "sawtooth", 140); this.burst(150, 0.6, 2, 0.4, "lowpass"); }
  musicBox() {
    const notes = [784, 659, 523, 659, 880, 784, 659, 587];
    notes.forEach((freq, index) => {
      setTimeout(() => {
        if (this.ctx) this.tone(freq, 0.62, 0.045, "sine");
      }, index * 260);
    });
  }
  houseCreak() {
    this.tone(145, 1.8, 0.11, "sawtooth", 72);
    this.burst(420, 0.8, 1.5, 0.06, "lowpass");
  }
  ghostWhisper() {
    this.tone(470, 0.9, 0.045, "sine", 310);
    this.burst(1250, 1.5, 0.75, 0.045, "bandpass");
  }
  thump(vol: number) { if (vol > 0.02) { this.tone(80, 0.3, 0.7 * vol, "sine", 35); this.burst(200, 1, 0.2, 0.4 * vol, "lowpass"); } }
  boing(vol: number) { if (vol > 0.02) this.tone(200, 0.4, 0.3 * vol, "sine", 700); }
  step(run: boolean) { this.burst(run ? 260 : 180, 1.2, run ? 0.12 : 0.18, run ? 0.5 : 0.25, "lowpass"); }
  pickup() { this.tone(660, 0.25, 0.15, "triangle"); this.tone(990, 0.3, 0.1, "triangle"); }
  click() { this.burst(2500, 3, 0.04, 0.3); }
  door() { this.tone(70, 0.7, 0.4, "sawtooth", 40); this.burst(300, 1, 0.6, 0.3); }
  power() { this.tone(50, 1.5, 0.5, "square", 120); this.burst(120, 0.5, 1.5, 0.4, "lowpass"); }
  error() { this.tone(120, 0.3, 0.25, "square"); }
  growl() { this.tone(90, 1.1, 0.4, "sawtooth", 45); this.burst(200, 2, 1, 0.25); }
  sting() { this.tone(880, 1.4, 0.4, "sawtooth", 700); this.tone(932, 1.4, 0.4, "sawtooth", 740); this.burst(3000, 0.5, 1.2, 0.5, "highpass"); }

  // intensity 0..1 is how close the monster is
  heartbeat(dt: number, intensity: number) {
    if (!this.ctx) return;
    this.droneGain.gain.value = 0.12 + intensity * 0.15;
    if (intensity < 0.05) return;
    this.beatT -= dt;
    if (this.beatT <= 0) {
      this.beatT = 1.1 - intensity * 0.6;
      this.tone(55, 0.15, 0.7 * intensity + 0.1, "sine", 35);
      setTimeout(() => this.ctx && this.tone(50, 0.15, 0.5 * intensity, "sine", 32), 160);
    }
  }
}
