import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(`${dir}/${item.name}`) : [`${dir}/${item.name}`]); }
for (const file of ['server.js', ...files('src'), ...files('public'), ...files('scripts'), ...files('test-support')].filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Sintaxe JavaScript verificada.');
