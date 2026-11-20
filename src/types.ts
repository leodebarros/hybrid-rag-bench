export type Split = "development" | "heldout" | "regression"

export type BenchDocument = {
  /** Stable document key. Relevance labels refer to evidence ids (see `evidenceId`). */
  key: string
  text: string
  /**
   * Evidence identity used for scoring. Exact duplicate documents share one
   * evidence id so they cannot earn repeated credit. Defaults to `key`.
   */
  evidenceId?: string
  /**
   * Documents that exist in the index but must never be retrieved (stand-in
   * for "inactive version", "revoked source" or "collection not selected").
   * The search filters on a single `eligible` flag; see README.
   */
  ineligible?: "unselected" | "inactive" | "revoked"
}

export type BenchQuestion = {
  key: string
  split: Split
  query: string
  /** Evidence ids. Empty means "no evidence exists" (excluded from ranking metrics). */
  relevant: string[]
  category: string
}

export type Dataset = {
  name: string
  description: string
  /** Chunker parameters used for this dataset. */
  chunking: { maxChars: number; overlapChars: number }
  documents: BenchDocument[]
  questions: BenchQuestion[]
  /** Free-form provenance/licence notes copied into the report. */
  notes: string[]
}
