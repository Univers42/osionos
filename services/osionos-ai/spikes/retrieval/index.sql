-- Index build, run AFTER loading (timed separately in RESULTS.md).
--
-- Partitioned parents are used for the btree pk only (already in schema.sql);
-- HNSW and GIN must be created per leaf partition in PG16 (no partitioned HNSW).

-- HNSW on the vector leg (m=16, ef_construction=64), cosine.
CREATE INDEX ai_chunks_p00_hnsw ON ai_chunks_p00 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p01_hnsw ON ai_chunks_p01 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p02_hnsw ON ai_chunks_p02 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p03_hnsw ON ai_chunks_p03 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p04_hnsw ON ai_chunks_p04 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p05_hnsw ON ai_chunks_p05 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p06_hnsw ON ai_chunks_p06 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p07_hnsw ON ai_chunks_p07 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p08_hnsw ON ai_chunks_p08 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p09_hnsw ON ai_chunks_p09 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p10_hnsw ON ai_chunks_p10 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p11_hnsw ON ai_chunks_p11 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p12_hnsw ON ai_chunks_p12 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p13_hnsw ON ai_chunks_p13 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p14_hnsw ON ai_chunks_p14 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ai_chunks_p15_hnsw ON ai_chunks_p15 USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);

-- GIN on the lexical leg.
CREATE INDEX ai_chunks_p00_gin ON ai_chunks_p00 USING gin (tsv);
CREATE INDEX ai_chunks_p01_gin ON ai_chunks_p01 USING gin (tsv);
CREATE INDEX ai_chunks_p02_gin ON ai_chunks_p02 USING gin (tsv);
CREATE INDEX ai_chunks_p03_gin ON ai_chunks_p03 USING gin (tsv);
CREATE INDEX ai_chunks_p04_gin ON ai_chunks_p04 USING gin (tsv);
CREATE INDEX ai_chunks_p05_gin ON ai_chunks_p05 USING gin (tsv);
CREATE INDEX ai_chunks_p06_gin ON ai_chunks_p06 USING gin (tsv);
CREATE INDEX ai_chunks_p07_gin ON ai_chunks_p07 USING gin (tsv);
CREATE INDEX ai_chunks_p08_gin ON ai_chunks_p08 USING gin (tsv);
CREATE INDEX ai_chunks_p09_gin ON ai_chunks_p09 USING gin (tsv);
CREATE INDEX ai_chunks_p10_gin ON ai_chunks_p10 USING gin (tsv);
CREATE INDEX ai_chunks_p11_gin ON ai_chunks_p11 USING gin (tsv);
CREATE INDEX ai_chunks_p12_gin ON ai_chunks_p12 USING gin (tsv);
CREATE INDEX ai_chunks_p13_gin ON ai_chunks_p13 USING gin (tsv);
CREATE INDEX ai_chunks_p14_gin ON ai_chunks_p14 USING gin (tsv);
CREATE INDEX ai_chunks_p15_gin ON ai_chunks_p15 USING gin (tsv);

-- btree (workspace_id, page_id): the "chunks of a page" access path.
CREATE INDEX ai_chunks_p00_wspg ON ai_chunks_p00 (workspace_id, page_id);
CREATE INDEX ai_chunks_p01_wspg ON ai_chunks_p01 (workspace_id, page_id);
CREATE INDEX ai_chunks_p02_wspg ON ai_chunks_p02 (workspace_id, page_id);
CREATE INDEX ai_chunks_p03_wspg ON ai_chunks_p03 (workspace_id, page_id);
CREATE INDEX ai_chunks_p04_wspg ON ai_chunks_p04 (workspace_id, page_id);
CREATE INDEX ai_chunks_p05_wspg ON ai_chunks_p05 (workspace_id, page_id);
CREATE INDEX ai_chunks_p06_wspg ON ai_chunks_p06 (workspace_id, page_id);
CREATE INDEX ai_chunks_p07_wspg ON ai_chunks_p07 (workspace_id, page_id);
CREATE INDEX ai_chunks_p08_wspg ON ai_chunks_p08 (workspace_id, page_id);
CREATE INDEX ai_chunks_p09_wspg ON ai_chunks_p09 (workspace_id, page_id);
CREATE INDEX ai_chunks_p10_wspg ON ai_chunks_p10 (workspace_id, page_id);
CREATE INDEX ai_chunks_p11_wspg ON ai_chunks_p11 (workspace_id, page_id);
CREATE INDEX ai_chunks_p12_wspg ON ai_chunks_p12 (workspace_id, page_id);
CREATE INDEX ai_chunks_p13_wspg ON ai_chunks_p13 (workspace_id, page_id);
CREATE INDEX ai_chunks_p14_wspg ON ai_chunks_p14 (workspace_id, page_id);
CREATE INDEX ai_chunks_p15_wspg ON ai_chunks_p15 (workspace_id, page_id);

ANALYZE ai_chunks;
ANALYZE members;
