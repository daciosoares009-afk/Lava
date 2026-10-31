import test from 'node:test';
import assert from 'node:assert/strict';
import { base32, totp, matchingCounter, encryptSecret, decryptSecret, recoveryCodes, recoveryHash } from './mfaCrypto.js';

test('TOTP corresponde aos vetores SHA1 da RFC 6238',()=>{
  const secret=base32(Buffer.from('12345678901234567890'));
  for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(secret,Math.floor(seconds/30),8),expected);
  assert.equal(matchingCounter(secret,totp(secret,2),60000),2);
  assert.equal(matchingCounter(secret,'12a456',60000),null);
  assert.equal(matchingCounter(secret,totp(secret,20),60000),null);
});
test('segredo é autenticado, aleatório e vinculado ao usuário',()=>{
  const config={mfaEncryptionKey:'12'.repeat(32)};
  const a=encryptSecret('fixture-secret',config,'user-a'),b=encryptSecret('fixture-secret',config,'user-a');
  assert.notEqual(a,b);assert.equal(decryptSecret(a,config,'user-a'),'fixture-secret');
  assert.throws(()=>decryptSecret(a,config,'user-b'));
  assert.throws(()=>decryptSecret(a,{mfaEncryptionKey:'34'.repeat(32)},'user-a'));
  const codes=recoveryCodes();assert.equal(new Set(codes).size,8);assert.ok(codes.every(code=>/^[a-f0-9]{24}$/.test(code)&&recoveryHash(code)!==code));
});
