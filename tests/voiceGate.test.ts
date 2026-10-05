import { describe, expect, it } from 'vitest';
import { VOICE } from '../src/config';
import { THRESHOLDS, VoiceGate, rmsOf } from '../src/logic/voiceGate';

const DT = 0.04;
function run(gate: VoiceGate, pattern: { rms: number; sec: number }[]): string[] {
  const out: string[] = [];
  for (const p of pattern) {
    for (let t = 0; t < p.sec - 1e-9; t += DT) {
      const e = gate.push(p.rms, DT);
      if (e) out.push(e);
    }
  }
  return out;
}

describe('детектор речи по громкости', () => {
  it('тишина ничего не запускает', () => {
    expect(run(new VoiceGate(), [{ rms: 0.001, sec: 10 }])).toEqual([]);
  });

  it('фраза: старт по порогу, конец после 0.8 с тишины', () => {
    const g = new VoiceGate();
    const ev: string[] = [];
    for (let t = 0; t < 1; t += DT) {
      const e = g.push(0.2, DT);
      if (e) ev.push(e);
    }
    expect(ev).toEqual(['start']);
    let silent = 0;
    let end: string | null = null;
    while (!end && silent < 3) {
      end = g.push(0.001, DT);
      silent += DT;
    }
    expect(end).toBe('end');
    expect(silent).toBeGreaterThanOrEqual(VOICE.silenceSec - DT);
    expect(silent).toBeLessThan(VOICE.silenceSec + 2 * DT);
  });

  it('короткая пауза внутри фразы (меньше 0.8 с) не обрывает запись', () => {
    const g = new VoiceGate();
    const ev = run(g, [
      { rms: 0.2, sec: 0.5 },
      { rms: 0.001, sec: 0.6 },
      { rms: 0.2, sec: 0.5 },
      { rms: 0.001, sec: 1.2 },
    ]);
    expect(ev).toEqual(['start', 'end']);
  });

  it('запись ограничена 5 секундами', () => {
    const g = new VoiceGate();
    const ev = run(g, [{ rms: 0.3, sec: 9 }]);
    expect(ev[0]).toBe('start');
    expect(ev[1]).toBe('maxed');
    expect(g.recordedSec).toBeLessThanOrEqual(VOICE.maxRecordSec + DT);
  });

  it('короткий щелчок отбрасывается', () => {
    const g = new VoiceGate({ attackSec: 0.04, minVoicedSec: 0.3 });
    const ev = run(g, [
      { rms: 0.3, sec: 0.04 },
      { rms: 0.001, sec: 2 },
    ]);
    expect(ev).toEqual(['start', 'tooShort']);
  });

  it('порог настраивается: тихий голос проходит только при высокой чувствительности', () => {
    const quiet = 0.03;
    expect(run(new VoiceGate({ threshold: THRESHOLDS[1] }), [{ rms: quiet, sec: 1 }])).toEqual([]);
    expect(run(new VoiceGate({ threshold: THRESHOLDS[3] }), [{ rms: quiet, sec: 1 }])[0]).toBe('start');
    const g = new VoiceGate({ threshold: 0.5 });
    g.setThreshold(0.01);
    expect(run(g, [{ rms: 0.05, sec: 0.5 }])[0]).toBe('start');
  });

  it('rmsOf считает громкость; мусорные значения игнорируются', () => {
    expect(rmsOf([0, 0, 0])).toBe(0);
    expect(rmsOf([1, -1, 1, -1])).toBeCloseTo(1);
    expect(rmsOf([])).toBe(0);
    const g = new VoiceGate();
    expect(g.push(Number.NaN, DT)).toBeNull();
    expect(g.push(0.5, -1)).toBeNull();
  });
});
