import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function databaseFixture() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  // gen_random_uuid is built into PostgreSQL; PGlite does not bundle pgcrypto.
  const schema = (await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '');
  await db.exec(schema);
  const migration = await readFile(new URL('../supabase/migrations/20261030_appointment_requests.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  return { db, schema, migration };
}
export function postgrestFetch(db) {
  const tables = new Set(['users', 'rate_limits', 'session_revocations', 'appointment_requests']);
  const safeName = name => { if (!/^[a-z_]+$/.test(name)) throw new Error('Unsafe fixture identifier'); return name; };
  return async (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : {};
    const headers = new Headers(init.headers);
    try {
      let data;
      if (url.pathname.includes('/rpc/')) {
        const fn = safeName(url.pathname.split('/').at(-1));
        const args = Object.keys(body).map((key, i) => `${safeName(key)} => $${i + 1}`).join(',');
        const result = await db.query(`select * from public.${fn}(${args})`, Object.values(body));
        data = ['lavemais_request_reset'].includes(fn) ? result.rows : result.rows[0]?.[fn];
      } else {
        const table = url.pathname.split('/').at(-1);
        if (!tables.has(table)) throw new Error('Unknown fixture table');
        const values = [], conditions = [];
        for (const [key, value] of url.searchParams) {
          if (['select', 'limit', 'offset', 'order', 'on_conflict'].includes(key)) continue;
          const [op, ...rest] = value.split('.');
          if (!['eq', 'gt'].includes(op)) throw new Error('Unknown fixture operator');
          values.push(rest.join('.')); conditions.push(`${safeName(key)} ${op === 'eq' ? '=' : '>'} $${values.length}`);
        }
        const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
        const cols = url.searchParams.get('select') || '*';
        if (cols !== '*') cols.split(',').forEach(safeName);
        let sql;
        if (!init.method || init.method === 'GET') sql = `select ${cols} from public.${table}${where}`;
        else if (init.method === 'POST') {
          const names = Object.keys(body).map(safeName);
          values.push(...Object.values(body));
          sql = `insert into public.${table} (${names.join(',')}) values (${names.map((_, i) => '$' + (i+1)).join(',')})`;
          if (headers.get('prefer')?.includes('resolution=merge-duplicates')) sql += ` on conflict (${table === 'session_revocations' ? 'token_hash' : 'id'}) do update set ${names.map(n => `${n}=excluded.${n}`).join(',')}`;
          sql += ` returning ${cols}`;
        } else if (init.method === 'PATCH') {
          const assignments = Object.entries(body).map(([k,v]) => { values.push(v); return `${safeName(k)}=$${values.length}`; });
          sql = `update public.${table} set ${assignments.join(',')}${where} returning ${cols}`;
        } else throw new Error('Unknown fixture method');
        if (!init.method || init.method === 'GET') {
          if (url.searchParams.has('order')) sql += ' order by ' + url.searchParams.get('order').split(',').map(item => {
            const [name, direction] = item.split('.');
            if (!['asc', 'desc'].includes(direction)) throw new Error('Unsafe fixture order');
            return `${safeName(name)} ${direction}`;
          }).join(',');
          for (const key of ['limit', 'offset']) if (url.searchParams.has(key)) {
            const n = Number(url.searchParams.get(key));
            if (!Number.isInteger(n) || n < 0) throw new Error('Unsafe fixture pagination');
            sql += ` ${key} ${n}`;
          }
        }
        data = (await db.query(sql, values)).rows;
        if (headers.get('accept')?.includes('application/vnd.pgrst.object+json')) data = data[0] || null;
      }
      return new Response(JSON.stringify(data ?? null), { headers: { 'content-type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ code: error.code, message: error.message }), { status: error.code === '23505' ? 409 : 400, headers: { 'content-type': 'application/json' } });
    }
  };
}
