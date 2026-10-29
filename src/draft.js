import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkScorecard } from "./scorecard.js";

// Drafts a per-search scorecard from the job description. The draft is never used
// for scoring until a person approves it (scripts/draft-scorecard.js --approve).

const here = path.dirname(fileURLToPath(import.meta.url));
export const DRAFT_PROMPT = path.join(here, "..", "prompts", "scorecard", "draft-prompt.v1.md");

export function draftSchema() {
  const text = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["criteria", "industry"],
    properties: {
      criteria: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["label", "description"], properties: { label: text, description: text } },
      },
      industry: { type: "object", additionalProperties: false, required: ["direct", "adjacent"], properties: { direct: text, adjacent: text } },
    },
  };
}

export function draftRequest(job, promptFile = DRAFT_PROMPT) {
  return {
    system: fs.readFileSync(promptFile, "utf8"),
    user: `<job>\nTitle: ${job.title}\nCompany: ${job.company_summary ?? ""}\n\n${job.description ?? ""}\n</job>\n\nDraft the scorecard for this search.`,
    schema: draftSchema(),
  };
}

const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_").slice(0, 40) || "criterion";

// Turns the model's draft into a scorecard file, with the firm's scale.
export function scorecardFromDraft(answer, job, standard) {
  const crit = Array.isArray(answer?.criteria) ? answer.criteria : [];
  if (crit.length < 6 || crit.length > 12) throw new Error(`draft has ${crit.length} criteria; expected about nine`);
  const seen = new Set();
  const criteria = crit.map((c) => {
    if (!c?.label?.trim() || !c?.description?.trim()) throw new Error("a drafted criterion has no label or description");
    let id = slug(c.label);
    while (seen.has(id)) id += "_2";
    seen.add(id);
    return { id, label: c.label.trim(), description: c.description.trim() };
  });
  const sc = {
    id: `job-${job.id}`,
    version: 1,
    name: `${job.title} scorecard`,
    job: { id: String(job.id), title: job.title },
    status: "draft",
    scale: standard.scale,
    criteria,
    recommendation: standard.recommendation,
    industry: { direct: String(answer.industry?.direct ?? "").trim(), adjacent: String(answer.industry?.adjacent ?? "").trim() },
  };
  checkScorecard(sc);
  return sc;
}

// Plain-text view for the partner who approves it.
export function draftText(sc) {
  return [
    `${sc.name} (draft, not in use until approved)`,
    "",
    ...sc.criteria.map((c, i) => `${i + 1}. ${c.label}\n   ${c.description}`),
    "",
    `★ Direct industry: ${sc.industry.direct}`,
    `☆ Adjacent: ${sc.industry.adjacent}`,
    "",
    `Scale: ${Object.entries(sc.scale.labels).map(([v, l]) => `${v} ${l}`).join(" · ")}`,
  ].join("\n");
}

// Next free version number for a search's approved scorecard.
export function nextVersion(dir, jobId) {
  if (!fs.existsSync(dir)) return 1;
  const re = new RegExp(`^job-${jobId}\\.v(\\d+)\\.json$`);
  return fs.readdirSync(dir).reduce((n, f) => Math.max(n, Number(re.exec(f)?.[1] ?? 0)), 0) + 1;
}
