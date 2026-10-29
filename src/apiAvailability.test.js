import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../server.js';

test('informa indisponibilidade e não aceita cadastro sem conexão ao banco', async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { status: 'unavailable', database: 'disconnected' });
    const registration = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cliente@example.com', password: 'Lavemais123', fullName: 'Cliente Teste', phone: '11999999999', birthDate: '1990-01-01' }),
    });
    assert.equal(registration.status, 503);
    assert.equal((await registration.json()).error.code, 'DATABASE_UNAVAILABLE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
