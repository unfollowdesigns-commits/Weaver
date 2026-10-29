import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPromptRecord, scrubPay } from "./candidate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROMPT = path.join(here, "..", "prompts", "scoring", "scoring-prompt.v3.md");

export function loadTemplate(file = DEFAULT_PROMPT) {
  return { file: path.basename(file), text: fs.readFileSync(file, "utf8") };
}

// System prompt: stable for the whole job (good for caching).
// User message: the job, the scorecard and one candidate.
export function buildPrompt({ template, scorecard, job, candidate }) {
  const scale = Object.entries(scorecard.scale.labels).map(([v, label]) => `${v}: ${label}`).join("\n");
  const system = template.text
    .replaceAll("{{scale}}", scale)
    .replaceAll("{{criterion_ids}}", scorecard.criteria.map((c) => c.id).join(", "));

  const criteria = scorecard.criteria.map((c) => `- ${c.id} (${c.label}): ${c.description ?? ""}`).join("\n");
  const industry = scorecard.industry
    ? `\n\nIndustry for this search:\nDirect: ${scorecard.industry.direct}\nAdjacent: ${scorecard.industry.adjacent}`
    : "";
  const user = [
    `<job>\nTitle: ${job.title}\nCompany: ${job.company_summary ?? ""}\n\n${scrubPay(job.description ?? "")}\n</job>`,
    `<scorecard name="${scorecard.name}">\n${criteria}\n\nRecommendation: ${scorecard.recommendation.meaning ?? scorecard.recommendation.values.join(" or ")}${industry}\n</scorecard>`,
    `<candidate_record>\n${JSON.stringify(toPromptRecord(candidate), null, 2)}\n</candidate_record>`,
    "Score this candidate.",
  ].join("\n\n");

  return { system, user };
}
