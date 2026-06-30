import { z } from "zod";
import { BaseLLMProvider } from "../../src/llm/base-llm-provider.js";
import { buildJudgeMessages } from "./prompts.js";

export const JudgeVerdictSchema = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  reason: z.string(),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export async function judgeAnswer(
  llmProvider: BaseLLMProvider,
  question: string,
  golden: string,
  actual: string,
): Promise<JudgeVerdict> {
  return llmProvider.generate(buildJudgeMessages(question, golden, actual), undefined, JudgeVerdictSchema);
}
