import { generateKeyPairSync, randomUUID } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = privateKey.export({ format: "jwk" });

process.stdout.write(
  `${JSON.stringify({ keys: [{ ...jwk, use: "sig", alg: "RS256", kid: randomUUID() }] })}\n`,
);
