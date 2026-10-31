import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSafeError } from './safeError.js';

test('registra nome, código e mensagem mas remove URI e credenciais', () => {
  const uri = 'mongodb+srv://lavemais:SenhaMuitoSecreta@cluster.example/lavemais';
  const message = `Authentication failed for ${uri}; password=SenhaMuitoSecreta token=abc123 Bearer bearer-secret eyJhbGci.eyJzdWI.abc`;
  const formatted = formatSafeError(Object.assign(new Error(message), { name: 'MongoServerError', code: 8000 }));

  assert.match(formatted, /^MongoServerError code=8000:/);
  assert.match(formatted, /Authentication failed/);
  assert.match(formatted, /MongoDB URI redigida/);
  assert.doesNotMatch(formatted, /SenhaMuitoSecreta|cluster\.example|abc123|bearer-secret|eyJhbGci/);
});

test('inclui mensagens e códigos de erros comuns de rede', () => {
  const formatted = formatSafeError(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), { code: 'ECONNREFUSED' }));
  assert.match(formatted, /Error code=ECONNREFUSED/);
  assert.match(formatted, /127\.0\.0\.1:27017/);
});

test('remove credenciais com chaves JSON e neutraliza linhas forjadas', () => {
  const formatted = formatSafeError(new Error('{"password":"fixture-password","token":"fixture-token","api_key":"fixture-key"}\r\nFORGED\u2028LINE'));
  assert.doesNotMatch(formatted, /fixture-password|fixture-token|fixture-key/);
  assert.doesNotMatch(formatted, /[\r\n\u2028\u2029]/);
  assert.match(formatted, /redigido/);
});
