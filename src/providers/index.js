import { createMockProvider } from "./mock.js";

export async function getProvider(name, env = process.env) {
  switch (name) {
    case "mock":
      return createMockProvider();
    case "openai": {
      const { createOpenAIProvider } = await import("./openai.js");
      return createOpenAIProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
    }
    case "claude": {
      const { createClaudeProvider } = await import("./claude.js");
      return createClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL, effort: env.CLAUDE_EFFORT });
    }
    default:
      throw new Error(`Unknown provider "${name}". Use mock, openai or claude.`);
  }
}
