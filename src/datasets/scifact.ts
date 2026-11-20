// Fixed, deterministic subset of the BEIR SciFact test split.
// Run `pnpm download:scifact` first; files are read from data/external/scifact/.
// Data licence: CC BY-NC 2.0 (Wadden et al., 2020). Not redistributed here.
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { BenchDocument, BenchQuestion, Dataset } from "../types.ts"

export type SciFactOptions = {
  /** Number of test queries (with at least one relevant document) to sample. */
  queries: number
  /** Total corpus size: every relevant document plus deterministic random distractors. 0 = full corpus. */
  corpus: number
}
export const SCIFACT_DEFAULTS: SciFactOptions = { queries: 50, corpus: 300 }

const SEED = "hybrid-rag-bench/scifact-subset-v1"
const order = (id: string) =>
  createHash("sha256").update(`${SEED}/${id}`).digest("hex")
const MAX_LINE = 100_000

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      if (line.length > MAX_LINE) throw new Error(`Oversized line in ${path}`)
      return JSON.parse(line) as unknown
    })
}
const str = (v: unknown, field: string): string => {
  if (typeof v !== "string") throw new Error(`Unexpected ${field} in SciFact file`)
  return v
}

export function loadSciFact(options: SciFactOptions = SCIFACT_DEFAULTS): Dataset {
  const dir = resolve("data/external/scifact")
  const paths = ["corpus.jsonl", "queries.jsonl", "qrels-test.tsv"].map((f) => join(dir, f))
  if (paths.some((p) => !existsSync(p)))
    throw new Error("SciFact files not found. Run `pnpm download:scifact` first.")
  const [corpusPath, queriesPath, qrelsPath] = paths as [string, string, string]

  const corpus = new Map<string, string>()
  for (const row of readJsonl(corpusPath)) {
    const r = row as Record<string, unknown>
    const id = str(r._id, "_id")
    const title = str(r.title ?? "", "title").trim()
    const text = str(r.text, "text").trim()
    corpus.set(id, title ? `${title}\n${text}` : text)
  }
  const queries = new Map<string, string>()
  for (const row of readJsonl(queriesPath)) {
    const r = row as Record<string, unknown>
    queries.set(str(r._id, "_id"), str(r.text, "text"))
  }
  const qrels = new Map<string, Set<string>>()
  for (const line of readFileSync(qrelsPath, "utf8").split("\n").slice(1)) {
    const [q, d, score] = line.trim().split("\t")
    if (!q || !d || Number(score) <= 0) continue
    if (!corpus.has(d) || !queries.has(q)) throw new Error("Dangling SciFact qrel")
    qrels.set(q, (qrels.get(q) ?? new Set()).add(d))
  }

  const selected = [...qrels.keys()]
    .sort((a, b) => order(a).localeCompare(order(b)))
    .slice(0, options.queries)
  const relevantDocs = new Set(selected.flatMap((q) => [...qrels.get(q)!]))
  const distractors = [...corpus.keys()]
    .filter((d) => !relevantDocs.has(d))
    .sort((a, b) => order(a).localeCompare(order(b)))
  const docIds =
    options.corpus === 0
      ? [...corpus.keys()]
      : [...relevantDocs, ...distractors.slice(0, Math.max(0, options.corpus - relevantDocs.size))]
  docIds.sort()

  const documents: BenchDocument[] = docIds.map((id) => ({ key: id, text: corpus.get(id)! }))
  const questions: BenchQuestion[] = selected.map((q, i) => ({
    key: q,
    // Alternate in hash order: half development, half held-out. Nothing is tuned on either.
    split: i % 2 === 0 ? "development" : "heldout",
    query: queries.get(q)!,
    relevant: [...qrels.get(q)!].sort(),
    category: "scientific-claim",
  }))
  return {
    name: `scifact-q${options.queries}-c${options.corpus === 0 ? "full" : docIds.length}`,
    description: `BEIR SciFact test split: ${questions.length} claims, ${documents.length} abstracts (${relevantDocs.size} relevant + ${documents.length - relevantDocs.size} random distractors).`,
    // Smaller chunks keep a 32-candidate rerank request under the free-tier 10K TPM limit.
    chunking: { maxChars: 600, overlapChars: 0 },
    documents,
    questions,
    notes: [
      "SciFact: Wadden et al., 'Fact or Fiction: Verifying Scientific Claims', EMNLP 2020. Licence CC BY-NC 2.0. BEIR packaging: Thakur et al., NeurIPS 2021 Datasets & Benchmarks.",
      "Deterministic subset (seed hybrid-rag-bench/scifact-subset-v1). Distractors are random, not hard negatives, so this is easier than full-corpus BEIR and NOT comparable to published BEIR nDCG@10.",
      "Abstracts are chunked at <=600 characters; relevance is per abstract, so several chunks of one abstract earn credit once.",
    ],
  }
}
