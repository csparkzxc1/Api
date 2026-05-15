import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { createSql } from './client.js';
import { loadWrappingKeyFromHex, WRAPPING_ALG } from '../security/ecies.js';

// Migrations run before the full server config is validated, so we only
// require what's strictly necessary here. Validating the full Config
// schema would fail on a fresh Railway deploy where the wrapping key /
// KEK envs may not yet be set, which would block the schema from ever
// being created.
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  WRAPPING_KID: z.string().min(1).optional(),
  WRAPPING_PRIVKEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
});

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, '..', '..', 'migrations');

async function seedWrappingKey(
  sql: ReturnType<typeof createSql>,
  kid: string,
  privHex: string,
): Promise<void> {
  const kp = loadWrappingKeyFromHex(privHex);
  const privRaw = Buffer.from(privHex, 'hex');
  const result = await sql/* sql */`
    insert into wrapping_keys (kid, alg, public_key, private_key)
    values (${kid}, ${WRAPPING_ALG}, ${kp.publicKeyRaw}, ${privRaw})
    on conflict (kid) do nothing
  `;
  if (result.count > 0) {
    console.log(`-- seeded wrapping_keys (kid=${kid})`);
  } else {
    console.log(`-- wrapping_keys already present (kid=${kid})`);
  }
}

async function main() {
  const env = EnvSchema.parse(process.env);
  const sql = createSql(env.DATABASE_URL);

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

  if (env.WRAPPING_KID && env.WRAPPING_PRIVKEY) {
    await seedWrappingKey(sql, env.WRAPPING_KID, env.WRAPPING_PRIVKEY);
  } else {
    console.warn(
      '-- skipping wrapping_keys seed: WRAPPING_KID / WRAPPING_PRIVKEY not set',
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
