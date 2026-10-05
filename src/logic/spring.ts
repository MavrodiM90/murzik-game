/** Пружина с демпфером (semi-implicit Euler), устойчива при больших dt за счёт подшагов. */
export class Spring {
  value: number;
  vel = 0;
  target: number;
  constructor(
    public stiffness = 120,
    public damping = 9,
    initial = 0,
  ) {
    this.value = initial;
    this.target = initial;
  }
  step(dt: number): number {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.stiffness * (this.target - this.value) - this.damping * this.vel;
      this.vel += a * h;
      this.value += this.vel * h;
    }
    if (!Number.isFinite(this.value)) {
      this.value = this.target;
      this.vel = 0;
    }
    return this.value;
  }
  kick(v: number): void {
    this.vel += v;
  }
  reset(v = 0): void {
    this.value = v;
    this.target = v;
    this.vel = 0;
  }
}

/** Цепочка пружин: каждый сегмент тянется за предыдущим, получается «волна» (хвост). */
export class SpringChain {
  readonly springs: Spring[];
  constructor(
    count: number,
    stiffness = 90,
    damping = 7,
    private follow = 0.75,
  ) {
    this.springs = Array.from({ length: count }, () => new Spring(stiffness, damping));
  }
  /** drive — внешнее воздействие на первый сегмент. rest — базовый изгиб каждого сегмента. */
  step(dt: number, drive: number, rest: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.springs.length; i++) {
      const s = this.springs[i]!;
      const r = rest[i] ?? 0;
      if (i === 0) s.target = r + drive;
      else {
        const prev = this.springs[i - 1]!;
        const prevRest = rest[i - 1] ?? 0;
        s.target = r + (prev.value - prevRest) * this.follow;
      }
      out.push(s.step(dt));
    }
    return out;
  }
  kick(v: number): void {
    this.springs.forEach((s, i) => s.kick(v * (1 + i * 0.25)));
  }
}
