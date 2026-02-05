/**
 * Slack MCP Tool Definitions
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'list_channels',
    description: 'List public and private channels in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        types: { type: 'string', description: 'Channel types (default: public_channel,private_channel)' },
        limit: { type: 'number', description: 'Max channels (default 100)' },
        exclude_archived: { type: 'boolean', description: 'Exclude archived (default true)' },
      },
    },
  },
  {
    name: 'get_channel_history',
    description: 'Get recent messages from a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        limit: { type: 'number', description: 'Max messages (default 20)' },
        oldest: { type: 'string', description: 'Unix timestamp: oldest message' },
        latest: { type: 'string', description: 'Unix timestamp: newest message' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'post_message',
    description: 'Post a message to a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID or name' },
        text: { type: 'string', description: 'Message text' },
        blocks: { type: 'string', description: 'JSON Block Kit blocks' },
        unfurl_links: { type: 'boolean', description: 'Unfurl URLs (default true)' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'reply_to_thread',
    description: 'Reply to a message thread in Slack',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        thread_ts: { type: 'string', description: 'Thread timestamp (ts of parent message)' },
        text: { type: 'string', description: 'Reply text' },
      },
      required: ['channel', 'thread_ts', 'text'],
    },
  },
  {
    name: 'get_user_info',
    description: 'Get details about a Slack user',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'User ID' },
      },
      required: ['user'],
    },
  },
  {
    name: 'list_users',
    description: 'List all users in the Slack workspace',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max users (default 100)' },
      },
    },
  },
  {
    name: 'search_messages',
    description: 'Search messages across the Slack workspace',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Results per page (default 20)' },
        sort: { type: 'string', description: 'Sort order', enum: ['score', 'timestamp'] },
      },
      required: ['query'],
    },
  },
  {
    name: 'set_channel_topic',
    description: 'Set the topic of a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        topic: { type: 'string', description: 'New topic text' },
      },
      required: ['channel', 'topic'],
    },
  },
  {
    name: 'add_reaction',
    description: 'Add an emoji reaction to a message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        timestamp: { type: 'string', description: 'Message timestamp' },
        name: { type: 'string', description: 'Emoji name (without colons)' },
      },
      required: ['channel', 'timestamp', 'name'],
    },
  },
  {
    name: 'get_permalink',
    description: 'Get a permanent link to a Slack message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        message_ts: { type: 'string', description: 'Message timestamp' },
      },
      required: ['channel', 'message_ts'],
    },
  },
];
