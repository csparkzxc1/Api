/**
 * Postgres-js stub for fast in-process route tests.
 *
 * Real Postgres lives behind tagged template literals; the test author
 * registers patterns (substring matched against the joined raw template)
 * and the matching response. The proxy also exposes `begin` (passes the
 * same handler back as a tx) and `end` (no-op).
 *
 * The point isn't query realism — that's what the testcontainers
 * integration suite is for. The point is to exercise the route handler's
 * branching (4xx paths, ownership checks, response shape) without spinning
 * up Docker.
 */

export type FakeRow = Record<string, unknown>;

export interface FakeQueryHandler {
  match: RegExp | string;
  /** Either a static row set or a dynamic responder. The values passed to the
   *  template literal are forwarded so handlers can inspect them. */
  rows: FakeRow[] | ((values: readonly unknown[]) => FakeRow[]);
}

type SqlFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<FakeRow[]> & { count?: number })
  & { begin: (cb: (tx: SqlFn) => Promise<unknown>) => Promise<unknown> }
  & { unsafe: (raw: string) => Promise<FakeRow[]> }
  & { end: () => Promise<void> };

export interface FakeSql {
  sql: SqlFn;
  /** Calls captured for assertion. */
  calls: { query: string; values: unknown[] }[];
}

export function createFakeSql(handlers: FakeQueryHandler[] = []): FakeSql {
  const calls: { query: string; values: unknown[] }[] = [];

  const sqlFn: SqlFn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    // Reconstruct the template body roughly, replacing slots with `?` placeholders.
    const query = strings.raw.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ query, values });
    for (const h of handlers) {
      const matched = typeof h.match === 'string'
        ? query.includes(h.match)
        : h.match.test(query);
      if (!matched) continue;
      const rows = typeof h.rows === 'function' ? h.rows(values) : h.rows;
      const out = Object.assign(Promise.resolve(rows), { count: rows.length });
      return out as Promise<FakeRow[]> & { count: number };
    }
    return Object.assign(
      Promise.reject(new Error(`fakeSql: no handler for: ${query}`)),
      { count: 0 },
    ) as Promise<FakeRow[]> & { count: number };
  }) as SqlFn;

  sqlFn.begin = async (cb) => cb(sqlFn);
  sqlFn.unsafe = async () => [];
  sqlFn.end = async () => {};

  return { sql: sqlFn, calls };
}
