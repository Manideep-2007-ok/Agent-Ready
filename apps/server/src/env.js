// Import this FIRST in index.js: it loads the repo's .env (if there is one) before the engine reads its settings.
// A missing .env is fine (real environment variables and defaults are used), so `npm start` never crashes on it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '@agentready/engine/env';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const loadedEnvFiles = loadDotEnv([path.join(repoRoot, '.env')]);
