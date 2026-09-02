import type { EmbeddingClient } from "@rementum/core";
import { z } from "zod";

const responseSchema = z.object({
  model: z.string(),
  dimensions: z.literal(384),
  vectors: z.array(z.array(z.number()).length(384)),
});

export class HttpEmbeddingClient implements EmbeddingClient {
  constructor(private readonly baseUrl: string) {}

  async embedQuery(value: string): Promise<{ model: string; vector: number[] }> {
    // A search degrades to full-text ranking when this fails, and that fallback is only
    // useful if it arrives quickly: while the embedder is loading or wedged, every search
    // would otherwise wait the full passage timeout before answering.
    const { model, vectors } = await this.embed("query", [value], 5_000);
    return { model, vector: vectors[0] ?? [] };
  }

  async embedPassages(values: string[]): Promise<{ model: string; vectors: number[][] }> {
    if (!values.length) return { model: "", vectors: [] };
    return this.embed("passage", values, 30_000);
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

  private async embed(
    kind: "query" | "passage",
    texts: string[],
    timeoutMs: number,
  ): Promise<{ model: string; vectors: number[][] }> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Embedding service returned ${response.status}`);
    const { model, vectors } = responseSchema.parse(await response.json());
    return { model, vectors };
  }
}
