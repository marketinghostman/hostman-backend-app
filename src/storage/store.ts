/**
 * Storage abstraction for game state.
 *
 * The rest of the app depends only on `GameStore`, never on a concrete
 * implementation. Swapping the in-memory Map for Redis later means writing a
 * new class that satisfies this interface — no call-site changes.
 *
 * The interface is async on purpose: an in-memory store resolves immediately,
 * but a Redis-backed store will need round-trips, and callers should already be
 * written to await.
 */

import type { GameState } from '../engine/types.js';

export interface LeaderboardEntry {
  gameId: string;
  score: number;
  achievedAt: number;
}

export interface GameStore {
  create(state: GameState): Promise<void>;
  get(id: string): Promise<GameState | undefined>;
  /** Persist a full snapshot of the state (overwrites). */
  save(state: GameState): Promise<void>;
  delete(id: string): Promise<boolean>;
  /** All games — used by the sweeper to find expired ones. */
  list(): Promise<GameState[]>;

  /** Record a finished game's score into the leaderboard. */
  recordScore(entry: LeaderboardEntry): Promise<void>;
  /** Top-N scores, highest first. */
  topScores(limit: number): Promise<LeaderboardEntry[]>;
}
