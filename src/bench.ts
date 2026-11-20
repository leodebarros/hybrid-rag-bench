import { createHash } from "node:crypto"
import { chunkText } from "./chunking.ts"
import { SearchIndex, type ChunkRow } from "./db.ts"
import type { Embedder } from "./embeddings.ts"
import { mean, rankingMetrics, recallAt } from "./metrics.ts"
import { reciprocalRankFusion } from "./rrf.ts"
import { dedupeExact, orderByScores, selectCoveragePreserving, type Passage } from "./selection.ts"
import type { Dataset, Split } from "./types.ts"

export const RRF_K = 60
export const CANDIDATES = 32
export const CONTEXT_K = 8
export const MODES = [
  "semantic-only",
  "fts-only",
  "hybrid-rrf",
  "hybrid-rrf+rerank",
  "hybrid-rrf+rerank-preserve8",
] as const
export type Mode = (typeof MODES)[number]

/** Returns one score per passage, in input order. */
export type Reranker = { label: string; score(query: string, passages: readonly string[]): Promise<number[]> }

type Candidate = Passage & { evidenceId: string; eligible: boolean }

export type QuestionResult = {
  mode: Mode
  key: string
  split: Split
  category: string
  relevant: string[]
  /** Evidence ids of the final context, in order (duplicates possible across chunks of one source). */
  contextEvidence: string[]
  contextChunkIds: string[]
  hitAt8: number | null
  recallAt8: number | null
  mrrAt8: number | null
  ndcgAt8: number | null
  candidateRecallAt32: number | null
  /** Number of candidates after exact-text dedup (≤ 32). */
  candidateCount: number
  exactDuplicatesRemoved: number
  /** Context slots occupied by an evidence id already present earlier in the context. */
  repeatedEvidenceInContext: number
  ineligibleReturned: number
  /** Raw list sizes before fusion: how many chunks each retriever returned (max 40). */
  semanticReturned: number
  lexicalReturned: number
  rerankLatencyMs: number | null
}

export type Summary = {
  mode: Mode
  split: Split
  answerable: number
  hitAt8: number | null
  recallAt8: number | null
  mrrAt8: number | null
  ndcgAt8: number | null
  candidateRecallAt32: number | null
}

export function datasetHash(dataset: Dataset): string {
  return createHash("sha256")
    .update(JSON.stringify({ chunking: dataset.chunking, documents: dataset.documents, questions: dataset.questions }))
    .digest("hex")
}

export async function runBenchmark(
  dataset: Dataset,
  embedder: Embedder,
  reranker: Reranker,
  log: (msg: string) => void
): Promise<{ rows: QuestionResult[]; summaries: Summary[]; chunkCount: number }> {
  const chunks: Omit<ChunkRow, "embedding">[] = dataset.documents.flatMap((doc) =>
    chunkText(doc.text, dataset.chunking).map((c) => ({
      id: `${doc.key}#${c.ordinal}`,
      evidenceId: doc.evidenceId ?? doc.key,
      text: c.text,
      eligible: !doc.ineligible,
    }))
  )
  log(`Chunked ${dataset.documents.length} documents into ${chunks.length} chunks`)
  const docVectors = await embedder.embed(
    chunks.map((c) => c.text),
    "document"
  )
  const queryVectors = await embedder.embed(
    dataset.questions.map((q) => q.query),
    "query"
  )
  const index = await SearchIndex.create()
  const byId = new Map<string, Candidate>()
  try {
    await index.insert(chunks.map((c, i) => ({ ...c, embedding: docVectors[i]! })))
    for (const c of chunks) byId.set(c.id, c)

    const rows: QuestionResult[] = []
    for (const [qi, question] of dataset.questions.entries()) {
      const semantic = await index.semantic(queryVectors[qi]!)
      const lexical = await index.lexical(question.query)
      const hybrid = reciprocalRankFusion([semantic, lexical], RRF_K).map((r) => r.id)
      const toPassages = (ids: string[]) => ids.slice(0, CANDIDATES).map((id) => byId.get(id)!)

      const candidateLists: Record<"semantic-only" | "fts-only" | "hybrid-rrf", Candidate[]> = {
        "semantic-only": toPassages(semantic),
        "fts-only": toPassages(lexical),
        "hybrid-rrf": toPassages(hybrid),
      }
      const deduped = Object.fromEntries(
        Object.entries(candidateLists).map(([k, v]) => [k, dedupeExact(v)])
      ) as Record<keyof typeof candidateLists, Candidate[]>

      // One rerank call per question; both rerank modes reuse its scores.
      const hybridDeduped = deduped["hybrid-rrf"]
      let reranked = hybridDeduped
      let rerankLatencyMs: number | null = null
      if (hybridDeduped.length > 1) {
        const started = performance.now()
        const scores = await reranker.score(
          question.query,
          hybridDeduped.map((p) => p.text)
        )
        rerankLatencyMs = Math.round(performance.now() - started)
        reranked = orderByScores(hybridDeduped, scores)
      }

      const contexts: Record<Mode, { context: Candidate[]; candidates: Candidate[]; raw: Candidate[] }> = {
        "semantic-only": { context: deduped["semantic-only"].slice(0, CONTEXT_K), candidates: deduped["semantic-only"], raw: candidateLists["semantic-only"] },
        "fts-only": { context: deduped["fts-only"].slice(0, CONTEXT_K), candidates: deduped["fts-only"], raw: candidateLists["fts-only"] },
        "hybrid-rrf": { context: hybridDeduped.slice(0, CONTEXT_K), candidates: hybridDeduped, raw: candidateLists["hybrid-rrf"] },
        "hybrid-rrf+rerank": { context: reranked.slice(0, CONTEXT_K), candidates: hybridDeduped, raw: candidateLists["hybrid-rrf"] },
        "hybrid-rrf+rerank-preserve8": {
          context: selectCoveragePreserving(hybridDeduped, reranked, CONTEXT_K),
          candidates: hybridDeduped,
          raw: candidateLists["hybrid-rrf"],
        },
      }

      const relevant = [...new Set(question.relevant)]
      for (const mode of MODES) {
        const { context, candidates, raw } = contexts[mode]
        const evidence = context.map((p) => p.evidenceId)
        const m = rankingMetrics(evidence, relevant, CONTEXT_K)
        rows.push({
          mode,
          key: question.key,
          split: question.split,
          category: question.category,
          relevant,
          contextEvidence: evidence,
          contextChunkIds: context.map((p) => p.id),
          hitAt8: m?.hit ?? null,
          recallAt8: m?.recall ?? null,
          mrrAt8: m?.reciprocalRank ?? null,
          ndcgAt8: m?.ndcg ?? null,
          candidateRecallAt32: recallAt(
            candidates.map((p) => p.evidenceId),
            relevant,
            CANDIDATES
          ),
          candidateCount: candidates.length,
          exactDuplicatesRemoved: raw.length - candidates.length,
          repeatedEvidenceInContext: evidence.length - new Set(evidence).size,
          ineligibleReturned: context.filter((p) => !p.eligible).length,
          semanticReturned: semantic.length,
          lexicalReturned: lexical.length,
          rerankLatencyMs: mode.includes("rerank") ? rerankLatencyMs : null,
        })
      }
      log(`  question ${qi + 1}/${dataset.questions.length} (${question.key}) done`)
    }

    const splits = [...new Set(dataset.questions.map((q) => q.split))]
    const summaries: Summary[] = MODES.flatMap((mode) =>
      splits.map((split) => {
        const group = rows.filter((r) => r.mode === mode && r.split === split && r.recallAt8 !== null)
        return {
          mode,
          split,
          answerable: group.length,
          hitAt8: mean(group.map((r) => r.hitAt8)),
          recallAt8: mean(group.map((r) => r.recallAt8)),
          mrrAt8: mean(group.map((r) => r.mrrAt8)),
          ndcgAt8: mean(group.map((r) => r.ndcgAt8)),
          candidateRecallAt32: mean(group.map((r) => r.candidateRecallAt32)),
        }
      })
    )
    return { rows, summaries, chunkCount: chunks.length }
  } finally {
    await index.close()
  }
}
