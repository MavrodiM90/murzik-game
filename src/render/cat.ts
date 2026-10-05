import {
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { COLORS, FUR_VARIANTS, PHYSICS, TIMING, WORLD } from '../config';
import { clamp, damp, lerp, pick, randRange } from '../logic/math';
import { Spring, SpringChain } from '../logic/spring';
import type { Part } from '../logic/gestures';
import { launch, makeBody, makeBounds, nearestUpright, stepBody, type Body, type Bounds } from '../logic/throwPhysics';
import { ACTIONS, IDLE_ACTIONS, type ActionName } from './catActions';
import { kindTexture } from './particles';
import { capsuleGeo, coneGeo, ellipsoidGeo, outlined, ownToonMat, sphereGeo, toonMat, torusGeo, flatMat, cylGeo } from './toon';

export type CatMode = 'stand' | 'held' | 'flying' | 'lying';
export type FxName = 'hearts' | 'stars' | 'sneeze' | 'crumbs' | 'puff' | 'zzz' | 'sweat' | 'sparkle' | 'foam' | 'drops';
export type FxAnchor = 'head' | 'mouth' | 'belly' | 'pawL' | 'pawR' | 'feet' | 'body' | 'nose';
export type CatEvent =
  | { kind: 'sfx'; name: string; arg?: number }
  | { kind: 'fx'; name: FxName; at: FxAnchor; n?: number }
  | { kind: 'state'; name: string };

export const POSE_KEYS = [
  'armLx',
  'armLz',
  'armRx',
  'armRz',
  'legLx',
  'legRx',
  'headX',
  'headY',
  'headZ',
  'bodyX',
  'bodyZ',
  'hop',
  'lidL',
  'lidR',
  'pupilX',
  'pupilY',
  'pupilS',
  'mouth',
  'smile',
  'tongue',
  'earDroop',
  'earL',
  'earR',
  'tailDrive',
  'tailCurl',
  'yaw',
  'look',
] as const;
export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

export function restPose(): Pose {
  return {
    armLx: -0.08,
    armLz: -0.16,
    armRx: -0.08,
    armRz: 0.16,
    legLx: 0,
    legRx: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    bodyX: 0,
    bodyZ: 0,
    hop: 0,
    lidL: 0,
    lidR: 0,
    pupilX: 0,
    pupilY: 0,
    pupilS: 1,
    mouth: 0,
    smile: 0.6,
    tongue: 0,
    earDroop: 0,
    earL: 0,
    earR: 0,
    tailDrive: 0,
    tailCurl: 0,
    yaw: 0,
    look: 1,
  };
}

const RATES: Partial<Record<PoseKey, number>> = {
  legLx: 26,
  legRx: 26,
  armLx: 24,
  armLz: 24,
  armRx: 24,
  armRz: 24,
  lidL: 38,
  lidR: 38,
  mouth: 30,
  pupilX: 24,
  pupilY: 24,
  pupilS: 14,
  yaw: 8,
  hop: 30,
  smile: 14,
  tongue: 20,
  earL: 18,
  earR: 18,
  tailDrive: 22,
  bodyZ: 16,
  headZ: 18,
  headX: 18,
  headY: 14,
};

interface ActiveAction {
  name: ActionName;
  t: number;
  endsAt: number; // Infinity — пока не завершат вручную
  prio: number;
}

const TAIL_SEGMENTS = 7;
const TAIL_REST = [-1.15, 0.2, 0.2, 0.2, 0.2, 0.22, 0.22];

const hiddenMat = new MeshBasicMaterial({ visible: false });

export class Cat {
  readonly group = new Group();
  readonly root = new Group();
  readonly squashG = new Group();
  readonly model = new Group();

  readonly body: Body = makeBody();
  bounds: Bounds = makeBounds();
  mode: CatMode = 'stand';
  /** Человекочитаемое состояние — для тестов и отладки. */
  state = 'idle';
  offsetX = 0;
  dt = 1 / 60;
  /** какая рука даёт «пять»: 1 — правая на экране, -1 — левая */
  side: 1 | -1 = 1;

  p: Pose = restPose();
  cur: Pose = restPose();
  readonly sq = new Spring(240, 13, 1);
  private swing = new Spring(70, 4.5, 0);
  private headWobble = new Spring(110, 8, 0);
  private earL = new Spring(150, 7, 0);
  private earR = new Spring(150, 7, 0);
  private earLx = new Spring(150, 7, 0);
  private earRx = new Spring(150, 7, 0);
  private tail = new SpringChain(TAIL_SEGMENTS, 80, 6.5, 0.8);

  // части
  private head = new Group();
  private armL = new Group();
  private armR = new Group();
  private legL = new Group();
  private legR = new Group();
  private earLG = new Group();
  private earRG = new Group();
  private eyeLG = new Group();
  private eyeRG = new Group();
  private pupilLG = new Group();
  private pupilRG = new Group();
  private lidLG = new Group();
  private lidRG = new Group();
  private mouthG = new Group();
  private mouthIn!: Mesh;
  private tongueM!: Mesh;
  private smileG = new Group();
  private tailSegs: Group[] = [];
  private foamSpots: Mesh[] = [];
  private dizzyStars: Sprite[] = [];
  private noseM!: Mesh;
  readonly shadow: Mesh;
  readonly pickables: Mesh[] = [];
  readonly anchors = {
    hat: new Group(),
    glasses: new Group(),
    bow: new Group(),
    scarf: new Group(),
  };

  private furMat = ownToonMat(COLORS.furOrange);
  private bellyMat = ownToonMat(COLORS.furWhite);
  private stripeMat = ownToonMat(COLORS.stripe);

  // состояние поведения
  private act: ActiveAction | null = null;
  private time = 0;
  private blinkIn = randRange(1.5, 4);
  private blinkT = -1;
  private idleIn = randRange(TIMING.idleMinSec, TIMING.idleMaxSec);
  private lookTarget: Vector3 | null = null;
  private glanceIn = 2;
  private glanceX = 0;
  private glanceY = 0;
  private prevX = 0;
  private prevY = 0;
  private velX = 0;
  private velY = 0;
  private holdTarget = new Vector3();
  private holdOffset = new Vector3();
  walkTarget: number | null = null;
  private onArrive: (() => void) | null = null;
  private walkPhase = 0;
  walking = false;
  runMode = false;
  /** 0..1 — внешний сигнал громкости для «повтора голоса» */
  mouthDrive = 0;
  /** 0..1 — рот приоткрывается, когда еду подносят близко */
  mouthHint = 0;
  onActionEnd: ((name: ActionName) => void) | null = null;
  mood = 0; // 0..1 «чуть-чуть грустит»
  foam = 0; // 0..1
  private sigh = 6;
  strongFlight = false;
  private landRot = 0;
  private maxSpeedInFlight = 0;
  private jumpFlight = false;
  private wasStrongOnLand = false;
  lightsOff = false;
  lyingTarget = { x: 0, y: 1.5, rot: Math.PI / 2 };
  onEvent: ((e: CatEvent) => void) | null = null;
  private tmpV = new Vector3();

  constructor() {
    this.build();
    this.root.add(this.squashG);
    this.squashG.add(this.model);
    this.group.add(this.root);
    const sh = new Mesh(
      new CircleGeometry(1, 28),
      new MeshBasicMaterial({ color: 0x3a2418, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(0, 0.03, 0.25);
    sh.renderOrder = 1;
    this.shadow = sh;
    this.group.add(sh);
    this.setFur('fur_orange');
    this.squashG.position.y = -WORLD.restY;
    this.model.scale.setScalar(WORLD.catScale);
    this.body.y = this.bounds.floorY;
    this.syncTransform();
  }

  // ---------------- построение ----------------
  private pick(parent: Object3D, part: Part, geo: import('three').BufferGeometry, x: number, y: number, z: number): void {
    const m = new Mesh(geo, hiddenMat);
    m.position.set(x, y, z);
    m.userData.part = part;
    parent.add(m);
    this.pickables.push(m);
  }

  private build(): void {
    const m = this.model;
    const fur = this.furMat;
    const white = this.bellyMat;
    const stripe = this.stripeMat;

    // тело
    const body = outlined(ellipsoidGeo(0.78, 0.72, 0.62, 28), fur);
    body.position.set(0, 1.15, 0);
    m.add(body);
    const belly = outlined(ellipsoidGeo(0.55, 0.55, 0.38, 24), white);
    belly.position.set(0, 1.1, 0.34);
    m.add(belly);
    this.pick(m, 'body', ellipsoidGeo(0.95, 0.9, 0.8, 8), 0, 1.15, 0);
    this.pick(m, 'belly', sphereGeo(0.52, 8), 0, 1.1, 0.5);
    // полоски на боках
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const st = outlined(ellipsoidGeo(0.05, 0.2, 0.03, 10), stripe, false);
        st.position.set(s * (0.68 - i * 0.04), 1.35 - i * 0.28, 0.2);
        st.rotation.set(0, s * 0.9, s * (0.5 - i * 0.2));
        m.add(st);
      }
    }

    // ноги
    for (const s of [-1, 1]) {
      const leg = s < 0 ? this.legL : this.legR;
      leg.position.set(s * 0.42, 0.85, 0.05);
      const l = outlined(capsuleGeo(0.27, 0.32), fur);
      l.position.set(0, -0.32, 0);
      leg.add(l);
      const foot = outlined(ellipsoidGeo(0.32, 0.19, 0.44, 18), white);
      foot.position.set(0, -0.66, 0.16);
      leg.add(foot);
      // пальчики
      for (let i = -1; i <= 1; i++) {
        const toe = outlined(sphereGeo(0.075, 8), white, false);
        toe.position.set(i * 0.12, -0.7, 0.55);
        leg.add(toe);
      }
      this.pick(leg, s < 0 ? 'footL' : 'footR', sphereGeo(0.45, 8), 0, -0.6, 0.15);
      m.add(leg);
    }

    // руки
    for (const s of [-1, 1]) {
      const arm = s < 0 ? this.armL : this.armR;
      arm.position.set(s * 0.8, 1.6, 0.18);
      const a = outlined(capsuleGeo(0.2, 0.42), fur);
      a.position.set(0, -0.36, 0);
      arm.add(a);
      const paw = outlined(sphereGeo(0.25, 14), white);
      paw.position.set(0, -0.78, 0.02);
      arm.add(paw);
      this.pick(arm, s < 0 ? 'armL' : 'armR', sphereGeo(0.5, 8), 0, -0.6, 0.02);
      m.add(arm);
    }

    // хвост
    const tailBase = new Group();
    tailBase.position.set(0.35, 0.75, -0.45);
    m.add(tailBase);
    let parent: Object3D = tailBase;
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const g = new Group();
      const r = lerp(0.21, 0.13, i / (TAIL_SEGMENTS - 1));
      const mat = i >= TAIL_SEGMENTS - 2 ? white : fur;
      const seg = outlined(capsuleGeo(r, 0.26), mat);
      seg.position.set(0, 0.17, 0);
      g.add(seg);
      if (i === 2 || i === 4 || i === 6) this.pick(g, 'tail', sphereGeo(0.34, 8), 0, 0.18, 0);
      if (i > 0) g.position.set(0, 0.3, 0);
      parent.add(g);
      this.tailSegs.push(g);
      parent = g;
    }

    // голова
    const head = this.head;
    head.position.set(0, 2.5, 0.05);
    m.add(head);
    const skull = outlined(ellipsoidGeo(1.05, 0.88, 0.95, 32), fur);
    head.add(skull);
    this.pick(head, 'head', ellipsoidGeo(1.2, 1.02, 1.1, 8), 0, 0, 0);
    // мордочка
    const muzzle = outlined(ellipsoidGeo(0.5, 0.34, 0.34, 20), white, false);
    muzzle.position.set(0, -0.3, 0.6);
    head.add(muzzle);
    // полоски на лбу
    for (let i = -1; i <= 1; i++) {
      const st = outlined(ellipsoidGeo(0.06, 0.2, 0.03, 10), stripe, false);
      st.position.set(i * 0.22, 0.74 - Math.abs(i) * 0.04, 0.5 - Math.abs(i) * 0.04);
      st.rotation.set(-0.95, 0, -i * 0.25);
      head.add(st);
    }
    // щёчки
    for (const s of [-1, 1]) {
      const bl = new Mesh(ellipsoidGeo(0.17, 0.1, 0.03, 12), toonMat(COLORS.blush));
      bl.position.set(s * 0.66, -0.18, 0.7);
      bl.rotation.y = s * 0.75;
      head.add(bl);
    }
    // уши
    for (const s of [-1, 1]) {
      const g = s < 0 ? this.earLG : this.earRG;
      g.position.set(s * 0.64, 0.7, -0.04);
      const ear = outlined(coneGeo(0.4, 0.82, 0.55), fur);
      g.add(ear);
      const inner = new Mesh(coneGeo(0.26, 0.58, 0.4), toonMat(COLORS.earInner));
      inner.position.set(0, 0.04, 0.1);
      g.add(inner);
      this.pick(g, s < 0 ? 'earL' : 'earR', sphereGeo(0.45, 8), 0, 0.35, 0);
      head.add(g);
    }
    // глаза
    for (const s of [-1, 1]) {
      const eye = s < 0 ? this.eyeLG : this.eyeRG;
      eye.position.set(s * 0.4, 0.15, 0.78);
      const white = outlined(ellipsoidGeo(0.3, 0.37, 0.22, 20), toonMat(COLORS.eyeWhite));
      eye.add(white);
      const pg = s < 0 ? this.pupilLG : this.pupilRG;
      pg.position.set(0, 0, 0.17);
      const pupil = new Mesh(ellipsoidGeo(0.18, 0.24, 0.07, 16), flatMat(COLORS.pupil));
      pg.add(pupil);
      const h1 = new Mesh(sphereGeo(0.065, 10), flatMat(0xffffff));
      h1.position.set(0.07, 0.1, 0.07);
      pg.add(h1);
      const h2 = new Mesh(sphereGeo(0.032, 8), flatMat(0xffffff));
      h2.position.set(-0.07, -0.08, 0.07);
      pg.add(h2);
      eye.add(pg);
      // веко: ресайз по Y от верхнего края глаза
      const lid = s < 0 ? this.lidLG : this.lidRG;
      lid.position.set(0, 0.37, 0.005);
      const lidMesh = new Mesh(ellipsoidGeo(0.325, 0.4, 0.245, 20), fur);
      lidMesh.position.set(0, -0.37, 0);
      lid.add(lidMesh);
      lid.scale.y = 0.001;
      lid.visible = false;
      eye.add(lid);
      head.add(eye);
    }
    // нос
    this.noseM = outlined(ellipsoidGeo(0.14, 0.1, 0.1, 12), toonMat(COLORS.nose), false);
    this.noseM.position.set(0, -0.2, 0.93);
    head.add(this.noseM);
    this.pick(head, 'nose', sphereGeo(0.36, 8), 0, -0.2, 0.9);
    // рот
    this.mouthG.position.set(0, -0.42, 0.9);
    this.mouthIn = new Mesh(ellipsoidGeo(0.26, 0.22, 0.08, 16), flatMat(COLORS.mouthInside));
    this.mouthIn.visible = false;
    this.mouthG.add(this.mouthIn);
    this.tongueM = new Mesh(ellipsoidGeo(0.15, 0.09, 0.05, 10), flatMat(COLORS.tongue));
    this.tongueM.position.set(0, -0.08, 0.05);
    this.tongueM.visible = false;
    this.mouthG.add(this.tongueM);
    for (const s of [-1, 1]) {
      const arc = new Mesh(torusGeo(0.1, 0.018, Math.PI, 14), flatMat(COLORS.pupil));
      arc.position.set(s * 0.1, 0.09, 0.02);
      arc.rotation.z = Math.PI;
      this.smileG.add(arc);
    }
    this.mouthG.add(this.smileG);
    head.add(this.mouthG);
    // усы
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const w = new Group();
        w.position.set(s * 0.44, -0.27 + i * -0.06, 0.8);
        w.rotation.set(0, s * 0.35, s * (0.12 * i) * -1);
        const whisker = new Mesh(cylGeo(0.012, 0.012, 0.75, 5), flatMat(0x3a2a2a));
        whisker.rotation.z = Math.PI / 2;
        whisker.position.x = s * 0.37;
        w.add(whisker);
        head.add(w);
      }
    }
    // якоря для аксессуаров
    this.anchors.hat.position.set(0, 0.8, 0.02);
    head.add(this.anchors.hat);
    this.anchors.glasses.position.set(0, 0.15, 1.02);
    head.add(this.anchors.glasses);
    this.anchors.bow.position.set(0.72, 0.62, 0.3);
    head.add(this.anchors.bow);
    this.anchors.scarf.position.set(0, 1.72, 0.02);
    m.add(this.anchors.scarf);

    // пена (для ванной)
    for (let i = 0; i < 26; i++) {
      const f = new Mesh(sphereGeo(0.17 + (i % 4) * 0.04, 10), flatMat(0xffffff));
      f.visible = false;
      f.userData.k = i / 26;
      const th = i * 2.399;
      const r = 0.55 + (i % 5) * 0.08;
      if (i < 14) f.position.set(Math.cos(th) * r * 1.1, 1.15 + Math.sin(i * 1.7) * 0.5, 0.45 + Math.abs(Math.sin(th)) * 0.2);
      else f.position.set(Math.cos(th) * 0.8, 2.5 + Math.sin(th * 1.3) * 0.6, 0.5 + Math.abs(Math.cos(th)) * 0.4);
      f.userData.attach = i < 14 ? 'body' : 'head';
      (i < 14 ? m : head).add(f);
      if (i >= 14) f.position.y -= 2.5;
      this.foamSpots.push(f);
    }
    // звёздочки головокружения
    for (let i = 0; i < 4; i++) {
      const sp = new Sprite(new SpriteMaterial({ map: kindTexture('star'), transparent: true, depthWrite: false }));
      sp.scale.setScalar(0.5);
      sp.visible = false;
      head.add(sp);
      this.dizzyStars.push(sp);
    }
  }

  setFur(id: string): void {
    const v = FUR_VARIANTS.find((f) => f.id === id) ?? FUR_VARIANTS[0];
    this.furMat.color.setHex(v.fur);
    this.bellyMat.color.setHex(v.belly);
    this.stripeMat.color.setHex(v.stripe);
  }

  setAccessory(slot: keyof Cat['anchors'], obj: Object3D | null): void {
    const a = this.anchors[slot];
    while (a.children.length) a.remove(a.children[0]!);
    if (obj) a.add(obj);
  }

  // ---------------- события ----------------
  emit(e: CatEvent): void {
    this.onEvent?.(e);
  }
  sfx(name: string, arg?: number): void {
    this.emit({ kind: 'sfx', name, arg });
  }
  fx(name: FxName, atA: FxAnchor, n?: number): void {
    this.emit({ kind: 'fx', name, at: atA, n });
  }

  /** Мировая позиция опорных точек кота (для частиц и перетаскивания еды ко рту). */
  anchorWorld(a: FxAnchor, out: Vector3): Vector3 {
    this.group.updateMatrixWorld(true);
    switch (a) {
      case 'head':
        return this.head.localToWorld(out.set(0, 1.0, 0.3));
      case 'mouth':
        return this.mouthG.localToWorld(out.set(0, 0, 0.1));
      case 'nose':
        return this.head.localToWorld(out.set(0, -0.2, 1.0));
      case 'belly':
        return this.model.localToWorld(out.set(0, 1.1, 0.8));
      case 'pawL':
        return this.armL.localToWorld(out.set(0, -0.8, 0.3));
      case 'pawR':
        return this.armR.localToWorld(out.set(0, -0.8, 0.3));
      case 'feet':
        return this.model.localToWorld(out.set(0, 0.1, 0.5));
      default:
        return this.model.localToWorld(out.set(0, 1.3, 0.7));
    }
  }

  // ---------------- управление ----------------
  setBounds(b: Bounds): void {
    this.bounds = b;
  }

  lookAt(target: Vector3 | null): void {
    if (target) {
      if (!this.lookTarget) this.lookTarget = new Vector3();
      this.lookTarget.copy(target);
    } else this.lookTarget = null;
  }

  get busy(): boolean {
    return this.act !== null;
  }
  get actionName(): ActionName | null {
    return this.act?.name ?? null;
  }

  play(name: ActionName, opts: { force?: boolean; duration?: number } = {}): boolean {
    const def = ACTIONS[name];
    if (this.act && !opts.force && this.act.prio > def.prio) return false;
    if (this.mode === 'held' || this.mode === 'flying') {
      if (!def.allowAirborne) return false;
    }
    if (this.mode === 'lying' && !def.allowLying) return false;
    this.endAction();
    this.act = { name, t: 0, endsAt: opts.duration ?? def.dur, prio: def.prio };
    this.state = name;
    def.start?.(this);
    this.emit({ kind: 'state', name });
    return true;
  }

  extend(name: ActionName, seconds: number): void {
    if (this.act && this.act.name === name) this.act.endsAt = this.act.t + seconds;
  }

  endAction(name?: ActionName): void {
    if (!this.act || (name && this.act.name !== name)) return;
    const ended = this.act.name;
    ACTIONS[ended].end?.(this);
    this.act = null;
    this.onActionEnd?.(ended);
    this.state = this.mode === 'lying' ? 'sleep' : 'idle';
    this.idleIn = randRange(TIMING.idleMinSec, TIMING.idleMaxSec);
  }

  walkTo(x: number, onArrive?: () => void, run = false): void {
    if (this.mode !== 'stand') return;
    this.walkTarget = clamp(x, this.bounds.minX, this.bounds.maxX);
    this.onArrive = onArrive ?? null;
    this.runMode = run;
  }
  stopWalking(): void {
    this.walkTarget = null;
    this.onArrive = null;
    this.walking = false;
  }

  grab(world: Vector3): void {
    if (this.mode === 'lying') return;
    this.stopWalking();
    this.endAction();
    this.mode = 'held';
    this.holdOffset.set(this.body.x - world.x, clamp(this.body.y - world.y, -1.2, 1.2), 0);
    this.holdTarget.copy(world);
    this.body.settled = false;
    this.body.vx = this.body.vy = 0;
    this.state = 'held';
    this.setDizzy(false);
    this.emit({ kind: 'state', name: 'held' });
    this.sfx('wee', 0.5);
  }

  dragTo(world: Vector3): void {
    if (this.mode === 'held') this.holdTarget.copy(world);
  }

  release(vx: number, vy: number): void {
    if (this.mode !== 'held') return;
    this.mode = 'flying';
    this.jumpFlight = false;
    this.maxSpeedInFlight = 0;
    launch(this.body, vx, vy);
    const sp = Math.hypot(vx, vy);
    this.body.omega = clamp(-vx * 0.45 + (Math.abs(vx) < 1 ? 2.5 : 0), -PHYSICS.maxSpin, PHYSICS.maxSpin);
    this.strongFlight = sp > 9;
    this.state = 'flying';
    this.emit({ kind: 'state', name: 'flying' });
    if (sp > 5) this.sfx('whoosh', Math.min(1, sp / 25));
  }

  /** Шлепок — комичный кувырок. */
  slap(dirX: number): void {
    if (this.mode === 'lying') return;
    this.stopWalking();
    this.endAction();
    this.mode = 'flying';
    this.jumpFlight = false;
    this.maxSpeedInFlight = 0;
    const d = dirX >= 0 ? 1 : -1;
    launch(this.body, d * 8.5, 13);
    this.body.omega = -d * 9;
    this.strongFlight = false;
    this.state = 'tumble';
    this.emit({ kind: 'state', name: 'tumble' });
    this.sfx('whoosh', 0.8);
    this.sfx('boing');
    this.fx('stars', 'body', 3);
  }

  jump(power = 17): void {
    if (this.mode !== 'stand') return;
    this.stopWalking();
    this.endAction();
    this.sq.value = 0.72;
    this.mode = 'flying';
    this.jumpFlight = true;
    this.maxSpeedInFlight = 0;
    launch(this.body, 0, power);
    this.body.omega = 0;
    this.strongFlight = false;
    this.state = 'jump';
    this.emit({ kind: 'state', name: 'jump' });
    this.sfx('boing');
  }

  lieDown(x: number, y: number): void {
    this.stopWalking();
    this.endAction();
    this.mode = 'lying';
    this.lyingTarget.x = x;
    this.lyingTarget.y = y;
    this.play('sleep', { force: true });
  }

  wakeUp(): void {
    if (this.mode !== 'lying') return;
    this.mode = 'stand';
    this.endAction();
    this.play('wake', { force: true });
  }

  /** Тап по спящему */
  grumble(): void {
    if (this.mode === 'lying') this.play('grumble', { force: true });
  }

  setFoam(v: number): void {
    this.foam = clamp(v, 0, 1);
    for (const f of this.foamSpots) f.visible = f.userData.k < this.foam;
  }

  private setDizzy(on: boolean): void {
    for (const s of this.dizzyStars) s.visible = on;
  }

  /** Принудительный возврат к стоячему состоянию (смена комнаты, пауза и т.п.). */
  resetToStand(x = 0): void {
    this.mode = 'stand';
    this.endAction();
    this.stopWalking();
    this.body.x = x;
    this.body.y = this.bounds.floorY;
    this.body.vx = this.body.vy = this.body.omega = 0;
    this.body.rot = 0;
    this.body.settled = true;
    this.setDizzy(false);
    this.state = 'idle';
  }

  // ---------------- обновление ----------------
  set(key: PoseKey, v: number, w = 1): void {
    this.p[key] = w >= 1 ? v : lerp(this.p[key], v, w);
  }

  update(dt: number, camX: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.dt = dt;
    this.offsetX = camX;
    const b = this.body;

    // --- режимы движения ---
    this.walking = false;
    if (this.mode === 'held') {
      const tx = clamp(this.holdTarget.x + this.holdOffset.x, this.bounds.minX, this.bounds.maxX);
      const ty = clamp(this.holdTarget.y + this.holdOffset.y, this.bounds.floorY, this.bounds.maxY);
      b.x = damp(b.x, tx, 26, dt);
      b.y = damp(b.y, ty, 26, dt);
      b.rot = damp(b.rot, 0, 6, dt);
    } else if (this.mode === 'flying') {
      const impacts = stepBody(b, dt, this.bounds);
      const sp = Math.hypot(b.vx, b.vy);
      this.maxSpeedInFlight = Math.max(this.maxSpeedInFlight, sp);
      for (const im of impacts) {
        if (im.kind === 'floor' && im.speed > 4) {
          this.sq.value = 1 - Math.min(0.38, im.speed * 0.025);
          this.sq.vel = 0;
          this.sfx('boom', Math.min(1, im.speed / 24));
          this.fx('puff', 'feet', 2);
          if (im.speed > 12) this.fx('stars', 'feet', 2);
        } else if (im.kind === 'wall' && im.speed > 3) {
          this.sq.value = 0.82;
          this.sfx('thud', Math.min(1, im.speed / 20));
          this.earL.kick(10);
          this.earR.kick(-10);
        }
      }
      this.sq.target = 1 + Math.min(0.12, sp * 0.004);
      if (b.settled) this.land();
    } else if (this.mode === 'lying') {
      b.x = damp(b.x, this.lyingTarget.x, 6, dt);
      b.y = damp(b.y, this.lyingTarget.y, 6, dt);
      b.rot = damp(b.rot, this.lyingTarget.rot, 6, dt);
    } else {
      // стоит / идёт
      if (this.walkTarget !== null && !this.act) {
        const dx = this.walkTarget - b.x;
        if (Math.abs(dx) < 0.06) {
          const cb = this.onArrive;
          this.stopWalking();
          cb?.();
        } else {
          const speed = this.runMode ? 4.8 : 3.0;
          b.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
          this.walking = true;
          this.walkPhase += dt * (this.runMode ? 15 : 10);
          this.p.yaw = Math.sign(dx) * 0.55;
        }
      }
      b.y = this.bounds.floorY;
      if (this.act?.name !== 'getup' && this.act?.name !== 'dizzy') b.rot = damp(b.rot, 0, 10, dt);
    }

    // скорость для физики ушей/хвоста
    const vx = (b.x - this.prevX) / dt;
    const vy = (b.y - this.prevY) / dt;
    const ax = (vx - this.velX) / dt;
    const ay = (vy - this.velY) / dt;
    this.prevX = b.x;
    this.prevY = b.y;
    this.velX = vx;
    this.velY = vy;
    if (this.mode === 'held') {
      this.swing.target = clamp(-vx * 0.07, -0.9, 0.9);
    } else if (this.mode === 'flying') {
      this.swing.target = 0;
    } else {
      this.swing.target = 0;
    }
    const kickX = clamp(ax * 0.0009, -0.6, 0.6);
    const kickY = clamp(ay * 0.0007, -0.6, 0.6);
    this.earL.kick(-kickX * 40 + kickY * 25);
    this.earR.kick(-kickX * 40 - kickY * 25);
    this.earLx.kick(-kickY * 30);
    this.earRx.kick(-kickY * 30);
    this.headWobble.kick(-kickX * 25);

    // --- поза ---
    this.p = restPose();
    this.layerIdle(dt);
    this.layerMood(dt);
    if (this.walking) this.layerWalk();
    if (this.mode === 'held') this.layerHeld();
    else if (this.mode === 'flying') this.layerFlying();

    if (this.act) {
      this.act.t += dt;
      const def = ACTIONS[this.act.name];
      const dur = Number.isFinite(this.act.endsAt) ? Math.max(0.001, this.act.endsAt) : def.dur;
      const u = Number.isFinite(dur) ? clamp(this.act.t / dur, 0, 1) : 0;
      def.run(this, this.act.t, u);
      if (this.act.t >= this.act.endsAt) {
        const finished = this.act.name;
        this.endAction();
        ACTIONS[finished].after?.(this);
      }
    } else if (this.mode === 'stand' && !this.walking && !this.lightsOff) {
      this.idleIn -= dt;
      if (this.idleIn <= 0) {
        const name = pick(IDLE_ACTIONS);
        this.play(name);
        this.idleIn = randRange(TIMING.idleMinSec, TIMING.idleMaxSec);
      }
    }

    this.applyPose(dt);
    this.syncTransform();
  }

  private land(): void {
    this.setDizzy(false);
    this.sq.value = Math.min(this.sq.value, 0.7);
    this.sq.target = 1;
    this.sq.vel = 0;
    this.mode = 'stand';
    this.body.y = this.bounds.floorY;
    this.landRot = nearestUpright(this.body.rot);
    const strong = this.strongFlight || this.maxSpeedInFlight > 14 || this.body.bounces >= 3;
    this.wasStrongOnLand = strong;
    if (this.jumpFlight) {
      this.jumpFlight = false;
      this.body.rot = 0;
      this.state = 'idle';
      this.sq.value = 0.8;
      this.sfx('thud', 0.4);
      this.fx('puff', 'feet', 2);
      this.play('wiggle', { force: true });
      return;
    }
    this.play('dizzy', { force: true, duration: strong ? 2.0 : 1.1 });
  }

  get landedRot(): number {
    return this.landRot;
  }
  get strongLanding(): boolean {
    return this.wasStrongOnLand;
  }
  /** Вызывается действиями dizzy/getup. */
  setDizzyStars(on: boolean): void {
    this.setDizzy(on);
  }
  kickEars(v: number): void {
    this.earL.kick(v);
    this.earR.kick(-v);
  }
  kickTail(v: number): void {
    this.tail.kick(v);
  }
  setUprightImmediate(): void {
    this.body.rot = 0;
  }
  easeRotToLanding(): void {
    this.body.rot = damp(this.body.rot, this.landRot, 16, this.dt);
  }
  get time_(): number {
    return this.time;
  }

  private layerIdle(dt: number): void {
    const p = this.p;
    const t = this.time;
    // моргание
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) this.blinkT = 0;
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const k = this.blinkT / 0.15;
      blink = k < 1 ? Math.sin(k * Math.PI) : 0;
      if (k >= 1) {
        this.blinkT = -1;
        this.blinkIn = Math.random() < 0.2 ? 0.25 : randRange(2, 5.5);
      }
    }
    p.lidL = blink;
    p.lidR = blink;
    // дыхание, лёгкое покачивание
    p.headZ = Math.sin(t * 0.9) * 0.025;
    p.tailDrive = Math.sin(t * 1.3) * 0.12;
    p.bodyZ = Math.sin(t * 0.7) * 0.012;
    // взгляд
    this.glanceIn -= dt;
    if (this.glanceIn <= 0) {
      this.glanceIn = randRange(1.5, 4);
      this.glanceX = randRange(-0.7, 0.7);
      this.glanceY = randRange(-0.4, 0.4);
    }
    if (this.lookTarget) {
      const hp = this.anchorWorldFast();
      const dx = (this.lookTarget.x - hp.x) / 4;
      const dy = (this.lookTarget.y - hp.y) / 5;
      p.pupilX = clamp(dx, -1, 1) * 0.1;
      p.pupilY = clamp(dy, -1, 1) * 0.12;
      p.headY += clamp(dx, -1, 1) * 0.28;
      p.headX += -clamp(dy, -1, 1) * 0.16;
    } else {
      p.pupilX = this.glanceX * 0.09;
      p.pupilY = this.glanceY * 0.1;
      p.headY += this.glanceX * 0.1;
    }
  }

  private anchorWorldFast(): Vector3 {
    return this.head.getWorldPosition(this.tmpV);
  }

  private layerMood(dt: number): void {
    const p = this.p;
    if (this.mood > 0.05) {
      p.earDroop = this.mood * 0.85;
      p.headX += this.mood * 0.12;
      p.lidL = Math.max(p.lidL, this.mood * 0.28);
      p.lidR = Math.max(p.lidR, this.mood * 0.28);
      p.smile = lerp(0.6, -0.5, this.mood);
      p.tailDrive *= 0.3;
      p.tailCurl = -this.mood * 0.25;
      this.sigh -= dt;
      if (this.sigh <= 0 && !this.act && this.mode === 'stand') {
        this.sigh = randRange(7, 12);
        this.play('sigh');
      }
    }
  }

  private layerWalk(): void {
    const p = this.p;
    const s = Math.sin(this.walkPhase);
    const amp = this.runMode ? 0.95 : 0.6;
    p.legLx = s * amp;
    p.legRx = -s * amp;
    p.armLx = -s * amp * 0.8 - 0.05;
    p.armRx = s * amp * 0.8 - 0.05;
    p.hop = Math.abs(Math.sin(this.walkPhase)) * (this.runMode ? 0.22 : 0.12);
    p.bodyZ = Math.sin(this.walkPhase) * 0.06;
    p.headZ = -Math.sin(this.walkPhase) * 0.05;
    p.tailDrive = Math.sin(this.walkPhase * 0.5) * 0.3;
    p.mouth = this.runMode ? 0.25 : 0;
    p.smile = 1;
  }

  private layerHeld(): void {
    const p = this.p;
    const t = this.time;
    p.armLz = -2.3 + Math.sin(t * 9) * 0.15;
    p.armRz = 2.3 - Math.sin(t * 9) * 0.15;
    p.legLx = 0.4 + Math.sin(t * 7) * 0.25;
    p.legRx = 0.3 - Math.sin(t * 7) * 0.25;
    p.mouth = 0.35;
    p.smile = 1;
    p.pupilS = 1.15;
    p.look = 0;
    p.headZ += this.swing.value * 0.3;
  }

  private layerFlying(): void {
    const p = this.p;
    const t = this.time;
    const s = Math.sin(t * 16);
    p.armLz = -2.0 - s * 0.5;
    p.armRz = 2.0 + s * 0.5;
    p.legLx = s * 0.9;
    p.legRx = -s * 0.9;
    p.mouth = 0.55;
    p.smile = 1;
    p.pupilS = 1.2;
    p.look = 0;
    p.lidL = p.lidR = 0;
    p.tailDrive = s * 0.4;
  }

  private applyPose(dt: number): void {
    const cur = this.cur;
    const tgt = this.p;
    for (const k of POSE_KEYS) {
      const rate = RATES[k] ?? 14;
      cur[k] = damp(cur[k], tgt[k], rate, dt);
    }
    const c = cur;
    const side = (arm: Group, x: number, z: number): void => {
      arm.rotation.set(x, 0, z);
    };
    side(this.armL, c.armLx, c.armLz);
    side(this.armR, c.armRx, c.armRz);
    this.legL.rotation.x = c.legLx;
    this.legR.rotation.x = c.legRx;

    this.swing.step(dt);
    // голова
    const ww = this.headWobble.step(dt);
    this.head.rotation.set(c.headX, c.headY, c.headZ + ww);
    this.model.rotation.set(c.bodyX, c.yaw, c.bodyZ);
    this.model.position.y = c.hop;

    // уши: пружина + опущенность
    this.earL.target = 0.35 + c.earDroop * 0.75 + c.earL;
    this.earR.target = -(0.35 + c.earDroop * 0.75) + c.earR;
    this.earLx.target = -0.1 - c.earDroop * 0.3;
    this.earRx.target = -0.1 - c.earDroop * 0.3;
    this.earLG.rotation.set(this.earLx.step(dt), 0, this.earL.step(dt));
    this.earRG.rotation.set(this.earRx.step(dt), 0, this.earR.step(dt));

    // хвост
    const rest = TAIL_REST.map((r, i) => r + (i > 0 ? c.tailCurl : 0));
    const drive = c.tailDrive + clamp(-this.velX * 0.05, -0.7, 0.7);
    const ang = this.tail.step(dt, drive, rest);
    for (let i = 0; i < this.tailSegs.length; i++) this.tailSegs[i]!.rotation.z = ang[i]!;

    // глаза
    const lidTarget = Math.max(c.lidL, 0);
    for (const [lid, v] of [
      [this.lidLG, lidTarget],
      [this.lidRG, Math.max(c.lidR, 0)],
    ] as const) {
      const k = clamp(v, 0, 1);
      lid.visible = k > 0.03;
      lid.scale.y = Math.max(0.001, k);
    }
    for (const pg of [this.pupilLG, this.pupilRG]) {
      pg.position.x = c.pupilX;
      pg.position.y = c.pupilY;
      pg.scale.setScalar(c.pupilS);
    }
    // рот
    const mo = clamp(c.mouth + this.mouthDrive * 0.9 + this.mouthHint * 0.75, 0, 1);
    this.mouthIn.visible = mo > 0.07;
    this.mouthIn.scale.set(1 + mo * 0.25, Math.max(0.01, mo), 1);
    this.mouthIn.position.y = -mo * 0.1;
    this.tongueM.visible = c.tongue > 0.1 || mo > 0.5;
    this.tongueM.position.y = -0.08 - mo * 0.1 - c.tongue * 0.15;
    this.smileG.visible = mo <= 0.07;
    this.smileG.scale.y = Math.sign(c.smile || 1) * Math.max(0.35, Math.abs(c.smile));
    this.smileG.position.y = c.smile < 0 ? -0.08 : 0;

    // пена на теле
    if (this.foam > 0) {
      const wob = 1 + Math.sin(this.time * 6) * 0.04;
      for (const f of this.foamSpots) f.scale.setScalar(wob);
    }
    // звёзды головокружения
    if (this.dizzyStars[0]!.visible) {
      for (let i = 0; i < this.dizzyStars.length; i++) {
        const a = this.time * 4 + (i / this.dizzyStars.length) * Math.PI * 2;
        this.dizzyStars[i]!.position.set(Math.cos(a) * 0.95, 1.2 + Math.sin(a * 2) * 0.07, Math.sin(a) * 0.9);
      }
    }
    // squash & stretch
    const sy = this.sq.step(dt);
    const breath = Math.sin(this.time * (this.mode === 'lying' ? 1.4 : 2.2));
    const bsy = sy * (1 + breath * (this.mode === 'lying' ? 0.025 : 0.012));
    const bsx = 1 / Math.sqrt(Math.max(0.2, bsy));
    this.squashG.scale.set(bsx, bsy, bsx);
    if (!this.act && this.mode === 'stand') this.sq.target = 1;
  }

  private syncTransform(): void {
    const b = this.body;
    this.root.position.set(b.x + this.offsetX, b.y, 0);
    this.root.rotation.z = b.rot + (this.mode === 'held' ? this.swing.value : 0);
    // тень на полу
    const h = Math.max(0, b.y - this.bounds.floorY);
    const k = 1 / (1 + h * 0.25);
    this.shadow.position.x = b.x + this.offsetX;
    this.shadow.scale.set(1.5 * k + 0.2, 0.75 * k + 0.1, 1);
    (this.shadow.material as MeshBasicMaterial).opacity = 0.3 * k;
    // из-за поворота shadow.rotation.x = -π/2 масштаб y — это глубина
    this.shadow.scale.set(1.55 * k + 0.2, 1.0 * k + 0.15, 1);
  }
}
