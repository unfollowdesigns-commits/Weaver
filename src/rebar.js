// Applies the current short-list bar and wording fixes to results already saved from an earlier
// run, without calling the AI again (30 Oct 2026: the test key ran out of credit; the first full
// run's scores were kept on disk). The AI's own yes/no on that run meant "no must-have missed"
// (scorecard v2), which is what prompt v5 asks for, so the bar on top gives the v5 outcome.
import { YES_MIN_AVERAGE, neutralPronouns } from "./validate.js";
import { rankResults } from "./score.js";

const OLD_CHECK = /^check: recommended yes with an average below 3/;

export function rebar(results, { bar = YES_MIN_AVERAGE } = {}) {
  return rankResults(results.map((r) => {
    if (r.status !== "scored") return r;
    const criteria = r.criteria.map((c) => ({ ...c, evidence: neutralPronouns(c.evidence) }));
    const scoredCount = criteria.filter((c) => c.score !== null).length;
    if (scoredCount === 0) {
      const { criteria: _c, average: _a, recommendation: _r, flags: _f, ...rest } = r;
      return { ...rest, status: "skipped", reason: "no_evidence" };
    }
    const missing = criteria.length - scoredCount;
    const ai = r.ai_recommendation ?? r.recommendation;
    const flags = r.flags.filter((f) => !OLD_CHECK.test(f) && !f.startsWith("below_bar:"));
    let recommendation = ai;
    if (ai === "yes" && (r.average === null || r.average < bar || missing >= 3)) {
      recommendation = "no";
      flags.push(missing >= 3
        ? `below_bar: the AI said yes, but ${missing} criteria had no evidence; listed as No for the recruiter to judge`
        : `below_bar: the AI said yes, but the average is under ${bar}; listed as No for the recruiter to judge`);
    }
    const words = (t) => neutralPronouns(t);
    return {
      ...r, criteria, scored_count: scoredCount, recommendation, ai_recommendation: ai, yes_bar: bar, flags,
      assessment: words(r.assessment), strongest_signal: words(r.strongest_signal), watch_item: words(r.watch_item),
      where_they_fit: (r.where_they_fit ?? []).map(words), where_to_probe: (r.where_to_probe ?? []).map(words),
    };
  }));
}
