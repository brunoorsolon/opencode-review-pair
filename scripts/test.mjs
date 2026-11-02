import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, ['--test', 'test/*.test.mjs'], { cwd: root, stdio: 'inherit', env: {
  ...process.env,
  BROKER_REFERENCE_DIR: process.env.BROKER_REFERENCE_DIR ?? fileURLToPath(new URL('../vendor/broker', import.meta.url)),
  OPENCODE_TOOL_MODULE: process.env.OPENCODE_TOOL_MODULE ?? fileURLToPath(new URL('../src/tool-schema.mjs', import.meta.url)),
} });
process.exitCode = result.status ?? 1;
