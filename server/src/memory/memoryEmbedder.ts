/**
 * Memory Embedder
 *
 * Auto-chunks agent documents and generates OpenAI embeddings.
 * Supports incremental re-embedding — only changed chunks are updated.
 */

import { db } from '../db/client';
import { agentMemoryEmbeddings } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { generateEmbedding } from '../rag/ragService';

// ============================================================================
// Chunking
// ============================================================================

export interface DocumentChunk {
  text: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Split a document into chunks by paragraph/section.
 * Each chunk gets line-range metadata for traceability.
 */
export function chunkDocument(content: string, maxChunkSize = 800): DocumentChunk[] {
  if (!content || !content.trim()) return [];

  const lines = content.split('\n');
  const chunks: DocumentChunk[] = [];
  let currentChunk = '';
  let chunkLineStart = 1;
  let currentLine = 1;

  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line);
    const isBlank = line.trim() === '';
    const wouldExceed = (currentChunk + '\n' + line).length > maxChunkSize;

    // Start a new chunk on heading boundaries or size overflow
    if ((isHeading || wouldExceed) && currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        lineStart: chunkLineStart,
        lineEnd: currentLine - 1,
      });
      currentChunk = '';
      chunkLineStart = currentLine;
    }

    currentChunk += (currentChunk ? '\n' : '') + line;
    currentLine++;
  }

  // Push last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      lineStart: chunkLineStart,
      lineEnd: currentLine - 1,
    });
  }

  return chunks;
}

// ============================================================================
// Embedding Operations
// ============================================================================

/**
 * Re-embed a document incrementally.
 *
 * Strategy:
 * 1. Chunk the new content
 * 2. Compare with existing chunks in DB
 * 3. Delete removed chunks
 * 4. Insert new/changed chunks with embeddings
 *
 * This avoids re-embedding unchanged content, saving API calls.
 */
export async function embedDocument(
  agentId: string,
  docId: number,
  content: string
): Promise<{ chunksCreated: number; chunksDeleted: number }> {
  const newChunks = chunkDocument(content);

  // Get existing chunks for this document
  const existing = await db
    .select()
    .from(agentMemoryEmbeddings)
    .where(
      and(
        eq(agentMemoryEmbeddings.agentId, agentId),
        eq(agentMemoryEmbeddings.docId, docId)
      )
    );

  // Build a set of existing chunk texts for comparison
  const existingTexts = new Set(existing.map((e) => (e as any).chunkText as string));
  const newTexts = new Set(newChunks.map((c) => c.text));

  // Delete chunks that no longer exist in the document
  const toDelete = existing.filter((e) => !newTexts.has((e as any).chunkText as string));
  for (const del of toDelete) {
    await db
      .delete(agentMemoryEmbeddings)
      .where(eq(agentMemoryEmbeddings.id, (del as any).id));
  }

  // Insert chunks that are new (not in existing set)
  const toInsert = newChunks.filter((c) => !existingTexts.has(c.text));

  for (const chunk of toInsert) {
    try {
      const embedding = await generateEmbedding(chunk.text, agentId);
      await db.insert(agentMemoryEmbeddings).values({
        agentId,
        docId,
        chunkText: chunk.text,
        embedding,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
      } as any);
    } catch (err) {
      console.warn(`[memory-embedder] Failed to embed chunk for doc ${docId}:`, err);
      // Continue with other chunks — don't fail the whole operation
    }
  }

  return {
    chunksCreated: toInsert.length,
    chunksDeleted: toDelete.length,
  };
}

/**
 * Remove all embeddings for a document (used on document deletion)
 */
export async function removeDocumentEmbeddings(agentId: string, docId: number): Promise<void> {
  await db
    .delete(agentMemoryEmbeddings)
    .where(
      and(
        eq(agentMemoryEmbeddings.agentId, agentId),
        eq(agentMemoryEmbeddings.docId, docId)
      )
    );
}
