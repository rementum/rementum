import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpEmbeddingClient } from "./embeddings.js";

const baseUrl = "http://embeddings:8790";
const fetchMock = vi.fn();

function vector(fill = 0.5): number[] {
  return Array.from({ length: 384 }, () => fill);
}

function embedResponse(vectors: number[][], status = 200): Response {
  return new Response(
    JSON.stringify({ model: "intfloat/multilingual-e5-small", dimensions: 384, vectors }),
    { status, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpEmbeddingClient", () => {
  it("asks for a query embedding with the query prefix", async () => {
    fetchMock.mockResolvedValueOnce(embedResponse([vector()]));
    const client = new HttpEmbeddingClient(baseUrl);
    const { model, vector: embedded } = await client.embedQuery("encryption");
    expect(model).toBe("intfloat/multilingual-e5-small");
    expect(embedded).toHaveLength(384);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(`${baseUrl}/embed`);
    expect(JSON.parse(init.body)).toEqual({ kind: "query", texts: ["encryption"] });
  });

  it("asks for passage embeddings in one request", async () => {
    fetchMock.mockResolvedValueOnce(embedResponse([vector(0.1), vector(0.2)]));
    const client = new HttpEmbeddingClient(baseUrl);
    const { model, vectors } = await client.embedPassages(["one", "two"]);
    expect(model).toBe("intfloat/multilingual-e5-small");
    expect(vectors).toHaveLength(2);
    const [, passageInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(passageInit.body)).toEqual({
      kind: "passage",
      texts: ["one", "two"],
    });
  });

  it("does not call the service for an empty batch", async () => {
    await expect(new HttpEmbeddingClient(baseUrl).embedPassages([])).resolves.toEqual({
      model: "",
      vectors: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failing request with its status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("model loading", { status: 503 }));
    await expect(new HttpEmbeddingClient(baseUrl).embedQuery("x")).rejects.toThrow(
      "Embedding service returned 503",
    );
  });

  it("refuses a response whose vectors are the wrong width", async () => {
    fetchMock.mockResolvedValueOnce(embedResponse([[0.1, 0.2]]));
    await expect(new HttpEmbeddingClient(baseUrl).embedQuery("x")).rejects.toThrow();
  });

  it("returns an empty vector when the service answers with none", async () => {
    fetchMock.mockResolvedValueOnce(embedResponse([]));
    await expect(new HttpEmbeddingClient(baseUrl).embedQuery("x")).resolves.toEqual({
      model: "intfloat/multilingual-e5-small",
      vector: [],
    });
  });

  it("treats an unreachable or unhealthy service as unhealthy", async () => {
    const client = new HttpEmbeddingClient(baseUrl);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(client.healthy()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/healthz`, expect.anything());

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(client.healthy()).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(client.healthy()).resolves.toBe(false);
  });
});
