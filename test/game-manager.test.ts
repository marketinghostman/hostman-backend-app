import { describe, it, expect } from 'vitest';
import { GameManager, type GameEvent } from '../src/game-manager.js';
import { InMemoryGameStore } from '../src/storage/memory-store.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeManager(overrides?: Partial<ConstructorParameters<typeof GameManager>[0]>) {
  const store = new InMemoryGameStore();
  const manager = new GameManager({ store, ...overrides });
  return { store, manager };
}

describe('GameManager lifecycle', () => {
  it('creates and retrieves a game', async () => {
    const { manager } = makeManager();
    const created = await manager.createGame({ width: 8, height: 8 });
    const fetched = await manager.getGame(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.status).toBe('running');
    manager.shutdown();
  });

  it('applies a valid direction change and rejects reversals', async () => {
    const { manager } = makeManager();
    const g = await manager.createGame({ width: 8, height: 8, baseTickIntervalMs: 1000 });
    const up = await manager.changeDirection(g.id, 'up');
    expect(up?.pendingDirection).toBe('up');
    // Now moving up-committed only after tick; reversal 'left' relative to 'right' committed.
    const left = await manager.changeDirection(g.id, 'left');
    expect(left?.pendingDirection).toBe('up'); // reversal ignored, keeps 'up'
    manager.shutdown();
  });

  it('pauses and resumes', async () => {
    const { manager } = makeManager();
    const g = await manager.createGame({ width: 8, height: 8, baseTickIntervalMs: 1000 });
    const paused = await manager.pause(g.id);
    expect(paused?.status).toBe('paused');
    const resumed = await manager.resume(g.id);
    expect(resumed?.status).toBe('running');
    manager.shutdown();
  });

  it('returns undefined for unknown games', async () => {
    const { manager } = makeManager();
    expect(await manager.getGame('nope')).toBeUndefined();
    expect(await manager.changeDirection('nope', 'up')).toBeUndefined();
    expect(await manager.deleteGame('nope')).toBe(false);
    manager.shutdown();
  });
});

describe('GameManager tick loop', () => {
  it('moves the snake over time and eventually ends on wall collision', async () => {
    // Small board + fast ticks → snake reaches the wall quickly.
    const events: GameEvent[] = [];
    const { manager, store } = makeManager();
    const g = await manager.createGame({
      width: 6,
      height: 6,
      baseTickIntervalMs: 20,
      speedStepMs: 0,
      minTickIntervalMs: 20,
    });
    manager.subscribe(g.id, (e) => events.push(e));

    // Snake starts centered (x=3) moving right on a width-6 board → wall at x=6.
    await delay(200); // ~10 ticks, more than enough to crash

    const finished = await store.get(g.id);
    expect(finished?.status).toBe('over');
    expect(events.some((e) => e.type === 'gameover')).toBe(true);
    expect(events.some((e) => e.type === 'state')).toBe(true);
    manager.shutdown();
  });

  it('records the score into the leaderboard on game over', async () => {
    const { manager } = makeManager();
    await manager.createGame({
      width: 6,
      height: 6,
      baseTickIntervalMs: 20,
      speedStepMs: 0,
      minTickIntervalMs: 20,
    });
    await delay(200);
    const board = await manager.getLeaderboard();
    expect(board.length).toBeGreaterThanOrEqual(1);
    manager.shutdown();
  });

  it('does not tick while paused', async () => {
    const { manager, store } = makeManager();
    const g = await manager.createGame({
      width: 20,
      height: 20,
      baseTickIntervalMs: 20,
    });
    await manager.pause(g.id);
    const head1 = (await store.get(g.id))!.snake[0];
    await delay(120);
    const head2 = (await store.get(g.id))!.snake[0];
    expect(head2).toEqual(head1); // no movement while paused
    manager.shutdown();
  });
});

describe('GameManager cleanup', () => {
  it('removes finished games after the TTL', async () => {
    const { manager, store } = makeManager({ finishedTtlMs: 60 });
    const g = await manager.createGame({
      width: 6,
      height: 6,
      baseTickIntervalMs: 20,
      speedStepMs: 0,
      minTickIntervalMs: 20,
    });
    await delay(150); // crash into wall, then wait past the 60ms TTL
    expect(await store.get(g.id)).toBeUndefined();
    manager.shutdown();
  });

  it('deleteGame records score and removes the game', async () => {
    const { manager, store } = makeManager();
    const g = await manager.createGame({ width: 10, height: 10, baseTickIntervalMs: 1000 });
    const ok = await manager.deleteGame(g.id);
    expect(ok).toBe(true);
    expect(await store.get(g.id)).toBeUndefined();
    const board = await manager.getLeaderboard();
    expect(board.some((e) => e.gameId === g.id)).toBe(true);
    manager.shutdown();
  });
});
