import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../server.js';

test('serve a página de redefinição e seus recursos estáticos', async () => {
  const server = app.listen(0);
  try {
    await once(server, 'listening');
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const page of ['/recuperar-senha', '/recuperar-senha.html']) {
      const response = await fetch(`${baseUrl}${page}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /name="code"/);
      assert.match(html, /name="confirmPassword"/);
    }
    for (const asset of ['/recuperar-senha.js', '/recuperar-senha.css']) {
      assert.equal((await fetch(`${baseUrl}${asset}`)).status, 200, `${asset} deve carregar`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
