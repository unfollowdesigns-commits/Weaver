// Testing only, until the Claude API key is in place. Production scoring runs on Claude.
// Plain fetch so the project does not take on a second SDK for a temporary provider.
export function createOpenAIProvider({ apiKey, model }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env");
  if (!model) throw new Error("OPENAI_MODEL is not set in .env");

  return {
    name: "openai",
    model,
    async complete({ system, user, schema }) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "candidate_score", strict: true, schema },
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (msg?.refusal) throw new Error(`OpenAI declined to score: ${msg.refusal}`);
      if (data.choices?.[0]?.finish_reason === "length") throw new Error("OpenAI's answer was cut off");
      return { answer: JSON.parse(msg?.content ?? "null"), model: data.model, usage: data.usage };
    },
  };
}
