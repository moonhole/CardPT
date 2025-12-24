import { validateDecision } from "../dist/engine/decision.js";

const API_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL = "qwen-plus";

export async function proposeDecision(input) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a poker decision assistant. Respond only with valid JSON.",
        },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("LLM request failed.");
  }

  const completion = await response.json();
  console.log("[LLM GATEWAY] raw response:", JSON.stringify(completion, null, 2));
  const content =
    completion &&
    completion.choices &&
    completion.choices[0] &&
    completion.choices[0].message &&
    completion.choices[0].message.content;

  if (typeof content !== "string") {
    throw new Error("Empty LLM response.");
  }

  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error("Non-JSON LLM response.");
  }

  let decision;
  try {
    decision = JSON.parse(trimmed);
  } catch (err) {
    throw new Error("JSON parse failure.");
  }

  if (
    !decision ||
    typeof decision !== "object" ||
    !decision.action ||
    !decision.reason ||
    typeof decision.confidence !== "number"
  ) {
    throw new Error("Decision schema mismatch.");
  }

  validateDecision(decision);
  return decision;
}
