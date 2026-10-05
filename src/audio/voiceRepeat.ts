import { VOICE } from '../config';
import { rmsOf, THRESHOLDS, VoiceGate } from '../logic/voiceGate';
import type { Game } from '../game';

export type VoiceState = 'off' | 'listening' | 'recording' | 'speaking' | 'denied' | 'unsupported';

const CHUNK = 2048;

/**
 * Повтор голоса: слушаем микрофон, по громкости ловим фразу (до 0.8 с тишины в конце, максимум 5 с),
 * затем кот повторяет её писклявым голосом (playbackRate ≈ 1.6). Запись живёт только в памяти,
 * никуда не отправляется и стирается сразу после воспроизведения.
 */
export class VoiceRepeater {
  state: VoiceState = 'off';
  onState: ((s: VoiceState) => void) | null = null;
  /** для тестов: сколько фраз повторено */
  repeats = 0;
  private stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private proc: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private gate = new VoiceGate();
  private ring: Float32Array[] = [];
  private rec: Float32Array[] = [];
  private lastVoicedIdx = 0;
  private cooldown = 0;
  private analyser: AnalyserNode | null = null;
  private analyserBuf = new Float32Array(512);
  private playing: AudioBufferSourceNode | null = null;
  private asking = false;

  constructor(private game: Game) {
    game.onUpdate.push((dt) => this.update(dt));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.disable();
    });
  }

  private set(s: VoiceState): void {
    if (this.state === s) return;
    this.state = s;
    this.onState?.(s);
  }

  get active(): boolean {
    return this.state === 'listening' || this.state === 'recording' || this.state === 'speaking';
  }

  toggle(): void {
    if (this.active || this.asking) this.disable();
    else void this.enable();
  }

  /** Разрешение на микрофон запрашивается только здесь — при первом нажатии на «ушко». */
  async enable(): Promise<boolean> {
    if (this.active || this.asking) return this.active;
    const g = this.game;
    g.synth.unlock();
    const ctx = g.synth.ctx;
    const md = navigator.mediaDevices;
    if (!ctx || !md || typeof md.getUserMedia !== 'function') {
      this.fail('unsupported');
      return false;
    }
    this.asking = true;
    try {
      this.stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.asking = false;
      this.fail('denied');
      return false;
    }
    this.asking = false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      this.src = ctx.createMediaStreamSource(this.stream);
      this.proc = ctx.createScriptProcessor(CHUNK, 1, 1);
      this.mute = ctx.createGain();
      this.mute.gain.value = 0; // микрофон никогда не звучит в динамик
      this.src.connect(this.proc);
      this.proc.connect(this.mute);
      this.mute.connect(ctx.destination);
      this.proc.onaudioprocess = (e) => this.onChunk(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    } catch {
      this.disable();
      this.fail('unsupported');
      return false;
    }
    this.gate.reset();
    this.gate.setThreshold(THRESHOLDS[g.save.settings.micSensitivity]);
    this.ring = [];
    this.rec = [];
    this.cooldown = 0.4;
    this.set('listening');
    g.cat.play('listen');
    return true;
  }

  /** Нет доступа к микрофону — кот просто мяукает, игра не ломается. */
  private fail(kind: 'denied' | 'unsupported'): void {
    this.releaseStream();
    this.set(kind);
    const cat = this.game.cat;
    if (cat.mode === 'stand') cat.play('meow', { force: true });
    // через секунду кнопка возвращается в обычное состояние
    window.setTimeout(() => {
      if (this.state === kind) this.set('off');
    }, 1200);
  }

  disable(): void {
    if (this.state === 'off' && !this.stream) return;
    this.playing?.stop();
    this.playing = null;
    this.wipe();
    this.releaseStream();
    if (this.game.cat.actionName === 'listen' || this.game.cat.actionName === 'speak') this.game.cat.endAction();
    this.game.cat.mouthDrive = 0;
    if (this.state !== 'denied' && this.state !== 'unsupported') this.set('off');
  }

  private releaseStream(): void {
    if (this.proc) this.proc.onaudioprocess = null;
    try {
      this.src?.disconnect();
      this.proc?.disconnect();
      this.mute?.disconnect();
    } catch {
      /* уже отключено */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = this.src = this.proc = this.mute = null;
    this.gate.reset();
  }

  private wipe(): void {
    for (const c of this.ring) c.fill(0);
    for (const c of this.rec) c.fill(0);
    this.ring = [];
    this.rec = [];
  }

  private onChunk(data: Float32Array, sampleRate: number): void {
    const dt = data.length / sampleRate;
    if (this.state === 'speaking' || this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      return;
    }
    const rms = rmsOf(data);
    const copy = new Float32Array(data);
    const evt = this.gate.push(rms, dt);
    if (this.gate.state === 'idle' && !evt) {
      const keep = Math.max(1, Math.ceil((VOICE.preRollSec * sampleRate) / CHUNK));
      this.ring.push(copy);
      while (this.ring.length > keep) this.ring.shift()!.fill(0);
      return;
    }
    if (evt === 'start') {
      this.rec = [...this.ring, copy];
      this.ring = [];
      this.lastVoicedIdx = this.rec.length - 1;
      this.set('recording');
      this.game.cat.play('listen', { force: true });
      return;
    }
    this.rec.push(copy);
    if (rms >= this.gate.opts.threshold * 0.6) this.lastVoicedIdx = this.rec.length - 1;
    if (evt === 'end' || evt === 'maxed') {
      const tail = Math.ceil((0.15 * sampleRate) / CHUNK);
      const chunks = this.rec.slice(0, Math.min(this.rec.length, this.lastVoicedIdx + 1 + tail));
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      this.wipeLater(this.rec);
      this.rec = [];
      this.speak(all);
    } else if (evt === 'tooShort') {
      this.wipe();
      this.set('listening');
      this.game.cat.endAction('listen');
      this.game.cat.play('listen');
    }
  }

  private wipeLater(chunks: Float32Array[]): void {
    for (const c of chunks) c.fill(0);
  }

  /** Кот повторяет услышанное писклявым голосом, рот двигается по амплитуде. */
  private speak(samples: Float32Array<ArrayBuffer>): void {
    const g = this.game;
    const ctx = g.synth.ctx;
    if (!ctx || samples.length < 64) {
      this.set('listening');
      return;
    }
    this.set('speaking');
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    samples.fill(0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = VOICE.playbackRate;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 2600;
    peak.gain.value = 5;
    const gain = ctx.createGain();
    gain.gain.value = 2.2;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(hp);
    hp.connect(peak);
    peak.connect(gain);
    gain.connect(an);
    g.synth.connectOut(an);
    this.analyser = an;
    this.playing = src;
    g.cat.play('speak', { force: true });
    src.onended = () => {
      // запись стирается: буфер обнуляется и отпускается
      try {
        buf.copyToChannel(new Float32Array(buf.length), 0);
        src.disconnect();
        hp.disconnect();
        peak.disconnect();
        gain.disconnect();
        an.disconnect();
      } catch {
        /* ок */
      }
      this.playing = null;
      this.analyser = null;
      g.cat.mouthDrive = 0;
      g.cat.endAction('speak');
      this.repeats++;
      this.cooldown = 0.6;
      this.gate.reset();
      this.ring = [];
      if (this.state === 'speaking') {
        this.set('listening');
        g.cat.play('listen');
      }
    };
    src.start();
  }

  private update(dt: number): void {
    void dt;
    const cat = this.game.cat;
    if (this.analyser && this.state === 'speaking') {
      this.analyser.getFloatTimeDomainData(this.analyserBuf);
      const amp = rmsOf(this.analyserBuf);
      const target = Math.min(1, amp * 7);
      cat.mouthDrive += (target - cat.mouthDrive) * 0.5;
    }
  }
}
