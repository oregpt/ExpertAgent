/**
 * Memory Embedder
 *
 * Auto-chunks agent documents and generates OpenAI embeddings.
 * Supports incremental re-embedding — only changed chunks are updated.
 *
 * Uses SHA-256 content hashing for efficient change detection.
 * This prevents redundant embedding API calls when documents are
 * appended to (e.g., daily logs that grow with every conversation).
 */

import crypto from 'crypto';
import { db } from '../db/client';
import { agentMemoryEmbeddings } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { generateEmbedding } from '../rag/ragService';

/**
 * Generate a SHA-256 hash of chunk content for change detection.
 * Used to skip re-embedding unchanged chunks.
 */
function hashChunk(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

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
 * Re-embed a document incrementally using content hashing.
 *
 * Strategy:
 * 1. Chunk the new content
 * 2. Hash each chunk (SHA-256)
 * 3. Compare hashes against existing embeddings for this document
 * 4. Only embed NEW or CHANGED chunks (hash mismatch)
 * 5. Delete embeddings for chunks that no longer exist
 *
 * This means appending to a daily log only embeds the new chunk,
 * not the entire document — saving API calls and avoiding rate limits.
 */
export async function embedDocument(
  agentId: string,
  docId: number,
  content: string
): Promise<{ chunksCreated: number; chunksDeleted: number; chunksSkipped: number }> {
  const newChunks = chunkDocument(content);

  // Hash each new chunk
  const newChunkHashes = newChunks.map((c) => ({
    ...c,
    hash: hashChunk(c.text),
  }));

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

  // Build a map of existing hashes → row IDs for efficient lookup
  // Use content_hash if available, fall back to hashing chunk text on-the-fly
  const existingHashMap = new Map<string, number>(); // hash → row id
  const existingIds = new Set<number>();

  for (const row of existing) {
    const r = row as any;
    const hash = r.contentHash || hashChunk(r.chunkText as string);
    existingHashMap.set(hash, r.id);
    existingIds.add(r.id);
  }

  // Determine which chunks are new/changed vs unchanged
  const newHashSet = new Set(newChunkHashes.map((c) => c.hash));
  const toInsert: typeof newChunkHashes = [];
  let chunksSkipped = 0;

  for (const chunk of newChunkHashes) {
    if (existingHashMap.has(chunk.hash)) {
      // This chunk already exists with the same content — skip re-embedding
      chunksSkipped++;
      existingIds.delete(existingHashMap.get(chunk.hash)!); // Mark as still needed
    } else {
      toInsert.push(chunk);
    }
  }

  // Delete chunks whose hashes are no longer in the new document
  // (existingIds now only contains IDs that weren't matched by any new chunk)
  const toDeleteIds = Array.from(existingIds);
  for (const id of toDeleteIds) {
    await db
      .delete(agentMemoryEmbeddings)
      .where(eq(agentMemoryEmbeddings.id, id));
  }

  // Insert new/changed chunks with embeddings
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
        contentHash: chunk.hash,
      } as any);
    } catch (err) {
      console.warn(`[memory-embedder] Failed to embed chunk for doc ${docId}:`, err);
      // Continue with other chunks — don't fail the whole operation
    }
  }

  if (chunksSkipped > 0) {
    console.log(`[memory-embedder] doc ${docId}: ${toInsert.length} new, ${chunksSkipped} unchanged, ${toDeleteIds.length} removed`);
  }

  return {
    chunksCreated: toInsert.length,
    chunksDeleted: toDeleteIds.length,
    chunksSkipped,
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
