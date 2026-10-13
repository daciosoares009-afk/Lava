import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileUpdate } from './profileValidation.js';

test('atualização do perfil normaliza os campos pessoais permitidos', () => {
  const result = validateProfileUpdate({ fullName: '  Cliente   LaveMais ', phone: '(11) 99999-0000', birthDate: '1990-03-15' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.fullName, 'Cliente LaveMais');
  assert.equal(result.value.phone, '(11) 99999-0000');
  assert.equal(result.value.birthDate.toISOString().slice(0, 10), '1990-03-15');
});

test('recusa e-mail e dados inválidos no perfil', () => {
  const result = validateProfileUpdate({ email: 'novo@example.test', fullName: 'Cliente', phone: '123', birthDate: 'amanhã' });
  assert.ok(result.errors.profile);
  assert.ok(result.errors.fullName);
  assert.ok(result.errors.phone);
  assert.ok(result.errors.birthDate);
  assert.equal('email' in result.value, false);
});
