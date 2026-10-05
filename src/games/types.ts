import type { Game } from '../game';

export interface MiniGameCtx {
  game: Game;
  /** Область игры (внутри оверлея, под полосой времени). */
  stage: HTMLElement;
  /** Размер области на момент старта */
  width: number;
  height: number;
  /** Можно вызвать, когда набрано очко (звук/эффект общий). */
  onPoint(): void;
}

export interface MiniGame {
  readonly id: string;
  readonly icon: string;
  /** Результат, при котором награда максимальная */
  readonly goodScore: number;
  score: number;
  start(ctx: MiniGameCtx): void;
  update(dt: number): void;
  stop(): void;
}
