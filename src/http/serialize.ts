/**
 * Public projection of game state. Keeps the wire format stable and decoupled
 * from the internal `GameState` shape (which may carry extra bookkeeping).
 */

import type { GameState } from '../engine/types.js';
import { tickIntervalFor } from '../engine/index.js';

export interface PublicGameState {
  id: string;
  width: number;
  height: number;
  snake: { x: number; y: number }[];
  food: { x: number; y: number };
  direction: string;
  score: number;
  status: string;
  /** Current effective tick interval (ms), reflects speed increases. */
  tickIntervalMs: number;
  createdAt: number;
  updatedAt: number;
}

export function serializeGame(state: GameState): PublicGameState {
  return {
    id: state.id,
    width: state.config.width,
    height: state.config.height,
    snake: state.snake.map((c) => ({ x: c.x, y: c.y })),
    food: { x: state.food.x, y: state.food.y },
    direction: state.direction,
    score: state.score,
    status: state.status,
    tickIntervalMs: tickIntervalFor(state),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}
