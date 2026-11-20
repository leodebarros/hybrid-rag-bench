import assert from "node:assert/strict"
import { test } from "node:test"
import { mean, rankingMetrics, recallAt } from "../src/metrics.ts"

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`)

test("perfect single-evidence ranking", () => {
  assert.deepEqual(rankingMetrics(["a", "x", "y"], ["a"]), { hit: 1, recall: 1, reciprocalRank: 1, ndcg: 1 })
})

test("relevant item at rank 3", () => {
  const m = rankingMetrics(["x", "y", "a"], ["a"])!
  assert.equal(m.hit, 1)
  close(m.reciprocalRank, 1 / 3)
  close(m.ndcg, 1 / Math.log2(4))
})

test("miss beyond cutoff", () => {
  const ranked = ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "a"]
  assert.deepEqual(rankingMetrics(ranked, ["a"], 8), { hit: 0, recall: 0, reciprocalRank: 0, ndcg: 0 })
  assert.equal(recallAt(ranked, ["a"], 32), 1)
})

test("duplicate evidence earns no repeated credit but consumes a slot", () => {
  const m = rankingMetrics(["a", "a", "b"], ["a", "b"])!
  assert.equal(m.recall, 1)
  // b is credited at position 3, not 2: the duplicate occupied position 2.
  close(m.ndcg, (1 + 1 / Math.log2(4)) / (1 + 1 / Math.log2(3)))
  // Repeating one relevant item can never exceed the score of distinct coverage.
  const dup = rankingMetrics(["a", "a", "a"], ["a", "b"])!
  assert.equal(dup.recall, 0.5)
  assert.ok(dup.ndcg < 1)
})

test("multi-source partial recall", () => {
  const m = rankingMetrics(["a", "x", "c"], ["a", "b", "c", "d"])!
  assert.equal(m.recall, 0.5)
  assert.equal(m.reciprocalRank, 1)
})

test("no-evidence questions are excluded, not perfect", () => {
  assert.equal(rankingMetrics(["x"], []), null)
  assert.equal(recallAt(["x"], [], 32), null)
  assert.equal(mean([1, null, 0]), 0.5)
  assert.equal(mean([null]), null)
})
