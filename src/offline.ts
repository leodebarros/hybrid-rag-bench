import { createHash } from "node:crypto"

// OFFLINE MODE ONLY. These stand-ins exercise the SQL, fusion, selection and
// metrics code paths without network access. They do NOT measure semantic
// retrieval or reranking quality and their numbers must never be reported as such.

const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** Deterministic bag-of-words vector: each token increments one hashed dimension. */
export function tokenHashEmbedding(text: string, dimensions = 1024): number[] {
  const vector = Array<number>(dimensions).fill(0)
  for (const word of tokens(text)) {
    const bucket = createHash("sha256").update(word).digest().readUInt32BE(0) % dimensions
    vector[bucket]! += 1
  }
  if (!vector.some(Boolean)) vector[0] = 1 // pgvector cosine distance is undefined for a zero vector
  return vector
}

/** Deterministic stand-in "reranker": fraction of distinct query tokens present in the passage. */
export function tokenOverlapScores(query: string, passages: readonly string[]): number[] {
  const q = new Set(tokens(query))
  return passages.map((p) => {
    const words = new Set(tokens(p))
    let shared = 0
    for (const t of q) if (words.has(t)) shared++
    return q.size ? shared / q.size : 0
  })
}
