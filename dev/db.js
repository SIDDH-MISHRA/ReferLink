// Local stand-in for Supabase: a real Postgres (PGlite) running inside Node.
// It loads the same supabase/schema.sql that goes live, then switches to the
// "anon" role, so every call has the same rights as a browser on the live site.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const SCHEMA = new URL('../supabase/schema.sql', import.meta.url);

export async function openDb(dataDir) {
  const db = new PGlite(dataDir);
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    reset role;
  `);
  await db.exec(await readFile(SCHEMA, 'utf8'));
  await db.exec('grant usage on schema public to anon, authenticated; set role anon;');
  return db;
}

// Calls a function the way Supabase's REST API does: POST /rest/v1/rpc/<fn> with named arguments.
export async function rpc(db, fn, args = {}) {
  const names = Object.keys(args);
  if (!/^[a-z_]+$/.test(fn) || !names.every((n) => /^[a-z_]+$/.test(n))) {
    throw Object.assign(new Error('bad request'), { code: 'PGRST100' });
  }
  const list = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
  const res = await db.query(`select public.${fn}(${list}) as result`, names.map((n) => args[n]));
  return res.rows[0].result;
}
