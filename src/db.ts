import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite-pgvector"

export const SEMANTIC_LIMIT = 40
export const LEXICAL_LIMIT = 40
export const DIMENSIONS = 1024

export type ChunkRow = {
  id: string
  evidenceId: string
  text: string
  eligible: boolean
  embedding: number[]
}

// Multilingual-friendly FTS: the union of the 'simple', 'spanish' and 'english'
// configurations, for both the indexed text and the query (as in the source).
const TSVECTOR = `to_tsvector('pg_catalog.simple',$3)||to_tsvector('pg_catalog.spanish',$3)||to_tsvector('pg_catalog.english',$3)`
const TSQUERY = `websearch_to_tsquery('pg_catalog.simple',$1)||websearch_to_tsquery('pg_catalog.spanish',$1)||websearch_to_tsquery('pg_catalog.english',$1)`

export class SearchIndex {
  private constructor(private readonly db: PGlite) {}

  static async create(): Promise<SearchIndex> {
    const db = new PGlite({ extensions: { vector } })
    await db.exec(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE chunks(
        id text PRIMARY KEY,
        evidence_id text NOT NULL,
        text text NOT NULL,
        eligible boolean NOT NULL,
        search_vector tsvector NOT NULL,
        embedding vector(${DIMENSIONS}) NOT NULL
      );
      CREATE INDEX chunks_fts ON chunks USING gin(search_vector);`)
    // Exact (sequential) cosine search: the corpora are small, so no ANN index
    // approximation is introduced into the measurement.
    return new SearchIndex(db)
  }

  async insert(rows: readonly ChunkRow[]): Promise<void> {
    for (const row of rows) {
      if (row.embedding.length !== DIMENSIONS) throw new Error("Wrong embedding dimension")
      await this.db.query(
        `INSERT INTO chunks(id,evidence_id,text,eligible,search_vector,embedding)
         VALUES($1,$2,$3,$4,${TSVECTOR},$5::vector)`,
        [row.id, row.evidenceId, row.text, row.eligible, JSON.stringify(row.embedding)]
      )
    }
  }

  /** Top-40 by cosine distance over eligible chunks; ties by id. */
  async semantic(queryEmbedding: readonly number[]): Promise<string[]> {
    const r = await this.db.query<{ id: string }>(
      `SELECT id FROM chunks WHERE eligible
       ORDER BY embedding <=> $1::vector, id LIMIT ${SEMANTIC_LIMIT}`,
      [JSON.stringify(queryEmbedding)]
    )
    return r.rows.map((row) => row.id)
  }

  /** Top-40 by ts_rank_cd over eligible chunks matching the websearch query; ties by id. */
  async lexical(query: string): Promise<string[]> {
    const r = await this.db.query<{ id: string }>(
      `SELECT id FROM chunks, LATERAL (SELECT ${TSQUERY} AS q) query
       WHERE eligible AND search_vector @@ q
       ORDER BY ts_rank_cd(search_vector, q) DESC, id LIMIT ${LEXICAL_LIMIT}`,
      [query]
    )
    return r.rows.map((row) => row.id)
  }

  async close(): Promise<void> {
    await this.db.close()
  }
}
