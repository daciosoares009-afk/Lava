import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from './config.js';

test('exige URI do banco e segredo de sessão', () => {
  assert.throws(() => readConfig({}), /MONGODB_URI.*JWT_SECRET/);
});

test('lê configuração válida sem alterar nem imprimir os segredos', () => {
  const config = readConfig({ PORT: '3100', MONGODB_URI: 'mongodb://localhost/lavemais', JWT_SECRET: 'a'.repeat(40), NODE_ENV: 'test' });
  assert.equal(config.port, 3100);
  assert.equal(config.nodeEnv, 'test');
});
