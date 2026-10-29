import { scaleValues } from "./scorecard.js";

export const INDUSTRY_VALUES = ["direct", "adjacent", "other"];

// JSON schema the model's answer must follow. The average is not in here on purpose:
// the code computes it, so it can never disagree with the scores.
// Field names follow the firm's own reports: where they fit, where to probe,
// strongest signal, watch item, and the industry star.
export function outputSchema(scorecard) {
  const text = { type: "string" };
  const list = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["criteria", "recommendation", "industry", "strongest_signal", "watch_item", "where_they_fit", "where_to_probe", "assessment"],
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
            evidence: text,
          },
        },
      },
      recommendation: { type: "string", enum: scorecard.recommendation.values },
      industry: { type: "string", enum: INDUSTRY_VALUES },
      strongest_signal: text,
      watch_item: text,
      where_they_fit: list,
      where_to_probe: list,
      assessment: text,
    },
  };
}
