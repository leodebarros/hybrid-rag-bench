# synthetic-original — LIVE

- Date: 2026-11-20T11:14:37.967Z
- Dataset: Original synthetic support corpus (41 documents, 21 questions; mostly Spanish documents with Spanish and English questions). sha256 `58b25625b2f30f6c…`
- Models: embedding `voyage-4 (1024 dims)`, reranker `rerank-2.5-lite`
- Git: `a995099753501c1243779af3552b521ab65389ab`
- Voyage spend (list-price estimate): $0.001046 over 22 requests; tokens {"voyage-4":251,"rerank-2.5-lite":50865}; uncertain reservations $0.000000
- Embedding inputs: {"requested":62,"cacheHits":43,"apiInputs":19,"apiRequests":1}
- Duration: 508 s (includes deliberate rate-limit pacing)

## development (7 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| fts-only | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| hybrid-rrf | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| hybrid-rrf+rerank | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

## heldout (10 answerable questions)

| Mode | Hit@8 | Recall@8 | MRR@8 | nDCG@8 | Candidate recall@32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| semantic-only | 1.000 | 1.000 | 0.950 | 0.969 | 1.000 |
| fts-only | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| hybrid-rrf | 1.000 | 1.000 | 0.950 | 0.969 | 1.000 |
| hybrid-rrf+rerank | 1.000 | 0.950 | 1.000 | 0.961 | 1.000 |
| hybrid-rrf+rerank-preserve8 | 1.000 | 1.000 | 1.000 | 0.981 | 1.000 |

## Rerank vs. hybrid, per question

| Question | Split | Recall@8 hybrid → rerank | MRR@8 hybrid → rerank | Candidate recall@32 |
| --- | --- | ---: | ---: | ---: |
| brisa | heldout | 1.000 → 0.500 | 0.500 → 1.000 | 1.000 |

## Retrieval misses (hybrid candidate recall@32 < 1; no reranker can fix these)

None.

## No-evidence questions (excluded from ranking metrics)

- unknown (development, no-evidence)
- private (development, ineligible-source)
- revoked (heldout, ineligible-source)
- unknown-fact (heldout, no-evidence)

Full-text search returned at least one chunk for 0/21 questions (0/17 answerable). websearch_to_tsquery requires every query term, so long natural-language questions rarely match.

Ineligible passages returned across all modes: 0.

## Caveats

- Small benchmark: one sample per question and mode; differences of one question move split means by 1/n.
- Ranking metrics use binary relevance over evidence ids; repeated evidence earns no extra credit.
- Retrieval only: no answer generation, so context quality is a proxy for downstream answer quality.
