import assert from "node:assert/strict"
import { test } from "node:test"
import { dedupeExact, orderByScores, selectCoveragePreserving } from "../src/selection.ts"

const p = (id: string, text = id) => ({ id, text })

test("exact-text dedup keeps the first occurrence and keeps near-duplicates", () => {
  const out = dedupeExact([p("1", "same"), p("2", "other"), p("3", "same"), p("4", "same.")])
  assert.deepEqual(out.map((x) => x.id), ["1", "2", "4"])
})

test("orderByScores sorts descending with stable ties", () => {
  const out = orderByScores([p("a"), p("b"), p("c")], [0.1, 0.5, 0.1])
  assert.deepEqual(out.map((x) => x.id), ["b", "a", "c"])
  assert.throws(() => orderByScores([p("a")], [0.1, 0.2]))
  assert.throws(() => orderByScores([p("a")], [Number.NaN]))
})

test("coverage-preserving selection keeps every hybrid top-k passage", () => {
  const hybrid = "abcdefghij".split("").map((id) => p(id))
  const reranked = [...hybrid].reverse() // reranker prefers i, j most
  const out = selectCoveragePreserving(hybrid, reranked, 8)
  assert.deepEqual(new Set(out.map((x) => x.id)), new Set("abcdefgh"))
  assert.deepEqual(out.map((x) => x.id), "hgfedcba".split(""))
})

test("coverage-preserving selection fills free slots from the reranked order", () => {
  const hybrid = [p("a"), p("b"), p("c")]
  const out = selectCoveragePreserving(hybrid, [p("c"), p("a"), p("b")], 8)
  assert.deepEqual(out.map((x) => x.id), ["c", "a", "b"])
  assert.throws(() => selectCoveragePreserving(hybrid, [p("a"), p("b")], 8))
})
