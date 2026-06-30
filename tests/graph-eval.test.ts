import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GraphClient, QueryMethod } from "../src/index.js";
import { GeminiLLMProvider } from "../src/llm/gemini-llm-provider.js";
import { SqliteStorageProvider } from "../src/storage/sqlite-storage-provider.js";
import { createLogger } from "../src/utils/logger.js";
import { marieCurieOntology } from "./fixtures/ontology.js";
import { marieCurieEdges, marieCurieNodes } from "./fixtures/graph-seed.js";
import { judgeAnswer } from "./judge/llm-judge.js";
import { EvalMetrics } from "./metrics.js";
import { seedMarieCurieGraph } from "./setup/seed-database.js";

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
const goldenPath = resolve(process.cwd(), "tests/golden/marie-curie.json");
const goldenCases = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenFile;

describe.runIf(hasApiKey)("graph golden eval", () => {
  const llmProvider = new GeminiLLMProvider({
    apiKey: process.env.GOOGLE_API_KEY || "",
    model: process.env.GRAPHINT_EVAL_MODEL || "gemini-3.1-flash-lite",
    embeddingModel: process.env.GRAPHINT_EMBEDDING_MODEL || "gemini-embedding-001",
  });

  const client = new GraphClient({
    storageProvider: new SqliteStorageProvider(":memory:"),
    llmProvider,
    ontology: marieCurieOntology,
    enableEmbedding: true,
  });

  beforeAll(async () => {
    log.info("Seeding in-memory database");
    await seedMarieCurieGraph(client);
    log.info("Database ready", {
      nodes: marieCurieNodes.length,
      edges: marieCurieEdges.length,
    });
  });

  afterAll(() => {
    metrics.print(log);
  });

  for (const testCase of goldenCases.cases) {
    it(`judges ${testCase.id}`, async () => {
      log.info("Running case", { id: testCase.id, method: testCase.method });

      const answer = await client.query(testCase.question, testCase.method);
      const verdict = await judgeAnswer(llmProvider, testCase.question, testCase.golden, answer);

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

describe.runIf(!hasApiKey)("graph golden eval", () => {
  it("skips when GOOGLE_API_KEY is missing", () => {
    log.warn("Skipping LLM judge eval — set GOOGLE_API_KEY to run");
    expect(true).toBe(true);
  });
});
