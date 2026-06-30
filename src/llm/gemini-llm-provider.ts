import { Content, GoogleGenerativeAI } from "@google/generative-ai";
import { BaseLLMProvider, LLMProviderOptions } from "./base-llm-provider.js";
import { generateWithSelfHeal } from "./self-heal.js";
import { Message } from "./types.js";
import { createLogger } from "../utils/logger.js";
import { z } from "zod";

const log = createLogger("GeminiLLMProvider");

function toGeminiRequest(messages: Message[]): {
  systemInstruction?: string;
  contents: Content[];
} {
  const systemInstruction = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  if (contents.length === 0) {
    throw new Error("At least one non-system message is required");
  }

  return {
    systemInstruction: systemInstruction || undefined,
    contents,
  };
}

export class GeminiLLMProvider extends BaseLLMProvider {
  private readonly api: GoogleGenerativeAI;
  private readonly model: string;
  private readonly embeddingModel?: string;

  constructor(options: LLMProviderOptions) {
    super(options);
    this.model = options.model;
    this.embeddingModel = options.embeddingModel;
    this.api = new GoogleGenerativeAI(options.apiKey);
    log.info("Initialized", { model: this.model, embeddingModel: this.embeddingModel });
  }

  async generate(messages: Message[]): Promise<string>;
  async generate<T extends z.ZodType>(
    messages: Message[],
    selfHealAttempts: number | undefined,
    schema: T,
  ): Promise<z.infer<T>>;
  async generate<T extends z.ZodType>(
    messages: Message[],
    selfHealAttempts = 3,
    schema?: T,
  ): Promise<string | z.infer<T>> {
    if (schema) {
      log.debug("Generating structured output", { selfHealAttempts, model: this.model });
      return generateWithSelfHeal(messages, selfHealAttempts, schema, (conversation) =>
        this.requestCompletion(conversation, true),
      );
    }

    log.debug("Generating completion", { model: this.model });
    return this.requestCompletion(messages, false);
  }

  private async requestCompletion(messages: Message[], json: boolean): Promise<string> {
    const { systemInstruction, contents } = toGeminiRequest(messages);
    const model = this.api.getGenerativeModel({
      model: this.model,
      systemInstruction,
      generationConfig: json ? { responseMimeType: "application/json" } : undefined,
    });

    const response = await model.generateContent({ contents });
    const text = response.response.text();

    if (!text) {
      throw new Error("No content returned from Gemini");
    }

    return text;
  }

  protected async embedUncached(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (!this.embeddingModel) {
      throw new Error("Embedding model not configured");
    }
    log.debug("Embedding batch", { count: texts.length, model: this.embeddingModel });

    const model = this.api.getGenerativeModel({
      model: this.embeddingModel,
    });

    const response = await model.batchEmbedContents({
      requests: texts.map((text) => ({
        content: { role: "user", parts: [{ text }] },
      })),
    });

    return response.embeddings.map((embedding, index) => {
      if (embedding.values.length === 0) {
        throw new Error(`No embedding returned from Gemini for input ${index}`);
      }
      return embedding.values;
    });
  }
}
