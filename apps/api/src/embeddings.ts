import type { EmbeddingClient } from "@owl-memory/core";
import { z } from "zod";

const responseSchema = z.object({
  model: z.string(),
  dimensions: z.literal(384),
  vectors: z.array(z.array(z.number()).length(384)),
});

export class HttpEmbeddingClient implements EmbeddingClient {
  constructor(private readonly baseUrl: string) {}

  async embedQuery(value: string): Promise<number[]> {
    return (await this.embed("query", [value]))[0] ?? [];
  }

  async embedPassages(values: string[]): Promise<number[][]> {
    if (!values.length) return [];
    return this.embed("passage", values);
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async embed(kind: "query" | "passage", texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding service returned ${response.status}`);
    return responseSchema.parse(await response.json()).vectors;
  }
}
