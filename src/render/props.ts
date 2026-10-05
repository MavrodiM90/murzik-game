import { Group, Mesh, TorusGeometry } from 'three';
import { WORLD } from '../config';
import { clamp } from '../logic/math';
import { flatMat, outlined, sphereGeo, toonMat, outlineMat } from './toon';

/** Мяч с простой физикой в плоскости кота. Координаты локальные для комнаты. */
export class Ball {
  readonly group = new Group();
  x = -2.2;
  y = 0.55;
  vx = 0;
  vy = 0;
  readonly r = 0.55;
  private spin = 0;
  private body: Mesh;
  /** Для тестов и звука */
  lastBounceSpeed = 0;
  onBounce: ((speed: number) => void) | null = null;

  constructor() {
    this.body = outlined(sphereGeo(this.r, 20), toonMat(0xff5d73));
    this.group.add(this.body);
    const stripe = new Mesh(new TorusGeometry(this.r * 0.98, 0.07, 8, 28), toonMat(0xffffff));
    this.body.add(stripe);
    const stripe2 = new Mesh(new TorusGeometry(this.r * 0.98, 0.07, 8, 28), toonMat(0xffd23f));
    stripe2.rotation.y = Math.PI / 2;
    this.body.add(stripe2);
    void outlineMat;
    void flatMat;
    this.syncMesh();
  }

  get airborne(): boolean {
    return this.y > this.r + 0.05 || Math.abs(this.vy) > 0.5;
  }

  kick(vx: number, vy: number): void {
    this.vx = clamp(vx, -14, 14);
    this.vy = clamp(vy, -2, 18);
  }

  update(dt: number): void {
    const h = Math.min(dt, 0.05);
    const n = 3;
    for (let i = 0; i < n; i++) this.step(h / n);
    this.syncMesh();
  }

  private step(dt: number): void {
    this.vy -= 30 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const maxX = WORLD.roomHalfWidth - this.r;
    if (this.x > maxX) {
      this.x = maxX;
      this.vx = -this.vx * 0.7;
      this.bounce(Math.abs(this.vx));
    } else if (this.x < -maxX) {
      this.x = -maxX;
      this.vx = -this.vx * 0.7;
      this.bounce(Math.abs(this.vx));
    }
    if (this.y < this.r) {
      this.y = this.r;
      if (this.vy < -1.2) {
        const s = -this.vy;
        this.vy = s * 0.68;
        this.bounce(s);
      } else this.vy = 0;
      this.vx *= Math.exp(-0.9 * dt);
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    if (this.y > WORLD.ceiling - this.r) {
      this.y = WORLD.ceiling - this.r;
      this.vy = -Math.abs(this.vy) * 0.5;
    }
    this.spin += this.vx * dt * 0.9;
  }

  private bounce(speed: number): void {
    this.lastBounceSpeed = speed;
    if (speed > 2) this.onBounce?.(speed);
  }

  private syncMesh(): void {
    this.group.position.set(this.x, this.y, 1.1);
    this.body.rotation.z = -this.spin;
    this.body.rotation.x = this.spin * 0.3;
  }
}
