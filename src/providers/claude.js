import Anthropic from "@anthropic-ai/sdk";

// Production provider. One request per candidate, JSON constrained by the output schema.
export function createClaudeProvider({ apiKey, model, effort }) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  const client = new Anthropic({ apiKey });
  const modelId = model || "claude-opus-5-5";

  return {
    name: "claude",
    model: modelId,
    async complete({ system, user, schema }) {
      const response = await client.beta.messages.create({
        model: modelId,
        max_tokens: 16000,
        // If a safety classifier declines, the API retries on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: effort || "high",
          format: { type: "json_schema", schema },
        },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error(`Claude declined to score (${response.stop_details?.category ?? "no category"})`);
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("Claude's answer was cut off (max_tokens)");
      }
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      return { answer: JSON.parse(text), model: response.model, usage: response.usage };
    },
  };
}
