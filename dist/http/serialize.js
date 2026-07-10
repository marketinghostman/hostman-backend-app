/**
 * Public projection of game state. Keeps the wire format stable and decoupled
 * from the internal `GameState` shape (which may carry extra bookkeeping).
 */
import { tickIntervalFor } from '../engine/index.js';
export function serializeGame(state) {
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
