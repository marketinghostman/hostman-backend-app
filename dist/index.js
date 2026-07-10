/**
 * Server bootstrap: wires the store, game manager, HTTP app, and WebSocket
 * layer together and starts listening.
 */
import { createServer } from 'node:http';
import { InMemoryGameStore } from './storage/memory-store.js';
import { GameManager } from './game-manager.js';
import { createApp } from './app.js';
import { attachWebSocket } from './ws/stream.js';
const PORT = Number(process.env.PORT ?? 3000);
const store = new InMemoryGameStore();
const manager = new GameManager({ store });
const app = createApp(manager);
const server = createServer(app);
attachWebSocket(server, manager);
server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Snake server listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Open http://localhost:${PORT}/ for the test client`);
});
function shutdown() {
    manager.shutdown();
    server.close(() => process.exit(0));
    // Force-exit if connections linger.
    setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
