/**
 * WebSocket delivery: `GET /games/:id/stream`.
 *
 * On connect the client immediately receives the current snapshot, then a
 * message on every tick / state change, and finally a `gameover` (or `deleted`)
 * message. Protocol messages mirror the manager's `GameEvent`, with game state
 * serialized to the same public shape as the REST API.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { GameManager } from '../game-manager.js';
import { serializeGame } from '../http/serialize.js';

const STREAM_PATH = /^\/games\/([^/]+)\/stream$/;

export function attachWebSocket(server: Server, manager: GameManager): WebSocketServer {
  // noServer: we handle the HTTP upgrade ourselves so we can route by path.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const path = url.split('?')[0];
    const match = STREAM_PATH.exec(path);
    if (!match) {
      socket.destroy();
      return;
    }
    const gameId = decodeURIComponent(match[1]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleConnection(ws, gameId, manager);
    });
  });

  return wss;
}

async function handleConnection(
  ws: WebSocket,
  gameId: string,
  manager: GameManager,
): Promise<void> {
  const state = await manager.getGame(gameId);
  if (!state) {
    ws.send(JSON.stringify({ type: 'error', error: 'not_found', gameId }));
    ws.close(4004, 'game not found');
    return;
  }

  const send = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  // Initial snapshot.
  send({ type: 'state', state: serializeGame(state) });

  const unsubscribe = manager.subscribe(gameId, (event) => {
    switch (event.type) {
      case 'state':
        send({ type: 'state', state: serializeGame(event.state) });
        break;
      case 'gameover':
        send({ type: 'gameover', state: serializeGame(event.state) });
        break;
      case 'deleted':
        send({ type: 'deleted', gameId: event.id });
        ws.close(1000, 'game deleted');
        break;
    }
  });

  ws.on('close', unsubscribe);
  ws.on('error', unsubscribe);
}
