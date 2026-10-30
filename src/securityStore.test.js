import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIdentity } from './securityStore.js';
const req=(ip,header,vercelDeployment=false)=>({ip,headers:{'x-forwarded-for':header},app:{locals:{config:{vercelDeployment}}}});
test('IP do limite não confia em header fora da Vercel e agrupa IPv6 por /64',()=>{
  assert.equal(clientIdentity(req('127.0.0.1','203.0.113.1')),'127.0.0.1');
  assert.equal(clientIdentity(req('127.0.0.1','203.0.113.1',true)),'203.0.113.1');
  assert.equal(clientIdentity(req('127.0.0.1','untrusted, chain',true)),'127.0.0.1');
  assert.equal(clientIdentity(req('::ffff:127.0.0.1')),'127.0.0.1');
  assert.equal(clientIdentity(req('2001:db8:0001:2::1234')),clientIdentity(req('2001:db8:1:2:ffff::')));
});
