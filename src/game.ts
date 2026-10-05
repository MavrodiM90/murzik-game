import { Vector3 } from 'three';
import { Synth } from './audio/synth';
import { FLOOR_COLORS, WALL_COLORS, WORLD } from './config';
import { CatInput, type InputHost } from './input';
import type { Part } from './logic/gestures';
import { clamp, damp, randRange } from './logic/math';
import { makeBounds } from './logic/throwPhysics';
import { Cat, type CatEvent, type FxAnchor, type FxName } from './render/cat';
import { Particles } from './render/particles';
import { Ball } from './render/props';
import { createRooms, roomCenterX, ROOM_ORDER, type Room, type RoomId } from './render/rooms';
import { Stage } from './render/stage';

export class Game implements InputHost {
  readonly stage: Stage;
  readonly cat = new Cat();
  readonly particles: Particles;
  readonly synth = new Synth();
  readonly rooms: Record<RoomId, Room>;
  readonly input: CatInput;
  readonly ball = new Ball();
  roomId: RoomId = 'living';
  private camX = 0;
  private running = false;
  private raf = 0;
  private last = 0;
  private tmp = new Vector3();
  private chaseCooldown = 0;
  private ballActiveFor = 0;
  /** Если >0 — ввод по коту выключен (оверлеи, мини-игры, экран сна) */
  inputLocks = 0;
  frame = 0;
  onUpdate: ((dt: number) => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    this.particles = new Particles(this.stage.scene);
    this.rooms = createRooms(
      Object.fromEntries(ROOM_ORDER.map((r) => [r, WALL_COLORS[0].color])) as Record<RoomId, number>,
      Object.fromEntries(ROOM_ORDER.map((r) => [r, FLOOR_COLORS[0].color])) as Record<RoomId, number>,
    );
    for (const r of ROOM_ORDER) this.stage.scene.add(this.rooms[r].group);
    this.rooms.living.group.add(this.ball.group);
    this.ball.onBounce = (s) => this.synth.play('boop', Math.min(1, s / 12));
    this.stage.scene.add(this.cat.group);
    this.cat.setBounds(makeBounds());
    this.cat.resetToStand(0);
    this.cat.onEvent = (e) => this.onCatEvent(e);
    this.input = new CatInput(this);
    this.input.attach(canvas);
    window.addEventListener('resize', () => this.stage.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.stage.resize(), 200));
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.resume()));
  }

  // ---------------- цикл ----------------
  start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.tick(dt, performance.now());
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.tick(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  get isRunning(): boolean {
    return this.running;
  }

  tick(dt: number, now: number): void {
    this.frame++;
    const target = roomCenterX(this.roomId);
    this.camX = Math.abs(this.camX - target) < 0.002 ? target : damp(this.camX, target, 9, dt);
    this.stage.setCameraX(this.camX);
    this.input.update(dt, now);
    this.cat.update(dt, this.camX);
    for (const r of ROOM_ORDER) this.rooms[r].update(dt);
    if (this.roomId === 'living') this.updateBall(dt);
    this.particles.update(dt);
    for (const f of this.onUpdate) f(dt);
    this.stage.render();
  }

  // ---------------- мяч ----------------
  private updateBall(dt: number): void {
    const ball = this.ball;
    ball.update(dt);
    const moving = ball.airborne || Math.abs(ball.vx) > 0.3;
    if (moving) this.ballActiveFor = 6;
    else this.ballActiveFor = Math.max(0, this.ballActiveFor - dt);
    this.chaseCooldown = Math.max(0, this.chaseCooldown - dt);
    const cat = this.cat;
    if (cat.mode !== 'stand' || cat.busy || this.ballActiveFor <= 0) return;
    const dx = ball.x - cat.body.x;
    if (Math.abs(dx) > 1.25) {
      cat.walkTo(ball.x - Math.sign(dx) * 1.0, undefined, Math.abs(dx) > 3);
    } else if (this.chaseCooldown <= 0 && ball.y < 2.2) {
      const dir = ball.x > 1.8 ? -1 : ball.x < -1.8 ? 1 : dx >= 0 ? 1 : -1;
      this.chaseCooldown = 0.9;
      cat.stopWalking();
      cat.play('kick');
      ball.kick(dir * randRange(6, 9), randRange(8, 12));
      this.synth.play('hop');
      this.particles.burst('spark', { x: ball.x + this.camX, y: ball.y, z: 1.2 }, 3, 2, { life: 0.5, size: 0.3 });
    }
  }

  // ---------------- события кота: звук и частицы ----------------
  private onCatEvent(e: CatEvent): void {
    if (e.kind === 'sfx') this.synth.play(e.name, e.arg);
    else if (e.kind === 'fx') this.fx(e.name, e.at, e.n ?? 3);
  }

  fx(name: FxName, anchor: FxAnchor, n: number): void {
    const p = this.cat.anchorWorld(anchor, this.tmp);
    const base = { x: p.x, y: p.y, z: 1.4 };
    const P = this.particles;
    const rnd = (a: number, b: number): number => randRange(a, b);
    switch (name) {
      case 'hearts':
        for (let i = 0; i < n; i++)
          P.spawn('heart', { x: base.x + rnd(-0.5, 0.5), y: base.y + rnd(0, 0.4), z: base.z }, { x: rnd(-0.6, 0.6), y: rnd(1.4, 2.2), z: 0 }, { life: 1.5, size: rnd(0.5, 0.8), drag: 0.5 });
        break;
      case 'stars':
        P.burst('star', base, n, 3.2, { life: 0.9, size: 0.45, gravity: 4 });
        break;
      case 'sparkle':
        for (let i = 0; i < n; i++)
          P.spawn('spark', { x: base.x + rnd(-0.9, 0.9), y: base.y + rnd(-0.3, 0.7), z: base.z }, { x: rnd(-0.5, 0.5), y: rnd(0.2, 1.2), z: 0 }, { life: 0.8, size: rnd(0.3, 0.6), color: [0xfff1a0, 0xffffff, 0xffc4e1][i % 3] });
        break;
      case 'sneeze':
        for (let i = 0; i < n; i++)
          P.spawn('drop', base, { x: rnd(-1.5, 1.5), y: rnd(-0.2, 1.6), z: rnd(2, 5) }, { life: 0.7, size: rnd(0.15, 0.3), gravity: 8 });
        P.spawn('puff', base, { x: 0, y: 0.3, z: 1.5 }, { life: 0.7, size: 0.7, grow: 1.2, color: 0xffffff });
        break;
      case 'crumbs':
        for (let i = 0; i < n; i++)
          P.spawn('crumb', base, { x: rnd(-1, 1), y: rnd(0.5, 1.5), z: 0 }, { life: 0.9, size: rnd(0.14, 0.24), gravity: 9 });
        break;
      case 'puff':
        for (let i = 0; i < n; i++)
          P.spawn('puff', { x: base.x + rnd(-0.6, 0.6), y: base.y, z: base.z }, { x: rnd(-1.2, 1.2), y: rnd(0.3, 1), z: 0 }, { life: 0.8, size: 0.55, grow: 1.3, color: 0xfff1de });
        break;
      case 'zzz':
        for (let i = 0; i < n; i++)
          P.spawn('zzz', { x: base.x + 0.4 + i * 0.35, y: base.y + 0.2, z: base.z }, { x: 0.5, y: 0.9, z: 0 }, { life: 2.4, size: 0.55 + i * 0.12, grow: 0.5, drag: 0.2 });
        break;
      case 'sweat':
        for (let i = 0; i < n; i++)
          P.spawn('drop', { x: base.x + (i ? 0.8 : -0.8), y: base.y + 0.2, z: base.z }, { x: i ? 1 : -1, y: 1.6, z: 0 }, { life: 0.7, size: 0.28, gravity: 6 });
        break;
      case 'foam':
        for (let i = 0; i < n; i++)
          P.spawn('foam', { x: base.x + rnd(-0.8, 0.8), y: base.y + rnd(-1, 0.5), z: base.z }, { x: rnd(-0.4, 0.4), y: rnd(0.2, 0.9), z: 0 }, { life: 1.3, size: rnd(0.25, 0.5), grow: 0.3 });
        break;
      case 'drops':
        for (let i = 0; i < n; i++)
          P.spawn('drop', { x: base.x + rnd(-0.6, 0.6), y: base.y + rnd(-1, 1), z: base.z }, { x: rnd(-4, 4), y: rnd(1, 4), z: rnd(0, 2) }, { life: 0.8, size: rnd(0.2, 0.35), gravity: 9 });
        break;
    }
  }

  // ---------------- InputHost ----------------
  canInteract(): boolean {
    return this.inputLocks === 0;
  }

  onFirstGesture(): void {
    this.synth.unlock();
  }

  pickExtra(clientX: number, clientY: number): Part | string | null {
    const st = this.stage;
    const r = st.canvas.getBoundingClientRect();
    st.raycaster.setFromCamera(
      { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 } as never,
      st.camera,
    );
    if (this.roomId === 'living') {
      const hit = st.raycaster.intersectObject(this.ball.group, true);
      if (hit.length) return 'ball';
    }
    const room = this.rooms[this.roomId];
    for (const it of room.interactives) {
      if (st.raycaster.intersectObject(it.mesh, true).length) return it.id;
    }
    return null;
  }

  onTapPart(part: Part | null, world: Vector3): void {
    const cat = this.cat;
    this.synth.play('tap');
    if (cat.mode === 'lying') {
      cat.grumble();
      return;
    }
    switch (part) {
      case 'nose':
        cat.play('sneeze');
        break;
      case 'belly':
      case 'body':
        cat.play('giggle');
        break;
      case 'armL':
      case 'armR':
        cat.side = part === 'armR' ? 1 : -1;
        cat.play('highFive');
        break;
      case 'footL':
      case 'footR':
        cat.play('giggle');
        break;
      case 'tail':
        cat.play('tailHuff');
        break;
      case 'head':
        cat.play('pet', { duration: 1.0 });
        cat.fx('hearts', 'head', 2);
        cat.sfx('meowShort');
        break;
      case 'earL':
      case 'earR':
        cat.kickEars(part === 'earL' ? 30 : -30);
        cat.play('wiggle');
        cat.sfx('meowShort');
        break;
      case 'ball':
        this.ball.kick(world.x > this.ball.x + this.camX * 0 ? -3 : 3, 11);
        this.synth.play('hop');
        break;
      default:
        break;
    }
  }

  onTapExtra(_id: string): void {
    /* переопределяется HUD'ом */
  }

  onSlap(dirX: number): void {
    this.cat.slap(dirX);
  }

  onGrab(world: Vector3): void {
    this.cat.grab(world);
  }

  onDrag(world: Vector3): void {
    this.cat.dragTo(world);
  }

  onRelease(vx: number, vy: number): void {
    this.cat.release(vx, vy);
  }

  onPet(): void {
    const cat = this.cat;
    if (cat.mode !== 'stand') return;
    if (cat.actionName !== 'pet') cat.play('pet');
    cat.extend('pet', 0.55);
  }

  onPetEnd(): void {
    this.cat.extend('pet', 0.35);
  }

  onTickle(): void {
    if (this.cat.mode === 'lying') return;
    this.cat.play('laugh', { force: true });
  }

  onDoubleTapFloor(): void {
    this.cat.jump();
  }

  // ---------------- комнаты ----------------
  goToRoom(id: RoomId): void {
    if (id === this.roomId) return;
    this.roomId = id;
    this.cat.stopWalking();
  }

  roomIndex(): number {
    return ROOM_ORDER.indexOf(this.roomId);
  }

  stepRoom(dir: 1 | -1): void {
    const i = clamp(this.roomIndex() + dir, 0, ROOM_ORDER.length - 1);
    this.goToRoom(ROOM_ORDER[i]!);
  }

  get world(): typeof WORLD {
    return WORLD;
  }
}
