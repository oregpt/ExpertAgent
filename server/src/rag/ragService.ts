import OpenAI from 'openai';
import { db } from '../db/client';
import { documentChunks, documents } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAgentApiKeyWithFallback } from '../capabilities/capabilityService';

// Fallback API key from environment
const envApiKey = process.env.OPENAI_API_KEY;

// Track if pgvector is available (checked on first use)
let pgvectorAvailable: boolean | null = null;

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
  // Skip indexing if pgvector is known to be unavailable
  if (pgvectorAvailable === false) {
    console.warn('[rag] Skipping document indexing - pgvector not available');
    return;
  }

  const chunks = splitTextIntoChunks(content);

  const values = await Promise.all(
    chunks.map(async (chunk, index) => {
      const embedding = await generateEmbedding(chunk, agentId);
      return {
        documentId,
        agentId,
        chunkIndex: index,
        content: chunk,
        embedding, // Store as number[] - Drizzle custom type handles conversion to pgvector
        tokenCount: Math.ceil(chunk.length / 4),
      };
    })
  );

  if (values.length) {
    try {
      await db.insert(documentChunks).values(values as any);
    } catch (err: any) {
      if (err.message?.includes('vector') || err.code === '42704') {
        console.warn('[rag] pgvector not available - skipping document indexing');
        pgvectorAvailable = false;
      } else {
        throw err;
      }
    }
  }
}

export async function search(
  agentId: string,
  query: string,
  limit = 5,
  maxTokens = 3000
): Promise<SimilarChunk[]> {
  // Skip search if pgvector is known to be unavailable
  if (pgvectorAvailable === false) {
    return [];
  }

  try {
    const queryEmbedding = await generateEmbedding(query, agentId);

    // Format embedding for pgvector query
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Use pgvector cosine distance operator (<=>)
    // Lower distance = more similar, so we ORDER BY distance ASC
    // We fetch extra rows to account for token limiting
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

    // Mark pgvector as available if we got here
    pgvectorAvailable = true;

    const results: SimilarChunk[] = [];
    let tokens = 0;

    for (const row of rows.rows as any[]) {
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
  } catch (err: any) {
    // Check if this is a pgvector-related error
    if (err.message?.includes('vector') || err.message?.includes('does not exist') || err.code === '42704') {
      console.warn('[rag] pgvector not available - RAG search disabled');
      pgvectorAvailable = false;
      return [];
    }
    // Re-throw other errors
    throw err;
  }
}

export async function getRelevantContext(
  agentId: string,
  query: string,
  maxTokens = 2000
): Promise<{ context: string; sources: SimilarChunk[] }> {
  // Skip if pgvector is known to be unavailable
  if (pgvectorAvailable === false) {
    return { context: '', sources: [] };
  }

  try {
    const chunks = await search(agentId, query, 10, maxTokens);

    let context = '';
    for (const c of chunks) {
      context += `\n\n--- From ${c.sourceTitle} ---\n${c.content}`;
    }

    return { context, sources: chunks };
  } catch (err: any) {
    // Gracefully handle pgvector errors
    if (err.message?.includes('vector') || err.code === '42704') {
      console.warn('[rag] pgvector not available - returning empty context');
      pgvectorAvailable = false;
      return { context: '', sources: [] };
    }
    throw err;
  }
}
