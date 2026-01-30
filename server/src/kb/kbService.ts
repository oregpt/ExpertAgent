import { db } from '../db/client';
import { documents } from '../db/schema';
import { indexDocument } from '../rag/ragService';
import { eq } from 'drizzle-orm';

export async function ingestTextDocument(
  agentId: string,
  title: string,
  text: string,
  metadata?: Record<string, unknown>
) {
  const inserted = (await db
    .insert(documents)
    .values({
      agentId,
      title,
      sourceType: 'text',
      mimeType: 'text/plain',
      size: text.length,
      metadata: metadata || {},
    })
    .returning()) as any[];

  const doc = inserted[0];
  await indexDocument(agentId, doc.id as number, text);

  return doc;
}

export async function listDocuments(agentId: string) {
  const rows = await db.select().from(documents).where(eq(documents.agentId, agentId));
  return rows as any[];
}

export async function deleteDocument(documentId: number) {
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function ingestFileDocument(
  agentId: string,
  title: string,
  mimeType: string,
  size: number,
  content: string,
  options?: {
    metadata?: Record<string, unknown>;
    folderId?: number | null;
    category?: 'knowledge' | 'code' | 'data';
  }
) {
  const inserted = (await db
    .insert(documents)
    .values({
      agentId,
      title,
      sourceType: 'file',
      mimeType,
      size,
      metadata: options?.metadata || {},
      folderId: options?.folderId || null,
      category: options?.category || 'knowledge',
    })
    .returning()) as any[];

  const doc = inserted[0];
  await indexDocument(agentId, doc.id as number, content);
  return doc;
}
