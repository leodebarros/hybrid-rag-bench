import assert from "node:assert/strict"
import { test } from "node:test"
import { BudgetExceeded, microusdFor, SpendLedger } from "../src/spend.ts"

test("prices: tokens × $/M = micro-USD, rounded up", () => {
  assert.equal(microusdFor("voyage-4", 1_000_000), 60_000)
  assert.equal(microusdFor("rerank-2.5-lite", 1), 1)
})

test("the cap refuses a request before it is sent", () => {
  const ledger = new SpendLedger(100, null) // $0.0001
  const op = ledger.reserve("embed", "voyage-4", 1000, 1) // 60 µ$
  assert.throws(() => ledger.reserve("embed", "voyage-4", 1000, 1), BudgetExceeded)
  ledger.settle(op, 100) // actual 6 µ$ frees headroom
  assert.doesNotThrow(() => ledger.reserve("embed", "voyage-4", 1000, 1))
})

test("uncertain failures keep their reservation; 4xx rejections release it", () => {
  const ledger = new SpendLedger(1_000_000, null)
  ledger.uncertain(ledger.reserve("rerank", "rerank-2.5-lite", 10_000, 4)) // 200 µ$
  ledger.reject(ledger.reserve("rerank", "rerank-2.5-lite", 10_000, 4), 429)
  assert.equal(ledger.committedMicrousd(), 200)
  assert.equal(ledger.summary().uncertainReservedUsd, 0.0002)
})
