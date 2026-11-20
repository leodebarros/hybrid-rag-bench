export type Passage = { id: string; text: string }

/** Remove exact-text duplicates, keeping the first (best-ranked) occurrence.
 * Near-duplicates are kept: similar passages can carry different facts. */
export function dedupeExact<T extends Passage>(passages: readonly T[]): T[] {
  const seen = new Set<string>()
  return passages.filter(({ text }) => {
    if (seen.has(text)) return false
    seen.add(text)
    return true
  })
}

/** Order passages by reranker score (desc); ties keep the input (hybrid) order. */
export function orderByScores<T extends Passage>(passages: readonly T[], scores: readonly number[]): T[] {
  if (scores.length !== passages.length || !scores.every(Number.isFinite))
    throw new Error("Reranker returned an invalid score list")
  return passages
    .map((passage, index) => ({ passage, index, score: scores[index]! }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.passage)
}

/**
 * Coverage-preserving selection (the source project's "preserve8-v2" profile):
 * every distinct passage of the hybrid top-k stays in context; the reranker
 * orders them and may only fill slots freed by exact duplicates.
 * `hybrid` is the deduplicated hybrid candidate list; `reranked` the same set reordered.
 */
export function selectCoveragePreserving<T extends Passage>(hybrid: readonly T[], reranked: readonly T[], k = 8): T[] {
  if (reranked.length !== hybrid.length || new Set(reranked.map((p) => p.id)).size !== hybrid.length)
    throw new Error("Reranked list must be a permutation of the candidates")
  const keep = new Set(hybrid.slice(0, k).map((p) => p.id))
  for (const p of reranked) {
    if (keep.size >= k) break
    keep.add(p.id)
  }
  return reranked.filter((p) => keep.has(p.id))
}
