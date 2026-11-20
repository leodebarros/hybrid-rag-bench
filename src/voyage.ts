import type { Pacer, SpendLedger } from "./spend.ts"

export const EMBEDDING_MODEL = "voyage-4"
export const RERANK_MODEL = "rerank-2.5-lite"
export const EMBEDDING_DIMENSIONS = 1024
const TIMEOUT_MS = 45_000

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8")
/** Conservative ceiling used for the spend reservation: a token is never shorter than one byte. */
const ceiling = (texts: readonly string[]) => texts.reduce((n, t) => n + bytes(t) + 64, 0)
/** Rough estimate (≈3 bytes/token) used only for client-side rate pacing. */
export const estimateTokens = (texts: readonly string[]) =>
  texts.reduce((n, t) => n + Math.ceil(bytes(t) / 3) + 4, 0)

export type VoyageContext = { apiKey: string; ledger: SpendLedger; pacer: Pacer }

/**
 * One POST to Voyage. Reserves spend first (refusing the call if it would
 * exceed the cap), paces, and never retries: any failure aborts the run.
 * Error messages never include the request body, response body or key.
 */
async function post(
  ctx: VoyageContext,
  kind: "embed" | "rerank",
  model: string,
  path: string,
  body: unknown,
  ceilingTokens: number,
  paceTokens: number,
  inputs: number
): Promise<{ json: Record<string, unknown>; tokens: number }> {
  const op = ctx.ledger.reserve(kind, model, ceilingTokens, inputs)
  await ctx.pacer.acquire(paceTokens)
  let response: Response
  try {
    response = await fetch(`https://api.voyageai.com/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    ctx.ledger.uncertain(op)
    throw new ProviderError(`Voyage ${kind} request failed (network/timeout); not retried`)
  }
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) ctx.ledger.reject(op, response.status)
    else ctx.ledger.uncertain(op, response.status)
    throw new ProviderError(`Voyage ${kind} request returned HTTP ${response.status}; not retried`, response.status)
  }
  let json: Record<string, unknown>
  try {
    json = (await response.json()) as Record<string, unknown>
  } catch {
    ctx.ledger.uncertain(op, response.status)
    throw new ProviderError(`Voyage ${kind} returned invalid JSON`)
  }
  const tokens = (json.usage as { total_tokens?: unknown } | undefined)?.total_tokens
  if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 0) {
    ctx.ledger.uncertain(op, response.status)
    throw new ProviderError(`Voyage ${kind} response lacked usage`)
  }
  ctx.ledger.settle(op, tokens)
  ctx.pacer.record(tokens)
  return { json, tokens }
}

export async function voyageEmbed(
  ctx: VoyageContext,
  texts: readonly string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const { json } = await post(
    ctx,
    "embed",
    EMBEDDING_MODEL,
    "embeddings",
    {
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
      truncation: false,
    },
    ceiling(texts),
    estimateTokens(texts),
    texts.length
  )
  const data = json.data as { index: number; embedding: number[] }[] | undefined
  if (!Array.isArray(data) || data.length !== texts.length) throw new ProviderError("Embedding count mismatch")
  const sorted = [...data].sort((a, b) => a.index - b.index)
  sorted.forEach((d, i) => {
    if (
      d.index !== i ||
      !Array.isArray(d.embedding) ||
      d.embedding.length !== EMBEDDING_DIMENSIONS ||
      !d.embedding.every(Number.isFinite)
    )
      throw new ProviderError("Malformed embedding in response")
  })
  return sorted.map((d) => d.embedding)
}

/** Returns one relevance score per input document, in input order. */
export async function voyageRerank(ctx: VoyageContext, query: string, documents: readonly string[]): Promise<number[]> {
  // Voyage bills rerank tokens as (query tokens × documents) + document tokens.
  const pairs = documents.map((d) => `${query}\n${d}`)
  const { json } = await post(
    ctx,
    "rerank",
    RERANK_MODEL,
    "rerank",
    { model: RERANK_MODEL, query, documents, top_k: documents.length, return_documents: false, truncation: false },
    ceiling(pairs),
    estimateTokens(pairs),
    documents.length
  )
  const data = json.data as { index: number; relevance_score: number }[] | undefined
  if (
    !Array.isArray(data) ||
    data.length !== documents.length ||
    new Set(data.map((d) => d.index)).size !== documents.length ||
    data.some((d) => !Number.isInteger(d.index) || d.index < 0 || d.index >= documents.length || !Number.isFinite(d.relevance_score))
  )
    throw new ProviderError("Malformed rerank response")
  const scores = Array<number>(documents.length)
  for (const d of data) scores[d.index] = d.relevance_score
  return scores
}
