import { Vector3 } from 'three';
import { Synth } from './audio/synth';
import { VoiceRepeater } from './audio/voiceRepeat';
import {
  FLOOR_COLORS,
  FOOD_GAIN,
  NEED_IDS,
  SLEEP_GAIN_PER_SEC,
  TIMING,
  TOILET_AFTER_EAT_COST,
  VITAMIN_GAIN,
  WALL_COLORS,
  WORLD,
  type NeedId,
} from './config';
import { CatInput, type InputHost } from './input';
import { getItem, type AccessorySlot } from './logic/catalog';
import { chestReward, chestStatus } from './logic/chest';
import { buy, consumeFood, earn, equip, setFur, setRoomStyle, unequip, type BuyResult } from './logic/economy';
import type { Part } from './logic/gestures';
import { clamp, damp, randRange } from './logic/math';
import { decayNeeds, gain, moodFromNeeds, offlineDecay } from './logic/needs';
import { loadSave, writeSave, type RoomKey, type SaveData } from './logic/save';
import { makeBounds } from './logic/throwPhysics';
import { Cat, type CatEvent, type FxAnchor, type FxName } from './render/cat';
import { buildAccessory } from './render/accessories';
import { Particles } from './render/particles';
import { Ball } from './render/props';
import { createRooms, roomCenterX, ROOM_ORDER, type Room, type RoomId } from './render/rooms';
import { Stage } from './render/stage';
import { Thumbs } from './render/thumbs';

export type GameEvent = 'coins' | 'needs' | 'room' | 'appearance' | 'sleep' | 'inventory' | 'settings';

export class Game implements InputHost {
  readonly stage: Stage;
  readonly thumbs: Thumbs;
  readonly cat = new Cat();
  readonly particles: Particles;
  readonly synth = new Synth();
  readonly rooms: Record<RoomId, Room>;
  readonly input: CatInput;
  readonly ball = new Ball();
  readonly voice: VoiceRepeater;
  save: SaveData;
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
  onUpdate: ((dt: number, now: number) => void)[] = [];
  private listeners = new Map<GameEvent, Set<() => void>>();
  private saveTimer = 0;
  private needsEmit = 0;
  // сон
  sleepRequested = false;
  private night = 0;
  private focus = 0;
  focusTarget = 0;
  // горшок
  private pottyPending = false;
  /** Хук HUD для нажатия на объекты комнаты (холодильник, лампа, ТВ …) */
  onTapExtraHook: ((id: string) => void) | null = null;
  /** Хук для инструментов ванной: если вернёт true — касание обработано */
  toolActive = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.save = loadSave();
    this.stage = new Stage(canvas);
    this.thumbs = new Thumbs(this.stage.renderer);
    this.particles = new Particles(this.stage.scene);
    const wall = {} as Record<RoomId, number>;
    const floor = {} as Record<RoomId, number>;
    for (const r of ROOM_ORDER) {
      wall[r] = WALL_COLORS.find((w) => w.id === this.save.wall[r as RoomKey])?.color ?? WALL_COLORS[0].color;
      floor[r] = FLOOR_COLORS.find((f) => f.id === this.save.floor[r as RoomKey])?.color ?? FLOOR_COLORS[0].color;
    }
    this.rooms = createRooms(wall, floor);
    for (const r of ROOM_ORDER) this.stage.scene.add(this.rooms[r].group);
    this.rooms.living.group.add(this.ball.group);
    this.ball.onBounce = (s) => this.synth.play('boop', Math.min(1, s / 12));
    this.stage.scene.add(this.cat.group);
    this.cat.setBounds(makeBounds());
    this.cat.resetToStand(0);
    this.applyAppearance();
    this.cat.onEvent = (e) => this.onCatEvent(e);
    this.cat.onActionEnd = (n) => this.onCatActionEnd(n);
    this.voice = new VoiceRepeater(this);
    this.input = new CatInput(this);
    this.input.attach(canvas);
    this.synth.setVolume(this.save.settings.volume);

    // шкалы за время отсутствия: падают максимум до 40%
    const now = Date.now();
    offlineDecay(this.save.needs, now - this.save.lastSeen);
    this.save.lastSeen = now;
    this.cat.mood = moodFromNeeds(this.save.needs);

    window.addEventListener('resize', () => this.stage.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.stage.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.persist();
        this.pause();
      } else {
        this.onReturn();
        this.resume();
      }
    });
    window.addEventListener('pagehide', () => this.persist());
  }

  // ---------------- события для HUD ----------------
  on(ev: GameEvent, fn: () => void): void {
    let s = this.listeners.get(ev);
    if (!s) this.listeners.set(ev, (s = new Set()));
    s.add(fn);
  }
  emit(ev: GameEvent): void {
    this.listeners.get(ev)?.forEach((f) => f());
  }

  /** Возвращение в игру: шкалы за время отсутствия. */
  private onReturn(): void {
    const now = Date.now();
    offlineDecay(this.save.needs, now - this.save.lastSeen);
    this.save.lastSeen = now;
    this.emit('needs');
  }

  /** true после сброса прогресса — чтобы pagehide не записал старое сохранение обратно */
  resetting = false;

  persist(): void {
    if (this.resetting) return;
    this.save.lastSeen = Date.now();
    writeSave(this.save);
  }

  // ---------------- цикл ----------------
  start(): void {
    this.running = false;
    this.resume();
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.synth.play('purrStop');
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
      this.tick(dt, performance.now());
    };
    this.raf = requestAnimationFrame(loop);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get sleeping(): boolean {
    return this.cat.mode === 'lying';
  }

  tick(dt: number, now: number): void {
    this.frame++;
    const target = roomCenterX(this.roomId);
    this.camX = Math.abs(this.camX - target) < 0.002 ? target : damp(this.camX, target, 9, dt);
    this.stage.setCameraX(this.camX);
    this.focus = damp(this.focus, this.focusTarget, 9, dt);
    this.stage.setFocusShift(this.focus);
    this.input.update(dt, now);
    this.updateSleep(dt);
    this.cat.update(dt, this.camX);
    for (const r of ROOM_ORDER) this.rooms[r].update(dt);
    if (this.roomId === 'living') this.updateBall(dt);
    this.particles.update(dt);
    this.tickNeeds(dt);
    // пена высыхает, если кота не смыли и он ушёл из ванной
    if (this.cat.foam > 0 && this.roomId !== 'bath') this.cat.setFoam(this.cat.foam - dt * 0.05);
    for (const f of this.onUpdate) f(dt, now);
    this.stage.render();
    this.saveTimer += dt * 1000;
    if (this.saveTimer >= TIMING.saveIntervalMs) {
      this.saveTimer = 0;
      this.persist();
    }
  }

  // ---------------- шкалы ----------------
  private tickNeeds(dt: number): void {
    const n = this.save.needs;
    const sleeping = this.sleeping;
    decayNeeds(n, dt / 60, sleeping);
    if (sleeping) gain(n, 'sleep', SLEEP_GAIN_PER_SEC * dt);
    this.cat.mood = damp(this.cat.mood, moodFromNeeds(n), 1.5, dt);
    this.needsEmit += dt;
    if (this.needsEmit > 0.25) {
      this.needsEmit = 0;
      this.emit('needs');
    }
  }

  addNeed(id: NeedId, amount: number): void {
    gain(this.save.needs, id, amount);
    this.emit('needs');
  }

  addCoins(n: number): void {
    earn(this.save, n);
    this.emit('coins');
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
    if (cat.mode !== 'stand' || cat.busy || this.ballActiveFor <= 0 || this.inputLocks > 0) return;
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
      this.addNeed('fun', 1.5);
      this.particles.burst('spark', { x: ball.x + this.camX, y: ball.y, z: 1.2 }, 3, 2, { life: 0.5, size: 0.3 });
    }
  }

  // ---------------- события кота: звук и частицы ----------------
  private onCatEvent(e: CatEvent): void {
    if (e.kind === 'sfx') this.synth.play(e.name, e.arg);
    else if (e.kind === 'fx') this.fx(e.name, e.at, e.n ?? 3);
  }

  private onCatActionEnd(name: string): void {
    if (name === 'potty' && this.pottyPending) {
      this.pottyPending = false;
      this.save.needs.toilet = 100;
      this.addNeed('fun', 3);
    }
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
          P.spawn('drop', { x: base.x, y: base.y - 0.35, z: base.z }, { x: rnd(-1.2, 1.2), y: rnd(-2.2, 0.2), z: rnd(2, 5) }, { life: 0.6, size: rnd(0.1, 0.2), gravity: 8 });
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
    return this.inputLocks === 0 && !this.toolActive;
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
        this.addNeed('fun', 1);
        break;
      case 'belly':
      case 'body':
        cat.play('giggle');
        this.addNeed('fun', 2);
        break;
      case 'armL':
      case 'armR':
        cat.side = part === 'armR' ? 1 : -1;
        cat.play('highFive');
        this.addNeed('fun', 2);
        break;
      case 'footL':
      case 'footR':
        cat.play('giggle');
        this.addNeed('fun', 1);
        break;
      case 'tail':
        cat.play('tailHuff');
        break;
      case 'head':
        cat.play('pet', { duration: 1.0 });
        cat.fx('hearts', 'head', 2);
        cat.sfx('meowShort');
        this.addNeed('fun', 1);
        break;
      case 'earL':
      case 'earR':
        cat.kickEars(part === 'earL' ? 30 : -30);
        cat.play('wiggle');
        cat.sfx('meowShort');
        break;
      case 'ball':
        this.ball.kick(world.x > this.ball.x ? -3 : 3, 11);
        this.synth.play('hop');
        break;
      default:
        break;
    }
  }

  onTapExtra(id: string): void {
    if (this.sleeping && id !== 'lamp') return;
    this.onTapExtraHook?.(id);
  }

  onSlap(dirX: number): void {
    if (this.sleeping) return;
    this.cat.slap(dirX);
    this.addNeed('fun', 2);
  }

  onGrab(world: Vector3): void {
    this.cat.grab(world);
  }

  onDrag(world: Vector3): void {
    this.cat.dragTo(world);
  }

  onRelease(vx: number, vy: number): void {
    this.cat.release(vx, vy);
    if (Math.hypot(vx, vy) > 8) this.addNeed('fun', 3);
  }

  onPet(dist: number): void {
    const cat = this.cat;
    if (cat.mode !== 'stand') return;
    if (cat.actionName !== 'pet') cat.play('pet');
    cat.extend('pet', 0.55);
    this.addNeed('fun', dist * 0.02);
  }

  onPetEnd(): void {
    this.cat.extend('pet', 0.35);
  }

  onTickle(): void {
    if (this.cat.mode === 'lying') return;
    this.cat.play('laugh', { force: true });
    this.addNeed('fun', 6);
  }

  onDoubleTapFloor(): void {
    this.cat.jump();
  }

  // ---------------- еда и лекарство ----------------
  /** Покормить. Возвращает false, если порций не осталось. */
  feed(foodId: string): boolean {
    const item = getItem(foodId);
    if (!item || item.kind !== 'food' || this.sleeping) return false;
    if (!consumeFood(this.save, foodId)) return false;
    const fav = this.save.favoriteFood === foodId;
    const amount = fav ? FOOD_GAIN.favorite : item.disliked ? FOOD_GAIN.disliked : FOOD_GAIN.normal;
    this.addNeed('food', amount);
    this.save.needs.toilet = clamp(this.save.needs.toilet - TOILET_AFTER_EAT_COST, 0, 100);
    this.cat.stopWalking();
    this.cat.play(fav ? 'eatFavorite' : item.disliked ? 'eatDisliked' : 'eat', { force: true });
    this.emit('inventory');
    return true;
  }

  /** Витаминка из аптечки — единственное, что лечит. */
  giveVitamin(): void {
    if (this.sleeping) return;
    this.addNeed('health', VITAMIN_GAIN);
    this.cat.stopWalking();
    this.cat.play('eat', { force: true });
    this.fx('sparkle', 'head', 6);
    this.synth.play('sparkle');
  }

  // ---------------- горшок ----------------
  usePotty(): void {
    const cat = this.cat;
    if (this.sleeping || cat.mode !== 'stand' || cat.actionName === 'potty') return;
    const x = 2.2;
    this.pottyPending = true;
    cat.walkTo(x, () => {
      cat.play('potty', { force: true });
    });
  }


  // ---------------- внешний вид: покупки и гардероб ----------------
  /** Применяет к коту и комнатам то, что записано в сохранении. */
  applyAppearance(): void {
    const s = this.save;
    this.cat.setFur(s.fur);
    for (const slot of ['hat', 'glasses', 'bow', 'scarf'] as AccessorySlot[]) {
      const id = s.equipped[slot];
      this.cat.setAccessory(slot, id ? buildAccessory(id) : null);
    }
    for (const r of ROOM_ORDER) {
      const w = WALL_COLORS.find((x) => x.id === s.wall[r as RoomKey]);
      const f = FLOOR_COLORS.find((x) => x.id === s.floor[r as RoomKey]);
      if (w) this.rooms[r].setWall(w.color);
      if (f) this.rooms[r].setFloor(f.color);
    }
    this.emit('appearance');
  }

  /** Примерка: показывает предмет, не покупая и не сохраняя. */
  previewItem(id: string): void {
    const item = getItem(id);
    if (!item) return;
    switch (item.kind) {
      case 'hat':
      case 'glasses':
      case 'bow':
      case 'scarf':
        this.cat.setAccessory(item.kind, buildAccessory(id));
        break;
      case 'fur':
        this.cat.setFur(id);
        break;
      case 'wall':
        this.rooms[this.roomId].setWall(item.color ?? 0xffffff);
        break;
      case 'floor':
        this.rooms[this.roomId].setFloor(item.color ?? 0xffffff);
        break;
      default:
        break;
    }
  }

  /** Купить предмет (монеты из сохранения), сразу надеть/применить. */
  buyItem(id: string): BuyResult {
    const res = buy(this.save, id);
    if (res.ok) {
      this.applyOwned(id);
      this.synth.play('coin');
      this.persist();
      this.emit('coins');
      this.emit('inventory');
    } else if (res.reason === 'poor') this.synth.play('boop');
    return res;
  }

  private applyOwned(id: string): void {
    const item = getItem(id);
    if (!item) return;
    const room = this.roomId as RoomKey;
    if (item.kind === 'fur') setFur(this.save, id);
    else if (item.kind === 'wall' || item.kind === 'floor') setRoomStyle(this.save, item.kind, room, id);
    else if (item.kind !== 'food') equip(this.save, id);
    this.applyAppearance();
    if (item.kind !== 'food' && this.cat.mode === 'stand') this.cat.play('newClothes', { force: true });
  }

  /** Гардероб: надеть/снять (для купленного). */
  toggleItem(id: string): void {
    const item = getItem(id);
    if (!item || !this.save.owned.includes(id)) return;
    if (item.kind === 'hat' || item.kind === 'glasses' || item.kind === 'bow' || item.kind === 'scarf') {
      if (this.save.equipped[item.kind] === id) unequip(this.save, item.kind);
      else equip(this.save, id);
      this.applyAppearance();
      if (this.save.equipped[item.kind] === id && this.cat.mode === 'stand') this.cat.play('newClothes', { force: true });
    } else this.applyOwned(id);
    this.synth.play('chime');
    this.persist();
  }

  setFocus(f: number): void {
    this.focusTarget = f;
  }

  // ---------------- сундучок ----------------
  chest(): { ready: boolean; remainingMs: number } {
    const st = chestStatus(this.save.lastChestAt, Date.now());
    if (st.clockWentBack) this.save.lastChestAt = Date.now();
    return st;
  }

  openChest(): number {
    const st = this.chest();
    if (!st.ready) {
      this.synth.play('sleepyTick');
      return 0;
    }
    const reward = chestReward();
    this.save.lastChestAt = Date.now();
    this.addCoins(reward);
    this.coinBurst(Math.min(24, 8 + Math.round(reward / 8)));
    this.synth.play('fanfare');
    if (this.cat.mode === 'stand') this.cat.play('cheer', { force: true });
    this.persist();
    return reward;
  }

  /** Фонтан монет-спрайтов над котом. */
  coinBurst(n: number): void {
    const p = this.cat.anchorWorld('head', this.tmp);
    for (let i = 0; i < n; i++) {
      this.particles.spawn(
        'coin',
        { x: p.x + randRange(-0.6, 0.6), y: p.y + 0.5, z: 1.5 },
        { x: randRange(-3, 3), y: randRange(5, 9), z: 0 },
        { life: 1.4, size: 0.6, gravity: 14, fade: false },
      );
    }
  }

  /** Салют из искр. */
  fireworks(): void {
    const cx = this.camX;
    const cols = [0xffd23f, 0xff6b81, 0x6ee7b7, 0x7fd1ff, 0xc9b8ff, 0xffffff];
    for (let k = 0; k < 5; k++) {
      window.setTimeout(() => {
        const x = cx + randRange(-2.8, 2.8);
        const y = randRange(7, 11.5);
        const color = cols[k % cols.length]!;
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          const sp = randRange(3, 5.5);
          this.particles.spawn('spark', { x, y, z: 1.5 }, { x: Math.cos(a) * sp, y: Math.sin(a) * sp, z: 0 }, { life: 1.1, size: 0.5, gravity: 4, drag: 1.5, color });
        }
        this.synth.play('firework');
      }, k * 260);
    }
  }

  // ---------------- сон ----------------
  /** Лампа: выкл → кот идёт спать; вкл → просыпается. */
  setLampOn(on: boolean): void {
    this.rooms.bedroom.setLamp(on);
    this.sleepRequested = !on;
    if (on) {
      if (this.cat.mode === 'lying') this.cat.wakeUp();
    } else this.synth.play('click');
    this.emit('sleep');
  }

  get lampOn(): boolean {
    return this.rooms.bedroom.lamp;
  }

  private updateSleep(dt: number): void {
    const target = this.sleepRequested ? 1 : 0;
    this.night = damp(this.night, target, 2.5, dt);
    this.stage.setNight(this.night);
    const cat = this.cat;
    cat.lightsOff = this.sleepRequested;
    if (this.sleepRequested && cat.mode === 'stand' && !cat.busy && this.roomId === 'bedroom') {
      const bedX = 0.3;
      if (Math.abs(cat.body.x - bedX) < 0.12) {
        cat.lieDown(bedX, 2.75);
        this.emit('sleep');
      } else cat.walkTo(bedX);
    }
  }

  // ---------------- комнаты ----------------
  get navLocked(): boolean {
    return this.sleepRequested || this.sleeping;
  }

  goToRoom(id: RoomId): void {
    if (id === this.roomId || this.navLocked) return;
    this.roomId = id;
    this.cat.stopWalking();
    this.pottyPending = false;
    this.emit('room');
  }

  roomIndex(): number {
    return ROOM_ORDER.indexOf(this.roomId);
  }

  stepRoom(dir: 1 | -1): void {
    const i = clamp(this.roomIndex() + dir, 0, ROOM_ORDER.length - 1);
    this.goToRoom(ROOM_ORDER[i]!);
  }

  get needIds(): readonly NeedId[] {
    return NEED_IDS;
  }

  get world(): typeof WORLD {
    return WORLD;
  }
}
