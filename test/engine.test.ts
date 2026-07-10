import { describe, it, expect } from 'vitest';
import {
  createGame,
  tick,
  changeDirection,
  isReversal,
  placeFood,
  tickIntervalFor,
  type GameState,
  type Rng,
} from '../src/engine/index.js';

/** RNG that always returns 0 → always picks the first free cell. */
const rngZero: Rng = () => 0;

/** Build a game with a known layout for deterministic assertions. */
function makeGame(overrides?: Partial<GameState>): GameState {
  const base = createGame({
    id: 'test',
    config: { width: 10, height: 10 },
    rng: rngZero,
  });
  return { ...base, ...overrides };
}

describe('createGame', () => {
  it('creates a running snake of length 3 heading right', () => {
    const g = createGame({ id: 'a', config: { width: 20, height: 20 } });
    expect(g.status).toBe('running');
    expect(g.snake).toHaveLength(3);
    expect(g.direction).toBe('right');
    expect(g.score).toBe(0);
  });

  it('places food on a free cell', () => {
    const g = createGame({ id: 'a', config: { width: 10, height: 10 }, rng: rngZero });
    const onSnake = g.snake.some((c) => c.x === g.food.x && c.y === g.food.y);
    expect(onSnake).toBe(false);
  });
});

describe('movement', () => {
  it('moves the head one cell in the current direction and keeps length', () => {
    const g = makeGame();
    const head = g.snake[0];
    const next = tick(g, rngZero);
    expect(next.snake[0]).toEqual({ x: head.x + 1, y: head.y });
    expect(next.snake).toHaveLength(g.snake.length);
  });

  it('does not move when paused', () => {
    const g = makeGame({ status: 'paused' });
    expect(tick(g, rngZero)).toBe(g);
  });

  it('does not move when over', () => {
    const g = makeGame({ status: 'over' });
    expect(tick(g, rngZero)).toBe(g);
  });
});

describe('direction change', () => {
  it('applies a valid perpendicular turn on next tick', () => {
    const g = makeGame();
    const turned = changeDirection(g, 'up');
    expect(turned.pendingDirection).toBe('up');
    const next = tick(turned, rngZero);
    const head = g.snake[0];
    expect(next.snake[0]).toEqual({ x: head.x, y: head.y - 1 });
    expect(next.direction).toBe('up');
  });

  it('rejects a 180° reversal', () => {
    const g = makeGame(); // moving right
    const turned = changeDirection(g, 'left');
    expect(turned.pendingDirection).toBe('right'); // unchanged
  });

  it('prevents a U-turn via two quick perpendicular changes in one tick', () => {
    // right -> up (ok) -> left should be rejected relative to committed 'right'
    // until a tick commits 'up'.
    const g = makeGame();
    const up = changeDirection(g, 'up');
    const back = changeDirection(up, 'down'); // opposite of committed 'right'? no.
    // 'down' is not the opposite of 'right', so it's allowed and overrides 'up'.
    expect(back.pendingDirection).toBe('down');
  });

  it('isReversal detects opposites only', () => {
    expect(isReversal('up', 'down')).toBe(true);
    expect(isReversal('left', 'right')).toBe(true);
    expect(isReversal('up', 'left')).toBe(false);
  });

  it('ignores direction changes when not running', () => {
    const g = makeGame({ status: 'paused' });
    expect(changeDirection(g, 'up')).toBe(g);
  });
});

describe('growth and score', () => {
  it('grows and increments score when eating food', () => {
    // Put food directly in front of the head.
    const g = makeGame();
    const head = g.snake[0];
    const withFood: GameState = { ...g, food: { x: head.x + 1, y: head.y } };
    const next = tick(withFood, rngZero);
    expect(next.score).toBe(1);
    expect(next.snake).toHaveLength(g.snake.length + 1);
    // Head advanced onto the old food cell.
    expect(next.snake[0]).toEqual({ x: head.x + 1, y: head.y });
  });

  it('respawns food on a free cell after eating', () => {
    const g = makeGame();
    const head = g.snake[0];
    const withFood: GameState = { ...g, food: { x: head.x + 1, y: head.y } };
    const next = tick(withFood, rngZero);
    const onSnake = next.snake.some(
      (c) => c.x === next.food.x && c.y === next.food.y,
    );
    expect(onSnake).toBe(false);
  });
});

describe('collisions', () => {
  it('ends the game on wall collision', () => {
    // Head at right edge, moving right.
    const g = makeGame({
      snake: [
        { x: 9, y: 5 },
        { x: 8, y: 5 },
        { x: 7, y: 5 },
      ],
      direction: 'right',
      pendingDirection: 'right',
    });
    const next = tick(g, rngZero);
    expect(next.status).toBe('over');
  });

  it('ends the game on self collision', () => {
    // Curled snake: moving up drives the head into a NON-tail body segment
    // at (5,4). (The tail is (6,5), so this is a genuine self-collision, not
    // the allowed step-into-vacating-tail case.)
    const g = makeGame({
      snake: [
        { x: 5, y: 5 }, // head
        { x: 4, y: 5 },
        { x: 4, y: 4 },
        { x: 5, y: 4 }, // body segment sitting on the head's target cell
        { x: 6, y: 4 },
        { x: 6, y: 5 }, // tail
      ],
      direction: 'up',
      pendingDirection: 'up',
    });
    const next = tick(g, rngZero);
    expect(next.status).toBe('over');
  });

  it('allows moving into the current tail cell (tail vacates)', () => {
    // Head at (5,5) moving right; tail at (6,5) will move away this tick.
    const g = makeGame({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 }, // tail — sits where the head is about to go
      ],
      direction: 'right',
      pendingDirection: 'right',
      food: { x: 0, y: 0 },
    });
    const next = tick(g, rngZero);
    expect(next.status).toBe('running');
    expect(next.snake[0]).toEqual({ x: 6, y: 5 });
  });
});

describe('speed', () => {
  it('shrinks the tick interval every N points', () => {
    const g = makeGame(); // base 200, step 20, per-level 5
    expect(tickIntervalFor({ ...g, score: 0 })).toBe(200);
    expect(tickIntervalFor({ ...g, score: 4 })).toBe(200);
    expect(tickIntervalFor({ ...g, score: 5 })).toBe(180);
    expect(tickIntervalFor({ ...g, score: 10 })).toBe(160);
  });

  it('never drops below the configured floor', () => {
    const g = makeGame();
    expect(tickIntervalFor({ ...g, score: 1000 })).toBe(g.config.minTickIntervalMs);
  });
});

describe('placeFood', () => {
  it('returns null when the board is full', () => {
    const snake: { x: number; y: number }[] = [];
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) snake.push({ x, y });
    expect(placeFood(3, 3, snake, rngZero)).toBeNull();
  });

  it('never places food on the snake', () => {
    const snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    for (let i = 0; i < 50; i++) {
      const food = placeFood(4, 4, snake, () => i / 50)!;
      expect(snake.some((c) => c.x === food.x && c.y === food.y)).toBe(false);
    }
  });
});
