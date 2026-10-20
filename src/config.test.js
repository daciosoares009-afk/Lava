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
  assert.equal(config.smtp.configured, false);
});

test('lê a configuração SMTP sem exigir e-mail para iniciar o aplicativo', () => {
  const config = readConfig({
    MONGODB_URI: 'mongodb://localhost/lavemais',
    JWT_SECRET: 'a'.repeat(40),
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_USER: 'mail@example.com',
    SMTP_PASSWORD: 'mail-secret',
    SMTP_FROM: 'LaveMais <mail@example.com>',
  });
  assert.equal(config.smtp.configured, true);
  assert.equal(config.smtp.port, 465);
  assert.equal(config.smtp.password, 'mail-secret');
});
