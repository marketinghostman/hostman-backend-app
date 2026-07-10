/**
 * Pure Snake game engine.
 *
 * Every function here is deterministic given its inputs (randomness is injected
 * via an `Rng`). State transitions return NEW state objects — callers are free
 * to mutate the returned value, but the engine never touches shared state.
 */
import { DEFAULT_CONFIG, } from './types.js';
const DELTAS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};
const OPPOSITE = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
};
function cellsEqual(a, b) {
    return a.x === b.x && a.y === b.y;
}
/** Default RNG used in production. */
export const defaultRng = Math.random;
/**
 * Effective tick interval for the current score. Interval shrinks by
 * `speedStepMs` for every `pointsPerSpeedLevel` points, clamped to a floor.
 */
export function tickIntervalFor(state) {
    const { config, score } = state;
    const level = Math.floor(score / config.pointsPerSpeedLevel);
    const interval = config.baseTickIntervalMs - level * config.speedStepMs;
    return Math.max(config.minTickIntervalMs, interval);
}
/**
 * Pick a uniformly-random cell that is not currently occupied by the snake.
 * Returns `null` only when the board is completely full (a win state).
 */
export function placeFood(width, height, snake, rng) {
    const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
    const free = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!occupied.has(`${x},${y}`))
                free.push({ x, y });
        }
    }
    if (free.length === 0)
        return null;
    const idx = Math.floor(rng() * free.length);
    return free[Math.min(idx, free.length - 1)];
}
/** Build a fresh, running game centered on the board, moving right. */
export function createGame(opts) {
    const config = { ...DEFAULT_CONFIG, ...opts.config };
    const rng = opts.rng ?? defaultRng;
    const now = opts.now ?? 0;
    const cx = Math.floor(config.width / 2);
    const cy = Math.floor(config.height / 2);
    // Head first; two body segments to the left so the initial direction (right)
    // is never a 180° reversal.
    const snake = [
        { x: cx, y: cy },
        { x: cx - 1, y: cy },
        { x: cx - 2, y: cy },
    ];
    const food = placeFood(config.width, config.height, snake, rng) ?? {
        x: 0,
        y: 0,
    };
    return {
        id: opts.id,
        config,
        snake,
        direction: 'right',
        pendingDirection: 'right',
        food,
        score: 0,
        status: 'running',
        createdAt: now,
        updatedAt: now,
    };
}
/** True when `next` would be a 180° reversal of `current`. */
export function isReversal(current, next) {
    return OPPOSITE[current] === next;
}
/**
 * Queue a direction change for the next tick. Rejects 180° reversals (relative
 * to the last *committed* direction, so rapid double-taps can't sneak a U-turn).
 * Returns a new state; the input is left untouched.
 */
export function changeDirection(state, next) {
    if (state.status !== 'running')
        return state;
    if (isReversal(state.direction, next))
        return state;
    return { ...state, pendingDirection: next };
}
export function pause(state, now = 0) {
    if (state.status !== 'running')
        return state;
    return { ...state, status: 'paused', updatedAt: now };
}
export function resume(state, now = 0) {
    if (state.status !== 'paused')
        return state;
    return { ...state, status: 'running', updatedAt: now };
}
export function endGame(state, now = 0) {
    if (state.status === 'over')
        return state;
    return { ...state, status: 'over', updatedAt: now };
}
/**
 * Advance the game by one tick.
 *
 * - Commits the pending direction.
 * - Moves the head one cell.
 * - Detects wall / self collisions → status 'over'.
 * - Grows the snake and bumps the score when food is eaten, then respawns food.
 *
 * A no-op (returns input) when the game is not running.
 */
export function tick(state, rng = defaultRng, now = 0) {
    if (state.status !== 'running')
        return state;
    const direction = state.pendingDirection;
    const delta = DELTAS[direction];
    const head = state.snake[0];
    const newHead = { x: head.x + delta.x, y: head.y + delta.y };
    // Wall collision.
    const { width, height } = state.config;
    if (newHead.x < 0 ||
        newHead.x >= width ||
        newHead.y < 0 ||
        newHead.y >= height) {
        return { ...state, direction, status: 'over', updatedAt: now };
    }
    const willEat = cellsEqual(newHead, state.food);
    // Body used for self-collision. When not eating, the tail moves out of the
    // way this tick, so stepping onto the current tail cell is allowed.
    const body = willEat ? state.snake : state.snake.slice(0, -1);
    const hitsSelf = body.some((c) => cellsEqual(c, newHead));
    if (hitsSelf) {
        return { ...state, direction, status: 'over', updatedAt: now };
    }
    const newSnake = willEat
        ? [newHead, ...state.snake]
        : [newHead, ...state.snake.slice(0, -1)];
    let food = state.food;
    let score = state.score;
    let status = state.status;
    if (willEat) {
        score += 1;
        const next = placeFood(width, height, newSnake, rng);
        if (next === null) {
            // Board full — player has effectively won; end the game.
            status = 'over';
        }
        else {
            food = next;
        }
    }
    return {
        ...state,
        snake: newSnake,
        direction,
        pendingDirection: direction,
        food,
        score,
        status,
        updatedAt: now,
    };
}
