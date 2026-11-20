export type RankingMetrics = { hit: number; recall: number; reciprocalRank: number; ndcg: number }

/**
 * Binary-relevance ranking metrics at cutoff k over evidence ids.
 * A repeated evidence id (e.g. two chunks of one abstract, or an exact duplicate
 * document) earns credit once, at its first position, and later copies still
 * consume rank positions. Returns null when there is no relevant evidence:
 * no-evidence questions are excluded rather than scored as perfect.
 */
export function rankingMetrics(ranked: readonly string[], relevant: readonly string[], k = 8): RankingMetrics | null {
  const truth = new Set(relevant)
  if (!truth.size) return null
  const top = ranked.slice(0, k)
  const credited = new Set<string>()
  let dcg = 0
  let first = -1
  top.forEach((id, i) => {
    if (!truth.has(id) || credited.has(id)) return
    if (first < 0) first = i
    credited.add(id)
    dcg += 1 / Math.log2(i + 2)
  })
  let ideal = 0
  for (let i = 0; i < Math.min(k, truth.size); i++) ideal += 1 / Math.log2(i + 2)
  return {
    hit: credited.size > 0 ? 1 : 0,
    recall: credited.size / truth.size,
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1),
    ndcg: dcg / ideal,
  }
}

/** Recall at a cutoff, e.g. candidate recall@32. */
export function recallAt(ranked: readonly string[], relevant: readonly string[], k: number): number | null {
  return rankingMetrics(ranked, relevant, k)?.recall ?? null
}

export function mean(values: readonly (number | null)[]): number | null {
  const valid = values.filter((n): n is number => n !== null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}
