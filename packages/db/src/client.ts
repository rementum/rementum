import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export interface DatabaseClient {
  sql: postgres.Sql;
  db: ReturnType<typeof drizzle<typeof schema>>;
  close(): Promise<void>;
}

export function createDatabaseClient(url: string, max = 10): DatabaseClient {
  const sql = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    transform: { undefined: null },
  });
  return {
    sql,
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 }),
  };
}
