import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
const jwk = await exportJWK(privateKey);
process.stdout.write(
  `${JSON.stringify({ keys: [{ ...jwk, use: "sig", alg: "RS256", kid: randomUUID() }] })}\n`,
);
