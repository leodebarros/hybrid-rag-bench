/**
 * Reciprocal rank fusion (Cormack et al., 2009): score(d) = Σ 1 / (k + rank_i(d)),
 * with 1-based ranks. Items absent from a list contribute nothing for that list.
 * Ties break by id ascending, matching the source SQL (`ORDER BY score DESC, id`).
 */
export function reciprocalRankFusion(lists: readonly (readonly string[])[], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>()
  for (const list of lists) {
    const seen = new Set<string>()
    list.forEach((id, index) => {
      if (seen.has(id)) return // an id counts once per list, at its best rank
      seen.add(id)
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1))
    })
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
