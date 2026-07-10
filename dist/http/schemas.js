/**
 * Request validation schemas (zod). Route handlers validate untrusted input
 * here and return 400 with a structured error on failure.
 */
import { z } from 'zod';
export const directionSchema = z.enum(['up', 'down', 'left', 'right']);
export const createGameSchema = z
    .object({
    width: z.number().int().min(5).max(100).optional(),
    height: z.number().int().min(5).max(100).optional(),
    baseTickIntervalMs: z.number().int().min(30).max(2000).optional(),
    speedStepMs: z.number().int().min(0).max(500).optional(),
    pointsPerSpeedLevel: z.number().int().min(1).max(100).optional(),
    minTickIntervalMs: z.number().int().min(20).max(2000).optional(),
})
    .strict()
    // Allow an empty body → all defaults.
    .default({});
export const changeDirectionSchema = z
    .object({
    direction: directionSchema,
})
    .strict();
