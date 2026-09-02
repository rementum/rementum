import postgres from "postgres";

export interface DatabaseClient {
  sql: postgres.Sql;
  close(): Promise<void>;
}

const passThrough = (value: string) => value;

export function createDatabaseClient(url: string, max = 10): DatabaseClient {
  const sql = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    transform: { undefined: null },
    // The store hands the driver JSON it has already serialised, cast with ::jsonb, and
    // reads timestamps back as ISO strings. The default serialisers would quote that JSON a
    // second time and the default parsers would hand back Date objects; both used to be
    // overridden as a side effect of the drizzle driver that once shared this client.
    types: {
      date: {
        to: 1184,
        from: [1082, 1083, 1114, 1184],
        serialize: passThrough,
        parse: passThrough,
      },
      json: {
        to: 3802,
        from: [114, 3802],
        serialize: passThrough,
        parse: (value: string) => JSON.parse(value),
      },
    },
  });
  return {
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
