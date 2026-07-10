/**
 * Express app assembly. Kept separate from `index.ts` (server bootstrap) so the
 * app can be constructed in tests without binding a port.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameManager } from './game-manager.js';
import { createRouter } from './http/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(manager: GameManager): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/', createRouter(manager));

  // Static single-page client for manual testing (../public relative to dist or src).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Reject malformed JSON bodies with a clean 400 instead of a stack trace.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'invalid_json', message: 'Malformed JSON body' });
      return;
    }
    next(err);
  });

  return app;
}
