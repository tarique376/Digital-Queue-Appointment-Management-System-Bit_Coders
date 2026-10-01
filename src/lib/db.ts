import { Pool, types, type QueryResultRow } from "pg";
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1184, (value) => new Date(value).toISOString());
export interface DB {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
declare global {
  var queuePool: Pool | undefined;
  var queueTestDB: DB | undefined;
}
export function configured() {
  return !!process.env.DATABASE_URL || !!globalThis.queueTestDB || testDatabaseEnabled();
}
function testDatabaseEnabled() {return process.env.NODE_ENV!=='production'&&process.env.PLAYWRIGHT_TEST==='1'&&!!process.env.TEST_DATABASE_DIR;}
export function database(): DB {
  if (globalThis.queueTestDB) return globalThis.queueTestDB;
  if(testDatabaseEnabled()){
    // Explicit development-only fixture. Never used as a production fallback.
    const {PGlite}=require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
    const engine=new PGlite(process.env.TEST_DATABASE_DIR);
    const adapter=(source:Pick<import('@electric-sql/pglite').PGlite,'query'>):DB=>({query:async<T extends QueryResultRow>(sql:string,values?:unknown[])=>({rows:(await source.query(sql,values)).rows as T[]})});
    globalThis.queueTestDB=Object.assign(adapter(engine),{transaction:<R>(fn:(db:DB)=>Promise<R>)=>engine.transaction(tx=>fn(adapter(tx as Pick<import('@electric-sql/pglite').PGlite,'query'>)))});
    return globalThis.queueTestDB;
  }
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is missing. Follow docs/SETUP.md to connect Neon.",
    );
  globalThis.queuePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 20000,
  });
  return globalThis.queuePool;
}
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  database();
  if (globalThis.queueTestDB) {
    // PGlite test adapter supplies serialized transactions in tests.
    return (
      globalThis.queueTestDB as DB & {
        transaction: <R>(fn: (db: DB) => Promise<R>) => Promise<R>;
      }
    ).transaction(fn);
  }
  database();
  const client = await globalThis.queuePool!.connect();
  try {
    await client.query("BEGIN");
    // Global organization row lock is intentionally conservative: all business mutations
    // serialize across every process, including capacity checks and token claims.
    await client.query("SELECT id FROM settings WHERE id=1 FOR UPDATE");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function closeDatabase() {
  await globalThis.queuePool?.end();
  globalThis.queuePool = undefined;
}
