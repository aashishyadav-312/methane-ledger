// Builds the app for the /v2/ subpath. Sets BASE_PATH, then runs vite (no extra dependency needed on Windows).
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BASE_PATH: '/methane-ledger/v2/' },
});
process.exit(result.status ?? 1);
