import { BaseLLMProvider } from "../../llm/base-llm-provider.js";
import { Ontology, OntologyRegistry } from "../ontology.js";
import { IngestionSystemPrompt } from "./prompts.js";
import { IngestionResult, IngestionResultSchema } from "./types.js";
import { Message } from "../../llm/types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("LLMExtractor");

export class LLMExtractor {
  constructor(private readonly llmProvider: BaseLLMProvider) {}

  async extract(rawText: string | string[], ontology: Ontology): Promise<IngestionResult> {
    const chunks = Array.isArray(rawText) ? rawText : [rawText];
    log.info("Extracting graph from text", { chunks: chunks.length });

    if (chunks.length === 0) {
      return { nodes: [], edges: [] };
    }

    if (chunks.length === 1) {
      return this.extractChunk(chunks[0], ontology);
    }

    const nodesById = new Map<string, IngestionResult["nodes"][number]>();
    const edgesById = new Map<string, IngestionResult["edges"][number]>();

    for (let index = 0; index < chunks.length; index++) {
      log.info("Extracting chunk", { index: index + 1, total: chunks.length });
      const result = await this.extractChunk(chunks[index], ontology);
      for (const node of result.nodes) {
        nodesById.set(node.id, node);
      }
      for (const edge of result.edges) {
        edgesById.set(edge.id, edge);
      }
    }

    const result = {
      nodes: [...nodesById.values()],
      edges: [...edgesById.values()],
    };
    log.info("Extraction complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }

  private async extractChunk(text: string, ontology: Ontology): Promise<IngestionResult> {
    const messages: Message[] = [
      { role: "system", content: IngestionSystemPrompt(ontology) },
      { role: "user", content: text },
    ];

    const raw = await this.llmProvider.generate(messages, undefined, IngestionResultSchema);
    return OntologyRegistry.parse(ontology).parseGraph(raw);
  }
}
