/**
 * Gmail Tool Definitions
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[]; default?: any }>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_emails',
    description: 'Search emails using Gmail search syntax. Returns message IDs and snippets. Use queries like "from:john subject:invoice" or "is:unread after:2025/01/01".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (same syntax as Gmail search bar)' },
        maxResults: { type: 'number', description: 'Max results to return (default 10, max 50)' },
        labelIds: { type: 'string', description: 'Comma-separated label IDs to filter by (e.g. "INBOX,UNREAD")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_email',
    description: 'Get the full content of a specific email by ID. Returns subject, from, to, date, and body text.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The email message ID' },
        format: { type: 'string', description: 'Response format', enum: ['full', 'metadata', 'minimal'], default: 'full' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'get_thread',
    description: 'Get all messages in an email thread. Useful for reading a full conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'The thread ID' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'send_email',
    description: 'Send a new email. Supports plain text and HTML body.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body (plain text)' },
        cc: { type: 'string', description: 'CC recipients, comma-separated' },
        bcc: { type: 'string', description: 'BCC recipients, comma-separated' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an existing email. Maintains the thread.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The message ID to reply to' },
        body: { type: 'string', description: 'Reply body (plain text)' },
        replyAll: { type: 'string', description: 'Reply to all recipients (true/false)', enum: ['true', 'false'], default: 'false' },
      },
      required: ['messageId', 'body'],
    },
  },
  {
    name: 'list_labels',
    description: 'List all Gmail labels (folders/categories) with message counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'modify_labels',
    description: 'Add or remove labels from a message (e.g., mark as read, archive, move to folder).',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The message ID' },
        addLabelIds: { type: 'string', description: 'Comma-separated label IDs to add (e.g. "STARRED,IMPORTANT")' },
        removeLabelIds: { type: 'string', description: 'Comma-separated label IDs to remove (e.g. "UNREAD,INBOX")' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'get_profile',
    description: 'Get the authenticated user\'s Gmail profile (email address, total messages, threads count).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'trash_email',
    description: 'Move an email to trash.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The message ID to trash' },
      },
      required: ['messageId'],
    },
  },
];
