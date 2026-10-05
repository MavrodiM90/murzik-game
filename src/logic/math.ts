export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Экспоненциальное сглаживание, не зависит от частоты кадров. */
export const damp = (cur: number, target: number, rate: number, dt: number): number =>
  lerp(cur, target, 1 - Math.exp(-rate * dt));
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export type Rng = () => number;
/** Детерминированный ГПСЧ для тестов. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (lo: number, hi: number, rng: Rng = Math.random): number => lo + (hi - lo) * rng();
export const pick = <T>(arr: readonly T[], rng: Rng = Math.random): T => arr[Math.floor(rng() * arr.length) % arr.length]!;
