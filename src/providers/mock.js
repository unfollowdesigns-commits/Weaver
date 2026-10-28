// Offline provider: returns a valid, repeatable answer without calling any API.
// Used by the tests and for checking the pipeline end to end at no cost.
// Its `batch` mimics the Batch API: results are ready as soon as a batch is submitted.
export function createMockProvider({ broken = false, batchPending = false } = {}) {
  async function complete({ user, schema }) {
    if (broken) return { answer: { criteria: [], recommendation: "maybe" }, model: "mock" };
    const ref = /"candidate_ref": "([^"]+)"/.exec(user)?.[1] ?? "x";
    const ids = schema.properties.criteria.items.properties.id.enum;
    const values = schema.properties.criteria.items.properties.score.anyOf[0].enum;
    const criteria = ids.map((id, i) => {
      const score = values[hash(ref + id + i) % values.length];
      return { id, score, evidence: `Sample evidence for ${id}.` };
    });
    const avg = criteria.reduce((s, c) => s + c.score, 0) / criteria.length;
    return {
      answer: {
        criteria,
        recommendation: avg >= 3.5 ? "yes" : "no",
        assessment: "Sample assessment produced offline. Not a real reading of the candidate.",
        open_questions: ["Sample question for the recruiter."],
      },
      model: "mock",
    };
  }

  const batches = new Map();
  let n = 0;
  return {
    name: "mock",
    model: "mock",
    complete,
    batches,
    batch: {
      async submit(items) {
        const id = `mockbatch_${++n}`;
        const results = [];
        for (const it of items) results.push({ custom_id: it.custom_id, ...(await complete(it)) });
        batches.set(id, { status: batchPending ? "in_progress" : "ended", results, items });
        return id;
      },
      async recent() {
        return [...batches].map(([id, b]) => ({ id, status: b.status }));
      },
      async results(id) {
        return batches.get(id)?.results ?? [];
      },
    },
  };
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
