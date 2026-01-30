/**
 * Document Service
 *
 * CRUD operations for agent documents (soul.md, memory.md, context.md, etc.)
 * plus semantic search across agent memory using pgvector.
 */

import { db } from '../db/client';
import { agentDocuments } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { embedDocument, removeDocumentEmbeddings } from './memoryEmbedder';
import { generateEmbedding } from '../rag/ragService';
import { DEFAULT_DOCUMENTS } from './defaults';

// ============================================================================
// Types
// ============================================================================

export interface AgentDocument {
  id: number;
  agentId: string;
  docType: string;
  docKey: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchResult {
  chunkText: string;
  docKey: string;
  docType: string;
  similarity: number;
  lineStart: number | null;
  lineEnd: number | null;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get a single document by agent + doc_key
 */
export async function getDocument(agentId: string, docKey: string): Promise<AgentDocument | null> {
  const rows = await db
    .select()
    .from(agentDocuments)
    .where(
      and(
        eq(agentDocuments.agentId, agentId),
        eq(agentDocuments.docKey, docKey)
      )
    )
    .limit(1);

  return (rows[0] as AgentDocument | undefined) || null;
}

/**
 * Create or update a document.
 * On upsert, also triggers background re-embedding.
 */
export async function upsertDocument(
  agentId: string,
  docType: string,
  docKey: string,
  content: string
): Promise<AgentDocument> {
  const existing = await getDocument(agentId, docKey);

  let doc: AgentDocument;

  if (existing) {
    // Update existing document
    const rows = await db
      .update(agentDocuments)
      .set({ content, docType, updatedAt: new Date() })
      .where(
        and(
          eq(agentDocuments.agentId, agentId),
          eq(agentDocuments.docKey, docKey)
        )
      )
      .returning();
    doc = rows[0] as unknown as AgentDocument;
  } else {
    // Insert new document
    const rows = await db
      .insert(agentDocuments)
      .values({ agentId, docType, docKey, content })
      .returning();
    doc = rows[0] as unknown as AgentDocument;
  }

  // Trigger background re-embedding (don't await — fire and forget)
  embedDocument(agentId, doc.id, content).catch((err) => {
    console.warn(`[document-service] Background embedding failed for ${docKey}:`, err);
  });

  return doc;
}

/**
 * List documents for an agent, optionally filtered by docType
 */
export async function listDocuments(
  agentId: string,
  docType?: string
): Promise<AgentDocument[]> {
  const conditions = [eq(agentDocuments.agentId, agentId)];
  if (docType) {
    conditions.push(eq(agentDocuments.docType, docType));
  }

  const rows = await db
    .select()
    .from(agentDocuments)
    .where(and(...conditions))
    .orderBy(agentDocuments.docKey);

  return rows as unknown as AgentDocument[];
}

/**
 * Delete a document and its embeddings
 */
export async function deleteDocument(agentId: string, docKey: string): Promise<boolean> {
  const existing = await getDocument(agentId, docKey);
  if (!existing) return false;

  // Remove embeddings first (FK constraint)
  await removeDocumentEmbeddings(agentId, existing.id);

  // Delete the document
  await db
    .delete(agentDocuments)
    .where(
      and(
        eq(agentDocuments.agentId, agentId),
        eq(agentDocuments.docKey, docKey)
      )
    );

  return true;
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Semantic search across all agent documents using pgvector.
 * Returns the most relevant chunks with metadata.
 */
export async function searchMemory(
  agentId: string,
  query: string,
  topK = 5
): Promise<MemorySearchResult[]> {
  const queryEmbedding = await generateEmbedding(query, agentId);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const rows = await db.execute(sql`
    SELECT
      e.chunk_text,
      e.line_start,
      e.line_end,
      d.doc_key,
      d.doc_type,
      1 - (e.embedding <=> ${embeddingStr}::vector) AS similarity
    FROM ai_agent_memory_embeddings e
    JOIN ai_agent_documents d ON e.doc_id = d.id
    WHERE e.agent_id = ${agentId}
      AND e.embedding IS NOT NULL
    ORDER BY e.embedding <=> ${embeddingStr}::vector ASC
    LIMIT ${topK}
  `);

  return (rows.rows as any[]).map((r) => ({
    chunkText: r.chunk_text,
    docKey: r.doc_key,
    docType: r.doc_type,
    similarity: parseFloat(r.similarity),
    lineStart: r.line_start,
    lineEnd: r.line_end,
  }));
}

// ============================================================================
// Initialization Helpers
// ============================================================================

/**
 * Create default documents for an agent (soul.md, memory.md, context.md).
 * Only creates documents that don't already exist — safe to call multiple times.
 */
export async function createDefaultDocuments(agentId: string, agentName: string): Promise<void> {
  for (const def of DEFAULT_DOCUMENTS) {
    const existing = await getDocument(agentId, def.docKey);
    if (!existing) {
      await upsertDocument(agentId, def.docType, def.docKey, def.getContent(agentName));
      console.log(`[document-service] Created default ${def.docKey} for agent ${agentId}`);
    }
  }
}
