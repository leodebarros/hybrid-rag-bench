import assert from "node:assert/strict"
import { test } from "node:test"
import { SearchIndex } from "../src/db.ts"
import { tokenHashEmbedding } from "../src/offline.ts"

test("PGlite index: ineligible rows never returned; FTS is multilingual and AND-based", async () => {
  const index = await SearchIndex.create()
  try {
    const rows = [
      { id: "a#0", evidenceId: "a", text: "La garantía del refrigerador dura 36 meses.", eligible: true },
      { id: "b#0", evidenceId: "b", text: "The warranty for the fan lasts 18 months.", eligible: true },
      { id: "c#0", evidenceId: "c", text: "La garantía secreta dura 99 meses.", eligible: false },
    ]
    await index.insert(rows.map((r) => ({ ...r, embedding: tokenHashEmbedding(r.text) })))
    const semantic = await index.semantic(tokenHashEmbedding("garantía secreta"))
    assert.deepEqual(new Set(semantic), new Set(["a#0", "b#0"]))
    // Spanish stemming: "garantías" matches "garantía".
    assert.deepEqual(await index.lexical("garantías meses"), ["a#0"])
    // English stemming: "warranties" matches "warranty".
    assert.deepEqual(await index.lexical("warranties"), ["b#0"])
    // Every term is required: one unmatched word means no FTS result.
    assert.deepEqual(await index.lexical("garantía refrigerador nevera"), [])
  } finally {
    await index.close()
  }
})
