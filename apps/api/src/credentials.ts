import { randomBytes } from "node:crypto";
import type { AuthRepository, UserRecord } from "@rementum/db";
import { hash, verify } from "argon2";

export type VerifyCredentials = (email: string, password: string) => Promise<UserRecord | null>;

export async function createCredentialVerifier(auth: AuthRepository): Promise<VerifyCredentials> {
  const dummyPasswordHash = await hash(randomBytes(32), {
    type: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  return async (email, password) => {
    const user = await auth.findUserByEmail(email.trim().toLowerCase());
    return (await verifyLoginPassword(user, password, dummyPasswordHash)) ? user : null;
  };
}

export async function verifyLoginPassword(
  user: { passwordHash: string } | null,
  password: string | undefined,
  dummyPasswordHash: string,
  verifier: (passwordHash: string, candidate: string) => Promise<boolean> = verify,
): Promise<boolean> {
  const matches = await verifier(user?.passwordHash ?? dummyPasswordHash, password ?? "");
  return Boolean(user && password && matches);
}
