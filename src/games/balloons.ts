import { Vector3 } from 'three';
import { randRange } from '../logic/math';
import { icon } from '../ui/icons';
import type { MiniGame, MiniGameCtx } from './types';

interface Balloon {
  el: HTMLElement;
  x: number;
  y: number;
  vy: number;
  ph: number;
  alive: boolean;
}

const HUES = [0, 40, 90, 150, 200, 260, 310];

/** «Лопни шарики»: шарики летят вверх, тап лопает. */
export class Balloons implements MiniGame {
  readonly id = 'balloons';
  readonly icon = 'balloon';
  readonly goodScore = 28;
  score = 0;
  private ctx!: MiniGameCtx;
  private list: Balloon[] = [];
  private spawnIn = 0.2;
  private t = 0;
  private tmp = new Vector3();

  start(ctx: MiniGameCtx): void {
    this.ctx = ctx;
    ctx.game.setFocus(0.06);
  }

  private spawn(): void {
    const { width, height } = this.ctx;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mg-balloon';
    el.setAttribute('aria-label', 'Шарик');
    el.innerHTML = icon('balloon');
    el.style.filter = `hue-rotate(${HUES[Math.floor(Math.random() * HUES.length)]}deg) saturate(1.2)`;
    this.ctx.stage.append(el);
    const b: Balloon = { el, x: randRange(60, width - 60), y: height + 70, vy: randRange(95, 155) * (height / 800), ph: randRange(0, 6), alive: true };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pop(b, e.clientX, e.clientY);
    });
    this.list.push(b);
  }

  private pop(b: Balloon, cx: number, cy: number): void {
    if (!b.alive) return;
    b.alive = false;
    b.el.remove();
    this.score++;
    this.ctx.onPoint();
    this.ctx.game.synth.play('pop');
    this.ctx.game.stage.pointerToWorld(cx, cy, this.tmp);
    this.ctx.game.particles.burst('star', { x: this.tmp.x, y: this.tmp.y, z: 1.6 }, 6, 3.2, { life: 0.7, size: 0.45, gravity: 4 });
    this.ctx.game.particles.burst('spark', { x: this.tmp.x, y: this.tmp.y, z: 1.6 }, 6, 2.5, { life: 0.5, size: 0.35, color: 0xffd1dc });
    if (this.score % 6 === 0 && this.ctx.game.cat.mode === 'stand') this.ctx.game.cat.play('cheer');
  }

  update(dt: number): void {
    this.t += dt;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = randRange(0.5, 0.85);
    }
    const next: Balloon[] = [];
    for (const b of this.list) {
      if (!b.alive) continue;
      b.y -= b.vy * dt;
      if (b.y < -150) {
        b.el.remove();
        b.alive = false;
        continue;
      }
      const x = b.x + Math.sin(this.t * 1.6 + b.ph) * 18;
      b.el.style.transform = `translate(${x - 50}px, ${b.y}px)`;
      next.push(b);
    }
    this.list = next;
  }

  stop(): void {
    for (const b of this.list) b.el.remove();
    this.list = [];
    this.ctx.game.setFocus(0);
  }
}
