import type { Mode, QuestionResult, Summary } from "./bench.ts"
import type { Split } from "./types.ts"

export type Report = {
  benchmark: "hybrid-rag-bench"
  createdAt: string
  live: boolean
  dataset: { name: string; description: string; sha256: string; documents: number; chunks: number; questions: number; notes: string[] }
  git: { revision: string | null; dirty: boolean | null }
  models: { embedding: string; reranker: string }
  pipeline: Record<string, unknown>
  spend: Record<string, unknown> | null
  embeddingStats: Record<string, unknown>
  durationSeconds: number
  summaries: Summary[]
  noEvidenceQuestions: { key: string; split: Split; category: string }[]
  rows: QuestionResult[]
  caveats: string[]
}

const f = (n: number | null) => (n === null ? "–" : n.toFixed(3))
const SPLIT_ORDER: Split[] = ["development", "heldout", "regression"]

export function toMarkdown(report: Report): string {
  const lines: string[] = []
  lines.push(`# ${report.dataset.name} — ${report.live ? "LIVE" : "OFFLINE (diagnostic only)"}`)
  lines.push("")
  if (!report.live)
    lines.push(
      "> **Offline mode:** token-hash embeddings and a token-overlap stand-in reranker. These numbers exercise the code path only and do **not** measure semantic retrieval or reranking quality.",
      ""
    )
  lines.push(`- Date: ${report.createdAt}`)
  lines.push(`- Dataset: ${report.dataset.description} sha256 \`${report.dataset.sha256.slice(0, 16)}…\``)
  lines.push(`- Models: embedding \`${report.models.embedding}\`, reranker \`${report.models.reranker}\``)
  lines.push(`- Git: \`${report.git.revision ?? "n/a"}\`${report.git.dirty ? " (dirty working tree)" : ""}`)
  if (report.spend) {
    const s = report.spend as { settledUsd: number; uncertainReservedUsd: number; requests: number; settledTokens: Record<string, number> }
    lines.push(
      `- Voyage spend (list-price estimate): $${s.settledUsd.toFixed(6)} over ${s.requests} requests; tokens ${JSON.stringify(s.settledTokens)}; uncertain reservations $${s.uncertainReservedUsd.toFixed(6)}`
    )
  }
  lines.push(`- Embedding inputs: ${JSON.stringify(report.embeddingStats)}`)
  lines.push(`- Duration: ${report.durationSeconds.toFixed(0)} s (includes deliberate rate-limit pacing)`)
  lines.push("")
  for (const split of SPLIT_ORDER) {
    const group = report.summaries.filter((s) => s.split === split)
    if (!group.length) continue
    lines.push(`## ${split} (${group[0]!.answerable} answerable questions)`)
    lines.push("")
    lines.push("| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |")
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |")
    for (const s of group)
      lines.push(`| ${s.mode} | ${f(s.hitAt8)} | ${f(s.recallAt8)} | ${f(s.mrrAt8)} | ${f(s.ndcgAt8)} | ${f(s.candidateRecallAt32)} |`)
    lines.push("")
  }
  lines.push("## Rerank vs. hybrid, per question")
  lines.push("")
  const changes = perQuestionChanges(report.rows, "hybrid-rrf", "hybrid-rrf+rerank")
  if (!changes.length) lines.push("No answerable question changed Recall@8 or MRR@8.")
  else {
    lines.push("| Question | Split | Recall@8 hybrid → rerank | MRR@8 hybrid → rerank | Candidate recall@32 |")
    lines.push("| --- | --- | ---: | ---: | ---: |")
    for (const c of changes)
      lines.push(`| ${c.key} | ${c.split} | ${f(c.baseRecall)} → ${f(c.recall)} | ${f(c.baseMrr)} → ${f(c.mrr)} | ${f(c.candidateRecall)} |`)
  }
  lines.push("")
  const misses = report.rows.filter((r) => r.mode === "hybrid-rrf" && r.candidateRecallAt32 !== null && r.candidateRecallAt32 < 1)
  lines.push("## Retrieval misses (hybrid candidate recall@32 < 1; no reranker can fix these)")
  lines.push("")
  lines.push(misses.length ? misses.map((r) => `- ${r.key} (${r.split}): ${f(r.candidateRecallAt32)}`).join("\n") : "None.")
  lines.push("")
  lines.push("## No-evidence questions (excluded from ranking metrics)")
  lines.push("")
  lines.push(
    report.noEvidenceQuestions.length
      ? report.noEvidenceQuestions.map((q) => `- ${q.key} (${q.split}, ${q.category})`).join("\n")
      : "None."
  )
  const answerableKeys = new Set(report.rows.filter((r) => r.recallAt8 !== null).map((r) => r.key))
  const hybridRows = report.rows.filter((r) => r.mode === "hybrid-rrf")
  const withLexical = hybridRows.filter((r) => r.lexicalReturned > 0)
  lines.push("")
  lines.push(
    `Full-text search returned at least one chunk for ${withLexical.length}/${hybridRows.length} questions ` +
      `(${withLexical.filter((r) => answerableKeys.has(r.key)).length}/${answerableKeys.size} answerable). ` +
      "websearch_to_tsquery requires every query term, so long natural-language questions rarely match."
  )
  const leaks = report.rows.reduce((n, r) => n + r.ineligibleReturned, 0)
  lines.push("")
  lines.push(`Ineligible passages returned across all modes: ${leaks}.`)
  lines.push("")
  lines.push("## Caveats")
  lines.push("")
  for (const c of report.caveats) lines.push(`- ${c}`)
  lines.push("")
  return lines.join("\n")
}

export function perQuestionChanges(rows: readonly QuestionResult[], base: Mode, other: Mode) {
  return rows
    .filter((r) => r.mode === other && r.recallAt8 !== null)
    .map((r) => {
      const b = rows.find((x) => x.mode === base && x.key === r.key)!
      return {
        key: r.key,
        split: r.split,
        baseRecall: b.recallAt8,
        recall: r.recallAt8,
        baseMrr: b.mrrAt8,
        mrr: r.mrrAt8,
        candidateRecall: r.candidateRecallAt32,
      }
    })
    .filter((c) => c.baseRecall !== c.recall || c.baseMrr !== c.mrr)
}
