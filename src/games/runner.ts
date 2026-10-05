import { Group, Sprite, SpriteMaterial } from 'three';
import { clamp, randRange } from '../logic/math';
import { kindTexture } from '../render/particles';
import { boxGeo, cylGeo, ellipsoidGeo, flatMat, outlined, sphereGeo, toonMat } from '../render/toon';
import type { MiniGame, MiniGameCtx } from './types';

interface Obstacle {
  g: Group;
  x: number;
  w: number;
  h: number;
  passed: boolean;
}
interface Star {
  s: Sprite;
  x: number;
  y: number;
  taken: boolean;
}

const CAT_X = -1.5;
const GRAVITY = 34;
const JUMP_V = 13.5;
const COLORS = [0xff8fa3, 0x7fd1ff, 0xffd23f, 0xb48cff, 0x7bd88f];

/** «Прыг-скок»: кот бежит в профиль, тап — прыжок через мягкие препятствия. Задел — смешно споткнулся и бежит дальше. */
export class Runner implements MiniGame {
  readonly id = 'runner';
  readonly icon = 'run';
  readonly goodScore = 18;
  score = 0;
  private ctx!: MiniGameCtx;
  private world = new Group();
  private obstacles: Obstacle[] = [];
  private stars: Star[] = [];
  private stripes: Group[] = [];
  private spawnX = 6;
  private nextGap = 8;
  private y = 0;
  private vy = 0;
  private grounded = true;
  private buffered = 0;
  private slow = 0;
  private immune = 0;
  private abort = new AbortController();
  private t = 0;
  /** Для тестов: сколько раз споткнулись */
  stumbles = 0;
  jumps = 0;

  start(ctx: MiniGameCtx): void {
    this.ctx = ctx;
    const g = ctx.game;
    g.rooms.living.group.add(this.world);
    // бегущая дорожка
    for (let i = 0; i < 9; i++) {
      const st = new Group();
      const bar = outlined(boxGeo(1.0, 0.04, 0.4), toonMat(0xfff7ec), false);
      st.add(bar);
      st.position.set(-4.6 + i * 1.3, 0.04, 1.3);
      this.world.add(st);
      this.stripes.push(st);
    }
    g.ball.group.visible = false;
    const cat = g.cat;
    cat.resetToStand(CAT_X);
    cat.running = true;
    cat.walkTarget = null;
    g.setFocus(0.02);
    ctx.stage.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.buffered = 0.18;
      },
      { signal: this.abort.signal },
    );
  }

  private spawnObstacle(): void {
    const kind = Math.floor(Math.random() * 3);
    const g = new Group();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
    let w = 1.5;
    let h = 0.9;
    if (kind === 0) {
      g.add(outlined(ellipsoidGeo(0.85, 0.5, 0.7, 16), toonMat(color)));
      g.children[0]!.position.y = 0.45;
      h = 0.95;
    } else if (kind === 1) {
      const b = outlined(boxGeo(1.1, 1.1, 1.1), toonMat(color));
      b.position.y = 0.55;
      g.add(b);
      const dot = outlined(sphereGeo(0.18, 8), flatMat(0xffffff), false);
      dot.position.set(0, 0.6, 0.58);
      g.add(dot);
      w = 1.2;
      h = 1.15;
    } else {
      const stem = outlined(cylGeo(0.3, 0.38, 0.8, 14), toonMat(0xfff1de));
      stem.position.y = 0.4;
      g.add(stem);
      const cap = outlined(ellipsoidGeo(0.8, 0.5, 0.8, 16), toonMat(0xff5d73));
      cap.position.y = 0.95;
      g.add(cap);
      w = 1.4;
      h = 1.3;
    }
    g.position.set(this.spawnX, 0, 0.6);
    this.world.add(g);
    this.obstacles.push({ g, x: this.spawnX, w, h, passed: false });
    // звёздочка над препятствием (за прыжок — бонус)
    if (Math.random() < 0.7) {
      const s = new Sprite(new SpriteMaterial({ map: kindTexture('star'), transparent: true, depthWrite: false }));
      s.scale.setScalar(0.9);
      s.renderOrder = 5;
      const y = h + randRange(1.3, 2.0);
      s.position.set(this.spawnX + randRange(-0.2, 0.4), y, 0.6);
      this.world.add(s);
      this.stars.push({ s, x: s.position.x, y, taken: false });
    }
    this.nextGap = randRange(7.5, 10.5);
  }

  update(dt: number): void {
    const { game } = this.ctx;
    const cat = game.cat;
    this.t += dt;
    const speed = 5.4 * (this.slow > 0 ? 0.45 : 1);
    this.slow = Math.max(0, this.slow - dt);
    this.immune = Math.max(0, this.immune - dt);
    this.buffered = Math.max(0, this.buffered - dt);

    // прыжок
    if (this.buffered > 0 && this.grounded) {
      this.grounded = false;
      this.vy = JUMP_V;
      this.buffered = 0;
      this.jumps++;
      cat.sq.value = 0.75;
      game.synth.play('hop');
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      cat.sq.target = 1 + clamp(this.vy * 0.012, -0.08, 0.14);
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        cat.sq.value = 0.78;
        game.synth.play('thud', 0.3);
        game.fx('puff', 'feet', 1);
      }
    }
    cat.extraY = this.y;

    // мир едет влево
    this.spawnX = 6;
    this.nextGap -= speed * dt;
    if (this.nextGap <= 0) this.spawnObstacle();
    for (const st of this.stripes) {
      st.position.x -= speed * dt;
      if (st.position.x < -5.2) st.position.x += 9 * 1.3;
    }
    const keep: Obstacle[] = [];
    for (const o of this.obstacles) {
      o.x -= speed * dt;
      o.g.position.x = o.x;
      const dx = Math.abs(o.x - CAT_X);
      const overlap = dx < o.w / 2 + 0.55;
      if (overlap && this.y < o.h - 0.15 && this.immune <= 0) {
        // споткнулся: смешно, но не больно
        this.stumbles++;
        this.immune = 1.4;
        this.slow = 0.5;
        cat.play('stumble', { force: true });
      }
      if (!o.passed && o.x < CAT_X - o.w / 2 - 0.55) {
        o.passed = true;
        if (this.immune <= 0 || this.y > 0.2) {
          this.score++;
          this.ctx.onPoint();
        }
      }
      if (o.x < -6) {
        this.world.remove(o.g);
        continue;
      }
      keep.push(o);
    }
    this.obstacles = keep;
    const keepS: Star[] = [];
    for (const s of this.stars) {
      s.x -= speed * dt;
      s.s.position.set(s.x, s.y + Math.sin(this.t * 5 + s.x) * 0.12, 0.6);
      const cx = CAT_X;
      const cy = this.y + 2.4;
      if (!s.taken && Math.abs(s.x - cx) < 1.1 && Math.abs(s.y - cy) < 1.7) {
        s.taken = true;
        this.score++;
        this.ctx.onPoint();
        game.synth.play('coin');
        game.particles.burst('spark', { x: s.s.position.x, y: s.s.position.y, z: 1.4 }, 6, 2.4, { life: 0.5, size: 0.35, color: 0xffe066 });
      }
      if (s.taken || s.x < -6) {
        this.world.remove(s.s);
        s.s.material.dispose();
        continue;
      }
      keepS.push(s);
    }
    this.stars = keepS;
  }

  stop(): void {
    this.abort.abort();
    const g = this.ctx.game;
    for (const s of this.stars) s.s.material.dispose();
    this.ctx.game.rooms.living.group.remove(this.world);
    this.obstacles = [];
    this.stars = [];
    g.ball.group.visible = true;
    g.cat.running = false;
    g.cat.extraY = 0;
    g.cat.resetToStand(0);
    g.setFocus(0);
  }
}
