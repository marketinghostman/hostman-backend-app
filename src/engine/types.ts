/**
 * Core domain types for the Snake engine.
 *
 * The engine is intentionally free of any HTTP / transport concerns so it can
 * be unit-tested in isolation and reused behind different delivery mechanisms.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export type GameStatus = 'running' | 'paused' | 'over';

export interface Cell {
  x: number;
  y: number;
}

export interface GameConfig {
  /** Board width in cells. */
  width: number;
  /** Board height in cells. */
  height: number;
  /** Base tick interval in ms at score 0. */
  baseTickIntervalMs: number;
  /** How much (ms) to shave off the interval per speed level. */
  speedStepMs: number;
  /** Score points required to advance one speed level. */
  pointsPerSpeedLevel: number;
  /** Lower bound for the tick interval so the game stays playable. */
  minTickIntervalMs: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  width: 20,
  height: 20,
  baseTickIntervalMs: 200,
  speedStepMs: 20,
  pointsPerSpeedLevel: 5,
  minTickIntervalMs: 60,
};

export interface GameState {
  id: string;
  config: GameConfig;
  snake: Cell[]; // head is snake[0]
  /** Direction the snake is currently moving. */
  direction: Direction;
  /** Direction queued for the next tick (validated against `direction`). */
  pendingDirection: Direction;
  food: Cell;
  score: number;
  status: GameStatus;
  createdAt: number;
  updatedAt: number;
}

/** Injectable random source so food placement is deterministic in tests. */
export type Rng = () => number;
