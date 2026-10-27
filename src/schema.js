import { scaleValues } from "./scorecard.js";

// JSON schema the model's answer must follow. The average is not in here on purpose:
// the code computes it, so it can never disagree with the scores.
export function outputSchema(scorecard) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["criteria", "recommendation", "assessment", "open_questions"],
    properties: {
      criteria: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "score", "evidence"],
          properties: {
            id: { type: "string", enum: scorecard.criteria.map((c) => c.id) },
            score: { anyOf: [{ type: "integer", enum: scaleValues(scorecard) }, { type: "null" }] },
            evidence: { type: "string" },
          },
        },
      },
      recommendation: { type: "string", enum: scorecard.recommendation.values },
      assessment: { type: "string" },
      open_questions: { type: "array", items: { type: "string" } },
    },
  };
}
