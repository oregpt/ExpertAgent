import OpenAI from 'openai';
import { db } from '../db/client';
import { documentChunks, documents } from '../db/schema';
import { eq, sql, isNotNull } from 'drizzle-orm';
import { getAgentApiKeyWithFallback } from '../capabilities/capabilityService';
import { cosineSimilarity } from '../db/vector-utils';

const IS_DESKTOP = process.env.IS_DESKTOP === 'true';

// Fallback API key from environment
const envApiKey = process.env.OPENAI_API_KEY;

if (!envApiKey) {
  console.warn('[agentinabox-rag] OPENAI_API_KEY is not set. Embeddings will use per-agent keys if configured.');
}

// Create a client with the given API key
function createClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

// Get API key for agent (checks database first, falls back to env var)
async function getApiKey(agentId?: string): Promise<string> {
  if (agentId) {
    const agentKey = await getAgentApiKeyWithFallback(agentId, 'openai_api_key');
    if (agentKey) {
      return agentKey;
    }
  }
  return envApiKey || 'missing-key';
}

export interface SimilarChunk {
  content: string;
  documentId: number;
  sourceTitle: string;
  similarity: number;
}

export function splitTextIntoChunks(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const chunks: string[] = [];

  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + trimmed).length + 1 <= maxChunkSize) {
      current += (current ? '. ' : '') + trimmed;
    } else {
      if (current) chunks.push(current + '.');
      if (overlap > 0 && chunks.length > 0) {
        const last = chunks[chunks.length - 1] ?? '';
        const overlapText = last.slice(-overlap);
        current = overlapText + '. ' + trimmed;
      } else {
        current = trimmed;
      }
    }
  }

  if (current) chunks.push(current + '.');

  return chunks.filter((c) => c.trim().length > 0);
}

export async function generateEmbedding(text: string, agentId?: string): Promise<number[]> {
  const clean = text.trim();
  if (!clean) throw new Error('Cannot embed empty text');

  const apiKey = await getApiKey(agentId);
  const client = createClient(apiKey);

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: clean,
  });

  return response.data[0]?.embedding || [];
}

export async function indexDocument(agentId: string, documentId: number, content: string): Promise<void> {
  const chunks = splitTextIntoChunks(content);

  const values = await Promise.all(
    chunks.map(async (chunk, index) => {
      const embedding = await generateEmbedding(chunk, agentId);
      return {
        documentId,
        agentId,
        chunkIndex: index,
        content: chunk,
        // pg: number[] → custom type handles toDriver conversion
        // SQLite: JSON-stringify to store as TEXT
        embedding: IS_DESKTOP ? JSON.stringify(embedding) : embedding,
        tokenCount: Math.ceil(chunk.length / 4),
      };
    })
  );

  if (values.length) {
    await db.insert(documentChunks).values(values as any);
  }
}

export async function search(
  agentId: string,
  query: string,
  limit = 5,
  maxTokens = 3000
): Promise<SimilarChunk[]> {
  const queryEmbedding = await generateEmbedding(query, agentId);

  if (IS_DESKTOP) {
    return searchSQLite(agentId, queryEmbedding, limit, maxTokens);
  }

  // PostgreSQL: Use pgvector cosine distance operator (<=>)
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.token_count,
      d.title as source_title,
      1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
    FROM ai_document_chunks c
    LEFT JOIN ai_documents d ON c.document_id = d.id
    WHERE c.agent_id = ${agentId}
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${embeddingStr}::vector ASC
    LIMIT ${limit * 2}
  `);

  return applyTokenLimit(rows.rows as any[], limit, maxTokens);
}

/**
 * SQLite search: fetch all chunks with embeddings, compute JS cosine similarity
 */
async function searchSQLite(
  agentId: string,
  queryEmbedding: number[],
  limit: number,
  maxTokens: number
): Promise<SimilarChunk[]> {
  // Fetch all chunks for this agent that have embeddings
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.token_count,
      c.embedding,
      d.title as source_title
    FROM ai_document_chunks c
    LEFT JOIN ai_documents d ON c.document_id = d.id
    WHERE c.agent_id = ${agentId}
      AND c.embedding IS NOT NULL
  `);

  // Compute cosine similarity in JS
  const scored = (rows.rows as any[])
    .map((row) => {
      const docEmbedding: number[] = JSON.parse(row.embedding);
      return {
        ...row,
        similarity: cosineSimilarity(queryEmbedding, docEmbedding),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit * 2);

  return applyTokenLimit(scored, limit, maxTokens);
}

function applyTokenLimit(rows: any[], limit: number, maxTokens: number): SimilarChunk[] {
  const results: SimilarChunk[] = [];
  let tokens = 0;

  for (const row of rows) {
    const t = row.token_count || Math.ceil((row.content?.length || 0) / 4);
    if (results.length < limit && tokens + t <= maxTokens) {
      results.push({
        content: row.content,
        documentId: row.document_id,
        sourceTitle: row.source_title || 'Unknown source',
        similarity: row.similarity,
      });
      tokens += t;
    }
  }

  return results;
}

export async function getRelevantContext(
  agentId: string,
  query: string,
  maxTokens = 2000
): Promise<{ context: string; sources: SimilarChunk[] }> {
  const chunks = await search(agentId, query, 10, maxTokens);

  let context = '';
  for (const c of chunks) {
    context += `\n\n--- From ${c.sourceTitle} ---\n${c.content}`;
  }

  return { context, sources: chunks };
}
