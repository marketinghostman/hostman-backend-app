/**
 * Core domain types for the Snake engine.
 *
 * The engine is intentionally free of any HTTP / transport concerns so it can
 * be unit-tested in isolation and reused behind different delivery mechanisms.
 */
export const DEFAULT_CONFIG = {
    width: 20,
    height: 20,
    baseTickIntervalMs: 200,
    speedStepMs: 20,
    pointsPerSpeedLevel: 5,
    minTickIntervalMs: 60,
};
