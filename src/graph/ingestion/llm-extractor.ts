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
    log.info("Extracting graph from text", { chunks: Array.isArray(rawText) ? rawText.length : 1 });
    const messages: Message[] = [{ role: "system", content: IngestionSystemPrompt(ontology) }];

    if (Array.isArray(rawText)) {
      messages.push(...rawText.map((text) => ({ role: "user" as const, content: text })));
    } else {
      messages.push({ role: "user", content: rawText });
    }

    const raw = await this.llmProvider.generate(messages, undefined, IngestionResultSchema);
    const result = OntologyRegistry.parse(ontology).parseGraph(raw);
    log.info("Extraction complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }
}
