/**
 * Memory Tools
 *
 * Tools that the LLM can call to read/write/search its own memory.
 * These are registered alongside MCP tools in the tool executor.
 *
 * Tools:
 *   memory_read(doc_key)         — read a document
 *   memory_write(doc_key, content) — overwrite a document
 *   memory_search(query)          — semantic search across memory
 *   memory_append(doc_key, text)  — append text to a document (e.g., daily log)
 */

import { Tool, ToolCall } from '../llm/types';
import { getDocument, upsertDocument, searchMemory } from './documentService';

// ============================================================================
// Tool Definitions (LLM schema)
// ============================================================================

export const MEMORY_TOOL_PREFIX = 'memory';

export const MEMORY_TOOLS: Tool[] = [
  {
    name: 'memory__read',
    description: '[memory] Read a document from agent memory (e.g., soul.md, memory.md, context.md, daily/2026-01-30.md)',
    inputSchema: {
      type: 'object',
      properties: {
        doc_key: {
          type: 'string',
          description: 'Document key (e.g., soul.md, memory.md)',
        },
      },
      required: ['doc_key'],
    },
  },
  {
    name: 'memory__write',
    description: '[memory] Write/overwrite a document in agent memory. Use for updating soul, memory, context, or creating new documents.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_key: {
          type: 'string',
          description: 'Document key (e.g., memory.md)',
        },
        content: {
          type: 'string',
          description: 'Full document content to write',
        },
      },
      required: ['doc_key', 'content'],
    },
  },
  {
    name: 'memory__search',
    description: '[memory] Semantic search across all agent memory documents. Returns most relevant chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text',
        },
        top_k: {
          type: 'number',
          description: 'Max results to return (default 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory__append',
    description: '[memory] Append text to a document (useful for daily logs, memory entries). Creates the document if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_key: {
          type: 'string',
          description: 'Document key (e.g., daily/2026-01-30.md)',
        },
        text: {
          type: 'string',
          description: 'Text to append to the document',
        },
      },
      required: ['doc_key', 'text'],
    },
  },
];

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Check if a tool name is a memory tool
 */
export function isMemoryTool(toolName: string): boolean {
  return toolName.startsWith('memory__');
}

/**
 * Infer doc_type from doc_key
 */
function inferDocType(docKey: string): string {
  if (docKey === 'soul.md') return 'soul';
  if (docKey === 'memory.md') return 'memory';
  if (docKey === 'context.md') return 'context';
  if (docKey.startsWith('daily/')) return 'daily';
  return 'custom';
}

/**
 * Execute a memory tool call and return the result string
 */
export async function executeMemoryTool(
  agentId: string,
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  // Strip prefix: "memory__read" → "read"
  const action = toolCall.name.replace('memory__', '');
  const input = toolCall.input;

  try {
    switch (action) {
      case 'read': {
        const docKey = input.doc_key as string;
        if (!docKey) return { success: false, output: 'Missing doc_key parameter' };

        const doc = await getDocument(agentId, docKey);
        if (!doc) {
          return { success: false, output: `Document '${docKey}' not found` };
        }
        return { success: true, output: doc.content };
      }

      case 'write': {
        const docKey = input.doc_key as string;
        const content = input.content as string;
        if (!docKey) return { success: false, output: 'Missing doc_key parameter' };
        if (content === undefined) return { success: false, output: 'Missing content parameter' };

        const docType = inferDocType(docKey);
        await upsertDocument(agentId, docType, docKey, content);
        return { success: true, output: `Document '${docKey}' updated successfully (${content.length} chars)` };
      }

      case 'search': {
        const query = input.query as string;
        if (!query) return { success: false, output: 'Missing query parameter' };

        const topK = (input.top_k as number) || 5;
        const results = await searchMemory(agentId, query, topK);

        if (results.length === 0) {
          return { success: true, output: 'No relevant results found in memory.' };
        }

        const formatted = results
          .map((r, i) => `[${i + 1}] (${r.docKey}, similarity: ${r.similarity.toFixed(3)})\n${r.chunkText}`)
          .join('\n\n');
        return { success: true, output: formatted };
      }

      case 'append': {
        const docKey = input.doc_key as string;
        const text = input.text as string;
        if (!docKey) return { success: false, output: 'Missing doc_key parameter' };
        if (!text) return { success: false, output: 'Missing text parameter' };

        const docType = inferDocType(docKey);
        const existing = await getDocument(agentId, docKey);
        const newContent = existing ? existing.content + '\n' + text : text;
        await upsertDocument(agentId, docType, docKey, newContent);
        return { success: true, output: `Appended ${text.length} chars to '${docKey}'` };
      }

      default:
        return { success: false, output: `Unknown memory action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Memory tool error: ${msg}` };
  }
}
