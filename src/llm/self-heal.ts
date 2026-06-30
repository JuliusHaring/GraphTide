import { z } from "zod";
import { buildSelfHealUserMessage } from "./prompts.js";
import { Message } from "./types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("SelfHeal");

function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`)
      .join("\n");
  }

  if (error instanceof SyntaxError) {
    return `Invalid JSON: ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function parseStructuredOutput<T extends z.ZodType>(schema: T, rawOutput: string): z.infer<T> {
  return schema.parse(JSON.parse(rawOutput));
}

export async function generateWithSelfHeal<T extends z.ZodType>(
  messages: Message[],
  selfHealAttempts: number,
  schema: T,
  request: (messages: Message[]) => Promise<string>,
): Promise<z.infer<T>> {
  const conversation = [...messages];
  const maxAttempts = Math.max(1, selfHealAttempts);
  let lastOutput: string;
  let lastError = "Failed to generate valid structured output";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    log.debug("Structured output attempt", { attempt: attempt + 1, maxAttempts });
    lastOutput = await request(conversation);

    try {
      log.debug("Structured output validated", { attempt: attempt + 1 });
      return parseStructuredOutput(schema, lastOutput);
    } catch (error) {
      lastError = formatValidationError(error);
      log.warn("Structured output validation failed", { attempt: attempt + 1, error: lastError });

      if (attempt === maxAttempts - 1) {
        throw error;
      }

      conversation.push(
        { role: "assistant", content: lastOutput },
        buildSelfHealUserMessage(lastError, lastOutput),
      );
    }
  }

  throw new Error(lastError);
}
