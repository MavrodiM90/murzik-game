// Все звуки синтезируются процедурно через Web Audio API. Никаких аудиофайлов.

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  f2?: number;
  t?: number;
  dur: number;
  gain?: number;
  attack?: number;
  release?: number;
  vibrato?: number; // Гц
  vibDepth?: number; // Гц
  filter?: { type: BiquadFilterType; freq: number; q?: number; freq1?: number };
  tremolo?: number; // Гц (амплитудная модуляция, 0..1 глубина = tremDepth)
  tremDepth?: number;
}

interface NoiseOpts {
  t?: number;
  dur: number;
  gain?: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number; freq1?: number };
  tremolo?: number;
  tremDepth?: number;
}

export type SfxName =
  | 'meow'
  | 'meowShort'
  | 'purr'
  | 'purrStop'
  | 'giggle'
  | 'laugh'
  | 'boom'
  | 'thud'
  | 'whoosh'
  | 'boing'
  | 'hop'
  | 'yum'
  | 'yuck'
  | 'fart'
  | 'coin'
  | 'pop'
  | 'sneeze'
  | 'huff'
  | 'sigh'
  | 'yawn'
  | 'snore'
  | 'grumble'
  | 'five'
  | 'wee'
  | 'dizzy'
  | 'cheer'
  | 'sparkle'
  | 'shake'
  | 'firework'
  | 'bubble'
  | 'splash'
  | 'boop'
  | 'tap'
  | 'chime'
  | 'fanfare'
  | 'click'
  | 'showerStart'
  | 'showerStop'
  | 'sleepyTick'
  | 'ding';

export class Synth {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.8;
  private hidden = false;
  private purrNodes: { stop: () => void } | null = null;
  private purrTimer = 0;
  private shower: { stop: () => void } | null = null;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!this.ctx) return;
      if (this.hidden) {
        this.stopLoops();
        void this.ctx.suspend().catch(() => undefined);
      } else void this.ctx.resume().catch(() => undefined);
    });
  }

  /** Вызывать из обработчика первого касания — iOS Safari разблокирует звук только так. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  /** Подключить внешний узел к общему выходу (с учётом громкости). */
  connectOut(node: AudioNode): void {
    if (this.master) node.connect(this.master);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  get ready(): boolean {
    return !!this.ctx && !!this.master && this.ctx.state === 'running' && !this.hidden;
  }

  private stopLoops(): void {
    this.purrNodes?.stop();
    this.purrNodes = null;
    this.shower?.stop();
    this.shower = null;
  }

  // ---------- кирпичики ----------
  private tone(o: ToneOpts): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.t ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) osc.frequency.linearRampToValueAtTime(o.f1, t0 + (o.f2 !== undefined ? o.dur * 0.5 : o.dur));
    if (o.f2 !== undefined) osc.frequency.linearRampToValueAtTime(o.f2, t0 + o.dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    const a = o.attack ?? 0.01;
    const rel = o.release ?? Math.min(0.12, o.dur * 0.5);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, Math.max(t0 + a, t0 + o.dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    const extras: AudioNode[] = [];
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.freq, t0);
      if (o.filter.freq1 !== undefined) f.frequency.linearRampToValueAtTime(o.filter.freq1, t0 + o.dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato;
      const lg = ctx.createGain();
      lg.gain.value = o.vibDepth ?? 10;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
      extras.push(lfo, lg);
    }
    let out: AudioNode = g;
    if (o.tremolo) {
      const tg = ctx.createGain();
      tg.gain.value = 1 - (o.tremDepth ?? 0.6) / 2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.tremolo;
      const lg = ctx.createGain();
      lg.gain.value = (o.tremDepth ?? 0.6) / 2;
      lfo.connect(lg);
      lg.connect(tg.gain);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
      g.connect(tg);
      out = tg;
      extras.push(lfo, lg, tg);
    }
    out.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
        extras.forEach((n) => n.disconnect());
      } catch {
        /* уже отключено */
      }
    };
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (o.t ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.freq, t0);
      if (o.filter.freq1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.freq1), t0 + o.dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    const extras: AudioNode[] = [];
    let out: AudioNode = g;
    if (o.tremolo) {
      const tg = ctx.createGain();
      tg.gain.value = 1 - (o.tremDepth ?? 0.7) / 2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.tremolo;
      const lg = ctx.createGain();
      lg.gain.value = (o.tremDepth ?? 0.7) / 2;
      lfo.connect(lg);
      lg.connect(tg.gain);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
      g.connect(tg);
      out = tg;
      extras.push(lfo, lg, tg);
    }
    out.connect(this.master!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
        extras.forEach((n) => n.disconnect());
      } catch {
        /* уже отключено */
      }
    };
  }

  /** «Голосовой» тон: пила через две форманты — похоже на мяуканье/хихиканье. */
  private voice(f0: number, f1: number, dur: number, t: number, gain: number, f2?: number, formA = 900, formB = 2300): void {
    this.tone({ type: 'sawtooth', f0, f1, f2, t, dur, gain: gain * 0.5, attack: 0.03, vibrato: 6, vibDepth: f0 * 0.02, filter: { type: 'bandpass', freq: formA, q: 3 } });
    this.tone({ type: 'sawtooth', f0, f1, f2, t, dur, gain: gain * 0.35, attack: 0.03, vibrato: 6, vibDepth: f0 * 0.02, filter: { type: 'bandpass', freq: formB, q: 4 } });
  }

  // ---------- публичный вход ----------
  play(name: SfxName | string, arg = 1): void {
    if (!this.ready) return;
    try {
      this.dispatch(name as SfxName, arg);
    } catch {
      /* звук никогда не должен ломать игру */
    }
  }

  private dispatch(name: SfxName, arg: number): void {
    const r = Math.random;
    switch (name) {
      case 'meow':
        this.voice(420, 780, 0.75, 0, 0.5, 480, 800 + r() * 100, 2200);
        break;
      case 'meowShort':
        this.voice(500, 820, 0.3, 0, 0.45, 600);
        break;
      case 'purr':
        this.startPurr();
        break;
      case 'purrStop':
        this.stopPurr();
        break;
      case 'giggle':
        for (let i = 0; i < 6; i++) this.voice(620 + r() * 120 + i * 18, 900 + r() * 100, 0.085, i * 0.1, 0.4, 700, 1000, 2600);
        break;
      case 'laugh':
        for (let i = 0; i < 13; i++) this.voice(560 + r() * 160 + (i % 3) * 40, 880 + r() * 120, 0.09, i * 0.11, 0.42, 640, 1000, 2600);
        break;
      case 'boom':
        this.noise({ dur: 0.4, gain: 0.5 * arg + 0.1, filter: { type: 'lowpass', freq: 900, freq1: 80, q: 0.8 } });
        this.tone({ f0: 150, f1: 42, dur: 0.38, gain: 0.7 * arg + 0.15, release: 0.2 });
        break;
      case 'thud':
        this.noise({ dur: 0.18, gain: 0.35 * arg + 0.08, filter: { type: 'lowpass', freq: 500, freq1: 90 } });
        this.tone({ f0: 110, f1: 55, dur: 0.15, gain: 0.4 * arg + 0.1 });
        break;
      case 'whoosh':
        this.noise({ dur: 0.45, gain: 0.25 * arg + 0.05, attack: 0.1, filter: { type: 'bandpass', freq: 400, freq1: 1800, q: 1.2 } });
        break;
      case 'boing':
        this.tone({ type: 'triangle', f0: 180, f1: 560, f2: 240, dur: 0.38, gain: 0.35, vibrato: 18, vibDepth: 25 });
        break;
      case 'hop':
        this.tone({ type: 'triangle', f0: 260, f1: 520, dur: 0.12, gain: 0.25 });
        break;
      case 'yum':
        for (let k = 0; k < 4; k++) {
          this.tone({ type: 'sine', f0: 200, f1: 330, f2: 220, t: k * 0.2, dur: 0.15, gain: 0.35, filter: { type: 'lowpass', freq: 700, freq1: 300 } });
        }
        break;
      case 'yuck':
        this.tone({ type: 'sawtooth', f0: 230, f1: 150, f2: 190, dur: 0.6, gain: 0.25, vibrato: 14, vibDepth: 25, filter: { type: 'lowpass', freq: 900 } });
        this.noise({ dur: 0.3, gain: 0.08, filter: { type: 'bandpass', freq: 1500, q: 1 } });
        break;
      case 'fart':
        this.tone({ type: 'sawtooth', f0: 95, f1: 55, f2: 70, dur: 0.6, gain: 0.5, vibrato: 29, vibDepth: 22, tremolo: 34, tremDepth: 0.8, filter: { type: 'lowpass', freq: 420 } });
        this.noise({ dur: 0.5, gain: 0.12, tremolo: 40, filter: { type: 'lowpass', freq: 600 } });
        break;
      case 'coin':
        this.tone({ type: 'square', f0: 988, dur: 0.07, gain: 0.14, release: 0.02 });
        this.tone({ type: 'square', f0: 1319, t: 0.07, dur: 0.28, gain: 0.14, release: 0.2 });
        break;
      case 'pop':
        this.noise({ dur: 0.1, gain: 0.45, attack: 0.001, filter: { type: 'highpass', freq: 1500 } });
        this.tone({ f0: 500 + r() * 300, f1: 120, dur: 0.08, gain: 0.3, release: 0.05 });
        break;
      case 'sneeze':
        this.tone({ type: 'triangle', f0: 420, f1: 640, dur: 0.28, gain: 0.3, filter: { type: 'bandpass', freq: 900, q: 2 } });
        this.tone({ type: 'triangle', f0: 480, f1: 760, t: 0.34, dur: 0.3, gain: 0.34, filter: { type: 'bandpass', freq: 1000, q: 2 } });
        this.noise({ t: 0.8, dur: 0.3, gain: 0.55, attack: 0.01, filter: { type: 'bandpass', freq: 2800, freq1: 900, q: 0.9 } });
        this.tone({ type: 'sawtooth', f0: 520, f1: 240, t: 0.8, dur: 0.22, gain: 0.3, filter: { type: 'bandpass', freq: 1200, q: 2 } });
        break;
      case 'huff':
        this.noise({ dur: 0.3, gain: 0.35, attack: 0.04, filter: { type: 'lowpass', freq: 1400, freq1: 300 } });
        this.tone({ type: 'sawtooth', f0: 150, f1: 90, t: 0.1, dur: 0.22, gain: 0.2, filter: { type: 'lowpass', freq: 500 } });
        break;
      case 'sigh':
        this.noise({ dur: 1.1, gain: 0.18, attack: 0.35, filter: { type: 'lowpass', freq: 800, freq1: 250 } });
        break;
      case 'yawn':
        this.voice(540, 430, 1.5, 0, 0.35, 280, 700, 1500);
        break;
      case 'snore':
        this.noise({ dur: 0.7, gain: 0.12, attack: 0.3, filter: { type: 'lowpass', freq: 260, freq1: 120 } });
        this.tone({ type: 'sawtooth', f0: 72, f1: 55, dur: 0.6, gain: 0.08, filter: { type: 'lowpass', freq: 200 } });
        break;
      case 'grumble':
        this.tone({ type: 'sawtooth', f0: 160, f1: 110, f2: 130, dur: 0.6, gain: 0.3, tremolo: 22, tremDepth: 0.5, filter: { type: 'lowpass', freq: 600 } });
        break;
      case 'five':
        this.noise({ dur: 0.1, gain: 0.5, attack: 0.001, filter: { type: 'bandpass', freq: 2000, q: 0.8 } });
        this.tone({ f0: 420, f1: 180, dur: 0.1, gain: 0.35 });
        break;
      case 'wee':
        this.tone({ type: 'triangle', f0: 420, f1: 820, dur: 0.22, gain: 0.12 * arg + 0.04 });
        break;
      case 'dizzy':
        for (let i = 0; i < 5; i++) this.tone({ type: 'sine', f0: 880, f1: 520, t: i * 0.17, dur: 0.15, gain: 0.14, vibrato: 12, vibDepth: 40 });
        break;
      case 'cheer':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', f0: f, t: i * 0.07, dur: 0.22, gain: 0.2 }));
        break;
      case 'sparkle':
        [1568, 1976, 2349, 2637].forEach((f, i) => this.tone({ f0: f, t: i * 0.06, dur: 0.25, gain: 0.12, release: 0.2 }));
        break;
      case 'shake':
        this.noise({ dur: 0.9, gain: 0.3, attack: 0.02, tremolo: 18, tremDepth: 0.95, filter: { type: 'bandpass', freq: 1800, q: 0.6 } });
        break;
      case 'firework':
        this.tone({ f0: 500, f1: 1800, dur: 0.3, gain: 0.1, release: 0.05 });
        this.noise({ t: 0.3, dur: 0.5, gain: 0.35, attack: 0.002, filter: { type: 'highpass', freq: 900, freq1: 3000 } });
        this.tone({ f0: 90, f1: 40, t: 0.3, dur: 0.3, gain: 0.35 });
        break;
      case 'bubble':
        this.tone({ f0: 300 + r() * 200, f1: 900, dur: 0.09, gain: 0.18, release: 0.06 });
        break;
      case 'splash':
        this.noise({ dur: 0.25, gain: 0.3, filter: { type: 'bandpass', freq: 2500, freq1: 800, q: 0.7 } });
        this.tone({ f0: 500, f1: 220, dur: 0.12, gain: 0.2 });
        break;
      case 'boop':
        this.tone({ type: 'triangle', f0: 260, f1: 200, dur: 0.18, gain: 0.22 });
        break;
      case 'tap':
        this.tone({ f0: 700, f1: 520, dur: 0.05, gain: 0.12, release: 0.03 });
        break;
      case 'click':
        this.tone({ type: 'triangle', f0: 900, f1: 600, dur: 0.04, gain: 0.1, release: 0.02 });
        break;
      case 'chime':
        [659, 784, 1047].forEach((f, i) => this.tone({ f0: f, t: i * 0.09, dur: 0.35, gain: 0.16, release: 0.3 }));
        break;
      case 'fanfare':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, t: i * 0.1, dur: 0.4, gain: 0.2, release: 0.3 }));
        this.tone({ type: 'triangle', f0: 1568, t: 0.6, dur: 0.8, gain: 0.2, release: 0.6 });
        break;
      case 'sleepyTick':
        this.tone({ f0: 330, f1: 250, dur: 0.3, gain: 0.07, release: 0.25 });
        break;
      case 'ding':
        this.tone({ f0: 1200, dur: 0.4, gain: 0.15, release: 0.35 });
        break;
      case 'showerStart':
        this.startShower();
        break;
      case 'showerStop':
        this.stopShower();
        break;
    }
  }

  // ---------- петли ----------
  private startPurr(): void {
    if (!this.ctx || !this.master) return;
    clearTimeout(this.purrTimer);
    // страховка: мурчание само стихнет, если «стоп» не придёт
    this.purrTimer = window.setTimeout(() => this.stopPurr(), 5000);
    if (this.purrNodes) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 48;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    const g = ctx.createGain();
    g.gain.value = 0;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 24;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(am.gain);
    osc.connect(lp);
    lp.connect(am);
    am.connect(g);
    g.connect(this.master);
    osc.start();
    lfo.start();
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.25);
    this.purrNodes = {
      stop: () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.stop(t + 0.35);
        lfo.stop(t + 0.35);
        osc.onended = () => {
          try {
            [osc, lfo, lp, g, am, lg].forEach((n) => n.disconnect());
          } catch {
            /* ок */
          }
        };
      },
    };
  }
  private stopPurr(): void {
    clearTimeout(this.purrTimer);
    this.purrNodes?.stop();
    this.purrNodes = null;
  }

  private startShower(): void {
    if (!this.ctx || !this.master || this.shower) return;
    const ctx = this.ctx;
    const buf = this.noiseBuf ?? ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    if (!this.noiseBuf) {
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.2);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
    this.shower = {
      stop: () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.2);
        src.stop(t + 0.25);
        src.onended = () => {
          try {
            [src, bp, g].forEach((n) => n.disconnect());
          } catch {
            /* ок */
          }
        };
      },
    };
  }
  private stopShower(): void {
    this.shower?.stop();
    this.shower = null;
  }
}
