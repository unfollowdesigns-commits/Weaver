// Offline provider: returns a valid, repeatable answer without calling any API.
// Used by the tests and for checking the pipeline end to end at no cost.
// Its `batch` mimics the Batch API: results are ready as soon as a batch is submitted.
export function createMockProvider({ broken = false, batchPending = false } = {}) {
  async function complete({ user, schema }) {
    if (broken) return { answer: { criteria: [], recommendation: "maybe" }, model: "mock" };
    if (schema.properties.focus_next) return narrativeAnswer(user);
    if (!schema.properties.criteria.items.properties.id?.enum) return draftAnswer(user);
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
        industry: ["direct", "adjacent", "other"][hash(ref) % 3],
        strongest_signal: "Sample signal produced offline.",
        watch_item: "Sample watch item produced offline.",
        where_they_fit: ["Sample point produced offline. Not a real reading of the candidate."],
        where_to_probe: ["Sample point for the first conversation."],
        assessment: "Sample assessment produced offline. Not a real reading of the candidate.",
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

// Report narrative, written with references only, like the real one.
function narrativeAnswer(user) {
  const refs = [...user.matchAll(/"ref": "(C\d+)"/g)].map((m) => m[1]);
  return {
    answer: {
      subtitle: `Where the search stands today, drawn from ${refs.length} sample leaders.`,
      read_boxes: [
        { title: "Industry-led profiles", text: `${refs[0] ?? "C1"} and ${refs[1] ?? "C2"} bring direct industry experience. Sample text produced offline.` },
        { title: "Function-led profiles", text: `${refs[2] ?? "C3"} is stronger on the function than the industry. Sample text produced offline.` },
      ],
      focus_next: `${refs[0] ?? "C1"} remains our top candidate. Sample text produced offline.`,
    },
    model: "mock",
  };
}

// Draft scorecard for a search, shaped like a real draft.
function draftAnswer(user) {
  const title = /Title: (.*)/.exec(user)?.[1]?.trim() || "this search";
  const labels = ["Relevant industry experience", "Functional depth", "Scale and scope", "Track record of results", "Leadership and team building", "Stage and context fit", "Location, relocation or commuting", "Partnership with the CEO and leadership team", "Ability to be the face in the market"];
  return {
    answer: {
      criteria: labels.map((label) => ({ label, description: `Sample description for ${title}. 3: meets the bar. 5: exceptional.` })),
      industry: { direct: "Sample: the search's own industry.", adjacent: "Sample: neighboring industries." },
    },
    model: "mock",
  };
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
