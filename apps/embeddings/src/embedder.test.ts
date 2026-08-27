import { chmodSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertModelCacheWritable,
  createEmbedder,
  type Extractor,
  embeddingDimensions,
} from "./embedder.js";

function extractorReturning(vectors: number[][]): Extractor {
  return async () => ({ tolist: () => vectors });
}

const oneVector = [new Array(embeddingDimensions).fill(0)];

describe("createEmbedder", () => {
  it("retries a failed load instead of serving the cached rejection forever", async () => {
    const load = vi
      .fn<(model: string) => Promise<Extractor>>()
      .mockRejectedValueOnce(new Error("EACCES: permission denied, mkdir '/models/intfloat'"))
      .mockResolvedValueOnce(extractorReturning(oneVector));
    const embedder = createEmbedder("test-model", load);

    await expect(embedder.load()).rejects.toThrow("EACCES");
    expect(embedder.ready()).toBe(false);

    await expect(embedder.embed("query", ["hello"])).resolves.toHaveLength(1);
    expect(embedder.ready()).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("loads the model once for concurrent callers", async () => {
    const load = vi.fn(async () => extractorReturning(oneVector));
    const embedder = createEmbedder("test-model", load);

    await Promise.all([embedder.load(), embedder.load(), embedder.embed("passage", ["a"])]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("prefixes queries and passages the way the e5 models expect", async () => {
    const extractor = vi.fn(extractorReturning(oneVector));
    const embedder = createEmbedder("test-model", async () => extractor);

    await embedder.embed("query", ["how do I deploy"]);
    await embedder.embed("passage", ["deployment guide"]);

    const options = { pooling: "mean", normalize: true };
    expect(extractor).toHaveBeenNthCalledWith(1, ["query: how do I deploy"], options);
    expect(extractor).toHaveBeenNthCalledWith(2, ["passage: deployment guide"], options);
  });

  it("refuses a model whose vectors are the wrong width", async () => {
    const embedder = createEmbedder("wrong-model", async () => extractorReturning([[0, 1, 2]]));

    await expect(embedder.embed("query", ["hello"])).rejects.toThrow(
      `Embedding model wrong-model did not produce ${embeddingDimensions} dimensions`,
    );
  });
});

describe("assertModelCacheWritable", () => {
  it("creates the cache directory when it is missing", () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), "rementum-cache-")), "models");

    expect(() => assertModelCacheWritable(dir)).not.toThrow();
    expect(existsSync(dir)).toBe(true);
  });

  // root ignores the permission bits, so the failure this guards against cannot be staged there.
  it.skipIf(process.getuid?.() === 0)("names a directory it cannot write", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rementum-cache-"));
    chmodSync(dir, 0o500);

    try {
      expect(() => assertModelCacheWritable(dir)).toThrow(`Model cache ${dir} is not writable`);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  // Writable but not searchable: W_OK alone would pass here and the loader would fail later.
  it.skipIf(process.getuid?.() === 0)("names a directory it cannot search", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rementum-cache-"));
    chmodSync(dir, 0o600);

    try {
      expect(() => assertModelCacheWritable(dir)).toThrow(`Model cache ${dir} is not writable`);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});
