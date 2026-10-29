import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from './config.js';
import { databaseReady, connectDatabase, disconnectDatabase } from './db.js';
const secret = 'a'.repeat(48);
test('backend explícito elimina conflito; anon nunca substitui service role', () => {
  const both = {MONGODB_URI:'mongodb://localhost/lavemais',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',JWT_SECRET:secret};
  assert.throws(() => readConfig(both), /DATABASE_BACKEND/);
  assert.equal(readConfig({...both,DATABASE_BACKEND:'mongo'}).backend,'mongo');
  assert.equal(readConfig({...both,DATABASE_BACKEND:'supabase'}).supabaseServiceRoleKey,'service');
  assert.throws(() => readConfig({SUPABASE_URL:both.SUPABASE_URL,SUPABASE_ANON_KEY:'anon',JWT_SECRET:secret}),/SUPABASE_SERVICE_ROLE_KEY/);
});
test('configuração rejeita placeholders, URL insegura, SMTP parcial e proxy aberto', () => {
  const base={MONGODB_URI:'mongodb://localhost/lavemais',JWT_SECRET:secret};
  assert.throws(() => readConfig({...base,JWT_SECRET:'gere-um-segredo-aleatorio-com-pelo-menos-32-caracteres'}),/JWT_SECRET/);
  assert.throws(() => readConfig({...base,SMTP_HOST:'smtp.example.test'}),/SMTP/);
  assert.throws(() => readConfig({...base,TRUST_PROXY:'true'}),/TRUST_PROXY/);
  assert.throws(() => readConfig({...base,DATABASE_BACKEND:'supabase',SUPABASE_URL:'http://example.test',SUPABASE_SERVICE_ROLE_KEY:'service'}),/HTTPS/);
  assert.equal(readConfig({...base,VERCEL_ENV:'preview',NODE_ENV:'development'}).nodeEnv,'production');
});
test('URL no ambiente não equivale a banco conectado; falha de inicialização não publica cliente', async t => {
  const old=process.env.SUPABASE_URL; process.env.SUPABASE_URL='https://unreachable.test';
  t.after(async()=> {if(old===undefined) delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old;await disconnectDatabase();});
  assert.equal(Boolean(databaseReady()),false);
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({code:'42501',message:'denied'}),{status:403,headers:{'content-type':'application/json'}}));
  await assert.rejects(connectDatabase({backend:'supabase',supabaseUrl:process.env.SUPABASE_URL,supabaseServiceRoleKey:'service'}),/Esquema/);
  assert.equal(Boolean(databaseReady()),false);
});
