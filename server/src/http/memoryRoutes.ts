/**
 * Memory Routes
 *
 * REST API for agent document management and semantic search.
 * All routes are under /api/agents/:id/documents and /api/agents/:id/memory.
 *
 * These routes are always registered but return 403 if soulMemory feature is disabled.
 */

import { Router } from 'express';
import { getFeatures } from '../licensing/features';
import {
  getDocument,
  upsertDocument,
  listDocuments,
  deleteDocument,
  searchMemory,
} from '../memory';
import { requireAuth } from '../middleware/auth';
import { validate, documentUpdateSchema, memorySearchSchema } from '../middleware/validation';

export const memoryRouter = Router();

/**
 * Middleware: check soulMemory feature flag
 */
function requireSoulMemory(req: any, res: any, next: any): void {
  const features = getFeatures();
  if (!features.soulMemory) {
    res.status(403).json({
      error: 'Soul & Memory feature not enabled',
      code: 'SOUL_MEMORY_NOT_LICENSED',
      message: 'Enable the soulMemory feature flag or upgrade your license to use this endpoint.',
    });
    return;
  }
  next();
}

// Apply auth + feature guard to all routes
memoryRouter.use(requireAuth);
memoryRouter.use(requireSoulMemory);

// ============================================================================
// Document CRUD
// ============================================================================

/**
 * GET /api/agents/:id/documents
 * List all documents for an agent, optionally filtered by doc_type
 */
memoryRouter.get('/agents/:id/documents', async (req, res) => {
  try {
    const agentId = req.params.id;
    const docType = req.query.type as string | undefined;

    const docs = await listDocuments(agentId, docType);
    res.json({
      documents: docs.map((d) => ({
        id: d.id,
        docType: d.docType,
        docKey: d.docKey,
        contentLength: d.content.length,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[memory-routes] List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * GET /api/agents/:id/documents/:key
 * Read a specific document by key.
 * Note: The :key param uses URL encoding for keys with slashes (e.g., daily%2F2026-01-30.md)
 */
memoryRouter.get('/agents/:id/documents/:key', async (req, res) => {
  try {
    const agentId = req.params.id as string;
    const docKey = req.params.key as string;

    const doc = await getDocument(agentId, docKey);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found', docKey });
    }

    res.json({
      id: doc.id,
      docType: doc.docType,
      docKey: doc.docKey,
      content: doc.content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('[memory-routes] Get document error:', err);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * PUT /api/agents/:id/documents/:key
 * Create or update a document
 * Body: { content: string, docType?: string }
 */
memoryRouter.put('/agents/:id/documents/:key', validate(documentUpdateSchema), async (req, res) => {
  try {
    const agentId = req.params.id as string;
    const docKey = req.params.key as string;
    const { content, docType } = req.body as { content: string; docType?: string };

    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'content is required in request body' });
    }

    // Infer docType from key if not provided
    const inferredType = docType || inferDocType(docKey);
    const doc = await upsertDocument(agentId, inferredType, docKey, content);

    res.json({
      id: doc.id,
      docType: doc.docType,
      docKey: doc.docKey,
      content: doc.content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('[memory-routes] Upsert document error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/**
 * DELETE /api/agents/:id/documents/:key
 * Delete a document and its embeddings
 */
memoryRouter.delete('/agents/:id/documents/:key', async (req, res) => {
  try {
    const agentId = req.params.id as string;
    const docKey = req.params.key as string;

    const deleted = await deleteDocument(agentId, docKey);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found', docKey });
    }

    res.json({ success: true, docKey });
  } catch (err) {
    console.error('[memory-routes] Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * POST /api/agents/:id/memory/search
 * Semantic search across agent memory documents
 * Body: { query: string, topK?: number }
 */
memoryRouter.post('/agents/:id/memory/search', validate(memorySearchSchema), async (req, res) => {
  try {
    const agentId = req.params.id as string;
    const { query, topK } = req.body as { query: string; topK?: number };

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query string is required in request body' });
    }

    const results = await searchMemory(agentId, query, topK || 5);

    res.json({
      query,
      results: results.map((r) => ({
        chunkText: r.chunkText,
        docKey: r.docKey,
        docType: r.docType,
        similarity: r.similarity,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
      })),
    });
  } catch (err) {
    console.error('[memory-routes] Search memory error:', err);
    res.status(500).json({ error: 'Failed to search memory' });
  }
});

// ============================================================================
// Helpers
// ============================================================================

function inferDocType(docKey: string): string {
  if (docKey === 'soul.md') return 'soul';
  if (docKey === 'memory.md') return 'memory';
  if (docKey === 'context.md') return 'context';
  if (docKey.startsWith('daily/')) return 'daily';
  return 'custom';
}
