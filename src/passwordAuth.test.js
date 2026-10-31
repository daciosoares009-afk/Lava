import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { passwordMatches } from './passwordAuth.js';

test('login compara bcrypt também quando a conta não existe e nunca a autentica', async t => {
  const calls = [];
  t.mock.method(bcrypt, 'hash', async (_value, cost) => { assert.equal(cost, 12); return 'dummy-hash'; });
  t.mock.method(bcrypt, 'compare', async (password, hash) => { calls.push({ password, hash }); return true; });
  assert.equal(await passwordMatches(null, 'example-only'), false);
  assert.equal(await passwordMatches({ passwordHash: 'stored-hash' }, 'example-only'), true);
  assert.deepEqual(calls.map(c => c.hash), ['dummy-hash', 'stored-hash']);
});
