import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
dotenv.config();
if (!process.env.MONGODB_TEST_URI || process.env.MONGODB_TEST_URI === process.env.MONGODB_URI) {
  console.error('Defina MONGODB_TEST_URI diferente do banco principal. Nenhum teste foi executado.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', 'src/auth.integration.test.js'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', RUN_DATABASE_TESTS: 'true' },
});
process.exit(result.status ?? 1);
