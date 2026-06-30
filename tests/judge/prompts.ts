import { Message } from "../../src/llm/types.js";

export const JudgeSystemPrompt = `You judge whether an actual answer correctly addresses a question, using a golden reference answer.

Score from 0 to 1:
- 1.0 = fully correct, covers the golden facts
- 0.7+ = mostly correct, minor omissions ok
- below 0.7 = missing key facts or wrong

Return JSON with: score (number), passed (boolean, true if score >= 0.7), reason (short string).`;

export function buildJudgeUserMessage(
  question: string,
  golden: string,
  actual: string,
): Message {
  return {
    role: "user",
    content: `Question: ${question}

Golden answer:
${golden}

Actual answer:
${actual}`,
  };
}

export function buildJudgeMessages(question: string, golden: string, actual: string): Message[] {
  return [
    { role: "system", content: JudgeSystemPrompt },
    buildJudgeUserMessage(question, golden, actual),
  ];
}
