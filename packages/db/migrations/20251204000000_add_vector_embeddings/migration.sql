-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to products table
-- Using 1536 dimensions for OpenAI text-embedding-3-small
-- Use 3072 for text-embedding-3-large
ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for fast approximate nearest neighbor search
-- HNSW is faster than IVFFlat for most use cases
CREATE INDEX IF NOT EXISTS products_embedding_hnsw_idx 
ON products 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (faster to build, slightly slower queries)
-- CREATE INDEX IF NOT EXISTS products_embedding_ivfflat_idx 
-- ON products 
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- Add index on embedding NULL status for efficient filtering
CREATE INDEX IF NOT EXISTS products_has_embedding_idx 
ON products ((embedding IS NOT NULL));
