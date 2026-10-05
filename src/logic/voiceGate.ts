import { VOICE } from '../config';

export type VoiceEvent = 'start' | 'end' | 'tooShort' | 'maxed';

export interface GateOptions {
  threshold: number;
  silenceSec: number;
  maxSec: number;
  minVoicedSec: number;
  /** сколько секунд звука подряд выше порога нужно, чтобы начать запись */
  attackSec: number;
}

export const defaultGateOptions = (): GateOptions => ({
  threshold: VOICE.defaultThreshold,
  silenceSec: VOICE.silenceSec,
  maxSec: VOICE.maxRecordSec,
  minVoicedSec: VOICE.minVoicedSec,
  attackSec: 0.05,
});

export function rmsOf(samples: ArrayLike<number>): number {
  let s = 0;
  const n = samples.length;
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    s += v * v;
  }
  return Math.sqrt(s / n);
}

/** Детектор речи по громкости: начало по порогу, конец после тишины, максимум по длительности. */
export class VoiceGate {
  state: 'idle' | 'recording' = 'idle';
  opts: GateOptions;
  private above = 0;
  private silence = 0;
  private voiced = 0;
  private rec = 0;

  constructor(opts: Partial<GateOptions> = {}) {
    this.opts = { ...defaultGateOptions(), ...opts };
  }

  setThreshold(t: number): void {
    this.opts.threshold = Math.max(0.001, t);
  }

  reset(): void {
    this.state = 'idle';
    this.above = this.silence = this.voiced = this.rec = 0;
  }

  get recordedSec(): number {
    return this.rec;
  }

  push(rms: number, dt: number): VoiceEvent | null {
    if (!(dt > 0) || !Number.isFinite(rms)) return null;
    const th = this.opts.threshold;
    if (this.state === 'idle') {
      if (rms >= th) {
        this.above += dt;
        if (this.above >= this.opts.attackSec) {
          this.state = 'recording';
          this.silence = 0;
          this.voiced = this.above;
          this.rec = this.above;
          return 'start';
        }
      } else this.above = 0;
      return null;
    }
    this.rec += dt;
    if (rms >= th * 0.6) {
      this.silence = 0;
      this.voiced += dt;
    } else this.silence += dt;
    if (this.rec >= this.opts.maxSec) {
      this.state = 'idle';
      this.above = 0;
      return 'maxed';
    }
    if (this.silence >= this.opts.silenceSec) {
      const ok = this.voiced >= this.opts.minVoicedSec;
      this.state = 'idle';
      this.above = 0;
      return ok ? 'end' : 'tooShort';
    }
    return null;
  }
}

export const THRESHOLDS: Record<1 | 2 | 3, number> = { 1: 0.08, 2: VOICE.defaultThreshold, 3: 0.02 };
