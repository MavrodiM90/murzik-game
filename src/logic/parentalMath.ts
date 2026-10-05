import type { Rng } from './math';

export interface MathProblem {
  a: number;
  b: number;
  answer: number;
}

/** Двузначное × однозначное, например 23×4. */
export function makeProblem(rng: Rng = Math.random): MathProblem {
  const a = 12 + Math.floor(rng() * 88); // 12..99
  const b = 3 + Math.floor(rng() * 7); // 3..9
  return { a, b, answer: a * b };
}

export function checkAnswer(p: MathProblem, input: string): boolean {
  if (!/^\d{1,5}$/.test(input)) return false;
  return parseInt(input, 10) === p.answer;
}
