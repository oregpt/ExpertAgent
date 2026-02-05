/**
 * Google Calendar MCP Tool Definitions
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
    name: 'list_calendars',
    description: 'List all calendars accessible to the user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_events',
    description: 'List events from a calendar within a time range',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        time_min: { type: 'string', description: 'Start time (RFC3339, e.g. 2025-01-01T00:00:00Z)' },
        time_max: { type: 'string', description: 'End time (RFC3339)' },
        max_results: { type: 'number', description: 'Max events to return (default 50)' },
        order_by: { type: 'string', description: 'Order by', enum: ['startTime', 'updated'] },
      },
    },
  },
  {
    name: 'get_event',
    description: 'Get a single calendar event by ID',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        event_id: { type: 'string', description: 'Event ID' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a new calendar event',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        summary: { type: 'string', description: 'Event title' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Event location' },
        start: { type: 'string', description: 'Start time (RFC3339 or YYYY-MM-DD for all-day)' },
        end: { type: 'string', description: 'End time (RFC3339 or YYYY-MM-DD for all-day)' },
        attendees: { type: 'string', description: 'Comma-separated email addresses' },
        timezone: { type: 'string', description: 'Timezone (e.g. America/New_York)' },
      },
      required: ['summary', 'start', 'end'],
    },
  },
  {
    name: 'update_event',
    description: 'Update an existing calendar event',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        event_id: { type: 'string', description: 'Event ID to update' },
        summary: { type: 'string', description: 'New event title' },
        description: { type: 'string', description: 'New description' },
        location: { type: 'string', description: 'New location' },
        start: { type: 'string', description: 'New start time (RFC3339)' },
        end: { type: 'string', description: 'New end time (RFC3339)' },
        attendees: { type: 'string', description: 'Comma-separated emails' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        event_id: { type: 'string', description: 'Event ID to delete' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'search_events',
    description: 'Search events by text query across a calendar',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
        query: { type: 'string', description: 'Search query text' },
        time_min: { type: 'string', description: 'Start time filter (RFC3339)' },
        time_max: { type: 'string', description: 'End time filter (RFC3339)' },
        max_results: { type: 'number', description: 'Max results (default 25)' },
      },
      required: ['query'],
    },
  },
];
