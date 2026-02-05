/**
 * Notion MCP Tool Definitions
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
    name: 'search',
    description: 'Search pages and databases in Notion',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        filter_type: { type: 'string', description: 'Filter by object type', enum: ['page', 'database'] },
        page_size: { type: 'number', description: 'Results per page (max 100)' },
        sort_direction: { type: 'string', description: 'Sort by last edited', enum: ['ascending', 'descending'] },
      },
    },
  },
  {
    name: 'get_page',
    description: 'Get a Notion page by ID (properties and metadata)',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Page ID (UUID)' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'get_database',
    description: 'Get a Notion database schema and properties',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'Database ID (UUID)' },
      },
      required: ['database_id'],
    },
  },
  {
    name: 'query_database',
    description: 'Query a Notion database with filters and sorts',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'Database ID (UUID)' },
        filter: { type: 'string', description: 'JSON filter object per Notion API spec' },
        sorts: { type: 'string', description: 'JSON sorts array per Notion API spec' },
        page_size: { type: 'number', description: 'Results per page (max 100)' },
        start_cursor: { type: 'string', description: 'Pagination cursor' },
      },
      required: ['database_id'],
    },
  },
  {
    name: 'create_page',
    description: 'Create a new page in a Notion database',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'Parent database ID' },
        properties: { type: 'string', description: 'JSON properties object per Notion API spec' },
        content: { type: 'string', description: 'JSON array of block objects for page content' },
      },
      required: ['database_id', 'properties'],
    },
  },
  {
    name: 'update_page',
    description: 'Update properties of an existing Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Page ID to update' },
        properties: { type: 'string', description: 'JSON properties to update' },
        archived: { type: 'boolean', description: 'Set to true to archive/delete' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'get_block_children',
    description: 'Get content blocks of a Notion page or block',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string', description: 'Block/page ID' },
        page_size: { type: 'number', description: 'Results per page (max 100)' },
        start_cursor: { type: 'string', description: 'Pagination cursor' },
      },
      required: ['block_id'],
    },
  },
  {
    name: 'append_blocks',
    description: 'Append content blocks to a Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string', description: 'Parent block/page ID' },
        children: { type: 'string', description: 'JSON array of block objects to append' },
      },
      required: ['block_id', 'children'],
    },
  },
];
