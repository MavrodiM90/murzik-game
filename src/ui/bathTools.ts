import { Vector3 } from 'three';
import type { Game } from '../game';
import { clamp } from '../logic/math';
import type { Hud } from './hud';
import { icon } from './icons';

export type BathTool = 'sponge' | 'shower' | null;

/** Губка и душ: трём кота пальцем — пена, потом смываем. */
export class BathTools {
  tool: BathTool = null;
  private ghost: HTMLElement | null = null;
  private down = false;
  private last: { x: number; y: number } | null = null;
  private tmp = new Vector3();
  private showering = false;
  private hadFoam = false;
  private dripAcc = 0;
  private soundAcc = 0;
  private abort = new AbortController();

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    const el = game.canvas;
    const o = { signal: this.abort.signal } as AddEventListenerOptions;
    el.addEventListener('pointerdown', (e) => this.onDown(e), o);
    el.addEventListener('pointermove', (e) => this.onMove(e), o);
    el.addEventListener('pointerup', () => this.onUp(), o);
    el.addEventListener('pointercancel', () => this.onUp(), o);
    game.onUpdate.push((dt) => this.update(dt));
  }

  toggle(t: Exclude<BathTool, null>): void {
    if (this.game.roomId !== 'bath' || this.game.sleeping) return;
    this.hud.closePanel();
    if (this.tool === t) this.stop();
    else {
      this.stop();
      this.tool = t;
      this.game.toolActive = true;
      this.game.cat.stopWalking();
      const g = document.createElement('div');
      g.className = 'ghost ghost-tool';
      g.innerHTML = icon(t);
      g.style.opacity = '0';
      document.body.append(g);
      this.ghost = g;
    }
    this.hud.refreshToolStates();
  }

  stop(): void {
    this.endShower();
    this.tool = null;
    this.game.toolActive = false;
    this.ghost?.remove();
    this.ghost = null;
    this.down = false;
    this.game.cat.mouthHint = 0;
    this.hud.refreshToolStates();
  }

  private placeGhost(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.opacity = '1';
    this.ghost.style.transform = `translate(${x - 44}px, ${y - 70}px) scale(1.15) rotate(${this.tool === 'shower' ? 0 : -10}deg)`;
  }

  private onDown(e: PointerEvent): void {
    if (!this.tool) return;
    e.preventDefault();
    this.game.synth.unlock();
    this.down = true;
    this.last = { x: e.clientX, y: e.clientY };
    this.placeGhost(e.clientX, e.clientY);
    if (this.tool === 'shower') this.startShower();
  }

  private onMove(e: PointerEvent): void {
    if (!this.tool) return;
    this.placeGhost(e.clientX, e.clientY);
    if (!this.down) return;
    e.preventDefault();
    const last = this.last ?? { x: e.clientX, y: e.clientY };
    const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    this.last = { x: e.clientX, y: e.clientY };
    const over = this.game.input.pickPart(e.clientX, e.clientY) !== null;
    this.game.stage.pointerToWorld(e.clientX, e.clientY, this.tmp);
    if (this.tool === 'sponge' && over) this.scrub(dist);
  }

  private onUp(): void {
    this.down = false;
    this.last = null;
    this.endShower();
  }

  private scrub(dist: number): void {
    const cat = this.game.cat;
    const needs = this.game.save.needs;
    cat.setFoam(cat.foam + dist * 0.0016);
    if (needs.clean < 70) this.game.addNeed('clean', dist * 0.03);
    this.hadFoam = true;
    if (cat.actionName !== 'scrub') cat.play('scrub');
    cat.extend('scrub', 0.4);
    this.game.addNeed('fun', dist * 0.004);
    this.soundAcc += dist;
    if (this.soundAcc > 60) {
      this.soundAcc = 0;
      this.game.synth.play('bubble');
    }
    this.dripAcc += dist;
    if (this.dripAcc > 24) {
      this.dripAcc = 0;
      this.game.particles.spawn(
        'foam',
        { x: this.tmp.x + this.game.stage.camX * 0, y: this.tmp.y, z: 1.6 },
        { x: (Math.random() - 0.5) * 1.2, y: 0.8 + Math.random(), z: 0 },
        { life: 1, size: 0.3 + Math.random() * 0.3, grow: 0.4 },
      );
    }
  }

  private startShower(): void {
    if (this.showering) return;
    this.showering = true;
    this.game.synth.play('showerStart');
  }

  private endShower(): void {
    if (!this.showering) return;
    this.showering = false;
    this.game.synth.play('showerStop');
    const cat = this.game.cat;
    if (this.hadFoam && cat.foam < 0.02) {
      this.hadFoam = false;
      cat.endAction('rinse');
      cat.play('shake', { force: true });
      this.game.fx('sparkle', 'head', 8);
      this.game.synth.play('sparkle');
    }
  }

  private update(dt: number): void {
    if (this.tool !== 'shower' || !this.down || !this.last) return;
    const g = this.game;
    const cat = g.cat;
    g.stage.pointerToWorld(this.last.x, this.last.y, this.tmp);
    // струи воды из лейки
    for (let i = 0; i < 2; i++) {
      g.particles.spawn(
        'drop',
        { x: this.tmp.x + (Math.random() - 0.5) * 1.2, y: this.tmp.y + 0.3, z: 1.8 },
        { x: (Math.random() - 0.5) * 0.8, y: -7 - Math.random() * 3, z: 0 },
        { life: 0.5, size: 0.22, fade: false },
      );
    }
    const over = g.input.pickPart(this.last.x, this.last.y) !== null;
    if (!over) return;
    if (cat.actionName !== 'rinse') cat.play('rinse');
    cat.extend('rinse', 0.4);
    const before = cat.foam;
    cat.setFoam(cat.foam - dt * 0.55);
    const removed = before - cat.foam;
    if (removed > 0) g.addNeed('clean', removed * 45);
    else g.addNeed('clean', dt * 6);
    g.addNeed('fun', dt * 1.2);
    this.soundAcc += dt;
    if (this.soundAcc > 0.35) {
      this.soundAcc = 0;
      g.fx('drops', 'body', 2);
    }
    void clamp;
  }
}
