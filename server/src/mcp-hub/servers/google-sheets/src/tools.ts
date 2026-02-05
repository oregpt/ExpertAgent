/**
 * Google Sheets Tool Definitions
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
    name: 'get_spreadsheet',
    description: 'Get spreadsheet metadata including sheet names, properties, and basic info.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID (from the URL)' },
      },
      required: ['spreadsheetId'],
    },
  },
  {
    name: 'read_range',
    description: 'Read values from a range of cells. Returns a 2D array of values.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: { type: 'string', description: 'A1 notation range, e.g. "Sheet1!A1:D10" or "Sheet1"' },
        valueRenderOption: { type: 'string', description: 'How to render values', enum: ['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'], default: 'FORMATTED_VALUE' },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'write_range',
    description: 'Write values to a range of cells. Provide values as a 2D array (rows of columns).',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: { type: 'string', description: 'A1 notation range, e.g. "Sheet1!A1:D3"' },
        values: { type: 'string', description: 'JSON string of 2D array, e.g. [["Name","Age"],["Alice","30"]]' },
        valueInputOption: { type: 'string', description: 'How to interpret input', enum: ['RAW', 'USER_ENTERED'], default: 'USER_ENTERED' },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'append_rows',
    description: 'Append rows after the last row with data in the sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: { type: 'string', description: 'Sheet name or range to append to, e.g. "Sheet1"' },
        values: { type: 'string', description: 'JSON string of 2D array of rows to append' },
        valueInputOption: { type: 'string', description: 'How to interpret input', enum: ['RAW', 'USER_ENTERED'], default: 'USER_ENTERED' },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'create_spreadsheet',
    description: 'Create a new blank spreadsheet with a given title.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the new spreadsheet' },
        sheetTitles: { type: 'string', description: 'Comma-separated sheet names (default: "Sheet1")' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_sheets',
    description: 'List all sheets (tabs) in a spreadsheet with their properties.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
      },
      required: ['spreadsheetId'],
    },
  },
  {
    name: 'clear_range',
    description: 'Clear all values in a range (keeps formatting).',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: { type: 'string', description: 'A1 notation range to clear, e.g. "Sheet1!A1:D10"' },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
];
