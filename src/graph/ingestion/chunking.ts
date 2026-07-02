import { chunkText } from "./chunk-text.js";

export type TextChunker = (text: string) => string[];

export type IngestionOptions = {
  /** Max characters per chunk. Omit or 0 to keep a single string intact. */
  chunkSize?: number;
  /** Custom chunker. Takes precedence over `chunkSize`. */
  chunker?: TextChunker;
};

export const DEFAULT_INGESTION_CHUNK_SIZE = 12_000;

function nonEmptyChunks(chunks: string[]): string[] {
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

export function resolveTextChunks(text: string, options?: IngestionOptions): string[] {
  if (options?.chunker) {
    const chunks = nonEmptyChunks(options.chunker(text));
    return chunks.length > 0 ? chunks : nonEmptyChunks([text]);
  }

  const chunkSize = options?.chunkSize;
  if (!chunkSize || chunkSize <= 0 || text.length <= chunkSize) {
    return [text];
  }

  return chunkText(text, chunkSize);
}

export function resolveIngestionInput(
  input: string | string[],
  options?: IngestionOptions,
): string[] {
  if (Array.isArray(input)) {
    const chunks = input.flatMap((part) => resolveTextChunks(part, options));
    const nonEmpty = nonEmptyChunks(chunks);
    return nonEmpty.length > 0 ? nonEmpty : nonEmptyChunks(input);
  }

  return resolveTextChunks(input, options);
}
