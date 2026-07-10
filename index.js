// Root entry point for hosting platforms that run `node index.js` (or
// `pm2 start index.js`) from the repository root with no build step.
//
// The application is written in TypeScript and compiled to dist/ (committed to
// the repo). This thin loader boots the compiled server. Production only needs
// the runtime dependencies (express, ws, zod) — none of which have build
// scripts — so `pnpm install --prod` / `npm install --omit=dev` installs
// cleanly without tripping pnpm's build-script approval gate.
import './dist/index.js';
