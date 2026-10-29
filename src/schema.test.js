import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseFixture } from '../test-support/postgres.js';

test('SQL reaplicável, permissões fechadas, reset atômico, cooldown e contador compartilhado', async t => {
  const { db, schema } = await databaseFixture();
  t.after(() => db.close());
  await db.exec(schema);
  await db.query("insert into public.users(full_name,email,phone,birth_date,password_hash) values ('Cliente Teste','cliente@example.test','11999999999','1990-01-01','original')");
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.users'), /permission denied/);
    await assert.rejects(db.query("select public.lavemais_consume_reset('cliente@example.test','code','hacked')"), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const request = hash => db.query("select * from public.lavemais_request_reset('cliente@example.test',$1)", [hash]);
  assert.equal((await request('first')).rows.length, 1);
  assert.equal((await request('second')).rows.length, 0, 'cooldown is enforced in the write');
  await db.query("select public.lavemais_cancel_reset('cliente@example.test','wrong')");
  assert.equal((await db.query('select password_reset_code_hash from public.users')).rows[0].password_reset_code_hash, 'first');
  const outcomes = await Promise.all([1,2].map(() => db.query("select public.lavemais_consume_reset('cliente@example.test','first','new') as ok")));
  assert.equal(outcomes.filter(r => r.rows[0].ok).length, 1);
  assert.equal((await db.query('select session_version from public.users')).rows[0].session_version, 1);
  assert.equal((await request('third')).rows.length, 1, 'new reset works after consuming the previous one');
  await db.query("update public.users set password_reset_expires_at = now() - interval '1 second'");
  assert.equal((await db.query("select public.lavemais_consume_reset('cliente@example.test','third','bad') as ok")).rows[0].ok, false);
  await db.query("select public.lavemais_cancel_reset('cliente@example.test','third')");
  assert.equal((await request('fourth')).rows.length, 1, 'delivery failure can be retried');
  const counts = await Promise.all([1,2,3].map(() => db.query("select public.lavemais_rate_limit('shared',now()+interval '1 minute') as n")));
  assert.deepEqual(counts.map(r => r.rows[0].n), [1,2,3]);
});
