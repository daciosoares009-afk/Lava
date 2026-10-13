import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../server.js';

test('home pública, assets e acesso à autenticação permanecem disponíveis sem sessão', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;

  const homeResponse = await fetch(`${base}/`);
  assert.equal(homeResponse.status, 200);
  const home = await homeResponse.text();
  assert.match(home, /Mais tempo para/);
  assert.match(home, /href="\/login"/);
  assert.match(home, /id="servicos"/);
  assert.match(home, /id="planos"/);
  assert.match(home, /id="sobre"/);
  assert.match(home, /id="contato"/);
  assert.doesNotMatch(home, /id="login-form"/);
  const ids = new Set([...home.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const sectionLinks = [...home.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  assert.ok(sectionLinks.length > 0);
  for (const id of sectionLinks) assert.ok(ids.has(id), `#${id} deve apontar para uma seção existente`);

  assert.match(home, /lavemais-hero\.jpg/);

  for (const resource of ['/home.css', '/home.js', '/site-content.js', '/logo-lavemais.png', '/lavemais-hero.jpg']) {
    const response = await fetch(`${base}${resource}`);
    assert.equal(response.status, 200, `${resource} deve carregar`);
  }

  const login = await fetch(`${base}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /id="login-form"/);

  const registration = await fetch(`${base}/cadastro`, { redirect: 'manual' });
  assert.equal(registration.status, 302);
  assert.equal(registration.headers.get('location'), '/login#cadastro');
});
