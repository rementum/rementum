import { chmodSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertModelCacheWritable,
  createEmbedder,
  type Extractor,
  embeddingDimensions,
  type ModelSpec,
  resolveModelSpec,
} from "./embedder.js";

const E5_SPEC: ModelSpec = {
  pooling: "mean",
  queryPrefix: "query: ",
  passagePrefix: "passage: ",
  dtype: "fp32",
};

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
    const embedder = createEmbedder("test-model", E5_SPEC, load);

    await expect(embedder.load()).rejects.toThrow("EACCES");
    expect(embedder.ready()).toBe(false);

    await expect(embedder.embed("query", ["hello"])).resolves.toHaveLength(1);
    expect(embedder.ready()).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("loads the model once for concurrent callers", async () => {
    const load = vi.fn(async () => extractorReturning(oneVector));
    const embedder = createEmbedder("test-model", E5_SPEC, load);

    await Promise.all([embedder.load(), embedder.load(), embedder.embed("passage", ["a"])]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("prefixes queries and passages the way the e5 models expect", async () => {
    const extractor = vi.fn(extractorReturning(oneVector));
    const embedder = createEmbedder("test-model", E5_SPEC, async () => extractor);

    await embedder.embed("query", ["how do I deploy"]);
    await embedder.embed("passage", ["deployment guide"]);

    const options = { pooling: "mean", normalize: true };
    expect(extractor).toHaveBeenNthCalledWith(1, ["query: how do I deploy"], options);
    expect(extractor).toHaveBeenNthCalledWith(2, ["passage: deployment guide"], options);
  });

  it("refuses a model whose vectors are the wrong width", async () => {
    const embedder = createEmbedder("wrong-model", E5_SPEC, async () =>
      extractorReturning([[0, 1, 2]]),
    );

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
});

describe("resolveModelSpec", () => {
  it("gives granite models CLS pooling, no prefixes, and a quantized dtype", () => {
    expect(
      resolveModelSpec("onnx-community/granite-embedding-97m-multilingual-r2-ONNX", {}),
    ).toEqual({ pooling: "cls", queryPrefix: "", passagePrefix: "", dtype: "q8" });
  });

  it("keeps the trained e5 configuration for e5 models", () => {
    expect(resolveModelSpec("intfloat/multilingual-e5-small", {})).toEqual(E5_SPEC);
  });

  it("falls back to the historical e5-style behaviour for unknown models", () => {
    expect(resolveModelSpec("acme/some-embedder", {})).toEqual(E5_SPEC);
  });

  it("lets the environment override each field, treating empty strings as unset", () => {
    const spec = resolveModelSpec("acme/some-embedder", {
      REMENTUM_EMBEDDING_POOLING: "cls",
      REMENTUM_EMBEDDING_QUERY_PREFIX: "",
      REMENTUM_EMBEDDING_DTYPE: "q4",
    });
    expect(spec).toEqual({
      pooling: "cls",
      queryPrefix: "query: ",
      passagePrefix: "passage: ",
      dtype: "q4",
    });
  });

  it("refuses a pooling value the runtime does not support", () => {
    expect(() =>
      resolveModelSpec("acme/some-embedder", { REMENTUM_EMBEDDING_POOLING: "max" }),
    ).toThrow('REMENTUM_EMBEDDING_POOLING must be "cls" or "mean"');
  });
});
