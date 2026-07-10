# 🐍 Snake Server

Server-authoritative Snake game backend in **Node.js + TypeScript**. All game
logic lives on the server; clients only send commands and receive state. The
snake moves on a server-side timer — clients do not drive the ticks.

## Architecture

```
src/
  engine/            Pure game engine (no I/O, no HTTP) — fully unit-tested
    types.ts         Domain types + default config
    engine.ts        createGame / tick / changeDirection / collisions / speed
  storage/
    store.ts         GameStore interface (swap in Redis later)
    memory-store.ts  In-memory Map implementation + leaderboard
  game-manager.ts    Orchestration: tick timers, persistence, events, cleanup
  http/
    schemas.ts       zod request validation
    serialize.ts     Public wire format for game state
    routes.ts        Express REST router
  app.ts             Express app assembly (testable without a port)
  index.ts           Server bootstrap (HTTP + WebSocket)
  ws/stream.ts       WebSocket per-tick state push
public/index.html    Single-page canvas + WebSocket test client
test/                vitest unit tests (engine + manager)
```

**Key design points**

- The **engine** is pure and deterministic (randomness is injected via an `Rng`),
  so movement, growth, collisions, and speed are trivial to unit-test.
- Storage is behind the **`GameStore` interface**. `InMemoryGameStore` is the
  default; a `RedisGameStore` implementing the same async interface can be
  dropped in with no call-site changes.
- The **`GameManager`** owns the per-game tick loop (each game reschedules its
  own next tick based on current speed), persists every transition, records
  finished games into the leaderboard, emits events for WebSocket push, and
  cleans up finished games after a TTL (default **5 minutes**) so memory does
  not leak.

## Requirements

- Node.js **>= 18** (developed against Node 24).

## Install & run

```bash
npm install          # or: pnpm install
npm run dev          # start with hot reload (tsx) on http://localhost:3000
# or
npm run build && npm start
```

Then open **http://localhost:3000/** for the built-in canvas test client.

Environment: `PORT` (default `3000`).

## Test / typecheck

```bash
npm test             # vitest — engine + game-manager unit tests
npm run typecheck    # tsc --noEmit
```

## Game rules

- Board is configurable (default **20×20**).
- Snake starts length 3, centered, moving right.
- Direction changes are validated: a **180° reversal is rejected** (relative to
  the last committed direction, so a rapid double-tap can't sneak a U-turn).
- Food spawns on a random free cell. Eating grows the snake and adds **+1** to
  the score.
- **Speed increases every 5 points**: the tick interval shrinks by a step per
  level, clamped to a floor (default: `200ms` base, `-20ms`/level, min `60ms`).
- Game ends on collision with a **wall** or the snake's **own body**.
- **Top-10 leaderboard** is kept in memory.

## REST API

Base URL: `http://localhost:3000`

| Method | Path                      | Description                          |
| ------ | ------------------------- | ------------------------------------ |
| POST   | `/games`                  | Create a game                        |
| GET    | `/games/:id`              | Current state                        |
| POST   | `/games/:id/direction`    | Change direction                     |
| POST   | `/games/:id/pause`        | Pause                                |
| POST   | `/games/:id/resume`       | Resume                               |
| DELETE | `/games/:id`              | End and remove the game              |
| GET    | `/leaderboard`            | Top-10 scores                        |
| GET    | `/health`                 | Health check                         |

### State shape

```json
{
  "id": "44629344-4adb-41d7-90c6-60d064e1af8d",
  "width": 20,
  "height": 20,
  "snake": [{ "x": 10, "y": 10 }, { "x": 9, "y": 10 }, { "x": 8, "y": 10 }],
  "food": { "x": 6, "y": 3 },
  "direction": "right",
  "score": 0,
  "status": "running",
  "tickIntervalMs": 200,
  "createdAt": 1783677722979,
  "updatedAt": 1783677722979
}
```

`status` is one of `running` | `paused` | `over`.

### curl examples

Create a game (body is optional — omit it for all defaults):

```bash
curl -s -X POST http://localhost:3000/games \
  -H 'Content-Type: application/json' \
  -d '{ "width": 20, "height": 20, "baseTickIntervalMs": 200 }'
```

All create options (all optional, validated by zod):
`width`, `height` (5–100), `baseTickIntervalMs` (30–2000), `speedStepMs` (0–500),
`pointsPerSpeedLevel` (1–100), `minTickIntervalMs` (20–2000).

Get state:

```bash
curl -s http://localhost:3000/games/<id>
```

Change direction (`up` | `down` | `left` | `right`):

```bash
curl -s -X POST http://localhost:3000/games/<id>/direction \
  -H 'Content-Type: application/json' \
  -d '{ "direction": "up" }'
```

Pause / resume:

```bash
curl -s -X POST http://localhost:3000/games/<id>/pause
curl -s -X POST http://localhost:3000/games/<id>/resume
```

End a game:

```bash
curl -s -X DELETE http://localhost:3000/games/<id>   # 204 No Content
```

Leaderboard:

```bash
curl -s http://localhost:3000/leaderboard
# { "entries": [ { "gameId": "...", "score": 12, "achievedAt": 1783... } ] }
```

### Status codes & errors

- `201` — game created
- `200` — success
- `204` — game deleted
- `400` — validation error (bad/unknown direction, out-of-range config, malformed JSON)
- `404` — game not found
- `409` — illegal state transition (e.g. changing direction on a finished game,
  resuming a game that isn't paused)

Error body:

```json
{ "error": "validation_error", "message": "Request body failed validation",
  "issues": [{ "path": "direction", "message": "Invalid enum value..." }] }
```

## WebSocket protocol

Connect to:

```
ws://localhost:3000/games/:id/stream
```

The server pushes state so clients never need to poll. Message flow:

1. **On connect** — an immediate snapshot:
   ```json
   { "type": "state", "state": { ...public game state... } }
   ```
2. **On every tick / state change** (move, pause, resume):
   ```json
   { "type": "state", "state": { ... } }
   ```
3. **When the game ends**:
   ```json
   { "type": "gameover", "state": { ..., "status": "over" } }
   ```
4. **When the game is deleted** (via `DELETE` or TTL cleanup): the server sends
   ```json
   { "type": "deleted", "gameId": "..." }
   ```
   and then closes the socket (code `1000`).

If the game id does not exist, the server sends
`{ "type": "error", "error": "not_found", "gameId": "..." }` and closes with
code `4004`.

The `state` object is exactly the same shape as the REST state above.

### Minimal browser client

```js
const ws = new WebSocket(`ws://localhost:3000/games/${id}/stream`);
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'state' || msg.type === 'gameover') render(msg.state);
};
// Direction changes still go over REST:
fetch(`/games/${id}/direction`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ direction: 'up' }),
});
```

## Test client

`public/index.html` is a self-contained canvas + WebSocket client served at `/`.
Set board size / tick interval, click **New game**, and steer with the arrow
keys or **WASD**. It renders live state pushed over the WebSocket and shows the
score, current speed, and the leaderboard.

## Swapping in Redis later

Implement `GameStore` (see `src/storage/store.ts`) with a Redis client and pass
it to `new GameManager({ store })` in `src/index.ts`. The interface is already
async, so no other code changes are required. Note that the current tick timers
live in-process; a multi-node deployment would additionally move the tick loop
behind a single scheduler (or a Redis-based lock) so each game ticks once.
