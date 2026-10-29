import fs from "node:fs";
import { scrubPay } from "../candidate.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The AI drafts only the short written parts of the report. It sees references (C1, C2),
// titles, companies, stages and Weaver's signals: never names, contact details or pay.

const here = path.dirname(fileURLToPath(import.meta.url));
export const NARRATIVE_PROMPT = path.join(here, "..", "..", "prompts", "report", "narrative-prompt.v1.md");

export function narrativeSchema() {
  const text = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["subtitle", "read_boxes", "focus_next"],
    properties: {
      subtitle: text,
      read_boxes: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: text, text } } },
      focus_next: text,
    },
  };
}

export function narrativeRequest(model, promptFile = NARRATIVE_PROMPT) {
  const rows = model.people.map((p) => ({
    ref: p.ref,
    rank: model.top.indexOf(p) + 1 || null,
    stage: p.stage,
    title: p.title,
    company: p.company,
    industry: p.industry,
    strongest_signal: p.signal,
    watch_item: p.watch,
  }));
  return {
    system: fs.readFileSync(promptFile, "utf8"),
    user: `<pipeline>\nSearch: ${model.job.title}\n${scrubPay(model.job.description ?? "").slice(0, 3000)}\n\nCandidates (${rows.length}):\n${JSON.stringify(rows, null, 1)}\n</pipeline>\n\nDraft the written parts of the report.`,
    schema: narrativeSchema(),
  };
}

// Puts first names back in place of references, longest reference first (C10 before C1).
export function applyNarrative(model, answer) {
  const refs = [...model.people].sort((a, b) => b.ref.length - a.ref.length);
  const named = (t) => refs.reduce((s, p) => s.replace(new RegExp(`\\b${p.ref}\\b`, "g"), p.first_name), String(t ?? "").trim());
  const boxes = Array.isArray(answer?.read_boxes) ? answer.read_boxes.slice(0, 3) : [];
  return {
    ...model,
    narrative: {
      subtitle: named(answer?.subtitle),
      read_boxes: boxes.map((b) => ({ title: named(b.title), text: named(b.text) })),
      focus_next: named(answer?.focus_next),
    },
  };
}
