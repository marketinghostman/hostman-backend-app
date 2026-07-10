/**
 * In-memory implementation of `GameStore` backed by a Map.
 *
 * Suitable for a single-process deployment. For horizontal scaling, replace
 * with a Redis-backed store implementing the same interface.
 */

import type { GameState } from '../engine/types.js';
import type { GameStore, LeaderboardEntry } from './store.js';

export class InMemoryGameStore implements GameStore {
  private games = new Map<string, GameState>();
  private leaderboard: LeaderboardEntry[] = [];

  async create(state: GameState): Promise<void> {
    this.games.set(state.id, state);
  }

  async get(id: string): Promise<GameState | undefined> {
    return this.games.get(id);
  }

  async save(state: GameState): Promise<void> {
    this.games.set(state.id, state);
  }

  async delete(id: string): Promise<boolean> {
    return this.games.delete(id);
  }

  async list(): Promise<GameState[]> {
    return [...this.games.values()];
  }

  async recordScore(entry: LeaderboardEntry): Promise<void> {
    this.leaderboard.push(entry);
    // Keep sorted, highest first; cap retained history to a sane bound.
    this.leaderboard.sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt);
    if (this.leaderboard.length > 100) {
      this.leaderboard.length = 100;
    }
  }

  async topScores(limit: number): Promise<LeaderboardEntry[]> {
    return this.leaderboard.slice(0, limit);
  }
}
