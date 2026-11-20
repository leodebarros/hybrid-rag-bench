import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { tokenHashEmbedding } from "./offline.ts"
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, estimateTokens, voyageEmbed, type VoyageContext } from "./voyage.ts"

export type EmbeddingStats = { requested: number; cacheHits: number; apiInputs: number; apiRequests: number }

/** Max inputs per Voyage embeddings request (API limit is 1,000; keep requests small). */
const MAX_BATCH = 128

/**
 * Local cache of Voyage embeddings, keyed by sha256(model, dimension, input type, text).
 * It only avoids paying twice for identical inputs across runs; reports state
 * how many vectors came from the cache. Disable with --no-cache.
 */
class EmbeddingCache {
  private readonly entries: Record<string, number[]>
  constructor(private readonly path: string | null) {
    this.entries = path && existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, number[]>) : {}
  }
  static key(text: string, inputType: string) {
    return createHash("sha256").update(`${EMBEDDING_MODEL}\0${EMBEDDING_DIMENSIONS}\0${inputType}\0${text}`).digest("hex")
  }
  get(key: string) {
    return this.entries[key]
  }
  set(key: string, vector: number[]) {
    this.entries[key] = vector
  }
  save() {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.entries))
  }
}

export type Embedder = {
  embed(texts: readonly string[], inputType: "document" | "query"): Promise<number[][]>
  stats: EmbeddingStats
  label: string
}

export function offlineEmbedder(): Embedder {
  const stats: EmbeddingStats = { requested: 0, cacheHits: 0, apiInputs: 0, apiRequests: 0 }
  return {
    label: "token-hash-1024 (offline; NOT a semantic embedding)",
    stats,
    async embed(texts) {
      stats.requested += texts.length
      return texts.map((t) => tokenHashEmbedding(t, EMBEDDING_DIMENSIONS))
    },
  }
}

export function voyageEmbedder(ctx: VoyageContext, cachePath: string | null, log: (msg: string) => void): Embedder {
  const cache = new EmbeddingCache(cachePath)
  const stats: EmbeddingStats = { requested: 0, cacheHits: 0, apiInputs: 0, apiRequests: 0 }
  // Keep each request comfortably inside the pacer's tokens-per-minute budget.
  const tokenBudget = Math.floor(ctx.pacer.tpm * 0.9)
  return {
    label: `${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`,
    stats,
    async embed(texts, inputType) {
      stats.requested += texts.length
      const keys = texts.map((t) => EmbeddingCache.key(t, inputType))
      const missing = [...new Set(keys.map((k, i) => (cache.get(k) ? -1 : i)).filter((i) => i >= 0).map((i) => keys[i]!))]
      stats.cacheHits += texts.length - keys.filter((k) => missing.includes(k)).length
      const byKey = new Map(keys.map((k, i) => [k, texts[i]!]))
      let batch: string[] = []
      const flush = async () => {
        if (!batch.length) return
        const inputs = batch.map((k) => byKey.get(k)!)
        const vectors = await voyageEmbed(ctx, inputs, inputType)
        batch.forEach((k, i) => cache.set(k, vectors[i]!))
        cache.save()
        stats.apiInputs += inputs.length
        stats.apiRequests++
        log(`  embedded ${stats.apiInputs} ${inputType} inputs via API (${stats.apiRequests} requests)`)
        batch = []
      }
      for (const key of missing) {
        const next = [...batch, key]
        if (batch.length && (next.length > MAX_BATCH || estimateTokens(next.map((k) => byKey.get(k)!)) > tokenBudget))
          await flush()
        batch.push(key)
      }
      await flush()
      return keys.map((k) => cache.get(k)!)
    },
  }
}
