import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { GraphClient } from "../../src/graph/graph-client.js";
import { defaultDocumentExtractorRegistry } from "../../src/graph/ingestion/document-extractors/registry.js";
import { mimeTypeFromPath } from "../../src/graph/ingestion/document-extractors/mime.js";
import { GeminiLLMProvider } from "../../src/llm/gemini-llm-provider.js";
import { SqliteStorageProvider } from "../../src/storage/sqlite-storage-provider.js";
import { createLogger } from "../../src/utils/logger.js";
import { bibleOntology } from "../fixtures/ontology.js";
import { BIBLE_DB_PATH, BIBLE_PDF_PATH, BIBLE_PDF_URL, DEFAULT_CHUNK_SIZE } from "./paths.js";
import { chunkText } from "../../src/graph/ingestion/chunk-text.js";

const PROGRESS_PATH = "tests/data/build-progress.json";

type BuildProgress = {
  nextChunk: number;
  totalChunks: number;
  succeeded: number;
  failed: number;
};

dotenv.config();

const log = createLogger("build-database");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadPdf(targetPath: string): Promise<void> {
  log.info("Downloading CSB Pew Bible PDF", { url: BIBLE_PDF_URL });
  const response = await fetch(BIBLE_PDF_URL);
  if (!response.ok) {
    throw new Error(`Failed to download Bible PDF (${response.status} ${response.statusText})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, buffer);
  log.info("PDF saved", { path: targetPath, bytes: buffer.length });
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const mimeType = mimeTypeFromPath(pdfPath);
  const buffer = await readFile(pdfPath);
  const text = await defaultDocumentExtractorRegistry.extractText(mimeType, buffer);
  const words = text.split(/\s+/).filter(Boolean).length;
  log.info("Extracted PDF text", { path: pdfPath, characters: text.length, words });
  return text;
}

async function readProgress(progressPath: string): Promise<BuildProgress | undefined> {
  try {
    return JSON.parse(await readFile(progressPath, "utf8")) as BuildProgress;
  } catch {
    return undefined;
  }
}

async function writeProgress(progressPath: string, progress: BuildProgress): Promise<void> {
  await writeFile(progressPath, JSON.stringify(progress, null, 2));
}

async function main(): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is required to build the test database");
  }

  const root = process.cwd();
  const pdfPath = resolve(root, BIBLE_PDF_PATH);
  const dbPath = resolve(root, BIBLE_DB_PATH);
  const progressPath = resolve(root, PROGRESS_PATH);
  const dataDir = resolve(root, "tests/data");
  const force = process.env.GRAPHTIDE_FORCE_BUILD_DB === "1";
  const chunkSize = Number(process.env.GRAPHTIDE_BUILD_CHUNK_SIZE) || DEFAULT_CHUNK_SIZE;
  const maxChunks = process.env.GRAPHTIDE_BUILD_MAX_CHUNKS
    ? Number(process.env.GRAPHTIDE_BUILD_MAX_CHUNKS)
    : undefined;

  await mkdir(dataDir, { recursive: true });

  const existingProgress = await readProgress(progressPath);
  if (
    (await exists(dbPath)) &&
    !force &&
    existingProgress &&
    existingProgress.nextChunk >= existingProgress.totalChunks
  ) {
    log.info("Database already built — skipping", { dbPath });
    return;
  }

  if (!(await exists(pdfPath))) {
    await downloadPdf(pdfPath);
  }

  if (force) {
    if (await exists(dbPath)) {
      await unlink(dbPath);
      log.info("Removed existing database for rebuild", { dbPath });
    }
    if (await exists(progressPath)) {
      await unlink(progressPath);
    }
  }

  const llmProvider = new GeminiLLMProvider({
    apiKey,
    model: process.env.GRAPHTIDE_BUILD_MODEL || "gemini-3.1-flash-lite",
    embeddingModel: process.env.GRAPHTIDE_EMBEDDING_MODEL || "gemini-embedding-001",
  });

  const client = new GraphClient({
    storageProvider: new SqliteStorageProvider(dbPath),
    llmProvider,
    ontology: bibleOntology,
    enableEmbedding: true,
  });

  const text = await extractPdfText(pdfPath);
  const chunks = chunkText(text, chunkSize);
  const total = maxChunks ? Math.min(maxChunks, chunks.length) : chunks.length;
  const startIndex = force ? 0 : (existingProgress?.nextChunk ?? 0);
  let succeeded = force ? 0 : (existingProgress?.succeeded ?? 0);
  let failed = force ? 0 : (existingProgress?.failed ?? 0);

  log.info("Starting chunked ingestion", {
    totalChunks: total,
    chunkSize,
    startIndex: startIndex + 1,
    resuming: startIndex > 0,
  });

  for (let index = startIndex; index < total; index++) {
    const chunk = chunks[index];
    log.info("Ingesting chunk", {
      index: index + 1,
      total,
      characters: chunk.length,
    });

    try {
      await client.ingestFromText(chunk);
      succeeded++;
    } catch (error) {
      failed++;
      log.warn("Chunk ingestion failed — continuing", {
        index: index + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await writeProgress(progressPath, {
      nextChunk: index + 1,
      totalChunks: total,
      succeeded,
      failed,
    });
  }

  log.info("Database build complete", { dbPath, succeeded, failed, total });
  if (succeeded === 0) {
    throw new Error("No chunks were ingested successfully");
  }
}

main().catch((error) => {
  log.error("Database build failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
