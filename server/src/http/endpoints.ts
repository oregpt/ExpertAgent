export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  description: string;
  group: 'health' | 'chat' | 'kb' | 'rag' | 'capabilities' | 'admin';
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  // Health
  {
    method: 'GET',
    path: '/health',
    group: 'health',
    description: 'Health check for Agent-in-a-Box server',
  },

  // Chat
  {
    method: 'POST',
    path: '/api/chat/start',
    group: 'chat',
    description: 'Start a new conversation for an agent',
  },
  {
    method: 'GET',
    path: '/api/chat/:conversationId',
    group: 'chat',
    description: 'Fetch a conversation and its messages',
  },
  {
    method: 'POST',
    path: '/api/chat/:conversationId/message',
    group: 'chat',
    description: 'Send a message and receive a non-streaming reply',
  },
  {
    method: 'POST',
    path: '/api/chat/:conversationId/stream',
    group: 'chat',
    description: 'Send a message and receive a streaming reply via SSE',
  },

  // Knowledge Base
  {
    method: 'POST',
    path: '/api/kb/text',
    group: 'kb',
    description: 'Ingest a plain text document into the knowledge base',
  },
  {
    method: 'POST',
    path: '/api/kb/files',
    group: 'kb',
    description: 'Upload and ingest a file (PDF, DOCX, TXT, etc.) into the knowledge base',
  },
  {
    method: 'GET',
    path: '/api/kb',
    group: 'kb',
    description: 'List knowledge base documents for an agent',
  },
  {
    method: 'DELETE',
    path: '/api/kb/:documentId',
    group: 'kb',
    description: 'Delete a knowledge base document by ID',
  },

  // RAG
  {
    method: 'GET',
    path: '/api/rag/search',
    group: 'rag',
    description: 'Run a semantic RAG search against indexed document chunks',
  },

  // Capabilities / tools
  {
    method: 'GET',
    path: '/api/capabilities',
    group: 'capabilities',
    description: 'List available capabilities (tools)',
  },
  {
    method: 'POST',
    path: '/api/capabilities/anyapi/execute',
    group: 'capabilities',
    description: 'Execute an AnyAPI capability action',
  },

  // Admin (to be implemented)
  {
    method: 'GET',
    path: '/api/admin/agent',
    group: 'admin',
    description: 'Fetch the default agent configuration (name, model, instructions)',
  },
  {
    method: 'POST',
    path: '/api/admin/agent',
    group: 'admin',
    description: 'Update the default agent configuration (model, instructions, etc.)',
  },
];
