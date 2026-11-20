# scifact-q50-c300 — LIVE

- Date: 2026-11-20T12:23:46.871Z
- Dataset: BEIR SciFact test split: 50 claims, 300 abstracts (55 relevant + 245 random distractors). sha256 `e55b272c034df255…`
- Models: embedding `voyage-4 (1024 dims)`, reranker `rerank-2.5-lite`
- Git: `a995099753501c1243779af3552b521ab65389ab`
- Voyage spend (list-price estimate): $0.009626 over 71 requests; tokens {"voyage-4":99377,"rerank-2.5-lite":181610}; uncertain reservations $0.000000
- Embedding inputs: {"requested":938,"cacheHits":0,"apiInputs":938,"apiRequests":21}
- Duration: 4078 s (includes deliberate rate-limit pacing)

## development (25 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 1.000 | 1.000 | 0.960 | 0.966 | 1.000 |
| fts-only | 0.080 | 0.080 | 0.080 | 0.080 | 0.080 |
| hybrid-rrf | 1.000 | 1.000 | 0.980 | 0.980 | 1.000 |
| hybrid-rrf+rerank | 1.000 | 1.000 | 1.000 | 0.997 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 1.000 | 1.000 | 1.000 | 0.997 | 1.000 |

## heldout (25 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 0.920 | 0.920 | 0.832 | 0.848 | 1.000 |
| fts-only | 0.040 | 0.040 | 0.040 | 0.040 | 0.040 |
| hybrid-rrf | 0.920 | 0.920 | 0.832 | 0.848 | 1.000 |
| hybrid-rrf+rerank | 0.920 | 0.920 | 0.812 | 0.839 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 0.920 | 0.920 | 0.821 | 0.846 | 1.000 |

## Rerank vs. hybrid, per question

| Question | Split | Recall@8 hybrid → rerank | MRR@8 hybrid → rerank | Candidate recall@32 |
| --- | --- | ---: | ---: | ---: |
| 544 | heldout | 1.000 → 1.000 | 0.500 → 0.333 | 1.000 |
| 1180 | development | 1.000 → 1.000 | 0.500 → 1.000 | 1.000 |
| 1110 | heldout | 1.000 → 0.000 | 0.167 → 0.000 | 1.000 |
| 303 | heldout | 0.000 → 1.000 | 0.000 → 0.500 | 1.000 |
| 649 | heldout | 1.000 → 1.000 | 1.000 → 0.333 | 1.000 |

## Retrieval misses (hybrid candidate recall@32 < 1; no reranker can fix these)

None.

## No-evidence questions (excluded from ranking metrics)

None.

Full-text search returned at least one chunk for 3/50 questions (3/50 answerable). websearch_to_tsquery requires every query term, so long natural-language questions rarely match.

Ineligible passages returned across all modes: 0.

## Caveats

- Small benchmark: one sample per question and mode; differences of one question move split means by 1/n.
- Ranking metrics use binary relevance over evidence ids; repeated evidence earns no extra credit.
- Retrieval only: no answer generation, so context quality is a proxy for downstream answer quality.
