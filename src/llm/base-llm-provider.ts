import { Message } from "./types.js";
import { createLogger } from "../utils/logger.js";
import { z } from "zod";

const log = createLogger("BaseLLMProvider");

export type LLMProviderOptions = {
  apiKey: string;
  model: string;
  embeddingModel?: string;
  embedCacheSize?: number;
};

const DEFAULT_EMBED_CACHE_SIZE = 500;

class FifoCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    return this.entries.get(key);
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      this.entries.set(key, value);
      return;
    }

    this.entries.set(key, value);
    if (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value as K;
      this.entries.delete(oldest);
    }
  }
}

export abstract class BaseLLMProvider {
  private readonly embedCache: FifoCache<string, number[]>;

  constructor(private readonly options: LLMProviderOptions) {
    this.embedCache = new FifoCache(options.embedCacheSize ?? DEFAULT_EMBED_CACHE_SIZE);
  }

  abstract generate(messages: Message[]): Promise<string>;
  abstract generate<T extends z.ZodType>(
    messages: Message[],
    selfHealAttempts: number | undefined,
    schema: T,
  ): Promise<z.infer<T>>;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = new Array(texts.length);
    const uncached: { index: number; text: string }[] = [];

    for (let index = 0; index < texts.length; index++) {
      const cached = this.embedCache.get(texts[index]);
      if (cached) {
        results[index] = cached;
      } else {
        uncached.push({ index, text: texts[index] });
      }
    }

    if (uncached.length === 0) {
      log.debug("Embed cache hit", { count: texts.length });
      return results;
    }

    log.debug("Embedding texts", { total: texts.length, uncached: uncached.length });
    const embeddings = await this.embedUncached(uncached.map((entry) => entry.text));
    for (let index = 0; index < uncached.length; index++) {
      const { index: resultIndex, text } = uncached[index];
      results[resultIndex] = embeddings[index];
      this.embedCache.set(text, embeddings[index]);
    }

    return results;
  }

  protected abstract embedUncached(texts: string[]): Promise<number[][]>;

  computeSimilarity(embedding1: number[], embedding2: number[], type: "cosine"): number {
    switch (type) {
      case "cosine": {
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
          dotProduct += embedding1[i] * embedding2[i];
          magnitude1 += embedding1[i] * embedding1[i];
          magnitude2 += embedding2[i] * embedding2[i];
        }

        return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
      }
      default:
        throw new Error(`Unknown similarity type: ${type}`);
    }
  }
}
