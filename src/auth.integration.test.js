import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectDatabase, databaseReady } from './db.js';
import { User } from './models/User.js';

const testUri = process.env.MONGODB_TEST_URI;

test('cadastro, unicidade, login, sessão e persistência no MongoDB', { skip: !testUri && 'Configure MONGODB_TEST_URI com um banco dedicado para executar este teste.' }, async () => {
  const email = `lavemais-${randomUUID()}@example.test`;
  const password = 'TesteLavemais2026';
  const sessionSecret = 'test-secret-only-for-local-integration-tests-32';
  let server;
  let connected = false;

  try {
    await connectDatabase(testUri);
    connected = true;
    app.locals.config = { jwtSecret: sessionSecret, nodeEnv: 'test' };
    server = app.listen(0);
    await once(server, 'listening');
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const request = (path, body, cookie) => fetch(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const registration = { fullName: 'Cliente de Teste', email, phone: '(11) 99999-0000', birthDate: '1990-03-15', password };

    const createdResponse = await request('/api/auth/register', registration);
    assert.equal(createdResponse.status, 201, 'cadastro deve responder com sucesso após gravar no MongoDB');
    const createdBody = await createdResponse.json();
    assert.equal(createdBody.user.email, email);
    const stored = await User.findOne({ email }).select('+passwordHash');
    assert.ok(stored, 'usuário deve existir no banco');
    assert.notEqual(stored.passwordHash, password, 'senha não pode estar armazenada em texto simples');
    assert.equal(await (await request('/api/auth/register', registration)).status, 409, 'e-mail duplicado deve ser recusado');

    assert.equal((await request('/api/auth/login', { email, password: 'SenhaErrada123' })).status, 401, 'senha incorreta deve ser recusada');
    const loginResponse = await request('/api/auth/login', { email, password });
    assert.equal(loginResponse.status, 200, 'credenciais corretas devem permitir login');
    const setCookies = loginResponse.headers.getSetCookie?.() || [loginResponse.headers.get('set-cookie') || ''];
    const sessionCookie = setCookies.find((value) => /^lavemais_session=.+; Path=\//.test(value));
    const cookie = sessionCookie?.split(';', 1)[0];
    assert.match(cookie || '', /^lavemais_session=/, 'login deve emitir cookie de sessão');
    assert.match(sessionCookie || '', /Path=\/;/, 'cookie deve ser enviado à rota protegida /conta');
    assert.equal((await request('/api/auth/me', null, cookie)).status, 200, 'sessão deve autenticar rota privada');
    const existingSessionLoginPage = await fetch(`${baseUrl}/login?next=%2Fconta%2Fservicos`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(existingSessionLoginPage.status, 302, 'cliente autenticado que abre login deve seguir para o dashboard');
    assert.equal(existingSessionLoginPage.headers.get('location'), '/conta/servicos', 'login deve preservar a página solicitada');
    const unsafeNext = await fetch(`${baseUrl}/login?next=https%3A%2F%2Fexample.com`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(unsafeNext.headers.get('location'), '/conta', 'redirecionamento externo deve ser recusado');

    const dashboardResponse = await fetch(`${baseUrl}/conta/servicos`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(dashboardResponse.status, 200, 'cliente autenticado deve acessar o dashboard');
    const dashboardMarkup = await dashboardResponse.text();
    assert.match(dashboardMarkup, /Minha conta/);
    assert.match(dashboardMarkup, /mobile-menu-toggle/, 'dashboard deve oferecer o menu móvel completo');
    for (const asset of ['/dashboard.css', '/dashboard.js', '/logo-lavemais.png']) {
      assert.equal((await fetch(`${baseUrl}${asset}`)).status, 200, `${asset} deve carregar também nas páginas internas`);
    }
    for (const section of ['inicio', 'agendamentos', 'servicos', 'planos', 'beneficios', 'perfil', 'sobre']) {
      assert.equal((await fetch(`${baseUrl}/conta/${section}`, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 200, `${section} deve abrir como uma página privada do dashboard`);
    }
    assert.equal((await fetch(`${baseUrl}/conta/painel-inexistente`, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 404, 'rotas desconhecidas da área do cliente devem ser recusadas');
    const protectedPage = await fetch(`${baseUrl}/conta/planos`, { redirect: 'manual' });
    assert.equal(protectedPage.status, 302, 'visitante sem sessão deve ser encaminhado ao login');
    assert.equal(protectedPage.headers.get('location'), '/login?next=%2Fconta%2Fplanos');

    assert.equal((await request('/api/client/profile', null)).status, 401, 'perfil deve exigir autenticação');
    const profileResponse = await request('/api/client/profile', null, cookie);
    assert.equal(profileResponse.status, 200, 'cliente autenticado deve consultar seu próprio perfil');
    const profileBody = await profileResponse.json();
    assert.equal(profileBody.user.phone, registration.phone);
    assert.equal('passwordHash' in profileBody.user, false, 'perfil nunca deve expor hash da senha');
    const changedProfile = await fetch(`${baseUrl}/api/client/profile`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ fullName: 'Cliente Atualizado', phone: '(11) 98888-1111', birthDate: '1991-04-20' }),
    });
    assert.equal(changedProfile.status, 200, 'perfil permite atualizar campos autorizados');
    assert.equal((await changedProfile.json()).user.fullName, 'Cliente Atualizado');
    const persistedProfile = await User.findOne({ email });
    assert.equal(persistedProfile.fullName, 'Cliente Atualizado', 'alterações do perfil devem ser persistidas no MongoDB');
    assert.equal(persistedProfile.phone, '(11) 98888-1111');
    assert.equal((await User.findOne({ email }).select('+passwordHash')).passwordHash, stored.passwordHash, 'perfil não altera o hash da senha');
    const forbiddenEdit = await fetch(`${baseUrl}/api/client/profile`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'outro@example.test' }),
    });
    assert.equal(forbiddenEdit.status, 400, 'e-mail não pode ser alterado sem fluxo de verificação');
    assert.equal((await User.findById(stored.id)).email, email, 'dados sempre pertencem ao usuário da sessão');

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(logoutResponse.status, 204);
    assert.ok((logoutResponse.headers.getSetCookie?.() || [logoutResponse.headers.get('set-cookie') || '']).some((value) => value.includes('lavemais_session=') && value.includes('Expires=')), 'logout deve expirar o cookie da sessão');
    assert.equal((await request('/api/client/profile', null)).status, 401, 'perfil sem o cookie deve recusar acesso após logout');

    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server = null;
    await mongoose.disconnect();
    connected = false;
    await connectDatabase(testUri);
    connected = true;
    assert.equal(await User.exists({ email }).then(Boolean), true, 'usuário deve continuar no banco após reconectar');
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (databaseReady()) {
      await User.deleteOne({ email });
      await mongoose.disconnect();
    } else if (connected) {
      await mongoose.disconnect();
    }
  }
});
