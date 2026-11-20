import assert from "node:assert/strict"
import { test } from "node:test"
import { reciprocalRankFusion } from "../src/rrf.ts"

test("scores are the sum of 1/(k+rank) with 1-based ranks", () => {
  const fused = reciprocalRankFusion([["a", "b"], ["b", "c"]], 60)
  const score = Object.fromEntries(fused.map((r) => [r.id, r.score]))
  assert.equal(score.a, 1 / 61)
  assert.equal(score.b, 1 / 62 + 1 / 61)
  assert.equal(score.c, 1 / 62)
  assert.deepEqual(fused.map((r) => r.id), ["b", "a", "c"])
})

test("ties break by id ascending, like the SQL ORDER BY score DESC, id", () => {
  // x is first in list 1, y is first in list 2: identical scores.
  const fused = reciprocalRankFusion([["y", "z"], ["x", "z"]], 60)
  assert.deepEqual(fused.map((r) => r.id), ["z", "x", "y"])
})

test("one empty list (e.g. no full-text match) preserves the other order", () => {
  const fused = reciprocalRankFusion([["c", "a", "b"], []], 60)
  assert.deepEqual(fused.map((r) => r.id), ["c", "a", "b"])
})

test("an id repeated within one list is counted once, at its best rank", () => {
  const fused = reciprocalRankFusion([["a", "a"]], 60)
  assert.deepEqual(fused, [{ id: "a", score: 1 / 61 }])
})

test("agreement between retrievers beats a single first place", () => {
  const fused = reciprocalRankFusion([["solo", "both"], ["other", "both"]], 60)
  assert.equal(fused[0]!.id, "both")
})
