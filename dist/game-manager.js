/**
 * Orchestration layer between the pure engine, the storage backend, and the
 * delivery layers (HTTP + WebSocket).
 *
 * Responsibilities:
 *  - Owns the server-side tick loop (the snake moves on a timer, not on client
 *    input). Each game reschedules its own next tick based on current speed.
 *  - Persists every state transition through the `GameStore`.
 *  - Emits events so the WebSocket layer can push state without polling.
 *  - Records finished games into the leaderboard.
 *  - Cleans up finished games after a TTL so memory does not leak.
 *
 * It has no knowledge of HTTP or WebSocket — it only exposes methods and an
 * event subscription API.
 */
import { randomUUID } from 'node:crypto';
import { createGame as engineCreate, changeDirection as engineChangeDirection, pause as enginePause, resume as engineResume, endGame as engineEnd, tick as engineTick, tickIntervalFor, defaultRng, } from './engine/index.js';
export class GameManager {
    store;
    rng;
    finishedTtlMs;
    leaderboardSize;
    now;
    tickTimers = new Map();
    cleanupTimers = new Map();
    listeners = new Map();
    constructor(opts) {
        this.store = opts.store;
        this.rng = opts.rng ?? defaultRng;
        this.finishedTtlMs = opts.finishedTtlMs ?? 5 * 60 * 1000;
        this.leaderboardSize = opts.leaderboardSize ?? 10;
        this.now = opts.now ?? Date.now;
    }
    // ---- Lifecycle ---------------------------------------------------------
    async createGame(config) {
        const id = randomUUID();
        const state = engineCreate({
            id,
            config,
            rng: this.rng,
            now: this.now(),
        });
        await this.store.create(state);
        this.scheduleTick(id);
        return state;
    }
    async getGame(id) {
        return this.store.get(id);
    }
    async changeDirection(id, direction) {
        const state = await this.store.get(id);
        if (!state)
            return undefined;
        const next = engineChangeDirection(state, direction);
        await this.store.save(next);
        return next;
    }
    async pause(id) {
        const state = await this.store.get(id);
        if (!state)
            return undefined;
        const next = enginePause(state, this.now());
        await this.store.save(next);
        if (next.status === 'paused')
            this.clearTickTimer(id);
        this.emit(id, { type: 'state', state: next });
        return next;
    }
    async resume(id) {
        const state = await this.store.get(id);
        if (!state)
            return undefined;
        const next = engineResume(state, this.now());
        await this.store.save(next);
        if (next.status === 'running')
            this.scheduleTick(id);
        this.emit(id, { type: 'state', state: next });
        return next;
    }
    /** Explicitly end and remove a game. Returns false if it did not exist. */
    async deleteGame(id) {
        const state = await this.store.get(id);
        if (!state)
            return false;
        if (state.status !== 'over') {
            const ended = engineEnd(state, this.now());
            await this.store.save(ended);
            await this.recordScore(ended);
        }
        this.clearTickTimer(id);
        this.clearCleanupTimer(id);
        await this.store.delete(id);
        this.emit(id, { type: 'deleted', id });
        this.listeners.delete(id);
        return true;
    }
    async getLeaderboard() {
        return this.store.topScores(this.leaderboardSize);
    }
    // ---- Event subscription (used by WebSocket) ----------------------------
    subscribe(id, listener) {
        let set = this.listeners.get(id);
        if (!set) {
            set = new Set();
            this.listeners.set(id, set);
        }
        set.add(listener);
        return () => {
            const s = this.listeners.get(id);
            if (s) {
                s.delete(listener);
                if (s.size === 0)
                    this.listeners.delete(id);
            }
        };
    }
    emit(id, event) {
        const set = this.listeners.get(id);
        if (!set)
            return;
        for (const listener of set) {
            try {
                listener(event);
            }
            catch {
                // A misbehaving subscriber must not break the tick loop.
            }
        }
    }
    // ---- Tick loop ---------------------------------------------------------
    scheduleTick(id) {
        this.clearTickTimer(id);
        void this.store.get(id).then((state) => {
            if (!state || state.status !== 'running')
                return;
            const delay = tickIntervalFor(state);
            const timer = setTimeout(() => void this.runTick(id), delay);
            // Do not keep the process alive solely for a game timer.
            if (typeof timer.unref === 'function')
                timer.unref();
            this.tickTimers.set(id, timer);
        });
    }
    async runTick(id) {
        const state = await this.store.get(id);
        if (!state || state.status !== 'running')
            return;
        const next = engineTick(state, this.rng, this.now());
        await this.store.save(next);
        if (next.status === 'over') {
            this.clearTickTimer(id);
            await this.recordScore(next);
            this.emit(id, { type: 'gameover', state: next });
            this.scheduleCleanup(id);
            return;
        }
        this.emit(id, { type: 'state', state: next });
        this.scheduleTick(id);
    }
    async recordScore(state) {
        await this.store.recordScore({
            gameId: state.id,
            score: state.score,
            achievedAt: state.updatedAt,
        });
    }
    // ---- Cleanup -----------------------------------------------------------
    scheduleCleanup(id) {
        this.clearCleanupTimer(id);
        const timer = setTimeout(() => {
            void (async () => {
                const state = await this.store.get(id);
                // Only sweep if still finished (a new game reuses a new id, so this is
                // just a safety check).
                if (state && state.status === 'over') {
                    await this.store.delete(id);
                    this.emit(id, { type: 'deleted', id });
                    this.listeners.delete(id);
                }
                this.cleanupTimers.delete(id);
            })();
        }, this.finishedTtlMs);
        if (typeof timer.unref === 'function')
            timer.unref();
        this.cleanupTimers.set(id, timer);
    }
    clearTickTimer(id) {
        const t = this.tickTimers.get(id);
        if (t) {
            clearTimeout(t);
            this.tickTimers.delete(id);
        }
    }
    clearCleanupTimer(id) {
        const t = this.cleanupTimers.get(id);
        if (t) {
            clearTimeout(t);
            this.cleanupTimers.delete(id);
        }
    }
    /** Stop all timers — for graceful shutdown / tests. */
    shutdown() {
        for (const t of this.tickTimers.values())
            clearTimeout(t);
        for (const t of this.cleanupTimers.values())
            clearTimeout(t);
        this.tickTimers.clear();
        this.cleanupTimers.clear();
    }
}
