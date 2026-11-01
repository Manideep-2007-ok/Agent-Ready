// Server settings read from environment variables (.env at the repo root, loaded by `node --env-file`).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bool = (value, fallback = true) =>
  value === undefined || value === '' ? fallback : !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const config = {
  port: Number(process.env.PORT) || 4000,
  mock: bool(process.env.TINYFISH_MOCK, false),
  repoRoot,
  dataDir: path.join(repoRoot, 'data'),
  cachedDemoDir: path.join(repoRoot, 'data', 'cached-demo'),
  demoStoreUrl: (process.env.DEMO_STORE_URL || '').replace(/\/+$/, ''),
  features: {
    RACE: bool(process.env.FEATURE_RACE),
    WATCH: bool(process.env.FEATURE_WATCH),
    FIXES_AI: bool(process.env.FEATURE_FIXES_AI),
    CUSTOM_TASK: bool(process.env.FEATURE_CUSTOM_TASK),
    LEADERBOARD: bool(process.env.FEATURE_LEADERBOARD),
    CLI_UPLOAD: bool(process.env.FEATURE_CLI_UPLOAD),
  },
};
