/**
 * Express router exposing the game REST API. Thin layer: validates input,
 * delegates to the GameManager, maps results to HTTP status codes.
 */
import { Router } from 'express';
import { serializeGame } from './serialize.js';
import { createGameSchema, changeDirectionSchema } from './schemas.js';
function sendValidationError(res, err) {
    res.status(400).json({
        error: 'validation_error',
        message: 'Request body failed validation',
        issues: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
        })),
    });
}
export function createRouter(manager) {
    const router = Router();
    // Create a game.
    router.post('/games', async (req, res) => {
        const parsed = createGameSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            sendValidationError(res, parsed.error);
            return;
        }
        const state = await manager.createGame(parsed.data);
        res.status(201).json(serializeGame(state));
    });
    // Current state.
    router.get('/games/:id', async (req, res) => {
        const state = await manager.getGame(req.params.id);
        if (!state) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        res.json(serializeGame(state));
    });
    // Change direction.
    router.post('/games/:id/direction', async (req, res) => {
        const parsed = changeDirectionSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            sendValidationError(res, parsed.error);
            return;
        }
        const state = await manager.getGame(req.params.id);
        if (!state) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        if (state.status !== 'running') {
            res.status(409).json({
                error: 'invalid_state',
                message: `Cannot change direction while game is '${state.status}'`,
            });
            return;
        }
        const next = await manager.changeDirection(req.params.id, parsed.data.direction);
        res.json(serializeGame(next));
    });
    // Pause.
    router.post('/games/:id/pause', async (req, res) => {
        const state = await manager.getGame(req.params.id);
        if (!state) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        if (state.status !== 'running') {
            res.status(409).json({
                error: 'invalid_state',
                message: `Cannot pause a game that is '${state.status}'`,
            });
            return;
        }
        const next = await manager.pause(req.params.id);
        res.json(serializeGame(next));
    });
    // Resume.
    router.post('/games/:id/resume', async (req, res) => {
        const state = await manager.getGame(req.params.id);
        if (!state) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        if (state.status !== 'paused') {
            res.status(409).json({
                error: 'invalid_state',
                message: `Cannot resume a game that is '${state.status}'`,
            });
            return;
        }
        const next = await manager.resume(req.params.id);
        res.json(serializeGame(next));
    });
    // Delete / end a game.
    router.delete('/games/:id', async (req, res) => {
        const ok = await manager.deleteGame(req.params.id);
        if (!ok) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        res.status(204).end();
    });
    // Leaderboard.
    router.get('/leaderboard', async (_req, res) => {
        const entries = await manager.getLeaderboard();
        res.json({ entries });
    });
    return router;
}
