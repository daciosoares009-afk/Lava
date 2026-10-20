import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateLogin, validatePasswordResetConfirmation, validatePasswordResetRequest, validateRegistration } from './authValidation.js';

const validRegistration = {
  fullName: 'Maria da Silva',
  email: '  MARIA@example.com ',
  phone: '(11) 99999-9999',
  birthDate: '1990-03-15',
  password: 'lavemais123',
};

test('normaliza e-mail para minúsculas e remove espaços', () => {
  assert.equal(normalizeEmail('  Maria@Example.COM  '), 'maria@example.com');
});

test('aceita dados válidos de cadastro e normaliza e-mail', () => {
  const result = validateRegistration(validRegistration);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.email, 'maria@example.com');
});

test('recusa nome sem sobrenome, telefone curto, data futura e senha insegura', () => {
  const result = validateRegistration({ ...validRegistration, fullName: 'Maria', phone: '123', birthDate: '2999-01-01', password: 'abcdefgh' });
  assert.ok(result.errors.fullName);
  assert.ok(result.errors.phone);
  assert.ok(result.errors.birthDate);
  assert.ok(result.errors.password);
});

test('valida credenciais de login sem aceitar senha vazia', () => {
  assert.deepEqual(validateLogin({ email: 'user@example.com', password: 'senha123' }).errors, {});
  assert.ok(validateLogin({ email: 'user@example.com', password: '' }).errors.password);
});

test('valida o e-mail solicitado para redefinir a senha', () => {
  const result = validatePasswordResetRequest({ email: '  MARIA@example.com ' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.email, 'maria@example.com');
  assert.ok(validatePasswordResetRequest({ email: 'invalido' }).errors.email);
});

test('valida código de seis dígitos e senha segura na redefinição', () => {
  assert.deepEqual(validatePasswordResetConfirmation({
    email: 'maria@example.com',
    code: '042819',
    password: 'NovaSenha123',
  }).errors, {});
  assert.ok(validatePasswordResetConfirmation({
    email: 'maria@example.com',
    code: '42819',
    password: 'NovaSenha123',
  }).errors.code);
  assert.ok(validatePasswordResetConfirmation({
    email: 'maria@example.com',
    code: '042819',
    password: 'insegura',
  }).errors.password);
});
