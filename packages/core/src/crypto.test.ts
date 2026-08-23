import { describe, expect, it } from "vitest";
import {
  contentAad,
  decrypt,
  encrypt,
  generateDataKey,
  keyId,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto.js";

describe("envelope encryption", () => {
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
