import { describe, expect, it } from "vitest";
import { parseMasterKey } from "./crypto.js";

describe("parseMasterKey", () => {
  it("accepts a standard base64 32-byte key with or without padding", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    expect(parseMasterKey(key)).toEqual(Buffer.alloc(32, 9));
    expect(parseMasterKey(`${key.replace(/=$/, "")}\n`)).toEqual(Buffer.alloc(32, 9));
  });

  it("rejects keys with characters the decoder would silently drop", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    expect(() => parseMasterKey(`${key.slice(0, 10)}!${key.slice(11)}`)).toThrow(/32-byte/);
    expect(() => parseMasterKey("too-short")).toThrow(/32-byte/);
  });
});

import {
  contentAad,
  decrypt,
  derivePurposeKey,
  encrypt,
  generateDataKey,
  keyId,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto.js";

describe("envelope encryption", () => {
  it("preserves the version-one wrapping domain across the product rename", () => {
    expect(derivePurposeKey(Buffer.alloc(32, 7), "brain-key-wrap").toString("hex")).toBe(
      "d4c7586a822e2113f60e47a8d5b065292e6b95b1367745aaff2f77c011d84d18",
    );
  });

  it("round trips a body with authenticated context", () => {
    const key = generateDataKey();
    const aad = contentAad("brain", "article", 1);
    const envelope = encrypt("a planted secret", key, aad);
    expect(envelope.ciphertext).not.toContain("planted secret");
    expect(decrypt(envelope, key, aad).toString()).toBe("a planted secret");
    expect(() => decrypt(envelope, key, contentAad("brain", "article", 2))).toThrow(
      /authenticated/,
    );
  });

  it("wraps each brain key under the root key", () => {
    const root = generateDataKey();
    const data = generateDataKey();
    const wrapped = wrapDataKey(data, root, "brain-id");
    expect(wrapped.keyId).toBe(keyId(root));
    expect(unwrapDataKey(wrapped, root, "brain-id")).toEqual(data);
    expect(() => unwrapDataKey(wrapped, generateDataKey(), "brain-id")).toThrow(/master key/);
  });
});
