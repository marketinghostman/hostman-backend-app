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
export {};
