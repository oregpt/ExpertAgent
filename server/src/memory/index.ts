/**
 * Memory Module — barrel export
 */
export {
  getDocument,
  upsertDocument,
  listDocuments,
  deleteDocument,
  searchMemory,
  createDefaultDocuments,
} from './documentService';
export type { AgentDocument, MemorySearchResult } from './documentService';

export { embedDocument, removeDocumentEmbeddings, chunkDocument } from './memoryEmbedder';
export type { DocumentChunk } from './memoryEmbedder';

export { DEFAULT_DOCUMENTS, getDefaultSoul, getDefaultMemory, getDefaultContext } from './defaults';

export { MEMORY_TOOLS, isMemoryTool, executeMemoryTool } from './memoryTools';
