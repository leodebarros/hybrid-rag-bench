# synthetic-coverage-v2 — LIVE

- Date: 2026-11-20T11:04:59.582Z
- Dataset: Follow-up synthetic corpus (52 documents, 16 questions) emphasising two- and four-source comparisons, contrasting exclusions and near-identical policies. sha256 `8c6621b8c04b6274…`
- Models: embedding `voyage-4 (1024 dims)`, reranker `rerank-2.5-lite`
- Git: `a995099753501c1243779af3552b521ab65389ab`
- Voyage spend (list-price estimate): $0.001055 over 18 requests; tokens {"voyage-4":3260,"rerank-2.5-lite":42400}; uncertain reservations $0.000000
- Embedding inputs: {"requested":68,"cacheHits":0,"apiInputs":67,"apiRequests":2}
- Duration: 484 s (includes deliberate rate-limit pacing)

## development (5 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| fts-only | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| hybrid-rrf | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| hybrid-rrf+rerank | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

## heldout (6 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 1.000 | 1.000 | 1.000 | 0.987 | 1.000 |
| fts-only | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| hybrid-rrf | 1.000 | 1.000 | 1.000 | 0.987 | 1.000 |
| hybrid-rrf+rerank | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

## regression (2 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 1.000 | 1.000 | 0.667 | 0.785 | 1.000 |
| fts-only | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| hybrid-rrf | 1.000 | 1.000 | 0.667 | 0.785 | 1.000 |
| hybrid-rrf+rerank | 1.000 | 0.750 | 1.000 | 0.807 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 1.000 | 1.000 | 1.000 | 0.916 | 1.000 |

## Rerank vs. hybrid, per question

| Question | Split | Recall@8 hybrid → rerank | MRR@8 hybrid → rerank | Candidate recall@32 |
| --- | --- | ---: | ---: | ---: |
| brisa | regression | 1.000 → 0.500 | 0.333 → 1.000 | 1.000 |

## Retrieval misses (hybrid candidate recall@32 < 1; no reranker can fix these)

None.

## No-evidence questions (excluded from ranking metrics)

- plans-unknown (development, no-evidence)
- dryers-power (heldout, no-evidence)
- lirio-private (heldout, ineligible-source)

Full-text search returned at least one chunk for 0/16 questions (0/13 answerable). websearch_to_tsquery requires every query term, so long natural-language questions rarely match.

Ineligible passages returned across all modes: 0.

## Caveats

- Small benchmark: one sample per question and mode; differences of one question move split means by 1/n.
- Ranking metrics use binary relevance over evidence ids; repeated evidence earns no extra credit.
- Retrieval only: no answer generation, so context quality is a proxy for downstream answer quality.
