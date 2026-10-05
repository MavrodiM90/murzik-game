import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, type Scene, type Vector3Like } from 'three';

export type ParticleKind =
  | 'heart'
  | 'star'
  | 'foam'
  | 'crumb'
  | 'drop'
  | 'zzz'
  | 'puff'
  | 'spark'
  | 'coin'
  | 'note';

interface P {
  sprite: Sprite;
  active: boolean;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  grow: number;
  size: number;
  fade: boolean;
}

export interface SpawnOpts {
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  grow?: number;
  color?: number;
  fade?: boolean;
}

function drawKind(kind: ParticleKind): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.translate(48, 48);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (kind) {
    case 'heart': {
      g.fillStyle = '#ff5a7a';
      g.strokeStyle = '#a52a45';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, 30);
      g.bezierCurveTo(-46, -2, -30, -38, 0, -16);
      g.bezierCurveTo(30, -38, 46, -2, 0, 30);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(-16, -14, 7, 4, -0.6, 0, 7);
      g.fill();
      break;
    }
    case 'star':
    case 'spark': {
      g.fillStyle = kind === 'star' ? '#ffd23f' : '#ffffff';
      g.strokeStyle = kind === 'star' ? '#c98a00' : 'rgba(255,255,255,0)';
      g.lineWidth = 5;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 40 : kind === 'star' ? 17 : 12;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      if (kind === 'star') g.stroke();
      break;
    }
    case 'foam': {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.strokeStyle = 'rgba(150,200,255,0.9)';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, 0, 36, 0, 7);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(200,230,255,0.9)';
      g.beginPath();
      g.arc(-12, -12, 9, 0, 7);
      g.fill();
      break;
    }
    case 'crumb': {
      g.fillStyle = '#c98a4b';
      g.strokeStyle = '#7b4a1e';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-26, 6);
      g.lineTo(-8, -26);
      g.lineTo(26, -10);
      g.lineTo(18, 24);
      g.lineTo(-14, 26);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'drop': {
      g.fillStyle = '#7fd0ff';
      g.strokeStyle = '#2f8fd0';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, -38);
      g.bezierCurveTo(34, 2, 30, 36, 0, 36);
      g.bezierCurveTo(-30, 36, -34, 2, 0, -38);
      g.fill();
      g.stroke();
      break;
    }
    case 'zzz': {
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#4a5aa8';
      g.lineWidth = 8;
      g.font = 'bold 76px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeText('Z', 0, 4);
      g.fillText('Z', 0, 4);
      break;
    }
    case 'puff': {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, y, r] of [
        [-14, 6, 20],
        [12, 4, 22],
        [0, -10, 22],
      ] as const) {
        g.beginPath();
        g.arc(x, y, r, 0, 7);
        g.fill();
      }
      break;
    }
    case 'coin': {
      g.fillStyle = '#ffd23f';
      g.strokeStyle = '#b98300';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 36, 0, 7);
      g.fill();
      g.stroke();
      g.strokeStyle = '#e0a800';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, 22, 0, 7);
      g.stroke();
      break;
    }
    case 'note': {
      g.fillStyle = '#6a5acd';
      g.beginPath();
      g.ellipse(-8, 22, 14, 10, -0.4, 0, 7);
      g.fill();
      g.fillRect(2, -34, 7, 56);
      g.beginPath();
      g.moveTo(9, -34);
      g.quadraticCurveTo(36, -22, 26, 0);
      g.quadraticCurveTo(24, -16, 9, -18);
      g.fill();
      break;
    }
  }
  return c;
}

const textures = new Map<ParticleKind, CanvasTexture>();
export function kindTexture(kind: ParticleKind): CanvasTexture {
  let t = textures.get(kind);
  if (!t) {
    t = new CanvasTexture(drawKind(kind));
    t.colorSpace = SRGBColorSpace;
    textures.set(kind, t);
  }
  return t;
}

/** Единый пул спрайтов-частиц: фиксированный размер, при нехватке переиспользуется самый старый. */
export class Particles {
  private pool: P[] = [];
  private cursor = 0;
  private mats = new Map<string, SpriteMaterial>();

  constructor(
    scene: Scene,
    readonly capacity = 200,
  ) {
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite(this.material('spark', 0xffffff));
      sprite.visible = false;
      sprite.renderOrder = 20;
      scene.add(sprite);
      this.pool.push({
        sprite,
        active: false,
        age: 0,
        life: 1,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        drag: 0,
        grow: 0,
        size: 1,
        fade: true,
      });
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  private material(kind: ParticleKind, color: number): SpriteMaterial {
    const key = `${kind}:${color}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new SpriteMaterial({
        map: kindTexture(kind),
        color,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  spawn(kind: ParticleKind, pos: Vector3Like, vel: Vector3Like, o: SpawnOpts = {}): void {
    let p: P | undefined;
    for (let i = 0; i < this.pool.length; i++) {
      const c = this.pool[(this.cursor + i) % this.pool.length]!;
      if (!c.active) {
        p = c;
        this.cursor = (this.cursor + i + 1) % this.pool.length;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.cursor]!;
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    p.active = true;
    p.age = 0;
    p.life = o.life ?? 1.2;
    p.vx = vel.x;
    p.vy = vel.y;
    p.vz = vel.z;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.grow = o.grow ?? 0;
    p.size = o.size ?? 0.5;
    p.fade = o.fade ?? true;
    p.sprite.material = this.material(kind, o.color ?? 0xffffff);
    p.sprite.position.set(pos.x, pos.y, pos.z);
    p.sprite.scale.set(p.size, p.size, 1);
    p.sprite.visible = true;
  }

  burst(kind: ParticleKind, pos: Vector3Like, count: number, speed: number, o: SpawnOpts = {}): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(
        kind,
        pos,
        { x: Math.cos(a) * s, y: Math.sin(a) * s + speed * 0.3, z: (Math.random() - 0.5) * s * 0.3 },
        { ...o, life: (o.life ?? 1) * (0.7 + Math.random() * 0.6) },
      );
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      const d = 1 / (1 + p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      const s = p.sprite;
      s.position.x += p.vx * dt;
      s.position.y += p.vy * dt;
      s.position.z += p.vz * dt;
      const k = p.age / p.life;
      const sc = p.size * (1 + p.grow * k) * (p.fade ? Math.min(1, (1 - k) * 4) : Math.min(1, k * 8));
      s.scale.set(Math.max(0.001, sc), Math.max(0.001, sc), 1);
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.sprite.visible = false;
    }
  }
}
