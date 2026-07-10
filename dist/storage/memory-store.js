/**
 * In-memory implementation of `GameStore` backed by a Map.
 *
 * Suitable for a single-process deployment. For horizontal scaling, replace
 * with a Redis-backed store implementing the same interface.
 */
export class InMemoryGameStore {
    games = new Map();
    leaderboard = [];
    async create(state) {
        this.games.set(state.id, state);
    }
    async get(id) {
        return this.games.get(id);
    }
    async save(state) {
        this.games.set(state.id, state);
    }
    async delete(id) {
        return this.games.delete(id);
    }
    async list() {
        return [...this.games.values()];
    }
    async recordScore(entry) {
        this.leaderboard.push(entry);
        // Keep sorted, highest first; cap retained history to a sane bound.
        this.leaderboard.sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt);
        if (this.leaderboard.length > 100) {
            this.leaderboard.length = 100;
        }
    }
    async topScores(limit) {
        return this.leaderboard.slice(0, limit);
    }
}
