import { readFile } from "node:fs/promises";
import { AuthRepository, createDatabaseClient } from "@owl-memory/db";
import { hash } from "argon2";

const argv = process.argv.slice(2);
if (argv[0] === "--") argv.shift();
const [command, ...args] = argv;
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

if (command !== "create-owner") {
  process.stderr.write(
    "Usage: pnpm admin -- create-owner --email you@example.com --password-file /run/secrets/admin-password [--name Name]\n",
  );
  process.exit(2);
}

const email = value("--email");
const passwordFile = value("--password-file") ?? process.env.OWL_ADMIN_PASSWORD_FILE;
const passwordFromEnv = process.env.OWL_ADMIN_PASSWORD;
if (!email || (!passwordFile && !passwordFromEnv)) {
  throw new Error("--email and --password-file (or OWL_ADMIN_PASSWORD) are required");
}
const password = passwordFile
  ? (await readFile(passwordFile, "utf8")).trim()
  : (passwordFromEnv ?? "");
if (password.length < 12) throw new Error("Owner password must be at least 12 characters");

const url = process.env.OWL_DATABASE_ADMIN_URL ?? process.env.OWL_DATABASE_URL;
if (!url) throw new Error("OWL_DATABASE_ADMIN_URL is required");
const database = createDatabaseClient(url, 1);
try {
  const repository = new AuthRepository(database);
  const created = await repository.createOwner(
    email,
    value("--name") ?? email.split("@")[0] ?? "Owner",
    await hash(password, { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 }),
  );
  process.stdout.write(
    `Created owner ${created.user.email} and workspace ${created.workspaceId}\n`,
  );
} finally {
  await database.close();
}
