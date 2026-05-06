import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Account } from '@pulsewatch/shared-types';
import { decapsulate } from '../security/ecies.js';
import { wrapDataKey } from '../security/crypto.js';

const AccountCreate = z.object({
  provider: z.enum(['anthropic', 'openai']),
  label: z.string().min(1).max(64),
  wrapped_key: z.string().min(8),
  kid: z.string().min(1).max(64),
  org_id: z.string().max(128).optional(),
});

type AccountRow = {
  id: string;
  provider: 'anthropic' | 'openai';
  label: string;
  org_id: string | null;
  status: 'pending' | 'active' | 'error';
  error_message: string | null;
  last_polled_at: Date | null;
  created_at: Date;
};

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    org_id: row.org_id ?? undefined,
    status: row.status,
    error_message: row.error_message,
    last_polled_at: row.last_polled_at ? row.last_polled_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
  };
}

export async function accountsRoutes(app: FastifyInstance) {
  app.get('/v1/accounts', async (req) => {
    const { userId } = req.auth!;
    const rows = await app.sql<AccountRow[]>`
      select id, provider, label, org_id, status, error_message, last_polled_at, created_at
      from accounts
      where user_id = ${userId} and removed_at is null
      order by created_at asc
    `;
    return rows.map(toAccount);
  });

  app.post('/v1/accounts', async (req, reply) => {
    const { userId } = req.auth!;
    const body = AccountCreate.parse(req.body);

    if (body.provider === 'openai' && !body.org_id) {
      return reply.code(400).send({ error: 'openai_org_id_required' });
    }
    if (body.kid !== app.cfg.wrappingKid) {
      return reply.code(400).send({ error: 'unknown_wrapping_kid' });
    }

    // Decapsulate the ECIES envelope from the phone, then immediately rewrap
    // with the at-rest KEK. The plaintext lives only on this stack frame.
    let plaintext: Buffer;
    try {
      plaintext = decapsulate(app.cfg.wrappingKey, Buffer.from(body.wrapped_key, 'base64'));
    } catch (err) {
      return reply.code(400).send({ error: 'unwrap_failed' });
    }
    if (plaintext.length < 8 || plaintext.length > 4096) {
      plaintext.fill(0);
      return reply.code(400).send({ error: 'invalid_provider_key' });
    }

    let stored: { kid: string; ciphertext: Buffer };
    try {
      stored = wrapDataKey(app.cfg, plaintext);
    } finally {
      plaintext.fill(0);
    }

    const rows = await app.sql<AccountRow[]>`
      insert into accounts (user_id, provider, label, org_id, kid, wrapped_key)
      values (
        ${userId},
        ${body.provider},
        ${body.label},
        ${body.org_id ?? null},
        ${stored.kid},
        ${stored.ciphertext}
      )
      returning id, provider, label, org_id, status, error_message, last_polled_at, created_at
    `;
    const row = rows[0]!;

    await app.pollQueue.add(
      'poll-account',
      { accountId: row.id, reason: 'on_create' },
      { jobId: `acct:${row.id}:on_create`, removeOnComplete: 100, removeOnFail: 50 },
    );

    return reply.code(201).send(toAccount(row));
  });

  app.get<{ Params: { account_id: string } }>(
    '/v1/accounts/:account_id',
    async (req, reply) => {
      const { userId } = req.auth!;
      const rows = await app.sql<AccountRow[]>`
        select id, provider, label, org_id, status, error_message, last_polled_at, created_at
        from accounts
        where id = ${req.params.account_id} and user_id = ${userId} and removed_at is null
      `;
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      return toAccount(rows[0]!);
    },
  );

  app.delete<{ Params: { account_id: string } }>(
    '/v1/accounts/:account_id',
    async (req, reply) => {
      const { userId } = req.auth!;
      const result = await app.sql`
        update accounts set removed_at = now()
        where id = ${req.params.account_id} and user_id = ${userId} and removed_at is null
      `;
      if (result.count === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { account_id: string } }>(
    '/v1/accounts/:account_id/refresh',
    async (req, reply) => {
      const { userId } = req.auth!;
      const rows = await app.sql<{ id: string }[]>`
        select id from accounts
        where id = ${req.params.account_id} and user_id = ${userId} and removed_at is null
      `;
      if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
      const enqueuedAt = new Date();
      await app.pollQueue.add(
        'poll-account',
        { accountId: req.params.account_id, reason: 'manual' },
        {
          jobId: `acct:${req.params.account_id}:manual:${enqueuedAt.getTime()}`,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
      return reply.code(202).send({
        account_id: req.params.account_id,
        enqueued_at: enqueuedAt.toISOString(),
      });
    },
  );
}
