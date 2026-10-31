import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../server.js';
import { validateRegistration,validatePasswordResetConfirmation,validateLogin } from './authValidation.js';

test('senhas novas exigem 12 caracteres sem bloquear login de senhas antigas',()=>{
  assert.ok(validateRegistration({password:'Short123'}).errors.password);
  assert.ok(validatePasswordResetConfirmation({password:'Short123'}).errors.password);
  assert.equal(validateLogin({email:'fixture@example.test',password:'Old12345'}).errors.password,undefined);
});
test('políticas públicas acessíveis sem banco e HSTS configurado',async t=>{
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const route of ['/privacidade','/cookies']){
    const response=await fetch(base+route);assert.equal(response.status,200);assert.match(await response.text(),/LaveMais/);
    assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000');
  }
});
