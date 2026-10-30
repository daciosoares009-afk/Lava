import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAppointment } from './appointmentValidation.js';
import { databaseFixture } from '../test-support/postgres.js';

test('solicitações validam datas reais no fuso da unidade e rejeitam atribuição de proprietário/status', () => {
  const now = new Date('2026-10-30T01:00:00Z');
  const valid = { service: ' Lavagem ', preferredDate: '2026-10-29' };
  assert.deepEqual(validateAppointment(valid,now).errors,{});
  assert.equal(validateAppointment(valid,now).value.service,'Lavagem');
  for (const date of ['2026-10-28','2026-02-30','2028-01-01','invalid']) assert.ok(validateAppointment({...valid,preferredDate:date},now).errors.preferredDate);
  for (const body of [null,[],{...valid,userId:'forged'},{...valid,status:'confirmed'},{...valid,notes:'x'.repeat(1001)},{...valid,service:{$gt:''}}]) assert.ok(Object.keys(validateAppointment(body,now).errors).length);
});
test('migração aditiva reaplicável mantém registros e bloqueia acesso direto e exclusão pela service role', async t => {
  const {db,migration} = await databaseFixture(); t.after(()=>db.close());
  const user = (await db.query("insert into public.users(full_name,email,phone,birth_date,password_hash) values ('Cliente Teste','sql@example.test','11999999999','1990-01-01','hash') returning id")).rows[0];
  await db.query("insert into public.appointment_requests(user_id,service,preferred_date) values ($1,'Lavagem','2026-11-01')",[user.id]);
  await db.exec(migration);
  assert.equal((await db.query('select count(*)::int as n from public.appointment_requests')).rows[0].n,1);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.appointment_requests'),/permission denied/);
    await assert.rejects(db.query("insert into public.appointment_requests(user_id,service,preferred_date) values ($1,'Lavagem','2026-11-01')",[user.id]),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await assert.rejects(db.query('delete from public.appointment_requests'),/permission denied/);
});
