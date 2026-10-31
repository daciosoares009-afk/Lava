import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generateKeyPairSync,createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import { connectDatabase,disconnectDatabase } from './db.js';
import { databaseFixture,postgrestFetch } from '../test-support/postgres.js';
import { verifyGoogleToken } from './googleAuth.js';
import { mfaStore } from './mfaStore.js';

test('Google OAuth verifica estado, PKCE, identidade, vínculo por senha e MFA',async t=>{
  const {db}=await databaseFixture(),nativeFetch=globalThis.fetch,transport=postgrestFetch(db);
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...publicKey.export({format:'jwk'}),kid:'fixture-key'};
  let nonce,pkce,tokenCalls=0;
  const config={backend:'supabase',supabaseUrl:'https://google-fixture.invalid',supabaseServiceRoleKey:'fixture',jwtSecret:'fixture-google-jwt-1234567890123456789012',nodeEnv:'test',googleClientId:'fixture-client',googleClientSecret:'fixture-secret',appBaseUrl:'https://lavemais.test'};
  const token=(extra={})=>jwt.sign({sub:'fixture-google-sub',email:'fixture@example.test',email_verified:true,name:'Cliente Exemplo',nonce,...extra},privateKey,{algorithm:'RS256',keyid:'fixture-key',issuer:'https://accounts.google.com',audience:config.googleClientId,expiresIn:'5m'});
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(String(url).startsWith(config.supabaseUrl))return transport(url,init);
    if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
    if(String(url)==='https://oauth2.googleapis.com/token'){tokenCalls++;assert.equal(createHash('sha256').update(init.body.get('code_verifier')).digest('base64url'),pkce);return Response.json({id_token:token()});}
    return nativeFetch(url,init);
  });
  await connectDatabase(config);app.locals.config=config;const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await disconnectDatabase();await db.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(route,body,cookie)=>nativeFetch(base+route,{redirect:'manual',method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const cookieOf=(res,name)=>res.headers.getSetCookie().find(value=>value.startsWith(name+'=')&&!value.startsWith(name+'=;'))?.split(';')[0];
  const password='FixturePassword123';await call('/api/auth/register',{fullName:'Cliente Exemplo',email:'fixture@example.test',phone:'11999999999',birthDate:'1990-01-01',password});
  async function start(){const res=await call('/api/auth/google');assert.equal(res.status,302);const url=new URL(res.headers.get('location'));nonce=url.searchParams.get('nonce');pkce=url.searchParams.get('code_challenge');return {state:url.searchParams.get('state'),cookie:cookieOf(res,'lavemais_google_state')};}
  let flow=await start();const invalid=await call('/api/auth/google/callback?state=wrong&code=fixture',null,flow.cookie);assert.equal(invalid.headers.get('location'),'/login?google=failed');assert.equal(tokenCalls,0);
  flow=await start();const callback=await call('/api/auth/google/callback?state='+flow.state+'&code=fixture',null,flow.cookie);
  const pending=cookieOf(callback,'lavemais_google_pending');assert.ok(pending);assert.equal(cookieOf(callback,'lavemais_session'),undefined);
  assert.equal((await (await call('/api/auth/google/pending',null,pending)).json()).email,'fixture@example.test');
  assert.equal((await call('/api/auth/login',{email:'fixture@example.test',password:'wrong'},pending)).status,401);
  assert.equal((await db.query('select google_subject from public.users')).rows[0].google_subject,null);
  const linked=await call('/api/auth/login',{email:'fixture@example.test',password},pending);assert.equal(linked.status,200);
  const id=(await db.query('select id,google_subject from public.users')).rows[0];assert.equal(id.google_subject,'fixture-google-sub');
  flow=await start();const signedIn=await call('/api/auth/google/callback?state='+flow.state+'&code=fixture',null,flow.cookie);assert.equal(signedIn.headers.get('location'),'/conta');assert.ok(cookieOf(signedIn,'lavemais_session'));
  await assert.rejects(verifyGoogleToken(token({email_verified:false}),config,nonce));await assert.rejects(verifyGoogleToken(token(),config,'wrong-nonce'));
  await mfaStore.begin(id.id,'encrypted-fixture','fixture-version');await mfaStore.activate(id.id,'fixture-version',1,[]);
  flow=await start();const mfa=await call('/api/auth/google/callback?state='+flow.state+'&code=fixture',null,flow.cookie);assert.equal(cookieOf(mfa,'lavemais_session'),undefined);
  const payload=await(await call('/api/auth/google/pending',null,cookieOf(mfa,'lavemais_google_pending'))).json();assert.equal(payload.mfaRequired,true);
  assert.equal((await call('/api/auth/me',null,'lavemais_session='+payload.challenge)).status,401);
});
