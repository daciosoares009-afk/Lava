import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app, safeAccountPath } from '../server.js';

test('redirecionamentos aceitam apenas rotas exatas da conta', () => {
  for (const route of ['/conta', '/conta/inicio', '/conta/servicos', '/conta/perfil']) {
    assert.equal(safeAccountPath(route), route);
  }
  for (const value of [undefined, null, {}, ['/conta/perfil'], 'https://evil.test', '//evil.test', '/\\evil.test', '/conta/../login', '/conta/perfil?next=//evil.test', '/conta/perfil\r\nX-Evil: true', '/conta/%70erfil', '/conta/perfil/', '/conta/' + 'a'.repeat(100000)]) {
    assert.equal(safeAccountPath(value), '/conta');
  }
});

test('headers de segurança e ID não dependem dos headers do cliente', async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const response = await fetch(url, { headers: { 'X-Request-ID': 'client-controlled' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get('x-powered-by'), null);
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  for (const route of ['.env', '.git/config', 'server.js', 'src/config.js', 'dashboard.html']) {
    const denied = await fetch(url + route);
    assert.equal(denied.status, 404, route + ' must not be served');
  }
  const second = await fetch(url);
  assert.notEqual(second.headers.get('x-request-id'), response.headers.get('x-request-id'));
});
