import { MINIGAME } from '../config';
import { Balloons } from '../games/balloons';
import { CatchFish } from '../games/catchFish';
import { Memory } from '../games/memory';
import { Runner } from '../games/runner';
import type { MiniGame } from '../games/types';
import type { Game } from '../game';
import { miniGameReward } from '../logic/rewards';
import type { Hud, Panel } from './hud';
import { icon } from './icons';

type Factory = () => MiniGame;
const GAMES: { id: string; icon: string; make: Factory }[] = [
  { id: 'fish', icon: 'catch', make: () => new CatchFish() },
  { id: 'balloons', icon: 'balloon', make: () => new Balloons() },
  { id: 'runner', icon: 'run', make: () => new Runner() },
  { id: 'memory', icon: 'cards', make: () => new Memory() },
];

/** Меню мини-игр, сама игра на 45–60 секунд и салют с монетами в конце (минимум 20). */
export class MiniGames implements Panel {
  private menu: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private current: MiniGame | null = null;
  private elapsed = 0;
  private fill: HTMLElement | null = null;
  private duration = MINIGAME.durationSec;
  private result: HTMLElement | null = null;
  private resultTimer = 0;
  /** Для тестов */
  lastReward = 0;
  playing = false;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    hud.addTool('living', { id: 'games', icon: 'gamepad', label: 'Игры', onTap: () => this.openMenu() });
    hud.extraHandlers.tv = () => this.openMenu();
    game.onUpdate.push((dt) => this.tick(dt));
  }

  get menuOpen(): boolean {
    return !!this.menu;
  }

  openMenu(): void {
    if (this.playing || this.game.navLocked) return;
    this.hud.closePanel(this);
    this.closeMenu(true);
    this.game.goToRoom('living');
    const el = document.createElement('div');
    el.className = 'mg-menu';
    const grid = document.createElement('div');
    grid.className = 'mg-menu-grid';
    for (const g of GAMES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mg-pick';
      b.dataset.game = g.id;
      b.setAttribute('aria-label', g.id);
      b.innerHTML = icon(g.icon);
      b.addEventListener('click', () => this.start(g.id));
      grid.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-close mg-menu-x';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = icon('close');
    close.addEventListener('click', () => this.close());
    el.append(grid, close);
    this.hud.root.append(el);
    this.menu = el;
    this.hud.openPanel(this);
    this.game.synth.play('chime');
  }

  private closeMenu(silent = false): void {
    this.menu?.remove();
    this.menu = null;
    if (!silent) this.hud.clearPanel(this);
  }

  /** Panel.close — закрыть меню или прервать игру (без награды). */
  close(): void {
    if (this.playing) this.abort();
    this.closeMenu(true);
    this.hud.clearPanel(this);
  }

  start(id: string): void {
    const def = GAMES.find((g) => g.id === id);
    if (!def || this.playing) return;
    this.closeMenu(true);
    this.hud.clearPanel(this);
    const game = this.game;
    game.inputLocks++;
    game.cat.stopWalking();
    game.cat.lookAt(null);
    this.playing = true;
    this.elapsed = 0;
    this.duration = MINIGAME.durationSec;
    const ov = document.createElement('div');
    ov.className = `mg game-${id}`;
    ov.innerHTML = `<div class="mg-bar"><div class="mg-bar-fill"></div></div>`;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'btn btn-close mg-x';
    x.setAttribute('aria-label', 'Домой');
    x.innerHTML = icon('home');
    x.addEventListener('click', () => this.abort());
    const stage = document.createElement('div');
    stage.className = 'mg-stage';
    ov.append(stage, x);
    this.hud.root.append(ov);
    this.hud.root.classList.add('mg-on');
    this.overlay = ov;
    this.fill = ov.querySelector('.mg-bar-fill');
    const r = stage.getBoundingClientRect();
    const g = def.make();
    this.current = g;
    g.start({
      game,
      stage,
      width: r.width,
      height: r.height,
      onPoint: () => game.addNeed('fun', 1.2),
    });
  }

  private tick(dt: number): void {
    if (!this.playing || !this.current) return;
    this.elapsed += dt;
    this.current.update(dt);
    if (this.fill) this.fill.style.width = `${Math.max(0, 100 - (this.elapsed / this.duration) * 100)}%`;
    if (this.elapsed >= this.duration) this.finish();
  }

  /** Принудительно закончить (для тестов и родительского экрана сна). */
  finishNow(): void {
    if (this.playing) this.finish();
  }

  private teardown(): void {
    this.current?.stop();
    this.current = null;
    this.overlay?.remove();
    this.overlay = null;
    this.hud.root.classList.remove('mg-on');
    this.playing = false;
    this.game.inputLocks = Math.max(0, this.game.inputLocks - 1);
    this.game.cat.mouthHint = 0;
  }

  private abort(): void {
    if (!this.playing) return;
    this.teardown();
    this.game.synth.play('click');
  }

  private finish(): void {
    const g = this.current!;
    const score = g.score;
    const reward = miniGameReward(score, g.goodScore);
    this.teardown();
    this.lastReward = reward;
    const game = this.game;
    game.addCoins(reward);
    game.addNeed('fun', 25);
    game.fireworks();
    game.coinBurst(Math.min(30, 10 + Math.round(reward / 6)));
    game.synth.play('fanfare');
    if (game.cat.mode === 'stand') game.cat.play('cheer', { force: true });
    game.persist();
    this.showResult(reward, Math.round(score), g.goodScore);
  }

  private showResult(reward: number, score: number, good: number): void {
    const stars = score >= good * 0.66 ? 3 : score >= good * 0.33 ? 2 : 1;
    const el = document.createElement('div');
    el.className = 'mg-result';
    el.innerHTML = `<div class="mg-card"><div class="mg-stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div><div class="mg-reward"><span class="ci">${icon('coin')}</span><b>+${reward}</b></div></div>`;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn mg-ok';
    ok.setAttribute('aria-label', 'Готово');
    ok.innerHTML = icon('check');
    ok.addEventListener('click', () => this.closeResult());
    el.append(ok);
    this.hud.root.append(el);
    this.result = el;
    this.resultTimer = window.setTimeout(() => this.closeResult(), 6000);
  }

  private closeResult(): void {
    clearTimeout(this.resultTimer);
    this.result?.remove();
    this.result = null;
  }

  /** Текущая игра (для тестов). */
  get activeGame(): MiniGame | null {
    return this.current;
  }

  get resultOpen(): boolean {
    return !!this.result;
  }

}
