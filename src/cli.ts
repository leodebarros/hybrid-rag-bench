import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { CANDIDATES, CONTEXT_K, datasetHash, RRF_K, runBenchmark, type Reranker } from "./bench.ts"
import { DATASET_NAMES, loadDataset, type DatasetName } from "./datasets/index.ts"
import { SCIFACT_DEFAULTS } from "./datasets/scifact.ts"
import { LEXICAL_LIMIT, SEMANTIC_LIMIT } from "./db.ts"
import { offlineEmbedder, voyageEmbedder } from "./embeddings.ts"
import { tokenOverlapScores } from "./offline.ts"
import { toMarkdown, type Report } from "./report.ts"
import { Pacer, SpendLedger } from "./spend.ts"
import { EMBEDDING_DIMENSIONS, RERANK_MODEL, voyageRerank, type VoyageContext } from "./voyage.ts"

const USAGE = `Usage: pnpm bench [--live] [--dataset <name>] [--original] [options]

  --live                 Call Voyage (needs VOYAGE_API_KEY in the environment or ./.env).
                         Without it: offline diagnostic (token-hash vectors, NOT semantic quality).
  --dataset <name>       ${DATASET_NAMES.join(" | ")} (default synthetic-coverage-v2)
  --original             Shorthand for --dataset synthetic-original
  --cap-usd <n>          Hard Voyage spend cap per run, list-price estimate (default 0.25)
  --rpm <n>              Requests/minute pacing (default 3: Voyage tier without payment method)
  --tpm <n>              Estimated tokens/minute pacing (default 9000, under the 10K free-tier limit)
  --scifact-queries <n>  SciFact test claims to sample (default ${SCIFACT_DEFAULTS.queries})
  --scifact-corpus <n>   SciFact corpus size incl. all relevant abstracts; 0 = full (default ${SCIFACT_DEFAULTS.corpus})
  --no-cache             Do not read or write the local embedding cache (.cache/)
  --out <dir>            Output directory root (default runs/)`

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    dataset: { type: "string", default: "synthetic-coverage-v2" },
    original: { type: "boolean", default: false },
    "cap-usd": { type: "string", default: "0.25" },
    rpm: { type: "string", default: "3" },
    tpm: { type: "string", default: "9000" },
    "scifact-queries": { type: "string", default: String(SCIFACT_DEFAULTS.queries) },
    "scifact-corpus": { type: "string", default: String(SCIFACT_DEFAULTS.corpus) },
    "no-cache": { type: "boolean", default: false },
    out: { type: "string", default: "runs" },
    help: { type: "boolean", default: false },
  },
})
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
const datasetName = (values.original ? "synthetic-original" : values.dataset) as DatasetName
if (!DATASET_NAMES.includes(datasetName)) throw new Error(`Unknown dataset. ${USAGE}`)
const num = (name: string, v: string, min: number) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min) throw new Error(`Invalid --${name}`)
  return n
}
const capUsd = num("cap-usd", values["cap-usd"], 0)
const rpm = num("rpm", values.rpm, 1)
const tpm = num("tpm", values.tpm, 1000)

const dataset = loadDataset(datasetName, {
  queries: num("scifact-queries", values["scifact-queries"], 1),
  corpus: num("scifact-corpus", values["scifact-corpus"], 0),
})
const stamp = new Date().toISOString().replaceAll(":", "-")
const outDir = join(values.out, dataset.name, `${stamp}-${values.live ? "live" : "offline"}`)
mkdirSync(outDir, { recursive: true })
const log = (msg: string) => console.log(msg)

let ledger: SpendLedger | null = null
let embedder = offlineEmbedder()
let reranker: Reranker = {
  label: "token-overlap stub (offline; NOT a reranking model)",
  score: async (q, passages) => tokenOverlapScores(q, passages),
}
if (values.live) {
  if (!process.env.VOYAGE_API_KEY && existsSync(".env")) process.loadEnvFile(".env")
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error("--live requires VOYAGE_API_KEY (environment or ./.env). The key is never printed.")
  ledger = new SpendLedger(Math.round(capUsd * 1e6), join(outDir, "usage.json"))
  const ctx: VoyageContext = { apiKey, ledger, pacer: new Pacer(rpm, tpm) }
  embedder = voyageEmbedder(ctx, values["no-cache"] ? null : join(".cache", "embeddings", `voyage-4-${EMBEDDING_DIMENSIONS}.json`), log)
  reranker = { label: RERANK_MODEL, score: (q, passages) => voyageRerank(ctx, q, passages) }
}

const git = (() => {
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
    const dirty = execFileSync("git", ["status", "--porcelain", "--", "src", "package.json", "pnpm-lock.yaml"]).toString().trim().length > 0
    return { revision, dirty }
  } catch {
    return { revision: null, dirty: null }
  }
})()

log(`${values.live ? "LIVE" : "OFFLINE"} run on ${dataset.name}; output in ${outDir}`)
if (values.live) log(`Pacing ${rpm} req/min, ~${tpm} tokens/min; spend cap $${capUsd}`)
const started = Date.now()
try {
  const { rows, summaries, chunkCount } = await runBenchmark(dataset, embedder, reranker, log)
  const report: Report = {
    benchmark: "hybrid-rag-bench",
    createdAt: new Date().toISOString(),
    live: values.live,
    dataset: {
      name: dataset.name,
      description: dataset.description,
      sha256: datasetHash(dataset),
      documents: dataset.documents.length,
      chunks: chunkCount,
      questions: dataset.questions.length,
      notes: dataset.notes,
    },
    git,
    models: { embedding: embedder.label, reranker: reranker.label },
    pipeline: {
      semanticLimit: SEMANTIC_LIMIT,
      lexicalLimit: LEXICAL_LIMIT,
      fts: "simple ∪ spanish ∪ english tsvector; websearch_to_tsquery; ts_rank_cd",
      semantic: "pgvector cosine distance, exact scan",
      rrfK: RRF_K,
      candidates: CANDIDATES,
      dedup: "exact text",
      contextK: CONTEXT_K,
      chunking: dataset.chunking,
      pacing: values.live ? { rpm, tpm } : null,
    },
    spend: ledger?.summary() ?? null,
    embeddingStats: embedder.stats,
    durationSeconds: (Date.now() - started) / 1000,
    summaries,
    noEvidenceQuestions: dataset.questions
      .filter((q) => q.relevant.length === 0)
      .map((q) => ({ key: q.key, split: q.split, category: q.category })),
    rows,
    caveats: [
      "Small benchmark: one sample per question and mode; differences of one question move split means by 1/n.",
      "Ranking metrics use binary relevance over evidence ids; repeated evidence earns no extra credit.",
      "Retrieval only: no answer generation, so context quality is a proxy for downstream answer quality.",
      ...(values.live ? [] : ["OFFLINE: token-hash embeddings and token-overlap reranker stub; not semantic-quality evidence."]),
    ],
  }
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n")
  const markdown = toMarkdown(report)
  writeFileSync(join(outDir, "summary.md"), markdown)
  console.log("\n" + markdown)
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error"
  console.error(`Benchmark failed (no retry): ${message}`)
  if (ledger) console.error(`Spend so far: ${JSON.stringify(ledger.summary())}; journal: ${join(outDir, "usage.json")}`)
  process.exitCode = 1
}
