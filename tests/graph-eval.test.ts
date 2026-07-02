import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GraphClient, QueryMethod } from "../src/index.js";
import { GeminiLLMProvider } from "../src/llm/gemini-llm-provider.js";
import { SqliteStorageProvider } from "../src/storage/sqlite-storage-provider.js";
import { createLogger } from "../src/utils/logger.js";
import { bibleOntology } from "./fixtures/ontology.js";
import { judgeAnswer } from "./judge/llm-judge.js";
import { EvalMetrics } from "./metrics.js";
import { BIBLE_DB_PATH } from "./setup/paths.js";

type GoldenCase = {
  id: string;
  method: QueryMethod;
  question: string;
  golden: string;
};

type GoldenFile = {
  cases: GoldenCase[];
};

const log = createLogger("graph-eval");
const metrics = new EvalMetrics();
const hasApiKey = Boolean(process.env.GOOGLE_API_KEY);
const dbPath = resolve(process.cwd(), BIBLE_DB_PATH);
const hasDatabase = existsSync(dbPath);
const goldenPath = resolve(process.cwd(), "tests/golden/bible.json");
const goldenCases = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenFile;

describe.runIf(hasApiKey && hasDatabase)("graph golden eval", () => {
  const llmProvider = new GeminiLLMProvider({
    apiKey: process.env.GOOGLE_API_KEY || "",
    model: process.env.GRAPHINT_EVAL_MODEL || "gemini-3.1-flash-lite",
    embeddingModel: process.env.GRAPHINT_EMBEDDING_MODEL || "gemini-embedding-001",
  });

  const client = new GraphClient({
    storageProvider: new SqliteStorageProvider(dbPath),
    llmProvider,
    ontology: bibleOntology,
    enableEmbedding: false,
  });

  afterAll(() => {
    metrics.print(log);
  });

  for (const testCase of goldenCases.cases) {
    it(`judges ${testCase.id}`, async () => {
      log.info("Running case", { id: testCase.id, method: testCase.method });

      const result = await client.query(testCase.question, testCase.method);
      const verdict = await judgeAnswer(llmProvider, testCase.question, testCase.golden, result.answer);

      metrics.add({
        id: testCase.id,
        method: testCase.method,
        score: verdict.score,
        passed: verdict.passed,
        reason: verdict.reason,
      });

      log.info("Case judged", {
        id: testCase.id,
        score: verdict.score,
        passed: verdict.passed,
        reason: verdict.reason,
      });

      expect(verdict.passed).toBe(true);
    });
  }
});

describe.runIf(!hasApiKey || !hasDatabase)("graph golden eval", () => {
  it("skips when prerequisites are missing", () => {
    if (!hasApiKey) {
      log.warn("Skipping LLM judge eval — set GOOGLE_API_KEY to run");
    }
    if (!hasDatabase) {
      log.warn(
        "Skipping LLM judge eval — run npm run test:build-db to build tests/data/bible-graph.db",
      );
    }
    expect(true).toBe(true);
  });
});
