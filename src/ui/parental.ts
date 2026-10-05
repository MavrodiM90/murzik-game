import { PARENTAL } from '../config';
import type { Game } from '../game';
import { checkAnswer, makeProblem, type MathProblem } from '../logic/parentalMath';
import { isLocked, lockRemainingMs, parentBypass, remainingPlayMs, resumeSession, tickPlay } from '../logic/playTimer';
import { clearSave, type PauseKey } from '../logic/save';
import type { Hud, Panel } from './hud';
import { icon } from './icons';

const PAUSE_LABELS: Record<PauseKey, string> = { '30m': '30 мин', '1h': '1 час', '2h': '2 часа', tomorrow: 'До завтра' };
const VOLUMES = [0, 0.25, 0.5, 0.75, 1];
const SENS: [1 | 2 | 3, string][] = [
  [1, 'Низкая'],
  [2, 'Средняя'],
  [3, 'Высокая'],
];

const fmtMin = (ms: number): string => {
  const m = Math.ceil(ms / 60000);
  if (m >= 120) return `${Math.floor(m / 60)} ч ${m % 60} мин`;
  return `${m} мин`;
};

/**
 * Родительский контроль: шестерёнка (держать 3 секунды) → пример на умножение → настройки.
 * Таймер игры и пауза: когда время вышло, кот зевает и засыпает, играть нельзя до конца паузы.
 */
export class Parental implements Panel {
  private gearEls: HTMLElement[] = [];
  private overlay: HTMLElement | null = null;
  private lockEl: HTMLElement | null = null;
  private locked = false;
  private lockTimers: number[] = [];
  private acc = 0;
  private problem: MathProblem = makeProblem();
  private wrong = 0;
  /** Для тестов */
  gearHoldMs: number = PARENTAL.gearHoldMs;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    this.hud.root.append(this.makeGear('hud-gear'));
    game.onUpdate.push((dt) => this.update(dt));
    // состояние при запуске: пауза могла идти, пока игра была закрыта
    const t = game.save.timer;
    const now = Date.now();
    resumeSession(t, now);
    // отложено: HUD должен достроиться целиком (мини-игры, ванная и т.д.)
    window.setTimeout(() => {
      if (!this.locked && isLocked(t, Date.now())) this.enterLock(true);
    }, 0);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const n = Date.now();
        resumeSession(game.save.timer, n);
        if (!this.locked && isLocked(game.save.timer, n)) this.enterLock(true);
      }
    });
  }

  get isLockedNow(): boolean {
    return this.locked;
  }
  get checkOpen(): boolean {
    return !!this.overlay;
  }

  // ---------- шестерёнка ----------
  private makeGear(cls: string): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `gear ${cls}`;
    el.setAttribute('aria-label', 'Для родителей');
    el.innerHTML = `<span class="gear-ic">${icon('gear')}</span>`;
    let raf = 0;
    let t0 = 0;
    let pid = -1;
    const stop = (): void => {
      cancelAnimationFrame(raf);
      pid = -1;
      el.style.setProperty('--deg', '0deg');
      el.classList.remove('holding');
    };
    const loop = (): void => {
      const k = Math.min(1, (performance.now() - t0) / this.gearHoldMs);
      el.style.setProperty('--deg', `${k * 360}deg`);
      if (k >= 1) {
        stop();
        this.openCheck();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pid !== -1) return;
      pid = e.pointerId;
      t0 = performance.now();
      el.classList.add('holding');
      raf = requestAnimationFrame(loop);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, stop);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.gearEls.push(el);
    return el;
  }

  // ---------- родительская проверка ----------
  openCheck(onPass?: () => void): void {
    this.closeOverlay();
    this.hud.closePanel(this);
    this.problem = makeProblem();
    this.wrong = 0;
    let input = '';
    const el = document.createElement('div');
    el.className = 'pcheck';
    const card = document.createElement('div');
    card.className = 'pcard';
    const title = document.createElement('div');
    title.className = 'ptitle';
    const display = document.createElement('div');
    display.className = 'pdisplay';
    const pad = document.createElement('div');
    pad.className = 'ppad';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-close pclose';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = icon('close');
    close.addEventListener('click', () => this.closeOverlay());
    const render = (): void => {
      title.textContent = `${this.problem.a} × ${this.problem.b} = ?`;
      display.textContent = input || ' ';
    };
    const press = (k: string): void => {
      if (k === 'back') input = input.slice(0, -1);
      else if (k === 'ok') {
        if (checkAnswer(this.problem, input)) {
          this.closeOverlay();
          (onPass ?? (() => this.openSettings()))();
          return;
        }
        this.wrong++;
        input = '';
        display.classList.remove('shake');
        void display.offsetWidth;
        display.classList.add('shake');
        this.game.synth.play('boop');
        if (this.wrong >= 3) {
          this.problem = makeProblem();
          this.wrong = 0;
        }
      } else if (input.length < 4) input += k;
      render();
    };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pkey${k === 'ok' ? ' ok' : ''}${k === 'back' ? ' back' : ''}`;
      b.dataset.key = k;
      b.textContent = k === 'back' ? '⌫' : k === 'ok' ? '✓' : k;
      b.addEventListener('click', () => press(k));
      pad.append(b);
    }
    card.append(title, display, pad, close);
    el.append(card);
    this.hud.root.append(el);
    this.overlay = el;
    render();
  }

  get problemText(): MathProblem {
    return this.problem;
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  close(): void {
    this.closeOverlay();
  }

  // ---------- настройки ----------
  openSettings(): void {
    const g = this.game;
    this.closeOverlay();
    // родитель прошёл проверку: если шла пауза — снимаем её
    if (this.locked) this.exitLock(true);
    const el = document.createElement('div');
    el.className = 'pset';
    this.overlay = el;
    this.hud.root.append(el);
    this.renderSettings();
    g.synth.play('chime');
  }

  private seg<T extends string | number>(options: [T, string][], current: T, onPick: (v: T) => void): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'seg';
    for (const [v, label] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = String(v);
      b.className = v === current ? 'on' : '';
      b.textContent = label;
      b.addEventListener('click', () => onPick(v));
      wrap.append(b);
    }
    return wrap;
  }

  private row(label: string, ...content: HTMLElement[]): HTMLElement {
    const r = document.createElement('div');
    r.className = 'prow';
    const l = document.createElement('div');
    l.className = 'plabel';
    l.textContent = label;
    r.append(l, ...content);
    return r;
  }

  private renderSettings(): void {
    const el = this.overlay;
    if (!el || !el.classList.contains('pset')) return;
    const g = this.game;
    const s = g.save;
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'pcard pcard-wide';
    const h = document.createElement('div');
    h.className = 'ptitle small';
    h.textContent = 'Настройки для родителей';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-close pclose';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = icon('close');
    close.addEventListener('click', () => this.closeOverlay());

    const timerOpts = PARENTAL.timerOptionsMin.map((m) => [m, m === 0 ? 'Выкл' : `${m} мин`] as [number, string]);
    const rem = remainingPlayMs(s.timer);
    const info = document.createElement('div');
    info.className = 'pinfo';
    info.textContent = s.timer.limitMin > 0 ? `Осталось играть: ${fmtMin(rem)}` : 'Таймер выключен';
    card.append(
      h,
      this.row('Таймер игры', this.seg(timerOpts, s.timer.limitMin, (v) => {
        s.timer.limitMin = v;
        s.timer.playedMs = 0;
        parentBypass(s.timer);
        g.persist();
        this.renderSettings();
      }), info),
      this.row('Пауза после таймера', this.seg(
        PARENTAL.pauseOptions.map((p) => [p, PAUSE_LABELS[p]] as [PauseKey, string]),
        s.timer.pause,
        (v) => {
          s.timer.pause = v;
          g.persist();
          this.renderSettings();
        },
      )),
      this.row('Громкость', this.seg(
        VOLUMES.map((v) => [v, v === 0 ? 'Тихо' : `${Math.round(v * 100)}%`] as [number, string]),
        VOLUMES.reduce((best, v) => (Math.abs(v - s.settings.volume) < Math.abs(best - s.settings.volume) ? v : best), 0.5),
        (v) => {
          s.settings.volume = v;
          g.synth.setVolume(v);
          g.synth.play('chime');
          g.persist();
          this.renderSettings();
        },
      )),
      this.row('Повтор голоса', this.seg<string>(
        [
          ['on', 'Вкл'],
          ['off', 'Выкл'],
        ],
        s.settings.voiceRepeat ? 'on' : 'off',
        (v) => {
          s.settings.voiceRepeat = v === 'on';
          if (!s.settings.voiceRepeat) g.voice.disable();
          g.persist();
          g.emit('settings');
          this.renderSettings();
        },
      )),
      this.row('Чувствительность микрофона', this.seg(SENS, s.settings.micSensitivity, (v) => {
        s.settings.micSensitivity = v;
        g.persist();
        this.renderSettings();
      })),
    );
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'preset';
    reset.textContent = 'Сбросить прогресс…';
    reset.addEventListener('click', () => this.confirmReset(1));
    card.append(reset, close);
    el.append(card);
  }

  private confirmReset(step: 1 | 2): void {
    const el = this.overlay;
    if (!el) return;
    const dlg = document.createElement('div');
    dlg.className = 'pconfirm';
    const box = document.createElement('div');
    box.className = 'pcard pconfirm-box';
    const text = document.createElement('div');
    text.className = 'ptitle small';
    text.textContent = step === 1 ? 'Сбросить весь прогресс?' : 'Точно? Монеты, одежда и всё остальное пропадут. Это нельзя отменить.';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'pbtn';
    no.dataset.act = 'no';
    no.textContent = 'Нет, отмена';
    no.addEventListener('click', () => dlg.remove());
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'pbtn danger';
    yes.dataset.act = step === 1 ? 'yes1' : 'yes2';
    yes.textContent = step === 1 ? 'Да' : 'Да, удалить всё';
    yes.addEventListener('click', () => {
      dlg.remove();
      if (step === 1) this.confirmReset(2);
      else this.doReset();
    });
    const row = document.createElement('div');
    row.className = 'prow-btns';
    row.append(no, yes);
    box.append(text, row);
    dlg.append(box);
    el.append(dlg);
  }

  private doReset(): void {
    this.game.resetting = true;
    clearSave();
    window.location.reload();
  }

  // ---------- таймер и сон ----------
  private update(dt: number): void {
    const g = this.game;
    const t = g.save.timer;
    const now = Date.now();
    if (!this.locked) {
      if (tickPlay(t, dt * 1000, now)) {
        g.persist();
        this.enterLock(false);
      }
      return;
    }
    this.acc += dt;
    if (!isLocked(t, now)) {
      this.exitLock(false);
      return;
    }
    if (this.acc > 1) {
      this.acc = 0;
      const el = this.lockEl?.querySelector('[data-remaining]');
      if (el) el.textContent = fmtMin(lockRemainingMs(t, now));
    }
  }

  private later(fn: () => void, ms: number): void {
    this.lockTimers.push(window.setTimeout(fn, ms));
  }

  /** Время вышло: кот зевает, идёт спать, гаснет свет. */
  enterLock(immediate: boolean): void {
    if (this.locked) return;
    const g = this.game;
    this.locked = true;
    this.hud.root.classList.add('locked');
    this.hud.closePanel();
    this.closeOverlay();
    this.hud.minigames.finishNowQuiet();
    this.hud.bath.stop();
    g.voice.disable();
    g.inputLocks++;
    g.goToRoom('bedroom');
    const sleepNow = (): void => {
      if (!this.locked) return;
      g.setLampOn(false);
    };
    if (immediate || g.cat.mode !== 'stand') {
      if (g.cat.mode !== 'lying') {
        g.cat.resetToStand(0);
        g.rooms.bedroom.setLamp(false);
        g.sleepRequested = true;
        g.cat.lieDown(0.3, 2.75);
        g.emit('sleep');
      }
      this.waitForBed(immediate ? 600 : 3500);
    } else {
      g.cat.play('yawn', { force: true });
      this.later(sleepNow, 1800);
      this.waitForBed(4500);
    }
    this.hud.refreshNav();
  }

  /** Показывает экран «Мурзик спит», когда кот уже лёг (или по запасному таймеру на медленных устройствах). */
  private waitForBed(minMs: number): void {
    const started = performance.now();
    const check = (): void => {
      if (!this.locked || this.lockEl) return;
      const ready = this.game.cat.mode === 'lying' && performance.now() - started >= minMs;
      if (ready || performance.now() - started > 15000) this.showLockScreen();
      else this.later(check, 250);
    };
    this.later(check, minMs);
  }

  private showLockScreen(): void {
    if (!this.locked || this.lockEl) return;
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'lock';
    const stars = Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 37 + 11) % 96}%;top:${(i * 53 + 7) % 46}%;animation-delay:${(i % 5) * 0.4}s">${icon('star')}</i>`).join('');
    el.innerHTML = `<div class="lock-sky">${stars}<div class="lock-moon">${icon('moon')}</div><div class="lock-title">Мурзик спит</div><div class="lock-zzz">${icon('zzz')}</div><div class="lock-left">осталось <b data-remaining>${fmtMin(lockRemainingMs(g.save.timer, Date.now()))}</b></div></div>`;
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.gear')) return;
      e.preventDefault();
      g.synth.unlock();
      g.synth.play('sleepyTick');
      g.fx('zzz', 'head', 2);
      g.cat.grumble();
    });
    el.append(this.makeGear('lock-gear'));
    this.hud.root.append(el);
    this.lockEl = el;
  }

  /** Паузу снимает конец времени или родитель (после проверки). */
  exitLock(byParent: boolean): void {
    if (!this.locked) return;
    const g = this.game;
    this.lockTimers.forEach((t) => clearTimeout(t));
    this.lockTimers = [];
    this.locked = false;
    this.hud.root.classList.remove('locked');
    if (byParent) parentBypass(g.save.timer);
    this.lockEl?.remove();
    this.gearEls = this.gearEls.filter((e) => e.isConnected);
    this.lockEl = null;
    g.inputLocks = Math.max(0, g.inputLocks - 1);
    g.setLampOn(true);
    g.persist();
    this.hud.refreshNav();
  }
}
