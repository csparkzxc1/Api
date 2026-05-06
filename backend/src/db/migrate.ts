import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { createSql } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, '..', '..', 'migrations');

async function main() {
  const cfg = loadConfig();
  const sql = createSql(cfg.databaseUrl);
  await sql/* sql */`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `;

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const existing = await sql/* sql */`select 1 from schema_migrations where id = ${id}`;
    if (existing.length > 0) continue;

    const ddl = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`-- applying ${id}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx/* sql */`insert into schema_migrations (id) values (${id})`;
    });
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
