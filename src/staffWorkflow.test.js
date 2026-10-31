import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { databaseFixture, postgrestFetch } from '../test-support/postgres.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { notifyStaff } from './staffNotifications.js';
import { isStaff } from './staffAccess.js';
import { readConfig } from './config.js';
import nodemailer from 'nodemailer';

test('acesso de equipe é atribuído por ID explícito, nunca por domínio, formulário ou claim',()=>{
  assert.equal(isStaff({id:'a',role:'admin'},{}),false);
  assert.equal(isStaff({id:'b'},{staffUserIds:['a']}),false);
  assert.equal(isStaff({id:'a'},{staffUserIds:['a']}),true);
  const base={DATABASE_BACKEND:'supabase',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',JWT_SECRET:'x'.repeat(48)};
  assert.throws(()=>readConfig({...base,STAFF_USER_IDS:'email@example.test'}),/STAFF_USER_IDS/);
  assert.throws(()=>readConfig({...base,STAFF_NOTIFICATION_EMAIL:'staff@example.test'}),/SMTP/);
  assert.throws(()=>readConfig({...base,NODE_ENV:'production',APP_BASE_URL:'http://localhost:3000'}),/APP_BASE_URL/);
});
test('migração da equipe preserva dados e limita transições e acesso às RPCs',async t=>{
  const {db}=await databaseFixture();t.after(()=>db.close());
  const user=(await db.query("insert into public.users(full_name,email,phone,birth_date,password_hash) values ('Cliente Teste','staff@example.test','11999999999','1990-01-01','hash') returning id")).rows[0].id;
  const id=(await db.query("insert into public.appointment_requests(user_id,service,preferred_date) values ($1,'Lavagem','2026-11-01') returning id",[user])).rows[0].id;
  await db.exec(await readFile(new URL('../supabase/migrations/20261030_staff_workflow.sql',import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from public.lavemais_staff_transition($1,0,'confirmed','Teste',$2)",[id,user]),/permission denied/);
    await db.exec('reset role');
  }
  const transition=(revision,status)=>db.query("select * from public.lavemais_staff_transition($1,$2,$3,'Orientação teste',$4)",[id,revision,status,user]);
  assert.equal((await transition(0,'completed')).rows.length,0);
  const results=await Promise.all([transition(0,'confirmed'),transition(0,'cancelled')]);
  assert.equal(results.filter(r=>r.rows.length).length,1);
  assert.equal((await db.query('select staff_history from public.appointment_requests where id=$1',[id])).rows[0].staff_history.length,1);
});
test('avisos persistem falha e reenvio; claim impede envio concorrente e SMTP não recebe dados pessoais',async t=>{
  const {db}=await databaseFixture();t.after(async()=>{await disconnectDatabase();await db.close();});
  const transport=postgrestFetch(db);
  t.mock.method(globalThis,'fetch',transport);
  const config={backend:'supabase',supabaseUrl:'https://fixture.invalid',supabaseServiceRoleKey:'fixture',staffNotificationEmail:'staff@example.test',appBaseUrl:'https://lavemais.example',smtp:{host:'smtp.example',port:587,user:'fixture',password:'fixture',from:'sender@example.test'}};
  await connectDatabase(config);
  const user=(await db.query("insert into public.users(full_name,email,phone,birth_date,password_hash) values ('Nome Privado','private@example.test','11999999999','1990-01-01','hash') returning id")).rows[0].id;
  const id=(await db.query("insert into public.appointment_requests(user_id,service,preferred_date,notes) values ($1,'Lavagem','2026-11-01','Observação privada') returning id",[user])).rows[0].id;
  let fail=true,calls=0;
  t.mock.method(nodemailer,'createTransport',()=>({sendMail:async mail=>{
    calls++;assert.equal(mail.to,config.staffNotificationEmail);assert.match(mail.text,/https:\/\/lavemais.example\/equipe/);
    assert.doesNotMatch(mail.text,/Privado|private@example|Observação/);
    if(fail)throw new Error('fixture delivery failure');
  }}));
  assert.equal((await notifyStaff(id,config)).state,'failed');
  assert.equal((await db.query('select notification_state from public.appointment_requests where id=$1',[id])).rows[0].notification_state,'failed');
  fail=false;const results=await Promise.all([notifyStaff(id,config),notifyStaff(id,config)]);
  assert.equal(results.filter(r=>r.state==='sent').length,1);assert.equal(calls,2);
  assert.equal((await notifyStaff(id,config)).state,'unchanged');assert.equal(calls,2);
  assert.equal((await db.query('select revision from public.appointment_requests where id=$1',[id])).rows[0].revision,0,'sending notification does not invalidate customer edits');
});
