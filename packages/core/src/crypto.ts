import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { DomainError } from "./errors.js";

const VERSION = 1;
const ALGORITHM = "aes-256-gcm";
// This v1 domain is immutable because changing it would make existing wrapped keys unreadable.
const KEY_DERIVATION_DOMAIN_V1 = Buffer.from("6f776c2d6d656d6f7279", "hex");

export interface CipherEnvelope {
  version: number;
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface WrappedKey extends CipherEnvelope {
  keyId: string;
}

export function parseMasterKey(value: string): Buffer {
  // Node's decoder skips characters outside the alphabet, so a mistyped key could still
  // decode to 32 bytes and only fail later, as "wrong master key", against every brain.
  const trimmed = value.trim();
  const decoded = /^[A-Za-z0-9+/]{43}=?$/.test(trimmed)
    ? Buffer.from(trimmed, "base64")
    : Buffer.alloc(0);
  if (decoded.length !== 32) {
    throw new DomainError(
      "invalid_master_key",
      "REMENTUM_MASTER_KEY must be a base64-encoded 32-byte key",
      500,
    );
  }
  return decoded;
}

export function generateDataKey(): Buffer {
  return randomBytes(32);
}

export function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function derivePurposeKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, KEY_DERIVATION_DOMAIN_V1, purpose, 32));
}

export function encrypt(plaintext: string | Buffer, key: Buffer, aad: string): CipherEnvelope {
  if (key.length !== 32) throw new DomainError("invalid_key", "Encryption keys must be 32 bytes");
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext),
    cipher.final(),
  ]);
  return {
    version: VERSION,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(envelope: CipherEnvelope, key: Buffer, aad: string): Buffer {
  if (envelope.version !== VERSION) {
    throw new DomainError("unsupported_cipher", `Unsupported cipher envelope v${envelope.version}`);
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.nonce, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new DomainError("decryption_failed", "Encrypted content could not be authenticated", 500);
  }
}

export function wrapDataKey(dataKey: Buffer, masterKey: Buffer, brainId: string): WrappedKey {
  const wrappingKey = derivePurposeKey(masterKey, "brain-key-wrap");
  return {
    ...encrypt(dataKey, wrappingKey, `brain:${brainId}:dek`),
    keyId: keyId(masterKey),
  };
}

export function unwrapDataKey(wrapped: WrappedKey, masterKey: Buffer, brainId: string): Buffer {
  if (!safeEqualText(wrapped.keyId, keyId(masterKey))) {
    throw new DomainError(
      "wrong_master_key",
      "The configured master key cannot unwrap this brain",
      500,
    );
  }
  return decrypt(wrapped, derivePurposeKey(masterKey, "brain-key-wrap"), `brain:${brainId}:dek`);
}

export function contentAad(brainId: string, articleId: string, version: number | string): string {
  return `brain:${brainId}:article:${articleId}:version:${version}`;
}

export function hashContent(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
